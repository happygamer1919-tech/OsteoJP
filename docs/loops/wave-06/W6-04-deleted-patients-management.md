# Loop W6-04 - Deleted-patients management view (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias, RECON-FIRST.** Add a "Pacientes eliminados" management view (list / restore soft-deleted + duplicate-marked patients; permanent delete stays restricted). **Runs strictly AFTER W6-01a is merged** (the delete bug blocked this flow). **Migration-free expected** (recon at authoring found the soft-delete columns already exist); if recon proves a migration is genuinely needed, this loop becomes **OWNER-MERGE** with live-apply evidence, one migration in flight, fetch-and-fast-forward first. If recon shows NO true soft-delete state exists, **HALT-LOUD** with a proposed model before building. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

The owner soft-deleted patients **paol** and **paul** and found no place to see or recover them. Add a **Pacientes eliminados** management view under **Administracao**, owner-gated: list soft-deleted / duplicate-marked patients, a **restore** action, and keep **permanent delete** restricted to patients with no associated data behind the existing password gate.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory; RE-RECON is still mandatory):
- **A true soft-delete state ALREADY exists** (recon at authoring): `packages/db/src/schema.ts` `patients` has `deletedAt timestamp withTimezone` (line ~407, commented "soft delete") AND `mergedIntoId uuid` (line ~398, the duplicate pointer). The schema header (line ~12) documents "soft delete via deleted_at where records must never truly disappear (patients)". So **no migration is expected** - the recover view reads `deletedAt IS NOT NULL OR mergedIntoId IS NOT NULL`.
- **Current delete semantics (recon confirms exact behaviour):**
  - **Eliminar** = mark as duplicate + transfer history to a survivor id (sets `mergedIntoId`), a soft/merge operation - the row persists.
  - **Eliminar definitivamente** = permanent hard delete, allowed ONLY for patients with no associated data; it reuses the scrypt password gate.
  - The controls live in `apps/web/app/patients/_components/patient-actions.tsx` (imports `hardDeletePatient`; comment "Destructive controls (soft-delete / restore / merge / gated hard delete)"; `HARD_DELETE_ERROR_TEXT` map + `s["errors.generic"]` fallback). The profile page `apps/web/app/patients/[id]/page.tsx` already branches on `patient.mergedIntoId` (line ~216) and `patient.deletedAt` (line ~218) for badges and passes `isDeleted={Boolean(patient.deletedAt)}` (line ~441). **A restore action may already be partially present** ("restore" in the patient-actions comment) - recon whether `restore` exists and reuse it; do not duplicate.
- **The new view:** a route under **Administracao** (sibling to `apps/web/app/admin/*`, e.g. `apps/web/app/admin/patients-eliminados/` or similar - recon the admin nav pattern in `apps/web/app/admin/admin-nav.client.tsx`), **owner-gated** (role `owner`; see the `packages/auth/permissions.ts` model - owner has all capabilities; recon whether the intended gate is owner-only or `patients:delete`-holders, and honour the owner ruling: this management view is owner-gated). It lists soft-deleted + duplicate-marked patients with the disambiguating identity (NIF), a **Restore** action (clears `deletedAt` / unmerges per recon semantics), and a **permanent delete** that stays restricted to no-associated-data patients behind the password gate (reuse, do not fork).
- **Permanent-delete restriction is preserved:** the "no associated data" precondition and the scrypt gate are unchanged; this loop only adds a place to SEE and RESTORE, plus routes the existing permanent delete through the new view for eligible rows.
- **Audit** every restore and permanent delete (rule 6). **Secrets never printed** (rule 7).

**Scope:** an owner-gated Pacientes eliminados view under Administracao listing soft-deleted (`deletedAt`) + duplicate-marked (`mergedIntoId`) patients with NIF; a restore action (reusing any existing restore path); permanent delete kept restricted to no-associated-data patients behind the existing password gate; audited. Migration-free expected. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **Sequence gate:** confirm W6-01a is MERGED on `origin/main` before starting (the delete bug blocked this flow). If not merged, do not start.
2. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-04-deleted-patients origin/main -b osteojp-w6-04-deleted-patients`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
3. **RECON, report BEFORE building (mandatory):** confirm the ACTUAL soft-delete/merge state (`deletedAt`, `mergedIntoId`) and its transitions; whether a `restore` action already exists (reuse it); the exact Eliminar vs Eliminar definitivamente semantics + the no-associated-data precondition; the admin nav pattern + the owner gate. **If recon shows NO true soft-delete state exists (rows truly disappear), HALT-LOUD (Field 6) with findings and a proposed model - build nothing.** Paste findings.
4. **Build the view:** owner-gated route under Administracao listing `deletedAt IS NOT NULL OR mergedIntoId IS NOT NULL` patients with NIF; a Restore action (reuse existing path); permanent delete restricted to no-associated-data rows behind the password gate. Audit restore + permanent delete.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation + a gate test that a non-owner cannot reach the view or its actions), `pnpm build`, `pnpm test:e2e` (soft-delete a synthetic patient -> it appears in Pacientes eliminados -> Restore brings it back to the active list; a patient with associated data cannot be permanently deleted; wrong password refused). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Sequence PROOF:** W6-01a is merged on `origin/main` (paste the merge ref) before this loop's first commit.
- **Migration disposition PROOF:** `git diff --name-only origin/main` shows ZERO migration/schema files (expected). If a migration WAS unavoidable, this loop is OWNER-MERGE and pastes the one-migration diff + live-apply evidence instead (Field 6).
- **Recon report pasted:** the confirmed soft-delete/merge state + transitions; whether restore already exists; permanent-delete precondition; owner gate.
- **List PROOF:** soft-deleted + duplicate-marked synthetic patients appear in the view with their NIF; active patients do not. Paste it.
- **Restore PROOF:** Restore returns a soft-deleted patient to the active list (clears the soft-delete/merge per recon semantics) and is audited. Paste it.
- **Permanent-delete-restriction PROOF:** a patient WITH associated data cannot be permanently deleted; a no-associated-data patient can, behind the password gate (no secret printed). Paste it.
- **Owner-gate PROOF:** a non-owner (admin/therapist/reception) cannot reach the view or invoke its actions (route-level AND server-action-level). Paste it.
- **Audit PROOF:** restore + permanent delete each write an audit row (rule 6). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Sequence proof, recon report, the migration disposition diff, the list proof, the restore proof, the permanent-delete-restriction proof, the owner-gate proof, the audit proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **Runs strictly after W6-01a is merged.** A0 worktree isolation off fresh `origin/main`.
- **Recon FIRST on the real delete semantics.** Build nothing until the soft-delete state is confirmed; if it does not exist, HALT with a proposed model.
- **Migration-free expected.** If a migration is genuinely required, the loop becomes OWNER-MERGE: one migration in flight, fetch-and-fast-forward first, live-apply verified with evidence pasted before merge; ship the RLS isolation test in the same PR (CLAUDE.md RLS rule). Do NOT self-merge a migration loop.
- **Permanent delete stays restricted** to no-associated-data patients behind the existing scrypt gate; reuse, never fork the gate. **Secrets never printed** (rule 7).
- **Owner-gated** view + actions, enforced route-level AND server-side (not just nav hiding).
- **Reuse existing restore/merge/delete paths;** do not duplicate. DB access only through `packages/db`. Audit mutations (rule 6).
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- W6-01a is NOT merged - do not start.
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- **Recon shows NO true soft-delete state** (patients truly disappear on delete, or `deletedAt`/`mergedIntoId` are not what the authoring recon assumed) - HALT-LOUD with findings and a proposed soft-delete/recover model; build nothing.
- **A migration is genuinely required** - HALT; convert to OWNER-MERGE (one migration in flight, fetch-and-ff, live-apply evidence, RLS test same PR), do not self-merge. If a migration is in flight elsewhere, wait.
- Restoring a merged patient would resurrect data-integrity conflicts (the survivor already absorbed history) - surface the reconciliation question with a recommended default rather than guessing.

## Field 7. Report back
Sequence proof, recon report, the migration disposition diff, the list/restore/permanent-delete-restriction/owner-gate/audit proofs, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. **Migration-free -> GREEN self-merge; if a migration surfaced, this loop is OWNER-MERGE with live-apply evidence pasted before merge, one migration in flight, fetch-and-fast-forward first.** Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green (or HALT for owner merge if it carries a migration). Never force-push / `--admin`; never self-merge on red required checks.
