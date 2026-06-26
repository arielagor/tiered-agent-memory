#!/usr/bin/env node
// size-guard.mjs — fail loud when an always-loaded memory index exceeds its budget.
//
// The whole tiered pattern depends on the always-loaded layer staying small. But
// indexes grow silently, and the loader truncates silently — so the failure is
// invisible until recall quietly degrades. This turns that silent failure into a
// loud one: a hard byte/char budget that exits non-zero (CI) or prints a blocking
// warning (editor hook) when breached.
//
// Usage (CLI / CI):
//   node tools/size-guard.mjs <index.md> [--max-bytes 16000] [--max-chars N] [--warn-only]
//
// Usage (Claude Code PostToolUse hook): point a hook at this script; see tools/README.md.
// Reads optional JSON on stdin ({ tool_input: { file_path } }) so it can self-target
// the file an edit just touched.
//
// Exit codes: 0 = within budget, 1 = over budget (unless --warn-only).

import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};
const has = (f) => args.includes(f);

const MAX_BYTES = Number(flag("--max-bytes", "16000"));
const MAX_CHARS = flag("--max-chars", null) ? Number(flag("--max-chars", null)) : null;
const warnOnly = has("--warn-only");
let file = args.find((a) => !a.startsWith("--") && a !== String(MAX_BYTES) && a !== String(MAX_CHARS));

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const stdin = await readStdin();
if (!file && stdin) {
  try {
    const j = JSON.parse(stdin);
    file = j?.tool_input?.file_path || j?.file_path || file;
  } catch {}
}
if (!file) {
  console.error("size-guard: no index file given (arg or stdin tool_input.file_path)");
  process.exit(2);
}
if (!fs.existsSync(file)) process.exit(0); // nothing to guard yet

const buf = fs.readFileSync(file);
const bytes = buf.length;
const chars = buf.toString("utf8").length;
const overBytes = bytes > MAX_BYTES;
const overChars = MAX_CHARS != null && chars > MAX_CHARS;

if (overBytes || overChars) {
  const why = [
    overBytes ? `${bytes} bytes > ${MAX_BYTES} budget` : null,
    overChars ? `${chars} chars > ${MAX_CHARS} budget` : null,
  ].filter(Boolean).join("; ");
  const msg =
    `size-guard: ${file} is OVER BUDGET (${why}).\n` +
    `The always-loaded index must stay small or it is silently truncated and degrades recall.\n` +
    `Move entries into section indexes / topic files (see split-index.mjs) and re-check.`;
  if (warnOnly) {
    console.warn(msg);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
console.log(`size-guard: ${file} OK (${bytes} bytes / ${chars} chars, budget ${MAX_BYTES} bytes).`);
