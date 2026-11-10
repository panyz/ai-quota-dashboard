import { SOURCE_IDS, SOURCES, SCHEMA_VERSION, deriveWindowStatus, wasNotReadThisAttempt } from "./model.js";

/**
 * Output shape for one source. Window order comes from that source's spec.
 * @param {string} id
 * @param {any} source
 * @param {any} state
 * @param {Date} now
 */
export function buildSourceView(id, source, state, now) {
  const windows = {};
  for (const spec of SOURCES[id].windows) {
    const w = source.windows[spec.key];
    windows[spec.key] = w
      ? {
          remaining: w.remaining,
          total: w.total,
          unit: w.unit,
          resetAt: w.resetAt,
          updatedAt: w.updatedAt,
          status: deriveWindowStatus(w, now, spec),
          notReadThisAttempt: wasNotReadThisAttempt(source, w),
        }
      : null;
  }
  const meta = SOURCES[id];
  return {
    name: meta.name,
    shortName: meta.shortName,
    mode: source.mode,
    status: source.status,
    defaultWindow: state?.meta?.defaultWindow?.[id] ?? "auto",
    mainWindow: source.mainWindow,
    reportedWindows: meta.windows
      .filter((spec) => spec.advertised !== false || source.windows?.[spec.key])
      .map((spec) => spec.key),
    windowLabels: Object.fromEntries(meta.windows.map((spec) => [spec.key, spec.label])),
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
