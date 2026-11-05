// Minimal Chrome DevTools Protocol client (Node >= 22, zero dependencies).
// Uses the built-in global WebSocket. Read-only helpers only by default.

const DEFAULT_BASE = "http://127.0.0.1:9333";

let explicitBase = null;
/** Use the port from config.json (fallback 9333). QUOTA_CDP still wins for tests. */
export function setCdpPort(port) {
  if (Number.isInteger(port) && port > 0) explicitBase = `http://127.0.0.1:${port}`;
}

export const cdpBase = () => (process.env.QUOTA_CDP || explicitBase || DEFAULT_BASE).replace(/\/+$/, "");

export async function cdpVersion({ timeoutMs = 3000 } = {}) {
  const res = await fetchWithTimeout(`${cdpBase()}/json/version`, timeoutMs);
  if (!res.ok) throw new Error(`CDP /json/version -> HTTP ${res.status}`);
  return res.json();
}

export async function listTargets({ timeoutMs = 3000 } = {}) {
  const res = await fetchWithTimeout(`${cdpBase()}/json/list`, timeoutMs);
  if (!res.ok) throw new Error(`CDP /json/list -> HTTP ${res.status}`);
  const all = await res.json();
  return all.filter((t) => t.type === "page");
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function createTarget(url, { background = true } = {}) {
  // /json/new is disabled in some builds (HTTP 405); go through the browser socket.
  const { webSocketDebuggerUrl } = await cdpVersion();
  const targetId = await withSocket(webSocketDebuggerUrl, async (send) => {
    const out = await send("Target.createTarget", { url, background });
    return out.targetId;
  });
  if (!background) await bringToFront(targetId).catch(() => {});
  return { id: targetId, url };
}

export async function closeTarget(id) {
  const res = await fetchWithTimeout(`${cdpBase()}/json/close/${id}`, 5000);
  return res.ok;
}

export async function bringToFront(id) {
  return withSession(id, async (send) => {
    try {
      await send("Page.bringToFront");
    } catch {
      /* target may not support it */
    }
  });
}

export async function evaluate(id, expression, { awaitPromise = true, timeoutMs = 10000 } = {}) {
  return withSession(id, async (send) => {
    const out = await send(
      "Runtime.evaluate",
      { expression, awaitPromise, returnByValue: true, timeout: timeoutMs },
      timeoutMs + 2000
    );
    if (out.exceptionDetails) {
      const d = out.exceptionDetails;
      throw new Error(d.exception?.description || d.text || "evaluate failed");
    }
    return out.result?.value;
  });
}

/** Poll an expression until it returns a truthy value or times out. */
export async function waitFor(id, expression, { timeoutMs = 15000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(id, expression, { awaitPromise: false, timeoutMs: 3000 });
      if (last) return last;
    } catch (err) {
      last = String(err.message || err);
    }
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms (last=${JSON.stringify(last)})`);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


/** Set the viewport for responsive checks (call before evaluating layout). */
export async function setViewport(targetId, { width = 1280, height = 900 } = {}) {
  return withSession(targetId, (send) =>
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false })
  );
}

/** Capture the current viewport as base64 PNG. */
export async function captureScreenshot(targetId, { timeoutMs = 20000 } = {}) {
  return withSession(targetId, async (send) => {
    const out = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, timeoutMs);
    return out.data;
  });
}

/**
 * Viewport + measurement + screenshot in one session (Emulation overrides are session-scoped).
 * @returns {Promise<{data:string, metrics:any}>}
 */
export async function capturePage(targetId, { width = 1280, height = 900, expression = "null" } = {}) {
  return withSession(targetId, async (send) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    try {
      const metrics = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, 20000);
      return { data: shot.data, metrics: metrics.result?.value ?? null };
    } finally {
      await send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    }
  });
}

/** Capture a full-page-ready screenshot (base64 PNG) of a page target. */
export async function withScreenshot(targetId, { timeoutMs = 20000, width = 760, height = 900 } = {}) {
  return withSession(targetId, async (send) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    try {
      const out = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, timeoutMs);
      return out.data;
    } finally {
      await send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    }
  });
}

/** Open one flattened session to a page target and run `fn(send, events)`. */
async function withSession(targetId, fn, { timeoutMs = 20000 } = {}) {
  return withSocket(`ws://${new URL(cdpBase()).host}/devtools/page/${targetId}`, fn, { timeoutMs });
}

/** Open a raw CDP socket to `wsUrl` and run `fn(send)`. */
async function withSocket(wsUrl, fn, { timeoutMs = 20000 } = {}) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", (e) => reject(new Error("CDP socket error")), { once: true });
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? `: ${msg.error.data}` : ""}`));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}, ms = timeoutMs) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${ms}ms`));
      }, ms);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });

  try {
    await opened;
    return await fn(send);
  } finally {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
