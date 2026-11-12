import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { READY_CHECKS } from "../../src/adapters/index.js";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

/** Run the page-side readiness expression against a captured innerText. */
function ready(id, text) {
  const document = { body: { innerText: text } };
  return Boolean(new Function("document", `return ${READY_CHECKS[id]()}`)(document));
}

test("opencode: quota pages are ready, labels without numbers are not", () => {
  assert.equal(ready("opencode_go", fixture("opencode-go-page.txt")), true);
  assert.equal(ready("opencode_go", fixture("opencode-activity-page.txt")), true);
  assert.equal(ready("opencode_go", "5-hour window\n…\nWeekly\nMonthly"), false);
});

test("grok: usage pages are ready, the unavailable state is not", () => {
  assert.equal(ready("x_premium", fixture("grok-dashboard-overview.txt")), true);
  assert.equal(ready("x_premium", fixture("grok-dashboard-usage.txt")), true);
  assert.equal(
    ready("x_premium", "Weekly included usage\nResets Nov 10\nWeekly usage is temporarily unavailable"),
    false,
  );
});
