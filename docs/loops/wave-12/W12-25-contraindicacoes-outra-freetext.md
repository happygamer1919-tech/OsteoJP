# Loop W12-25 - Contraindicacoes "Outra" checkbox + free-text (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE, migration-gated. OWNER-MERGE (migration). OWNER VISUAL GATE surface. CYAN pre-merge audit mandatory. The coupled-flags lesson applies.** Add an "Outra" contraindication checkbox + a free-text note beside the existing general-contraindication checkboxes, WITHOUT coupling to the existing flags' migration/behaviour. One migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add a decoupled `contraindication_other` boolean + a `contraindication_other_note` free-text column to `patients`, render an "Outra" checkbox + a free-text field in the Contraindicacoes Gerais section, and show it read-only on the profile. Do NOT touch the existing three flags' columns/migrations/behaviour.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Existing flags are BOOLEAN COLUMNS (not a JSON blob):** `patients.contraindication_epilepsy`/`_pregnancy` (migration `0031_nesa_contraindications.sql:23-27`), `patients.contraindication_pacemaker` (`0034_pacemaker_contraindication.sql:28-29`); Drizzle `schema.ts:470-474`. Form checkboxes in one `<fieldset>`: `apps/web/app/patients/_components/patient-form.tsx:216-244` (legend `:219`, types `:41-44`, defaults `:66-68`); read-only profile display `apps/web/app/patients/[id]/page.tsx:161-170`.
- **Section label** is i18n `patients.contraindicationsLabel` = "Contraindicacoes Gerais" (W10-04c; `strings.pt.json:987`).
- **"Outra" + free-text are ABSENT:** no `contraindication_other` boolean, no free-text column. BACKLOG flags the decoupling requirement (`:664`): add the new flag + its free-text WITHOUT folding into the 0031/0034 migrations (the coupled-flags lesson - a coupled migration risks the existing flags' data/behaviour).
- **Decoupled design:** a NEW migration adds `contraindication_other boolean NOT NULL DEFAULT false` + `contraindication_other_note text` to `patients`, independent of 0031/0034; the form adds a fourth checkbox + a conditional free-text (shown when "Outra" is checked); the profile shows it read-only; `tenant_id` + RLS on `patients` already exist (columns only, no RLS policy change) - but ANY migration => CYAN pre-merge audit + the migration ships with the patients RLS unchanged and a test that the new columns are covered by the existing tenant policy.

**Scope:** one migration (two decoupled columns) + the form checkbox + conditional free-text + the profile display + i18n (both files) + tests. One migration in flight; head advances by one; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Verify on local + Preview; cloud REAL DATA ONLY.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-25-contra-outra`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Migration (decoupled):** add `patients.contraindication_other` (boolean, NOT NULL, default false) + `patients.contraindication_other_note` (text), mirrored in `packages/db/migrations/` + `supabase/migrations/`, NOT folded into 0031/0034; `tenant_id`/RLS on `patients` unchanged; a test that the new columns fall under the existing tenant RLS.
3. **Form:** add the "Outra" checkbox to the Contraindicacoes Gerais `<fieldset>` + a conditional free-text field (visible when checked); wire into the patient-form types/defaults/submit.
4. **Profile:** show "Outra" + its note read-only (`page.tsx` contraindications block) when set.
5. **i18n:** the "Outra" label + the free-text label/placeholder in BOTH i18n files, same keys; JSON.parse both. Do NOT touch `contraindicationsLabel` or the three existing `fieldContraindication*` keys.
6. **CYAN pre-merge audit** (migration); manual live-apply journal; Preview smoke.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** the two columns added in a NEW migration (not 0031/0034); head +1; CYAN CLEAN; manual live-apply journal; the RLS-coverage test green.
- **Decoupling PROOF:** `git diff` shows 0031/0034 + the three existing flag columns UNCHANGED; the new migration is independent. Paste it.
- **Form PROOF:** an e2e checks "Outra", types a note, saves, reloads, and asserts both persist; unchecking hides/clears per the chosen behaviour.
- **Profile PROOF:** the read-only profile shows "Outra" + its note when set.
- **Gates green** incl. RLS + i18n parity + Preview smoke.

## Field 4. Verification (paste evidence)
The migration + RLS-coverage test + CYAN + journal, the decoupling diff, the form e2e, the profile display, suite counts, the Preview URL (owner adds an "Outra" note on a patient), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight.**
- **Coupled-flags lesson (hard):** the new flag + free-text are a SEPARATE migration; NEVER edit the 0031/0034 columns/migrations or the existing three flags' behaviour.
- **Migration ships tenant_id intact + the patients RLS unchanged + a coverage test + a CYAN pre-merge audit**; live-apply manual (direct 5432, cwd `packages/db`).
- Cloud REAL DATA ONLY; verify on local `127.0.0.1` + Preview; pt-PT + en both (correct diacritics); no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.** No PII in logs (the note is clinical content).

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The change appears to require touching the existing 0031/0034 columns or the three flags' behaviour - HALT (decouple; the coupled-flags lesson).
- The migration lacks its RLS coverage/isolation test - HALT.
- It cannot fit one migration / one PR - SPLIT.

## Field 7. Report back
The migration + RLS test + CYAN + journal, the decoupling diff, the form e2e, the profile display, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-25 is OWNER-MERGE (migration).** NOT `[SELF-MERGE-OK]`. Required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory**; the owner merges (OWNER VISUAL GATE on the form/profile surface).
- One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on coupling to the existing flags or a missing RLS test.
