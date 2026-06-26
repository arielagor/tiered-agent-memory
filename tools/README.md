# tools

Three small, dependency-free Node scripts that implement the tiered-memory
pattern and its guardrails.

## `split-index.mjs`
Partition a monolithic always-loaded index into a small table-of-contents (TOC)
plus per-section index files, moving every bullet **verbatim** (no hook
re-authoring, so links can't be corrupted).

```bash
node tools/split-index.mjs <input.md> [--out <dir>] [--config <config.json>] [--date YYYY-MM-DD]
```

Default routing groups bullets by the prefix of their first link slug
(`user_*`, `feedback_*`, `reference_*`, `project_*`). Provide `--config` to define
your own sections (by slug prefix and/or keyword). Bullets with no local link or
an unknown prefix go to the always-loaded core, so nothing is lost.

## `verify-no-loss.mjs`
Prove the split dropped nothing by diffing the link set of the original against
the union of the new files. Exits non-zero if any link is missing.

```bash
node tools/verify-no-loss.mjs --original <backup.md> --new <INDEX.md> <index-*.md ...>
```

In the real-world run this repo documents, this gate caught both a hand-edit drop
and a concurrent-write race that eyeballing the diff would have missed.

## `size-guard.mjs`
Turn the *silent* "index too big" failure into a *loud* one: a hard byte budget
on the always-loaded layer. Use it in CI or as an editor hook.

```bash
# CI / pre-commit
node tools/size-guard.mjs MEMORY.md --max-bytes 16000        # exit 1 if over
node tools/size-guard.mjs MEMORY.md --max-bytes 16000 --warn-only   # exit 0, warn only
```

### As a Claude Code PostToolUse hook
Run it after edits to your memory index so it complains the moment the file
crosses budget. Example `~/.claude/settings.json` snippet:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/tools/size-guard.mjs /path/to/MEMORY.md --max-bytes 16000 --warn-only"
          }
        ]
      }
    ]
  }
}
```

The hook reads the tool payload on stdin, so you can also omit the file argument
and let it target the file the edit just touched. Use `--warn-only` for a hook
(so it surfaces a warning without blocking the edit); drop it in CI to fail the
build.

> Budget note: pick `--max-bytes` from your model's behavior, not a universal
> constant — "context rot" degrades non-uniformly and is model-specific. Start
> small (the always-loaded layer should be a TOC, not a database) and measure.
