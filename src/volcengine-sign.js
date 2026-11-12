// Volcengine OpenAPI request signing (HMAC-SHA256), no network, no deps.
//
// This is the "volc" variant of AWS SigV4 that open.volcengineapi.com expects.
// It is intentionally hand-rolled (instead of adding the official SDK as a
// dependency) because the rest of this tool is zero-dependency and only one
// action call is needed. The three deltas from plain SigV4:
//   1. SignedHeaders use a fixed order `host;x-date;x-content-sha256;
//      content-type` rather than alphabetical order;
//   2. the algorithm string is `HMAC-SHA256` (no AWS4 prefix) and the
//      credential scope ends in `/request` (not `/aws4_request`);
//   3. the signing key starts as HMAC(secretKey, shortDate) over the raw
//      secret, with no `AWS4` prefix.
//
// Reference: Volcengine OpenAPI signing docs and the community
// `dsh-quota-panel` implementation (verified against real responses, 2026-06).

import { createHash, createHmac } from "node:crypto";

export const VOLCENGINE_HOST = "open.volcengineapi.com";
export const VOLCENGINE_CONTENT_TYPE = "application/json; charset=utf-8";
export const VOLCENGINE_SIGNED_HEADERS = "host;x-date;x-content-sha256;content-type";

const ENV_AK = Object.freeze(["VOLC_ACCESS_KEY", "VOLCENGINE_ACCESS_KEY"]);
const ENV_SK = Object.freeze(["VOLC_SECRET_KEY", "VOLCENGINE_SECRET_KEY"]);

/** Env var names the manifest and docs share, in priority order. */
export const VOLC_ACCESS_KEY_ENV = ENV_AK;
export const VOLC_SECRET_KEY_ENV = ENV_SK;

const hmac = (key, data) => createHmac("sha256", key).update(data, "utf8").digest();
const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

/** RFC 3986 unreserved-only percent encoding over UTF-8 bytes. */
export function uriEncode(input) {
  let out = "";
  for (const byte of Buffer.from(String(input), "utf8")) {
    const unreserved =
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e ||
      byte === 0x7e;
    out += unreserved ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** `20260101T000000Z`, the `X-Date` Volcengine signs. */
export function volcengineDate(now = new Date()) {
  return now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";
}

/** Query string used both on the wire and in the canonical request (keys sorted). */
export function canonicalQuery({ action, version, region }) {
  return [
    ["Action", action],
    ["Region", region],
    ["Version", version],
  ]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
    .join("&");
}

/**
 * Build a signed POST request for one OpenAPI action (empty JSON body).
 * @param {object} options
 * @param {string} options.action e.g. "GetCodingPlanUsage"
 * @param {string} [options.version] API version, default 2024-01-01
 * @param {string} [options.service] service name, default ark
 * @param {string} [options.region] region, default cn-beijing
 * @param {string} options.accessKey
 * @param {string} options.secretKey
 * @param {string} [options.host]
 * @param {Date} [options.now]
 * @returns {{url:string, method:"POST", body:string, headers:Record<string,string>}}
 */
export function volcengineSignedRequest({
  action,
  version = "2024-01-01",
  service = "ark",
  region = "cn-beijing",
  accessKey,
  secretKey,
  host = VOLCENGINE_HOST,
  now = new Date(),
}) {
  if (!action) throw new TypeError("action is required");
  if (!accessKey) throw new TypeError("accessKey is required");
  if (!secretKey) throw new TypeError("secretKey is required");

  const xDate = volcengineDate(now);
  const shortDate = xDate.slice(0, 8);
  const body = "";
  const payloadHash = sha256Hex(body);
  const query = canonicalQuery({ action, version, region });

  // Fixed, non-alphabetical order: the server reconstructs the same string.
  const canonicalHeaders =
    `host:${host}\n` +
    `x-date:${xDate}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `content-type:${VOLCENGINE_CONTENT_TYPE}\n`;
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, VOLCENGINE_SIGNED_HEADERS, payloadHash].join("\n");

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(Buffer.from(secretKey, "utf8"), shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return {
    method: "POST",
    url: `https://${host}/?${query}`,
    body,
    headers: {
      Host: host,
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash,
      "Content-Type": VOLCENGINE_CONTENT_TYPE,
      Authorization: `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${VOLCENGINE_SIGNED_HEADERS}, Signature=${signature}`,
    },
  };
}
