# Staff Platform — Plain-English Test Scenarios

> **Purpose:** This document captures the acceptance criteria for the top staff workflows as human-readable scenarios. Each scenario will become a Playwright spec; do not edit e2e test files directly — update this document and let the spec author translate it.
>
> **System under test:** `apps/web` (staff platform, `app.osteojp.pt`)
> **Seed data assumed:** The CI seeded DB includes at least two clinics (Linda-a-Velha, Castelo Branco), two therapists (`alice@osteojp.pt` / `bob@osteojp.pt`), one receptionist (`reception@osteojp.pt`), and a set of patients (see `packages/db/seed/`).
> **Timezone:** All times are in Europe/Lisbon (UTC+1 summer / UTC+0 winter).

---

## Table of Contents

1. [New Appointment](#1-new-appointment)
2. [Conflict Handling](#2-conflict-handling)
3. [Recurring Appointment](#3-recurring-appointment)
4. [Patient Search](#4-patient-search)
5. [Patient Merge](#5-patient-merge)
6. [Clinical Record Sign-and-Lock](#6-clinical-record-sign-and-lock)
7. [Invoicing](#7-invoicing)

---

## 1. New Appointment

### Scenario 1.1 — Happy path: receptionist books a new appointment for an existing patient

**Given:** The user is logged in as `reception@osteojp.pt` (role: Rececionista) and is on the Agenda page for the current week.

**When:**
1. The user clicks "+ Nova Marcação".
2. Searches for patient "João Silva" by typing "João" and selects him from the dropdown.
3. Selects service "Osteopatia" — the Duration field auto-fills to 45 min.
4. Selects therapist "Alice Ferreira".
5. Selects clinic "Linda-a-Velha".
6. Selects room "Gabinete 1".
7. Sets date to the next Monday at 10:00.
8. Leaves Notes blank.
9. Clicks "Guardar".

**Then:**
- The drawer closes without errors.
- A new appointment block appears on the Agenda at Monday 10:00 in the correct therapist lane.
- The appointment card shows João Silva's name, "Osteopatia", and "Gabinete 1".
- The patient's profile → Episódios list is not changed (no episode is auto-created by booking alone).

**Notes:** Verify the API call is `POST /api/appointments` and returns 201. The 45-minute default duration for Osteopatia is a seed-data constant — confirm this in `packages/db/seed/services.ts` before spec authoring.

---

### Scenario 1.2 — Booking for a new (just-registered) patient

**Given:** The user is logged in as `reception@osteojp.pt`. Patient "Mariana Costa" does not yet exist in the system.

**When:**
1. The user navigates to Pacientes → "Novo Utente".
2. Fills in: Nome "Mariana Costa", Data de Nascimento "15/03/1990", Sexo "Feminino", Telemóvel "912 345 678".
3. Clicks "Criar Utente".
4. The user navigates to Agenda → "+ Nova Marcação".
5. Searches for "Mariana" — Mariana Costa appears in the dropdown.
6. Completes the booking (service, therapist, date/time) and clicks "Guardar".

**Then:**
- The patient record is created and her profile page is accessible.
- The appointment is booked successfully and appears in the Agenda.

**Notes:** Minimum required fields for patient creation are name, date of birth, and sex (see `docs/help-text-staff.md §1` for validation rules).

---

### Scenario 1.3 — Required field validation prevents saving

**Given:** The user is logged in and has opened "+ Nova Marcação".

**When:** The user clicks "Guardar" without filling in any fields.

**Then:**
- The form stays open.
- Inline validation errors appear on the required fields: Paciente, Terapeuta, Clínica, Data, and Hora.
- No API call is made.

**Notes:** "Sala" and "Serviço" are optional; they must NOT show validation errors when left blank.

---

### Scenario 1.4 — Therapist field is required

**Given:** The user has filled in Paciente, Serviço, Clínica, Data, and Hora but has NOT selected a Terapeuta.

**When:** The user clicks "Guardar".

**Then:**
- A validation error appears on the Terapeuta field ("Campo obrigatório" or equivalent).
- The appointment is not saved.

---

### Scenario 1.5 — Duration defaults to service default, can be overridden

**Given:** The user has selected service "Fisioterapia" (seed default: 60 min).

**When:**
1. The user observes that Duration auto-fills to 60.
2. The user changes Duration to 30.
3. Completes all other required fields and clicks "Guardar".

**Then:**
- The appointment is saved with a 30-minute duration (end time = start + 30 min).
- The Agenda block is shorter than a standard Fisioterapia slot.
- The global default for Fisioterapia is unchanged (still 60 min for the next booking).

---

## 2. Conflict Handling

### Scenario 2.1 — Happy path: system detects double-booking of a room and warns the user

**Given:** Room "Gabinete 1" at clinic "Linda-a-Velha" already has an appointment on Tuesday at 14:00–14:45.

**When:**
1. The user opens "+ Nova Marcação".
2. Selects any patient, service "Osteopatia", therapist "Bob Sousa", clinic "Linda-a-Velha", room "Gabinete 1".
3. Sets date to Tuesday at 14:15 (overlapping slot).
4. Clicks "Guardar".

**Then:**
- A conflict warning is displayed before the appointment is saved. The warning names the conflicting appointment (patient name, time range).
- The user is offered the choice to either pick a different time or save anyway (override).
- If the user chooses a different time and re-submits, the appointment is saved without warnings.

**Notes:** Conflict detection is room-scoped within a clinic; same room name at a different clinic is treated as a distinct resource. See `docs/help-text-staff.md §1 Sala`.

---

### Scenario 2.2 — Therapist double-booking warning

**Given:** Therapist "Alice Ferreira" is already booked Wednesday 11:00–11:45.

**When:**
1. The user opens "+ Nova Marcação".
2. Selects any patient, service, therapist "Alice Ferreira", clinic "Linda-a-Velha".
3. Sets date to Wednesday at 11:20.
4. Clicks "Guardar".

**Then:**
- A conflict warning is displayed naming Alice Ferreira's existing appointment.
- The user can override (save anyway) or change the time.

---

### Scenario 2.3 — No conflict when room is not specified

**Given:** Room "Gabinete 1" at clinic "Linda-a-Velha" is fully booked on Thursday.

**When:**
1. The user opens "+ Nova Marcação" and books for any patient at Thursday at any time.
2. The user leaves the Sala field blank.
3. Clicks "Guardar".

**Then:**
- No room-conflict warning is shown (the system only checks rooms when one is explicitly selected).
- The appointment saves successfully.

---

### Scenario 2.4 — Resolving a conflict by rescheduling an existing appointment

**Given:** Two appointments overlap for the same therapist. The user needs to move one.

**When:**
1. The user clicks on the conflicting appointment in the Agenda.
2. Clicks "Remarcar".
3. Selects a new date/time that is clear.
4. Clicks "Confirmar".

**Then:**
- The appointment block moves to the new slot in the Agenda.
- No conflict warnings appear for the new slot.
- The patient does not receive a new reminder until the reminder scheduler runs (tested separately).

**Notes:** "Remarcar" replaces "Reagendar" per brand-voice §3.1.

---

### Scenario 2.5 — Cancelling an appointment does not delete it

**Given:** An existing appointment exists on Friday at 16:00.

**When:**
1. The user clicks on the appointment in the Agenda.
2. Clicks "Cancelar" and confirms.

**Then:**
- The appointment block is removed from the active Agenda view.
- The appointment is still visible in the patient's history (Episódios or appointment history list) with status "Cancelada".
- The record is NOT deleted from the database.

---

## 3. Recurring Appointment

### Scenario 3.1 — Happy path: receptionist sets up a weekly recurring series

**Given:** The user is logged in as `reception@osteojp.pt` and opens "+ Nova Marcação".

**When:**
1. Selects patient "João Silva", service "Osteopatia", therapist "Alice Ferreira", clinic "Linda-a-Velha".
2. Sets start date to next Monday at 10:00.
3. Enables the "Repetir" toggle.
4. Selects frequency "Semanal" and sets end after "8 sessões".
5. Clicks "Guardar".

**Then:**
- 8 appointment records are created (one per week, same time and therapist).
- All 8 appear in the Agenda on their respective Mondays.
- The first appointment block is visually marked as a recurring series (e.g., a repeat icon).

**Notes:** Confirm the recurring series endpoint and payload shape in the API spec (`docs/api/`). Verify that the 8 slots don't cross any public holidays that would auto-block the calendar.

---

### Scenario 3.2 — Conflict in one slot of a recurring series

**Given:** The same therapist already has an appointment on the 3rd Monday of the target series at 10:00.

**When:** The user tries to create the same 8-session weekly series as in 3.1.

**Then:**
- The system detects the conflict on slot 3 and warns the user before saving.
- The warning lists the conflicting date and the existing appointment.
- The user is offered options: skip the conflicting slot (creating 7 appointments), override it, or cancel the whole operation.

---

### Scenario 3.3 — Editing a single occurrence in a recurring series

**Given:** An 8-session recurring series exists. The user needs to move the 4th session to a different time.

**When:**
1. The user clicks on the 4th appointment in the Agenda.
2. Clicks "Remarcar".
3. A prompt asks: "Alterar esta marcação ou toda a série?" — the user selects "Apenas esta marcação".
4. Changes the time to 11:00 and clicks "Confirmar".

**Then:**
- Only the 4th appointment is moved to 11:00.
- Sessions 1–3 and 5–8 remain unchanged.
- The 4th appointment is visually distinguished (e.g., "Modificada" label) in the Agenda.

---

### Scenario 3.4 — Cancelling all remaining occurrences in a series

**Given:** The same 8-session series exists and 2 sessions have already occurred.

**When:**
1. The user clicks on session 4 (the next upcoming one).
2. Clicks "Cancelar".
3. A prompt asks: "Cancelar esta marcação ou todas as futuras?" — the user selects "Esta e todas as futuras".
4. Confirms the cancellation.

**Then:**
- Sessions 4–8 are cancelled (status "Cancelada").
- Sessions 1–3 remain in history with their original statuses.
- The Agenda no longer shows sessions 4–8.

---

## 4. Patient Search

### Scenario 4.1 — Happy path: search by partial first name

**Given:** The user is on the Pacientes page. Patient "Maria José Santos" exists in the database.

**When:** The user types "Maria" in the search bar.

**Then:**
- Results appear in real time (debounced, not requiring Enter).
- "Maria José Santos" is in the results list.
- Each result card shows: full name, date of birth, and phone number.

**Notes:** The search uses trigram indexes (`phone_digits` generated column + `pg_trgm`). Minimum 2 characters before search fires (see `docs/help-text-staff.md §Paciente`).

---

### Scenario 4.2 — Search by date of birth

**Given:** Patient "Carlos Maia" has date of birth 12/07/1975. Another patient "Carlos Ferreira" has a different DOB.

**When:** The user types "12/07/1975" or "1975-07-12" in the search bar.

**Then:**
- Only "Carlos Maia" (or all patients with that DOB) appears in results.
- "Carlos Ferreira" does not appear.

---

### Scenario 4.3 — Search by phone number (partial)

**Given:** Patient "Ana Rodrigues" has phone "912 345 678".

**When:** The user types "345 678" (partial number, no spaces) in the search bar.

**Then:**
- "Ana Rodrigues" appears in results.
- The search is digit-only (spaces and formatting are stripped before matching).

**Notes:** The `phone_digits` generated column strips all non-digits. Verify the search hits this column via `EXPLAIN` in the DB-gated tests.

---

### Scenario 4.4 — Search returns no results

**Given:** No patient named "Zephyrine" exists in the seed database.

**When:** The user types "Zephyrine" in the search bar.

**Then:**
- An empty-state message is shown (e.g., "Nenhum paciente encontrado").
- No error is thrown.
- A "Novo Utente" call-to-action is visible so staff can immediately register the patient.

---

### Scenario 4.5 — Search respects tenant isolation (RLS)

**Given:** Two tenants exist in the seeded DB: Tenant A and Tenant B. The logged-in user belongs to Tenant A.

**When:** The user searches for a patient who exists only in Tenant B.

**Then:**
- No results are returned.
- No error is shown (the query simply returns 0 rows).

**Notes:** This is a security-critical scenario — must be covered by the DB-gated RLS test suite as well, not only Playwright.

---

## 5. Patient Merge

### Scenario 5.1 — Happy path: merge two duplicate patient records

**Given:** Two records exist for the same person: "Maria Silva" (ID: primary) and "M. Silva" (ID: duplicate). Both have appointment history and at least one clinical record.

**When:**
1. The user navigates to the "Maria Silva" profile page.
2. Clicks "Fundir duplicado" (Merge duplicate).
3. Searches for "M. Silva" and selects her as the duplicate.
4. A preview panel shows: combined appointment count, combined clinical records, fields that will be kept from the primary vs. overwritten from the duplicate.
5. The user confirms the merge.

**Then:**
- The duplicate record ("M. Silva") is soft-deleted (not physically removed).
- All appointments previously under "M. Silva" are now linked to "Maria Silva".
- All clinical records previously under "M. Silva" are now accessible from "Maria Silva"'s profile.
- An audit log entry records the merge: who performed it, timestamp, IDs of both records.
- Navigating to the old "M. Silva" URL redirects to "Maria Silva"'s profile (or shows a "merged" notice).

**Notes:** See staff cheat sheet: "Não apagues utentes duplicados — usa 'Fundir duplicado'." The merge is irreversible via the UI; confirm the audit log check in the DB-gated suite.

---

### Scenario 5.2 — Merge is blocked when the duplicate has an active (future) appointment

**Given:** The duplicate record "M. Silva" has a future appointment in 3 days.

**When:** The user attempts to merge "M. Silva" into "Maria Silva" as in 5.1.

**Then:**
- A warning is shown listing the upcoming appointment and its date.
- The user is told to first reassign or cancel the appointment before merging, OR is offered an option to transfer the appointment as part of the merge.
- If the warning is dismissed without action, the merge does not proceed.

**Notes:** Determine from the codebase whether the system auto-transfers or blocks; update scenario accordingly.

---

### Scenario 5.3 — Cannot merge a patient with herself

**Given:** The user opens the merge flow on "Maria Silva"'s profile.

**When:** The user searches for the duplicate and selects "Maria Silva" (same record).

**Then:**
- The system rejects the selection with an inline error ("Não é possível fundir um paciente consigo mesmo").
- The merge button remains disabled.

---

### Scenario 5.4 — Only admin-level roles can merge

**Given:** The user is logged in as a Terapeuta (not Rececionista or Administrador).

**When:** The user navigates to any patient profile.

**Then:**
- The "Fundir duplicado" button is either not visible or is disabled with a tooltip explaining the required role.
- Navigating directly to the merge URL returns a 403 or redirects to an error page.

---

## 6. Clinical Record Sign-and-Lock

### Scenario 6.1 — Happy path: clinician writes and signs a clinical note

**Given:** The user is logged in as `alice@osteojp.pt` (role: Terapeuta). Patient "João Silva" has an open episode with no signed clinical records.

**When:**
1. The user opens João Silva's profile → Episódios → the open episode.
2. Clicks "+ Nova Ficha neste Episódio".
3. Selects the "Osteopatia v1" form template.
4. Fills in all sections: anamnesis, body chart annotation, treatment plan, observations.
5. Clicks "Guardar" (draft is saved; record is not locked).
6. Reviews the saved draft and clicks "Assinar e Bloquear".
7. A confirmation dialog asks: "Confirmar assinatura? Esta ação é irreversível."
8. The user clicks "Confirmar".

**Then:**
- The clinical record status changes to "Assinada" (or "Bloqueada").
- The form fields are no longer editable; all inputs become read-only.
- A signature block is displayed showing the clinician's name, professional credential, and timestamp.
- The "Assinar e Bloquear" button is replaced by a "Descarregar PDF" button.
- An audit log entry is created recording the sign action, clinician ID, and timestamp.

**Notes:** "Ficha assinada = bloqueada para sempre — verifica antes de assinar" (staff cheat sheet). The sign-and-lock action must be captured in the audit_log table (DB-gated test should verify this row).

---

### Scenario 6.2 — Draft save preserves partial data

**Given:** The user has opened a new clinical record form and filled in only the anamnesis section.

**When:** The user clicks "Guardar" (draft save) and then navigates away.

**Then:**
- The record is saved with status "Rascunho".
- When the user returns to the episode, the draft record is listed and the previously entered anamnesis data is intact.
- The body chart and other empty sections show their empty defaults.

---

### Scenario 6.3 — Signed record cannot be edited

**Given:** A clinical record for "João Silva" is in status "Assinada".

**When:**
1. The user opens the signed record.
2. Attempts to type in any field.
3. Attempts to click "Guardar" or "Assinar e Bloquear".

**Then:**
- All form fields are read-only; keyboard input has no effect.
- No save or sign button is present.
- A notice is displayed: "Esta ficha foi assinada e não pode ser alterada." (or equivalent).

---

### Scenario 6.4 — Only the assigned therapist (or admin) can sign

**Given:** Clinical record belongs to an episode under therapist "Alice Ferreira". User "Bob Sousa" (also a Terapeuta) is logged in.

**When:** Bob navigates to Alice's patient's clinical record draft.

**Then:**
- Bob can view the record in read-only mode.
- The "Assinar e Bloquear" button is either absent or disabled for Bob.
- Only the record's assigned therapist or an Administrador can sign.

**Notes:** Confirm the permission matrix in `packages/auth/permissions.ts`.

---

### Scenario 6.5 — PDF download of a signed record

**Given:** A clinical record is in status "Assinada".

**When:** The user clicks "Descarregar PDF".

**Then:**
- A PDF file is downloaded to the user's browser.
- The PDF contains: patient name, DOB, episode dates, all filled form fields, the clinician's signature block, and the clinic's letterhead.
- The filename follows the pattern `ficha-[patient-name]-[YYYY-MM-DD].pdf`.

**Notes:** Visual PDF fidelity is out of scope for Playwright; verify the download triggers (status 200, content-type `application/pdf`).

---

## 7. Invoicing

### Scenario 7.1 — Happy path: generate an invoice for a completed appointment

**Given:** Appointment for "João Silva" (service "Osteopatia", price €45.00) is in status "Concluída". The user is logged in as `reception@osteojp.pt`.

**When:**
1. The user opens the appointment from the Agenda or from João Silva's profile.
2. Clicks "Gerar Fatura".
3. A preview shows: patient name, service, date, amount (€45.00), VAT line (0% — healthcare exemption), total (€45.00).
4. The user confirms and clicks "Emitir".

**Then:**
- The invoice is submitted to InvoiceXpress via the API.
- The invoice is assigned an InvoiceXpress document number (e.g., "FT 2026/42").
- Invoice status on the appointment/patient record changes to "Faturada".
- A success toast is shown with the document number.
- The user can download the invoice PDF.

**Notes:** CI uses the InvoiceXpress sandbox. Do not test against the production InvoiceXpress endpoint. The clinic is VAT-exempt for healthcare services (0% IVA).

---

### Scenario 7.2 — Invoice is pre-filled with appointment data

**Given:** The same appointment as 7.1 but the user checks the invoice preview before confirming.

**When:** The user clicks "Gerar Fatura" and inspects the pre-filled preview.

**Then:**
- Patient name matches the appointment's patient exactly.
- Service description matches the booked service name ("Osteopatia").
- Date matches the appointment date (not today's date unless they coincide).
- Amount matches the service price configured in Administração → Serviços.
- No manual editing of these fields is required.

---

### Scenario 7.3 — Cannot generate invoice for a cancelled appointment

**Given:** An appointment with status "Cancelada" exists for "Ana Rodrigues".

**When:** The user opens the cancelled appointment.

**Then:**
- The "Gerar Fatura" button is absent or disabled.
- A notice explains that invoices can only be generated for completed appointments.

---

### Scenario 7.4 — Cannot generate a duplicate invoice

**Given:** Invoice has already been generated for appointment ID X (status "Faturada").

**When:** The user opens the same appointment and attempts to click "Gerar Fatura".

**Then:**
- The "Gerar Fatura" button is either absent or disabled.
- The existing invoice document number is displayed instead.
- No second submission is made to InvoiceXpress.

---

### Scenario 7.5 — Invoice generation fails gracefully (InvoiceXpress error)

**Given:** The InvoiceXpress sandbox is configured to return a 500 error for the next request (or the sandbox key is intentionally wrong for this test).

**When:** The user clicks "Emitir" to generate an invoice.

**Then:**
- An error toast is shown: e.g., "Não foi possível emitir a fatura. Tente novamente ou contacte a administração."
- The appointment status does NOT change to "Faturada".
- No partial invoice record is stored.
- The user can retry by clicking "Gerar Fatura" again.

**Notes:** Mock the InvoiceXpress endpoint at the network layer in the Playwright spec (e.g., `page.route()`).

---

### Scenario 7.6 — Invoice PDF download

**Given:** Invoice for appointment X has been generated (status "Faturada").

**When:** The user clicks "Descarregar Fatura".

**Then:**
- A PDF is downloaded.
- Content-type is `application/pdf`.
- Filename follows the InvoiceXpress document number pattern (e.g., `FT-2026-42.pdf`).

---

### Scenario 7.7 — Only receptionist and admin can generate invoices

**Given:** The user is logged in as a Terapeuta (`alice@osteojp.pt`).

**When:** The user opens a completed appointment.

**Then:**
- The "Gerar Fatura" button is absent or disabled.
- The therapist can view the invoice status but cannot issue invoices.

**Notes:** Confirm the role check in `packages/auth/permissions.ts`.
