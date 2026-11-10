// Shared conversions for official and first-party quota JSON. No network.

const round2 = (n) => Math.round(n * 100) / 100;

/** Unix seconds, unix milliseconds, or an ISO timestamp. */
export function resetFrom(value) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

/**
 * Turn a "percent used" figure into a remaining percent window.
 * Values in (0, 1) are fractions (0.42 → 42). 1 and above are already percents.
 */
export function remainingPercent(used) {
  const n = typeof used === "string" && used.trim() ? Number(used) : used;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  const percent = n > 0 && n < 1 ? n * 100 : n;
  if (percent > 100) return null;
  return { remaining: round2(100 - percent), total: 100, unit: "%", resetAt: null };
}

export function countWindow(remaining, total, unit) {
  if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < 0) return null;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0 || remaining > total) return null;
  return { remaining, total, unit, resetAt: null };
}
