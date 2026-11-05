import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOpenCode, durationToMs, isSignedOut } from "../../src/parsers/opencode.js";

const goPage = readFileSync(new URL("../fixtures/opencode-go-page.txt", import.meta.url), "utf8");
const activityPage = readFileSync(new URL("../fixtures/opencode-activity-page.txt", import.meta.url), "utf8");
const NOW = new Date("2026-11-05T09:00:00.000Z");

test("real workspace /go page: three windows as percent", () => {
  const r = parseOpenCode(goPage, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.windows).sort(), ["h5", "month", "week"]);
  assert.equal(r.mainWindow, "h5");
  for (const k of ["h5", "week", "month"]) {
    assert.equal(r.windows[k].unit, "%");
    assert.equal(r.windows[k].total, 100);
    assert.ok(r.windows[k].remaining > 0 && r.windows[k].remaining <= 100);
    assert.ok(r.windows[k].resetAt, `${k} resetAt`);
  }
});

test("5h resetAt derives from 'Resets in …' relative to now", () => {
  const r = parseOpenCode(goPage, NOW);
  const delta = Date.parse(r.windows.h5.resetAt) - NOW.getTime();
  assert.ok(delta > 30 * 60 * 1000 && delta < 4 * 3600 * 1000, `delta=${delta}`);
});

test("activity page variant: 'Rolling' is the 5-hour window", () => {
  const r = parseOpenCode(activityPage, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.windows).sort(), ["h5", "month", "week"]);
  assert.equal(r.mainWindow, "h5");
});

test("signed-out marketing page is not_logged_in, not a number", () => {
  const r = parseOpenCode("CONSOLE\nMODELS\nGO\nSIGN IN\nGET STARTED\nGo is a subscription…", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_logged_in");
});

test("page without window labels is parse_failed", () => {
  const r = parseOpenCode("Activity\nMy usage\nUsage\nLogs\nAudit\n", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "parse_failed");
});

test("only the 5-hour window present => windows has exactly one key (merge keeps the rest)", () => {
  const r = parseOpenCode("5-hour window\n11% used\n\nResets in 1h 5m\n", NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.windows), ["h5"]);
  assert.equal(r.windows.h5.remaining, 89);
});

test("model-share percentages are not read as quota", () => {
  const r = parseOpenCode(goPage, NOW);
  for (const k of Object.keys(r.windows)) {
    assert.notEqual(r.windows[k].remaining, 100, "100% used model-share must not leak");
  }
});

test("durationToMs handles d/h/m", () => {
  assert.equal(durationToMs("2h 49m"), 169 * 60000);
  assert.equal(durationToMs("3d 15h"), 87 * 3600000);
});

test("isSignedOut is false on a real signed-in capture", () => {
  assert.equal(isSignedOut(goPage), false);
});
