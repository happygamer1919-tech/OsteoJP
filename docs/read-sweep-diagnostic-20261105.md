NOT READY: awaiting R4 review

# SWEEP DIAGNOSTIC, 2026-11-05 (strategy's A1): the 11-03 heartbeats, the two heartbeats whose counts differ, and one shadow-only mark's history

**READ ONLY. One block. No apply, no write. Any hour.**
**Status: AUTHORED 2026-11-04 by SOLO's builder; NOT YET R4-REVIEWED; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below, on these same SQL bytes); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-sweep-diagnostic-20261105.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED").** The block's four value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit, `PRNUM` its number, `DOCSHA` this document's sha256 and `APPT_ID` the appointment id of the shadow-only mark, all named by SOLO. The appointment id is passed at run time and appears nowhere in the repository.

## The ruling

Strategy's A1, Wednesday 2026-11-04, verbatim:

> "One read-only diagnostic read: written and R4-reviewed Thursday, GREEN runs it Thursday or Friday (read-only, any hour). It covers, in counts, times and labels only:
> - every 11-03 heartbeat: start and end time, slot, pass id, and marks counted against rows written;
> - the two heartbeats whose counts differ;
> - the shadow-only mark's history: audit actions and times, every sleeping-job claim and run for that appointment, and whether a scheduling event was ever emitted for it.
> No patient fields."

## Why this read exists

The shadow compare of 2026-11-04 (`docs/read-shadow-compare-20261104.md`, #1691, head `3ec1d92a`) ran on production and STOPPED on four FAIL:

- verdict 3 on 2026-11-03: `tenants 1, of them complete 0; heartbeats 60 to 60; slots 59 to 59` (60 heartbeats, 60 distinct pass ids, 59 distinct 15-minute slots);
- verdict 8: `shadow rows 222; recorded 224; rows with no heartbeat 0; heartbeats with missing rows 0; counts that differ 2`;
- verdicts 11 (11-03, 48h email) and 13: one shadow-only mark with no label (row 50, `UNEXPLAINED`).

SOLO's hypothesis, unproven: one 11-03 pass started late past its slot boundary (so its heartbeat sits in the next slot), and the next pass re-selected marks the late one had written (the insert keeps one row, both heartbeats count it). This read can confirm or refute each half; it assumes neither.

## What the code says before any row is read

These are read from the code and the schema on `main` at `94e8fa68`; the read checks the first against production's catalog (row 25) and the rest against its rows.

1. **A re-selected mark cannot be "one row counted twice".** `reminder_claims` has no unique key over shadow rows: 0106 says so in words ("NO UNIQUE KEY OVER THE CLAIMS OF ONE REMINDER, only one over each ATTEMPT", `packages/db/migrations/0106_reminder_claims.sql`), and its only partial unique index on a mark is `reminder_claims_claim_attempt_key ... WHERE kind = 'claim'`. The sweep writes its rows with a plain insert and no conflict clause (`apps/web/lib/reminders/sweep.ts:551`, `tx.insert(reminderClaims).values(shadowRows)`), and the heartbeat's `recorded_count` is `shadowRows.length` of the same transaction (`sweep.ts:555` and `:569`). So in the transaction that writes them, a heartbeat's recorded count always equals its rows. A pass that re-selected a mark would leave a SECOND row for it, which the compare's verdict 9 ("no mark taken twice") would have failed on; production's verdict 9 did not fail. Finding F2 reads this directly.
2. **A heartbeat's count can differ LATER, when rows are deleted.** A shadow row goes with its appointment (`reminder_claims_appointment_id_fkey ... ON DELETE CASCADE`, 0106), and the hard delete (`apps/web/lib/scheduling/actions.ts:3454`, `hardDeleteAppointment`) deletes the appointment and writes the audit row `appointment.hard_delete` with the start it deleted (`actions.ts:3525` to `:3537`). The heartbeat (no foreign key to an appointment) keeps its count. Verdict 8's "heartbeats with missing rows 0" says each of the two heartbeats still has at least one row. Finding F3 reads this.
3. **A late pass is possible.** The function runs one at a time with no retries (`apps/web/lib/reminders/inngest/sweep.ts:54` to `:57`), and `pass_at` is the job's own clock, read at the start of each tenant's step (`sweep.ts:657`, `now: clock()`), not the cron's instant. A run that starts more than 15 minutes after its cron tick writes a heartbeat whose slot is the next one. Finding F1 reads this.

## What the heartbeat table holds, and what it does not

`reminder_sweep_passes` (0106) has exactly these columns: `id, tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at`. Row 1 prints the list as production has it.

- **Start:** `pass_at` is the pass's clock, read in the job before the tenant's transaction; `created_at` is the column default `now()`, the start of the tenant's transaction (every shadow row of the pass carries the same `created_at`, which is how the compare's verdict 8 ties rows to their heartbeat, and how this read does).
- **End: no column records when a pass ended.** The read prints the next heartbeat's transaction start beside each heartbeat, which bounds the end only when passes do not overlap. It also prints production's `track_commit_timestamp`; it reads no commit time.
- **Run creation:** `pass_id` is the scheduler's run id (`runId`, `apps/web/lib/reminders/inngest/sweep.ts:72`, and `:66` in send mode). When it reads as a ULID, its first 10 characters encode milliseconds, which the read decodes as "run created". **That this is the instant the scheduler created the run (the cron tick) is NOT VERIFIED** from the scheduler's documentation; the read prints whether each id decodes, and F1 reads UNDECIDED when any id of the day does not.

## What it reads

`scripts/db/read-sweep-diagnostic-20261105.sql`, sha256 `b18124df6bc12d5998d7b61077e398f3577b1aa0ab0f8539e8c69caa9570d846`. One result set, columns `n | check | observed | expected | verdict`, inside `begin read only` ... `rollback`.

**One value from outside.** The appointment id is read from the setting `osteojp.diag_appointment_id`, which the block sets with `set local` inside the read-only transaction from the dispatch's `APPT_ID` (a lower-case uuid, checked by the block's first line). The SQL names no appointment. Unset, the read stops with an error and prints no table (a test case proves it).

**What it prints:** counts; Lisbon times; a tenant's ordinal (`tenant 1`, never its id); pass ids; the fixed labels of offsets (`48h`, `24h`), channels, claim kinds and takers; ledger template ids, outcomes, reason codes and provider codes; audit actions and the clause names of `RE_ARMING_SAVES` (`apps/web/lib/reminders/reminder-population.ts:244`); staff role slugs; and appointment ids in rows 22 to 24 only, at most 100 each, where the appointment passed in reads `the appointment passed in`. **No patient field**, no name, phone, email address, note, message text, free text, provider message id or audit metadata beyond the action and the clause name. The one metadata value it reads into a printed row is a hard-deleted visit's start, as a time (rows 22 and 32). An actor is printed as `staff, role <slug>`, `staff, no role`, `not a staff user` or `no user`.

### The rows

| n | What | Verdict |
|---|---|---|
| 0 | the transaction is READ ONLY | OK, or FAIL |
| 1 | the heartbeat table's columns in order; `track_commit_timestamp`; the read's clock | INFO |
| 2 | heartbeats on 2026-11-03 (Lisbon, by `pass_at`): count, tenants, modes, distinct pass ids | OK; VACUOUS when there are none |
| 3 | one row per tenant: 60 heartbeats in the 60 slots 07:00 to 21:45; the slots doubled, missing and outside, by time; the heartbeats whose counts differ | OK, or REVIEW naming them |
| 10 | one row per 11-03 heartbeat, in order: `pass_at` and its seconds into its slot; the transaction start and its seconds after `pass_at`; the previous and next heartbeats' transaction starts; pass id; run created (decoded) and its slot; mode; look-ahead; due; recorded; shadow rows of its transaction; shadow rows naming its pass id; over the ceiling; left out. Expected column: its flags (`slot doubled (k of n)`, `slot outside 07:00 to 21:45`, `count differs`, `late: run created in slot HH:MI`, `pass id on n heartbeats`, `rows by pass id differ from rows by transaction`) or `none` | INFO |
| 20 | heartbeats from 2026-11-02 00:00 Lisbon to the read whose recorded count is not the number of shadow rows of their transaction (the compare's verdict 8 tie), with their slots and shortfalls | OK when none; REVIEW when any (the compare read 2); VACUOUS when there is no heartbeat |
| 21 | one row per such heartbeat: recorded, due, rows by transaction and by pass id, short by, times, pass id, its candidates of each kind | INFO |
| 22 | the marks such a heartbeat counted that no row of its holds, of the kind F3 reads: a mark of a hard-deleted visit, due first at that pass, the visit still ahead, deleted after the pass began; appointment id, offset, channel, start, mark, deleted at, and whether another heartbeat's row holds it | INFO |
| 23 | the marks such a heartbeat could have selected (due at it, the visit still ahead) that a row of the PREVIOUS or NEXT heartbeat of the tenant holds (the hypothesis's shape); appointment id, offset, channel, start, mark, which heartbeat and its slot, and how many rows that mark has | INFO |
| 24 | marks with more than one shadow row from 11-02 on, and their heartbeats' slots | INFO |
| 25 | the unique indexes on `reminder_claims` as production has them | INFO |
| 30 | **F1, a late pass** | CONFIRMED, REFUTED or UNDECIDED |
| 31 | **F2, a mark re-selected** | CONFIRMED or REFUTED |
| 32 | **F3, rows that went with a hard-deleted visit** | CONFIRMED, REFUTED, UNDECIDED or NO_SUBJECT |
| 33 | **F4, a scheduling event for the appointment passed in** | EVIDENCED, DOOR_ONLY or NO_EVIDENCE |
| 40 | the appointment passed in: its row now (status, start, origin, created, updated, its two marks now) or `no row` with its hard-delete audit rows; its audit, claim store and ledger row counts | OK; VACUOUS when the id names nothing at all |
| 41 | each of its audit rows, in order: action, written at, actor kind or role, the `RE_ARMING_SAVES` clause (or `none (re-arms nothing)`), whether it is a scheduling save (`hasSchedulingEvent`) | INFO |
| 42 | each of its claim store rows, in order: kind, taker, offset, channel, written, start, mark; a claim's early, attempt and whether it was released; a release's claim; a shadow row's minutes after its mark, saved after mark, and its heartbeat's slot | INFO |
| 43 | each of its ledger rows, in order: template id, written, channel, outcome, reason, provider status, provider error code, status at | INFO |

### The findings

| Finding | CONFIRMED when | REFUTED when | otherwise |
|---|---|---|---|
| 30 F1 a late pass | an 11-03 heartbeat is late (its run's slot, decoded from the pass id, is before its own slot), sits in a doubled slot or outside 07:00 to 21:45, and its run's slot has no heartbeat of the tenant | every 11-03 heartbeat's pass id decodes and none is late | UNDECIDED (an id that does not decode, or a late pass whose run's slot still has a heartbeat) |
| 31 F2 a mark re-selected | a mark (appointment, offset, channel, start) has two or more shadow rows from 11-02 on | no mark has | |
| 32 F3 rows gone with a hard-deleted visit | every heartbeat whose count differs is short (never over) by exactly its row 22 candidates | none of them has a candidate | UNDECIDED (some do, or the numbers differ); NO_SUBJECT when no heartbeat's count differs |
| 33 F4 a scheduling event | EVIDENCED: a confirmation in the ledger (`confirmation.*` or `booking_approved.email`, written only by `send-appointment-confirmation`, `apps/web/lib/reminders/inngest/functions.ts:293` to `:306`, which runs on `appointment/scheduled`) or a claim of taker `run` (written only by `send-appointment-reminder`, `functions.ts:186` to `:220`, which runs on the reminder event `schedule-appointment-reminders` fans out from `appointment/scheduled`, `functions.ts:150` to `:183`) | | DOOR_ONLY: a door's audit row (`RE_ARMING_SAVES`) and nothing the scheduler wrote; NO_EVIDENCE: neither |

**F1, F2 and F3 together answer the hypothesis.** SOLO's hypothesis reads F1 CONFIRMED and, for its second half, F2 CONFIRMED (the schema can only record a re-selection as a second row) or row 23 naming marks held by the previous heartbeat with no second row (which no code path on `main` can produce). The alternative read from the code reads F3 CONFIRMED. F1 and F3 can both hold: they explain verdict 3 and verdict 8 separately.

### Whether a scheduling event was ever emitted: what the database can say

**No table records the send of `appointment/scheduled`.** The application sends it after the save's transaction has committed (`apps/web/lib/reminders/index.ts:69`, `inngest.send` in `enqueueAppointmentReminders`), called only by `enqueueRemindersAfterCommit` (`apps/web/lib/scheduling/reminders.ts:117`); a failed send is caught and only logged, `scheduling: reminder enqueue failed` (`reminders.ts:150` to `:155`), and no outbox exists. So the database holds three kinds of evidence, and F4 and row 33 count each:

- **a door's audit row** (`RE_ARMING_SAVES`, `reminder-population.ts:244`): a save that emits on commit. It says a send was ATTEMPTED, not that it reached the scheduler;
- **a confirmation in the ledger**: proves the scheduler received a confirmation-eligible `appointment/scheduled` for the appointment (not which one, and not every event is eligible);
- **a claim of taker `run`**: proves the sleeping reminder job woke for some start, so some `appointment/scheduled` for the appointment was received and fanned out. Row 33 counts those for its start now and for the marks its shadow rows hold.

Two senders outside the application send the event and write no audit row (`packages/db/scripts/inc-1007-rearm-reminders-emit.mjs` and `obs-05-backfill-emit.mjs`, named in `reminder-population.ts`); the database cannot see them. **So for the shadow-only mark itself (its start and its 48h mark), which events the scheduler received and which runs it made or cancelled is the owner's look in the scheduler's dashboard, below.**

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A malformed table (a FAIL, a VACUOUS, a REVIEW outside rows 3 and 20, a verdict row missing, doubled or extra, or a finding missing, doubled or not one of its words) stops the block after the table has been written: GREEN reports the lines as printed, and never opens the file.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-sweep-diagnostic-20261105.sql`, sha256 `b18124df6bc12d5998d7b61077e398f3577b1aa0ab0f8539e8c69caa9570d846` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes #1691 pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-sweep-diagnostic-20261105.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD` and its number in `PRNUM`; the block fetches `refs/pull/${PRNUM}/head` and refuses any other sha |
| The appointment | the dispatch names it in `APPT_ID`, a lower-case uuid; the block refuses any other form |

**Why the pull request's head and not `main`.** As with #1691: the pull request need not be merged before GREEN runs it, and GitHub keeps `refs/pull/N/head` after a branch is deleted.

## When

Thursday 2026-11-05 or Friday 2026-11-06, once the dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs. It is read only, so neither clinic hours nor a clock bound apply: the block reads and prints the Lisbon clock (`TZ=Europe/Lisbon`, zone WET or WEST) and checks nothing against it. A later run reads more heartbeats in rows 20 and 21 (every heartbeat from 11-02 to the read); the 11-03 rows do not change.

## Where the output goes

To `/Users/ivan/osteojp-handover/sweep-diagnostic-20261105.out` and nowhere else: it holds appointment ids and pass ids, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). The block prints only the Lisbon clock, the pins it checked, the target guard's lines, the verdict counts, rows 2, 3 and 20 (counts and times only), the four finding words and its closing line. **GREEN never opens that file**; GREEN reports the printed lines and the file's path; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
APPT_ID=PENDING
SHAREAD=b18124df6bc12d5998d7b61077e398f3577b1aa0ab0f8539e8c69caa9570d846
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-sweep-diagnostic-20261105.sql
DOC=docs/read-sweep-diagnostic-20261105.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/sweep-diagnostic-20261105.out
echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${APPT_ID}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]* [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "STOP: the head commit, the document's sha256, the pull request number or the appointment id still reads PENDING or is not in its form, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock reads [${NOW}], not a time. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ -d "${OUTDIR}" ] || { echo "STOP: the handover folder is not there. Nothing was read"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
DIRTY=$(git status --porcelain) || { echo "STOP: the worktree's status could not be read. Nothing was read"; exit 1; }
[ -z "${DIRTY}" ] || { echo "STOP: the apply worktree is not clean. Nothing was read"; exit 1; }
git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request's head could not be fetched. Nothing was read"; exit 1; }
FH=$(git rev-parse FETCH_HEAD) || { echo "STOP: the fetched head could not be read. Nothing was read"; exit 1; }
[ "${FH}" = "${PRHEAD}" ] || { echo "STOP: the pull request's head is [${FH}], not the commit the dispatch names. Nothing was read"; exit 1; }
git checkout --quiet --detach ${PRHEAD} || { echo "STOP: the head commit could not be checked out. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${PRHEAD}" ] || { echo "STOP: the worktree is not on the head commit [${HD}]. Nothing was read"; exit 1; }
echo "checked out: ${HD}"
D=$(shasum -a 256 ${DOC} | cut -d' ' -f1) || { echo "STOP: this document could not be hashed. Nothing was read"; exit 1; }
echo "document:    ${D}"
[ "${D}" = "${DOCSHA}" ] || { echo "STOP: this document is not the one the dispatch names. Nothing was read"; exit 1; }
shasum -a 256 -c docs/read-sweep-diagnostic-20261105.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
R=$(shasum -a 256 ${READFILE} | cut -d' ' -f1) || { echo "STOP: the read could not be hashed. Nothing was read"; exit 1; }
echo "read:        ${R}"
[ "${R}" = "${SHAREAD}" ] || { echo "STOP: the read on disk is not the reviewed file. Nothing was read"; exit 1; }
G=$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
echo "guard:       ${G}"
[ "${G}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
M=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
echo "module:      ${M}"
[ "${M}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }
unset DATABASE_URL || { echo "STOP: DATABASE_URL could not be unset. Nothing was read"; exit 1; }
unset DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL_DIRECT could not be unset. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was read"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was read"; exit 1; }
rm -f ${OUT} || { echo "STOP: the old transcript could not be removed. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp.diag_appointment_id = '${APPT_ID}'" -c "select 'read only: ' || current_setting('transaction_read_only') as sweep_diagnostic_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; if (v == "FAIL" || v == "VACUOUS") bad++; if (v == "REVIEW" && n != "3" && n != "20") bad++; if (n != "0" && n != "2" && n != "3" && n != "20" && n != "40") bad++ } END { if (c["0"] != 1 || c["2"] != 1 || c["20"] != 1 || c["40"] != 1 || c["3"] < 1 || bad > 0) print "STOP"; else print "GOOD" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "GOOD" ] || { echo "STOP: the read has a FAIL, a VACUOUS, a REVIEW outside rows 3 and 20, or a verdict row missing, doubled or extra. The table is in ${OUT}; GREEN does not open it. SOLO reads it"; exit 1; }
ROWS=$(grep -E '^[[:space:]]*(2|3|20)[[:space:]]*[|]' ${OUT}) || { echo "STOP: rows 2, 3 and 20 could not be read. The table is in ${OUT}"; exit 1; }
echo "${ROWS}"
FND=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (n == "30" || n == "31" || n == "32" || n == "33") { c[n]++; w[n] = v } } END { if (c["30"] != 1 || c["31"] != 1 || c["32"] != 1 || c["33"] != 1) printf "MISSING"; else printf "F1 %s F2 %s F3 %s F4 %s", w["30"], w["31"], w["32"], w["33"] }' ${OUT}) || { echo "STOP: the findings could not be read. The table is in ${OUT}"; exit 1; }
echo "${FND}" | grep -qxE 'F1 (CONFIRMED|REFUTED|UNDECIDED) F2 (CONFIRMED|REFUTED) F3 (CONFIRMED|REFUTED|UNDECIDED|NO_SUBJECT) F4 (EVIDENCED|DOOR_ONLY|NO_EVIDENCE)' || { echo "STOP: the findings (rows 30 to 33) are missing, doubled or not one of their words. The table is in ${OUT}; GREEN does not open it. SOLO reads it"; exit 1; }
echo "findings: ${FND}"
echo "SWEEP-DIAGNOSTIC-1105 READ: ${CNT}; findings ${FND}. The table is in ${OUT}; GREEN does not open it. SOLO reads it"
)
```

**EXPECT:** `lisbon now:  <yyyymmddhhmm> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-sweep-diagnostic-20261105.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines; `verdicts: <o> OK / <r> REVIEW / 0 VACUOUS / 0 FAIL` (r at most 2 with one tenant: rows 3 and 20, the expected outcome); row 2, row 3 (one per tenant) and row 20, printed whole; `findings: F1 <w> F2 <w> F3 <w> F4 <w>`; then `SWEEP-DIAGNOSTIC-1105 READ: ...`. Exit 0. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/sweep-diagnostic-20261105.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD`. The finding words decide nothing; SOLO reads the file and reports to strategy.

**Why the two `unset` lines.** A URL already in GREEN's shell (a profile that exports one) must never reach the guard or psql. Both are unset before the credential file is loaded, each with its own halt, so an environment file without `DATABASE_URL_DIRECT` leaves it empty and the guard refuses, rather than a URL from elsewhere going through. The fault-injection test proves both arms.

**STOP:** any `STOP:` line. The likely ones: `NOT READY` (the dispatch was not filled in); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO writes a new dispatch); `the read has a FAIL, a VACUOUS ...` (row 2 VACUOUS: no heartbeat of 11-03, so not the production database; row 40 VACUOUS: the appointment id names nothing, so the dispatch's id is wrong; the table is in the file: report the printed lines and the path).

## The owner's look in the scheduler's dashboard (read only, presses nothing)

The database cannot say which `appointment/scheduled` events the scheduler received for the appointment, nor which reminder runs it made, ran or cancelled (see F4). That is a look in the Inngest dashboard, by the owner, after GREEN's read has reported. **Press nothing. Never Replay, never Rerun, never Cancel, never Resync.** A replayed reminder event can send a patient a second reminder (`functions.ts`, "NEVER REPLAY").

**When:** Thursday 2026-11-05, 08:00 to 18:00 Toronto (13:00 to 23:00 Lisbon), or the same hours on Friday 2026-11-06. Earlier is better: the scheduler keeps run history for a limited time on the clinic's plan (how long is not measured here), and the event that planned the 11-03 mark may have been sent days before it.

1. Inngest dashboard, the production environment, app `osteojp-reminders`.
2. **Events.** Search `event.data.appointmentId == "<APPT_ID>"`, with the appointment id SOLO gives you privately in place of `<APPT_ID>`. Write down, for each event: its name (`appointment/scheduled`, `appointment/reminder.due`, or another) and its time. For an `appointment/scheduled`, also its `startsAt` (a time, nothing else from the payload).
3. **Functions, `schedule-appointment-reminders`, Runs.** For each run of that appointment: its status (Completed, Failed, Cancelled) and its start time, and what it returned (`scheduled: <n>`).
4. **Functions, `send-appointment-reminder`, Runs.** For each run of that appointment: its status (Running or sleeping, Completed, Cancelled, Failed), its start time, and its `offsetId`, `channel` and `sendAt` (three labels and a time). The question it answers: was there ever a run for `48h`, `email`, with `sendAt` equal to the shadow-only mark's time, and if so, did it end Cancelled (by a later `appointment/scheduled`) or never exist.
5. Send the notes to SOLO privately. They hold an appointment id and times, no name, phone or email: do not post them anywhere public.

## Rehearsal (2026-11-04, throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database (the local stack `OsteoJP-blue`, database on 127.0.0.1:54622, migrated to `0108`) with `pg_dump --schema-only`, into a throwaway database per case, made from one base. Two synthetic tenants (the second heartbeating with nothing due); one synthetic staff user with the role `reception` (no real person); nine synthetic visits whose marks fall on Monday 11-02 and Tuesday 11-03, and the subject (a synthetic visit starting Thursday 11-05 10:00): booked on 10-26, moved at 11-03 09:30 from 09:00 to 10:00, confirmed by hand at 11:00 (a status-only save); the sleeping job claimed and sent the old start's 48h mark, claimed and released the old start's 24h reminder at the move, and sent the move's confirmation; no claim of the new start's 48h mark, so its shadow row is alone (the production shape of row 50). A shadow heartbeat every 15 minutes, 07:00 to 21:45, Monday 07:00 to Wednesday 07:45, pass ids ULIDs stamped 0.5 s after the slot, pass clock 2 s after it, transaction start 150 ms after that; for every mark in the window a sleeping-job claim (mark + 2 s), a `sent` ledger row (mark + 3 s), and a shadow row in the transaction of the first heartbeat whose pass clock is at or after it; each heartbeat's counts equal its rows unless the case says otherwise. Three appointment foreign keys (patient, practitioner, location) are dropped in the throwaway so no synthetic person or clinic is made; the read reads none of those tables. The read ran exactly as the block runs it (`begin read only`, 120 seconds, `set local osteojp.diag_appointment_id`, `rollback`), with NO substitution: it has no clock line to replace. The test runs these cases whenever `SWEEP_DIAG_1105_TEST_PGURL` names a local database, and refuses any other host; the throwaways are dropped by the test. Each case also asserts that the subject's id, the tenant, user and role ids, the user's synthetic name and email, and a metadata marker (`MUST-NOT-PRINT`) never appear in the output.

**Run of 2026-11-04 (lane blue, brought up for this run and down after it), on these SQL bytes: the appointment id unset, the empty schema, then 25 cases, the test's database part 1 of 1 passing. Mutation sweep of the read's own predicates: 10 mutants, 10 killed (the MUTANT rows).** Every case below met its expectation exactly (the test compares every verdict and finding, and the named rows); each MUTANT is asserted not to meet its unmutated case's expectation (the neighbour mutant: not to print its row 23).

- The appointment id unset: the read stops with `unrecognized configuration parameter "osteojp.diag_appointment_id"` and prints no table.
- The empty schema (every column and join resolves): rows 2, 20 and 40 VACUOUS, F1 UNDECIDED, F2 REFUTED, F3 NO_SUBJECT, F4 NO_EVIDENCE.

| Case | Verdicts and findings (rows not OK, and every finding) |
|---|---|
| CONTROL: nothing late, every count equal, the subject's mark shadow only | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| SOLO's hypothesis: the 10:00 pass late into 10:15 (10:00 missing), the 10:15 pass counting the late pass's two marks with no row of its own | 3:1=REVIEW, 20=REVIEW, 30=CONFIRMED, 31=REFUTED, 32=REFUTED, 33=EVIDENCED |
| a mark re-selected as the schema records it: the late pass and the 10:15 pass each wrote a row for the 10:05 and 10:10 marks | 3:1=REVIEW, 30=CONFIRMED, 31=CONFIRMED, 32=NO_SUBJECT, 33=EVIDENCED |
| rows that went with two hard-deleted visits: the 12:15 and 16:30 passes each short by one, nothing late | 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=CONFIRMED, 33=EVIDENCED |
| the production picture: the 10:00 pass late into 10:15 AND two hard-deleted visits | 3:1=REVIEW, 20=REVIEW, 30=CONFIRMED, 31=REFUTED, 32=CONFIRMED, 33=EVIDENCED |
| a heartbeat short by 2 with one hard-deleted candidate, and a visit deleted before its pass: UNDECIDED | 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=UNDECIDED, 33=EVIDENCED |
| the 21:45 pass of 11-03 late past 22:00: 21:45 missing, a slot outside | 3:1=REVIEW, 30=CONFIRMED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| a late pass whose run's slot still has a heartbeat (an extra run at 10:05): F1 cannot decide | 3:1=REVIEW, 30=UNDECIDED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| a pass of 11-03 failed (no heartbeat at 13:00): a missing slot, nothing late | 3:1=REVIEW, 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| pass ids that are not ULIDs: F1 cannot decide | 30=UNDECIDED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| the subject's door rows only (no claim, no confirmation): DOOR_ONLY | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=DOOR_ONLY |
| the subject hard-deleted: no row, its audit rows remain | 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=UNDECIDED, 33=DOOR_ONLY |
| an id that names nothing: row 40 VACUOUS | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=NO_EVIDENCE, 40=VACUOUS |
| no heartbeat at all: rows 2 and 20 VACUOUS, no row 3 | 2=VACUOUS, 20=VACUOUS, 30=UNDECIDED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: the late flag reversed, on "SOLO's hypothesis" | 3:1=REVIEW, 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=REFUTED, 33=EVIDENCED |
| MUTANT: F1 confirms a late pass without a missing run slot, on "a late pass whose run's slot still has a heartbeat" | 3:1=REVIEW, 30=CONFIRMED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: F1 without the outside arm, on "the 21:45 pass of 11-03 late past 22:00" | 3:1=REVIEW, 30=UNDECIDED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: F1 refutes with an undecoded pass id, on "pass ids that are not ULIDs" | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: F3 matches any shortfall, on "a heartbeat short by 2 with one hard-deleted candidate" | 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=CONFIRMED, 33=EVIDENCED |
| MUTANT: a candidate deleted before the pass counts, on "a heartbeat short by 2 with one hard-deleted candidate" | 20=REVIEW, 30=REFUTED, 31=REFUTED, 32=CONFIRMED, 33=EVIDENCED |
| MUTANT: F2 counts single rows, on "CONTROL" | 30=REFUTED, 31=CONFIRMED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: F4 evidenced by a door alone, on "the subject's door rows only" | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: row 40 never VACUOUS, on "an id that names nothing" | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=NO_EVIDENCE |
| MUTANT: row 3 blind to a missing slot, on "a pass of 11-03 failed" | 30=REFUTED, 31=REFUTED, 32=NO_SUBJECT, 33=EVIDENCED |
| MUTANT: neighbours: the next heartbeat only, on "SOLO's hypothesis" | 3:1=REVIEW, 20=REVIEW, 30=CONFIRMED, 31=REFUTED, 32=REFUTED, 33=EVIDENCED |

**What the hypothesis case printed** (synthetic ids): row 3 `heartbeats 60 (shadow 60), pass ids 60, slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 1`, REVIEW; row 10 for the late pass `pass_at 10:16:30.000 (90.0 s into its slot) ... run created 10:00:00.500 (slot 10:00) ... due 3, recorded 3, shadow rows of its transaction 3`, flags `slot doubled (1 of 2), late: run created in slot 10:00`; row 10 for the next pass `pass_at 10:17:10.000 ... run created 10:15:00.500 (slot 10:15) ... due 3, recorded 3, shadow rows of its transaction 1`, flags `slot doubled (2 of 2), count differs`; row 20 `counts that differ 1; rows short in all 2 ... at 2026-11-03 10:15 tenant 1 short 2`; row 23, three marks held by the previous heartbeat (the subject's, read as `the appointment passed in`, and the 10:05 and 10:10 marks), each with one row; F1 CONFIRMED, F2 REFUTED, F3 REFUTED. **The control** (nothing late, every count equal): both rows 3 OK, row 20 OK, all 120 rows 10 read `flags: none`, F1 REFUTED, F2 REFUTED, F3 NO_SUBJECT, F4 EVIDENCED, and rows 40 to 43 print the subject's trail as seeded (three audit rows with `staff, role reception` and `no user`, clauses `booked`, `moved` and `none (re-arms nothing)`; five claim store rows, the released one read `released yes`; two ledger rows).

## Known limits

- **No end time.** The table records no pass end; the next heartbeat's transaction start bounds it only when passes do not overlap (row 10).
- **The run's creation time is an inference.** It decodes a ULID's time; that the scheduler's run id is a ULID stamped at the cron tick is NOT VERIFIED from its documentation. F1 reads UNDECIDED when any pass id of 11-03 does not decode.
- **F3's candidates are candidates.** A hard-deleted visit's row is gone, so its other selection predicates at the pass (its status, a scheduling save, created before its mark) cannot be read; and the delete's audit row carries the start at the delete, so a visit moved between the pass and its delete is placed at the wrong mark (the subject-deleted rehearsal case shows the UNDECIDED this gives). A visit whose `starts_at` changed with no audit row (`rescheduleOwn`, the importer; `reminder-population.ts`, "THE GAP THAT REMAINS") is placed by the delete's start alone.
- **A hard delete's start is cast to a time.** It is checked against `toISOString()`'s shape first (month 01 to 12, day 01 to 31, hour 00 to 23); a row that passes that shape and is still not a date (a 30 February) stops the read with an error and no table, and the block STOPs. The application writes it with `toISOString()`.
- **Row 23 is wide by design.** Every mark the previous heartbeat wrote is, by the sweep's own predicates, one the next pass must NOT select (it is taken); row 23 lists them so the hypothesis's shape can be read. A mark listed there is not evidence of a re-selection on its own; F2 and row 24 are.
- **Inngest is not read.** Which events and runs the scheduler holds is the owner's look above.
- **Run time not measured on production.** Its reads are bounded by 11-02 onward (heartbeats, shadow rows, hard deletes) and by one appointment; 120 seconds is the bound.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the block's production path is NOT REHEARSED: the environment file, the target guard against the real target (it refuses 127.0.0.1, and that refusal was not got past), the connection and the psql call through the block, and `git fetch origin refs/pull/${PRNUM}/head` against GitHub in the real apply checkout. What stands in for it: the SQL run above with exactly the block's psql arguments (the appointment setting included) and no substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub (psql's stub refuses a call that does not set the appointment id the dispatch names), fails each call in turn, and proves every halt is explicit, that a URL already in the shell never reaches the guard, and that the closing line prints only on a well-formed table, with no id on the terminal.

The owner's dashboard look is NOT REHEARSED (it is a look, and it presses nothing).
