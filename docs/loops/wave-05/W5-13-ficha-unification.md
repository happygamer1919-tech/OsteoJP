# Loop W5-13 - Ficha unification + ingestion compatibility (Batch 4, per SPEC-ficha-medica.md)

GATE: **Batch 4.** Depends on **`docs/design/SPEC-ficha-medica.md`** (authoritative; must be merged first). First Batch-4 loop; W5-14/W5-15/W5-16 build the structure on top; W5-17 consumes it. Migration-free unless recon PROVES a schema change (that would be a HALT, not a silent migration). Templates are seed-data + `form_templates` rows, not a `packages/db/migrations` change.

## Field 1. Scope and ground truth
Ship a **single Ficha Medica template** for all new records; **retire the other templates from the creation flow**; **existing records untouched**; and implement + PROVE the **ingestion compatibility constraint** with a test that posts a `template = osteopathy` payload carrying the twelve keys and lands a correct draft.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory; SPEC sec 0-2 is authoritative):
- **Template storage:** `form_templates` rows keyed `(tenant_id, key, version)`; `schema` = JSON-Schema body verbatim; seeded from `packages/db/seed/form-templates/*.json` via `packages/db/seed/form-templates.ts` (CLAUDE.md rule 5: versioned + immutable once referenced).
- **Templates today:** `ficha_geral` v1, `osteopathy` v2, `physiotherapy` v4, `nesa` v1, + `x-form-ref` wrappers (massagem/pilates/rpg).
- **`osteopathy` v2 already holds all twelve AI keys** (`packages/db/seed/form-templates/osteopathy-v2.json`): `consultation_reason`, `relief_aggravation`, `clinical_history`, `systems_review.{neurological,cardiovascular,respiratory,gastrointestinal,urological_gynecological,endocrine}`, `treatment_objectives`, `treatment_plan`, `observations`. **The mapping to Ficha Medica is identity if Ficha Medica evolves the `osteopathy` template** (SPEC sec 2, recommended).
- **Creation flow:** `apps/web/app/clinical/new/page.tsx` has a **template picker dropdown** (all active templates, highest version per key) -> `createRecordAction` -> `createDraftRecord` (`apps/web/lib/clinical/records.ts`). W5-13 replaces the picker with a single Ficha Medica selection.
- **Ingestion:** `POST /api/v1/ingestion/clinical-records` (HMAC-SHA256, `apps/web/app/api/v1/ingestion/clinical-records/route.ts`, `apps/web/lib/ingestion/*`). It stores the partner payload **verbatim** under `clinical_records.data = { "_aiIngestionRaw": <payload> }` with `source='ai_ingested'`, `status='draft'`, `ai_review_state='pending_review'`. It does NOT yet map payload keys to form fields; the partner field-mapping (endpoint-contract.md sec 7) binds the twelve keys to fields and gates live ingestion. The outbound M1 webhook (SPEC-ai-recording.md sec 7) fixes `template=osteopathy`.
- **Immutability:** DB trigger `enforce_clinical_record_immutability` (0001_rls.sql) + app guard `updateRecordData` (`status !== 'draft'` -> `ClinicalError("finalized")`). **Never bypass** - existing records keep their original template ref and render as-is.
- **RECON FIRST (report BEFORE building):** the template picker + `createDraftRecord`; every template's `key`/`version`; the ingestion store path (`_aiIngestionRaw`); confirm the twelve `osteopathy` keys are present; decide the Ficha Medica key-identity per SPEC sec 2 (recommended: **evolve `osteopathy` to a new version = Ficha Medica**, keys unchanged, retitled, so the twelve keys + the `template=osteopathy` selector map by identity; alternative: new `ficha_medica` key + a server-side alias for `osteopathy` + each of the twelve keys). **If any of the twelve keys cannot land in a Ficha Medica field -> PRODUCT HALT (Field 6).**

**Scope:** (1) create the Ficha Medica template (SPEC sec 2 recommended path: new `osteopathy` version, retitled "Ficha Medica", keys unchanged - W5-14/W5-15 add the new fields to its schema); (2) make record creation offer only Ficha Medica (retire `ficha_geral`/`physiotherapy`/`nesa`/wrappers from the picker; existing records untouched); (3) ensure a `template=osteopathy` ingestion payload with the twelve keys maps to Ficha Medica server-side (identity if keys unchanged) and lands a correct draft - proven by a test. Migration-free (seed + `form_templates` + UI). pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-13-ficha-unify origin/main -b osteojp-w5-13-ficha-unify`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the picker + createDraftRecord; each template key/version; the twelve keys in osteopathy-v2; the ingestion `_aiIngestionRaw` store; the key-identity decision (SPEC sec 2).
3. **Ficha Medica template:** per SPEC sec 2, evolve `osteopathy` to a new version titled "Ficha Medica" keeping `key="osteopathy"` and all twelve field keys unchanged (v2 stays immutable for records that reference it). Seed it via the existing loader. (W5-14/W5-15 populate the new fields; this loop establishes the template + unification + compatibility.)
4. **Retire from creation:** record creation offers only Ficha Medica; other templates are not selectable when creating a new record. **Do not delete template rows or rewrite any existing record.**
5. **Existing records untouched PROOF:** an existing record referencing an old template still renders with its original structure (immutability intact).
6. **Ingestion compatibility:** ensure `template=osteopathy` + the twelve keys map to Ficha Medica server-side (identity if keys unchanged; else a server-side alias). Confirm zero change is required on Andre's Make.com side.
7. **Compatibility test:** post a `template=osteopathy` payload carrying the twelve keys through the real ingestion path; assert a correct draft lands (`status='draft'`, `ai_review_state='pending_review'`) with each of the twelve values reachable in its Ficha Medica field. No key silently dropped.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. the ingestion test + RLS), `pnpm build`, `pnpm test:e2e` (create a new record -> only Ficha Medica offered; an old record still renders).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/` (template is seed + `form_templates`). Paste it. (If recon proved a schema change is unavoidable -> the DoD is the HALT record, not a build.)
- **Recon report pasted:** picker + createDraftRecord; the twelve keys; the ingestion store; the key-identity decision.
- **Single-template creation proven:** an e2e shows record creation offers only Ficha Medica (others retired). Paste it.
- **Existing-records-untouched proven:** an existing record on an old template still renders with its original structure; immutability not bypassed. Paste it.
- **COMPATIBILITY TEST proven (the headline DoD):** a `template=osteopathy` payload with the twelve keys lands a correct draft with all twelve values mapped to Ficha Medica fields; **zero change on Andre's side**. Paste the test + the mapped-values assertion.
- **Suite counts** (baseline web 816, api 136, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report (incl. the twelve keys + key-identity decision), migration-free diff, the single-template-creation e2e, the existing-records-untouched proof, **the template=osteopathy twelve-key compatibility test**, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md is authoritative** - a delta from it is recorded, not silently taken.
- **Migration-free** (template = seed + `form_templates`); a schema change is a HALT, not a silent migration.
- **Never bypass immutability** (rule 4): existing records keep their template ref; retiring from creation never deletes rows or rewrites records.
- **ZERO change on Andre's Make.com side** - all adaptation is server-side; `template=osteopathy` + the twelve keys are frozen.
- **A key that cannot map is a PRODUCT HALT** (SPEC sec 2) - never improvise, never silently drop a key.
- Audit on write (rule 6); DB via `packages/db`; `tenant_id` from JWT.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (PRODUCT halt for key-mapping; else CLASSIC)
- **PRODUCT HALT** (SPEC sec 2): if any one of the twelve `osteopathy` keys cannot land in a Ficha Medica field, write the halt file to `~/osteojp-mailbox/escalations` with a recommended default, fire the notification, and STOP. Never improvise a key, never silently drop one.
- **CLASSIC halt** otherwise: STOP and report to Ivan (mismatch / options / recommended default); product/scope to `docs/design/QUESTIONS.md`. Halt if: unification would require deleting a template row or mutating an existing record (immutability); or the template change cannot be expressed as seed + `form_templates` without a migration.

## Field 7. Report back
Recon report, the Ficha Medica template + unification, the existing-records-untouched proof, **the twelve-key `template=osteopathy` compatibility test**, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
