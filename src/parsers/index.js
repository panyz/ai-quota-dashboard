// Parser lookup. The manifest names the function; this file is the only place that binds the name.

import { registry } from "../model.js";
import { parseAlibaba } from "./alibaba.js";
import { parseClaude } from "./claude.js";
import { parseCodex } from "./codex.js";
import { parseDeepseek } from "./deepseek.js";
import { parseGrok } from "./grok.js";
import { parseOpenCode } from "./opencode.js";
import { parseVolcengine } from "./volcengine.js";
import { parseZhipu } from "./zhipu.js";

const PARSERS = Object.freeze({
  volcengine: parseVolcengine,
  opencode_go: parseOpenCode,
  x_premium: parseGrok,
  claude: parseClaude,
  zhipu: parseZhipu,
  deepseek: parseDeepseek,
  alibaba: parseAlibaba,
  codex: parseCodex,
});

/** @returns {Function|null} parse(text, now) for a source id */
export function parserFor(id) {
  const name = registry.get(id)?.parser?.name;
  return PARSERS[name] ?? null;
}
