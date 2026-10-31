NOT READY: awaiting R4 review

# R36: the fallback re-arm of the reminders, for the night of Wednesday 2026-11-04

**Status: AUTHORED 2026-10-31 BY SOLO. NOT REVIEWED (the R4 round is open). NOT REHEARSED (see "Rehearsal"). NOT RUN.** Nothing in this document may be pasted until the first line reads READY. The blocks below carry `PENDING` in the three lines GREEN's dispatch fills, and STOP at their first check while they do.

**In plain words.** The reminder re-arm of 2026-10-12 gave a fresh reminder job to every appointment starting within 28 days of that night. Appointments further ahead were left to the reminder sweep, which still runs in shadow and sends nothing. If the sweep is not switched to sending on Wednesday 2026-11-04, this document runs the same re-arm once more that night, for every appointment starting within the next 28 days, behind a refusal that stops it if the sweep is sending. It writes nothing to the database. It sends one scheduling event per appointment to the scheduler, which plans that appointment's two reminders again.

**It runs ONLY if the sweep stays in shadow.** If the owner sets the sweep to send that night (R36), this document is not used. See "This op must NOT run if the sweep is in send mode".

| Fact | Value |
|---|---|
| Ruling | Strategy, R36, 2026-10-31 (quoted in the next section): "If not clean: the authorised fallback re-arm sitting runs Wed 11-04 night instead. Have that document READY by Wed 11-04 18:00 either way" |
| Program | `packages/db/scripts/r36-fallback-rearm-emit.mjs` (new, this branch). It runs `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` (the program of 2026-10-12, UNEDITED) by importing its `run()`, behind the sweep refusal, with its own marker and counts-only output |
| Tests | `scripts/r36-fallback-rearm-emit.test.mjs` (the program) and `scripts/r36-fallback-rearm-20261104.test.mjs` (this document: its blocks under fault injection, its pins, its dates), both fed by `scripts/r36-fallback-rearm-sitting.mjs` (a whole sitting run in-process through the 2026-10-12 `run()`). The 2026-10-12 program keeps its own `scripts/inc-1007-rearm-reminders-emit.test.mjs` |
| Who runs it | GREEN, an apply-only session, on the owner's dispatch naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`, in a closed window with the owner at the keyboard. SOLO wrote it and never runs it |
| Run from | The HELD head of this branch's pull request, `origin/data/R36-fallback-rearm-20261104`, in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. The pull request merges after GREEN's clean report |
| When | The night the dispatch names (RUNDAY, a Monday to Friday): from 21:00 Lisbon that day until 06:29 Lisbon the next morning. R36 names Wednesday 2026-11-04 |
| Scope | `--max-days-ahead 28`: appointments starting more than 24 hours and no more than 28 days after each read |
| What it sends | One `appointment/scheduled` event per eligible appointment, `confirmationEligible: false`, with NO event id of its own: the scheduler gives each event a fresh id |
| What it writes to Postgres | Nothing. Every read is a READ ONLY transaction |
| What it writes locally | Its marker `~/.osteojp-r36-fallback-rearm/.osteojp-inc1007-rearm.json` and, while a run sends, the lock beside it. Records and transcripts under `/tmp/r36-` |
| Production tenant | `--tenant-slug osteojp` |
| Rollback | None is needed and none exists, as on 2026-10-12 |
| Replay | Never pressed, by anybody, on any event or run |
| Tier | C, a production data op: held, R4 before READY |

## The ruling (strategy, 2026-10-31, R36)

Strategy's words, character for character, as the dispatch quoted them:

> R36 SWEEP CALENDAR (the Fri 11-06 deadline stands):
> - Sun 11-01 by 18:00 Lisbon: #1678 finished with R33 to R35. [...]
> - Mon 11-02 and Tue 11-03: shadow, two full days.
> - Wed 11-04 after 07:15 Lisbon: compare. Its dispatch is READY by Tue 11-03 21:00.
> - If clean under R32, with zero sweep-sent S5 rows: the owner sets REMINDERS_SWEEP_MODE=send and REMINDERS_SWEEP_NEVER_REMINDED=on together, Wed 11-04 after 21:00.
> - If not clean: the authorised fallback re-arm sitting runs Wed 11-04 night instead. Have that document READY by Wed 11-04 18:00 either way, and state in your report exactly what breaks on 11-06 if neither happens.

## What breaks on Friday 11-06 if neither the switch nor this fallback happens

### In plain words

A reminder goes out only if a job is asleep for it at the scheduler and is still alive when the reminder's time comes (48 hours before the visit for the email, 24 hours before for the SMS). Such a job is made each time the clinic saves the visit, and it sleeps from that save until the reminder's time. The sweep, in shadow, sends nothing (`apps/web/lib/reminders/sweep.ts`).

The scheduler's free plan publishes 30 days as the longest a job may last, its sleep included. On this account, sleeps of 7 to 30 days are observed to work (the owner's read of 2026-10-08: 130 of 130 SMS and 133 of 133 emails). Longer than 30 days has never been observed, and what the scheduler does with such a job is NOT ESTABLISHED (board card `OPS-scheduler-free-plan-30-day-run-limit`).

The re-arm of 2026-10-12 gave a fresh job, sleeping at most 27 days, to every qualifying appointment starting up to Monday 2026-11-09 (its reach, below), except those saved in the 25 hours before it, which had a job from that save. Every appointment saved after that night has a job of its own from that save. So:

- **Nothing breaks on Friday 11-06 itself.** No reminder whose job the repository cannot account for falls due on Friday 11-06 or on Saturday 11-07 (one exception, below). The gaps that exist on any day (a save whose event failed, a patient's own move in the portal, both under "Which appointments get an event") are not specific to 11-06 and are not counted here.
- **From Sunday 2026-11-08 at 08:00 Lisbon (WET),** the 48 hour emails of the visits of Tuesday 2026-11-10 fall due; from Monday 2026-11-09 at 08:00, their 24 hour SMS and the emails of Wednesday 11-11; and so on, every day. For each of those visits whose last save by the clinic came more than 30 days before the reminder's time, the reminder depends on a job sleeping longer than anything ever observed to work. That covers every visit of a weekly series booked more than about a month ahead, and every such visit last saved before the reminder fix of 2026-10-07, whose job the incident of that week may already have destroyed.
- **Nothing records a reminder that is lost this way.** A job that never wakes writes no ledger row, no error and no alert, and no screen lists appointments without a reminder (the nearest is Comunicações, Lembretes SMS, which shows only attempts).
- **The exception.** A visit of Monday 2026-11-09 starting between 20:48 and 20:59 may be beyond the 2026-10-12 reach (below). Its email would fall on Saturday 2026-11-07 from 20:48, its SMS on Sunday 2026-11-08 from 20:48.
- **Visits that were never saved by the clinic** (an imported visit, for one) have never had a reminder job. Nothing changes for them on 11-06: they get nothing today and they get nothing after. They are the visits REMINDERS_SWEEP_NEVER_REMINDED=on would add to a sending sweep.

So "the Fri 11-06 deadline" holds with two days of margin before the first reminder at risk, and Wednesday 11-04 with four. The repository does not say how 11-06 was derived ("the day the first of those further appointments comes inside 28 days", `CLAUDE.md`, 2026-10-13); it is not re-derived here, only checked against the code and the record.

### The predicate

A reminder, of visit `v` at offset `o` (48 hours, the email; 24 hours, the SMS), is AT RISK on a day when all of these hold:

1. `v` is of tenant `osteojp`; its status is `scheduled` or `confirmed`; its patient is not deleted; it is not an online request reception has not accepted (the three tests of `public.is_unconfirmed_pedido`, as `inc-1007-rearm-reminders-emit.mjs` derives them).
2. `v.starts_at > R`, where `R` is the reach of the re-arm of 2026-10-12. `R` is at least **2026-11-09 20:48 WET**: the sitting's first read was at 21:48 WEST on 2026-10-12 (20:48 UTC) and every run of it had `--max-days-ahead 28`. Its closing dry run, before 23:24 WEST, printed `ELIGIBLE: 0`, so `R` is that read plus 28 days, at most 2026-11-09 22:24 WET. The exact instant of that read is in GREEN's report of 2026-10-12 and in that sitting's marker, not in the repository.
3. Its time, `mark = v.starts_at - o`, falls on that day.
4. `S`, the newest scheduling save of `v`, satisfies `mark - S > 30 days`. A scheduling save is an `audit_log` row of the visit with one of the actions `hasSchedulingEvent` reads (`apps/web/lib/reminders/reminder-population.ts`): `appointment.create`; `appointment.reschedule`; `appointment.update` with `toStatus` `scheduled` or `confirmed`, or with `via` `portal_request_confirm`; `appointment.sms_reply_reviewed` with `resolution` `confirmed` and `applied` `true`; `appointment.patient_sms_reply` with `outcome` `confirmed`.

Two consequences, by arithmetic:

- Every `v` of rule 2 whose `S` is before **2026-10-07 20:45 WEST** (the owner's Resync that made the fix live) meets rule 4 for both reminders: its earliest mark is 2026-11-08 08:00 WET, 31.5 days later. That subset is also the one the incident could have emptied.
- A visit of rules 1 and 2 with NO scheduling save has no job at all and is not at risk by this predicate: it never had a reminder (see the last bullet above).

The same predicate as one statement, for reading only. **It has never been run anywhere and nothing in this document runs it**; a count of the at-risk reminders would need its own read-only block and its own rehearsal:

```text
appointments v, tenants t, offsets o in ((48 hours, email), (24 hours, sms)):
  t.slug = 'osteojp' and v.tenant_id = t.id
  and v.status in ('scheduled', 'confirmed') and patient(v).deleted_at is null
  and not unaccepted_request(v)
  and v.starts_at > R                              -- R >= 2026-11-09 20:48 WET
  and (v.starts_at - o) - max(scheduling_save(v).created_at) > interval '30 days'
```

### The first affected dates

| Lisbon time (WET) | What falls due that depends on a job sleeping more than 30 days |
|---|---|
| Friday 2026-11-06 | nothing |
| Saturday 2026-11-07, 20:48 to 20:59 | only the emails of Monday 11-09 visits starting 20:48 to 20:59, if any exist and if `R` falls before them |
| Sunday 2026-11-08, from 08:00 | the emails of Tuesday 2026-11-10 visits (the first ones at 08:00); and the SMS of any Monday 20:48 to 20:59 visit of the row above |
| Monday 2026-11-09, from 08:00 | the SMS of Tuesday 11-10 visits; the emails of Wednesday 11-11 visits |
| Every later day | that day's emails and SMS of every visit meeting rule 4, with no end until the sweep sends or a re-arm runs |

For a Tuesday 2026-11-10 08:00 visit the email is covered only by a save from Friday 2026-10-09 09:00 WEST on, and the SMS only by a save from Saturday 2026-10-10 09:00 WEST on.

### What is certain and what is not

- **Certain, by the code:** the sweep in shadow sends nothing; the re-arm of 2026-10-12 did not reach a visit starting after `R`; a save of a visit makes a new job from that save (`apps/web/lib/scheduling/reminders.ts`, `enqueueRemindersAfterCommit`).
- **NOT ESTABLISHED:** what the scheduler does with a job past 30 days. If it lets it sleep on, most of these reminders still go out; if it ends it, every one is lost. Nobody has measured it, and this document does not.
- **Not countable from the repository:** how many visits meet the predicate today. The dry run of this document prints how many appointments it would re-arm, by days until their start, but that is a wider set (next sections).

### What this fallback covers, and when it runs out

A sitting that starts at Wednesday 2026-11-04 21:00 re-arms every qualifying appointment starting from Thursday 2026-11-05 21:00 up to Wednesday 2026-12-02 21:00, each with a job that sleeps at most 27 days (the SMS of a visit at 20:59 on 12-02). The first visits beyond it are on Thursday 2026-12-03: their emails fall on **Tuesday 2026-12-01 from 08:00**. So, if the sweep is still in shadow, **a second sitting must run by the night of Monday 2026-11-30 at the latest** (a weekly night keeps a week of margin). That is a question for strategy, below.

## This op must NOT run if the sweep is in send mode

### Why

- **The sweep decides what is due from the audit trail, and this program writes no audit row.** While the sweep sends, a reminder job that wakes is the sweep's backstop (`apps/web/lib/reminders/inngest/backstop.ts`), and the sweep picks its marks from the saves the audit trail records. An event from this program cancels the sleeping jobs of the appointment and plans them again from the moment it arrives, so a mark that is already past is dropped by the new job while the sweep, which cannot see that re-plan, still takes it. PR #1678 (open, `reminders/r24-s5-no-grace`) writes this into `apps/web/lib/reminders/reminder-population.ts` (R33): "an owner-run re-arm must not run while the sweep is in send mode without a fresh ruling."
- **It would remind the visits the second switch leaves out.** The 2026-10-12 selection takes a visit with no scheduling save too (an imported visit). Re-armed while the sweep sends with REMINDERS_SWEEP_NEVER_REMINDED off, such a visit's backstop job would find no claim of the sweep, and would send 20 minutes late what the switch says is not sent.
- **It is not needed.** With the sweep sending, every due mark of a saved visit is the sweep's, whatever job sleeps for it.
- **The ruling makes the two exclusive.** R36: the switch "Wed 11-04 after 21:00" if the compare is clean, and this sitting "instead" if it is not.

### How it refuses

`r36-fallback-rearm-emit.mjs` makes three checks before the 2026-10-12 program reads anything, in every mode, the dry run included, and refuses (exit 1, `FAILED`) on any one of them:

1. **This shell's switch.** The value of the sweep's send switch in the environment the block loaded, compared exactly as `apps/web/lib/reminders/sweep-mode.ts` compares it: exactly `send` is send, anything else is shadow. It prints `SET` or `UNSET` and the word it reads as, and never the value. `send` is a refusal.
2. **The owner's word.** `--owner-says-sweep-is-not-sending`, which GREEN types only after the owner has said, in the sitting, that he has looked at the Production environment variables of the Vercel project and that the switch is absent or is not `send`, and that he will not change it during the sitting. Without it, a refusal.
3. **Production's own record.** One READ ONLY read of `reminder_sweep_passes` (the sweep's heartbeat, migration `0106`): the newest heartbeat of the tenant must be `shadow` and no more than 12 hours old, and no heartbeat of the last 7 days may be anything but `shadow`. A pass writes `send` on its heartbeat only while the switch is on (`apps/web/lib/reminders/sweep-send.ts`). It prints the mode word and counts, nothing else.

All three passed, it prints `SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)`, which every block requires.

### What the refusal cannot see

- **This shell is not production.** The switch the deployed application reads is in Vercel. Check 1 sees only the environment file the block loads; check 2 is the owner's word, and nothing checks it.
- **A switch turned after the day's last pass.** Passes run every 15 minutes from 07:00 to 21:45 Lisbon. A switch turned (and redeployed) after 21:45 writes no heartbeat until 07:00, so check 3 cannot see it. Check 2 covers it, and only check 2.
- **A switch turned between a block's check and its sends.** Each sending block runs the three checks itself, seconds before its sends; the owner's word covers the rest.

## Which appointments get an event

Exactly the 2026-10-12 selection, by the 2026-10-12 program, unchanged (its document, `docs/data-op-inc-1007-rearm-reminders.md`, "Which appointments get an event", is the full text). All of these hold:

1. The tenant is `osteojp`.
2. The status is `scheduled` or `confirmed`. So never a cancelled, completed or no-show visit.
3. The patient is not soft-deleted.
4. It is not an online request reception has not accepted.
5. It starts more than 24 hours after the read.
6. It starts no more than 28 days after the read (`--max-days-ahead 28`).
7. Its audit trail shows no scheduling save in the last 25 hours: such a visit was given a job by that save.
8. Neither of its reminder times falls inside the run's margin (690 seconds with `--max 200`).
9. This operation's own marker does not hold it as sent at the same start, or as attempted.

Then the program reads that one row again just before its send, and skips it if it moved, changed status or was saved again since the first read.

### Why every qualifying appointment, and not only the ones at risk

SOLO's brief for this document asked to leave out visits whose reminders a live job already covers, if that can be known without reading the scheduler. **It cannot**, for three reasons in the code:

- **A save's event can fail with its audit row standing.** `enqueueRemindersAfterCommit` is best effort: "a failed enqueue is logged ... and swallowed" (`apps/web/lib/scheduling/reminders.ts`). The audit row says the clinic saved; it does not say a job exists.
- **A patient's own move in the portal changes the start with no event and no audit row** (`apps/api/lib/appointments/store.ts`, `rescheduleOwn`; `apps/web/lib/reminders/inngest/backstop.ts` says the same). Its job, if any, sleeps to the old time.
- **The events of 2026-10-12 wrote no audit row.** Only that sitting's marker records them.

So, as on 2026-10-12 (strategy's ruling of its Q3, option (a)), every qualifying appointment in the 28 days gets one event. For an appointment whose job is healthy, the event replaces it with one new job per reminder: measured on 2026-10-07 and 2026-10-08 on the scheduler's dev server (one script send, two, three; with and without an app save between; every pattern ended with exactly one email job and one SMS job), and live on production on 2026-10-12. Its cost is executions (below). Rule 7 leaves out what was saved in the last 25 hours.

**This also re-arms the visits of Friday 11-06 to Monday 11-09 that the 2026-10-12 sitting reached** (its marker is not read: this operation has its own). That costs a few dozen events and gives a portal-moved one among them its job back.

### Visits that were never saved by the clinic

The 2026-10-12 selection does not ask for a scheduling save, so an imported visit in the 28 days gets an event, as on 2026-10-12, and from then on its reminders like any other. That matches the owner's answer recorded in `reminder-population.ts` ("The owner's answer was to remind these visits") and the R36 switch, which turns REMINDERS_SWEEP_NEVER_REMINDED on together with sending. Leaving them out would need a change to the selection, which this document does not make. **It is a question for strategy (Q-R36-F2).** The dry run counts them only inside its totals; a separate count needs its own read.

## The horizon: 28 days, and why

- **The scheduler's limit.** The free plan publishes 30 days as the most a job may last, its sleep included; this account is on the free plan (3,895 of 50,000 executions on 2026-10-07). Sleeps of 7 to 30 days are observed to work on production (`OPS-scheduler-free-plan-30-day-run-limit`); beyond 30 days is NOT ESTABLISHED.
- **What 28 days makes a job sleep.** A visit starting 28 days after the read has its SMS 27 days after it and its email 26 days after it. With the sweep's backstop later switched on, a job adds at most 20 minutes after its time, and up to four more waits only for a visit moved later (`backstop.ts`, `MOVED_MARK_WAITS`). Every job this sitting makes stays inside the published 30 days and inside the range observed to work, with three days to spare.
- **The same number strategy ruled for the 2026-10-12 re-arm** (`docs/data-op-inc-1007-rearm-reminders.md`, "Why 28 days"), which ran clean with it.
- **Enforced by the program.** `r36-fallback-rearm-emit.mjs` refuses `--max-days-ahead` missing or above 28, in every mode. Every block passes 28.

## One event per appointment, each with an id of its own

`CLAUDE.md`: "Never send `appointment/scheduled` twice with the same Inngest event id ... An owner-run script that supplies ids must make them unique per send." **This program supplies no id at all.** The event is the 2026-10-12 program's `buildEvent()`: a name and four data keys, `confirmationEligible: false`, and no `id`. The scheduler gives every event it receives an id of its own, so no two sends can share one, whether by a second run, a lost marker or a request delivered twice (measured on 2026-10-07: 90 sends, 90 different ids). The reminder job's duplicate key carries that id (`scheduledBy`, `functions.ts`), so each send makes its own jobs and the newest wins (`singleton`).

## The ceilings

| Ceiling | Value | Where |
|---|---|---|
| Days ahead | 28 at most | `r36-fallback-rearm-emit.mjs` refuses more; the 2026-10-12 program holds every row beyond back and counts it |
| One run | `--max 200` at most | refused above 200; a run also stops sending after 600 seconds (`OUT OF TIME`, not a failure) |
| The whole scope | under 20,000 projected executions: **769 appointments in scope at most** | G1 of the 2026-10-12 program: 26 executions an appointment at most, a confirm refused at `NO` |
| Two runs at once | never | the lock |

**G1 may stop the sitting.** On 2026-10-12, 532 appointments within 28 days were sent and 76 more were inside 48 hours. A Wednesday night's 28 days ahead is of the same order, but the number is not known before the dry run. If BEFORE YOU START prints `G1 UNDER THE LIMIT OF 20000: NO`, the block stops and strategy rules (a smaller `--max-days-ahead`, for one). The 26 is a bound for a sweep switched on later; in shadow an appointment costs 8.

## What it prints: counts only

The 2026-10-12 program prints a line per appointment (the dry run's first 20, and a `sent` or `skip` line per row of a confirm) and the tenant's id. `r36-fallback-rearm-emit.mjs` passes every line through `countsOnly()`: those lines are dropped, the dry run says `the eligible appointments are not listed: this operation prints counts only`, and any uuid left on a kept line reads `<id>`, the refusals included. No line carries a patient's name, phone or email, an appointment id, the tenant's id, the connection string or any part of it, the event key, or the value of any environment variable. The marker on disk holds the ids, as on 2026-10-12: it is the record of what was sent.

## Its own marker, its own lock

The 2026-10-12 sitting's marker, `~/.osteojp-inc1007-rearm.json`, is that sitting's record and is not read or written here. This operation keeps its marker in its own folder, `~/.osteojp-r36-fallback-rearm/` (the file inside keeps the 2026-10-12 program's name, `.osteojp-inc1007-rearm.json`, with the lock beside it). So BEFORE YOU START must read `skipped: already sent by an earlier run (marker): 0` and a G3 line for 0 appointments checked; anything else stops it. **Never delete or edit the marker.** A lock left by a killed run is a halt, and the lead rules on it, as on 2026-10-12.

## Who runs it, from where, and when

- **GREEN**, a fresh apply-only session, on the owner's dispatch naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`. It authors nothing, edits nothing and merges nothing. SOLO wrote this and is disqualified from running it.
- **The owner at the keyboard** for the whole sitting: the three Inngest settings, the switch in Vercel, and the canary's check are his looks, and two flags are his word.
- **From the HELD head** of this branch's pull request, checked out detached in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. BEFORE YOU START checks it against HELD and records it; every later block runs only on that recorded head.
- **On one machine,** because the marker and the lock live in its home folder.
- **In the night's window only**, by machine, in every block: from 21:00 Lisbon on RUNDAY (a Monday to Friday, filled in the dispatch) until 06:29 Lisbon the next morning. No visit starts at night, so no reminder time falls in the window. `TZ=Europe/Lisbon` on every clock read, and a STOP unless the zone reads WET or WEST. BEFORE YOU START also holds the machine's clock against network time (the lines of `docs/migration-apply-0108.md`, unchanged).
- **Keep the machine awake:** plugged in, lid open; the two sending commands run under `caffeinate -i`.

## The order of the sitting

1. **BEFORE YOU START**, from the dispatch's filled copy. Network time, the night, the held head, every pin, the target guard, the sweep refusal, and the first dry run (counts only). It records the head and the night.
2. **The owner's two looks**, in the sitting, before the canary:
   - **Inngest**, as step 2 of 2026-10-12: `schedule-appointment-reminders` shows Debounce; `send-appointment-reminder` shows Singleton; the trigger of `send-appointment-confirmation` shows `event.data.confirmationEligible == true`. Every production deploy syncs the app since #1660, and the look is still made. With any of the three missing: stop.
   - **Vercel**, Production environment variables of the project: the sweep's send switch is absent or is not `send`. With it `send`: this document is not used.
   GREEN carries `--i-checked-inngest-settings` and `--owner-says-sweep-is-not-sending` in the blocks below only on those two words.
3. **THE CANARY**: five appointments three or more days ahead.
4. **G2, the owner's check of the canary** (below). THE REST waits for his word.
5. **THE REST**, pasted again and again until its dry run reads `ELIGIBLE: 0`.
6. **THE CLOSING DRY RUN**, 12 minutes or more after the last send returned.

THE HALT RULE. Any refusal (a REFUSE line, a FAILED line, a BAD INVOCATION line,
or a harness or classifier refusal), any STOP line and any non-zero exit stops the
sitting, and nothing continues to the next block. Whether and when a halted sitting
starts again is the lead's call, never the runner's. What a sending block printed as
sent stays sent and is in the marker; nothing is sent again by hand.

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' ...`, where zsh ignores errexit. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/r36-fallback-rearm-20261104.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail`. No block prints, echoes or tests the value of an environment variable: the program says SET or UNSET (R42).

### BEFORE YOU START: the night, the held head, every pin, the sweep refusal, the first dry run. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
RUNDAY='PENDING: the Lisbon date of the night the dispatch names, YYYYMMDD'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=6238be3f60735d85feecaf0a96020c5fec2dca95ff4ba78275f691a9a07e1525
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
BR=origin/data/R36-fallback-rearm-20261104
DOCF=docs/data-op-r36-fallback-rearm-20261104.md
DOCPIN=docs/data-op-r36-fallback-rearm-20261104.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. Nothing was read from production and nothing was sent"; exit 1; }
echo "${DOCSHA} ${SHAWRAP} ${SHAEMIT} ${SHAGUARD} ${SHAPTM}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){4}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${RUNDAY}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: RUNDAY is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${FIXSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: FIXSHA is not a full 40-character sha. Nothing was read from production and nothing was sent"; exit 1; }
rm -f /tmp/r36-head.sha /tmp/r36-night.ok /tmp/r36-canary.ok /tmp/r36-last-send.ok || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production and nothing was sent"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read from production and nothing was sent"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://api.github.com https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. Do not set the clock yourself. Nothing was read from production and nothing was sent"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: none of the three sources could be read, so the clock is not shown to be right. Do not set the clock yourself. Nothing was read from production and nothing was sent"; exit 1; }
echo "network time:  the machine's clock agrees with every source that could be read. Read:${TOK}. Not read:${TNOT:- none}."
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was read from production and nothing was sent"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
DOW=$(echo "${NOW}" | cut -c14)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${DOW} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [1-7] [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, a weekday, HHMM and YYYYMMDD. Nothing was read from production and nothing was sent"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOWL} (YYYYMMDDHHMM), weekday ${DOW} (1 is Monday, 7 is Sunday): ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was read from production and nothing was sent"; exit 1; }
RDOW=$(TZ=Europe/Lisbon date -j -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%u') || { echo "STOP: the weekday of RUNDAY could not be computed. Nothing was read from production and nothing was sent"; exit 1; }
echo "${RDOW}" | grep -qx '[1-5]' || { echo "STOP: RUNDAY ${RUNDAY} is not a Monday to Friday (it reads as weekday ${RDOW}). This operation runs on a weekday night only. Nothing was read from production and nothing was sent"; exit 1; }
NEXTDAY=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%Y%m%d') || { echo "STOP: the day after RUNDAY could not be computed. Nothing was read from production and nothing was sent"; exit 1; }
echo "${NEXTDAY}" | grep -qxE '[0-9]{8}' || { echo "STOP: the day after RUNDAY did not read as YYYYMMDD. Nothing was read from production and nothing was sent"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "the night:     RUNDAY ${RUNDAY}, weekday ${RDOW}; the window runs from ${RUNDAY} 21:00 to ${NEXTDAY} 06:29, Lisbon; Lisbon now ${NOWL}; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the window of the night this block names (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was read from production and nothing was sent"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so the held head may be stale. Nothing was read from production and nothing was sent"; exit 1; }
TIP=$(git rev-parse ${BR}) || { echo "STOP: the held head, ${BR}, could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. Nothing was read from production and nothing was sent"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the branch was pushed to since the READY line, or it is gone. Nothing was read from production and nothing was sent"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read from production and nothing was sent"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read from production and nothing was sent"; echo "${STRAY}"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was read from production and nothing was sent"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read from production and nothing was sent"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was read from production and nothing was sent"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. Nothing was read from production and nothing was sent"; exit 1; }
echo "checked out:   ${TIP}, the held head"
git merge-base --is-ancestor ${FIXSHA} ${TIP} || { echo "STOP: the reminder fix of 2026-10-07 (#1562, ${FIXSHA}) is not in the history of the held head, or git could not say. Nothing was read from production and nothing was sent"; exit 1; }
echo "the fix:       ${FIXSHA} is in the history of the held head"
DOC=$(git show ${TIP}:${DOCF} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. Nothing was read from production and nothing was sent"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. Nothing was read from production and nothing was sent"; exit 1; }
TOP=$(git show ${TIP}:${DOCF} | sed -n 1p) || { echo "STOP: the document's first line could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${TOP}" | grep -qvE '^NOT READY' || { echo "STOP: the document's first line at the held head still reads NOT READY, or it could not be searched. Nothing was read from production and nothing was sent"; exit 1; }
echo "first line:    ${TOP}"
SIDE=$(git show ${TIP}:${DOCPIN}) || { echo "STOP: the sidecar could not be read at the held head. Nothing was read from production and nothing was sent"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  ${DOCF}" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${WRAP} || { echo "STOP: the program is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${EMIT} || { echo "STOP: the program of 2026-10-12 is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${GUARD} || { echo "STOP: the target guard is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
test -f ${PTM} || { echo "STOP: the guard's module is not on disk at the held head. Nothing was read from production and nothing was sent"; exit 1; }
SW=$(shasum -a 256 ${WRAP} | cut -d' ' -f1) || { echo "STOP: the program could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "program:       ${SW}"
[ "${SW}" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was read from production and nothing was sent"; exit 1; }
SE=$(shasum -a 256 ${EMIT} | cut -d' ' -f1) || { echo "STOP: the program of 2026-10-12 could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "2026-10-12:    ${SE}"
[ "${SE}" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "guard:         ${SG}"
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read from production and nothing was sent"; exit 1; }
echo "module:        ${SM}"
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read from production and nothing was sent"; exit 1; }
echo "every pin holds. The production environment loads now"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read from production and nothing was sent"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-a.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read from production and nothing was sent"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-a.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read from production and nothing was sent"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending 2>&1 | tee /tmp/r36-dry-a.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36-dry-a.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36-dry-a.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent"; exit 1; }
grep -qE '^held back: starts more than --max-days-ahead 28 days after the read: [0-9]+$' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the 28 day bound. Nothing was sent"; exit 1; }
grep -qxF 'skipped: already sent by an earlier run (marker): 0' /tmp/r36-dry-a.out || { echo "STOP: this operation's marker already holds sent rows, so this is not the start of a sitting. BEFORE YOU START is never pasted after a send. The lead rules. Nothing was sent"; exit 1; }
grep -qxF 'skipped: attempted by an earlier run, outcome unknown (marker): 0' /tmp/r36-dry-a.out || { echo "STOP: this operation's marker holds attempted rows. The lead rules. Nothing was sent"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Strategy rules on the scope. Nothing was sent"; exit 1; }
grep -qxF 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 0; handed to a provider: 0; not checkable: 0; expected 0)' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the G3 line reading 0 for 0 appointments checked. Nothing was sent"; exit 1; }
grep -qE '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36-dry-a.out || { echo "STOP: the dry run does not show the G4 line. Nothing was sent"; exit 1; }
echo "${TIP}" > /tmp/r36-head.sha || { echo "STOP: the held head could not be recorded. Nothing was sent"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/r36-night.ok || { echo "STOP: the night could not be recorded. Nothing was sent"; exit 1; }
echo "recorded:      the held head ${TIP} and the night ${RUNDAY} to ${NEXTDAY}, for the blocks that follow"
echo "BEFORE YOU START: every check passed. ELIGIBLE ${N} at this read. The owner looks at the Inngest settings and the Vercel switch now; then THE CANARY."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `the night: ... inside: yes`; `held head now:`; `checked out:`; `the fix:`; `document:`, `first line:` (not NOT READY), `sidecar:`; `program:`, `2026-10-12:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines with `target verified: production, session pooler.`; the program's lines IN FULL (counts only), among them `SWEEP GUARD: ...`, `target   PRODUCTION`, `mode     DRY RUN - nothing is sent`, `skipped: already sent by an earlier run (marker): 0`, `ELIGIBLE: <N>`, `G1 UNDER THE LIMIT OF 20000: yes`, the G4 line and its two lines (a count for the owner, never a failure), and the G3 line reading 0 for 0 appointments checked; `recorded: ...`; then `BEFORE YOU START: every check passed. ELIGIBLE <N> ...`. Exit 0. It reads production and sends nothing.

### THE CANARY: five appointments, three or more days ahead

Pasted only after the owner's two looks, in the sitting. Three days, so both reminders are still ahead.

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=6238be3f60735d85feecaf0a96020c5fec2dca95ff4ba78275f691a9a07e1525
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-fallback-rearm-20261104.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-head.sha || { echo "STOP: BEFORE YOU START recorded no head in this sitting. Nothing was sent by this block"; exit 1; }
REC=$(cat /tmp/r36-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was sent by this block"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. Nothing was sent by this block"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was sent by this block"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was sent by this block"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head BEFORE YOU START recorded. Nothing was sent by this block"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was sent by this block"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was sent by this block"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36-night.ok || { echo "STOP: BEFORE YOU START recorded no night in this sitting. Nothing was sent by this block"; exit 1; }
NIGHT=$(cat /tmp/r36-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was sent by this block"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was sent by this block"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was sent by this block"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. Nothing was sent by this block"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was sent by this block"; exit 1; }
test ! -f /tmp/r36-canary.ok || { echo "STOP: the canary already ran in this sitting. It is never sent twice. Nothing was sent by this block"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-b.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-b.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending 2>&1 | tee /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show the sweep guard's line. Nothing was sent by this block"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show the line target PRODUCTION. Nothing was sent by this block"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show the line mode DRY RUN. Nothing was sent by this block"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36-canary-dry.out) || { echo "STOP: the canary's dry run holds no ELIGIBLE line. Nothing was sent by this block"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the canary's dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent by this block"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36-canary-dry.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the canary's dry run. Nothing was sent by this block"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the canary's dry run did not read as a whole number [${N}]. Nothing was sent by this block"; exit 1; }
grep -qxF 'skipped: already sent by an earlier run (marker): 0' /tmp/r36-canary-dry.out || { echo "STOP: this operation's marker already holds sent rows, so the canary is not the first send. The lead rules. Nothing was sent by this block"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Nothing was sent by this block"; exit 1; }
grep -qxF 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 0; handed to a provider: 0; not checkable: 0; expected 0)' /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show the G3 line reading 0 for 0 appointments checked. Nothing was sent by this block"; exit 1; }
[ "${N}" -ge 5 ] || { echo "STOP: the canary's dry run found ${N} eligible appointments three or more days ahead, fewer than the five a canary needs. Nothing was sent by this block"; exit 1; }
grep -qE '^THIS RUN: 5 of ' /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run does not show THIS RUN: 5 of. Nothing was sent by this block"; exit 1; }
BEGAN=$(TZ=Europe/Lisbon date '+%Y-%m-%d %H:%M %Z') || { echo "STOP: the Lisbon clock could not be read for the time the canary begins. Nothing was sent by this block"; exit 1; }
echo "${BEGAN}" | grep -qxE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-2][0-9]:[0-5][0-9] (WET|WEST)' || { echo "STOP: the time the canary begins did not read as YYYY-MM-DD HH:MM and the zone WET or WEST [${BEGAN}]. Nothing was sent by this block"; exit 1; }
BEGANT=$(TZ=America/Toronto date '+%Y-%m-%d %H:%M %Z') || { echo "STOP: the Toronto clock could not be read for the time the canary begins. Nothing was sent by this block"; exit 1; }
echo "${BEGANT}" | grep -qxE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-2][0-9]:[0-5][0-9] (EST|EDT)' || { echo "STOP: the time the canary begins did not read on the Toronto clock as YYYY-MM-DD HH:MM and the zone EST or EDT [${BEGANT}]. Nothing was sent by this block"; exit 1; }
echo "canary began:  ${BEGAN}, Lisbon time, and ${BEGANT}, the clock of the owner's machine. The five are sent from this minute on"
caffeinate -i node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36-canary-send.out || { touch /tmp/r36-last-send.ok || { echo "STOP: the canary failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the canary failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36-last-send.ok || { echo "STOP: the time the canary returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qE '^SENT: 5 of 5  ' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show SENT: 5 of 5. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qxF 'G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent). Nothing further is sent"; exit 1; }
grep -qxF 'G3 AFTER THIS RUN: 0  (appointments checked: 5; handed to a provider: 0; expected 0)' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show G3 AFTER THIS RUN: 0 for 5 appointments. Nothing further is sent"; exit 1; }
touch /tmp/r36-canary.ok || { echo "STOP: the canary's record could not be written. The five were sent. Nothing further is sent"; exit 1; }
echo "CANARY SENT: 5 of 5, G4 yes, G3 0. The owner checks the canary in the Inngest dashboard now (G2); THE REST waits for his word."
)
```

**EXPECT:** `running from:`; the sidecar line `docs/data-op-r36-fallback-rearm-20261104.md: OK`; `pins:`; `Lisbon now: ... inside: yes`; the target guard's lines; the canary's dry run IN FULL, counts only, with `THIS RUN: 5 of <N>`; `canary began:` in both zones; the canary's lines IN FULL, with `SENT: 5 of 5`, `G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)`, the `settle` line and `G3 AFTER THIS RUN: 0`; then `CANARY SENT: 5 of 5, G4 yes, G3 0. ...`. Exit 0.

### G2: the owner checks the canary

The canary prints no appointment id (counts only). The owner checks in the Inngest dashboard (Production environment), right after the canary, since the free plan's trace history reaches back 24 hours only:

1. **Functions, `send-appointment-reminder`, Runs.** The runs started from the minute `canary began` printed (his machine shows Toronto time): exactly **ten** with the status Running, five whose event carries `channel` `email` and five `sms`. Runs these replaced may show as Cancelled; that is the design. A waiting run shows as Running: there is no Sleeping status.
2. **Functions, `send-appointment-confirmation`, Runs:** none started since that minute.
3. **If he wants to check each appointment by its id,** the five ids are in this operation's marker, `~/.osteojp-r36-fallback-rearm/.osteojp-inc1007-rearm.json`, the newest entry. He opens it himself; GREEN never prints or reads it. The search is step 5 of 2026-10-12: `event.data.appointmentId == "<the id>"`, one waiting email run and one waiting SMS run each.

Anything else: stop, report, nothing further runs. While in the dashboard, press nothing (see "Replay"). This check shows that the events arrive and schedule. It does not show that the settings of step 2 are live: one event gives one run per channel either way.

### THE REST: repeated until its dry run reads ELIGIBLE 0

Pasted only after the owner's word that G2 passed. Then again after each run that ended clean, until the dry run at its start reads `ELIGIBLE: 0`.

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=6238be3f60735d85feecaf0a96020c5fec2dca95ff4ba78275f691a9a07e1525
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-fallback-rearm-20261104.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-head.sha || { echo "STOP: BEFORE YOU START recorded no head in this sitting. Nothing was sent by this block"; exit 1; }
REC=$(cat /tmp/r36-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was sent by this block"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. Nothing was sent by this block"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was sent by this block"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was sent by this block"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head BEFORE YOU START recorded. Nothing was sent by this block"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was sent by this block"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was sent by this block"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36-night.ok || { echo "STOP: BEFORE YOU START recorded no night in this sitting. Nothing was sent by this block"; exit 1; }
NIGHT=$(cat /tmp/r36-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was sent by this block"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was sent by this block"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was sent by this block"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. Nothing was sent by this block"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-canary.ok || { echo "STOP: the canary has not run in this sitting, so THE REST does not run. Nothing was sent by this block"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending 2>&1 | tee /tmp/r36-rest-dry.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36-rest-dry.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent by this block"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36-rest-dry.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent by this block"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36-rest-dry.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent by this block"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36-rest-dry.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent by this block"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent by this block"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36-rest-dry.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent by this block"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent by this block"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36-rest-dry.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Nothing was sent by this block"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36-rest-dry.out) || { echo "STOP: the dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent by this block"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent by this block"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. Nothing was sent by this block"; exit 1; }
[ "${K}" -ge 5 ] || { echo "STOP: G3 checked ${K} appointments, fewer than the canary's five, so the marker is not this sitting's. The lead rules. Nothing was sent by this block"; exit 1; }
if [ "${N}" = 0 ]; then echo "THE REST: ELIGIBLE 0 at this read, so nothing is left to send and nothing was sent by this block. Paste THE CLOSING DRY RUN 12 minutes or more after the last send returned."; exit 0; fi
echo "the dry run passed: ${N} eligible, G3 0 for ${K} appointments checked. This run sends up to 200 now"
caffeinate -i node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36-rest-send.out || { touch /tmp/r36-last-send.ok || { echo "STOP: the run failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the run failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36-last-send.ok || { echo "STOP: the time the run returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
SL=$(grep -cE '^SENT: [0-9]+ of [0-9]+  ' /tmp/r36-rest-send.out) || { echo "STOP: the run does not show a SENT line. Nothing further is sent"; exit 1; }
[ "${SL}" = 1 ] || { echo "STOP: the run shows ${SL} SENT lines, not exactly one. Nothing further is sent"; exit 1; }
grep -qE '^G4 ATTEMPTED EQUALS SENT: yes [(]' /tmp/r36-rest-send.out || { echo "STOP: the run does not show G4 ATTEMPTED EQUALS SENT: yes. Nothing further is sent"; exit 1; }
grep -qxE 'G3 AFTER THIS RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; expected 0[)]' /tmp/r36-rest-send.out || { echo "STOP: the run does not show G3 AFTER THIS RUN: 0. Nothing further is sent"; exit 1; }
echo "THE REST: this run ended clean. Paste THE REST again; when its dry run reads ELIGIBLE 0, paste THE CLOSING DRY RUN 12 minutes or more after this run."
)
```

**EXPECT:** the same opening lines as the canary's; the dry run IN FULL, counts only, its G3 line reading 0 for the appointments sent so far (5 after the canary, more after each run); then either `THE REST: ELIGIBLE 0 at this read, ...` (exit 0, nothing sent), or `the dry run passed: ...`, the run's lines IN FULL with one `SENT:` line, `G4 ATTEMPTED EQUALS SENT: yes`, the `settle` line, `G3 AFTER THIS RUN: 0`, and `THE REST: this run ended clean. ...`. Exit 0. A run that printed `OUT OF TIME` ended clean: paste THE REST again.

**Why 200, and the margin:** as on 2026-10-12 ("Why 200"). With `--max 200` the margin around a reminder time is 690 seconds; at night no reminder time falls in it. If a dry run counts rows on the line `of those, the 48 hour mark`, they are for the lead: on a weekday night it should read 0.

### THE CLOSING DRY RUN: 12 minutes or more after the last send

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=6238be3f60735d85feecaf0a96020c5fec2dca95ff4ba78275f691a9a07e1525
SHAEMIT=8f4242d0aefe003acfa2dbc3330e4bf0b7471aa38123763fa9411fc379656e7f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-r36-fallback-rearm-20261104.sha256
WRAP=packages/db/scripts/r36-fallback-rearm-emit.mjs
EMIT=packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
SWEEPOK="SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)"

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. This block sends nothing"; exit 1; }
test -f /tmp/r36-head.sha || { echo "STOP: BEFORE YOU START recorded no head in this sitting. This block sends nothing"; exit 1; }
REC=$(cat /tmp/r36-head.sha) || { echo "STOP: the recorded head could not be read. This block sends nothing"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. This block sends nothing"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. This block sends nothing"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. This block sends nothing"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head BEFORE YOU START recorded. This block sends nothing"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. This block sends nothing"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. This block sends nothing"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. This block sends nothing"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36-night.ok || { echo "STOP: BEFORE YOU START recorded no night in this sitting. This block sends nothing"; exit 1; }
NIGHT=$(cat /tmp/r36-night.ok) || { echo "STOP: the recorded night could not be read. This block sends nothing"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1)
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2)
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. This block sends nothing"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. This block sends nothing"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. This block sends nothing"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). This block sends nothing"; exit 1; }
test -f /tmp/r36-canary.ok || { echo "STOP: the canary has not run in this sitting. This block sends nothing"; exit 1; }
test -f /tmp/r36-last-send.ok || { echo "STOP: no send of this sitting recorded the time it returned. This block sends nothing"; exit 1; }
RECENT=$(find /tmp/r36-last-send.ok -mmin -12) || { echo "STOP: the age of the record of the last send could not be read. This block sends nothing"; exit 1; }
[ -z "${RECENT}" ] || { echo "STOP: the last send returned less than 12 minutes ago, so the window of its run has not closed. Wait, and paste this block again. This block sends nothing"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. This block sends nothing"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-d.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. This block sends nothing"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-d.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. This block sends nothing"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending 2>&1 | tee /tmp/r36-closing.out || { echo "STOP: the closing dry run failed or was refused; its lines are above. It is READ ONLY. This block sends nothing"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36-closing.out || { echo "STOP: the closing dry run does not show the sweep guard's line. This block sends nothing"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36-closing.out || { echo "STOP: the closing dry run does not show the line target PRODUCTION. This block sends nothing"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36-closing.out || { echo "STOP: the closing dry run does not show the line mode DRY RUN. This block sends nothing"; exit 1; }
grep -qxF 'ELIGIBLE: 0' /tmp/r36-closing.out || { echo "STOP: the closing dry run does not read ELIGIBLE: 0. Paste THE REST again, then this block 12 minutes or more after it. This block sends nothing"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36-closing.out) || { echo "STOP: the closing dry run does not show the G3 line reading 0 with not checkable 0. This block sends nothing"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. This block sends nothing"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. This block sends nothing"; exit 1; }
[ "${K}" -ge 5 ] || { echo "STOP: G3 checked ${K} appointments, fewer than the canary's five. The lead rules. This block sends nothing"; exit 1; }
G4L=$(grep -E '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36-closing.out) || { echo "STOP: the closing dry run does not show the G4 line. This block sends nothing"; exit 1; }
echo "for the owner: ${G4L}"
echo "CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent. The sends of the sitting are over."
)
```

**EXPECT:** the opening lines; the closing dry run IN FULL, counts only, with `ELIGIBLE: 0` and the G3 line reading 0 for every appointment the sitting sent; `for the owner: G4 NEXT 48 HOURS, NOT RE-ARMED: ...` (a count for the owner, as on 2026-10-12: the appointments of the next 48 hours this operation did not re-arm, most of them healthy); then `CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the <K> appointments this operation sent. ...`. Exit 0. GREEN reports every line of every block.

## If a block stops

- **Before a send** (every STOP of BEFORE YOU START, and of the others before their `caffeinate` line): nothing was sent by that block. Report, and the lead rules.
- **In or after a send:** what the lines show as sent stays sent and is in the marker. A row the run stopped on is held as attempted, and no later run sends it unless the lead rules `--resend-attempted`, as on 2026-10-12. A killed run leaves the lock: a halt, the lead rules. Never delete the marker or the lock by hand in a sitting.
- **A refusal of the sweep guard** (the switch reads send, the owner's word is missing, a heartbeat is not shadow or is stale): nothing was read by the 2026-10-12 program and nothing was sent. If the sweep is sending, this document is not used that night.

## Rollback

None is needed and none exists. It writes nothing to Postgres. An event cannot be recalled and need not be: with the settings of the owner's Inngest look live, each event leaves its appointment with exactly one waiting reminder per channel. A run that stops half way leaves nothing to undo.

## Replay

**Nobody presses Replay or Rerun on any event or run in the Inngest dashboard: not before the sitting, not during it, not after it.** The reasons are the 2026-10-12 document's ("Replay"). A row whose send is in doubt goes out again only through the program, as a new event, on the lead's ruling.

## Rehearsal

**NOT REHEARSED. Nothing in this document has run against any database.** The author had no database for this work, by the terms of the task. What is proven, and how:

- **The blocks, statically and under fault injection, with every external program a stub** (`scripts/r36-fallback-rearm-20261104.test.mjs`): each block's positive control reaches its last line in bash and in zsh, and every external call made to fail in turn, and every scenario listed there, stops it with a STOP line and without its last line. A stubbed command says that a block halts. It says nothing about production.
- **The program, in this process, with the database replaced** (`scripts/r36-fallback-rearm-emit.test.mjs`): the three refusals, their order (each before anything is read), the ceilings, counts-only output over a whole canary, rest and closing run against the 2026-10-12 program's real `run()` with a fake reader and a sink, and the marker's own folder.

**NOT REHEARSED, and to be done before READY by a session that did not write this (SOLO arranges it; the lead's rule of 2026-09-30 applies, quoted below):**

- **The heartbeat read on a database.** `HEARTBEAT_READ` has never been run. It needs a throwaway with `0106` applied and seeded heartbeats: a `shadow` one, a stale one, a `send` one. On a strict local target the program reads it exactly as on production.
- **The program end to end on a local database,** with `--sink-file`: dry run, canary, rest, closing, as the 2026-10-12 round 4 did, through this program.
- **The blocks on production.** They name the production target and the hosted scheduler only. No rehearsal can run them, and none may be made to.
- **The hosted scheduler's behaviour and the dashboard checks.** The owner's.

The lead's words, character for character: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so."

## What must happen before READY, in this order, and none of it by GREEN

1. **The R4 round** on the program, its test, this document and its test (Tier C: a fresh-context reviewer given only the diff and the acceptance).
2. **The rehearsal** listed under "NOT REHEARSED".
3. **No GATE-CHANGE is needed to land the two new test files.** Both are under `scripts/**/*.test.mjs`, a gate glob, but the freeze allows an ADDED gate file (`scripts/assert-gates-unchanged.mjs`: "ADDING A FILE IS ALLOWED, MODIFYING AND DELETING ARE NOT"), and `scripts/gate-freeze.test.mjs` passes on this branch (run 2026-10-31). They become frozen at the next GATE-CHANGE that regenerates the manifest; from then on any edit to them is a GATE-CHANGE of its own.
4. **SOLO's READY line**: the first line of this document changes, the sidecar is regenerated in the same commit.
5. **The pull request, opened held** (`held-for-apply`, unarmed).
6. **GREEN's dispatch**: HELD (the held head), DOCSHA (this document's sha256 at that head) and RUNDAY (`20261104` for the ruled night), naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`, the rollback (none) and that Replay is never pressed. **Issued only if the compare of Wednesday morning is not clean.**

## Questions for strategy

**Q-R36-F1. A second sitting, if the sweep is still in shadow.**
- blocked_what: every reminder of a visit starting from Thursday 2026-12-03, whose email falls from Tuesday 2026-12-01 08:00.
- options: (a) none: the sweep sends by then; (b) the same document once more, by the night of Monday 2026-11-30 at the latest; (c) weekly, each Wednesday night, while the sweep is in shadow.
- recommendation: (c) if the switch has not happened by Wednesday 2026-11-11; it keeps a week of margin and costs one sitting a week. A second sitting needs its own marker folder or the lead's word on reusing this one.

**Q-R36-F2. Visits never saved by the clinic (imported).**
- blocked_what: nothing tonight; it is what the selection includes.
- options: (a) include them, as on 2026-10-12 and as the R36 switch would; (b) leave them out, which needs a change to the selection and a new review.
- recommendation: (a), the owner's recorded answer.

**Q-R36-F3. G1 on the night.**
- blocked_what: the whole sitting, if BEFORE YOU START prints `NO` (770 appointments or more in scope).
- options: (a) halt and rule on the night; (b) a read-only dry run ahead of the night (the BEFORE YOU START dry run alone, in a closed window on Tuesday 2026-11-03), so the count is known before Wednesday.
- recommendation: (b), in the Tuesday dispatch that also carries the compare.

**Q-R36-F4. PR #1678's pin of the senders.**
- blocked_what: nothing tonight. `re-arming-saves.test.ts` on #1678 pins the two owner-run senders by the text `"appointment/scheduled"`. This program sends the event through the 2026-10-12 program's `buildEvent()` and does not carry the text, so that pin passes without naming it.
- recommendation: whichever of #1678 and this branch merges second widens that pin to name `packages/db/scripts/r36-fallback-rearm-emit.mjs`.
