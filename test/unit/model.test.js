import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeState,
  emptyState,
  deriveWindowStatus,
  effectiveDefault,
  normalizeWindow,
  resolveSource,
  SCHEMA_VERSION,
  WINDOW_KEYS,
} from "../../src/model.js";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const w = (over = {}) => ({ remaining: 10, total: 100, unit: "次", resetAt: null, updatedAt: "2026-11-05T11:00:00.000Z", ...over });
const clone = (o) => JSON.parse(JSON.stringify(o));

test("empty state: three fixed windows per source + meta.defaultWindow", () => {
  const s = emptyState();
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  for (const id of ["volcengine", "opencode_go", "x_premium"]) {
    assert.deepEqual(Object.keys(s.sources[id].windows), WINDOW_KEYS);
    for (const k of WINDOW_KEYS) assert.equal(s.sources[id].windows[k], null);
  }
  assert.equal(s.sources.x_premium.status, "never");
  assert.equal(s.sources.volcengine.status, "never");
  assert.deepEqual(s.meta.defaultWindow, { volcengine: "auto", opencode_go: "h5", x_premium: "week" });
  assert.equal(s.meta.lastFetchAt, null);
});

test("per-window status: ok / stale / expired / reset_passed", () => {
  assert.equal(deriveWindowStatus(w(), NOW), "ok");
  assert.equal(deriveWindowStatus(w({ updatedAt: "2026-11-04T11:00:00.000Z" }), NOW), "stale");
  assert.equal(deriveWindowStatus(w({ updatedAt: "2026-11-02T11:00:00.000Z" }), NOW), "expired");
  assert.equal(deriveWindowStatus(w({ resetAt: "2026-11-05T11:59:00.000Z" }), NOW), "reset_passed");
});

test("windows are independent: freshness follows each window's own period", () => {
  const doc = emptyState();
  doc.sources.volcengine.windows.h5 = w({ updatedAt: "2026-11-05T06:00:00.000Z" });
  doc.sources.volcengine.windows.week = w({ updatedAt: "2026-11-04T11:00:00.000Z" });
  doc.sources.volcengine.windows.month = w({ updatedAt: "2026-07-01T12:00:00.000Z" });
  const { state } = normalizeState(clone(doc));
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.h5, NOW), "stale");
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.week, NOW), "ok");
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.month, NOW), "expired");
});

test("normalizeWindow refuses empty unit, negative remaining, bad total, and percent above 100", () => {
  assert.equal(normalizeWindow({ remaining: 1, unit: "" }, "credits"), null);
  assert.equal(normalizeWindow({ remaining: -1, unit: "次" }, "credits"), null);
  assert.equal(normalizeWindow({ remaining: 1, total: 0, unit: "次" }, "credits"), null);
  assert.equal(normalizeWindow({ remaining: 1, unit: "次" }, "credits").total, null);
  assert.equal(normalizeWindow({ remaining: 101, unit: "%" }, "h5"), null);
  const percent = normalizeWindow({ remaining: 40, unit: "次" }, "h5");
  assert.equal(percent.unit, "%");
  assert.equal(percent.total, 100);
  assert.equal(percent.remaining, 40);
});

test("a window without updatedAt cannot be displayed as current", () => {
  const doc = emptyState();
  doc.sources.x_premium.windows.h5 = { remaining: 1, unit: "次", updatedAt: null };
  const { state } = normalizeState(clone(doc));
  assert.equal(state.sources.x_premium.windows.h5, null);
});

test("auto source keeps a stored ok status", () => {
  const doc = emptyState();
  doc.sources.x_premium.status = "ok";
  doc.sources.x_premium.windows.week = w();
  const { state } = normalizeState(clone(doc));
  assert.equal(state.sources.x_premium.status, "ok");
  assert.equal(state.sources.x_premium.mode, "auto");
});

test("effective default window comes from meta.defaultWindow", () => {
  const state = emptyState();
  state.sources.volcengine.windows = { h5: w(), week: w(), month: w() };
  state.sources.volcengine.mainWindow = "month";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), { window: "month", reason: "main" });

  state.meta.defaultWindow.volcengine = "week";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), { window: "week", reason: "config" });

  state.meta.defaultWindow.volcengine = "month";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), { window: "month", reason: "config" });
});

test("effective default: auto + mainWindow picks it; auto + null reports main-missing", () => {
  const state = emptyState();
  state.sources.volcengine.windows = { h5: w(), week: w(), month: w() };
  state.meta.defaultWindow.volcengine = "auto";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), {
    window: null,
    reason: "main-missing",
  });
  state.sources.volcengine.mainWindow = "month";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), { window: "month", reason: "main" });
});

test("effective default: explicit window missing means window-missing", () => {
  const state = emptyState();
  state.meta.defaultWindow.volcengine = "week";
  assert.deepEqual(effectiveDefault("volcengine", state.sources.volcengine, state), {
    window: "week",
    reason: "window-missing",
  });
});

test("schemaVersion: current parses, a newer file is refused, v1 is refused", () => {
  const okDoc = emptyState();
  assert.equal(normalizeState(clone(okDoc)).state.schemaVersion, SCHEMA_VERSION);
  assert.equal(normalizeState(clone(okDoc)).migrated, false);

  const future = clone(okDoc);
  future.schemaVersion = SCHEMA_VERSION + 1;
  assert.throws(() => normalizeState(future), (e) => e.code === "UNKNOWN_VERSION");

  const ancient = clone(okDoc);
  ancient.schemaVersion = 1;
  assert.throws(() => normalizeState(ancient), (e) => e.code === "STALE_VERSION");
});

test("v2 state migrates and keeps declared windows, undeclared windows move to legacyWindows", () => {
  const updatedAt = "2026-11-05T11:00:00.000Z";
  const doc = {
    schemaVersion: 2,
    sources: {
      volcengine: {
        status: "ok",
        windows: {
          h5: { remaining: 98.88, total: 100, unit: "%", resetAt: null, updatedAt, window: "h5" },
          day: { remaining: 3, total: 10, unit: "次", updatedAt, window: "day" },
        },
      },
    },
    meta: { lastFetchAt: updatedAt, defaultWindow: { volcengine: "week" } },
  };
  const { state, migrated } = normalizeState(doc, NOW);
  assert.equal(migrated, true);
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.sources.volcengine.windows.h5.remaining, 98.88);
  assert.equal(state.sources.volcengine.windows.week, null);
  assert.equal(state.sources.volcengine.legacyWindows.day.remaining, 3);
  assert.equal(state.meta.defaultWindow.volcengine, "week");
  assert.equal(state.meta.lastFetchAt, updatedAt);
  assert.equal(state.meta.migratedFrom, 2);
});

test("a v2 document that is not a window record migrates without inventing numbers", () => {
  const legacy = {
    schemaVersion: 2,
    sources: { opencode: { quota: { remaining: 95, unit: "%", label: "5 小时" }, updatedAt: NOW.toISOString() } },
  };
  const { state, migrated } = normalizeState(legacy, NOW);
  assert.equal(migrated, true);
  assert.equal(state.sources.opencode_go.windows.h5, null);
});

test("corrupt documents are refused", () => {
  assert.throws(() => normalizeState({ sources: {} }), (e) => e.code === "CORRUPT");
  assert.throws(() => normalizeState({ schemaVersion: SCHEMA_VERSION }), (e) => e.code === "CORRUPT");
  assert.throws(() => normalizeState(null), (e) => e.code === "CORRUPT");
});

test("source aliases used by the CLI", () => {
  assert.equal(resolveSource("volcengine"), "volcengine");
  assert.equal(resolveSource("opencode-go"), "opencode_go");
  assert.equal(resolveSource("x-premium"), "x_premium");
  assert.equal(resolveSource("nope"), null);
});
