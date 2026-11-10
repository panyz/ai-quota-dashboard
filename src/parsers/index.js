// Parser lookup. The manifest names the function; this file is the only place that binds the name.

import { registry } from "../model.js";
import { parseGrok } from "./grok.js";
import { parseOpenCode } from "./opencode.js";
import { parseVolcengine } from "./volcengine.js";

const PARSERS = Object.freeze({
  volcengine: parseVolcengine,
  opencode_go: parseOpenCode,
  x_premium: parseGrok,
});

/** @returns {Function|null} parse(text, now) for a source id */
export function parserFor(id) {
  const name = registry.get(id)?.parser?.name;
  return PARSERS[name] ?? null;
}
