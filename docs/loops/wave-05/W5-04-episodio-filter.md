# Loop W5-04 - Episodio dropdown filtered to the selected patient (Batch 1, migration-free)

GATE: none. UI + query-scope lane, migration-free. Small, isolated; **lands independently of the Batch-4 Ficha Medica rebuild** (do not wait on W5-13..W5-17).

## Field 1. Scope and ground truth
In record creation, the **Episodio** selector must list **only the selected patient's episodes**, plus **Sem episodio**. Today it lists episodes across all patients.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- Record creation UI: `apps/web/app/clinical/new/page.tsx` (Episodio dropdown ~lines 57-65).
- Data fetch: `apps/web/lib/clinical/records.ts` -> `listEpisodesForPicker(ctx)` (~lines 256-272). It joins `clinicalEpisodes` with `patients` and returns labels `"${patientName} - ${episodeTitle}"` **with no `patientId` filter** - i.e. every patient's episodes appear. There is already a **Sem episodio** option in the UI.
- The picker is `clinical_records:read`-gated and runs under `runScoped(ctx, ...)` (RLS-scoped).
- **RECON FIRST (report BEFORE building):** confirm the picker query has no patient filter on `origin/main`; confirm how the selected patient id reaches the page (the create form already picks a patient - the Episodio list should key off that selection); decide client-filter vs server-filter (recommended: pass the selected `patientId` to a filtered `listEpisodesForPicker(ctx, patientId)` so the list is scoped server-side, or filter the loaded list client-side keyed on the patient Select - whichever matches how the page loads episodes).

**Scope:** filter the Episodio dropdown to the selected patient's episodes plus **Sem episodio**. When no patient is selected yet, show only Sem episodio (or an empty+Sem episodio state). Label can drop the redundant patient-name prefix once scoped. No episode data-model change. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-04-episodio origin/main -b osteojp-w5-04-episodio`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the picker query (no filter today), how `patientId` is available on the create page, and the chosen filter approach.
3. **Filter the list** to the selected patient's episodes + Sem episodio. If server-side: add a `patientId` arg to `listEpisodesForPicker` (still `clinical_records:read`-gated, still `runScoped`). If client-side: filter the already-loaded set by the selected patient.
4. **Empty state:** no patient selected -> only Sem episodio (or clearly-empty list + Sem episodio).
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the create flow (select patient A -> only A's episodes + Sem episodio; select patient B -> only B's).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Recon report pasted:** the unfiltered query + chosen approach.
- **Filter proven:** an e2e (or a `records.test.ts` unit if server-side) shows the Episodio list for patient A excludes patient B's episodes and always includes Sem episodio. Paste it.
- **RLS/permission unchanged:** the picker stays `clinical_records:read`-gated + `runScoped`. State it, paste the guard line.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the patient-scoped Episodio e2e/unit, the unchanged-guard line, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free**, isolated from Batch 4 (do not touch the template picker or field sequence - that is W5-13/W5-14).
- **Never widen visibility:** the filtered list is a subset of what the role could already read; keep `runScoped` + the capability gate.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan (mismatch / options / recommended default); product/scope to `docs/design/QUESTIONS.md`. Halt if: the selected `patientId` is not actually available at the point the Episodio list loads (would need a page-data-flow change larger than a filter) - surface it and recommend scope.

## Field 7. Report back
Recon report, the filter implementation, migration-free proof, the scoped-list test, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
