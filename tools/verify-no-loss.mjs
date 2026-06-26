#!/usr/bin/env node
// verify-no-loss.mjs — prove a split dropped nothing.
//
// Compares the set of markdown topic-file links in an ORIGINAL index against
// the union of links across the NEW files (the TOC + section indexes). The
// split moves bullets verbatim, so this set must be preserved exactly. This is
// the gate that, in the real-world run this repo documents, caught both a
// hand-edit drop and a concurrent-write race that no eyeball review would have.
//
// Usage:
//   node tools/verify-no-loss.mjs --original <backup.md> --new <f1.md> [<f2.md> ...]
//   node tools/verify-no-loss.mjs --original old.md --new-glob "out/INDEX.md out/index-*.md"
//
// Exit 0 if every original link is present in the new set (extra links in the
// new set, e.g. the TOC's pointers to section files, are reported but allowed).
// Exit 1 if any original link is missing (data loss).

import fs from "node:fs";

const args = process.argv.slice(2);
function multi(flag) {
  const out = [];
  let i = args.indexOf(flag);
  if (i < 0) return out;
  for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
  return out;
}
const original = (multi("--original")[0]) || args[0];
let newFiles = multi("--new");
const glob = (multi("--new-glob")[0]);
if (glob) newFiles = glob.split(/\s+/).filter(Boolean);

if (!original || newFiles.length === 0) {
  console.error("usage: node tools/verify-no-loss.mjs --original <old.md> --new <new1.md> [new2.md ...]");
  process.exit(2);
}

const LINK_RE = /\]\(([A-Za-z0-9_\-./]+\.md)\)/g;
function links(file) {
  const s = fs.readFileSync(file, "utf8");
  const set = new Set();
  let m;
  while ((m = LINK_RE.exec(s))) set.add(m[1]);
  return set;
}

const before = links(original);
const after = new Set();
for (const f of newFiles) for (const l of links(f)) after.add(l);

const dropped = [...before].filter((l) => !after.has(l)).sort();
const added = [...after].filter((l) => !before.has(l)).sort();

console.log(`verify-no-loss`);
console.log(`  original links: ${before.size}  (${original})`);
console.log(`  new links:      ${after.size}  (${newFiles.length} files)`);
console.log(`  DROPPED (in original, missing from new): ${dropped.length}`);
for (const d of dropped) console.log(`    - ${d}`);
console.log(`  added (new, not in original — e.g. section-file pointers): ${added.length}`);
for (const a of added) console.log(`    + ${a}`);

if (dropped.length) {
  console.error(`FAIL: ${dropped.length} link(s) lost.`);
  process.exit(1);
}
console.log("PASS: no links dropped.");
