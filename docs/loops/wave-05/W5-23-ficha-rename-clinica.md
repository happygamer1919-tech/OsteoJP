# Loop W5-23 - Rename the unified template display name to "Ficha Clinica" (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (LIVE-DB DATA path per recon).** Renames the unified template's user-facing display name to **"Ficha Clinica"** everywhere it surfaces. Recon (below) proves the display name lives in `form_templates.title` (DB rows, zero hardcoded TSX), so this is a **seed update + upsert re-run against the dev DB** - a live-DB data operation. Fetch-and-fast-forward before the live op; paste the before/after row. HARD CONSTRAINT: display name ONLY - the template key and the twelve AI field keys are frozen.

## Field 1. Scope and ground truth

Rename the display name from **"Ficha Medica"** to **"Ficha Clinica"** at every surface: the record-creation template selector, the record-view header, new entries in the patient's Registos clinicos list, and Revisao Consulta. The template key (`osteopathy`, ingestion `template=osteopathy`) and the twelve AI field keys are FROZEN; the W5-13 compatibility test must pass. Existing records keep their stored titles.

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory; AMENDMENTS ruling A authoritative):
- **DISPLAY-NAME LOCATION VERDICT: DB ROWS (`form_templates.title`), ZERO hardcoded TSX literals.** The display name is a jsonb `title: { pt, en }` on each `form_templates` row, seeded from `packages/db/seed/form-templates/*.json` via the idempotent upsert loader `packages/db/seed/form-templates.ts` (upsert-keyed on `(tenant_id, key, version)`; re-run updates `title` + `schema` on the existing row). EVERY UI surface reads `title[locale]`:
  - record-creation selector: `apps/web/app/clinical/new/page.tsx` (`t.title?.[locale] ?? t.key` + ` v${version}`),
  - record-view header: `apps/web/app/clinical/[id]/page.tsx` (`record.template?.title?.[locale]`),
  - patient Registos clinicos list: `apps/web/app/patients/[id]/page.tsx` (`r.templateTitle?.[DEFAULT_LOCALE]`),
  - episodes list `apps/web/app/clinical/episodes/[id]/page.tsx`, clinical directory `apps/web/app/clinical/page.tsx` (both `templateTitle?.[locale]`),
  - Revisao Consulta `apps/web/app/clinical/review/[recordId]/page.tsx` resolves the template by key (`FICHA_MEDICA_KEY = "osteopathy"`) and renders the editor; no hardcoded display name.
- **The active row to rename:** `osteopathy-v3.json` - `key "osteopathy"`, `version 3`, `title.pt "Ficha Medica"` / `title.en "Medical Record"` (the shipped source uses the pt-PT accent "Ficha Médica"). This is the highest active version = the single template offered on creation.
- **The rename:** set `title.pt "Ficha Medica" -> "Ficha Clinica"` (carry the pt-PT accent in the seed value to match the accented source it replaces) and `title.en "Medical Record" -> "Clinical Record"`, then re-run the seed loader against the dev DB (upsert updates the v3 row's `title`). The `schema` body and `key` are UNTOUCHED, so record rendering and rule-5 immutability are unaffected (the immutability trigger is on `clinical_records`, not `form_templates`).
- **Tests/fixtures that assert the old name (update on-branch):** `apps/web/e2e/fixtures.ts` (`TEMPLATE_CURRENT_LABEL = "Ficha Medica v3"` - the accented shipped literal); `packages/db/tests/osteopathy-v3-mobilidade-seed.test.ts` (asserts `v3.title.pt` equals the old name); `packages/i18n/src/strings.pt.json` `clinical.fichaMedica` label (a UI label for the concept - rename to "Ficha Clinica" so the surfaced name is consistent). Grep for the old accented + non-accented literal to catch any other assertion.
- **FROZEN (do NOT touch):** template key `osteopathy`; the ingestion selector `template=osteopathy` (`M1_TEMPLATE`); the twelve AI field keys; the v3 `schema` body. The W5-13 compatibility test `apps/web/lib/ingestion/ficha-medica-compat.test.ts` MUST stay green.
- **Existing records:** those referencing v1/v2 (title "Osteopatia - Avaliacao de Episodio") keep their stored titles unchanged - immutable, rendered as-is. Only the v3 row's title changes.
- **Out of scope:** the apps/portal copy of `osteopathy-v2.json` (patient portal is V1-out-of-scope, and it is v2, not the active template).

**Both paths, made explicit (recon selects the DB-seed path):**
- **UI-strings path (NOT applicable here):** would apply only if the display name were a hardcoded TSX literal. It is not (zero hardcoded literals). Do NOT add a hardcoded override.
- **DB-seed path (SELECTED, live-DB data op):** edit `osteopathy-v3.json` title; re-run the seed upsert against the dev DB; **fetch-and-fast-forward before the live op**; paste the before/after `form_templates` v3 row as evidence.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-23-ficha-rename-clinica origin/main -b osteojp-w5-23-ficha-rename-clinica`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** confirm the display name is DB-seeded (zero hardcoded TSX); confirm the v3 row is the active/highest version; grep the old literal (accented + non-accented) across app + tests.
3. **Seed edit:** set `osteopathy-v3.json` `title.pt -> "Ficha Clinica"` (with the pt-PT accent) and `title.en -> "Clinical Record"`. Do NOT touch the `schema` body or `key`.
4. **Fetch-and-fast-forward**, then re-run the seed loader against the dev DB (upsert updates the v3 `title`).
5. **Fixtures/labels:** update `e2e/fixtures.ts` `TEMPLATE_CURRENT_LABEL`, the `osteopathy-v3-mobilidade-seed.test.ts` title assertion, and the `strings.pt.json`/`strings.en.json` `clinical.fichaMedica` label - all to the new name.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. the seed test + the W5-13 compatibility test), `pnpm build`, `pnpm test:e2e` (creation selector, record header, and Registos list show "Ficha Clinica").

## Field 3. Definition of done (machine-verifiable)
- **Display-name location PROOF:** recon report confirming DB-seeded, zero hardcoded TSX; the grep of the old literal.
- **Before/after ROW:** paste the dev-DB `form_templates` v3 row `title` BEFORE and AFTER the upsert (pt "Ficha Medica" -> "Ficha Clinica", en "Medical Record" -> "Clinical Record").
- **Key-frozen PROOF:** `git diff` shows the `osteopathy-v3.json` `key` and `schema` unchanged (only `title` changed); a grep confirms `template=osteopathy` / `FICHA_MEDICA_KEY` / the twelve keys untouched.
- **W5-13 compatibility test GREEN:** `ficha-medica-compat.test.ts` passes. Paste the run.
- **Surface PROOF:** an e2e/snapshot shows "Ficha Clinica" in the creation selector, the record-view header, and a new Registos clinicos entry.
- **Existing-records PROOF:** a record referencing v1/v2 still shows its OLD stored title (unchanged). State/test it.
- **i18n parity:** the `clinical.fichaMedica` label updated in BOTH string files.
- **Suite counts** (baseline web 816, @osteojp/db 56 local + DB-gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report (DB-seeded verdict + grep), the before/after v3 `title` row, the key-frozen diff, the passing W5-13 compatibility test, the surface e2e, the existing-records proof, i18n parity, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **AMENDMENTS ruling A authoritative.**
- **DISPLAY NAME ONLY.** The template key (`osteopathy`, `template=osteopathy`) and the twelve AI field keys are FROZEN; the v3 `schema` body is untouched. Diverging the key from the ingestion selector is forbidden (would need a server-side alias, out of scope).
- **Live-DB data op:** fetch-and-fast-forward before the re-seed; only the dev DB; paste before/after. No destructive op (title value update on one row).
- **Existing records keep their stored titles** - do not rewrite v1/v2 rows or any record's stored title.
- **Out of scope:** the apps/portal osteopathy-v2 copy.
- pt-PT i18n (both files, accented seed value), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Recon CONTRADICTS the DB-seeded verdict - the display name turns out to be a hardcoded TSX literal somewhere (then switch to the UI-strings path and record the correction).
- The re-seed upsert would touch anything beyond the v3 `title` (e.g. it would rewrite the schema or a referenced row) - surface it.
- The W5-13 compatibility test breaks (would mean the key/twelve-key contract moved - forbidden).

## Field 7. Report back
Recon report (DB-seeded verdict), the before/after v3 `title` row, the key-frozen diff, the passing W5-13 compatibility test, the surface + existing-records proofs, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
