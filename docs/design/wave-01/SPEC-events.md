# SPEC: Event Tracking for KPIs (Wave 01)

Status: scoped, not built. Owner: Ivan. Reference clinic: https://osteojp.pt/

Why now: the KPI dashboard ships later, but KPIs are only as good as the history you start recording from. Define and deploy the event schema now so nothing is lost between now and when the dashboard exists. This is the highest-leverage and easiest-to-under-spec item in the wave.

## What the owner must eventually see
- Revenue per therapist.
- Services delivered per therapist (count, by type).
- Finance views: invoiced totals, personal and per-team.
- All filterable (date range, location, therapist, service).

## Capture model
An append-only event log capturing relevant patient, therapist, and finance events as they happen. Each event carries enough dimension to reconstruct the KPIs above without back-filling.

Minimum dimensions per event (refine in build):
- event type (e.g. appointment_completed, invoice_issued, service_delivered)
- tenant_id (server-derived, never from payload)
- therapist_id
- patient_id (where applicable)
- service_id / service_type (where applicable)
- location_id
- monetary amount, gross (apply VAT treatment at report time, not capture time; VAT still with accountant, see QUESTIONS.md)
- timestamp
- source reference (appointment id, invoice id)

## Principles
- Capture gross now; apply VAT/tax treatment at report time. Do not bake VAT into the event, since the treatment is unresolved (accountant).
- Append-only. Events are facts, never edited.
- Server-derives tenant_id and identity. Never trust payload for scoping.
- Schema defined deliberately before first capture, so later KPI queries do not need a migration to add a missing dimension.

## Done
- Event table migrated.
- Write hooks on the key transitions (appointment completed, invoice issued, etc.) emit events.
- A throwaway query can already produce revenue-per-therapist and services-per-therapist from captured events, proving the schema supports the dashboard before the dashboard is built.
