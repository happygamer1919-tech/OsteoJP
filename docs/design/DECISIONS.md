
## 2026-06-30 - Wave 01 locked calls
- Wave 01 work split on the migration fault line: schema/lifecycle = Ivan, pure UI/nav/content = Max, mixed = schema-first (Ivan) then UI (Max).
- Dependencies are one-directional and front-loaded: data lands green on main, then UI consumes. Max never blocks Ivan.
- Migrations ordered cheap-to-expensive, unblocking the most Max items first: patient migration first, lifecycle/batch last.
- "Fichas Clinicas" becomes a tab inside the patient profile, removed as a top-level nav section.
- Patient address reduced to city + region; full street address dropped (pending confirm no fiscal/declaration dependency).
- Per-visit appointment notes gate appointment completion; designed together with the Fichas relocation so note and ficha are not disconnected.
- Confirmation state and appointment lifecycle status are separate axes, never collapsed.
- Availability logic is shared between the new-appointment panel, the batch engine, and multi-therapist conflict reporting; built once.
- KPI event schema defined and deployed now, before the dashboard; capture gross, apply VAT at report time.
- Wave docs live at docs/design/wave-01/; DECISIONS.md and QUESTIONS.md at docs/design/ root, append-only.

## 2026-06-30 - Wave 01 audit follow-up
- Appointment status transitions folded into the event layer as appointment_status_changed (appointment_id, from_status, to_status, actor, timestamp). No standalone transition table; the event log is both transition history and KPI feed. Status is overwritten in place today with no old->new trace.
- Therapist-service mapping is greenfield: no existing therapist<->service relationship. Created, not extended.
- Next Wave 01 migration number is 0022 (migrations extend to 0021, not 0019).

## 2026-06-30 - Migration 0022 scope
- 0022 scoped to profession + region only (both text, nullable); city was NOT added because it already existed on patients (text, nullable, schema.ts + STATE.md); patient_notes append-relation deferred to a later loop pending JP's audit-trail ruling (patients.notes single mutable field already exists and is sufficient for Wave 01).
