# W13-07 — SYNC, hop by hop

**LOOP 7, in progress. Derived from the code on 2026-08-12 against `origin/main`
@ `a377f6a`.** Serves **PG8**: *"SYNC: 3C proven, portal booking removes the slot
from the staff agenda and vice versa, hop-by-hop trace with timing named."*

> ## PG8 IS NOT CLOSED BY THIS DOCUMENT. Read §5 and §6 before citing it.
> The behaviour is proven at the database, the structure is proven by test, and
> the cross-surface e2e is written — **but the measured run has not happened**,
> and the DoD requires it. §6 records why, and it is an environment fact rather
> than a judgement call.

---

## 1. THE GATE'S CLAUSE IS ASYMMETRIC, AND THE CODE IS NOT

**Reported first because it changes what the gate can mean, and no prior document
records it.**

The clause says *"portal booking removes the slot from the staff agenda **and
vice versa**"*. Those two halves are **not mirror images**, because the two
surfaces answer different questions:

| Surface | Question it asks | Source |
|---|---|---|
| **Portal** | *which start times are OPEN?* | `listOpenSlots` — availability templates **minus** conflicting appointments (`store.ts:374`) |
| **Staff agenda** | *what is BOOKED?* | `listAppointments` — the rows themselves (`apps/web/lib/scheduling/data.ts:193`) |

So:

- **staff → portal IS a slot removal.** A staff booking inserts a row;
  `apptOverlapExists` then excludes that window; the slot disappears from the
  portal. This half is literally what the clause describes.
- **portal → staff agenda is NOT a removal. It is an APPEARANCE.** A portal
  booking inserts a row and the agenda **renders that row**. Nothing is removed
  from the agenda, because the agenda was never showing free slots to begin with.

**Neither reading is a defect** — the asymmetry is correct product behaviour. But
a proof written to the clause's literal words would be looking for a
disappearance on the staff side that cannot happen, and would either fail or be
quietly redefined. **The property actually worth proving in that direction is
that the row appears, promptly, and to the right therapist's column.**

---

## 2. THE HOPS

### 2.1 Direction A — patient books in the portal → staff agenda

| # | Hop | Boundary | Latency |
|---|---|---|---|
| A1 | patient submits | `BookingFlow.tsx` → `booking/actions.ts` (server action) | request-bound |
| A2 | portal → API | `apps/portal/lib/api/client.ts`, **`cache: 'no-store'`** | network, uncached |
| A3 | API orchestration | `POST /api/v1/appointments` → `bookAppointment` (`booking.ts`) | — |
| A4 | service resolution | `getBookableService` → `isServiceBookableByPatient` | one query |
| A5 | **lock acquisition** | `acquireSlotLocks`, 15-minute buckets, ascending (`slot-lock.ts`) | serialises contenders |
| A6 | conflict re-check | inside the lock, `apptOverlapExists` / `timeOffOverlapExists` | one query |
| A7 | insert + commit | `appointments` row, pedido kind | one transaction |
| A8 | pedido emit | `emitPatientChange`, post-commit | best-effort, off the path |
| **A9** | **staff agenda learns** | **NOTHING. NO PUSH, NO POLL, NO INVALIDATION.** | **UNBOUNDED** |
| A10 | agenda render | dynamic SSR, fresh DB read per request | request-bound |

### 2.2 Direction B — staff books in the agenda → portal

| # | Hop | Boundary | Latency |
|---|---|---|---|
| B1 | staff submits | `appointment-drawer.tsx` → `createAppointment` (`actions.ts`) | request-bound |
| B2 | **lock acquisition** | `acquireSlotLocks`, same buckets as A5 | serialises against A5 |
| B3 | conflict check | `findConflictsForWindow` + `blockingConflicts` | one query |
| B4 | insert + commit | `appointments` row | one transaction |
| B5 | own-surface invalidation | `revalidatePath("/agenda")` (`actions.ts:579` and 7 more) | immediate, **same app only** |
| B6 | portal learns | next `GET /api/v1/booking/slots`, **uncached** | request-bound |
| B7 | portal render | `listOpenSlots` excludes the window | — |

---

## 3. HOP A9 IS UNBOUNDED, AND IT IS STRUCTURAL RATHER THAN AN OVERSIGHT

**This is the finding.** The PG8 DoD demands: *"Any hop whose latency is
unbounded (a cache with no revalidation trigger, a poll) is named as such rather
than reported with a lucky measurement."* A9 is that hop.

**Why it cannot be fixed with `revalidatePath`.** A portal booking is written by
**`apps/api`**. The staff agenda is rendered by **`apps/web`**. They are separate
Next.js applications on separate Vercel projects (`osteojp-api`,
`osteojp-platform`). `revalidatePath` invalidates the calling deployment's own
cache. **`apps/api` could not invalidate `/agenda` even if it called it — and it
never calls it**, which is asserted in
`apps/api/lib/exposure/sync-single-source.test.ts`.

**What this means in the clinic, stated plainly for the handover:** an agenda
left open on a screen at reception **does not learn about a portal booking**. It
learns when someone navigates, reloads, or triggers `router.refresh()`
(`agenda-view.tsx:322,337`). The data is never *stale on read* — the agenda page
is dynamic SSR and re-queries every request — but **nothing prompts the read**.

**Why this is not a double-booking risk**, which is the question it invites: the
protection is the lock at A5/B2, not the render. Two writers contending for one
window are serialised at the database and one is refused
(`slot-lock-concurrency.test.ts:264,274`), and since `0061` a second *confirmed*
overlap is refused by constraint. **A stale screen cannot create a double
booking; it can only show a receptionist an out-of-date picture.**

**Bounded in the other direction.** B6 has no equivalent gap: every portal API
read is `cache: 'no-store'` (`apps/portal/lib/api/client.ts`), asserted in the
same suite.

---

## 4. WHAT IS ALREADY PROVEN, AND BY WHAT

| Property | Proof | Kind |
|---|---|---|
| a booked window drops out of the offered list | `portal-booking-slot-parity.test.ts:268` | DB-gated |
| offered ⇒ bookable (no step-3/step-4 disagreement) | `portal-booking-slot-parity.test.ts:251` | DB-gated |
| identical windows: only one booking survives | `slot-lock-concurrency.test.ts:264` | DB-gated |
| off-grid overlap: only one survives | `slot-lock-concurrency.test.ts:274` | DB-gated |
| back-to-back windows both succeed (no over-locking) | `slot-lock-concurrency.test.ts:295` | DB-gated |
| concurrent overlapping batches do not deadlock | `slot-lock-concurrency.test.ts:307` | DB-gated |
| a second *confirmed* overlap is refused | `no-double-confirmed.test.ts:141,155` + migration `0061` | DB-gated + constraint |
| **availability has exactly one implementation** | **`sync-single-source.test.ts` (NEW)** | structural |
| **the cross-app hop is unbounded by construction** | **`sync-single-source.test.ts` (NEW)** | structural |

### 4.1 The gap the new suite closes

`portal-booking-slot-parity.test.ts` **re-states** the availability SQL instead of
importing it, and says so in its own header: *"apps/api is not a shared package
this wave, so the availability-list query and the validator predicates below are
duplicated MINIMALLY from `apps/api/lib/appointments/store.ts` … TODO when
store.ts moves into a shared package, import the real builders here."*

So the single-source guarantee — the list a patient is **offered** and the check
their booking is **validated** against coming from one place — was a **comment
plus a duplicated fixture**. A second availability computation added anywhere
would have reddened nothing; it would simply have made the parity suite describe
one of two implementations. `sync-single-source.test.ts` makes it a test.

**Seven negative arms, each applied to a real file, run, observed, reverted.
Baseline 8/8.**

| # | Defect introduced | Red |
|---|---|---|
| 1 | a second `availabilityCoversExists` in `booking.ts` | 1 |
| 2 | the slot route grows `getDbAdmin().execute(\`select …\`)` | 1 |
| 2b | the same via the drizzle builder, `db.select().from(…)` | 1 |
| 3 | the portal starts `.filter()`ing the API's answer | 1 |
| 4 | `apps/api` starts calling `revalidatePath` | 1 |
| 5 | the staff side stops revalidating (kills the negative control) | 1 |
| 6 | the portal switches `no-store` for `next: { revalidate: 60 }` | 1 |

**Arm 2 is recorded because it FAILED FIRST.** The assertion was originally
`/select … from/` against the **stripped** source — and `strip()` blanks template
literals, which is exactly where SQL lives here. It was **unfalsifiable**: a real
`db.execute` inserted into the route did not redden it. It was rewritten to match
query-builder **call shapes**, which are identifiers and survive stripping. That
is the LOOP 6 lesson repeating inside LOOP 7, and it was caught only by running
the arm.

---

## 5. WHAT PG8 STILL NEEDS. This document does not close it.

| DoD line | State |
|---|---|
| An automated test proves each direction, not a manual observation | **PARTIAL.** Direction B (staff → portal) is proven DB-gated. Direction A's *write* is proven; its *appearance on the agenda* is not covered end to end. |
| The trace names every hop and its timing, in both directions | **HOPS: DONE (§2). TIMINGS: NOT MEASURED.** Every latency above is characterised (`request-bound`, `one query`, `UNBOUNDED`), which is not the same as measured. |
| The contention control passes and the loser is REFUSED | **DONE**, `slot-lock-concurrency.test.ts`. |
| Any unbounded hop is named as such | **DONE (§3)**, and now asserted by test. |
| Lint, typecheck, unit, DB-gated, e2e, build pass | **NOT RUN for e2e** this session. |

**The honest remaining work is one e2e spec and one measured run.** A portal
e2e spec must drive a booking and then assert the row on the staff agenda, with
timings captured per hop. **Precedent exists and the brief is wrong about this:**
the LOOP 7 brief states *"there are no portal e2e specs at all today. If this
proof needs one, you are creating the first."* Two exist —
`apps/web/e2e/portal-booking-request-mode.spec.ts` (shipped with W13-04, drives
the real portal booking flow) and `apps/web/e2e/portal-reminders.spec.ts`.

**And one green run will not do it.** The brief's own words: *"One green e2e run
proves nothing that can race. Run it enough times to mean something and say how
many."*


---

## 6. WHY PG8 IS NOT FLIPPED IN THIS COMMIT

**The e2e cannot be run in the session that wrote it.** No Docker daemon, no
local Postgres, no `DATABASE_URL` — which is also why `pnpm test` reports 33
skipped: every DB-gated suite skips for the same reason.

**So CI is the run.** `apps/web/e2e/sync-portal-agenda.spec.ts` executes under
the **Playwright E2E (seeded DB)** required check, against the seeded database and
all three apps. Until that check is green on the PR carrying it, **direction A is
an unrun assertion**, and a gate flipped on unrun code would be worse than any of
the citation errors LOOP 6's audit turned up — those were pointers to tests that
existed and passed.

**One green run will not be enough either**, and the brief says so: *"One green
e2e run proves nothing that can race. Run it enough times to mean something and
say how many."* Direction A crosses an app boundary and reloads; the count has to
be stated when it is claimed.

### 6.1 The first draft of the spec was rejected, and by which rule

The first version asserted that the portal booking page rendered controls and
that the agenda rendered a heading. **It proved that two surfaces render, not
that they sync** — a shape assertion wearing the filename `sync-portal-agenda`.

It was caught by this project's own criterion A on `ACC-vacuous-guard-sweep`:
*proximity is not evidence.* A file named for a property, sitting in the e2e
directory, passing green, is exactly what a future auditor would count as PG8
coverage. It was rewritten to use **two browser contexts** — the patient books on
the portal, reception reads the agenda — with a **baseline read before the
write**, so a row that was always there cannot be mistaken for a row that arrived.

**The skip is deliberate and is not a hole.** When the seeded calendar offers no
slot on the run day, the test SKIPS rather than fails: availability comes from
seeded templates and the run day moves, so a red there would be testing the seed
and would be the first thing anyone disabled.


---

## 7. THE FIRST CI RUN WENT RED, AND BOTH CAUSES WERE MINE

**Run `31613104285`, shard 3/3. 43 passed, 1 failed, 1 skipped.** The artifact was
read before anything was changed, per this project's e2e doctrine. Neither cause
was a product defect.

### 7.1 The failure: a locator that could never be visible

```
waiting for getByText(/Linda-a-Velha/i).first()
62 × locator resolved to <option value="…">Linda-a-Velha</option>
     - unexpected value "hidden"
```

Direction B asserted the location name was visible on the agenda. It resolved to
an `<option>` inside the location `<select>` — and an `<option>` is **never**
visible to Playwright until the select is opened. **The agenda was healthy; the
assertion was impossible.** It now asserts the `Hoje` toolbar button, a real
visible control, which is the honest "this page loaded for an authenticated user"
signal.

### 7.2 The skip, which was the worse of the two

**Direction A SKIPPED.** It would have skipped in a green run too, and a skipped
test inside a passing shard reads as coverage. **The spec would have gone green
having proven nothing about the one direction PG8 needs.**

The cause was in the helper's return type. `bookFromPortal` returned
`string | null`, and `null` meant **four different things**: no service rows, the
date/time step never appearing, no slot offered, or no submit control. The caller
skipped on all of them alike.

**That is the same defect this project keeps finding in its own guards** — an
unknown case collapsing silently into a benign-looking one, structurally
identical to the `?? e.kind` fallback that let INC-09 ship a raw enum to
reception.

It now returns a discriminated result and the two meanings are separated:

| Outcome | Meaning | Behaviour |
|---|---|---|
| `flow-broken` | the flow did not reach a step it should have | **FAILS**, with the step named |
| `empty-calendar` | the flow worked; no slot on the run day | skips, and **announces itself in the log** |

**A permanently-skipping test is now visible rather than silent.**

### 7.3 What this means for PG8

**Direction A remains UNPROVEN until a CI run reports it as passed rather than
skipped.** That is now a *named, observable* condition instead of a quiet one —
which is the only reason this document can honestly describe the state at all.
PG8 stays open.


---

## 8. THE SECOND CI RUN WAS GREEN AND DIRECTION A STILL SKIPPED

**Run `31614238872`, all three shards green, PR #879 merged as `1cdb36f`.**
Direction B **passed and was measured**. Direction A **skipped**, and the
instrumentation added in §7 is the only reason that is visible at all:

```
[W13-07] A: portal booking submitted: 15806ms
[W13-07] DIRECTION A SKIPPED — date/time step offered no slot. Direction A is UNPROVEN in this run.
[W13-07] B: portal slot list first paint: 521ms
```

**A GREEN REQUIRED CHECK, A MERGED PR, AND THE GATE'S CENTRAL DIRECTION UNTESTED.**
That is the entire argument for not flipping PG8 on a green run, made by the run
itself.

### 8.1 I read my own skip reason wrong, and the seed was never at fault

The message said "date/time step offered no slot", and §7 recorded that as the
legitimate `empty-calendar` case — the seeded calendar being thin on the run day.
**That reading was wrong.**

**Step 4 preselects no date.** `BookingFlow.tsx:486` renders
`choose_date_prompt` until the patient picks a day, so slot buttons cannot exist
before a date is chosen. **The helper never opened the date picker.** It looked
for slots on a screen that had not been asked for any, found none, and reported
an empty calendar — every run, forever.

**The seed was fine all along.** `seed-e2e.mjs:365-368` gives 09:00–13:00
availability on **weekday 1 (Monday)** at Linda-a-Velha — the same Monday-only
shape `portal-booking-slot-parity.test.ts` documents in its own header, and the
same *class* of constraint as the production `ZZ TESTE THERAPIST` covering
Saturday only. The slots existed and nothing had asked for them.

### 8.2 The fix, and why the first enabled day is the right one

The picker's enabled range is `[availableDates[0], availableDates[last]]`
(`BookingFlow.tsx:457-458`), and `availableDates` is `Object.keys(byDate)` — the
days that actually carry slots. **So the first enabled day is by construction a
day with availability**, whatever weekday the run lands on. The helper now opens
the picker and takes it, and enabled days are gridcells without `aria-disabled`.

A day the picker declares selectable that then carries no slot is now reported
with its own distinct message, because that would be a real disagreement between
the two and is worth seeing rather than absorbing.

### 8.3 The lesson, which is the same one for the third time

**A skip reason I wrote, I then trusted.** `empty-calendar` was my own label,
attached to a condition I had not verified, and it read as a fact about the seed
on the next pass. Criterion A on `ACC-vacuous-guard-sweep` — *proximity is not
evidence* — applies to a test's own diagnostics as much as to a citation: the
message was next to the failure, not derived from it.


---

## 9. THE SEED CARRIES MONDAY-ONLY AVAILABILITY. DO NOT DIAGNOSE THE SEED AGAIN.

**Recorded permanently because two sessions were spent reaching for it.**

`apps/web/e2e/seed/seed-e2e.mjs:365-368` seeds availability templates of
**09:00-13:00 on WEEKDAY 1 (Monday) at Linda-a-Velha**, for two therapists, and
nothing else. `portal-booking-slot-parity.test.ts` documents the same shape in
its own header: *"one ACTIVE therapist whose availability template covers ONLY
Monday 09:00-19:00 at the LV location"*.

**IT IS THE SAME CLASS OF CONSTRAINT AS PRODUCTION'S `ZZ TESTE THERAPIST`
COVERING SATURDAY ONLY** — a deliberately narrow window that isolates test
bookings from real clinic days. In both cases a runner who does not know it reads
a working booking flow as an empty calendar.

**So an empty slot list in CI is never "the seed is thin".** It means the seed,
the availability query, or the date picker has regressed, and it now FAILS rather
than skips (see §10).

---

## 10. THE SKIP IS NOW IMPOSSIBLE TO MISS

Two independent guards, because the failure they prevent survived one of them
already.

**GUARD 1 — the test fails rather than skips, in CI.** `empty-calendar` was
justified as "a red there would be testing the seed". §9 removes that
justification: the seed provably carries Monday availability. In CI the test now
throws with the reason; locally it still skips, because a developer's database
need not be seeded. Keyed on `process.env.CI`, which this repo does not set and
therefore cannot silence.

**GUARD 2 — `.github/scripts/assert-e2e-executed.mjs`**, the E2E analogue of
`assert-rls-executed.mjs`. Playwright's `json` reporter is now configured, and
every shard runs the guard with `if: always()`. It asserts:

1. every hard-required spec **file still exists** — a rename or delete appears in
   no report and is otherwise caught by nothing;
2. any hard-required test **present in this shard's report has status `passed`**.
   `skipped` is red.

It is absent-tolerant per shard by design, because `--shard` puts a given test in
exactly one report; check 1 is what covers deletion.

**Six arms, measured by exit code rather than by reading the output** — the first
attempt piped through `tail` and read `tail`'s status, reporting 0 for a guard
that had correctly returned 1:

| Arm | Expect | Got |
|---|---|---|
| hard-required test skipped | 1 | 1 |
| hard-required test passed | 0 | 0 |
| hard-required spec deleted | 1 | 1 |
| test absent (another shard) | 0 | 0 |
| empty report | 1 | 1 |
| report file missing | 2 | 2 |

### 10.1 The sweep: how big this problem actually is

**39 vitest suites can skip inside a passing required check with nothing
reddening.** 52 skippable suites, 14 hard-required by `assert-rls-executed.mjs`,
39 unguarded. On the e2e side, 2 of 57 specs carry a skip and one of them is now
guarded.

**THREE OF THE 39 ARE CITED AS ENFORCEMENT POINTS IN THIS PROJECT'S OWN GATE
DOCUMENTS**, which makes this more than hygiene:

| Suite | Cited as | Gate |
|---|---|---|
| `portal-booking-slot-parity.test.ts` | "a booked window drops out of the offered list" | PG8, §4 |
| `slot-lock-concurrency.test.ts` | the contention control, "only one survives" | PG8, §4 |
| `otp-revoke.db.test.ts` | MH-04, the trusted-device revoke | PG6 matrix |

If any of those skips, the citation points at a test that did not run — the same
defect the LOOP 6 citation audit found in a different form, one layer down.
**Counted, not fixed, this dispatch.** Carded.


---

## 11. THE THIRD CI RUN: BOTH GUARDS FIRED, AND THEY CAUGHT MY OWN REASONING

**Run `31617753535`, shard 3/3.** This is the run that proves §10 works, and it
failed for a reason §8 had asserted was impossible.

```
Error: DIRECTION A COULD NOT RUN: a selectable day carried no slot.
E2E SKIP-GUARD RED — HARD-REQUIRED E2E TEST DID NOT RUN
```

**Both guards fired independently.** Guard 1 turned what would have been a silent
skip into a test failure; guard 2 reddened the job from the report, without
knowing anything about why. **A skip inside a passing shard is no longer
possible for this test.** That was the objective and it is met in real CI, not in
a local simulation.

### 11.1 The claim §8.2 made, withdrawn

§8.2 said: *"the first enabled day is by construction a day with availability."*
**FALSE.** `DatePicker.tsx:119`:

```ts
const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max);
```

`inRange` is a **closed interval**, not set membership. `min` and `max` are the
first and last available dates, so **every day between them is enabled** — and
the seed's availability is **Monday only**, so six days in seven are enabled and
carry nothing. The helper clicked the first enabled day, which was simply the
first day of the range, and found no slots. Correctly.

**The fix walks the enabled days in order until one yields slots**, bounded at 14,
reopening the popover each time because selecting closes it. The failure detail
now names how many were tried.

### 11.2 Three wrong readings in one loop, each caught by the layer below

| # | The claim | Caught by |
|---|---|---|
| 1 | `strip()`-based anti-SQL assertion is meaningful | running the negative arm |
| 2 | "empty calendar" means the seed is thin | reading the seed |
| 3 | "first enabled day has availability" | **CI, because guard 1 made it red** |

**The pattern is the point.** Each was a plausible statement about code I had
read, and none survived contact with the thing it described. The reason the third
one surfaced within minutes rather than sitting green for weeks is that the guard
built in §10 removed the option of failing quietly.
