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
  page_unreachable: "页面打不开",
  timeout: "读取超时",
  cdp_unavailable: "调试端口未开",
  config_error: "配置错误",
  auth_failed: "凭证被拒绝",
};
const HINTS = {
  cdp_unavailable: "用 --remote-debugging-port=9333 启动 Chrome，再点“刷新额度”。",
  not_logged_in: "先在浏览器里登录该控制台，再点“刷新额度”。",
  parse_failed: "页面结构可能已变化：运行 quota probe <source> 抓文本，或先手动 quota set。",
  page_unreachable: "浏览器没打开该站点：确认同一浏览器里能手动打开，再点“刷新额度”。",
  timeout: "读取超时：检查页面是否加载完成，稍后重试。",
  auth_failed: "接口拒绝了凭证：检查 AK/SK 是否完整、子用户是否挂载只读策略。",
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
function windowKeys(source) {
  if (Array.isArray(source.reportedWindows) && source.reportedWindows.length) return source.reportedWindows;
  if (source.windows && typeof source.windows === "object") return Object.keys(source.windows);
  return WINDOW_KEYS;
}
function labelOf(source, key) {
  const labels = source.windowLabels;
  if (labels && typeof labels[key] === "string" && labels[key]) return labels[key];
  return WINDOW_LABEL[key] ?? key;
}
function defaultKey(source) {
  const keys = windowKeys(source);
  const dw = source.defaultWindow;
  if (dw && dw !== "auto" && keys.includes(dw)) return dw;
  if (source.mainWindow && keys.includes(source.mainWindow)) return source.mainWindow;
  return keys[0] ?? null;
}

const LINE = {
  opencode_go: "#1d4ed8",
  x_premium: "#141414",
  claude: "#c2410c",
  zhipu: "#047857",
  deepseek: "#6d28d9",
  alibaba: "#0f766e",
  codex: "#be185d",
};

function usedAt(w) {
  if (!w || typeof w.remaining !== "number" || !Number.isFinite(w.remaining)) return null;
  if (w.unit === "%") return 1 - Math.min(1, Math.max(0, w.remaining / 100));
  if (typeof w.total === "number" && w.total > 0) return 1 - Math.min(1, Math.max(0, w.remaining / w.total));
  return null;
}

function card(id, s) {
  const keys = windowKeys(s);
  const eff = defaultKey(s);
  const w = eff && s.windows ? s.windows[eff] : null;
  const at = usedAt(w);
  const badge = badgeOf(w);
  const tone = badge === "已用完" ? " spent" : badge === "偏低" ? " low" : at === null ? " idle" : "";
  const status = SOURCE_STATUS[s.status] ?? s.status ?? "未读取";
  const statusClass = s.status && s.status !== "ok" && s.status !== "manual" && s.status !== "never" ? " bad" : "";
  const stations = keys
    .map((key, index) => {
      const win = s.windows ? s.windows[key] : null;
      const place = usedAt(win);
      const at = place === null ? (keys.length <= 1 ? 0 : index / (keys.length - 1)) : place;
      const value = win ? fmtAmount(win.remaining, win.unit) : "未提供";
      return `<li class="station${key === eff ? " lead" : ""}" style="--at:${at.toFixed(4)}"><span>${esc(labelOf(s, key))}</span><span>${esc(value)}</span></li>`;
    })
    .join("");
  const figure = w
    ? `${esc(fmtAmount(w.remaining, w.unit))}<small>${esc(labelOf(s, eff))}${badge ? ` · ${esc(badge)}` : ""}</small>`
    : eff ? "这条线还没有车" : "页面主数字未识别";
  const reset = w ? `${resetText(w)}${rel(w.updatedAt) ? ` · 更新 ${rel(w.updatedAt)}` : ""}` : "还没有读到数字";
  const err = s.error?.message
    ? `<p class="err">${esc(s.error.message)}<span class="hint">${esc(HINTS[s.error.code] ?? "")}</span></p>`
    : "";
  return `<article class="line${tone}" style="--route:${LINE[id] || "#141414"}">
    <div class="line-id">
      <span class="swatch" aria-hidden="true"></span>
      <div>
        <h2>${esc(s.name ?? id)}</h2>
        <p class="line-status${statusClass}">${esc(status)}</p>
      </div>
    </div>
    <div class="route">
      <div class="track">
        ${at === null ? "" : `<span class="train" style="--at:${at.toFixed(4)}"></span>`}
        <ol class="stations">${stations}</ol>
      </div>
    </div>
    <p class="figure${w ? "" : " empty"}">${figure}</p>
    <p class="detail">${esc(reset)}</p>
    ${err}
  </article>`;
}

async function load() {
  if (!token) return;
  const res = await fetch(`/api/state?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    cards.innerHTML = `<article class="line idle" style="--route:#141414"><p class="err">${esc(data.message || "读取失败")}<span class="hint">${esc(data.hint || "")}</span></p></article>`;
    generated.textContent = "—";
    return;
  }
  cards.innerHTML = Object.keys(data.sources || {})
    .map((id) => card(id, data.sources[id]))
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
  refresh();
}
