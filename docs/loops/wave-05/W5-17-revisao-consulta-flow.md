# Loop W5-17 - Revisao Consulta flow: Assumir into the Ficha Medica editor (Batch 4, per SPEC-ficha-medica.md)

GATE: **Batch 4, final.** Depends on **SPEC-ficha-medica.md** and **W5-13/W5-14/W5-15/W5-16** (the Ficha Medica editor + fields exist). **This closes the core wave scope:** the AI transcription fills the patient's medical ficha and continues their record. Migration-free (reuses the review flow + the Ficha Medica editor). Runs last.

## Field 1. Scope and ground truth
**Assumir** opens the AI draft record inside the **Ficha Medica editor** with the AI-filled fields **visible and editable**; the reviewer edits, completes, and signs; `ai_review_state` transitions are respected (`record_status` and `ai_review_state` remain **separate** axes); the signed record appears in the patient's **Registos clinicos**.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- **Review queue + Assumir:** `apps/web/app/clinical/review/page.tsx`; handler `apps/web/app/clinical/review/actions.ts` (`claimAction`); logic `apps/web/lib/clinical/review.ts` (`claimReviewItem` ~line 156).
- **What Assumir does today:** for AI records it sets `ai_review_state` `pending_review -> in_review` (review.ts ~line 183), audits `clinical_record.review_claim`, then **redirects to `/clinical/review/[recordId]`** - a narrative-review editor. For patient submissions it creates a new draft `source='patient'` and links it. Finalization (sign + lock) is a **separate** explicit `finalizeReview()` call; Assumir does NOT auto-approve.
- **The two axes are already separate** (CLAUDE.md rule 4): `record_status` (draft -> locked -> signed, immutability trigger) vs `ai_review_state` (pending_review -> in_review -> approved/rejected, PLACEHOLDER values). AI ingestion never yields a locked/signed record directly; a human accepts, then the record follows the standard `record_status` lifecycle. **Keep them separate.**
- **The AI payload today lands verbatim** under `clinical_records.data = { "_aiIngestionRaw": <payload> }` (source `ai_ingested`, status draft, ai_review_state pending_review). The twelve AI keys live in that raw payload. **For the AI-filled fields to show up EDITABLE in the Ficha Medica editor, the raw payload's twelve keys must map onto the Ficha Medica fields** (the partner field-mapping / W5-13 identity mapping). This is the crux of W5-17: the editor Assumir opens must render the twelve `osteopathy` keys from `_aiIngestionRaw` into their Ficha Medica fields, editable.
- **Registos clinicos:** the patient profile "Registos" tab (`apps/web/app/patients/[id]/page.tsx`) lists the patient's clinical records; a signed record appears there.
- **RECON FIRST (report BEFORE building):** the `claimReviewItem` flow + the editor it redirects to; how `_aiIngestionRaw` keys reach the editor (the W5-13 mapping); that `record_status` and `ai_review_state` are distinct; the `finalizeReview` sign+lock path; the Registos tab read.

**Scope:** make Assumir open the AI draft **inside the Ficha Medica editor** (W5-13/14/15/16) with the twelve AI-filled fields **visible + editable** (mapped from `_aiIngestionRaw` per W5-13); reviewer edits, completes, signs (existing `finalizeReview` -> `record_status` locked/signed); `ai_review_state` transitions respected and kept separate from `record_status`; the signed record shows in the patient's Registos clinicos. Migration-free. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-17-revisao origin/main -b osteojp-w5-17-revisao`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** `claimReviewItem` + the current editor; how `_aiIngestionRaw`'s twelve keys map to Ficha Medica fields (W5-13); the two separate axes; `finalizeReview`; the Registos read.
3. **Assumir -> Ficha Medica editor:** on claim (`pending_review -> in_review`, unchanged transition + audit), open the record in the **Ficha Medica editor** (not the old narrative editor), with the twelve AI-filled fields mapped from `_aiIngestionRaw` and rendered **editable**. Non-AI Ficha Medica fields render empty/editable for the reviewer to complete.
4. **Edit + complete + sign:** the reviewer edits any field (incl. the twelve AI ones), completes the ficha, and signs via the existing `finalizeReview` (which advances `record_status` and, per the flow, sets `ai_review_state` approved). **The two axes stay separate** - signing is a `record_status` transition; approval is an `ai_review_state` transition; neither collapses into the other.
5. **Registos:** the signed record appears in the patient's Registos clinicos tab.
6. **Immutability:** once signed/locked the record is immutable (rule 4); addenda are new versioned records.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. review-state + RLS), `pnpm build`, `pnpm test:e2e` (Assumir an AI draft -> Ficha Medica editor shows the twelve AI values editable -> edit + sign -> record appears signed in the patient's Registos; `record_status` and `ai_review_state` transition independently).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Recon report pasted:** claim flow + editor; the `_aiIngestionRaw` -> Ficha Medica field mapping; the two axes; finalize; Registos.
- **Assumir-opens-Ficha-Medica proven:** an e2e claims an AI draft and lands in the **Ficha Medica editor** with the twelve AI-filled fields **visible + editable** (values sourced from `_aiIngestionRaw`). Paste it.
- **Edit + sign -> Registos proven:** the reviewer edits an AI field, signs, and the signed record appears in the patient's Registos clinicos. Paste it.
- **Axes-separate proven:** a test shows `record_status` (draft->locked/signed) and `ai_review_state` (in_review->approved) transition **independently** and are not collapsed. Paste it.
- **Immutability proven:** the signed record is immutable (edit attempt rejected by the trigger/guard). Paste it.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated, api 136) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the Assumir->Ficha-Medica-editor e2e (twelve AI values editable), the edit+sign->Registos e2e, the axes-separate test, the immutability test, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md authoritative.**
- **Migration-free;** reuse the review flow (`claimReviewItem`/`finalizeReview`) + the Ficha Medica editor (W5-13/14/15/16). No new state machine.
- **`record_status` and `ai_review_state` remain SEPARATE** (CLAUDE.md rule 4) - never collapse the two axes; AI ingestion never auto-signs; a human accepts + signs.
- **Never bypass immutability** (rule 4): signing locks; changes after locking are addendum versions.
- **The twelve AI values are shown editable, never silently dropped** - if a mapped value cannot reach its field, that is the W5-13 PRODUCT-halt condition, surfaced here too.
- **Synthetic data only** for verify; dev tenant caution. Audit on mutation (rule 6). Permission gate: `clinical_records:review` (owner + therapist), unchanged.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC + PRODUCT for mapping)
- **PRODUCT HALT** (inherits SPEC sec 2): if a twelve-key AI value cannot render into its Ficha Medica field in the editor (mapping gap), write the halt file to `~/osteojp-mailbox/escalations` with a recommended default, fire the notification, STOP - never silently drop an AI value.
- **CLASSIC halt** otherwise: STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md`. Halt if: opening the Ficha Medica editor for a review record would force collapsing the two axes, or the `finalizeReview` sign path cannot keep `record_status` and `ai_review_state` independent.

## Field 7. Report back
Recon report, Assumir-into-Ficha-Medica with the twelve AI fields editable, the edit+sign->Registos flow, the axes-separate + immutability proofs, migration-free proof, suite counts, PR number. **This loop closes the Wave 05 core scope** (AI transcription fills the ficha and continues the record) - note that in the report. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
