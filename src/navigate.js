// Declarative tab navigation. The adapter applies whatever a manifest declares;
// provider ids are not branched on here.

/**
 * A tab already showing this console can be reloaded in place.
 * @param {object|null|undefined} navigate
 * @param {string} url
 */
export function tabIsReusable(navigate, url) {
  if (!navigate || typeof url !== "string") return false;
  if (Array.isArray(navigate.reuseIncludes) && navigate.reuseIncludes.some((part) => part && url.includes(part))) {
    return true;
  }
  if (typeof navigate.reusePattern === "string" && navigate.reusePattern) {
    try {
      if (new RegExp(navigate.reusePattern).test(url)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Workspace consoles redirect to /console/<id> and hide quotas until /go.
 * @returns {string|null} absolute URL to open, or null when no hop is needed
 */
export function workspaceGoUrl(navigate, href) {
  const rule = navigate?.workspaceGo;
  if (!rule || typeof href !== "string") return null;
  let match;
  try {
    match = href.match(new RegExp(rule.pattern));
  } catch {
    return null;
  }
  if (!match) return null;
  if (typeof rule.skip === "string" && rule.skip && new RegExp(rule.skip).test(href)) return null;
  return String(rule.url ?? "").replaceAll("{1}", match[1] ?? "");
}

/** True when the current page already shows the quota copy, so no extra navigation is needed. */
export function pageAlreadyShowsQuota(navigate, text) {
  if (!navigate?.openWhenMissing || typeof text !== "string") return true;
  try {
    return new RegExp(navigate.openWhenMissing, "i").test(text);
  } catch {
    return true;
  }
}
