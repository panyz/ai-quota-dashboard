import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalQuery,
  uriEncode,
  volcengineDate,
  volcengineSignedRequest,
} from "../../src/volcengine-sign.js";

const NOW = new Date("2026-11-12T08:00:00.000Z");
const BASE = {
  action: "GetCodingPlanUsage",
  accessKey: "AKLTEXAMPLEACCESSKEY",
  secretKey: "sk-example-secret",
  now: NOW,
};

test("x-date uses the Volcengine compact UTC format", () => {
  assert.equal(volcengineDate(NOW), "20261112T080000Z");
  assert.match(volcengineDate(new Date("2026-01-02T03:04:05.678Z")), /^20260102T030405Z$/);
});

test("canonical query is sorted and RFC 3986 encoded", () => {
  assert.equal(
    canonicalQuery({ action: "GetCodingPlanUsage", version: "2024-01-01", region: "cn-beijing" }),
    "Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01",
  );
  assert.equal(uriEncode("a b/c+d"), "a%20b%2Fc%2Bd");
  assert.equal(uriEncode("cn-beijing"), "cn-beijing");
});

test("signed request: fixed header order, /request scope, HMAC-SHA256 prefix", () => {
  const req = volcengineSignedRequest(BASE);
  assert.equal(req.method, "POST");
  assert.equal(req.body, "");
  assert.equal(
    req.url,
    "https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01",
  );
  assert.deepEqual(Object.keys(req.headers).sort(), [
    "Authorization",
    "Content-Type",
    "Host",
    "X-Content-Sha256",
    "X-Date",
  ]);
  assert.equal(req.headers["X-Date"], "20261112T080000Z");
  assert.equal(req.headers["Content-Type"], "application/json; charset=utf-8");
  // sha256 of the empty body
  assert.equal(req.headers["X-Content-Sha256"], "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.match(
    req.headers.Authorization,
    /^HMAC-SHA256 Credential=AKLTEXAMPLEACCESSKEY\/20261112\/cn-beijing\/ark\/request, SignedHeaders=host;x-date;x-content-sha256;content-type, Signature=[0-9a-f]{64}$/,
  );
});

test("signature is stable for fixed inputs (regression lock)", () => {
  // Cross-checked against the working community implementation; this vector
  // pins the exact canonical request so a refactor cannot silently change it.
  const req = volcengineSignedRequest(BASE);
  assert.match(req.headers.Authorization, /Signature=1d410b0ea711f13c504d120400f7cf1f5e9f609a5e5af9d58e8554fc811e4eb5$/);
  assert.equal(
    volcengineSignedRequest(BASE).headers.Authorization,
    req.headers.Authorization,
    "same input must sign the same request",
  );
});

test("every signed input changes the signature", () => {
  const signature = (overrides) => {
    const req = volcengineSignedRequest({ ...BASE, ...overrides });
    return req.headers.Authorization.split("Signature=")[1];
  };
  const baseline = signature({});
  assert.notEqual(signature({ secretKey: "other-secret" }), baseline);
  assert.notEqual(signature({ now: new Date("2026-11-12T08:00:01.000Z") }), baseline);
  assert.notEqual(signature({ region: "cn-shanghai" }), baseline);
  assert.notEqual(signature({ service: "ark2" }), baseline);
  assert.notEqual(signature({ action: "GetAFPUsage" }), signature({}));
});

test("missing credentials are rejected before signing", () => {
  assert.throws(() => volcengineSignedRequest({ ...BASE, accessKey: "" }), /accessKey/);
  assert.throws(() => volcengineSignedRequest({ ...BASE, secretKey: "" }), /secretKey/);
  assert.throws(() => volcengineSignedRequest({ ...BASE, action: "" }), /action/);
});
