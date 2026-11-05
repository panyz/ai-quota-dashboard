// OpenCode Go console parser. Input: document.body.innerText of the workspace /go page
// (or the Activity page, which labels the 5-hour window "Rolling").
// Anchors are visible labels only, so a restyle does not break it.

const WINDOWS = [
  { key: "h5", needles: ["5-hour window", "5 hour window", "5小时窗口", "Rolling"] },
  { key: "week", needles: ["Weekly", "每周"] },
  { key: "month", needles: ["Monthly", "每月"] },
];

const pctUsed = /(\d+(?:\.\d+)?)\s*%\s*used/i;
const resetIn = /Resets?\s+in\s+([0-9]+(?:\s*[dhms])+)/i;

export function isSignedOut(text) {
  const t = text || "";
  if (/5-hour window|Rolling|Weekly[\s\S]{0,40}% used/i.test(t)) return false;
  return /SIGN IN|Sign in to|OPEN CONSOLE|Go is a subscription/i.test(t);
}

/** "2h 49m" -> ms */
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

function lines(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function blockAfter(all, needle, span = 8) {
  const lower = needle.toLowerCase();
  for (let i = 0; i < all.length; i++) {
    if (!all[i].toLowerCase().includes(lower)) continue;
    const block = all.slice(i, i + span).join("\n");
    if (pctUsed.test(block)) return block;
  }
  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {string} text
 * @param {Date} now
 * @returns {{ok:true, windows:Record<string,any>, mainWindow:string} | {ok:false, code:string, message:string}}
 */
export function parseOpenCode(text, now = new Date()) {
  if (isSignedOut(text)) {
    return { ok: false, code: "not_logged_in", message: "OpenCode 控制台未登录" };
  }
  const all = lines(text);
  const windows = {};
  for (const w of WINDOWS) {
    let block = null;
    for (const needle of w.needles) {
      block = blockAfter(all, needle);
      if (block) break;
    }
    if (!block) continue;
    const used = block.match(pctUsed);
    if (!used) continue;
    const usedPct = Number(used[1]);
    if (!Number.isFinite(usedPct) || usedPct < 0 || usedPct > 100) continue;
    const reset = block.match(resetIn);
    windows[w.key] = {
      remaining: round2(100 - usedPct),
      total: 100,
      unit: "%",
      resetAt: reset ? new Date(now.getTime() + durationToMs(reset[1])).toISOString() : null,
      updatedAt: null,
    };
  }
  if (!Object.keys(windows).length) {
    return { ok: false, code: "parse_failed", message: "OpenCode 页面未找到额度窗口（页面结构可能已变化）" };
  }
  return { ok: true, windows, mainWindow: "h5", adapterVersion: "opencode-v1" };
}
