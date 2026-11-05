// Test-build mocks. Active only when QUOTA_TEST_MOCK (or legacy AQD_TEST_MOCK) is set.
// Scenarios: ok | not_logged_in | parse_failed | timeout | partial_source | partial_windows | mixed_failure

const SCENARIOS = new Set([
  "ok",
  "not_logged_in",
  "parse_failed",
  "timeout",
  "partial_source",
  "partial_windows",
  "mixed_failure",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function windowValue(remaining, total, unit = "次") {
  return { remaining, total, unit, resetAt: null, updatedAt: null };
}

const OK_WINDOWS = {
  volcengine: {
    windows: { h5: windowValue(80, 100), week: windowValue(30, 50), month: windowValue(400, 500) },
    mainWindow: "month",
  },
  opencode_go: {
    windows: { h5: windowValue(90, 100, "%"), week: windowValue(80, 100, "%"), month: windowValue(70, 100, "%") },
    mainWindow: "h5",
  },
};

export function mockMode() {
  const mode = process.env.QUOTA_TEST_MOCK || process.env.AQD_TEST_MOCK;
  return mode && SCENARIOS.has(mode) ? mode : null;
}

/**
 * @param {string} id
 * @param {{mode:string, budgetMs?:number}} opts budgetMs caps the timeout scenario
 * @returns {Promise<{ok:true, windows:any, mainWindow:string|null, adapterVersion:string} | {ok:false, code:string, message:string}>}
 */
export async function mockRead(id, { mode, budgetMs = 2000 } = {}) {
  const fail = (code) => ({ ok: false, code, message: `模拟：${code}` });
  switch (mode) {
    case "not_logged_in":
      return fail("not_logged_in");
    case "parse_failed":
      return fail("parse_failed");
    case "timeout":
      await sleep(Math.max(0, Math.min(2000, budgetMs)));
      return fail("timeout");
    case "partial_source":
      return id === "volcengine"
        ? { ok: true, ...OK_WINDOWS.volcengine, adapterVersion: "mock-v1" }
        : fail("not_logged_in");
    case "mixed_failure":
      return id === "volcengine" ? fail("not_logged_in") : fail("parse_failed");
    case "partial_windows":
      return id === "volcengine"
        ? { ok: true, windows: { h5: windowValue(30, 100) }, mainWindow: "h5", adapterVersion: "mock-v1" }
        : { ok: true, ...OK_WINDOWS.opencode_go, adapterVersion: "mock-v1" };
    case "ok":
    default:
      return { ok: true, ...OK_WINDOWS[id], adapterVersion: "mock-v1" };
  }
}
