# Loop W5-10 - Documentos tab upload (Batch 2, migration-free)

GATE: none. UI + storage-wiring lane, migration-free. Reuses the existing attachments infrastructure.

## Field 1. Scope and ground truth
The **Documentos** tab in the patient profile gains **upload**, reusing the existing attachments infrastructure and validation.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- Documentos tab today: `apps/web/app/patients/[id]/page.tsx` (~lines 284-287) renders only an `<EmptyState>` placeholder (`patients.emptyDocumentsTitle` / `...Help`). **No upload UI, no staff-side upload backend** exists for patient documents. (A read-only portal document API exists at `apps/api/lib/patient/documents.ts` for the patient portal, not the staff app.)
- Attachments infra to REUSE (built W4-05, do not reinvent): `apps/web/lib/clinical/storage.ts` -> `createAttachmentUploadUrl(ctx, recordId, fileName)` issues a Supabase Storage **signed upload URL** (client uploads direct to Storage, tenant-scoped path `${tenantId}/.../`); `confirmAttachment(ctx, ...)` inserts the `attachments` row + audit in one tx; `createAttachmentDownloadUrl(ctx, path)` returns a **60s signed GET** after validating the tenant prefix. `attachments` is a tenant-scoped table (RLS `attachments_tenant_isolation`). Signed URLs only, never public, never proxied through Next.js (CLAUDE.md rule 8).
- **Attachment shape today is keyed to a clinical record** (`clinical_record_id`) - patient-level documents may need either (a) association to the patient rather than a specific record, or (b) a chosen "documents" record/relation. **This is the one design point to resolve in recon** (see below).
- **RECON FIRST (report BEFORE building):** confirm the Documentos tab is EmptyState-only; confirm the `attachments` columns (is it strictly `clinical_record_id`, or is there a patient linkage / a nullable record?); decide the patient-document association: **reuse `attachments` with a patient linkage if the schema already allows it (migration-free)**; if it strictly requires `clinical_record_id` and there is no patient-level path, that is a **HALT** (a patient-document relation is a schema change - not this migration-free loop) with a recommended default (add `attachments.patient_id` nullable in a Batch-3 migration, or attach patient docs to a per-patient "documents" record) logged to QUESTIONS.

**Scope:** add upload to the Documentos tab reusing `createAttachmentUploadUrl` -> direct signed PUT -> `confirmAttachment`, plus list + signed-GET view/download of uploaded documents; reuse the existing file validation (type/size) from the attachment flow. **Only if recon proves a migration-free patient-document association exists.** pt-PT i18n (both files), no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-10-documentos origin/main -b osteojp-w5-10-documentos`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** EmptyState-only tab; the `attachments` schema + whether a migration-free patient linkage exists; the reused signed-URL upload/confirm/download helpers + validation.
3. **Decision gate:** if a migration-free patient-document association exists -> proceed. If it does NOT (attachments strictly require `clinical_record_id` with no patient path) -> **HALT** (Field 6) with the recommended default to QUESTIONS; do not open a silent migration.
4. **Upload UI:** add a file input + "Carregar documento" action to the Documentos tab; upload via `createAttachmentUploadUrl` (direct signed PUT) then `confirmAttachment`; reuse the existing type/size validation.
5. **List + view:** list the patient's documents and serve each via `createAttachmentDownloadUrl` (60s signed GET, tenant-prefix validated). Never public.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS if the association is new-but-migration-free), `pnpm build`, `pnpm test:e2e` (upload a doc -> appears in the tab -> opens via signed URL).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it. (If recon forced a HALT, the DoD is the halt record, not a build.)
- **Recon report pasted:** EmptyState-only tab; the attachments schema + patient-linkage determination; the reused helpers.
- **Upload -> list -> signed view proven:** an e2e uploads a document to a **synthetic** patient's Documentos, it lists, and opens via signed URL (not public). Paste it.
- **Signed-URL-only PROOF:** the upload uses `createAttachmentUploadUrl` (direct to Storage) and view uses `createAttachmentDownloadUrl`; nothing proxies bytes through Next.js. State it + paste the call sites.
- **Tenant isolation:** documents are tenant-scoped (reused `attachments_tenant_isolation`); paste the isolation assertion.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the upload->list->signed-view e2e, the signed-URL-only proof, the tenant-isolation assertion, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free;** reuse the W4-05 attachments infra (`storage.ts` helpers + `attachments` relation) - no parallel storage backend. If a patient-document relation genuinely needs a schema change, HALT (do not open a silent migration).
- **Signed-URL storage only** (CLAUDE.md rule 8): never public, never proxied through Next.js, EU region.
- **Synthetic patient only** for build/verify; never attach to a real patient on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`.
- Reuse the existing file validation (type/size). Audit on write (rule 6).
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. **Primary halt:** if patient-level documents cannot associate to a patient without a schema change (attachments strictly `clinical_record_id`), HALT and recommend either `attachments.patient_id` nullable (a Batch-3 migration) or a per-patient documents record; do NOT open a migration in this migration-free loop. Also halt if the reuse would force a change to a shared storage helper whose ripple extends beyond documents.

## Field 7. Report back
Recon report (incl. the patient-linkage determination), the upload implementation, migration-free + signed-URL proofs, the upload e2e + tenant isolation, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
