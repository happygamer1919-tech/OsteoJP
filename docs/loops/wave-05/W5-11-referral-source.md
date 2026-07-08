# Loop W5-11 - Referral source (migration 0033) (Batch 3, MIGRATION, strictly sequential)

GATE: **MIG lane.** One migration in flight at a time, strictly sequential. This is the FIRST Batch-3 migration; it lands before W5-12. **Live-apply verification before DONE.** Touches `packages/db/migrations` + `supabase/migrations` (mirror) - NOT `.github/workflows`.

## Field 1. Scope and ground truth
Migration **0033** adds `patients.referral_source` (nullable). The new-patient form gains an optional dropdown **"Como nos conheceu?"** with **Redes sociais, Website, Recomendacao de um amigo, Outro** (free-text when Outro); shown on the profile.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- **Migration head is 0032** (`0032_secondary_participants`, mirror parity 33/33 at Wave 04 close). Next number is **0033**.
- **`referral_source` is absent everywhere** (recon grep of `packages/db` + `apps/web`: no column, no field). Genuine net-new column - a migration IS required (unlike W5-03/W5-12).
- **Migration tooling (DECISIONS 2026-07-07 W4-19 note):** drizzle snapshots are frozen at 0014; migrations 0015+ are **hand-authored SQL + a manual `_journal.json` entry** (no snapshot). `drizzle-kit generate` produces a spurious full-schema diff and MUST NOT be used. Mirror to `supabase/migrations` via `db:sync-supabase`; `--check` must be green (parity N/N).
- **Column-add RLS/grants precedent (0022 profession/region, 0031 nesa flags):** a column-only add on `patients` inherits the table-level RLS (tenant isolation, fail-closed) and the table GRANTs automatically - **no new RLS policy needed**. The patient role's column-scoped UPDATE grant deliberately **excludes** staff-entered demographic columns (profession/region); `referral_source` is staff-entered too, so **exclude it from the patient self-update grant** (follow the 0022 precedent - staff data).
- New-patient form: `apps/web/app/patients/_components/patient-form.tsx` + `apps/web/lib/patients/actions.ts` (`createPatient`). Profile display: `apps/web/app/patients/[id]/page.tsx` "Dados pessoais" card `personalRows` (the same array that already renders profession/city/region).
- **RECON FIRST (report BEFORE building):** re-confirm 0033 is the next number and no open migration PR; re-confirm `referral_source` still absent; confirm the hand-authored SQL + `_journal.json` pattern and the `db:sync-supabase --check` mirror step.

**Scope:** migration 0033 adds `patients.referral_source text` (nullable), excluded from the patient self-update column grant (staff data); form gains the optional "Como nos conheceu?" dropdown (Redes sociais / Website / Recomendacao de um amigo / Outro, free-text on Outro) passed through `createPatient`; profile shows it in the Dados pessoais card. **Live-apply verification before DONE.** pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-11-referral origin/main -b osteojp-w5-11-referral`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Pre-flight (MIG lane):** the latest migration on main is exactly 0032; no open migration PR; `referral_source` still absent. Paste the check.
3. **Migration 0033 (hand-authored):** `ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS referral_source text;` following the 0022/0031 SQL style (header comment; NO drizzle-kit generate). Add the manual `_journal.json` entry. Keep it out of the patient self-update column grant (staff data - 0022 precedent).
4. **Mirror:** `db:sync-supabase`; `--check` green (parity bumps to N+1/N+1, head 0033). Paste the parity line.
5. **Live-apply verification:** apply the migration to the dev DB and confirm the column exists (`referral_source` present, nullable, no backfill needed - every existing row NULL). Paste the applied-head + column proof.
6. **Form + profile UI:** optional "Como nos conheceu?" dropdown (four options, free-text on Outro) -> `createPatient`; profile Dados pessoais row (conditional, like profession). Store the enum-ish value; if Outro, store the free-text (decide: single column with the free-text, or a fixed set + free-text - recommend single `referral_source text` holding either the option label or the Outro free-text, kept simple).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. an isolation assertion that the new column rides the patients tenant policy), `pnpm build`, `pnpm test:e2e` (create with each option, incl. Outro free-text -> profile shows it).

## Field 3. Definition of done (machine-verifiable)
- **Migration present + mirrored:** 0033 SQL + `_journal.json` entry; `db:sync-supabase --check` green (paste head 0033 + parity N/N).
- **LIVE-APPLY PROOF:** the migration is applied to the dev DB, head is 0033, and `referral_source` exists (nullable). Paste the applied-head + a column check.
- **Grant PROOF:** `referral_source` is NOT in the patient role's column-scoped UPDATE grant (staff data - 0022 precedent). State + show.
- **Recon/pre-flight pasted:** 0032 head, no open migration PR, column absent before.
- **Form + profile e2e:** create with each option (incl. Outro free-text) -> value persists -> profile Dados pessoais shows it. Paste it.
- **RLS coverage:** the new column rides the existing patients tenant policy (no cross-tenant read/write); paste the isolation assertion.
- **Suite counts** (baseline @osteojp/db 56 + gated, web 816) with green gates.
- **Workflow-untouched PROOF:** `git diff --name-only origin/main` shows NO change under `.github/workflows/`. Paste it.

## Field 4. Verification (paste evidence)
Pre-flight (head 0032, no open migration PR), the 0033 SQL + journal entry, `db:sync-supabase --check` parity, the LIVE-APPLY proof (head 0033 + column exists), the grant proof, the create/profile e2e, the RLS assertion, suite counts, `.github/workflows` untouched diff, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`; **MIG lane - one migration in flight, sequential** (this lands before W5-12).
- **Hand-authored SQL + manual `_journal.json`; NEVER `drizzle-kit generate`** (spurious diff, DECISIONS 2026-07-07). Mirror via `db:sync-supabase`, `--check` green.
- **Live-apply before DONE.** No backfill (new nullable column).
- **Never touch `.github/workflows/` (db-tests.yml / e2e.yml)** - automatic owner hold.
- Staff-entered data - exclude from the patient self-update grant (0022 precedent). Audit on write (rule 6).
- **Synthetic data only** for verify; dev tenant caution. pt-PT i18n (both files), no emoji, UI-STYLE.md.
- **Never force-push / `--admin` / bypass protection.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. Halt if: head is not 0032 at start / another migration PR is open (sequencing violation - wait, do not race); `referral_source` unexpectedly already exists (briefing mismatch); the mirror `--check` will not go green; or the dropdown option set / Outro storage needs a product call not covered here.

## Field 7. Report back
Pre-flight, the 0033 migration + journal, the mirror parity, the LIVE-APPLY proof, the form/profile implementation + e2e, the grant + RLS proofs, `.github/workflows` untouched proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge (migration PRs are owner-merged in the dev-phase MIG lane per LOOP-DISPATCH).
