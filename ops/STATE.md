# OsteoJP SOLO lane: state and resume guide

**This file is the source of truth for SOLO's terminal work.** It lives at `ops/STATE.md` on the branch `ops/SOLO-00-state`, which never merges into main. The branch starts from main so that the pre-push secret scan can run. At the Sunday repo maintenance it is re-made from the new main, with the `ops/` folder copied over and no merge. That means updating it needs no PR, runs no CI and is not blocked by a merge freeze.

**Last updated:** Thu 2026-11-05 03:13 Lisbon, by SOLO (clock read).

## How a new session resumes

1. Read this file, then `RULES.md` next to it:
   `git -C ~/Projects/GitHub/osteojp-solo-clone fetch origin ops/SOLO-00-state && git -C ~/Projects/GitHub/osteojp-solo-clone show origin/ops/SOLO-00-state:ops/STATE.md`
2. Read the repo's `CLAUDE.md` on main.
3. Read the newest lines of the local step log, `~/osteojp-handover/solo-1026-paused/STATE.md`. It has a line per step and is local only.
4. Check what is running before starting anything:
   - `docker ps`, which must be empty unless a rehearsal is on;
   - `gh pr list --state open`;
   - the clock: `TZ=Europe/Lisbon date`. The Mac shows Toronto time.
5. Continue from "Next steps" below.

**When SOLO updates this file:**
- at every milestone (a merge, a sitting result, a ruling, an agent's report);
- at least every 2 hours of active work;
- before any pause or session end;
- when a session is about to run out of context.

The update is a plain commit pushed to `ops/SOLO-00-state`.

## What can never go in this file
The repo is PUBLIC, so this file may hold none of the following:
- patient data;
- credentials or env values;
- compliance or security gap detail;
- the content of any file whose name starts with `PRIVATE-`.

Those stay in `~/osteojp-handover/` on the Mac. This file may only say that such a private item exists.

## Who does what
- **Owner:** does not read code. Wants the answer first, plain language, and no em dashes.
- **SOLO (this lane):** builds. It reviews through fresh R4 agents and merges on green where the owner allows. It never applies to production and never contacts production.
- **GREEN:** the owner's separate session. It runs production sittings from a dispatch file.
- **Strategy:** rules on Tier C items and the calendar. SOLO reports to strategy through the owner.

## Calendar

**Owner steps are windows in Toronto time first, Lisbon in brackets (strategy Q3, 11-04).** Lisbon is Toronto plus 5 hours until 2027-03-08. Never give the owner a single early Lisbon minute.

| When | What | State |
|---|---|---|
| Wed 11-04 11:18 Lisbon | GREEN: read-only comparison (PR #1691) | DONE: STOPPED, 4 FAIL (V3, V8, V11, V13). No switch. |
| Wed 11-04 18:00 Lisbon | R53 merge freeze | ENDED when GREEN reported the fallback (Thu 01:50 Lisbon) |
| Wed 11-04, after 16:00 before 01:29 Toronto (21:00 to 06:29 Lisbon) | GREEN: the fallback re-arm (PR #1690, held 415bd0e9). Owner at the keyboard, 60 to 90 min. Dispatch `~/osteojp-handover/green-dispatch-r36-fallback-1104.txt` | DONE CLEAN 22:44 to 01:50 Lisbon: 561 re-armed (canary 5 + 200 + 200 + 156), closing dry run ELIGIBLE 0, G3 0, 0 Failed runs. Canary began 23:36 WET (18:36 EST). Report `~/osteojp-handover/green-report-r36-fallback-20261104.txt` |
| Thu 11-05, by 11:00 Toronto (16:00 Lisbon) | SOLO's report to strategy (Q2) | |
| Thu 11-05, from 19:40 to 01:29 Toronto (Fri 00:40 to 06:29 Lisbon) | GREEN: the fallback's second pass (Q-R36-F5). The program refuses before Fri 00:37 Lisbon (25h after the canary's read). Merge freeze from the owner's first look until GREEN reports. Dispatch `~/osteojp-handover/green-dispatch-r36-second-pass-1105.txt`, WEDOK=yes | written, block diff-proven; R4 running |
| Thu 11-05 written and R4-reviewed; GREEN runs Thu or Fri, any hour | A1 diagnostic read of the 4 FAILs (approved), PR #1720 (READY, head a7b33b37, unarmed). Dispatch `~/osteojp-handover/green-dispatch-sweep-diagnostic-1105.txt`. Then A2: the send-mode no-double-send DB test, the compare read's late-pass label and V8 reconciliation, the clean re-run. All four hold: switch the next night after the re-run, earliest Fri 11-06 after 21:50 Lisbon. Any fails: a new two-day shadow window. | PR open; dispatch written; R4 of the dispatch running |
| ~~Thu 11-05~~ | ~~read of the first sending (#1692)~~ | void: no switch |
| Thu 11-05 and after | Board freeze, RULINGS.md, GitHub Issues tracker, CLAUDE.md slim (owner approved 11-01) | not started |
| Sat 11-07 | nothing closes (A3) | |
| Sun 11-08 | no repo maintenance (A3): it moved to **Sun 11-22**, with Sat 11-21 the close-and-export day under Q1 (a) to (f) | |
| Mon 11-09 | Migration 0109 (#1682) | apply doc NOT READY |
| Tue 11-10 | Migration 0110 (#1704), then #1705. Montemor launch-ready. | NOT READY |
| Wed 11-11 | Migration 0111 (#1706), then #1707 | NOT READY |
| Thu 11-12 | Migration 0112 (#1708), then #1709 | NOT READY |
| Sun 11-15 | Saturday-hours data operation | |
| Tue 11-17 | Montemor opens | |
| Wed 11-18 | Migration 0113 (#1717), the patient read speed fix. The birthday switch stays OFF until this is applied and re-measured. | NOT READY |

**Rules for the migration nights:**
- One migration per night, after 21:00.
- Each screen PR merges only after its migration's GREEN report.
- The pending file is renamed to its number inside the held PR before the night. Its SQL bytes do not change.

## Open PRs (as of 23:30, 11-03)

| PR | What | State |
|---|---|---|
| #1682 | 0109 Saturday hours per clinic | held, head 0668e845, all checks green except the held block (by design) |
| #1704 + #1705 | 0110 appointment types, prices, VAT, and the screen | held |
| #1706 + #1707 | 0111 Sistemas / SubSistemas, and the screen | held |
| #1708 + #1709 | 0112 weekly blocks, and the screen | held |
| #1717 | 0113 patient read speed fix | held, draft, 64 DB tests green on the local DB with 0113 applied |
| #1690 | Fallback reminder re-arm | held until the LAST sitting's GREEN report (Thursday's second pass, or a weekly one) |
| #1720 | A1 sweep diagnostic read | READY, unarmed, GREEN runs it from its head; not for merge before its report |
| #1691, #1692, #1679, #1686 | Read-only data operations | dispatch-run by GREEN |
| #1693 | Portal moves write audit rows and re-plan reminders | draft; after Thursday's read, then the R50 key steps |

**Merge rules:**
- Tier A: SOLO merges on green.
- Tier B: needs an R4 PASS plus green.
- Tier C (migrations, RLS): held for its GREEN night.
- Never push to an armed PR: disarm, push, wait for green, re-arm.
- A GATE-CHANGE PR is never armed; it is merged by hand on all green.

## Running now
- Thu ~13:20 Lisbon: owner approved a Packs entry inside the patient ficha (PACK-FICHA-01, builder running, no migration). A1 read done (F1 CONFIRMED, F2 REFUTED, F3 UNDECIDED, F4 EVIDENCED), written into the Friday report draft. #1705 B10 c8f6069f R4 3 rounds, e2e 7/7, db 7/7 4/4. #1726 weekly 3173a15c R4 2 rounds PASS, rehearsal next. #1724 Q6 R4 PASS, minors being fixed.
- Thu 12:45 Lisbon: strategy ruled on the Thursday report (B1 to B10, settings NO CHANGE, A1 today before the second pass or Fri after). DECISIONS PR #1725 armed. Builders running: B10 Motivo refused above 0% (#1705); Q6 per-type list rework (#1724, night Thu 11-19 conditional on the accountant's written confirmation before 11-19 12:00); B6 weekly fallback blocks (new branch data/R36-weekly-fallback-20261113 from 415bd0e9; #1690's branch untouched). SOLO's settings claim withdrawn (0108 applied from a held head with the same checkout); goes in the Friday report draft `~/osteojp-handover/solo-to-strategy-20261106-friday.md`. Next: R4 each, rehearse Q6 and weekly on BLUE (one stack at a time), B1 labels after A1 reads, R36 closing note carries B7 counts.
- Thu 03:13 Lisbon: nothing running. Merged overnight: #1721, #1722, #1723. #1724 Q6 data op held at eddda7c9 (R4 two rounds, cap; SQL rehearsed on BLUE, blocks whole owed at the READY head; questions Q6-A to Q6-E to strategy, night proposed Thu 11-19). Pack payments and clinic closures NOT started: they wait for strategy's B4 and the owner's answers in their design notes.
- Thu ~02:45 Lisbon, done overnight: #1721 DECISIONS merged; #1722 packs sort and #1723 board armed (CI); #1705 Tipos (Q4-Q9, Q6 note) R4 PASS, fixed at caa3b6bb, held; #1706 0111 Q12 accent-blind index (sha e9afe529 at 1950d3e3) R4 PASS; #1707 3ec4766b (NFC, Q13), held; 0111 night doc pins moved, verdict 8 pinned from a local apply (md5 8c26eb6e), doc 3c837e8b; READY pass of 0109/0110/0112 R4 PASS (#1682 2a32af7d, docs 8c28a80b / 96b0e7b7 / 37fce597); #1724 Q6 data op held, R4 round 2 running.
- BLOCKED (R5, owner decision): the independent re-rehearsal of 0111 through its blocks; the classifier refused its setup (scratch worktree + eval of 0110 block B, "Unverifiable Deletion Scope"). Not retried.
- Thu ~02:20 Lisbon: strategy answered the 15 Fisiozero questions (owner-delegated). DECISIONS PR #1721 (armed, docs). Builders: Sistemas Q12 accent-blind unique index in 0111 (#1706, changes its bytes: R4 + re-rehearsal + new sha256 + 0111 doc pins owed) and Q13 text (#1707), on BLUE; Tipos screen Q5 (0% needs Motivo, server), Q8 own notes, Q9 hide FollowUp, Q6 accountant note (#1705, no DB); Packs em uso sort by last use (new branch); Q6 data op (0% + M07 on existing types) authored as a held Tier C doc, night proposed Mon 11-16 (B9). Q4 and Q7 stripe: cards/later PR. Second-pass dispatch R4 PASS (sha 100ae9c2); A1 dispatch R4 fixed (ec38fe78). Thursday report drafted `~/osteojp-handover/solo-to-strategy-20261105-thursday.md` (B1 to B9).
- Thu 11-05 ~02:00 Lisbon: two R4 reviewers (Thursday's second-pass dispatch; the A1 dispatch). Nothing else; BLUE down.
- The owner asked (Wed ~21:00 Toronto) to run all of Rodica's changes overnight. Answered: the three held migrations keep their nights (11-10 to 11-12, strategy-set, R9); tonight SOLO finishes the Thursday dispatch, the strategy report, the READY passes of the night docs, then drafts pack payments and clinic closures as held Tier C if time allows. The owner's 15 answers are the unblocker.

## Record
- **Paused Wed 11-04 12:20 Lisbon, RESUMED 18:33 Lisbon.** The A1 builder is finishing its fix round (BLUE down by 20:30 Lisbon). Steps:
  1. Read the builder's pause report (A1 diagnostic read, worktree `~/Projects/GitHub/osteojp-solo-wt/diag-1105`, branch `data/R47-sweep-diagnostic-20261105`, local only; paused at WIP e264e9a4: all 7 fixes written in SQL and test but NOT RUN; doc wording, the owner look at the 11-03 sweep-due-reminders runs, the guard sentence, rehearsal and sidecar still to do; pins do not match yet; BLUE down). R4 round 1 was NOT PASS (2 MAJOR: filter heartbeats by mode; F1 never REFUTED from run-id decoding alone; 4 MINOR, 1 NIT). Finish the fix round, then R4 round 2. Check BLUE is down.
  2. Tonight, owner window 16:00 to 01:29 Toronto (21:00 to 06:29 Lisbon): the owner says "starting the fallback"; SOLO re-checks no PR is armed and replies "freeze confirmed, none armed" with the Lisbon time. Then GREEN runs `~/osteojp-handover/green-dispatch-r36-fallback-1104.txt` (R4 SHIP AFTER FIXES, fixed, sha256 93e26661).
  3. After GREEN reports: R53 ends; write Thursday's second-pass dispatch (WEDOK rule); push the A1 branch and open its PR held.
  4. The owner was asked to paste `~/osteojp-handover/solo-to-strategy-20261104-correction.md` to strategy (the V8 cause is not re-selection; likely hard deletes; asks to reword A2(1)).
  5. Thursday report by 16:00 Lisbon: include the R9 audit `~/osteojp-handover/r9-audit-nights-20261104.md` (strict reading: only 0112 clear; column reading: 0109 to 0112 clear; 0113 waits) and ask which reading.
- No agent other than the A1 builder (told to pause and bring BLUE down) was running at the pause.
- Done Wed 00:06: an independent rehearsal of all 5 night documents (0109 to 0113) on the final bytes. All REHEARSED OK, no MAJOR. Transcripts in `~/osteojp-handover/rh1104-transcripts/`. NOT REHEARSED: the target guard, the journal reader, block A's MERGED check, the pushes, CI on HELD, production's env contents.
- Done Wed ~00:45: fix round 3, then a narrow re-check (run, not just read). All 10 files and #1682 (head 0668e845): SHIP.
  - It added a stale-variable unset before every credential load, and a machine check that the held head's 3 main CI checks are green.
  - Polish queued for the READY pass, before each night:
    - psql uses `${DATABASE_URL_DIRECT:?}`;
    - two test hardenings;
    - wording.
  - Before Mon 11-09: GREEN tries the new `gh api` CI step once under its classifier.
- Done 11-03 ~23:40: a fresh R4 re-check of tonight's changes found no MAJOR. 0110, 0111 and 0112 plus four dispatches: SHIP. 0113 and #1682: SHIP AFTER FIXES (wording: the lock time, one NOT REHEARSED line, one gate line, a fault count). These fixes wait until the rehearsal reports, so no bytes change under it.

## Next steps, in order
- OWNER ASK (Thu 11-05): when pack payments (0115) are applied AND their screen is live, SOLO drafts a pt-PT message for the owner to send the clinic announcing the pacote upgrade (Packs em uso, packs in the ficha, payments Recebido / Por receber). Not before both are live.
1. Wed: the independent check of the fallback dispatch. Then hand it to the owner. Strategy note sent: `~/osteojp-handover/solo-to-strategy-20261104-shadow-fail.md` (asks A1 to A4).
2. Wed night: GREEN runs the fallback. SOLO reads the report and writes Thursday's second-pass dispatch (WEDOK only if G2 passed and the closing dry run ended clean).
3. Thu: write the diagnostic read for the 4 FAILs (if A1 is approved), R4 it.
4. Thu, by 16:00 Lisbon: the report to strategy. It must include:
   - the shadow compare result and the fallback;
   - the 444 ms line;
   - the Fisiozero defaults taken;
   - the tight-day promotion issue;
   - the rehearsal findings;
   - the owner questions;
   - the duplicates plan;
   - the repo-maintenance ruling request.
5. After Thursday's read:
   - #1693 and the R50 key steps;
   - the flight row walker and the re-arming walker;
   - the board freeze plan.
6. After each migration night: one GATE-CHANGE PR adding the new DB suites to the RLS assert list (health-systems-rls, therapist-weekly-blocks, patient-id-array-reads).
7. Patient duplicates cleanup (see below).

## Waiting on others
- **Strategy ruled A1 to A4 (11-04, record `~/osteojp-handover/strategy-rulings-shadow-stop-20261104.md`):** A1 approved; A2 conditional (four conditions); A3 rewrite to 11-22; A4 weekly fallback on Fridays 11-13, 11-20, 11-27 if still no switch. R9 still binds: a migration night that cannot show it touches nothing the sweep or the sleeping job reads waits for a clean verdict (0110 likely; an audit of all five nights is running). R53 ends when GREEN reports tonight.
- **Strategy ruled Q1 (11-04):** the rewrite keeps Sun 11-08 only if the R31 condition holds (sending clean since the switch). Otherwise it moves to Sun 11-22, nothing is closed Saturday, and the nights go ahead on the current history. With the switch, the plan is: patches in `~/osteojp-handover/`, sha256 per migration file, re-clone everything fresh, an old-history check in every night document, and new READY pins.
- **Owner, before Mon 11-09:** widen the wording of GREEN's apply-settings rule. It allows only "a file checked out from origin/main", but every night next week applies from a held PR.
- **Owner and Rodica:**
  - 15 open questions on the Fisiozero batch;
  - 5 Fisiozero screenshots, with patient names cropped out;
  - the duplicates questions still open: 2 (multi-clinic visibility), 3 (consent rule, SOLO recommends most restrictive), 6 (a patient visiting both clinics).

## Fisiozero batch (owner ruling: copy Fisiozero exactly, OsteoJP's own design)

| Item | State |
|---|---|
| Ficha export: edit date, hour, text | live (#1702) |
| Packs em uso page | live (#1703) |
| Birthday indication | live, switch OFF until 0113 is applied and re-measured |
| Appointment types, prices, VAT | held, night of Tue 11-10 |
| Sistemas / SubSistemas | held, night of Wed 11-11 |
| Weekly blocks | held, night of Thu 11-12 |
| Birthday SMS | not built: blocked on JP and counsel (marketing consent) |
| Pack payments | design note only |
| Clinic-wide closures | design note only |

## Patient duplicates cleanup (owner heads-up, 11-03)
The Fisiozero import made one profile per clinic for the same person. A design note exists locally: `~/osteojp-handover/design-note-patient-duplicates-20261103.md`. Read the local `PRIVATE-` files before building it.

Owner answers so far:
- bulk merge by GREEN at night, losing no data;
- the copy's old number is not searchable;
- consent forms move to the survivor;
- warn, do not block, on a likely duplicate;
- Fisiozero is never imported again, so switch the importer off.

Building starts after Thursday's report.

## Local paths (on the owner's Mac)

| Path | What |
|---|---|
| `~/osteojp-handover/` | Apply documents, dispatches, design notes, reports, rulings, rehearsal transcripts |
| `~/osteojp-handover/solo-1026-paused/STATE.md` | Step-by-step log (local) |
| `~/osteojp-handover/strategy-rulings-u1-u6-20261103.md` | Strategy's rulings of 11-03, verbatim |
| `~/osteojp-handover/apply-0110-*.md` to `apply-0113-*.md` | Night documents. 0109's is in the repo, in PR #1682. |
| `~/osteojp-handover/green-dispatch-01*-*.txt` | GREEN dispatch per night |
| `~/Projects/GitHub/osteojp-solo-clone` | SOLO's clone |
| `~/Projects/GitHub/osteojp-solo-wt/` | SOLO's worktrees |
| `~/Projects/GitHub/osteojp-prod-apply` | GREEN's checkout. SOLO never touches it. |
| `~/.claude/projects/-Users-ivan/memory/` | Claude memory (index: MEMORY.md) |
