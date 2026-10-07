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
| The fix it depends on | PR #1562, branch `reminders/INC-reminder-lost-when-resaved` |
| What it sends | One `appointment/scheduled` event per eligible appointment, with `confirmationEligible: false` |
| What it writes to Postgres | Nothing. The read is one READ ONLY transaction |
| What it writes locally | The marker `~/.osteojp-inc1007-rearm.json`: every id it sent, for good |
| Production tenant | `--tenant-slug osteojp` |
| Tier | New production data op: held, with the question block at the end |

## What it is for

A reminder is a run that sleeps in the scheduler until 48 hours (email) and 24
hours (SMS) before the appointment. Until the fix, saving an appointment again
without changing its start destroyed that run. The scheduler cancelled the
sleeping run and then dropped the replacement as a duplicate. The patient got no
reminder, and nothing recorded it.

The fix stops new damage. It cannot bring back a run that is already gone.
Postgres holds no trace of a sleeping run, so nobody can list the damaged
appointments exactly.

With the fix live, sending `appointment/scheduled` again is safe. It ends with
exactly one live run per appointment, offset and channel. So the re-arm sends
that event once for every future appointment that can still get a reminder.

## Which appointments get an event

All of these must hold:

1. The tenant is the one named by `--tenant-slug`.
2. The status is `scheduled` or `confirmed`.
3. The patient is not soft-deleted.
4. It is not an unaccepted online request. Those get their first event when
   reception accepts them.
5. It starts more than 24 hours after the read. Inside 24 hours both reminder
   moments have passed.
6. Its audit trail shows no emitting event in the last 25 hours.
7. The marker does not already hold it at the same start.

Rule 6 exists because the script cannot see the scheduler. If the scheduler were
still on the old settings, an event inside 24 hours of the previous one is
exactly what destroys a reminder. Such rows are counted under
`skipped: touched in the last 25 hours` and left alone.

The emitting events, each checked against the code that writes it (line numbers
on `main` at `4814bbd8`):

| Audit action | Extra test | Written by |
|---|---|---|
| `appointment.create` | none | `apps/web/lib/scheduling/actions.ts:971` and `:1439`, `apps/web/lib/scheduling/batch.ts:313` |
| `appointment.reschedule` | none | `apps/web/lib/scheduling/actions.ts:2255` |
| `appointment.update` | `toStatus` is `scheduled` or `confirmed` | `apps/web/lib/scheduling/actions.ts:1943`, keys at `:1956` and `:1957` |
| `appointment.update` | `via` is `portal_request_confirm` | `apps/web/lib/scheduling/actions.ts:2484`, key at `:2494` |
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

## The order of use

Each block is one command. Run them from the repository root, in a shell that
holds `DATABASE_URL_DIRECT` (the session pooler, port 5432) and
`INNGEST_EVENT_KEY` (the production value). The script prints neither.

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

**Step 7. One more pass, 25 hours or more after the fix went live.** Rows saved
in the last day before the fix are the ones most likely to be damaged, and rule
6 skips exactly those on the first pass. Repeat step 6 once after the 25 hours.
It sends only what the first pass skipped.

If a run stops half way, report its `SENT` line and run the dry run again. The
marker holds what was sent. Never delete the marker.

## What it cannot see

- **Whether a run exists.** It re-arms healthy appointments as well as damaged
  ones. That is the design, not a side effect.
- **Whether the fix is deployed.** `--fix-deployed-sha` is recorded and printed.
  Nothing checks it.
- **The scheduler's settings.** `--i-checked-inngest-settings` is the owner's
  word. Nothing checks it.
- **An event that left no audit row.** The September backfill
  (`obs-05-backfill-emit.mjs`), a replay from the dashboard, or a new piece of
  code that emits. On `main` at `4814bbd8` the emitting code is in six files:
  `scheduling/actions.ts`, `scheduling/reminders.ts`,
  `scheduling/pedido-acceptance.ts`, `reminders/index.ts`,
  `reminders/inbound-store.ts` and `reminders/inbound-reply.ts`, all under
  `apps/web/lib`. If a seventh exists on the day, add its audit action first.
- **A save between the read and the send.** The script reads every row once and
  then sends. If reception moves an appointment in those seconds, the event
  carries the old start, and it can arrive after the app's own event. The
  reminder would then be timed for the old start. This is the reason for the
  "when" recommendation in Q2.

## What it does not fix

- **Appointments inside 24 hours.** Both reminder moments have passed. They are
  counted under `skipped: starts within 24 hours`.
- **Appointments 24 to 48 hours ahead get the SMS only.** The email moment has
  passed.
- **Some rows saved in the last 25 hours.** A row that was saved again yesterday
  and starts within two days will be inside 24 hours before rule 6 lets it
  through. The dry run counts these on the line under the touched count: "no
  later run can reach them". If that number is not zero, the owner decides
  whether reception phones those patients. The script prints no names, so the
  list comes from the agenda.

## What it never does

- It never writes to Postgres.
- It never sends a booking confirmation. Every event carries
  `confirmationEligible: false`, and the confirmation function only starts on
  `true`.
- It never sends for an unaccepted online request.
- It never sends the same appointment twice at the same start. The marker stops
  it at any age, and the event id `inc1007-rearm:<appointmentId>:<startsAt>`
  makes the scheduler drop a repeat inside 24 hours.
- It never prints a name, a phone number, an email address, the connection
  string or the event key.
- It never sends to the hosted scheduler unless the database is the exact
  production target: project ref, host, port and database name, checked by the
  repository's shared guard. A string that names production but is not that
  exact target is refused in every mode, the dry run included.
- `--sink-file` never works on production. It writes events to a local file for
  rehearsal, on `127.0.0.1` or `localhost` only, and keeps its own marker beside
  that file.

## Rehearsal, 2026-10-07, local database only

The lead's rule: "A script's own REFUSE or STOP line is a halt, the same as a
harness refusal. Never edit an env file, a URL, a flag, a label or a script to
get past a guard. A block that cannot run on the throwaway is recorded as NOT
REHEARSED and the document says so."

Everything below ran against the local lane database at `127.0.0.1:54522` and
nothing else. No guard was edited or passed.

**Run through the command line, on the seeded tenant.** All 87 of its future
appointments were created within the last 25 hours.

| Run | Result |
|---|---|
| Dry run | 87 future, 87 skipped as touched, 0 eligible |
| `--confirm --expect 0` with `--sink-file` | sent 0 of 0, no sink file, no marker |
| A tenant slug that does not exist | `FAILED`, exit 1 |

**Run through the script's own `run()` function, with the read bound to one
transaction that was rolled back.** The transaction added 25 clearly synthetic
appointments with back-dated audit rows, so that some rows were eligible. The
read was the script's own SQL, unchanged. Zero synthetic rows were left after
the rollback.

| Run | Result |
|---|---|
| Dry run | 110 future, 2 unaccepted requests, 2 inside 24 hours, 95 touched (1 out of reach), 11 eligible |
| Canary dry run (`--min-days-ahead 3 --max 5`) | 2 held back, 9 eligible, 5 this run |
| Canary with a wrong `--expect` | refused, exit 1, nothing written |
| Canary to the sink | sent 5 of 5 |
| Dry run after the canary | 5 skipped by the marker, 6 eligible |
| The rest to the sink | sent 6 of 6 |
| Dry run after that | 11 skipped by the marker, 0 eligible |
| A third confirm | sent 0 of 0 |

The sink file held 11 events with 11 different ids, each with exactly the four
data keys, for exactly the 11 synthetic rows expected. The rows on the exact
boundaries behaved as written: 24 hours ahead was skipped and 24 hours and one
second was sent; touched 25 hours ago was skipped and 25 hours and one second
was sent. The derived test for an online request agreed with the database
function on all 110 rows, with the function given the tenant inside the same
rolled-back transaction.

**NOT REHEARSED:**

- **The real send.** No event went to the hosted scheduler or to any Inngest
  server. The request itself is covered by a unit test with a fake `fetch`.
- **What the scheduler does with the event.** One live run per reminder after
  the event, the drop of a repeated event id, Debounce and Singleton. These rest
  on the fix's own measurements, not on this rehearsal.
- **The production path.** The exact-target check is tested as a pure function
  only. No run was made with `INNGEST_EVENT_KEY`, and the marker in the home
  directory was never written.
- **The command line with eligible rows.** The seeded rows were all too new, so
  the sends above went through `run()` with the read bound to the transaction.
  The command line's own read, verdicts and output ran on the 87 seeded rows.
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
  hosted scheduler. That was not tested.

**Q2. When.**

- blocked_what: the same steps.
- options:
  - (a) As soon as steps 1 and 2 pass, at any hour.
  - (b) As soon as steps 1 and 2 pass, in the first window with both clinics
    closed: after 21:00 on a weekday, after 13:00 on Saturday, or on Sunday,
    Lisbon time.
- recommendation: (b), and the first such window, not a later one. Every day of
  waiting moves more appointments inside 24 hours, where nothing can be done.
  The closed window is for the last point under "What it cannot see": with
  nobody saving appointments, no event can carry a stale start. Then step 7 once,
  25 hours or more after the deploy.

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
  safe, and the canary checks that before the large run.
