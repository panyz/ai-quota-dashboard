import { test } from "node:test";
import assert from "node:assert/strict";
import { pageAlreadyShowsQuota, tabIsReusable, workspaceGoUrl } from "../../src/navigate.js";
import { registry } from "../../src/model.js";

test("reuse rules come from the manifest, not a provider id branch", () => {
  const grok = registry.get("x_premium").navigate;
  assert.equal(tabIsReusable(grok, "https://grok.com/dashboard"), true);
  assert.equal(tabIsReusable(grok, "https://grok.com/"), false);
  const includes = { reuseIncludes: ["/console/usage"] };
  assert.equal(tabIsReusable(includes, "https://example.com/console/usage?tab=plan"), true);
  assert.equal(tabIsReusable(includes, "https://example.com/home"), false);
});

test("opencode workspace pages hop to /go and stay there once arrived", () => {
  const nav = registry.get("opencode_go").navigate;
  assert.equal(
    workspaceGoUrl(nav, "https://opencode.ai/console/wrk_abc123"),
    "https://opencode.ai/console/wrk_abc123/go",
  );
  assert.equal(workspaceGoUrl(nav, "https://opencode.ai/console/wrk_abc123/go"), null);
  assert.equal(workspaceGoUrl(nav, "https://opencode.ai/console"), null);
});

test("grok stays on overview when the weekly copy is already there", () => {
  const nav = registry.get("x_premium").navigate;
  assert.equal(pageAlreadyShowsQuota(nav, "Weekly included usage\n69% used"), true);
  assert.equal(pageAlreadyShowsQuota(nav, "Account balance $0"), false);
});
