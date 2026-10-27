# SHADOW-READ, 2026-10-29: did the reminder sweep's shadow agree with the sleeping job, Monday 10-26 to Wednesday 10-28

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-10-26; THE SQL REHEARSED ON THROWAWAYS ON THE LOCAL STACK (lane purple, synthetic rows, the cases below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-shadow-compare-20261029.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED"). R4 ROUND 1 (2026-10-26): FIX FIRST, NO BLOCKER; ITS FINDINGS ANSWERED IN THE SQL, THE BLOCK AND THE TEST (see "R4 round 1"); THE 21 DATABASE CASES RE-RUN ON THE CHANGED SQL THE SAME DAY (lane purple): EVERY CASE AS EXPECTED.** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `MERGED` is the merge commit SOLO names.

## Why this read exists

Strategy's R20 of 2026-10-26: the shadow comparison becomes a repository file with OK / VACUOUS / FAIL verdicts and a GREEN document, ready by Wednesday 2026-10-28 21:00; GREEN runs it on Thursday 2026-10-29 after 07:00 Lisbon (this block: at or after 07:15). Since the owner's Resync of 2026-10-25 at 15:15:19 Lisbon, the reminder sweep (`sweep-due-reminders`, every 15 minutes from 07:00 to 21:45 Lisbon, 60 passes a day) runs in shadow: per reminder it would hand to the dispatcher it writes a `reminder_claims` row of kind `shadow`, and one heartbeat per tenant per pass in `reminder_sweep_passes`. The sleeping job (`send-appointment-reminder`) still sends, and claims each reminder it wakes for (`reminder_claims` kind `claim`, taker `run`) before it decides, then writes its outcome to `reminder_dispatches`. This read compares the two over the three full shadow days. It is the evidence for the Thursday decision on the sweep's send mode; it decides nothing, and it writes nothing.

## What it reads

`scripts/db/read-shadow-compare-20261029.sql`, sha256 `36aff2fb165df93e18fb0541ff8fbc8a5c7a01f207fd13d11d08ce9f9a72713c`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times, the fixed labels of offsets (`48h`, `24h`), channels (`email`, `sms`), ledger outcomes (`sent`, `suppressed`, `provider_error`) and suppression reasons (`status`, `no_contact`, and the rest of the dispatcher's fixed list), and, in the mismatch list only, appointment ids (at most 50 a side). No tenant id, patient id or staff id, no name, phone, email address, message text or note. The predicates are copied from `apps/web/lib/reminders` on `origin/main` at `38721f0b`; the SQL file's header names each source.

**The window.** From `t0`, the first `shadow` heartbeat at or after 2026-10-25 15:15:19 Lisbon, to the read's clock. The verdicts cover the marks due on the three full Lisbon days, Monday 2026-10-26, Tuesday 2026-10-27 and Wednesday 2026-10-28. Sunday 10-25 (from `t0`) and Thursday 10-29 (to the read) are partial and print as INFO only. A mark is the visit's start minus the offset (48 hours for the email, 24 hours for the SMS); both writers store it as `due_at`, so a mark has the same Lisbon day on both sides. The comparison key is tenant, appointment, offset, channel and start, as both writers store it.

**Why Thursday 07:15.** A mark due after 23:00 is taken by the next morning's 07:00 pass (the 21:45 pass takes marks due before 23:00). So Wednesday's last marks are compared only after Thursday's first pass has run and written, and verdict 1 refuses a read before 07:15, a full slot after it. The block also refuses to run before 2026-10-29 07:15 Lisbon by its own clock.

**Two clocks, kept apart.** `pass_at` is the pass's own (application) clock; `created_at` is the database's, and a heartbeat and the shadow rows of its pass share one `created_at`. The window of marks starts at `t0` (`pass_at`). Everything compared with a row's `created_at` (verdicts 8 to 10, and the time bounds of the categories) uses `t0c`, the database `created_at` of the first shadow heartbeat since the Resync, and the heartbeats' own `created_at`.

## THE VERDICTS, AND WHAT EACH EXPECTS

The expected profile is **17 OK / 0 VACUOUS / 0 FAIL**. A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first.

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the clock: the read runs at or after 2026-10-29 07:15 Lisbon | the database clock is at or after it | never | earlier |
| 2 | the window: the first shadow heartbeat after the Resync | one exists, before Monday 07:15 Lisbon (expected Sunday 15:30) | no shadow heartbeat at all (`t0` is NULL: the empty window) | the first one is later than Monday's 07:00 slot |
| 3, 4, 5 | heartbeats on Monday, Tuesday, Wednesday | every tenant has exactly 60 heartbeats that day, all `shadow`, in the 60 distinct slots 07:00 to 21:45 | no tenant | any tenant has fewer, more, a duplicate slot or a `send` heartbeat. A pass that failed for a tenant leaves no row (the table has no error column), so this IS the "no pass with an error" check |
| 6 | the shadow sent nothing | 0 `send` heartbeats and 0 claims by taker `sweep` since the Resync | no shadow heartbeat | any of either |
| 7 | no pass over the ceiling (50 marks) on the three full days | 0 of at least 180 shadow heartbeats | no shadow heartbeat on the full days | any |
| 8 | the heartbeats account for every shadow row | each pass's `recorded_count` equals the shadow rows written in its own transaction (same tenant, same `created_at`), every row has its heartbeat, since `t0c` (both sides on the database clock) | no heartbeat or no shadow row since `t0c` | any row without a heartbeat, any heartbeat missing rows, any count that differs |
| 9 | no mark taken twice by the shadow | 0 marks with more than one shadow row, since `t0` | no shadow row since `t0` | any |
| 10 | nothing falls out of the comparison | every shadow row and sleeping-job claim written since `t0` has a mark and a known offset and channel (`48h email`, `24h sms`) | no row since `t0` | any row without a mark or with another offset or channel |
| 11 to 16 | agreement, per full day and per reminder: 11 Monday 48h email, 12 Monday 24h sms, 13 Tuesday 48h email, 14 Tuesday 24h sms, 15 Wednesday 48h email, 16 Wednesday 24h sms | at least one reminder taken by both, and **0 unexplained** mismatches either way | `t0` is NULL, or nothing taken by both | any unexplained mismatch |

**What "agree" means here.** The sweep's own design says what a shadow row is and is not (`apps/web/lib/reminders/sweep.ts`, header): "every mark the sleeping job claimed should have a shadow row beside it, and a shadow row with no `run` claim is a reminder the sleeping job never sent". A shadow row means "the sweep would have handed this reminder to the dispatcher", NOT "a message would have gone out": the dispatcher asks gates the sweep's selection does not (no contact, a channel switched off, a deleted patient). So the match is on the sleeping job's CLAIM, which it takes before every gate (`dispatch.ts` `dispatchReminderInner`), never on its `sent` rows. The threshold is **zero unexplained mismatches**: a mismatch either falls into one of the named categories below, each of which the code says it should, or it fails that day's verdict. There is no percentage threshold (see "For strategy to confirm").

**The categories.** First match wins, in this order.

| Side | Category | Why it is not a disagreement |
|---|---|---|
| shadow only | S1 the sleeping job claimed this start early | it woke at an older time of a visit since moved later (`early`, more than 10 minutes before the mark) |
| shadow only | S2 the sleeping job claimed another start, before the shadow row | a non-early sleeping-job claim of another start, written since `t0c` and at or before the shadow row: the visit moved between the job's claim and the pass |
| shadow only | S3 moved after the 21:45 pass took its mark ahead | the shadow row was written before its mark (the look-ahead), an `appointment.reschedule` save lies after the shadow row and at or before the mark, and the start now differs: the old start's sleeping job was cancelled before it woke |
| shadow only | S4 a ledger row with no claim | the claim fails open (`reminder-claim.ts`): the job acted with no claim row |
| shadow only | S5 saved after its mark, before the pass | the shadow row says `saved_after_mark`, and a scheduling save or a change to a status that is not remindable lies after the mark and at or before the shadow row: the sweep takes a visit saved after its mark (the late rule); the sleeping job had dropped that mark (`computeDueReminders`) |
| shadow only | S6 saved after the 21:45 pass took its mark ahead | the shadow row was written before its mark, and a scheduling save or a change to a status that is not remindable lies after it and at or before the mark |
| shadow only | S7 due in the 15 minutes before the read | the job may not have woken yet (never on a full day read on Thursday) |
| run only | R1 moved after the claim, before the next pass | an `appointment.reschedule` save lies after the claim and at or before the first pass at or after the mark, and the start now differs: the sweep keys on the visit's current start |
| run only | R2 suppressed by the sleeping job as not remindable | its first ledger row after the claim is `suppressed` with reason `status`: the visit was not remindable at its mark, and the sweep's selection leaves those visits out too. `unconfirmed` is NOT a reason here: the sweep does not apply the unaccepted-request gate (`sweep.ts`, "WHAT A SHADOW ROW MEANS"), so a run-only row suppressed `unconfirmed` stays UNEXPLAINED |
| run only | R3 created at or after its mark | the sweep takes a visit only if it was created before its mark |
| run only | R4 never reminded: no scheduling save | `REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER = false` (`reminder-population.ts`): the shadow pass leaves out a visit with no save that handed it to the reminder job; `excluded_count` on the heartbeat counts the same set as a level |
| run only | R5 no pass of the sweep since its mark | the window's end; on a full day it would also fail verdicts 3 to 5 |
| run only | R6 saved between its mark and the next pass | a scheduling save or a change to a status that is not remindable lies after the mark and at or before the first pass at or after it: a race the sweep cannot see |
| either | UNEXPLAINED | none of the above. One on a full day fails that day's agreement verdict |

Each category is read from rows, not from a story, and each time-bounded one is bounded to its own mechanism on the database clock, so a later save cannot explain away an earlier mismatch: the appointment's current start and creation time, the audit trail's saves (`audit_log`; "a scheduling save" is `reminder-population.ts` `hasSchedulingEvent` predicate by predicate, "a status that is not remindable" is a row whose metadata `toStatus` is set and is neither `scheduled` nor `confirmed`, "moved" is `appointment.reschedule`; metadata is read and never printed), the ledger, and the heartbeats. **Their limit, said plainly:** a category is evidence that the code path exists for that visit, not a replay of the moment. R2 rests on the sleeping job's own record of the status at its mark. A visit's status NOW is not used, because by Thursday every Monday-to-Wednesday visit has moved on to `completed`, `no_show` or `cancelled`.

**The INFO rows (never counted, not relied on):**

| n | What |
|---|---|
| 20 | `t0`, the read's clock, the last shadow heartbeat (Lisbon) |
| 21 | per Lisbon day, Sunday to Thursday: tenants with heartbeats, heartbeat rows, shadow heartbeats, distinct slots, heartbeats outside 07:00 to 21:45, sums of due, recorded, over the ceiling and left out (`excluded_count`, a level: the same visit is counted again by every pass) |
| 22 | **R11, per full day:** distinct pass ids, heartbeat rows, heartbeats with no pass id, distinct tenants per pass (min and max), shadow rows written that day. Executions per pass in shadow mode are 1 run + 1 step `list-tenants` + 1 step per tenant (`apps/web/lib/reminders/sweep.ts:569` and `:582`), so these rows give SOLO the projection's inputs from production |
| 30 | per Lisbon day of the mark and per reminder, Sunday to Thursday: both, shadow only, run only |
| 31 | the count of each mismatch category, per side, for the full days and the partial days |
| 32 | what each sleeping-job claim ended as, per day and reminder: `sent`, `suppressed (reason)`, `provider_error`, or `no ledger row` |
| 33 | sleeping-job claims in the window: early claims, reminders claimed more than once for one start (retries), releases |
| 40 | `SHADOW_SUMMARY`: the full days' totals, both, shadow only and run only with their unexplained counts, and the matched share |
| 50, 51 | the mismatches, shadow only (50) and run only (51): Lisbon mark, offset, channel, appointment id and category; at most 50 a side, the unexplained ones first |

## R4 round 1 (2026-10-26): FIX FIRST, no BLOCKER, and what changed

- MAJOR: R1, S3 and S2 were not bounded in time, so a later move explained away a real mismatch. Answered: R1 needs an `appointment.reschedule` save after the claim and at or before the first pass at or after the mark; S3 needs the shadow row written before its mark and the move after it, at or before the mark; S2 needs the other start's claim at or before the shadow row. Three negative database arms (a move or a claim a day later stays UNEXPLAINED).
- S5, S6 and R6 accepted any save. Answered: each needs a scheduling save or a change to a status that is not remindable inside its own window.
- R2's `unconfirmed` premise was false: the sweep does not apply the unaccepted-request gate (`sweep.ts`, "WHAT A SHADOW ROW MEANS"). Answered: R2 is reason `status` only, and a negative arm proves `unconfirmed` stays UNEXPLAINED.
- Verdict 8 joined two clocks (`pass_at` and `created_at`). Answered: `t0c`, the database `created_at` of the first shadow heartbeat since the Resync, bounds the heartbeats and the rows of verdicts 8 to 10.
- Verdict 1 now requires 07:15, and so does the block's own clock STOP.
- The block wrote the transcript through `tee`, so the mismatch list reached the terminal. Answered: psql writes `> ${OUT} 2>&1`; the block prints only the verdict counts and the R11 rows; a test fails on any `tee` in the block and on an appointment id reaching the terminal.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A VACUOUS or FAIL verdict stops the block after the table has printed: report the table as printed. Its INFO rows are not to be relied on.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-shadow-compare-20261029.sql`, sha256 `36aff2fb165df93e18fb0541ff8fbc8a5c7a01f207fd13d11d08ce9f9a72713c` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes MN-READ's document pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-shadow-compare-20261029.sha256` pins it |
| The commit | the dispatch names the merge commit in `MERGED`; the block refuses a sha that is not on `origin/main` |

## When

Thursday 2026-10-29, at or after 07:15 Lisbon, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it, and it has no window to end. The block STOPs before reading anything if the Lisbon clock reads earlier than 2026-10-29 07:15, and verdict 1 checks the database's own clock as well. Running it later than Thursday is still a valid read of the same three days.

## Where the output goes

To `/Users/ivan/osteojp-handover/shadow-read-20261029.out` and nowhere else: it holds appointment ids, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`), so the mismatch list never reaches the terminal. The block prints only the verdict counts and the R11 rows (row 22, counts only). GREEN reports those lines and the file's path to SOLO; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
MERGED=PENDING
DOCSHA=PENDING
SHAREAD=36aff2fb165df93e18fb0541ff8fbc8a5c7a01f207fd13d11d08ce9f9a72713c
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-shadow-compare-20261029.sql
DOC=docs/read-shadow-compare-20261029.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/shadow-read-20261029.out
echo "${MERGED} ${DOCSHA}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64}' || { echo "STOP: the merge commit or the document's sha256 still reads PENDING, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ "${NOW}" -ge 202610290715 ] || { echo "STOP: it is earlier than 2026-10-29 07:15 Lisbon, so Wednesday is not closed yet. Nothing was read"; exit 1; }
[ -d "${OUTDIR}" ] || { echo "STOP: the handover folder is not there. Nothing was read"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
DIRTY=$(git status --porcelain) || { echo "STOP: the worktree's status could not be read. Nothing was read"; exit 1; }
[ -z "${DIRTY}" ] || { echo "STOP: the apply worktree is not clean. Nothing was read"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed. Nothing was read"; exit 1; }
git merge-base --is-ancestor ${MERGED} origin/main || { echo "STOP: the merge commit ${MERGED} is not on origin/main. Nothing was read"; exit 1; }
git checkout --quiet --detach ${MERGED} || { echo "STOP: the merge commit could not be checked out. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${MERGED}" ] || { echo "STOP: the worktree is not on the merge commit [${HD}]. Nothing was read"; exit 1; }
echo "checked out: ${HD}"
D=$(shasum -a 256 ${DOC} | cut -d' ' -f1) || { echo "STOP: this document could not be hashed. Nothing was read"; exit 1; }
echo "document:    ${D}"
[ "${D}" = "${DOCSHA}" ] || { echo "STOP: this document is not the one the dispatch names. Nothing was read"; exit 1; }
shasum -a 256 -c docs/read-shadow-compare-20261029.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as shadow_read_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d %d %d", o, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts (OK VACUOUS FAIL): ${CNT}"
R11=$(grep -E '^[[:space:]]*22[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no R11 rows (row 22). The table is in ${OUT}"; exit 1; }
echo "${R11}"
[ "${CNT}" = "17 0 0" ] || { echo "STOP: the read's verdicts are not 17 OK / 0 VACUOUS / 0 FAIL. The table is in ${OUT}; its INFO rows are not to be relied on"; exit 1; }
grep -qE '^[[:space:]]*40[[:space:]]*[|][[:space:]]*SHADOW_SUMMARY[[:space:]]*[|]' ${OUT} || { echo "STOP: the read printed no SHADOW_SUMMARY row. The table is in ${OUT}"; exit 1; }
echo "SHADOW-READ PASSED: 17 OK / 0 VACUOUS / 0 FAIL. The whole table is in ${OUT}"
)
```

**EXPECT:** `lisbon now:  <a time at or after 202610290715> WET`; `checked out: <MERGED>`; `document:`, then `docs/read-shadow-compare-20261029.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts (OK VACUOUS FAIL): 17 0 0`; three R11 lines (`22 | passes on 2026-10-26 ...`, `-27`, `-28`); then `SHADOW-READ PASSED: 17 OK / 0 VACUOUS / 0 FAIL. The whole table is in ...`. Exit 0. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/shadow-read-20261029.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production.

**STOP:** any `STOP:` line. The likely ones and what they mean: `NOT READY` (the dispatch was not filled in); `earlier than 2026-10-29 07:15` (wait, paste again after 07:15); `not 17 OK / 0 VACUOUS / 0 FAIL` (the read ran: report the printed lines and the file's path; SOLO reads the failing verdict and its mismatch rows 50 and 51 in the file before anything is decided).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly: `set transaction read only; set local statement_timeout = '120s';`
3. Below it, paste the whole of `scripts/db/read-shadow-compare-20261029.sql`. To copy it exactly, once the clone is on main, type this in Claude Code. It copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! F=/Users/ivan/Projects/GitHub/osteojp-solo-clone/scripts/db/read-shadow-compare-20261029.sql; [ "$(shasum -a 256 "$F" | cut -d' ' -f1)" = "36aff2fb165df93e18fb0541ff8fbc8a5c7a01f207fd13d11d08ce9f9a72713c" ] && pbcopy < "$F" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run, on Thursday 2026-10-29 at or after 07:15 Lisbon. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1 to 16 must read `OK`.
5. Send the whole table to SOLO privately (it holds counts, Lisbon times and, in rows 50 and 51, appointment ids; no name, phone or email). Do not post it anywhere public.

The editor runs the text as one transaction, so the first line makes the server refuse any write.

## Rehearsal (2026-10-26, throwaway databases on the local stack, lane purple, synthetic rows)

The `public` schema copied from the lane's database with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base. One synthetic tenant; 12 synthetic visits (Monday 10-26 to Saturday 10-31, 10:00 and 15:00 Lisbon), each with an `appointment.create` audit row dated 10-01; heartbeats every 15 minutes from Sunday 15:30 to Thursday 07:15; for every mark in the window a sleeping-job claim at the mark plus 2 seconds and a `sent` ledger row, and a shadow row written in the transaction of the first pass at or after the mark; each heartbeat's counts equal its rows. Three appointment foreign keys (patient, practitioner, location) were dropped in the throwaway so no synthetic person or clinic had to be made; the read reads none of those tables. The read ran as the block runs it (`begin read only`, 120 seconds, `rollback`), with ONE substitution: its single clock line `select now() as t1` replaced by a fixed instant (2026-10-29 07:30 Lisbon unless the case says otherwise), because the window is in the future of today. The fault-injection test runs the same cases whenever `SHADOW_READ_TEST_PGURL` names a local database, and refuses any other host.

**The results below are the run of 2026-10-26 on the SQL after R4 round 1** (21 cases, the test's database part 1 of 1 passing, lane purple; the throwaways dropped by the test). Rows marked NEW or CHANGED came with round 1; the other rows read the same before and after it.

| Case | What was seeded | Verdicts | Notes |
|---|---|---|---|
| clean | the base | 17 OK | each full day: 2 matched per reminder; R11 rows: 60 pass ids, 60 heartbeats, 1 to 1 tenants per pass, 4 shadow rows written |
| empty | no heartbeat and no claim at all (the empty window) | 2 VACUOUS (`Lisbon none`), 3 to 5 FAIL (`heartbeats 0 to 0; slots 0 to 0`), 6 to 16 VACUOUS | a sweep that never ran is a FAIL on the heartbeats, never an OK |
| null-window | every heartbeat removed, the claims and shadow rows left in place | 2 VACUOUS, 3 to 5 FAIL, 6 to 16 VACUOUS | a NULL `t0` must not let rows that exist read as zero mismatches: no agreement verdict reads OK |
| shadow-only | the sleeping job's claim and ledger row for Tuesday's 24h SMS at 10:00 removed | 14 FAIL, all others OK | category UNEXPLAINED; its appointment id printed in row 50 |
| run-only | the shadow row for Wednesday's 48h email at 10:00 removed, its heartbeat's counts lowered by one | 15 FAIL, all others OK | category UNEXPLAINED; row 51 |
| missing-heartbeat | Monday's 12:00 heartbeat removed | 3 FAIL, all others OK | `heartbeats 59 to 59; slots 59 to 59` |
| explained (CHANGED) | six extra visits: one with no scheduling save (claimed and sent, no shadow row); one claimed and suppressed `status`, now `cancelled`; one claimed at its old start and moved 5 minutes later, before the next pass (shadow and claim at the new start); one moved in after its mark, its shadow row `saved_after_mark`, no claim; one taken ahead by the 21:45 pass and moved before its mark; one claimed at its old start, moved, the shadow at the new start | 17 OK | row 31: R1 twice, R2, R4, S2, S3 and S5 once each |
| R1 negative (NEW) | claimed, then moved a day after the claim | 12 FAIL, all others OK | row 51 UNEXPLAINED |
| S3 negative (NEW) | taken ahead by the 21:45 pass, moved a day after its mark | 12 FAIL, all others OK | row 50 UNEXPLAINED |
| S2 negative (NEW) | a sleeping-job claim of another start written a day after the shadow row | 12 FAIL, all others OK | row 50 UNEXPLAINED |
| R2 negative (NEW) | claimed and suppressed `unconfirmed`, no shadow row | 14 FAIL, all others OK | row 51 UNEXPLAINED |
| send-heartbeat | a `send` heartbeat on Thursday 07:20 | 6 FAIL, all others OK | |
| sweep-claim | a claim by taker `sweep` | 6 FAIL, all others OK | |
| over-ceiling | one Tuesday heartbeat over the ceiling | 7 FAIL, all others OK | |
| accounting | one heartbeat's recorded count lowered by one | 8 FAIL, all others OK | |
| twice | a second shadow row for Monday's 24h SMS at 10:00, in the next pass | 9 FAIL, all others OK | |
| unplaced | a sleeping-job claim for an unknown offset, with no mark | 10 FAIL, all others OK | |
| early-clock (CHANGED) | the read's clock at Thursday 2026-10-29 07:10 (before round 1: Wednesday 20:00) | 1 FAIL | |
| late-window | every heartbeat before Monday 09:00 removed | 2 FAIL, 3 FAIL | |
| MUTANT 1 | the read with its shadow set made dead (`kind = 'shadow'` never true in `s`), on the clean base | 11 to 16 FAIL | a dead shadow measure cannot read OK |
| MUTANT 2 | the read with its slot count made dead, on the clean base | 3 to 5 FAIL | a dead heartbeat measure cannot read OK |

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway. So the block's production path (the environment file, the guard, the connection) is NOT REHEARSED. What stands in for it: the SQL rehearsed above with exactly the block's psql arguments and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit and that the block passes only on the profile `17 0 0` with a `SHADOW_SUMMARY` row.

Not measured: the read's run time on production's row counts. Its largest inputs are three days of `reminder_claims` and `reminder_sweep_passes` (hundreds of rows) and, per mismatch only, the audit trail through `audit_log_entity_idx`; 120 seconds is the bound.

## For strategy to confirm: the defaults SOLO took (2026-10-26)

The read is built to the three defaults below. Each is SOLO's default, not a ruling, and is marked for strategy to confirm or change before GREEN runs the read.

**Q1. The agreement threshold.** Options: (a) zero unexplained mismatches per full day and reminder, every explained category printed (this document); (b) a matched share of at least 95% per day and reminder, without categories; (c) both. **DEFAULT TAKEN: (a), FOR STRATEGY TO CONFIRM.** At this clinic's volume a day holds a few dozen to a few hundred marks per reminder, so 5% is several patients a day whose reminder the sweep would miss or send twice, and a percentage hides exactly the one case worth reading. The categories carry the known, coded divergences instead, and an unexplained one is a defect to read before send mode, not noise.

**Q2. The explained categories' size.** R4 (visits never reminded, left out while the switch is off) is expected to be large if imported visits were re-armed on 2026-10-12; Q-T turns that switch on together with send mode, so R4 is the population the sweep starts reminding on Thursday. **DEFAULT TAKEN: no ceiling on any explained category in this read, FOR STRATEGY TO CONFIRM.** SOLO reports R4's count beside `excluded_count` (row 21) in the Thursday report, and strategy decides on the number.

**Q3. Over the ceiling as FAIL.** Verdict 7 fails on a single pass over 50 marks, although the sweep only defers the rest by 15 minutes. **DEFAULT TAKEN: it stays a FAIL, FOR STRATEGY TO CONFIRM.** In send mode a deferral is a late reminder, and the shadow days are the only measurement of how near the ceiling a real day comes.
