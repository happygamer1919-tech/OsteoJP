# SHADOW-COMPARE, 2026-10-31: the reminder sweep's shadow against the sleeping job, every day from Monday 10-26, with R22's cause named

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-10-30 by SOLO's builder; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-shadow-compare-20261031.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED"). R4 ROUND 1 (2026-10-30): SHIP WITH TWO MINORS, BOTH ANSWERED (R8 also needs the sweep's own left-out count above 0 at every pass in range; verdict 14 is exact, 10 marks over 6 visits split 8 and 2), NOT RE-REVIEWED; 41 DATABASE CASES RE-RUN ON THE CHANGED SQL, EVERY CASE AS EXPECTED.** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit SOLO names.

## Why this read exists

R20 (`docs/read-shadow-compare-20261029.md`, `scripts/db/read-shadow-compare-20261029.sql`, merged as #1670) compared the reminder sweep's shadow with the sleeping job over Monday 10-26 to Wednesday 10-28. Its production result of 2026-10-29: 11 OK / 6 FAIL; on the full days both sides took 337 marks, shadow only 11 (all S5), run only 33 (R2 14, R4 11, and 8 UNEXPLAINED over 6 visits). R22 (`docs/read-sweep-unexplained-20261030.md`, pull request #1672) then evaluated, as of every pass, each predicate of the sweep's selection for every run-only UNEXPLAINED mark on any day. It ran on production on 2026-10-30 and PASSED 5 OK / 0 VACUOUS / 0 FAIL: 10 unexplained marks (8 Monday to Wednesday, 2 Thursday), and for every one of the 10 the same verdict: **P7 scheduling false at every pass in range, every other predicate held.** Each of those visits is a staff booking from one batch (created 2026-08-30 11:40:25), whose only scheduling save (an `appointment.update` from scheduled to confirmed) was written on the visit's own day, after the reminder mark.

The cause is a design rule, not a fault: `apps/web/lib/reminders/sweep.ts` `selectDueMarks` requires `hasSchedulingEvent` (`reminder-population.ts`) because `REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER` is `false`, and the old sleeping job had no such requirement. While that switch is off, the sweep skips a visit with no scheduling save at or before the pass. Strategy's R23: the switch goes on with send mode.

This read re-runs R20's comparison over every Lisbon day from Monday 10-26 to its own clock, and names that shape as a candidate label, **R8**, so that the marks it explains stop reading UNEXPLAINED. It then asserts what R20 could not: **no mark stays UNEXPLAINED.** It decides nothing, and it writes nothing.

## What it reads

`scripts/db/read-shadow-compare-20261031.sql`, sha256 `e9ee5ff036b70f453875caa663bac42d70e3eeec688c3ac0a2828a82ef82e71a`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times, the fixed labels of offsets (`48h`, `24h`), channels (`email`, `sms`), ledger outcomes and suppression reasons, and, in the mismatch list only, appointment ids (at most 500 a side, in the file only). No tenant id, patient id or staff id, no name, phone, email address, message text or note, and no audit metadata text: metadata is compared, never printed.

**How it is built, so a reviewer reads only what is new.** Three parts, in this order:

1. **R20, lines 90 to 389 of the read**: R20's lines 145 to 444 (from `clock as (` to the end of `pc`, at `e604854b`), with exactly two substitutions: `k.closes` reads 2026-10-30 07:15 Lisbon instead of 2026-10-29 07:15 (one line), and the body of `full_day` (two lines) is every Lisbon day from Monday 10-26 that has closed by the read's clock instead of the fixed three days. The test applies those two substitutions to R20's file and compares the result with the read exactly; any other difference fails it. So R20's window, sides, comparison key and candidate labels S3 to S7 and R1 to R7 are R20's, byte for byte. **R2 and R4 are unchanged.**
2. **R22, lines 393 to 566 of the read**: R22's lines 413 to 586 (from `off_min as (` to the end of `summ`) at `3a7a068687a07fb779c35667499f033e82ced08c`, the head of #1672, byte for byte. The test pins that span's sha256 (`c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d`), because #1672 is not on `main`. It is R22's evaluation of P1 to P8 as of each pass, including **P7 exactly as R22 reads it**: a scheduling save (`hasSchedulingEvent`, predicate by predicate) of the visit's own tenant, written at or before the heartbeat's `created_at`. Its unexplained set `u` is R20's run-only UNEXPLAINED rows on every day.
3. **This read's own**: `r8`, `pcl` (R20's comparison with R8 put on the marks `r8` names), the verdicts and the rows.

**The days.** From `t0`, the first `shadow` heartbeat at or after 2026-10-25 15:15:19 Lisbon, to the read's clock. A Lisbon day `d` from Monday 10-26 is **full** once the read's clock is at or after `d + 1` at 07:15 Lisbon: a mark due after 23:00 is taken by the next morning's 07:00 pass, and by 07:15 that pass has run and written (R20's reasoning for its Thursday 07:15, carried to every day). Every full day gets its own heartbeat verdict (3) and its two agreement verdicts (11 and 12). Sunday 10-25 (from `t0`) and the day or days after the last full day (to the read's clock) are partial and print as INFO, except in verdict 13, which reads every day. A mark is the visit's start minus the offset; both writers store it as `due_at`, so a mark has the same Lisbon day on both sides.

**Two clocks, kept apart, as in R20.** `pass_at` is the pass's own clock; `created_at` is the database's. The window of marks starts at `t0` (`pass_at`); everything compared with a row's `created_at` uses `t0c` and the heartbeats' own `created_at`. R22's "as of the pass" compares a row's `created_at` with the heartbeat's `created_at`, the start of the pass's transaction.

## THE NEW LABEL, R8

| Side | Category | Why it is not a disagreement |
|---|---|---|
| run only | R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false) | a run-only mark that every R20 label leaves UNEXPLAINED, and that R22's predicates read as P7 alone: at least one pass had the mark in range (P4 ahead and P5 due), **P7 scheduling was false at every such pass**, and P1 tenant, P2 start, P3 status, P6 created and P8 not taken were **true at every such pass** (never false, never unknown `?`), **and every such pass's heartbeat recorded the sweep leaving at least one visit out** (`excluded_count` above 0: the sweep's own count of the visits its scheduling-save rule left out, `sweep.ts` `not(hasSchedulingEvent)`). The sweep requires a scheduling save while the switch is off; the sleeping job never did |

**The sweep's own testimony (R4 round 1, MINOR 1).** The left-out condition makes R8 rest on what the sweep itself recorded at each pass, not only on the reconstruction: a pass that recorded no visit left out cannot have been skipping visits for want of a scheduling save. In R22's production output, every one of the 840 in-range passes of the 10 marks recorded a left-out count between 4 and 13, never 0 (the coordinator's reading of R22's file, relayed to this builder), so the real marks meet this condition. The condition sits in this read's own `r8`, so R22's pinned span stays byte for byte.

R8 sits after R7 and **before UNEXPLAINED**: it is applied only to a mark that R20's own labels left UNEXPLAINED, so no R20 label changes. **R4 still comes first**: a visit with no scheduling save on its trail at all reads R4, as it did in R20 (a test case proves it); R8 is the visit whose only scheduling save came after the last pass that could take the mark. Letters stay stable: `R5` is R20's partial-day label, so the new one takes the next free letter, `R8`.

Like every label, **R8 is a candidate reading, never a pass**: a full day with an R8 mark reads REVIEW, and SOLO and strategy read every one. Its limit, said plainly: R8 is R22's reconstruction of each predicate as of each pass, from the rows that exist now (see R22's document, "Known limits": a status change or a move that wrote no row cannot be placed in time; a predicate that cannot be reconstructed reads `?`, and a `?` keeps a mark out of R8).

## THE VERDICTS, AND WHAT EACH EXPECTS

A verdict is OK, REVIEW (agreement verdicts 11 and 12 only), VACUOUS or FAIL. **The block exits 0 only when** there is no FAIL and no VACUOUS, every verdict other than 11 and 12 is OK, verdicts 0, 1, 2, 6 to 10, 13 and 14 each print exactly once, and verdicts 3, 11 and 12 each print once per full day, for the same number of full days, at least 4 (Monday to Thursday). With every verdict OK it says PASSED; with any REVIEW it says REVIEW, never PASSED. A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first. Since R2, R4, S5 and R8 are known to be present on the full days, **the expected outcome on production is REVIEW**, not PASSED.

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the clock: the read runs at or after 2026-10-30 07:15 Lisbon (Thursday 10-29 has closed) | the database clock is at or after it | never | earlier |
| 2 | the window: the first shadow heartbeat after the Resync | one exists, before Monday 07:15 Lisbon | no shadow heartbeat at all (`t0` is NULL) | the first one is later than Monday's 07:00 slot |
| 3 | heartbeats, **one row per full day** (R20's 3, 4 and 5, carried to every full day) | every tenant has exactly 60 heartbeats that day, all `shadow`, in the 60 distinct slots 07:00 to 21:45 | no tenant | any tenant has fewer, more, a duplicate slot or a `send` heartbeat |
| 6 | the shadow sent nothing | 0 `send` heartbeats and 0 claims by taker `sweep` since the Resync | no shadow heartbeat | any of either |
| 7 | no pass over the ceiling (50 marks) on the full days | 0 of at least 60 shadow heartbeats per tenant per full day | no shadow heartbeat on the full days | any |
| 8 | the heartbeats account for every shadow row (R20's, unchanged) | each pass's `recorded_count` equals the shadow rows of its transaction, since `t0c` | no heartbeat or no shadow row since `t0c` | any difference |
| 9 | no mark taken twice by the shadow (R20's, unchanged) | 0 | no shadow row since `t0` | any |
| 10 | nothing falls out of the comparison (R20's, unchanged) | every row and send has a mark and a known reminder; no reminder in `[t0, t1]` was sent with neither a claim nor a shadow row | no row since `t0c` | any |
| 11 | agreement, 48h email, **one row per full day** | OK: at least one reminder taken by both and **no mismatch of any kind**. REVIEW: at least one match, mismatches present, every one with a candidate label (R8 included) | `t0` is NULL, or nothing taken by both | any UNEXPLAINED mismatch on that day, including a "sent with neither" |
| 12 | agreement, 24h sms, **one row per full day** | as 11 | as 11 | as 11 |
| 13 | **no mark stays UNEXPLAINED**: every mismatch from `t0` to the read's clock, shadow only, run only or sent with neither, on every day, full or partial | 0 unexplained | `t0` is NULL, or no mark at all in the window | any UNEXPLAINED mark, on any day |
| 14 | **R8 explains exactly the 10 marks R22 found**: R8 marks due Monday 10-26 to Thursday 10-29, against R22's production counts (its verdicts 2 and 3) | exactly 10 marks over 6 visits: 8 Monday to Wednesday over 6 visits, and 2 on Thursday, both on visits of that Monday-to-Wednesday set | `t0` is NULL, or no mark at all on those four days | any other count, visit count or split, one more or one fewer, or a Thursday mark on a visit outside the set (a zero is a FAIL, never a pass) |

Verdict 14 asserts no count for Friday 10-30 or later: those R8 marks are printed (rows 14, 31, 35 and 51), never asserted, because no earlier read has measured them. Verdict 14 is exact, not a lower bound (R4 round 1, MINOR 2): one more R8 mark than R22 found is as much a change as one fewer. Its comparand is R22's production counts (its verdicts 2 and 3: 8 marks over 6 visits Monday to Wednesday, 2 on Thursday on visits of that set), as relayed to this builder; this builder did not see that output. If a save or a claim since R22's run moved one of the 10, verdict 14 can read FAIL with verdict 13 OK: SOLO reads rows 14 and 51 before anything is decided.

**What "agree" means, and the other labels.** Exactly R20's: the match is on the sleeping job's CLAIM, never on its `sent` rows; no label can make a verdict OK; the candidate labels S3, S4, S5, S7, R1 to R7 and "sent with neither", and the withdrawn S1, S2 and S6, are R20's, with R20's definitions, in R20's order (`docs/read-shadow-compare-20261029.md`, "The candidate labels", and the SQL header of either read). This read changes none of them.

**The INFO rows (never counted, not relied on):**

| n | What |
|---|---|
| 20 | `t0`, the read's clock, the last shadow heartbeat (Lisbon), and the full days (first to last, and how many) |
| 21 | per Lisbon day of the heartbeats, full and partial: tenants, rows, shadow rows, slots, outside 07:00 to 21:45, due, recorded, over the ceiling, left out (`excluded_count`, a level) |
| 22 | R11, per full day: distinct pass ids, heartbeat rows, heartbeats with no pass id, tenants per pass (min and max), shadow rows written that day |
| 30 | per Lisbon day of the mark and per reminder, every day: both, shadow only, run only |
| 31 | the count of each candidate label (R8 included), per day of the mark, reminder and side |
| 32 | what each sleeping-job claim ended as, per day and reminder |
| 33 | sleeping-job claims in the window: early claims, reminders claimed more than once for one start, releases |
| 34 | shadow-only rows whose start the sleeping job claimed early (the withdrawn S1), full days and partial days |
| 35 | **new:** R8 marks per day of the mark and reminder, every day, full or partial |
| 40 | `SHADOW_SUMMARY`: the full days' totals, both, shadow only and run only with their unexplained counts, `run_r8`, sent with neither, and the matched share |
| 50, 51, 52 | the mismatches, shadow only (50), run only (51) and sent with neither (52): Lisbon mark, offset, channel, appointment id and label; at most 500 a side, the unexplained ones first. In the file only: the block never prints them |

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A VACUOUS or FAIL verdict stops the block after the table has been written: GREEN reports the lines as printed, and never opens the file.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-shadow-compare-20261031.sql`, sha256 `e9ee5ff036b70f453875caa663bac42d70e3eeec688c3ac0a2828a82ef82e71a` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes R20's and R22's documents pin) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-shadow-compare-20261031.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD`; the block fetches `refs/pull/1679/head` and refuses any other sha |

**Why the pull request's head and not `main`.** As with R22: this pull request is not merged before GREEN runs it. The block fetches `refs/pull/1679/head`, which GitHub keeps after a branch is deleted, and checks out the head commit by its full sha.

## When

At or after Friday 2026-10-30 07:15 Lisbon, once the dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it, and it has no window to end. The block STOPs before reading anything if the Lisbon clock reads earlier than 2026-10-30 07:15, and verdict 1 checks the database's own clock as well. Any later day is a valid read: it covers more full days. **It assumes the sweep is still in shadow:** once send mode is switched on, verdict 6 FAILs and that day's verdict 3 FAILs, and the read is no longer the right instrument for those days.

## Where the output goes

To `/Users/ivan/osteojp-handover/shadow-compare-20261031.out` and nowhere else: it holds appointment ids, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). The block prints only the verdict counts, the number of full days and the R11 rows (row 22, counts only). **GREEN never opens that file**; GREEN reports the printed lines and the file's path; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=1679
SHAREAD=e9ee5ff036b70f453875caa663bac42d70e3eeec688c3ac0a2828a82ef82e71a
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-shadow-compare-20261031.sql
DOC=docs/read-shadow-compare-20261031.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/shadow-compare-20261031.out
echo "${PRHEAD} ${DOCSHA}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64}' || { echo "STOP: the head commit or the document's sha256 still reads PENDING, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ "${NOW}" -ge 202610300715 ] || { echo "STOP: it is earlier than 2026-10-30 07:15 Lisbon, so Thursday is not closed yet. Nothing was read"; exit 1; }
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
shasum -a 256 -c docs/read-shadow-compare-20261031.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as shadow_compare_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
DAYS=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (n == "3" && (v == "OK" || v == "REVIEW" || v == "VACUOUS" || v == "FAIL")) d++ } END { printf "%d", d }' ${OUT}) || { echo "STOP: the full days could not be counted. The table is in ${OUT}"; exit 1; }
echo "full days: ${DAYS}"
R11=$(grep -E '^[[:space:]]*22[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no R11 rows (row 22). The table is in ${OUT}"; exit 1; }
echo "${R11}"
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "REVIEW") { w++; if (n != "11" && n != "12") x++ } else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { s = 1; split("0 1 2 6 7 8 9 10 13 14", one, " "); for (i in one) if (c[one[i]] != 1) s = 0; d = c["3"]; if (d < 4 || c["11"] != d || c["12"] != d || t != 10 + 3 * d) s = 0; if (f + a + x == 0 && s == 1) print (w == 0 ? "PASS" : "REVIEW"); else print "STOP" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "PASS" ] || [ "${RES}" = "REVIEW" ] || { echo "STOP: the read has a FAIL or a VACUOUS verdict, a REVIEW outside the agreement verdicts, fewer than 4 full days, or a verdict missing, doubled or extra. The table is in ${OUT}; GREEN does not open it, SOLO reads it"; exit 1; }
grep -qE '^[[:space:]]*40[[:space:]]*[|][[:space:]]*SHADOW_SUMMARY[[:space:]]*[|]' ${OUT} || { echo "STOP: the read printed no SHADOW_SUMMARY row. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "REVIEW" ] || echo "SHADOW-COMPARE-1031 PASSED: ${CNT%% / 0 REVIEW*} / 0 VACUOUS / 0 FAIL over ${DAYS} full days. The whole table is in ${OUT}; GREEN does not open it, SOLO reads it"
[ "${RES}" = "PASS" ] || echo "SHADOW-COMPARE-1031 REVIEW: no FAIL, no VACUOUS, every verdict but the agreement verdicts OK, over ${DAYS} full days, and mismatches that each carry a candidate label. This is NOT a pass: SOLO and strategy read every mismatch in ${OUT} (rows 31, 35, 50 and 51); GREEN does not open it"
)
```

**EXPECT:** `lisbon now:  <a time at or after 202610300715> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-shadow-compare-20261031.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: <o> OK / <r> REVIEW / 0 VACUOUS / 0 FAIL`; `full days: <d>` (4 or more: 4 on Friday 10-30 from 07:15, 5 on Saturday 10-31 from 07:15, and one more each later day); one R11 line per full day (`22 | passes on 2026-10-26 ...` onward); then EITHER `SHADOW-COMPARE-1031 PASSED: <o> OK / 0 VACUOUS / 0 FAIL over <d> full days. ...` (every verdict OK: no mismatch at all, which is not expected) OR `SHADOW-COMPARE-1031 REVIEW: ...` (the expected outcome: no FAIL, no VACUOUS, every verdict but 11 and 12 OK, and one or more agreement verdicts REVIEW). Exit 0 for both. **REVIEW is not a pass:** SOLO and strategy read every mismatch in the file before anything is decided. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/shadow-compare-20261031.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD` after the read: the next sitting does its own checkout and checks its own commit.

**STOP:** any `STOP:` line. The likely ones: `NOT READY` (the dispatch was not filled in); `earlier than 2026-10-30 07:15` (wait, paste again after 07:15); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO writes a new dispatch); `a FAIL or a VACUOUS verdict ...` (the read ran and the table is in the file: report the printed lines and the path; SOLO reads verdicts 13 and 14 and rows 50 to 52).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly: `set transaction read only; set local statement_timeout = '120s';`
3. Below it, paste the whole of `scripts/db/read-shadow-compare-20261031.sql`. To copy it exactly from the pull request's head, type this in Claude Code. It fetches the pull request's head into the main clone's `FETCH_HEAD` only (no checkout, no branch moves), copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! T=$(mktemp) && git -C /Users/ivan/Projects/GitHub/OsteoJP fetch -q origin refs/pull/1679/head && git -C /Users/ivan/Projects/GitHub/OsteoJP show FETCH_HEAD:scripts/db/read-shadow-compare-20261031.sql > "${T}" && [ "$(shasum -a 256 "${T}" | cut -d' ' -f1)" = "e9ee5ff036b70f453875caa663bac42d70e3eeec688c3ac0a2828a82ef82e71a" ] && pbcopy < "${T}" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run, at or after Friday 2026-10-30 07:15 Lisbon. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1, 2, 6 to 10, 13 and 14 must read `OK`; rows 3 must read `OK`, one per full day. Rows 11 and 12 read `OK` or `REVIEW`: **REVIEW is not a pass**, and a table with any REVIEW, FAIL or VACUOUS goes to SOLO whole, before anything is decided.
5. Send the whole table to SOLO privately (it holds counts, Lisbon times and, in rows 50 to 52, appointment ids; no name, phone or email). Do not post it anywhere public.

The editor runs the text as one transaction, so the first line makes the server refuse any write.

## Rehearsal (2026-10-30, throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database (the local stack `OsteoJP-blue`, database on 127.0.0.1:54622, the repository's migrations) with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base: R20's base carried to Saturday. Two synthetic tenants (the second with no visit, heartbeating with nothing due, as the sweep heartbeats every tenant); 16 synthetic visits (Monday 10-26 to Monday 11-02, 10:00 and 15:00 Lisbon), each with an `appointment.create` audit row dated 10-01; a shadow heartbeat every 15 minutes from Sunday 15:30 to Saturday 07:45; for every mark in the window a sleeping-job claim at the mark plus 2 seconds, a `sent` ledger row, and a shadow row in the transaction of the first pass at or after the mark; each heartbeat's counts equal its rows, and each of the case tenant's heartbeats records 5 visits left out (`excluded_count`; production's in-range passes recorded 4 to 13). Three appointment foreign keys (patient, practitioner, location) were dropped in the throwaway so no synthetic person or clinic had to be made; the read reads none of those tables. The read ran as the block runs it (`begin read only`, 120 seconds, `rollback`), with ONE substitution: its single clock line `select now() as t1` replaced by Saturday 2026-10-31 08:00 Lisbon (unless the case says otherwise), so Monday 10-26 to Friday 10-30 are the five full days and Sunday 10-25 and Saturday 10-31 are partial. The test runs these cases whenever `SHADOW_COMPARE_1031_TEST_PGURL` names a local database, and refuses any other host; the throwaways are dropped by the test.

**R22's shape** (the `r8Visit` fixture): a staff visit with NO scheduling save until its only one, an `appointment.update` from `scheduled` to `confirmed` 30 minutes after its start (the visit's own day, after its mark and after every pass that could take it); the sleeping job claimed and sent; no shadow row.

**Run of 2026-10-30 after R4 round 1 (lane blue): 41 cases, the test's database part 1 of 1 passing.** The first run (22:20 Lisbon, before R4) had 37; R4 round 1 added the left-out negative, its mutant, and verdict 14's eleven and swap cases. In the table, "only" lists the verdicts that are not OK; verdict 14 reads FAIL wherever fewer than 10 R8 marks are seeded, which is its job.

| Case | What was seeded | Verdicts not OK | Notes |
|---|---|---|---|
| clean | the base | 14 FAIL | row 20 full days `2026-10-26 to 2026-10-30 (5)`; row 40 `run_r8=0` |
| empty | no heartbeat and no claim at all | 2 VACUOUS; 3 FAIL on all five days; 6 to 10, 11 and 12 on all five days, 13 and 14 VACUOUS | a sweep that never ran is a FAIL on the heartbeats, never an OK |
| null window | every heartbeat removed, claims and shadow rows left | as empty | a NULL `t0` never reads as zero mismatches |
| **R22's profile** | 6 visits of R22's shape: 8 marks Monday to Wednesday, 2 on Thursday on two of them | 11 REVIEW on 10-26, 10-27, 10-28; 12 REVIEW on 10-27, 10-28, 10-29 | **13 OK, 14 OK**: row 14 `R8 marks 10 over visits 6`; row 31 R8 on Wednesday 48h email `2`; row 40 `run_unexplained=0 run_r8=10` |
| R22's profile, the sixth visit moved to Friday (9) | the same, the sixth visit's 24h mark on Friday 10-30 | the six REVIEWs above, 12 REVIEW on 10-30, 14 FAIL | row 14 `R8 marks 9 over visits 5; ... R8 marks due after 2026-10-29 1 (not asserted)`: later days are printed, never counted |
| R22's profile plus an eleventh (11) | the profile and one more visit of R22's shape, its 48h mark on Tuesday | the six REVIEWs, 14 FAIL | row 14 `R8 marks 11 over visits 7; Monday to Wednesday 9 over visits 7; Thursday 2, ...`: exact, not a lower bound |
| R22's profile with a swap | the sixth visit's Wednesday mark replaced by a Thursday mark on a new visit: still 10 marks over 6 visits | the six REVIEWs, 14 FAIL | row 14 `Monday to Wednesday 7 over visits 5; Thursday 3, on a visit outside that set 1`: a total of 10 over 6 is not enough |
| R8, one mark | one visit of R22's shape | 12 REVIEW on 10-26, 14 FAIL | never OK on a day with an R8 mark; 13 OK; row 51 names R8 |
| R8 negative: save before passes in range | the only scheduling save at 09:00 on the visit's day, before its 13:00 start | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | P7 true at the passes after 09:00: UNEXPLAINED |
| R8 negative: P3 false | no save until a `cancelled` to `scheduled` update after the start | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | P3 false at every pass as well as P7: UNEXPLAINED |
| R8 negative: P3 unknown | `cancelled` now with no trail, updated after the start, its only save a `portal_request_confirm` after the start | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | P3 `?` at every pass: UNEXPLAINED |
| R8 negative: P2 false | booked at another start under another tenant, moved to the claimed start after it | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | UNEXPLAINED |
| R8 negative: P2 unknown | no booking row, moved in after the start | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | UNEXPLAINED |
| R8 negative: P8 false | R22's shape plus a live `sweep` claim of the key before the mark | 6 FAIL, 12 FAIL on 10-26, 13 FAIL, 14 FAIL | UNEXPLAINED |
| R8 negative: a pass that left nothing out | R22's shape, one in-range pass (Monday 18:00) recording `excluded_count` 0 | 12 FAIL on 10-26, 13 FAIL, 14 FAIL | the sweep's own count does not testify at every pass: UNEXPLAINED |
| R8 negative: no pass in range | R22's shape, every heartbeat between its mark and its start removed | 3 FAIL on 10-26 and 10-27, 8 FAIL, 12 FAIL on 10-26, 13 FAIL, 14 FAIL | R8 needs at least one pass with the mark in range |
| R4 keeps its place | a visit with no scheduling save at all | 12 REVIEW on 10-26, 14 FAIL | row 51 `R4 never reminded`, not R8 |
| labelled only (R20's arms) | R20's seven labelled visits (R1, R2, R4, R6, S3, S4, S5) | 12 REVIEW on 10-26, 10-27, 10-28; 14 FAIL | row 31 reads every one of R20's seven labels, unchanged |
| shadow only | the claim for Tuesday's 24h SMS at 10:00 removed | 12 FAIL on 10-27, 13 FAIL, 14 FAIL | row 50 UNEXPLAINED |
| run only | the shadow row for Wednesday's 48h email at 10:00 removed (a booked visit: P7 true) | 11 FAIL on 10-28, 13 FAIL, 14 FAIL | row 51 UNEXPLAINED, not R8 |
| run only on a partial day | an UNEXPLAINED run-only mark Saturday 07:30 | 13 FAIL, 14 FAIL | no agreement verdict covers it; row 13 `of them on partial days 1` |
| sent with neither | a ledger row with no claim and no shadow row, Tuesday | 10 FAIL, 12 FAIL on 10-27, 13 FAIL, 14 FAIL | row 52 UNEXPLAINED |
| missing heartbeat | Thursday 12:00 removed | 3 FAIL on 10-29, 14 FAIL | |
| send heartbeat | a `send` heartbeat on Saturday 07:50 | 6 FAIL, 14 FAIL | |
| over the ceiling | one Friday heartbeat over the ceiling | 7 FAIL, 14 FAIL | |
| accounting | one heartbeat's recorded count lowered by one | 8 FAIL, 14 FAIL | |
| twice | a second shadow row for Monday's 24h SMS at 10:00 | 9 FAIL, 14 FAIL | |
| unplaced | a claim of an unknown offset, no mark | 10 FAIL, 14 FAIL | |
| early clock | the read's clock at Friday 2026-10-30 07:10 | 1 FAIL, 14 FAIL | only Monday to Wednesday are full: 3, 11 and 12 print three rows each |
| late window | every heartbeat before Monday 09:00 removed | 2 FAIL, 3 FAIL on 10-26, 14 FAIL | |
| MUTANT (R20's): the shadow set dead | the clean base | 11 and 12 FAIL on all five days, 13 FAIL, 14 FAIL | |
| MUTANT (R20's): the slot count dead | the clean base | 3 FAIL on all five days, 14 FAIL | |
| **MUTANT: P7 without its as-of-the-pass bound** (`and e.created_at <= h.created_at` removed) | R22's profile | the six REVIEWs become FAIL; 13 FAIL; 14 FAIL (`R8 marks 0`) | **caught**: a save written after the start counts, every R8 mark falls back to UNEXPLAINED. The test asserts the mutant does NOT meet the profile's expectation; and run against the read with this mutation in the file, the test FAILs twice (the R22 span's sha256 check, and the database case "R22's profile") |
| MUTANT sweep of `r8`, 8 mutants | each of r8's conditions removed once, run on the R8 negative case that must kill it: `s.in_range > 0`, `s.f7 = s.in_range`, `s.f2 = 0`, `s.u2 = 0`, `s.f3 = 0`, `s.u3 = 0`, `s.f8 = 0`, and the left-out condition (R4 round 1) | each negative case's 12 FAIL and 13 FAIL become 12 REVIEW and 13 OK | **8 of 8 caught**; each mutant is also asserted not to meet its unmutated case's expectation. Survivors, by design: `s.f1 = 0` and `s.f6 = 0` (see "Known limits"); not run as mutants |

R20's other negative arms (the withdrawn S1, S2 and S6, the negative S3, S4, S5, R1, R2 and R6 arms, R7, the malformed `startsAt`) are not repeated here: the span they test is R20's byte for byte, the test proves it, and R20's own test runs them.
**The block's judges on real psql output (2026-10-30, 22:27 Lisbon, and again at 22:49 on the SQL after R4 round 1, with the same results).** For two of the cases above the read was also run in psql's aligned format, exactly as the block runs it (`-X -v ON_ERROR_STOP=1 -P pager=off`, `begin read only`, the transaction line, the read, `rollback`), and the block's own awk programs and greps, copied from the block, were run on that transcript: the clean base printed `24 OK / 0 REVIEW / 0 VACUOUS / 1 FAIL`, `full days` 5 and judged `STOP` (verdict 14 FAIL, as it must with no R8 mark); R22's profile printed `19 OK / 6 REVIEW / 0 VACUOUS / 0 FAIL`, `full days` 5, judged `REVIEW`, with five R11 rows and the `SHADOW_SUMMARY` row found. The rest of the block (the clock, git, the hashes, the environment file and the guard) is proven only by the fault-injection test with stubs.

## Known limits

- R20's three "sent with neither" limits stand unchanged (`docs/read-shadow-compare-20261029.md`, "Known limits").
- R22's reconstruction limits stand unchanged and bound R8 (`docs/read-sweep-unexplained-20261030.md`, "Known limits"): a status change or a move that wrote no row cannot be placed in time; a predicate that cannot be reconstructed reads `?`, and a `?` at any pass in range keeps a mark out of R8, so such a mark stays UNEXPLAINED and FAILs verdict 13. The ceiling is read from the heartbeat only, so R8 does not ask whether a pass was over the ceiling: P7 false removes the mark before the ceiling applies.
- Two of R8's eight conditions cannot change its result and are kept as written: `s.f1 = 0` (P1 tenant), because a mark whose visit row is missing under its tenant reads P2 and P3 `?` at every pass, which `s.u2 = 0` already refuses; and `s.f6 = 0` (P6 created), because R20 labels a visit created at or after its mark R3 before UNEXPLAINED, so such a mark never reaches R8. The mutation sweep (see the rehearsal) lists them as its two survivors.
- R8 reads the switch as it stands on `main` (`REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER = false`). If a later day runs with the switch on, a mark R8 names on that day is not "by design" any more: its label is still printed, and SOLO reads it against the switch's history.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the block's production path is NOT REHEARSED: the environment file, the target guard against the real target, the connection and the psql call through the block, and `git fetch origin refs/pull/1679/head` against GitHub in the real apply checkout. What stands in for it: the SQL run above with exactly the block's psql arguments and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit, that the block passes only on an all-OK table over 4 or more full days and reports REVIEW only when the agreement verdicts alone read REVIEW.

The owner's fallback copy step (it fetches from GitHub) is NOT REHEARSED.

Not measured: the read's run time on production's row counts. Its inputs are R20's (which ran inside 120 seconds) over more days, plus R22's per-pass evaluation of each run-only UNEXPLAINED mark (R22 ran inside 120 seconds on production for the same set); 120 seconds is the bound.

## For strategy to confirm: the defaults this builder took (2026-10-30)

**Q1. The letter.** The brief named the new label "R5" as an example; `R5` is R20's partial-day label ("no pass of the sweep since its mark") and letters are never reused, so the new label is **R8**. Its words are the brief's, with "before the mark" sharpened to "before any pass that could take the mark", which is what R22 measured. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q2. R8 needs every other predicate TRUE at every pass in range,** not merely "never false": a `?` (unknown) at any pass keeps the mark UNEXPLAINED, so verdict 13 FAILs rather than read a mark the read cannot reconstruct as explained. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q3. Verdict 13 reads every day, partial days included.** R20's agreement verdicts covered full days only. A partial-day UNEXPLAINED mark (for example a run-only mark due in the hours before the read) FAILs verdict 13. R20's S7 (shadow only, due in the 15 minutes before the read) and R5 (run only, no pass since its mark, partial days) still label the window's edge. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q4. Per-day verdicts share a number.** With a day count that grows with the read's clock, verdicts 3, 11 and 12 print one row per full day under the same `n`, and the block checks the three counts are equal and at least 4. R20's fixed numbering (3 to 5, 11 to 16) could not hold a growing number of days without colliding with verdicts 6 to 10 and the INFO rows. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.
