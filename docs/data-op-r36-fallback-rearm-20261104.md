READY: R4 six rounds and an independent rehearsal done (2026-11-02). The Tuesday dry run runs on its own dispatch; the sending blocks only if the Wednesday 11-04 compare is not clean. Q-R36-F6 wording is built to SOLO's proposal, pending strategy.

# R36: the fallback re-arm of the reminders, for the night of Wednesday 2026-11-04

**Status: AUTHORED 2026-10-31 BY SOLO, AMENDED 2026-11-01 FOR STRATEGY'S RULINGS. REVIEWED (R4, six rounds, see "Review history"). REHEARSED 2026-10-31 TO 2026-11-02 BY A SESSION THAT DID NOT WRITE IT (see "Rehearsal"). NOT RUN.** Nothing in this document may be pasted until the first line reads READY. BEFORE YOU START and SECOND PASS, BEFORE YOU START carry `PENDING` in the four lines GREEN's dispatch fills, and STOP at their first check while they do.

**In plain words.** The reminder re-arm of 2026-10-12 gave a fresh reminder job to every appointment starting within 28 days of that night. Appointments further ahead were left to the reminder sweep, which still runs in shadow and sends nothing. If the sweep is not switched to sending on Wednesday 2026-11-04, this document runs the same re-arm once more that night, for every appointment starting within the next 28 days, behind a refusal that stops it if the sweep is sending. It writes nothing to the database. It sends one scheduling event per appointment to the scheduler, which plans that appointment's two reminders again.

**It runs ONLY if the sweep stays in shadow.** If the owner sets the sweep to send that night (R36), this document is not used. See "This op must NOT run if the sweep is in send mode".

| Fact | Value |
|---|---|
| Ruling | Strategy, R36, 2026-10-31 (quoted in the next section): "If not clean: the authorised fallback re-arm sitting runs Wed 11-04 night instead. Have that document READY by Wed 11-04 18:00 either way" |
| Program | `packages/db/scripts/r36-fallback-rearm-emit.mjs` (new, this branch). It runs `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` (the program of 2026-10-12, unedited by this branch) by importing its `run()`, behind the sweep refusal, with its own marker and counts-only output. That program is pinned as amended by #1626 (G1 only: `EXECUTIONS_PER_EVENT` 8 to 26, so the G1 ceiling moved from 2499 appointments to 769), a revision that has not run on production |
| Tests | `scripts/r36-fallback-rearm-emit.test.mjs` (the program) and `scripts/r36-fallback-rearm-20261104.test.mjs` (this document: its blocks under fault injection, its pins, its dates), both fed by `scripts/r36-fallback-rearm-sitting.mjs` (a whole sitting run in-process through the 2026-10-12 `run()`). The 2026-10-12 program keeps its own `scripts/inc-1007-rearm-reminders-emit.test.mjs` |
| Who runs it | GREEN, an apply-only session, on the owner's dispatch naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`, in a closed window with the owner at the keyboard. SOLO wrote it and never runs it |
| Run from | The HELD head of this branch's pull request, `origin/data/R36-fallback-rearm-20261104`, in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. **The pull request stays held, unmerged, and its branch is kept until the LAST sitting's GREEN report** (Thursday's second pass, or the last weekly sitting): every sitting's blocks resolve `origin/data/R36-fallback-rearm-20261104`. It merges after that report |
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

A reminder goes out only if a job is asleep for it at the scheduler and is still alive when the reminder's time comes (48 hours before the visit for the email, 24 hours before for the SMS). Such a job is made by a scheduling event, and it sleeps from that event until the reminder's time. **Not every save sends one.** A booking, a move, accepting an online request and bringing a visit back from Cancelada do. A status set to Confirmada by hand on an ordinary visit, a review-queue "confirmada" and the patient's own SMS "confirmo" on an ordinary visit write an audit row and send nothing (`updateAppointment` in `apps/web/lib/scheduling/actions.ts` on main, which is what production runs; the same doors are listed in `RE_ARMING_SAVES` on PR #1678, which is open and not merged, at commit `1bd32c069478a4d531ac3d6ff466c2d1bc2d6f8c`). The sweep, in shadow, sends nothing (`apps/web/lib/reminders/sweep.ts`).

The scheduler's free plan publishes 30 days as the longest a job may last, its sleep included. On this account, sleeps of 7 to 30 days are observed to work (the owner's read of 2026-10-08: 130 of 130 SMS and 133 of 133 emails). Longer than 30 days has never been observed, and what the scheduler does with such a job is NOT ESTABLISHED (board card `OPS-scheduler-free-plan-30-day-run-limit`).

The re-arm of 2026-10-12 gave a fresh job, sleeping at most 27 days, to every qualifying appointment starting up to Monday 2026-11-09 (its reach, below), except those its rule 7 skipped as touched in the 25 hours before it. **That rule reads every scheduling audit row, a hand-set Confirmada included**, so a visit skipped for a confirm that sent nothing got no job that night and kept whatever job it had. `CLAUDE.md` (2026-10-13) records "Appointments saved shortly before the sitting need nothing: they were armed when they were saved"; that holds for a save that sent an event, and not for such a confirm. Every appointment whose save sent an event after that night has a job of its own from that save. So:

- **Nothing provably breaks on Friday 11-06, except a residual.** No reminder of a visit the 2026-10-12 sitting re-armed, or of a visit whose save sent an event since, depends on Friday 11-06 or Saturday 11-07 on a job older than 30 days (one exception, below). **The residual:** the visits that sitting skipped as touched where the touch was a confirm that sent nothing. Their job is the one from their last save that did send, which may be more than 30 days old, or made before the fix and destroyed by the incident; their reminders can fall on 11-06 or any day. The repository cannot count them: the touched count of 2026-10-12 is in GREEN's report of that night, and it is wider (it holds saves that did send). This fallback reaches those of them starting from Thursday 11-05 21:00 unless they were touched again in the 25 hours before it; its own rule 7 has the same residual, which every block counts for the owner inside `skipped: touched in the last 25 hours` (Q-R36-F5). The gaps that exist on any day (a save whose event failed, a patient's own move in the portal, both under "Which appointments get an event") are not specific to 11-06 and are not counted here.
- **From Sunday 2026-11-08 at 08:00 Lisbon (WET),** the 48 hour emails of the visits of Tuesday 2026-11-10 fall due; from Monday 2026-11-09 at 08:00, their 24 hour SMS and the emails of Wednesday 11-11; and so on, every day. For each of those visits whose last save by the clinic came more than 30 days before the reminder's time, the reminder depends on a job sleeping longer than anything ever observed to work. That covers every visit of a weekly series booked more than about a month ahead, and every such visit last saved before the reminder fix of 2026-10-07, whose job the incident of that week may already have destroyed.
- **Nothing records a reminder that is lost this way.** A job that never wakes writes no ledger row, no error and no alert, and no screen lists appointments without a reminder (the nearest is Comunicações, Lembretes SMS, which shows only attempts).
- **The exception.** A visit of Monday 2026-11-09 starting between 20:48 and 20:59 may be beyond the 2026-10-12 reach (below). Its email would fall on Saturday 2026-11-07 from 20:48, its SMS on Sunday 2026-11-08 from 20:48.
- **Visits that were never saved by the clinic** (an imported visit, for one) have never had a reminder job. Nothing changes for them on 11-06: they get nothing today and they get nothing after. They are the visits REMINDERS_SWEEP_NEVER_REMINDED=on would add to a sending sweep.

So, outside the residual, "the Fri 11-06 deadline" holds with two days of margin before the first reminder at risk, and Wednesday 11-04 with four. The repository does not say how 11-06 was derived ("the day the first of those further appointments comes inside 28 days", `CLAUDE.md`, 2026-10-13); it is not re-derived here, only checked against the code and the record.

### The predicate

A reminder, of visit `v` at offset `o` (48 hours, the email; 24 hours, the SMS), is AT RISK on a day when all of these hold (rules 2 and 4 define `R` and `E`):

1. `v` is of tenant `osteojp`; its status is `scheduled` or `confirmed`; its patient is not deleted; it is not an online request reception has not accepted (the three tests of `public.is_unconfirmed_pedido`, as `inc-1007-rearm-reminders-emit.mjs` derives them).
2. `R` is the reach of the re-arm of 2026-10-12. `R` is at least **2026-11-09 20:48 WET**: the sitting's first read was at 21:48 WEST on 2026-10-12 (20:48 UTC) and every run of it had `--max-days-ahead 28`. Its closing dry run, before 23:24 WEST, printed `ELIGIBLE: 0`, so `R` is that read plus 28 days, at most 2026-11-09 22:24 WET. The exact instant of that read is in GREEN's report of 2026-10-12 and in that sitting's marker, not in the repository.
3. Its time, `mark = v.starts_at - o`, falls on that day.
4. `E` is the newest event that planned the reminders of `v` at the start it has now, of two kinds:
   - **a save that sent an event**: an `audit_log` row of the visit written by one of the doors that send, as main's live code has them (`apps/web/lib/scheduling/actions.ts`, `apps/web/lib/reminders/inbound-store.ts`, `apps/web/lib/reminders/inbound-reply.ts`: what production runs). They match `RE_ARMING_SAVES` in `apps/web/lib/reminders/reminder-population.ts` on PR #1678 at commit `1bd32c069478a4d531ac3d6ff466c2d1bc2d6f8c`, except one case (below); #1678 is open and not merged, and its gate is not live: `appointment.create` (booked, copied, batch); `appointment.reschedule` (moved, alone or in bulk; a move of an unaccepted request sends nothing and its row does not show it, #1678's open question, counted here as sent); `appointment.update` with `via` `portal_request_confirm` (accepted in Pedidos); `appointment.update` with `fromStatus` `scheduled` and `toStatus` `confirmed` on a visit whose `origin` is `patient_portal` (an online request accepted with the Estado control); `appointment.update` with `fromStatus` `cancelled` and either `toStatus` `confirmed`, or `toStatus` `scheduled` on a visit whose `origin` is not `patient_portal` (brought back from Cancelada, a future visit only; THE ONE CASE: main's `updateAppointment` sends nothing for a visit brought back to Agendada while `public.is_unconfirmed_pedido` is true, which reads `origin` `patient_portal` OR an `appointment_request` row in `staff_notifications` (0067), whereas #1678's `brought_back` clause tests `origin` only; so a visit not from the portal that carries such a notification row, brought back to Agendada, sent nothing on main and still counts here as `E`); `appointment.sms_reply_reviewed` with `resolution` `confirmed` and `applied` `true`, and `appointment.patient_sms_reply` with `outcome` `confirmed`, each on a visit whose `origin` is `patient_portal`;
   - **the event of 2026-10-12**, when that sitting sent one for `v` at its present start: every such `v` starts no later than `R`, and the sitting's marker names them.
5. Either `mark - E > 30 days`, or `E` is before **2026-10-07 20:45 WEST** (the owner's Resync that made the fix live: such a job may have been destroyed by the incident).

The audit rows the 2026-10-12 selection reads (its rule 7, which is `hasSchedulingEvent`) are WIDER than rule 4: they also hold a hand-set Confirmada, a review-queue confirmation and an SMS "confirmo" on an ordinary visit, none of which sent anything. That is the residual of the plain words.

Two consequences, by arithmetic:

- Every `v` starting after `R` whose `E` is before 2026-10-07 20:45 WEST meets rule 5 by both of its terms: its earliest mark is 2026-11-08 08:00 WET, 31.5 days later.
- A visit with no `E` at all (never saved through a door that sends, and not re-armed) has no job and is not at risk by this predicate: it never had a reminder (see the last bullet above).

The same predicate as one statement, for reading only. **It has never been run anywhere and nothing in this document runs it**; a count of the at-risk reminders would need its own read-only block and its own rehearsal:

```text
appointments v, tenants t, offsets o in ((48 hours, email), (24 hours, sms)):
  t.slug = 'osteojp' and v.tenant_id = t.id
  and v.status in ('scheduled', 'confirmed') and patient(v).deleted_at is null
  and not unaccepted_request(v)
  and E = newest(re_arming_save(v), event_of_20261012(v))   -- rule 4
  and ((v.starts_at - o) - E > interval '30 days'
       or E < timestamptz '2026-10-07 20:45 WEST')         -- rule 5
```

### The first affected dates

| Lisbon time (WET) | What falls due that depends on a job sleeping more than 30 days |
|---|---|
| Friday 2026-11-06 | nothing provable; the residual of rule 7 (visits skipped for a confirm that sent nothing) can fall on any day |
| Saturday 2026-11-07, 20:48 to 20:59 | only the emails of Monday 11-09 visits starting 20:48 to 20:59, if any exist and if `R` falls before them |
| Sunday 2026-11-08, from 08:00 | the emails of Tuesday 2026-11-10 visits (the first ones at 08:00); and the SMS of any Monday 20:48 to 20:59 visit of the row above |
| Monday 2026-11-09, from 08:00 | the SMS of Tuesday 11-10 visits; the emails of Wednesday 11-11 visits |
| Every later day | that day's emails and SMS of every visit meeting rule 5, with no end until the sweep sends or a re-arm runs |

For a Tuesday 2026-11-10 08:00 visit the email is covered only by a save from Friday 2026-10-09 09:00 WEST on, and the SMS only by a save from Saturday 2026-10-10 09:00 WEST on.

### What is certain and what is not

- **Certain, by the code:** the sweep in shadow sends nothing; the re-arm of 2026-10-12 did not reach a visit starting after `R`; a save through a door that sends makes a new job from that save (`apps/web/lib/scheduling/reminders.ts`, `enqueueRemindersAfterCommit`), and a hand-set Confirmada on an ordinary visit makes none.
- **NOT ESTABLISHED:** what the scheduler does with a job past 30 days. If it lets it sleep on, most of these reminders still go out; if it ends it, every one is lost. Nobody has measured it, and this document does not.
- **Not countable from the repository:** how many visits meet the predicate today. The dry run of this document prints how many appointments it would re-arm, by days until their start, but that is a wider set (next sections).

### What this fallback covers, and when it runs out

A sitting that starts at Wednesday 2026-11-04 21:00 re-arms every qualifying appointment starting from Thursday 2026-11-05 21:00 up to Wednesday 2026-12-02 21:00, each with a job that sleeps at most 27 days (the SMS of a visit at 20:59 on 12-02). The first visits beyond it are on Thursday 2026-12-03: their emails fall on **Tuesday 2026-12-01 from 08:00**. So, if the sweep is still in shadow, **a second sitting must run by the night of Monday 2026-11-30 at the latest** (a weekly night keeps a week of margin). That is a question for strategy, below.

## This op must NOT run if the sweep is in send mode

### Why

- **The sweep decides what is due from the audit trail, and this program writes no audit row.** While the sweep sends, a reminder job that wakes is the sweep's backstop (`apps/web/lib/reminders/inngest/backstop.ts`), and the sweep picks its marks from the saves the audit trail records. An event from this program cancels the sleeping jobs of the appointment and plans them again from the moment it arrives, so a mark that is already past is dropped by the new job while the sweep, which cannot see that re-plan, still takes it. PR #1678 (open, `reminders/r24-s5-no-grace`) writes this into `apps/web/lib/reminders/reminder-population.ts` (R33): "an owner-run re-arm must not run while the sweep is in send mode without a fresh ruling."
- **It would remind the visits the second switch leaves out.** The 2026-10-12 selection takes a visit with no scheduling save too (an imported visit). Re-armed while the sweep sends with REMINDERS_SWEEP_NEVER_REMINDED off, such a visit's backstop job would find no claim of the sweep, and would send 20 minutes late what the switch says is not sent. R36 turns REMINDERS_SWEEP_NEVER_REMINDED on together with send mode, so on the ruled path the second switch is on; on any other path it may not be.
- **It is not needed.** With the sweep sending, every due mark of a saved visit is the sweep's, whatever job sleeps for it.
- **The ruling makes the two exclusive.** R36: the switch "Wed 11-04 after 21:00" if the compare is clean, and this sitting "instead" if it is not.

### How it refuses

`r36-fallback-rearm-emit.mjs` makes three checks before the 2026-10-12 program reads anything, in every mode, the dry run included, and refuses (exit 1, `FAILED`) on any one of them:

1. **This shell's switch.** The value of the sweep's send switch in the environment the block loaded, compared exactly as `apps/web/lib/reminders/sweep-mode.ts` compares it: exactly `send` is send, anything else is shadow. It prints `SET` or `UNSET` and nothing more. A switch set so that the sweep would send is a refusal, whose sentence says only that.
2. **The owner's word.** `--owner-says-sweep-is-not-sending`, which GREEN types only after the owner has said, in the sitting, that he has looked at the Production environment variables of the Vercel project and that the switch is absent or is not `send`, and that he will not change it during the sitting. Without it, a refusal.
3. **Production's own record.** One READ ONLY read of `reminder_sweep_passes` (the sweep's heartbeat, migration `0106`): the newest heartbeat of the tenant must be `shadow` and no more than 12 hours old, and no heartbeat of the last 7 days may be anything but `shadow`. A pass writes `send` on its heartbeat only while the switch is on (`apps/web/lib/reminders/sweep-send.ts`). It prints the mode word and counts, nothing else. **The stale-heartbeat path (Q-R36-F6, ruled 2026-11-01):** when the newest heartbeat is older than 12 hours or missing, check 3 passes only on the owner's second word, `--owner-saw-the-sweep-not-running yes`, never when any heartbeat of the last 7 days is not `shadow`, never when the newest heartbeat is not `shadow`, and the program prints `STALE-HEARTBEAT PATH TAKEN (Q-R36-F6)`. **As built (SOLO's proposed wording, put back to strategy, see Q-R36-F6):** the word means that `sweep-due-reminders` shows no run with the status Completed since 07:00 Lisbon on the sitting's day (any runs since then Failed, or none at all), and a heartbeat written at or after that 07:00 contradicts it: a refusal, with fresh heartbeats or stale. With `no`, the word changes nothing.

All three passed, it prints `SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)`, which every block requires.

### What the refusal cannot see

- **This shell is not production.** The switch the deployed application reads is in Vercel. Check 1 sees only the environment file the block loads; check 2 is the owner's word, and nothing checks it.
- **A switch turned after the day's last pass.** Passes run every 15 minutes from 07:00 to 21:45 Lisbon. A switch turned (and redeployed) after 21:45 writes no heartbeat until 07:00, so check 3 cannot see it. Check 2 covers it, and only check 2.
- **A switch turned between a block's check and its sends.** Each sending block runs the three checks itself, seconds before its sends; the owner's word covers the rest.

### When the heartbeats refuse

A newest heartbeat older than 12 hours, or none at all, is a refusal, **unless the stale-heartbeat path of Q-R36-F6 is taken** (check 3 above; ruled 2026-11-01). That is likely on exactly the night this document is for: passes that fail leave no heartbeat (`sweep.ts`, "A pass that could not finish for a tenant leaves no heartbeat for it"), and failing passes are a likely cause of a compare that is not clean. So the read-only dry run of Tuesday 2026-11-03 (Q-R36-F3) prints production's heartbeat line and shows this a day early. The line comes before check 3's own refusal only: checks 1 and 2 refuse earlier, before the heartbeats are read. And since BEFORE YOU START carries `--owner-says-sweep-is-not-sending`, the Tuesday dispatch needs the owner's Vercel look too, before GREEN pastes it. What to do when the heartbeats are stale while the owner sees the switch off in Vercel is Q-R36-F6, now ruled: the path below, and an incident card SOLO opens for why the sweep stopped.

## The Tuesday dry run (Q-R36-F3, ruled 2026-11-01): Tuesday 2026-11-03 after 21:00

Strategy: "The fallback's read-only dry run is Tue 11-03 after 21:00, READY by Tue 18:00." **No block changes for it.** GREEN pastes **BEFORE YOU START alone**, from a dispatch of its own that fills `RUNDAY=20261103` (a Tuesday, so the block's window is Tuesday 21:00 to Wednesday 06:29), HELD and DOCSHA as for Wednesday, and `STALEPATH=no`. Before it, the owner's first look (the Vercel switch: the block carries `--owner-says-sweep-is-not-sending`); the Inngest settings, the deploy look and the merge freeze are for the sending nights and are not needed for a read.

- **What it prints:** everything BEFORE YOU START prints (counts only): `ELIGIBLE`, `G1 UNDER THE LIMIT OF 20000:` (the answer Q-R36-F3 asked for), the G4 line, the G3 line, the touched count, and `for the owner: sweep    production's heartbeats: ...`. A refusal of check 3 prints the heartbeat line before it, so stale heartbeats show on Tuesday (checks 1 and 2 refuse before the heartbeats are read).
- **What it does not do:** it sends nothing (no `--confirm`), takes no lock (only a confirm takes one) and writes no marker (only a confirm writes it). It writes its records in `/tmp/r36-` (the head, the night, `main`, STALEPATH).
- **After it, GREEN pastes nothing else.** Its last line reads `DRY RUN ONLY: nothing else is pasted tonight.` (RUNDAY's weekday is not 3), and THE CANARY and THE REST STOP on any recorded night that is not a Wednesday, so nothing can be sent on Tuesday night by mistake. On Wednesday 21:00 the Tuesday record is also outside its window.
- **Wednesday's BEFORE YOU START starts clean:** its first commands remove every `/tmp/r36-` record, and its dry run requires this operation's marker to be empty, which the Tuesday run left it.
- A `G1 ... NO` or a refusal on Tuesday goes to strategy that night.

## Which appointments get an event

Exactly the 2026-10-12 selection, by the 2026-10-12 program, unchanged (its document, `docs/data-op-inc-1007-rearm-reminders.md`, "Which appointments get an event", is the full text). All of these hold:

1. The tenant is `osteojp`.
2. The status is `scheduled` or `confirmed`. So never a cancelled, completed or no-show visit.
3. The patient is not soft-deleted.
4. It is not an online request reception has not accepted.
5. It starts more than 24 hours after the read.
6. It starts no more than 28 days after the read (`--max-days-ahead 28`).
7. Its audit trail shows no scheduling audit row in the last 25 hours. **The rule reads every such row, so it also skips a visit whose only recent row is a confirm that sent nothing**, and that visit keeps the job it had, which may be at risk (rule 5 of the predicate). The sitting counts it inside `skipped: touched in the last 25 hours`, which BEFORE YOU START and THE CLOSING DRY RUN print for the owner; that count is wider, since it also holds saves that sent an event and gave their visit a fresh job. See Q-R36-F5.
8. Neither of its reminder times falls inside the run's margin (690 seconds with `--max 200`).
9. This operation's own marker does not hold it as sent at the same start, or as attempted.

Then the program reads that one row again just before its send, and skips it if it moved, changed status or was saved again since the first read.

### Why every qualifying appointment, and not only the ones at risk

SOLO's brief for this document asked to leave out visits whose reminders a live job already covers, if that can be known without reading the scheduler. **It cannot**, for three reasons in the code:

- **A save's event can fail with its audit row standing.** `enqueueRemindersAfterCommit` is best effort: "a failed enqueue is logged ... and swallowed" (`apps/web/lib/scheduling/reminders.ts`). The audit row says the clinic saved; it does not say a job exists.
- **A patient's own move in the portal changes the start with no event and no audit row** (`apps/api/lib/appointments/store.ts`, `rescheduleOwn`; `apps/web/lib/reminders/inngest/backstop.ts` says the same). Its job, if any, sleeps to the old time.
- **The events of 2026-10-12 wrote no audit row.** Only that sitting's marker records them.

So, as on 2026-10-12 (strategy's ruling of its Q3, option (a)), every qualifying appointment in the 28 days gets one event. For an appointment whose job is healthy, the event replaces it with one new job per reminder: measured on 2026-10-07 and 2026-10-08 on the scheduler's dev server (one script send, two, three; with and without an app save between; every pattern ended with exactly one email job and one SMS job), and live on production on 2026-10-12. Its cost is executions (below). Rule 7 leaves out what was touched in the last 25 hours, with the residual it carries.

**This also re-arms the visits of Friday 11-06 to Monday 11-09 that the 2026-10-12 sitting reached** (its marker is not read: this operation has its own). That costs a few dozen events and gives a portal-moved one among them its job back.

### Visits that were never saved by the clinic

The 2026-10-12 selection does not ask for a scheduling save, so an imported visit in the 28 days gets an event, as on 2026-10-12, and from then on its reminders like any other. That matches the owner's answer recorded in `reminder-population.ts` ("The owner's answer was to remind these visits") and the R36 switch, which turns REMINDERS_SWEEP_NEVER_REMINDED on together with sending. Leaving them out would need a change to the selection, which this document does not make. **It is a question for strategy (Q-R36-F2).** The dry run counts them only inside its totals; a separate count needs its own read.

## The horizon: 28 days, and why

- **The scheduler's limit.** The free plan publishes 30 days as the most a job may last, its sleep included; this account is on the free plan (3,895 of 50,000 executions on 2026-10-07). Sleeps of 7 to 30 days are observed to work on production (`OPS-scheduler-free-plan-30-day-run-limit`); beyond 30 days is NOT ESTABLISHED.
- **What 28 days makes a job sleep.** A visit starting 28 days after the read has its SMS 27 days after it and its email 26 days after it. With the sweep's backstop later switched on, a job adds at most 20 minutes after its time, and up to four more waits only for a visit moved later (`backstop.ts`, `MOVED_MARK_WAITS`). While the sweep stays in shadow, every job this sitting makes stays inside the published 30 days and inside the range observed to work, with three days to spare. If the sweep later sends, the job of a visit moved later in the portal follows the move up to four times, and such a job can run past 30 days: that is the backstop's design, not this sitting's.
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

1. **The owner's three looks**, in the sitting, BEFORE anything is pasted (every block carries `--owner-says-sweep-is-not-sending`, BEFORE YOU START included):
   - **Vercel**, Production environment variables of the project: the sweep's send switch is absent or is not `send`, and he will not change it during the sitting. With it `send`: this document is not used.
   - **Inngest**, as step 2 of 2026-10-12: `schedule-appointment-reminders` shows Debounce; `send-appointment-reminder` shows Singleton; the trigger of `send-appointment-confirmation` shows `event.data.confirmationEligible == true`. Every production deploy syncs the app since #1660, and the look is still made. With any of the three missing: stop.
   - **Vercel and GitHub Actions, the deploy has settled:** the latest Production deployment in Vercel reads Ready (not Building or Queued), and the scheduler sync of that deployment finished green. **The sync, step by step:** note the short commit sha Vercel shows for that Ready Production deployment; in GitHub, Actions, open the run named "Inngest auto-sync (osteojp-reminders, osteojp-consultation)" whose commit is that sha (the workflow starts on every deployment status, previews included, so runs of the same name sit beside it with their job Skipped: those are not the one); in that run the job "Sync osteojp-reminders and osteojp-consultation after a production deploy" shows a green check, not Skipped; and the run's summary shows the two headings "osteojp-reminders synced" and "osteojp-consultation synced". Any other state (no such run, the job Skipped, running, failed or cancelled, a heading missing): stop. Why: every production deploy syncs the scheduler (#1660) and restarts the functions, and a deploy or a sync while events arrive can fail the run that plans their reminders. What keeps a deploy from starting during the sitting is the MERGE FREEZE below, a precondition of the dispatch; this look checks that the last deploy before it has settled.
   - **Only when the dispatch carries `STALEPATH=yes` (Q-R36-F6):** the owner confirms BOTH that the switch is off in Vercel (the first look) AND that the Inngest dashboard (Production), Functions, `sweep-due-reminders`, Runs, shows no run with the status Completed since 07:00 Lisbon on the sitting's day (any runs since then Failed, or none at all). That is SOLO's proposed wording of the ruling (Q-R36-F6), built; strategy's own words were "no sweep-due-reminders runs in the last hour". SOLO sets `STALEPATH=yes` in a dispatch only on the ruling of Q-R36-F6 (the Tuesday dry run refused on stale or missing heartbeats), and opens an incident card for why the sweep stopped. If the owner cannot confirm both, the fallback stops there. With `STALEPATH=no` this look is not made, and stale heartbeats are a refusal. **The likely case is heartbeats fresh on Tuesday and stale by Wednesday 21:00.** Then BEFORE YOU START refuses on check 3; SOLO may re-issue the Wednesday dispatch with `STALEPATH=yes` that same night, on the owner's two confirmations, and BEFORE YOU START is pasted again (nothing was sent, and the marker is still empty). **Thursday's dispatch chooses its STALEPATH by the same rule:** `no` while the heartbeats are fresh; `yes` only when they are stale, the owner re-confirms both looks on Thursday, and the incident card is open.
   GREEN pastes the blocks, which carry `--owner-says-sweep-is-not-sending`, `--owner-saw-the-sweep-not-running` with the recorded STALEPATH, and `--i-checked-inngest-settings`, only on those words.
2. **BEFORE YOU START**, from the dispatch's filled copy. Network time, the night, the held head, every pin, the target guard, the sweep refusal, and the first dry run (counts only). It records the head, the night and `main`, and prints production's heartbeat line and the touched count for the owner.
3. **THE CANARY**: five appointments three or more days ahead.
4. **G2, the owner's check of the canary** (below). THE REST waits for his word.
5. **THE REST**, pasted again and again until its dry run reads `ELIGIBLE: 0`.
6. **THE CLOSING DRY RUN**, 12 minutes or more after the last send returned. It prints the touched count for the owner.
7. **The owner's look at the re-plan** (below, "After the closing dry run").

**THE MERGE FREEZE, mandatory: no merge to `main` from before step 1 until GREEN reports.** Every production deploy syncs the scheduler (#1660) and restarts the functions; a deploy while events arrive can fail the step that plans their reminders. SOLO and the owner are the only ones who merge (the owner merges GATE-CHANGEs and held pull requests). From before step 1 until GREEN reports, neither merges anything: SOLO disarms every armed pull request, opens no pull request, arms nothing and merges nothing (R2 is suspended for the sitting), and says so in writing in GREEN's dispatch, where the owner's part is stated too; a dispatch without that sentence is not issued. A move of `main` during the freeze means the freeze was broken. The blocks are the fail-safe behind it: THE CANARY and THE REST STOP when `origin/main` is not the commit BEFORE YOU START recorded (see "If a block stops").

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
STALEPATH='PENDING: no, or yes only on the ruling of Q-R36-F6'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
echo "${STALEPATH}" | grep -qxE 'no|yes' || { echo "STOP: STALEPATH is still PENDING, or is not no or yes, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${FIXSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: FIXSHA is not a full 40-character sha. Nothing was read from production and nothing was sent"; exit 1; }
rm -f /tmp/r36-head.sha /tmp/r36-night.ok /tmp/r36-canary.ok /tmp/r36-last-send.ok /tmp/r36-main.sha /tmp/r36-stale.ok || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production and nothing was sent"; exit 1; }
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
MAINSHA=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${MAINSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAINSHA}]. Nothing was read from production and nothing was sent"; exit 1; }
echo "main now:      ${MAINSHA}. No merge to main until the sitting ends"
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
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${STALEPATH}" 2>&1 | tee /tmp/r36-dry-a.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent"; exit 1; }
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
HB=$(grep -E "^sweep    production's heartbeats: " /tmp/r36-dry-a.out) || { echo "STOP: the dry run does not show production's heartbeat line. Nothing was sent"; exit 1; }
echo "for the owner: ${HB}"
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36-dry-a.out) || { echo "STOP: the dry run does not show the touched count. Nothing was sent"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "${TIP}" > /tmp/r36-head.sha || { echo "STOP: the held head could not be recorded. Nothing was sent"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/r36-night.ok || { echo "STOP: the night could not be recorded. Nothing was sent"; exit 1; }
echo "${MAINSHA}" > /tmp/r36-main.sha || { echo "STOP: origin/main could not be recorded. Nothing was sent"; exit 1; }
echo "${STALEPATH}" > /tmp/r36-stale.ok || { echo "STOP: STALEPATH could not be recorded. Nothing was sent"; exit 1; }
echo "recorded:      the held head ${TIP}, the night ${RUNDAY} to ${NEXTDAY}, main ${MAINSHA} and STALEPATH ${STALEPATH}, for the blocks that follow"
if [ "${RDOW}" = 3 ]; then NEXTSTEP="THE CANARY next."; else NEXTSTEP="DRY RUN ONLY: nothing else is pasted tonight."; fi
echo "BEFORE YOU START: every check passed. ELIGIBLE ${N} at this read. ${NEXTSTEP}"
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `the night: ... inside: yes`; `held head now:`; `main now:`; `checked out:`; `the fix:`; `document:`, `first line:` (not NOT READY), `sidecar:`; `program:`, `2026-10-12:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines with `target verified: production, session pooler.`; the program's lines IN FULL (counts only), among them `SWEEP GUARD: ...`, `target   PRODUCTION`, `mode     DRY RUN - nothing is sent`, `skipped: already sent by an earlier run (marker): 0`, `ELIGIBLE: <N>`, `G1 UNDER THE LIMIT OF 20000: yes`, the G4 line and its two lines (a count for the owner, never a failure), and the G3 line reading 0 for 0 appointments checked; `for the owner:` twice (production's heartbeat line, and the touched count); `recorded: ...`; then `BEFORE YOU START: every check passed. ELIGIBLE <N> ...`. Exit 0. It reads production and sends nothing.

### THE CANARY: five appointments, three or more days ahead

Pasted only after the owner's three looks, in the sitting. Three days, so both reminders are still ahead.

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
RDOW=$(TZ=Europe/Lisbon date -j -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%u') || { echo "STOP: the weekday of the recorded night could not be computed. Nothing was sent by this block"; exit 1; }
echo "${RDOW}" | grep -qx '[1-7]' || { echo "STOP: the weekday of the recorded night did not read as 1 to 7 [${RDOW}]. Nothing was sent by this block"; exit 1; }
[ "${RDOW}" = 3 ] || { echo "STOP: the recorded night ${RUNDAY} is not a Wednesday (weekday ${RDOW}). Every ruled sending night is a Wednesday; a Tuesday dry run records its own night, and nothing is sent on it. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-stale.ok || { echo "STOP: BEFORE YOU START recorded no STALEPATH in this sitting. Nothing was sent by this block"; exit 1; }
SR=$(cat /tmp/r36-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. Nothing was sent by this block"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. Nothing was sent by this block"; exit 1; }
test ! -f /tmp/r36-canary.ok || { echo "STOP: the canary already ran in this sitting. It is never sent twice. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-main.sha || { echo "STOP: BEFORE YOU START recorded no main in this sitting. Nothing was sent by this block"; exit 1; }
MREC=$(cat /tmp/r36-main.sha) || { echo "STOP: the recorded main could not be read. Nothing was sent by this block"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was sent by this block"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was sent by this block"; exit 1; }
echo "${MNOW} ${MREC}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{40}' || { echo "STOP: origin/main or the recorded main did not read as a full 40-character sha. Nothing was sent by this block"; exit 1; }
[ "${MNOW}" = "${MREC}" ] || { echo "STOP: main moved during the sitting (${MREC} to ${MNOW}): a merge deploys production and re-syncs the scheduler. The lead rules. Nothing was sent by this block"; exit 1; }
echo "main:          ${MNOW}, unchanged since BEFORE YOU START"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-b.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-b.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36-canary-dry.out || { echo "STOP: the canary's dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
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
caffeinate -i node ${WRAP} --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36-canary-send.out || { touch /tmp/r36-last-send.ok || { echo "STOP: the canary failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the canary failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36-last-send.ok || { echo "STOP: the time the canary returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qE '^SENT: 5 of 5  ' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show SENT: 5 of 5. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
grep -qxF 'G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent). Nothing further is sent"; exit 1; }
grep -qxF 'G3 AFTER THIS RUN: 0  (appointments checked: 5; handed to a provider: 0; expected 0)' /tmp/r36-canary-send.out || { echo "STOP: the canary does not show G3 AFTER THIS RUN: 0 for 5 appointments. Nothing further is sent"; exit 1; }
touch /tmp/r36-canary.ok || { echo "STOP: the canary's record could not be written. The five were sent. Nothing further is sent"; exit 1; }
echo "CANARY SENT: 5 of 5, G4 yes, G3 0. The owner checks the canary in the Inngest dashboard now (G2); THE REST waits for his word."
)
```

**EXPECT:** `running from:`; the sidecar line `docs/data-op-r36-fallback-rearm-20261104.md: OK`; `pins:`; `Lisbon now: ... inside: yes`; `main: ..., unchanged since BEFORE YOU START`; the target guard's lines; the canary's dry run IN FULL, counts only, with `THIS RUN: 5 of <N>`; `canary began:` in both zones; the canary's lines IN FULL, with `SENT: 5 of 5`, `G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)`, the `settle` line and `G3 AFTER THIS RUN: 0`; then `CANARY SENT: 5 of 5, G4 yes, G3 0. ...`. Exit 0.

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
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
RDOW=$(TZ=Europe/Lisbon date -j -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%u') || { echo "STOP: the weekday of the recorded night could not be computed. Nothing was sent by this block"; exit 1; }
echo "${RDOW}" | grep -qx '[1-7]' || { echo "STOP: the weekday of the recorded night did not read as 1 to 7 [${RDOW}]. Nothing was sent by this block"; exit 1; }
[ "${RDOW}" = 3 ] || { echo "STOP: the recorded night ${RUNDAY} is not a Wednesday (weekday ${RDOW}). Every ruled sending night is a Wednesday; a Tuesday dry run records its own night, and nothing is sent on it. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-stale.ok || { echo "STOP: BEFORE YOU START recorded no STALEPATH in this sitting. Nothing was sent by this block"; exit 1; }
SR=$(cat /tmp/r36-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. Nothing was sent by this block"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-canary.ok || { echo "STOP: the canary has not run in this sitting, so THE REST does not run. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36-main.sha || { echo "STOP: BEFORE YOU START recorded no main in this sitting. Nothing was sent by this block"; exit 1; }
MREC=$(cat /tmp/r36-main.sha) || { echo "STOP: the recorded main could not be read. Nothing was sent by this block"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was sent by this block"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was sent by this block"; exit 1; }
echo "${MNOW} ${MREC}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{40}' || { echo "STOP: origin/main or the recorded main did not read as a full 40-character sha. Nothing was sent by this block"; exit 1; }
[ "${MNOW}" = "${MREC}" ] || { echo "STOP: main moved during the sitting (${MREC} to ${MNOW}): a merge deploys production and re-syncs the scheduler. The lead rules. Nothing was sent by this block"; exit 1; }
echo "main:          ${MNOW}, unchanged since BEFORE YOU START"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36-rest-dry.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
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
caffeinate -i node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36-rest-send.out || { touch /tmp/r36-last-send.ok || { echo "STOP: the run failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the run failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
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
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
test -f /tmp/r36-stale.ok || { echo "STOP: BEFORE YOU START recorded no STALEPATH in this sitting. This block sends nothing"; exit 1; }
SR=$(cat /tmp/r36-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. This block sends nothing"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. This block sends nothing"; exit 1; }
test -f /tmp/r36-canary.ok || { echo "STOP: the canary has not run in this sitting. This block sends nothing"; exit 1; }
test -f /tmp/r36-last-send.ok || { echo "STOP: no send of this sitting recorded the time it returned. This block sends nothing"; exit 1; }
RECENT=$(find /tmp/r36-last-send.ok -mmin -12) || { echo "STOP: the age of the record of the last send could not be read. This block sends nothing"; exit 1; }
[ -z "${RECENT}" ] || { echo "STOP: the last send returned less than 12 minutes ago, so the window of its run has not closed. Wait, and paste this block again. This block sends nothing"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. This block sends nothing"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36-target-d.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. This block sends nothing"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36-target-d.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. This block sends nothing"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36-closing.out || { echo "STOP: the closing dry run failed or was refused; its lines are above. It is READ ONLY. This block sends nothing"; exit 1; }
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
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36-closing.out) || { echo "STOP: the closing dry run does not show the touched count. This block sends nothing"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent. The sends of the sitting are over."
)
```

**EXPECT:** the opening lines; the closing dry run IN FULL, counts only, with `ELIGIBLE: 0` and the G3 line reading 0 for every appointment the sitting sent; `for the owner: G4 NEXT 48 HOURS, NOT RE-ARMED: ...` (a count for the owner, as on 2026-10-12: the appointments of the next 48 hours this operation did not re-arm, most of them healthy); `for the owner: skipped: touched in the last 25 hours: <n> ...`; then `CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the <K> appointments this operation sent. ...`. Exit 0. GREEN reports every line of every block.

### After the closing dry run: the owner's look at the re-plan

Each event cancels the appointment's sleeping jobs when it arrives, and their replacements exist only if the planning run, `schedule-appointment-reminders`, succeeds. A failed planning run (a deploy, a 5xx) leaves that appointment with no job at all, and no line any block reads shows it. So, after THE CLOSING DRY RUN, the owner looks in the Inngest dashboard (Production): **Functions, `schedule-appointment-reminders`, Runs, from the minute `canary began` printed: none with the status Failed**; and the same for `send-appointment-reminder`. Any Failed run: report it with its count, and the lead rules. The marker holds that appointment as sent, so no later run of this program sends it again unasked.

## THE SECOND PASS: Thursday 2026-11-05 night (Q-R36-F5, ruled 2026-11-01)

Strategy: "If the fallback runs Wed night, its second pass runs Thu 11-05 night." **THE PRECONDITION: WEDOK.** The second pass is pasted only from a dispatch of its own (`RUNDAY=20261105`, a Thursday, which its first block requires; HELD, DOCSHA, STALEPATH and WEDOK), and **SOLO fills `WEDOK=yes` only when GREEN's Wednesday report shows that G2 passed AND that Wednesday ended with THE CLOSING DRY RUN's last line, or with a THE REST `main moved` stop the lead ruled continues on Thursday. Never after a G2 failure, a G3 stop, a FAILED send or a lock left behind.** The Thursday dispatch quotes this precondition and the lines of Wednesday's report it rests on. Its first block also requires, by machine, a settled marker: the first sending run of Wednesday read the database 25 hours or more before, no row of unknown outcome, no lock (`--second-pass`). The same rules as Wednesday: the owner's looks of step 1, THE MERGE FREEZE from before them until GREEN reports, the same machine, the halt rule, counts only.

**What it re-arms, and why it reaches the residual.** The events of Wednesday wrote no audit row, so Wednesday's sends do not make anything "touched" on Thursday; this operation's marker skips them instead, at the start each had then. Thursday's window opens 24 hours after Wednesday's, not 25, so **the program checks it**: with `--second-pass` it refuses unless the first sending run recorded in the marker (Wednesday's canary) read the database 25 hours or more before. That guarantees every visit skipped as touched at the canary's read is no longer touched by Thursday, unless it was saved again since. A visit touched after the canary's read (a night-time save, skipped as touched by THE REST) stays touched until 25 hours after that touch, so Thursday skips it again and counts it in its touched count; staff saves happen in clinic hours, before the canary, so this slice is expected to be small. Thursday opens 25 hours after Wednesday's `canary began` line, not at a fixed hour: if Wednesday's canary began at 21:15, the block refuses until about 22:15; wait and paste it again. A canary later than about 05:29 Thursday leaves no room for a second pass inside Thursday's window. So the second pass sends to:

- every visit Wednesday skipped as touched and nobody touched again since: THE RESIDUAL (a confirm that sent nothing), and also those whose touch did send an event (a fresh job for a healthy one: harmless, as on 2026-10-12; the program cannot tell them apart);
- any visit Wednesday could not reach for another reason: rows left unsent by a halted Wednesday (a THE REST `main moved` stop), and a visit moved in the patient portal since Wednesday (the marker holds it at its old start);
- **and nothing else new, within a few hours:** `--max-days-ahead 27`, so its reach (Thursday's read plus 27 days) is within a few hours of Wednesday's (Wednesday's read plus 28 days), on either side. No visit starts at night, so in practice it adds no day; a slice at the far edge that either reach misses falls to the sitting of Wednesday 11-11.

It never sends twice: a visit Wednesday sent at its present start is `skipped: already sent by an earlier run (marker)`; an attempted one is skipped unless the lead rules `--resend-attempted`. **What stays out:** a residual visit that starts within 24 hours of Thursday's read (its SMS time has passed, as on 2026-10-12), and the residual of Thursday's own rule 7 (a confirm that sent nothing on Thursday), which its closing dry run counts for the owner. No third pass is ruled.

**How it uses the marker.** BEFORE YOU START refuses a non-empty marker by design. The second pass has its own first block, which REQUIRES the marker to hold Wednesday's sends (G3 checks five or more appointments, none attempted), and its own records in `/tmp/r36p2-`, so nothing of Wednesday's records is read and Wednesday's blocks cannot be pasted on its night. It has no canary: Wednesday's canary and G2 checked that the events arrive and schedule.

The order: the owner's looks of step 1; SECOND PASS, BEFORE YOU START (from the dispatch's filled copy); SECOND PASS, THE SENDS, pasted again and again until its dry run reads `ELIGIBLE: 0`; SECOND PASS, THE CLOSING DRY RUN, 12 minutes or more after its last send (at once if it sent nothing); the owner's look at the re-plan, from the minute the second pass's first send began.

### SECOND PASS, BEFORE YOU START. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
RUNDAY='PENDING: the Lisbon date of the night the dispatch names, YYYYMMDD'
STALEPATH='PENDING: no, or yes only on the ruling of Q-R36-F6'
WEDOK='PENDING: yes only when GREEN reported Wednesday settled, as THE SECOND PASS names it'
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
[ "${WEDOK}" = yes ] || { echo "STOP: WEDOK is not yes: SOLO fills it only when GREEN's Wednesday report shows G2 passed and Wednesday ended with THE CLOSING DRY RUN's last line, or with a THE REST main-moved stop the lead ruled continues on Thursday. Nothing was read from production and nothing was sent"; exit 1; }
echo "${STALEPATH}" | grep -qxE 'no|yes' || { echo "STOP: STALEPATH is still PENDING, or is not no or yes, so this block is NOT READY. Nothing was read from production and nothing was sent"; exit 1; }
echo "${FIXSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: FIXSHA is not a full 40-character sha. Nothing was read from production and nothing was sent"; exit 1; }
rm -f /tmp/r36p2-head.sha /tmp/r36p2-night.ok /tmp/r36p2-canary.ok /tmp/r36p2-last-send.ok /tmp/r36p2-main.sha /tmp/r36p2-stale.ok || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production and nothing was sent"; exit 1; }
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
echo "${RDOW}" | grep -qx '4' || { echo "STOP: RUNDAY ${RUNDAY} is not a Thursday (it reads as weekday ${RDOW}). The second pass runs on the Thursday after a Wednesday sitting. Nothing was read from production and nothing was sent"; exit 1; }
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
MAINSHA=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read from production and nothing was sent"; exit 1; }
echo "${MAINSHA}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAINSHA}]. Nothing was read from production and nothing was sent"; exit 1; }
echo "main now:      ${MAINSHA}. No merge to main until the sitting ends"
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
node ${GUARD} 2>&1 | tee /tmp/r36p2-target-a.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read from production and nothing was sent"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36p2-target-a.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read from production and nothing was sent"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 27 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${STALEPATH}" --second-pass 2>&1 | tee /tmp/r36p2-dry-a.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36p2-dry-a.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36p2-dry-a.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent"; exit 1; }
grep -qE '^held back: starts more than --max-days-ahead 27 days after the read: [0-9]+$' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show the 27 day bound. Nothing was sent"; exit 1; }
grep -qxF 'skipped: attempted by an earlier run, outcome unknown (marker): 0' /tmp/r36p2-dry-a.out || { echo "STOP: this operation's marker holds attempted rows. The lead rules. Nothing was sent"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Strategy rules on the scope. Nothing was sent"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36p2-dry-a.out) || { echo "STOP: the dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]: this operation's marker is empty, so Wednesday sent nothing and this is not a second pass. The lead rules. Nothing was sent"; exit 1; }
[ "${K}" -ge 5 ] || { echo "STOP: this operation's marker holds ${K} sent rows, fewer than the canary's five: Wednesday's sitting did not send its canary, so this is not a second pass. The lead rules. Nothing was sent"; exit 1; }
grep -qxF 'marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show that the first sitting is settled. Nothing was sent"; exit 1; }
echo "the marker:    Wednesday's sitting sent ${K} appointments; each is skipped at the start it had then, and nothing is sent twice"
grep -qE '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36p2-dry-a.out || { echo "STOP: the dry run does not show the G4 line. Nothing was sent"; exit 1; }
HB=$(grep -E "^sweep    production's heartbeats: " /tmp/r36p2-dry-a.out) || { echo "STOP: the dry run does not show production's heartbeat line. Nothing was sent"; exit 1; }
echo "for the owner: ${HB}"
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36p2-dry-a.out) || { echo "STOP: the dry run does not show the touched count. Nothing was sent"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "${TIP}" > /tmp/r36p2-head.sha || { echo "STOP: the held head could not be recorded. Nothing was sent"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/r36p2-night.ok || { echo "STOP: the night could not be recorded. Nothing was sent"; exit 1; }
echo "${MAINSHA}" > /tmp/r36p2-main.sha || { echo "STOP: origin/main could not be recorded. Nothing was sent"; exit 1; }
echo "${STALEPATH}" > /tmp/r36p2-stale.ok || { echo "STOP: STALEPATH could not be recorded. Nothing was sent"; exit 1; }
echo "recorded:      the held head ${TIP}, the night ${RUNDAY} to ${NEXTDAY}, main ${MAINSHA} and STALEPATH ${STALEPATH}, for the blocks that follow"
echo "SECOND PASS, BEFORE YOU START: every check passed. ELIGIBLE ${N} at this read. SECOND PASS, THE SENDS next."
)
```

**EXPECT:** as BEFORE YOU START, with `--max-days-ahead 27` and, instead of an empty marker, `the marker: Wednesday's sitting sent <K> appointments; ...` and the G3 line reading 0 for those K; then `SECOND PASS, BEFORE YOU START: every check passed. ELIGIBLE <N> at this read. ...`. Exit 0. It sends nothing.

### SECOND PASS, THE SENDS: repeated until its dry run reads ELIGIBLE 0

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
test -f /tmp/r36p2-head.sha || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no head in this sitting. Nothing was sent by this block"; exit 1; }
REC=$(cat /tmp/r36p2-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was sent by this block"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. Nothing was sent by this block"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was sent by this block"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was sent by this block"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head SECOND PASS, BEFORE YOU START recorded. Nothing was sent by this block"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was sent by this block"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was sent by this block"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head SECOND PASS, BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was sent by this block"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36p2-night.ok || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no night in this sitting. Nothing was sent by this block"; exit 1; }
NIGHT=$(cat /tmp/r36p2-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was sent by this block"; exit 1; }
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
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night SECOND PASS, BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was sent by this block"; exit 1; }
RDOW=$(TZ=Europe/Lisbon date -j -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%u') || { echo "STOP: the weekday of the recorded night could not be computed. Nothing was sent by this block"; exit 1; }
echo "${RDOW}" | grep -qx '[1-7]' || { echo "STOP: the weekday of the recorded night did not read as 1 to 7 [${RDOW}]. Nothing was sent by this block"; exit 1; }
[ "${RDOW}" = 4 ] || { echo "STOP: the recorded night ${RUNDAY} is not a Thursday (weekday ${RDOW}). The second pass runs on the Thursday after a Wednesday sitting. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36p2-stale.ok || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no STALEPATH in this sitting. Nothing was sent by this block"; exit 1; }
SR=$(cat /tmp/r36p2-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. Nothing was sent by this block"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. Nothing was sent by this block"; exit 1; }
test -f /tmp/r36p2-main.sha || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no main in this sitting. Nothing was sent by this block"; exit 1; }
MREC=$(cat /tmp/r36p2-main.sha) || { echo "STOP: the recorded main could not be read. Nothing was sent by this block"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was sent by this block"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was sent by this block"; exit 1; }
echo "${MNOW} ${MREC}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{40}' || { echo "STOP: origin/main or the recorded main did not read as a full 40-character sha. Nothing was sent by this block"; exit 1; }
[ "${MNOW}" = "${MREC}" ] || { echo "STOP: main moved during the sitting (${MREC} to ${MNOW}): a merge deploys production and re-syncs the scheduler. The lead rules. Nothing was sent by this block"; exit 1; }
echo "main:          ${MNOW}, unchanged since SECOND PASS, BEFORE YOU START"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was sent by this block"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36p2-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was sent by this block"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36p2-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was sent by this block"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 27 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36p2-rest-dry.out || { echo "STOP: the dry run failed or was refused; its lines are above. A dry run is READ ONLY and nothing was sent by this block"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36p2-rest-dry.out || { echo "STOP: the dry run does not show the sweep guard's line. Nothing was sent by this block"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36p2-rest-dry.out || { echo "STOP: the dry run does not show the line target PRODUCTION. Nothing was sent by this block"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36p2-rest-dry.out || { echo "STOP: the dry run does not show the line mode DRY RUN. Nothing was sent by this block"; exit 1; }
EC=$(grep -cxE 'ELIGIBLE: [0-9]+' /tmp/r36p2-rest-dry.out) || { echo "STOP: the dry run holds no ELIGIBLE line. Nothing was sent by this block"; exit 1; }
[ "${EC}" = 1 ] || { echo "STOP: the dry run holds ${EC} ELIGIBLE lines, not exactly one. Nothing was sent by this block"; exit 1; }
N=$(grep -xE 'ELIGIBLE: [0-9]+' /tmp/r36p2-rest-dry.out | cut -d' ' -f2) || { echo "STOP: the ELIGIBLE number could not be read from the dry run. Nothing was sent by this block"; exit 1; }
echo "${N}" | grep -qxE '0|[1-9][0-9]{0,5}' || { echo "STOP: the ELIGIBLE number of the dry run did not read as a whole number [${N}]. Nothing was sent by this block"; exit 1; }
grep -qxF 'G1 UNDER THE LIMIT OF 20000: yes' /tmp/r36p2-rest-dry.out || { echo "STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes. Nothing was sent by this block"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36p2-rest-dry.out) || { echo "STOP: the dry run does not show the G3 line reading 0 with not checkable 0. Nothing was sent by this block"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. Nothing was sent by this block"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. Nothing was sent by this block"; exit 1; }
[ "${K}" -ge 5 ] || { echo "STOP: G3 checked ${K} appointments, fewer than the canary's five, so the marker is not this operation's. The lead rules. Nothing was sent by this block"; exit 1; }
if [ "${N}" = 0 ]; then echo "SECOND PASS: ELIGIBLE 0 at this read, so nothing is left to send and nothing was sent by this block. Paste SECOND PASS, THE CLOSING DRY RUN 12 minutes or more after the last send of this pass returned, or at once if this pass sent nothing."; exit 0; fi
echo "the dry run passed: ${N} eligible, G3 0 for ${K} appointments checked. This run sends up to 200 now"
caffeinate -i node ${WRAP} --tenant-slug osteojp --max-days-ahead 27 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" --confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings 2>&1 | tee /tmp/r36p2-rest-send.out || { touch /tmp/r36p2-last-send.ok || { echo "STOP: the run failed or was refused, and the time it returned could not be recorded; its lines are above. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }; echo "STOP: the run failed or was refused; its lines are above. Conclude nothing from the exit code. What they show as sent stays sent and is in the marker. Nothing further is sent"; exit 1; }
touch /tmp/r36p2-last-send.ok || { echo "STOP: the time the run returned could not be recorded. What the lines above show as sent stays sent. Nothing further is sent"; exit 1; }
SL=$(grep -cE '^SENT: [0-9]+ of [0-9]+  ' /tmp/r36p2-rest-send.out) || { echo "STOP: the run does not show a SENT line. Nothing further is sent"; exit 1; }
[ "${SL}" = 1 ] || { echo "STOP: the run shows ${SL} SENT lines, not exactly one. Nothing further is sent"; exit 1; }
grep -qE '^G4 ATTEMPTED EQUALS SENT: yes [(]' /tmp/r36p2-rest-send.out || { echo "STOP: the run does not show G4 ATTEMPTED EQUALS SENT: yes. Nothing further is sent"; exit 1; }
grep -qxE 'G3 AFTER THIS RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; expected 0[)]' /tmp/r36p2-rest-send.out || { echo "STOP: the run does not show G3 AFTER THIS RUN: 0. Nothing further is sent"; exit 1; }
echo "SECOND PASS: this run ended clean. Paste SECOND PASS, THE SENDS again; when its dry run reads ELIGIBLE 0, paste SECOND PASS, THE CLOSING DRY RUN 12 minutes or more after this run."
)
```

**EXPECT:** as THE REST, with `--max-days-ahead 27`, and no canary record asked for; then `SECOND PASS: ELIGIBLE 0 at this read, ...` (exit 0, nothing sent), or the run's lines with one `SENT:` line, `G4 ATTEMPTED EQUALS SENT: yes`, `G3 AFTER THIS RUN: 0` and `SECOND PASS: this run ended clean. ...`. Exit 0.

### SECOND PASS, THE CLOSING DRY RUN

```
(
set -o pipefail
FIXSHA=20a6d73151468d36c080bcfd6cfad528d3a69d2d
SHAWRAP=1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454
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
test -f /tmp/r36p2-head.sha || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no head in this sitting. This block sends nothing"; exit 1; }
REC=$(cat /tmp/r36p2-head.sha) || { echo "STOP: the recorded head could not be read. This block sends nothing"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${REC}]. This block sends nothing"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. This block sends nothing"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. This block sends nothing"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the head SECOND PASS, BEFORE YOU START recorded. This block sends nothing"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. This block sends nothing"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. This block sends nothing"; echo "${STRAY}"; exit 1; }
echo "running from:  ${REC}, the head SECOND PASS, BEFORE YOU START recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${WRAP} | cut -d' ' -f1)" = "${SHAWRAP}" ] || { echo "STOP: the program on disk is not the approved file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${EMIT} | cut -d' ' -f1)" = "${SHAEMIT}" ] || { echo "STOP: the program of 2026-10-12 on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${GUARD} | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. This block sends nothing"; exit 1; }
[ "$(shasum -a 256 ${PTM} | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. This block sends nothing"; exit 1; }
echo "pins:          the program, the program of 2026-10-12, the target guard and its module are the pinned files"
test -f /tmp/r36p2-night.ok || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no night in this sitting. This block sends nothing"; exit 1; }
NIGHT=$(cat /tmp/r36p2-night.ok) || { echo "STOP: the recorded night could not be read. This block sends nothing"; exit 1; }
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
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night SECOND PASS, BEFORE YOU START recorded (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). This block sends nothing"; exit 1; }
test -f /tmp/r36p2-stale.ok || { echo "STOP: SECOND PASS, BEFORE YOU START recorded no STALEPATH in this sitting. This block sends nothing"; exit 1; }
SR=$(cat /tmp/r36p2-stale.ok) || { echo "STOP: the recorded STALEPATH could not be read. This block sends nothing"; exit 1; }
echo "${SR}" | grep -qxE 'no|yes' || { echo "STOP: the recorded STALEPATH is not no or yes [${SR}]. This block sends nothing"; exit 1; }
if test -f /tmp/r36p2-last-send.ok; then RECENT=$(find /tmp/r36p2-last-send.ok -mmin -12) || { echo "STOP: the age of the record of the last send could not be read. This block sends nothing"; exit 1; }; [ -z "${RECENT}" ] || { echo "STOP: the last send of this pass returned less than 12 minutes ago, so the window of its run has not closed. Wait, and paste this block again. This block sends nothing"; exit 1; }; fi
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. This block sends nothing"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/r36p2-target-d.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. This block sends nothing"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/r36p2-target-d.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. This block sends nothing"; exit 1; }
node ${WRAP} --tenant-slug osteojp --max-days-ahead 27 --max 200 --owner-says-sweep-is-not-sending --owner-saw-the-sweep-not-running "${SR}" 2>&1 | tee /tmp/r36p2-closing.out || { echo "STOP: the closing dry run failed or was refused; its lines are above. It is READ ONLY. This block sends nothing"; exit 1; }
grep -qxF "${SWEEPOK}" /tmp/r36p2-closing.out || { echo "STOP: the closing dry run does not show the sweep guard's line. This block sends nothing"; exit 1; }
grep -qxF 'target   PRODUCTION' /tmp/r36p2-closing.out || { echo "STOP: the closing dry run does not show the line target PRODUCTION. This block sends nothing"; exit 1; }
grep -qxF 'mode     DRY RUN - nothing is sent' /tmp/r36p2-closing.out || { echo "STOP: the closing dry run does not show the line mode DRY RUN. This block sends nothing"; exit 1; }
grep -qxF 'ELIGIBLE: 0' /tmp/r36p2-closing.out || { echo "STOP: the closing dry run does not read ELIGIBLE: 0. Paste SECOND PASS, THE SENDS again, then this block 12 minutes or more after it. This block sends nothing"; exit 1; }
G3L=$(grep -xE 'G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  [(]appointments checked: [0-9]+; handed to a provider: 0; not checkable: 0; expected 0[)]' /tmp/r36p2-closing.out) || { echo "STOP: the closing dry run does not show the G3 line reading 0 with not checkable 0. This block sends nothing"; exit 1; }
K=$(echo "${G3L}" | sed -E 's/.*appointments checked: ([0-9]+);.*/\1/') || { echo "STOP: the number of appointments checked could not be read from the G3 line. This block sends nothing"; exit 1; }
echo "${K}" | grep -qxE '[1-9][0-9]{0,5}' || { echo "STOP: the number of appointments checked did not read as a whole number above 0 [${K}]. This block sends nothing"; exit 1; }
[ "${K}" -ge 5 ] || { echo "STOP: G3 checked ${K} appointments, fewer than the canary's five. The lead rules. This block sends nothing"; exit 1; }
G4L=$(grep -E '^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ ' /tmp/r36p2-closing.out) || { echo "STOP: the closing dry run does not show the G4 line. This block sends nothing"; exit 1; }
echo "for the owner: ${G4L}"
TCH=$(grep -xE 'skipped: touched in the last 25 hours: [0-9]+' /tmp/r36p2-closing.out) || { echo "STOP: the closing dry run does not show the touched count. This block sends nothing"; exit 1; }
echo "for the owner: ${TCH} (it holds any visit whose last touch was a confirm that sent nothing: the residual of Q-R36-F5)"
echo "SECOND PASS, CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent. The second pass is over."
)
```

**EXPECT:** as THE CLOSING DRY RUN, with `--max-days-ahead 27`; the 12 minute wait applies only when this pass sent; `for the owner:` the G4 line and the touched count (Thursday's own residual, which stays); then `SECOND PASS, CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the <K> appointments this operation sent. The second pass is over.` Exit 0.

## Weekly sittings after a fallback (Q-R36-F1, ruled 2026-11-01)

Strategy: "Only if still in shadow after a fallback: a fallback sitting every Wednesday from 11-11, the last by Wed 11-25, then strategy re-rules." So if this fallback ran and the sweep still does not send, a fallback sitting runs on Wednesday 2026-11-11, 2026-11-18 and 2026-11-25, each from its own dispatch (RUNDAY, HELD, DOCSHA, STALEPATH, SOLO's statement of the merge freeze), **each with blocks authored, R4-reviewed and rehearsed on strategy's go-ahead**: the blocks of this document cannot run them as they stand (BEFORE YOU START refuses a non-empty marker, the marker's folder is fixed under the home folder, and the second pass's blocks are fixed at 27 days, Thursday and no canary). Each reaches 28 days from its read: the sitting of Wednesday 11-25 reaches visits starting up to Wednesday 2026-12-23. After it, strategy re-rules. None of it runs if the sweep sends by then.

## If a block stops

- **Before a send** (every STOP of BEFORE YOU START, and of the others before their `caffeinate` line): nothing was sent by that block. Report, and the lead rules.
- **`main moved during the sitting`, in THE CANARY.** Its check of `main` runs before its dry run and its send, so nothing was sent and this operation's marker is empty. Halt and report. A move during the freeze means the freeze was broken, so before anything is pasted again SOLO re-confirms the freeze in writing and names what moved `main` (which pull request, merged by whom). Then, on the lead's ruling, after the owner's three looks again (the Vercel switch, the step-1 Inngest settings looked at again, and the new deployment Ready with its scheduler sync green, by the steps of step 1), BEFORE YOU START may be pasted again: it clears the records and re-records `main`, and the sitting goes on from THE CANARY.
- **`main moved during the sitting`, in THE REST** (the canary has sent): **halt for the night.** The owner looks in the Inngest dashboard (Production) at `schedule-appointment-reminders`, Runs, from the minute `canary began` printed: every one Completed, none Running or Failed; and at the scheduler sync of the new deployment, by the steps of step 1. GREEN reports both with every line above. Nothing resumes this sitting: BEFORE YOU START stops on this operation's non-empty marker, by design, and no block re-records `main` after a send. **The appointments not yet re-armed that night are left to THE SECOND PASS (Thursday 2026-11-05 night), on its precondition: the lead's ruling that the stop continues on Thursday, quoted in WEDOK.** Until it runs they stay as they were, at risk by the predicate. If strategy rules (b) of Q-R36-F5, they stay so until the sweep sends.
- **In or after a send:** what the lines show as sent stays sent and is in the marker. A row the run stopped on is held as attempted, and no later run sends it unless the lead rules `--resend-attempted`, as on 2026-10-12. A killed run leaves the lock: a halt, the lead rules. Never delete the marker or the lock by hand in a sitting.
- **A refusal of the sweep guard** (the switch reads send, the owner's word is missing, a heartbeat is not shadow or is stale): nothing was read by the 2026-10-12 program and nothing was sent. If the sweep is sending, this document is not used that night.

## Rollback

None is needed and none exists. It writes nothing to Postgres. An event cannot be recalled and need not be: with the settings of the owner's Inngest look live, each event leaves its appointment with exactly one waiting reminder per channel. A run that stops half way leaves nothing to undo.

## Replay

**Nobody presses Replay or Rerun on any event or run in the Inngest dashboard: not before the sitting, not during it, not after it.** The reasons are the 2026-10-12 document's ("Replay"). A row whose send is in doubt goes out again only through the program, as a new event, on the lead's ruling.

## Rehearsal

**REHEARSED by a session that did not write this, on BLUE (a local throwaway, Postgres at production's migration position, through `0108`), in three runs:** run 1 Sat 2026-10-31 14:57 to 15:14 WET and run 2 Sun 2026-11-01 20:47 to 21:01 WET at `3e674b3a` (run 2 re-seeded from scratch after a 30-hour stop; run 1 matched it line for line); run 3 Sun 2026-11-01 about 21:05 to 21:26 WET at `d5897b6d`, the delta. **At `aaceb468` the four blocks were byte-identical to the blocks run 3 ran** (compared fence by fence; the only block removed since is the resume block that R4 round 3 led to removing, whose run-3 logs are marked "removed block, not part of the record"), and the program `packages/db/scripts/r36-fallback-rearm-emit.mjs` is byte-identical to the one run 3 ran (`65a48f48...74e0`). Logs: SOLO's scratch area, `rehearse-r36/` (`out/`, `run3/out/`). **Since `aaceb468` (2026-11-01, strategy's rulings) the four blocks and the program have changed and three blocks were added; none of that is rehearsed (see "What must happen before READY").**

**The seed.** A tenant with slug `osteojp` and a second tenant; 20 appointments: in scope 8 staff-saved (scheduled and confirmed, 2 to 27 days ahead) and 1 imported-shape visit with no audit row; out of scope cancelled, completed, no-show, an unaccepted portal request, an unaccepted request found through a staff notification, one 40 days ahead, one with a soft-deleted patient, one 12 hours ahead, one saved 2 hours ago, one in the past, one of the other tenant. Heartbeats in the shape `sweep.ts` writes, one per 15-minute pass over 7 days, the other tenant always `send` 5 minutes old.

**The substitutions, and nothing else:** (a) the production connection string replaced by the throwaway's, inline for one command; (b) lines sourcing the environment file skipped; (c) `cd` into the apply checkout replaced by a scratch clone whose `origin` is a local bare repository; (d) `/tmp/` and the marker's home folder replaced by scratch folders; (e) the night's window not faked: its STOP recorded; (f) the target guard's refusal of 127.0.0.1 recorded, not passed; (g) the NOT READY first line proven to stop, then HELD, DOCSHA and RUNDAY filled as the dispatch fills them; (h) `--sink-file` on every program call, so events went to a local file, never the hosted scheduler; (i) the switch and the owner's flag set inline as test inputs. The lead's rule held throughout: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so."

**Results.**
- **Counts equal the seed:** FUTURE REMINDABLE 14, unaccepted 2, within 24 hours 1, beyond 28 days 1, touched in the last 25 hours 1; ELIGIBLE 9 (scheduled 6, confirmed 3); G1 260 for 10 in scope, `yes`.
- **The sweep refusal, 13 cases:** the switch `send` and the missing owner flag refuse before any database read; a newest `send` heartbeat, a newest shadow 13 hours or 12 hours 1 minute old, a `send` heartbeat 3 days or 6 days 23 hours old, and no heartbeat at all refuse with only the heartbeat read run (`pg_stat_statements` counted); a shadow 11 hours 59 minutes old, a `send` heartbeat 8 days old, and a fresh shadow with the other tenant on `send` proceed. The switch line prints only `SET` or `UNSET`; a distinctive switch value appeared on 0 output lines.
- **A whole sitting into the sink:** the canary `SENT: 5 of 5`, G3 AFTER 0 for 5; THE REST `SENT: 4 of 4`; THE REST again ELIGIBLE 0; THE CLOSING DRY RUN refused before 12 minutes and passed after, ELIGIBLE 0, G3 0 for 9. **9 events for the 9 in-scope appointments**, each `appointment/scheduled` with `name` and `data` only (no event id), `confirmationEligible` false; the marker 5 + 4 rows, `maxDaysAhead` 28.
- **The main freeze:** with `main` moved after BEFORE YOU START, THE CANARY STOPPED before its dry run and send (no sink file); with `main` moved after the canary sent, THE REST STOPPED before sending (the sink still held exactly 5).
- **The ceilings:** `--max 201`, `--max-days-ahead 29`, a missing `--max-days-ahead` and a repeated `--max` exit 2 before any read.
- **Counts only:** 0 matches for uuids, the seeded names, phones and emails, `@`, the connection string or the switch value in any program output (the same search finds 21 in the seed as a control).
- **The tests:** 37 of 37 at `3e674b3a`, 38 of 38 at `d5897b6d`.

**The delta, run 6, Mon 2026-11-02 about 01:25 to 02:00 WET at `4da47d3f`,** on the same throwaway rebuilt through `0108`, by the same session that did not write this; runs 4 and 5 were on superseded commits and are not part of the record. It covers everything since `aaceb468`: the seven blocks and the program as they stand now (program `1795c035...f454`). The substitutions are (a) to (i) above; (g) also filled STALEPATH and WEDOK, as the dispatch does.
- **The stale-heartbeat path, nine heartbeat states with the owner's word given and not given:** `--owner-saw-the-sweep-not-running yes` proceeded, printing `STALE-HEARTBEAT PATH TAKEN`, only for a newest shadow from before the sitting day's 07:00 (06:59, and 19 hours old) and for no heartbeat at all. It refused for any heartbeat at or after 07:00 (07:01, 13 hours old, 2 hours old, 10 minutes old) and for a `send` heartbeat 3 days or 8 days old. Without the word, every stale state refused. Every refusal left the appointment, tenant, re-read and ledger counters unmoved (`pg_stat_statements`).
- **The Tuesday dry run (RUNDAY `20261103`):** counts equal to the seed, both "for the owner" lines, last line `DRY RUN ONLY: nothing else is pasted tonight.`, no marker folder, no lock, nothing in the sink. THE CANARY and THE REST after it STOPPED (`the recorded night 20261103 is not a Wednesday`). Wednesday's BEFORE YOU START then started clean.
- **Wednesday, then the second pass:** Wednesday sent 8 (canary 5, the rest 3), the closing dry run ELIGIBLE 0. WEDOK `no`, a Wednesday RUNDAY and `--second-pass` before 25 hours each STOPPED, with the marker unchanged by checksum. **The one edit to test data:** to pass the 25-hour check without waiting 25 hours, the first `readAt` in the scratch marker this rehearsal's own sink run had created was set to 26 hours old; it is test data on a throwaway, not a guard on production, and an untouched copy is kept. The second pass then sent 2, exactly the two it should: a residual visit (its last audit row a hand-set confirm, skipped on Wednesday) and a visit moved portal-style with no audit row. Its closing dry run read ELIGIBLE 0.
- **Nothing twice:** 10 events across both nights, each appointment and start at most once; the only appointment sent twice is the moved one, at its old start and its new one. No event id, `confirmationEligible` false, no lock left.
- **An empty marker:** the second pass STOPPED, sink empty.
- **The tests:** 43 of 43 at `4da47d3f`. **Counts only:** 58 output files, 0 matches for uuids, seeded names, phones, emails or the connection string (21 in the seed as a control).

**NOT REHEARSED, said one by one:**
- from run 6: a genuine 25-hour wait (the scratch marker was aged, as stated above); the stale-heartbeat path through a whole sitting (dry runs only, in the matrix); `--second-pass` refusing on an attempted row or a lock left behind (the code has both, and the unit tests hold them, but neither was produced on the throwaway);
- network time (`sntp`, the Date headers): no remote host;
- the night's window: not a Wednesday night;
- the target guard's pass and `target PRODUCTION`: they refuse 127.0.0.1 by design;
- the real send to the hosted scheduler, G2 and every owner look (Vercel, GitHub Actions, the Inngest settings, the re-plan look): the owner's;
- the marker and lock in `~/.osteojp-r36-fallback-rearm`: sink runs keep them beside the sink file;
- `OUT OF TIME`, a killed run, a failed send, and a row that changes between its read and its send.

**Observations, no defect:** a refused confirm can leave the marker's empty folder behind; the heartbeat is read before the 2026-10-12 program's check for the event key, so a confirm with no key reads `reminder_sweep_passes` once before refusing (read only).

## What must happen before READY, in this order, and none of it by GREEN

1. **The R4 round:** DONE, six rounds (see "Review history"), including the changes of 2026-11-01.
2. **The rehearsal:** DONE, including the delta of 2026-11-02 at `4da47d3f` (see "Rehearsal").
3. **No GATE-CHANGE is needed to land the two new test files.** Both are under `scripts/**/*.test.mjs`, a gate glob, but the freeze allows an ADDED gate file (`scripts/assert-gates-unchanged.mjs`: "ADDING A FILE IS ALLOWED, MODIFYING AND DELETING ARE NOT"), and `scripts/gate-freeze.test.mjs` passes on this branch (run 2026-10-31). They become frozen at the next GATE-CHANGE that regenerates the manifest; from then on any edit to them is a GATE-CHANGE of its own.
4. **SOLO's READY line**: the first line of this document changes, the sidecar is regenerated in the same commit. `scripts/r36-fallback-rearm-20261104.test.mjs` accepts either first line (`NOT READY: awaiting R4 review`, or one starting `READY`), and runs its NOT READY scenario on a copy forced back to NOT READY, so the READY commit needs no test edit.
5. **The pull request, opened held** (`held-for-apply`, unarmed), and **kept held, unmerged, with its branch, until the LAST sitting's GREEN report** (Thursday's second pass, or the last weekly sitting): the second pass and every weekly sitting resolve `origin/data/R36-fallback-rearm-20261104`.
6. **GREEN's dispatch**: HELD (the held head), DOCSHA (this document's sha256 at that head), RUNDAY (`20261104` for the ruled night) and STALEPATH (`no`, or `yes` only on the ruling of Q-R36-F6), naming `packages/db/scripts/r36-fallback-rearm-emit.mjs`, the rollback (none) and that Replay is never pressed, and **SOLO's written statement of THE MERGE FREEZE**: every armed pull request disarmed, and no pull request opened, armed or merged from before step 1 until GREEN reports. **Issued only if the compare of Wednesday morning is not clean.**

## Review history

- **R4 round 1** on `3e674b3a`: SHIP AFTER FIXES (one MAJOR, the confirm that sends nothing; MINORs and NITs). Fixed in `424587d1`.
- **R4 round 2** on `424587d1`: SHIP AFTER FIXES (one MAJOR, a deploy during the sitting; three MINOR). Fixed in `d5897b6d`.
- **R4 round 3** on `d5897b6d`: SHIP AFTER FIXES (two MAJOR, both in the resume block). SOLO removed the block and made the merge freeze a precondition. Fixed in `3636fda7`.
- **R4 round 4** (narrow) on `3636fda7`: SHIP AFTER FIXES, four MINOR, no byte that runs against production. The MINORs are fixed in the commit after it and **not re-reviewed**, per the review-loop cap of 2026-09-27 (`CLAUDE.md`).

- **R4 round 5** on `1464ea9f`: SHIP AFTER FIXES, four MAJOR (a Tuesday send path; the second pass gated only on the canary; the branch's lifetime; the F6 look a zero comparand at night) and five MINOR. Fixed in `c26ccedf`.
- **R4 round 6** (narrow) on `c26ccedf`: SHIP AFTER FIXES, two MINOR (fixed in prose in the commit after it, not re-reviewed per the cap) and two NIT left unchanged on purpose, because each would change the program and neither can occur on a sitting night: `lastSweepDayStart` steps back 24 real hours, wrong only from 00:00 to 00:59 Lisbon on the Monday after the spring clock change (strict: it refuses more), and the 07:00 boundary compares a database-clock heartbeat with the machine clock, within the network-time tolerance of BEFORE YOU START (5 s against sntp, 30 s against Date headers; it matters only if a single 07:00 pass ran and the owner wrongly confirms). Carded for the next edit of the program.

## Questions for strategy

**Q-R36-F1. A second sitting, if the sweep is still in shadow.** ANSWERED 2026-11-01: "Q-R36-F1 = YES, conditional. Only if still in shadow after a fallback: a fallback sitting every Wednesday from 11-11, the last by Wed 11-25, then strategy re-rules." See "Weekly sittings after a fallback".
- blocked_what: every reminder of a visit starting from Thursday 2026-12-03, whose email falls from Tuesday 2026-12-01 08:00.
- options: (a) none: the sweep sends by then; (b) the same document once more, by the night of Monday 2026-11-30 at the latest; (c) weekly, each Wednesday night, while the sweep is in shadow.
- recommendation: (c) if the switch has not happened by Wednesday 2026-11-11; it keeps a week of margin and costs one sitting a week. A second sitting needs its own marker folder or the lead's word on reusing this one.

**Q-R36-F2. Visits never saved by the clinic (imported).** ANSWERED 2026-11-01: "Q-R36-F2 = keep imported visits."
- blocked_what: nothing tonight; it is what the selection includes.
- options: (a) include them, as on 2026-10-12 and as the R36 switch would; (b) leave them out, which needs a change to the selection and a new review.
- recommendation: (a), the owner's recorded answer.

**Q-R36-F3. G1 on the night.** ANSWERED 2026-11-01: "Q-R36-F3 = YES. The fallback's read-only dry run is Tue 11-03 after 21:00, READY by Tue 18:00." See "The Tuesday dry run".
- blocked_what: the whole sitting, if BEFORE YOU START prints `NO` (770 appointments or more in scope).
- options: (a) halt and rule on the night; (b) a read-only dry run ahead of the night (the BEFORE YOU START dry run alone, in a closed window on Tuesday 2026-11-03), so the count is known before Wednesday.
- recommendation: (b), in the Tuesday dispatch that also carries the compare. That dry run also prints production's heartbeat line before check 3's refusal (checks 1 and 2 refuse before the heartbeats are read), so a stale heartbeat (Q-R36-F6) shows a day early. The Tuesday dispatch needs the owner's Vercel look before GREEN pastes it, because BEFORE YOU START carries `--owner-says-sweep-is-not-sending`.

**Q-R36-F4. PR #1678's pin of the senders.**
- blocked_what: nothing tonight. `re-arming-saves.test.ts` on #1678 pins the two owner-run senders by the text `"appointment/scheduled"`. This program sends the event through the 2026-10-12 program's `buildEvent()` and does not carry the text, so that pin passes without naming it.
- recommendation: whichever of #1678 and this branch merges second widens that pin to name `packages/db/scripts/r36-fallback-rearm-emit.mjs`.

**Q-R36-F5. The residual of rule 7: a second pass, or accept it.** ANSWERED 2026-11-01: "Q-R36-F5 = YES. If the fallback runs Wed night, its second pass runs Thu 11-05 night." See "THE SECOND PASS".
- blocked_what: the visits this sitting skips as touched where the touch was a confirm that sent nothing (a hand-set Confirmada, a review-queue confirmation, an SMS "confirmo" on an ordinary visit). They keep their old job, which may be older than 30 days at their reminder or destroyed by the incident. The count is inside `skipped: touched in the last 25 hours`, which the blocks print; the program cannot tell them apart from saves that sent.
- options: (a) a short second pass at least 25 hours later, on Thursday 2026-11-05 night, as step 7 of the 2026-10-12 document did: it reaches every one of them still more than 24 hours ahead, unless touched again; (b) accept the residual and record its count from the closing dry run (and, after a REST main-moved stop, the visits left unsent, whose count is THE REST's last ELIGIBLE line). If strategy rules (b), they stay so until the sweep sends.
- It is also the only remedy after THE REST stops on `main moved during the sitting` ("If a block stops").
- recommendation: (a). It needs one more block (BEFORE YOU START stops on this operation's non-empty marker, by design), authored and reviewed on the ruling: THE REST's checks plus the clock and pins of BEFORE YOU START, run on the same machine with the same marker.

**Q-R36-F6. Stale heartbeats with the switch seen off.** ANSWERED 2026-11-01: "Q-R36-F6: stale heartbeats while Vercel shows the switch off mean the sweep is not running, so it cannot send. The fallback proceeds only when the owner confirms BOTH that the Vercel switch is off AND that Inngest shows no sweep-due-reminders runs in the last hour. SOLO opens an incident card for why the sweep stopped. If the owner cannot confirm both, the fallback stops." Built as the stale-heartbeat path of check 3 and the STALEPATH line of the dispatch.
- **QUESTION BACK TO STRATEGY (R4 round 5), the ruling's premise.** "No sweep-due-reminders runs in the last hour" cannot tell anything at the sitting's hours: the sweep's cron is every 15 minutes from 07:00 to 21:45 Lisbon (`SWEEP_CRON`, `apps/web/lib/reminders/sweep.ts`), so after 22:45 every sweep, running or not, shows no run in the last hour. The confirmation is then a zero comparand, and so was the program's first check (a heartbeat under an hour old), which could not fire after 22:45 either.
- **SOLO's proposed wording, BUILT so that it is ready (strategy may change it):** the owner confirms that the Vercel switch is off AND that Inngest shows no `sweep-due-reminders` run with the status Completed since 07:00 Lisbon on the sitting's day (any runs since then Failed, or none at all). The program refuses `yes` when production's newest heartbeat was written at or after that 07:00 (a pass that completed that day contradicts "not running"). The flag is named `--owner-saw-the-sweep-not-running`, so a different wording changes the document and one constant, not the blocks.
- recommendation: rule the proposed wording.
- blocked_what: the whole sitting, if check 3 refuses because the newest heartbeat is more than 12 hours old or missing, while the owner sees the switch off in Vercel. Failing sweep passes leave no heartbeat, and are a likely cause of a compare that is not clean.
- options: (a) halt: the fallback does not run that night, and the reminders at risk from Sunday 11-08 stay at risk; (b) strategy rules a variant without check 3, on the owner's look at Vercel alone (a code change, its own R4 and its own rehearsal, before Wednesday 18:00); (c) find why the passes fail and fix that first.
- recommendation: know by Tuesday night (Q-R36-F3). If the Tuesday dry run refuses on the heartbeats, rule (b) on Wednesday morning with (c) in parallel; do not route around the check on the night.
