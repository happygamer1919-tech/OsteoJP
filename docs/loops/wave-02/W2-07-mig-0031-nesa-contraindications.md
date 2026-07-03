# Loop W2-07 / 0031 - NESA contraindication flags (migration)

GATE: PRECONDITION — W2-01 (migration 0030) must be MERGED to main first; 0030 is the latest migration on main and no other migration PR is open (one migration in flight at a time). MIG lane. Green terminal (GREEN chained runner). Confirm 0030 is latest before dispatch.

## Field 1. Scope and ground truth
Migration 0031. Add contraindication flags so the NESA booking warning (W2-08) has a data source, implementing ruling A (DECISIONS 2026-07-03 "NESA contraindications: booking-time warning"). Columns only, on existing tables — no new table, no backfill (all default false), RLS untouched (new columns ride the existing table policies/grants). Ground truth for the policy is that DECISIONS entry; on conflict, HALT.

Schema ground truth (verify through 0030 on main, `packages/db/src/schema.ts` — recon before writing):
- `patients`: add `contraindication_epilepsy boolean NOT NULL DEFAULT false` and `contraindication_pregnancy boolean NOT NULL DEFAULT false`.
- `services`: add `contraindication_sensitive boolean NOT NULL DEFAULT false`.
- Confirm none of these columns already exist (grep: expect zero). No SPEC conflict.
- Columns-only on existing tables: new columns inherit each table's existing RLS (tenant isolation, fail-closed) and GRANTs; no new policy/grant/isolation test needed (same shape as 0024's columns-on-appointments decision, DECISIONS 2026-07-01).

No backfill: every existing row takes the `false` default. `NOT NULL DEFAULT false` is safe on populated tables (default fills existing rows).

Credentials and mirror: same ground truth as the 0026–0030 loops (`packages/db/.env`; `node scripts/sync-supabase-migrations.mjs` then `--check` before PR). Source env manually; never print its contents.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-mig-0031 origin/main -b osteojp-mig-0031`; assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary checkout); assert clean tree. Never `git checkout -b` in a shared checkout. HALT if either fails.
2. Read-only recon, report BEFORE writing: confirm 0030 is the latest migration on main and no migration PR is open; confirm the three columns do not already exist on `patients`/`services`. Report findings.
3. Author migration 0031 + Drizzle schema in `packages/db`:
   - `ALTER TABLE public.patients ADD COLUMN contraindication_epilepsy boolean NOT NULL DEFAULT false, ADD COLUMN contraindication_pregnancy boolean NOT NULL DEFAULT false;`
   - `ALTER TABLE public.services ADD COLUMN contraindication_sensitive boolean NOT NULL DEFAULT false;`
   - Update `schema.ts` for both tables to match.
4. Generate the Supabase mirror: `node scripts/sync-supabase-migrations.mjs`, then run `--check` and confirm sync.
5. Tests: the three columns exist with default `false` (a fresh insert without them yields false); tenant isolation on `patients`/`services` is UNAFFECTED (existing RLS suite stays green — no new isolation test required since no new table/policy, but the suite must remain green).
6. Apply on dev; full db suite green.

## Field 3. Definition of done (machine-verifiable)
- 0031 applies clean on dev (paste apply output).
- Mirror `--check` in sync (paste the pass line).
- db suite green (paste totals).
- Columns exist with `false` defaults: paste an insert-without-the-columns showing all three default to false.
- Migration-only diff plus `schema.ts`: `git diff --name-only` shows only the new migration file(s), the Supabase mirror, and `packages/db/src/schema.ts` (no UI files, no workflows).

## Field 4. Verification (paste evidence)
Recon findings (0030 latest, no open migration PR, columns absent), apply-clean output, mirror `--check` line, db test totals, default-false insert evidence, the migration-only `git diff --name-only`.

## Field 5. Restrictions and scope boundary
- Migration + Drizzle schema + (if any) column tests ONLY. NO UI files (the checkboxes and warning are W2-08).
- No backfill logic (defaults handle existing rows). Do not weaken RLS; columns ride existing `patients`/`services` policies and grants.
- One migration in flight, sequential numbering (0031 follows 0030). Confirm before dispatch.
- Never touch `db-tests.yml` or `e2e.yml`. No merge-bypass; normal squash merge only.

## Field 6. Halt loud if
- Any of the three columns (or equivalents) already exist, or any 0031 artifact is already on main.
- 0030 is not the latest migration on main, or a migration PR is open.
- The mirror `--check` diverges, or the change needs anything beyond the three boolean columns (e.g. a lookup table) — surface it.
- Adding `NOT NULL DEFAULT false` cannot be applied cleanly to the populated tables.

## Field 7. Report back
Recon findings, apply-clean, mirror `--check`, db test totals, default-false evidence, migration-only diff, PR number.
Close: open a PR per template. (GREEN chained runner: apply the MERGE GATE per LOOP-DISPATCH.md — every required check SUCCESS polled until nothing PENDING, diff touches neither db-tests.yml nor e2e.yml, PR mergeable. A refused merge is a HALT.)
