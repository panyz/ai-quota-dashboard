// Zhipu GLM Coding Plan quota. data.limits[] carries TOKENS_LIMIT / TIME_LIMIT.
// usage is the window total, percentage is percent already used, nextResetTime is epoch milliseconds.

import { countWindow, remainingPercent, resetFrom } from "./api-window.js";

const UNIT_MS = { 1: 86400000, 3: 3600000, 5: 60000, 6: 7 * 86400000 };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function windowKey(entry) {
  const unit = UNIT_MS[entry?.unit];
  if (!unit || typeof entry.number !== "number" || entry.number <= 0) return null;
  const ms = unit * entry.number;
  if (ms <= 6 * 3600000) return "h5";
  if (ms <= 8 * 86400000) return "week";
  return null;
}

export function parseZhipu(payload) {
  const limits = payload?.data?.limits;
  if (!Array.isArray(limits)) {
    return { ok: false, code: "parse_failed", message: "智谱额度响应缺少 data.limits" };
  }
  const windows = {};
  for (const entry of limits) {
    if (!entry || (entry.type !== "TOKENS_LIMIT" && entry.type !== "TIME_LIMIT")) continue;
    const key = windowKey(entry);
    if (!key || windows[key]) continue;
    const total = num(entry.usage);
    const current = num(entry.currentValue);
    const remaining = num(entry.remaining) ?? (total !== null && current !== null ? total - current : null);
    let win = countWindow(remaining, total, "积分");
    if (!win) {
      const percent = remainingPercent(entry.percentage);
      if (percent) win = percent;
    }
    if (!win) continue;
    win.resetAt = resetFrom(entry.nextResetTime);
    windows[key] = win;
  }
  if (!Object.keys(windows).length) {
    return { ok: false, code: "parse_failed", message: "智谱额度响应没有可用的积分窗口" };
  }
  return {
    ok: true,
    windows,
    mainWindow: windows.h5 ? "h5" : "week",
    adapterVersion: "zhipu-v1",
  };
}
