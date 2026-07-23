# Runbook: applying Drizzle migrations to production

> **RETIRED 2026-07-23 (W11 cutover).** `prod-migrate.yml` targeted the OLD project's migration
> path and is removed by the owner in W11-05. Production is now the NEW project
> (`dfotoodqvmjhbdcxyaxf`). The single sanctioned path is the **manual `drizzle-kit`
> direct-connection apply**: from `packages/db`, set `DATABASE_URL_DIRECT` to the NEW project's
> **session pooler (port 5432)** and run `pnpm db:migrate`, then verify the journal + tracking
> rows (drift check). See `docs/runbook-prod-migrations.md`. The steps below are history only.

Workflow: `.github/workflows/prod-migrate.yml` ("Prod Migrate (manual)") — RETIRED, see banner.

Merging a PR to `main` does **not** apply its `packages/db/migrations/*.sql`
to the production database. Prod drifts behind `main` until the migrations are
applied.

## Hard preconditions before FIRST use

Both must be true before this workflow is ever run. Do not run it otherwise.

1. **The prod `DATABASE_URL_DIRECT` credential has been rotated**, and the
   rotated value is stored as the `PROD_DATABASE_URL_DIRECT` repo Actions
   secret. Never reuse a connection string that has previously appeared in any
   log, terminal, or local `.env` shared outside the owner's machine.
2. **The Supabase project is on the Pro plan with PITR (point-in-time
   recovery) enabled.** Migrations are forward-only; PITR is the recovery path
   if a migration damages prod data.

## When to run

- After a PR that adds files under `packages/db/migrations/` merges to `main`.
- Whenever prod errors indicate missing tables/columns that exist on `main`
  (schema drift).

Run it from the `main` branch only, after the merge is complete.

## How to run

1. GitHub → **Actions** → **Prod Migrate (manual)** → **Run workflow**.
2. Branch: `main`.
3. In the confirmation input, type exactly: `MIGRATE-PROD`.
   Any other value fails the run immediately; nothing touches prod.
4. Start the run and watch it:
   - **Pre-flight** prints every local migration with `applied` / `PENDING`
     status against prod.
   - **Apply** runs the project's standard runner, `pnpm db:migrate`
     (`drizzle-kit migrate` in `packages/db`).
   - **Post-flight** prints the state again and the run fails if anything is
     still `PENDING`.
   - The final step lists exactly which migrations this run applied.

## Secret

- Name: `PROD_DATABASE_URL_DIRECT` (repo Actions secret).
- Value: the **Supabase session pooler** connection string on **port 5432**
  (`...pooler.supabase.com:5432/postgres`). Not the transaction pooler on
  port 6543 — `drizzle-kit migrate` needs session-level advisory locks, which
  the transaction pooler does not support. The workflow refuses to run if the
  URL is not on port 5432.
- The value lives only in GitHub Actions secrets and the Supabase dashboard.
  It is never committed, never printed in logs.

## Safety properties

- `workflow_dispatch` only: it can never fire from a push, PR, or schedule.
- Idempotent: drizzle-kit records applied migrations in
  `drizzle.__drizzle_migrations` and skips them on re-run. Re-running after a
  green run applies nothing and reports "(none — prod was already up to date)".
- A concurrency group prevents two runs from executing simultaneously.

## If a run fails

- **Gate failures** (wrong confirmation, missing secret, wrong port): nothing
  was executed against prod. Fix the input or secret and re-run.
- **Failure during `pnpm db:migrate`**: migrations apply in journal order, so
  everything before the failing one is applied and recorded; the failing one
  is not. Read the drizzle-kit error in the run log, fix forward via a new
  migration PR if the SQL itself is wrong, then re-run (already-applied
  entries are skipped). For data damage, PITR restore is the recovery path —
  that is an owner decision, log it in `docs/QUESTIONS.md` first.
