import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVolcengine } from "../../src/parsers/volcengine.js";

const signedOut = readFileSync(new URL("../fixtures/volc-signed-out.txt", import.meta.url), "utf8");

test("signed-out console => not_logged_in (real capture)", () => {
  const r = parseVolcengine(signedOut);
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_logged_in");
});

test("unrecognised logged-in layout => parse_failed, never a guessed number", () => {
  const r = parseVolcengine("开通管理\n订阅\nAgent/Coding Plan\n我的套餐\nLite\n有效期至 2026-12-01");
  assert.equal(r.ok, false);
  assert.equal(r.code, "parse_failed");
});

test("a single percentage is refused (cannot confirm the window)", () => {
  const r = parseVolcengine("订阅\n5 小时限额\n已用 62%");
  assert.equal(r.ok, false);
  assert.equal(r.code, "parse_failed");
});

test("fraction layout is parsed when labels are present (unverified shape)", () => {
  const text = ["订阅", "5 小时限额", "剩余 120 / 500", "重置 2026-12-01 09:00", "周限额", "剩余 80%"].join("\n");
  const r = parseVolcengine(text);
  assert.equal(r.ok, true);
  assert.equal(r.windows.h5.remaining, 120);
  assert.equal(r.windows.h5.total, 500);
  assert.equal(r.windows.h5.unit, "次");
  assert.equal(r.windows.h5.resetAt, "2026-12-01T01:00:00.000Z");
  assert.equal(r.windows.week.unit, "%");
});

test("mainWindow stays null while the real layout is unverified", () => {
  const text = ["5 小时限额", "剩余 10 / 100", "周限额", "剩余 5 / 20"].join("\n");
  const r = parseVolcengine(text);
  assert.equal(r.ok, true);
  assert.equal(r.mainWindow, null);
});
