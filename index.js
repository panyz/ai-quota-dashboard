/**
 * Host half of the AI quota dashboard plugin.
 *
 * It exposes the same read-only data the `quota` CLI produces over two
 * same-origin routes, so the client half can live inside the Harness Web UI:
 *
 *   GET  /ai-quota/state    → current view + whether a refresh is running
 *   POST /ai-quota/refresh  → start a CDP read, answer 202 and poll for state
 *
 * The routes are registered on the Harness web server, so no separate server
 * or token is involved. Reads are read-only: credentials stay on the host
 * (environment or the user's local files), never reach the browser, and are
 * not written into the state file.
 */
import { ensureState, readState } from "./src/store.js";
import { buildView } from "./src/view.js";
import { autoSourceIds, performFetch } from "./src/refresh.js";

export const inject = ["webServer"];

const STATE_ROUTE = "/ai-quota/state";
const REFRESH_ROUTE = "/ai-quota/refresh";
const REFRESH_TIMEOUT_SEC = 45;

/** @param {import('node:http').ServerResponse} res */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function describeError(error) {
  if (!error || typeof error !== "object") return String(error);
  return typeof error.message === "string" && error.message ? error.message : String(error);
}

function errorCode(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  return typeof code === "string" && code ? code : "data_error";
}

export function apply(ctx) {
  /** @type {Promise<unknown> | null} */
  let inflight = null;
  /** @type {{ ok: boolean, exitCode?: number, summary?: unknown, generatedAt?: string, error?: unknown } | null} */
  let lastResult = null;

  function startRefresh() {
    if (inflight) return null;
    const startedAt = new Date().toISOString();
    const run = performFetch({ ids: autoSourceIds(), timeoutSec: REFRESH_TIMEOUT_SEC })
      .then((result) => {
        lastResult = {
          ok: result.ok === true,
          exitCode: result.exitCode,
          summary: result.summary,
          generatedAt: result.generatedAt,
        };
      })
      .catch((error) => {
        lastResult = { ok: false, error: { code: errorCode(error), message: describeError(error) } };
      })
      .finally(() => {
        inflight = null;
      });
    inflight = run;
    return startedAt;
  }

  /** @param {import('node:http').IncomingMessage} req */
  const handleState = async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: { code: "method_not_allowed", message: "Use GET." } });
      return;
    }
    try {
      ensureState();
      const { state } = readState();
      sendJson(res, 200, {
        ok: true,
        refreshing: inflight !== null,
        startedAt: null,
        lastResult,
        view: buildView(state),
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        refreshing: inflight !== null,
        lastResult,
        error: { code: errorCode(error), message: describeError(error) },
      });
    }
  };

  /** @param {import('node:http').IncomingMessage} req */
  const handleRefresh = async (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: { code: "method_not_allowed", message: "Use POST." } });
      return;
    }
    const startedAt = startRefresh();
    if (startedAt === null) {
      sendJson(res, 409, { ok: false, code: "refresh_in_progress" });
      return;
    }
    sendJson(res, 202, { ok: true, started: true, startedAt });
  };

  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: STATE_ROUTE, handler: handleState }),
    "ai-quota-dashboard: state route",
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: REFRESH_ROUTE, handler: handleRefresh }),
    "ai-quota-dashboard: refresh route",
  );
}
