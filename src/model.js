// Domain model: built-in sources, fixed three windows, status derivation, state schema.
// Pure module: no I/O. schemaVersion is strict — anything but the current value is refused.

export const SCHEMA_VERSION = 2;
export const WINDOW_KEYS = Object.freeze(["h5", "week", "month"]);
export const WINDOW_LABELS = Object.freeze({ h5: "5 小时", week: "周", month: "月" });

export const SOURCE_IDS = Object.freeze(["volcengine", "opencode_go", "x_premium"]);

/** Built-in source registry (v0.4: no config.json; URLs and workspace live here). */
export const SOURCES = Object.freeze({
  volcengine: {
    key: "volcengine",
    id: "volcengine",
    name: "火山引擎 Coding Plan",
    mode: "auto",
    adapter: "volc-v1",
    workspace: null,
    defaultWindow: "auto",
    url: "https://console.volcengine.com/ark/region:cn-beijing/openManagement?advancedActiveKey=subscribe",
  },
  opencode_go: {
    key: "opencode_go",
    id: "opencode-go",
    name: "OpenCode Go",
    mode: "auto",
    adapter: "opencode-v1",
    workspace: "auto",
    defaultWindow: "h5",
    url: "https://opencode.ai/console",
  },
  x_premium: {
    key: "x_premium",
    id: "x-premium",
    name: "X Premium · Grok",
    mode: "manual",
    adapter: null,
    workspace: null,
    defaultWindow: "h5",
    url: null,
  },
});

const ALIASES = Object.freeze({
  volcengine: "volcengine",
  volc: "volcengine",
  "opencode-go": "opencode_go",
  opencode_go: "opencode_go",
  opencode: "opencode_go",
  "x-premium": "x_premium",
  x_premium: "x_premium",
  x: "x_premium",
});

/** @returns {string|null} canonical (underscore) source key */
export function resolveSource(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  return ALIASES[String(raw).trim().toLowerCase()] ?? null;
}

export const SOURCE_STATUSES = Object.freeze([
  "never",
  "ok",
  "partial",
  "manual",
  "not_logged_in",
  "parse_failed",
  "timeout",
  "cdp_unavailable",
]);

export const WINDOW_STATUSES = Object.freeze(["ok", "stale", "expired", "reset_passed"]);

export const SOURCE_STATUS_LABELS = Object.freeze({
  never: "未读取",
  ok: "正常",
  partial: "部分窗口未读取",
  manual: "手动",
  not_logged_in: "浏览器未登录",
  parse_failed: "页面结构可能已变化",
  timeout: "读取超时",
  cdp_unavailable: "调试端口未开",
});

export const WINDOW_STATUS_LABELS = Object.freeze({
  ok: "正常",
  stale: "可能过期",
  expired: "已过期",
  reset_passed: "周期已重置",
});

export function emptyWindows() {
  return { h5: null, week: null, month: null };
}

export function defaultWindows() {
  const out = {};
  for (const id of SOURCE_IDS) out[id] = SOURCES[id].defaultWindow;
  return out;
}

export function emptySource(id) {
  const meta = SOURCES[id];
  return {
    mode: meta.mode,
    status: meta.mode === "manual" ? "manual" : "never",
    mainWindow: null,
    error: null,
    lastAttemptAt: null,
    adapterVersion: null,
    windows: emptyWindows(),
  };
}

export function emptyState() {
  const sources = {};
  for (const id of SOURCE_IDS) sources[id] = emptySource(id);
  return {
    schemaVersion: SCHEMA_VERSION,
    sources,
    meta: { lastFetchAt: null, defaultWindow: defaultWindows() },
  };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Validate one window. Returns null when the value cannot be trusted.
 * @param {any} raw
 * @param {string} key
 */
export function normalizeWindow(raw, key) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const remaining = num(raw.remaining);
  if (remaining === null || remaining < 0) return null;
  const total = raw.total === null || raw.total === undefined ? null : num(raw.total);
  if (raw.total !== null && raw.total !== undefined && (total === null || total <= 0)) return null;
  const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  if (!unit) return null;
  return {
    remaining,
    total,
    unit: unit.slice(0, 8),
    resetAt: typeof raw.resetAt === "string" && Number.isFinite(Date.parse(raw.resetAt)) ? raw.resetAt : null,
    updatedAt: typeof raw.updatedAt === "string" && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : null,
    window: key,
  };
}

function normalizeError(raw) {
  if (!raw || typeof raw !== "object" || !raw.code) return null;
  const out = {
    code: String(raw.code).slice(0, 32),
    message: String(raw.message ?? "").slice(0, 160),
  };
  if (Array.isArray(raw.missingWindows)) {
    out.missingWindows = raw.missingWindows.filter((w) => WINDOW_KEYS.includes(w));
  }
  return out;
}

function normalizeDefaultWindow(value, fallback) {
  if (value === "auto" || WINDOW_KEYS.includes(value)) return value;
  return fallback;
}

/**
 * Normalize one source record.
 * @param {string} id
 * @param {any} raw
 */
export function normalizeSource(id, raw) {
  const meta = SOURCES[id];
  const base = emptySource(id);
  if (!raw || typeof raw !== "object") return base;

  if (meta.mode === "manual") {
    base.mode = "manual";
    base.status = "manual";
  } else {
    base.mode = "auto";
    base.status = SOURCE_STATUSES.includes(raw.status) ? raw.status : "never";
    if (base.status === "manual") base.status = "never";
  }
  base.error = meta.mode === "manual" ? null : normalizeError(raw.error);
  base.lastAttemptAt =
    typeof raw.lastAttemptAt === "string" && Number.isFinite(Date.parse(raw.lastAttemptAt)) ? raw.lastAttemptAt : null;
  base.adapterVersion = typeof raw.adapterVersion === "string" ? raw.adapterVersion : null;
  base.mainWindow = raw.mainWindow && WINDOW_KEYS.includes(raw.mainWindow) ? raw.mainWindow : null;

  const rawWindows = raw.windows && typeof raw.windows === "object" ? raw.windows : {};
  for (const key of WINDOW_KEYS) {
    const w = normalizeWindow(rawWindows[key], key);
    base.windows[key] = w && w.updatedAt ? w : null;
  }

  if (meta.mode === "manual") {
    base.status = "manual";
    base.lastAttemptAt = null;
    base.adapterVersion = null;
    base.mainWindow = null;
  }
  return base;
}

/**
 * Strict parse. Only the current schemaVersion is accepted: no migration, no rewriting.
 * @param {any} doc
 * @returns {{state:any}}
 * @throws {Error} UNKNOWN_VERSION (newer) | STALE_VERSION (older) | CORRUPT
 */
export function normalizeState(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw Object.assign(new Error("数据文件不是合法 JSON 对象"), { code: "CORRUPT" });
  }
  const version = doc.schemaVersion;
  if (typeof version !== "number" || !Number.isFinite(version)) {
    throw Object.assign(new Error("数据文件缺少 schemaVersion"), { code: "CORRUPT" });
  }
  if (version > SCHEMA_VERSION) {
    throw Object.assign(new Error("数据版本较新，请升级 CLI"), {
      code: "UNKNOWN_VERSION",
      found: version,
      expected: SCHEMA_VERSION,
    });
  }
  if (version < SCHEMA_VERSION) {
    throw Object.assign(new Error(`数据版本过旧（${version}），当前需要 ${SCHEMA_VERSION}；请运行 quota clear --yes 后重新录入`), {
      code: "STALE_VERSION",
      found: version,
      expected: SCHEMA_VERSION,
    });
  }
  if (!doc.sources || typeof doc.sources !== "object") {
    throw Object.assign(new Error("数据文件缺少 sources"), { code: "CORRUPT" });
  }
  const state = emptyState();
  for (const id of SOURCE_IDS) state.sources[id] = normalizeSource(id, doc.sources[id]);
  const rawMeta = doc.meta && typeof doc.meta === "object" ? doc.meta : {};
  state.meta = {
    lastFetchAt:
      typeof rawMeta.lastFetchAt === "string" && Number.isFinite(Date.parse(rawMeta.lastFetchAt))
        ? rawMeta.lastFetchAt
        : null,
    defaultWindow: {},
  };
  for (const id of SOURCE_IDS) {
    state.meta.defaultWindow[id] = normalizeDefaultWindow(rawMeta.defaultWindow?.[id], SOURCES[id].defaultWindow);
  }
  return { state };
}

const HOUR = 3600 * 1000;

/**
 * Per-window freshness. A past resetAt wins over age.
 * @param {{resetAt?:string|null, updatedAt?:string|null}} w
 * @param {Date} now
 */
export function deriveWindowStatus(w, now) {
  if (!w) return null;
  if (w.resetAt) {
    const reset = Date.parse(w.resetAt);
    if (Number.isFinite(reset) && reset <= now.getTime()) return "reset_passed";
  }
  const updated = Date.parse(w.updatedAt ?? "");
  if (!Number.isFinite(updated)) return "stale";
  const age = Math.max(0, now.getTime() - updated);
  if (age > 72 * HOUR) return "expired";
  if (age > 24 * HOUR) return "stale";
  return "ok";
}

/**
 * Effective default window for display.
 * @param {string} id
 * @param {any} source
 * @param {any} state
 * @returns {{window:string|null, reason:'config'|'main'|'main-missing'|'window-missing'|'default'}}
 */
export function effectiveDefault(id, source, state) {
  const explicit = state?.meta?.defaultWindow?.[id] ?? SOURCES[id].defaultWindow;
  if (explicit === "auto") {
    if (!source.mainWindow) return { window: null, reason: "main-missing" };
    return source.windows[source.mainWindow]
      ? { window: source.mainWindow, reason: "main" }
      : { window: source.mainWindow, reason: "window-missing" };
  }
  if (source.windows[explicit]) return { window: explicit, reason: "config" };
  return { window: explicit, reason: "window-missing" };
}

export function defaultSummary(defaultWindow, source) {
  if (!defaultWindow.window) return defaultWindow.reason === "main-missing" ? "页面主数字未识别" : "默认窗口未提供";
  if (!source.windows[defaultWindow.window]) {
    return defaultWindow.reason === "window-missing" ? "默认窗口未提供" : "未提供";
  }
  return null;
}

export function lowBadge(w) {
  if (!w) return null;
  if (w.remaining <= 0) return "used_up";
  if (typeof w.total === "number" && w.total > 0 && w.remaining / w.total <= 0.2) return "low";
  return null;
}

/** true when the window kept an older value than the last attempt. */
export function wasNotReadThisAttempt(source, w) {
  if (!w || !source.lastAttemptAt) return false;
  return w.updatedAt ? Date.parse(w.updatedAt) < Date.parse(source.lastAttemptAt) : false;
}
