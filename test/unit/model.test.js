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

test("windows are independent: one stale does not age another", () => {
  const doc = emptyState();
  doc.sources.volcengine.windows.h5 = w({ updatedAt: "2026-11-05T11:30:00.000Z" });
  doc.sources.volcengine.windows.week = w({ updatedAt: "2026-11-04T11:00:00.000Z" });
  doc.sources.volcengine.windows.month = w({ updatedAt: "2026-11-02T11:00:00.000Z" });
  const { state } = normalizeState(clone(doc));
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.h5, NOW), "ok");
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.week, NOW), "stale");
  assert.equal(deriveWindowStatus(state.sources.volcengine.windows.month, NOW), "expired");
});

test("normalizeWindow refuses zero-unit, negative remaining and bad total", () => {
  assert.equal(normalizeWindow({ remaining: 1, unit: "" }, "h5"), null);
  assert.equal(normalizeWindow({ remaining: -1, unit: "次" }, "h5"), null);
  assert.equal(normalizeWindow({ remaining: 1, total: 0, unit: "次" }, "h5"), null);
  assert.equal(normalizeWindow({ remaining: 1, unit: "次" }, "h5").total, null);
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

test("strict schemaVersion: current parses, current+1 and current-1 are refused", () => {
  const okDoc = emptyState();
  assert.equal(normalizeState(clone(okDoc)).state.schemaVersion, SCHEMA_VERSION);

  const future = clone(okDoc);
  future.schemaVersion = SCHEMA_VERSION + 1;
  assert.throws(() => normalizeState(future), (e) => e.code === "UNKNOWN_VERSION");

  const old = clone(okDoc);
  old.schemaVersion = SCHEMA_VERSION - 1;
  assert.throws(() => normalizeState(old), (e) => e.code === "STALE_VERSION");
});

test("no implicit migration: a legacy v2 quota/extras document is refused, not converted", () => {
  const legacy = {
    schemaVersion: 2,
    sources: { opencode: { quota: { remaining: 95, unit: "%", label: "5 小时" }, updatedAt: NOW.toISOString() } },
  };
  if (SCHEMA_VERSION === 2) {
    // same number, different shape: it parses but yields no windows rather than migrating
    const { state } = normalizeState(legacy);
    assert.equal(state.sources.opencode_go.windows.h5, null);
  } else {
    assert.throws(() => normalizeState(legacy), (e) => ["STALE_VERSION", "UNKNOWN_VERSION"].includes(e.code));
  }
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
