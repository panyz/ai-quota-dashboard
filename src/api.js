// Headless quota reads. The manifest names the URL and where the user's own
// credential already lives (env var or the official client's local file).
// The token is sent and then dropped; it is never written to state.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { registry } from "./model.js";
import { parserFor } from "./parsers/index.js";

function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function dig(obj, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

/**
 * Resolve a credential without logging it.
 * @returns {{token:string, accountId:string|null}|null}
 */
export function loadSecret(auth, env = process.env) {
  if (!auth || typeof auth !== "object") return null;
  for (const name of auth.env ?? []) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return { token: value.trim(), accountId: null };
  }
  if (typeof auth.file !== "string" || !auth.file) return null;
  let doc;
  try {
    doc = JSON.parse(readFileSync(expandHome(auth.file), "utf8"));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  let token = null;
  for (const field of auth.fields ?? []) {
    const value = dig(doc, field);
    if (typeof value === "string" && value.trim()) {
      token = value.trim();
      break;
    }
  }
  if (!token) return null;
  const account = auth.accountField ? dig(doc, auth.accountField) : null;
  return { token, accountId: typeof account === "string" && account.trim() ? account.trim() : null };
}

function endpoint(api, env) {
  if (api.urlEnv && typeof env[api.urlEnv] === "string" && env[api.urlEnv].trim()) return env[api.urlEnv].trim();
  if (api.hostEnv && typeof env[api.hostEnv] === "string" && env[api.hostEnv].trim()) {
    const host = env[api.hostEnv].trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}${api.path ?? ""}`;
  }
  return api.url;
}

function headersFor(api, secret) {
  const headers = {};
  for (const [key, value] of Object.entries(api.headers ?? {})) {
    headers[key] = String(value).replaceAll("{token}", secret.token).replaceAll("{account}", secret.accountId ?? "");
  }
  if (api.accountHeader && secret.accountId) headers[api.accountHeader] = secret.accountId;
  return headers;
}

function missingMessage(auth) {
  const where = [...(auth?.env ?? []), auth?.file].filter(Boolean).join(" 或 ");
  return where ? `缺少凭证：设置 ${where}` : "缺少凭证";
}

/**
 * Read one API-backed source.
 * @returns {Promise<{ok:true, windows:object, mainWindow:string|null, adapterVersion:string}|{ok:false, code:string, message:string}>}
 */
export async function readApiSource(id, { timeoutMs = 20000, env = process.env } = {}) {
  const manifest = registry.get(id);
  const parse = parserFor(id);
  if (!manifest?.api || !parse) return { ok: false, code: "unsupported", message: `${id} 没有接口适配器` };
  const secret = loadSecret(manifest.auth, env);
  if (!secret) return { ok: false, code: "config_error", message: missingMessage(manifest.auth) };

  const url = endpoint(manifest.api, env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, {
      method: manifest.api.method ?? "GET",
      headers: headersFor(manifest.api, secret),
      body: manifest.api.body === undefined ? undefined : JSON.stringify(manifest.api.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (json && (json.code === "ConsoleNeedLogin" || json.Code === "ConsoleNeedLogin")) {
      return { ok: false, code: "not_logged_in", message: "这个账号的额度接口要求控制台登录，当前 key 不够" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: "config_error", message: `凭证被拒绝（HTTP ${response.status}）` };
    }
    if (!response.ok || json === null) {
      return { ok: false, code: "parse_failed", message: `额度接口返回 HTTP ${response.status}` };
    }
    return parse(json, new Date());
  } catch (err) {
    const message = String(err?.message ?? err);
    const code = /abort|timed out|timeout/i.test(message) ? "timeout" : "parse_failed";
    return { ok: false, code, message: message.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}
