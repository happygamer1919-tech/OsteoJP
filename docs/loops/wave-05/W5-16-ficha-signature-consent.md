# Loop W5-16 - Ficha signature + consent (Batch 4, per SPEC-ficha-medica.md)

GATE: **Batch 4.** Depends on **SPEC-ficha-medica.md** (authoritative, sec 7) and **W5-14/W5-15** (the ficha body exists). Ideally after **W5-10** (Documentos surface) since the signature saves there. Migration-free (reuses attachments infra + the ficha schema). Runs after W5-15.

## Field 1. Scope and ground truth
Build the ficha's **signature and consent section** (SPEC sec 5.14 / sec 7): (1) an on-screen **patient signature** page (canvas capture) whose image saves to the patient's **Documentos**; (2) a **Gerar PDF** action producing an **A4 RGPD form with the clinic logo** for print-and-sign; (3) a **Consinto block** of individually confirmable consent items, each with an explicit **check or X state**. All consent/RGPD wording ships as **pt-PT placeholders flagged `PENDENTE-JP`**; **Max drafts 2-3 variants per text** for JP to pick.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory; SPEC sec 7 authoritative):
- **Signature -> Documentos:** reuse the attachments infra (`apps/web/lib/clinical/storage.ts` - `createAttachmentUploadUrl` signed PUT -> Supabase Storage, `confirmAttachment` + audit, `createAttachmentDownloadUrl` 60s signed GET; tenant-scoped, signed URLs only, never public - CLAUDE.md rule 8). The signature image (canvas -> blob) uploads via that path and lands in the patient's Documentos (the W5-10 surface). If W5-10 has not merged, the signature still saves via the same attachments path; note the ordering.
- **Gerar PDF (A4 + logo):** existing print-branding is required on every report/declaration (`docs/pdf-templates`, CLAUDE.md Brand: "Print branding on every report... logo + location contacts + fiscal info"). The clinic logo is the `BrandLockup` inline SVG (`packages/ui/src/brand/*`). The PDF is a print-oriented A4 form for RGPD print-and-sign.
- **Consinto block:** three individually confirmable items - **RGPD data processing**, **SMS reminders acknowledgment**, **data handling** - each rendered with an **explicit check or X state, not a bare unchecked box** (the state is always affirmatively shown as consented/declined). (The AI-recording consent - SPEC-ai-recording sec 5 - is a separate gate at Record time; this Consinto block is the ficha's RGPD/data consent, distinct.)
- **PENDENTE-JP wording:** every consent/RGPD string ships as a pt-PT placeholder flagged `PENDENTE-JP`; Max drafts 2-3 variants per text; no string is final until JP picks (Q-W5-3). Keys in both `strings.pt.json` + `strings.en.json`.
- **Immutability:** consent state + the signature attachment belong to the record/patient; once the record is finalized (locked/signed) the section is read-only (rule 4). Signing the record is the existing `record_status` flow (draft -> locked -> signed); this loop adds the patient-signature capture + consent, not a change to the record signature lifecycle.
- **RECON FIRST (report BEFORE building):** the attachments signed-URL path; the `docs/pdf-templates` + print-branding pattern (how existing PDFs render the logo + contacts + fiscal info); where the ficha body ends (5.13) so 5.14 slots after it; whether W5-10 Documentos has merged (ordering).

**Scope:** canvas signature capture -> save to Documentos via the attachments path; Gerar PDF (A4, clinic logo, RGPD print-and-sign form); Consinto block (three items, explicit check/X each); all consent/RGPD copy as `PENDENTE-JP` placeholders with 2-3 Max-drafted variants each. Migration-free. pt-PT i18n (both files), no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-16-signature origin/main -b osteojp-w5-16-signature`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the attachments signed-URL path; the pdf-templates/print-branding pattern; the ficha 5.13 end; W5-10 ordering.
3. **Signature capture:** a canvas signature page; on confirm, export the signature to a blob and upload via `createAttachmentUploadUrl` -> `confirmAttachment` so it lands in the patient's Documentos (signed URL, never public). Audit the save (rule 6).
4. **Gerar PDF:** an A4 print form carrying the clinic logo (BrandLockup) + the print-branding (contacts + fiscal info per the pdf-templates pattern) for RGPD print-and-sign.
5. **Consinto block:** three individually confirmable items (RGPD data processing, SMS reminders acknowledgment, data handling), each with an explicit **check or X** state (never a bare unchecked box); state persists with the record.
6. **PENDENTE-JP wording:** all consent/RGPD strings are `PENDENTE-JP` pt-PT placeholders; add 2-3 Max-drafted variants per text (as comments/alternate keys) for JP to pick (Q-W5-3). Keys in both i18n files.
7. **Read-only on finalized records:** once locked/signed the section is read-only (rule 4).
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (sign on canvas -> image appears in Documentos via signed URL; Gerar PDF produces an A4 with the logo; each Consinto item toggles between check/X; finalized record renders the section read-only).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Recon report pasted:** attachments path; pdf-templates pattern; ficha end; W5-10 ordering.
- **Signature -> Documentos proven:** an e2e captures a signature on a **synthetic** patient and it appears in Documentos served via signed URL (never public). Paste it.
- **Gerar PDF proven:** the action produces an A4 form carrying the clinic logo + print-branding. Paste the test + a sample render/preview.
- **Consinto check/X proven:** each of the three items renders an explicit check-or-X state (not a bare box) and persists. Paste it.
- **PENDENTE-JP proven:** every consent/RGPD string is flagged `PENDENTE-JP` with 2-3 variants recorded for JP; i18n parity (both files). Paste the flagged keys + typecheck.
- **Read-only proven:** a finalized record renders the section read-only. Paste it.
- **Signed-URL-only proof** for the signature save (CLAUDE.md rule 8). State + show the call sites.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the signature->Documentos e2e, the Gerar-PDF test + sample, the Consinto check/X test, the PENDENTE-JP flagged keys + variants + i18n parity, the read-only proof, the signed-URL-only proof, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md authoritative** (sec 7).
- **Migration-free;** reuse the attachments infra (signature -> Documentos) - no parallel storage.
- **Signed-URL storage only** (rule 8): the signature image is never public, never proxied through Next.js, EU region.
- **All consent/RGPD wording is PENDENTE-JP placeholder** - never ship a consent string as final; 2-3 Max variants per text for JP (Q-W5-3).
- **Consinto items show an explicit check/X**, never a bare unchecked box (SPEC sec 7).
- **Read-only on finalized records** (rule 4). **Synthetic patient only** for verify; dev tenant caution. Audit on write (rule 6).
- pt-PT i18n (both files), no emoji, UI-STYLE.md; clinic logo via BrandLockup. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. Halt if: the PDF generation needs a new dependency/vendor (CLAUDE.md owner-confirmable - log to QUESTIONS, do not add silently); or persisting the Consinto state needs a schema change beyond the record (surface it, do not open a silent migration); or JP requires final consent wording before build (it does not - placeholders are the plan).

## Field 7. Report back
Recon report, the signature capture + Documentos save, the Gerar-PDF A4-with-logo, the Consinto check/X block, the PENDENTE-JP placeholders + Max variants, migration-free + signed-URL proofs, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
