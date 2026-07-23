# Loop W12-12 - SPEC notes unification (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, SPEC-FIRST. OWNER-MERGE (spec doc, no product code).** Authors `docs/design/SPEC-notes-unification.md`: one note model so a note added in the Agenda is reflected in Marcacoes AND the patient profile, and the Inicio notes block can attach a note to a patient profile OR to one specific appointment of that patient. Adds NO product code, NO migration - it is the design source of truth that gates the W12-13 build. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Produce a committed SPEC that defines the unified note model, the read surfaces (agenda hover, Marcacoes, patient profile), the write surfaces (agenda drawer, Inicio "Notas rapidas" with patient + appointment selectors), the migration + backfill the build will need, and the invariants (append-only history preserved; portal never exposes notes). NO build.

Ground truth (recon at authoring 2026-07-23, embed - the spec author verifies, ZERO memory):

- **The disconnect is that three surfaces write three different stores. Five note stores exist:**
  - `appointments.notes` (plain text column, `schema.ts:597`) - written by the Agenda drawer "Notas" field (`appointment-drawer.tsx:1028-1030` -> `updateAppointment`/`createAppointment`); rendered in the agenda + Marcacoes hover (`appointment-hover-card.tsx:52,106-118`, reads `AgendaAppointment.notes` <- `data.ts:101`). NOT on the patient profile.
  - `appointment_notes` (table, `schema.ts:841-873`, migration 0026) - links `appointment_id` (NOT NULL) + `patient_id` (NOT NULL) + optional `episode_id`; append-only. **Has NO writer anywhere** (app only READS existence via `AgendaAppointment.hasNote`, `data.ts:113-117`, driving the "Sem nota" chip - which is therefore always "Sem nota"). This is the ONLY table modelling "a note on a specific appointment of a patient."
  - `patient_note_revisions` (table, `schema.ts:891-911`, migration 0030) - append-only patient history, `patient_id` NOT NULL, NO appointment link - written by the Inicio "Notas rapidas" card (`notas-rapidas.tsx:62`) + the profile Notas composer (`notes-composer.tsx:28`) via `appendPatientNoteAction` (`patients/actions.ts:397-414`); rendered on the profile Notas tab.
  - `patients.notes` (legacy text, `schema.ts:466`) - no longer read/written (`patient-form.tsx:249-250`).
  - `quick_notes` (table, `schema.ts:1234-1253`) - retired per-staff scratchpad, orphaned action.
- **Why an Agenda note does not reach the profile:** agenda writes `appointments.notes`; the profile reads `patient_note_revisions`; nothing bridges them, and the bridge table `appointment_notes` has no writer. That is the root cause.
- **Rodica's ask:** notes added in Agenda must reflect in Marcacoes + the patient profile; the Inicio notes block gains a patient selector + an appointment selector (two modes: a note on the patient profile, or on ONE specific appointment of that patient); all notes linked platform-wide; the agenda hover shows the note if present.
- **Design decision the spec must make (recommended default):** unify onto ONE relation. `appointment_notes` is the closest fit but `appointment_id` is NOT NULL, so it cannot hold a patient-level note today. Recommended default: **make `appointment_notes.appointment_id` NULLABLE** (a note has `patient_id` always + optional `appointment_id` + optional `episode_id`), migrate/backfill existing `appointments.notes` and `patient_note_revisions` into it, and read every surface from this one table (patient profile = all of a patient's notes; agenda/Marcacoes = the appointment's notes; hover shows it if present). Preserve append-only history (never destructively drop `patient_note_revisions`; backfill then read-migrate). The alternative (keep both tables + a read-union view) is the fallback if the owner wants the two histories physically separate - register the choice as a Q if not obvious.
- **Reusable pieces for the build:** the patient selector is the `@osteojp/ui` `Combobox` + `searchPatientsAction` pattern (duplicated at `appointment-drawer.tsx:254`, `notas-rapidas.tsx:33`, `StartConsultation.tsx:51`, `patient-episode-fields.tsx:72`); the appointment-of-a-patient selector exists inline in `DeclaracaoDialog.tsx:112-121` (native select over `listPatientAppointments`). The spec should call for extracting a shared `PatientSelector` + `AppointmentSelector` rather than a fifth copy.
- **Invariants:** notes are append-only history (never silently mutate/erase); the PORTAL never exposes clinical/staff notes (guard-tested, W9-06 `notes-privacy.test.ts`) - the unified model must keep the portal `AppointmentView` note-free; audit + RLS + tenant_id on any new/changed table.

**Scope:** ONE committed doc `docs/design/SPEC-notes-unification.md` + any Q registration + no code. The only writes are the spec doc + the QUESTIONS entry.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-12-notes-spec`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Verify the ground truth read-only:** confirm the five stores, the three write paths, the unwritten `appointment_notes`, the portal note-free guard. Paste anchors.
3. **Author `docs/design/SPEC-notes-unification.md`:** the unified model (nullable-appointment `appointment_notes` as the default, with the read-union fallback named), the migration + backfill plan (from `appointments.notes` + `patient_note_revisions`), the read surfaces, the write surfaces (agenda drawer -> unified; Inicio block gains patient + appointment selectors, two modes), the shared `PatientSelector`/`AppointmentSelector` extraction, the append-only + portal-note-free + RLS invariants, and the build-gate list (the migration head it will consume; the isolation test).
4. **Register the model-choice Q** if the unify-onto-one vs keep-both decision is not obviously the default (recommended default = unify onto nullable `appointment_notes`, backfill, read-migrate).
5. **Gate (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green; `git diff --name-only origin/main` shows ONLY `docs/`.

## Field 3. Definition of done (machine-verifiable)
- **Spec PROOF:** `docs/design/SPEC-notes-unification.md` exists with the unified model, migration+backfill plan, read/write surfaces, selector extraction, invariants (append-only, portal-note-free, RLS/tenant_id), and the build-gate list. Paste the model section + the invariants.
- **Q PROOF:** the model-choice Q (unify vs keep-both) registered with a recommended default (or a note that the default is taken and why no Q is needed).
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/`. Paste it.
- **Gates green** (docs-only).

## Field 4. Verification (paste evidence)
The unified-model section, the migration+backfill plan, the read/write surface map, the invariants, the build-gate list, the Q (if any), the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **SPEC ONLY - NO BUILD:** no product code, no migration, no schema change; the doc adds design.
- **Notes are append-only history** - the spec's backfill READS the old stores and INSERTS into the unified one; it never proposes a destructive erase of `patient_note_revisions`.
- **The portal never exposes notes** - the unified model must keep the portal `AppointmentView` note-free (the W9-06 guard stays green).
- Plain hyphens; no emoji; no em/en dashes; pt-PT copy examples correct. **Never force-push / `--admin`.** No PII in examples.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The ground truth diverges from recon (e.g. `appointment_notes` already has a writer, or `appointment_id` is already nullable) - record it and adjust; HALT only if scope changes materially.
- Unifying would force a destructive migration of `patient_note_revisions` history - HALT to a Q; the append-only history must be preserved.

## Field 7. Report back
The unified-model section, the migration+backfill plan, the read/write map, the invariants, the build-gate list, the no-code diff, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-12 is OWNER-MERGE (SPEC doc).** Docs/spec set product direction; required checks + all three Vercel deploys green (checks API not banner) necessary; the owner reviews + merges. NOT `[SELF-MERGE-OK]`.
- **SPEC-FIRST:** the W12-13 build is GATED on this spec merged + the model-choice ruling. Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any destructive-history proposal.
