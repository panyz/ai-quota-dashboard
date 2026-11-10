#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import {
  SCHEMA_VERSION,
  SOURCE_IDS,
  SOURCES,
  advertisedWindows,
  resolveSource,
  windowOrder,
  deriveWindowStatus,
} from "./model.js";
import { readState, ensureState, clearState, dataDir, statePath, ensureDir, clearStaleLock } from "./store.js";
import { buildView } from "./view.js";
import { performFetch, EXIT, autoSourceIds } from "./refresh.js";
import { probeSource } from "./adapters/index.js";
import { cdpVersion } from "./cdp.js";
import { UsageError, DataError } from "./errors.js";
import {
  fmtRemaining,
  fmtTotal,
  fmtReset,
  fmtRelative,
  windowLabel,
  windowStatusText,
  sourceStatusText,
  badgeText,
  lowBadge,
} from "./format.js";

const USAGE = `quota — 本地 AI 额度聚合 CLI（schema ${SCHEMA_VERSION}）

用法:
  quota fetch [--source volcengine|opencode-go|x-premium|all] [--timeout 秒] [--json]
                                          读取自动源（--timeout 是整条命令的总预算）
  quota list [source] [--json]            查看全部或单个源
  quota set x-premium --window h5|week|month --remaining N
        [--total N] [--unit %] [--reset-at ISO] [--json]
                                          手动覆盖（解析失败时）
  quota sources [--json] [--set-default volcengine=week]
                                          内置源；写 state.meta.defaultWindow
  quota probe --source volcengine|opencode-go|x-premium [--json] [--out FILE]
                                          只读诊断（会 reload 标签页），不改数据
  quota clear --yes                       清空额度数据（别名 reset）
  quota doctor [--json]                   自检 dataDir/cdp/serverPort/schema
  quota serve [--port 8787]               本地看板（带访问 token）
  quota --version                         打印数据版本（= schemaVersion）

退出码: 0 成功 / 1 全部失败且错误不同 / 2 参数 / 3 CDP 不可用 /
        4 未登录 / 5 解析失败 / 6 超时 / 7 部分成功 / 8 数据或端口错误
环境:   QUOTA_DATA_DIR=~/.ai-quota-dashboard   QUOTA_TEST_MOCK（测试构建）
        QUOTA_CDP（覆盖 CDP 地址，默认 http://127.0.0.1:9333）`;

export const FLAGS = Symbol("flags");

function parseArgs(argv, spec) {
  const out = { _: [], [FLAGS]: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    const type = spec[name];
    if (!type) throw new UsageError(`未知参数：--${name}`);
    if (type === "bool") {
      if (inline !== undefined) {
        if (inline !== "true" && inline !== "false") throw new UsageError(`--${name} 只接受 true/false`);
        out[FLAGS][name] = inline === "true";
      } else out[FLAGS][name] = true;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`--${name} 需要一个值`);
      value = next;
      i++;
    }
    if (type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new UsageError(`--${name} 需要数字，收到 ${JSON.stringify(value)}`);
      out[FLAGS][name] = n;
    } else {
      out[FLAGS][name] = String(value);
    }
  }
  return out;
}

const now = () => new Date();
const printJson = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");

function windowLine(id, key, w, source, defaultWindow, current) {
  const label = SOURCES[id].windows.find((spec) => spec.key === key)?.label ?? windowLabel(key);
  if (!w) return `  ${label.padEnd(5)} 未提供`;
  const parts = [`剩余 ${fmtRemaining(w)}`];
  const total = fmtTotal(w);
  if (total) parts.push(`总量 ${total}`);
  const st = deriveWindowStatus(w, current);
  parts.push(windowStatusText(st));
  const badge = badgeText(lowBadge(w));
  if (badge) parts.push(badge);
  if (st === "expired" || st === "reset_passed") parts.push("上次记录");
  if (w.updatedAt && source.lastAttemptAt && Date.parse(w.updatedAt) < Date.parse(source.lastAttemptAt)) {
    parts.push("本次未读取");
  }
  if (defaultWindow === key) parts.push("默认");
  parts.push(fmtReset(w, current));
  const updated = fmtRelative(w.updatedAt, current);
  if (updated) parts.push(`更新 ${updated}`);
  return `  ${label.padEnd(5)} ${parts.join(" · ")}`;
}

function printSource(id, source, state) {
  const current = now();
  const explicit = state.meta.defaultWindow[id];
  const effective = explicit === "auto" ? source.mainWindow : explicit;
  const lines = [`${SOURCES[id].name}  [${sourceStatusText(source.status)}]  (${SOURCES[id].id})`];
  for (const key of advertisedWindows(id)) lines.push(windowLine(id, key, source.windows[key], source, effective, current));
  if (source.error?.message) lines.push(`  错误：${source.error.message}`);
  console.log(lines.join("\n"));
}

/* ------------------------------- commands ------------------------------- */

function cmdInit(argv) {
  const args = parseArgs(argv, { json: "bool" });
  const created = ensureState();
  const payload = { ok: true, dir: created.dir, data: created.path, created: created.created };
  if (args[FLAGS].json) return printJson(payload);
  console.log(`数据目录 ${created.dir}`);
  console.log(`数据     ${created.path}${created.created ? "（已创建）" : "（已存在，未覆盖）"}`);
}

async function cmdDoctor(argv) {
  const args = parseArgs(argv, { json: "bool" });
  const checks = {};

  try {
    ensureDir();
    const probe = `${dataDir()}/.write-probe`;
    const { writeFileSync, unlinkSync } = await import("node:fs");
    writeFileSync(probe, "ok", { mode: 0o600 });
    unlinkSync(probe);
    checks.dataDir = { status: "ok", message: `可写：${dataDir()}` };
  } catch (err) {
    checks.dataDir = { status: "fail", message: `不可写：${dataDir()}（${err.code ?? err.message}）` };
  }

  let schemaOk = true;
  try {
    readState();
    checks.schema = { status: "ok", message: `state.json 可读（schemaVersion ${SCHEMA_VERSION}）` };
  } catch (err) {
    schemaOk = false;
    checks.schema = { status: "fail", message: `${err.message}；修复：quota clear --yes` };
  }

  try {
    const v = await cdpVersion({ timeoutMs: 3000 });
    checks.cdp = { status: "ok", message: `已连接 127.0.0.1:9333（${v.Browser}）` };
  } catch {
    checks.cdp = {
      status: "fail",
      message: "连不上 127.0.0.1:9333；请用 --remote-debugging-port=9333 启动 Chrome",
    };
  }

  const free = await isPortFree(8787);
  checks.serverPort = free
    ? { status: "ok", message: "127.0.0.1:8787 可用" }
    : { status: "warn", message: "127.0.0.1:8787 已被占用；quota serve --port <其它端口>" };

  let code = EXIT.ok;
  if (!schemaOk) code = EXIT.data;
  else if (checks.dataDir.status !== "ok") code = EXIT.data;
  else if (checks.cdp.status !== "ok") code = EXIT.cdp;

  const payload = { ok: code === EXIT.ok, checks, dataDir: dataDir(), statePath: statePath(), node: process.version, schemaVersion: SCHEMA_VERSION };
  if (args[FLAGS].json) printJson(payload);
  else {
    for (const [name, c] of Object.entries(checks)) {
      const mark = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
      console.log(`${mark} ${name.padEnd(10)} ${c.message}`);
    }
    console.log(`  数据目录   ${dataDir()}`);
  }
  process.exitCode = code;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function cmdFetch(argv) {
  const args = parseArgs(argv, { source: "string", timeout: "number", json: "bool", "keep-tab": "bool" });
  const json = Boolean(args[FLAGS].json);

  let ids;
  const rawSource = args[FLAGS].source;
  if (!rawSource || rawSource === "all") ids = autoSourceIds();
  else {
    const id = resolveSource(rawSource);
    if (!id) throw new UsageError(`未知源：${rawSource}（可选 ${SOURCE_IDS.map((key) => SOURCES[key].id).join(" | ")} | all）`);
    ids = [id];
  }

  const timeoutSec = args[FLAGS].timeout ?? 30;
  if (!(timeoutSec > 0)) throw new UsageError("--timeout 需要正数（秒）");

  const started = Date.now();
  const result = await performFetch({ ids, timeoutSec, keepTab: Boolean(args[FLAGS]["keep-tab"]) });
  result.elapsedMs = Date.now() - started;

  if (json) printJson(result);
  else {
    for (const id of SOURCE_IDS) {
      if (!ids.includes(id)) continue;
      const src = result.sources[id];
      console.log(`${SOURCES[id].name}  [${sourceStatusText(src.status)}]`);
      for (const key of advertisedWindows(id)) {
        const w = src.windows[key];
        const label = SOURCES[id].windows.find((spec) => spec.key === key)?.label ?? windowLabel(key);
        console.log(w ? `  ${label}：剩余 ${fmtRemaining(w)}` : `  ${label}：未提供`);
      }
      if (src.error?.message) console.log(`  错误：${src.error.message}`);
    }
    const s = result.summary;
    console.log(`\n成功 ${s.succeeded} · 失败 ${s.failed} · 部分 ${s.partial} · ${result.elapsedMs}ms · ${statePath()}`);
  }
  process.exitCode = result.exitCode;
}

function cmdList(argv) {
  const args = parseArgs(argv, { json: "bool" });
  const { state } = readState();
  const at = now();
  if (args[FLAGS].json) return printJson(buildView(state, at));
  const wanted = args._[0];
  const ids = wanted ? [resolveSource(wanted)] : SOURCE_IDS;
  if (wanted && !ids[0]) throw new UsageError(`未知源：${wanted}`);
  for (const id of ids) printSource(id, state.sources[id], state);
}

async function cmdSet(argv) {
  const args = parseArgs(argv, {
    remaining: "number",
    total: "number",
    unit: "string",
    window: "string",
    "reset-at": "string",
    json: "bool",
  });
  const id = resolveSource(args._[0]);
  if (!id) throw new UsageError("请指定源：quota set x-premium --window h5 --remaining 7 --unit 次");
  if (id !== "x_premium") throw new UsageError("一期只允许手动写入 x-premium；自动源请用 quota fetch");

  const window = args[FLAGS].window;
  const allowed = windowOrder(id);
  if (!allowed.includes(window)) throw new UsageError(`--window 只能是 ${allowed.join(" | ")}`);
  const remaining = args[FLAGS].remaining;
  if (!Number.isFinite(remaining) || remaining < 0) throw new UsageError("--remaining 必填，且为 ≥0 的数字");
  const total = args[FLAGS].total;
  if (total !== undefined && (!Number.isFinite(total) || total <= 0 || total < remaining)) {
    throw new UsageError("--total 必须 >0 且不小于 --remaining");
  }
  const unit = (args[FLAGS].unit ?? "").trim();
  if (!unit) throw new UsageError("--unit 必填，例如 次 / % / USD");
  if (unit.length > 8) throw new UsageError("--unit 最多 8 个字符");
  let resetAt = null;
  if (args[FLAGS]["reset-at"] !== undefined) {
    const t = Date.parse(args[FLAGS]["reset-at"]);
    if (!Number.isFinite(t)) throw new UsageError("--reset-at 需要合法时间，例如 2026-11-06T09:00:00+08:00");
    if (t <= Date.now()) throw new UsageError("--reset-at 必须晚于当前时间");
    resetAt = new Date(t).toISOString();
  }

  const updatedAt = new Date().toISOString();
  const { updateState } = await import("./store.js");
  await updateState((state) => {
    const source = state.sources.x_premium;
    source.windows[window] = { remaining, total: total ?? null, unit, resetAt, updatedAt, window };
    source.status = "ok";
    source.error = null;
  });

  const payload = { ok: true, source: "x-premium", window, windows: { [window]: { remaining, total: total ?? null, unit, resetAt, updatedAt } } };
  if (args[FLAGS].json) return printJson(payload);
  console.log(`已更新 ${SOURCES.x_premium.name} · ${windowLabel(window)}：剩余 ${remaining} ${unit}${total ? ` / ${total} ${unit}` : ""} · 刚刚`);
}

function cmdClear(argv) {
  const args = parseArgs(argv, { yes: "bool", json: "bool" });
  if (!args[FLAGS].yes) throw new UsageError("clear 会清空全部额度数据；确认请加 --yes");
  clearStaleLock();
  clearState();
  if (args[FLAGS].json) return printJson({ ok: true, data: statePath() });
  console.log(`已清空额度数据：${statePath()}`);
}

async function cmdSources(argv) {
  const args = parseArgs(argv, { json: "bool", "set-default": "string" });
  const { state } = readState();

  if (args[FLAGS]["set-default"] !== undefined) {
    const raw = String(args[FLAGS]["set-default"]);
    const [rawSource, rawWindow] = raw.split("=");
    const id = resolveSource(rawSource);
    if (!id) throw new UsageError(`未知源：${rawSource}`);
    if (rawWindow !== "auto" && !windowOrder(id).includes(rawWindow)) {
      throw new UsageError(`默认窗口只能是 auto | ${windowOrder(id).join(" | ")}`);
    }
    return setDefaultWindow(id, rawWindow, args[FLAGS].json);
  }

  const rows = SOURCE_IDS.map((id) => ({
    id: SOURCES[id].id,
    key: id,
    name: SOURCES[id].name,
    mode: SOURCES[id].mode,
    url: SOURCES[id].url,
    workspace: SOURCES[id].workspace,
    defaultWindow: state.meta.defaultWindow[id],
  }));
  if (args[FLAGS].json) return printJson({ ok: true, sources: rows });
  for (const r of rows) {
    console.log(`${r.id.padEnd(14)} ${r.mode === "auto" ? "自动" : "手动"}  ${r.name}  默认 ${r.defaultWindow}  ${r.url ?? ""}`);
  }
}

async function setDefaultWindow(id, value, json) {
  const { updateState } = await import("./store.js");
  await updateState((state) => {
    state.meta.defaultWindow[id] = value;
  });
  if (json) return printJson({ ok: true, source: SOURCES[id].id, defaultWindow: value });
  console.log(`${SOURCES[id].name} 默认窗口已设为 ${value}`);
}

async function cmdProbe(argv) {
  const args = parseArgs(argv, { source: "string", json: "bool", out: "string", "keep-tab": "bool" });
  const raw = args[FLAGS].source ?? args._[0];
  const id = resolveSource(raw);
  if (!id) throw new UsageError("请用 --source 指定源：volcengine | opencode-go | x-premium");
  const json = Boolean(args[FLAGS].json);

  let report;
  try {
    report = await probeSource(id, { keepTab: Boolean(args[FLAGS]["keep-tab"]) });
  } catch (err) {
    if (err.code === "cdp_unavailable") {
      if (json) printJson({ ok: false, source: SOURCES[id].id, error: { code: "cdp_unavailable", message: "连不上 127.0.0.1:9333" } });
      else console.error(`调试端口未开：连不上 127.0.0.1:9333（用 --remote-debugging-port=9333 启动 Chrome）`);
      process.exitCode = EXIT.cdp;
      return;
    }
    if (err.code === "timeout") {
      const message = String(err.message ?? err);
      if (json) printJson({ ok: false, source: SOURCES[id].id, error: { code: "timeout", message } });
      else console.error(`读取超时：${message}`);
      process.exitCode = EXIT.timeout;
      return;
    }
    throw err;
  }

  const payload = { ok: report.parserOk, ...report };
  if (json) printJson(payload);
  else {
    console.log(`${SOURCES[id].name}  ${report.finalUrl}`);
    console.log(`  登录 ${report.loggedIn ? "是" : "否"} · 解析 ${report.parserOk ? "成功" : "失败"} · 窗口 ${report.windowsFound.join("/") || "无"}`);
    if (report.error) console.log(`  原因：${report.error.code} — ${report.error.message}`);
  }
  if (args[FLAGS].out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(String(args[FLAGS].out), JSON.stringify(payload, null, 2));
    console.log(`已写入 ${args[FLAGS].out}`);
  }
}

async function cmdServe(argv) {
  const args = parseArgs(argv, { port: "number", host: "string", token: "string" });
  const port = args[FLAGS].port ?? 8787;
  const host = args[FLAGS].host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") throw new UsageError("只允许绑定 127.0.0.1");
  const { startServer } = await import("./serve.js");
  try {
    await startServer({ port, host, token: args[FLAGS].token });
  } catch (err) {
    if (err.code === "EADDRINUSE") throw new DataError(`端口 ${port} 已被占用，请用 --port 指定其它端口`);
    throw err;
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  if (argv.includes("--version") || argv[0] === "-v") {
    process.stdout.write(`${SCHEMA_VERSION}\n`);
    return;
  }
  if (argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    process.stdout.write(USAGE + "\n");
    return;
  }
  const cmd = argv[0];
  const rest = argv.slice(1);
  switch (cmd) {
    case "init":
      return cmdInit(rest);
    case "doctor":
      return cmdDoctor(rest);
    case "fetch":
    case "refresh":
      return cmdFetch(rest);
    case "list":
    case "show":
      return cmdList(rest);
    case "set":
      return cmdSet(rest);
    case "clear":
    case "reset":
      return cmdClear(rest);
    case "sources":
      return cmdSources(rest);
    case "probe":
      return cmdProbe(rest);
    case "serve":
      return cmdServe(rest);
    default:
      process.stderr.write(`未知命令：${cmd}\n\n${USAGE}\n`);
      process.exitCode = EXIT.usage;
  }
}

main().catch((err) => {
  if (err instanceof UsageError) {
    process.stderr.write(`参数错误：${err.message}\n`);
    process.exitCode = EXIT.usage;
    return;
  }
  if (err instanceof DataError) {
    process.stderr.write(`数据错误：${err.message}\n`);
    process.exitCode = EXIT.data;
    return;
  }
  if (err.code === "UNKNOWN_VERSION") {
    process.stderr.write(`数据版本较新（schemaVersion=${err.found ?? "?"}），请升级 CLI；数据文件：${err.path ?? statePath()}\n`);
    process.exitCode = EXIT.data;
    return;
  }
  if (err.code === "STALE_VERSION") {
    process.stderr.write(`数据版本过旧（schemaVersion=${err.found ?? "?"}），请升级或运行 quota clear --yes 后重新录入\n`);
    process.exitCode = EXIT.data;
    return;
  }
  if (err.code === "CORRUPT") {
    process.stderr.write(`数据文件损坏：${err.path ?? statePath()}。修复：quota clear --yes\n`);
    process.exitCode = EXIT.data;
    return;
  }
  process.stderr.write(`失败：${err.message}\n`);
  process.exitCode = EXIT.data;
});
