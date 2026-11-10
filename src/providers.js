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

export const MANIFESTS = [
  {
    id: "volcengine",
    slug: "volcengine",
    name: "火山引擎 Coding Plan",
    url: "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan",
    transport: "cdp",
    aliases: ["volc"],
    workspace: null,
    defaultWindow: "auto",
    ready: {
      expr: `(() => {
      const t = document.body.innerText || '';
      if (/立即登录使用/.test(t)) return true;
      const labelled = t.includes('套餐用量限额') || t.includes('我的订阅') || t.includes('开通管理');
      return labelled && (/\\n[0-9]+(?:\\.[0-9]+)?\\s*\\n%\\s*\\n/.test(t) || /[0-9][0-9,]*\\s*\\/\\s*[0-9][0-9,]*/.test(t));
    })()`,
    },
    parser: { kind: "module", name: "volcengine", version: "volc-v2" },
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
    windows: [
      percent("h5", "5 小时", 5 * HOUR, false),
      percent("week", "周", 7 * DAY),
      percent("month", "月", 30 * DAY, false),
    ],
  },
];
