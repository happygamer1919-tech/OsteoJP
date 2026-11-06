NOT READY

# SHADOW-COMPARE, 2026-11-06 (A2 re-run): the reminder sweep's shadow against the sleeping job from Monday 11-02 to END_DAY, with LATE-PASS, HARD-DELETE and NC; and the F4 read

**READ ONLY. Two blocks, each read only: the F4 READ (one visit, two yes or no lines) and THE BLOCK (the compare). No apply, no write.**
**Status: AUTHORED 2026-11-06 by SOLO's builder from #1691's read. NOT REVIEWED (no R4 round yet). THE SQL NOT RUN ON ANY DATABASE: this builder was not allowed a database stack, so neither SQL file has been parsed by Postgres, and every case of the test's database part is NOT RUN (see "Rehearsal: owed"). THE TWO BLOCKS PROVEN BY THEIR FAULT-INJECTION TEST, run (`scripts/read-shadow-compare-20261106.test.mjs`); THE BLOCKS THEMSELVES NOT REHEARSED (they read only production). ONE OPEN QUESTION FOR STRATEGY, Q-NC1: the premise of the ruling on F4 does not match the code on main (see "Open question Q-NC1").** The value lines of both blocks read `PENDING` here; GREEN pastes its dispatch's filled copy, all values named by SOLO.

## Why this read exists

The 2026-11-04 compare (#1691) closed on STOP with four FAILs: verdict 3 on 11-03, verdict 8, verdict 11 on 11-03 (48h email) and verdict 13. The A1 diagnostic read (#1720) read them: F1 CONFIRMED (a late pass), F2 REFUTED, F3 UNDECIDED by its own strict rule, F4 EVIDENCED. Strategy ruled on 2026-11-06, as the dispatch to this builder carries them:

- **F1:** "V3's gap (on 11-03 the 09:00 tick's pass ran at 09:25:50, so slot 09:00 reads missing and 09:15 doubled) counts as explained only once the compare prints it under a LATE-PASS label."
- **F3:** "V8's surplus (2 heartbeats each count one more row than they hold, at 11-02 19:00 and 11-03 19:00) is explained by a HARD DELETE of the visit after both counts (11-04 10:36:59). Condition: the delete must come from a RECORDED audit or event row, not be inferred; the compare gets a HARD-DELETE label that ties each surplus row to that record and cites its source (table and columns)."
- **F4:** a shadow-only mark (the 48h email mark of one visit, a shadow row but no claim and no ledger row). "Ruling: label NC, which applies the dispatch contact and channel rule before calling a mark shadow-only. NC must use the SAME fields and the SAME predicate as dispatch.ts:1290-1303 ... NC joins the R32 accepted set only after the F4 yes/no read: so NC is PRINTED but its rows are not counted as accepted unless a dispatch value (a flag in the read) says the F4 read came back with a "no"."

R32, R36 and R47 stand as #1691 quotes them. This read is #1691's, over every full day from Monday 11-02 to END_DAY, with those three labels. It decides nothing, and it writes nothing.

## Open question Q-NC1 (for strategy, before F4_ANSWER is ever filled as NO)

**The ruling's premise is that dispatch.ts:1290-1303 "returns `no_contact` or `channels_off` before any claim and writes no ledger row". On `main` (50383ca9) it does neither, on the shadow path that ran on 11-03:**

- the claim is taken BEFORE those lines: `dispatchReminderInner` calls `takeReminderClaim` at `dispatch.ts:1100`, then `dispatchClaimedReminder` (line 1112), whose lines 1290 to 1303 return the refusal;
- the refusal is written to the ledger AFTER them: `dispatchReminder` records every outcome that is not dispatched and not `claim_held`/`claim_held_by_duplicate` as `suppressed`, with the reason, at `dispatch.ts:1063` to `1073`;
- the claim is not released on that path (it is released only on a throw, lines 1113 to 1120).

`dispatch.ts` was last changed on 2026-10-25 (#1629), before the window. So a sleeping run that woke for that 48h email mark and was refused by lines 1290 to 1303 leaves **a claim of taker `run` and a `suppressed` ledger row with reason `no_contact` or `channels_off`**. The A1 read found **neither** for that mark. On the code, a "no" from the F4 read does not explain the mark: what the database shows (no claim, no ledger row) is what a run that never woke leaves (the A1 document, "What the database alone establishes about the shadow-only mark").

NC is built exactly as ruled (its rule is the real one, pinned by the agreement test), and it says only that the rule WOULD have refused the reminder. **Builder's recommendation, not a ruling:** until strategy re-rules F4 on this point, SOLO fills `F4_ANSWER=UNREAD` in the compare's dispatch whatever the F4 read prints, so NC is printed and read by strategy (verdict 16 REVIEW, closing line LABELS OUTSIDE R32'S SET) rather than accepted. The F4 read is still worth running: its two lines say whether the rule would refuse that mark at all. The question, in one line: **Given that a refused run leaves a claim and a ledger row, does an F4 "no" still put NC in the accepted set for a mark that has neither, yes or no?**

## What it reads

`scripts/db/read-shadow-compare-20261106.sql`, sha256 `b5ffabe5dc643729b3170e844bc7e716b0823ec315c7e1f93b04dbf1e043cab9`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, Lisbon times, the fixed labels of offsets, channels, ledger outcomes, suppression reasons and label letters, a tenant's ordinal (never its id), in row 25 the id of each `appointment.hard_delete` audit row a surplus row is tied to and that visit's start and delete time, and, in the mismatch list only, appointment ids (at most 500 a side, in the file only). No tenant id, patient id or staff id, no name, phone, email address, message text or note, and no audit metadata text. NC reads whether the patient has an email address and a phone number and the two reminder switches, inside `nc_in` only, and prints none of them: only the label.

**Three values from outside**, each set by the block with `set local` inside the read-only transaction; unset, the read stops with an error and prints no table:

| Setting | Dispatch value | Form the block checks |
|---|---|---|
| `osteojp.r47_deployed_at` | `DEPLOYED_AT`, the instant #1678 went live (as #1691: `2026-11-01T23:07:00Z`) | `2026-11-0[12]THH:MM:SSZ` |
| `osteojp.r47_end_day` | `END_DAY`, the last full day: the day before the read, normally | `2026-11-03` to `2026-11-30` |
| `osteojp.r47_f4_answer` | `F4_ANSWER`: `NO` when the F4 read printed at least one `no`, `YES` when it printed two `yes`, `UNREAD` when it has not run (and, by the recommendation under Q-NC1, until strategy answers it) | `NO`, `YES` or `UNREAD` |

**How it is built, so a reviewer reads only what is new.**

1. **R20**, from `clock as (` to the end of `pc`: R20's lines 145 to 444 (`scripts/db/read-shadow-compare-20261029.sql`, on main) with exactly two substitutions: the body of `k` (`resync` holds DEPLOYED_AT, `first_full_pass` is Monday 2026-11-02 07:00, `closes` is 07:15 Lisbon on the day after END_DAY) and the body of `full_day` (every day from 11-02 to END_DAY). The test applies them to R20's file and compares the result with the read exactly.
2. **R22**, from `off_min as (` to the end of `summ`: R22's lines 413 to 586 (`scripts/db/read-sweep-unexplained-20261030.sql`, on main), byte for byte.
3. **This read's own**: #1691's own part, unchanged except row 37's bound and verdict 16's set, plus `f4`, `nc_in`, `nc` (NC), `tenant_n`, `crockford`, `hb_run`, `day_slot`, `late_pass`, `hb_day3`, `hb_verdict3` (LATE-PASS), `hd`, `hd_mark`, `hd_tie`, `hd_acct`, `hdv` (HARD-DELETE), and rows 24 and 25. #1691's mirror of #1678's code is unchanged, and the test still holds it to `1bd32c06`'s bytes (they are unchanged on main).

## What changed from the 2026-11-04 read, and why

| What | 2026-11-04 (#1691) | 2026-11-06 | Why |
|---|---|---|---|
| full days | Monday 11-02 and Tuesday 11-03, fixed | every day from 11-02 to END_DAY (a dispatch value); verdicts 3, 11 and 12 print one row per full day | strategy: "over 11-02 through the latest full day (the dispatch gives the end day)" |
| verdict 1 | at or after 2026-11-04 07:15 | at or after 07:15 Lisbon on the day after END_DAY | the last full day must be closed |
| verdict 3 | OK or FAIL | REVIEW when every gap of the day is a LATE-PASS (row 24) | F1 |
| verdict 8 | OK or FAIL | REVIEW when every heartbeat that counts more rows than it holds is short by exactly the HARD-DELETE marks tied to it (row 25), and none holds more than it counts | F3 |
| verdict 16 | accepted set R2, R4, R8, S5 | the same, plus NC only when F4_ANSWER is NO; the check prints the NC count and the answer | F4 |
| NC | none | a new label on a shadow-only UNEXPLAINED mark, after S8 | F4 |
| row 37's bound | marks at or after Thursday 11-05 07:00 | marks at or after 07:00 the day after the read | the switch is the night after the clean re-run (A2), so the first sending pass is the next morning |
| the closing lines | REVIEW allowed on 11, 12, 16 | REVIEW allowed on 3, 8, 11, 12 (CLEAN) and 16 (LABELS); 3, 11 and 12 must print END_DAY minus 11-01 rows each | the three rulings |
| the F4 read | none | its own SQL file and block, section "F4 READ" | F4 |

## The labels

**Kept, unchanged:** R20's S3, S4, S5, S7, R1 to R7 and "sent with neither"; R8, RK, S8 and S5K as #1691 writes them; R34 (INFO, row 36).

**LATE-PASS (verdict 3, F1).** A slot S of a full day with no heartbeat of the tenant, whose next slot (S plus 15 minutes, 21:45 or earlier) holds exactly two shadow heartbeats of that tenant, one of which has its run time in S. The run time is the pass id read as a ULID (its first ten characters are milliseconds), decoded exactly as the A1 read decodes it (#1720, `hb1`). What that time is (the cron tick, the run's creation or its start) is NOT VERIFIED; it can confirm a late pass that the slots already show and never makes one, which is why LATE-PASS needs both: the empty slot with the doubled slot after it, and the run time in the empty slot. That is #1720's CONFIRMED, the reading F1 came back with. A day reads REVIEW on verdict 3 only when every tenant is either complete (60 heartbeats, all shadow, in the 60 slots) or complete but for LATE-PASS: 60 heartbeats, all shadow, none outside 07:00 to 21:45, each empty slot a LATE-PASS, each doubled slot the one after it, no slot with more than two. One gap that is not a LATE-PASS (a failed pass, a doubled slot whose run time does not decode into the empty slot before it, the #1720 CONSISTENT or UNDECIDED shapes) keeps verdict 3 at FAIL. Row 24 names each: the day, the tenant's ordinal, the empty slot, the late pass's time and slot.

**HARD-DELETE (verdict 8, F3).** Its source is a RECORDED row: **`public.audit_log`, the rows with `entity_type = 'appointment'` and `action = 'appointment.hard_delete'`, read for `tenant_id`, `entity_id` (the visit), `created_at` (the delete's transaction) and `metadata->>'startsAt'` (the start the visit had at the delete)**. `hardDeleteAppointment` writes that row in the same transaction as the delete (`apps/web/lib/scheduling/actions.ts:3517` to `3542` on main: the delete at 3517, the audit row at 3525 to 3542), and the visit's shadow rows go with the visit (`reminder_claims_appointment_id_fkey ... ON DELETE CASCADE`, 0106) while the heartbeat keeps its count. The read takes every such row written since t0 whose visit has no row any more, places its two marks from the recorded start (read only in `toISOString()`'s exact shape; any other shape is counted and left out), and ties each mark to the FIRST shadow pass since t0 that had it due (no lower bound, as the sweep's `dueVisits` has none; the 21:45 pass by its look-ahead), with the visit still ahead and the delete after that pass's transaction began. The sweep takes a mark once, at the first pass that selects it, so that pass is the one that lost the row; this is also what resolves #1720's ambiguity (the 11-02 19:00 mark fits the 11-03 19:00 pass too, and is tied to the 11-02 one, the first). Verdict 8 reads REVIEW only when no shadow row lacks a heartbeat, no heartbeat holds more rows than it counts, and every heartbeat that counts more is short by exactly the marks tied to it. A mark tied to a heartbeat that is whole (the first pass did not take it, say a cancelled visit) is printed as information; if the mark was really taken by a later pass, that later pass is short with nothing tied to it, and verdict 8 FAILs (the safe direction). Row 25 prints each heartbeat whose count differs, its shortfall, and each tied mark with the audit row's id, the visit's start, the delete's time and the source.

**NC (F4).** A shadow-only mark R20 leaves UNEXPLAINED (and S8 does not name) for which the dispatch's contact and channel rule answers anything but send. Its label, as rows 31 and 50 print it: `NC the dispatch's contact and channel rule (dispatch.ts:1290 to 1303) refuses it: the sleeping job sends nothing for it`. The rule is `dispatch.ts:1290` to `1303` on main, quoted at `nc` in the read with line 1289 (which makes `config`):

```
  const plan = planReminderChannels(
    config,
    offsetId,
    { email: !!data.patientEmail, phone: !!data.patientPhone },
    { smsEnabled: data.patientReminderSmsEnabled, emailEnabled: data.patientReminderEmailEnabled },
  );
  if (!plan.send) return { dispatched: false, reason: plan.reason };

  // One run sends ONE channel. The scheduler already fanned out per channel, so
  // narrowing the plan here is what keeps the run and its idempotency key aligned:
  // a run keyed on ...:email must never also send an SMS.
  const wantEmail = channel === "email" && plan.email;
  const wantSms = channel === "sms" && plan.sms;
  if (!wantEmail && !wantSms) return { dispatched: false, reason: "channels_off" };
```

with `planReminderChannels` (`dispatch.ts:333` to `368`) and `parseTenantConfig`'s reminders (`apps/web/lib/admin/settings-config.ts:93` to `106`). Its fields come from the columns `loadReminderData` (`apps/web/lib/reminders/data.ts`) loads them from, through the same joins: `patients.email`, `patients.phone`, `patients.reminder_email_enabled`, `patients.reminder_sms_enabled` and `tenants.settings`. NC reads them as they are AT THE READ, not at the mark (a known limit). Verdict 16 counts NC in R32's accepted set only when F4_ANSWER is NO; otherwise an NC row reads outside the set and verdict 16 reads REVIEW. **See Q-NC1 before filling NO.**

**How the agreement test avoids a second copy of the rule** (`apps/web/lib/reads/shadow-compare-nc.db.test.ts`): the dispatch side is the real exported `dispatchReminder`, run on the open path with only its edges replaced (the visit loader returns the fixture, as `dispatch.test.ts` does; the claim, the ledger and the two transports do nothing), so lines 1290 to 1303 run as written; its answer is read off the outcome (`lead_time_off`, `no_contact` or `channels_off`, or anything after those lines). The SQL side is the expression between the read's `-- NC RULE FROM HERE` and `-- NC RULE TO HERE` lines, cut out of the file and evaluated by Postgres on the same 1008 fixtures (email and phone each missing, empty or present; both patient switches; 14 shapes of tenant settings; both reminders), with the input columns typed as the catalog says they are. Pins hold the cited lines, the loader's fields and the read's input columns to their text. The dispatch half and the pins ran here (5 passed); the Postgres half needs DATABASE_URL and runs in the DB-gated CI job (`DB Tests`, step "Run apps/web DB-gated suite"), or on a throwaway.

## The window and the days

- **t0** is the first `shadow` heartbeat at or after DEPLOYED_AT, Monday 11-02's 07:00 pass on production, as in #1691; verdict 2 is #1691's.
- **Full days**: every day from Monday 11-02 to END_DAY, each with verdict 3 and its two agreement verdicts (11, 12). The read's clock must be at or after 07:15 on the day after END_DAY (verdict 1, and the block's own clock check).
- **Partial day**: the day after END_DAY, up to the read's clock: INFO, except verdicts 13, 15 and 16.
- **Before t0**: row 23, as in #1691.

## THE VERDICTS, AND WHAT EACH EXPECTS

A verdict is OK, REVIEW (verdicts 3, 8, 11, 12 and 16 only), VACUOUS or FAIL. **The block exits 0 only when** there is no FAIL, no VACUOUS other than verdict 15's, no REVIEW outside 3, 8, 11, 12 and 16, verdicts 0, 1, 2, 6 to 10, 13, 15 and 16 each print exactly once, and verdicts 3, 11 and 12 each print exactly D times, D being the number of full days (END_DAY's day of the month minus 1; 11 + 3D verdict rows). It then prints one closing line:

- **PASSED** (every verdict OK) or **REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS** (REVIEW only on 3 (LATE-PASS), 8 (HARD-DELETE), 11 and 12; 13, 15 and 16 OK): SOLO confirms the file and A2's other conditions, then R36's switch is the owner's, the night after this read, after 21:50.
- **REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS, R24 NOT EXERCISED** (the same with verdict 15 the only VACUOUS): strategy answers first.
- **REVIEW, LABELS OUTSIDE R32'S SET** (16 reads REVIEW, with or without 15's VACUOUS; NC with F4_ANSWER other than NO lands here): strategy reads first, no switch until then.
- Any **STOP**: no switch, SOLO reports to strategy.

Every closing line carries row 37's count (strategy's Q9(a), as in #1691): above 5, the line forbids the switch until strategy re-rules.

| n | Verdict | EXPECT (OK) | REVIEW when | VACUOUS when | FAIL when |
|---|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | never | anything else |
| 1 | the clock: at or after 07:15 Lisbon on the day after END_DAY | the database clock is at or after it | never | never | earlier |
| 2 | the window (#1691's) | t0 in or before Monday's 07:00 slot; Monday marks before it on both sides; no old-code move from DEPLOYED_AT + 13 h | never | no shadow heartbeat after the deploy | as #1691 |
| 3 | heartbeats, **one row per full day** | every tenant 60 heartbeats, all `shadow`, in the 60 slots | every tenant complete or complete but for LATE-PASS | no tenant | anything else |
| 6 | the shadow sent nothing since the deploy | 0 send heartbeats, 0 sweep claims | never | no shadow heartbeat after the deploy | any |
| 7 | no pass over the ceiling on the full days | 0 | never | no shadow heartbeat on the full days | any |
| 8 | the heartbeats account for every shadow row since t0 | each pass's `recorded_count` equals its rows | every difference is a heartbeat short by exactly its HARD-DELETE marks, none over, no row without a heartbeat | no heartbeat or no shadow row | anything else |
| 9 | no mark taken twice by the shadow | 0 | never | no shadow row | any |
| 10 | nothing falls out of the comparison | 0 unplaced, 0 sent with neither | never | no row since t0 | any |
| 11 | agreement, 48h email, **one row per full day** | a match and no mismatch, or by the calendar | a match, and every mismatch labelled | t0 NULL, or nothing matched | any UNEXPLAINED mismatch that day, or a sent with neither |
| 12 | agreement, 24h sms, **one row per full day** | as 11 | as 11 | as 11 | as 11 |
| 13 | **no mark stays UNEXPLAINED**, whole window | 0 | never | t0 NULL, or no mark | any |
| 15 | **R24 held** (#1691's) | 0 shadow rows taken after a re-arming save; control above 0 | never | t0 NULL, or the control is 0 (alone, does not stop the block) | any shadow row taken after such a save |
| 16 | **every mismatch label is in R32's accepted set** (R2, R4, R8, S5; NC only when F4_ANSWER is NO), whole window | 0 outside the set | any other label, named with its count | t0 NULL, or no mark | never |

**The INFO rows**: #1691's 20 to 23 and 30 to 52, with these changes: row 20 also prints F4_ANSWER; row 24 (new) one row per LATE-PASS; row 25 (new) one row per heartbeat whose count differs, with its HARD-DELETE ties and their source; row 31 counts NC like any label; row 37 reads marks at or after 07:00 the day after the read; rows 50 to 52 carry NC as a label.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in either block writes to production, so no STOP leaves anything changed there.**

## Pins

| What | Pin |
|---|---|
| The compare's read | `scripts/db/read-shadow-compare-20261106.sql`, sha256 `b5ffabe5dc643729b3170e844bc7e716b0823ec315c7e1f93b04dbf1e043cab9` |
| The F4 read | `scripts/db/read-f4-contact-20261106.sql`, sha256 `e59479b042ee02837c254d86d2bedf0e282525f6d10096e6d0715c4adbfdff18` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes #1691 pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-shadow-compare-20261106.sha256` pins it |
| The commit | the dispatch names the pull request's head in `PRHEAD` and its number in `PRNUM`; each block fetches `refs/pull/${PRNUM}/head` and refuses any other sha |

## When

The F4 READ: any time once its dispatch no longer starts with `NOT READY`, while no other GREEN sitting runs; read only, so clinic hours do not bind it. THE BLOCK: at or after 07:15 Lisbon on the day after END_DAY (the block STOPs earlier, and verdict 1 checks the database's clock as well). Run the F4 READ first when both run in one sitting, so its answer is in hand when the compare's dispatch is filled (see Q-NC1 for what to fill). **It assumes the sweep is still in shadow:** once send mode is on, verdict 6 FAILs.

## Where the output goes

The compare: to `/Users/ivan/osteojp-handover/shadow-compare-20261106.out` and nowhere else (it holds appointment ids); **GREEN never opens that file** and reports the printed lines and the path. The F4 read: to `/Users/ivan/osteojp-handover/f4-contact-20261106.out`, which holds the transaction line and the same two yes or no lines and nothing else; the block prints the two lines.

## F4 READ

`scripts/db/read-f4-contact-20261106.sql`, sha256 `e59479b042ee02837c254d86d2bedf0e282525f6d10096e6d0715c4adbfdff18`. One visit, passed as the dispatch's `APPTID` (never written in the repository; the block refuses anything but a lowercase uuid, and the read casts it to `uuid`). It prints exactly two lines, in this order, each yes or no, and nothing else:

- `has email: yes|no`: the patient's `patients.email` is present and not empty, as `!!data.patientEmail` (`dispatch.ts:1293`);
- `email reminders on: yes|no`: the patient's `patients.reminder_email_enabled`, as `data.patientReminderEmailEnabled` (`dispatch.ts:1294`);

through the visit's patient (`patients.id = appointments.patient_id`, the join `loadReminderData` makes), with the NC rule's own two expressions, byte for byte (the agreement test checks it). When the id names no visit with a patient the read prints no line and the block STOPs. Not printed: the tenant's email switch and lead times, which the rule also reads; on production, the full days' 48h email matches show the tenant's 48h email is on (verdict 11), and the compare's NC reads them.

**Why a section of this document and not a document of its own:** one pull request, one set of pins and one sidecar; the F4 read's answer is a dispatch value of the compare, so the two are reviewed together and run in the same sitting, F4 first. The two blocks share nothing at run time: each fetches the head, checks its own pins and runs its own read-only transaction.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
APPTID=PENDING
SHAF4=e59479b042ee02837c254d86d2bedf0e282525f6d10096e6d0715c4adbfdff18
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
F4FILE=scripts/db/read-f4-contact-20261106.sql
DOC=docs/read-shadow-compare-20261106.md
OUTDIR=/Users/ivan/osteojp-handover
F4OUT=/Users/ivan/osteojp-handover/f4-contact-20261106.out
echo "${PRHEAD} ${DOCSHA} ${PRNUM}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]*' || { echo "STOP: the head commit, the document's sha256 or the pull request number still reads PENDING or is not in its form, so it is NOT READY. Nothing was read"; exit 1; }
echo "${APPTID}" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "STOP: APPTID still reads PENDING or is not a lowercase uuid, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
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
shasum -a 256 -c docs/read-shadow-compare-20261106.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
F=$(shasum -a 256 ${F4FILE} | cut -d' ' -f1) || { echo "STOP: the F4 read could not be hashed. Nothing was read"; exit 1; }
echo "f4 read:     ${F}"
[ "${F}" = "${SHAF4}" ] || { echo "STOP: the F4 read on disk is not the reviewed file. Nothing was read"; exit 1; }
G=$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
echo "guard:       ${G}"
[ "${G}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
M=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
echo "module:      ${M}"
[ "${M}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was read"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was read"; exit 1; }
rm -f ${F4OUT} || { echo "STOP: the old transcript could not be removed. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '30s'" -c "set local osteojp.f4_appointment_id = '${APPTID}'" -c "select 'read only: ' || current_setting('transaction_read_only')" -f ${F4FILE} -c "rollback" > ${F4OUT} 2>&1 || { echo "STOP: the F4 read did not complete (an error, or longer than 30 seconds; psql's lines are in ${F4OUT}). Nothing was written: the transaction is read only"; exit 1; }
grep -qx 'read only: on' ${F4OUT} || { echo "STOP: the F4 read did not run inside a transaction that read as READ ONLY (psql's lines are in ${F4OUT}), so its lines are not reported"; exit 1; }
N=$(awk 'NF { n++ } END { printf "%d", n }' ${F4OUT}) || { echo "STOP: the F4 read's lines could not be counted. They are in ${F4OUT}"; exit 1; }
[ "${N}" = "3" ] || { echo "STOP: the F4 read did not print exactly its two lines (no visit with a patient for that id, or something else). psql's lines are in ${F4OUT}; SOLO reads them"; exit 1; }
L1=$(grep -xE 'has email: (yes|no)' ${F4OUT}) || { echo "STOP: the F4 read printed no has-email line. psql's lines are in ${F4OUT}"; exit 1; }
L2=$(grep -xE 'email reminders on: (yes|no)' ${F4OUT}) || { echo "STOP: the F4 read printed no email-reminders line. psql's lines are in ${F4OUT}"; exit 1; }
echo "${L1}"
echo "${L2}"
A=YES
case "${L1} ${L2}" in *": no"*) A=NO;; esac
echo "F4-READ-1106 DONE: the F4 read answered ${A} (NO when at least one line reads no). It wrote nothing: the transaction is read only. The two lines are also in ${F4OUT}. SOLO fills the compare's F4_ANSWER; see Q-NC1 before filling NO"
)
```

**EXPECT:** `lisbon now:  <yyyymmddhhmm> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-shadow-compare-20261106.md: OK`; `f4 read:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines; then exactly `has email: yes` or `has email: no`, then exactly `email reminders on: yes` or `email reminders on: no`; then `F4-READ-1106 DONE: the F4 read answered <YES or NO> ...`. Exit 0. **REPORT THESE LINES.** It writes nothing to production. The apply worktree is left detached at `PRHEAD`.

**STOP:** any `STOP:` line: SOLO reads it. The likely ones: `NOT READY` (the dispatch was not filled in, or APPTID is not a lowercase uuid); `the pull request's head is [...]` (the pull request moved: SOLO writes a new dispatch); `did not print exactly its two lines` (the id names no visit with a patient: SOLO checks the id against the A1 read).

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=PENDING
DEPLOYED_AT=PENDING
END_DAY=PENDING
F4_ANSWER=PENDING
SHAREAD=b5ffabe5dc643729b3170e844bc7e716b0823ec315c7e1f93b04dbf1e043cab9
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-shadow-compare-20261106.sql
DOC=docs/read-shadow-compare-20261106.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/shadow-compare-20261106.out
echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${DEPLOYED_AT} ${END_DAY} ${F4_ANSWER}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]* 2026-11-0[12]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z 2026-11-(0[3-9]|[12][0-9]|30) (NO|YES|UNREAD)' || { echo "STOP: the head commit, the document's sha256, the pull request number, the deploy time, the end day or the F4 answer still reads PENDING or is not in its form, so it is NOT READY. Nothing was read"; exit 1; }
DAYN=$(echo "${END_DAY}" | awk -F- '{ printf "%d", $3 - 1 }') || { echo "STOP: the number of full days could not be worked out from the end day. Nothing was read"; exit 1; }
LIMIT=$(echo "${END_DAY}" | awk -F- '{ printf "202611%02d0715", $3 + 1 }') || { echo "STOP: the clock limit could not be worked out from the end day. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
echo "full days:   2026-11-02 to ${END_DAY} (${DAYN}); F4 answer ${F4_ANSWER}"
[ "${NOW}" -ge "${LIMIT}" ] || { echo "STOP: it is earlier than 07:15 Lisbon on the day after the end day, so the end day is not closed yet. Nothing was read"; exit 1; }
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
shasum -a 256 -c docs/read-shadow-compare-20261106.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp.r47_deployed_at = '${DEPLOYED_AT}'" -c "set local osteojp.r47_end_day = '${END_DAY}'" -c "set local osteojp.r47_f4_answer = '${F4_ANSWER}'" -c "select 'read only: ' || current_setting('transaction_read_only') as shadow_compare_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
DAYS=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (n == "3" && (v == "OK" || v == "REVIEW" || v == "VACUOUS" || v == "FAIL")) d++ } END { printf "%d", d }' ${OUT}) || { echo "STOP: the full days could not be counted. The table is in ${OUT}"; exit 1; }
echo "full days: ${DAYS}"
R11=$(grep -E '^[[:space:]]*22[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no R11 rows (row 22). The table is in ${OUT}"; exit 1; }
echo "${R11}"
RES=$(awk -F'|' -v d="${DAYN}" '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "REVIEW") { if (n == "3" || n == "8" || n == "11" || n == "12") w++; else if (n == "16") l++; else x++ } else if (v == "VACUOUS") { if (n == "15") e++; else a++ } else if (v == "FAIL") f++ } END { s = 1; split("0 1 2 6 7 8 9 10 13 15 16", one, " "); for (i in one) if (c[one[i]] != 1) s = 0; if (d < 2 || c["3"] != d || c["11"] != d || c["12"] != d || t != 11 + 3 * d) s = 0; if (f + a + x > 0 || s == 0) print "STOP"; else if (l > 0) print "LABELS"; else if (e > 0) print "NOTEXERCISED"; else if (w == 0) print "PASS"; else print "CLEAN" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "PASS" ] || [ "${RES}" = "CLEAN" ] || [ "${RES}" = "NOTEXERCISED" ] || [ "${RES}" = "LABELS" ] || { echo "STOP: the read has a FAIL, a VACUOUS verdict other than 15, a REVIEW outside verdicts 3, 8, 11, 12 and 16, a full day count other than ${DAYN}, or a verdict missing, doubled or extra. The table is in ${OUT}; GREEN does not open it. No switch, SOLO reports to strategy"; exit 1; }
grep -qE '^[[:space:]]*40[[:space:]]*[|][[:space:]]*SHADOW_SUMMARY[[:space:]]*[|]' ${OUT} || { echo "STOP: the read printed no SHADOW_SUMMARY row. The table is in ${OUT}"; exit 1; }
E37=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); if (n == "37") { c++; v = $3; gsub(/[[:space:]]/, "", v) } } END { if (c == 1) printf "%s", v }' ${OUT}) || { echo "STOP: row 37 could not be read. The table is in ${OUT}"; exit 1; }
echo "${E37}" | grep -qxE '[0-9]{1,9}' || { echo "STOP: the read printed row 37 (the early-copy pairs that would follow the switch) missing, doubled or not a whole number. The table is in ${OUT}; GREEN does not open it. No switch, SOLO reports to strategy"; exit 1; }
EARLY="Early-copy pairs that would follow the switch (row 37, as of this read; moves later today are not counted): ${E37}, not above 5."
NEXT="SOLO confirms the file and A2's other conditions, then R36's switch is the owner's, the night after this read, after 21:50"
[ "${E37}" -le 5 ] || EARLY="Early-copy pairs that would follow the switch (row 37, as of this read; moves later today are not counted): ${E37}, ABOVE 5: strategy re-rules before the switch, no switch until then."
[ "${E37}" -le 5 ] || NEXT="SOLO confirms the file; strategy re-rules before the switch, no switch until then"
[ "${RES}" != "PASS" ] || echo "SHADOW-COMPARE-1106 PASSED: ${CNT%% / 0 REVIEW*} / 0 VACUOUS / 0 FAIL over ${DAYS} full days. ${EARLY} The whole table is in ${OUT}; GREEN does not open it. ${NEXT}"
[ "${RES}" != "CLEAN" ] || echo "SHADOW-COMPARE-1106 REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS: no FAIL, no VACUOUS; verdicts 13, 15 and 16 OK over ${DAYS} full days; verdicts 3 and 8 read OK or REVIEW under LATE-PASS and HARD-DELETE (rows 24 and 25), the agreement verdicts OK or REVIEW, and every mismatch label is in the accepted set. ${EARLY} The table is in ${OUT}; GREEN does not open it. ${NEXT}"
[ "${RES}" != "NOTEXERCISED" ] || echo "SHADOW-COMPARE-1106 REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS, R24 NOT EXERCISED: no FAIL; verdicts 13 and 16 OK over ${DAYS} full days; verdict 15 alone reads VACUOUS, no mark in the window needed R24. ${EARLY} The table is in ${OUT}; GREEN does not open it. Strategy answers first"
[ "${RES}" != "LABELS" ] || echo "SHADOW-COMPARE-1106 REVIEW, LABELS OUTSIDE R32'S SET: no FAIL; verdict 16 names a label outside the accepted set (rows 16, 31, 35, 50 and 51; NC is outside unless F4_ANSWER is NO). ${EARLY} The table is in ${OUT}; GREEN does not open it. Strategy reads first, no switch until then"
)
```

**EXPECT:** `lisbon now:  <a time at or after 07:15 on the day after END_DAY> WET`; `full days:   2026-11-02 to <END_DAY> (<D>); F4 answer <F4_ANSWER>`; `checked out: <PRHEAD>`; `document:`, then `docs/read-shadow-compare-20261106.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's lines; `verdicts: <o> OK / <r> REVIEW / <v> VACUOUS / 0 FAIL` (11 + 3D in all; v is 0 or 1, verdict 15's); `full days: <D>`; D R11 lines; then exactly one of `SHADOW-COMPARE-1106 PASSED: ...`, `SHADOW-COMPARE-1106 REVIEW, CLEAN UNDER R32 AND THE 2026-11-06 RULINGS: ...`, `... R24 NOT EXERCISED: ...` or `SHADOW-COMPARE-1106 REVIEW, LABELS OUTSIDE R32'S SET: ...`, each carrying row 37's count. Exit 0 for all four. psql prints nothing to the terminal. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD`.

**STOP:** any `STOP:` line: no switch, SOLO reports to strategy. The likely ones: `NOT READY`; `earlier than 07:15 Lisbon on the day after the end day` (wait, paste again later); `the pull request's head is [...]` (SOLO writes a new dispatch); `a FAIL, a VACUOUS verdict other than 15 ...` (the table is in the file: report the printed lines and the path; SOLO reads verdicts 3, 8, 13 and 16 and rows 24, 25 and 50 to 52).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run either read by hand. Both are read only.

1. Supabase dashboard, production project, SQL Editor, New query.
2. For the compare, type this first line exactly, with the dispatch's three values between the quotes: `set transaction read only; set local statement_timeout = '120s'; set local osteojp.r47_deployed_at = '<DEPLOYED_AT>'; set local osteojp.r47_end_day = '<END_DAY>'; set local osteojp.r47_f4_answer = '<F4_ANSWER>';`. For the F4 read: `set transaction read only; set local statement_timeout = '30s'; set local osteojp.f4_appointment_id = '<APPTID>';`.
3. Below it, paste the whole read. To copy the compare exactly from the pull request's head, type this in Claude Code with the dispatch's PRNUM in place of `<PRNUM>`; it copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! T=$(mktemp) && git -C /Users/ivan/Projects/GitHub/OsteoJP fetch -q origin refs/pull/<PRNUM>/head && git -C /Users/ivan/Projects/GitHub/OsteoJP show FETCH_HEAD:scripts/db/read-shadow-compare-20261106.sql > "${T}" && [ "$(shasum -a 256 "${T}" | cut -d' ' -f1)" = "b5ffabe5dc643729b3170e844bc7e716b0823ec315c7e1f93b04dbf1e043cab9" ] && pbcopy < "${T}" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
   For the F4 read, the same with `scripts/db/read-f4-contact-20261106.sql` and `e59479b042ee02837c254d86d2bedf0e282525f6d10096e6d0715c4adbfdff18`.
4. Run. For the compare, EXPECT one table: row 0 must read `on` and `OK` (otherwise stop and send a screenshot, nothing else); rows 1, 2, 6, 7, 9, 10 and 13 `OK`; rows 3 and 8 `OK` or `REVIEW`; rows 11, 12 and 16 `OK` or `REVIEW`; row 15 `OK` or `VACUOUS`. For the F4 read, EXPECT two lines, each ending in yes or no.
5. Send the result to SOLO privately. Do not post it anywhere public.

## Rehearsal: owed (NOT RUN on these bytes)

This builder was not allowed a database stack (the two allowed stacks were in use by other builders), so **neither SQL file has been run by Postgres, not even parsed**. What did run, on these bytes: the test file's database-free part (`node --test scripts/read-shadow-compare-20261106.test.mjs`, see its counts in the pull request) and the dispatch half and pins of the agreement test (`vitest run lib/reads/shadow-compare-nc.db.test.ts` in `apps/web`, DATABASE_URL blank: 5 passed, 2 skipped).

**The database runs SOLO must schedule, each on a throwaway on one allowed local stack (127.0.0.1), one at a time:**

1. **The compare's and the F4 read's cases.** `SHADOW_COMPARE_1106_TEST_PGURL=postgresql://postgres:postgres@127.0.0.1:<lane port>/postgres DATABASE_URL= node --test scripts/read-shadow-compare-20261106.test.mjs`. It copies the lane's `public` schema into throwaway databases (refusing any host but 127.0.0.1 or localhost) and proves: both SQL files parse and run under `begin read only` with the block's settings; each of the three settings unset stops the compare with an error and no table, and the F4 setting unset stops the F4 read; every case of #1691 still meets its expectation on two full days (END_DAY 2026-11-03) and the clean base on four (END_DAY 2026-11-05); LATE-PASS (the 11-03 shape reads REVIEW on verdict 3; a doubled slot whose run time does not decode into the empty slot, a missing slot with no doubled slot after it, and three heartbeats in one slot each FAIL); HARD-DELETE (the production shape, two short heartbeats and one hard-deleted visit with its two marks tied first-pass, reads REVIEW on verdict 8; a heartbeat short by 2 with one tie, a heartbeat holding more rows than it counts, a delete with no audit row, and a delete whose start cannot be read each FAIL; row 25 prints the audit row and its source); NC (a shadow-only 48h email mark of a patient with no email address reads NC, verdict 13 OK, verdict 16 REVIEW with F4_ANSWER UNREAD or YES and OK with NO; the same patient with an email address and email reminders on stays UNEXPLAINED; S8 keeps precedence); the F4 read prints exactly its two lines for each of the four yes/no combinations and nothing for an id that names no visit; and each listed mutant of the new predicates dies. Set `SHADOW_COMPARE_1106_TEST_REPORT=<file>` to keep the per-case lines for this document.
2. **The NC agreement's Postgres half.** It runs by itself in the pull request's `DB Tests` check (step "Run apps/web DB-gated suite", `vitest run .db.test.ts` with that job's DATABASE_URL), which a read of its green run proves. Locally, on a lane: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<lane port>/postgres pnpm --filter web exec vitest run lib/reads/shadow-compare-nc.db.test.ts`. It proves the read's NC expression and the real `dispatchReminder` give the same answer on all 1008 fixtures, and that the input columns have the types the fixtures are given.

Until run 1 passes, this document stays NOT READY; the cases' results go into this section, with the run's time and lane.

## Known limits

- #1691's known limits stand unchanged (the two clocks, #1678's gap for `rescheduleOwn` and the importer, verdict 15's control, RK's unknown-free trail, R34 rehearsed on seeded rows only).
- **LATE-PASS rests on the run time.** The ULID's meaning is NOT VERIFIED; a late pass whose run was also created late decodes as on time and is NOT a LATE-PASS here (verdict 3 FAILs). LATE-PASS does not cover a late 21:45 pass that lands after 21:45 (#1720's "outside" arm): such a day FAILs and strategy reads it.
- **HARD-DELETE ties a mark to the first pass that had it due.** A hard-deleted visit's other predicates at that pass (status, a scheduling save, created before its mark) cannot be read once its row is gone; a mark the first pass did not take is tied to a whole heartbeat (printed), and the pass that really took it then reads short with nothing tied, so verdict 8 FAILs. The start is the start AT THE DELETE: a visit moved after its pass and before its delete is placed at the wrong mark, and verdict 8 FAILs (the safe direction). A visit whose `starts_at` changed with no audit row is placed by the delete's start alone.
- **NC reads the fields at the read, not at the mark.** A patient who added an email address or switched reminders after the mark is read as now. And NC cannot show that the run woke (Q-NC1).
- **NC mirrors lines 1289 to 1303 only.** The gates before them (the visit loaded, the patient not deleted, the status, an unaccepted request, the routing guard) are not NC's; a mark refused there is not NC.

## NOT REHEARSED

Both blocks read only production: their target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so"). So the blocks' production paths are NOT REHEARSED: the environment file, the target guard against the real target, the connection and the psql calls, and `git fetch origin refs/pull/${PRNUM}/head` in the real apply checkout. What stands in for them: the fault-injection test, which runs each block in GREEN's tool shape in bash and zsh with every external command a stub (psql's stub refuses a call that does not set the values the dispatch names), fails each call in turn, and proves every halt is explicit, each closing line prints only on its own profile, and the full-day count follows END_DAY. The SQL itself is NOT RUN (see "Rehearsal: owed"). The owner's fallback copy step is NOT REHEARSED.
