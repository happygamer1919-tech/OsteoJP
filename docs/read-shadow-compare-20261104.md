# SHADOW-COMPARE, 2026-11-04 (R47): the reminder sweep's shadow against the sleeping job over Monday 11-02 and Tuesday 11-03, under #1678's code

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-11-01 by SOLO's builder; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-shadow-compare-20261104.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED"). NOT YET REVIEWED (R4).** The block's four value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit, `PRNUM` its number, and `DEPLOYED_AT` the instant #1678 went live in production, all named by SOLO.

## Why this read exists

The 2026-10-31 compare (`docs/read-shadow-compare-20261031.md`, #1679) read the shadow against the sleeping job from Monday 10-26 and left four labels on the full days: R2 (both suppress), R4 and R8 (never reminded, by design until the switch) and S5 (the shadow took a mark the sleeping job had dropped, because the visit was saved after the mark). #1678 (merged as `579b955c`, reviewed head `1bd32c06`) changes the sweep so that S5 cannot happen: **R24/R33**, a mark is not taken while the visit's audit trail holds a re-arming save (`RE_ARMING_SAVES`, `apps/web/lib/reminders/reminder-population.ts`) written strictly after the mark, and a move counts only when the start at the mark differs from the start now; and **R34**, the sending pass's held-back retry survives such a save for at most 3 hours after the mark.

Strategy's rulings for this compare, verbatim:

- R32: "A compare reading REVIEW counts as the clean verdict when all of these hold: zero UNEXPLAINED anywhere; 60 of 60 passes on every full day; every label is in the accepted set: R2 (both suppress), R4 and R8 (never-reminded, by design until the switch), S5 (late mark, removed by R24), and the held-back label of R34. Any other label is read by strategy before it counts."
- R47: "Compare Wed 11-04 after 07:15. Its dispatch is READY by Tue 21:00, with R34's label and no kept-start label."
- R36: "If clean under R32, with zero sweep-sent S5 rows: the owner sets REMINDERS_SWEEP_MODE=send and REMINDERS_SWEEP_NEVER_REMINDED=on together".

This read compares the two full days under the new code, asserts that R24 held (no S5 row, no shadow row taken after a re-arming save), and judges each of R32's three conditions by machine: verdict 3 (60 of 60), verdict 13 (zero UNEXPLAINED anywhere) and verdict 16 (every label in the accepted set). It decides nothing, and it writes nothing.

## What it reads

`scripts/db/read-shadow-compare-20261104.sql`, sha256 `a96ac09d1880d38198e1deed69b085717d3da41000f5968bcbae74cbcc382c20`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times, the fixed labels of offsets (`48h`, `24h`), channels (`email`, `sms`), ledger outcomes, suppression reasons and label letters, and, in the mismatch list only, appointment ids (at most 500 a side, in the file only). No tenant id, patient id or staff id, no name, phone, email address, message text or note, and no audit metadata text: metadata is compared, never printed. This is exactly what the 2026-10-31 read printed, and nothing more.

**One value from outside.** The deploy instant is read from the setting `osteojp.r47_deployed_at`, which the block sets with `set local` inside the read-only transaction from the dispatch's `DEPLOYED_AT` (UTC, `YYYY-MM-DDTHH:MM:SSZ`, checked by the block's first line). Unset, the read stops with an error and prints no table (a test case proves it).

**How it is built, so a reviewer reads only what is new.** Three parts, in this order:

1. **R20, lines 107 to 406 of the read**: R20's lines 145 to 444 (`scripts/db/read-shadow-compare-20261029.sql`, on main, #1670), with exactly two substitutions: the body of `k` (three lines: `resync` holds DEPLOYED_AT, `first_full_pass` is Monday 2026-11-02 07:00 and `closes` Wednesday 2026-11-04 07:15 Lisbon) and the body of `full_day` (one line: Monday 11-02 and Tuesday 11-03, fixed). The test applies them to R20's file and compares the result with the read exactly. The column keeps the name `resync` so the rest of R20 is byte for byte; here it is the deploy. R20's window, sides, key and labels S3 to S7 and R1 to R7 are R20's.
2. **R22, lines 410 to 583 of the read**: R22's lines 413 to 586 (`scripts/db/read-sweep-unexplained-20261030.sql`, on main, #1672), byte for byte, the span the 2026-10-31 read pinned (sha256 `c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d`; the test now compares it with main exactly as well). The sweep's old selection predicates P1 to P8 as of each pass, for every run-only UNEXPLAINED mark.
3. **This read's own**: `r8` (the 2026-10-31 read's, unchanged), `swept`, `probe`, `rearm_rows`, `probe_eval` (#1678's re-arming saves as SQL), `r9`, `pcl`, the verdicts and the rows.

**#1678 as SQL.** `rearm_rows` is `RE_ARMING_SAVES` and `reArmingClause` at `1bd32c06`, clause by clause (booked, moved, accepted_in_pedidos, accepted_with_estado, brought_back, accepted_in_sms_review, accepted_by_sms_reply), with the visit's `origin` where the clause asks for it, on rows of the visit's own tenant (the sweep reads under the tenant's claims). `probe_eval` is `hasReArmingSaveAfter` for a given mark, start and instant: the first save of any clause written strictly after the mark and at or before the instant, a `moved` row counting only when the start at the mark (`startAtTheMark`: the `fromStartsAt` of the earliest move after the mark, else the `startsAt` of the latest booking or move at or before it, else none) is distinct from the start the mark is for. The test holds the mirrored code to its bytes at `1bd32c06` (sha256 of `RE_ARMING_SAVES` to the end of `reminder-population.ts`, of `notSavedAfterMark` and `markOf` in `sweep.ts`, and of `notSavedAfterMarkBeforeItWasHandedOver` and `claimOfThisMark` in `sweep-send.ts`), checks `SWEEP_RETRY_AFTER_SAVE_LIMIT_MS` is 3 hours and that `selectDueMarks` applies `notSavedAfterMark`, and checks the clause list. `579b955c` on main carries those files unchanged from `1bd32c06`. Any later change to that code fails the test, and the mirror is re-derived and re-reviewed.

## What changed from the 2026-10-31 read, and why

| What | 2026-10-31 | 2026-11-04 | Why |
|---|---|---|---|
| t0 | the first shadow heartbeat after the Resync (10-25 15:15:19) | the first shadow heartbeat at or after DEPLOYED_AT (a dispatch value) | the code under test is #1678's |
| full days | every day from Monday 10-26 closed by the clock, at least 4 | exactly Monday 11-02 and Tuesday 11-03 | R47 names the two days; the block requires exactly 2 rows of 3, 11 and 12 |
| verdict 2 | t0 before Monday's 07:15 | also: no Monday mark due before t0, and no move written since t0 without `fromStartsAt` | t0 may be Monday's 07:00 pass (the deploy was Sunday 23:07, after the last pass); a Monday mark before t0 would have been the old code's. #1678 makes every move record `fromStartsAt` (`moveAppointment`, the only writer of `appointment.reschedule`), so a move without it since t0 means the old code still served: the premise "the new code ran" is checked from data, not taken from the dispatch |
| verdicts 11 and 12 | VACUOUS on a day with no match (10-30's 48h email read VACUOUS) | OK by the calendar when the day has no mark at all and its visits would start on a Sunday | both clinics are closed on Sunday (strategy's S-1003-A R29); Monday and Tuesday never meet it (their visits start Wednesday and Thursday, or Tuesday and Wednesday); it is written in for later reads |
| verdict 14 | R8 is exactly R22's 10 marks | dropped; the number is not reused | it was the 10-26 to 10-29 count |
| verdict 15 | none | **R24 held**: 0 shadow-only S5 rows due from t0, 0 shadow rows taken after a re-arming save written after their mark, and a control above 0 | the brief's "S5 expects 0", with the doctrine that a zero is never a pass |
| verdict 16 | none | **every label in R32's accepted set**, REVIEW naming any other | R32's third condition, by machine |
| R9 | none | a new candidate label, outside R32's set | see below |
| R34 | none | its predicate (`r34`), printed as row 36 (INFO) | see below |
| the block's closing line | PASSED or REVIEW | PASSED, REVIEW CLEAN UNDER R32, or REVIEW LABELS OUTSIDE R32'S SET | R32 |
| row 23 | none | marks due in the 24 hours before t0 (old code), INFO | the brief: marks before t0 are out of the verdicts, reported |
| row 35 | R8 per day | R8 and R9 per day | |

## The labels

**Kept, unchanged:** R20's S3, S4, S5, S7, R1 to R7 and "sent with neither", and R8 (2026-10-31: `R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)`). Their premises hold under #1678, with one exception that R9 answers (below): R2's and R6's exclusion of a visit restored after its claim assumed that the restore lets the sweep take the mark later. Under R24 a restore that re-arms (`brought_back`) written after the mark keeps the sweep out, so such a mark no longer reads R2 or R6, nor `both` as it did before #1678.

**S5 now expects zero.** A re-arming save after the mark means no shadow row, so S5 (shadow only, saved after its mark and before the pass) has no case left for marks due after t0. It stays a label so such a row is named, and verdict 15 FAILs on any.

**R9, NEW, OUTSIDE R32'S ACCEPTED SET:**

| Side | Category | Why it is not a disagreement |
|---|---|---|
| run only | R9 kept out by R24: a re-arming save after its mark at every pass that could otherwise take it | a run-only mark R20 leaves UNEXPLAINED and R8 does not name, where R22's predicates read every old predicate TRUE at one or more passes in range, and at **every** pass in range either a re-arming save written after the mark was already on the trail (as of that pass's `created_at`) or an old predicate was FALSE (an unknown `?` without such a save keeps it out). Its shape: a visit cancelled at its mark or before the next pass (the sleeping job claimed and suppressed or sent at the mark) and brought back after the mark. Before #1678 the sweep took it after the bring-back and the pair read `both`; under R24 neither the sweep nor the sleeping job's re-plan takes it |

R9 is a candidate, never a pass: a day with an R9 mark reads REVIEW, and verdict 16 reads REVIEW, so strategy reads it before it counts (R32's last sentence). Its limit is R22's (a status change or a move that wrote no row cannot be placed in time). The sweep records nothing for a mark R24 keeps out ("Not taken means not taken at all ... nothing records it", `sweep.ts`), so R9 has no heartbeat testimony as R8 has.

**NO KEPT-START LABEL (R47).** A move after the mark that keeps the start does not count under R33 (R4 round 2 on #1678), so the shadow takes that mark and the pair reads `both`. A run-only row for such a visit is UNEXPLAINED: no label names it, and R9 cannot (that save does not count). Two test cases prove both halves.

**R34, send mode only.** `r34` labels a sweep-sent row (a claim of taker `sweep` since t0, not released, whose first reminder ledger row at or after it is `sent`) when (1) a re-arming save was written after its mark and at or before the claim, (2) a claim of this mark of either taker, not early, not the row itself, was taken at or before the **first** such save, and (3) the selecting pass (the tenant's last `send` heartbeat at or before the claim; the claim's own time when there is none) ran at most 3 hours after the mark, exactly 3 hours inside. A sweep-sent row after such a save that is not R34 is a **sweep-sent S5**, which R36 requires to be zero. The shadow sends nothing, so in this read R34 has no subject: it is **INFO, not a verdict** (row 36), which reads `0 sweep-sent rows, as shadow sends nothing`. A verdict over an empty set would read VACUOUS and stop the block for a reason that is by design; the zero is guarded instead by verdict 6, which FAILs on any sweep claim. The read after the switch reuses `swept` and `r34` and asserts the outside count is 0.

Two sharpenings of the #1678 builder's R34 note (`r34-compare-label-predicate-20261031.md`), both read from the code: the note's condition 2 is "some C0 at or before some save R"; the code (`notSavedAfterMarkBeforeItWasHandedOver`) requires every counting save to be preceded by a claim, which is the same as a claim at or before the **first** save, so a claim between two saves is not R34. And the note allowed C0 to be the send itself; it is excluded (`c0.id <> s.id`), and the save must be written before the send. For strategy to confirm (Q3 below).

## The window and the days

- **t0** is the first `shadow` heartbeat at or after DEPLOYED_AT. The production deploy was Sunday 11-01 23:07 Lisbon, after Sunday's last pass (21:45), so t0 is expected to be **Monday 11-02's 07:00 pass**.
- **Verdict 2 enforces that Monday is a full day under the new code**: VACUOUS when no heartbeat follows the deploy; FAIL when t0 is at or after Monday 07:15 (Monday's first slot missed), when any mark of Monday is due before t0 (the 07:00 pass would have taken it, but the read's window would drop it), or when any move written since t0 lacks `fromStartsAt`.
- **The window of marks** runs from t0 to the read's clock (R20's `c_all`). **Full days**: Monday 11-02 and Tuesday 11-03, each with its heartbeat verdict (3: 60 shadow heartbeats in the 60 slots 07:00 to 21:45 for every tenant) and its two agreement verdicts (11, 12). The read's clock must be at or after Wednesday 07:15 (verdict 1, and the block's own clock check), when Tuesday's last marks have been taken by Wednesday's 07:00 pass.
- **Partial days**: Wednesday 11-04 up to the read's clock (and any day before Monday after t0, none expected). INFO, except verdicts 13, 15 and 16, which read the whole window.
- **Before t0**: marks due in the 24 hours before t0 ran under the old code. Row 23 counts them (both, shadow only, run only, on the key alone); no verdict reads them.

## THE VERDICTS, AND WHAT EACH EXPECTS

A verdict is OK, REVIEW (verdicts 11, 12 and 16 only), VACUOUS or FAIL. **The block exits 0 only when** there is no FAIL and no VACUOUS, no REVIEW outside 11, 12 and 16, verdicts 0, 1, 2, 6 to 10, 13, 15 and 16 each print exactly once, and verdicts 3, 11 and 12 each print exactly twice (17 verdict rows). It then prints one of: **PASSED** (every verdict OK), **REVIEW, CLEAN UNDER R32** (only 11 and 12 read REVIEW: 3, 13 and 16 OK, which are R32's three conditions, and 15 OK), or **REVIEW, LABELS OUTSIDE R32'S SET** (16 reads REVIEW). A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first. **The expected outcome on production is REVIEW, CLEAN UNDER R32** (R2, R4 and R8 mismatches are known to recur), or LABELS OUTSIDE if an R9 or another label appears.

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the clock: at or after 2026-11-04 07:15 Lisbon (Tuesday has closed) | the database clock is at or after it | never | earlier |
| 2 | the window: t0 after DEPLOYED_AT, in or before Monday's 07:00 slot; no Monday mark before it; every move since it records `fromStartsAt` | `Lisbon <t0>; ... 0; ... 0` | no shadow heartbeat after the deploy | t0 at or after Monday 07:15, a Monday mark before t0, or an old-code move since t0 |
| 3 | heartbeats, **one row per full day** (2) | every tenant 60 heartbeats, all `shadow`, in the 60 slots | no tenant | fewer, more, a duplicate slot or a `send` heartbeat |
| 6 | the shadow sent nothing since the deploy | 0 `send` heartbeats, 0 claims by taker `sweep` | no shadow heartbeat after the deploy | any |
| 7 | no pass over the ceiling (50 marks) on the full days | 0 | no shadow heartbeat on the full days | any |
| 8 | the heartbeats account for every shadow row since t0 (R20's) | each pass's `recorded_count` equals its rows | no heartbeat or no shadow row | any difference |
| 9 | no mark taken twice by the shadow (R20's) | 0 | no shadow row | any |
| 10 | nothing falls out of the comparison (R20's) | 0 unplaced, 0 sent with neither | no row since t0 | any |
| 11 | agreement, 48h email, **one row per full day** | at least one match and no mismatch; **or** no mark at all when the visits would start on a Sunday. REVIEW: a match, and every mismatch labelled | t0 NULL, or nothing matched (outside the calendar arm) | any UNEXPLAINED mismatch that day, or a sent with neither |
| 12 | agreement, 24h sms, **one row per full day** | as 11 | as 11 | as 11 |
| 13 | **no mark stays UNEXPLAINED**, any side, any day of the window | 0 | t0 NULL, or no mark | any |
| 15 | **R24 held** | 0 shadow-only S5 rows due in the window; 0 shadow rows taken after a re-arming save written after their mark (as of their own pass); control above 0: marks in the window, by the visit's start now, that a re-arming save after the mark keeps out and that the shadow had not taken before that save, of a visit created before the mark and remindable now | t0 NULL, or the control is 0 (R24 had nothing to act on) | any S5 row, or any shadow row taken after such a save |
| 16 | **every mismatch label is in R32's accepted set** (R2, R4, R8, S5; R34 labels sweep-sent rows, none here), whole window | 0 outside the set. REVIEW: any other label, named with its count (R1, R3, R5, R6, R7, R9, S3, S4, S7). On a partial day the window-edge labels R5 (no pass since its mark) and S7 (due in the 15 minutes before the read) are printed, not judged | t0 NULL, or no mark | never (UNEXPLAINED is verdict 13's) |

The control of verdict 15 counts what the old code would have shown as S5. Under the old code R20 found 16 S5 marks over 5 full days; two days and a morning should give a few. If it is 0, verdict 15 reads VACUOUS and the block STOPs: R24 was not exercised on production, and strategy decides what that means.

**The INFO rows (never counted, not relied on):**

| n | What |
|---|---|
| 20 | DEPLOYED_AT, t0, the read's clock, the last shadow heartbeat (Lisbon), the full days |
| 21 | per Lisbon day of the heartbeats: tenants, rows, shadow rows, slots, outside 07:00 to 21:45, due, recorded, over the ceiling, left out |
| 22 | R11, per full day: distinct pass ids, heartbeat rows, heartbeats with no pass id, tenants per pass, shadow rows written that day |
| 23 | **new:** marks due in the 24 hours before t0 (old code): both, shadow only, run only |
| 30 | per day of the mark and reminder: both, shadow only, run only |
| 31 | the count of each label (R8 and R9 included) per day, reminder and side |
| 32 | what each sleeping-job claim ended as |
| 33 | sleeping-job claims in the window: early, more than once for one start, releases |
| 34 | shadow-only rows whose start the sleeping job claimed early (the withdrawn S1) |
| 35 | R8 and R9 marks per day of the mark and reminder |
| 36 | **new:** R34, send mode only: sweep-sent rows since t0; of them after a re-arming save; of those R34 and outside R34. Reads `0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing` |
| 40 | `SHADOW_SUMMARY`: the full days' totals, `run_r8` and `run_r9` included |
| 50, 51, 52 | the mismatches, shadow only (50), run only (51) and sent with neither (52), with appointment id and label; at most 500 a side, unexplained first. In the file only: the block never prints them |

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A VACUOUS or FAIL verdict stops the block after the table has been written: GREEN reports the lines as printed, and never opens the file.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-shadow-compare-20261104.sql`, sha256 `a96ac09d1880d38198e1deed69b085717d3da41000f5968bcbae74cbcc382c20` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes the 2026-10-31 document pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-shadow-compare-20261104.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD` and its number in `PRNUM`; the block fetches `refs/pull/${PRNUM}/head` and refuses any other sha |
| The deploy | the dispatch names it in `DEPLOYED_AT`, UTC, `2026-11-01` or `2026-11-02`; the block refuses any other form |

**Why the pull request's head and not `main`.** As with the 2026-10-31 read: the pull request need not be merged before GREEN runs it. The block fetches `refs/pull/${PRNUM}/head`, which GitHub keeps after a branch is deleted, and checks out the head commit by its full sha.

## When

At or after Wednesday 2026-11-04 07:15 Lisbon, once the dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it. The block STOPs before reading anything if the Lisbon clock reads earlier than 2026-11-04 07:15, and verdict 1 checks the database's clock as well. A later day is still a valid read of the same two full days (Wednesday onward is partial and read only by 13, 15 and 16). **It assumes the sweep is still in shadow:** once send mode is on, verdict 6 FAILs, and the read is no longer the right instrument.

## Where the output goes

To `/Users/ivan/osteojp-handover/shadow-compare-20261104.out` and nowhere else: it holds appointment ids, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). The block prints only the verdict counts, the number of full days and the R11 rows (row 22, counts only). **GREEN never opens that file**; GREEN reports the printed lines and the file's path; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
DEPLOYED_AT=PENDING
SHAREAD=a96ac09d1880d38198e1deed69b085717d3da41000f5968bcbae74cbcc382c20
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-shadow-compare-20261104.sql
DOC=docs/read-shadow-compare-20261104.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/shadow-compare-20261104.out
echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${DEPLOYED_AT}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]* 2026-11-0[12]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' || { echo "STOP: the head commit, the document's sha256, the pull request number or the deploy time still reads PENDING or is not in its form, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ "${NOW}" -ge 202611040715 ] || { echo "STOP: it is earlier than 2026-11-04 07:15 Lisbon, so Tuesday is not closed yet. Nothing was read"; exit 1; }
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
shasum -a 256 -c docs/read-shadow-compare-20261104.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp.r47_deployed_at = '${DEPLOYED_AT}'" -c "select 'read only: ' || current_setting('transaction_read_only') as shadow_compare_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
DAYS=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (n == "3" && (v == "OK" || v == "REVIEW" || v == "VACUOUS" || v == "FAIL")) d++ } END { printf "%d", d }' ${OUT}) || { echo "STOP: the full days could not be counted. The table is in ${OUT}"; exit 1; }
echo "full days: ${DAYS}"
R11=$(grep -E '^[[:space:]]*22[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no R11 rows (row 22). The table is in ${OUT}"; exit 1; }
echo "${R11}"
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "REVIEW") { if (n == "11" || n == "12") w++; else if (n == "16") l++; else x++ } else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { s = 1; split("0 1 2 6 7 8 9 10 13 15 16", one, " "); for (i in one) if (c[one[i]] != 1) s = 0; if (c["3"] != 2 || c["11"] != 2 || c["12"] != 2 || t != 17) s = 0; if (f + a + x > 0 || s == 0) print "STOP"; else if (w + l == 0) print "PASS"; else if (l == 0) print "CLEAN"; else print "LABELS" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "PASS" ] || [ "${RES}" = "CLEAN" ] || [ "${RES}" = "LABELS" ] || { echo "STOP: the read has a FAIL or a VACUOUS verdict, a REVIEW outside verdicts 11, 12 and 16, a full day count other than 2, or a verdict missing, doubled or extra. The table is in ${OUT}; GREEN does not open it, SOLO reads it"; exit 1; }
grep -qE '^[[:space:]]*40[[:space:]]*[|][[:space:]]*SHADOW_SUMMARY[[:space:]]*[|]' ${OUT} || { echo "STOP: the read printed no SHADOW_SUMMARY row. The table is in ${OUT}"; exit 1; }
[ "${RES}" != "PASS" ] || echo "SHADOW-COMPARE-1104 PASSED: ${CNT%% / 0 REVIEW*} / 0 VACUOUS / 0 FAIL over ${DAYS} full days. The whole table is in ${OUT}; GREEN does not open it, SOLO reads it"
[ "${RES}" != "CLEAN" ] || echo "SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32: no FAIL, no VACUOUS; verdicts 3, 13, 15 and 16 OK over ${DAYS} full days; the agreement verdicts read REVIEW and every mismatch label is in the accepted set of R32. This is NOT a pass by itself: SOLO reads every mismatch in ${OUT} (rows 31, 35, 50 and 51) before anything is decided; GREEN does not open it"
[ "${RES}" != "LABELS" ] || echo "SHADOW-COMPARE-1104 REVIEW, LABELS OUTSIDE R32'S SET: no FAIL, no VACUOUS, but verdict 16 names a label outside the accepted set of R32, which strategy reads before it counts. This is NOT a pass: SOLO reads every mismatch in ${OUT} (rows 16, 31, 35, 50 and 51); GREEN does not open it"
)
```

**EXPECT:** `lisbon now:  <a time at or after 202611040715> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-shadow-compare-20261104.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: <o> OK / <r> REVIEW / 0 VACUOUS / 0 FAIL` (o + r = 17); `full days: 2`; two R11 lines (`22 | passes on 2026-11-02 ...`, `22 | passes on 2026-11-03 ...`); then exactly one of `SHADOW-COMPARE-1104 PASSED: ...`, `SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32: ...` (the expected outcome) or `SHADOW-COMPARE-1104 REVIEW, LABELS OUTSIDE R32'S SET: ...`. Exit 0 for all three. **Neither REVIEW line is a pass:** SOLO reads every mismatch in the file before anything is decided, and R36's switch stays the owner's. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/shadow-compare-20261104.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD`.

**STOP:** any `STOP:` line. The likely ones: `NOT READY` (the dispatch was not filled in); `earlier than 2026-11-04 07:15` (wait, paste again after 07:15); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO writes a new dispatch); `a FAIL or a VACUOUS verdict ...` (the read ran and the table is in the file: report the printed lines and the path; SOLO reads verdicts 2, 13, 15 and 16 and rows 50 to 52).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly, with the dispatch's DEPLOYED_AT between the quotes: `set transaction read only; set local statement_timeout = '120s'; set local osteojp.r47_deployed_at = '<DEPLOYED_AT>';`
3. Below it, paste the whole of `scripts/db/read-shadow-compare-20261104.sql`. To copy it exactly from the pull request's head, type this in Claude Code with the dispatch's PRNUM in place of `<PRNUM>`. It fetches the pull request's head into the main clone's `FETCH_HEAD` only (no checkout, no branch moves), copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! T=$(mktemp) && git -C /Users/ivan/Projects/GitHub/OsteoJP fetch -q origin refs/pull/<PRNUM>/head && git -C /Users/ivan/Projects/GitHub/OsteoJP show FETCH_HEAD:scripts/db/read-shadow-compare-20261104.sql > "${T}" && [ "$(shasum -a 256 "${T}" | cut -d' ' -f1)" = "a96ac09d1880d38198e1deed69b085717d3da41000f5968bcbae74cbcc382c20" ] && pbcopy < "${T}" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run, at or after Wednesday 2026-11-04 07:15 Lisbon. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1, 2, 6 to 10, 13 and 15 must read `OK`; the two rows 3 must read `OK`. Rows 11, 12 and 16 read `OK` or `REVIEW`: **REVIEW is not a pass**, and a table with any REVIEW, FAIL or VACUOUS goes to SOLO whole, before anything is decided.
5. Send the whole table to SOLO privately (it holds counts, Lisbon times and, in rows 50 to 52, appointment ids; no name, phone or email). Do not post it anywhere public.

The editor runs the text as one transaction, so the first line makes the server refuse any write.

## Rehearsal (2026-11-02, throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database (the local stack `OsteoJP-blue`, database on 127.0.0.1:54622) with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base. Two synthetic tenants (the second with no visit, heartbeating with nothing due); 10 synthetic visits Monday 11-02 to Friday 11-06 at 10:00 and 15:00 Lisbon, each with an `appointment.create` audit row dated 10-01 carrying its start; a shadow heartbeat every 15 minutes, 07:00 to 21:45, from Sunday 11-01 07:00 (before the rehearsal's deploy, Sunday 15:20, so t0 is the 15:30 pass) to Wednesday 07:45; for every mark due from Sunday 00:00 to Wednesday 07:45 a sleeping-job claim at the mark plus 2 seconds, a `sent` ledger row, and a shadow row in the transaction of the first pass at or after the mark; each heartbeat's counts equal its rows and record 5 visits left out. Monday and Tuesday each carry 2 matched marks of each reminder; Sunday's 4 marks fall before t0 (row 23 reads `4, 0, 0`). Three appointment foreign keys (patient, practitioner, location) are dropped in the throwaway so no synthetic person or clinic is made; the read reads none of those tables. The read ran as the block runs it (`begin read only`, 120 seconds, `set local osteojp.r47_deployed_at`, `rollback`), with ONE substitution: its single clock line `select now() as t1` replaced by Wednesday 2026-11-04 08:00 Lisbon (unless the case says otherwise). The test runs these cases whenever `SHADOW_COMPARE_1104_TEST_PGURL` names a local database, and refuses any other host; the throwaways are dropped by the test.

**Run of 2026-11-02, 00:45 Lisbon (lane blue): the deploy time unset, then 74 cases, the test's database part 1 of 1 passing.** Every case below met its expectation exactly (the test compares every verdict, and the named INFO rows); each MUTANT is also asserted not to meet its unmutated case's expectation (for R34's two, not to print its row 36). Verdict 15 reads VACUOUS wherever no mark had to be kept out by R24: that is its control. The base reads 16 OK and 15 VACUOUS.

| Case | Verdicts not OK |
|---|---|
| clean | 15=VACUOUS |
| empty: no heartbeat and no claim at all | 2=VACUOUS, 3 2026-11-02=FAIL, 3 2026-11-03=FAIL, 6=VACUOUS, 7=VACUOUS, 8=VACUOUS, 9=VACUOUS, 10=VACUOUS, 11 2026-11-02=VACUOUS, 11 2026-11-03=VACUOUS, 12 2026-11-02=VACUOUS, 12 2026-11-03=VACUOUS, 13=VACUOUS, 15=VACUOUS, 16=VACUOUS |
| null window: every heartbeat removed, the claims and shadow rows left in place | 2=VACUOUS, 3 2026-11-02=FAIL, 3 2026-11-03=FAIL, 6=VACUOUS, 7=VACUOUS, 8=VACUOUS, 9=VACUOUS, 10=VACUOUS, 11 2026-11-02=VACUOUS, 11 2026-11-03=VACUOUS, 12 2026-11-02=VACUOUS, 12 2026-11-03=VACUOUS, 13=VACUOUS, 15=VACUOUS, 16=VACUOUS |
| the deploy after Monday's 07:00 slot (08:00): verdict 2 FAILs, and Monday's heartbeats since the deploy are short | 2=FAIL, 3 2026-11-02=FAIL, 15=VACUOUS |
| the deploy at Monday 06:50: t0 is the 07:00 pass, in the first slot, OK | 15=VACUOUS |
| the deploy at Monday 06:50 and a Monday mark due at 03:00: Monday is not wholly under the new code, verdict 2 FAILs | 2=FAIL, 15=VACUOUS |
| a move written since t0 without fromStartsAt: the old code was still serving, verdict 2 FAILs | 2=FAIL, 15=VACUOUS |
| R24 held: a visit moved after its 48h mark to a start whose mark is past; neither side takes it, the control counts it, verdict 15 OK | all OK |
| R24 violated: the same, and the shadow took the new start's past mark after the move: S5, verdict 15 FAILs | 11 2026-11-02=REVIEW, 15=FAIL |
| a move that keeps the start, after the mark and before the pass: it does not count (R33), the shadow takes it, `both` | 15=VACUOUS |
| a move that keeps the start, after the mark, and NO shadow row: run only, UNEXPLAINED (no kept-start label, not R9) | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| moved away and back after the mark: the start at the mark is the earliest move's fromStartsAt, kept, the shadow takes it | 15=VACUOUS |
| a kept-start move whose fromStartsAt is null: the start at the mark falls to the booking row's startsAt (rule 2), kept | 15=VACUOUS |
| a re-arming save written AT the mark exactly does not count (strictly after): the shadow takes it | 15=VACUOUS |
| R9: cancelled at its mark (the sleeping job suppressed it), brought back after the mark; under R24 the sweep never takes it | 12 2026-11-02=REVIEW, 16=REVIEW |
| R9 negative: brought back to scheduled on an online request (not a re-arming save): UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| R9 negative: a pass with every old predicate true before any re-arming save (cancelled at 13:05, after the 13:00 pass; brought back at 13:20): UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL |
| R9 negative: an unknown status at a pass before the bring-back, with no save yet: UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL |
| R9 negative: no pass had every old predicate true (a live sweep claim of the key before the mark): UNEXPLAINED | 6=FAIL, 12 2026-11-02=FAIL, 13=FAIL |
| R8 is unchanged: a visit with no scheduling save before any pass; its day REVIEW, verdict 16 OK (R8 is in R32's set) | 12 2026-11-02=REVIEW, 15=VACUOUS |
| R2 is unchanged: cancelled at its mark, never brought back; its day REVIEW, verdict 16 OK | 12 2026-11-02=REVIEW, 15=VACUOUS |
| R1 on a full day is outside R32's set: its day REVIEW, verdict 16 REVIEW naming it | 12 2026-11-02=REVIEW, 16=REVIEW |
| R5 on the partial Wednesday (a mark at 07:50, no pass since): printed, not judged by verdict 16 | 15=VACUOUS |
| shadow only: the sleeping job's claim for Tuesday's 24h SMS at 10:00 removed | 12 2026-11-03=FAIL, 13=FAIL, 15=VACUOUS |
| run only: the shadow row for Monday's 48h email at 10:00 removed (a booked visit, no save after the mark: not R8, not R9) | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| sent with neither: a reminder send with no claim and no shadow row FAILs verdict 10, its day and 13 | 10=FAIL, 12 2026-11-03=FAIL, 13=FAIL, 15=VACUOUS |
| Tuesday has no 48h mark at all, its visits start on Thursday: VACUOUS, never OK | 11 2026-11-03=VACUOUS, 15=VACUOUS |
| CALENDAR: the same, with the closed weekday pointed at Thursday: OK by the calendar | 15=VACUOUS |
| R34's predicate on seeded send-mode rows (Sunday, after t0): 4 sweep-sent, 3 after a re-arming save, 1 R34, 2 outside | 6=FAIL |
| missing heartbeat: Tuesday 12:00 | 3 2026-11-03=FAIL, 15=VACUOUS |
| a send heartbeat | 6=FAIL, 15=VACUOUS |
| a pass over the ceiling on Monday | 7=FAIL, 15=VACUOUS |
| a heartbeat whose recorded count is one short | 8=FAIL, 15=VACUOUS |
| a mark taken twice | 9=FAIL, 15=VACUOUS |
| a claim with no mark | 10=FAIL, 15=VACUOUS |
| the read's clock at Wednesday 07:10: Tuesday is not closed, verdict 1 FAILs | 1=FAIL, 15=VACUOUS |
| MUTANT (R20's): the shadow set is dead | 11 2026-11-02=FAIL, 11 2026-11-03=FAIL, 12 2026-11-02=FAIL, 12 2026-11-03=FAIL, 13=FAIL, 15=VACUOUS |
| MUTANT (R20's): the slot count is dead | 3 2026-11-02=FAIL, 3 2026-11-03=FAIL, 15=VACUOUS |
| CLAUSE booked: a booking row after the mark: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE accepted_in_pedidos: an online request accepted in Pedidos: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE near miss: an update by another way: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE accepted_with_estado: an online request set to Confirmada: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE near miss: a booked visit set to Confirmada by hand (status only): re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE brought_back: Cancelada to Confirmada: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE brought_back: Cancelada to Agendada on a booked visit: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE near miss: Cancelada to Agendada on an online request: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE accepted_in_sms_review: a review-queue confirmada applied on an online request: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE near miss: the same on a booked visit: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE near miss: the same on an online request, not applied: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE accepted_by_sms_reply: the patient's SMS confirmo on an online request: counts, the shadow's row after it FAILs verdict 15 | 15=FAIL |
| CLAUSE near miss: the patient's SMS confirmo on a booked visit: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE near miss: the patient's SMS cancel on an online request: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| CLAUSE near miss: a booking row written under another tenant: re-arms nothing, the shadow takes the mark | 15=VACUOUS |
| MUTANT: every move counts (the start-at-the-mark rule dead), on "a move that keeps the start, after the mark and before the pass" | 15=FAIL |
| MUTANT: every move counts, on the run-only case: R9 would name a kept start, on "a move that keeps the start, after the mark, and NO shadow row" | 11 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: rule 1 reads the LATEST move after the mark, on "moved away and back after the mark" | 15=FAIL |
| MUTANT: rule 2 dead, on "a kept-start move whose fromStartsAt is null" | 15=FAIL |
| MUTANT: a save AT the mark counts, on "a re-arming save written AT the mark exactly" | 15=FAIL |
| MUTANT: brought_back without its origin condition, on "R9 negative: brought back to scheduled on an online request" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: accepted_with_estado without its origin condition, on "CLAUSE near miss: a booked visit set to Confirmada by hand" | 15=FAIL |
| MUTANT: accepted_in_sms_review without applied, on "CLAUSE near miss: the same on an online request, not applied" | 15=FAIL |
| MUTANT: accepted_by_sms_reply without its origin condition, on "CLAUSE near miss: the patient's SMS confirmo on a booked visit" | 15=FAIL |
| MUTANT: the visit's own tenant dropped, on "CLAUSE near miss: a booking row written under another tenant" | 15=FAIL |
| MUTANT: R9 without a pass where every old predicate held, on "R9 negative: no pass had every old predicate true" | 6=FAIL, 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: R9 lets a pass with every old predicate true and no save through, on "R9 negative: a pass with every old predicate true before any re-arming save" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: R9 lets an unknown pass with no save through, on "R9 negative: an unknown status at a pass" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: verdict 2 without the Monday-mark condition, on "the deploy at Monday 06:50 and a Monday mark due at 03:00" | 15=VACUOUS |
| MUTANT: verdict 2 without the old-code-move condition, on "a move written since t0 without fromStartsAt" | 15=VACUOUS |
| MUTANT: the calendar arm without its Sunday, on "Tuesday has no 48h mark at all" | 15=VACUOUS |
| MUTANT: verdict 16 judges the window-edge labels of a partial day, on "R5 on the partial Wednesday" | 15=VACUOUS, 16=REVIEW |
| MUTANT: verdict 15's S5 count dead, on "R24 violated" | 11 2026-11-02=REVIEW |
| MUTANT: verdict 15's control dead, on "R24 held" | 15=VACUOUS |
| MUTANT: R34's cap at 5 hours, on "R34's predicate" | 6=FAIL |
| MUTANT: R34 without the claim before the first save, on "R34's predicate" | 6=FAIL |

The deploy time unset: the read stops with `unrecognized configuration parameter "osteojp.r47_deployed_at"` and prints no table.

**Mutation sweep of this read's own predicates: 21 mutants, 21 killed** (the MUTANT rows above, other than R20's two). Survivors by design, not run: `accepted_in_pedidos` and `booked` have no condition beyond their action; `c0.id <> s.id` (only an equal instant of a save and the send could reach it); the tenant filters of the start-at-the-mark subqueries (the save's own tenant filter is mutated); `swept`'s release and ledger conditions, `subj`'s created and status conditions and row 23, which feed only a control or an INFO row. Verdict 15's two FAIL conditions are mutated together: either alone still catches the R24-violated case.

## Known limits

- R20's three "sent with neither" limits and R22's reconstruction limits stand unchanged and bound R8 and R9 (`docs/read-shadow-compare-20261029.md` and `docs/read-sweep-unexplained-20261030.md`, "Known limits").
- **The two clocks.** A save is stamped with its transaction's start; the sweep reads at its pass. A save whose transaction started before a pass but committed after the pass's snapshot is counted by this read as written before that pass, so a shadow row taken in that race reads as taken after the save and FAILs verdict 15. #1678's own header names the related second-scale gap ("a save in the last seconds before a mark counts as before it here while the job drops that mark ... the compare reads it as a shadow row alone"): such a row is shadow only, matches no label, and reads UNEXPLAINED (verdict 13 FAILs). Neither has been seen; either goes to strategy with the visit's trail.
- **#1678's own gap carries over.** The patient's move in the portal (`rescheduleOwn`) and the importer change `starts_at` with no audit row, so the start at the mark can be read stale (the header of `reminder-population.ts`, "THE GAP THAT REMAINS"). The read mirrors the sweep exactly, so the two agree with each other there; against the sleeping job, such a visit can read run only or shadow only with no label (UNEXPLAINED).
- **Verdict 15's control is a count, not a reconstruction.** It counts marks a re-arming save after the mark keeps out, of a visit created before the mark and remindable now, that the shadow had not taken before the save. A visit that another predicate also excluded (no scheduling save, say) is counted too. It proves R24 had subjects, not that each was decided by R24 alone.
- **R9 needs an unknown-free trail.** A pass where a status cannot be placed (`?`) and no re-arming save is yet written keeps a mark out of R9, so it stays UNEXPLAINED.
- **R34 is rehearsed on seeded rows only.** No sweep-sent row has existed on production; the label reads the claim's and the send heartbeat's times as #1678 writes them, and the read after the switch is its first real subject.
- Survivors of the mutation sweep, by design (see the rehearsal): `accepted_in_pedidos` and `booked` have no condition beyond their action to mutate; `c0.id <> s.id` can change the result only when a save and the send share an instant; the tenant filters of the start-at-the-mark rules are not mutated separately (the save's own tenant filter is).

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the block's production path is NOT REHEARSED: the environment file, the target guard against the real target, the connection and the psql call through the block, and `git fetch origin refs/pull/${PRNUM}/head` against GitHub in the real apply checkout. What stands in for it: the SQL run above with exactly the block's psql arguments (the deploy setting included) and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub (psql's stub refuses a call that does not set the deploy time the dispatch names), fails each call in turn, and proves every halt is explicit and that each of the three closing lines prints only on its own profile.

The owner's fallback copy step (it fetches from GitHub) is NOT REHEARSED.

Not measured: the read's run time on production's row counts. Its inputs are the 2026-10-31 read's (which ran inside 120 seconds over six days) over fewer days, plus the re-arming-save probes, whose audit reads are limited to the visits they ask about and to audit rows written in the window; 120 seconds is the bound.

## For strategy to confirm: the defaults this builder took (2026-11-01)

**Q1. R9, a new candidate label.** R2's and R6's "restored after the claim" exclusion assumed the sweep takes the mark after a restore; under R24 a restore that re-arms keeps it out. Rather than let such a mark read UNEXPLAINED (verdict 13 FAIL, block STOP), it reads R9, outside R32's accepted set, so the block reports REVIEW, LABELS OUTSIDE R32'S SET and strategy reads it. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM; the alternative is to drop R9 and let those marks FAIL verdict 13.

**Q2. Verdict 15's control.** A zero is never a pass, so verdict 15 reads VACUOUS (block STOP) when no mark in the window was saved after its mark by a re-arming save. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q3. R34's predicate**, sharpened from the #1678 builder's note as described under "The labels" (the first save, not some save; the send itself is not its own earlier claim). INFO here; it becomes a verdict in the read after the switch. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q4. Verdict 16 on partial days.** R32's accepted set is applied to the whole window, except that R5 and S7, which only describe the read's own edge on a partial day, are printed and not judged there. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.

**Q5. Verdict 2's two premises** (no Monday mark before t0; no move since t0 without `fromStartsAt`) are FAIL conditions, not information. DEFAULT TAKEN, FOR STRATEGY TO CONFIRM.
