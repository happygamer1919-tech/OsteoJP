# SPEC: Appointments (Wave 01)

Status: scoped, not built. Owner: Ivan. Reference clinic: https://osteojp.pt/

Covers four coupled changes that share the appointment model and must stay coherent: confirmation state, gated completion + per-visit notes, multi-therapist booking, batch scheduling. Plus the availability query that feeds Max's panel.

## 1. Confirmation state
What it does: mirrors Fisiozero. An automatic message goes to the patient 1 day before or same-day morning asking them to confirm arrival. Patient confirms or declines. State shows on the appointment preview as green (confirmed) or red (declined).
Data model: confirmation state on the appointment (e.g. pending / confirmed / declined) plus timestamp and channel of the inbound response. Separate axis from appointment lifecycle status. Do not collapse into lifecycle status.
Send side: Stream E (reminders) triggers the message. Inbound capture updates the state.
Done: column + transitions migrated; reminder triggers send; inbound response writes state; preview reads state. Verifiable by firing a reminder and recording a confirm and a decline.

## 2. Gated completion + per-visit notes
What it does: the ficha is created at the start of care and continued at each visit. Therapists add notes per appointment. An appointment can be marked completed only after a note is attached.
Data model: per-visit note relation tied to appointment and patient. Completion guard that blocks "completed" with no note. Must be designed together with the Fichas-as-tab relocation (SPEC-patients) so the per-visit note and the ficha are not two disconnected things.
Open question (JP): is the gate a hard block or a soft warning. See QUESTIONS.md.
Done: note relation migrated; completion transition rejected without a note (or warns, per JP ruling); note surfaces in patient profile appointment history.

## 3. Multi-therapist booking
What it does: create two appointments with two different therapists for one patient in a single tab.
Data model: appointment creation path accepts multiple therapist/service/slot rows in one transaction. Possible booking-group concept to relate them. All-or-nothing or partial per product decision (default: each appointment independent, both attempted, failures reported like batch).
Done: two appointments created in one flow; conflicts on either reported clearly.

## 4. Batch scheduling engine
What it does: book a package across repeating slots, e.g. next 7 Thursdays at 09:00 for one patient. Book every free slot, skip busy ones, report back precisely which failed, why, and a recommended closest alternative time per failed slot.
Data model: server-side engine takes a recurrence rule, resolves slots, checks availability, books free ones, returns structured failures (busy date + hour + nearest free alternative).
UI (Max): failure pop-up listing busy date/hour, with edit-and-rebook from the pop-up.
Done: given a rule producing N slots with K busy, engine books N-K and returns K structured failures with alternatives. Verifiable with a seeded busy calendar.

## 5. Availability query (feeds Max panel)
What it does: given date (or week) and therapist, return booked vs free slots. Powers the new-appointment availability panel and the batch engine's conflict check (shared logic).
Done: query returns accurate free/busy for a therapist over a range; panel and batch engine both consume it.

## 6. Therapist-service mapping (greenfield)
Per the 2026-06-30 audit, no therapist-to-service relationship exists (no join table, array
column, or FK; no dedicated therapist table either, a care-deliverer is a users row with role
therapist). Created from zero, not extended. A tenant-scoped relation (user_id <-> service_id)
lets selecting a therapist resolve the service for auto-select. Admin-managed.
Done: relation migrated; selecting a therapist returns their service(s); Max wires auto-select.

## Cross-cutting
- Confirmation state and lifecycle status are separate axes.
- Availability logic is shared between the panel, batch engine, and multi-therapist conflict reporting. Build once.
