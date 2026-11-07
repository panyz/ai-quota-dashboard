// grok.com/dashboard usage parser. Input: document.body.innerText of Overview or /usage.
// The product only exposes a weekly used% (not remaining counts). remaining = 100 - used.

const WEEKLY = ["weekly included usage", "weekly supergrok limit", "weekly usage", "weekly limit"];
const STOP = ["account balance", "monthly additional usage", "usage resets", "tokens per day"];
const SIGNED_OUT = /sign in|log in|continue with|create account|跳至主要内容/i;

const MONTHS = Object.freeze({
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
});

export function isSignedOut(text) {
  const t = text || "";
  if (WEEKLY.some((n) => t.toLowerCase().includes(n))) return false;
  return SIGNED_OUT.test(t);
}

function lines(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const round2 = (n) => Math.round(n * 100) / 100;

function weeklyIndex(all) {
  for (let i = 0; i < all.length; i++) {
    const lower = all[i].toLowerCase();
    if (WEEKLY.some((n) => lower.includes(n))) return i;
  }
  return -1;
}

function weeklyBlock(all, i) {
  let start = Math.max(0, i - 8);
  let end = Math.min(all.length, i + 10);
  for (let j = i + 1; j < end; j++) {
    const lower = all[j].toLowerCase();
    if (STOP.some((n) => lower.includes(n))) {
      end = j;
      break;
    }
  }
  return all.slice(start, end);
}

/** Used percent: "69%" + next line "used", or "69% used" on one line. */
export function readUsedPercent(block) {
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const inline = line.match(/^(\d+(?:\.\d+)?)\s*%\s*used$/i);
    if (inline) return Number(inline[1]);
    const standalone = line.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (standalone && /^used$/i.test(block[i + 1] || "")) return Number(standalone[1]);
  }
  return null;
}

const RESET_REL = /Resets?\s+in\s+([0-9]+(?:\s*[dhms])+)/i;
const RESET_CAL = /Resets?\s+([A-Za-z]{3})\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:,?\s*(\d{1,2}):(\d{2}))?/i;

export function durationToMs(raw) {
  const re = /(\d+)\s*([dhms])/gi;
  let total = 0;
  let m;
  while ((m = re.exec(raw))) {
    const n = Number(m[1]);
    total += n * { d: 86400000, h: 3600000, m: 60000, s: 1000 }[m[2].toLowerCase()];
  }
  return total;
}

/** Calendar "Resets Nov 10" is UTC midnight; past dates are dropped, not guessed. */
export function parseResetAt(text, now) {
  const rel = String(text).match(RESET_REL);
  if (rel) return new Date(now.getTime() + durationToMs(rel[1])).toISOString();
  const cal = String(text).match(RESET_CAL);
  if (!cal) return null;
  const month = MONTHS[cal[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(cal[2]);
  const year = cal[3] ? Number(cal[3]) : now.getUTCFullYear();
  const hour = cal[4] !== undefined ? Number(cal[4]) : 0;
  const min = cal[5] !== undefined ? Number(cal[5]) : 0;
  const at = Date.UTC(year, month, day, hour, min);
  if (!Number.isFinite(at) || at <= now.getTime()) return null;
  return new Date(at).toISOString();
}

/**
 * @param {string} text
 * @param {Date} now
 * @returns {{ok:true, windows:Record<string,any>, mainWindow:string, adapterVersion:string}
 *          | {ok:false, code:string, message:string}}
 */
export function parseGrok(text, now = new Date()) {
  if (isSignedOut(text)) {
    return { ok: false, code: "not_logged_in", message: "Grok Dashboard 未登录" };
  }
  const all = lines(text);
  const i = weeklyIndex(all);
  if (i < 0) {
    return { ok: false, code: "parse_failed", message: "Grok Usage 页未找到周额度（页面结构可能已变化，请跑 quota probe --source x-premium --json）" };
  }
  const block = weeklyBlock(all, i);
  const used = readUsedPercent(block);
  if (used === null || used < 0 || used > 100) {
    return { ok: false, code: "parse_failed", message: "Grok Usage 页未识别已用百分比（页面结构可能已变化）" };
  }
  return {
    ok: true,
    windows: {
      week: {
        remaining: round2(100 - used),
        total: 100,
        unit: "%",
        resetAt: parseResetAt(block.join("\n"), now),
        updatedAt: null,
      },
    },
    mainWindow: "week",
    adapterVersion: "grok-v1",
  };
}
