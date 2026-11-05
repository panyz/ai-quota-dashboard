import { SOURCE_IDS, WINDOW_KEYS, SCHEMA_VERSION, deriveWindowStatus, wasNotReadThisAttempt } from "./model.js";

/**
 * Output shape for one source (AC-10). Windows are always the fixed three keys.
 * @param {string} id
 * @param {any} source
 * @param {any} state
 * @param {Date} now
 */
export function buildSourceView(id, source, state, now) {
  const windows = {};
  for (const key of WINDOW_KEYS) {
    const w = source.windows[key];
    windows[key] = w
      ? {
          remaining: w.remaining,
          total: w.total,
          unit: w.unit,
          resetAt: w.resetAt,
          updatedAt: w.updatedAt,
          status: deriveWindowStatus(w, now),
          notReadThisAttempt: wasNotReadThisAttempt(source, w),
        }
      : null;
  }
  return {
    mode: source.mode,
    status: source.status,
    defaultWindow: state?.meta?.defaultWindow?.[id] ?? "auto",
    mainWindow: source.mainWindow,
    error: source.error,
    lastAttemptAt: source.lastAttemptAt,
    adapterVersion: source.adapterVersion,
    windows,
  };
}

/** The JSON that `list --json` / `show --json` and GET /api/state both return. */
export function buildView(state, now = new Date()) {
  const sources = {};
  for (const id of SOURCE_IDS) sources[id] = buildSourceView(id, state.sources[id], state, now);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    ok: true,
    sources,
  };
}
