# SCHED-16 / SCHED-17 — migration proposal for strategy

**Status: BLOCKED, awaiting strategy. Nothing was written.** The dispatch's own
rule: "Any schema change: STOP and send the migration proposal to strategy
first." This is that proposal.

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

## 4. Open questions for strategy

1. **Option A or Option B.**
2. **Does the closure apply on Saturday?** CB's Saturday hours differ; a single
   `midday_closed_*` pair applies to every open day, including Saturday. If
   Saturday is exempt, Option A is not sufficient and Option B is required.
3. **What happens to the 14 existing appointments that already sit inside a
   closure band, if any?** The standing rule (Q-W5-4) is that scheduling data is
   never silently destroyed, so the proposal is: they render, they are reported,
   nothing is cancelled. Confirm.
4. **"Todas as localizações" on the agenda** — when no location is selected, does
   the grid show the union of both clinics' hours (recommended: yes, or a clinic's
   real working hour is hidden) and does it draw the closure band at all
   (recommended: no, because it is only true of one clinic)?
