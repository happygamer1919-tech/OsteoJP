# Loop W2-01 / 0030 - patient_note_revisions (append-only patient-note history)

GATE: none — patient-notes design ruling received (Ivan, DECISIONS.md 2026-07-03, implementing JP's 2026-07-02 full-version-history ruling). MIG lane. Green terminal (GREEN chained runner). One migration in flight at a time — confirm 0029 is the latest migration on main and no other migration PR is open before dispatch.

## Field 1. Scope and ground truth
Migration 0030. Create the append-only relation `patient_note_revisions` that gives patient notes a full version history (JP, DECISIONS 2026-07-02), and backfill the current single-field notes into it as revision 1. This loop CREATES the relation and BACKFILLS only; it does NOT touch `patients.notes`, does NOT drop any column, and does NOT rewire any UI (the UI flip is W2-11). Ground truth for the transition plan is DECISIONS.md 2026-07-03 "Patient notes: migration/UI transition plan"; on any conflict with it, HALT.

Schema ground truth (verify through 0029 on main, `packages/db/src/schema.ts` — recon before writing):
- `patients` (`schema.ts`): `id uuid pk`, `tenant_id` (NOT NULL, FK → tenants cascade), and a current-value `notes` text column. Confirm the exact `notes` column name and type before writing the backfill; HALT if it is not a single text column as assumed.
- `patient_note_revisions` does NOT exist yet (grep: expect zero matches). No SPEC conflict (SPEC-v2-patients specifies no revision table).
- Precedent to mirror: `appointment_notes` (0026) and `analytics_events` (0025) — app-written append-only tables using the POLICY pattern (SELECT + INSERT policies present; UPDATE/DELETE denied by absence-of-policy as 0 rows; table keeps the full DML grant). Use the SAME mechanism (DECISIONS 2026-07-01 "Append-only table conventions").

Table shape (locked):
- `id uuid` primary key (default `gen_random_uuid()` per house pattern).
- `tenant_id uuid NOT NULL` (FK → tenants, cascade — match sibling tables).
- `patient_id uuid NOT NULL` FK → `patients.id`.
- `content text NOT NULL`.
- `author_user_id uuid` NULL FK → `users.id` (NULL = system/backfill, no known author).
- `created_at timestamptz NOT NULL default now()`.
- Index `(tenant_id, patient_id, created_at desc)` for reading a patient's history newest-first.

Backfill (in the same migration): for every patient with a non-empty `patients.notes`, insert exactly ONE revision — `content` = current `patients.notes`, `author_user_id` = NULL, `created_at` = now(). Patients with empty/null notes get zero revisions. `patients.notes` is left untouched.

Credentials and mirror: same ground truth as the 0026–0029 loops (`packages/db/.env`; generate the Supabase mirror with `node scripts/sync-supabase-migrations.mjs` and run `--check` before PR). Source env manually; never print its contents.

## Field 2. Ordered steps
1. A0 isolation guard: own worktree off origin/main (`git worktree add ../osteojp-mig-0030 origin/main -b osteojp-mig-0030`), assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary checkout), assert `git status --porcelain` is empty. Never `git checkout -b` in a shared checkout. HALT if either assertion fails.
2. Read-only recon, report BEFORE writing: confirm 0029 is the latest migration on main and no migration PR is open; confirm `patient_note_revisions` does not exist; confirm the exact `patients.notes` column name/type; run and paste the pre-migration count query `SELECT count(*) FROM patients WHERE notes IS NOT NULL AND btrim(notes) <> '';` (this is the expected backfill count). Report findings.
3. Author the Drizzle migration 0030 + schema in `packages/db`:
   a. `CREATE TABLE public.patient_note_revisions (...)` with the columns above, FKs, and the `(tenant_id, patient_id, created_at desc)` index.
   b. Enable RLS; add the POLICY-pattern policies: `SELECT` and `INSERT` tenant-scoped on `tenant_id = jwt_tenant_id()` (fail-closed), NO `UPDATE`/`DELETE` policy (append-only enforced as 0 rows), table keeps the full DML grant — mirror `appointment_notes`/`analytics_events` exactly.
   c. Backfill statement: `INSERT INTO public.patient_note_revisions (tenant_id, patient_id, content, author_user_id, created_at) SELECT tenant_id, id, notes, NULL, now() FROM public.patients WHERE notes IS NOT NULL AND btrim(notes) <> '';`
   d. Add the Drizzle schema definition for the new table in `schema.ts` matching the migration.
4. Generate the Supabase mirror: `node scripts/sync-supabase-migrations.mjs`, then run it with `--check` and confirm sync.
5. Tests (next to the migration/schema, CI-gated):
   - RLS isolation: a tenant cannot SELECT another tenant's revisions (fail-closed).
   - Append-only MECHANISM (assert the actual mechanism, not just intent): an authenticated UPDATE and DELETE each affect 0 rows (POLICY pattern), NOT a 42501 throw — same assertion style as the `appointment_notes` tests.
   - Backfill correctness: revision count == number of patients with non-empty `notes`; each backfilled revision has `author_user_id IS NULL` and its `content` equals the source `patients.notes`.
6. Apply on dev; run the full db suite green.

## Field 3. Definition of done (machine-verifiable)
- 0030 applies clean on dev (paste apply output).
- Mirror `--check` in sync (paste the pass line).
- db suite green with the new tests included (paste totals; baseline was 294 before this loop — the new tests raise it, paste the new total).
- Backfill count pasted AND equal to the pre-migration count query in step 2 (`patients` with non-empty `notes`); paste both numbers side by side.
- Append-only mechanism proven: paste the 0-row UPDATE and 0-row DELETE results.
- `patients.notes` untouched: `git diff` shows no ALTER/DROP on `patients` and no change to the `notes` column.

## Field 4. Verification (paste evidence)
Recon findings (0029 latest, no open migration PR, exact `notes` column, pre-migration non-empty count), apply-clean output, mirror `--check` line, db test totals (new vs 294 baseline), backfill count == pre-migration count, 0-row UPDATE/DELETE evidence, RLS isolation test result.

## Field 5. Restrictions and scope boundary
- Migration + Drizzle schema + tests ONLY. NO UI files, NO changes to `patients.notes`, NO drop of any column, NO Notas Rápidas rewiring (that is W2-11).
- One migration in flight, sequential numbering (0030 follows 0029). Confirm before dispatch.
- Never touch `db-tests.yml` or `e2e.yml`. `tenant_id` from JWT context in app paths, never payload.
- Use the POLICY append-only pattern (not the no-grant/42501 pattern) — match `appointment_notes`. Do not mix enforcement layers on one verb (the 0023-vs-0025 lesson, DECISIONS 2026-07-01).
- No merge-bypass. Normal squash merge only.

## Field 6. Halt loud if
- `patient_note_revisions` (or an equivalent) already exists, or any 0030 artifact is already on main.
- 0029 is not the latest migration on main, or a migration PR is open.
- `patients.notes` is not a single text column as assumed (backfill premise breaks).
- The mirror `--check` diverges, or the append-only mechanism cannot be proven as 0-rows the way `appointment_notes` is.
- The backfill count does not match the pre-migration non-empty-notes count.

## Field 7. Report back
Recon findings, apply-clean, mirror `--check`, db test totals, backfill == pre-migration count proof, append-only 0-row evidence, RLS isolation result, PR number.
Close: open a PR per template. (GREEN chained runner: apply the MERGE GATE per LOOP-DISPATCH.md — every required check SUCCESS polled until nothing PENDING, diff touches neither db-tests.yml nor e2e.yml, PR mergeable. A refused merge is a HALT.)
