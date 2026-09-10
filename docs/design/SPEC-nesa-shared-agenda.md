# NESA as a shared bookable agenda at Castelo Branco — proposal

**Card:** `SCHED-17-nesa-shared-agenda-at-cb`
**Status:** STOPPED before any code. One half needs an RLS policy change, and the
2026-09-10 dispatch says an RLS change stops and goes to strategy first.
**Lane:** BLUE. **Written:** 2026-09-10.

---

## 0. The mechanism, up front

The requirement is four capabilities. **Two of them are refused by
`appointments_rls`, one by an app-layer guard, and one already works.** Measured
from a therapist principal on a migrated database, not described:

| capability | today | where it stops |
|---|---|---|
| a CB therapist SEES NESA's agenda merged with their own | **no** | `appointments_rls` |
| a CB therapist CREATES a NESA appointment | **no** | app layer (PL-10 self-lock) |
| a CB therapist EDITS a NESA appointment somebody else created | **no** | `appointments_rls` |
| a CB therapist ANNOTATES such an appointment | **no** | `appointments_rls`, indirectly |

`appointment_notes` RLS is tenant-only, so annotation is not itself refused. It
fails because `appendAppointmentNoteAction` derives `patient_id` from the
appointment through `runScoped` first, and an appointment the therapist cannot
SELECT yields `null` — the action returns `{ ok: false }`. Fix the read and the
annotation follows; nothing in the notes layer needs touching.

---

## 1. Where NESA is flagged

**Today NESA is a SERVICE, not a practitioner.** Every occurrence of NESA in the
product is `services.name` — the booking drawer's Serviço list, the contraindication
warning (`lib/scheduling/nesa.ts`, W2-08), the pacote binding (`PACK-04`). There
is no NESA practitioner anywhere.

**A practitioner row is possible today with no migration and no login.**
`users.id` is documented 1:1 with `auth.users.id` but carries **no foreign key**
to it, so a login-less staff row is insertable — verified by inserting one during
the simulation below. What such a row needs:

- `users.is_bookable = true` — this, and only this, puts a row in the Terapeuta
  dropdown. Migration 0046 / PL-06b made bookability an **explicit flag** rather
  than something derived from role or service mappings, precisely so an unusual
  practitioner does not have to be inferred. NESA is exactly the case that flag
  was shaped for.
- one `staff_locations` row for Castelo Branco — which is what keeps LV out of
  this by construction rather than by a location check bolted on later.

**What does NOT exist is a way to say "this practitioner is a shared clinic
resource rather than a person."** `is_bookable` cannot express it: JP is bookable
and is not shared. Three ways to add it:

| option | cost | verdict |
|---|---|---|
| **(a) `users.is_shared_resource boolean not null default false`** | one migration, one additive column | **recommended** |
| (b) name the NESA user id in an env var | no migration | **refused.** It is the "click nobody can audit" shape SR-43 cost two days on: not in a diff, not assertable by a test, and the only way to know it is still right is for a person to look |
| (c) a new `roles.slug = 'resource'` | no migration for the flag itself | **refused.** `jwt_role()` is read by every RLS policy in the system; a fourth staff role would ripple through all of them for a property that is not about permissions |

Option (a) is additive under SR-50(d) and is the smallest thing that survives a
second shared resource (a room, a second device, LV wanting its own).

---

## 2. How the merged default view is composed

Two single-valued filters have to become sets, both in the app layer:

**`apps/web/app/agenda/page.tsx`**

```ts
const lockTherapist = actor.role === "therapist";
let practitionerId = firstParam(sp.therapist);
if (lockTherapist) practitionerId = actor.userId;   // ONE id
```

**`apps/web/lib/scheduling/data.ts`, `listAppointments`**

```ts
if (args.practitionerId) conds.push(eq(appointments.practitionerId, args.practitionerId));
```

Proposed: a therapist's default becomes the SET `{ self } ∪ { shared resources at
the viewer's assigned locations }`, and the filter becomes `inArray`. An LV
therapist's set is `{ self }` because the resource is joined through
`staff_locations` — **LV is unaffected as a property of the data, not as a
promise.** A therapist may still narrow to one of the two.

**One consequence that must be decided, not discovered.** `listTherapistBlocks`
is drawn only when the agenda is scoped to exactly one therapist (W9-04: the grid
has day columns and no therapist axis, so a full-width blocked band under "todos"
would claim the whole clinic is blocked when one person is away). A merged view is
two practitioners. **Recommendation: keep drawing the viewer's OWN blocks and
never the resource's** — a shared device has no time off, and the viewer's own
blocks are the ones that stop them booking.

**The patient portal must be EXCLUDED explicitly, and this is a requirement
rather than a nicety.** The portal's roster comes from
`GET /api/v1/booking/therapists` in `apps/api`, which reads the same
`is_bookable` flag. A NESA user row with `is_bookable = true` and no exclusion
would offer patients "NESA" as a person to book with. The `is_shared_resource`
flag is what that endpoint filters on, and a test must assert the exclusion.

---

## 3. Exactly which authorization checks change

**App layer — permitted to proceed under the dispatch, listed for completeness:**

1. `lib/scheduling/actions.ts` ~line 559, `createAppointment`:
   `if (actor.role === "therapist" && input.practitionerId !== actor.userId) return forbidden`.
   Must also admit a shared resource at a location the viewer books at.
2. `lib/scheduling/actions.ts` ~line 884, the "Agendar lote" path: the same guard,
   the same change. Missing one of the two leaves batch booking refusing what
   single booking allows.
3. `lib/scheduling/self-lock-core.ts`, `isTherapistSelfLocked`: the create drawer
   currently HIDES the Terapeuta selector for a therapist and forces
   `practitionerId = self`. It must offer `{ self, resource }` instead of nothing.
4. `rescheduleAppointment` (~line 1479) has **no** practitioner self-guard at all
   — it already relies on RLS alone. Named so nobody adds one thinking they are
   restoring symmetry.
5. The note actions need **no** change. See §0.

**RLS — this is the part that stops, and it is where the requirement actually
lives.**

`appointments_rls` (0078, `FOR ALL`, USING and WITH CHECK character-identical):

```
(created_by = auth.uid())
OR jwt_role() = 'owner'
OR (jwt_role() = 'therapist' AND (practitioner_id = auth.uid() OR practitioner_2_id = auth.uid()))
OR (jwt_role() IN ('admin','reception') AND <location scope>)
```

**NESA is not a person and has no `auth.uid()`.** No therapist can ever satisfy
the therapist arm for a NESA row. The only reason any NESA appointment is
reachable today is the unrelated `created_by = auth.uid()` arm — which is why the
simulation shows a therapist can see the NESA appointment *they* booked and not
the one reception booked. **That is the worst possible half-state and it is what
we have now.**

### The proposed change, for strategy to rule

Add a fourth disjunct to the therapist arm, in **both** USING and WITH CHECK:

```sql
OR ((SELECT public.jwt_role()) = 'therapist'
    AND practitioner_id = ANY (
      coalesce((SELECT public.shared_resource_practitioner_ids()), '{}'::uuid[])))
```

`shared_resource_practitioner_ids()` is a **nullary** STABLE SECURITY DEFINER
function returning the ids of shared-resource users at the viewer's assigned
locations. Nullary and wrapped in `(SELECT …)` deliberately: **0078 exists
because a per-row helper cost 4,691 ms in a single scan that removed six rows.**
A per-row `is_shared_resource(practitioner_id)` would reintroduce exactly that,
on the same table, in the same policy. The `coalesce` is load-bearing for the
same reason 0078 states — `= ANY ((SELECT f()))` parses as ANY over a subquery
and postgres refuses uuid vs uuid[].

### Three things strategy must rule, because none is inferable

1. **USING only, or USING and WITH CHECK?** USING alone gives read and no edit.
   The requirement asks for edit, so both. But the policy is `FOR ALL`, so a
   WITH CHECK disjunct also governs INSERT and the post-UPDATE row state — a
   therapist could then create a NESA appointment at any location the function
   returns. That is the intended grant, and it must be granted on purpose rather
   than arrive as a side effect of wanting edit.
2. **Is the widening location-scoped inside the function?** Recommended yes. It
   is what makes "LV unaffected" a property of the data rather than a sentence in
   a report.
3. **It is an `ALTER POLICY` on an existing object.** SR-50(d) confines the lane
   to additive migrations and sends anything that ALTERs an existing object to
   strategy — so it arrives here regardless of the dispatch's own instruction.

### The gate it must ship behind

0078 shipped behind `scripts/0078-equivalence.sql`, which evaluated the old and
new predicates over **every row of production's `appointments` for every staff
principal** — 28 principals × 41,558 rows — and counted disagreements in both
directions: loosened 0, tightened 0.

This change **deliberately loosens**, so the gate inverts rather than disappears:
it must count the loosening and assert that the loosened set equals **exactly**
the shared-resource rows at the viewer's locations, and that **tightened = 0**.
A widening with no measurement of its own size is how a location boundary
disappears without anyone noticing.

---

## 4. The simulation, verbatim

`packages/db/scripts/clinic-batch-20260910-simulation.mjs`, run against a lane database with all
migrations applied. It seeds a tenant with a CB therapist, a NESA resource user, a
receptionist and one patient; creates three appointments; and asks the questions
as the therapist principal (`set local role authenticated`, claims
`{tenant_id, user_role: 'therapist', sub: <therapist id>}`), rolling every
assertion back.

```
=== B3 — a CB therapist principal against NESA's agenda ===
principal: role=therapist, sub=<the CB therapist>, tenant scoped

  SELECT own appointment (practitioner_id = self)                VISIBLE
  SELECT NESA appointment the therapist created themselves       VISIBLE
  SELECT NESA appointment RECEPTION created                      INVISIBLE
  UPDATE NESA appointment RECEPTION created (rows affected)      0
  UPDATE NESA appointment the therapist created (rows affected)  1
  INSERT a NESA appointment as the therapist (rows created)      1
```

Read the last three lines together. The database will **accept** a NESA
appointment from a therapist (the `created_by` arm satisfies WITH CHECK) and will
then **hide it from every other CB therapist**. So the app-layer half of this work
is not merely incomplete on its own — **shipped alone it would be actively
misleading**, producing appointments that exist, are billable, and are invisible
to the colleague standing next to the machine. That is the recommendation below.

---

## 5. Recommendation

**Do not ship the app-layer half alone.** It is permitted by the dispatch and it
is the wrong call: it converts "a CB therapist cannot book NESA" into "a CB
therapist can book NESA and nobody else can see it," which is worse than the
present state and harder to notice.

Ship it as one change once the policy is ruled:

1. strategy rules the three questions in §3;
2. one migration: `users.is_shared_resource`, the nullary function, the
   `ALTER POLICY` — held under rule 7 behind whatever is already in flight;
3. the equivalence gate, inverted as described;
4. the four app-layer changes in §3, plus the portal exclusion in §2;
5. verified by re-running the simulation and by an e2e from a CB therapist
   account against the merged agenda.
