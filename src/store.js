import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync, chmodSync, statSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emptyState, normalizeState, SCHEMA_VERSION } from "./model.js";
import { DataError } from "./errors.js";

export function dataDir() {
  return process.env.QUOTA_DATA_DIR || join(homedir(), ".ai-quota-dashboard");
}
export function statePath() {
  return join(dataDir(), "state.json");
}

export function ensureDir({ tighten = false } = {}) {
  const dir = dataDir();
  const existed = existsSync(dir);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!existed || tighten) chmodSync(dir, 0o700);
  } catch (err) {
    throw new DataError(`无法创建或访问数据目录 ${dir}：${err.code ?? err.message}`, { cause: err });
  }
  return dir;
}

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new DataError(`无法读取${label} ${path}：${err.code ?? err.message}`, { cause: err });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error(`${label} ${path} 不是合法 JSON`), { code: "CORRUPT", path });
  }
}

/**
 * @returns {{state:any, path:string}}
 * @throws {Error & {code:string}} CORRUPT | UNKNOWN_VERSION | STALE_VERSION | data_error
 */
export function readState() {
  const path = statePath();
  const doc = readJson(path, "数据文件");
  if (doc === null) return { state: emptyState(), path };
  try {
    const { state, migrated } = normalizeState(doc);
    if (migrated) writeState(state);
    return { state, path };
  } catch (err) {
    throw Object.assign(err, { path });
  }
}

function writeJsonAtomic(path, value, label) {
  ensureDir();
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw new DataError(`无法写入${label} ${path}：${err.code ?? err.message}`, { cause: err });
  }
}

export function writeState(state) {
  const { state: clean } = normalizeState({ ...state, schemaVersion: SCHEMA_VERSION });
  writeJsonAtomic(statePath(), clean, "数据文件");
  return statePath();
}

/** Create the data dir + empty state if missing. Never overwrites an existing state. */
export function ensureState() {
  ensureDir({ tighten: true });
  const existed = existsSync(statePath());
  if (!existed) writeState(emptyState());
  return { dir: dataDir(), path: statePath(), created: !existed };
}

/** Clear quota data (state only). */
export function clearState() {
  ensureDir();
  writeState(emptyState());
  return statePath();
}

const LOCK = ".lock";

/**
 * Read-modify-write with a coarse lock.
 * A permission failure is a data error, not lock contention.
 */
export async function updateState(mutate) {
  ensureDir();
  const lock = join(dataDir(), LOCK);
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
      break;
    } catch (err) {
      if (err.code === "EEXIST") {
        if (Date.now() > deadline) {
          throw new DataError(`数据目录被另一个进程锁定：${lock}。确认没有其它 quota 进程后可删除该文件`);
        }
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      throw new DataError(`无法写入数据目录 ${dataDir()}：${err.code ?? err.message}`, { cause: err });
    }
  }
  try {
    const { state } = readState();
    await mutate(state);
    return writeState(state);
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}

/** Remove a stale lock (used by clear) — never touches data. */
export function clearStaleLock() {
  try {
    rmSync(join(dataDir(), LOCK), { force: true });
  } catch {
    /* ignore */
  }
}
