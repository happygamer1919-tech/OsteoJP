# Patient booking — Wave B follow-ups

Notes deferred from the Wave A patient appointments domain (`apps/api/lib/appointments`).
Each is intentionally NOT done this wave (no migration, use existing schema only,
do not modify the staff scheduling module / apps/web). Recorded so they are not lost.

## 1. Booking provenance column (schema)
`appointments.created_by` is an FK to `users.id`; a patient is a distinct principal
with **no** `users` row, so patient-booked rows set `created_by = null`. There is no
column that records "booked by the patient via the portal".

- **Wave B:** add a provenance signal (e.g. `booked_via text` / `created_by_patient_id uuid`
  referencing `patients.id`) in a migration, and stamp it on patient bookings.
- **This wave:** inferred/deferred — `created_by` is null; the booking is still fully
  tenant- and patient-scoped from the verified principal.

## 2. Room assignment (schema + logic)
`appointments.room` is free text and there is no room catalog. Patient bookings leave
`room = null`, so no room is reserved and a room cannot be double-booked. Therapist
double-booking is fully prevented (appointment-overlap + time_off conflict checks).

- **Wave B:** model rooms per location and auto-assign a free room at booking, extending
  conflict detection to the room dimension for patient bookings (staff scheduling already
  has room-conflict detection in Stream B).
- **This wave:** deferred — therapist conflict is the hard guard; room is null.

## 3. Share Stream B scheduling logic via a package (architecture)
Conflict detection + `evaluateAvailability` live in `apps/web/lib/scheduling` (the staff
module, which must not be modified and cannot be imported across apps). `apps/api`
faithfully RE-STATES the same conflict rule (half-open overlap, cancelled excluded,
therapist + time_off + availability-template coverage) in `store.ts` rather than forking
the TS.

- **Wave B:** extract Stream B's conflict + availability logic into a shared
  `@osteojp/scheduling` package and have both `apps/web` and `apps/api` import one
  implementation, so the rule cannot drift.
- **This wave:** faithful re-statement against the same schema; documented in `store.ts`.

## 4. Per-location / parceria net-price display
The booking catalog surfaces the base catalog price (`services.price_cents`). The
`effectivePriceCents` override-then-base helper is in place but the per-location
`service_location_prices` override is not yet resolved into the catalog. Parcerias are
staff-managed; a patient can never self-claim one (there is no price/discount field in any
booking input — price is display-only, no payment, no fiscal document this phase).

- **Wave B:** resolve the per-location override into the catalog for display, and model
  parceria assignment as a staff action on the booked appointment.

## 5. Working-hours coverage parity
Candidate-therapist selection checks availability-template coverage for the requested
window (weekday + local time, Europe/Lisbon) directly in SQL. This matches the staff
availability DATA model but is a re-statement, not the shared `evaluateAvailability`
(see #3). Fold into the shared package in Wave B so edge cases (validity windows,
overnight templates) are handled by one code path.
