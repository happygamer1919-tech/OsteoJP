# Loop W6-03 - Agenda deep-link from patient profile (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias.** "Nova marcacao" on a patient profile must land in Agenda with the create sidebar already open and THAT patient preselected and locked in. **Migration-free, presentation/navigation only.** Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Clicking **Nova marcacao** on a patient profile currently just navigates to `/agenda` with nothing preselected, forcing the user to re-search the patient. Change it so it deep-links into Agenda with the appointment create drawer OPEN and the source patient already selected and locked in the appointment details; the user then only picks therapist and date/time.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The current button:** `apps/web/app/patients/[id]/page.tsx` renders `<Link href="/agenda" className={primaryLink}>` with `s["patients.newAppointment"]` (around line 227). It carries NO patient param today. (Note: a separate `/clinical/new?patientId=${id}` link exists for fichas - that is the precedent pattern for passing the patient id via a query param.)
- **The Agenda + drawer:** `apps/web/app/agenda/agenda-view.tsx` owns the view and mounts `AppointmentDrawer` (`apps/web/app/agenda/appointment-drawer.tsx`). The drawer's `ModalState` is `{ mode: "create"; slot?: { date; time } } | { mode: "edit"; appt }`. In create mode the form initialises `patientId: ""` (drawer ~line 150); edit mode pre-populates the patient combobox from `editing.patientId`/`patientName` (~line 210-213). So create mode already has a patient combobox - it just starts empty.
- **The mechanism (recommended shape):** add a deep-link query param on the profile link (e.g. `/agenda?novaMarcacaoPaciente=<patientId>` - recon picks the exact param name, reusing the existing param conventions in `agenda-view.tsx`). On mount, `agenda-view.tsx` reads the param, opens the drawer in `create` mode, and seeds the create form's `patientId` (and the combobox display label) with that patient, LOCKED so the user cannot change it in this flow (they only pick therapist + date/time). Clear the param after opening so a refresh/back does not re-trigger.
- **Rationale on record (embed):** Rodica disambiguates same-name patients by NIF in the patient list and must not have to re-search in the agenda. Preselect-and-lock removes the re-search and the same-name ambiguity.
- **Patient display + lock:** the drawer's patient combobox must show the selected patient (name, and ideally the disambiguating identity the profile already knows) and be read-only/locked in the deep-link flow. Recon how the combobox value + label are set in edit mode and reuse that path for the locked create.
- **Migration-free:** navigation + client state only; no schema, no data change.

**Scope:** change the profile "Nova marcacao" link to deep-link into Agenda with a patient param; Agenda auto-opens the create drawer with that patient preselected and locked; the user picks only therapist + date/time; param cleared after open. Migration-free, navigation/presentation only. pt-PT i18n (both files) for any new copy.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-03-agenda-deeplink origin/main -b osteojp-w6-03-agenda-deeplink`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the profile "Nova marcacao" link; the `agenda-view.tsx` param conventions + how it opens the drawer; the create-mode `ModalState` + the `patientId: ""` init; how edit mode sets the combobox value/label (to reuse for the locked create); how to clear the param after open. Paste findings.
3. **Profile link:** pass the patient id via the deep-link param (reuse the `/clinical/new?patientId=` precedent for shape).
4. **Agenda autopen + lock:** on reading the param, open the drawer in create mode, seed `patientId` + combobox label, lock the patient field; clear the param. The user completes therapist + date/time only.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (from a patient profile, Nova marcacao lands in Agenda with the create drawer open and THAT patient shown + locked; picking therapist + date/time and saving creates the appointment for the correct patient; a normal Agenda create without the param still starts with an empty, editable patient field). JSON.parse both i18n files in the gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Recon report pasted:** the link, the agenda param + drawer open path, the create-mode init, the combobox value/label reuse.
- **Deep-link PROOF:** the profile Nova marcacao navigates to Agenda with the patient param; the create drawer opens automatically with that patient preselected and locked. Paste it (E2E from a real profile, correct patient identity).
- **Lock PROOF:** in the deep-link flow the patient field cannot be changed; only therapist + date/time are user-editable. Paste it.
- **Correct-patient PROOF:** saving from the deep-link flow creates the appointment bound to the SOURCE patient (not a same-name other). Paste it.
- **No-regression PROOF:** a normal Agenda create (no param) still opens with an empty, editable patient combobox. Paste it.
- **Param-cleared PROOF:** after the drawer opens, a refresh/back does not re-trigger the autopen. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the migration-free diff, the deep-link + autopen proof, the lock proof, the correct-patient proof, the no-regression proof, the param-cleared proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Navigation / presentation only.** No schema change, no migration, no data change.
- **Preselect AND lock** the source patient in the deep-link flow; the user picks only therapist + date/time. A normal (non-deep-link) create is unchanged (empty, editable patient).
- **Reuse the existing create-drawer** and its combobox value/label path (the edit-mode precedent); do not fork a second appointment form.
- **Clear the deep-link param after opening** so refresh/back does not re-open.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- The create drawer cannot be opened + patient-seeded from a URL param without a structural refactor of `agenda-view.tsx` that ripples beyond this flow - surface the blast radius before touching shared agenda state.
- Locking the patient field conflicts with an existing create-flow requirement (e.g. the combobox is required to be editable for a reason recon surfaces) - log to `docs/design/QUESTIONS.md` with a recommended default (lock in the deep-link flow only, editable otherwise) and proceed on the default only if unblocked.

## Field 7. Report back
Recon report, the migration-free diff, the deep-link + autopen proof, the lock proof, the correct-patient proof, the no-regression proof, the param-cleared proof, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is migration-free -> GREEN self-merge. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.
