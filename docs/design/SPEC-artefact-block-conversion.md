# Converting a future artefact appointment into a *Bloquear horário* block

**Design report. 2026-09-08. No code, no migration, no write of any kind.**
Authored by PURPLE against `origin/main` at `f0dd059a`. Every mechanism below is
re-derived from committed files and cited by path; nothing is taken from a board
note or a prior report.

**Card:** `SEC-scheduling-artefact-patients-are-bookable-online`.

---

## 0. Where the numbers come from, and what this lane did not verify

The dispatch supplies the population from the owner's own run of
`scripts/import/cb-reconciliation.sql` against production:

- **14 artefact rows** matched section 11's name pattern.
- **`15875` "NAO MARCAR"** — 487 appointments, **61 in the future**.
- **`4995` "Nao Marcar"** — 43 appointments, **12 in the future**.
- **73 future agenda entries** across the two.

**This lane did not re-derive those figures and cannot.** The reconciliation is
owner-run (the card records the harness refusal that put it there), and no
production credential was read in this session. Everything in section 8 exists
because the numbers alone do not carry the facts a conversion plan needs.

**One correction to the card's own text, carried by the same read**: section 13b
returned **no** patient-origin booking on any artefact row. The card's sentence
"ONE RECEIVED AN ONLINE BOOKING on 07/09/2026 at 08:00 at Castelo Branco" is
false. The exposure is real; the incident did not happen. That correction is
recorded on the card itself.

---

## 1. The two objects are not variants of one thing

An artefact appointment and a *Bloquear horário* block are different tables with
different shapes, and the difference is what makes this a conversion rather than
an edit.

| | `appointments` | `time_off` |
|---|---|---|
| defined at | `packages/db/src/schema.ts` (appointments) | `packages/db/src/schema.ts:1046` |
| patient | `patient_id uuid **NOT NULL**` + FK | none, and no column could hold one |
| therapist | `practitioner_id` NOT NULL | `user_id` NOT NULL |
| **location** | `location_id` **NOT NULL** | **none — a block is therapist-wide across every clinic** |
| **room** | `room text` | **none** |
| service | `service_id` nullable | none |
| window | `starts_at` / `ends_at` | `starts_at` / `ends_at` |
| reason | `status` enum + free `notes` | `reason` enum (`vacation`/`sick`/`holiday`/`other`) + free `note` |
| audit | `writeAppointmentAudit` on every mutation | `writeAudit` on every mutation |

**Three fields on the appointment have nowhere to land.** Location and service
are harmless: a block already behaves as therapist-wide, and so does an
appointment — `appointmentsOverlapping`
(`apps/web/lib/admin/time-off.ts:283`) and the API's `apptOverlapExists`
(`apps/api/lib/appointments/store.ts:148`) both key on `practitioner_id` alone,
with no location predicate. Converting therefore changes nothing about *who* is
blocked *where*.

**`room` is the one that is genuinely lost, and it is not cosmetic.** Room
conflicts span therapists: `findConflicts`
(`apps/web/lib/scheduling/conflict.ts:15`) is explicit — "room: same location +
same room (case-insensitive), overlapping time" — and it runs through the
SECURITY DEFINER `public.appointment_conflicts` so a room clash is detected
across principals. **`time_off` cannot express "this room is unavailable".** If
any of the 73 entries was a front desk holding a *room* rather than a
*therapist*, there is no equivalent in this product and the conversion silently
drops that reservation. Section 8's read is the only way to find out; the answer
is `room IS NOT NULL` on those rows.

---

## 2. What one conversion requires, mechanically

Per future artefact appointment:

1. **Create the block.** `createTimeOffBlock`
   (`apps/web/lib/admin/time-off.ts`), mode `pontual`, with
   `userId = appointment.practitioner_id`, the Lisbon date and the `HH:mm`
   range of `starts_at`/`ends_at`. Reason lands as `other` — `reasonForMode`
   maps `pontual → other` and there is no way to choose. The appointment's own
   free-text `notes` should be carried into the block's `note`, or the reason
   reception wrote for the block is destroyed by the conversion.
2. **Remove the appointment.** Two paths, and they are not equivalent:
   - `cancelAppointment` sets `status = 'cancelled'` and nothing else — its own
     comment says "Never hard delete". The row survives.
   - `hardDeleteAppointment` (`apps/web/lib/scheduling/actions.ts:2008`) removes
     it, behind `settings:manage` **and** the tenant delete password, and
     **refuses** (`linked_records`) if the appointment carries any
     `appointment_notes`, `clinical_records` or `invoices`.

**Cancelling does not take the entry off the agenda.** `/agenda` renders every
appointment in the window regardless of status: `listAppointments`
(`apps/web/lib/scheduling/data.ts`) applies no status predicate, and
`apps/web/app/agenda/page.tsx` filters nothing on the way in. A cancelled
appointment renders with the red `Ban` glyph and **the patient's name still on
the face** (`apps/web/app/agenda/estado-marker.tsx`: "Cancelada — DISTINCT red
glyph, NEVER a strikethrough"). So conversion-by-cancel produces, at every one of
the 73 slots, **a block span and a red "NAO MARCAR" card side by side**. The
agenda gets noisier, not cleaner.

**Therefore: converting these entries so that the agenda is actually clean
requires the hard delete, which is admin-or-owner plus a password, 73 times.**
The FK graph permits it — `appointment_confirm_codes`, `reminder_dispatches` and
`appointment_reschedule_requests` cascade; `appointment_notes`,
`clinical_records` and `invoices` are exactly the three the guard refuses on — so
a hard delete either succeeds or refuses cleanly. It never orphans.

---

## 3. Can it be done from the existing screens?

**Yes, and it should not be.** Every step exists; nothing composes them.

The walk, per entry, for a receptionist or admin:

1. Open `/agenda` on the right day and clinic, find the entry, read off the
   therapist, the start and the end. The drawer shows them; nothing copies them.
2. Press **Bloquear horário** in the agenda toolbar
   (`apps/web/app/agenda/agenda-view.tsx:308`, gated on `schedule:manage`).
3. **Re-type the therapist, the date and both times.** `BlockTimeDialog` takes a
   `slot` prefill, and its own prop comment says what that is for: *"Prefill
   date/time when opened from an empty slot."* Opening it from an **occupied**
   slot is not a path the dialog has. There is no *convert this appointment to a
   block* affordance anywhere in the product.
4. Submit. The block is created and the overlap is **warned, never cancelled** —
   `createTimeOffBlock` returns the overlapping appointments and creates the
   block regardless. The artefact appointment itself will be in that warning.
5. Go back to the appointment and cancel it (reception can) **or** get an admin
   with the delete password to hard-delete it (reception cannot).

**Four things make that unworkable at 73, and two of them are not about effort:**

- **Transcription.** Steps 1→3 are a human copying a therapist id, a date and two
  times between two screens, 73 times. One mistyped hour blocks the wrong slot
  and leaves the real one open.
- **Two roles.** Reception holds `schedule:manage` and `appointments:delete` but
  **not** `settings:manage`, so reception can create every block and cancel every
  appointment, and cannot hard-delete a single one
  (`packages/auth/permissions.ts`). The clean version of this job cannot be done
  by the desk that owns the agenda.
- **Location scope.** `resolveScheduleScope` + `assertTargetInScheduleScope`
  (`apps/web/lib/admin/schedule-scope.ts`) mean a receptionist may only block a
  therapist assigned to their own clinic, and an out-of-scope therapist raises
  `not_found` rather than `forbidden` — deliberately indistinguishable from a
  missing one. **If the two artefact patients' future appointments span both
  clinics, no single receptionist can do the whole job**, and the failure they
  see will read as "that therapist does not exist".
- **No worklist.** Nothing in the product lists "future appointments of patient
  X" as a work queue you can walk. `/patients/<id>` shows the patient's
  appointments, which is the closest thing — and it disappears the moment the
  patient is soft-deleted (§5).

**One partial mitigation exists and is worth naming**: *bloquear lote*. The same
dialog repeats a block across weekdays with an interval and an end
(`createAgendaBlockBatchAction` → `createTimeOffBlockBatch`, one transaction,
overlaps deduped). If the 73 entries are a weekly standing pattern — "every
Tuesday 09:00–10:00 until December" — the block side collapses from 61 actions to
a handful. **That is a property of the data, not of the screens, and section 8's
read is what decides it.** The appointment side does not collapse either way:
`resolveSeries` (`apps/web/lib/scheduling/actions.ts:364`) can cancel a whole
series in one action, but only for rows sharing `recurrence_parent_id`, and rows
that arrived through the Fisiozero import have no reason to carry one.

---

## 4. What a tool would have to be

**Recommendation: a one-shot, owner-run, read-then-write script — not a product
feature.** The practice it cleans up is obsolete (that is the whole point of
*Bloquear horário* existing), so a *Converter em bloqueio* button would be a
permanent surface for a one-week problem, and it would be a button whose
happy path is "delete an appointment".

The shape, if it is built:

- **Selection is explicit, never a pattern.** The script takes a list of
  appointment ids produced by the read in section 8 and reviewed by the owner. It
  must not re-run section 11's name regex at write time: that regex is a
  deliberately wide net designed to be *read by a human* — its own header says
  "FALSE POSITIVES ARE THE POINT OF PRINTING THE NAME". A wide net is correct for
  a report and unacceptable for a delete.
- **Order is block-first, always.** See §6.
- **One transaction per appointment**, so a partial run leaves no slot both
  unblocked and un-booked.
- **Idempotent by construction.** `time_off` has no unique constraint and no
  natural key — running the script twice creates a second identical block, and
  nothing in the product would show them as duplicates. Either the script refuses
  to write a block that already covers `(user_id, starts_at, ends_at)`, or it
  records the appointment id it converted in the block's `note` and skips a
  second pass.
- **Carries the reason across.** `appointments.notes` → `time_off.note`, plus the
  source appointment id.
- **Writes audit rows.** Both existing paths already do
  (`writeAudit`, `writeAppointmentAudit`); a script that bypasses them and writes
  SQL directly breaks CLAUDE.md rule 6.
- **Reports counts and refusals, never patient data.**

**One side effect to decide before it runs:** `cancelAppointment` emits a staff
notification per cancellation (`emitCancelledNotification`, post-commit,
best-effort). **73 cancellations produce 73 entries in the notification centre**,
addressed to the therapists whose slots they were. The hard-delete path emits
none. That is an argument for the hard delete on top of §2's.

---

## 5. What breaks if the patient is soft-deleted with the blocks still attached

`softDeletePatient` (`apps/web/lib/patients/actions.ts:361`) sets
`patients.deleted_at` and **touches nothing else**. It does not cancel, move or
mark a single appointment. So the 73 entries stay exactly where they are, and
what happens next is decided surface by surface — because **the soft-delete
filter is applied in application queries, one at a time, and is not in RLS.** No
migration filters `deleted_at` for `patients_select`; the predicate lives in
`apps/web/lib/patients/filters.ts` and only in the queries that import it.

**Surfaces that DO hide the patient** (they apply `activePatientsOnly`):
`/patients` list and search, the dashboard patient count, `getPatient`, the
clinical-record patient scope, and guest matching.

**Surfaces that DO NOT:**

| Surface | What the owner would see | Why |
|---|---|---|
| **`/agenda`, `/marcacoes`, dashboard** | **All 73 entries still there, still showing "NAO MARCAR"** | `baseAppointmentQuery` LEFT-joins `patients` with no `deleted_at` predicate, and RLS never filters it. The name is only withheld when the *viewer's scope* excludes the patient (CONFIRM-09) — a soft delete is not a scope. |
| **The patient behind them** | **404** | `getPatient` applies `activePatientsOnly` unless `includeDeleted`. So the agenda shows a name that leads nowhere: reception clicks through from a slot and is told the patient does not exist. |
| **`/recuperacao`** | **Still eligible** | `listFollowupCandidates` (`apps/web/lib/followup/queries.ts:246`) builds its predicate from the three clauses in `packages/db/src/followup-selection.ts` plus scope — **no `deleted_at` filter anywhere**. The card's own complaint that artefact rows "appear in the recuperacao list" is therefore *not* answered by soft-deleting them. Today the two with future bookings are excluded by clause 2 ("nothing on the books ahead of them") — **so converting the blocks is what makes them eligible.** Cleaning the agenda pushes them onto reception's call list. |
| **Reminders** | **Still in the pipeline** | `loadReminderData` (`apps/web/lib/reminders/data.ts:93`) inner-joins `patients` with no `deleted_at` predicate. Only `status` gates it: `REMINDABLE_STATUSES = {scheduled, confirmed}` (`dispatch.ts:43`). A future artefact appointment left `scheduled` is remindable whether or not its patient is deleted. `REMINDERS_LIVE_SEND` is off, and an artefact row with no phone cannot receive one — but neither of those is the soft delete doing the work. |
| **Statistics** | **Still counted** | `kpi-queries.ts:243` LEFT-joins `patients` for the appointment KPIs; only the patient-count query (`:268`) filters `deleted_at`. |

**And the exposure the card is actually about does close.** Both patient-facing
doors filter soft-deleted rows explicitly:

- Guest matching: `patientPhoneMatchConds`
  (`apps/web/lib/scheduling/guest-match.ts`) requires `deleted_at IS NULL`, and
  its header says why in terms — reception must never be offered a deleted
  patient to attach a live appointment to.
- Portal login linkage: `resolvePatientByProvenPhone`
  (`apps/api/lib/auth/patient-linkage.ts`) requires `deleted_at IS NULL`,
  `merged_into_id IS NULL` and `auth_user_id IS NULL`, and takes `LIMIT 2` so an
  ambiguous match refuses rather than guesses.

**One residual, stated for completeness and not as an alarm.** A *trusted device*
cookie is a 30-day refresh token and `POST /auth/otp/trusted` deliberately does
**not** query the patient table on the request path; the booking store and the
patient session do not re-check `deleted_at` either. So a device already trusted
against an artefact row would keep minting sessions for up to 30 days after the
soft delete. Nobody has ever logged in as one of these rows — `portal_bookings`
is 0 on all fourteen — so this is a property of the design, not a live hole.

**The summary the disposition needs:** soft-delete closes the *booking* exposure
and cleans the *patient* surfaces. It does nothing whatsoever to the agenda, the
recuperação list, the reminder pipeline or the appointment statistics, and it
turns every remaining artefact entry into a slot whose patient link 404s. **That
is why the blocks must be converted first, and it is a stronger reason than the
one the dispatch gives.**

---

## 6. The order, and the window that must not open

**Block first. Cancel or delete second. Never the reverse, and never a gap.**

An appointment holds a slot against the public form only while it is not
cancelled: `apptOverlapExists` excludes `status in ('cancelled','no_show')` and
excludes unconfirmed pedidos. A `time_off` row holds it unconditionally —
`timeOffOverlapExists` has no status axis at all. Both are consulted by
`listAvailableSlots` / `listAvailableTherapists` in
`apps/api/lib/appointments/store.ts`.

So the instant an artefact appointment is cancelled and before its block exists,
**that slot is offered to the public**. Doing it block-first means the two
protections overlap and the slot is never free. The overlap warning
`createTimeOffBlock` returns during the first step is expected — it is the
artefact appointment itself — and must not be read as a failure.

---

## 7. Who can execute which half

| Step | owner | admin | reception | therapist |
|---|---|---|---|---|
| Create the block (`schedule:manage`) | ✓ | ✓ | ✓ own clinic only | ✓ self only |
| Cancel the appointment (`appointments:delete`) | ✓ | ✓ | ✓ | ✗ |
| **Hard-delete the appointment** (`settings:manage` + delete password) | ✓ | ✓ | **✗** | ✗ |
| Soft-delete the patient (`patients:delete`) | ✓ | ✓ | **✗** | ✗ |

---

## 8. What must be read before any of this is planned

Nothing above can be turned into a plan without the shape of the 73 rows. This is
**read-only** — every statement is a `SELECT`, it writes nothing, and it prints
no patient data beyond the two names already on the card. Run it in the Supabase
SQL editor against production, same as the reconciliation.

```sql
-- ARTEFACT FUTURE APPOINTMENTS. Read-only. Nothing here writes.
-- The worklist for converting NAO MARCAR blocks into Bloquear horario.
WITH tenant AS (
  SELECT id AS tenant_id FROM tenants ORDER BY created_at LIMIT 1
),
target AS (
  -- The TWO rows the owner identified, BY PATIENT NUMBER, not by the name
  -- pattern: a report may cast a wide net, a worklist may not.
  SELECT p.id, p.patient_number, p.full_name, p.auth_user_id, p.phone_e164
    FROM patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.patient_number IN (15875, 4995)
)
SELECT
  a.id                                        AS appointment_id,
  tg.patient_number,
  to_char(a.starts_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS starts_lisbon,
  to_char(a.ends_at   AT TIME ZONE 'Europe/Lisbon', 'HH24:MI')            AS ends_lisbon,
  extract(dow FROM a.starts_at AT TIME ZONE 'Europe/Lisbon')::int         AS weekday_0sun,
  l.name                                      AS location,
  u.full_name                                 AS practitioner,
  a.practitioner_id,
  a.status,
  a.origin,
  coalesce(a.room, '(none)')                  AS room,
  coalesce(s.name, '(none)')                  AS service,
  (a.recurrence_parent_id IS NOT NULL)        AS in_a_series,
  (a.notes IS NOT NULL AND a.notes <> '')     AS has_row_notes,
  (SELECT count(*) FROM appointment_notes an WHERE an.appointment_id = a.id) AS notes,
  (SELECT count(*) FROM clinical_records cr  WHERE cr.appointment_id = a.id) AS records,
  (SELECT count(*) FROM invoices inv         WHERE inv.appointment_id = a.id) AS invoices,
  -- The three above are hardDeleteAppointment's refusal conditions. Any of them
  -- non-zero means that row CANNOT be hard-deleted and must be decided by hand.
  (tg.auth_user_id IS NOT NULL)               AS patient_is_claimed,
  (tg.phone_e164 IS NOT NULL)                 AS patient_has_e164_phone
FROM appointments a
JOIN target tg ON tg.id = a.patient_id
JOIN locations l ON l.id = a.location_id
JOIN users u ON u.id = a.practitioner_id
LEFT JOIN services s ON s.id = a.service_id
WHERE a.starts_at >= now()
ORDER BY tg.patient_number, a.starts_at;
```

**What each column decides:**

- `room` — non-`(none)` on any row means §1's lossy case is live and the owner
  must rule on it before anything is converted.
- `location` + `practitioner_id` — whether one receptionist can do the job, or
  whether it needs an admin because it spans both clinics (§3).
- `weekday_0sun` + `starts_lisbon` — whether *bloquear lote* collapses the block
  side into a handful of actions or 73.
- `in_a_series` — whether the cancel side can use `scope: "series"` at all.
- `notes` / `records` / `invoices` — every row where any is non-zero is a row the
  hard delete will refuse. Expected to be zero throughout (these are fake
  patients), and if it is not, that row is not an artefact and the name pattern
  caught something real.
- `status` — a row already `cancelled` needs a block and no second step.
- `patient_is_claimed` — closes the trusted-device residual in §5 as a fact
  rather than an assumption. Expected `false` on both.

---

## 9. What the owner has to decide

**Q-ARTEFACT-1 — cancel or hard delete?**
*Recommended: hard delete, by an admin, after the blocks exist.* Cancelling leaves
73 red "NAO MARCAR" cards on the agenda beside 73 new blocks and emits 73 staff
notifications; it converts nothing from the reader's point of view. The counter
argument is real and is the project's own standing rule — clinical and scheduling
data is never silently destroyed (Q-W5-4) — but these rows are not scheduling
data about a person: they are a UI workaround for a feature the old system did not
have, and the audit row the hard delete writes preserves the ids, the window and
the status.

**Q-ARTEFACT-2 — one-shot script, or by hand from the screens?**
*Recommended: script, owner-run, on an explicit id list.* 73 hand conversions
across two roles and possibly two clinics, each one a manual transcription of a
therapist, a date and two times, is a job that produces its own defects.

**Q-ARTEFACT-3 — what happens to a room-only block, if section 8 finds one?**
No recommendation: the product has no way to express it, so this is a question
about what the clinic actually wants, not about implementation.

**Q-ARTEFACT-4 — the recuperação consequence.**
Converting the blocks removes the "has a future booking" exclusion, and because
`/recuperacao` does not filter soft-deleted patients, both artefact rows become
eligible for reception's call list if their last completed attendance falls in the
window. *Recommended: fix the list rather than the data* — adding
`activePatientsOnly` to `listFollowupCandidates` is one clause, it is correct
independently of this cleanup, and it is the only one of these questions that is
an ordinary defect. **It is a code change and is deliberately not made here.**

**Q-ARTEFACT-5 — the other 12.**
This report covers only the two rows with future appointments, as dispatched.
The remaining 12 carry past appointments only and need no conversion — but they
are the rows currently visible on `/recuperacao`, and Q-ARTEFACT-4 decides them
too.
