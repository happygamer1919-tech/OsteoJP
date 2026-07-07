# Loop W4-16 - Pacientes: structured list table + patient-detail dashboard layout (display-only restructure, recon-first, migration-free)

GATE: depends on **W4-13 merged** (consumes `docs/design/UI-STYLE.md` — this redesign conforms to it). UI lane, migration-free, **display-only / functionality-preserving** (no data-model or note-mechanism change). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Restructure the **Pacientes** list page and the **per-patient detail** page into a cleaner table + dashboard layout conforming to `docs/design/UI-STYLE.md` (W4-13). **This is a display-only restructure — zero data-model, note-mechanism, or attachment-behavior change.**

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **`patients` table** (`packages/db/src/schema.ts`): `full_name`, `nif` (PT fiscal), `phone`, `email`, `patient_number` (0029, contiguous per tenant), plus soft-delete `deleted_at`. The list surfaces identity fields; the detail surfaces the full record.
- **Notes are append-only via `patient_note_revisions`** (0030, W2-01 #452; the Notas Rápidas card writes a revision, W2-11 #463). **The `patients.notes` column is RETAINED but IGNORED** — the notes UI reads/writes `patient_note_revisions`, never `patients.notes` (STATE 2026-07-06). **This loop does NOT touch the note mechanism** — the append-only revision flow is untouched; the redesign only restructures where the notes UI sits on the page.
- **Anexos = attachments** via the **existing signed-URL path** (CLAUDE.md rule 8, never public; W4-05 #484 added in-page `getUserMedia` capture into a ficha's anexos). **Attachment behavior is untouched** — the redesign only restructures the anexos section's presentation.
- **Marcações = the patient's `appointments`** (read-only on the detail page).
- **Search is kept as-is FUNCTIONALLY** — the list search behavior does not change; only its surrounding layout is restyled.
- **Permission matrix (CLAUDE.md):** patient visibility is role-scoped server-side (Therapist = own only). The redesign is presentational and does NOT relax any server-side scope.

**Owner finding (2026-07-06):** the **list page** and the **per-patient detail** are both **visually flat**.

**Build:**
- **(a) List page per UI-STYLE.md:** a **structured table** — **Paciente** (with **avatar initials**), **NIF**, **Nº de paciente**, **Telemóvel**, and a **chevron** into the detail — with better row hierarchy. **Search kept as-is functionally.**
- **(b) Patient detail page:** a **dashboard layout** — an **identity header card** and **clearly sectioned areas** for the EXISTING content: **dados** (identity/demographics), **notas** (the `patient_note_revisions` UI, unchanged), **anexos** (attachments via the signed-URL path, unchanged), **marcações** (the patient's appointments). **Display-only restructure — zero data-model changes; append-only revisions untouched; `patients.notes` stays ignored.**

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-16-pacientes-redesign origin/main -b osteojp-w4-16-pacientes-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-16-pacientes-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing (paste paths):** the Pacientes list route + component + its search; the patient-detail route + component; the **`patient_note_revisions` notes UI** (append path — to be left untouched); the **anexos** attachment component + the signed-URL path; the marcações read on the detail page; the Pacientes Playwright specs that will move.
3. **(a) List table:** render the structured table (Paciente + avatar initials, NIF, Nº de paciente, Telemóvel, chevron) per UI-STYLE.md; keep search behavior identical.
4. **(b) Detail dashboard:** identity header card + sectioned dados / notas / anexos / marcações; each section mounts the EXISTING component unchanged (notes → `patient_note_revisions` UI; anexos → signed-URL attachment component).
5. **Regression check:** confirm **note append** still writes a `patient_note_revisions` row (not `patients.notes`) and **anexos** upload/view still uses the signed-URL path — both unchanged by the restructure.
6. **Update the Pacientes Playwright specs on-branch** (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the list (search + open detail) and the detail (note append + anexos view).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** list + detail routes/components, the notes UI (append path), the anexos signed-URL path, the marcações read, the specs that move.
- **List renders the structured table** (Paciente + avatar initials, NIF, Nº de paciente, Telemóvel, chevron) with search behaving identically. Paste a screenshot/DOM assertion + a search-unchanged test.
- **Detail renders the dashboard** (identity header + dados/notas/anexos/marcações sections). Paste a screenshot/DOM assertion.
- **Zero functional regression — note + anexos verified unchanged on the E2E seed tenant:** paste a test proving **note append still writes `patient_note_revisions`** (append-only, `patients.notes` untouched) and **anexos still uses the signed-URL path**.
- **Conforms to `docs/design/UI-STYLE.md`** (W4-13): note which table/card/badge/token patterns were applied.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, list + detail screenshots/DOM assertions, the search-unchanged test, the note-append-still-`patient_note_revisions` test, the anexos-signed-URL-unchanged proof, the UI-STYLE conformance note, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-16-pacientes-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Display-only / functionality-preserving:** **zero data-model change; the append-only `patient_note_revisions` note mechanism is untouched; `patients.notes` stays ignored; anexos signed-URL behavior unchanged.** Search behavior identical. Do not relax role-scoped patient visibility.
- **Redesign WILL move Playwright selectors:** update the affected specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **LIVE-DATA CAUTION:** all Wave 04 patient data is SYNTHETIC (no Fisiozero import; pre-real-data gates stand, DECISIONS 2026-07-01). Verify on **synthetic patients on the E2E seed tenant**. Never modify real therapist accounts, their `availability_templates`, or `therapist_services` on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`.
- **Conform to `docs/design/UI-STYLE.md`** (W4-13); refinement, not rebrand.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Restructuring the detail sections would require changing the note or attachment mechanism (not just its placement) — STOP; this loop is display-only.
- A section's existing component cannot be remounted in the new layout without a behavior change — surface it; recommend keeping the component and adapting only its container.
- The restyle would require editing a `packages/ui` primitive whose ripple extends beyond Pacientes — surface the blast radius.

## Field 7. Report back
Recon report, the list table + detail dashboard, the search-unchanged + note-append + anexos-unchanged proofs, list/detail screenshots, the UI-STYLE conformance note, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
