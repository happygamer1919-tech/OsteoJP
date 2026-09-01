# PERF-05/06. RLS IS THE COST, FLUID IS THE MULTIPLIER, AND EVERY EARLIER NUMBER IS WRONG

**BLUE, platform terminal, 2026-09-02. Base `origin/main@68d249dc`.**

Nothing here touched production. A disposable `postgres:16` and a disposable
PgBouncer on `127.0.0.1`, plus a local Supabase stack for the DB-gated proof,
all destroyed afterwards. **No production read of any kind was performed.** The
production figures quoted in §1 and §2 were pasted by the owner.

---

## 0. THE THING EVERY EARLIER HARNESS IN THIS PROJECT GOT WRONG

Every performance shim built here — PERF-01's, PERF-03's, PERF-04's, mine — was
built from the migrations' **tables and indexes** and omitted the **policies**.

The omission is invisible from inside the harness. A harness connects as the
owner, and RLS does not apply to the owner, so nothing reports an absence: the
queries run, the row counts are right, and the numbers look like measurements.

**They are wrong by up to 29x.** Same machine, same data, same queries:

| | RLS not enforced | RLS enforced | |
|---|---|---|---|
| `/patients` stat strip (one pass) | 38 ms | **1,087 ms** | **29x** |
| `/patients` list count | 67 ms | 481 ms | 7.2x |
| list page, sort by name | 23 ms | 7.7 ms | RLS narrows it |
| list page, **sort by last visit** | | **944 ms** | 123x vs sort by name |

Now SR-24. The old numbers are marked superseded on the board rather than
deleted: the record has to show what was believed and why it was wrong.

---

## 1. THE 59 SECONDS WAS REAL

Production reported `/patients` at a p75 duration of **59 s** while every other
route was milliseconds or low seconds, with **Active CPU of 64 ms per
invocation**. A huge duration next to almost no CPU is a function waiting on
I/O, and the only I/O on that page is three Postgres queries.

**It is not a metric artefact.** `/patients` has no `loading.tsx` (deliberately —
the page's own header records the e2e failures that proved a segment boundary
turns `[id]`'s `notFound()` into a streamed 200), no `after()`, no `waitUntil`,
no server action and no `maxDuration`. Nothing holds the invocation open.

### 1.1 Cause one: RLS costs per row, and the cost is helper calls

`EXPLAIN ANALYZE` on the stat strip, RLS enforced:

    Aggregate                                    1,244 ms
      Hash Left Join                     768 -> 1,244 ms
        Seq Scan on patients            25.5 ->   500 ms   <- per-row RLS helpers
          Filter: ... (NOT viewer_has_location_assignment())
                  OR patient_appt_at_viewer_location(id)
                  OR location_in_viewer_scope(primary_location_id) ...
        HashAggregate over appointments          743 ms    <- per-row RLS helpers

Both halves are helper calls, not query shape. The helpers are `SECURITY
DEFINER`, which Postgres **cannot inline**, so each is a real call with its own
plan. The stat strip's `UNION ALL` scans `appointments` **twice** (once per
participant column), so `appointments_rls` fires on roughly **82,858 row visits
per page load**.

PERF-07's rewrite was correct and is not the problem. It made the query 4.5x
cheaper and RLS then multiplied what was left.

### 1.2 Cause two: Fluid puts many invocations on one instance sharing `max: 2`

`packages/db/src/client.ts` opens **one** pool per process. Under Fluid one
instance serves many concurrent invocations and they all share it, so two
connections served the whole instance and the queue lived **inside the
application**, where no dashboard looks.

One instance, `max: 2`, RLS on, `sort=name`:

| concurrent renders | 1 | 4 | 10 | 20 | 40 | 60 |
|---|---|---|---|---|---|---|
| p75 | 1,459 ms | 3,608 ms | 9,597 ms | 19,830 ms | 33,872 ms | **54,094 ms** |

Linear in concurrency, zero errors at every level, on hardware with more CPU than
a t3a.small and no throttling.

**How much concurrency production actually saw is not claimed here.** Reaching
59 s needs either a burst of that size or a per-query cost several times mine,
and a throttled 2-vCPU burstable instance plausibly supplies the second. Both
roads run through the same two causes.

### 1.3 The two fixes, measured separately so they are attributable

60 concurrent, RLS on, `sort=name`:

| | `max: 2` | `max: 6` |
|---|---|---|
| policies as shipped | **53.4 s** | 27.0 s |
| 0071 wrap applied | 29.8 s | **15.2 s** |

Pool max alone **−49%**. The 0071 wrap alone **−44%**. Together **−72%**.
`sort=lastVisit` at 20 concurrent: 24.4 s → 7.7 s, **−69%**.

### 1.4 The order of failure, which is the part worth remembering

Postgres refuses **new** connections at the ceiling and never reclaims an
established one, so whoever already holds a slot keeps it. The app almost never
asks for a new connection; Supabase's own services ask constantly. Connection
exhaustion therefore presents as **the dashboard and API breaking while the
clinic screen still works**, and it reads as a vendor outage rather than as a
setting somebody raised.

---

## 2. N, THE WARM INSTANCE COUNT, DERIVED

PERF-09 was blocked on this number. It is derivable from the figures the owner
pasted, without opening a dashboard.

**Total invocation-seconds**, route by route (invocations × p75 duration):

    /               752 × 0.032 s =     24 s
    /agenda         197 × 2.87  s =    565 s
    /dashboard      224 × 0.374 s =     84 s
    /patients/[id]  204 × 0.068 s =     14 s
    /patients       187 × 59    s = 11,033 s
    /api/inngest     58 × 0.509 s =     30 s
    everything else                     35 s
                                    -------
                                    11,785 s

Against 43,200 seconds elapsed, **mean concurrency is 0.27**. Total Active CPU
across all routes is **108 s**, which is **0.25% CPU utilisation**. Cold start
2.3% of 1.9K is about **44 cold starts in 12 hours**.

One instance is sufficient on both counts, and the cold-start rate is consistent
with a small pool cycling. **N is 1, occasionally 2.**

So `N × max` was **2 clients against 15 pooler slots — thirteen idle.** That is
row one of the PERF-03 matrix, the branch that said raising `max` is a large real
win, and §1.2 shows it was worse than that branch predicted.

**Bounded by both**, as the ruling required: `N × max ≤ 15` (at N=2, six gives
twelve) and `max ≤ 15` (Supavisor's own pool size). **Six.**

Why not higher, at 20 concurrent `/patients` renders with RLS: `max 2` → 19.8 s,
`4` → 10.0 s, `8` → 7.5 s, `15` → 7.1 s. The curve flattens above 8 because the
database CPU becomes the limit — SR-20's finding one layer down. Six is on the
steep part and inside the bound.

**SR-20 is untouched.** It governs Supavisor's `pool_size`, a console setting.
This is the application's own client pool.

---

## 3. SR-23 — THE RLS AUDIT, RE-RUN MECHANICALLY

The PERF-05 audit claimed **69 policies, 11 unwrapped, none on a large table**.

**The true count: 80 live policies across 39 tables. 23 carry an unwrapped
NULLARY call. 22 are on a non-bounded table.**

### 3.1 What it missed is a class, not a miscount

A policy can carry **both** kinds. `patients_select`, `patients_update`,
`patients_delete` and `appointments_rls` each call a **correlated** helper —
which must not be wrapped, and the old audit was right about that — **and**
`public.viewer_has_location_assignment()`, which takes no arguments and can be.
The audit classified those policies by the correlated call and stopped reading.
They are the two largest tables in the database.

### 3.2 The twelve the old list does not contain

| size | policy | unwrapped call |
|---|---|---|
| PATIENT-SCALE | `patients_select`, `patients_update`, `patients_delete` | `viewer_has_location_assignment` |
| EVENT-SCALE | `appointments_rls` | `viewer_has_location_assignment` |
| EVENT-SCALE | `consultations_select_own_tenant` | `jwt_tenant_id` |
| PATIENT-SCALE | `patient_followup_postponements_{select,insert,update}_own_tenant` | `jwt_tenant_id` |
| UNKNOWN | `patient_followup_contacts_{select,insert}_own_tenant` | `jwt_tenant_id` |
| UNKNOWN | `guest_booking_requests_{select,update}_own_tenant` | `jwt_tenant_id` |

Every one verified against the source SQL by hand. They are declared **without
double quotes** around the policy name (`CREATE POLICY consultations_select_own_tenant`),
which is why a quoted grep finds nothing — worth knowing before re-checking this.

The eleven the old audit did find are all still in the list, unchanged.

### 3.3 THIS AUDIT'S OWN FIRST DRAFT HAD THE SAME CLASS OF BUG

Recorded because it is the more useful half. The first detector used one regex of
the form `(\(\s*select\s+)?name\s*\(`. That matches `AND (` first — `AND` is a
name followed by a parenthesis — and **consumes the opening parenthesis of the
very `(select ...)` it exists to detect**. Every wrapped call preceded by `AND `
read as unwrapped.

It reported **29** instead of 23, including `staff_locations_delete`, which is
correctly wrapped. Caught by spot-checking the output against the source SQL
**before** publishing a number. The fixed detector matches known helper names and
then looks **backward**, so nothing it does can consume a delimiter it needs.

**An audit that corrects an audit has to be checked harder than the one it
corrects, not less.**

### 3.4 What 0071 closes, and what it does not

0071 closes **two** of the 23 — the two `/patients` measured — and SR-22 bounds
it there. The remaining **21** stay on the PERF-05 card, tagged post-launch, and
SR-23 requires this report before any further migration is authored for them.

The four correlated helpers stay untouched and 0071's own test asserts they stay
unwrapped, in both directions.

---

## 4. THE 48h EMAIL — THE REPO CANNOT PROVE IT, AND HERE IS WHY

**Designed and armed is not sent, and this repository cannot close the gap.** The
evidence lives in Inngest run history and Resend delivery logs, both production,
both owner-only under standing rule 1.

What the repo does establish, and two of these change what an answer will mean:

1. **Reminders are event-driven, not cron.** `scheduleAppointmentReminders`
   triggers on `appointment/scheduled`. An appointment already in the diary
   before the emit path worked has no reminder scheduled and never will.
2. **An appointment booked less than 48 hours ahead never gets a 48h email at
   all.** `computeDueReminders` drops any offset whose send instant has passed
   (`offsets.ts:70-76`). Correct behaviour, and a real coverage limit for a
   clinic that books same-week.
3. **The preference is re-read at SEND time**, not at schedule time
   (`dispatch.ts:405`), so 0070's backfill retroactively enables email for
   reminders already sleeping in Inngest.
4. **The timing makes zero the expected answer so far.** #1083 merged 2026-08-31,
   0070 applied 2026-09-01. A 48h email fires 48 hours *before* a start, so the
   earliest possible one belongs to an appointment booked since 2026-08-31
   starting on or after 2026-09-02. **A zero here is probably arithmetic, not a
   defect.**
5. `LE-suppression-observation` is still blocked on Ivan and is step 3 of
   LAUNCH-01's sequence. Its note says no reminder has executed end to end. It
   was last checkpointed 2026-08-05 and may be stale, but nothing supersedes it.

**The gate chain a send must clear**, in `dispatchReminder`'s own order, so a log
line can be read against it: `not_found`, `status`, `unconfirmed` (the pedido
gate #1083 fixed), `channel_not_for_offset`, then `planReminderChannels`
(`lead_time_off`, `no_contact`, `channels_off`), then the approval registry, then
`REMINDERS_LIVE_SEND`.

### 4.1 The two reads, for Ivan's own hands

Both are read-only. Neither is a write.

**READ A — Inngest, and it is the decisive one.** Inngest dashboard → app
`osteojp-reminders` → Runs → function **`send-appointment-reminder`**. Filter to
runs since **2026-08-31**. For each run open the output of the `dispatch` step:

- `{"dispatched": true, "channels": ["email"]}` → **an email was attempted.**
  Note the count and one appointment id.
- `{"dispatched": false, "reason": "..."}` → read the reason against the gate
  chain above. `lead_time_off` means the appointment was booked inside 48 hours;
  `channels_off` means the patient has no email or has it disabled.
- **No runs at all** → nothing was ever scheduled, which points at the emit path
  rather than the reminder path, and `scheduleAppointmentReminders` is the
  function to look at instead.

**READ B — Resend, which confirms delivery rather than intent.** Resend dashboard
→ Emails → filter to the sending identity `send.osteojp.pt`, since 2026-08-31.
A reminder body starts `Olá` and carries `Lembrete da sua consulta`. Delivered,
bounced, or absent are three different answers and only the first closes this.

**Both are needed.** Inngest says whether the code decided to send; Resend says
whether anything left the building. `dispatched: true` with nothing in Resend
means `REMINDERS_LIVE_SEND` is not armed, and that is a one-line answer nobody
currently has written down.

---

## 5. THE STAT STRIP — OPTIONS AND NUMBERS, REPORT ONLY

RLS on, 0071 applied, `max: 6`, `sort=name`:

| stat strip | 20 concurrent p75 | 60 concurrent p75 |
|---|---|---|
| critical path (as shipped) | 4,815 ms | 17,492 ms |
| streamed (Suspense island) | 5,419 ms | 14,187 ms |
| not run at all (a cache hit) | **1,481 ms** | **4,634 ms** |

**Streaming is not a fix, and the numbers say so in both directions.** At 20
concurrent it is 13% *worse*; at 60 it is 19% better. Non-monotonic, because the
query still runs and still competes for the same six connections — not waiting
for it does not reduce the work, it only changes who waits. That is SR-20's
finding one layer up: relocating a wait is not creating capacity.

**Not running it removes 69% at 20 concurrent and 73% at 60**, because the work
does not happen.

**A segment `loading.tsx` is forbidden on this route and is not one of the
options.** `app/patients/page.tsx` states it as spec, with the failure that proved
it: one was added under PERF-02 and shard 2 went red on `patients.spec.ts:288`
and `isolation-therapist.spec.ts:44`, both "expected 404, received 200", because
the boundary wraps `/patients/[id]` too. A `<Suspense>` boundary **inside**
`page.tsx` is a different thing and is permitted.

**Recommended:** a short `unstable_cache` on `getPatientListStats`, keyed on
`(tenantId, role, userId, locationId)` exactly as the agenda's reference read is,
`revalidate: 60`, tag invalidated on patient create/delete. It is the only option
measured to remove the cost rather than move it, and the cadence already exists
here.

**What it costs:** a receptionist who creates a patient does not see `total` tick
up for up to 60 seconds. The other three move on clinical events that are not the
viewer's own action, so staleness there is unobservable in practice.

**The third option, which the numbers point at and which is entirely the
owner's:** do not compute it on this page at all.

---

## 6. THE CONFIRM-LINK TOKEN — STATELESS IS NOT SOUND

**The budget, from JP's approved line:**

    SMS_SEGMENT_LIMIT                                160
    24h pt body, worst case                           99   block 61 incl LF, LINE 60
    `Confirmar: osteojp.pt/c/XXXXXXXX`                32   message 132, margin 28
    prefix `Confirmar: osteojp.pt/c/`                 24   CODE budget: 36 chars

**Reason 1, arithmetic.** A stateless token must carry the appointment id (128
bits), the tenant id (128 bits — hard architecture rule #3 requires the public
route to enter tenant-scoped RLS from a value *we signed*) and a truncated HMAC
(96 bits is the floor for an unauthenticated write path). **352 bits = 59
characters against 36 available. Over by 23.** And the rule-violating variant
also fails: dropping tenant_id gives 224 bits = 38 characters, **still over by
2**. There is no stateless shape that fits, not even one that breaks the
architecture rule to try.

**Reason 2, independent of length: one-time use cannot be stateless.** "Already
used" is a fact about the past and the only place that can live is a row.
`action_token_consumptions` (0054) exists for exactly this.

**Idempotency does not substitute.** *Confirm* is idempotent in effect
(`agendada → confirmada`). ***Pedir remarcação* is not** — each press emits
another `appointment_request` into reception's queue. The second action is
precisely the one that needs consumption state. And counsel's property depends on
it: W13-01 proved "a second redemption is refused **identically** to a forged
token" by deep equality of the two response objects.

**Reason 3.** `action_token_consumptions` cannot serve as the store: written at
*redemption*, primary key `token_hash` under a `^[0-9a-f]{64}$` CHECK, no `exp`,
no `scope`, append-only trigger. Pre-inserting at issue time would make every
token read as already spent.

**So: a short-code table, and a migration number is owed. 0071 is taken; the next
free is 0072.**

With a stored code, JP's 8 characters carry **48 bits = 2.8 × 10¹⁴ codes**, ample
against an *online* guessing attack behind the rate limiter that already guards
`/r/[token]`. There is nothing to attack offline. The 28 characters of margin
allow a longer code at no copy cost if counsel wants one (22 characters would put
the line at 46 of 60 and carry 132 bits) — but that is a copy change and JP
approved eight.

**The fee sentence had to leave the SMS.** Body 99 + LF + link 32 = 132, plus the
fee line 53 + LF = **186, over by 26**. `renderSms` throws rather than splitting.

---

## Reproduction

`docker network`, `postgres:16`, `edoburu/pgbouncer` in `pool_mode = transaction`
with `default_pool_size = 15` and `max_client_conn = 400`. Schema, index set
**and RLS policies** transcribed from `packages/db/migrations` (0001, 0012, 0047,
0048, 0049, 0068); `auth.jwt()` and `auth.uid()` are Supabase's standard
definitions and are the one declared stand-in. Seeded to 8,400 patients / 41,429
appointments / 35,720 completed / dual = 0, verified after seeding rather than
assumed; `ANALYZE` before measurement. The 0071 proof ran against a full local
Supabase stack with all 71 migrations applied by `supabase db reset`. Every
container disposable and destroyed; no credential, no production host.
