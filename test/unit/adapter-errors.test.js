import test from "node:test";
import assert from "node:assert/strict";

import { classifyUnreachable } from "../../src/adapters/index.js";
import { SOURCE_STATUSES } from "../../src/model.js";

test("a Chrome error page is not a parser failure", () => {
  const text = "无法访问此网站\n\ngrok.com 意外终止了连接。\n\nERR_CONNECTION_CLOSED\n重新加载";
  const hit = classifyUnreachable("chrome-error://chromewebdata/", text);
  assert.equal(hit.code, "page_unreachable");
  assert.match(hit.message, /ERR_CONNECTION_CLOSED/);
  assert.match(hit.message, /浏览器打不开/);
});

test("a real console page is left to the parser", () => {
  const text = "Weekly included usage\n69% used";
  assert.equal(classifyUnreachable("https://grok.com/dashboard/usage", text), null);
});

test("a net error on an otherwise real URL is still reported", () => {
  const hit = classifyUnreachable("https://example.com/", "This site can't be reached\nERR_NAME_NOT_RESOLVED");
  assert.equal(hit.code, "page_unreachable");
  assert.match(hit.message, /ERR_NAME_NOT_RESOLVED/);
});

test("empty input is not classified", () => {
  assert.equal(classifyUnreachable("", ""), null);
  assert.equal(classifyUnreachable(undefined, undefined), null);
});

test("page_unreachable is a first-class source status", () => {
  assert.ok(SOURCE_STATUSES.includes("page_unreachable"));
});
