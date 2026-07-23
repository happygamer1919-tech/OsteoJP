# SPEC - Notes unification

Status: **DESIGN source of truth (W12-12). No product code, no migration.** This spec gates the W12-13 build. It defines ONE note model so a note added in the Agenda is reflected in Marcacoes AND the patient profile, and the Inicio "Notas rapidas" block can attach a note to a patient profile OR to one specific appointment of that patient.

## 1. The problem: five stores, three writers, an unwritten bridge

Notes are fragmented across five stores; three surfaces write three different ones, and the one table that links a patient + an appointment has no writer. That disconnect is the root cause of "a note I add in the Agenda does not show on the patient profile."

| Store | Shape | Written by | Read by |
|-------|-------|-----------|---------|
| `appointments.notes` (`schema.ts:597`, text) | one mutable text per appointment | Agenda drawer "Notas" (`appointment-drawer.tsx:1028-1030` -> create/update) | agenda + Marcacoes hover (`appointment-hover-card.tsx`, via `AgendaAppointment.notes` <- `data.ts:101`). NOT the profile. |
| `appointment_notes` (`schema.ts:841-873`, 0026) | append-only; `appointment_id` NOT NULL + `patient_id` NOT NULL + optional `episode_id` + `author_user_id` NOT NULL + `body` | **NO WRITER anywhere** (verified: no INSERT). Only READ for the "Sem nota" chip (`hasNote`, `data.ts`) + analytics. | the "Sem nota" chip (so it is always "Sem nota") |
| `patient_note_revisions` (`schema.ts:891-911`, 0030) | append-only patient history; `patient_id` NOT NULL, NO appointment link; `author_user_id` NULLABLE (system/backfill) | Inicio "Notas rapidas" (`notas-rapidas.tsx`) + profile Notas composer (`notes-composer.tsx`) via `appendPatientNoteAction` (`patients/actions.ts:397-414`) | profile Notas tab |
| `patients.notes` (`schema.ts:466`, text) | legacy | nothing (backfilled into `patient_note_revisions` rev 1) | nothing |
| `quick_notes` (`schema.ts:1234-1253`) | retired per-staff scratchpad | orphaned | nothing |

`appointment_notes` is the ONLY table modelling "a note on a specific appointment of a patient" - and it is the one with no writer. That is the bridge to build.

## 2. Rodica's ask

- A note added in the Agenda must reflect in Marcacoes AND the patient profile.
- The Inicio notes block gains a patient selector + an appointment selector (two modes: a note on the patient profile, or on ONE specific appointment of that patient).
- All notes linked platform-wide; the agenda hover shows the note if present.

## 3. Unified model (recommended default)

**Unify onto ONE relation: `appointment_notes`, with `appointment_id` made NULLABLE.**

A note has:
- `patient_id` - ALWAYS (every note belongs to a patient).
- `appointment_id` - OPTIONAL. Set => the note documents that specific visit; NULL => a patient-level note.
- `episode_id` - OPTIONAL (ficha continuity, unchanged).
- `author_user_id` - made NULLABLE (to hold backfilled `patient_note_revisions` rows whose author is NULL/system; an app-written note always carries the staff user).
- `body`, `created_at` - unchanged. Append-only (SELECT + INSERT policy only; UPDATE/DELETE denied), as today.

This single table then answers every read:
- **Patient profile Notas** = every note for the patient (`patient_id = X`, newest-first) - both patient-level and per-appointment.
- **Agenda / Marcacoes** (card + hover, "Sem nota" chip) = the appointment's notes (`appointment_id = A`).
- **Ficha continuity** = `episode_id` as today.

### 3.1 Fallback (only if the owner wants the two histories physically separate)
Keep `appointment_notes` AND `patient_note_revisions` as-is and read every surface from a UNION view (patient notes = both; appointment notes = `appointment_notes` only). This avoids migrating `patient_note_revisions` but leaves two append-only tables + a read-union to maintain. **Recommended default is the single-table unify (3);** the model choice is registered as Q-W12-07 (below) - if the owner does not object, the default stands.

### 3.2 The agenda-drawer edit-in-place vs append-only (note)
The Agenda drawer today edits a single `appointments.notes` text in place. The unified model is append-only. Under (3) the drawer's "Notas" save APPENDS a new `appointment_notes` row (a revision); every surface shows the LATEST note for the appointment; prior notes stay as history. This is a small UX shift (edit becomes add/append), consistent with the append-only invariant and with how `patient_note_revisions` already treats edits. If the owner insists on strict single-mutable-note-per-appointment, that conflicts with append-only history - flagged under Q-W12-07.

## 4. Migration + backfill plan (W12-13, non-destructive)

1. **ALTER `appointment_notes`:** `appointment_id` -> NULLABLE; `author_user_id` -> NULLABLE. Keep tenant_id, the append-only policy, and all indexes; add a partial index on `(tenant_id, patient_id, created_at desc)` for the profile read. RLS + an isolation test ship in the same PR (CLAUDE.md).
2. **Backfill (READ old stores, INSERT into the unified one - never drop):**
   - For each appointment with a non-empty `appointments.notes`: INSERT `appointment_notes(appointment_id, patient_id = appointment.patient_id, author_user_id = appointment.created_by, body = notes, created_at = appointment.created_at)`.
   - For each `patient_note_revisions` row: INSERT `appointment_notes(appointment_id = NULL, patient_id, author_user_id, body = content, created_at)` preserving order (so the patient history is intact).
3. **Read-migrate the surfaces** to `appointment_notes` (profile, agenda/Marcacoes hover, "Sem nota" chip). `appointments.notes` and `patient_note_revisions` stay in place (read-only legacy) until the migration is verified; a later loop may retire them. **Never destructively erase `patient_note_revisions`** (append-only history; loop Field 6).
4. Idempotent backfill (re-runnable): dedupe by a natural key or a one-shot guard so a re-run does not double-insert.

## 5. Write surfaces (W12-13)

- **Agenda drawer "Notas"** -> append to `appointment_notes` (`appointment_id` set, `patient_id` from the appointment, author = current staff).
- **Inicio "Notas rapidas"** -> gains a patient selector + an appointment selector, two modes:
  - *Patient mode:* append a patient-level note (`appointment_id = NULL`).
  - *Appointment mode:* pick one of the selected patient's appointments -> append an appointment note (`appointment_id` set).
- **Profile Notas composer** -> append a patient-level note (`appointment_id = NULL`).

## 6. Shared selector extraction (W12-13)

The patient selector (`@osteojp/ui` Combobox + `searchPatientsAction`) is duplicated at `appointment-drawer.tsx:254`, `notas-rapidas.tsx:33`, `StartConsultation.tsx:51`, `patient-episode-fields.tsx:72`. The appointment-of-a-patient selector exists inline in `DeclaracaoDialog.tsx:112-121` (native select over `listPatientAppointments`). W12-13 extracts a shared **`PatientSelector`** + **`AppointmentSelector`** and reuses them in the Inicio block (and, opportunistically, replaces the duplicates) rather than adding a fifth copy.

## 7. Invariants (must hold in the build)

- **Append-only history.** The backfill READS old stores and INSERTS into the unified one; it never erases `patient_note_revisions`. Note edits create new revisions; nothing is silently mutated or deleted.
- **Portal never exposes notes.** The unified model keeps the portal `AppointmentView` note-free; the W9-06 guard (`apps/api/lib/appointments/notes-privacy.test.ts`) stays green. The portal never queries `appointment_notes`.
- **RLS + tenant_id** on the (changed) table; **audit** on note writes; **no PII** in logs.

## 8. Build-gate list (what W12-13 needs)

1. The model-choice ruling (Q-W12-07: single-table unify [default] vs keep-both-with-view; and the edit-in-place-vs-append note).
2. The migration (nullable `appointment_id` + `author_user_id`, indexes, RLS policy carried, isolation test in-PR) - one migration in flight; CYAN pre-merge audit (migration + RLS).
3. The backfill (idempotent, non-destructive) with per-count before/after.
4. The shared `PatientSelector` / `AppointmentSelector`.
5. The read-surface re-point (profile, hover, "Sem nota" chip) + the drawer/Inicio write paths.
6. Owner visual gate (add a note in Agenda -> see it on the profile; Inicio two modes).

W12-13 is OWNER-MERGE (migration + backfill) with an OWNER VISUAL GATE surface; it likely splits (migration+backfill; selectors; write paths; read re-point).

## 9. Open question

- **Q-W12-07** (registered in `docs/design/QUESTIONS.md`): unify onto a single nullable-`appointment_id` `appointment_notes` (recommended default) vs keep `patient_note_revisions` separate behind a read-union view; plus the edit-in-place-vs-append note for the agenda drawer. Recommended default: single-table unify, append-only, non-destructive backfill.

## 10. Cross-references

- `packages/db/src/schema.ts:466,597,841-911,1234-1253` - the five stores.
- `apps/web/lib/patients/actions.ts:397-414` - `appendPatientNoteAction` (the `patient_note_revisions` writer).
- `apps/api/lib/appointments/notes-privacy.test.ts` - the portal note-free guard.
- W12-13 - the build gated on this spec + the Q-W12-07 ruling.
