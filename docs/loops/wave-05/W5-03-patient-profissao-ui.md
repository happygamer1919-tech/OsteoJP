# Loop W5-03 - Patient Profissao UI (Batch 1, migration-free) - RECON MISMATCH: likely already shipped

GATE: none. UI-only lane, migration-free. **Read the RECON MISMATCH block before doing anything.**

## Field 1. Scope and ground truth
Briefing intent: expose the existing `patients.profession` column in the new-patient form as an optional **Profissao** field and display it on the patient profile. UI-only; the briefing named "if the column is absent, that is a briefing mismatch, HALT."

**>>> RECON MISMATCH (2026-07-08) - surface at merge, do not silently proceed as if net-new <<<**
Recon found the work the briefing describes is **already shipped**:
- `patients.profession text` (nullable) EXISTS - migration `0022_patient_profession_region.sql` (column confirmed; the patient role's column-scoped UPDATE grant deliberately excludes profession as staff data).
- The **new-patient form already collects Profissao** - `apps/web/app/patients/_components/patient-form.tsx` lines 147-153 (`s["patients.fieldProfession"]`, state-managed, passed to `createPatient` in `apps/web/lib/patients/actions.ts`).
- The **patient profile already displays Profissao** - `apps/web/app/patients/[id]/page.tsx` line ~119 (`if (patient.profession) personalRows.push([s["patients.fieldProfession"], patient.profession])`) in the "Dados pessoais" card of the Resumo tab.

So the column is **present** (not the absent-column halt case), and the form field + profile display **already exist**. The briefing's premise (Profissao missing from the form) does not hold. Per the blocked-task protocol this is logged as **QUESTIONS Q-W5-6** with a recommended default. This is a per-loop mismatch, not a whole-wave blocker; the other 16 loops are unaffected.

**Recommended disposition (Q-W5-6, default):** close W5-03 as **already-shipped** after a thin verification pass (mirrors the W4-16 docs-only already-shipped close), OR, if the owner wants the loop to add value, scope it down to the small residual gaps below. Owner/Ivan confirms which.

**Residual-gap candidates (only if the loop stays open, all UI-only):**
- Confirm the Profissao field is explicitly **optional** (no required marker) and reads as optional in the label/help.
- Add **e2e coverage** if none asserts profession round-trips create-form -> profile.
- Confirm profile display placement matches UI-STYLE.md "Dados pessoais" card.

**RECON FIRST (report BEFORE any edit):** re-verify the three bullets above against `origin/main`. If all three still hold, the default is a verification-only close.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-03-profissao origin/main -b osteojp-w5-03-profissao`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** re-verify column present (0022), form field present (patient-form.tsx 147-153), profile display present (page.tsx ~119). Paste the three findings.
3. **Decision gate:** if all three hold -> this is the already-shipped case: HALT to Ivan per Q-W5-6 (recommended default: docs-only already-shipped close) rather than inventing rework. If the owner has already directed "close the residual gaps," implement only the gap list in Field 1 (optional affordance + e2e), touching nothing else.
4. **If (and only if) recon shows the field is actually missing** (i.e. reality flipped since 2026-07-08): add the optional Profissao input to the create form and the profile display row, reusing the existing i18n key `patients.fieldProfession`.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the create -> profile round-trip.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Recon report pasted:** the three present/absent findings vs `origin/main`.
- **Disposition recorded:** either (a) already-shipped close with the verification evidence + Q-W5-6 resolution, or (b) the residual-gap diff with its e2e.
- **e2e** proving profession round-trips create-form -> profile (new or existing). Paste it.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report (column 0022 + form field + profile display), the disposition (already-shipped close or residual-gap diff), the round-trip e2e, migration-free proof, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free** and **UI-only:** the column exists; NO migration, no server-action data-model change.
- **Do not re-implement an existing field** into a duplicate; reuse `patients.fieldProfession`.
- **Do not expand scope** beyond Profissao (referral source is W5-11; other demographics are out).
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan. This loop's PRIMARY halt is the RECON MISMATCH itself: if recon confirms the field is already present in form + profile, HALT to Ivan citing Q-W5-6 with the recommended default (already-shipped close) rather than manufacturing rework. Also halt if the column is genuinely absent (the briefing's named case - would need a migration, out of this UI-only loop).

## Field 7. Report back
Recon report, the mismatch disposition, any residual-gap diff + e2e, migration-free proof, suite counts, PR number, and the Q-W5-6 resolution. Close: open ONE PR (which may be a docs-only already-shipped close) against `main` and HALT for owner merge. Do NOT self-merge.
