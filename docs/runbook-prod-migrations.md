# Runbook: Prod Migrations

> **W11 cutover update (2026-07-23): single migration path.** Production is now the NEW project
> (`dfotoodqvmjhbdcxyaxf`). **`prod-migrate.yml` (Path 1) is RETIRED** and removed by the owner in
> W11-05. The single sanctioned path is the **manual `drizzle-kit` direct-connection apply** (was
> "Path 2"): from `packages/db`, `DATABASE_URL_DIRECT` = the NEW project's **session pooler
> (port 5432)**, `pnpm db:migrate`, then verify the journal + tracking rows. This is the same path
> W11-02 used to stand up the NEW schema. Ignore the `prod-migrate.yml` / `MIGRATE-PROD` steps
> below (kept for history only); use the manual path.

This document covers the full lifecycle of a Drizzle migration from authoring to production, including the two application paths, the hard lesson from the June 2026 tracking reconstruction, and how the daily drift check surfaces missed migrations.

---

## Two registries, one truth

Every migration lives in two places that must stay in sync:

| Location | Purpose |
|---|---|
| `packages/db/migrations/*.sql` | Drizzle ORM source — tracked by `drizzle-kit`, journal at `packages/db/migrations/meta/_journal.json` |
| `supabase/migrations/*.sql` | Supabase CLI mirror — used by `supabase db reset` in CI and local dev |

`packages/db/migrations/` is authoritative. `supabase/migrations/` must be an exact copy. The `journal-sync` Vitest test (`packages/db/tests/journal-sync.test.ts`) enforces structural integrity on `packages/db/migrations/`; the supabase mirror is kept in sync manually when adding a migration.

---

## Authoring a migration

1. **Generate** — run `pnpm db:generate` (wraps `drizzle-kit generate`) in `packages/db/`. Drizzle diffs the schema against the last snapshot and writes a new `.sql` file and a snapshot into `packages/db/migrations/`.

2. **Review the SQL** — open the generated file. drizzle-kit is conservative but not infallible. Verify:
   - DROP statements only remove what you intend.
   - Columns are added as `NOT NULL DEFAULT ...` or `NULL` — never `NOT NULL` on a live table without a default unless the table is empty.
   - Index creation uses `CREATE INDEX CONCURRENTLY` if the table is large (add it manually if drizzle-kit omits it).

3. **Mirror to supabase** — copy the `.sql` file to `supabase/migrations/` with the same filename.

4. **Journal entry** — `drizzle-kit generate` writes the journal entry automatically. Verify it was added (`packages/db/migrations/meta/_journal.json` has a new entry at the end with the matching `tag`).

5. **CI gate** — the `journal-sync` test (runs in every PR via the `db-tests` job) enforces four invariants:
   - Every `.sql` file has a journal entry.
   - Every journal entry has a `.sql` file.
   - `idx` values are contiguous from 0.
   - Entries are sorted by `idx` ascending.

   A SQL file with no journal entry, or a journal entry with no SQL file, is a hard failure. This is the automated guard against the situation described in "The hard lesson" below.

---

## Path 1 — Standard: prod-migrate.yml

**Use this for:** additive changes (new tables, new columns with defaults, new indexes, new grants, new functions). The vast majority of migrations.

Workflow: `.github/workflows/prod-migrate.yml`  
Full documentation: `docs/ops/prod-migrate.md`

**Summary:**

1. Merge the migration PR to `main`.
2. Actions → **Prod Migrate (manual)** → **Run workflow**, branch `main`.
3. Type `MIGRATE-PROD` in the confirmation field.
4. Watch the run:
   - Pre-flight lists all migrations with `applied` / `PENDING` status.
   - `pnpm db:migrate` applies pending entries via `drizzle-kit migrate`.
   - Post-flight verifies no `PENDING` entries remain.
5. **Verify schema objects in prod** (see "Verify, don't just trust" below).

The workflow uses `PROD_DATABASE_URL_DIRECT` — the Supabase session pooler on port 5432. The transaction pooler on port 6543 is rejected: `drizzle-kit migrate` holds a session-level advisory lock for the duration of the run, which transaction poolers don't support.

---

## Path 2 — High-risk: manual atomic transaction

**Use this for:** destructive changes (DROP COLUMN on a large table, data backfills, type changes that can't be done online), or any migration where the drizzle-kit-generated SQL isn't safe to run as-is in prod.

**Before starting:**

1. Confirm PITR is enabled on the Supabase project (Pro plan required). If it's off, do not proceed — PITR is the recovery path if the migration damages data. Log it in `docs/QUESTIONS.md`.
2. Write a verified rollback plan. "PITR restore" is acceptable only if you know the PITR lag for this project and have the restore procedure ready.
3. Run the SQL in a transaction (`BEGIN ... COMMIT`) so it either lands completely or rolls back entirely. drizzle-kit doesn't always wrap migrations in a transaction; check the generated SQL and add `BEGIN`/`COMMIT` manually if absent.

**Steps:**

1. Open the Supabase dashboard → SQL Editor (or connect via `psql` using `PROD_DATABASE_URL_DIRECT`).
2. Wrap the migration SQL in a transaction if not already present.
3. Run a `SAVEPOINT` or `BEGIN` + verify the expected state in a transaction, then `COMMIT` or `ROLLBACK`.
4. After the SQL lands, manually insert the tracking row so `drizzle-kit` and the drift check know it's applied:
   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('<tag_from_journal>', <when_from_journal>);
   ```
   The `when` value is the millisecond timestamp from the journal entry. The drift check matches on `created_at = when`.
5. **Verify schema objects** (see below).
6. Trigger the **Prod Schema Drift Check** manually to confirm the tracking row registers as applied.

---

## Verify, don't just trust

`drizzle.__drizzle_migrations` tracks which migrations have been applied by timestamp. But tracking rows can be inserted without the migration SQL ever running (as happened in June 2026 — see "The hard lesson" below). A tracking row proves the row exists, not the schema object.

**After every migration to prod, verify the actual schema objects:**

- **New table:** `SELECT to_regclass('public.my_table') IS NOT NULL;`
- **New column:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'my_table' AND column_name = 'my_column';`
- **New index:** `SELECT indexname FROM pg_indexes WHERE tablename = 'my_table' AND indexname = 'my_idx';`
- **New function/trigger:** `SELECT proname FROM pg_proc WHERE proname = 'my_function';`
- **GRANT:** `SELECT has_table_privilege('patient', 'patients', 'SELECT');`

Run these checks in the Supabase SQL Editor or via `psql`. If the object is missing, the migration SQL did not run; the tracking row is wrong.

---

## The hard lesson — June 2026

Between the initial project setup and June 2026, migrations `0008_ai_ingestion_requests` through `0013_review_finalize_audit` were applied directly to prod outside of drizzle-kit's tracking mechanism. They exist as schema objects in prod but were never registered in `drizzle.__drizzle_migrations`. Separately, migrations `0014_migration_staging` through `0019_patient_reminder_prefs` were applied manually (as raw SQL, not via `drizzle-kit migrate`) and then registered retroactively by hand-inserting rows into `drizzle.__drizzle_migrations` to match the journal's `when` timestamps.

**The consequence:** for a period, `drizzle-kit migrate` would have re-applied 0008–0013 from scratch (dropping and recreating tables) if run against prod without the reconstructed tracking rows. `drizzle-kit` idempotency relies entirely on `drizzle.__drizzle_migrations`.

**What was fixed (PR #338):**
- `_journal.json` was reconciled to include entries for all 0008–0019.
- Tracking rows were reconstructed in `drizzle.__drizzle_migrations` to match.
- The `journal-sync` test was added to prevent this from silently diverging again.

**What this means going forward:**

1. Never apply a migration to prod without also writing the journal entry and the tracking row. The journal entry gates on CI (`journal-sync` test). The tracking row is written by `drizzle-kit migrate` automatically via `prod-migrate.yml`, or manually for path 2.

2. When in doubt about whether a migration is truly applied in prod, **query the schema object** — don't trust the tracking row alone. Tracking rows can be wrong. Schema objects cannot lie.

3. If you ever need to reconstruct tracking rows again (a second incident), use the journal's `when` values as `created_at`, not `NOW()` — drizzle-kit matches by timestamp, not by sequential order.

---

## Drift monitoring — prod-drift-check

Workflow: `.github/workflows/prod-drift-check.yml`  
Full documentation: `docs/ops/prod-drift-check.md`

The workflow runs daily at 07:00 UTC (08:00 Lisbon) and on `workflow_dispatch`. It reads `packages/db/migrations/meta/_journal.json` and compares the `when` timestamps against `drizzle.__drizzle_migrations.created_at` in prod.

- **UP TO DATE ✅** — all journal entries have a matching tracking row.
- **DRIFT DETECTED ⚠️** — one or more journal entries have no tracking row. The summary lists the pending migrations by name and links to `prod-migrate.yml`.

This check is **not a required CI gate** — it is informational and never blocks a PR. It runs on a schedule, not on pull requests. A drift alert means: run `prod-migrate.yml` (or apply the migration manually and insert the tracking row), then confirm the next drift check run is green.

**Limitation:** the drift check only detects missing tracking rows. It cannot detect a tracking row that was inserted without the corresponding SQL running. For that, use the schema-object verification queries above.

---

## Quick reference

| Task | Command / Workflow |
|---|---|
| Author a migration | `pnpm db:generate` in `packages/db/`, then copy to `supabase/migrations/` |
| Verify journal integrity | `pnpm test` (runs `journal-sync.test.ts`) |
| Apply to prod (standard) | Actions → Prod Migrate (manual) → type `MIGRATE-PROD` |
| Check drift manually | Actions → Prod Schema Drift Check → Run workflow |
| Verify schema object | Supabase SQL Editor → query `information_schema` or `pg_indexes` |
