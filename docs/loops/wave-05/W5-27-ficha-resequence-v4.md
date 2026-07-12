# Loop W5-27 - Ficha resequence to canonical order v4 (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Depends on **SPEC-ficha-medica.md AMENDMENT 2026-07-12 (FF2): canonical sequence v4** (authoritative, sole authority on sequence). Ships a NEW `osteopathy` **v4** form-template seed + a renderer/nav reorder. **New seed file only; no DB migration and NONE authorized.** Starts from **fresh `origin/main`** (fetch-and-fast-forward first); never stacked on another in-flight loop. Composes with the ficha renderer (`RecordForm.tsx`) - the sole FF2 loop that re-orders the ficha.

## Field 1. Scope and ground truth

Introduce **`osteopathy` v4**, whose property order realizes the **FF2-A canonical sequence** and which **removes Marcacao respectiva (`linked_appointment`) and the Testes Neurologicos section (FF2-B)**. The renderer section order and the in-ficha left navigation panel follow v4 exactly. New fichas open on v4; v1/v2/v3 records render their original structure forever. The twelve AI ingestion keys are untouched.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory; AMENDMENT FF2 authoritative):
- **Template seed:** `packages/db/seed/form-templates/osteopathy-v3.json` is the current active unified template (titled "Ficha Clinica" / "Clinical Record", W5-23). Existing v4 precedent in the repo: `packages/db/seed/form-templates/physiotherapy-v4.json` exists, so a v4 bump is an established pattern. **This loop creates `osteopathy-v4.json`.**
- **Reconcile with W5-26 (EVA), recon BEFORE building:** W5-26 (AMENDMENTS ruling H) may already have created `osteopathy-v4.json` under its Path B (a v4 that declares an optional `bodychart.intensity`, built on the v3 order). Determine which case holds on fresh `origin/main`:
  - **If `osteopathy-v4.json` already exists (W5-26 Path B merged):** this loop's FF2 v4 is the **authoritative v4** and supersedes it - re-order its properties to FF2-A, apply the FF2-B removals, and **retain the optional `bodychart.intensity` declaration** W5-26 added. There must be exactly ONE `osteopathy-v4.json` at the end, in the FF2-A shape.
  - **If no `osteopathy-v4.json` exists (W5-26 Path A, or W5-26 not yet merged):** create v4 fresh from v3, apply FF2-A order + FF2-B removals.
  - Record which case held in the PR + DECISIONS.
- **Renderer:** `apps/web/app/clinical/[id]/RecordForm.tsx` renders fields from the template property order (JSON-Schema-driven, CLAUDE.md rule 5); the field sequence is therefore driven by the v4 property order, not by hardcoded TSX order, EXCEPT the header-row grouping (`HEADER_ROW_KEYS`) which the renderer treats specially. Recon `HEADER_ROW_KEYS` and the section grouping so the **Peso + Altura thin card** (FF2-A position 1) and the **Alertas + CID one row** (position 2) render as specified, and confirm `linked_appointment` is dropped from the header row.
- **In-ficha left navigation panel:** mirrors the FF2-A order exactly (positions 0-17). Recon the nav source (derived from the template sections or a parallel list) and align it to v4.
- **FF2-A order (authoritative, from the SPEC amendment):** 0 Paciente card (unchanged), 1 Peso+Altura thin card, 2 Alertas + CID row, 3 Bodychart, 4 Observacoes, 5 Mobilidade, 6 Observacoes Mobilidade, 7 Motivos da Consulta (required), 8 Tratamento, 9 Plano de Tratamento, 10 Objectivos do Tratamento, 11 Diagnostico, 12 Condicoes Alivio/Agravamento, 13 Anamnese por Sistemas (six subsystems), 14 Outros (grid unchanged, ruling-F layout), 15 Antecedentes Clinicos, 16 Testes Especiais, 17 Signature + consent.
- **FF2-B removals:** `linked_appointment` (Marcacao respectiva) and the Testes Neurologicos field(s) are **absent from v4**. Not AI keys.
- **Twelve AI keys frozen:** `consultation_reason`, `relief_aggravation`, `clinical_history`, `systems_review.*` (six), `treatment_objectives`, `treatment_plan`, `observations` keep keys + identities; `template=osteopathy` maps by identity. **W5-13 `ficha-medica-compat.test.ts` must stay green (3/3).**
- **created_at:** auto-stamped, displayed read-only (AMENDMENTS ruling B); no date input. `episode_date` server-populate path (W5-19) is unchanged. Do not reintroduce a date input.
- **Display titles:** "Ficha Clinica" (pt) / "Clinical Record" (en) - unchanged; v4 `title` carries the same values as v3.
- **required-array integrity:** `consultation_reason` stays required in v4; removing `linked_appointment`/Testes Neurologicos must not leave a dangling `required` entry (recon the v3 `required` array; drop removed keys from it).
- **Live-DB seed apply (executor, not the author):** this authoring batch is DOCS-ONLY; the **executor loop** performs the scoped v4 seed insert to the live dev DB (fetch-and-fast-forward first, scoped insert of the v4 row only, applied-state verification pasted BEFORE DONE, per the W5-23 seed-upsert precedent - never rewrite the referenced v1/v2/v3 rows, rule 5).

**Scope:** create `osteopathy-v4.json` (FF2-A order, FF2-B removals, twelve AI keys + titles + `bodychart` including any W5-26 `intensity` retained); scoped live-DB insert of the v4 row (executor, verified applied); renderer section order + Peso/Altura thin card + Alertas/CID row + in-ficha left nav follow v4; new fichas open on v4; v1/v2/v3 records render their original structure. Migration-free. pt-PT i18n (both files) for any new/changed labels.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-27-ficha-resequence-v4 origin/main -b osteojp-w5-27-ficha-resequence-v4`; assert toplevel ends in `osteojp-w5-27-ficha-resequence-v4`; assert clean tree; assert HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** does `osteopathy-v4.json` already exist (W5-26 Path B)? the v3 property order + `required` array + `HEADER_ROW_KEYS`; the in-ficha nav source; confirm no DB migration is needed (else HALT). Paste findings.
3. **Author `osteopathy-v4.json`:** property order = FF2-A; remove `linked_appointment` and Testes Neurologicos field(s); drop them from `required`; keep the twelve AI keys, titles, and (if W5-26 Path B) the optional `bodychart.intensity`. v1/v2/v3 files untouched.
4. **Live-DB scoped insert (executor):** fetch-and-fast-forward first; insert ONLY the v4 row; verify applied-state (`select` shows the v4 row with the FF2-A property order and titles); paste before/after. Never touch v1/v2/v3 rows.
5. **New fichas open on v4:** the record-creation path binds new `osteopathy` fichas to v4 (highest active version). Recon and set the version-selection point; v1/v2/v3 records keep their stored `form_template` ref and render their original structure.
6. **Renderer + nav:** Peso + Altura as the thin card under the Paciente card (position 1, nothing else on it); Alertas + CID as one row (position 2); section order follows v4; the in-ficha left nav mirrors FF2-A positions 0-17. No `linked_appointment`, no Testes Neurologicos.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. W5-13 compat + RLS), `pnpm build`, `pnpm test:e2e` (create a new ficha -> renders v4 order top-to-bottom; Peso/Altura thin card present; Alertas+CID row; no Marcacao respectiva; no Testes Neurologicos; left nav order matches; an existing v3 record still renders its original structure).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`; the only seed change is the NEW `packages/db/seed/form-templates/osteopathy-v4.json` (v1/v2/v3 NOT edited). Paste it.
- **Reconcile-with-W5-26 PROOF:** state which case held (v4 pre-existing vs fresh) and, if pre-existing, that the optional `bodychart.intensity` was retained. Paste the relevant v4 fragment.
- **FF2-A order PROOF:** an E2E/DOM audit of a NEW ficha asserting the top-to-bottom section order equals FF2-A positions 1-17 (Peso/Altura thin card first under the Paciente card, Alertas+CID row second, ..., Signature+consent last). Paste it.
- **FF2-B removal PROOF:** assert NO Marcacao respectiva (`linked_appointment`) control and NO Testes Neurologicos section render on a new ficha, and neither key is in v4. Paste it.
- **Left-nav PROOF:** assert the in-ficha left navigation panel lists the sections in FF2-A order exactly. Paste it.
- **Old-record PROOF:** load a PRE-EXISTING v3 record and assert it renders its ORIGINAL structure (still bound to its stored template ref; rule 5). Paste it.
- **Twelve-AI-keys PROOF:** the W5-13 `ficha-medica-compat.test.ts` passes **3/3**; confirm the twelve keys + `template=osteopathy` identity are unchanged in v4. Paste the passing run.
- **Live-apply PROOF (mandatory before merge):** paste the scoped v4-insert applied-state verification from the dev DB (the v4 row present with FF2-A order + titles; v1/v2/v3 untouched).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report (+ W5-26 reconcile case), migration-free diff (new v4 seed only), FF2-A order audit, FF2-B removal proof, left-nav proof, old-record proof, passing W5-13 compat 3/3, the live-apply verification, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **AMENDMENT FF2 authoritative** (sole sequence authority; supersedes sec 5 and ruling D).
- **Migration-free.** A NEW `osteopathy-v4.json` seed is the ONLY schema-shaped change. **Never edit v1/v2/v3** (rule-5 immutable once referenced). No migration, no workflow, no vendor.
- **Twelve AI keys + `template=osteopathy` frozen** by identity; W5-13 compat stays green.
- **Removals are template-scoped, not data-destructive:** old records keep any stored `linked_appointment`/Testes Neurologicos values and render them via their original template ref. v4 simply omits the fields going forward.
- **No date input** anywhere; `created_at` read-only (AMENDMENTS ruling B).
- **Display titles unchanged** ("Ficha Clinica" / "Clinical Record"); the FF2 UI renames are W5-29's remit, not this loop's.
- **Scoped live-DB insert only** (v4 row), fetch-and-fast-forward first, applied-state verified. **Never** the full `seed:form-templates` loader (it would rewrite referenced v1/v2/v3 - the W5-23 finding).
- pt-PT i18n (both files), no emoji, UI-STYLE.md tokens, SYNTHETIC-DATA-ONLY for any dry-run. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Recon finds the FF2-A order **cannot** be realized without a DB migration (it must not - it is a seed property-order + renderer change) - HALT with a recommended default; a migration is NOT authorized.
- The renderer order is hardcoded in TSX in a way that a v4 property-order change does NOT drive (so reordering would require rewriting record rendering logic beyond the section grouping) - surface the blast radius before proceeding.
- Removing `linked_appointment`/Testes Neurologicos would break save-time required-validation or an existing binding on old records - surface it (drop from `required`; old records keep their template ref).
- The twelve AI keys or `template=osteopathy` identity would move (W5-13 compat would break) - HALT; the FF2 reorder is presentation-only over frozen keys.
- The scoped v4 insert cannot be verified applied without running the full loader (which would rewrite referenced v1/v2/v3) - HALT, do not run the full loader.

## Field 7. Report back
Recon report (+ W5-26 reconcile case), FF2-A order audit, FF2-B removal proof, left-nav proof, old-record proof, passing W5-13 compat 3/3, migration-free diff (new v4 seed only), the live-apply verification, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, supersedes the original FF2 per-loop OWNER-MERGE split):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. **Live-apply verification evidence (this loop's scoped v4 seed insert) must be pasted in the loop report before merge regardless.** Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
