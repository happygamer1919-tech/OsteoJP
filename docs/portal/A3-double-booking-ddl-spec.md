# A3 - double-booking (2.9): constraint spec and the two rulings it needs

Status: BLOCKED on two owner rulings. Everything below is ready to hand GREEN
the moment those land. The violation-count SQL at the end is runnable now and
is needed either way.

---

## HALT: two things in the work order contradict the repo

### 1. There is no "annulled" state

A3 says the predicate must exclude "cancelled and annulled states". The enum
has exactly five values (`packages/db/src/schema.ts:42-48`):

    scheduled, confirmed, completed, cancelled, no_show

There is no `annulled`. The app-side conflict predicate excludes exactly one
state (`apps/api/lib/appointments/store.ts:149`):

    and a.status <> 'cancelled'

So the constraint should exclude `cancelled` and nothing else, to mirror the
application exactly. Two states are worth a deliberate ruling rather than an
assumption:

- `no_show` — the patient did not attend, but the appointment DID occupy that
  slot. It is historical fact, not a freed slot. Recommend it keeps blocking,
  which matches the app today.
- `completed` — same reasoning, and it is in the past anyway.

RECOMMENDATION: exclude only `cancelled`. Confirm, or name the extra states.

### 2. A hard constraint would break staff "Save anyway"

This is the bigger one, and it is why no DDL is committed yet.

Staff can DELIBERATELY double-book today. It is an owner-ruled, implemented
override (`apps/web/lib/scheduling/conflict-core.ts:5-14`):

    Real double-bookings (therapist/room) and time_off absences still block by
    default (overridable via allowConflict / "Save anyway").

A database-level `EXCLUDE` constraint is absolute. It cannot be overridden by
an application flag. Adding one converts every existing "Save anyway" into a
constraint violation, which surfaces to reception as a 500. That is a
regression in a workflow the owner previously ruled on.

So the honest statement of the problem: we need overlaps to be IMPOSSIBLE for
patients racing each other, while remaining POSSIBLE for staff who choose it
with their eyes open. A single unconditional constraint cannot express that.

---

## Three ways to close 2.9, with a recommendation

### Option A - advisory lock in the booking transaction (RECOMMENDED)

Serialize concurrent attempts on the same therapist and slot, so check-then-
insert becomes atomic, without forbidding anything.

    -- inside the existing transaction, BEFORE the conflict guard
    select pg_advisory_xact_lock(
      hashtextextended(
        $tenant_id || ':' || $practitioner_id || ':' || $starts_at::text, 0
      )
    );

The lock is held to commit and released automatically. Two racing bookings for
the same slot queue; the second runs its guard AFTER the first commits, sees
the row, and correctly returns `no_slot`.

- Keeps staff override working, untouched. Nothing is forbidden; writes are
  only ordered.
- No migration strictly required if the lock is taken from application SQL,
  though a helper function is cleaner.
- No legacy-data problem. Existing overlaps stay as they are.
- Cost: it only protects paths that TAKE the lock. Staff writes must take it
  too, or a patient can still race a staff booking. Staff would still be free
  to override, but would be overriding against fresh data instead of stale.

### Option B - partial EXCLUDE constraint, patient bookings only

Patient bookings are distinguishable: `created_by IS NULL`
(`apps/api/lib/appointments/store.ts:477`, "patient has no users row").

    ... WHERE (status <> 'cancelled' AND created_by IS NULL)

- Absolute guarantee where we want one, staff override untouched.
- Fragile. `created_by` is null for imports and seeds too, so the predicate
  encodes "not created by a staff user", not "created by a patient". If a
  future path inserts with a null actor, it silently joins the constrained set.
- Does not stop a patient booking from overlapping a STAFF booking, which is
  the more likely real collision.

### Option C - unconditional EXCLUDE constraint

What A3 literally asks for.

- Strongest guarantee, and self-documenting in the schema.
- Breaks "Save anyway". Requires an owner ruling that deliberate staff
  overlaps are no longer permitted, plus UI work to stop offering the override,
  plus cleanup of any existing overlapping rows before it can be created.

RECOMMENDATION: **Option A**, with the lock taken by both the patient and staff
booking paths. It closes the race that 2.9 proved, costs no behavior change,
and cannot fail to apply because of legacy data. If you want the schema-level
guarantee as well, Option C is a later, separate decision that starts with the
violation count below.

---

## The DDL, if you rule for Option C

Hand this to GREEN only after ruling on both questions above.

### Extension requirement (mandatory, state it explicitly)

`EXCLUDE USING gist` cannot mix a uuid equality operator with a range overlap
operator unless `btree_gist` is installed. Without it the constraint fails at
creation with "data type uuid has no default operator class for access method
gist".

    CREATE EXTENSION IF NOT EXISTS btree_gist;

This is a superuser-ish operation on some providers. On Supabase it is
available to the migration role, but GREEN should confirm it applies under the
prod-equivalent non-privileged role rather than assume, because a grant that
silently no-ops is a known failure mode in this repo (see migration 0012's
header on exactly that).

### The constraint

    ALTER TABLE appointments
      ADD CONSTRAINT appointments_no_therapist_overlap
      EXCLUDE USING gist (
        tenant_id       WITH =,
        practitioner_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status <> 'cancelled');

Notes GREEN will need:

- `'[)'` is REQUIRED and must not be changed to `'[]'`. The application treats
  the window as half-open (`starts_at < :ends AND ends_at > :starts`,
  `store.ts:150-151`), so a 10:00-11:00 appointment and an 11:00-12:00
  appointment do NOT overlap. `'[]'` would make them collide and would reject
  ordinary back-to-back bookings.
- `practitioner_id` is `NOT NULL`, so there is no null-matching subtlety.
- `appointments` has NO soft-delete column, so nothing else needs excluding.
- Creating the constraint takes an ACCESS EXCLUSIVE lock and builds an index.
  On a table this size that is sub-second, but it is still a brief write lock.

### Cancelled slots become re-bookable instantly

Yes, and the predicate is what expresses it. `WHERE (status <> 'cancelled')`
is a partial-index predicate: a row moving to `cancelled` leaves the
constrained set on UPDATE, and the slot is immediately free to any other row.
No delay, no cleanup job, no separate release step.

---

## Existing violations: count them BEFORE authoring anything

A constraint that cannot be created because of legacy rows is a migration that
fails at 2am. Prod may already contain overlaps, precisely because the race has
been open and because staff could override deliberately.

READ-ONLY. Ivan runs this, not me.

    WITH live AS (
      SELECT id, tenant_id, practitioner_id, starts_at, ends_at, status, created_by
      FROM appointments
      WHERE status <> 'cancelled'
    )
    SELECT
      count(*)                                        AS overlapping_pairs,
      count(DISTINCT a.practitioner_id)               AS therapists_affected,
      min(a.starts_at)                                AS earliest,
      max(a.starts_at)                                AS latest,
      count(*) FILTER (WHERE a.created_by IS NULL
                         OR b.created_by IS NULL)     AS pairs_involving_a_patient_booking
    FROM live a
    JOIN live b
      ON  a.tenant_id       = b.tenant_id
      AND a.practitioner_id = b.practitioner_id
      AND a.id < b.id
      AND tstzrange(a.starts_at, a.ends_at, '[)')
       && tstzrange(b.starts_at, b.ends_at, '[)');

If `overlapping_pairs` is 0, Option C can be created cleanly.
If it is not 0, those rows must be resolved first, and each one is a real
clinical booking that a human has to decide about. That decision is JP's.

To see them individually, same joins, selecting
`a.id, b.id, a.practitioner_id, a.starts_at, a.ends_at, b.starts_at, b.ends_at`
ordered by `a.starts_at`, limit 50.

---

## Application-side change (required for Option B or C)

Today a losing race surfaces as an unhandled 500. With a constraint it becomes
a catchable, specific error.

Postgres raises SQLSTATE **`23P01` (exclusion_violation)** with
`constraint = 'appointments_no_therapist_overlap'`.

`apps/api/lib/appointments/store.ts:createBooking` must catch it and translate
to the EXISTING domain error, so no new error path is invented:

    throw new AppointmentError("no_slot");

`no_slot` is already handled by `lib/appointments/http.ts` and already has
patient-facing copy, so the losing racer gets the same clean outcome as
someone who simply picked a taken slot. Reschedule needs the identical catch.

The check-then-insert guard STAYS. It is what produces a clean `no_slot` in the
ordinary case; the constraint only catches the narrow racing window.

### pt-PT copy

Patient (portal), on losing the race. Never mentions another patient, never
implies fault:

> Esse horario acabou de ser ocupado. Escolha outro horario disponivel.

Reception (staff), on a genuine conflict, wording depends on the ruling:

- Under Option A or B, the existing "Save anyway" flow is unchanged and needs
  no new copy.
- Under Option C, the override must be removed from the UI and the message
  becomes a hard stop:

> Ja existe uma marcacao para este terapeuta neste horario. Escolha outro
> horario ou outro terapeuta.

Both strings need to land in `packages/i18n` alongside the existing booking
strings rather than inline, matching how the rest of the booking copy is done.

---

## What I need from you, exactly two answers

1. Exclude only `cancelled`, or also `no_show` / `completed`?
2. Option A, B, or C. Which means: may staff still deliberately double-book?

With those two, GREEN can author the migration without asking me anything.
