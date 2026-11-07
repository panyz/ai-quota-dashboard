import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVolcengine, durationToMs, readUsedPercent } from "../../src/parsers/volcengine.js";

const subscribe = readFileSync(new URL("../fixtures/volc-subscribe.txt", import.meta.url), "utf8");
const signedOut = readFileSync(new URL("../fixtures/volc-signed-out.txt", import.meta.url), "utf8");
const NOW = new Date("2026-11-07T12:00:00.000Z");

test("real subscription page: three windows, used% converted to remaining%", () => {
  const r = parseVolcengine(subscribe, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.windows).sort(), ["h5", "month", "week"]);

  assert.equal(r.windows.h5.remaining, 98.88); // 100 - 1.12
  assert.equal(r.windows.week.remaining, 99.59); // 100 - 0.41
  assert.equal(r.windows.month.remaining, 81.59); // 100 - 18.41

  for (const k of ["h5", "week", "month"]) {
    assert.equal(r.windows[k].total, 100);
    assert.equal(r.windows[k].unit, "%");
    assert.equal(r.windows[k].updatedAt, null, "updatedAt is stamped by the fetch layer");
  }
});

test("first card (5h) is the main window", () => {
  const r = parseVolcengine(subscribe, NOW);
  assert.equal(r.mainWindow, "h5");
  assert.equal(r.adapterVersion, "volc-v2");
});

test("reset countdowns become absolute resetAt", () => {
  const r = parseVolcengine(subscribe, NOW);
  const at = (k) => Date.parse(r.windows[k].resetAt) - NOW.getTime();
  assert.equal(at("h5"), (4 * 3600 + 54 * 60) * 1000);
  assert.equal(at("week"), (24 + 8) * 3600 * 1000);
  assert.equal(at("month"), (4 * 24 + 8) * 3600 * 1000);
});

test("the 0%/50%/100% ruler is never read as a value", () => {
  const block = ["0% 50% 100%", "0% 50% 100%"];
  assert.equal(readUsedPercent(block), null);
  const r = parseVolcengine(subscribe, NOW);
  for (const k of ["h5", "week", "month"]) {
    assert.ok(![0, 50, 100].includes(r.windows[k].remaining), `${k} leaked a scale label`);
  }
});

test("only one window present is parsed (fetch layer marks partial)", () => {
  const text = ["我的订阅", "近5小时用量", "2小时后重置", "12.5", "%", "0% 50% 100%"].join("\n");
  const r = parseVolcengine(text, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.windows), ["h5"]);
  assert.equal(r.windows.h5.remaining, 87.5);
});

test("two windows present: still ok, missing one is not invented", () => {
  const text = [
    "近5小时用量",
    "4小时54分后重置",
    "1.12",
    "%",
    "0% 50% 100%",
    "近一周用量",
    "1天8小时后重置",
    "0.41",
    "%",
    "0% 50% 100%",
  ].join("\n");
  const r = parseVolcengine(text, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.windows).sort(), ["h5", "week"]);
  assert.equal(r.windows.h5.remaining, 98.88);
});

test("signed-out console => not_logged_in (real capture)", () => {
  const r = parseVolcengine(signedOut, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_logged_in");
});

test("unrecognised logged-in layout => parse_failed, never a guessed number", () => {
  const r = parseVolcengine("开通管理\n订阅\nAgent/Coding Plan\n我的套餐\nLite\n有效期至 2026-12-01", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "parse_failed");
});

test("legacy fraction layout still parses when labels are present", () => {
  const text = ["订阅", "5 小时限额", "剩余 120 / 500", "重置 2026-12-01 09:00", "周限额", "剩余 80%"].join("\n");
  const r = parseVolcengine(text, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.windows.h5.remaining, 120);
  assert.equal(r.windows.h5.total, 500);
  assert.equal(r.windows.h5.unit, "次");
});

test("durationToMs handles Chinese units", () => {
  assert.equal(durationToMs("4小时54分"), (4 * 3600 + 54 * 60) * 1000);
  assert.equal(durationToMs("1天8小时"), (24 + 8) * 3600 * 1000);
  assert.equal(durationToMs("30分钟"), 30 * 60 * 1000);
});
