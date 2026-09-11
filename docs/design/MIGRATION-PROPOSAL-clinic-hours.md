# SCHED-16 / SCHED-24 — migration proposal for strategy

**Status, 2026-09-10: RULED, BUILT, AND HELD. This is no longer a pending
proposal.** Option A was ruled on 2026-09-10 and all four questions in section 4
are answered there. The build is migration 0085 in PR #1264, which is authored
and HELD: it does not merge until the owner has applied it, and it must not be
applied before 0083 (PACK-06) and 0084 (INTAKE-01). Section 5 says what #1264
builds and where it departs from sections 2 and 3.

Sections 1 to 3 are left as filed, on purpose. They are the derivation the
rulings were taken against, and rewriting them to match the outcome would destroy
the record of what was known when the decision was made.

*As first filed:* "Status: BLOCKED, awaiting strategy. Nothing was written." The
dispatch's own rule: "Any schema change: STOP and send the migration proposal to
strategy first." This is that proposal.

## 1. Where the agenda grid's end actually comes from (the read half of P2)

Three independent definitions of "the working day" exist, and **not one of them
is a clinic opening time**. Nothing in the schema records when a clinic opens or
closes.

| # | Surface | What bounds it | Where |
|---|---|---|---|
| 1 | Agenda grid: hour rows, slot buttons, blocked-band clipping | Two hardcoded module constants, `DAY_START_HOUR = 8` and `DAY_END_HOUR = 20` | `apps/web/lib/scheduling/time.ts:18-19` |
| 2 | Nova marcação time chips | The therapist's own `availability_templates` rows for that weekday, minus bookings and blocks | `apps/web/lib/scheduling/day-availability-core.ts:141` |
| 3 | Portal / API bookable slots | The same `availability_templates`, expanded in SQL, stepped by `locations.slot_granularity_min` | `apps/api/lib/appointments/store.ts:374-420` |

**The reported symptom, precisely.** `agenda-grid.tsx:73` builds hour rows with
`for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h += 1)`, so the last hour
**label** is `19:00` and the painted grid ends at 20:00. `daySlots()`
(`time.ts:227-233`) steps `m < DAY_END_HOUR * 60`, so the last slot **button**
starts at 19:30. The grid is therefore already correct for a clinic closing at
20:00 — what is missing is the 20:00 label, which is why it reads as "ends at
19:00".

**The real defect is that it is a constant.** 08:00-20:00 is compiled into the
web app. It is identical for CB and LV, cannot differ per location, and neither
of the other two surfaces reads it. A clinic that opens at 07:00 or closes at
21:00 cannot be expressed at all, and the three surfaces can disagree with each
other because there is no single fact for them to agree on.

**Precedent for the fix.** `locations.slot_granularity_min` already exists
(migration 0041) and is exactly this shape: per-location scheduling config, read
by the slot generator, defaulted so nothing changes until a location is set
otherwise.

## 2. Proposed migration

Number: **0085 or later** (0083 is PACK-06, 0084 is reserved for INTAKE-01).
Two options for the CB midday closure; the opening hours half is the same in both.

### Common half — opening hours per location

```sql
alter table locations
  add column opens_at  time not null default '08:00',
  add column closes_at time not null default '20:00',
  add constraint locations_open_before_close check (opens_at < closes_at);
```

Defaults are today's `DAY_START_HOUR` / `DAY_END_HOUR` exactly, so **the migration
alone changes no behaviour**. CB and LV are then set to 20:00 by a data update,
which they already effectively are.

### Option A — a closure pair on `locations` (recommended)

```sql
alter table locations
  add column midday_closed_from time,
  add column midday_closed_to   time,
  add constraint locations_midday_pair check (
    (midday_closed_from is null) = (midday_closed_to is null)
  ),
  add constraint locations_midday_order check (
    midday_closed_from is null or midday_closed_from < midday_closed_to
  ),
  add constraint locations_midday_inside_hours check (
    midday_closed_from is null
    or (midday_closed_from >= opens_at and midday_closed_to <= closes_at)
  );
```

CB gets `('13:00','14:00')`; LV keeps nulls.

- **Cost:** one table, four columns, no new RLS surface (`locations` already has
  its policy), no new joins on any read path.
- **Expresses:** one closure band per location, every day the clinic is open.
- **Does not express:** a different lunch on Saturday, two bands, a closure with
  an end date.

### Option B — a `location_closures` table

```sql
create table location_closures (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  weekday     smallint,              -- null = every day the clinic is open
  starts_at   time not null,
  ends_at     time not null,
  label       text,
  created_at  timestamptz not null default now(),
  check (starts_at < ends_at),
  check (weekday is null or weekday between 0 and 6)
);
```
Plus RLS policy, tenant index, and an isolation test (CLAUDE.md rule: every new
domain table ships with tenant_id, an RLS policy and an isolation test in the
same PR).

- **Cost:** a new domain table, a new RLS policy, a new isolation test, and a
  join on three read paths including the portal's SQL.
- **Expresses:** everything Option A does, plus per-weekday and multiple bands.

**Recommendation: Option A.** The requirement as stated is one band, one clinic,
every day, permanent. Option A carries exactly that and no more, adds no RLS
surface, and can be superseded by Option B later without a read-path rewrite (the
columns become the degenerate case). Option B is the right build the first time
somebody asks for "closed Saturday afternoons too".

## 3. What the read paths have to change (either option)

1. **Grid window** — `DAY_START_HOUR` / `DAY_END_HOUR` stop being constants.
   `agenda/page.tsx` resolves the window from the selected location (and from the
   union of the viewer's locations when "Todas as localizações" is selected, or
   the grid would hide hours one clinic works), and passes it to `AgendaGrid`.
   `blocked-time-core.ts` takes `dayStartMin` as an argument instead of importing
   the constant.
2. **Availability composition** — `buildDay` subtracts the closure exactly where
   it subtracts blocks (`day-availability-core.ts:141`), but as a THIRD term kept
   separate from `blocks`, so the inspector and the Disponibilidade panel can
   name it differently from a therapist absence.
3. **Portal / staff booking refusal** — a `closureOverlapExists(...)` predicate
   beside `timeOffOverlapExists` in `apps/api/lib/appointments/store.ts`, added to
   the `createBooking` guard and to `listOpenSlots`. Staff refusal goes in
   `conflict.ts` as a new conflict kind. **It must NOT be overridable**: the
   dispatch says "not blockable-around", so unlike `time_off` it belongs in
   neither `ADVISORY_CONFLICT_KINDS` nor the `allowConflict` override.
4. **Grid rendering** — a closure band visually distinct from the therapist block
   band (`BlockedBand`, `agenda-grid.tsx:508`). Different fill and a different
   label ("Encerrado" vs "Tempo bloqueado"), because one is "the clinic is shut"
   and the other is "this person is away", and reception acts differently on each.

## 4. Questions for strategy: all four answered 2026-09-10

1. **Option A or Option B.** **RULED 2026-09-10: Option A**, on dispatch E2,
   **by strategy under the owner's delegation.** The Saturday answer directly
   below is the owner's own, and it is what removed the case for B.
   *(Attribution ruled 2026-09-11. Until then the board's cards disagreed on who
   ruled A, and this line said so rather than picking a side.)*
2. ~~**Does the closure apply on Saturday?**~~ **ANSWERED by the owner,
   2026-09-10:** *"the CB 13:00-14:00 closure applies every day CB is open,
   including Saturday."*

   **This answer settles question 1 in favour of Option A.** Option B existed
   only to express a closure that VARIES BY WEEKDAY. A closure applying every day
   CB is open is exactly the degenerate case Option A already carries, so B's
   extra table, RLS policy, isolation test and three read-path joins now buy
   nothing that is wanted. Strategy still rules question 1 formally; the case for
   B has been removed by the answer rather than argued away.
3. **What happens to the 14 existing appointments that already sit inside a
   closure band, if any?** The standing rule (Q-W5-4) is that scheduling data is
   never silently destroyed, so the proposal is: they render, they are reported,
   nothing is cancelled. Confirm.
   **ANSWERED 2026-09-10: confirmed.** They render and are reported; nothing is
   cancelled, hidden or moved. The figure 14 in the question as filed carries no
   source in this document; treat it as unverified, not as a count.
4. **"Todas as localizações" on the agenda** — when no location is selected, does
   the grid show the union of both clinics' hours (recommended: yes, or a clinic's
   real working hour is hidden) and does it draw the closure band at all
   (recommended: no, because it is only true of one clinic)?
   **ANSWERED 2026-09-10: both recommendations taken.** The union of both
   clinics' hours, and no closure band when no clinic is selected.

## 5. What PR #1264 builds, as authored and held (2026-09-10)

Read off #1264's branch (`db/0085-clinic-hours-cb-closure`, head `240ece80`),
not off its description. **Nothing in this section is applied or merged.**

**The migration.** `packages/db/migrations/0085_clinic_hours_and_cb_closure.sql`,
sha256 `568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1`; the
`supabase/migrations/` mirror is
`550c800278b82cad54e5f37e5a70be6c558ad642b9f18fb0d3f1392417fba822`. It is the
common half plus Option A as section 2 wrote them: `opens_at` / `closes_at`
defaulting to 08:00 / 20:00, `midday_closed_from` / `midday_closed_to` nullable,
and the four checks under the same names (`locations_open_before_close`,
`locations_midday_pair`, `locations_midday_order`,
`locations_midday_inside_hours`).

**Where it departs from sections 2 and 3:**

| Proposal said | #1264 does |
|---|---|
| CB and LV set to 20:00 by a data update | No hours update. The defaults already are 08:00-20:00, so the only data write is CB's closure. |
| "CB gets ('13:00','14:00')" | Seeded inside the migration, matched by name (`name like '%(CB)%'`), idempotent (`and midday_closed_from is null`), no tenant filter, and the file says why. |
| Staff refusal "in `conflict.ts` as a new conflict kind" | **Not a conflict kind.** `checkClinicClosure` (`apps/web/lib/scheduling/clinic-closure-enforcement.ts`) runs beside `checkAvailability`, outside the `allowConflict` gate, and returns `clinic_closed`. Same intent (*Guardar mesmo assim* cannot reach it), a different place. |
| Portal: `closureOverlapExists` beside `timeOffOverlapExists`, in `createBooking` and `listOpenSlots` | As proposed, plus the reschedule guard, plus a new API error `clinic_closed` (409) split off `no_slot`, so the patient is not told to refresh a list that will never contain that hour. |
| Availability: the closure as a third term, separate from `blocks` | As proposed (`closures` on `DayAvailability`), plus a `closed` no-free reason that outranks `blocked`. |
| Band labelled "Encerrado" | The band reads *Clínica encerrada*. *Encerrado:* is the label in Nova marcação's availability panel. |
| `blocked-time-core.ts` takes `dayStartMin` instead of importing the constant | **Not taken.** `blocked-time-core.ts` still reads `DAY_START_HOUR`. No effect while every clinic opens at 08:00, which the defaults make true after apply. |

**One gap found while reconciling, NOT fixed here.** `checkClinicClosure` is
called in `createAppointment` and `rescheduleAppointment`. `cloneAppointment`
(SCHED-15, the write behind *Marcar novamente* on the agenda, Marcações and the
patient's appointment list) runs `checkAvailability` and has no closure check on
#1264's branch, so as authored a *Marcar novamente* into CB's 13:00-14:00 is not
refused.
The fix belongs in #1264, before it is applied. This docs PR changes no code.

**Closed on #1264's branch, 2026-09-11, commit `72c863b0`.** Reproduced first on
the purple lane with 0085 applied: before the fix, a *Marcar novamente* into
13:30 at the closed clinic wrote a scheduled appointment and the screen said
*Nova marcação criada.* `cloneAppointment` now calls `checkClinicClosure` beside
`checkAvailability` and outside the `allowConflict` gate, like the other two
paths, and the drawer renders the same clinic-named sentence with no *mesmo
assim*. The migration file is unchanged (the sha256 above still holds), and #1264
is still held until 0085 is applied.

**What makes it ship.** SCHED-16 and SCHED-24 stay `in_flight` on the board until
#1264 merges, and #1264 merges only after the owner applies 0085, which waits on
0083 and 0084.
