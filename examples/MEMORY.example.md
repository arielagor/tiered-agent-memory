# Memory — example agent index (synthetic)

> All entries below are fictional demo data for exercising the tools. No real
> people, secrets, or PII. Run `node tools/split-index.mjs examples/MEMORY.example.md --out examples/out`.

- [User prefers metric units](user_prefers_metric_units.md) — always answer in metric; convert imperial on request
- [User timezone is UTC+1](user_timezone_utc_plus_1.md) — schedule suggestions in CET; never assume US hours
- [User role: backend engineer](user_role_backend_engineer.md) — deep Go/Postgres; skip frontend hand-holding

- [Deploys are blue-green, never in-place](feedback_blue_green_deploys.md) — never restart prod in place; cut over a fresh stack
- [Prefer SQL migrations over ORM auto-sync](feedback_sql_migrations_over_orm.md) — review every DDL; ORM auto-sync has dropped columns before
- [Webhook signatures must be verified before parsing](feedback_verify_webhook_signature_first.md) — reject on bad HMAC; don't parse untrusted bodies
- [Retry network calls with jitter, cap at 3](feedback_retry_with_jitter_cap_3.md) — exponential backoff + jitter; never hammer a failing dep
- [Pin container base image digests](feedback_pin_image_digests.md) — tag drift broke a build once; pin by sha256
- [Log structured JSON, one event per line](feedback_structured_json_logs.md) — grep-able; one event per line, no multiline stacks inline

- [Internal CLI: `acme` for the deploy pipeline](reference_acme_cli.md) — `acme deploy <env>`; wraps the staged rollout
- [Metrics live in the Grafana "core" board](reference_grafana_core_board.md) — latency + error-rate panels; alert thresholds noted
- [Runbook for the cache layer](reference_cache_runbook.md) — flush order, warm-up, and the thundering-herd guard
- [Shared Postgres connection helper](reference_pg_pool_helper.md) — lazy pool init; reuse across lambdas to avoid exhaustion

- [Project Atlas: search rewrite](project_atlas_search_rewrite.md) — moving search to hybrid BM25 + vector; phase 2 of 3
- [Project Borealis: billing service](project_borealis_billing.md) — usage metering + invoicing; idempotency keys on every write
- [Scheduled task: nightly backup verify](project_nightly_backup_verify.md) — restores last snapshot to a scratch db, checks row counts
- [Scheduled task: weekly dependency audit](project_weekly_dep_audit.md) — flags CVEs + stale pins; opens a tracking issue
