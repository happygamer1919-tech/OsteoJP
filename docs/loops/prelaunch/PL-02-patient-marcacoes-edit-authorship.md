# Loop PL-02 - Patient Marcacoes tab: edit + authorship line (Pre-Launch, Rodica batch 2026-07-27)

GATE: **Pre-Launch, DEFECT, patient-profile Marcacoes tab. OWNER VISUAL GATE,
migration-free.** Two defects in one card: (a) editing a patient's marcacao from
the profile tab, (b) a missing authorship line. **Recon found the authorship data
is ALREADY fetched but ignored by the component, and that "Gerir marcacao" reaches
Reagendar/Estado/Cancelar but ONLY for non-terminal rows** - so investigate
whether (a) is a regression, an incompleteness, or a terminal-state gap before
building. W12-00 (#633) claimed this shipped. Starts from **fresh `origin/main`**;
never stacked.

## Field 1. Scope and ground truth

Rodica's words, verbatim, do not translate:

> "Continuamos a nao conseguir editar as marcacoes do utente, e nao e visivel por
> quem nem quando foi feita a marcacao"

Two defects:
- **(a)** "Gerir marcacao" does not reach an editable surface from the patient
  profile tab.
- **(b)** No authorship line: add "Criada por {staff} em {DD/MM/AAAA HH:mm}" to
  the card.

Ground truth (recon at authoring 2026-07-27, embed - executor RE-VERIFIES
read-only, ZERO memory):

- **The tab is the "consultas" tab, labelled "Marcacoes"** (`s["patients.tabAppointments"]`, `strings.pt.json:114`). Defined `apps/web/app/patients/[id]/page.tsx:130`, rendered `:285-303` -> `<AppointmentsList>`; data via `listPatientAppointments` (`page.tsx:189`).
- **Component:** `apps/web/app/patients/[id]/appointments-list.tsx`, `AppointmentRow` `:154-234`.
  - **(a) "Gerir marcacao"** = `s["patients.appointmentManage"]` (`strings.pt.json:1093`), the `<summary>` (`:214-216`) of a `<details>` disclosure (`:212-231`). It DOES reach three actions: **Reagendar** (date/time only, `RescheduleDrawer` `:319-424`), **Estado** (inline, `:245-309`), **Cancelar** (`:432-483`). BUT: `showManage` renders ONLY when `isEditable` (status `scheduled`/`confirmed`; `:81-83, :172-176`) - **terminal rows (completed/cancelled/no_show) get NO "Gerir" at all.** And there is **no full edit surface** (service / therapist / room / notes) here, unlike the Agenda `appointment-drawer.tsx`. So "nao conseguir editar" is most likely (i) the row Rodica tried was terminal (no Gerir), or (ii) she expected full edit, not just Reagendar/Estado/Cancelar. RE-VERIFY which before building.
  - **(b) No authorship line.** The row renders date/time (`:182-184`), practitioner + service (`:185-188`), status chips (`:191-206`) - and nothing about who created it or when.
- **The authorship data ALREADY EXISTS and is fetched (do not add a query):** `appointments.createdBy` (`schema.ts:711`); `data.ts` selects `createdByUser` alias (`:82`) and exposes `createdBy`/`createdByName`/`createdAt` (`:156-158`); the type carries them (`types.ts:69-71`). `listPatientAppointments` (`data.ts:220-231`) uses the same `baseAppointmentQuery`/`mapAppointment`, so these rows carry `createdByName`/`createdAt` - the component just ignores them.
- **Rendered precedent to reuse (do not reinvent the string):** the Agenda hover card already renders this exact line - `apps/web/app/agenda/appointment-hover-card.tsx:158-165` (`s["appointment.createdBy"]: {createdByName ?? createdByPortal}` + `createdAt`). Reuse its formatting for "Criada por {staff} em {DD/MM/AAAA HH:mm}".
- **W12-00 naming trap:** W12-00 (#633) restored open/edit on the standalone `/marcacoes` LIST and its e2e targets `/patients/{id}?tab=consultas` (the patient tab) - `marcacoes-tab-edit.spec.ts` covers reschedule/estado/cancel but asserts NO authorship. So the edit path may be green in CI while the patient tab still cannot do what Rodica needs. Any new assertion must target the patient Marcacoes tab specifically.
- **Server actions (reuse, do not duplicate):** `apps/web/lib/scheduling/actions.ts` - `updateAppointment` (`:604`), `rescheduleAppointment` (`:763`), `cancelAppointment` (`:883`), `cloneAppointment` (`:518`). Permission matrix is server-enforced; this loop adds UI, never relaxes a guard.

**Scope:** `apps/web/app/patients/[id]/appointments-list.tsx` (the authorship line + the edit-reach fix) + the two i18n files if a new label is added + a patient-Marcacoes-tab e2e. ZERO migration, ZERO workflow.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-pl-02-marcacoes-tab`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce + classify (a):** open a patient with a scheduled appointment and one terminal appointment. Confirm whether "Gerir marcacao" appears + Reagendar edits time successfully on the scheduled row, and whether the terminal row has no Gerir. Decide which of {regression, incompleteness, terminal-state gap, wants-full-edit} matches Rodica's report. If it is "wants full edit (service/therapist)", that is a scope expansion - HALT to a Q (Field 6).
3. **Fix (a)** to the smallest surface matching her need: e.g. surface Reagendar/Estado on terminal rows where the matrix allows, or make the edit reach obvious. Reuse the existing actions; never build a parallel edit path.
4. **Fix (b):** render "Criada por {createdByName} em {createdAt formatted DD/MM/AAAA HH:mm}" on the row, reusing the `appointment-hover-card.tsx:158-165` formatting and the already-fetched `createdByName`/`createdAt`. 24h time (rule).
5. **i18n:** any new key in BOTH `packages/i18n/src/strings.pt.json` and `strings.en.json`; JSON.parse both.
6. **Test:** a patient-Marcacoes-tab e2e that opens patient -> Marcacoes -> Gerir -> edits the time -> saves -> re-reads the changed value (the briefing DoD), AND asserts the authorship line is present with the creator + date. Keep `marcacoes-tab-edit.spec.ts` green.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; scoped diff (no migration/workflow).

## Field 3. Definition of done (machine-verifiable)
- **Edit PROOF (briefing DoD):** an e2e opens patient -> Marcacoes -> Gerir -> edits the time -> saves -> re-reads the changed value. Paste the spec + run.
- **Authorship PROOF:** the row shows "Criada por {staff} em {DD/MM/AAAA HH:mm}"; a test asserts the creator name + formatted date are present, 24h. Paste it.
- **Reuse PROOF:** `git grep` shows the edit path calls the EXISTING actions (`updateAppointment`/`rescheduleAppointment`/`cancelAppointment`) and the authorship line reuses the already-fetched `createdByName`/`createdAt` (no new query). Paste the call sites.
- **Classification PROOF:** a one-line note in the PR stating which of {regression, incompleteness, terminal-state gap} defect (a) actually was, with the reproduction.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow.
- **Gates green** (i18n parity pt+en).

## Field 4. Verification (paste evidence)
The reproduction + classification, the patient-tab edit e2e + run, the authorship-line test, the reuse call sites, the no-schema diff, suite counts, the Preview URL with role steps (Admin edits any; Therapist own; Receptionist per matrix; authorship visible to all), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free, reuse-only:** reuse `RescheduleDrawer`/Estado/Cancelar + the existing actions and the already-fetched authorship fields; no new table/column/query.
- **Permission matrix unchanged** - server guards are the authority; the UI never relaxes them. Verify a Therapist cannot edit another therapist's appointment from the tab.
- **New assertion MUST target the patient Marcacoes tab** (not the standalone `/marcacoes` list that W12-00 covered).
- Verify on local `127.0.0.1` synthetic data; cloud REAL DATA ONLY. 24h time; pt-PT diacritics; both i18n files parse; no emoji; plain hyphens; no em/en dashes. Never force-push / `--admin`. No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Reproduction shows "Gerir marcacao" ALREADY edits time on a normal row and Rodica actually wants a FULL edit surface (service/therapist/room) - that is a scope expansion; HALT to a Q with a recommended default (add the missing fields to the existing Reagendar/manage surface, reusing `updateAppointment`) rather than guessing the scope.
- Restoring edit requires a schema change (it should not - the actions exist) - HALT with the finding.
- Reproduction contradicts the report (edit + authorship both already work) - return to Rodica's exact words (rule 12), capture the real state on her data, HALT to a Q rather than assuming it is fixed.

## Field 7. Report back
The reproduction + classification of defect (a), the patient-tab edit e2e + run, the authorship-line test, the reuse call sites, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Pre-Launch)
- **PL-02 is OWNER VISUAL GATE (patient-tab visual flow, migration-free).**
  Required checks + all three Vercel deploys green (checks API not banner)
  NECESSARY but not sufficient; GREEN pushes the Preview + role steps and HALTs;
  owner opens a patient, edits a marcacao from the tab, and confirms the authorship
  line. GREEN does NOT self-merge. Fresh `origin/main`, one PR in flight, never
  stacked. Workflow files never touched. HALT-LOUD on scope/reality mismatch.
