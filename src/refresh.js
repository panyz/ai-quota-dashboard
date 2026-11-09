import { SOURCE_IDS, WINDOW_KEYS, SOURCES, advertisedWindows, resolveSource } from "./model.js";
import { readSource } from "./adapters/index.js";
import { mockMode, mockRead } from "./mock.js";
import { updateState, readState } from "./store.js";
import { buildSourceView } from "./view.js";

export const EXIT = Object.freeze({
  ok: 0,
  mixed: 1,
  usage: 2,
  cdp: 3,
  login: 4,
  parse: 5,
  timeout: 6,
  partial: 7,
  data: 8,
  page: 9,
});

const CODE_EXIT = {
  cdp_unavailable: EXIT.cdp,
  not_logged_in: EXIT.login,
  parse_failed: EXIT.parse,
  page_unreachable: EXIT.page,
  timeout: EXIT.timeout,
};

export function autoSourceIds() {
  return SOURCE_IDS.filter((id) => SOURCES[id].mode === "auto");
}

export function normalizeIds(ids) {
  return ids.map((raw) => {
    const id = resolveSource(raw);
    if (!id) throw Object.assign(new Error(`未知源：${raw}`), { usage: true });
    return id;
  });
}

/**
 * Fetch the requested sources under ONE total time budget (AC: --timeout is per command).
 * Failure keeps old windows; success merges only the windows that were read.
 */
export async function performFetch({ ids, timeoutSec = 30, keepTab = false, now = new Date() }) {
  const requested = [...new Set(ids)].filter((id) => SOURCES[id]?.mode === "auto");
  const startedAt = now;
  const deadline = Date.now() + Math.max(1, Number(timeoutSec) || 30) * 1000;
  const mode = mockMode();
  const results = {};

  for (const id of requested) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      results[id] = { ok: false, code: "timeout", message: "命令总超时预算已用尽" };
      continue;
    }
    if (mode) {
      results[id] = await mockRead(id, { mode, budgetMs: remaining });
    } else {
      results[id] = await cap(readSource(id, { timeoutMs: remaining, keepTab }), remaining);
    }
  }

  const stamp = startedAt.toISOString();
  await updateState((state) => {
    for (const id of requested) {
      const source = state.sources[id];
      const read = results[id];
      source.lastAttemptAt = stamp;
      if (!read.ok) {
        source.status = read.code;
        source.error = { code: read.code, message: String(read.message ?? "").slice(0, 160) };
        continue;
      }
      const missing = advertisedWindows(id).filter((key) => !read.windows?.[key]);
      for (const key of WINDOW_KEYS) {
        const w = read.windows?.[key];
        if (!w) continue; // keep previous value for windows not read this time
        source.windows[key] = { ...w, window: key, updatedAt: stamp };
      }
      if (read.mainWindow) source.mainWindow = read.mainWindow;
      source.adapterVersion = read.adapterVersion ?? source.adapterVersion;
      source.status = missing.length ? "partial" : "ok";
      source.error = missing.length
        ? { code: "partial", message: "部分窗口未读取，已保留上次数据", missingWindows: missing }
        : null;
    }
    if (requested.some((id) => results[id].ok)) state.meta.lastFetchAt = stamp;
  });

  const { state } = readState();
  const viewNow = new Date();
  const summary = { requested: requested.length, succeeded: 0, failed: 0, partial: 0 };
  const codes = [];
  for (const id of requested) {
    const source = state.sources[id];
    if (source.status === "ok") summary.succeeded += 1;
    else if (source.status === "partial") {
      summary.succeeded += 1;
      summary.partial += 1;
    } else {
      summary.failed += 1;
      codes.push(source.error?.code ?? source.status);
    }
  }

  let exitCode = EXIT.ok;
  if (summary.failed === summary.requested && summary.failed > 0) {
    const unique = [...new Set(codes)];
    exitCode = unique.length > 1 ? EXIT.mixed : (CODE_EXIT[unique[0]] ?? EXIT.mixed);
  } else if (summary.failed > 0 || summary.partial > 0) {
    exitCode = EXIT.partial;
  }

  const sources = {};
  for (const id of SOURCE_IDS) sources[id] = buildSourceView(id, state.sources[id], state, viewNow);

  return {
    ok: exitCode === EXIT.ok,
    generatedAt: viewNow.toISOString(),
    schemaVersion: state.schemaVersion,
    summary,
    sources,
    exitCode,
  };
}

/** Cap one source at the remaining command budget. */
async function cap(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, code: "timeout", message: "命令总超时预算已用尽" }), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
