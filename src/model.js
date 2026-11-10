// Domain model: sources come from provider manifests, plus status derivation and the state schema.
// Pure module: no I/O. schemaVersion 3 is current; version 2 migrates in place.
// Versions older than 2 and newer than 3 are refused.

import { MANIFESTS } from "./providers.js";
import { DAY, HOUR, ProviderRegistry } from "./registry.js";

export const SCHEMA_VERSION = 3;
export const registry = new ProviderRegistry(MANIFESTS);

/** Fallback specs for normalizeWindow(raw, "h5") when no source is in scope. */
export const WINDOW_SPECS = Object.freeze({
  h5: Object.freeze({ key: "h5", label: "5 小时", semantic: "percent", periodMs: 5 * HOUR, unit: "%" }),
  week: Object.freeze({ key: "week", label: "周", semantic: "percent", periodMs: 7 * DAY, unit: "%" }),
  month: Object.freeze({ key: "month", label: "月", semantic: "percent", periodMs: 30 * DAY, unit: "%" }),
});

export const WINDOW_KEYS = Object.freeze(["h5", "week", "month"]);
export const WINDOW_LABELS = Object.freeze({ h5: "5 小时", week: "周", month: "月" });

function sourceFromManifest(manifest) {
  return Object.freeze({
    key: manifest.id,
    id: manifest.slug,
    name: manifest.name,
    shortName: manifest.shortName ?? manifest.name,
    mode: manifest.transport === "manual" ? "manual" : "auto",
    transport: manifest.transport,
    adapter: manifest.parser.version,
    workspace: manifest.workspace ?? null,
    defaultWindow: manifest.defaultWindow ?? "auto",
    url: manifest.url,
    windows: Object.freeze(
      manifest.windows.map((spec) =>
        Object.freeze({
          key: spec.key,
          label: spec.label,
          semantic: spec.semantic,
          periodMs: spec.periodMs,
          unit: spec.unit,
          advertised: spec.advertised !== false,
        }),
      ),
    ),
  });
}

export const SOURCE_IDS = Object.freeze(registry.ids());

/** Built-in sources projected from the manifests. */
export const SOURCES = Object.freeze(
  Object.fromEntries(SOURCE_IDS.map((id) => [id, sourceFromManifest(registry.get(id))])),
);

/** Declared window keys, in UI order. */
export function windowOrder(id) {
  return (SOURCES[id]?.windows ?? []).map((spec) => spec.key);
}

/** @returns {object|null} */
export function windowSpec(id, key) {
  return SOURCES[id]?.windows?.find((spec) => spec.key === key) ?? WINDOW_SPECS[key] ?? null;
}

/** Windows this source is expected to fill; others stay null without marking partial. */
export function advertisedWindows(id) {
  const specs = SOURCES[id]?.windows;
  if (!specs) return WINDOW_KEYS;
  return specs.filter((spec) => spec.advertised !== false).map((spec) => spec.key);
}

/** @returns {string|null} canonical source id */
export function resolveSource(raw) {
  return registry.resolve(raw);
}

export const SOURCE_STATUSES = Object.freeze([
  "never",
  "ok",
  "partial",
  "manual",
  "not_logged_in",
  "parse_failed",
  "page_unreachable",
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
  page_unreachable: "页面打不开",
  timeout: "读取超时",
  cdp_unavailable: "调试端口未开",
});

export const WINDOW_STATUS_LABELS = Object.freeze({
  ok: "正常",
  stale: "可能过期",
  expired: "已过期",
  reset_passed: "周期已重置",
});

export function emptyWindows(id) {
  const out = {};
  for (const key of id ? windowOrder(id) : WINDOW_KEYS) out[key] = null;
  return out;
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
    windows: emptyWindows(id),
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
 * Percent windows are clamped to remaining 0–100 with total 100; other semantics keep their unit.
 * @param {any} raw
 * @param {string|object} keyOrSpec
 */
export function normalizeWindow(raw, keyOrSpec) {
  const spec = typeof keyOrSpec === "string" ? (WINDOW_SPECS[keyOrSpec] ?? { key: keyOrSpec }) : keyOrSpec;
  const key = spec?.key ?? keyOrSpec;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const remaining = num(raw.remaining);
  if (remaining === null || remaining < 0) return null;
  const percent = spec?.semantic === "percent";
  if (percent && remaining > 100) return null;
  const total = raw.total === null || raw.total === undefined ? null : num(raw.total);
  if (!percent && raw.total !== null && raw.total !== undefined && (total === null || total <= 0)) return null;
  const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  if (!percent && !unit) return null;
  return {
    remaining,
    total: percent ? 100 : total,
    unit: percent ? "%" : unit.slice(0, 8),
    semantic: spec?.semantic ?? null,
    periodMs: typeof spec?.periodMs === "number" ? spec.periodMs : null,
    resetAt: typeof raw.resetAt === "string" && Number.isFinite(Date.parse(raw.resetAt)) ? raw.resetAt : null,
    updatedAt: typeof raw.updatedAt === "string" && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : null,
    window: key,
  };
}

function normalizeError(raw, id) {
  if (!raw || typeof raw !== "object" || !raw.code) return null;
  const keys = windowOrder(id);
  const out = {
    code: String(raw.code).slice(0, 32),
    message: String(raw.message ?? "").slice(0, 160),
  };
  if (Array.isArray(raw.missingWindows)) {
    out.missingWindows = raw.missingWindows.filter((w) => keys.includes(w));
  }
  return out;
}

function normalizeDefaultWindow(value, fallback, id) {
  if (value === "auto" || windowOrder(id).includes(value)) return value;
  return fallback;
}

function normalizeLegacyWindows(raw, id) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const declared = new Set(windowOrder(id));
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (declared.has(key) || value === null || value === undefined) continue;
    if (typeof value === "object") out[key] = value;
  }
  return Object.keys(out).length ? out : null;
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
  base.error = meta.mode === "manual" ? null : normalizeError(raw.error, id);
  base.lastAttemptAt =
    typeof raw.lastAttemptAt === "string" && Number.isFinite(Date.parse(raw.lastAttemptAt)) ? raw.lastAttemptAt : null;
  base.adapterVersion = typeof raw.adapterVersion === "string" ? raw.adapterVersion : null;
  base.mainWindow = raw.mainWindow && windowOrder(id).includes(raw.mainWindow) ? raw.mainWindow : null;

  const rawWindows = raw.windows && typeof raw.windows === "object" ? raw.windows : {};
  for (const spec of meta.windows) {
    const w = normalizeWindow(rawWindows[spec.key], spec);
    base.windows[spec.key] = w && w.updatedAt ? w : null;
  }
  const legacy = normalizeLegacyWindows(raw.legacyWindows, id);
  if (legacy) base.legacyWindows = legacy;

  if (meta.mode === "manual") {
    base.status = "manual";
    base.lastAttemptAt = null;
    base.adapterVersion = null;
    base.mainWindow = null;
  }
  return base;
}

/**
 * Lift a v2 document to v3 before normalization.
 * Declared windows stay; any other stored window moves to legacyWindows.
 * @param {any} doc
 * @param {Date} now
 */
export function migrateV2toV3(doc, now = new Date()) {
  const sources = doc?.sources && typeof doc.sources === "object" ? doc.sources : {};
  const nextSources = { ...sources };
  for (const id of SOURCE_IDS) {
    const old = sources[id] && typeof sources[id] === "object" ? sources[id] : {};
    const windows = old.windows && typeof old.windows === "object" ? { ...old.windows } : {};
    const legacy = old.legacyWindows && typeof old.legacyWindows === "object" ? { ...old.legacyWindows } : {};
    for (const key of Object.keys(windows)) {
      if (windowOrder(id).includes(key)) continue;
      if (windows[key] !== null && windows[key] !== undefined) legacy[key] = windows[key];
      delete windows[key];
    }
    nextSources[id] = {
      ...old,
      windows,
      ...(Object.keys(legacy).length ? { legacyWindows: legacy } : {}),
    };
  }
  const meta = doc?.meta && typeof doc.meta === "object" ? { ...doc.meta } : {};
  meta.migratedAt = now.toISOString();
  meta.migratedFrom = 2;
  return { ...doc, schemaVersion: SCHEMA_VERSION, sources: nextSources, meta };
}

/**
 * Parse a state document.
 * Version 3 is used as-is. Version 2 migrates. Older than 2 and newer than 3 are refused.
 * @param {any} doc
 * @param {Date} [now]
 * @returns {{state:any, migrated:boolean}}
 * @throws {Error} UNKNOWN_VERSION (newer) | STALE_VERSION (older than 2) | CORRUPT
 */
export function normalizeState(doc, now = new Date()) {
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
  if (version < 2) {
    throw Object.assign(new Error(`数据版本过旧（${version}），当前需要 ${SCHEMA_VERSION}；请运行 quota clear --yes 后重新录入`), {
      code: "STALE_VERSION",
      found: version,
      expected: SCHEMA_VERSION,
    });
  }
  const migrated = version === 2;
  const current = migrated ? migrateV2toV3(doc, now) : doc;
  if (!current.sources || typeof current.sources !== "object") {
    throw Object.assign(new Error("数据文件缺少 sources"), { code: "CORRUPT" });
  }
  const state = emptyState();
  for (const id of SOURCE_IDS) state.sources[id] = normalizeSource(id, current.sources[id]);
  const rawMeta = current.meta && typeof current.meta === "object" ? current.meta : {};
  state.meta = {
    lastFetchAt:
      typeof rawMeta.lastFetchAt === "string" && Number.isFinite(Date.parse(rawMeta.lastFetchAt))
        ? rawMeta.lastFetchAt
        : null,
    defaultWindow: {},
  };
  if (typeof rawMeta.migratedAt === "string" && Number.isFinite(Date.parse(rawMeta.migratedAt))) {
    state.meta.migratedAt = rawMeta.migratedAt;
    state.meta.migratedFrom = rawMeta.migratedFrom === 2 ? 2 : null;
  }
  for (const id of SOURCE_IDS) {
    state.meta.defaultWindow[id] = normalizeDefaultWindow(
      rawMeta.defaultWindow?.[id],
      SOURCES[id].defaultWindow,
      id,
    );
  }
  return { state, migrated };
}

/**
 * Per-window freshness. A past resetAt wins over age.
 * Age thresholds scale with the window period: a 5-hour window is stale after 5 hours.
 * @param {{resetAt?:string|null, updatedAt?:string|null, periodMs?:number|null}} w
 * @param {Date} now
 * @param {{periodMs?:number}|null} [spec]
 */
export function deriveWindowStatus(w, now, spec) {
  if (!w) return null;
  if (w.resetAt) {
    const reset = Date.parse(w.resetAt);
    if (Number.isFinite(reset) && reset <= now.getTime()) return "reset_passed";
  }
  const updated = Date.parse(w.updatedAt ?? "");
  if (!Number.isFinite(updated)) return "stale";
  const age = Math.max(0, now.getTime() - updated);
  const period = spec?.periodMs ?? w.periodMs ?? DAY;
  if (age > period * 3) return "expired";
  if (age > period) return "stale";
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
  const ratio =
    w.semantic === "percent" || w.unit === "%"
      ? w.remaining / 100
      : typeof w.total === "number" && w.total > 0
        ? w.remaining / w.total
        : null;
  if (ratio !== null && ratio <= 0.2) return "low";
  return null;
}

/** true when the window kept an older value than the last attempt. */
export function wasNotReadThisAttempt(source, w) {
  if (!w || !source.lastAttemptAt) return false;
  return w.updatedAt ? Date.parse(w.updatedAt) < Date.parse(source.lastAttemptAt) : false;
}
