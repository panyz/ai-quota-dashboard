// Volcengine Coding Plan console parser.
//
// Status: layout UNVERIFIED (console was signed out during the spike). Only the signed-out
// branch is fixture-backed. The rest is a conservative text scan; it never guesses, and a
// single unlabeled percentage is refused. Re-check with `quota probe volcengine` after login.

const SIGNED_OUT = [/立即登录使用/, /^登录$/m];

const WINDOWS = [
  { key: "h5", needles: ["5 小时", "5小时", "5 小时限额", "5小时限额"] },
  { key: "week", needles: ["周限额", "本周", "每周"] },
  { key: "month", needles: ["月限额", "本月", "每月"] },
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

function coerceDate(raw) {
  const s = raw.replace(/\//g, "-").replace(" ", "T");
  if (!/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+08:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Read one window near its label line; returns null when ambiguous. */
function readWindow(all, needles) {
  for (let i = 0; i < all.length; i++) {
    if (!needles.some((n) => all[i].includes(n))) continue;
    const block = all.slice(i, i + 7).join(" · ");
    const pct = block.match(/(\d+(?:\.\d+)?)\s*%/);
    const frac = block.match(/(\d[\d,]*(?:\.\d+)?)\s*\/\s*(\d[\d,]*(?:\.\d+)?)/);
    const reset = block.match(/(?:重置|刷新|恢复)[^\d]{0,6}(\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2})/);
    const resetAt = reset ? coerceDate(reset[1]) : null;
    if (frac) {
      const remaining = num(frac[1]);
      const total = num(frac[2]);
      if (remaining === null || total === null || total <= 0) continue;
      return { remaining, total, unit: "次", resetAt };
    }
    if (pct) {
      const pctValue = Number(pct[1]);
      if (!Number.isFinite(pctValue)) continue;
      const usedLabel = /已用|使用|消耗/.test(block);
      return {
        remaining: usedLabel ? round2(100 - pctValue) : round2(pctValue),
        total: 100,
        unit: "%",
        resetAt,
      };
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {{ok:true, windows:Record<string,any>, mainWindow:null, adapterVersion:string} | {ok:false, code:string, message:string}}
 */
export function parseVolcengine(text) {
  if (isSignedOut(text)) {
    return { ok: false, code: "not_logged_in", message: "火山方舟控制台未登录" };
  }
  const all = lines(text);
  const windows = {};
  for (const w of WINDOWS) {
    const hit = readWindow(all, w.needles);
    if (hit) windows[w.key] = { ...hit, updatedAt: null };
  }
  const keys = Object.keys(windows);
  if (!keys.length) {
    return { ok: false, code: "parse_failed", message: "火山订阅页额度文案未识别（布局未验证，请先跑 quota probe volcengine）" };
  }
  if (keys.length === 1 && windows[keys[0]].unit === "%") {
    return { ok: false, code: "parse_failed", message: "火山页只识别到一个百分比，无法确认窗口，按未验证处理" };
  }
  return { ok: true, windows, mainWindow: null, adapterVersion: "volc-v1" };
}
