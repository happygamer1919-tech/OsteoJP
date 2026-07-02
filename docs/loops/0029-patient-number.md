# Loop 0029 - Patient number (sequential per-tenant patient ID)

GATE: none — ruling received (JP, 2026-07-02, DECISIONS.md). MIG lane. Green terminal (GREEN chained runner). One migration in flight at a time — confirm 0028 is the latest migration on main and no other migration PR is open before dispatch.

## Field 1. Scope and ground truth
Migration 0029. Add a per-tenant sequential patient number to `patients`, implementing the JP ruling (DECISIONS.md 2026-07-02): plain integers, no prefix, zero-padded to a 4-digit minimum AT DISPLAY ONLY, unique within a tenant, migrated Fisiozero patients keep their original number, new patients get `MAX+1` per tenant. Ground truth for the policy is that DECISIONS entry; on any conflict with it, HALT.

Schema ground truth (verified through 0028 on main, `packages/db/src/schema.ts`):
- `patients` (`schema.ts:341`): `id`, `tenant_id` (NOT NULL, FK → tenants cascade), `full_name`, plus demographic/identity columns; `created_at timestamptz NOT NULL default now()`, `deleted_at` (soft delete). No `patient_number` column exists yet (grepped: zero matches). No numbering scheme in SPEC-v2-patients (no contradiction).
- Dev fingerprint (wave-close, STATE.md 2026-07-02): `patients` = 50, single dev tenant (`3a2d0711-…`). Backfill must produce exactly 50 numbered rows.
- Insert path for new patients: `createPatient` at `apps/web/lib/patients/actions.ts:37`, inside `runScoped(ctx, tx => tx.insert(patients).values({ tenantId: ctx.tenantId, … }))`. The assignment hooks here.

Column shape (per the locked policy): `patient_number integer`, stored UNPADDED; `UNIQUE (tenant_id, patient_number)`; per-tenant (cross-tenant duplicate numbers allowed). Padding is render-only (min 4 digits), never in the column.

Credentials and mirror: same ground truth as the 0026-0028 loops (`packages/db/.env`; generate the Supabase mirror and run `--check` before PR). Source env manually; never print its contents.

## Field 2. Ordered steps
1. A0 isolation guard: own worktree off origin/main (`git worktree add ../osteojp-patient-number origin/main -b osteojp-patient-number`), assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary checkout), assert clean tree. Never `git checkout -b` in a shared checkout. HALT if either assertion fails.
2. Read-only recon, report BEFORE writing: confirm `patients` has no `patient_number`; confirm 0028 is the latest migration on main and no migration PR is open; confirm the dev patients count (expect 50) and the tenant set; confirm the house race-safe assignment mechanism to use (unique-violation retry vs transaction-scoped advisory lock) against existing insert patterns. Report findings.
3. Write migration 0029 in three ordered statements (standard backfill-then-constrain shape):
   a. `ALTER TABLE public.patients ADD COLUMN patient_number integer;` (nullable first).
   b. Backfill existing rows sequentially PER TENANT, ordered by `created_at` (tiebreak `id`), starting at 1: assign via a window function, e.g. `UPDATE patients p SET patient_number = s.rn FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn FROM patients) s WHERE p.id = s.id;`. Soft-deleted rows (`deleted_at` not null) are still numbered (they remain patients of record).
   c. `ALTER TABLE public.patients ALTER COLUMN patient_number SET NOT NULL;` then `ADD CONSTRAINT patients_tenant_number_uq UNIQUE (tenant_id, patient_number);` plus a supporting index if the unique does not already serve `(tenant_id, patient_number)` lookups.
4. New-patient assignment path (application code within this loop, in `createPatient`): inside the tenant-scoped tx, compute `COALESCE(MAX(patient_number), 0) + 1` for `ctx.tenantId` and insert with it; on unique-violation retry with the recomputed max (bounded retries), OR serialize per tenant with a transaction-scoped advisory lock — whichever recon selected. The invariant is fixed: no within-tenant duplicate, race-safe under concurrent inserts. No gap-free guarantee is required (a failed/rolled-back insert may leave a hole).
5. Tests: uniqueness per tenant; cross-tenant duplicate number ALLOWED; backfill produced contiguous 1..N per tenant ordered by created_at; new-patient assignment yields `MAX+1`; a concurrent double-insert does not produce a duplicate (race-safety).
6. Generate the Supabase mirror, run `--check`. Apply on dev, db tests green.

## Field 3. Definition of done (machine-verifiable)
- 0029 applies clean on dev.
- Backfill count equals the patients count: every `patients` row has a non-null `patient_number`, and the numbered count equals 50 (paste `SELECT count(*)` before/after, and per-tenant `min/max/count`).
- Uniqueness test: a second insert of an existing `(tenant_id, patient_number)` is rejected (paste the rejection).
- Cross-tenant test: the same `patient_number` under two different `tenant_id`s is accepted (paste both rows).
- New-patient assignment round-trip proven LIVE on dev: create a patient, assert it received `MAX+1` for its tenant, then purge with `DELETE … RETURNING` (paste the returned row).
- Mirror `--check` in sync (paste the pass line). db suite green (paste count).

## Field 4. Verification (paste evidence)
Recon findings, apply-clean output, backfill count (=50) + per-tenant min/max/count, uniqueness rejection, cross-tenant acceptance, live new-patient `MAX+1` round-trip and purge with RETURNING, mirror `--check` line, db test count.

## Field 5. Restrictions and scope boundary
- Migration + the minimal assignment wiring in `createPatient` only. NO display/padding work (the zero-pad-to-4 is Max's UI row, unblocked when 0029 merges) and NO Fisiozero import code (import is future work; the collision-HALT policy is recorded in DECISIONS, not built here).
- Store the integer UNPADDED. Never store `0001` as text.
- Do not weaken RLS; `patient_number` is covered by existing `patients` grants/RLS.
- No `db-tests.yml` or `e2e.yml`. `tenant_id` from JWT, never payload. No merge-bypass.

## Field 6. Halt loud if
- A `patient_number` (or equivalent) column already exists, or any 0029 artifact is already on main.
- The dev patients count is not 50, or a tenant has rows that cannot be totally ordered by `created_at` in a way that yields deterministic numbering.
- The policy in DECISIONS.md 2026-07-02 conflicts with committed SPEC-patients, or a race-safe assignment cannot be achieved with the house patterns.
- The mirror `--check` diverges, or the migration needs schema beyond the single column + unique constraint.

## Field 7. Report back
Recon findings, apply-clean, backfill=50 proof, uniqueness + cross-tenant tests, live new-patient assignment round-trip + purge, mirror `--check`, db test count, PR number.
Close: open a PR per template. (GREEN chained runner: apply the merge gate per LOOP-DISPATCH.md.)
