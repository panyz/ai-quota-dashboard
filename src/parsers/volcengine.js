// Volcengine Coding Plan console parser.
//
// Verified layout (2026-11-07, Coding Plan Lite):
//   近5小时用量 / 4小时54分后重置 / 1.12 / % / 0% 50% 100%
//   近一周用量 / 1天8小时后重置 / 0.41 / % / 0% 50% 100%
//   近一月用量 / 4天8小时后重置 / 18.41 / % / 0% 50% 100%
//
// The page shows PERCENT USED, not remaining: remaining = 100 - used, total = 100, unit = "%".
// The 0%/50%/100% scale labels are not values: each carries its own "%" sign, either on one
// line ("0% 50% 100%") or on three ("0%", "50%", "100%"). The used value is a bare number with
// "%" on the next line, so a bare 0/50/100 in that slot is a real value.
// Anything unrecognised is parse_failed — never a guess.

const SIGNED_OUT = [/立即登录使用/, /^登录$/m];

const WINDOWS = [
  {
    key: "h5",
    needles: ["近5小时用量", "近 5 小时用量", "5小时用量", "5 小时用量", "5小时限额", "5 小时限额"],
  },
  { key: "week", needles: ["近一周用量", "近 1 周用量", "周限额", "本周", "每周"] },
  { key: "month", needles: ["近一月用量", "近 1 月用量", "月限额", "本月", "每月"] },
];

export function isSignedOut(text) {
  return SIGNED_OUT.some((re) => re.test(text || ""));
}

function lines(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const num = (raw) => {
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** "4小时54分" / "1天8小时" -> ms */
export function durationToMs(raw) {
  const re = /(\d+)\s*(天|小时|时|分钟|分|秒)/g;
  let total = 0;
  let m;
  while ((m = re.exec(raw))) {
    const n = Number(m[1]);
    total += n * { 天: 86400000, 小时: 3600000, 时: 3600000, 分钟: 60000, 分: 60000, 秒: 1000 }[m[2]];
  }
  return total;
}

const RESET_TEXT = /([0-9]+\s*(?:天|小时|时|分钟|分|秒)(?:\s*[0-9]+\s*(?:天|小时|时|分钟|分|秒))*)\s*后重置/;
const SCALE = new Set(["0", "50", "100"]);

/**
 * Percentage used inside one window block. The value is a bare number with "%"
 * on the next line, or inline. Scale labels always carry their own "%" sign
 * ("0%", "50%", "100%"), so a bare 0/50/100 in the value slot is a genuine
 * percentage (e.g. an exhausted window rendering "100" + "%").
 * @param {string[]} block
 * @returns {number|null}
 */
export function readUsedPercent(block) {
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    if (line.includes("剩余")) continue; // a "remaining …%" line is not a used percentage
    const standalone = line.match(/^(\d+(?:\.\d+)?)$/);
    if (standalone && block[i + 1] === "%") return Number(standalone[1]);
    // "1.12 %" on one line, or "… 1.12%" (but not the "0% 50% 100%" ruler)
    if (line.includes("0%") && line.includes("100%")) continue;
    const inline = line.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (inline && !SCALE.has(inline[1])) return Number(inline[1]);
  }
  // last resort: an inline percentage inside a sentence that is not the ruler
  for (const line of block) {
    if (line.includes("0%") && line.includes("100%")) continue;
    if (line.includes("剩余")) continue;
    const m = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m && !SCALE.has(m[1])) return Number(m[1]);
  }
  return null;
}

/** Read one window near its label; returns null when the block has no usable number. */
function readWindow(all, needles, now) {
  for (let i = 0; i < all.length; i++) {
    if (!needles.some((n) => all[i].includes(n))) continue;
    // Stop at the next window label so one card's number never leaks into another.
    let end = Math.min(all.length, i + 8);
    for (let j = i + 1; j < end; j++) {
      if (WINDOWS.some((w) => w.needles.some((n) => all[j].includes(n)))) {
        end = j;
        break;
      }
    }
    const block = all.slice(i, end);
    const text = block.join(" · ");
    const reset = text.match(RESET_TEXT);
    const resetAt = reset ? new Date(now.getTime() + durationToMs(reset[1])).toISOString() : null;

    const used = readUsedPercent(block);
    if (used !== null && used >= 0 && used <= 100) {
      return { remaining: round2(100 - used), total: 100, unit: "%", resetAt };
    }

    // Legacy/other layout: "剩余 120 / 500" pairs.
    const frac = text.match(/(\d[\d,]*(?:\.\d+)?)\s*\/\s*(\d[\d,]*(?:\.\d+)?)/);
    if (frac) {
      const remaining = num(frac[1]);
      const total = num(frac[2]);
      if (remaining !== null && total !== null && total > 0) {
        return { remaining, total, unit: "次", resetAt };
      }
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {Date} now
 * @returns {{ok:true, windows:Record<string,any>, mainWindow:string|null, adapterVersion:string}
 *          | {ok:false, code:string, message:string}}
 */
export function parseVolcengine(text, now = new Date()) {
  if (isSignedOut(text)) {
    return { ok: false, code: "not_logged_in", message: "火山方舟控制台未登录" };
  }
  const all = lines(text);
  const windows = {};
  for (const w of WINDOWS) {
    const hit = readWindow(all, w.needles, now);
    if (hit) windows[w.key] = { ...hit, updatedAt: null };
  }
  const keys = Object.keys(windows);
  if (!keys.length) {
    return {
      ok: false,
      code: "parse_failed",
      message: "火山订阅页额度文案未识别（页面结构可能已变化，请跑 quota probe --source volcengine --json）",
    };
  }
  return { ok: true, windows, mainWindow: windows.h5 ? "h5" : null, adapterVersion: "volc-v2" };
}
