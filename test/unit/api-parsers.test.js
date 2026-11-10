import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaude } from "../../src/parsers/claude.js";
import { parseZhipu } from "../../src/parsers/zhipu.js";
import { parseDeepseek } from "../../src/parsers/deepseek.js";
import { parseAlibaba } from "../../src/parsers/alibaba.js";
import { parseCodex } from "../../src/parsers/codex.js";
import { loadSecret } from "../../src/api.js";
import { registry } from "../../src/model.js";

const NOW = new Date("2026-11-10T00:00:00.000Z");

test("claude oauth usage: utilization is percent used, resets_at is kept, missing opus is absent", () => {
  const parsed = parseClaude({
    five_hour: { utilization: 12.5, resets_at: "2026-11-10T05:00:00.000Z" },
    seven_day: { utilization: 40, resets_at: "2026-11-16T00:00:00.000Z" },
    seven_day_opus: null,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.windows.h5.remaining, 87.5);
  assert.equal(parsed.windows.week.remaining, 60);
  assert.equal(parsed.windows.h5.unit, "%");
  assert.equal(parsed.windows.h5.resetAt, "2026-11-10T05:00:00.000Z");
  assert.equal(parsed.windows.opus, undefined);
  assert.equal(parsed.mainWindow, "h5");
});

test("claude statusline fractions and a sub-one utilization are not dropped", () => {
  const parsed = parseClaude({
    rate_limits: {
      five_hour: { used_percentage: 0, resets_at: 1762732800 },
      seven_day: { utilization: 0.42, resets_at: 1762732800 },
    },
  });
  assert.equal(parsed.windows.h5.remaining, 100);
  assert.equal(parsed.windows.week.remaining, 58);
  assert.ok(parsed.windows.h5.resetAt);
});

test("zhipu keeps point counters and epoch-millisecond resets", () => {
  const parsed = parseZhipu({
    data: {
      planName: "Pro",
      limits: [
        { type: "TOKENS_LIMIT", unit: 3, number: 5, usage: 2000, remaining: 800, percentage: 60, nextResetTime: 1762732800000 },
        { type: "TOKENS_LIMIT", unit: 6, number: 1, usage: 10000, currentValue: 4000, percentage: 40, nextResetTime: 1763337600000 },
      ],
    },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.windows.h5.remaining, 800);
  assert.equal(parsed.windows.h5.total, 2000);
  assert.equal(parsed.windows.h5.unit, "积分");
  assert.equal(parsed.windows.week.remaining, 6000);
  assert.equal(parsed.windows.week.total, 10000);
});

test("deepseek balance is a currency amount with no reset", () => {
  const parsed = parseDeepseek({
    is_available: true,
    balance_infos: [
      { currency: "USD", total_balance: "1.50", granted_balance: "0", topped_up_balance: "1.50" },
      { currency: "CNY", total_balance: "12.50", granted_balance: "2.00", topped_up_balance: "10.50" },
    ],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.windows.balance.remaining, 12.5);
  assert.equal(parsed.windows.balance.total, null);
  assert.equal(parsed.windows.balance.unit, "¥");
  assert.equal(parsed.windows.balance.resetAt, null);
  assert.equal(registry.get("deepseek").windows[0].periodMs, null);
});

test("alibaba counters become remaining counts and a plan without counters fails", () => {
  const parsed = parseAlibaba({
    data: {
      codingPlanQuotaInfo: {
        per5HourUsedQuota: 20,
        per5HourTotalQuota: 100,
        per5HourQuotaNextRefreshTime: "2026-11-10T05:00:00.000Z",
        perWeekUsedQuota: 100,
        perWeekTotalQuota: 500,
        perWeekQuotaNextRefreshTime: 1763337600000,
        perBillMonthUsedQuota: "100",
        perBillMonthTotalQuota: "2000",
        perBillMonthQuotaNextRefreshTime: 1765324800,
      },
    },
  });
  assert.equal(parsed.windows.h5.remaining, 80);
  assert.equal(parsed.windows.week.remaining, 400);
  assert.equal(parsed.windows.month.remaining, 1900);
  assert.equal(parsed.windows.h5.unit, "次");
  assert.equal(parseAlibaba({ data: { codingPlanInstanceInfos: [{ planName: "Pro" }] } }).ok, false);
});

test("codex maps windows by duration, and a weekly-only plan does not invent a 5-hour window", () => {
  const parsed = parseCodex({
    plan_type: "plus",
    rate_limit: {
      primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 1762732800 },
      secondary_window: { used_percent: 40, limit_window_seconds: 604800, reset_at: 1763337600 },
    },
  });
  assert.equal(parsed.windows.h5.remaining, 75);
  assert.equal(parsed.windows.week.remaining, 60);
  const team = parseCodex({
    rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 604800, reset_at: 1763337600 }, secondary_window: null },
  });
  assert.equal(team.windows.h5, undefined);
  assert.equal(team.windows.week.remaining, 90);
  assert.equal(NOW.getTime() > 0, true);
});

test("a missing API credential is reported without reading a token aloud", () => {
  const secret = loadSecret(registry.get("deepseek").auth, {});
  assert.equal(secret, null);
  const found = loadSecret(registry.get("deepseek").auth, { DEEPSEEK_API_KEY: "sk-test" });
  assert.equal(found.token, "sk-test");
});
