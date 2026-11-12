/**
 * Client half of the AI quota dashboard plugin.
 *
 * Renders a compact strip in the composer dock: one chip per quota source plus
 * a refresh action. Clicking the strip opens a popover directly above it,
 * listing every window (5h / week / month) with its remaining amount and reset
 * countdown. The popover renders in the frame-wide `shell.overlay` slot (the
 * docked composer clips its own subtree) and is positioned with fixed
 * coordinates measured from the trigger: no backdrop, no modal.
 *
 * Data comes from the plugin's own same-origin routes registered by index.js.
 */
window.__ModuleLoader__.load({
  id: 'ai-quota-dashboard',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'ai-quota-dashboard';
    const STATE_URL = '/ai-quota/state';
    const REFRESH_URL = '/ai-quota/refresh';
    const REQUEST_TIMEOUT_MS = 8000;
    const POLL_INTERVAL_MS = 1500;
    const POLL_BUDGET_MS = 90000;
    const STATUS_KEYS = [
      'never',
      'ok',
      'partial',
      'manual',
      'not_logged_in',
      'parse_failed',
      'page_unreachable',
      'timeout',
      'cdp_unavailable',
      'config_error',
      'auth_failed',
    ];

    const ZH = {
      'dock.label': 'AI 额度',
      'dock.expand': '查看额度详情',
      'dock.details': '剩余额度',
      'dialog.close': '关闭',
      'dock.refresh': '刷新',
      'dock.refreshing': '刷新中',
      'dock.loading': '读取中…',
      'dock.updated': '更新于 {time}',
      'dock.never': '未读取',
      'dock.details.empty': '暂无数据',
      'source.opencode_go': 'OpenCode Go',
      'source.opencode_go.short': 'OC',
      'source.x_premium': 'X Premium · Grok',
      'source.x_premium.short': 'Grok',
      'window.h5': '5 小时',
      'window.week': '周',
      'window.month': '月',
      'status.never': '未读取',
      'status.ok': '正常',
      'status.partial': '部分成功',
      'status.manual': '手动',
      'status.not_logged_in': '未登录',
      'status.parse_failed': '解析失败',
      'status.page_unreachable': '页面打不开',
      'status.timeout': '超时',
      'status.cdp_unavailable': '浏览器未连接',
      'status.config_error': '缺少凭证',
      'status.auth_failed': '凭证被拒绝',
      'status.unknown': '状态未知',
      'badge.low': '偏低',
      'badge.used_up': '已用尽',
      'empty.window': '—',
      'time.just_now': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'reset.in_minutes': '{n} 分钟后重置',
      'reset.in_hours': '{n} 小时后重置',
      'reset.in_days': '{n} 天后重置',
      'reset.passed': '已重置',
      'refresh.done': '{ok} 个来源已更新，{failed} 个失败',
      'error.corrupt': '数据文件损坏或版本不兼容，请在终端运行 quota doctor',
      'error.network': '无法连接插件接口：{message}',
      'error.timeout': '刷新超时，请检查浏览器是否已启动',
      'error.load': '读取失败：{message}',
    };

    const EN = {
      'dock.label': 'AI quota',
      'dock.expand': 'Show quota details',
      'dock.details': 'Remaining quota',
      'dialog.close': 'Close',
      'dock.refresh': 'Refresh',
      'dock.refreshing': 'Refreshing',
      'dock.loading': 'Loading…',
      'dock.updated': 'Updated {time}',
      'dock.never': 'Not read yet',
      'dock.details.empty': 'No data yet',
      'source.opencode_go': 'OpenCode Go',
      'source.opencode_go.short': 'OC',
      'source.x_premium': 'X Premium · Grok',
      'source.x_premium.short': 'Grok',
      'window.h5': '5-hour',
      'window.week': 'Week',
      'window.month': 'Month',
      'status.never': 'Not read',
      'status.ok': 'OK',
      'status.partial': 'Partial',
      'status.manual': 'Manual',
      'status.not_logged_in': 'Signed out',
      'status.parse_failed': 'Parse failed',
      'status.page_unreachable': 'Page unavailable',
      'status.timeout': 'Timed out',
      'status.cdp_unavailable': 'Browser unavailable',
      'status.config_error': 'Missing credential',
      'status.auth_failed': 'Credential rejected',
      'status.unknown': 'Unknown',
      'badge.low': 'Low',
      'badge.used_up': 'Used up',
      'empty.window': '—',
      'time.just_now': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'reset.in_minutes': 'resets in {n} min',
      'reset.in_hours': 'resets in {n} h',
      'reset.in_days': 'resets in {n} d',
      'reset.passed': 'reset',
      'refresh.done': '{ok} sources updated, {failed} failed',
      'error.corrupt': 'State file is corrupt or incompatible — run quota doctor in a terminal',
      'error.network': 'Plugin endpoint unreachable: {message}',
      'error.timeout': 'Refresh timed out — check that the browser is running',
      'error.load': 'Read failed: {message}',
    };

    const CSS = `
.aqd-root {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.aqd-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}
.aqd-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
.aqd-toggle:hover { background: var(--dsw-alias-bg-layer-2); }
.aqd-toggle:focus-visible,
.aqd-action:focus-visible,
.aqd-textbtn:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.aqd-icon { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary); }
.aqd-title { flex: none; font-weight: 500; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.aqd-muted { color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.aqd-chips { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.aqd-chip { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 132px; white-space: nowrap; }
.aqd-mini {
  position: relative;
  width: 28px;
  height: 2px;
  flex: none;
  border-radius: 0;
  background: var(--route, #141414);
}
.aqd-mini > i {
  position: absolute;
  top: 50%;
  left: calc(var(--at, 0) * (100% - 6px));
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--route, var(--dsw-alias-label-primary));
  transform: translateY(-50%);
}
.aqd-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary); }
.aqd-chip--ok .aqd-dot { background: var(--dsw-alias-state-success-primary); }
.aqd-chip--low .aqd-dot { background: var(--dsw-alias-state-warn-primary); }
.aqd-chip--used_up .aqd-dot,
.aqd-chip--bad .aqd-dot { background: var(--dsw-alias-state-error-primary); }
.aqd-chip-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-secondary); }
.aqd-chip-value { flex: none; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.aqd-chip--low .aqd-chip-value { color: #8a5a00; }
.aqd-chip--used_up .aqd-chip-value,
.aqd-chip--bad .aqd-chip-value { color: #c23b22; }
.aqd-action {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.aqd-action:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.aqd-action:disabled { opacity: 0.55; cursor: default; }
.aqd-spin { animation: aqd-spin 1s linear infinite; }
@keyframes aqd-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .aqd-spin { animation-duration: 2.4s; } }
.aqd-pop {
  box-sizing: border-box;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  animation: aqd-pop-in 120ms ease-out;
}
@keyframes aqd-pop-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .aqd-pop { animation: none; } }
.aqd-pop-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 8px 8px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.aqd-pop-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.aqd-pop-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.aqd-pop-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.aqd-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.aqd-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.aqd-close:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.aqd-pop-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 12px 4px;
}
.aqd-src { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 8px 4px; }
.aqd-src-track { position: relative; height: 2px; margin: 14px 8px 10px; border-radius: 0; background: var(--route, #141414); }
.aqd-src-track > i { position: absolute; top: 50%; left: calc(var(--at, 0) * (100% - 8px)); width: 8px; height: 8px; border-radius: 50%; background: var(--route, currentColor); transform: translateY(-50%); }
.aqd-src + .aqd-src { border-top: 1px solid var(--dsw-alias-border-l1); }
.aqd-src-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.aqd-src-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.aqd-src-status { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.aqd-src-status--ok { color: inherit; }
.aqd-src-status--warn { color: #8a5a00; }
.aqd-src-status--bad { color: #c23b22; }
.aqd-wins {
  display: grid;
  grid-template-columns: repeat(var(--wins, 1), minmax(0, 1fr));
  gap: 2px 12px;
  margin: 0 8px;
}
.aqd-win {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  font-size: 11px;
}
.aqd-win-k {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 13px;
  color: var(--dsw-alias-label-secondary);
}
.aqd-win-v {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 15px;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.aqd-win--low .aqd-win-v { color: #8a5a00; }
.aqd-win--used_up .aqd-win-v { color: #c23b22; }
.aqd-win--empty .aqd-win-v { color: var(--dsw-alias-state-idle-primary); }
.aqd-win-reset {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}
.aqd-src-error {
  overflow-wrap: anywhere;
  font-size: 11px;
  color: #c23b22;
}
.aqd-pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.aqd-error {
  overflow-wrap: anywhere;
  padding: 6px 4px;
  font-size: 11px;
  color: #c23b22;
}
.aqd-pad { padding: 6px 4px; }
.aqd-textbtn {
  flex: none;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.aqd-textbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.aqd-textbtn:disabled { color: var(--dsw-alias-label-secondary); cursor: default; }
`;

    /** @type {(key: string, params?: Record<string, unknown>) => string} */
    let t = (key) => key;

    function tr(key, params) {
      let value;
      try {
        value = t(key, params);
      } catch {
        return key;
      }
      return typeof value === 'string' && value ? value : key;
    }

    function createStore(initial) {
      let current = initial;
      const listeners = new Set();
      return {
        get() {
          return current;
        },
        set(next) {
          current = typeof next === 'function' ? next(current) : next;
          listeners.forEach((listener) => listener());
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    }

    const store = createStore({
      loaded: false,
      view: null,
      refreshing: false,
      error: null,
      lastResult: null,
      open: false,
      anchor: null,
    });

    /**
    * The trigger's viewport rect, so the popover can sit directly above it.
    * @param {Element|null|undefined} element
    * @returns {{left:number,right:number,top:number,bottom:number,width:number,height:number}|null}
    */
    function rectOf(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return null;
      const rect = element.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.top)) return null;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }

    function openDialog(anchor) {
      store.set((current) => ({ ...current, open: true, anchor: anchor ?? current.anchor }));
    }

    function closeDialog() {
      store.set((current) => ({ ...current, open: false }));
    }

    function messageOf(error) {
      if (!error) return 'unknown error';
      if (typeof error === 'string') return error;
      return error.message ? String(error.message) : String(error);
    }

    const CURRENCY_UNITS = { $: true, '¥': true, '€': true, '£': true };

    function fmtNumber(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      const text = String(Math.round(value * 100) / 100);
      const parts = text.split('.');
      const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.length > 1 ? grouped + '.' + parts[1] : grouped;
    }

    function fmtAmount(value, unit) {
      const amount = fmtNumber(value);
      if (!unit) return amount;
      if (unit === '%') return amount + '%';
      if (CURRENCY_UNITS[unit]) return unit + amount;
      return amount + ' ' + unit;
    }

    function fmtRelative(iso) {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return '';
      const diff = Date.now() - then;
      if (diff < 60000) return tr('time.just_now');
      const minutes = Math.floor(diff / 60000);
      if (minutes < 60) return tr('time.minutes', { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return tr('time.hours', { n: hours });
      return tr('time.days', { n: Math.floor(hours / 24) });
    }

    function countdownText(iso) {
      const target = new Date(iso).getTime();
      if (!Number.isFinite(target)) return '';
      const diff = target - Date.now();
      if (diff <= 0) return tr('reset.passed');
      const minutes = Math.ceil(diff / 60000);
      if (minutes < 60) return tr('reset.in_minutes', { n: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return tr('reset.in_hours', { n: hours });
      return tr('reset.in_days', { n: Math.round(hours / 24) });
    }

    function windowTotal(win) {
      return win && typeof win.total === 'number' && Number.isFinite(win.total) && win.total > 0
        ? win.total
        : null;
    }

    function windowBadge(win) {
      if (!win || typeof win.remaining !== 'number' || !Number.isFinite(win.remaining)) return null;
      if (win.remaining <= 0) return 'used_up';
      const total = windowTotal(win);
      const ratio = total !== null ? win.remaining / total : win.unit === '%' ? win.remaining / 100 : null;
      if (ratio !== null && ratio <= 0.2) return 'low';
      return null;
    }

    function windowValue(win) {
      if (!win || typeof win.remaining !== 'number' || !Number.isFinite(win.remaining)) {
        return tr('empty.window');
      }
      const total = windowTotal(win);
      if (total !== null && win.unit !== '%') {
        return fmtNumber(win.remaining) + ' / ' + fmtAmount(total, win.unit);
      }
      return fmtAmount(win.remaining, win.unit);
    }

    function sourceIds(sources) {
      return sources ? Object.keys(sources) : [];
    }

    /**
    * A source earns its line by carrying at least one numeric window. One that
    * was never read, or whose read failed before it ever produced a number
    * (missing credentials, not logged in), has nothing to print but a status,
    * so it stays out of the strip and the popover. A source that failed but
    * still holds last-good numbers keeps its line: the number is still true.
    * @param {object|null|undefined} source
    */
    function hasReading(source) {
      if (!source || !source.windows || typeof source.windows !== 'object') return false;
      return Object.keys(source.windows).some((key) => {
        const win = source.windows[key];
        return win !== null && win !== undefined && typeof win.remaining === 'number' && Number.isFinite(win.remaining);
      });
    }

    function visibleIds(sources) {
      return sourceIds(sources).filter((id) => hasReading(sources[id]));
    }

    function windowKeys(source) {
      if (source && Array.isArray(source.reportedWindows) && source.reportedWindows.length) return source.reportedWindows;
      return source && source.windows ? Object.keys(source.windows) : [];
    }

    function primaryWindow(source) {
      if (!source || !source.windows) return null;
      const preferred = source.mainWindow && source.mainWindow !== 'auto' ? source.mainWindow : null;
      if (preferred && source.windows[preferred]) return source.windows[preferred];
      const configured = source.defaultWindow && source.defaultWindow !== 'auto' ? source.defaultWindow : null;
      if (configured && source.windows[configured]) return source.windows[configured];
      for (const key of windowKeys(source)) {
        if (source.windows[key]) return source.windows[key];
      }
      return null;
    }

    function chipValue(source) {
      const win = primaryWindow(source);
      if (!win || typeof win.remaining !== 'number' || !Number.isFinite(win.remaining)) {
        const status = source && source.status;
        if (status && status !== 'ok' && status !== 'never' && STATUS_KEYS.includes(status)) {
          return statusLabel(status);
        }
        return tr('dock.never');
      }
      const total = windowTotal(win);
      if (total !== null) return Math.round((win.remaining / total) * 100) + '%';
      if (win.unit === '%') return Math.round(win.remaining) + '%';
      return fmtAmount(win.remaining, win.unit);
    }

    function sourceTone(source) {
      if (!source) return 'idle';
      const badge = windowBadge(primaryWindow(source));
      if (badge === 'used_up') return 'used_up';
      if (source.status === 'ok' || source.status === 'partial' || source.status === 'manual') {
        return badge === 'low' ? 'low' : 'ok';
      }
      if (source.status === 'never') return 'idle';
      return 'bad';
    }

    function statusTone(status) {
      if (status === 'ok') return 'ok';
      if (status === 'partial' || status === 'manual') return 'warn';
      if (status === 'never') return 'idle';
      return 'bad';
    }

    function statusLabel(status) {
      return tr(STATUS_KEYS.includes(status) ? 'status.' + status : 'status.unknown');
    }

    function windowLabel(key, source) {
      const labels = source && source.windowLabels;
      if (labels && typeof labels[key] === 'string' && labels[key]) return labels[key];
      const translated = tr('window.' + key);
      return translated === 'window.' + key ? key : translated;
    }

    function sourceName(id, source) {
      if (source && source.name) return source.name;
      return tr('source.' + id);
    }

    function sourceShort(id, source) {
      if (source && source.shortName) return source.shortName;
      const translated = tr('source.' + id + '.short');
      return translated === 'source.' + id + '.short' ? sourceName(id, source) : translated;
    }

    function chipTitle(id, source) {
      const name = sourceName(id, source);
      const win = primaryWindow(source);
      if (!win) return name + ' · ' + tr('dock.never');
      const key = windowKeys(source).find((item) => source.windows && source.windows[item] === win) || source.mainWindow;
      const parts = [name, windowLabel(key, source), windowValue(win)];
      if (win.resetAt) parts.push(countdownText(win.resetAt));
      return parts.join(' · ');
    }

    function sourceErrorText(error) {
      if (!error) return '';
      if (typeof error === 'string') return error;
      if (typeof error.message === 'string' && error.message) return error.message;
      return typeof error.code === 'string' ? error.code : '';
    }

    function lastUpdated(sources) {
      let newest = 0;
      for (const id of sourceIds(sources)) {
        const source = sources && sources[id];
        const at = source && source.lastAttemptAt ? new Date(source.lastAttemptAt).getTime() : NaN;
        if (Number.isFinite(at) && at > newest) newest = at;
      }
      return newest > 0 ? new Date(newest).toISOString() : null;
    }

    function errorText(error) {
      if (!error) return '';
      const code = typeof error.code === 'string' ? error.code : '';
      if (code === 'CORRUPT' || code === 'UNKNOWN_VERSION' || code === 'STALE_VERSION') {
        return tr('error.corrupt');
      }
      if (code === 'timeout') return tr('error.timeout');
      if (code === 'network') return tr('error.network', { message: messageOf(error) });
      return tr('error.load', { message: messageOf(error) });
    }

    function requestJson(url, options) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const headers = { accept: 'application/json' };
      if (options && options.headers) Object.assign(headers, options.headers);
      return fetch(url, {
        method: (options && options.method) || 'GET',
        headers,
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) => {
          let body = null;
          try {
            body = await response.json();
          } catch {
            body = null;
          }
          return { status: response.status, ok: response.ok, body };
        })
        .finally(() => clearTimeout(timer));
    }

    async function loadState() {
      const result = await requestJson(STATE_URL);
      if (result.status !== 200) throw new Error('HTTP ' + result.status);
      return result.body;
    }

    function applyBody(body) {
      if (!body || typeof body !== 'object') {
        store.set((state) => ({
          ...state,
          loaded: true,
          error: { code: 'data_error', message: 'invalid response' },
        }));
        return;
      }
      if (body.ok === true && body.view) {
        store.set((state) => ({
          ...state,
          loaded: true,
          view: body.view,
          refreshing: body.refreshing === true,
          lastResult: body.lastResult || state.lastResult,
          error: null,
        }));
        return;
      }
      store.set((state) => ({
        ...state,
        loaded: true,
        refreshing: body.refreshing === true,
        lastResult: body.lastResult || state.lastResult,
        error: body.error || { code: 'data_error', message: 'invalid response' },
      }));
    }

    async function startRefresh() {
      const state = store.get();
      if (state.refreshing || !state.loaded) return;
      store.set((current) => ({ ...current, refreshing: true, error: null }));
      try {
        const result = await requestJson(REFRESH_URL, { method: 'POST' });
        if (result.status === 409) return;
        if (result.status !== 202 || !result.body || result.body.ok !== true) {
          store.set((current) => ({
            ...current,
            refreshing: false,
            error: (result.body && result.body.error) || { code: 'data_error', message: 'HTTP ' + result.status },
          }));
        }
      } catch (error) {
        store.set((current) => ({
          ...current,
          refreshing: false,
          error: { code: 'network', message: messageOf(error) },
        }));
      }
    }

    function gaugeIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M2.6 11.2a5.9 5.9 0 1 1 10.8 0',
          stroke: 'currentColor',
          'stroke-width': 1.4,
          'stroke-linecap': 'round',
        }),
        h('path', {
          d: 'M8 8.9 10.5 6.3',
          stroke: 'currentColor',
          'stroke-width': 1.4,
          'stroke-linecap': 'round',
        }),
      );
    }

    function refreshIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M13.1 8a5.1 5.1 0 1 1-1.63-3.77',
          stroke: 'currentColor',
          'stroke-width': 1.4,
          'stroke-linecap': 'round',
        }),
        h('path', {
          d: 'M13.2 2.5v3h-3',
          stroke: 'currentColor',
          'stroke-width': 1.4,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    }

    const LINE = {
      opencode_go: '#1d4ed8',
      x_premium: '#141414',
      claude: '#c2410c',
      zhipu: '#047857',
      deepseek: '#6d28d9',
      alibaba: '#0f766e',
      codex: '#be185d',
    };

    function usedAt(win) {
      if (!win || typeof win.remaining !== 'number' || !Number.isFinite(win.remaining)) return null;
      if (win.unit === '%') return 1 - Math.min(1, Math.max(0, win.remaining / 100));
      if (typeof win.total === 'number' && win.total > 0) return 1 - Math.min(1, Math.max(0, win.remaining / win.total));
      return null;
    }

    function renderChip(id, source) {
      const tone = sourceTone(source);
      const at = usedAt(primaryWindow(source));
      return h(
        'span',
        { key: id, className: 'aqd-chip aqd-chip--' + tone, title: chipTitle(id, source), style: { '--route': LINE[id] || '#141414' } },
        h('span', { className: 'aqd-mini', 'aria-hidden': 'true' }, at === null ? null : h('i', { style: { '--at': String(at) } })),
        h('span', { className: 'aqd-chip-name' }, sourceShort(id, source)),
        h('span', { className: 'aqd-chip-value' }, chipValue(source)),
      );
    }

    function renderWindow(key, win, source) {
      const badge = windowBadge(win);
      const classes = ['aqd-win'];
      if (badge) classes.push('aqd-win--' + badge);
      if (!win) classes.push('aqd-win--empty');
      const label = windowLabel(key, source);
      const value = windowValue(win);
      const reset = win && win.resetAt ? ' · ' + countdownText(win.resetAt) : '';
      return h(
        'span',
        { key, className: classes.join(' '), title: label + ' · ' + value + reset },
        h('span', { className: 'aqd-win-k' }, label),
        h('span', { className: 'aqd-win-v' }, value),
      );
    }

    function renderSource(id, source) {
      const status = source && typeof source.status === 'string' ? source.status : 'never';
      const at = usedAt(primaryWindow(source));
      const keys = source ? windowKeys(source) : [];
      return h(
        'div',
        { key: id, className: 'aqd-src', style: { '--route': LINE[id] || '#141414' } },
        h(
          'div',
          { className: 'aqd-src-head' },
          h('span', { className: 'aqd-src-name' }, sourceName(id, source)),
          h('span', { className: 'aqd-src-status aqd-src-status--' + statusTone(status) }, statusLabel(status)),
        ),
        h('span', { className: 'aqd-src-track', 'aria-hidden': 'true' }, at === null ? null : h('i', { style: { '--at': String(at) } })),
        source
          ? h(
              'div',
              { className: 'aqd-wins', style: { '--wins': String(keys.length || 1) } },
              keys.map((key) => renderWindow(key, source.windows ? source.windows[key] : null, source)),
            )
          : null,
        source && source.error
          ? h('div', { className: 'aqd-src-error' }, sourceErrorText(source.error))
          : null,
      );
    }

    function footerText(state) {
      const summary = state.lastResult && state.lastResult.summary;
      if (summary) return tr('refresh.done', { ok: summary.succeeded, failed: summary.failed });
      const at = lastUpdated(state.view && state.view.sources);
      if (at) return tr('dock.updated', { time: fmtRelative(at) });
      return '';
    }

    function QuotaDock() {
      const [, setTick] = React.useState(0);
      const state = store.get();
      const view = state.view;
      const sources = view && view.sources ? view.sources : null;
      const visible = sources ? visibleIds(sources) : [];

      React.useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);

      React.useEffect(() => {
        let cancelled = false;
        loadState()
          .then((body) => {
            if (!cancelled) applyBody(body);
          })
          .catch((error) => {
            if (cancelled) return;
            store.set((current) => ({
              ...current,
              loaded: true,
              error: { code: 'network', message: messageOf(error) },
            }));
          });
        return () => {
          cancelled = true;
        };
      }, []);

      // The dock disappears whenever the composer leaves the typing state; the
      // dialog lives in the frame overlay, so close it before it orphans.
      React.useEffect(() => () => store.set((current) => ({ ...current, open: false })), []);

      React.useEffect(() => {
        if (!state.refreshing) return undefined;
        let cancelled = false;
        let timer = null;
        const deadline = Date.now() + POLL_BUDGET_MS;
        const tick = async () => {
          if (cancelled) return;
          if (Date.now() > deadline) {
            store.set((current) => ({
              ...current,
              refreshing: false,
              error: { code: 'timeout', message: 'poll budget exceeded' },
            }));
            return;
          }
          let failed = false;
          try {
            const body = await loadState();
            if (cancelled) return;
            applyBody(body);
          } catch {
            failed = true;
          }
          if (cancelled || !store.get().refreshing) return;
          if (failed && Date.now() > deadline) {
            store.set((current) => ({
              ...current,
              refreshing: false,
              error: { code: 'timeout', message: 'poll budget exceeded' },
            }));
            return;
          }
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return () => {
          cancelled = true;
          if (timer) clearTimeout(timer);
        };
      }, [state.refreshing]);

      const onRefresh = () => {
        startRefresh();
      };

      return h(
        'div',
        { className: 'aqd-root', 'data-plugin': 'ai-quota-dashboard' },
        h('style', { key: 'aqd-style' }, CSS),
        h(
          'div',
          { className: 'aqd-strip' },
          h(
            'button',
            {
              type: 'button',
              className: 'aqd-toggle',
              onClick: (event) => {
                if (state.open) {
                  closeDialog();
                  return;
                }
                openDialog(rectOf(event && event.currentTarget));
              },
              title: tr('dock.expand'),
              'aria-haspopup': 'dialog',
              'aria-expanded': state.open ? 'true' : 'false',
              'data-aqd-toggle': '1',
            },
            h('span', { className: 'aqd-icon' }, gaugeIcon()),
            h('span', { className: 'aqd-title' }, tr('dock.label')),
            !state.loaded ? h('span', { className: 'aqd-muted' }, tr('dock.loading')) : null,
            visible.length ? h('span', { className: 'aqd-chips' }, visible.map((id) => renderChip(id, sources[id]))) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'aqd-action',
              onClick: onRefresh,
              disabled: state.refreshing || !state.loaded,
              title: state.refreshing ? tr('dock.refreshing') : tr('dock.refresh'),
              'aria-label': state.refreshing ? tr('dock.refreshing') : tr('dock.refresh'),
              'data-aqd-refresh': '1',
            },
            h('span', { className: state.refreshing ? 'aqd-spin' : undefined }, refreshIcon()),
          ),
        ),
      );
    }

    function closeIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M4 4l8 8M12 4l-8 8',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
        }),
      );
    }

    const POP_GAP = 8;
    const POP_MARGIN = 12;
    const POP_WIDTH = 400;

    /** Place the popover above the trigger, clamped to the viewport. */
    function popoverStyle(anchor, viewport) {
      const width = Math.min(POP_WIDTH, viewport.width - POP_MARGIN * 2);
      const center = anchor ? anchor.left + anchor.width / 2 : viewport.width / 2;
      const left = Math.max(POP_MARGIN, Math.min(center - width / 2, viewport.width - width - POP_MARGIN));
      const anchorTop = anchor ? anchor.top : viewport.height - POP_MARGIN - POP_GAP;
      const maxHeight = Math.max(160, Math.min(anchorTop - POP_GAP - POP_MARGIN, viewport.height * 0.7));
      return {
        position: 'fixed',
        left: left + 'px',
        width: width + 'px',
        bottom: Math.round(viewport.height - anchorTop + POP_GAP) + 'px',
        maxHeight: Math.round(maxHeight) + 'px',
      };
    }

    function viewportSize() {
      if (typeof window === 'undefined') return { width: 1280, height: 800 };
      return {
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
      };
    }

    function QuotaPopover() {
      const [, setTick] = React.useState(0);
      const state = store.get();
      const view = state.view;
      const sources = view && view.sources ? view.sources : null;
      const visible = sources ? visibleIds(sources) : [];
      const open = state.open === true;

      React.useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);

      // Relative times and reset countdowns go stale while the popover stays open.
      React.useEffect(() => {
        if (!open) return undefined;
        const timer = setInterval(() => setTick((n) => n + 1), 30000);
        return () => clearInterval(timer);
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          closeDialog();
        };
        if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
        return () => {
          if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
        };
      }, [open]);

      // Anchor follows layout: the composer moves on resize and on transcript scroll.
      React.useEffect(() => {
        if (!open) return undefined;
        const remeasure = () => {
          if (typeof document === 'undefined') return;
          openDialog(rectOf(document.querySelector('[data-aqd-toggle]')));
          setTick((n) => n + 1);
        };
        if (typeof window === 'undefined') return undefined;
        window.addEventListener('resize', remeasure);
        window.addEventListener('scroll', remeasure, true);
        return () => {
          window.removeEventListener('resize', remeasure);
          window.removeEventListener('scroll', remeasure, true);
        };
      }, [open]);

      // No backdrop: a pointer down anywhere outside the trigger and the panel closes it.
      React.useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('[data-aqd-pop],[data-aqd-toggle]')) return;
          closeDialog();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [open]);

      if (!open) return null;

      const onRefresh = () => {
        startRefresh();
      };
      const updated = lastUpdated(sources);
      const style = popoverStyle(state.anchor, viewportSize());

      return h(
        'div',
        {
          className: 'aqd-pop',
          style,
          role: 'dialog',
          'aria-label': tr('dock.details'),
          'data-aqd-pop': '1',
          'data-plugin': 'ai-quota-dashboard',
        },
        h('style', { key: 'aqd-style' }, CSS),
        h(
          'div',
          { className: 'aqd-pop-head' },
          h(
            'div',
            { className: 'aqd-pop-titles' },
            h('span', { className: 'aqd-pop-title' }, tr('dock.details')),
            h(
              'span',
              { className: 'aqd-pop-meta' },
              updated ? tr('dock.updated', { time: fmtRelative(updated) }) : tr('dock.never'),
            ),
          ),
          h('button', { type: 'button', className: 'aqd-close', onClick: closeDialog, 'aria-label': tr('dialog.close') }, closeIcon()),
        ),
        h(
          'div',
          { className: 'aqd-pop-body' },
          state.error ? h('div', { className: 'aqd-error' }, errorText(state.error)) : null,
          !state.loaded ? h('div', { className: 'aqd-muted aqd-pad' }, tr('dock.loading')) : null,
          state.loaded && !visible.length ? h('div', { className: 'aqd-muted aqd-pad' }, tr('dock.details.empty')) : null,
          visible.map((id) => renderSource(id, sources[id])),
        ),
        h(
          'div',
          { className: 'aqd-pop-foot' },
          h('span', null, footerText(state)),
          h(
            'button',
            {
              type: 'button',
              className: 'aqd-textbtn',
              onClick: onRefresh,
              disabled: state.refreshing || !state.loaded,
            },
            state.refreshing ? tr('dock.refreshing') : tr('dock.refresh'),
          ),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale');
        if (locale) {
          try {
            t = locale.bind(NS);
          } catch {
            t = (key) => key;
          }
          ctx.effect(() => {
            try {
              return locale.register(NS, { zh: ZH, en: EN });
            } catch {
              return () => {};
            }
          }, 'ai-quota-dashboard: locale');
          ctx.effect(
            () => locale.subscribe(() => store.set((state) => ({ ...state }))),
            'ai-quota-dashboard: locale redraw',
          );
        }
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.composer.dock', () =>
              ctx.slots.register(
                { name: 'conversation.composer.dock', id: 'ai-quota-dashboard', order: 2 },
                QuotaDock,
              ),
            ),
          'ai-quota-dashboard: dock entry',
        );
        // The dialog renders in the frame-wide overlay layer: the docked composer
        // clips its own descendants, so a popup cannot live inside the dock.
        ctx.effect(
          () =>
            ctx.slots.inject('shell.overlay', () =>
              ctx.slots.register({ name: 'shell.overlay', id: 'ai-quota-dashboard.popover', order: 50 }, QuotaPopover),
            ),
          'ai-quota-dashboard: dialog entry',
        );
      },
    };
  },
});
