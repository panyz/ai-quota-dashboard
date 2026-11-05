// Display formatting shared by CLI and the local dashboard.
import { SOURCE_STATUS_LABELS, WINDOW_STATUS_LABELS, WINDOW_LABELS, lowBadge } from "./model.js";

export function fmtNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(rounded).split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!frac) return withSep;
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${withSep}.${trimmed}` : withSep;
}

/** "25 次" / "40%" / "$12.5" */
export function fmtAmount(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (unit === "%") return `${fmtNumber(value)}%`;
  if (["$", "¥", "€", "£"].includes(unit)) return `${unit}${fmtNumber(value)}`;
  return unit ? `${fmtNumber(value)} ${unit}` : fmtNumber(value);
}

export function fmtRemaining(w) {
  return w ? fmtAmount(w.remaining, w.unit) : "未提供";
}

export function fmtTotal(w) {
  if (!w || typeof w.total !== "number" || w.total <= 0) return null;
  return fmtAmount(w.total, w.unit);
}

export function fmtRelative(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = Math.max(0, now.getTime() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function fmtCountdown(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = t - now.getTime();
  if (diff <= 0) return "已重置";
  const min = Math.round(diff / 60000);
  if (min < 60) return `${Math.max(1, min)} 分钟后`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小时后`;
  return `${Math.round(h / 24)} 天后`;
}

export function fmtLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One row's reset text: never invents a time. */
export function fmtReset(w, now = new Date()) {
  if (!w) return "重置时间未填";
  if (!w.resetAt) return "重置时间未填";
  const local = fmtLocal(w.resetAt);
  const countdown = fmtCountdown(w.resetAt, now);
  if (countdown === "已重置") return "周期已重置，当前值待更新";
  return `重置 ${local}（${countdown}）`;
}

export function windowLabel(key) {
  return WINDOW_LABELS[key] ?? key;
}

export function windowStatusText(status) {
  return WINDOW_STATUS_LABELS[status] ?? status;
}

export function sourceStatusText(status) {
  return SOURCE_STATUS_LABELS[status] ?? status;
}

export function badgeText(badge) {
  if (badge === "low") return "偏低";
  if (badge === "used_up") return "已用完";
  return null;
}

export { lowBadge };
