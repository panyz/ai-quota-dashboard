// Claude Pro/Max usage. Accepts the OAuth usage payload and the Claude Code statusline shape.
// utilization / used_percentage are percent already consumed. A value in (0, 1) is a fraction.

import { remainingPercent, resetFrom } from "./api-window.js";

const BUCKETS = [
  ["five_hour", "h5"],
  ["seven_day", "week"],
  ["seven_day_sonnet", "sonnet"],
  ["seven_day_opus", "opus"],
];

export function parseClaude(payload) {
  const root = payload?.rate_limits && typeof payload.rate_limits === "object" ? payload.rate_limits : payload;
  const windows = {};
  for (const [from, key] of BUCKETS) {
    const raw = root?.[from];
    if (!raw || typeof raw !== "object") continue;
    const win = remainingPercent(raw.used_percentage ?? raw.utilization);
    if (!win) continue;
    win.resetAt = resetFrom(raw.resets_at);
    windows[key] = win;
  }
  if (!Object.keys(windows).length) {
    return { ok: false, code: "parse_failed", message: "Claude 额度响应里没有 5 小时或 7 天窗口" };
  }
  return {
    ok: true,
    windows,
    mainWindow: windows.h5 ? "h5" : "week",
    adapterVersion: "claude-v1",
  };
}
