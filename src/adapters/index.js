import { SOURCES, registry } from "../model.js";
import { pageAlreadyShowsQuota, tabIsReusable, workspaceGoUrl } from "../navigate.js";
import { parserFor } from "../parsers/index.js";
import {
  cdpVersion,
  createTarget,
  closeTarget,
  evaluate,
  listTargets,
  reloadTarget,
  waitFor,
  sleep,
} from "../cdp.js";

// "Ready" means the page has rendered its numbers, not just its labels: after a
// reload the labels exist before the usage request resolves, and reading then
// would cache a placeholder as a real quota. Exported so unit tests can run the
// expressions against real captured pages.
/** Page-ready expressions, taken from each provider manifest. */
export const READY_CHECKS = Object.fromEntries(
  registry.ids().filter((id) => registry.get(id).ready?.expr).map((id) => [id, () => registry.get(id).ready.expr]),
);

const PAGE_LOAD_TIMEOUT_MS = 15000;
const RELOAD_TIMEOUT_MS = 10000;
const SETTLE_ROUNDS = 4;
const SETTLE_GAP_MS = 500;

/** Time left in this source's budget, never negative. */
const left = (deadline) => Math.max(0, deadline - Date.now());
/** A wait timeout clamped to what the caller's budget still allows. */
const budget = (deadline, cap) => Math.max(200, Math.min(cap, left(deadline)));

/** evaluate() clamped to this source's remaining budget, so a hung renderer cannot eat it. */
function evaluateWithin(tabId, expression, deadline, { awaitPromise = true } = {}) {
  return evaluate(tabId, expression, {
    awaitPromise,
    timeoutMs: budget(deadline, 2500),
    sendTimeoutMs: budget(deadline, 3000),
  });
}

/**
 * Chrome's own error page is not the product's HTML: classifying it as a parse
 * failure sends the reader chasing a parser bug that does not exist.
 */
const CHROME_ERROR_URL = /^(chrome-error:|chrome:\/\/)/;
const NET_ERROR = /\b(ERR_[A-Z_]+)\b/;

/**
 * Describe a tab that never reached the site.
 * @param {string} finalUrl
 * @param {string} text
 * @returns {{code:string,message:string}|null} null when the page is real content
 */
export function classifyUnreachable(finalUrl, text) {
  const url = String(finalUrl ?? "");
  const body = String(text ?? "");
  const netCode = (body.match(NET_ERROR) ?? [])[1] ?? null;
  if (!CHROME_ERROR_URL.test(url) && netCode === null) return null;
  const host = (() => {
    try {
      return new URL(url).host || "该页面";
    } catch {
      return "该页面";
    }
  })();
  return {
    code: "page_unreachable",
    message: `浏览器打不开 ${host}${netCode ? `（${netCode}）` : ""}：网络或代理异常，确认该站点能在同一浏览器里手动打开`,
  };
}

/**
 * Wait until the tab shows a document created after `startedAt`, i.e. the
 * reload/navigation we just asked for actually landed. Comparing against the
 * pre-reload document would need a second round-trip; the wall clock and
 * performance.timeOrigin come from the same machine, so one number is enough.
 * @returns {Promise<boolean>} false when no new document arrived within the budget
 */
async function waitForReloadedDocument(tabId, startedAt, timeoutMs) {
  const expression = `document.readyState === 'complete' && performance.timeOrigin >= ${startedAt - 100}`;
  try {
    await waitFor(tabId, expression, { timeoutMs, intervalMs: 300 });
    return true;
  } catch {
    return false;
  }
}

/** Navigate one tab and wait for the new document, not the outgoing one. */
async function navigateTab(tabId, url, deadline) {
  const startedAt = Date.now();
  await evaluateWithin(tabId, `location.href=${JSON.stringify(url)}`, deadline, { awaitPromise: false }).catch(
    () => {},
  );
  return waitForReloadedDocument(tabId, startedAt, budget(deadline, PAGE_LOAD_TIMEOUT_MS));
}

/**
 * Find the console tab for a source, or open one, and make sure its document is
 * fresh before anything reads it.
 *
 * Reusing a tab as-is is not safe: these consoles render their quota snapshot at
 * load time and never poll, so a tab left open keeps showing the numbers from
 * when it was opened. Reading it would "refresh" to the same stale values
 * forever (and parse relative reset countdowns against the current clock).
 * So a reused tab is reloaded; a created or navigated tab loads its own document.
 *
 * `fresh:false` means the requested reload never produced a new document — the
 * caller must report that instead of returning the old numbers as a success.
 */
async function openFreshTab(id, { deadline }) {
  const url = SOURCES[id].url;
  const origin = new URL(url).origin;
  const pages = await listTargets();
  let tab = pages.find((p) => p.url.startsWith(origin)) ?? null;
  if (!tab) {
    tab = await createTarget(url, { background: true, timeoutMs: budget(deadline, RELOAD_TIMEOUT_MS) });
    await waitFor(tab.id, "document.readyState === 'complete'", {
      timeoutMs: budget(deadline, PAGE_LOAD_TIMEOUT_MS),
      intervalMs: 300,
    }).catch(() => {});
    return { tab, created: true, fresh: true };
  }

  const startedAt = Date.now();
  if (tabIsReusable(registry.get(id)?.navigate, tab.url) || tab.url.startsWith(url.split("?")[0])) {
    await reloadTarget(tab.id, { timeoutMs: budget(deadline, RELOAD_TIMEOUT_MS) }).catch(async () => {
      await evaluateWithin(tab.id, "location.reload()", deadline, { awaitPromise: false }).catch(() => {});
    });
  } else {
    await evaluateWithin(tab.id, `location.href=${JSON.stringify(url)}`, deadline, { awaitPromise: false }).catch(
      () => {},
    );
  }
  const fresh = await waitForReloadedDocument(tab.id, startedAt, budget(deadline, PAGE_LOAD_TIMEOUT_MS));
  return { tab, created: false, fresh };
}

/** Values only (no reset times), so two samples of the same quota compare equal. */
function quotaSignature(parsed) {
  if (!parsed || parsed.ok !== true || !parsed.windows) return null;
  return Object.keys(parsed.windows)
    .sort()
    .map((key) => {
      const w = parsed.windows[key] || {};
      return `${key}:${w.remaining}/${w.total ?? ""}/${w.unit ?? ""}`;
    })
    .join("|");
}

/**
 * Read innerText until two consecutive samples parse to the same numbers (or the
 * budget runs out). A page that paints a placeholder before its usage request
 * resolves would otherwise be cached as a real quota.
 *
 * Honest limit: this only catches placeholders shorter than one sample gap
 * (~500ms). The three consoles paint explicit loading copy ("用量加载中", "…")
 * instead of a fake 0, and READY waits for real numbers, so that is enough here.
 */
async function readSettled(tabId, parse, deadline) {
  let text = "";
  let parsed = null;
  let previous = null;
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    if (round > 0) {
      if (left(deadline) < SETTLE_GAP_MS + 200) break;
      await sleep(SETTLE_GAP_MS);
    }
    text = await evaluateWithin(tabId, "document.body.innerText || ''", deadline);
    parsed = parse(text, new Date());
    const signature = quotaSignature(parsed);
    if (signature !== null && signature === previous) return { text, parsed };
    previous = signature;
  }
  return { text, parsed };
}

/**
 * Read one auto source through the already-signed-in console tab.
 * Resolves { ok:true, windows, mainWindow, adapterVersion } | { ok:false, code, message }.
 * Never writes storage, never touches cookies/tokens, never clicks.
 */
export async function readSource(id, { timeoutMs = 30000, keepTab = false } = {}) {
  const parse = parserFor(id);
  if (!parse) return { ok: false, code: "unsupported", message: `${id} 不支持自动读取` };
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 30000);
  try {
    await cdpVersion({ timeoutMs: 3000 });
  } catch {
    return { ok: false, code: "cdp_unavailable", message: "连不上 127.0.0.1:9333" };
  }

  let tab = null;
  let created = false;
  try {
    let fresh = false;
    ({ tab, created, fresh } = await openFreshTab(id, { deadline }));
    if (!fresh) {
      return {
        ok: false,
        code: "timeout",
        message: "控制台标签页重新加载后未拿到新文档，本次不读旧数据（检查页面是否被拦截或网络异常）",
      };
    }
    await waitFor(tab.id, READY_CHECKS[id](), { timeoutMs: budget(deadline, 20000), intervalMs: 500 }).catch(() => {});
    await followNavigate(id, tab.id, deadline);
    // A read needs at least the settle budget; don't start one that cannot finish.
    if (left(deadline) < 1000) {
      return { ok: false, code: "timeout", message: "命令总超时预算已用尽" };
    }

    const { text, parsed } = await readSettled(tab.id, parse, deadline);
    const finalUrl = await evaluateWithin(tab.id, "location.href", deadline).catch(() => "");
    const unreachable = classifyUnreachable(finalUrl, text);
    if (unreachable) return { ok: false, ...unreachable };
    return parsed;
  } catch (err) {
    const message = String(err?.message ?? err);
    const code = /timed out|timeout/i.test(message) ? "timeout" : "parse_failed";
    return { ok: false, code, message: message.slice(0, 160) };
  } finally {
    if (created && !keepTab && tab?.id) await closeTarget(tab.id).catch(() => {});
  }
}

/** Apply the manifest's navigate rules: workspace hop, or open the quota URL when the copy is missing. */
async function followNavigate(id, tabId, deadline) {
  const navigate = registry.get(id)?.navigate;
  if (!navigate) return;
  const ready = READY_CHECKS[id];
  if (navigate.workspaceGo) {
    const href = await evaluateWithin(tabId, "location.href", deadline);
    const next = workspaceGoUrl(navigate, href);
    if (!next) return;
    await navigateTab(tabId, next, deadline);
    if (ready) await waitFor(tabId, ready(), { timeoutMs: budget(deadline, PAGE_LOAD_TIMEOUT_MS) }).catch(() => {});
    return;
  }
  if (navigate.openWhenMissing) {
    const text = await evaluateWithin(tabId, "document.body.innerText || ''", deadline);
    if (pageAlreadyShowsQuota(navigate, text)) return;
    await navigateTab(tabId, SOURCES[id].url, deadline);
    if (ready) await waitFor(tabId, ready(), { timeoutMs: budget(deadline, PAGE_LOAD_TIMEOUT_MS) }).catch(() => {});
  }
}

/**
 * Read-only diagnostic: reload/navigate, read text, parse, report. No storage writes.
 * Throws {code:'cdp_unavailable'} when the debug port is not reachable.
 */
export async function probeSource(id, { keepTab = false, timeoutMs = 20000 } = {}) {
  const parse = parserFor(id);
  if (!parse) throw Object.assign(new Error(`${id} 没有自动适配器`), { code: "unsupported" });
  const url = SOURCES[id].url;
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 20000);
  try {
    await cdpVersion({ timeoutMs: 3000 });
  } catch {
    throw Object.assign(new Error("连不上 127.0.0.1:9333"), { code: "cdp_unavailable" });
  }

  let tab = null;
  let created = false;
  let fresh = false;
  ({ tab, created, fresh } = await openFreshTab(id, { deadline }));
  try {
    if (!fresh) throw Object.assign(new Error("控制台标签页重新加载后未拿到新文档"), { code: "timeout" });
    await waitFor(tab.id, READY_CHECKS[id](), { timeoutMs: budget(deadline, 20000), intervalMs: 500 }).catch(() => {});
    await followNavigate(id, tab.id, deadline);
    const { text, parsed: settled } = await readSettled(tab.id, parse, deadline);
    const finalUrl = await evaluateWithin(tab.id, "location.href", deadline).catch(() => "");
    const unreachable = classifyUnreachable(finalUrl, text);
    const parsed = unreachable ? { ok: false, ...unreachable } : settled;
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
