/**
 * The composer strip and its popover only list sources that have something to
 * show. A source that was never read carries no numbers, so it stays out; a
 * failed read that still holds last-good numbers keeps its line so the error
 * stays visible.
 *
 * client.js is a browser module (`window.__ModuleLoader__`), so the test loads
 * it into a vm context with stubbed React, DOM, and fetch, then renders the two
 * registered components by hand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CLIENT_SOURCE = readFileSync(new URL("../../client.js", import.meta.url), "utf8");

const OPENCODE = {
  name: "OpenCode Go",
  shortName: "OC",
  mode: "auto",
  status: "ok",
  defaultWindow: "h5",
  mainWindow: "h5",
  reportedWindows: ["h5", "week", "month"],
  windowLabels: { h5: "5 小时", week: "周", month: "月" },
  windows: {
    h5: { remaining: 90, total: 100, unit: "%", resetAt: null },
    week: { remaining: 80, total: 100, unit: "%", resetAt: null },
    month: { remaining: 70, total: 100, unit: "%", resetAt: null },
  },
};
const GROK = {
  name: "X Premium · Grok",
  shortName: "X",
  mode: "auto",
  status: "ok",
  defaultWindow: "week",
  mainWindow: "week",
  reportedWindows: ["h5", "week", "month"],
  windows: { h5: null, week: { remaining: 31, total: 100, unit: "%", resetAt: null }, month: null },
};
const CLAUDE = {
  name: "Claude",
  shortName: "Claude",
  mode: "auto",
  status: "never",
  defaultWindow: "h5",
  mainWindow: null,
  reportedWindows: ["h5", "week"],
  windows: { h5: null, week: null },
};
const DEEPSEEK = {
  name: "DeepSeek",
  shortName: "DeepSeek",
  mode: "auto",
  status: "never",
  defaultWindow: "balance",
  mainWindow: null,
  reportedWindows: ["balance"],
  windows: { balance: null },
};
const ZHIPU_STALE = {
  name: "智谱 GLM Coding Plan",
  shortName: "智谱",
  mode: "auto",
  status: "parse_failed",
  defaultWindow: "h5",
  mainWindow: "h5",
  reportedWindows: ["h5", "week"],
  windows: { h5: { remaining: 800, total: 2000, unit: "积分", resetAt: null }, week: null },
  error: { code: "parse_failed", message: "页面结构可能已变化" },
};
const ALIBABA_NO_KEY = {
  name: "阿里云百炼 Coding Plan",
  shortName: "百炼",
  mode: "auto",
  status: "auth_failed",
  defaultWindow: "h5",
  mainWindow: null,
  reportedWindows: ["h5", "week", "month"],
  windows: { h5: null, week: null, month: null },
  error: { code: "auth_failed", message: "缺少 ALIBABA_CODING_PLAN_API_KEY" },
};

const MIXED_VIEW = {
  generatedAt: "2026-11-12T11:00:00.000Z",
  ok: true,
  schemaVersion: 3,
  sources: {
    opencode_go: OPENCODE,
    x_premium: GROK,
    claude: CLAUDE,
    deepseek: DEEPSEEK,
    zhipu: ZHIPU_STALE,
    alibaba: ALIBABA_NO_KEY,
  },
  meta: { lastFetchAt: "2026-11-12T11:00:00.000Z" },
};

const UNREAD_VIEW = {
  generatedAt: null,
  ok: true,
  schemaVersion: 3,
  sources: {
    opencode_go: { ...OPENCODE, status: "never", mainWindow: null, windows: { h5: null, week: null, month: null } },
    x_premium: { ...GROK, status: "never", mainWindow: null, windows: { h5: null, week: null, month: null } },
    claude: CLAUDE,
    deepseek: DEEPSEEK,
    alibaba: ALIBABA_NO_KEY,
  },
  meta: { lastFetchAt: null },
};

const ANCHOR = { getBoundingClientRect: () => ({ left: 100, right: 200, top: 700, bottom: 720, width: 100, height: 20 }) };

/** English copy, as the host locale would resolve it. */
const EN = {
  "source.opencode_go": "OpenCode Go",
  "source.opencode_go.short": "OC",
  "source.x_premium": "X Premium · Grok",
  "source.x_premium.short": "Grok",
  "source.zhipu": "Zhipu GLM Coding Plan",
  "source.zhipu.short": "GLM",
  "window.h5": "5-hour",
  "window.week": "Week",
  "status.parse_failed": "Parse failed",
  "dock.details": "Remaining quota",
};
const en = (key) => EN[key] ?? key;

/**
 * Load client.js against stubs and render both components with `view` loaded.
 * @param {object} view
 * @param {{translate?: (key: string) => string}} [options]
 */
async function render(view, options = {}) {
  const translate = options.translate ?? ((key) => key);
  const effects = [];
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: props || {},
        children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
      };
    },
    useState(initial) {
      return [initial, () => {}];
    },
    useEffect(fn) {
      effects.push(fn);
      return undefined;
    },
  };

  const documentStub = { querySelector: () => ANCHOR, addEventListener() {}, removeEventListener() {} };
  let module = null;
  const windowStub = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
    __ModuleLoader__: {
      load(def) {
        module = def;
      },
    },
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, view, refreshing: false, lastResult: null }),
    }),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Intl,
    Object,
    Array,
    String,
    Number,
    isFinite,
    Promise,
    AbortController: class {
      constructor() {
        this.signal = {};
      }
      abort() {}
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(CLIENT_SOURCE, sandbox, { filename: "client.js" });

  assert.ok(module, "client.js should register its module");
  const plugin = module.factory((name) => {
    assert.equal(name, "react");
    return React;
  });

  const slots = new Map();
  plugin.apply({
    get: (name) =>
      name === "locale"
        ? { bind: () => translate, register: () => () => {}, subscribe: () => () => {} }
        : null,
    effect: (fn) => fn(),
    slots: {
      inject: (_name, fn) => fn(),
      register({ id }, component) {
        slots.set(id, component);
      },
    },
  });

  const QuotaDock = slots.get("ai-quota-dashboard");
  const QuotaPopover = slots.get("ai-quota-dashboard.popover");
  assert.ok(QuotaDock && QuotaPopover, "both slots should be registered");

  const flush = async () => {
    for (const fn of effects.splice(0)) fn();
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  QuotaDock();
  await flush();
  const dock = QuotaDock();

  const toggle = walk(dock).find((node) => node.props && node.props["data-aqd-toggle"] === "1");
  assert.ok(toggle, "the strip should expose a toggle");
  toggle.props.onClick({ currentTarget: ANCHOR });
  await flush();
  QuotaPopover();
  const popover = QuotaPopover();

  return { dock, popover };
}

const classOf = (node) => (node && node.props && node.props.className) || "";

function walk(node, out = []) {
  if (!node || typeof node !== "object") return out;
  out.push(node);
  for (const child of node.children || []) walk(child, out);
  return out;
}

const byClass = (tree, name) => walk(tree).filter((node) => classOf(node) === name);
const textIn = (node) => {
  const parts = [];
  const visit = (current) => {
    if (current === null || current === undefined) return;
    if (typeof current === "string" || typeof current === "number") {
      parts.push(String(current));
      return;
    }
    for (const child of current.children || []) visit(child);
  };
  visit(node);
  return parts.join(" ");
};

test("the strip lists only sources that carry a number", async () => {
  const { dock, popover } = await render(MIXED_VIEW);

  assert.deepEqual(
    byClass(dock, "aqd-chip-name").map(textIn),
    ["OC", "X", "智谱"],
    "sources without a reading render no chip",
  );
  assert.deepEqual(
    byClass(popover, "aqd-src-name").map(textIn),
    ["OpenCode Go", "X Premium · Grok", "智谱 GLM Coding Plan"],
    "the popover skips them too",
  );
});

test("a never-read source gets no line", async () => {
  const { dock, popover } = await render(MIXED_VIEW);
  for (const name of ["Claude", "DeepSeek"]) {
    assert.ok(!textIn(dock).includes(name), `${name} was never read, so the strip skips it`);
    assert.ok(!textIn(popover).includes(name), `${name} was never read, so the popover skips it`);
  }
});

test("a refresh that fails before any reading leaves no line behind", async () => {
  const { dock, popover } = await render(MIXED_VIEW);
  // The reported bug: refreshing turns `never` into `auth_failed`, and the empty
  // source came back as a line with an error and no number.
  assert.ok(!textIn(dock).includes("百炼"), "a source with no credentials earns no chip");
  assert.ok(!textIn(popover).includes("百炼"), "a source with no credentials earns no line");
  assert.ok(!textIn(popover).includes("ALIBABA_CODING_PLAN_API_KEY"), "its error is not listed either");
});

test("a failed read keeps its line while last-good numbers survive", async () => {
  const { popover } = await render(MIXED_VIEW);
  const zhipu = walk(popover).find((node) => classOf(node) === "aqd-src" && textIn(node).includes("智谱"));
  assert.ok(zhipu, "the failed source keeps a line");
  assert.deepEqual(byClass(zhipu, "aqd-src-error").map(textIn), ["页面结构可能已变化"]);
  assert.ok(textIn(zhipu).includes("800"), "its last-good number is still shown");
});

test("a dashboard with no readings at all renders the empty state", async () => {
  const { dock, popover } = await render(UNREAD_VIEW);

  assert.equal(byClass(dock, "aqd-chip-name").length, 0, "the strip has no chips");
  assert.equal(walk(dock).some((node) => classOf(node) === "aqd-chips"), false, "the strip renders no chip row");
  assert.deepEqual(byClass(popover, "aqd-src-name"), [], "the popover lists no source");
  assert.deepEqual(byClass(popover, "aqd-muted aqd-pad").map(textIn), ["dock.details.empty"]);
});

test("locale copy wins over the Chinese labels the host half sends", async () => {
  // The view carries Chinese names/labels; preferring them made the strip
  // Chinese-only even when the host locale was English.
  const { dock, popover } = await render(MIXED_VIEW, { translate: en });

  assert.deepEqual(byClass(dock, "aqd-chip-name").map(textIn), ["OC", "Grok", "GLM"]);
  assert.deepEqual(byClass(popover, "aqd-src-name").map(textIn), [
    "OpenCode Go",
    "X Premium · Grok",
    "Zhipu GLM Coding Plan",
  ]);
  const labels = byClass(popover, "aqd-win-k").map(textIn);
  assert.ok(labels.includes("5-hour"), "window labels follow the locale");
  assert.ok(labels.includes("Week"), "window labels follow the locale");
  assert.ok(!labels.includes("5 小时"), "the view's Chinese window labels lose to the locale");
  assert.ok(textIn(popover).includes("Parse failed"), "status follows the locale");
});
