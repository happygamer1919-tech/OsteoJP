# Prod schema drift check

**Workflow:** `.github/workflows/prod-drift-check.yml`  
**Schedule:** Daily at 07:00 UTC (08:00 Lisbon). Also triggerable manually via Actions → *Prod Schema Drift Check* → *Run workflow*.  
**Blocking:** No — not in the branch-protection required checks list. Failures do not block PRs.

## What it does

1. Reads `packages/db/migrations/meta/_journal.json` (source of truth — every migration in main).
2. Connects to prod **read-only** (SELECT only — no writes, no migrations) via `PROD_DATABASE_URL_DIRECT`.
3. Compares the journal's `when` timestamps against the `created_at` values in `drizzle.__drizzle_migrations` in prod.
4. Writes a summary to the job's GitHub Actions summary tab:
   - **UP TO DATE ✅** — all journal entries are in prod.
   - **DRIFT DETECTED ⚠️** — lists which migrations are missing from prod.

If `PROD_DATABASE_URL_DIRECT` is not configured, the job exits green with a notice (no false alarm during early setup).

## How to respond to a DRIFT DETECTED alert

1. Open the failing daily run → **Summary** tab — it lists every pending migration by name.
2. Verify the pending migrations look expected (i.e. they landed on main intentionally via merged PRs).
3. If yes — apply via the **manual `drizzle-kit` direct-connection path** (the `prod-migrate.yml`
   workflow was RETIRED at the W11 cutover, 2026-07-23; see `docs/runbook-prod-migrations.md`):
   - From `packages/db`, set `DATABASE_URL_DIRECT` to the NEW project (`dfotoodqvmjhbdcxyaxf`)
     **session pooler, port 5432**, then run `pnpm db:migrate`.
   - Idempotent; already-applied migrations are skipped. Verify the journal + tracking rows after.
   - Ensure this drift check's `PROD_DATABASE_URL_DIRECT` secret targets the NEW project.
4. After the migrate run, check the next drift-check run (or trigger one manually) to confirm **UP TO DATE**.

## Secret required

`PROD_DATABASE_URL_DIRECT` — Supabase **session pooler** URL, port **5432** (same secret used by Prod Migrate). Set in **Settings → Secrets and variables → Actions**.
