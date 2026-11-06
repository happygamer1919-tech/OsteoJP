# SHADOW-COMPARE, 2026-11-04 (R47): the reminder sweep's shadow against the sleeping job over Monday 11-02 and Tuesday 11-03, under #1678's code

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-11-01 by SOLO's builder; R4 ROUND 1 ON `0472fea0` (#1691): SHIP AFTER FIXES, TEN FINDINGS, ALL ANSWERED; R4 ROUND 2 ON `b09a0b7a`: SHIP AFTER FIXES, SIX MINOR, ALL DOCUMENT OR DISPATCH TEXT, ALL ANSWERED, THE SQL AND THE BLOCK UNCHANGED BY THAT ROUND; ROW 37 ADDED AFTER THAT ROUND (R4 ON #1692), NO VERDICT, YET SINCE 2026-11-02 IT GATES THE SWITCH (above 5 on the closing line, no switch until strategy re-rules), AND R4 ON 2026-11-02 READ ITS QUERY: IT MATCHES ITS DESCRIPTION; IT COUNTS CLAIMS, NOT VISITS, AND DOES NOT CHECK THE VISIT IS STILL AT THAT START, BOTH OF WHICH PUSH THE COUNT UP, THE SAFE DIRECTION; STRATEGY RULED Q1 TO Q6 AND Q9 ON 2026-11-02 (see "Ruled by strategy, 2026-11-02"); THE CHANGES MADE FOR THAT RULING ON 2026-11-02 (the block reads row 37 and prints its count on every closing line, Q9(a); the ruled answers quoted; the R34 limit's record); R4 ON THOSE CHANGES (`8bf8a961`): SHIP AFTER FIXES, TWO MINOR (the switch time is 21:50, strategy's Q8; the snapshot named on the closing line) AND THREE NITS, ALL ANSWERED ON THE BYTES BELOW, NOT YET RE-REVIEWED; THE SQL IS UNCHANGED BY ANY OF THEM; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below, on these same SQL bytes); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-shadow-compare-20261104.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED").** The block's four value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit, `PRNUM` its number, and `DEPLOYED_AT` the instant #1678 went live in production, all named by SOLO.

## Why this read exists

The 2026-10-31 compare (`docs/read-shadow-compare-20261031.md`, #1679) read the shadow against the sleeping job from Monday 10-26 and left four labels on the full days: R2 (both suppress), R4 and R8 (never reminded, by design until the switch) and S5 (the shadow took a mark the sleeping job had dropped, because the visit was saved after the mark). #1678 (merged as `579b955c`, reviewed head `1bd32c06`) changes the sweep so that S5 cannot happen: **R24/R33**, a mark is not taken while the visit's audit trail holds a re-arming save (`RE_ARMING_SAVES`, `apps/web/lib/reminders/reminder-population.ts`) written strictly after the mark, and a move counts only when the start at the mark differs from the start now; and **R34**, the sending pass's held-back retry survives such a save for at most 3 hours after the mark.

Strategy's rulings for this compare, verbatim:

- R32: "A compare reading REVIEW counts as the clean verdict when all of these hold: zero UNEXPLAINED anywhere; 60 of 60 passes on every full day; every label is in the accepted set: R2 (both suppress), R4 and R8 (never-reminded, by design until the switch), S5 (late mark, removed by R24), and the held-back label of R34. Any other label is read by strategy before it counts."
- R47: "Compare Wed 11-04 after 07:15. Its dispatch is READY by Tue 21:00, with R34's label and no kept-start label."
- R36: "If clean under R32, with zero sweep-sent S5 rows: the owner sets REMINDERS_SWEEP_MODE=send and REMINDERS_SWEEP_NEVER_REMINDED=on together".

This read compares the two full days under the new code, asserts that R24 held (no shadow row taken after a re-arming save), and judges each of R32's three conditions by machine: verdict 3 (60 of 60), verdict 13 (zero UNEXPLAINED anywhere) and verdict 16 (every label in the accepted set). It decides nothing, and it writes nothing.

## What it reads

`scripts/db/read-shadow-compare-20261104.sql`, sha256 `ce3e137059b21f47765f779cabc885198f3de9735a6fb4544f4bd33cd9278cd4`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times, the fixed labels of offsets (`48h`, `24h`), channels (`email`, `sms`), ledger outcomes, suppression reasons and label letters, and, in the mismatch list only, appointment ids (at most 500 a side, in the file only). No tenant id, patient id or staff id, no name, phone, email address, message text or note, and no audit metadata text: metadata is compared, never printed. This is exactly what the 2026-10-31 read printed, and nothing more.

**One value from outside.** The deploy instant is read from the setting `osteojp.r47_deployed_at`, which the block sets with `set local` inside the read-only transaction from the dispatch's `DEPLOYED_AT` (UTC, `YYYY-MM-DDTHH:MM:SSZ`, checked by the block's first line). Unset, the read stops with an error and prints no table (a test case proves it).

**How it is built, so a reviewer reads only what is new.** Three parts, in this order:

1. **R20, lines 117 to 416 of the read**: R20's lines 145 to 444 (`scripts/db/read-shadow-compare-20261029.sql`, on main, #1670), with exactly two substitutions: the body of `k` (three lines: `resync` holds DEPLOYED_AT, `first_full_pass` is Monday 2026-11-02 07:00 and `closes` Wednesday 2026-11-04 07:15 Lisbon) and the body of `full_day` (one line: Monday 11-02 and Tuesday 11-03, fixed). The test applies them to R20's file and compares the result with the read exactly. The column keeps the name `resync` so the rest of R20 is byte for byte; here it is the deploy. R20's window, sides, key and labels S3 to S7 and R1 to R7 are R20's.
2. **R22, lines 420 to 593 of the read**: R22's lines 413 to 586 (`scripts/db/read-sweep-unexplained-20261030.sql`, on main, #1672), byte for byte, the span the 2026-10-31 read pinned (sha256 `c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d`; the test now compares it with main exactly as well). The sweep's old selection predicates P1 to P8 as of each pass, for every run-only UNEXPLAINED mark.
3. **This read's own**: `r8` (the 2026-10-31 read's, unchanged), `swept`, `probe`, `rearm_rows`, `probe_eval` (#1678's re-arming saves as SQL), `rk`, `pcl`, the verdicts and the rows.

**#1678 as SQL.** `rearm_rows` is `RE_ARMING_SAVES` and `reArmingClause` at `1bd32c06`, clause by clause (booked, moved, accepted_in_pedidos, accepted_with_estado, brought_back, accepted_in_sms_review, accepted_by_sms_reply), with the visit's `origin` where the clause asks for it, on rows of the visit's own tenant (the sweep reads under the tenant's claims). `probe_eval` is `hasReArmingSaveAfter` for a given mark, start and instant: the first save of any clause written strictly after the mark and at or before the instant, a `moved` row counting only when the start at the mark (`startAtTheMark`: the `fromStartsAt` of the earliest move after the mark, else the `startsAt` of the latest booking or move at or before it, else none) is distinct from the start the mark is for. The test holds the mirrored code to its bytes at `1bd32c06` (sha256 of `RE_ARMING_SAVES` to the end of `reminder-population.ts`, of `notSavedAfterMark` and `markOf` in `sweep.ts`, and of `notSavedAfterMarkBeforeItWasHandedOver` and `claimOfThisMark` in `sweep-send.ts`), checks `SWEEP_RETRY_AFTER_SAVE_LIMIT_MS` is 3 hours and that `selectDueMarks` applies `notSavedAfterMark`, and checks the clause list. `579b955c` on main carries those files unchanged from `1bd32c06`. Any later change to that code fails the test, and the mirror is re-derived and re-reviewed.

## What changed from the 2026-10-31 read, and why

| What | 2026-10-31 | 2026-11-04 | Why |
|---|---|---|---|
| t0 | the first shadow heartbeat after the Resync (10-25 15:15:19) | the first shadow heartbeat at or after DEPLOYED_AT (a dispatch value) | the code under test is #1678's |
| full days | every day from Monday 10-26 closed by the clock, at least 4 | exactly Monday 11-02 and Tuesday 11-03 | R47 names the two days; the block requires exactly 2 rows of 3, 11 and 12 |
| verdict 2 | t0 before Monday's 07:15 | also: every Monday mark due before t0 on both sides, and no move without `fromStartsAt` from DEPLOYED_AT + 13 hours | t0 may be Monday's 07:00 pass (the deploy was Sunday 23:07, after the last pass). A Monday mark before t0 on one side only would be a mismatch the window drops; on both sides it is harmless (a 07:00:00 mark, t0 at 07:00:0x, no pass between). #1678 makes every move record `fromStartsAt` (`moveAppointment`, the only writer of `appointment.reschedule`), so a move without it means the old code served it: the premise "the new code ran" is checked from data. Skew Protection (maximum age 12 hours, card SKEW-01) can route a stale tab's move to the old deployment, and that row is harmless (`startAtTheMark` falls to its rule 2), so before the 13 hours it is printed, not judged |
| verdicts 11 and 12 | VACUOUS on a day with no match (10-30's 48h email read VACUOUS) | OK by the calendar when the day has no mark at all and its visits would start on a Sunday | both clinics are closed on Sunday (strategy's S-1003-A R29); Monday and Tuesday never meet it (their visits start Wednesday and Thursday, or Tuesday and Wednesday); it is written in for later reads |
| verdict 14 | R8 is exactly R22's 10 marks | dropped; the number is not reused | it was the 10-26 to 10-29 count |
| verdict 15 | none | **R24 held**: 0 shadow rows taken after a re-arming save written after their mark (the exact mirror of the gate; read for every shadow row due in the window or written since t0); S5 rows printed; a control | the brief's "S5 expects 0", made exact: R20's S5 also matches a move that keeps the start, which R33 says is correct |
| verdict 16 | none | **every label in R32's accepted set**, REVIEW naming any other, an S5 row with no re-arming save behind it (`S5K`) included | R32's third condition, by machine; R47 ruled no kept-start label, so strategy reads such a row |
| RK, S8 | none | two new candidate labels, outside R32's set | see below |
| R34 | none | its predicate (`r34`), printed as row 36 (INFO) | see below |
| the block's closing line | PASSED or REVIEW | PASSED, REVIEW CLEAN UNDER R32, REVIEW CLEAN UNDER R32 R24 NOT EXERCISED, or REVIEW LABELS OUTSIDE R32'S SET; each says what happens next, and each carries row 37's count (above 5: no switch until strategy re-rules) | R32, R36 and strategy's Q9(a) |
| row 23 | none | marks due in the 24 hours before t0, INFO | the brief: marks before t0 are out of the agreement verdicts, reported |
| row 35 | R8 per day | R8 and RK per day | |

## The labels

**Kept, unchanged:** R20's S3, S4, S5, S7, R1 to R7 and "sent with neither", and R8 (2026-10-31: `R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)`). Their premises hold under #1678, with one exception that RK answers (below): R2's and R6's exclusion of a visit restored after its claim assumed that the restore lets the sweep take the mark later. Under R24 a restore that re-arms (`brought_back`) written after the mark keeps the sweep out, so such a mark no longer reads R2 or R6, nor `both` as it did before #1678.

**S5 is printed, and verdict 15 does not FAIL on it.** A re-arming save after the mark means no shadow row, so R24's own S5 has no case left. Yet R20's S5 predicate matches any move after the mark to this start, a move that keeps the start included, and if the sleeping job has no claim (an unaccepted request given such a move, or a move in the seconds between the mark and the job's claim) the row is shadow only and reads S5 though R24 held. So verdict 15 FAILs only on `taken_after_save`, the exact mirror of the gate, and an S5 row whose probe is not `rearmed` is named `S5K` by verdict 16, which reads REVIEW: R47 ruled no kept-start label, so strategy reads it.

**S8, NEW, OUTSIDE R32'S ACCEPTED SET:** `S8 a re-arming save in the 30 seconds up to its mark: the sleeping job dropped it, the sweep took it`. A shadow-only mark R20 leaves UNEXPLAINED whose visit has a re-arming save (of any clause, a move that keeps the start included: all of them re-plan the job) written from 30 seconds before the mark up to the mark. The sweep reads that save as before the mark and takes it; the job handles it after its 2 second debounce and drops the mark (`sweep.ts`, "THE TWO CLOCKS DIFFER BY SECONDS"). It reads REVIEW, nothing hidden, and strategy reads it.

**RK, NEW, OUTSIDE R32'S ACCEPTED SET:**

| Side | Category | Why it is not a disagreement |
|---|---|---|
| run only | RK kept out by R24: a re-arming save after its mark at every pass that could otherwise take it | a run-only mark R20 leaves UNEXPLAINED and R8 does not name, where R22's predicates read every old predicate TRUE at one or more passes in range, and at **every** pass in range either a re-arming save written after the mark was already on the trail (as of that pass's `created_at`) or an old predicate was FALSE (an unknown `?` without such a save keeps it out). Its shape: a visit cancelled at its mark or before the next pass (the sleeping job claimed and suppressed or sent at the mark) and brought back after the mark. Before #1678 the sweep took it after the bring-back and the pair read `both`; under R24 neither the sweep nor the sleeping job's re-plan takes it |

RK is a candidate, never a pass: a day with an RK mark reads REVIEW, and verdict 16 reads REVIEW, so strategy reads it before it counts (R32's last sentence). Its limit is R22's (a status change or a move that wrote no row cannot be placed in time). The sweep records nothing for a mark R24 keeps out ("Not taken means not taken at all ... nothing records it", `sweep.ts`), so RK has no heartbeat testimony as R8 has.

**NO KEPT-START LABEL (R47).** A move after the mark that keeps the start does not count under R33 (R4 round 2 on #1678), so the shadow takes that mark and the pair reads `both`. A run-only row for such a visit is UNEXPLAINED: no label names it, and RK cannot (that save does not count). A shadow-only row for such a visit (the sleeping job has no claim) reads S5 in row 31, is named `S5K` by verdict 16, and reads REVIEW: strategy reads it. Test cases prove all three halves.

**R34, send mode only.** `r34` labels a sweep-sent row (a claim of taker `sweep` since t0, not released, whose first reminder ledger row at or after it is `sent`) when (1) a re-arming save was written after its mark and at or before the claim, (2) a claim of this mark of either taker, not early, not the row itself, was taken at or before the **first** such save, and (3) the selecting pass (the tenant's last `send` heartbeat at or before the claim; the claim's own time when there is none) ran at most 3 hours after the mark, exactly 3 hours inside. A sweep-sent row after such a save that is not R34 is a **sweep-sent S5**, which R36 requires to be zero. The shadow sends nothing, so in this read R34 has no subject: it is **INFO, not a verdict** (row 36), which reads `0 sweep-sent rows, as shadow sends nothing`. A verdict over an empty set would read VACUOUS and stop the block for a reason that is by design; the zero is guarded instead by verdict 6, which FAILs on any sweep claim. The read after the switch reuses `swept` and `r34` and asserts the outside count is 0.

Two sharpenings of the #1678 builder's R34 note (`r34-compare-label-predicate-20261031.md`), both read from the code: the note's condition 2 is "some C0 at or before some save R"; the code (`notSavedAfterMarkBeforeItWasHandedOver`) requires every counting save to be preceded by a claim, which is the same as a claim at or before the **first** save, so a claim between two saves is not R34. And the note allowed C0 to be the send itself; it is excluded (`c0.id <> s.id`), and the save must be written before the send. Strategy accepted both on 2026-11-02 (Q3 below), and ruled that the selecting pass and the save bound be fixed before Thursday's read reuses the predicate: see "Known limits".

## The window and the days

- **t0** is the first `shadow` heartbeat at or after DEPLOYED_AT. The production deploy was Sunday 11-01 23:07 Lisbon, after Sunday's last pass (21:45), so t0 is expected to be **Monday 11-02's 07:00 pass**. The dispatch's `DEPLOYED_AT` is `2026-11-01T23:07:00Z` (Lisbon is UTC in November; the Inngest sync finished at 23:07:13). No pass runs between 21:45 and 07:00, so the seconds cannot move t0.
- **Verdict 2 enforces that Monday is a full day under the new code**: VACUOUS when no heartbeat follows the deploy; FAIL when t0 is at or after Monday 07:15 (Monday's first slot missed), when a mark of Monday due before t0 is on one side only (the window would drop that mismatch), or when a move written from DEPLOYED_AT + 13 hours lacks `fromStartsAt`. A Monday mark before t0 on both sides, and an earlier move without the key (Skew Protection), are printed.
- **The window of marks** runs from t0 to the read's clock (R20's `c_all`). **Full days**: Monday 11-02 and Tuesday 11-03, each with its heartbeat verdict (3: 60 shadow heartbeats in the 60 slots 07:00 to 21:45 for every tenant) and its two agreement verdicts (11, 12). The read's clock must be at or after Wednesday 07:15 (verdict 1, and the block's own clock check), when Tuesday's last marks have been taken by Wednesday's 07:00 pass.
- **Partial days**: Wednesday 11-04 up to the read's clock (and any day before Monday after t0, none expected). INFO, except verdicts 13, 15 and 16, which read the whole window.
- **Before t0**: row 23 counts the marks due in the 24 hours before t0 (both, shadow only, run only, on the key alone), and no agreement verdict reads them. They are not all the old code's: with t0 at Monday's 07:00 pass, a mark due overnight is taken by that pass, under the new code, because the sweep has no late limit. So verdict 15 reads every shadow row written since t0, whatever its mark.

## THE VERDICTS, AND WHAT EACH EXPECTS

A verdict is OK, REVIEW (verdicts 11, 12 and 16 only), VACUOUS or FAIL. **The block exits 0 only when** there is no FAIL, no VACUOUS other than verdict 15's, no REVIEW outside 11, 12 and 16, verdicts 0, 1, 2, 6 to 10, 13, 15 and 16 each print exactly once, and verdicts 3, 11 and 12 each print exactly twice (17 verdict rows). It then prints one closing line. **PASSED** (every verdict OK) or **REVIEW, CLEAN UNDER R32** (only 11 and 12 read REVIEW: 3, 13 and 16 OK, R32's three conditions, and 15 OK, so R32 counts it as the clean verdict): SOLO confirms the file, then R36's switch is the owner's, after 21:50. **REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED** (the same with verdict 15 the only VACUOUS): strategy answers first. **REVIEW, LABELS OUTSIDE R32'S SET** (16 reads REVIEW, with or without 15's VACUOUS): strategy reads first, no switch until then. When 15 reads VACUOUS and 16 reads REVIEW, the closing line is this one and does not mention R24: the `verdicts:` line shows the VACUOUS, and strategy answers both before any switch. Any **STOP**: no switch, SOLO reports to strategy. A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first. **SOLO's confirm step**, from row 2 of the file: `moves since the deploy` minus `without it before that` is above 0, so at least one move carries `fromStartsAt` and the new code is seen serving. If it is 0, SOLO says so to strategy before the switch. **The expected outcome on production is REVIEW, CLEAN UNDER R32** (R2, R4 and R8 mismatches are known to recur), or LABELS OUTSIDE if RK, S8, S5K or another label appears.

**Row 37 on every closing line (strategy's Q9(a), 2026-11-02).** Strategy's words: "Wednesday's compare prints the count of known early-copy pairs that would follow the switch. If it is above 5, strategy re-rules before the switch, so print it on the compare's summary line." **"The compare's summary line" is taken to be the closing line GREEN reports**: strategy sees that line, while `SHADOW_SUMMARY` (row 40) sits in the file GREEN does not open. So, after the `SHADOW_SUMMARY` check, the block reads row 37's count from the file and every closing line (PASSED, CLEAN, NOTEXERCISED, LABELS) carries `Early-copy pairs that would follow the switch (row 37, as of this read; moves later on Wednesday are not counted): <n>, not above 5.` **Above 5** it reads `<n>, ABOVE 5: strategy re-rules before the switch, no switch until then.`, and PASSED and CLEAN end `SOLO confirms the file; strategy re-rules before the switch, no switch until then` instead of naming the switch: exit 0, as with LABELS, but the line forbids the switch. Row 37 missing, printed twice, or not a whole number (at most 9 digits) is a STOP, exit 1, as a missing `SHADOW_SUMMARY` row is. **The count is a snapshot at the read's time, and the closing line says so:** a move made later on Wednesday, and any early copy it causes, is not in it; it counts claims, not visits (the first-send read, #1692, names the actual pairs on its verdict 5).

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | the clock: at or after 2026-11-04 07:15 Lisbon (Tuesday has closed) | the database clock is at or after it | never | earlier |
| 2 | the window: t0 after DEPLOYED_AT, in or before Monday's 07:00 slot; every Monday mark before it on both sides; every move from DEPLOYED_AT + 13 hours records `fromStartsAt` | `Lisbon <t0>; ... on one side only 0; ... 0` | no shadow heartbeat after the deploy | t0 at or after Monday 07:15, a Monday mark before t0 on one side only, or an old-code move from DEPLOYED_AT + 13 hours |
| 3 | heartbeats, **one row per full day** (2) | every tenant 60 heartbeats, all `shadow`, in the 60 slots | no tenant | fewer, more, a duplicate slot or a `send` heartbeat |
| 6 | the shadow sent nothing since the deploy | 0 `send` heartbeats, 0 claims by taker `sweep` | no shadow heartbeat after the deploy | any |
| 7 | no pass over the ceiling (50 marks) on the full days | 0 | no shadow heartbeat on the full days | any |
| 8 | the heartbeats account for every shadow row since t0 (R20's) | each pass's `recorded_count` equals its rows | no heartbeat or no shadow row | any difference |
| 9 | no mark taken twice by the shadow (R20's) | 0 | no shadow row | any |
| 10 | nothing falls out of the comparison (R20's) | 0 unplaced, 0 sent with neither | no row since t0 | any |
| 11 | agreement, 48h email, **one row per full day** | at least one match and no mismatch; **or** no mark at all when the visits would start on a Sunday. REVIEW: a match, and every mismatch labelled | t0 NULL, or nothing matched (outside the calendar arm) | any UNEXPLAINED mismatch that day, or a sent with neither |
| 12 | agreement, 24h sms, **one row per full day** | as 11 | as 11 | as 11 |
| 13 | **no mark stays UNEXPLAINED**, any side, any day of the window | 0 | t0 NULL, or no mark | any |
| 15 | **R24 held** | 0 shadow rows, due in the window or written since t0, taken after a re-arming save written after their mark (as of their own pass); S5 shadow-only rows printed, not judged; control above 0: marks in the window, by the visit's start now, that a re-arming save after the mark keeps out and that the shadow had not taken before that save, of a visit created before the mark and remindable now | t0 NULL, or the control is 0 (R24 had nothing to act on). Alone, this does not stop the block | any shadow row taken after such a save |
| 16 | **every mismatch label is in R32's accepted set** (R2, R4, R8, S5; R34 labels sweep-sent rows, none here), whole window | 0 outside the set. REVIEW: any other label, named with its count (R1, R3, R5, R6, R7, RK, S3, S4, S7, S8, and S5K: an S5 row with no re-arming save behind it). On a partial day the window-edge labels R5 (no pass since its mark) and S7 (due in the 15 minutes before the read) are printed, not judged | t0 NULL, or no mark | never (UNEXPLAINED is verdict 13's) |

The control of verdict 15 counts what the old code would have shown as S5. Under the old code the compare found 16 S5 marks over 5 full days, about 3 a day; two days and a morning should give a few. If it is 0, verdict 15 reads VACUOUS and the block closes on REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED: R32 and R36 do not require R24 to have been exercised, so it does not stop the block, and strategy answers before the switch (Q2, accepted by strategy on 2026-11-02).

**The INFO rows (never counted, not relied on):**

| n | What |
|---|---|
| 20 | DEPLOYED_AT, t0, the read's clock, the last shadow heartbeat (Lisbon), the full days |
| 21 | per Lisbon day of the heartbeats: tenants, rows, shadow rows, slots, outside 07:00 to 21:45, due, recorded, over the ceiling, left out |
| 22 | R11, per full day: distinct pass ids, heartbeat rows, heartbeats with no pass id, tenants per pass, shadow rows written that day |
| 23 | **new:** marks due in the 24 hours before t0 (not all the old code's, see "Before t0"): both, shadow only, run only |
| 30 | per day of the mark and reminder: both, shadow only, run only |
| 31 | the count of each label (R8, RK and S8 included) per day, reminder and side |
| 32 | what each sleeping-job claim ended as |
| 33 | sleeping-job claims in the window: early, more than once for one start, releases |
| 34 | shadow-only rows whose start the sleeping job claimed early (the withdrawn S1) |
| 35 | R8 and RK marks per day of the mark and reminder |
| 36 | **new:** R34, send mode only: sweep-sent rows since t0; of them after a re-arming save; of those R34 and outside R34. Reads `0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing` |
| 37 | **new:** visits that would get an early copy then an on-time send after the switch: live, early, `sent` claims whose start's mark falls at or after Thursday 11-05 07:00 (counts only; the first-send read, #1692, reads those pairs as REVIEW on its verdict 5). The block prints this count on its closing line (strategy's Q9(a)) |
| 40 | `SHADOW_SUMMARY`: the full days' totals, `run_r8` and `run_rk` included |
| 50, 51, 52 | the mismatches, shadow only (50), run only (51) and sent with neither (52), with appointment id and label; at most 500 a side, unexplained first. In the file only: the block never prints them |

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A FAIL, or a VACUOUS other than verdict 15's, stops the block after the table has been written: GREEN reports the lines as printed, and never opens the file.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-shadow-compare-20261104.sql`, sha256 `ce3e137059b21f47765f779cabc885198f3de9735a6fb4544f4bd33cd9278cd4` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes the 2026-10-31 document pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-shadow-compare-20261104.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD` and its number in `PRNUM`; the block fetches `refs/pull/${PRNUM}/head` and refuses any other sha |
| The deploy | the dispatch names it in `DEPLOYED_AT`, UTC, `2026-11-01` or `2026-11-02`; the block refuses any other form |

**Why the pull request's head and not `main`.** As with the 2026-10-31 read: the pull request need not be merged before GREEN runs it. The block fetches `refs/pull/${PRNUM}/head`, which GitHub keeps after a branch is deleted, and checks out the head commit by its full sha.

## When

At or after Wednesday 2026-11-04 07:15 Lisbon, once the dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs. It is read only, so clinic hours do not bind it. The block STOPs before reading anything if the Lisbon clock reads earlier than 2026-11-04 07:15, and verdict 1 checks the database's clock as well. A later day is still a valid read of the same two full days (Wednesday onward is partial and read only by 13, 15 and 16). **It assumes the sweep is still in shadow:** once send mode is on, verdict 6 FAILs, and the read is no longer the right instrument.

## Where the output goes

To `/Users/ivan/osteojp-handover/shadow-compare-20261104.out` and nowhere else: it holds appointment ids, so it never goes into the repository, a pull request, a card or a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). The block prints only the verdict counts, the number of full days, the R11 rows (row 22, counts only) and row 37's count on its closing line. **GREEN never opens that file**; GREEN reports the printed lines and the file's path; SOLO reads the file.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
DEPLOYED_AT=PENDING
SHAREAD=ce3e137059b21f47765f779cabc885198f3de9735a6fb4544f4bd33cd9278cd4
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
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "REVIEW") { if (n == "11" || n == "12") w++; else if (n == "16") l++; else x++ } else if (v == "VACUOUS") { if (n == "15") e++; else a++ } else if (v == "FAIL") f++ } END { s = 1; split("0 1 2 6 7 8 9 10 13 15 16", one, " "); for (i in one) if (c[one[i]] != 1) s = 0; if (c["3"] != 2 || c["11"] != 2 || c["12"] != 2 || t != 17) s = 0; if (f + a + x > 0 || s == 0) print "STOP"; else if (l > 0) print "LABELS"; else if (e > 0) print "NOTEXERCISED"; else if (w == 0) print "PASS"; else print "CLEAN" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "PASS" ] || [ "${RES}" = "CLEAN" ] || [ "${RES}" = "NOTEXERCISED" ] || [ "${RES}" = "LABELS" ] || { echo "STOP: the read has a FAIL, a VACUOUS verdict other than 15, a REVIEW outside verdicts 11, 12 and 16, a full day count other than 2, or a verdict missing, doubled or extra. The table is in ${OUT}; GREEN does not open it. No switch, SOLO reports to strategy"; exit 1; }
grep -qE '^[[:space:]]*40[[:space:]]*[|][[:space:]]*SHADOW_SUMMARY[[:space:]]*[|]' ${OUT} || { echo "STOP: the read printed no SHADOW_SUMMARY row. The table is in ${OUT}"; exit 1; }
E37=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); if (n == "37") { c++; v = $3; gsub(/[[:space:]]/, "", v) } } END { if (c == 1) printf "%s", v }' ${OUT}) || { echo "STOP: row 37 could not be read. The table is in ${OUT}"; exit 1; }
echo "${E37}" | grep -qxE '[0-9]{1,9}' || { echo "STOP: the read printed row 37 (the early-copy pairs that would follow the switch) missing, doubled or not a whole number. The table is in ${OUT}; GREEN does not open it. No switch, SOLO reports to strategy"; exit 1; }
EARLY="Early-copy pairs that would follow the switch (row 37, as of this read; moves later on Wednesday are not counted): ${E37}, not above 5."
NEXT="SOLO confirms the file, then R36's switch is the owner's, after 21:50"
[ "${E37}" -le 5 ] || EARLY="Early-copy pairs that would follow the switch (row 37, as of this read; moves later on Wednesday are not counted): ${E37}, ABOVE 5: strategy re-rules before the switch, no switch until then."
[ "${E37}" -le 5 ] || NEXT="SOLO confirms the file; strategy re-rules before the switch, no switch until then"
[ "${RES}" != "PASS" ] || echo "SHADOW-COMPARE-1104 PASSED: ${CNT%% / 0 REVIEW*} / 0 VACUOUS / 0 FAIL over ${DAYS} full days. ${EARLY} The whole table is in ${OUT}; GREEN does not open it. ${NEXT}"
[ "${RES}" != "CLEAN" ] || echo "SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32: no FAIL, no VACUOUS; verdicts 3, 13, 15 and 16 OK over ${DAYS} full days; the agreement verdicts read REVIEW and every mismatch label is in the accepted set, which R32 counts as the clean verdict. ${EARLY} The table is in ${OUT}; GREEN does not open it. ${NEXT}"
[ "${RES}" != "NOTEXERCISED" ] || echo "SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED: no FAIL; verdicts 3, 13 and 16 OK over ${DAYS} full days; verdict 15 alone reads VACUOUS, no mark in the window needed R24. ${EARLY} The table is in ${OUT}; GREEN does not open it. Strategy answers first"
[ "${RES}" != "LABELS" ] || echo "SHADOW-COMPARE-1104 REVIEW, LABELS OUTSIDE R32'S SET: no FAIL; verdict 16 names a label outside the accepted set (rows 16, 31, 35, 50 and 51). ${EARLY} The table is in ${OUT}; GREEN does not open it. Strategy reads first, no switch until then"
)
```

**EXPECT:** `lisbon now:  <a time at or after 202611040715> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-shadow-compare-20261104.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: <o> OK / <r> REVIEW / <v> VACUOUS / 0 FAIL` (17 in all; v is 0 or 1, verdict 15's); `full days: 2`; two R11 lines (`22 | passes on 2026-11-02 ...`, `22 | passes on 2026-11-03 ...`); then exactly one of `SHADOW-COMPARE-1104 PASSED: ...`, `SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32: ...` (the expected outcome), `SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED: ...` or `SHADOW-COMPARE-1104 REVIEW, LABELS OUTSIDE R32'S SET: ...`, each carrying `Early-copy pairs that would follow the switch (row 37, as of this read; moves later on Wednesday are not counted): <n>, ...` (above 5: no switch until strategy re-rules). Exit 0 for all four. Each says what happens next; the switch stays the owner's, and GREEN decides none of it. psql prints nothing to the terminal: the table is in `/Users/ivan/osteojp-handover/shadow-compare-20261104.out` only. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD`.

**STOP:** any `STOP:` line: no switch, SOLO reports to strategy. The likely ones: `NOT READY` (the dispatch was not filled in); `earlier than 2026-11-04 07:15` (wait, paste again after 07:15); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO writes a new dispatch); `a FAIL, a VACUOUS verdict other than 15 ...` (the read ran and the table is in the file: report the printed lines and the path; SOLO reads verdicts 2, 13, 15 and 16 and rows 50 to 52); `row 37 ... missing, doubled or not a whole number` (the table is in the file: SOLO reads row 37).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly, with the dispatch's DEPLOYED_AT between the quotes: `set transaction read only; set local statement_timeout = '120s'; set local osteojp.r47_deployed_at = '<DEPLOYED_AT>';`
3. Below it, paste the whole of `scripts/db/read-shadow-compare-20261104.sql`. To copy it exactly from the pull request's head, type this in Claude Code with the dispatch's PRNUM in place of `<PRNUM>`. It fetches the pull request's head into the main clone's `FETCH_HEAD` only (no checkout, no branch moves), copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! T=$(mktemp) && git -C /Users/ivan/Projects/GitHub/OsteoJP fetch -q origin refs/pull/<PRNUM>/head && git -C /Users/ivan/Projects/GitHub/OsteoJP show FETCH_HEAD:scripts/db/read-shadow-compare-20261104.sql > "${T}" && [ "$(shasum -a 256 "${T}" | cut -d' ' -f1)" = "ce3e137059b21f47765f779cabc885198f3de9735a6fb4544f4bd33cd9278cd4" ] && pbcopy < "${T}" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run, at or after Wednesday 2026-11-04 07:15 Lisbon. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1, 2, 6 to 10 and 13 must read `OK`; the two rows 3 must read `OK`. Row 15 reads `OK`, or `VACUOUS`, which strategy answers before the switch. Rows 11, 12 and 16 read `OK` or `REVIEW`. Row 37 is the count of early-copy pairs: above 5, there is no switch until strategy re-rules (Q9(a)). The table goes to SOLO whole, before anything is decided.
5. Send the whole table to SOLO privately (it holds counts, Lisbon times and, in rows 50 to 52, appointment ids; no name, phone or email). Do not post it anywhere public.

The editor runs the text as one transaction, so the first line makes the server refuse any write.

## Rehearsal (2026-11-02, throwaway databases on the local stack, lane blue, synthetic rows)

The `public` schema copied from lane blue's database (the local stack `OsteoJP-blue`, database on 127.0.0.1:54622) with `pg_dump --schema-only`, into a throwaway database per case, made from one seeded base. Two synthetic tenants (the second with no visit, heartbeating with nothing due); 10 synthetic visits Monday 11-02 to Friday 11-06 at 10:00 and 15:00 Lisbon, each with an `appointment.create` audit row dated 10-01 carrying its start; a shadow heartbeat every 15 minutes, 07:00 to 21:45, from Sunday 11-01 07:00 (before the rehearsal's deploy, Sunday 15:20, so t0 is the 15:30 pass) to Wednesday 07:45; for every mark due from Sunday 00:00 to Wednesday 07:45 a sleeping-job claim at the mark plus 2 seconds, a `sent` ledger row, and a shadow row in the transaction of the first pass at or after the mark; each heartbeat's counts equal its rows and record 5 visits left out. Monday and Tuesday each carry 2 matched marks of each reminder; Sunday's 4 marks fall before t0 (row 23 reads `4, 0, 0`). Three appointment foreign keys (patient, practitioner, location) are dropped in the throwaway so no synthetic person or clinic is made; the read reads none of those tables. The base's deploy is Sunday 15:20; a case names its own where it differs. The read ran as the block runs it (`begin read only`, 120 seconds, `set local osteojp.r47_deployed_at`, `rollback`), with ONE substitution: its single clock line `select now() as t1` replaced by Wednesday 2026-11-04 08:00 Lisbon (unless the case says otherwise). The test runs these cases whenever `SHADOW_COMPARE_1104_TEST_PGURL` names a local database, and refuses any other host; the throwaways are dropped by the test.

**Run of 2026-11-02 02:41 Lisbon (lane blue, restarted from a clean checkout of `main`), on these SQL bytes: the deploy time unset, then 97 cases, the test's database part 1 of 1 passing.** Every case below met its expectation exactly (the test compares every verdict, and the named INFO rows); each MUTANT is also asserted not to meet its unmutated case's expectation (for R34's two, not to print its row 36). Verdict 15 reads VACUOUS wherever no mark had to be kept out by R24: that is its control. The base reads 16 OK and 15 VACUOUS.

| Case | Verdicts not OK |
|---|---|
| row 37: of five sleeping-job claims, one is live, early, sent and marked at or after Thursday 07:00: counted, no verdict moves | 15=VACUOUS |
| clean | 15=VACUOUS |
| empty: no heartbeat and no claim at all | 2=VACUOUS, 3 2026-11-02=FAIL, 3 2026-11-03=FAIL, 6=VACUOUS, 7=VACUOUS, 8=VACUOUS, 9=VACUOUS, 10=VACUOUS, 11 2026-11-02=VACUOUS, 11 2026-11-03=VACUOUS, 12 2026-11-02=VACUOUS, 12 2026-11-03=VACUOUS, 13=VACUOUS, 15=VACUOUS, 16=VACUOUS |
| null window: every heartbeat removed, the claims and shadow rows left in place | 2=VACUOUS, 3 2026-11-02=FAIL, 3 2026-11-03=FAIL, 6=VACUOUS, 7=VACUOUS, 8=VACUOUS, 9=VACUOUS, 10=VACUOUS, 11 2026-11-02=VACUOUS, 11 2026-11-03=VACUOUS, 12 2026-11-02=VACUOUS, 12 2026-11-03=VACUOUS, 13=VACUOUS, 15=VACUOUS, 16=VACUOUS |
| the deploy after Monday's 07:00 slot (08:00): verdict 2 FAILs, and Monday's heartbeats since the deploy are short | 2=FAIL, 3 2026-11-02=FAIL, 15=VACUOUS |
| the deploy at Monday 06:50: t0 is the 07:00 pass, in the first slot, OK | 15=VACUOUS |
| the production deploy, Sunday 23:07, after Sunday's last pass: t0 is Monday's 07:00 pass, OK | 15=VACUOUS |
| the deploy at Monday 06:50 and a Monday mark due before t0, on both sides: harmless, printed, verdict 2 OK | 15=VACUOUS |
| the deploy at Monday 06:50 and a Monday mark due before t0, the sleeping job's alone: verdict 2 FAILs | 2=FAIL, 15=VACUOUS |
| the deploy at Monday 06:50 and a Monday mark due before t0, the shadow's alone: verdict 2 FAILs | 2=FAIL, 15=VACUOUS |
| a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly: the old code past Skew Protection's age, verdict 2 FAILs | 2=FAIL, 15=VACUOUS |
| a move without fromStartsAt one second before DEPLOYED_AT + 13 hours: Skew Protection's stale tab, printed, verdict 2 OK | 15=VACUOUS |
| R24 held: a visit moved after its 48h mark to a start whose mark is past; neither side takes it, the control counts it, verdict 15 OK | all OK |
| R24 violated: the same, and the shadow took the new start's past mark after the move: S5, verdict 15 FAILs, verdict 16 OK | 11 2026-11-02=REVIEW, 15=FAIL |
| S5K: an unaccepted request given a move that keeps the start: shadow only, S5, R24 held, so verdict 15 does not FAIL and verdict 16 reads REVIEW | 11 2026-11-02=REVIEW, 15=VACUOUS, 16=REVIEW |
| a shadow row written since t0 for a mark due before it, after a re-arming save: the new code took it, verdict 15 FAILs | 15=FAIL |
| S8: a move to this start 10 seconds before its mark, the sleeping job dropped it, the shadow took it: its day REVIEW, verdict 16 REVIEW | 11 2026-11-02=REVIEW, 15=VACUOUS, 16=REVIEW |
| S8 negative: the same move 31 seconds before the mark: UNEXPLAINED | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| S8 negative: a status-only save 10 seconds before the mark re-arms nothing: UNEXPLAINED | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| a move that keeps the start, after the mark and before the pass: it does not count (R33), the shadow takes it, `both` | 15=VACUOUS |
| a move that keeps the start, after the mark, and NO shadow row: run only, UNEXPLAINED (no kept-start label, not RK) | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| moved away and back after the mark: the start at the mark is the earliest move's fromStartsAt, kept, the shadow takes it | 15=VACUOUS |
| a kept-start move whose fromStartsAt is null: the start at the mark falls to the booking row's startsAt (rule 2), kept | 15=VACUOUS |
| a re-arming save written AT the mark exactly does not count (strictly after): the shadow takes it | 15=VACUOUS |
| RK: cancelled at its mark (the sleeping job suppressed it), brought back after the mark; under R24 the sweep never takes it | 12 2026-11-02=REVIEW, 16=REVIEW |
| RK negative: brought back to scheduled on an online request (not a re-arming save): UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
| RK negative: a pass with every old predicate true before any re-arming save (cancelled at 13:05, after the 13:00 pass; brought back at 13:20): UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL |
| RK negative: an unknown status at a pass before the bring-back, with no save yet: UNEXPLAINED | 12 2026-11-02=FAIL, 13=FAIL |
| RK negative: no pass had every old predicate true (a live sweep claim of the key before the mark): UNEXPLAINED | 6=FAIL, 12 2026-11-02=FAIL, 13=FAIL |
| R8 is unchanged: a visit with no scheduling save before any pass; its day REVIEW, verdict 16 OK (R8 is in R32's set) | 12 2026-11-02=REVIEW, 15=VACUOUS |
| R2 is unchanged: cancelled at its mark, never brought back; its day REVIEW, verdict 16 OK | 12 2026-11-02=REVIEW, 15=VACUOUS |
| R1 on a full day is outside R32's set: its day REVIEW, verdict 16 REVIEW naming it | 12 2026-11-02=REVIEW, 16=REVIEW |
| R5 on the partial Wednesday (a mark at 07:50, no pass since): printed, not judged by verdict 16 | 15=VACUOUS |
| shadow only: the sleeping job's claim for Tuesday's 24h SMS at 10:00 removed | 12 2026-11-03=FAIL, 13=FAIL, 15=VACUOUS |
| run only: the shadow row for Monday's 48h email at 10:00 removed (a booked visit, no save after the mark: not R8, not RK) | 11 2026-11-02=FAIL, 13=FAIL, 15=VACUOUS |
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
| MUTANT: row 37 without early, on "row 37" | 15=VACUOUS |
| MUTANT: row 37 without the Thursday bound, on "row 37" | 15=VACUOUS |
| MUTANT: row 37 counts a released claim, on "row 37" | 15=VACUOUS |
| MUTANT: row 37 counts a claim with no send, on "row 37" | 15=VACUOUS |
| MUTANT: every move counts (the start-at-the-mark rule dead), on "a move that keeps the start, after the mark and before the pass" | 15=FAIL |
| MUTANT: every move counts, on the run-only case: RK would name a kept start, on "a move that keeps the start, after the mark, and NO shadow row" | 11 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: rule 1 reads the LATEST move after the mark, on "moved away and back after the mark" | 15=FAIL |
| MUTANT: rule 2 dead, on "a kept-start move whose fromStartsAt is null" | 15=FAIL |
| MUTANT: a save AT the mark counts, on "a re-arming save written AT the mark exactly" | 15=FAIL |
| MUTANT: brought_back without its origin condition, on "RK negative: brought back to scheduled on an online request" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: accepted_with_estado without its origin condition, on "CLAUSE near miss: a booked visit set to Confirmada by hand" | 15=FAIL |
| MUTANT: accepted_in_sms_review without applied, on "CLAUSE near miss: the same on an online request, not applied" | 15=FAIL |
| MUTANT: accepted_by_sms_reply without its origin condition, on "CLAUSE near miss: the patient's SMS confirmo on a booked visit" | 15=FAIL |
| MUTANT: the visit's own tenant dropped, on "CLAUSE near miss: a booking row written under another tenant" | 15=FAIL |
| MUTANT: RK without a pass where every old predicate held, on "RK negative: no pass had every old predicate true" | 6=FAIL, 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: RK lets a pass with every old predicate true and no save through, on "RK negative: a pass with every old predicate true before any re-arming save" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: RK lets an unknown pass with no save through, on "RK negative: an unknown status at a pass" | 12 2026-11-02=REVIEW, 16=REVIEW |
| MUTANT: verdict 2 without the Monday-mark condition, the sleeping job's alone, on "the deploy at Monday 06:50 and a Monday mark due before t0, the sleeping job's alone" | 15=VACUOUS |
| MUTANT: verdict 2 without the Monday-mark condition, the shadow's alone, on "the deploy at Monday 06:50 and a Monday mark due before t0, the shadow's alone" | 15=VACUOUS |
| MUTANT: verdict 2 FAILs a Monday mark on both sides, on "the deploy at Monday 06:50 and a Monday mark due before t0, on both sides" | 2=FAIL, 15=VACUOUS |
| MUTANT: verdict 2 without the old-code-move condition, on "a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly" | 15=VACUOUS |
| MUTANT: the 13 hours exclusive, on "a move without fromStartsAt at DEPLOYED_AT + 13 hours exactly" | 15=VACUOUS |
| MUTANT: the 13 hours at 12, on "a move without fromStartsAt one second before DEPLOYED_AT + 13 hours" | 2=FAIL, 15=VACUOUS |
| MUTANT: verdict 15 FAILs on any S5 row again, on "S5K: an unaccepted request" | 11 2026-11-02=REVIEW, 15=FAIL, 16=REVIEW |
| MUTANT: an S5 row with no re-arming save stays in R32's set, on "S5K: an unaccepted request" | 11 2026-11-02=REVIEW, 15=VACUOUS |
| MUTANT: the shadow probe reads only marks due since t0, on "a shadow row written since t0 for a mark due before it" | 15=VACUOUS |
| MUTANT: S8 at 5 minutes, on "S8 negative: the same move 31 seconds before the mark" | 11 2026-11-02=REVIEW, 15=VACUOUS, 16=REVIEW |
| MUTANT: S8 counts any save, on "S8 negative: a status-only save" | 11 2026-11-02=REVIEW, 15=VACUOUS, 16=REVIEW |
| MUTANT: the calendar arm without its Sunday, on "Tuesday has no 48h mark at all" | 15=VACUOUS |
| MUTANT: verdict 16 judges the window-edge labels of a partial day, on "R5 on the partial Wednesday" | 15=VACUOUS, 16=REVIEW |
| MUTANT: verdict 15's FAIL dead, on "R24 violated" | 11 2026-11-02=REVIEW |
| MUTANT: verdict 15's control dead, on "R24 held" | 15=VACUOUS |
| MUTANT: R34's cap at 5 hours, on "R34's predicate" | 6=FAIL |
| MUTANT: R34 without the claim before the first save, on "R34's predicate" | 6=FAIL |

The deploy time unset: the read stops with `unrecognized configuration parameter "osteojp.r47_deployed_at"` and prints no table.

**Mutation sweep of this read's own predicates: 34 mutants, 34 killed** (the MUTANT: rows above; R20's two are apart). Survivors by design, not run: `accepted_in_pedidos` and `booked` have no condition beyond their action; `c0.id <> s.id` (only an equal instant of a save and the send could reach it); the tenant filters of the start-at-the-mark subqueries (the save's own tenant filter is mutated); `swept`'s release and ledger conditions, `subj`'s created and status conditions, the S8 window's upper bound and row 23, which feed only a control, a boundary no seeded instant separates, or an INFO row.

## Known limits

- R20's three "sent with neither" limits and R22's reconstruction limits stand unchanged and bound R8 and RK (`docs/read-shadow-compare-20261029.md` and `docs/read-sweep-unexplained-20261030.md`, "Known limits").
- **The two clocks.** A save is stamped with its transaction's start; the sweep reads at its pass. A save whose transaction started before a pass and committed after the pass's snapshot is counted by this read as written before that pass, yet this race effectively cannot FAIL a clean week: an uncommitted move leaves the old start selected, and its `fromStartsAt` equals that start, so it does not count for the row the pass wrote; a brought-back visit is not selectable until the commit. Only a request accepted after an earlier move can reach it. #1678's own header names the related gap ("a save in the last seconds before a mark counts as before it here while the job drops that mark ... the compare reads it as a shadow row alone"): S8 names such a row.
- **#1678's own gap carries over.** The patient's move in the portal (`rescheduleOwn`) and the importer change `starts_at` with no audit row, so the start at the mark can be read stale (the header of `reminder-population.ts`, "THE GAP THAT REMAINS"). The read mirrors the sweep exactly, so the two agree with each other there; against the sleeping job, such a visit can read run only or shadow only with no label (UNEXPLAINED).
- **Verdict 15's control is a count, not a reconstruction.** It counts marks a re-arming save after the mark keeps out, of a visit created before the mark and remindable now, that the shadow had not taken before the save. A visit that another predicate also excluded (no scheduling save, say) is counted too. It proves R24 had subjects, not that each was decided by R24 alone.
- **RK needs an unknown-free trail.** A pass where a status cannot be placed (`?`) and no re-arming save is yet written keeps a mark out of RK, so it stays UNEXPLAINED.
- **R34's selecting pass and save bound: FIXED IN #1692, NOT HERE.** It does not affect this read, which has no sweep-sent row, and row 36 keeps the predicate as it was reviewed (INFO, no subject). The sending pass writes its heartbeat after it selects the marks, so "the tenant's last `send` heartbeat at or before the claim" is the previous pass, not the selecting one, and condition 3 can read an hour early. And saves are read up to the claim (`upto`), not up to the selecting pass, so a save between the selection and the send counts. Strategy ruled Q3 on 2026-11-02 ("Fix its selecting pass and save bound before Thursday's read reuses it, with R4 on the fix"). The fix is in the first-send read, #1692 (commit `79a87ced`, reviewed in R4 round 1 and the narrow round): the selecting pass is the send heartbeat written first at or after the claim whose `pass_at` is at or before it, and saves are read up to that pass's `pass_at`.
- **R34 is rehearsed on seeded rows only.** No sweep-sent row has existed on production; the label reads the claim's and the send heartbeat's times as #1678 writes them, and the read after the switch is its first real subject.
- Survivors of the mutation sweep, by design (see the rehearsal): `accepted_in_pedidos` and `booked` have no condition beyond their action to mutate; `c0.id <> s.id` can change the result only when a save and the send share an instant; the tenant filters of the start-at-the-mark rules are not mutated separately (the save's own tenant filter is).

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the block's production path is NOT REHEARSED: the environment file, the target guard against the real target, the connection and the psql call through the block, and `git fetch origin refs/pull/${PRNUM}/head` against GitHub in the real apply checkout. What stands in for it: the SQL run above with exactly the block's psql arguments (the deploy setting included) and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub (psql's stub refuses a call that does not set the deploy time the dispatch names), fails each call in turn, and proves every halt is explicit and that each of the four closing lines prints only on its own profile, with row 37's count (0, 5 and 6, and 6 with LABELS and with NOTEXERCISED), and that row 37 missing, doubled or not a whole number STOPs.

The owner's fallback copy step (it fetches from GitHub) is NOT REHEARSED.

Not measured: the read's run time on production's row counts. Its inputs are the 2026-10-31 read's (which ran inside 120 seconds over six days) over fewer days, plus the re-arming-save probes, whose audit reads are limited to the visits they ask about and to audit rows written in the window; 120 seconds is the bound.

## Ruled by strategy, 2026-11-02

The builder's defaults of 2026-11-01, each with strategy's answer of Monday 2026-11-02 quoted verbatim. Every answer accepted the default; no verdict's meaning changed. Q7 of SOLO's nine does not touch this read and is not quoted. Q8 sets the switch at Wednesday 2026-11-04 after 21:50 Lisbon, the time the PASSED and CLEAN closing lines name; its words are not quoted here. Q9 is the first-send read's (#1692) Q3, and its condition (a) is this read's.

**Q1. RK, a new candidate label.** R2's and R6's "restored after the claim" exclusion assumed the sweep takes the mark after a restore; under R24 a restore that re-arms keeps it out. Rather than let such a mark read UNEXPLAINED (verdict 13 FAIL, block STOP), it reads RK, outside R32's accepted set, so the block reports REVIEW, LABELS OUTSIDE R32'S SET and strategy reads it.
Ruled: "Q1 RK = accepted. A candidate label outside R32's set, read by strategy each time. Print its count and visit ids."
Already printed, no change to the read: RK's count in rows 16 (`RK <n>` in the list of labels outside the set), 31 (per day, reminder and side), 35 (per mark day) and 40 (`run_rk`); its visit ids (appointment ids) in row 51, the run-only list, in the file only, at most 500 run-only rows, UNEXPLAINED first.

**Q2. Verdict 15's control, R4's recommendation taken.** A zero is never a pass, so verdict 15 prints VACUOUS when no mark in the window was saved after its mark by a re-arming save. R32 and R36 do not require R24 to have been exercised (base rate about 3 S5 marks a day), so that alone does not stop the block: it closes on REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED. Recommended: when that line prints, strategy answers before the switch. A FAIL still STOPs.
Ruled: "Q2 = accepted. If verdict 15's control is 0, it prints VACUOUS and the block closes on REVIEW, CLEAN UNDER R32, R24 NOT EXERCISED. A FAIL still STOPs. Condition: Thursday's first-send read reports sweep sends that R24 should have blocked (EXPECT 0)."
The condition is the first-send read's: its closing line prints verdict 10's sweep-sent S5 count with `(EXPECT 0)` (#1692).

**Q3. R34's predicate**, sharpened from the #1678 builder's note as described under "The labels" (the first save, not some save; the send itself is not its own earlier claim). INFO here; it becomes a verdict in the read after the switch.
Ruled: "Q3 = accepted as sharpened (the first save, and the send is not its own earlier claim). INFO in shadow. Fix its selecting pass and save bound before Thursday's read reuses it, with R4 on the fix."
The fix is in #1692 (commit `79a87ced`, reviewed in R4 round 1 and the narrow round); see "Known limits".

**Q4. Verdict 16 on partial days, and S5K.** R32's accepted set is applied to the whole window, except that R5 and S7, which only describe the read's own edge on a partial day, are printed and not judged there. An S5 row with no re-arming save behind it is not treated as R32's S5: such a row is read each time (verdict 16 REVIEW as S5K) rather than accepted.
Ruled: "Q4 = accepted. R5 and S7 on a partial day are printed, not judged. A kept-start shadow-only row is S5K, verdict 16 REVIEW, read each time. It is never folded into R32's S5."

**Q5. Verdict 2's two premises** (a Monday mark before t0 on one side only; a move without `fromStartsAt` from DEPLOYED_AT + 13 hours) are FAIL conditions, not information.
Ruled: "Q5 = accepted. Both premises stay FAIL. Earlier keyless moves (Skew Protection) and Monday marks on both sides are printed only."

**Q6. S8, a new candidate label** (R4 round 1). Outside R32's set: strategy reads it before it counts.
Ruled: "Q6 S8 = accepted. A candidate label outside R32's set, read by strategy, count printed."
Already printed, no change to the read: S8's count in rows 16 (`S8 <n>`) and 31; its visit ids in row 50, the shadow-only list, in the file only.

**Q9. An early copy then an on-time send** (the first-send read's Q3, read as REVIEW on its verdict 5).
Ruled: "Q9 = accepted, with two conditions:
- (a) Wednesday's compare prints the count of known early-copy pairs that would follow the switch. If it is above 5, strategy re-rules before the switch, so print it on the compare's summary line.
- (b) R44 (rescheduleOwn writes its audit row with fromStartsAt AND emits the re-plan event, so the old job is cancelled) moves up: build it now on a branch, Tier B, R4. Merge it only after the switch, as the first change after send is on.
The owner's undo steps stay as you wrote them."
Condition (a) is built into this read's block: see "Row 37 on every closing line" under THE VERDICTS. Condition (b) is a separate code change SOLO is building, merged only after the switch; it changes nothing in this read.
