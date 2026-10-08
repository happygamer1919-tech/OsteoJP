# Re-arm the appointment reminders (INC, 2026-10-07)

**Status: NOT RUN. HELD. RULED on 2026-10-08 (strategy, dispatch S-1008-A).**
A one-time operation. It reads production and sends events to the hosted
scheduler. It writes nothing to Postgres: no migration, no journal entry, no
row changed.

**Authored by SOLO, the build lane. SOLO never runs it against production.**
GREEN runs it, on the owner's dispatch, in a closed window with the owner at
the keyboard. Any `FAILED` line, any `BAD INVOCATION` line, a `G1` line that
says `NO` and any count that is not the one expected halts the sitting.

| Fact | Value |
|---|---|
| Script | `packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` |
| Tests | `scripts/inc-1007-rearm-reminders-emit.test.mjs` (runs in `pnpm test:scripts`) |
| The fix it depends on | PR #1562, on `main` as `20a6d731` |
| Ruling | Strategy, dispatch S-1008-A, 2026-10-08. Quoted in the next section |
| Who runs it | GREEN, an apply-only session, on the dispatch `/Users/ivan/osteojp-handover/green-dispatch-rearm-1007.txt` |
| Run from | The HELD head of pull request #1567 (label `held-for-apply`). #1567 merges after GREEN's clean report |
| Scope | `--max-days-ahead 28`: appointments that start no more than 28 days after the read. Later ones wait |
| What it sends | One `appointment/scheduled` event per eligible appointment, with `confirmationEligible: false` and no event id of its own |
| What it writes to Postgres | Nothing. Every read is a READ ONLY transaction |
| What it writes locally | The marker `~/.osteojp-inc1007-rearm.json`, and beside it `~/.osteojp-inc1007-rearm.json.lock` while a run is sending |
| What it reads | The exact production target, or a strict local database for rehearsal. Nothing else, the dry run included |
| Production tenant | `--tenant-slug osteojp` |
| Rollback | None is needed and none exists. See "Rollback" |
| Replay | Never pressed, by anybody, on any event or run. See "Replay" |
| Tier | New production data op: held. Ruled on 2026-10-08; the question block at the end carries each ruling |

## Ruled on 2026-10-08 (strategy, dispatch S-1008-A)

Strategy's words, character for character:

> Q1 re-arm: GREEN, on a dispatch path, in the first closed window with the owner at the keyboard: tonight before 08:00 Lisbon or 2026-10-08 after 21:00 Lisbon. Canary of 5 appointments three or more days ahead, the owner checks the scheduler dashboard, then the rest. Scope: every qualifying appointment starting within the next 28 days. Later ones wait for Q3.
>
> RE-ARM GATES
>
> G1 CHECK: dry run, counts only. EXPECT: number of qualifying appointments printed, projected scheduler executions under 20,000. Otherwise halt.
>
> G2 CHECK: after the canary of 5. EXPECT: exactly one waiting SMS reminder and one waiting email reminder per appointment, where the patient has each channel. Otherwise halt, nothing further runs.
>
> G3 CHECK: during the run. EXPECT: zero messages leave at run time. Appointments inside the margin around the 24 and 48 hour marks are skipped and counted.
>
> G4 CHECK: after the run. EXPECT: attempted equals sent, and a count of appointments in the next 48 hours that could not be re-armed, printed for the owner as a count with the screen where reception can see them.
>
> G5 CHECK: before READY. EXPECT: the GREEN dispatch states the exact file path, the rollback (none needed, or what), and that Replay is never pressed.
>
> Explicit halts, never set -e. No gate edit inside a sitting.
>
> Q14: #1567 merges after GREEN's clean report on the re-arm.

Two notes on the quoted text. They are SOLO's, not strategy's.

- "Tonight" is the night of 2026-10-07 to 2026-10-08. So the two windows are:
  before 08:00 Lisbon on 2026-10-08, or after 21:00 Lisbon on 2026-10-08.
- Q1, Q3 and Q14 are strategy's own question numbers. The question block at
  the end of this document has its own Q1 to Q3.

How each gate is met:

| Gate | Met by | Where in this document |
|---|---|---|
| G1 | The two `G1` lines of the dry run: the number of appointments in scope, the projected executions, and `yes` or `NO` against the limit of 20000. A `--confirm` refuses on `NO` | Step 3; "The three gate lines the script prints"; "What it costs the scheduler" |
| G2 | The owner's look at the dashboard after the canary: each of the five appointments shows exactly one waiting email run and one waiting SMS run. Step 2 comes before it and is the owner's too | Step 5 |
| G3 | The margin, which holds back and counts every appointment whose 24 or 48 hour mark is near the run. Then two counts-only reads of the reminder ledger, which must both say 0: one before anything is sent, one 20 seconds after the sends. The closing dry run of the sitting reads it once more, when the last window has closed | "Condition 2" below; "The three gate lines the script prints"; "The closing dry run" |
| G4 | The two `G4` lines: `G4 NEXT 48 HOURS, NOT RE-ARMED`, with the screen reception uses, and `G4 ATTEMPTED EQUALS SENT` | "The three gate lines the script prints" |
| G5 | The dispatch file `/Users/ivan/osteojp-handover/green-dispatch-rearm-1007.txt`. It has to state the exact path of the script, the rollback (none needed) and that Replay is never pressed, and that is checked before READY. This document says the same three things | The table above; "Rollback"; "Replay" |

## Who runs it, and from where

- **GREEN runs it.** GREEN is a fresh apply-only session. It authors nothing,
  edits nothing and merges nothing. It runs what the owner's dispatch names,
  and the dispatch is the file
  `/Users/ivan/osteojp-handover/green-dispatch-rearm-1007.txt`.
- **In a closed window, with the owner at the keyboard.** The dashboard is the
  owner's. He does step 2 and step 5 himself, in the sitting, and GREEN gives
  `--i-checked-inngest-settings` on his word.
- **From the HELD head of pull request #1567**, at the commit the dispatch
  names. The pull request keeps its label `held-for-apply` through the sitting.
  It merges after GREEN's clean report (strategy's Q14), not before.
- **On one machine, for both sittings.** The marker and the lock live in that
  machine's home directory.
- **SOLO never runs it.** SOLO wrote the script and this document, which is
  exactly what disqualifies it.

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

**All of this is true ONLY with the new scheduler settings live.** Under the old
settings a second event inside 24 hours destroys the reminder whatever its id
is. So three things that are safe with the fix are dangerous without it:
`--resend-attempted`, a lost marker, and two overlapping runs. **The only guard
is step 2**, the owner's look at the settings in the dashboard. The canary is
not a guard: it cannot tell old settings from new, because one event gives one
run per channel under both. A canary that looks right says the event arrived.
It does not say the fix is live.

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

What happens to a row that is held back depends on which mark it was:

- **Held back for its 24 hour mark: never sent.** By the next run it is inside
  24 hours. The real floor is 24 hours plus the margin.
- **Held back for its 48 hour mark: it can still be sent, but only inside a
  window.** Such a row starts about 48 hours after the run that held it back. A
  later run can send it from one minute after its 48 hour mark until its 24
  hour mark comes inside that later run's margin. In practice that means a run
  **within 23 hours of the one that held it back**. A run a day or more later
  finds it inside 24 hours and never sends it. Step 7 is too late for these
  rows; step 6b is the one for them.

## Which appointments get an event

All of these must hold:

1. The tenant is the one named by `--tenant-slug`.
2. The status is `scheduled` or `confirmed`.
3. The patient is not soft-deleted.
4. It is not an unaccepted online request. Those get their first event when
   reception accepts them.
5. It starts more than 24 hours after the read.
6. It starts no more than 28 days after the read. A row that starts more than
   28 days after the read is held back and counted.
7. Its audit trail shows no emitting event in the last 25 hours.
8. Neither of its reminder marks is inside the margin.
9. The marker does not hold it as sent at the same start.
10. The marker does not hold it as attempted, unless `--resend-attempted` is
    given.

Then, just before each send, the script **reads that one row again**. If the
start moved, the status changed, the patient was deleted or the appointment was
saved again since the first read, the row is skipped, counted under
`changed since the read`, and left for a later run to judge afresh.

Rule 6 is the upper bound, ruled on 2026-10-08. It comes from the flag
`--max-days-ahead 28`, which is on every command of "The order of use". A real
`--confirm` without the flag is refused with `BAD INVOCATION`: the scope is
ruled and must be stated. Why the number is 28 is under "Why 28 days", at the
end of this section. The flag takes a whole number from 2 to 9999, greater
than `--min-days-ahead`. A row that starts exactly 28 days after the read is in
scope. One millisecond later it is out. The rows it holds back are counted on
the line directly after `skipped: starts within 24 hours: N`:

    held back: starts more than --max-days-ahead 28 days after the read: N

A dry run without the flag has no upper bound, and its line says so:

    held back: starts more than --max-days-ahead days after the read: 0  (not given: no upper bound)

Rule 7 exists because the script cannot see the scheduler. If the scheduler were
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

### Why 28 days

A reminder run sleeps in the scheduler from the event until its mark. For an
appointment 28 days ahead that is 27 days for the SMS and 26 days for the email.

What the vendor says about how long a run may last, as published on 2026-10-07:

- The free plan's maximum length of a function run is 30 days, sleeps included.
- A limit of 7 days per sleep was documented until 2026-10-01. It was then
  edited out.
- Which of the two the hosted scheduler enforces, and what happens to a run
  that passes the limit, is NOT ESTABLISHED.

28 days is strategy's ruling. It keeps every sleep this operation starts under
the published 30 days. It does not settle the 7 day question: an appointment
more than 8 days ahead needs a sleep longer than 7 days, from this operation and
from an ordinary save in the app alike.

Appointments that start more than 28 days after the read get no event from this
operation. They wait for strategy's Q3.

## The marker, attempted rows and the lock

**The marker** is the script's own record. Each row is written to it as
`attempted` before its request leaves, and changed to `sent` when the scheduler
answers. Each run's entry also records the instant of its read, its margin and
the bounds it ran with, `--max-days-ahead` included. The G3 ledger read is built
from those entries. Never delete the marker.

**An attempted row** is one whose request left and whose answer never came: a
timeout, a server error, or a run that was killed. The scheduler may or may not
have taken the event. Every later run skips such a row and prints the count:

    skipped: attempted by an earlier run, outcome unknown (marker): N

The one way such a row goes out again is a run with `--resend-attempted`.
Because every send has an id of its own, sending such a row a second time is
safe under the fix, as the tables above show, and
ONLY with the new scheduler settings live. Step 2 is the one thing that says
they are; the script cannot check, and it prints that warning whenever the flag
is given. Without the flag the appointment may have no reminder run. With it
the appointment gets a fresh one either way. **In a GREEN sitting the flag is
given only on the lead's ruling.** GREEN reports the count and halts.

**The lock** is the file `~/.osteojp-inc1007-rearm.json.lock`. Every `--confirm`
takes it before reading the database and removes it when it ends. A second
`--confirm` while it exists is refused, so two runs cannot overlap. A run that
is killed leaves the lock behind on purpose, and the script never removes a
lock it did not take. Every later `--confirm` is refused until the file is
gone. **In a GREEN sitting a lock left behind is a halt, and whether the file
is removed is the lead's ruling.** The lock only works on one machine, so one
machine is used for the whole operation.

## The three gate lines the script prints

Strategy's gates G1, G3 and G4 are read from lines the script prints. Every
report carries them in this order, after the `ELIGIBLE` block and before
`THIS RUN:`: the two G1 lines, the G4 line with its sentence and its
`not counted` line, the G3 line. A confirm that had rows to send prints one
more G4 line and one more G3 line after its closing counts.
The dry run prints the first set too, so the owner sees all three before
anything is sent.

### G1: the projected scheduler executions

```text
G1 PROJECTED SCHEDULER EXECUTIONS: <inScope x 8> at most  (<inScope> appointments in scope x 8: 3 runs and 5 steps each)
G1 UNDER THE LIMIT OF 20000: yes
```

or, as the second line:

```text
G1 UNDER THE LIMIT OF 20000: NO
```

The first number is the bound for everything in scope at THIS read, sent
already or not. "In scope" is every future appointment that could get an event
at these bounds: not an unaccepted request, not inside 24 hours, not beyond the
28 days. It counts the rows already sent, the rows skipped as touched or
attempted and the rows held back for a mark. It is not one number for the whole
operation: it shrinks as sent rows come inside 24 hours or start. **The first
sitting's number is the gate**: the one the dry run of step 3 prints.

"At most 8" is without retries. A run or a step that the scheduler tries again
is not in the 8, and whether the vendor bills a retry is not established.

`NO` means 20000 or more, which is 2,500 appointments or more. A dry run that
prints `NO` still exits 0, and the sitting halts there: that is gate G1. A
`--confirm` on `NO` ends with `FAILED` after the report lines and before
anything is sent. Nothing is written to the marker and the lock is given back.

### G3: the reminder ledger

```text
G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: <n>  (appointments checked: <k>; handed to a provider: <h>; not checkable: <u>; expected 0)
```

Every message the platform attempts, a reminder or a booking confirmation,
writes one row to the reminder ledger, the table `reminder_dispatches`. It does
so whether the message was sent, suppressed or failed at the provider. The
re-arm writes no row, and a waiting run writes none until it wakes. So for each
appointment an earlier run of this operation sent, or started to send, the
script counts the ledger rows written between that run's read and the end of
that run's margin. The margin kept every real reminder mark out of that window,
so the count must be 0.

| Number | Meaning |
|---|---|
| `<n>` | Ledger rows found. Expected 0 |
| `<k>` | Appointments checked: the marker's sent and attempted rows |
| `<h>` | Of the rows found, those that were not suppressed: sent, or failed at the provider |
| `<u>` | Marker rows that cannot be checked: their run recorded no read instant or no margin, or the row's id is not a uuid |

Every mode prints this line once, after its first read, the dry run included.
The statement is sent to the database in every one of those reads. Before the
first send of all there is nothing to check yet: the statement runs with no
windows, the database answers 0, and the line reads 0 rows for 0 appointments.
So the dry run of step 3 proves the statement on production before anything is
sent.

The number of appointments checked on this line is known before each step. A
different number is a count that is not the one expected, and it halts the
sitting.

| Where | Appointments checked |
|---|---|
| Step 3 of a first sitting | 0 |
| Step 4, the canary's dry run and the canary | 0 |
| Step 6, its first dry run and its first send | 5: the canary's five |
| Every later run of step 6, and the closing dry run | Everything sent so far: every row the marker holds as sent or attempted |
| The second sitting, from its first dry run on | Everything the first sitting sent, then what the second sitting adds |

A count above zero ends the run with `FAILED`, in every mode, before anything
is sent, and this sentence:

```text
G3: <n> reminder ledger row(s) were written for appointments this operation sent, inside the margin of the run that sent them. No message may leave at run time. Send nothing further and report every line above.
```

Every later run reads the same windows, so every later run fails the same way,
the dry run included, and the second sitting too. That is the halt G3 asks
for. Nothing further is sent. **There is no way past it in the script.** No
flag skips the read, and the marker is never edited or deleted. Strategy rules
what happens next.

"Not checkable" above zero is a failure too, in every mode. It comes after the
G3 line is printed and before anything is sent, with this sentence:

```text
G3: <u> marker row(s) cannot be checked against the ledger. The marker is this operation's only record of what was sent. Send nothing further and report every line above.
```

If the second read itself fails, the line reads
`G3 AFTER THIS RUN: NOT READ  (the G3 ledger read failed: <name and code>)` and
the run ends FAILED. A run whose second read is above zero, or fails, is
recorded in the marker with the state `g3_failed`, not `done`.

If the read itself cannot be made, the run ends with `FAILED` and
`the G3 ledger read failed: <name and code>`.

A confirm that started one request or more reads the ledger a second time,
after its sends. It waits 20 seconds first, so that the scheduler has acted on
the events (the scheduler's own wait is 2 seconds). It prints:

```text
settle   waited 20 s for the scheduler before the second ledger read
G3 AFTER THIS RUN: <n>  (appointments checked: <k>; handed to a provider: <h>; expected 0)
```

On this line `<k>` is the number of requests this run started.

Above zero here ends the run with the same `FAILED` sentence, after the closing
counts. If the run had already stopped on a failed send, that failure is the
one printed.

A confirm that had rows to send always prints the `G4 ATTEMPTED EQUALS SENT`
line and a `G3 AFTER THIS RUN` line after its four closing counts. When it
started no request, because every row changed since the read, there is no
wait, no `settle` line and no read of the database, and the two lines are:

```text
G4 ATTEMPTED EQUALS SENT: yes (0 requests started, 0 sent)
G3 AFTER THIS RUN: 0  (appointments checked: 0; handed to a provider: 0; expected 0)
```

A confirm with nothing eligible ends early with `SENT: 0 of 0` and prints
neither.

What a count above zero would mean: a ledger row was written for a re-armed
appointment inside the window of the run that sent it. A run of the
confirmation function started by one of our events looks like that (step 2,
the third setting), and so does an event that landed next to a reminder mark. The cause may also be
ordinary: a save of one of those appointments in the app, inside the window. A
save starts the confirmation function, and that function writes a ledger row
even when it sends nothing. The read returns counts and cannot tell these
apart. In a closed window nobody is saving. Whatever the cause, it is a halt,
and strategy rules what happens next.

The read is one READ ONLY transaction. It returns two counts and nothing else.

### G4: the next 48 hours, and attempted equals sent

```text
G4 NEXT 48 HOURS, NOT RE-ARMED: <a + b>  (starting within 24 hours: <a>; 24 to 48 hours ahead: <b>)
  reception sees these appointments in Agenda, and which of them got an SMS in Comunicações, Lembretes SMS
  not counted: <s> starting within 24 hours that an earlier run of this operation sent
```

The script never sends for an appointment that starts within 24 hours of the
read. Those appointments are split in two.

- `<s>` counts those the marker holds as sent at the start they have now. An
  earlier run of this operation re-armed them, so they are not "not re-armed".
  They are on the third line and in neither `<a>` nor the total.
- `<a>` is all the others inside 24 hours. A row the marker holds only as
  attempted stays in `<a>`. So does a row that was sent at another start and
  has moved since.

`<b>` is every appointment 24 to 48 hours ahead that was
not re-armed: skipped as touched, held as attempted, held back for a reminder
mark, or held back by `--min-days-ahead`. An appointment that is eligible in
this run, or that an earlier run sent, is not counted. Neither is an unaccepted
online request, which has no reminder until reception accepts it.

**What the count is.** The appointments in the next 48 hours that this script
did not re-arm.

**What the count is not.** It is not a count of appointments without a
reminder. Most of these appointments are healthy: an appointment inside 24
hours whose reminder was never damaged got its SMS at its 24 hour mark. Nobody
can count the damaged ones, which is why this operation exists. In the night
run of a first sitting `<a>` is close to the whole of the next day's agenda.

It is a count for the owner. It never fails a run.

**Which run's number to read.** The line is printed before a run's sends, and
it counts the rows that run is about to send as re-armed. So the number that
answers gate G4 is the one of the closing dry run of the sitting, which sends
nothing and prints the count afresh: see "The closing dry run". The canary's
own number is larger and is not the one to read: `--min-days-ahead 3` holds
back everything nearer than three days.

**In the second sitting** the owner reads the same number: the total
`<a + b>` on the G4 line of that sitting's closing dry run. By then many of the
appointments the first sitting sent start within 24 hours. They are on the
`not counted` line as `<s>`, and `<s>` is not added to the total.

**There is NO screen that lists appointments without a reminder.** The nearest
is Comunicações, Lembretes SMS (`/comunicacoes/lembretes-sms`). Each SMS
attempt that reached its send moment has a row there. A reminder whose run was
destroyed never reached its send moment, so it has no row. Reception compares
the Agenda for the day with that screen: an appointment on the Agenda with no
SMS row is one to look at. The script prints no names, so the list comes from
the Agenda.

This is a gap in the product. A daily count of appointments without a waiting
reminder is proposed separately. It is not part of this operation.

After the closing counts of a confirm comes the second G4 line:

```text
G4 ATTEMPTED EQUALS SENT: yes (<started> requests started, <sent> sent)
```

or:

```text
G4 ATTEMPTED EQUALS SENT: NO (<started> requests started, <sent> sent)
```

`<started>` is the number of rows this run wrote to the marker as attempted
before their request left. `<sent>` is the number the scheduler answered. `NO`
means a request left and no answer came. That is a failed send, and the failed
send has already stopped the run with `FAILED`. The G4 line never fails a run by
itself. For the row in question, see "An attempted row" above. A confirm that
had rows to send prints this line always, also when it started no request: it
then reads `yes (0 requests started, 0 sent)`. See G3 above.

## What it costs the scheduler

The vendor counts one execution for each function run and one for each step of
it. Its own example: "A function run with five steps uses six executions".

| For one event | Runs | Steps | Executions |
|---|---|---|---|
| `schedule-appointment-reminders`: plans the reminders | 1 | 1 | 2 |
| `send-appointment-reminder`, the 48 hour email: sleeps, then sends | 1 | 2 | 3 |
| `send-appointment-reminder`, the 24 hour SMS: sleeps, then sends | 1 | 2 | 3 |
| **An appointment more than 48 hours ahead, at most** | **3** | **5** | **8** |
| An appointment 24 to 48 hours ahead (the SMS only) | 2 | 3 | 5 |

The script counts 8 for every appointment in scope, so its number is a ceiling
without retries: see G1 above. A row sent a second time with `--resend-attempted` costs its executions a
second time; the projection counts each appointment once.

| Fact | Value |
|---|---|
| The limit for this operation (strategy's G1) | 20000 executions. Under means under: 20000 itself is `NO` |
| The account's monthly allowance | 50000 executions |
| Used when the owner took his screenshot on 2026-10-07 | 3,895 |

On the free plan the vendor does not bill past the allowance. When the cap is
enforced, new runs are skipped. A skipped run is a reminder that is never sent,
which is why the limit exists and why a confirm refuses on `NO`.

## The order of use

GREEN pastes the blocks of the dispatch file, and each of those carries its own
explicit halt. This section gives the order of the steps and the plain command
of each, so that the owner and strategy can read what is run.

| Sitting | When | Steps | Canary |
|---|---|---|---|
| First | The first closed window with the owner at the keyboard: before 08:00 Lisbon on 2026-10-08, or after 21:00 Lisbon on 2026-10-08 | 1 to 6b, then the closing dry run | Yes, five appointments |
| Second | 25 hours or more after the owner's Resync of 2026-10-07, which he reported done at 20:45 Lisbon. That is from 2026-10-08 21:45 Lisbon, in a closed window | 7, then the closing dry run | No |

Each block is one command. Run them from the repository root, in a shell that
holds `DATABASE_URL_DIRECT` (the session pooler, port 5432) and
`INNGEST_EVENT_KEY` (the production value). The script prints neither, and no
part of either.

**`--max-days-ahead 28` is on every command.** It is the ruled scope. A real
`--confirm` without it is refused.

**Keep the machine awake for the whole run.** On macOS that is `caffeinate -i`
in front of the command, as the two sending blocks below have it. A machine
that sleeps in the middle of a request can deliver that event many minutes
late, outside the margin the run counted on, and so right next to a reminder
mark. Plug the laptop in and leave the lid open as well: `caffeinate -i` stops
idle sleep, not a closed lid.

**Run a confirm right after its own dry run, with the same `--max`, the same
`--min-days-ahead` and the same `--max-days-ahead`.** The eligible count depends
on all three, and it moves as reminder marks enter the margin. If `--expect` no
longer matches, the script refuses and sends nothing: run the dry run again.

**GREEN reports every line each command printed.** The lines carry appointment
ids, instants, statuses and counts. They carry nothing about a patient.

### The first sitting

**Step 1. The fix is merged and deployed.** PR #1562 is on `main` and Vercel
shows the production deployment of that commit as complete. Note the full
40-character commit sha. The script records it and cannot check it.

**Step 2. The owner looks at the Inngest dashboard.** A deploy does not carry a
job's settings to the scheduler. The app `osteojp-reminders` is synced by hand
(Apps, `osteojp-reminders`, Resync), and until that is pressed the scheduler
keeps the old settings however new the code is. `CLAUDE.md` records this under
2026-10-07. The owner reported the Resync done on 2026-10-07 at 20:45 Lisbon.
The look is still done in the sitting: a report that a button was pressed is
not a look at the settings. In each function's configuration panel, three
things:

- `schedule-appointment-reminders` shows **Debounce**.
- `send-appointment-reminder` shows **Singleton**.
- `send-appointment-confirmation` shows, on its trigger, the expression
  `event.data.confirmationEligible == true`.

The third matters because that expression, stored in the scheduler, is the only
thing that keeps the confirmation function from starting on an event that says
`confirmationEligible: false`. The script's refusal says it in these words: "if
the third is missing every event starts the confirmation function, and a
patient who booked online gets a booking confirmation". That would be a
confirmation for a booking made days ago, and the canary itself would start it:
the function's code has no second check.

If any of the three is missing, or the expression reads differently, the
scheduler is not running what this operation relies on. Stop here. No lane
presses Resync: it is a call into production. GREEN gives
`--i-checked-inngest-settings` only after the owner has said, in the sitting,
that he saw all three.

**Step 3. Dry run (gate G1).** It sends nothing.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --max-days-ahead 28 --max 200
```

`--max 200` is what step 6 sends with: see "Why 200" there. Read the counts.
`ELIGIBLE` is the number the runs of step 6 would send now, all together. Then
the three gate lines:

- `G1 UNDER THE LIMIT OF 20000:` must say `yes`. On `NO`, halt.
- `G4 NEXT 48 HOURS, NOT RE-ARMED:` is a count for the owner. Report it.
- `G3 LEDGER ROWS ...` must say 0, for 0 appointments checked in a first
  sitting. Above zero the run has already ended with `FAILED`.

**Step 4. Canary: five appointments, three or more days ahead.** Three days, so
both reminders are still ahead and each appointment should end with two waiting
runs. First the dry run of the canary, then the canary itself with the
`ELIGIBLE` number that dry run printed.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5
```

```bash
ELIGIBLE=
FIX_SHA=
caffeinate -i node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 --confirm --expect "${ELIGIBLE}" --fix-deployed-sha "${FIX_SHA}" --i-checked-inngest-settings
```

Fill in the two values before pasting. With either one empty the script refuses
and sends nothing.

The canary must end with `SENT: 5 of 5`, `G4 ATTEMPTED EQUALS SENT: yes` and
`G3 AFTER THIS RUN: 0`. Anything else is a halt.

**Step 5. The owner checks the five in the dashboard (gate G2).** The canary
prints five appointment ids. The check is done right after the canary: on the
free plan the Runs list reaches back 24 hours only.

The click path, one appointment id at a time:

1. Inngest Cloud, the Production environment.
2. Functions, then `send-appointment-reminder`.
3. The Runs tab, then "Show search".
4. The expression `event.data.appointmentId == "<the id>"`, with the id from
   the canary's output between the quotes.

What must be there, for every one of the five: exactly **one** waiting email
run and exactly **one** waiting SMS run. Not zero, not two. A waiting run shows
with the status Running: the vendor has no Sleeping status. To tell the two
apart, open each run: its event carries `channel`, which reads `email` for the
48 hour reminder and `sms` for the 24 hour one. Count only the runs whose
status is Running. An earlier run that the canary's event replaced may be
listed as Cancelled, which is the design.

**This holds WHATEVER channels the patient has.** Strategy's gate says "where
the patient has each channel". That qualifier does not apply to what the
dashboard shows. The patient's channels are checked only when a run wakes, at
the reminder's own moment, and never when the run is created. So a patient with
no email address still shows one waiting email run, and a patient with no
mobile number still shows one waiting SMS run. The run decides, when it wakes,
whether there is anything to send. Five appointments means ten waiting runs.

If any appointment shows anything else, stop and report. Nothing further runs.
Do not run step 6.

This check shows that the events arrive and schedule. It does NOT show that the
fix is live: one event gives one run per channel under the old settings too.
Step 2 is the only check of the settings.

While in the dashboard, press nothing that sends: see "Replay" below.

**Step 6. The rest, 200 at a time.** A dry run again, then the send with its
`ELIGIBLE` number. The five from the canary are skipped by the marker. The
first dry run also reads the ledger for the five: its `G3 LEDGER ROWS ...` line
must say 0 for 5 appointments checked.

```bash
node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --max-days-ahead 28 --max 200
```

```bash
ELIGIBLE=
FIX_SHA=
caffeinate -i node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp --max-days-ahead 28 --max 200 --confirm --expect "${ELIGIBLE}" --fix-deployed-sha "${FIX_SHA}" --i-checked-inngest-settings
```

These are the commands the dispatch's blocks B and D run. Step 3 and both
blocks here carry the same three bounds:
`--tenant-slug osteojp --max-days-ahead 28 --max 200`.

Read the lines at the end. First the four counts: `SENT`,
`changed since the read, not sent`, `attempted, outcome unknown` and
`not reached`. Then `G4 ATTEMPTED EQUALS SENT`, which must say `yes`, the
`settle` line when a request was started, and `G3 AFTER THIS RUN`, which must
say 0.

**Repeat step 6, both blocks, while the dry run's `ELIGIBLE` is above zero.**
Not only when a run printed `OUT OF TIME` or `not reached` above zero. The
`THIS RUN` line says how many rows wait: `left for a later run` above zero
means another run. The sends of the sitting are over when a dry run prints
`ELIGIBLE: 0`.

**Why 200.** One run then ends in a few minutes, inside the ten minutes a
session allows a command. At about 2,500 appointments that is up to 14 runs.
The margin of every one of them is 690 s. The few minutes are reasoned from
local runs: no send to the hosted scheduler was timed.

**Step 6b. Only if step 6 held rows back for their 48 hour mark.** Look at the
dry run's line "the 48 hour mark (only a run from 1 minute after the mark, and
within 23 hours of this read, can send them)". If its number is not zero,
repeat step 6 once more, at least a quarter of an hour after step 6 and no more
than 23 hours after it. On a weekday night the number should be zero, because
no mark falls at night. Rows on the line above it, "the 24 hour mark (this
script will never send for them)", cannot be helped by any run.

### The second sitting

**Step 7. One more pass, from 2026-10-08 21:45 Lisbon, without a canary.** That
is 25 hours after the owner's Resync of 2026-10-07, reported done at 20:45
Lisbon. Rule 7 keeps a row out until 25 hours after its last save, so by 21:45
every row saved before the Resync is past its 25 hours. The pass is step 6
again, both blocks, unchanged. It sends what the first pass skipped as touched,
and rows that changed under a send. It does NOT reach the rows of step 6b: by
then they are inside 24 hours.

- **No canary.** The canary of the first sitting was the check that the events
  arrive and schedule.
- **The same machine**, because the marker is there. The dry run reads the
  ledger for everything the first sitting sent, and that number must be 0 too.
- **The owner at the keyboard again.** The confirm needs
  `--i-checked-inngest-settings`, and that flag is his word.
- If the first sitting is itself on 2026-10-08 after 21:00, the two sittings
  are the same evening: steps 1 to 6 first, step 7 from 21:45.

**Rows saved on 2026-10-07 before the Resync are the ones most likely
damaged. With the first sitting before 08:00 on 2026-10-08, they are reachable
only by this second sitting.** A sitting before 08:00 comes less than 25 hours
after every save made on 2026-10-07 from 07:00 on, which is the whole clinic
day, so it skips those rows as touched. The clinics are then open until 21:00.
A pass from 21:45 reaches all of them at once.

**Those among them that start before about 21:45 on 2026-10-09 are out of reach
for good.** By the second sitting they are inside 24 hours. That covers every
appointment of 2026-10-08 and of 2026-10-09 that was saved again on 2026-10-07
before the Resync. The script counts such rows on the line "no later run can
reach them", under the touched count. Read that line as a floor, not as the
whole number: the script knows each row's own 25 hours, and it does not know
that no run happens while the clinics are open. In a first sitting before 08:00
the fuller number is on the G4 line of step 3 and of step 6. Its "24 to 48
hours ahead" counts every appointment of 2026-10-09 that was not re-armed, the
healthy ones among them.

Rows saved after the Resync, within 25 hours of this pass, are skipped as
touched once more. A save that sent an event left such a row with its waiting
reminders, on the same condition as everything here: the settings of step 2 are
live. The audit test is wider than the code that emits, so a few of these rows
may have sent no event. This pass does not reach those, and no third pass is
ruled.

### In either sitting

**The closing dry run.** Each sitting ends with one more dry run: the dry run
of step 6, unchanged. It is run no sooner than 12 minutes after the read of the
last run that sent. A margin is 690 s at most, so by then the window of that
last run has closed, and this dry run's G3 line reads every window of the
sitting whole. It must say 0. The same dry run prints the final G4 line, the
one the owner reads.

**If a run stops half way.** It prints `FAILED: stopped at <appointment id>` and
why. Report that line and every closing line above it. Then run the dry run
again. Rows the marker holds as sent are skipped. The row the run stopped on is
held as attempted: see "An attempted row" above. If the run was killed and not
stopped, the lock is still there: see "The lock". In a GREEN sitting the
attempted row and the lock are both for the lead to rule on.

## Rollback

None is needed and none exists.

- The operation writes nothing to Postgres. There is no row to put back.
- An event cannot be recalled, and it need not be. With the settings of step 2
  live, each event leaves its appointment with exactly one waiting reminder per
  channel, which is the intended state.
- A run that stops half way leaves nothing to undo. The marker records what was
  sent, and the next run goes on from there.

## Replay

**Nobody presses Replay or Rerun on any event or run in the Inngest dashboard:
not before the sitting, not during it, not after it.**

- Not on a reminder event from before the fix. Measured: the patient gets the
  reminder twice.
- Not on an `appointment/scheduled` event this operation sent. Whether a Replay
  re-uses the event's id was not established, and a repeated id is the incident
  again.

A row whose send is in doubt can go out again only through the script, as a new
event, with `--resend-attempted`, and in a GREEN sitting only on the lead's
ruling. Never through the dashboard.

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
- **A machine that sleeps.** The run counts its time on this machine's clock.
  See "Keep the machine awake" above.
- **Whether the scheduler really enforces a limit on how long a run may last.**
  The vendor publishes 30 days and documented 7 days per sleep until
  2026-10-01. Which one is enforced, and what happens to a run past it, is NOT
  ESTABLISHED. See "Why 28 days".
- **A ledger row that a slow queue writes after the margin window has closed.**
  The G3 read counts rows written inside the margin of the run that sent the
  event. The second read waits 20 seconds, and a row written after that read
  but inside the window is found by the first read of the next run, and at the
  latest by the closing dry run. A row
  written later than the window is never counted. The canary of five, checked
  by the owner in the dashboard, is the real check.
- **Why a ledger row was written.** The G3 read returns counts. It cannot tell
  a message one of our events caused from one an ordinary save caused in the
  same minutes.

## What it does not fix

- **Appointments inside 24 hours.** Both reminder moments have passed. They are
  counted under `skipped: starts within 24 hours`.
- **Appointments more than 28 days ahead.** `--max-days-ahead 28` holds them
  back and counts them. A damaged one that far ahead stays damaged until
  strategy rules on its Q3.
- **Appointments whose 24 hour mark is inside the margin.** The real floor is 24
  hours plus the margin. The dry run counts them on the line "the 24 hour mark
  (this script will never send for them)". If such an appointment was damaged,
  its SMS is lost.
- **Appointments whose 48 hour mark was inside the margin, unless a run comes
  back for them in time.** They can be sent only from one minute after that
  mark and within 23 hours of the run that held them back (step 6b). A run a
  day or more later finds them inside 24 hours. Then a damaged one loses its
  SMS.
- **Appointments 24 to 48 hours ahead get the SMS only.** The email moment has
  passed.
- **Some rows saved in the last 25 hours.** A row that was saved again yesterday
  and starts within about two days will be too near its start before rule 7
  lets it through. The dry run counts these on the line under the touched count:
  "no later run can reach them". That line is a floor: see "The second sitting".

If either of those two counts is not zero, the owner decides whether reception
phones those patients. The script prints no names, so the list comes from the
agenda. The `G4 NEXT 48 HOURS, NOT RE-ARMED` line gives the owner the wider
count for the same decision, and names the screen reception uses.

## What it never does

- It never writes to Postgres. The G3 ledger read is a read, and returns counts.
- It never asks for a booking confirmation. Every event carries
  `confirmationEligible: false`. Whether the confirmation function then stays
  out of it depends on the scheduler's stored trigger carrying
  `event.data.confirmationEligible == true`, which is the third thing the owner
  sees in step 2. The function's code has no second check.
- It never sends a real `--confirm` without `--max-days-ahead`, and never sends
  for an appointment beyond it.
- It never sends when the G1 line says `NO`, or when the G3 read before the
  sends is above zero.
- It never sends for an unaccepted online request.
- It never gives an event an id of its own, and it never retries a request.
- It never sends a row the marker holds as sent at the same start, and never
  sends an attempted row unless `--resend-attempted` says so.
- It never runs two sends at once. The lock refuses the second run.
- It never sends within the margin of a reminder mark.
- It never prints a name, a phone number, an email address, the connection
  string, any part of the connection string, or the event key. About the
  database it prints one verdict and nothing parsed. When the database or the
  network fails it prints the error's name and code, such as
  `Error ECONNREFUSED` or `PostgresError 28P01`, and never the error's message:
  a driver's message can name the host, the port or the user.
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
| A dry run against a closed local port | `FAILED: the read failed: Error ECONNREFUSED`, exit 1, no host and no port on any line |
| The sink confirm again under `caffeinate -i`, with `--resend-attempted` | sent 0 of 0, the flag's warning printed, lock given back |

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
- **The G3 ledger read on production.** Added 2026-10-08. No rehearsal can make
  it there: it reads the production table `reminder_dispatches` through the
  production connection. Its first run on production is the dry run of step 3,
  before anything is sent. Corrected 2026-10-08: this line said so while it was
  false. With nothing to check the script asked the database nothing, so the
  first real run of the statement would have come after the canary's sends.
  Since the fix list that followed round 4 the statement runs in every read.
- **The dispatch's blocks on production.** Added 2026-10-08. They run against
  the production target and the hosted scheduler, and no rehearsal contacts
  either.

## Round 4, 2026-10-08

Local only, under the lead's rule quoted above. Everything below ran against
the local lane database at `127.0.0.1:54622` and nothing else, on 2026-10-08
from 01:32 to 01:43 Lisbon. No guard was edited or passed, and
`INNGEST_EVENT_KEY` was never set. Where the script refused, the refusal is the
result. The full record is
`/Users/ivan/osteojp-handover/rehearsal-rearm-1007-round4.md`.

**It ran the script as it stood before the fix list that followed the round**
(sha256 `5dc4ecaf431855b580b7e09279a30b981cd45bd3025624795d0ed0231dcd0f62`, the
same before the first run and after the last). So its outputs do not carry what
that fix list added: see NOT REHEARSED at the end of this section.

| Fact | Value |
|---|---|
| Runs | 38 runs of the script (22 ended 0, 10 ended 1, 6 ended 2) and 1 probe of its pure functions |
| Void runs | 4 of the 38. The rehearsal's own shell passed `--sink-file` and its path as one argument. The script answered `BAD INVOCATION`, exit 2, four times, and sent nothing |
| Substitutions | Four and no more: the local database's own connection string, the seeded tenant `osteojp-preview`, `--sink-file` on every confirm that could send, and a fresh folder as `HOME` |
| The seeded tenant | 255 appointments, every one in the past, 0 audit rows and 0 ledger rows. A dry run on it alone read 0 future and 0 eligible |
| Synthetic rows | 21 appointments with 24 audit rows, then 2 more appointments with 2 audit rows, placed next to a reminder mark. Local database only, marked as synthetic |
| Repository files changed | None |

**The command line with eligible rows.** The 2026-10-07 rehearsal could not do
this and listed it under NOT REHEARSED. Every run below is the command line,
with the reads the script makes itself and `--max-days-ahead 28`. The main runs
carried `--max 1000`, which is what steps 3 and 6 said at the time.

| # | Run | Result |
|---|---|---|
| 01 | Dry run | margin 690 s. 20 future, 1 unaccepted request, 1 inside 24 hours, 2 beyond 28 days, 3 touched (1 out of reach), 0 held back for a mark, 13 eligible. G1: 128 at most for 16 in scope, `yes`. G4: 2 (1 within 24 hours, 1 at 24 to 48 hours). G3: 0 for 0 appointments checked |
| 02 | Canary dry run (`--min-days-ahead 3 --max 5`) | margin 165 s, 2 held back for the three days, 11 eligible, `THIS RUN: 5 of 11` |
| 03 | Canary to the sink with `--expect 11`, 60 s later, after one row had come inside the 28 days | refused, exit 1: expected 11 and found 12. No sink file, no marker, no lock left |
| 04 | Canary dry run again | 12 eligible, `THIS RUN: 5 of 12`. G1: 136 at most for 17 in scope. G3: 0 for 0 checked |
| 05 | Canary to the sink with `--expect 12` | `SENT: 5 of 5`, 0 changed, 0 attempted, 0 not reached. Then `G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)`, the settle line, and `G3 AFTER THIS RUN: 0` for 5 checked |
| 16 | Dry run for the rest, after the 2 rows next to a mark were added | 22 future, 5 skipped as sent, 2 held back for a mark (1 at 24 hours, 1 at 48 hours), 9 eligible. G1: 152 at most for 19 in scope. G3: 0 for 5 checked |
| 17 | The rest to the sink, under `caffeinate -i`, with `--expect 9` | `SENT: 9 of 9`, 0 changed, 0 attempted, 0 not reached. `yes (9 requests started, 9 sent)`, then `G3 AFTER THIS RUN: 0` for 9 checked |
| 26 | Dry run after that | 14 skipped as sent, 2 held back for a mark, 0 eligible |
| 27 | Dry run 6 minutes 5 s after those 2 rows were added (step 6b) | the row held back for its 48 hour mark is now eligible: 1 |
| 28 | Step 6b to the sink, with `--expect 1` | `SENT: 1 of 1`. This run was also made to fail its second G3 read: see below |
| 30 | Last dry run | 15 skipped as sent, 0 attempted, 0 eligible |
| 31 | A confirm with nothing left | `SENT: 0 of 0` |

Each of the three confirms that sent took 20 s of wall clock. That is the
settle wait: the read and the sends to a local file took under one second
together. The sink file held 15 events for 15 different appointments, all 15
synthetic, each with the name `appointment/scheduled`, the four data keys,
`confirmationEligible` false and no id. The marker held three entries (5, 9 and
1 rows, all sent, 0 attempted), each with its read instant, its margin and
`maxDaysAhead` 28. The fresh `HOME` folder was empty after every run.

**The rows on the boundaries.**

| Row | What the script did with it |
|---|---|
| 28 days minus 86 ms ahead at the first read | in scope and eligible. Sent in run 17 |
| 28 days plus 54.6 s ahead in run 02, 28 days minus 5.9 s from run 03 on | held back as beyond 28 days, then in scope and eligible. Sent in run 17 |
| 40 days ahead | held back as beyond 28 days in every run. Not in the G1 scope |
| 12 hours ahead | skipped as inside 24 hours. Counted in G4, starting within 24 hours |
| 36 hours ahead, created 2 hours before | skipped as touched, and counted under "no later run can reach them": 1. Counted in G4, 24 to 48 hours ahead |
| 30 hours ahead | main runs: eligible, `would schedule: 24h sms`. Canary runs: held back by `--min-days-ahead 3` and counted in the canary's G4 |
| Created 25 hours 10 minutes before | eligible. Sent by the canary |
| Created 23 hours before | skipped as touched in every run |
| An `appointment.update` to `cancelled`, 1 hour old | eligible: that update is not an emitting event. Sent in run 17 |
| An `appointment.update` with `via` `portal_request_confirm`, 3 hours old | skipped as touched in every run |
| An online request not yet accepted | `skipped: unaccepted online request: 1` in every run. Not in the G1 scope |
| A cancelled appointment | never read: 20 future rows with 21 synthetic rows in the table |
| Starts 24 hours 5 minutes after it was added | held back for its 24 hour mark, then inside 24 hours. Never sent |
| Starts 48 hours 5 minutes after it was added | held back for its 48 hour mark. Eligible 6 minutes 5 s later, `would schedule: 24h sms`. Sent in run 28 |

The command line cannot put a row exactly 28 days ahead of the read, because
the read instant is the database's own clock. The exact boundary was read from
the script's pure function `verdictOf` in the probe: 28 days minus 1 ms is
`emit`, exactly 28 days is `emit`, 28 days plus 1 ms is `beyond_max_days`.

**G3 on a real local database, both ways.** The canary's window was 165 s long,
from its read. With nothing in the ledger every G3 line read 0 (runs 05 and
17). Then one synthetic ledger row, suppressed, was written for one of the
canary's five and moved across that window. Each run is the dry run with
`--sink-file` unless the row says otherwise.

| # | The ledger row's time | First G3 line | Result |
|---|---|---|---|
| 07 | window start + 30 s | 1 for 5 checked, handed to a provider 0 | exit 1, with the G3 `FAILED` sentence |
| 08 | the same, and the run is a sink confirm | 1 | exit 1 with the same sentence, before `THIS RUN`. Nothing sent: the sink file and the marker had the same sha256 before and after, and no lock was left |
| 09 | window end + 1 s | 0 for 5 checked | exit 0 |
| 10 | exactly the window end | 0 for 5 checked | exit 0. The end is not inside |
| 11 | window end minus 1 ms | 1 | exit 1 |
| 12 | exactly the window start | 1 | exit 1. The start is inside |
| 13 | window start minus 1 ms | 0 for 5 checked | exit 0 |
| 14 | window start + 30 s, outcome `provider_error` | 1, handed to a provider 1 | exit 1 |

The second read was made to fail as well. Before run 28 a ledger row was
written for the row that run was about to send, dated 8 s ahead, so that the
run's first read could not see it. Run 28 read 0 for 14 checked, sent 1 of 1,
printed `yes (1 requests started, 1 sent)` and the settle line, then
`G3 AFTER THIS RUN: 1` for 1 checked and the G3 `FAILED` sentence, exit 1. The
dry run after it (run 29) read 1 for 15 checked and failed the same way. With
that ledger row deleted, run 30 read 0 for 15 checked and ended 0.

**G1 at the limit.** The pure functions, in the probe: 2499 appointments in
scope give 19992 and `yes`, 2500 give 20000 and `NO`. Then the same on the
database, with bulk synthetic rows:

| # | Run | Result |
|---|---|---|
| 23 | Dry run with 2499 in scope | exit 0. `19992 at most`, `G1 UNDER THE LIMIT OF 20000: yes`, `THIS RUN: 1000 of 2480` |
| 24 | Dry run with 2500 in scope | exit 0. `20000 at most`, `G1 UNDER THE LIMIT OF 20000: NO`. The dry run still ends normally |
| 25 | Sink confirm with 2500 in scope | exit 1 after the report lines, with the G1 `FAILED` sentence. The sink file and the marker had the same sha256 before and after, and no lock was left |
| 22 | Dry run with 2519 in scope | exit 0. `20152 at most`, `NO`. A read of 2,522 rows took under one second |

**A confirm without `--sink-file`, against the local database.** Three runs,
three refusals, in this order: `BAD INVOCATION` for the missing
`--fix-deployed-sha` (exit 2); `BAD INVOCATION` for the missing
`--max-days-ahead` (exit 2), before the target line and before any connection;
and with both given, the target line `NOT production (a strict local database)`
and `FAILED: INNGEST_EVENT_KEY is not set` (exit 1), before any connection.
None printed a `sending` line, and none wrote a marker or a lock in the fresh
`HOME`.

**What the output lines carried.** All 39 outputs, 1,258 lines, searched with
patterns that were first shown to hit a control line. 0 lines carried an "@",
the shape of an email address or of a phone number, `127.0.0.1` or `localhost`,
a URL scheme, a host-like word, a port number or the word "password". 0 lines
carried the name of a seeded patient or staff user (63 names) or a seeded
phone, email or tax number (61 values). 31 lines carried the sink path, which
holds the account name of the machine's user. Read from the code and not run:
in a real confirm the `SENT` line prints the path of the marker in the
operator's home folder, which carries that account name too. It is not patient
data and does not come from the connection string.

**What was deleted.** Every synthetic row. The 2,481 bulk rows went straight
after run 25, and a count showed 0 left. The ledger rows went after their
runs. At the end no synthetic appointment, audit row or ledger row was left,
by id, by note and by audit mark. The seeded tenant read 255 appointments, 0
audit rows and 0 ledger rows before and after. The lane stack was left up, as
found.

**One mutation sweep.** The script was mutated once, mechanically: 368
mutants, 358 killed by the tests. Of the 10 survivors, 3 are equivalent, 2
were real gaps and are closed by tests added with the fix list after the
round, and 5 sat in the real reader's mapping of the database's answer, which
only a database could kill. Those 5 are closed by moving the mapping into a
pure function with tests of its own, and by the real-database runs above.

**The dispatch's blocks, in a fault-injection harness.** The blocks ran in
zsh and in bash with every external command stubbed: 1,198 arms before the
fixes that followed the round. The numbers after the fixes: re-run before
READY, see the dispatch. A stubbed command says that a block halts. It says
nothing about production.

**A trap of rehearsals only.** A rehearsal dry run reads the rehearsal marker
only when it carries `--sink-file`. Run 06 was the plain dry run after the
canary, with one ledger row inside the canary's window. It read the marker in
the fresh `HOME`, which did not exist, so it printed 0 already sent and a G3
line of 0 for 0 appointments checked, and it ended 0. Run 07, the same command
with `--sink-file`, found the 5 and failed on G3. On production the dry run and
the confirm read the one marker in the home folder, so this cannot happen
there.

**NOT REHEARSED in round 4:**

- **What the fix list after the round added to the script.** The `not counted`
  line of G4, the "not checkable" halt, the closing lines of a confirm that
  started no request, and the ledger statement running with nothing to check.
  None was run on the command line in this round's rehearsal. They rest on the
  test file and on a probe of the ledger statement through the script's own
  reader on the local database. A command-line rehearsal of the final bytes,
  made after this document was committed, is recorded in the dispatch and not
  here.
- **`--max 200`.** The main runs carried `--max 1000`. The margin is the same
  690 s.
- **A real confirm.** No event went to the hosted scheduler and none could.
- **The not-production refusal of a real confirm.** The key refusal comes
  first, and no key was set.
- **The marker and the lock in the home folder.** Never written. Every marker
  and lock of this round lived beside the sink file.
- **Exactly 28 days ahead on the command line.** The nearest was 28 days minus
  86 ms. The exact boundary is from the pure function only.
- **The G3 read on production, and its timing there.** The local reads took
  under one second, which says nothing about the production table.
- **A soft-deleted patient, a second tenant's rows, and an unaccepted request
  found through a staff notification.** None was seeded.
- **A row that changes between the read and its send, a failed send, an
  attempted row, `--resend-attempted`, a lock left behind, a killed run and
  `OUT OF TIME`.** None was run in this round. The 2026-10-07 rehearsal covered
  the first five through `run()`.
- **A failing G3 read and a marker row that is not checkable.** Not produced on
  the command line.
- **The 12 minute wait before the closing dry run.** The whole round took
  about ten minutes, so its last dry runs did not wait.
- **The blocks of the dispatch on production, the dashboard checks of steps 2
  and 5, and the hosted scheduler's behaviour.**
- **The test file.** The rehearsal did not run it.

## QUESTION BLOCK for the owner and strategy

The three questions stand as they were asked on 2026-10-07. Strategy ruled on
all three on 2026-10-08, and each ruling is under its question.

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
- RULED 2026-10-08 (S-1008-A): GREEN, on a dispatch path. This is option (b).
  The recommendation above was (a), the owner. The owner still does steps 2
  and 5 himself, at the keyboard, in the sitting.

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
- RULED 2026-10-08 (S-1008-A): the first closed window with the owner at the
  keyboard: tonight before 08:00 Lisbon, or 2026-10-08 after 21:00 Lisbon.
  "Tonight" is the night of 2026-10-07 to 2026-10-08. This is option (b) in
  substance. The recommendation above said after 21:15 and the ruling says
  after 21:00.

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
- RULED 2026-10-08 (S-1008-A): every qualifying appointment starting within the
  next 28 days. Later ones wait: the ruling says "Later ones wait for Q3", in
  strategy's own numbering. This is option (a) with an upper bound the
  recommendation above did not have: `--max-days-ahead 28`.
