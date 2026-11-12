import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, statSync, chmodSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../bin/quota.js", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "quota-test-"));

function run(args, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, QUOTA_CDP: "http://127.0.0.1:1", QUOTA_TEST_MOCK: "", AQD_TEST_MOCK: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

const json = (out) => JSON.parse(out);
const readState = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const bytes = (dir) => readFileSync(join(dir, "state.json"));

test("set auto-creates data dir 0700 + state.json 0600, no config.json", () => {
  const dir = join(tmp(), "new");
  const r = run(["set", "x-premium", "--window", "h5", "--remaining", "1", "--total", "10", "--unit", "次", "--json"], {
    QUOTA_DATA_DIR: dir,
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, "state.json")).mode & 0o777, 0o600);
  assert.equal(existsSync(join(dir, "config.json")), false);
  const s = readState(dir);
  assert.equal(s.sources.x_premium.windows.h5.remaining, 1);
  assert.equal(s.meta.defaultWindow.opencode_go, "h5");
});

test("fetch with mock only creates state.json (no config), exit 0", () => {
  const dir = tmp();
  const r = run(["fetch", "--source", "opencode-go", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "ok" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(existsSync(join(dir, "config.json")), false);
  const s = readState(dir);
  assert.equal(s.sources.opencode_go.windows.month.remaining, 70);
});

test("list --json empty state: schemaVersion=current, three null windows, meta defaults", () => {
  const dir = tmp();
  const r = run(["list", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 0, r.stderr);
  const d = json(r.stdout);
  assert.equal(d.schemaVersion, 3);
  for (const id of ["opencode_go", "alibaba", "x_premium"]) assert.ok(d.sources[id]);
  assert.deepEqual(Object.keys(d.sources.alibaba.windows), ["h5", "week", "month"]);
  assert.equal(d.sources.alibaba.status, "never");
  assert.equal(d.sources.x_premium.status, "never");
  assert.equal(d.sources.alibaba.defaultWindow, "h5");
  assert.equal(d.sources.opencode_go.defaultWindow, "h5");
  assert.ok(!JSON.stringify(d).match(/NaN|undefined/));
});

test("sources --json lists built-in sources; --set-default writes meta", () => {
  const dir = tmp();
  const before = run(["sources", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(before.code, 0, before.stderr);
  const d = json(before.stdout);
  assert.deepEqual(d.sources.map((s) => s.id).slice(0, 3), ["opencode-go", "x-premium", "claude"]);
  assert.equal(d.sources[0].workspace, "auto");
  assert.ok(d.sources[0].url);
  assert.equal(d.sources[0].defaultWindow, "h5");
  assert.equal(existsSync(join(dir, "config.json")), false);

  assert.equal(run(["sources", "--set-default", "opencode-go=week"], { QUOTA_DATA_DIR: dir }).code, 0);
  const after = json(run(["sources", "--json"], { QUOTA_DATA_DIR: dir }).stdout);
  assert.equal(after.sources[0].defaultWindow, "week");
  assert.equal(readState(dir).meta.defaultWindow.opencode_go, "week");

  assert.equal(run(["sources", "--set-default", "nope=week"], { QUOTA_DATA_DIR: dir }).code, 2);
  assert.equal(run(["sources", "--set-default", "opencode-go=2h"], { QUOTA_DATA_DIR: dir }).code, 2);
});

test("set writes one window; others survive; status ok", () => {
  const dir = tmp();
  assert.equal(run(["set", "x-premium", "--window", "h5", "--remaining", "7", "--total", "10", "--unit", "次"], { QUOTA_DATA_DIR: dir }).code, 0);
  run(["set", "x-premium", "--window", "week", "--remaining", "3", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  run(["set", "x-premium", "--window", "month", "--remaining", "1", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  const s = readState(dir).sources.x_premium;
  assert.equal(s.windows.h5.remaining, 7);
  assert.equal(s.windows.week.remaining, 3);
  assert.equal(s.windows.month.remaining, 1);
  assert.equal(s.status, "ok");
});

test("set rejects bad input with exit 2 and leaves data untouched", () => {
  const dir = tmp();
  run(["set", "x-premium", "--window", "h5", "--remaining", "7", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  const before = bytes(dir);
  const cases = [
    ["set", "x-premium", "--window", "h5", "--remaining", "1", "--unit", ""],
    ["set", "x-premium", "--window", "2h", "--remaining", "1", "--unit", "次"],
    ["set", "x-premium", "--window", "5h", "--remaining", "1", "--unit", "次"],
    ["set", "x-premium", "--window", "h5", "--remaining", "1", "--unit", "次", "--reset-at", "2020-01-01T00:00:00Z"],
    ["set", "x-premium", "--window", "h5", "--remaining", "-1", "--unit", "次"],
    ["set", "x-premium", "--window", "h5", "--remaining", "1", "--total", "0", "--unit", "次"],
    ["set", "x-premium", "--window", "h5", "--remaining", "5", "--total", "1", "--unit", "次"],
    ["set", "claude", "--window", "h5", "--remaining", "1", "--unit", "次"],
    ["set", "nope", "--window", "h5", "--remaining", "1", "--unit", "次"],
  ];
  for (const args of cases) {
    const r = run(args, { QUOTA_DATA_DIR: dir });
    assert.equal(r.code, 2, `${args.join(" ")} => ${r.code} ${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.ok(r.stderr.length > 0);
  }
  assert.deepEqual(bytes(dir), before);
});

test("fetch mock matrix maps to the agreed exit codes", () => {
  const dir = tmp();
  const cases = [
    ["ok", 0],
    ["not_logged_in", 4],
    ["parse_failed", 5],
    ["partial_source", 7],
    ["partial_windows", 7],
    ["mixed_failure", 1],
  ];
  for (const [mode, want] of cases) {
    const r = run(["fetch", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: mode });
    assert.equal(r.code, want, `${mode} => ${r.code} ${r.stderr}`);
    assert.ok(json(r.stdout).summary.requested >= 3);
  }
});

test("AQD_TEST_MOCK remains a compatibility alias", () => {
  const r = run(["fetch", "--json"], { QUOTA_DATA_DIR: tmp(), AQD_TEST_MOCK: "ok", QUOTA_TEST_MOCK: "" });
  assert.equal(r.code, 0, r.stderr);
});

test("a source without credentials exits 4 and keeps config_error in the state file", () => {
  // HOME points at an empty dir so no official client credential file is found.
  const dir = join(tmp(), "data");
  const home = tmp();
  const r = run(["fetch", "--source", "claude", "--json"], {
    QUOTA_DATA_DIR: dir,
    HOME: home,
    ANTHROPIC_OAUTH_TOKEN: "",
  });
  assert.equal(r.code, 4, `counted as a credential problem, not a mixed failure: ${r.stderr}`);
  assert.equal(json(r.stdout).sources.claude.status, "config_error");
  assert.equal(readState(dir).sources.claude.status, "config_error");
});

test("--timeout is one total budget for the whole command", () => {
  const dir = tmp();
  const started = Date.now();
  const r = run(["fetch", "--timeout", "2", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "timeout" });
  const elapsed = Date.now() - started;
  assert.equal(r.code, 6);
  assert.ok(elapsed < 3200, `elapsed ${elapsed}ms should be ~2s, not per-source 2s`);
});

test("failed attempt keeps old windows and records status", () => {
  const dir = tmp();
  run(["fetch", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "ok" });
  assert.equal(readState(dir).sources.opencode_go.windows.week.remaining, 80);
  const r = run(["fetch", "--source", "opencode-go", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "not_logged_in" });
  assert.equal(r.code, 4);
  const s = readState(dir).sources.opencode_go;
  assert.equal(s.windows.week.remaining, 80);
  assert.equal(s.status, "not_logged_in");
});

test("partial windows: h5 updates, week/month kept, missingWindows reported, exit 7", () => {
  const dir = tmp();
  run(["fetch", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "ok" });
  const r = run(["fetch", "--source", "opencode-go", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "partial_windows" });
  assert.equal(r.code, 7);
  const d = json(r.stdout);
  assert.equal(d.sources.opencode_go.status, "partial");
  assert.deepEqual(d.sources.opencode_go.error.missingWindows.sort(), ["month", "week"]);
  const s = readState(dir).sources.opencode_go;
  assert.equal(s.windows.h5.remaining, 30);
  assert.equal(s.windows.week.remaining, 80);
  assert.equal(s.windows.month.remaining, 70);
});

test("CDP down: fetch 3; doctor 3 with hints and no config check", () => {
  const dir = tmp();
  const r = run(["fetch", "--source", "x-premium", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 3);
  assert.equal(json(r.stdout).sources.x_premium.error.code, "cdp_unavailable");

  const doc = run(["doctor", "--json"], { QUOTA_DATA_DIR: dir, HOME: tmp() });
  assert.equal(doc.code, 3);
  const d = json(doc.stdout);
  assert.equal(d.ok, false);
  assert.deepEqual(Object.keys(d.checks).sort(), ["cdp", "dataDir", "schema", "serverPort"]);
  assert.equal(d.checks.cdp.status, "fail");
  assert.match(d.checks.cdp.message, /127\.0\.0\.1:9333/);
  assert.match(d.checks.cdp.message, /--remote-debugging-port=9333/);
  assert.equal(d.checks.schema.status, "ok");
});

test("doctor: busy server port is warn, not fail", async () => {
  const dir = tmp();
  run(["list", "--json"], { QUOTA_DATA_DIR: dir });
  const srv = createServer();
  const bound = await new Promise((resolve) => {
    srv.once("error", () => resolve(false));
    srv.listen(8787, "127.0.0.1", () => resolve(true));
  });
  try {
    if (!bound) return; // 8787 already taken by something else: skip
    const r = run(["doctor", "--json"], { QUOTA_DATA_DIR: dir });
    const d = json(r.stdout);
    assert.equal(d.checks.serverPort.status, "warn");
    assert.notEqual(r.code, 8, "busy port alone must not fail");
  } finally {
    if (bound) await new Promise((res) => srv.close(res));
  }
});

test("schemaVersion+1: show/fetch/set exit 8 and never rewrite the file (BUG-21)", () => {
  const dir = tmp();
  const doc = {
    schemaVersion: 4,
    sources: {},
    meta: { lastFetchAt: null, defaultWindow: { opencode_go: "h5", x_premium: "h5" } },
  };
  writeFileSync(join(dir, "state.json"), JSON.stringify(doc));
  const before = bytes(dir);

  for (const args of [
    ["list", "--json"],
    ["fetch", "--json"],
    ["set", "x-premium", "--window", "h5", "--remaining", "1", "--unit", "次"],
  ]) {
    const r = run(args, { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "ok" });
    assert.equal(r.code, 8, `${args.join(" ")} => ${r.code} ${r.stderr}`);
    assert.match(r.stderr, /数据版本较新/);
    assert.deepEqual(bytes(dir), before, `${args.join(" ")} must not touch the file`);
  }
});

test("schemaVersion 2 migrates on read and keeps the numbers", () => {
  const dir = tmp();
  const updatedAt = "2026-11-05T11:00:00.000Z";
  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify({
      schemaVersion: 2,
      sources: {
        claude: {
          status: "ok",
          mode: "auto",
          windows: {
            h5: { remaining: 98.88, total: 100, unit: "%", resetAt: null, updatedAt, window: "h5" },
          },
        },
      },
      meta: { lastFetchAt: updatedAt, defaultWindow: { claude: "auto", opencode_go: "h5", x_premium: "week" } },
    }),
  );
  const r = run(["list", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(json(r.stdout).sources.claude.windows.h5.remaining, 98.88);
  const stored = readState(dir);
  assert.equal(stored.schemaVersion, 3);
  assert.equal(stored.sources.claude.windows.h5.remaining, 98.88);
  assert.equal(stored.meta.migratedFrom, 2);
});

test("older schemaVersion is refused with exit 8, not migrated", () => {
  const dir = tmp();
  writeFileSync(join(dir, "state.json"), JSON.stringify({ schemaVersion: 1, sources: {}, meta: {} }));
  const before = bytes(dir);
  const r = run(["list", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 8);
  assert.match(r.stderr, /过旧/);
  assert.deepEqual(bytes(dir), before);
});

test("corrupt data exits 8 and is not overwritten", () => {
  const dir = tmp();
  writeFileSync(join(dir, "state.json"), "not-json");
  const r = run(["list", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 8);
  assert.match(r.stderr, /损坏/);
  assert.equal(readFileSync(join(dir, "state.json"), "utf8"), "not-json");
  assert.equal(run(["set", "x-premium", "--window", "h5", "--remaining", "1", "--unit", "次"], { QUOTA_DATA_DIR: dir }).code, 8);
});

test("clear needs --yes and empties data without deleting the dir", () => {
  const dir = tmp();
  run(["set", "x-premium", "--window", "h5", "--remaining", "5", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  assert.equal(run(["clear"], { QUOTA_DATA_DIR: dir }).code, 2);
  assert.equal(readState(dir).sources.x_premium.windows.h5.remaining, 5);
  assert.equal(run(["clear", "--yes"], { QUOTA_DATA_DIR: dir }).code, 0);
  assert.equal(readState(dir).sources.x_premium.windows.h5, null);
  assert.ok(existsSync(dir));
  assert.equal(run(["reset", "--yes"], { QUOTA_DATA_DIR: dir }).code, 0, "reset stays as an alias");
});

test("probe is read-only, takes --source, and exits 3 when CDP is down", () => {
  const dir = tmp();
  run(["set", "x-premium", "--window", "h5", "--remaining", "5", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  const before = bytes(dir);
  const r = run(["probe", "--source", "opencode-go", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(r.code, 3);
  const d = json(r.stdout);
  assert.equal(d.ok, false);
  assert.equal(d.error.code, "cdp_unavailable");
  assert.deepEqual(bytes(dir), before);
  assert.equal(run(["probe", "--source", "nope", "--json"], { QUOTA_DATA_DIR: dir }).code, 2);
});

test("unknown flag / command / --version", () => {
  const dir = tmp();
  const bad = run(["list", "--source", "bogus", "--json"], { QUOTA_DATA_DIR: dir });
  assert.equal(bad.code, 2);
  assert.equal(bad.stdout, "");
  assert.match(bad.stderr, /未知参数/);

  const nope = run(["nope"], { QUOTA_DATA_DIR: dir });
  assert.equal(nope.code, 2);
  assert.equal(nope.stdout, "");
  assert.match(nope.stderr, /未知命令/);

  const v = run(["--version"], { QUOTA_DATA_DIR: dir });
  assert.equal(v.code, 0);
  assert.equal(v.stdout.trim(), "3");
});

test("fetch --source x-premium is an auto source", () => {
  const dir = tmp();
  const r = run(["fetch", "--source", "x-premium", "--json"], { QUOTA_DATA_DIR: dir, QUOTA_TEST_MOCK: "ok" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(json(r.stdout).sources.x_premium.windows.week.remaining, 31);
  assert.equal(json(r.stdout).sources.x_premium.status, "ok");
});

test("data dir not writable => exit 8 with a path message, not 'locked'", () => {
  const dir = join(tmp(), "readonly");
  run(["set", "x-premium", "--window", "h5", "--remaining", "1", "--unit", "次"], { QUOTA_DATA_DIR: dir });
  chmodSync(dir, 0o500);
  try {
    const r = run(["set", "x-premium", "--window", "h5", "--remaining", "6", "--unit", "次"], { QUOTA_DATA_DIR: dir });
    assert.equal(r.code, 8, r.stderr);
    assert.doesNotMatch(r.stderr, /locked by/);
  } finally {
    chmodSync(dir, 0o700);
  }
});
