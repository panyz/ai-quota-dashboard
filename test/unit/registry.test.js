import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registry, resolveSource, SOURCES, advertisedWindows } from "../../src/model.js";
import { parserFor } from "../../src/parsers/index.js";
import { parseVolcengine } from "../../src/parsers/volcengine.js";
import { parseOpenCode } from "../../src/parsers/opencode.js";
import { parseGrok } from "../../src/parsers/grok.js";
import { ProviderRegistry, validateManifest } from "../../src/registry.js";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-07T12:00:00.000Z");

test("the three built-in manifests resolve aliases and keep their public ids", () => {
  assert.deepEqual(registry.ids(), ["volcengine", "opencode_go", "x_premium"]);
  assert.equal(resolveSource("volc"), "volcengine");
  assert.equal(resolveSource("OpenCode"), "opencode_go");
  assert.equal(resolveSource("x-premium"), "x_premium");
  assert.equal(resolveSource("nope"), null);
  assert.equal(SOURCES.opencode_go.id, "opencode-go");
  assert.equal(SOURCES.opencode_go.workspace, "auto");
  assert.equal(SOURCES.x_premium.url, "https://grok.com/dashboard/usage");
  assert.deepEqual(advertisedWindows("x_premium"), ["week"]);
  assert.deepEqual(advertisedWindows("volcengine"), ["h5", "week", "month"]);
});

test("manifest parsers match the existing parser functions on real fixtures", () => {
  const cases = [
    ["volcengine", "volc-subscribe.txt", parseVolcengine],
    ["opencode_go", "opencode-go-page.txt", parseOpenCode],
    ["x_premium", "grok-dashboard-usage.txt", parseGrok],
  ];
  for (const [id, file, direct] of cases) {
    const text = fixture(file);
    assert.deepEqual(parserFor(id)(text, NOW), direct(text, NOW));
  }
});

test("a manifest without an advertised window is rejected", () => {
  const bad = {
    id: "example",
    slug: "example",
    name: "Example",
    url: "https://example.com/usage",
    transport: "cdp",
    ready: { expr: "true" },
    parser: { kind: "module", name: "example", version: "example-v1" },
    windows: [{ key: "week", label: "周", semantic: "percent", unit: "%", periodMs: 1, advertised: false }],
  };
  const result = validateManifest(bad);
  assert.equal(result.ok, false);
  assert.equal(result.code, "manifest_no_advertised");
  assert.throws(() => new ProviderRegistry([bad]), (err) => err.code === "manifest_no_advertised");
});
