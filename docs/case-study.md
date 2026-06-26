# Case study: fixing an agent memory index that outgrew its context window

## Setup

A long-running AI coding agent kept a **persistent file-based memory**: a single
always-loaded index (`MEMORY.md`) plus hundreds of per-fact "topic files." Every
session, the index was read into context so the agent started with a map of what
it knew. New facts were appended as one-line entries: `- [Title](slug.md) — hook`,
each pointing at a topic file with the detail.

This is the same shape as the "memory bank" / rules-file pattern used by Cline,
Cursor, Windsurf, and Claude Code — and it works beautifully **while the index
stays small**.

## Symptom

Over months, the index grew to **~124 KB, 583 linked topic files, ~561 entries
across 746 lines**. Then a tooling warning appeared on edits:

> *"The memory index is over the read limit — content beyond ~24 KB is dropped
> when this index is loaded."*

The index was being **silently truncated**. Only the first ~20% loaded each
session; the rest was invisible — and *which* 20% depended on byte position, not
importance. Nothing errored. The agent simply, quietly, stopped knowing ~80% of
what it had recorded.

## Diagnosis: this is a reliability problem, not a token-budget problem

It's tempting to treat this as "just trim the file." But the research is blunt:
an over-long context degrades model accuracy **non-uniformly, even on trivial
tasks**. Chroma's controlled study across 18 frontier models found performance
"grows increasingly unreliable as input length grows," and that a focused
~300-token prompt beat a ~113k-token prompt containing the *same answer* plus
irrelevant history.[^chroma] The classic "lost in the middle" result shows the
same U-shaped position bias.[^lim]

So a giant always-loaded index is doubly bad: the tail is truncated *and* the
part that survives is diluted. The fix isn't a smaller monolith — it's a
different shape.

## Intervention: a verbatim tiered split

The consensus design is **tiered + retrieval-first**: a small bounded
always-loaded core, plus a larger store pulled on demand.[^anthropic][^cline] The
index was restructured into:

- **`MEMORY.md` (the TOC)** — shrunk from 124 KB to **2.8 KB**: a dozen
  always-on essentials plus pointers to the section indexes.
- **Four section indexes** (`index-feedback-working`, `index-feedback-platform`,
  `index-reference`, `index-projects`) — every other entry, one line each,
  grouped by type, each carrying a `description` so it surfaces on relevance
  recall or can be opened from the TOC.
- **Topic files** — unchanged; they were already the detailed store.

The critical implementation choice: **move every bullet verbatim.** No
re-authoring of the one-line hooks. Re-writing 561 entries by hand is exactly how
you silently corrupt or drop a `[Title](slug.md)` link. The partition is a pure
routing operation (`tools/split-index.mjs`), so the only thing that can change is
*which file* a line lives in, never its content.

## Verification caught what review couldn't

The split was gated on a **link-set diff**: extract every `](slug.md)` link from a
backup of the original, extract every link from the union of the new files, and
assert the original set is fully contained in the new set
(`tools/verify-no-loss.mjs`). Result: **0 of 583 links dropped.**

That diff earned its keep twice over. It surfaced a **concurrent-write race**: a
*different* process wrote a new entry to `MEMORY.md` in the window between the
backup and the split, so a link appeared in the new files that wasn't in the
backup. Eyeballing the diff would never have caught it; the set comparison did,
and confirmed the entry was correctly captured rather than clobbered. (Lesson
baked into the tooling: treat an always-loaded memory file as concurrently
written — read-modify-merge, never blind append.)

## Result

| | Before | After |
|---|---:|---:|
| Always-loaded index size | 124 KB | **2.8 KB** |
| Entries always in context | truncated (~20% at random) | curated essentials + on-demand sections |
| Links preserved | — | **583 / 583** |
| Silent-truncation risk | high | guarded (`tools/size-guard.mjs`) |

The always-loaded layer is now ~50× smaller than the model's load budget, and a
size guard fails loudly if it ever creeps back up.

## What the field does better (and where this setup still falls short)

The restructure fixed the acute failure. The research points at the next
reliability gains, summarized in [`research-synthesis.md`](research-synthesis.md):

- **Provenance & freshness.** Stamp every fact with `source`, `written_at`,
  `last_verified`, `supersedes`. Temporal knowledge graphs (Zep/Graphiti) model
  validity over time so updated facts retire stale ones instead of silently
  coexisting.[^zep]
- **A real write policy, not append-only.** Mem0 runs an LLM `ADD / UPDATE /
  DELETE / NOOP` reconciliation against similar existing memories on every
  write[^mem0] — genuine dedupe and contradiction handling. Append-only stores
  accumulate duplicates and contradictions (this one had both).
- **Hybrid retrieval.** Pure vector search misses connected-but-not-similar
  facts; HippoRAG 2 shows graph + vector (Personalized PageRank seeded by dense
  retrieval) beats either alone.[^hippo]
- **Soft forgetting.** Generative Agents rank memories by recency + importance +
  relevance, with exponential decay down-weighting stale entries without deleting
  them.[^genagents]
- **Measure it.** Don't trust vibes — benchmark recall, contradiction handling,
  and the focused-slice-vs-full-context gap. This repo's [ongoing study](../results/)
  is a first, deterministic step.

## Prioritized upgrade plan

- **P0 (now):** hard-cap + fail-loud guard on the always-loaded layer
  (`size-guard`); provenance/freshness frontmatter; treat the index as
  concurrently written.
- **P1:** hybrid (vector + keyword + graph) retrieval; an explicit
  dedupe/merge/contradiction write policy + scheduled consolidation + TTL
  forgetting; a recency-decay ranking term.
- **P2:** a LongMemEval/LoCoMo-style eval harness so every change is measured;
  bi-temporal modeling for contradictions.

## Reusable artifacts

Everything used here is in [`tools/`](../tools/): `split-index.mjs`,
`verify-no-loss.mjs`, `size-guard.mjs`. They're tiny, dependency-free, and
generic — point them at any monolithic markdown index.

[^chroma]: Chroma, *Context Rot: How Increasing Input Tokens Impacts LLM Performance* — https://research.trychroma.com/context-rot
[^lim]: *Lost in the Middle: How Language Models Use Long Contexts* (TACL 2024) — https://arxiv.org/abs/2307.03172
[^anthropic]: Anthropic, *Memory tool* — https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
[^cline]: Cline, *Memory Bank* — https://docs.cline.bot/features/memory-bank
[^zep]: *Zep: A Temporal Knowledge Graph Architecture for Agent Memory* — https://arxiv.org/abs/2501.13956
[^mem0]: *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory* — https://arxiv.org/html/2504.19413v1
[^hippo]: *From RAG to Memory: Non-Parametric Continual Learning for LLMs (HippoRAG 2)* — https://arxiv.org/abs/2502.14802
[^genagents]: *Generative Agents: Interactive Simulacra of Human Behavior* (UIST 2023) — https://arxiv.org/pdf/2304.03442
