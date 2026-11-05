const WINDOW_KEYS = ["h5", "week", "month"];
const WINDOW_LABEL = { h5: "5 小时", week: "周", month: "月" };
const WINDOW_STATUS = { ok: "正常", stale: "可能过期", expired: "已过期", reset_passed: "周期已重置" };
const SOURCE_STATUS = {
  never: "未读取",
  ok: "正常",
  partial: "部分窗口未读取",
  manual: "手动",
  not_logged_in: "浏览器未登录",
  parse_failed: "页面结构可能已变化",
  timeout: "读取超时",
  cdp_unavailable: "调试端口未开",
  config_error: "配置错误",
};
const HINTS = {
  cdp_unavailable: "用 --remote-debugging-port=9333 启动 Chrome，再点“刷新额度”。",
  not_logged_in: "先在浏览器里登录该控制台，再点“刷新额度”。",
  parse_failed: "页面结构可能已变化：运行 quota probe <source> 抓文本，或先手动 quota set。",
  timeout: "读取超时：检查页面是否加载完成，稍后重试。",
  data_error: "数据文件不可用：运行 quota clear --yes 后重新录入。",
  partial: "部分窗口本次未读取，已保留上次数据。",
};

const token = new URLSearchParams(location.search).get("token") || "";
const cards = document.getElementById("cards");
const notice = document.getElementById("notice");
const generated = document.getElementById("generated");
const datapath = document.getElementById("datapath");
const jsonlink = document.getElementById("jsonlink");
const refreshBtn = document.getElementById("refresh");
const refreshState = document.getElementById("refreshState");
const reloadBtn = document.getElementById("reload");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fmtNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(rounded).split(".");
  const sep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = (frac || "").replace(/0+$/, "");
  return trimmed ? `${sep}.${trimmed}` : sep;
}
function fmtAmount(v, unit) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (unit === "%") return `${fmtNumber(v)}%`;
  if (["$", "¥", "€", "£"].includes(unit)) return `${unit}${fmtNumber(v)}`;
  return unit ? `${fmtNumber(v)} ${unit}` : fmtNumber(v);
}
function rel(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const m = Math.floor(Math.max(0, Date.now() - t) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
function countdown(iso) {
  if (!iso) return null;
  const d = Date.parse(iso) - Date.now();
  if (d <= 0) return "已重置";
  const m = Math.round(d / 60000);
  if (m < 60) return `${Math.max(1, m)} 分钟后`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时后`;
  return `${Math.round(h / 24)} 天后`;
}
function localTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function resetText(w) {
  if (!w.resetAt) return "重置时间未填";
  const c = countdown(w.resetAt);
  if (c === "已重置") return "周期已重置，当前值待更新";
  return `重置 ${localTime(w.resetAt)}（${c}）`;
}
function badgeOf(w) {
  if (!w) return null;
  if (w.remaining <= 0) return "已用完";
  if (typeof w.total === "number" && w.total > 0 && w.remaining / w.total <= 0.2) return "偏低";
  return null;
}
function defaultKey(source) {
  const dw = source.defaultWindow;
  if (dw && dw !== "auto") return dw;
  return source.mainWindow || null;
}

function row(key, w, isDefault, partial) {
  const label = WINDOW_LABEL[key] ?? key;
  if (!w) {
    return `<div class="win empty"><span class="wlabel">${esc(label)}</span><span class="wvalue">未提供</span></div>`;
  }
  const badge = badgeOf(w);
  const tags = [];
  if (isDefault) tags.push('<span class="tag">默认</span>');
  if (partial && w.notReadThisAttempt) tags.push('<span class="tag">本次未读取</span>');
  if (w.status && w.status !== "ok") tags.push(`<span class="tag ${w.status === "expired" ? "muted" : "warn"}">${esc(WINDOW_STATUS[w.status] ?? w.status)}</span>`);
  if (w.status === "reset_passed" || w.status === "expired") tags.push('<span class="tag muted">上次记录</span>');
  if (badge) tags.push(`<span class="tag ${badge === "已用完" ? "danger" : "warn"}">${esc(badge)}</span>`);

  const total = typeof w.total === "number" && w.total > 0 ? ` / 总量 ${fmtAmount(w.total, w.unit)}` : "";
  const updated = rel(w.updatedAt);
  return `<div class="win${w.status === "expired" || w.status === "reset_passed" ? " dim" : ""}">
    <div class="whead"><span class="wlabel">${esc(label)}</span><span class="wvalue">剩余 ${esc(fmtAmount(w.remaining, w.unit))}${esc(total)}</span></div>
    <div class="wmeta">${tags.join("")}<span class="muted">${esc(resetText(w))}${updated ? ` · 更新 ${esc(updated)}` : " · 更新时间未知"}</span></div>
  </div>`;
}

function card(id, s) {
  const eff = defaultKey(s);
  const w = eff ? s.windows[eff] : null;
  let summary;
  if (!eff) summary = "页面主数字未识别";
  else if (!w) summary = "默认窗口未提供";
  else summary = `剩余 ${fmtAmount(w.remaining, w.unit)}`;

  const statusTag = s.status && s.status !== "ok" && s.status !== "manual" ? `<span class="tag warn">${esc(SOURCE_STATUS[s.status] ?? s.status)}</span>` : "";
  const rows = WINDOW_KEYS.map((k) => row(k, s.windows[k], k === eff, s.status === "partial")).join("");
  const err = s.error?.message
    ? `<div class="err">${esc(s.error.message)}<div class="hint">${esc(HINTS[s.error.code] ?? "")}</div></div>`
    : "";
  const manualHint =
    id === "x_premium"
      ? `<div class="hint">手动更新：<code>quota set x-premium --window 5h --remaining 7 --total 10 --unit 次</code></div>`
      : "";

  return `<article class="card${w ? "" : " dim"}">
    <div class="card-head">
      <span class="name">${esc(s.name ?? id)}</span>
      <span class="tags"><span class="tag">${s.mode === "manual" ? "手动" : "自动"}</span>${statusTag}</span>
    </div>
    <div class="summary${w ? "" : " empty"}">${esc(summary)}<small>${eff ? esc(WINDOW_LABEL[eff] ?? eff) : ""}</small></div>
    <div class="windows">${rows}</div>
    ${err}${manualHint}
  </article>`;
}

const NAMES = { volcengine: "火山引擎 Coding Plan", opencode_go: "OpenCode Go", x_premium: "X Premium · Grok" };

async function load() {
  if (!token) return;
  const res = await fetch(`/api/state?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    cards.innerHTML = `<article class="card"><div class="err">${esc(data.message || "读取失败")}<div class="hint">${esc(data.hint || "")}</div></div></article>`;
    generated.textContent = "—";
    return;
  }
  cards.innerHTML = ["volcengine", "opencode_go", "x_premium"]
    .map((id) => card(id, { ...data.sources[id], name: NAMES[id] }))
    .join("");
  generated.textContent = `刷新于 ${new Date(data.generatedAt).toLocaleTimeString("zh-CN", { hour12: false })}`;
  jsonlink.href = `/api/state?token=${encodeURIComponent(token)}`;
}

async function refresh() {
  if (!token) return;
  refreshBtn.disabled = true;
  refreshState.textContent = "刷新中…";
  try {
    const res = await fetch(`/api/refresh?token=${encodeURIComponent(token)}`, { method: "POST" });
    const data = await res.json();
    if (res.status === 409) refreshState.textContent = "已有刷新在进行";
    else if (!res.ok) refreshState.textContent = data.message || "刷新失败";
    else refreshState.textContent = `完成：成功 ${data.summary.succeeded} · 失败 ${data.summary.failed} · 部分 ${data.summary.partial}`;
    await load();
  } catch (err) {
    refreshState.textContent = `刷新失败：${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

datapath.textContent = document.body.dataset.datapath || "";
if (!token) {
  notice.hidden = false;
  notice.textContent = "缺少访问 token：请用启动时打印的带 ?token=… 的地址打开。";
  refreshBtn.disabled = true;
  reloadBtn.disabled = true;
} else {
  jsonlink.href = `/api/state?token=${encodeURIComponent(token)}`;
  refreshBtn.addEventListener("click", refresh);
  reloadBtn.addEventListener("click", async () => {
    refreshState.textContent = "读取中…";
    try {
      await load();
      refreshState.textContent = "已重新读取";
    } catch (err) {
      refreshState.textContent = `读取失败：${err.message}`;
    }
  });
  load();
}
