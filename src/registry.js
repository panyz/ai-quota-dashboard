// Declarative provider manifests. Pure module: no I/O.
// A manifest is the only place a built-in source declares its id, aliases, windows, and parser.

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;
export const SEMANTICS = Object.freeze(["percent", "count", "credits"]);
export const TRANSPORTS = Object.freeze(["cdp", "api", "auto", "manual"]);

const ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
const SLUG_RE = /^[a-z][a-z0-9-]{1,31}$/;

const fail = (code, message) => ({ ok: false, code, message });

/**
 * Validate one provider manifest. Returns {ok:false, code, message} instead of throwing,
 * so a bad manifest can be reported on its own.
 * @param {any} m
 */
export function validateManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return fail("manifest_invalid", "清单不是对象");
  if (!ID_RE.test(m.id ?? "")) return fail("manifest_invalid_id", `id 非法：${m.id}`);
  if (!SLUG_RE.test(m.slug ?? "")) return fail("manifest_invalid_slug", `${m.id} slug 非法：${m.slug}`);
  if (typeof m.name !== "string" || !m.name) return fail("manifest_invalid_name", `${m.id} 缺少 name`);
  if (typeof m.url !== "string" || !/^https:\/\//.test(m.url)) {
    return fail("manifest_invalid_url", `${m.id} url 必须是 https URL`);
  }
  if (!TRANSPORTS.includes(m.transport)) {
    return fail("manifest_bad_transport", `${m.id} transport 必须是 ${TRANSPORTS.join("|")}`);
  }
  if (m.defaultWindow !== undefined && m.defaultWindow !== "auto" && typeof m.defaultWindow !== "string") {
    return fail("manifest_bad_default", `${m.id} defaultWindow 非法`);
  }
  if (!Array.isArray(m.windows) || m.windows.length === 0) {
    return fail("manifest_no_windows", `${m.id} 至少声明一个窗口`);
  }
  if ((m.transport === "cdp" || m.transport === "auto") && (typeof m.ready?.expr !== "string" || !m.ready.expr.trim())) {
    return fail("manifest_no_ready", `${m.id} 缺少 ready.expr`);
  }
  // "auto" picks the API when its credentials are present, so it must declare both.
  if (m.transport === "auto" && (!m.api || !m.auth)) {
    return fail("manifest_auto_incomplete", `${m.id} transport=auto 需要同时声明 api 与 auth`);
  }
  if (!m.parser || m.parser.kind !== "module" || !ID_RE.test(m.parser.name ?? "")) {
    return fail("manifest_bad_parser", `${m.id} parser 必须是 { kind:'module', name }`);
  }
  if (typeof m.parser.version !== "string" || !m.parser.version) {
    return fail("manifest_bad_parser", `${m.id} 缺少 parser.version`);
  }
  if (m.aliases !== undefined && !Array.isArray(m.aliases)) return fail("manifest_bad_alias", `${m.id} aliases 必须是数组`);

  const seen = new Set();
  for (const w of m.windows) {
    if (!w || typeof w !== "object") return fail("manifest_bad_window", `${m.id} 窗口不是对象`);
    if (!ID_RE.test(w.key ?? "")) return fail("manifest_bad_window", `${m.id} 窗口 key 非法：${w.key}`);
    if (seen.has(w.key)) return fail("manifest_dup_window", `${m.id} 窗口重复：${w.key}`);
    seen.add(w.key);
    if (typeof w.label !== "string" || !w.label) return fail("manifest_bad_window_label", `${m.id}/${w.key} 缺少 label`);
    if (!SEMANTICS.includes(w.semantic)) {
      return fail("manifest_bad_semantic", `${m.id}/${w.key} semantic 必须是 ${SEMANTICS.join("|")}`);
    }
    if (w.periodMs !== null && !(Number.isFinite(w.periodMs) && w.periodMs > 0)) {
      return fail("manifest_bad_period", `${m.id}/${w.key} periodMs 必须是正数或 null`);
    }
    if (typeof w.unit !== "string" || !w.unit) return fail("manifest_bad_unit", `${m.id}/${w.key} 缺少 unit`);
    if (w.semantic === "percent" && w.unit !== "%") {
      return fail("manifest_bad_unit", `${m.id}/${w.key} percent 语义的 unit 必须是 %`);
    }
  }
  if (m.defaultWindow && m.defaultWindow !== "auto" && !seen.has(m.defaultWindow)) {
    return fail("manifest_bad_default", `${m.id} defaultWindow 不在窗口列表里`);
  }
  if (!m.windows.some((w) => w.advertised !== false)) {
    return fail("manifest_no_advertised", `${m.id} 至少要有一个 advertised 窗口`);
  }
  return { ok: true, manifest: m };
}

/**
 * Registry of built-in providers: ids, aliases, and window order.
 */
export class ProviderRegistry {
  constructor(manifests) {
    this.byId = new Map();
    this.byAlias = new Map();
    this.order = [];
    const problems = [];
    for (const raw of manifests) {
      const v = validateManifest(raw);
      if (!v.ok) {
        problems.push(v);
        continue;
      }
      if (this.byId.has(raw.id)) {
        problems.push(fail("manifest_dup_id", `重复 id：${raw.id}`));
        continue;
      }
      this.byId.set(raw.id, raw);
      this.order.push(raw.id);
      for (const alias of [raw.id, raw.slug, ...(raw.aliases ?? [])]) {
        const key = String(alias).trim().toLowerCase();
        const owner = this.byAlias.get(key);
        if (owner && owner !== raw.id) {
          problems.push(fail("manifest_alias_conflict", `别名 ${alias} 同时属于 ${owner} 与 ${raw.id}`));
        } else {
          this.byAlias.set(key, raw.id);
        }
      }
    }
    if (problems.length) {
      throw Object.assign(new Error(problems[0].message), { code: problems[0].code, problems });
    }
  }

  ids() {
    return [...this.order];
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  /** Alias or slug → canonical id. Unknown names return null. */
  resolve(name) {
    if (name === undefined || name === null || name === "") return null;
    return this.byAlias.get(String(name).trim().toLowerCase()) ?? null;
  }

  windows(id) {
    return this.get(id)?.windows ?? [];
  }

  windowOrder(id) {
    return this.windows(id).map((w) => w.key);
  }

  advertised(id) {
    return this.windows(id).filter((w) => w.advertised !== false).map((w) => w.key);
  }
}
