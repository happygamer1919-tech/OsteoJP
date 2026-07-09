# Loop W5-21 - Portador de pacemaker contraindication (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (MIGRATION path per recon).** Adds "Portador de pacemaker" to the NESA contraindication set alongside Epilepsia and Gravidez. Recon (below) proves the flags are DEDICATED BOOLEAN COLUMNS, so this loop carries **migration 0034**. Strictly sequential (one migration in flight); fetch-and-fast-forward before any live-DB op; live-apply verification before DONE.

## Field 1. Scope and ground truth

Add a third NESA contraindication, **"Portador de pacemaker"**: checkbox in the new-patient form and patient edit, shown on the profile, included in the NESA booking-warning logic (the warning **never blocks**, unchanged).

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory):
- **STORAGE VERDICT: DEDICATED BOOLEAN COLUMNS (migration required, NOT data-driven).** Migration `supabase/migrations/0031_nesa_contraindications.sql` added `patients.contraindication_epilepsy boolean NOT NULL DEFAULT false` and `patients.contraindication_pregnancy boolean NOT NULL DEFAULT false` (plus `services.contraindication_sensitive boolean` marking which services trigger the warning). Drizzle schema (`packages/db/src/schema.ts`): `contraindicationEpilepsy`, `contraindicationPregnancy` on the patients table; `contraindicationSensitive` on services. There is NO jsonb/array/config set - each contraindication is its own column, and the warning logic is a hardcoded enum. **Therefore the pacemaker flag needs migration 0034 adding `patients.contraindication_pacemaker`.**
- **Migration head is 0033** (W5-11 `referral_source`; W5-12 was migration-free, so 0034 was never created). Next number = **0034**. Mirror parity was 34/34 at Wave 05 close (supabase/migrations mirrors packages/db/migrations; keep both in sync + `_journal.json`).
- **NESA warning logic:** `apps/web/lib/scheduling/nesa.ts` - `type PatientContraindications = { epilepsy: boolean; pregnancy: boolean }`, `type ContraindicationKey = "epilepsy" | "pregnancy"`, and `matchedContraindications(patient, serviceSensitive)` pushes `"epilepsy"` / `"pregnancy"` when set AND the service is sensitive. The warning is SOFT (never blocks). Add `pacemaker` to the type, the key union, and the match logic.
- **Data fetch:** `apps/web/lib/patients/actions.ts` `getPatientContraindications(patientId)` selects `contraindicationEpilepsy` / `contraindicationPregnancy`; `createPatient` / `updatePatient` write them. Add pacemaker to all three.
- **Form:** `apps/web/app/patients/_components/patient-form.tsx` (shared by new-patient `patients/new/page.tsx` and edit `patients/[id]/edit/page.tsx`) renders the epilepsia/gravidez checkboxes in a NESA fieldset (`patients.contraindicationsLabel` legend). Add a pacemaker checkbox; add the field to the `Fields` type + state.
- **Validation:** `apps/web/lib/patients/validation.ts` parses the create/update inputs; add pacemaker to the input types + parse.
- **Booking drawer:** `apps/web/app/agenda/appointment-drawer.tsx` maps matched keys to i18n labels via `NESA_LABEL` and renders a non-blocking warning Banner (`appointment.nesaWarning`). Add pacemaker to `NESA_LABEL`.
- **Profile display:** `apps/web/app/patients/[id]/page.tsx` - the contraindication flags are currently NOT surfaced on the profile summary. Ruling: **show the pacemaker flag on the profile** (and, for consistency, the existing epilepsia/gravidez if trivially co-located - executor's call, but pacemaker MUST show).
- **i18n:** new key `patients.fieldContraindicationPacemaker = "Portador de pacemaker"` + the `NESA_LABEL` label, in BOTH `strings.pt.json` and `strings.en.json`.
- **RLS:** `patients` already has a tenant RLS policy; adding a boolean column to an existing table does NOT create a new domain table, so no new isolation test is mandated - but the migration must not weaken RLS, and the standard patient-self-update grant precedent (0022; staff-only columns excluded from patient self-update) applies to the new column.

**Both paths, made explicit (recon selects the migration path):**
- **Migration-free path (NOT applicable here):** would apply only if the 0031 flags were jsonb/array/config-driven. They are not. Do NOT invent a config layer to dodge the migration.
- **Migration path (SELECTED):** author migration 0034 `patients.contraindication_pacemaker boolean NOT NULL DEFAULT false`, mirror to supabase/migrations + `_journal.json`, then the schema + nesa.ts + actions.ts + validation.ts + form + drawer + profile edits. Standard migration rules: ONE migration in flight; **fetch-and-fast-forward before any live-DB operation**; **live-apply to the dev DB and verify** (`information_schema` shows the column) BEFORE marking DONE.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-21-pacemaker-contraindication origin/main -b osteojp-w5-21-pacemaker-contraindication`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** confirm the DEDICATED-BOOLEAN-COLUMN verdict against 0031 + schema.ts + nesa.ts; confirm migration head 0033 and that no other migration is in flight.
3. **Migration 0034:** author `patients.contraindication_pacemaker boolean NOT NULL DEFAULT false`; mirror to supabase/migrations; update `_journal.json` (parity). Exclude the column from the patient self-update grant (0022 precedent, staff data).
4. **Schema + server:** add `contraindicationPacemaker` to schema.ts; add to `getPatientContraindications`, `createPatient`, `updatePatient` (actions.ts) and to validation.ts input types + parse.
5. **NESA logic:** add `pacemaker` to `PatientContraindications`, `ContraindicationKey`, and `matchedContraindications`; the warning stays SOFT (never blocks).
6. **UI:** pacemaker checkbox in the shared patient-form NESA fieldset; the flag shown on the patient profile; `NESA_LABEL` entry in the booking drawer; i18n keys in both string files.
7. **Fetch-and-fast-forward, then LIVE-APPLY 0034 to the dev DB and verify** (`information_schema` confirms `contraindication_pacemaker`); drizzle applied-migration count reflects 0034.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation suite), `pnpm build`, `pnpm test:e2e` (a pacemaker patient booked into a sensitive service shows the warning; the warning does not block).

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** `git diff --name-only origin/main` shows exactly ONE new migration `0034_*` under packages/db/migrations + its supabase/migrations mirror + the `_journal.json` bump; NOTHING under `.github/workflows/`. Paste it.
- **Live-apply PROOF:** paste the `information_schema` row showing `patients.contraindication_pacemaker` (boolean, not null, default false) on the dev DB, and the drizzle applied-migration count = head 0034.
- **NESA warning PROOF:** an e2e/unit test where a pacemaker patient + a sensitive service surfaces "Portador de pacemaker" in the (non-blocking) NESA warning; booking still succeeds. Paste it.
- **Form + profile PROOF:** the pacemaker checkbox renders in new-patient AND edit; the flag shows on the profile. Paste the tests.
- **RLS intact:** the patients RLS isolation suite stays green (the new column does not weaken tenant isolation, and is excluded from the patient self-update grant). Paste the passing run.
- **i18n parity:** `patients.fieldContraindicationPacemaker` + the label in BOTH string files.
- **Suite counts** (baseline web 816, @osteojp/db 56 local + DB-gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report (storage verdict + migration head), the migration diff, the live-apply `information_schema` proof, the NESA-warning test, the form + profile tests, the passing RLS suite, i18n parity, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **ONE migration in flight.** Fetch-and-fast-forward before any live-DB op; live-apply + verify before DONE. Keep packages/db + supabase/migrations mirrors in parity with `_journal.json`.
- **The NESA warning is SOFT and never blocks** - do not change that (SPEC-ficha-medica sec 9 non-goal: the 0031 booking-warning system stays intact; this loop only ADDS a third flag).
- **New column excluded from the patient self-update grant** (0022 precedent; contraindications are staff data).
- **No destructive DB op.** Additive column only; `NOT NULL DEFAULT false` so existing rows are safe.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Recon CONTRADICTS the storage verdict - the 0031 flags turn out to be jsonb/array/config after all (then switch to the migration-free path and record the correction) OR the contraindication storage is genuinely AMBIGUOUS.
- A second migration is already in flight (never run two at once) - wait / surface it.
- The live-apply of 0034 fails or `information_schema` does not confirm the column - do not mark DONE.

## Field 7. Report back
Recon report (storage verdict), the migration 0034 + live-apply proof, the NESA-warning + form + profile tests, the passing RLS suite, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
