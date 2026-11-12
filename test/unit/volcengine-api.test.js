import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVolcengine, parseVolcengineApi } from "../../src/parsers/volcengine.js";
import { apiCredentials, loadSecret, readApiSource, usesApiTransport } from "../../src/api.js";
import { registry } from "../../src/model.js";

const NOW = new Date("2026-11-12T08:00:00.000Z");

// Hermetic: loadSecret falls back to ~/.ai-quota-dashboard/credentials.json, so
// point HOME at an empty directory for this file's tests.
const HOME = mkdtempSync(join(tmpdir(), "quota-volc-home-"));
process.env.HOME = HOME;

const okBody = (rows) => ({
  ResponseMetadata: { RequestId: "req-1", Action: "GetCodingPlanUsage", Version: "2024-01-01" },
  Result: { QuotaUsage: rows },
});

test("OpenAPI response: session/weekly/monthly percentages become remaining windows", () => {
  const reset = 1763000000; // unix seconds
  const parsed = parseVolcengineApi(
    okBody([
      { Level: "session", Percent: 12.5, ResetTimestamp: reset },
      { Level: "weekly", Percent: 0, ResetTimestamp: reset + 3600 },
      { Level: "monthly", Percent: 99.9, ResetTimestamp: -1 },
    ]),
    NOW,
  );
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(Object.keys(parsed.windows).sort(), ["h5", "month", "week"]);
  assert.equal(parsed.windows.h5.remaining, 87.5);
  assert.equal(parsed.windows.week.remaining, 100);
  assert.equal(parsed.windows.month.remaining, 0.1);
  assert.equal(parsed.windows.h5.total, 100);
  assert.equal(parsed.windows.h5.unit, "%");
  assert.equal(parsed.windows.h5.resetAt, new Date(reset * 1000).toISOString());
  assert.equal(parsed.windows.month.resetAt, null, "-1 means no scheduled reset");
  assert.equal(parsed.mainWindow, "h5");
  assert.equal(parsed.adapterVersion, "volc-api-v1");
});

test("sub-one percentages are percents, not fractions", () => {
  const parsed = parseVolcengineApi(okBody([{ Level: "session", Percent: 0.5 }]), NOW);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.windows.h5.remaining, 99.5);
});

test("parser dispatches on type: JSON to the OpenAPI shape, text to the console shape", () => {
  const viaJson = parseVolcengine(okBody([{ Level: "weekly", Percent: 40 }]), NOW);
  assert.equal(viaJson.ok, true);
  assert.equal(viaJson.windows.week.remaining, 60);
  const viaText = parseVolcengine("立即登录使用", NOW);
  assert.equal(viaText.code, "not_logged_in");
});

test("unknown levels are ignored and never guessed into a window", () => {
  const parsed = parseVolcengineApi(
    okBody([
      { Level: "daily", Percent: 30 },
      { Level: "session", Percent: 10 },
      { Level: "weekly", Percent: 20 },
    ]),
    NOW,
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.windows).sort(), ["h5", "week"]);
});

test("missing or empty QuotaUsage is parse_failed with a readable reason", () => {
  const missing = parseVolcengineApi({ ResponseMetadata: {} }, NOW);
  assert.equal(missing.code, "parse_failed");
  assert.match(missing.message, /QuotaUsage/);
  const empty = parseVolcengineApi(okBody([]), NOW);
  assert.equal(empty.code, "parse_failed");
  assert.match(empty.message, /Coding Plan/);
  const outOfRange = parseVolcengineApi(okBody([{ Level: "session", Percent: 140 }]), NOW);
  assert.equal(outOfRange.code, "parse_failed");
});

test("credentials: an AK/SK pair loads from env, env wins over the file, half a pair is incomplete", () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-volc-"));
  const file = join(dir, "credentials.json");
  writeFileSync(file, JSON.stringify({ VOLC_ACCESS_KEY: "file-ak", VOLC_SECRET_KEY: "file-sk" }));
  chmodSync(file, 0o600);
  const auth = {
    env: ["VOLC_ACCESS_KEY"],
    secretEnv: ["VOLC_SECRET_KEY"],
    file,
    fields: ["VOLC_ACCESS_KEY"],
    secretFields: ["VOLC_SECRET_KEY"],
  };

  assert.deepEqual(loadSecret(auth, {}), { token: "file-ak", secret: "file-sk", accountId: null });
  assert.deepEqual(
    { token: loadSecret(auth, { VOLC_ACCESS_KEY: "env-ak", VOLC_SECRET_KEY: "env-sk" }).token },
    { token: "env-ak" },
  );
  assert.deepEqual(
    { token: loadSecret(auth, { VOLC_ACCESS_KEY: "env-ak" }).token, secret: loadSecret(auth, { VOLC_ACCESS_KEY: "env-ak" }).secret },
    { token: "env-ak", secret: "file-sk" },
  );
  assert.equal(loadSecret({ ...auth, file: undefined }, {}), null);
});

test("single-token sources keep working: secret stays null", () => {
  const secret = loadSecret(registry.get("deepseek").auth, { DEEPSEEK_API_KEY: "sk-test" });
  assert.equal(secret.token, "sk-test");
  assert.equal(secret.secret, null);
  assert.equal(apiCredentials("deepseek", {}), null);
});

test("transport: volcengine uses the API only when the full pair resolves", () => {
  assert.equal(usesApiTransport("volcengine", {}), false);
  assert.equal(usesApiTransport("volcengine", { VOLC_ACCESS_KEY: "ak" }), false);
  assert.equal(usesApiTransport("volcengine", { VOLC_ACCESS_KEY: "ak", VOLC_SECRET_KEY: "sk" }), true);
  assert.equal(usesApiTransport("deepseek", {}), true, "fixed api transport does not depend on env");
  assert.equal(usesApiTransport("opencode_go", {}), false);
  assert.equal(usesApiTransport("no-such-source", {}), false);
});

test("signed API read: request targets the OpenAPI action and parses the windows", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(okBody([{ Level: "session", Percent: 25, ResetTimestamp: 1763000000 }])), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await readApiSource("volcengine", {
    env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE", VOLC_SECRET_KEY: "secret" },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.windows.h5.remaining, 75);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "");
  assert.match(calls[0].url, /^https:\/\/open\.volcengineapi\.com\/\?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01$/);
  assert.match(
    calls[0].init.headers.Authorization,
    /^HMAC-SHA256 Credential=AKLTEXAMPLE\/\d{8}\/cn-beijing\/ark\/request, SignedHeaders=host;x-date;x-content-sha256;content-type, Signature=[0-9a-f]{64}$/,
  );
});

test("signed API read: missing SecretKey is config_error, not a signed request", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not be called");
  });
  const result = await readApiSource("volcengine", { env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE" } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "config_error");
  assert.match(result.message, /VOLC_SECRET_KEY/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("signed API read: upstream error codes are auth_failed with a recovery hint", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        ResponseMetadata: {
          Error: { Code: "SignatureDoesNotMatch", Message: "the signature is invalid" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const result = await readApiSource("volcengine", {
    env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE", VOLC_SECRET_KEY: "wrong" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "auth_failed");
  assert.match(result.message, /SignatureDoesNotMatch/);
  assert.match(result.message, /VOLC_SECRET_KEY/);
});

test("signed API read: HTTP 401 is auth_failed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("denied", { status: 401 }));
  const result = await readApiSource("volcengine", {
    env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE", VOLC_SECRET_KEY: "secret" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "auth_failed");
  assert.match(result.message, /401/);
});

test("signed API read: network failure names the endpoint", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("getaddrinfo ENOTFOUND open.volcengineapi.com");
  });
  const result = await readApiSource("volcengine", {
    env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE", VOLC_SECRET_KEY: "secret" },
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /open\.volcengineapi\.com/);
});

test("performFetch: an AK/SK pair routes volcengine to the OpenAPI and stores remaining windows", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "quota-volc-state-"));
  const prev = process.env.QUOTA_DATA_DIR;
  process.env.QUOTA_DATA_DIR = dir;
  try {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify(
          okBody([
            { Level: "session", Percent: 25, ResetTimestamp: 1763000000 },
            { Level: "weekly", Percent: 50 },
          ]),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { performFetch } = await import("../../src/refresh.js");
    const result = await performFetch({
      ids: ["volcengine"],
      timeoutSec: 5,
      env: { VOLC_ACCESS_KEY: "AKLTEXAMPLE", VOLC_SECRET_KEY: "secret" },
    });
    assert.equal(result.summary.succeeded, 1);
    assert.equal(result.summary.partial, 1);
    assert.equal(result.exitCode, 7, "a missing month is partial, not a hard failure");
    assert.equal(result.sources.volcengine.windows.h5.remaining, 75);
    assert.equal(result.sources.volcengine.windows.week.remaining, 50);
    assert.equal(result.sources.volcengine.windows.month, null);
    assert.equal(result.sources.volcengine.error.code, "partial");
    assert.deepEqual(result.sources.volcengine.error.missingWindows, ["month"]);
  } finally {
    if (prev === undefined) delete process.env.QUOTA_DATA_DIR;
    else process.env.QUOTA_DATA_DIR = prev;
  }
});

test("performFetch: without the pair volcengine keeps the console path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-volc-state-"));
  const prevData = process.env.QUOTA_DATA_DIR;
  const prevCdp = process.env.QUOTA_CDP;
  process.env.QUOTA_DATA_DIR = dir;
  process.env.QUOTA_CDP = "http://127.0.0.1:1";
  try {
    const { performFetch } = await import("../../src/refresh.js");
    const result = await performFetch({ ids: ["volcengine"], timeoutSec: 5, env: {} });
    assert.equal(result.summary.failed, 1);
    assert.equal(result.sources.volcengine.error.code, "cdp_unavailable");
  } finally {
    if (prevData === undefined) delete process.env.QUOTA_DATA_DIR;
    else process.env.QUOTA_DATA_DIR = prevData;
    if (prevCdp === undefined) delete process.env.QUOTA_CDP;
    else process.env.QUOTA_CDP = prevCdp;
  }
});
