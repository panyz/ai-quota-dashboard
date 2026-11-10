// Alibaba Bailian Coding Plan. Counters are used/total, not percents.
// A plan with no counters is a parse failure rather than a made-up 0.

import { countWindow, resetFrom } from "./api-window.js";

const SPECS = [
  ["h5", "per5HourUsedQuota", "per5HourTotalQuota", "per5HourQuotaNextRefreshTime"],
  ["week", "perWeekUsedQuota", "perWeekTotalQuota", "perWeekQuotaNextRefreshTime"],
  ["month", "perBillMonthUsedQuota", "perBillMonthTotalQuota", "perBillMonthQuotaNextRefreshTime"],
];

function findQuota(node, seen) {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  if (node.codingPlanQuotaInfo && typeof node.codingPlanQuotaInfo === "object") return node.codingPlanQuotaInfo;
  if ("per5HourTotalQuota" in node || "perWeekTotalQuota" in node || "perBillMonthTotalQuota" in node) return node;
  for (const value of Object.values(node)) {
    const found = findQuota(value, seen);
    if (found) return found;
  }
  return null;
}

const num = (v) => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function parseAlibaba(payload) {
  const quota = findQuota(payload, new Set());
  if (!quota) return { ok: false, code: "parse_failed", message: "百炼响应里没有 Coding Plan 额度" };
  const windows = {};
  for (const [key, usedKey, totalKey, resetKey] of SPECS) {
    const used = num(quota[usedKey]);
    const total = num(quota[totalKey]);
    if (used === null || total === null) continue;
    const win = countWindow(total - used, total, "次");
    if (!win) continue;
    win.resetAt = resetFrom(quota[resetKey]);
    windows[key] = win;
  }
  if (!Object.keys(windows).length) {
    return { ok: false, code: "parse_failed", message: "百炼套餐没有可用的用量计数" };
  }
  return {
    ok: true,
    windows,
    mainWindow: windows.h5 ? "h5" : Object.keys(windows)[0],
    adapterVersion: "alibaba-v1",
  };
}
