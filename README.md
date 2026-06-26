# tiered-agent-memory

**A small, reliable pattern (and toolkit) for agent long-term memory that doesn't rot as it grows — plus an ongoing benchmark that proves it.**

Long-running AI agents accumulate a persistent memory file that gets loaded into context every session. It works great — until it doesn't. The file grows, crosses the model's effective context budget, and gets **silently truncated**. Worse: even when it *fits*, an over-stuffed context makes the model measurably less accurate ("context rot"). The failure is invisible: nothing errors, recall just quietly degrades.

This repo documents how that failure was hit and fixed in a real, long-running agent memory (an index that had grown to **124 KB / 583 entries** and was being cut off at ~24 KB every session), distills the **2025–2026 research** on how the best memory systems avoid it, ships the **tools** used to fix it, and runs an **ongoing study** that keeps measuring whether the pattern holds.

## The pattern in 60 seconds

Don't keep one ever-growing always-loaded document. Go **tiered + retrieval-first**:

1. **A tiny always-loaded table-of-contents** (a few KB) — identity-level essentials and pointers. Hard-capped and guarded so it can't silently bloat.
2. **Section indexes** — one line per entry, grouped by topic, loaded on demand (by relevance recall, or by opening them from the TOC).
3. **Topic files / a vector store** — the actual detail, retrieved as a focused slice when relevant.

Loading a focused slice keeps recall high while the cost of loading *everything* grows without bound. That's not opinion — it's the consistent finding across the field (Anthropic's memory tool, Chroma's context-rot study, Generative Agents, Zep, A-MEM, HippoRAG 2, Mem0) and it's what the [ongoing study](results/) measures.

## What's here

| Path | What |
|---|---|
| [`docs/case-study.md`](docs/case-study.md) | The full story: the failure, the tiered fix, the verification, the upgrade plan. |
| [`docs/research-synthesis.md`](docs/research-synthesis.md) | Cited synthesis of how leading memory systems solve this (2025–2026). |
| [`tools/`](tools/) | `split-index` (partition a monolith verbatim), `verify-no-loss` (prove nothing dropped), `size-guard` (fail loud on bloat). |
| [`eval/`](eval/) + [`results/`](results/) | The ongoing, deterministic, LLM-free effectiveness benchmark. |

## Quickstart

```bash
git clone https://github.com/arielagor/tiered-agent-memory
cd tiered-agent-memory

# 1. Split a monolithic index into a tiny TOC + section indexes (verbatim)
node tools/split-index.mjs examples/MEMORY.example.md --out examples/out

# 2. Prove the split dropped nothing
node tools/verify-no-loss.mjs --original examples/MEMORY.example.md \
  --new examples/out/INDEX.md examples/out/index-*.md

# 3. Guard the always-loaded layer against silent bloat (exit 1 if over budget)
node tools/size-guard.mjs examples/out/INDEX.md --max-bytes 16000

# 4. Run the effectiveness study
node eval/run-study.mjs
```

## The ongoing study

[`results/`](results/) holds an auto-updating benchmark. A scheduled GitHub Action
re-runs `eval/run-study.mjs` weekly and commits a new row: as a synthetic memory
store grows from 50 to 5,000 facts, it tracks retrieval recall@k against the
token cost of loading the *whole* store. The headline: retrieval keeps the answer
in a tiny top-k slice while full-load cost grows linearly — **~80% → ~99.8% token
savings** as the store grows. It's deterministic, uses no LLM and no API keys, so
anyone can reproduce it.

## Status & scope

This is a documented pattern + working toolkit, not a framework. The tools are
intentionally tiny and dependency-free. The synthetic benchmark is a proxy
(retrieval + token budget), not an LLM-graded accuracy eval — see the caveats in
the [research synthesis](docs/research-synthesis.md).

---

Built by [Agor AI](https://agor.me) — Ariel Agor. MIT licensed. Issues and PRs welcome.
