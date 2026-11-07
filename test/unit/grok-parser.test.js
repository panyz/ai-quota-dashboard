import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGrok, readUsedPercent, parseResetAt, isSignedOut } from "../../src/parsers/grok.js";

const usage = readFileSync(new URL("../fixtures/grok-dashboard-usage.txt", import.meta.url), "utf8");
const overview = readFileSync(new URL("../fixtures/grok-dashboard-overview.txt", import.meta.url), "utf8");
const NOW = new Date("2026-11-07T12:00:00.000Z");

test("usage page: weekly used% becomes remaining%, month/h5 not invented", () => {
  const r = parseGrok(usage, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.windows), ["week"]);
  assert.equal(r.windows.week.remaining, 31);
  assert.equal(r.windows.week.total, 100);
  assert.equal(r.windows.week.unit, "%");
  assert.equal(r.windows.week.resetAt, "2026-11-10T00:00:00.000Z");
  assert.equal(r.mainWindow, "week");
  assert.equal(r.adapterVersion, "grok-v1");
});

test("overview layout: percent sits above the Weekly included usage label", () => {
  const r = parseGrok(overview, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.windows.week.remaining, 31);
  assert.equal(r.windows.week.resetAt, "2026-11-10T00:00:00.000Z");
});

test("monthly additional reset is not used as the weekly reset", () => {
  const r = parseGrok(usage, NOW);
  assert.notEqual(r.windows.week.resetAt, "2026-12-01T00:00:00.000Z");
});

test("inline 12.5% used", () => {
  const r = parseGrok("Weekly included usage\n12.5% used\nResets in 2d 4h\n", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.windows.week.remaining, 87.5);
});

test("signed-out marketing page is not_logged_in", () => {
  const r = parseGrok("Grok\nSign in\nContinue with Google\n", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_logged_in");
  assert.equal(isSignedOut("跳至主要内容"), true);
});

test("logged-in page without weekly label is parse_failed, not a guess", () => {
  const r = parseGrok("Overview\nCloud Agents\nWelcome\nPremium\n", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "parse_failed");
});

test("readUsedPercent ignores a bare percent without used", () => {
  assert.equal(readUsedPercent(["Upgrade", "50%", "Weekly included usage"]), null);
});

test("parseResetAt drops dates already in the past", () => {
  assert.equal(parseResetAt("Resets Nov 1", NOW), null);
  assert.equal(parseResetAt("Resets Nov 10", NOW), "2026-11-10T00:00:00.000Z");
});
