// Built-in provider manifests. Adding a source starts here.
// Ready expressions are the exact checks the adapters used to inline, so a reload
// still waits for numbers rather than labels.

import { DAY, HOUR } from "./registry.js";

const percent = (key, label, periodMs, advertised = true) => ({
  key,
  label,
  periodMs,
  advertised,
  semantic: "percent",
  unit: "%",
});

const count = (key, label, periodMs, unit, advertised = true) => ({
  key,
  label,
  periodMs,
  advertised,
  semantic: "count",
  unit,
});

export const MANIFESTS = [
  {
    id: "volcengine",
    slug: "volcengine",
    name: "火山引擎 Coding Plan",
    shortName: "火山",
    url: "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan",
    // API when an AK/SK pair resolves (no browser session needed); otherwise the
    // already-signed-in console tab, exactly as before.
    transport: "auto",
    aliases: ["volc"],
    workspace: null,
    defaultWindow: "auto",
    auth: {
      env: ["VOLC_ACCESS_KEY", "VOLCENGINE_ACCESS_KEY"],
      secretEnv: ["VOLC_SECRET_KEY", "VOLCENGINE_SECRET_KEY"],
      file: "~/.ai-quota-dashboard/credentials.json",
      fields: ["VOLC_ACCESS_KEY", "accessKey"],
      secretFields: ["VOLC_SECRET_KEY", "secretKey"],
    },
    api: {
      method: "POST",
      signing: "volcengine",
      action: "GetCodingPlanUsage",
      version: "2024-01-01",
      service: "ark",
      region: "cn-beijing",
      url: "https://open.volcengineapi.com/",
    },
    ready: {
      expr: `(() => {
      const t = document.body.innerText || '';
      if (/立即登录使用/.test(t)) return true;
      const labelled = t.includes('套餐用量限额') || t.includes('我的订阅') || t.includes('开通管理');
      return labelled && (/\\n[0-9]+(?:\\.[0-9]+)?\\s*\\n%\\s*\\n/.test(t) || /[0-9][0-9,]*\\s*\\/\\s*[0-9][0-9,]*/.test(t));
    })()`,
    },
    parser: { kind: "module", name: "volcengine", version: "volc-v2" },
    navigate: { reuseIncludes: ["/subscription/coding-plan", "/openManagement"] },
    windows: [
      percent("h5", "5 小时", 5 * HOUR),
      percent("week", "周", 7 * DAY),
      percent("month", "月", 30 * DAY),
    ],
  },
  {
    id: "opencode_go",
    slug: "opencode-go",
    name: "OpenCode Go",
    shortName: "OC",
    url: "https://opencode.ai/console",
    transport: "cdp",
    aliases: ["opencode-go", "opencode"],
    workspace: "auto",
    defaultWindow: "h5",
    ready: {
      expr: `(() => {
      const t = document.body.innerText || '';
      if (/SIGN IN|OPEN CONSOLE|Go is a subscription/.test(t)) return true;
      return (t.includes('5-hour window') || t.includes('Rolling')) && /[0-9]+(?:\\.[0-9]+)?\\s*%\\s*used/i.test(t);
    })()`,
    },
    parser: { kind: "module", name: "opencode_go", version: "opencode-v1" },
    navigate: {
      workspaceGo: {
        pattern: "^https://opencode\\.ai/console/(wrk_[A-Za-z0-9]+)",
        skip: "/go(?:/|$|\\?)",
        url: "https://opencode.ai/console/{1}/go",
      },
    },
    windows: [
      percent("h5", "5 小时", 5 * HOUR),
      percent("week", "周", 7 * DAY),
      percent("month", "月", 30 * DAY),
    ],
  },
  {
    id: "x_premium",
    slug: "x-premium",
    name: "X Premium · Grok",
    shortName: "Grok",
    url: "https://grok.com/dashboard/usage",
    transport: "cdp",
    aliases: ["x-premium", "x"],
    workspace: null,
    defaultWindow: "week",
    ready: {
      expr: `(() => {
      const t = document.body.innerText || '';
      if (/Sign in|Log in|Continue with/.test(t)) return true;
      return (t.includes('Weekly included usage') || t.includes('Weekly SuperGrok Limit')) && /[0-9]+(?:\\.[0-9]+)?\\s*%\\s*used/i.test(t);
    })()`,
    },
    parser: { kind: "module", name: "x_premium", version: "grok-v1" },
    navigate: {
      reusePattern: "^https://grok\\.com/dashboard(/|\\?|$)",
      openWhenMissing: "Weekly included usage|Weekly SuperGrok Limit",
    },
    windows: [
      percent("h5", "5 小时", 5 * HOUR, false),
      percent("week", "周", 7 * DAY),
      percent("month", "月", 30 * DAY, false),
    ],
  },
  {
    id: "claude",
    slug: "claude",
    name: "Claude",
    shortName: "Claude",
    url: "https://claude.ai/settings/usage",
    transport: "api",
    aliases: ["claude-pro", "anthropic"],
    workspace: null,
    defaultWindow: "h5",
    auth: {
      env: ["ANTHROPIC_OAUTH_TOKEN"],
      file: "~/.claude/.credentials.json",
      fields: ["claudeAiOauth.accessToken"],
    },
    api: {
      method: "GET",
      url: "https://api.anthropic.com/api/oauth/usage",
      headers: {
        Authorization: "Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        accept: "application/json",
      },
    },
    parser: { kind: "module", name: "claude", version: "claude-v1" },
    windows: [
      percent("h5", "5 小时", 5 * HOUR),
      percent("week", "周", 7 * DAY),
      percent("sonnet", "Sonnet 周", 7 * DAY, false),
      percent("opus", "Opus 周", 7 * DAY, false),
    ],
  },
  {
    id: "zhipu",
    slug: "zhipu",
    name: "智谱 GLM Coding Plan",
    shortName: "智谱",
    url: "https://www.bigmodel.cn/coding-plan/personal/usage",
    transport: "api",
    aliases: ["glm", "bigmodel"],
    workspace: null,
    defaultWindow: "h5",
    auth: { env: ["Z_AI_API_KEY", "BIGMODEL_API_KEY"] },
    api: {
      method: "GET",
      url: "https://api.z.ai/api/monitor/usage/quota/limit",
      hostEnv: "Z_AI_API_HOST",
      path: "/api/monitor/usage/quota/limit",
      headers: { authorization: "Bearer {token}", accept: "application/json" },
    },
    parser: { kind: "module", name: "zhipu", version: "zhipu-v1" },
    windows: [count("h5", "5 小时", 5 * HOUR, "积分"), count("week", "周", 7 * DAY, "积分")],
  },
  {
    id: "deepseek",
    slug: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    url: "https://platform.deepseek.com/usage",
    transport: "api",
    aliases: ["ds"],
    workspace: null,
    defaultWindow: "balance",
    auth: { env: ["DEEPSEEK_API_KEY"] },
    api: {
      method: "GET",
      url: "https://api.deepseek.com/user/balance",
      headers: { Authorization: "Bearer {token}", accept: "application/json" },
    },
    parser: { kind: "module", name: "deepseek", version: "deepseek-v1" },
    windows: [{ key: "balance", label: "余额", periodMs: null, advertised: true, semantic: "credits", unit: "¥" }],
  },
  {
    id: "alibaba",
    slug: "alibaba",
    name: "阿里云百炼 Coding Plan",
    shortName: "百炼",
    url: "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan",
    transport: "api",
    aliases: ["bailian", "dashscope"],
    workspace: null,
    defaultWindow: "h5",
    auth: { env: ["ALIBABA_CODING_PLAN_API_KEY", "DASHSCOPE_API_KEY"] },
    api: {
      method: "POST",
      url: "https://bailian.console.aliyun.com/data/api.json?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2",
      hostEnv: "ALIBABA_CODING_PLAN_HOST",
      path: "/data/api.json?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2",
      headers: {
        Authorization: "Bearer {token}",
        "x-api-key": "{token}",
        "X-DashScope-API-Key": "{token}",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: {},
    },
    parser: { kind: "module", name: "alibaba", version: "alibaba-v1" },
    windows: [
      count("h5", "5 小时", 5 * HOUR, "次"),
      count("week", "周", 7 * DAY, "次"),
      count("month", "月", 30 * DAY, "次"),
    ],
  },
  {
    id: "codex",
    slug: "codex",
    name: "OpenAI Codex",
    shortName: "Codex",
    url: "https://chatgpt.com/codex/settings/usage",
    transport: "api",
    aliases: ["openai-codex", "chatgpt"],
    workspace: null,
    defaultWindow: "h5",
    auth: {
      env: ["CODEX_ACCESS_TOKEN"],
      file: "~/.codex/auth.json",
      fields: ["tokens.access_token", "access_token"],
      accountField: "tokens.account_id",
    },
    api: {
      method: "GET",
      url: "https://chatgpt.com/backend-api/wham/usage",
      accountHeader: "ChatGPT-Account-ID",
      headers: { Authorization: "Bearer {token}", accept: "application/json" },
    },
    parser: { kind: "module", name: "codex", version: "codex-v1" },
    windows: [percent("h5", "5 小时", 5 * HOUR), percent("week", "周", 7 * DAY)],
  },
];
