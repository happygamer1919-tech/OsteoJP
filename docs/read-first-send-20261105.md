# FIRST-SEND, 2026-11-05 (R47, R36): the reminder sweep's first sending passes

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-11-02 by SOLO's builder; NOT YET REVIEWED (R4); THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-first-send-20261105.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production).** The block's four value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit, `PRNUM` its number, and `SWITCHED_AT` the owner's redeploy with the two switches on, all named by SOLO.

## Why this read exists

Strategy's report asks for "the switch confirmation and Thursday morning's first send passes (counts only: sent by the sweep, sent by the live job, double sends, which must be 0)". R36 requires zero sweep-sent S5 rows. This read answers both, for everything since `SWITCHED_AT`. It decides nothing, and it writes nothing.

## What it reads

`scripts/db/read-first-send-20261105.sql`, sha256 `7cc0afa85beb0b46999ff8b3cf3870f0e1b4557dd2b819e38cabc55bb3c0c692`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times and fixed labels, and, in rows 50 to 54 only (at most 500 a list, in the file only), appointment ids, as the 2026-11-04 read does in its mismatch list. No tenant id, patient id or staff id, no name, phone, email address, message text or note, and no audit metadata text.

**One value from outside.** `SWITCHED_AT` is read from the setting `osteojp.r47_switched_at`, which the block sets with `set local` inside the read-only transaction (UTC, `YYYY-MM-DDTHH:MM:SSZ`, 11-04 or 11-05, checked by the block's first line). Unset, the read stops with an error and prints no table.

## The model, read from the send code

- **The pass** (`sweep-send.ts`, `sweepTenantSending`): it reads its clock once and selects (`pass_at`), hands each mark over in a step of its own (the claim's `created_at`), and writes its heartbeat **after its marks**. The heartbeat has no column for what became of a mark; too late and held are read from the ledger, by slot.
- **The selecting pass of a claim** is therefore the send heartbeat written first at or after the claim whose `pass_at` is at or before the claim. "The last heartbeat at or before the claim" is the pass before: that was the error recorded in the limits of the 2026-11-04 read, fixed here. **Saves are read up to the selecting pass's `pass_at`**, what the gate could read, not up to the claim: the other half of that error. A save between the selection and the send is printed (row 36), not judged. A sweep-sent row with no such heartbeat (its pass still running, or its heartbeat lost) cannot be judged and reads REVIEW.
- **The floor** (`readSweepFloor`): the first send heartbeat of the spell. That first pass sends nothing, and a mark due before the floor stays with the sleeping job.
- **The sleeping job** (`inngest/backstop.ts`): while the sweep sends, a job that wakes at its mark waits 20 minutes, then asks the dispatcher, and sends only if nothing holds the claim. So `run` on a mark before the floor is by design; on a mark at or after it, it is a reminder the sweep missed.
- **The closed claim** (`reminder-claim.ts`): a live claim blocks at any age, a claim that cannot be written stops the send, and a sender gives its claim up (a release) when it handed nothing over.
- **The ledger has no start and no taker.** A row is tied to its sender by the latest claim of its appointment, offset and channel at or before it (`led`), and takes that claim's start and taker. A `sent` row with no claim has neither.
- **The late rule** (`dispatch.ts`): the dispatcher judges on its own clock after the claim, 3 hours for an SMS and 12 for an email, and records `mark_missed`. The ledger row follows the provider's answer, so verdict 8 allows one minute.
- **The re-arming saves**: `RE_ARMING_SAVES` and `hasReArmingSaveAfter` as SQL, copied from the 2026-11-04 read. The test holds the mirrored code to its bytes.
- **The second switch** on: `excluded_count` stays 0 at every pass. With it off, a pass counts the visits it left out.

## THE VERDICTS, AND WHAT EACH EXPECTS

Twelve rows, one each. A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first.

**The closing line.** Verdict 5 or 10 at FAIL: `STOP: UNDO NOW: the owner follows the undo section of owner-switch-steps-1104.md`, then SOLO reports; this outranks every other result. Any other FAIL, any VACUOUS, a REVIEW outside 4, 6, 7, 10 and 11, or a verdict missing or extra: STOP, no undo by that line, SOLO reports to strategy. Otherwise `FIRST-SEND-1105 CLEAN` (all OK) or `FIRST-SEND-1105 REVIEW` (the expected possibilities are named below): SOLO reports to strategy.

| n | Verdict | EXPECT (OK) | VACUOUS / REVIEW when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the clock: at or after 2026-11-05 09:15 Lisbon | the database clock is at or after it | never | earlier |
| 2 | the switch | a send heartbeat since `SWITCHED_AT`, none of another mode | VACUOUS: no send heartbeat | a shadow heartbeat since the switch |
| 3 | passes | every tenant has a send heartbeat in every slot, 07:00 to 21:45, from the switch to 5 minutes before the read | VACUOUS: no slot expected or no tenant | any gap |
| 4 | something was sent since 07:00, by the sweep | both above 0 | VACUOUS: no send at all. REVIEW: only the job sent | never |
| 5 | **DOUBLE SENDS, MUST BE 0**: one appointment, offset, channel and start with two `sent` rows (one since the switch), or two live claims of different takers each followed by a send of its own | 0; 0 | VACUOUS: no sent row since the switch | **any: UNDO NOW** |
| 6 | the sleeping job sent no mark due since the floor | 0 (before the floor: printed) | VACUOUS: no sent row. REVIEW: any; rows 53 | never |
| 7 | every mark due since the floor, covered by a finished pass, of a visit created before it and remindable now, has a send or a recorded reason, or R24 keeps it out | 0 missed, 0 claims with nothing after them | VACUOUS: no such mark. REVIEW: any; rows 31 and 51 | never |
| 8 | the late limit: no `sent` row later than its channel's limit after its mark, one minute allowed | 0 | VACUOUS: no sent row | any |
| 9 | the second switch reads on | no send heartbeat left a visit out; never-reminded visits taken printed, and also in row 35 | VACUOUS: no send heartbeat | any left out |
| 10 | **R34, no sweep-sent S5** | a sweep-sent row after a re-arming save (read up to its selecting pass) carries R34's label: its mark handed over before the first such save, by a claim not its own, and its selecting pass at most 3 hours after the mark | VACUOUS: no sweep-sent row. REVIEW: a row with no selecting pass yet (re-run after the next pass) | **any sweep-sent S5: UNDO NOW** |
| 11 | every `sent` row since the switch has a claim before it | 0 | VACUOUS: no sent row. REVIEW: any; rows 54 | never |

**Expected on Thursday after 09:15:** CLEAN, or REVIEW on 7 for a reminder the sweep's model and this read's disagree on. A morning with no sweep-sent row reads VACUOUS on 10 and STOPs; on a working Thursday that is itself the news.

**The INFO rows (never counted):**

| n | What |
|---|---|
| 20 | `SWITCHED_AT`, the floor, the last send heartbeat, the read's clock |
| 21 | per slot and mode: heartbeats, due, marks taken, left out, over the ceiling, and the ledger in that slot: sent, too late (`mark_missed`, `start_passed`), held |
| 30 | handed to the provider since the switch, by taker, offset and channel |
| 31 | what became of each mark since the floor, by offset and channel |
| 32 | not handed over since the switch, by offset, channel, outcome and reason |
| 33 | one reminder sent for two starts (a re-plan may legitimately send for a new start) |
| 34 | two live claims of different takers on one start, without two sends |
| 35 | never-reminded visits taken: claims; sent; sent later than their mark |
| 36 | sweep-sent rows with a re-arming save between the selection and the send |
| 40 | `FIRST_SEND_SUMMARY`: `sent_by_sweep`, `sent_by_job`, `sent_no_claim`, `double_sends`, `sweep_sent_s5`, `missed`. The block prints this line |
| 50 to 54 | the list, in the file only: 50 double sends, 51 missed or a claim with nothing after it, 52 sweep-sent S5, 53 the job on a mark since the floor, 54 sent with no claim |

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production.** GREEN never opens the file. On `UNDO NOW`, GREEN reports that line at once; the undo is the owner's.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-first-send-20261105.sql`, sha256 `7cc0afa85beb0b46999ff8b3cf3870f0e1b4557dd2b819e38cabc55bb3c0c692` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-first-send-20261105.sha256` pins it |
| The commit | the dispatch names `PRHEAD` and `PRNUM`; the block fetches `refs/pull/${PRNUM}/head` and refuses any other sha |
| The switch | the dispatch names it in `SWITCHED_AT` |

## When

At or after Thursday 2026-11-05 09:15 Lisbon, once the dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it. It may be re-run later: every count runs to the read's clock.

## Where the output goes

To `/Users/ivan/osteojp-handover/first-send-20261105.out` and nowhere else: it holds appointment ids. **GREEN never opens that file.** The block prints the verdict counts and the `FIRST_SEND_SUMMARY` line, counts only.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
SWITCHED_AT=PENDING
SHAREAD=7cc0afa85beb0b46999ff8b3cf3870f0e1b4557dd2b819e38cabc55bb3c0c692
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-first-send-20261105.sql
DOC=docs/read-first-send-20261105.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/first-send-20261105.out
echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${SWITCHED_AT}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]* 2026-11-0[45]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' || { echo "STOP: the head commit, the document's sha256, the pull request number or the switch time still reads PENDING or is not in its form, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ "${NOW}" -ge 202611050915 ] || { echo "STOP: it is earlier than 2026-11-05 09:15 Lisbon. Nothing was read"; exit 1; }
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
shasum -a 256 -c docs/read-first-send-20261105.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
R=$(shasum -a 256 ${READFILE} | cut -d' ' -f1) || { echo "STOP: the read could not be hashed. Nothing was read"; exit 1; }
echo "read:        ${R}"
[ "${R}" = "${SHAREAD}" ] || { echo "STOP: the read on disk is not the reviewed file. Nothing was read"; exit 1; }
G=$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
echo "guard:       ${G}"
[ "${G}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
M=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
echo "module:      ${M}"
[ "${M}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was read"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was read"; exit 1; }
rm -f ${OUT} || { echo "STOP: the old transcript could not be removed. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp.r47_switched_at = '${SWITCHED_AT}'" -c "select 'read only: ' || current_setting('transaction_read_only') as first_send_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "FAIL") { if (n == "5" || n == "10") u++; else f++ } else if (v == "VACUOUS") a++; else if (v == "REVIEW") { if (n == "4" || n == "6" || n == "7" || n == "10" || n == "11") w++; else x++ } } END { s = 1; split("0 1 2 3 4 5 6 7 8 9 10 11", one, " "); for (i in one) if (c[one[i]] != 1) s = 0; if (t != 12) s = 0; if (u > 0) print "UNDO"; else if (f + a + x > 0 || s == 0) print "STOP"; else if (w > 0) print "REVIEW"; else print "CLEAN" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}. No undo by this line: SOLO reports to strategy"; exit 1; }
[ "${RES}" != "UNDO" ] || { echo "STOP: UNDO NOW: the owner follows the undo section of owner-switch-steps-1104.md. A double send or a sweep-sent S5 is in the table, in ${OUT}; GREEN does not open it. Then SOLO reports to strategy"; exit 1; }
[ "${RES}" = "CLEAN" ] || [ "${RES}" = "REVIEW" ] || { echo "STOP: the read has a FAIL, a VACUOUS verdict, a REVIEW outside verdicts 4, 6, 7, 10 and 11, or a verdict missing, doubled or extra, and no double send and no sweep-sent S5. The table is in ${OUT}; GREEN does not open it. No undo by this line: SOLO reports to strategy"; exit 1; }
SUM=$(grep -E '^[[:space:]]*40[[:space:]]*[|][[:space:]]*FIRST_SEND_SUMMARY[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no FIRST_SEND_SUMMARY row. The table is in ${OUT}. No undo by this line: SOLO reports to strategy"; exit 1; }
echo "${SUM}"
[ "${RES}" != "CLEAN" ] || echo "FIRST-SEND-1105 CLEAN: ${CNT%% / 0 REVIEW*}; no double send, no sweep-sent S5, every pass seen. The whole table is in ${OUT}; GREEN does not open it. SOLO reports to strategy"
[ "${RES}" != "REVIEW" ] || echo "FIRST-SEND-1105 REVIEW: no double send, no sweep-sent S5, every pass seen; verdicts 4, 6, 7, 10 or 11 read REVIEW. The table is in ${OUT}; GREEN does not open it. SOLO reads rows 30, 31, 51, 53 and 54 and reports to strategy"
)
```

**EXPECT:** `lisbon now:  <a time at or after 202611050915> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-first-send-20261105.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: <o> OK / <r> REVIEW / 0 VACUOUS / 0 FAIL`; the `FIRST_SEND_SUMMARY` line; then `FIRST-SEND-1105 CLEAN: ...` or `FIRST-SEND-1105 REVIEW: ...`. Exit 0. **REPORT THESE LINES AND THE FILE'S PATH.**

**STOP:** any `STOP:` line. `UNDO NOW` is reported at once. The apply worktree is left detached at `PRHEAD`.

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly, with the dispatch's SWITCHED_AT between the quotes: `set transaction read only; set local statement_timeout = '120s'; set local osteojp.r47_switched_at = '<SWITCHED_AT>';`
3. Below it, paste the whole of `scripts/db/read-first-send-20261105.sql`. To copy it exactly, type this in Claude Code with the dispatch's PRNUM in place of `<PRNUM>`:
   `! T=$(mktemp) && git -C /Users/ivan/Projects/GitHub/OsteoJP fetch -q origin refs/pull/<PRNUM>/head && git -C /Users/ivan/Projects/GitHub/OsteoJP show FETCH_HEAD:scripts/db/read-first-send-20261105.sql > "${T}" && [ "$(shasum -a 256 "${T}" | cut -d' ' -f1)" = "7cc0afa85beb0b46999ff8b3cf3870f0e1b4557dd2b819e38cabc55bb3c0c692" ] && pbcopy < "${T}" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run. Rows 5 or 10 at FAIL: follow the undo section of `owner-switch-steps-1104.md` at once. Send the whole table to SOLO privately either way. Do not post it anywhere public.

## Rehearsal (throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base: two synthetic tenants (the second with no visit, heartbeating); three visits with marks on Thursday at 08:00, 08:30 and 09:00, each taken by the pass of its slot (a sweep claim at the pass plus 2 seconds, a `sent` row a second later, the heartbeat written 10 seconds after its clock); shadow heartbeats on Wednesday before the switch (Wednesday 22:00) and send heartbeats every 15 minutes from Thursday 07:00 to 12:45. The read's clock is Thursday 13:00 unless the case says otherwise, with one substitution, its single clock line. Three appointment foreign keys are dropped in the throwaway so no synthetic person or clinic is made. The test runs these whenever `FIRST_SEND_1105_TEST_PGURL` names a local database and refuses any other host.

**Run of 2026-11-02 02:21 Lisbon (lane blue, started from a clean checkout of `main`), on these SQL bytes: the switch time unset, then 79 cases, the test's database part 1 of 1 passing.** Every case met its expectation exactly (the test compares every verdict, and the named INFO rows); each MUTANT is also asserted not to meet its unmutated case's expectation (for the two that move only a row, not to print that row).

| Case | Verdicts not OK |
|---|---|
| clean | all OK |
| empty: no heartbeat, no claim, no ledger row | 2=VACUOUS, 3=FAIL, 4=VACUOUS, 5=VACUOUS, 6=VACUOUS, 7=VACUOUS, 8=VACUOUS, 9=VACUOUS, 10=VACUOUS, 11=VACUOUS |
| no send at all since 07:00 on a working Thursday, the marks due: VACUOUS, never OK, and every mark reads missed | 4=VACUOUS, 5=VACUOUS, 6=VACUOUS, 7=REVIEW, 8=VACUOUS, 10=VACUOUS, 11=VACUOUS |
| a shadow heartbeat after the switch | 2=FAIL |
| a gap: the 07:30 pass of every tenant missing | 3=FAIL |
| the switch at Thursday 08:20: the slots run from 08:30, the floor is that pass | all OK |
| only the sleeping job sent: REVIEW on 4 and 6, no sweep-sent row | 4=REVIEW, 6=REVIEW, 10=VACUOUS |
| DOUBLE SEND: one start, two sent rows | 5=FAIL |
| DOUBLE SEND across the switch: the job sent on Wednesday, the sweep on Thursday, one start | 5=FAIL |
| two sent rows of one start, both before the switch: not this read's | all OK |
| DOUBLE SEND: two live claims of different takers, each followed by a send, the second row read against a moved start | 5=FAIL |
| two live claims of different takers, ONE send: printed, not a double send | all OK |
| one reminder sent for two starts, a re-plan: INFO, no FAIL | all OK |
| a missed reminder: due, no send, no reason | 7=REVIEW |
| a claim with nothing after it | 7=REVIEW |
| a recorded reason: held back, its claim given up | all OK |
| R24 kept it out: moved after its mark to this start, no row on either side | all OK |
| a move that keeps the start, after the mark, no row: not R24's, missed | 7=REVIEW |
| not a mark to take: the visit is cancelled | all OK |
| not a mark to take: the visit was created after its mark | all OK |
| not a mark to take: due before the floor, the job's | all OK |
| not a mark to take yet: due after the last finished pass | all OK |
| the job sent a mark from before the floor: by design | all OK |
| the job sent a mark from since the floor: the sweep missed it, REVIEW | 6=REVIEW |
| the late limit: an SMS 3 hours 5 minutes after its mark | 8=FAIL |
| the late limit: an SMS 3 hours 59 seconds after its mark, inside the minute | all OK |
| the late limit: an email 12 hours 30 minutes after its mark | 8=FAIL |
| the late limit: an email 10 hours 30 minutes after its mark | all OK |
| the second switch reads off: a pass left a visit out | 9=FAIL |
| a never-reminded visit taken and sent: counted | all OK |
| R34: handed over and held back before the save, tried again inside 3 hours: its label | all OK |
| SWEEP-SENT S5: a save after the mark, no claim before it | 10=FAIL |
| SWEEP-SENT S5: the only earlier claim came after the save | 10=FAIL |
| SWEEP-SENT S5: past R34's cap, an email (the SMS late rule would refuse it), the selecting pass 3 hours 10 minutes after the mark | 10=FAIL |
| R34: inside the cap, an email, the selecting pass 2 hours 55 minutes after the mark | all OK |
| SWEEP-SENT S5: a save between the previous pass and the selecting pass: the gate could read it | 10=FAIL |
| a save between the selection and the send: not the gate's to see, printed, no S5 | all OK |
| a sweep-sent row whose pass has not written its heartbeat: REVIEW, not FAIL | 10=REVIEW |
| SWEEP-SENT S5: moved to this start after its mark, then taken | 10=FAIL |
| a move that keeps the start, after the mark, then taken: no S5 | all OK |
| a booked visit confirmed by hand after its mark, then taken: no S5 | all OK |
| a sent row with no claim: REVIEW | 11=REVIEW |
| the read's clock at Thursday 09:10 | 1=FAIL |
| MUTANT: no FAIL on another mode, on "a shadow heartbeat after the switch" | all OK |
| MUTANT: no FAIL on a gap, on "a gap" | all OK |
| MUTANT: a zero send is not VACUOUS, on "no send at all" | 4=REVIEW, 5=VACUOUS, 6=VACUOUS, 7=REVIEW, 8=VACUOUS, 10=VACUOUS, 11=VACUOUS |
| MUTANT: only the job is not REVIEW, on "only the sleeping job" | 6=REVIEW, 10=VACUOUS |
| MUTANT: the double send's count, on "DOUBLE SEND: one start, two sent rows" | all OK |
| MUTANT: a double before the switch counts, on "two sent rows of one start, both before the switch" | 5=FAIL |
| MUTANT: the double send's FAIL dead, on "DOUBLE SEND: one start, two sent rows" | all OK |
| MUTANT: two claims of one taker, on "DOUBLE SEND: two live claims" | all OK |
| MUTANT: one send serves both claims, on "two live claims of different takers, ONE send" | 5=FAIL |
| MUTANT: the job on any mark is the sweep's miss, on "the job sent a mark from before the floor" | 6=REVIEW |
| MUTANT: the job's REVIEW dead, on "the job sent a mark from since the floor" | all OK |
| MUTANT: marks before the floor are read, on "not a mark to take: due before the floor" | 7=REVIEW |
| MUTANT: marks after the last pass are read, on "not a mark to take yet" | 7=REVIEW |
| MUTANT: cancelled visits are read, on "not a mark to take: the visit is cancelled" | 7=REVIEW |
| MUTANT: visits created after the mark are read, on "not a mark to take: the visit was created after its mark" | 7=REVIEW |
| MUTANT: R24's keeping out is missed, on "R24 kept it out" | 7=REVIEW |
| MUTANT: a recorded reason is missed, on "a recorded reason" | 7=REVIEW |
| MUTANT: missed's REVIEW dead, on "a missed reminder" | all OK |
| MUTANT: the late limit has no minute, on "the late limit: an SMS 3 hours 59 seconds" | 8=FAIL |
| MUTANT: the SMS limit at 4 hours, on "the late limit: an SMS 3 hours 5 minutes" | all OK |
| MUTANT: the email limit at 13 hours, on "the late limit: an email 12 hours 30 minutes" | all OK |
| MUTANT: the email limit at 10 hours, on "the late limit: an email 10 hours 30 minutes" | 8=FAIL |
| MUTANT: the second switch's FAIL dead, on "the second switch reads off" | all OK |
| MUTANT: the S5 FAIL dead, on "SWEEP-SENT S5: a save after the mark" | all OK |
| MUTANT: R34's cap at 5 hours, on "SWEEP-SENT S5: past R34's cap" | all OK |
| MUTANT: R34's cap at 2 hours, on "R34: inside the cap" | 10=FAIL |
| MUTANT: R34 needs no claim before the first save, on "SWEEP-SENT S5: the only earlier claim" | all OK |
| MUTANT: R34 needs no earlier claim at all, on "SWEEP-SENT S5: a save after the mark" | all OK |
| MUTANT: THE OLD ERROR: the selecting pass is the last heartbeat before the claim, on "SWEEP-SENT S5: a save between the previous pass" | all OK |
| MUTANT: THE OLD ERROR: saves are read up to the claim, on "a save between the selection and the send" | 10=FAIL |
| MUTANT: no REVIEW for a row with no selecting pass, on "a sweep-sent row whose pass has not written" | all OK |
| MUTANT: every move counts, on "a move that keeps the start, after the mark, then taken" | 10=FAIL |
| MUTANT: a confirmation by hand counts, on "a booked visit confirmed by hand" | 10=FAIL |
| MUTANT: no REVIEW for a row with no claim, on "a sent row with no claim" | all OK |
| MUTANT: the row belongs to the earliest claim, on "R34: handed over and held back" | all OK |
| MUTANT: a claim with nothing after it reads missed, on "a claim with nothing after it" | 7=REVIEW |

The switch time unset: the read stops with `unrecognized configuration parameter "osteojp.r47_switched_at"` and prints no table.

**Mutation sweep: 36 mutants, 36 killed.** Survivors by design, not run: the clauses of `rearm_rows` other than `accepted_with_estado` (the 2026-11-04 read's sweep kills each on the same text, and the test holds that text to the code); the rows that only inform (21, 30 to 36, 40) beyond what the cases read; the 75 minutes of a row with no claim; `early` on a claim.

## Known limits

- **Ownership is inferred.** A ledger row belongs to the latest claim before it. A row arriving after a later claim of another start is read against the later one. The closed claim leaves no live pair of takers on a start, so verdict 5's second arm can only fire on an anomaly; two takers on a start with a move between them can read as a double send, and that errs towards undo.
- **A save committing across the selection.** A save whose transaction began before `pass_at` and committed after the selection is read as visible to the gate. An uncommitted move leaves the old start selected and its `fromStartsAt` equals that start, so it does not count; a brought-back visit is not selectable until the commit. Only a request accepted after an earlier move can reach it.
- **The clocks.** `pass_at` is the job's clock, `created_at` the database's. They are read against each other for the selecting pass; a difference above the seconds between a selection and its first step would read REVIEW on verdict 10, not FAIL.
- **A mark is read from the visit's start now.** A visit cancelled since its mark is not in verdict 7. A pass over the ceiling defers marks: verdict 7 can read them as missed until a later pass; row 21 and verdict 3 print the ceiling.
- **The patient's portal move and the importer** change a start with no audit row (the gap in `reminder-population.ts`).
- **R34 was never seen on real rows.** The first real subject is this read.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the environment file, the guard against the real target, the psql call through the block and the fetch are NOT REHEARSED. The fault-injection test runs the block in GREEN's tool shape in bash and zsh with every external command a stub. The owner's fallback copy step is NOT REHEARSED. Not measured: the run time on production's row counts; 120 seconds is the bound.

## For strategy to confirm: the defaults this builder took

**Q1. A morning with no sweep-sent row** reads VACUOUS on verdict 10 and STOPs (no undo). DEFAULT TAKEN.

**Q2. Verdict 7 is REVIEW, never FAIL,** as briefed; a run of missed reminders does not by itself ask for the undo. DEFAULT TAKEN.

**Q3. A second switch read off** (verdict 9) and a late limit broken (verdict 8) are FAIL and STOP, not UNDO NOW: only a double send or a sweep-sent S5 asks for the undo, as briefed. DEFAULT TAKEN.
