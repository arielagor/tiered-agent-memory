#!/usr/bin/env node
// split-index.mjs — partition a monolithic always-loaded memory index into a
// small table-of-contents (TOC) plus per-section index files, moving every
// bullet VERBATIM (no hook re-authoring → no link corruption).
//
// Why: an always-loaded index that outgrows the model's context window gets
// silently truncated and triggers "context rot" (accuracy degrades as input
// grows, even on easy tasks). The fix is tiered + retrieval-first: a tiny
// always-loaded TOC + larger section indexes pulled on demand. See docs/.
//
// Usage:
//   node tools/split-index.mjs <input.md> [--out <dir>] [--config <config.json>]
//
// Default routing (no config): each bullet `- [Title](slug.md) — hook` is
// routed by the prefix of its first link slug (the part before the first "_"),
// e.g. user_*, feedback_*, reference_*, project_*. Bullets with no local
// .md link, or an unknown prefix, go to the always-loaded core (preserved).
//
// Config (JSON) overrides routing:
//   {
//     "core":     { "prefixes": ["user"], "keywords": ["identity","portfolio"] },
//     "sections": [
//       { "name": "feedback", "title": "...", "description": "...",
//         "match": { "prefixes": ["feedback"], "keywords": ["gotcha"] } }
//     ]
//   }
//
// Output: <out>/INDEX.md (the slim TOC) + <out>/index-<name>.md per section.
// Guarantees: every input bullet appears in exactly one output file; the union
// of links across outputs equals the input link set (verify with verify-no-loss.mjs).

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (!args[0] || args.includes("--help") || args.includes("-h")) {
  console.log("usage: node tools/split-index.mjs <input.md> [--out <dir>] [--config <config.json>]");
  process.exit(args[0] ? 0 : 1);
}
const input = args[0];
const outDir = argValue("--out") || path.dirname(path.resolve(input));
const configPath = argValue("--config");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const LINK_RE = /\]\(([A-Za-z0-9_\-./]+\.md)\)/g;
const linksIn = (s) => {
  const out = [];
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(s))) out.push(m[1]);
  return out;
};
const isBullet = (l) => /^- /.test(l);
const isEmptyBullet = (l) => /^-\s*$/.test(l);

const raw = fs.readFileSync(input, "utf8");
const lines = raw.split(/\r?\n/);
const firstBullet = lines.findIndex(isBullet);
const preamble = firstBullet >= 0 ? lines.slice(0, firstBullet) : lines;

// Default config: route by first-link slug prefix.
const config = configPath
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {
      core: { prefixes: ["user"], keywords: [] },
      sections: [
        { name: "feedback", title: "Feedback & lessons (index)", description: "Working-style guidance, corrections, and platform/API gotchas.", match: { prefixes: ["feedback"] } },
        { name: "reference", title: "Reference (index)", description: "Tools, pipelines, and external resources.", match: { prefixes: ["reference"] } },
        { name: "projects", title: "Projects & infrastructure (index)", description: "Ventures, agents, and scheduled tasks.", match: { prefixes: ["project"] } },
      ],
    };

const slugPrefix = (slug) => path.basename(slug).split(/[_\-.]/)[0].toLowerCase();
const matchesKeywords = (line, kws = []) => kws.some((k) => line.toLowerCase().includes(k.toLowerCase()));

function route(line) {
  const lk = linksIn(line);
  const prefix = lk.length ? slugPrefix(lk[0]) : null;
  // core wins first
  if ((prefix && (config.core.prefixes || []).includes(prefix)) || matchesKeywords(line, config.core.keywords))
    return "__core__";
  for (const s of config.sections) {
    const mp = s.match.prefixes || [];
    const mk = s.match.keywords || [];
    if ((prefix && mp.includes(prefix)) || matchesKeywords(line, mk)) return s.name;
  }
  return "__core__"; // catch-all: never lose a bullet
}

const buckets = { __core__: [] };
for (const s of config.sections) buckets[s.name] = [];
let droppedEmpty = 0;
for (const l of lines) {
  if (!isBullet(l)) continue;
  if (isEmptyBullet(l)) { droppedEmpty++; continue; }
  buckets[route(l)].push(l);
}

const allLinks = new Set();
for (const l of lines) for (const x of linksIn(l)) allLinks.add(x);

fs.mkdirSync(outDir, { recursive: true });

const stamp = argValue("--date") || "(undated)";
function sectionDoc(s, bullets) {
  return (
    `---\nname: index-${s.name}\ndescription: "${s.description}"\nkind: memory-section-index\n---\n\n` +
    `# ${s.title}\n\n> Section index split from the monolith on ${stamp}. One line per entry; ` +
    `detail lives in each linked topic file. Loads on recall or when opened from the TOC.\n\n` +
    bullets.join("\n") + "\n"
  );
}

const written = [];
for (const s of config.sections) {
  const file = path.join(outDir, `index-${s.name}.md`);
  fs.writeFileSync(file, sectionDoc(s, buckets[s.name]));
  written.push(file);
}

// Build the slim TOC.
const toc = [];
const titleLine = lines.find((l) => /^#\s/.test(l));
toc.push(titleLine || "# Memory index");
toc.push("");
for (const p of preamble) if (p.trim().startsWith(">")) toc.push(p);
toc.push(`> **Tiered index.** This file stays small and is the always-loaded layer. ` +
  `Most entries live in the section indexes below, which load on recall or when opened. ` +
  `Add new pointers to the matching section index, not here, unless it is an always-on essential.`);
toc.push("");
toc.push("## Always-on essentials");
for (const l of buckets.__core__) toc.push(l);
toc.push("");
toc.push("## Section indexes (load on demand)");
for (const s of config.sections)
  toc.push(`- [${s.title}](index-${s.name}.md) — ${buckets[s.name].length} entries`);
toc.push("");
const tocText = toc.join("\n") + "\n";
const tocPath = path.join(outDir, "INDEX.md");
fs.writeFileSync(tocPath, tocText);
written.unshift(tocPath);

const bytes = (s) => Buffer.byteLength(s, "utf8");
console.log(`split-index: ${input}`);
console.log(`  core (always-loaded): ${buckets.__core__.length} bullets`);
for (const s of config.sections) console.log(`  ${s.name}: ${buckets[s.name].length} bullets`);
console.log(`  empty bullets dropped: ${droppedEmpty}`);
console.log(`  TOC size: ${bytes(tocText)} bytes`);
console.log(`  wrote: ${written.map((w) => path.basename(w)).join(", ")}`);
console.log(`  input unique links: ${allLinks.size} (verify with verify-no-loss.mjs)`);
