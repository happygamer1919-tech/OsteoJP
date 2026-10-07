# Re-arm the appointment reminders (INC, 2026-10-07)

**Status: NOT RUN. HELD.** A one-time operation. It reads production and sends
events to the hosted scheduler. It writes nothing to Postgres: no migration, no
journal entry, no row changed.

**Authored by SOLO, the build lane. SOLO never runs it against production.** Who
runs it is question Q1 below. Any `FAILED` line, any `BAD INVOCATION` line and
any count that is not the one expected halts the sitting.

| Fact | Value |
|---|---|
| Script | `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` |
| Tests | `scripts/inc-1007-rearm-reminders-emit.test.mjs` (runs in `pnpm test:scripts`) |
| The fix it depends on | PR #1562, on `main` as `20a6d731` |
| What it sends | One `appointment/scheduled` event per eligible appointment, with `confirmationEligible: false` and no event id of its own |
| What it writes to Postgres | Nothing. Every read is a READ ONLY transaction |
| What it writes locally | The marker `~/.osteojp-inc1007-rearm.json`, and beside it `~/.osteojp-inc1007-rearm.json.lock` while a run is sending |
| What it reads | The exact production target, or a strict local database for rehearsal. Nothing else, the dry run included |
| Production tenant | `--tenant-slug osteojp` |
| Tier | New production data op: held, with the question block at the end |

## What it is for

A reminder is a run that sleeps in the scheduler until 48 hours (email) and 24
hours (SMS) before the appointment. Until the fix, saving an appointment again
without changing its start destroyed that run. The scheduler cancelled the
sleeping run and then threw away the replacement as a duplicate. The patient got
no reminder, and nothing recorded it.

The fix stops new damage. It cannot bring back a run that is already gone.
Postgres holds no trace of a sleeping run, so nobody can list the damaged
appointments exactly.

So the re-arm sends one more `appointment/scheduled` event for every future
appointment that can still get a reminder. With the fix live, that ends with
exactly one live run per appointment, offset and channel, **on two conditions**.
Both were measured, and the script is built around both.

## What was measured, and what the script does about it

All of this ran on a local Inngest dev server (inngest-cli 1.46.0, SDK 4.5.0)
with the settings `functions.ts` has on `main`. Nothing here touched the hosted
scheduler.

**Condition 1: the event must be one the scheduler has never seen.** Measured by
the reviewer, 10 appointments per pattern, live runs per appointment afterwards:

| What was sent | Email runs | SMS runs |
|---|---|---|
| One event with an id chosen by the sender | 1 | 1 |
| The same id again, 8 seconds later | **0** | **0** |
| The same id, an ordinary app save, the same id again | **0** | **0** |
| A different id on each of two sends | 1 | 1 |
| No id on either of two sends | 1 | 1 |

A repeated id is not thrown away by the scheduler. The fix builds each
reminder's key from the event's id, so a second event with the same id cancels
the sleeping runs and its replacements are refused as already seen. That is the
incident again.

The first version of this script gave every event an id made from the
appointment and its start. That was the dangerous shape. **The script now sends
no id at all.** The scheduler then gives each event an id of its own, so a
repeat cannot be built: not by a second run, not by a lost marker, not by two
people at once, and not by anything on the way that delivers one request twice.
It is also exactly what the app's own save sends.

Measured again by SOLO with the script's own request code pointed at the same
local dev server, 10 appointments per pattern:

| What was sent | Email runs | SMS runs |
|---|---|---|
| One script send | 1 | 1 |
| Two script sends, 8 seconds apart | 1 | 1 |
| Three script sends, 8 seconds apart | 1 | 1 |
| A script send, an app-style save, a script send | 1 | 1 |
| An app-style save, then a script send | 1 | 1 |

90 sends came back with 90 different ids, and the function saw the scheduler's
id, not one of ours.

**Condition 2: the event must not arrive just before a reminder is due.**
Measured by the reviewer, 6 appointments per pattern, each with a healthy
sleeping SMS run:

| When the event arrived | SMS sent |
|---|---|
| No event (control) | 6 of 6 |
| 6 seconds before the 24 hour mark | 6 of 6 |
| 1.5 seconds before the mark | **0 of 6** |
| 0.5 seconds before the mark | **0 of 6** |

The event cancels the sleeping run. The scheduler then waits 2 seconds before it
plans the replacement, and by then the mark has passed, so nothing replaces it.

So the script **holds back** every appointment whose 24 hour mark or 48 hour
mark falls inside the run's margin, counted from the moment it reads the
database:

    margin = 30 s for the read + min(--max x 15 s, 600 s) for the sends + 60 s

| `--max` | Margin |
|---|---|
| 5 (the canary) | 165 s |
| 25 (the default) | 465 s |
| 40 or more | 690 s |

15 seconds is the most one send can take: 5 for reading the row again and 10
for the request. The run enforces its side: when the time for the sends is
spent it stops, prints `OUT OF TIME`, and leaves the rest for a later run. That
is not a failure. The last 60 seconds cover the scheduler's 2 second wait, its
own delay, and a clock difference between this machine and the database. A mark
that passed less than 60 seconds before the read holds its row back too,
because its reminder may be going out at that moment. That last part is
reasoned, not measured.

## Which appointments get an event

All of these must hold:

1. The tenant is the one named by `--tenant-slug`.
2. The status is `scheduled` or `confirmed`.
3. The patient is not soft-deleted.
4. It is not an unaccepted online request. Those get their first event when
   reception accepts them.
5. It starts more than 24 hours after the read.
6. Its audit trail shows no emitting event in the last 25 hours.
7. Neither of its reminder marks is inside the margin.
8. The marker does not hold it as sent at the same start.
9. The marker does not hold it as attempted, unless `--resend-attempted` is given.

Then, just before each send, the script **reads that one row again**. If the
start moved, the status changed, the patient was deleted or the appointment was
saved again since the first read, the row is skipped, counted under
`changed since the read`, and left for a later run to judge afresh.

Rule 6 exists because the script cannot see the scheduler. If the scheduler were
still on the old settings, an event inside 24 hours of the previous one is
exactly what destroys a reminder. Such rows are counted under
`skipped: touched in the last 25 hours` and left alone.

The emitting events, each checked against the code that writes it (line numbers
on `main` at `50ca6e5e`):

| Audit action | Extra test | Written by |
|---|---|---|
| `appointment.create` | none | `apps/web/lib/scheduling/actions.ts:971` and `:1439`, `apps/web/lib/scheduling/batch.ts:313` |
| `appointment.reschedule` | none | `apps/web/lib/scheduling/actions.ts:2257` |
| `appointment.update` | `toStatus` is `scheduled` or `confirmed` | `apps/web/lib/scheduling/actions.ts:1945`, key at `:1959` |
| `appointment.update` | `via` is `portal_request_confirm` | `apps/web/lib/scheduling/actions.ts:2486`, key at `:2496` |
| `appointment.sms_reply_reviewed` | `resolution` is `confirmed` and `applied` is `true` | `apps/web/lib/reminders/inbound-store.ts:366`, keys at `:372` and `:377` |
| `appointment.patient_sms_reply` | `outcome` is `confirmed` | `apps/web/lib/reminders/inbound-reply.ts:155`, key at `:164` |

Two notes on that table.

- The `appointment.update` test is wider than the code that emits. A status edit
  that sent no event is skipped too. Skipping costs a delay, never a reminder.
- "Aceitar pedido" writes `from_status` and `to_status` with underscores, and
  the Estado control writes `fromStatus` and `toStatus`. The read uses `via` for
  the first and `toStatus` for the second.

Rule 4 is the database function `public.is_unconfirmed_pedido`, derived and not
called. The function reads the tenant from the caller's login token. This read
has no token, so the function would answer "no" for every row and every online
request would get an event. The script applies the same three tests from the
same columns. A test fails if a migration ever redefines the function.

## The marker, attempted rows and the lock

**The marker** is the script's own record. Each row is written to it as
`attempted` before its request leaves, and changed to `sent` when the scheduler
answers. Never delete the marker.

**An attempted row** is one whose request left and whose answer never came: a
timeout, a server error, or a run that was killed. The scheduler may or may not
have taken the event. Every later run skips such a row and prints the count:

    skipped: attempted by an earlier run, outcome unknown (marker): N

What the operator does about it: run again with `--resend-attempted`. Because
every send has an id of its own, sending such a row a second time is safe under
the fix, as the tables above show. The flag is a deliberate choice, not a
danger. Without it the appointment may have no reminder run. With it the
appointment gets a fresh one either way.

**The lock** is the file `~/.osteojp-inc1007-rearm.json.lock`. Every `--confirm`
takes it before reading the database and removes it when it ends. A second
`--confirm` while it exists is refused, so two runs cannot overlap. A run that
is killed leaves the lock behind on purpose. Then: make sure no run is going,
read the dry run's attempted count, and delete the lock file by hand. The lock
only works on one machine, so one machine is used for the whole operation.

## The order of use

Each block is one command. Run them from the repository root, in a shell that
holds `DATABASE_URL_DIRECT` (the session pooler, port 5432) and
`INNGEST_EVENT_KEY` (the production value). The script prints neither, and no
part of either.

**Run a confirm right after its own dry run, with the same `--max` and the same
`--min-days-ahead`.** The eligible count depends on both, and it moves as
reminder marks enter the margin. If `--expect` no longer matches, the script
refuses and sends nothing: run the dry run again.

**Step 1. The fix is merged and deployed.** PR #1562 is on `main` and Vercel
shows the production deployment of that commit as complete. Note the full
40-character commit sha. The script records it and cannot check it.

**Step 2. The owner looks at the Inngest dashboard.** In the production app:

- `schedule-appointment-reminders` shows **Debounce**.
- `send-appointment-reminder` shows **Singleton**.

If either is missing, the scheduler is not running the fix. Stop here.

**Step 3. Dry run.** It sends nothing.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp
```

Read the counts. `ELIGIBLE` is the number a full run would send.

**Step 4. Canary: five appointments, three or more days ahead.** Three days, so
both reminders are still ahead and each appointment should end with two waiting
runs. First the dry run of the canary, then the canary itself with the
`ELIGIBLE` number that dry run printed.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --min-days-ahead 3 --max 5
```

```bash
ELIGIBLE=
FIX_SHA=
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --min-days-ahead 3 --max 5 --confirm --expect "${ELIGIBLE}" --fix-deployed-sha "${FIX_SHA}" --i-checked-inngest-settings
```

Fill in the two values before pasting. With either one empty the script refuses
and sends nothing.

**Step 5. Check the five in the dashboard.** The canary prints five appointment
ids. For each one, `send-appointment-reminder` must show exactly **one** waiting
run for the 48 hour email and exactly **one** for the 24 hour SMS. Not zero, not
two. If any appointment shows anything else, stop and report. Do not run step 6.

Do not replay any `appointment/reminder.due` event from before the deploy while
you are in the dashboard. The fix's own notes measured that a replay sends the
reminder twice.

**Step 6. The rest.** A dry run again, then the send with its `ELIGIBLE` number.
The five from the canary are skipped by the marker.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --max 1000
```

```bash
ELIGIBLE=
FIX_SHA=
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --max 1000 --confirm --expect "${ELIGIBLE}" --fix-deployed-sha "${FIX_SHA}" --i-checked-inngest-settings
```

Read the four lines at the end: `SENT`, `changed since the read, not sent`,
`attempted, outcome unknown` and `not reached`. If the run printed
`OUT OF TIME`, or `not reached` is above zero, repeat step 6 for the rest.

**Step 7. One more pass, 25 hours or more after the fix went live.** Rows saved
in the last day before the fix are the ones most likely to be damaged, and rule
6 skips exactly those on the first pass. Repeat step 6 once after the 25 hours.
It sends only what the first pass left: touched rows, rows held back for their
48 hour mark, and rows that changed under a send.

**If a run stops half way.** It prints `FAILED: stopped at <appointment id>` and
why. Report that line and the four lines above it. Then run the dry run again.
Rows the marker holds as sent are skipped. The row the run stopped on is held as
attempted: see "An attempted row" above for what to do. If the run was killed
and not stopped, the lock is still there: see "The lock".

## What it cannot see

- **Whether a run exists.** It re-arms healthy appointments as well as damaged
  ones. That is the design, not a side effect.
- **Whether the fix is deployed.** `--fix-deployed-sha` is recorded and printed.
  Nothing checks it.
- **The scheduler's settings.** `--i-checked-inngest-settings` is the owner's
  word. Nothing checks it. A test pins the settings in the repository, and a
  test cannot guard a run.
- **An event that left no audit row.** The September backfill
  (`obs-05-backfill-emit.mjs`), a replay from the dashboard, or a new piece of
  code that emits. On `main` at `50ca6e5e` the emitting code is in six files:
  `scheduling/actions.ts`, `scheduling/reminders.ts`,
  `scheduling/pedido-acceptance.ts`, `reminders/index.ts`,
  `reminders/inbound-store.ts` and `reminders/inbound-reply.ts`, all under
  `apps/web/lib`. If a seventh exists on the day, add its audit action first.
- **A save in the instant between the second read and the request.** The script
  reads each row again just before its send, which leaves milliseconds, not
  minutes. A move in that instant would still make the event carry the old
  start. This is one reason for the "when" recommendation in Q2.
- **A second machine.** The lock is a file in the home directory.

## What it does not fix

- **Appointments inside 24 hours.** Both reminder moments have passed. They are
  counted under `skipped: starts within 24 hours`.
- **Appointments whose 24 hour mark is inside the margin.** The real floor is 24
  hours plus the margin. The dry run counts them on the line "the 24 hour mark
  (this script will never send for them)". If such an appointment was damaged,
  its SMS is lost.
- **Appointments 24 to 48 hours ahead get the SMS only.** The email moment has
  passed.
- **Some rows saved in the last 25 hours.** A row that was saved again yesterday
  and starts within about two days will be too near its start before rule 6
  lets it through. The dry run counts these on the line under the touched count:
  "no later run can reach them".

If either of those two counts is not zero, the owner decides whether reception
phones those patients. The script prints no names, so the list comes from the
agenda.

## What it never does

- It never writes to Postgres.
- It never sends a booking confirmation. Every event carries
  `confirmationEligible: false`, and the confirmation function only starts on
  `true`.
- It never sends for an unaccepted online request.
- It never gives an event an id of its own, and it never retries a request.
- It never sends a row the marker holds as sent at the same start, and never
  sends an attempted row unless `--resend-attempted` says so.
- It never runs two sends at once. The lock refuses the second run.
- It never sends within the margin of a reminder mark.
- It never prints a name, a phone number, an email address, the connection
  string, any part of the connection string, or the event key. About the
  database it prints one verdict and nothing parsed.
- It never reads a database that is not the exact production target or a strict
  local one. A retired project, a development project and a string that names
  production without being the exact target are all refused, the dry run
  included.
- It never sends to the hosted scheduler unless the database is the exact
  production target: project ref, host, port and database name, checked by the
  repository's shared guard, and checked a second time where the sender is
  built.
- `--sink-file` never works on production. It writes events to a local file for
  rehearsal, on `127.0.0.1` or `localhost` only, and keeps its own marker and
  lock beside that file.

## Rehearsal, 2026-10-07, local only

The lead's rule: "A script's own REFUSE or STOP line is a halt, the same as a
harness refusal. Never edit an env file, a URL, a flag, a label or a script to
get past a guard. A block that cannot run on the throwaway is recorded as NOT
REHEARSED and the document says so."

Everything below ran against the local lane database at `127.0.0.1:54522` and
nothing else. No guard was edited or passed. The dev-server measurements above
ran on `127.0.0.1` too.

**Run through the command line, on the seeded tenant.** All 87 of its future
appointments were created within the last 25 hours.

| Run | Result |
|---|---|
| Dry run | 87 future, 87 skipped as touched, 0 eligible |
| `--confirm --expect 0` with `--sink-file` | sent 0 of 0, no sink file, no marker, lock taken and given back |
| `--confirm` while a lock file is present | refused before the read, exit 1, that lock left alone |
| A tenant slug that does not exist | `FAILED`, exit 1 |

**The script's real database reader, on the seeded rows.** Its own connection,
read only: the first read returned 87 rows, the second read of 10 of them found
all 10 unchanged, an unknown id read as nothing, and a seeded id asked under
another tenant read as nothing.

**Run through the script's own `run()` function, with both reads bound to one
transaction that was rolled back.** The transaction added 32 clearly synthetic
appointments with back-dated audit rows, so that some rows were eligible. The
two reads were the script's own SQL, unchanged. Zero synthetic rows were left
after the rollback.

| # | Run | Result |
|---|---|---|
| 1 | Dry run, `--max 25` | 117 future, 2 unaccepted requests, 2 inside 24 hours, 95 touched (1 out of reach), 4 held back for a mark (2 at 24 hours, 2 at 48 hours), 14 eligible |
| 2 | Canary dry run (`--min-days-ahead 3 --max 5`) | margin 165 s, 3 held back for a mark, 3 for the three days, 12 eligible, 5 this run |
| 3 | Canary with a wrong `--expect` | refused, exit 1, nothing written, no lock left |
| 4 | Canary while another run's lock is present | refused before the read, exit 1, that lock left alone |
| 5 | Canary whose first send fails | stopped, exit 1: 0 sent, 1 attempted, 4 not reached, lock given back |
| 6 | Canary dry run again | 1 attempted and skipped, 11 eligible |
| 7 | Canary to the sink | sent 5 of 5 |
| 8 | Dry run for the rest, `--max 500` | margin 690 s, 5 skipped as sent, 1 as attempted, 5 held back for a mark (3 at 24 hours), 7 eligible |
| 9 | The rest to the sink, with three rows changed between the read and their send | sent 4, 3 changed and not sent (one moved, one cancelled, one saved again), 0 attempted |
| 10 | Dry run after that | 1 eligible: the moved row, at its new start |
| 11 | Dry run with `--resend-attempted` | 2 eligible, 1 of them the attempted row |
| 12 | Confirm with `--resend-attempted` | sent 2 of 2 |
| 13 | Last dry run | 11 skipped as sent, 0 attempted, 0 eligible |
| 14 | A confirm with nothing left | sent 0 of 0 |

The sink file held 11 events for 11 different appointments, exactly the 11
synthetic rows expected, each with the name, the four data keys and no id. The
marker held four entries: one stopped, three done. The rows on the exact
boundaries behaved as written: 24 hours ahead was skipped, 24 hours and one
second was held back for its mark, and 24 hours and ten minutes was eligible
under `--max 25` and held back under `--max 500`; touched 25 hours ago was
skipped and 25 hours and one second was sent. The derived test for an online
request agreed with the database function on all 117 rows, with the function
given the tenant inside the same rolled-back transaction. No output line carried
an address, a port or an "@".

**NOT REHEARSED:**

- **The real send to the hosted scheduler.** No event went to it. The request
  code ran against the local dev server only, and in unit tests with a fake
  `fetch`.
- **The hosted scheduler's behaviour.** The tables above are from the local dev
  server, which may differ from the hosted one. Step 5 is the check on the real
  thing.
- **The production path.** The exact-target check is tested as a pure function
  only. No run was made with `INNGEST_EVENT_KEY`, and the marker and the lock in
  the home directory were never written.
- **The command line with eligible rows.** The seeded rows were all too new, so
  the sends above went through `run()` with the reads bound to the transaction.
- **The time limit of a run.** `OUT OF TIME` is covered by a unit test with a
  fake clock. No rehearsal ran long enough to reach it.
- **A killed run.** The lock left by a kill and the attempted row it leaves were
  rehearsed by writing those two files by hand and by a failed send, not by
  killing a process.
- **Steps 2 and 5.** The dashboard checks are the owner's.

## QUESTION BLOCK for the owner and strategy

**Q1. Who runs it.**

- blocked_what: every step from 3 on. Nothing is sent until this is ruled.
- options:
  - (a) The owner, in his own shell. Four commands and two looks at the
    dashboard.
  - (b) GREEN, on the owner's dispatch naming
    `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs`. The owner still
    does steps 2 and 5 himself, and his dispatch has to say that step 2 passed,
    because GREEN would be giving `--i-checked-inngest-settings` on his word.
- recommendation: (a). The flag is a statement about a screen only the owner
  can see, and the canary needs him at the dashboard between two commands
  anyway. It is also not known whether the harness lets GREEN send to the
  hosted scheduler. That was not tested. Whoever runs it, one machine runs all
  of it, because the marker and the lock live in that machine's home directory.

**Q2. When.**

- blocked_what: the same steps.
- options:
  - (a) As soon as steps 1 and 2 pass, at any hour.
  - (b) As soon as steps 1 and 2 pass, on the first weekday night: after 21:15
    Lisbon, Monday to Friday.
- recommendation: (b), and the first such night, not a later one. Every day of
  waiting moves more appointments inside 24 hours, where nothing can be done.
  At night nobody is saving appointments, and no reminder mark falls in the
  run: a mark is an appointment's start minus 24 or 48 hours, and no
  appointment starts at night. A Saturday afternoon or a Sunday is the wrong
  closed window. The clinics are shut, but Monday's and Tuesday's marks fall
  right inside the run, and the script would hold many rows back. Then step 7
  once, 25 hours or more after the deploy, on a night as well.

**Q3. All future appointments, or only those saved more than once.**

- blocked_what: the size of step 6.
- options:
  - (a) Every eligible future appointment. This is what the script does.
  - (b) Only appointments with two or more emitting audit events, the ones the
    trail shows were saved again. The dry run already prints this number. The
    script has no flag for it, so (b) needs a small change and a new rehearsal.
- recommendation: (a). The audit trail does not record every event. A row the
  September backfill sent for, then saved once, shows one emitting event and was
  still damaged. (a) also re-arms a row whose first event failed quietly. Its
  cost is more events and a fresh run for healthy rows, which the fix makes
  safe on the two conditions above, and the canary checks that before the large
  run.
