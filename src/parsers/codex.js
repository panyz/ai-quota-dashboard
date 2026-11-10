// ChatGPT / Codex subscription usage from wham/usage.
// used_percent is percent already consumed. The window length comes from limit_window_seconds,
// not from which of primary_window / secondary_window it was.

import { remainingPercent, resetFrom } from "./api-window.js";

function one(win) {
  if (!win || typeof win !== "object") return null;
  const parsed = remainingPercent(win.used_percent);
  if (!parsed) return null;
  parsed.resetAt = resetFrom(win.reset_at);
  const seconds = win.limit_window_seconds;
  const key = seconds === 18000 ? "h5" : seconds === 604800 ? "week" : null;
  return key ? [key, parsed] : null;
}

export function parseCodex(payload) {
  const rate = payload?.rate_limit;
  const windows = {};
  for (const slot of [rate?.primary_window, rate?.secondary_window]) {
    const pair = one(slot);
    if (!pair || windows[pair[0]]) continue;
    windows[pair[0]] = pair[1];
  }
  if (!Object.keys(windows).length) {
    return { ok: false, code: "parse_failed", message: "Codex 额度响应里没有 5 小时或每周窗口" };
  }
  return {
    ok: true,
    windows,
    mainWindow: windows.h5 ? "h5" : "week",
    adapterVersion: "codex-v1",
  };
}
