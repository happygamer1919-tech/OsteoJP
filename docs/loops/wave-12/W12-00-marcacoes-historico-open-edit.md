# Loop W12-00 - Marcacoes list open/edit historico (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, DEFECT, CB marks GRAVE - TOP PRIORITY, runs FIRST. OWNER VISUAL GATE, migration-free.** The standalone `/marcacoes` list cannot open or edit an appointment: its rows are inert display cards. Restore the open/edit ("historico") path from the list by reusing the appointment manage surface that already exists on the agenda + patient profile. No schema change. Starts from **fresh `origin/main`**; one PR in flight; never stacked.

## Field 1. Scope and ground truth

Give the `/marcacoes` list row an open/edit affordance so a marcacao can be opened and its historico edited (reagendar / estado / cancelar / marcar novamente) directly from the list, matching the capability already available elsewhere. Presentation + wiring only; no schema, no migration, no new server action if an existing one fits.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies read-only, ZERO memory):

- **Root cause: the `/marcacoes` list has NO open/edit path.** `apps/web/app/marcacoes/marcacoes-view.tsx:168-249` (`AppointmentRow`) renders a `GlassCard` (time, patient, service chip, location, therapist, created-by, status) with **no `onClick`, no `href`, no drawer** - it never imports `AppointmentDrawer`. The only interactive affordance is the read-only `AppointmentHoverCard` at `marcacoes-view.tsx:227`. The page is a "Presentation only" server component (`apps/web/app/marcacoes/page.tsx:39-46,137-145`).
- **The edit/manage capability EXISTS on two other surfaces (reuse, do not rebuild):**
  - **Agenda card -> `AppointmentDrawer` in edit mode:** `apps/web/app/agenda/agenda-view.tsx:263` `onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}` -> `apps/web/app/agenda/appointment-drawer.tsx` (rendered `agenda-view.tsx:267-279`).
  - **Patient profile Consultas tab -> "Gerir marcacao" disclosure:** `apps/web/app/patients/[id]/appointments-list.tsx:212-231` (Reagendar / Estado / Cancelar / Marcar novamente), wired to `apps/web/lib/scheduling/actions.ts`: `updateAppointment` (:582), `rescheduleAppointment` (:703), `cancelAppointment` (:823), `cloneAppointment` (:496).
- **Naming trap masking the gap:** the e2e `apps/web/e2e/marcacoes-tab-edit.spec.ts` (W5-09) targets `/patients/{id}?tab=consultas` - the **patient-profile Consultas tab, not the `/marcacoes` list**. So the edit flow is green in CI while the `/marcacoes` list itself has never had an open/edit path. Any new test MUST target the `/marcacoes` route specifically.
- **Recommended default (product/UX):** open the appointment in the SAME `AppointmentDrawer` edit surface the agenda uses, mounted from a client interaction layer over the marcacoes list (the list stays a server component; a thin client wrapper holds the modal state, mirroring `agenda-view.tsx`). This reuses the drawer + its server actions with zero logic duplication. The fallback (deep-link the row to `/patients/{id}?tab=consultas` focused on the appointment) is acceptable if the drawer cannot be reused cleanly from this route - if the choice is not obvious, HALT to a Q (Field 6) rather than duplicating edit logic.
- **Permission matrix is server-enforced and unchanged:** the drawer's server actions already enforce Admin/Therapist(own)/Receptionist scoping; this loop adds a UI entry point, never relaxes a guard.

**Scope:** a client interaction layer over the marcacoes list + a row open/edit affordance reusing `AppointmentDrawer` (edit mode) and its existing actions; a `/marcacoes`-scoped e2e; pt-PT + en i18n for any new label. The only writes are `apps/web/app/marcacoes/*` (+ a shared client wrapper), tests, and both i18n files; ZERO migration, ZERO workflow files.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` is Wave 11 close (`#631`); `git worktree add ../osteojp-w12-00-marcacoes-historico origin/main -b osteojp-w12-00-marcacoes-historico`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce:** run the app on local `127.0.0.1` synthetic data, open `/marcacoes`, confirm no row opens or edits (only the hover popup appears). Record the reproduction.
3. **Wire the open/edit affordance:** add a thin client wrapper over the marcacoes list holding modal state (mirror `agenda-view.tsx` `setModal`), make `AppointmentRow` open `AppointmentDrawer` in `mode:"edit"` on click/Enter (keyboard-accessible, `role`/`aria` correct), passing the same `appt` shape the agenda passes. Do NOT duplicate `updateAppointment`/`reschedule`/`cancel`/`clone`; reuse the drawer's existing wiring. If the drawer needs a prop the marcacoes row does not have, source it from the same query `page.tsx` already runs (extend the select, do not add a table).
4. **i18n:** any new label (e.g. an "Abrir"/"Editar" affordance or aria-label) added to BOTH `packages/i18n/src/strings.pt.json` and `strings.en.json`, same key; JSON.parse both.
5. **Test:** add `apps/web/e2e/marcacoes-open-edit.spec.ts` that navigates to **`/marcacoes`** (not the patient tab), opens a row, edits (e.g. change estado or reschedule), and asserts the change persisted; add a unit/RTL test asserting the row is now interactive (has an accessible open control). Keep the existing patient-tab spec green.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. Confirm `git diff --name-only origin/main` shows only `apps/web/app/marcacoes/*` (+ shared wrapper), tests, and the two i18n files - ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Open PROOF:** an e2e on `/marcacoes` opens an appointment from a list row (drawer/detail visible). Paste the spec + run.
- **Edit PROOF:** the same e2e performs an edit (estado or reschedule) from the list and asserts persistence via a reload/DB read. Paste the assertion.
- **Reuse PROOF:** `git grep` shows the marcacoes edit path calls the EXISTING actions (`updateAppointment`/`rescheduleAppointment`/`cancelAppointment`/`cloneAppointment`), no new duplicate action. Paste the call sites.
- **Interactive-row PROOF:** a unit/RTL test asserts the row exposes an accessible open control (keyboard-focusable). Paste it.
- **No-schema PROOF:** `git diff --name-only origin/main` shows ZERO migration/workflow files. Paste it.
- **Gates green** (lint, typecheck, test, build, e2e; i18n parity pt+en).

## Field 4. Verification (paste evidence)
The reproduction note, the `/marcacoes` open+edit e2e + run, the reuse call sites, the interactive-row test, the no-schema diff, suite counts, the osteojp-platform PREVIEW URL with role steps (Admin: open+edit any; Therapist: open+edit own; Receptionist: open+edit/reschedule per matrix), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free, reuse-only:** no schema/column/enum/migration; reuse `AppointmentDrawer` + its existing server actions, never a parallel edit path.
- **Permission matrix unchanged** - server-side guards in the reused actions are the authority; the UI entry point never relaxes them. Verify a Therapist cannot open+edit another therapist's appointment from `/marcacoes`.
- **New test MUST target `/marcacoes`** (not the patient Consultas tab) - the existing green spec masks this defect.
- **Standing test-data rule:** verify on local `127.0.0.1` synthetic data only; the cloud is REAL DATA ONLY.
- pt-PT diacritics correct; both i18n files JSON.parse; no emoji; plain hyphens only; no em/en dashes; no new hex. **Never force-push / `--admin`.** No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` is not the Wave 11 close.
- Restoring open/edit requires a schema/column change (it should not) - HALT with the finding.
- The reuse path is genuinely infeasible from `/marcacoes` and the choice between "inline drawer" vs "deep-link to the Consultas tab" is not obvious - HALT to a Q with the recommended default (inline drawer) rather than duplicating edit logic.
- Reproduction shows the list CAN already open/edit (contradicting the report) - return to Rodica's exact words (the Wave 09 item-9 lesson), record what she meant, HALT to a Q rather than assuming it is fixed.

## Field 7. Report back
The reproduction, the `/marcacoes` open+edit e2e + run, the reuse call sites, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-00 is OWNER VISUAL GATE (visual flow, migration-free).** All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green (read from the checks API NOT the banner) are NECESSARY but NOT sufficient; GREEN pushes the osteojp-platform PREVIEW URL + the role steps and HALTs for the owner to open a `/marcacoes` row and edit it. GREEN does NOT self-merge. (Owner ruling 2026-07-23: `[SELF-MERGE-OK]` is reserved for non-visual backend defects; this is a visual flow, so it is owner-gated. See DECISIONS 2026-07-23.)
- **Runs FIRST in Wave 12** (CB GRAVE), fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on scope/product/reality mismatch.
