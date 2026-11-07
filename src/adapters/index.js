import { SOURCES } from "../model.js";
import { parseOpenCode } from "../parsers/opencode.js";
import { parseVolcengine } from "../parsers/volcengine.js";
import { cdpVersion, createTarget, closeTarget, evaluate, listTargets, waitFor, sleep } from "../cdp.js";

const READY = {
  opencode_go: () =>
    `document.body.innerText.includes('5-hour window') || document.body.innerText.includes('Rolling') || /SIGN IN|OPEN CONSOLE|Go is a subscription/.test(document.body.innerText)`,
  volcengine: () =>
    `document.body.innerText.includes('套餐用量限额') || document.body.innerText.includes('我的订阅') || document.body.innerText.includes('开通管理')`,
};

const PARSERS = { opencode_go: parseOpenCode, volcengine: parseVolcengine };

/**
 * Read one auto source through the already-signed-in console tab.
 * Resolves { ok:true, windows, mainWindow, adapterVersion } | { ok:false, code, message }.
 * Never writes storage, never touches cookies/tokens, never clicks.
 */
export async function readSource(id, { timeoutMs = 30000, keepTab = false } = {}) {
  if (!PARSERS[id]) return { ok: false, code: "unsupported", message: `${id} 不支持自动读取` };
  const url = SOURCES[id].url;
  try {
    await cdpVersion({ timeoutMs: 3000 });
  } catch {
    return { ok: false, code: "cdp_unavailable", message: "连不上 127.0.0.1:9333" };
  }

  let tab = null;
  let created = false;
  try {
    const pages = await listTargets();
    const origin = new URL(url).origin;
    tab = pages.find((p) => p.url.startsWith(origin)) ?? null;
    if (!tab) {
      tab = await createTarget(url, { background: true });
      created = true;
    } else if (!isVolcPlanPage(id, tab.url) && !tab.url.startsWith(url.split("?")[0])) {
      await evaluate(tab.id, `location.href=${JSON.stringify(url)}`, { awaitPromise: false }).catch(() => {});
    }

    await waitFor(tab.id, "document.readyState === 'complete'", { timeoutMs: 15000, intervalMs: 300 });
    await waitFor(tab.id, READY[id](), { timeoutMs: Math.min(20000, timeoutMs), intervalMs: 500 }).catch(() => {});
    if (id === "opencode_go") await preferWorkspaceGoPage(tab.id);
    await sleep(600);

    const text = await evaluate(tab.id, "document.body.innerText || ''");
    return PARSERS[id](text, new Date());
  } catch (err) {
    const message = String(err?.message ?? err);
    const code = /timed out|timeout/i.test(message) ? "timeout" : "parse_failed";
    return { ok: false, code, message: message.slice(0, 160) };
  } finally {
    if (created && !keepTab && tab?.id) await closeTarget(tab.id).catch(() => {});
  }
}

/** The volcengine console has two quota entry points; both are acceptable. */
function isVolcPlanPage(id, url) {
  if (id !== "volcengine") return false;
  return url.includes("/subscription/coding-plan") || url.includes("/openManagement");
}

/** /console redirects into a workspace; /console/<workspace>/go carries the explicit windows. */
async function preferWorkspaceGoPage(tabId) {
  const href = await evaluate(tabId, "location.href");
  const m = href.match(/^https:\/\/opencode\.ai\/console\/(wrk_[A-Za-z0-9]+)/);
  if (!m) return;
  if (/\/go(\/|$|\?)/.test(href)) return;
  const url = `https://opencode.ai/console/${m[1]}/go`;
  await evaluate(tabId, `location.href=${JSON.stringify(url)}`, { awaitPromise: false }).catch(() => {});
  await waitFor(tabId, "document.readyState === 'complete'", { timeoutMs: 15000 }).catch(() => {});
  await waitFor(tabId, `document.body.innerText.includes('5-hour window')`, { timeoutMs: 15000 }).catch(() => {});
}

/**
 * Read-only diagnostic: open/navigate, read text, parse, report. No storage writes.
 * Throws {code:'cdp_unavailable'} when the debug port is not reachable.
 */
export async function probeSource(id, { keepTab = false, timeoutMs = 20000 } = {}) {
  if (!PARSERS[id]) throw Object.assign(new Error(`${id} 没有自动适配器`), { code: "unsupported" });
  const url = SOURCES[id].url;
  try {
    await cdpVersion({ timeoutMs: 3000 });
  } catch {
    throw Object.assign(new Error("连不上 127.0.0.1:9333"), { code: "cdp_unavailable" });
  }

  const pages = await listTargets();
  const origin = new URL(url).origin;
  let tab = pages.find((p) => p.url.startsWith(origin));
  let created = false;
  if (!tab) {
    tab = await createTarget(url, { background: true });
    created = true;
  }
  try {
    await waitFor(tab.id, "document.readyState === 'complete'", { timeoutMs: 15000 }).catch(() => {});
    await waitFor(tab.id, READY[id](), { timeoutMs, intervalMs: 500 }).catch(() => {});
    if (id === "opencode_go") await preferWorkspaceGoPage(tab.id);
    await sleep(800);
    const finalUrl = await evaluate(tab.id, "location.href");
    const text = await evaluate(tab.id, "document.body.innerText || ''");
    const parsed = PARSERS[id](text, new Date());
    return {
      source: SOURCES[id].id,
      url,
      finalUrl,
      loggedIn: parsed.ok || parsed.code !== "not_logged_in",
      parserOk: parsed.ok,
      error: parsed.ok ? null : { code: parsed.code, message: parsed.message },
      windowsFound: parsed.ok ? Object.keys(parsed.windows) : [],
      mainWindow: parsed.ok ? parsed.mainWindow : null,
      textLength: text.length,
    };
  } finally {
    if (created && !keepTab) await closeTarget(tab.id).catch(() => {});
  }
}
