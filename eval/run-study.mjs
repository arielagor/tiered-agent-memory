// run-study.mjs — the ongoing effectiveness study.
//
// Question it answers, empirically and reproducibly: as a memory store grows,
// does retrieving a focused slice keep recall high while the cost of loading the
// WHOLE store into context explodes? If yes, the tiered/retrieval-first pattern
// is justified by numbers, not vibes.
//
// Pure JS, deterministic (seeded), no LLM, no API key, no network — so it runs
// free in CI and anyone can reproduce it. Writes results/latest.json, appends
// results/history.jsonl, and regenerates results/README.md + results/trend.svg.
//
// Usage: node eval/run-study.mjs [--date YYYY-MM-DD] [--sha <gitsha>] [--sizes 50,200,1000,5000]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BM25 } from "./lib/bm25.mjs";
import { generateCorpus, generateProbes } from "./generate-corpus.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.resolve(__dir, "..", "results");
fs.mkdirSync(RESULTS, { recursive: true });

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : d;
};
const date = arg("--date", "local");
const sha = arg("--sha", "local");
const sizes = arg("--sizes", "50,200,1000,5000").split(",").map((x) => parseInt(x, 10));

// Seed the synthetic data from the run date so each scheduled run draws fresh
// (but reproducible-per-date) data — the history table then shows real variation
// instead of an identical row every week.
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}
const SEED = hashSeed(date);

const tokenEst = (s) => Math.ceil(s.length / 4); // ~4 chars/token proxy

function runOneSize(n) {
  const facts = generateCorpus(n, SEED);
  const probes = generateProbes(facts, Math.min(200, n), SEED ^ 0x9e3779b9);
  const bm25 = new BM25(facts.map((f) => ({ id: f.id, text: f.text })));

  let hit5 = 0, hit10 = 0, retrievedTokens = 0;
  for (const p of probes) {
    const top = bm25.topK(p.query, 10);
    const ids = top.map((t) => t.id);
    if (ids.slice(0, 5).includes(p.targetId)) hit5++;
    if (ids.includes(p.targetId)) hit10++;
    retrievedTokens += top.reduce((a, t) => a + tokenEst(facts[t.id].text), 0);
  }
  const fullLoadTokens = facts.reduce((a, f) => a + tokenEst(f.text), 0);
  const retrievedTokens10 = Math.round(retrievedTokens / probes.length);
  return {
    n,
    probes: probes.length,
    recall5: +(hit5 / probes.length).toFixed(4),
    recall10: +(hit10 / probes.length).toFixed(4),
    fullLoadTokens,
    retrievedTokens10,
    savingsPct: +((1 - retrievedTokens10 / fullLoadTokens) * 100).toFixed(2),
  };
}

const results = { date, sha, sizes: sizes.map(runOneSize) };
fs.writeFileSync(path.join(RESULTS, "latest.json"), JSON.stringify(results, null, 2) + "\n");

const max = results.sizes[results.sizes.length - 1];
const headline = { date, sha, maxN: max.n, recall10AtMaxN: max.recall10, savingsPctAtMaxN: max.savingsPct };
fs.appendFileSync(path.join(RESULTS, "history.jsonl"), JSON.stringify(headline) + "\n");

// ---- trend.svg: recall@10 (kept high) vs token-savings (climbs to ~100%) across N ----
function svg(rows) {
  const W = 640, H = 320, padL = 56, padR = 16, padT = 24, padB = 48;
  const xs = rows.map((r) => Math.log10(r.n));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const px = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
  const py = (v) => padT + (1 - v / 100) * (H - padT - padB); // v in 0..100
  const line = (vals, color) =>
    `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${rows
      .map((r, i) => `${px(xs[i]).toFixed(1)},${py(vals(r)).toFixed(1)}`)
      .join(" ")}"/>` +
    rows.map((r, i) => `<circle cx="${px(xs[i]).toFixed(1)}" cy="${py(vals(r)).toFixed(1)}" r="3.5" fill="${color}"/>`).join("");
  const xticks = rows
    .map((r, i) => `<text x="${px(xs[i]).toFixed(1)}" y="${H - padB + 18}" font-size="11" text-anchor="middle" fill="#555">${r.n}</text>`)
    .join("");
  const yticks = [0, 25, 50, 75, 100]
    .map((v) => `<line x1="${padL}" y1="${py(v)}" x2="${W - padR}" y2="${py(v)}" stroke="#eee"/><text x="${padL - 8}" y="${py(v) + 4}" font-size="11" text-anchor="end" fill="#555">${v}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,Arial,sans-serif">
<rect width="${W}" height="${H}" fill="white"/>
${yticks}
${xticks}
<text x="${W / 2}" y="${H - 10}" font-size="12" text-anchor="middle" fill="#333">memory store size (facts, log scale)</text>
${line((r) => r.recall10 * 100, "#7c3aed")}
${line((r) => r.savingsPct, "#06b6d4")}
<rect x="${padL}" y="${padT - 4}" width="12" height="12" fill="#7c3aed"/><text x="${padL + 18}" y="${padT + 6}" font-size="12" fill="#333">retrieval recall@10 (%)</text>
<rect x="${padL + 190}" y="${padT - 4}" width="12" height="12" fill="#06b6d4"/><text x="${padL + 208}" y="${padT + 6}" font-size="12" fill="#333">token savings vs full-load (%)</text>
</svg>`;
}
fs.writeFileSync(path.join(RESULTS, "trend.svg"), svg(results.sizes) + "\n");

// ---- results/README.md ----
const hist = fs
  .readFileSync(path.join(RESULTS, "history.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const tbl = (rows) =>
  ["| facts | probes | recall@5 | recall@10 | full-load tokens | retrieved tokens (avg, top-10) | token savings |",
   "|---:|---:|---:|---:|---:|---:|---:|",
   ...rows.map((r) => `| ${r.n} | ${r.probes} | ${r.recall5} | ${r.recall10} | ${r.fullLoadTokens.toLocaleString()} | ${r.retrievedTokens10.toLocaleString()} | ${r.savingsPct}% |`)].join("\n");
const md = `# Effectiveness study — results

> Auto-generated by \`eval/run-study.mjs\`. Deterministic, LLM-free, no secrets.
> Latest run: **${date}** (\`${sha}\`).

**Claim under test:** as the memory store grows, BM25 retrieval keeps recall high
while the cost of loading the *entire* store into context grows without bound — so
a tiered, retrieval-first design beats an always-loaded index.

![trend](trend.svg)

## Latest run

${tbl(results.sizes)}

Read it as: at ${max.n.toLocaleString()} facts, retrieving the top 10 finds the answer
${(max.recall10 * 100).toFixed(1)}% of the time while using **${max.savingsPct}%** fewer tokens
than loading everything. The always-loaded cost is the "full-load tokens" column; it grows
linearly with the store, the retrieved cost stays flat.

## Headline history (max-N per run)

| date | sha | max facts | recall@10 | token savings |
|---|---|---:|---:|---:|
${hist.map((h) => `| ${h.date} | ${h.sha} | ${h.maxN.toLocaleString()} | ${h.recall10AtMaxN} | ${h.savingsPctAtMaxN}% |`).join("\n")}
`;
fs.writeFileSync(path.join(RESULTS, "README.md"), md);

console.log("study complete:");
for (const r of results.sizes)
  console.log(`  n=${r.n}: recall@10=${r.recall10} savings=${r.savingsPct}% fullLoad=${r.fullLoadTokens}tok`);
