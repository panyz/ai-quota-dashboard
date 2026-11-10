import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "quota-serve-"));
process.env.QUOTA_DATA_DIR = dir;
delete process.env.QUOTA_CDP;

const { ensureState } = await import("../../src/store.js");
const { SCHEMA_VERSION } = await import("../../src/model.js");
const { startServer } = await import("../../src/serve.js");

ensureState();

async function withServer(env, fn) {
  const prev = process.env.AQD_TEST_MOCK;
  if (env.mock) process.env.AQD_TEST_MOCK = env.mock;
  else delete process.env.AQD_TEST_MOCK;
  const { server, token, port } = await startServer({ port: 0, host: "127.0.0.1" });
  try {
    await fn({ server, token, port, base: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((r) => server.close(r));
    if (prev === undefined) delete process.env.AQD_TEST_MOCK;
    else process.env.AQD_TEST_MOCK = prev;
  }
}

test("binds 127.0.0.1 and prints a token URL", async () => {
  await withServer({ mock: "ok" }, async ({ server, token, base }) => {
    assert.equal(server.address().address, "127.0.0.1");
    assert.ok(token && token.length >= 16);
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

test("API requires the token; state matches show --json shape", async () => {
  await withServer({ mock: "ok" }, async ({ token, base }) => {
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal((await fetch(`${base}/api/state?token=deadbeef`)).status, 401);
    assert.equal((await fetch(`${base}/api/refresh`, { method: "POST" })).status, 401);

    const res = await fetch(`${base}/api/state?token=${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null, "no CORS header");
    const d = await res.json();
    assert.equal(d.schemaVersion, SCHEMA_VERSION);
    for (const id of ["opencode_go", "volcengine", "x_premium"]) assert.ok(d.sources[id]);
    assert.deepEqual(Object.keys(d.sources.volcengine.windows), ["h5", "week", "month"]);
    assert.equal(d.sources.volcengine.mode, "auto");
    assert.equal(d.sources.x_premium.status, "never");
    assert.equal(d.sources.x_premium.mode, "auto");
    assert.deepEqual(d.sources.x_premium.reportedWindows, ["week"]);
    assert.deepEqual(d.sources.volcengine.reportedWindows, ["h5", "week", "month"]);
  });
});

test("POST /api/refresh refreshes and persists; second concurrent call gets 409", async () => {
  await withServer({ mock: "timeout" }, async ({ token, base }) => {
    const p1 = fetch(`${base}/api/refresh?token=${token}`, { method: "POST" });
    await new Promise((r) => setTimeout(r, 150));
    const second = await fetch(`${base}/api/refresh?token=${token}`, { method: "POST" });
    assert.equal(second.status, 409, "refresh in progress");
    const first = await p1;
    assert.equal(first.status, 200);
    const d = await first.json();
    assert.ok(d.summary.requested >= 3);
    assert.equal(d.ok, false);
  });
});

test("page has a refresh button, a data path, and no timer", async () => {
  await withServer({ mock: "ok" }, async ({ base }) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /<button[^>]*id="refresh"/);
    assert.match(html, /<button[^>]*id="reload"/);
    assert.match(html, /重新读取/);
    assert.match(html, /刷新额度/);
    assert.match(html, /data-datapath="[^"]*state\.json"/);
    const js = await (await fetch(`${base}/app.js`)).text();
    assert.doesNotMatch(js, /setInterval|setTimeout\(\s*load/);
    assert.doesNotMatch(js, /quota set x-premium/);
    assert.match(js, /id="reload"|reloadBtn/);
    assert.match(js, /reportedWindows/);
    assert.match(js, /refresh\(\);/);
  });
});

test("no-token page shows a notice and does not call the API", async () => {
  await withServer({ mock: "ok" }, async ({ base }) => {
    const js = await (await fetch(`${base}/app.js`)).text();
    assert.match(js, /缺少访问 token/);
    assert.match(js, /if \(!token\) return;/);
  });
});

test("data errors surface as 500 with a reset hint, not a blank page", async () => {
  const bad = mkdtempSync(join(tmpdir(), "quota-bad-"));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(bad, "state.json"), "not-json");
  const prevDir = process.env.QUOTA_DATA_DIR;
  process.env.QUOTA_DATA_DIR = bad;
  try {
    await withServer({ mock: "ok" }, async ({ token, base }) => {
      const res = await fetch(`${base}/api/state?token=${token}`);
      assert.equal(res.status, 500);
      const d = await res.json();
      assert.equal(d.error, "data_error");
      assert.match(d.hint, /quota clear --yes/);
    });
  } finally {
    process.env.QUOTA_DATA_DIR = prevDir;
  }
});

test("app.js is shipped without external URLs", () => {
  const js = readFileSync(fileURLToPath(new URL("../../src/web/app.js", import.meta.url)), "utf8");
  assert.doesNotMatch(js, /https?:\/\//);
});
