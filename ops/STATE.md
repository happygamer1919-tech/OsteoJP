# OsteoJP SOLO lane: state and resume guide

**This file is the source of truth for SOLO's terminal work.** It lives at `ops/STATE.md` on the branch `ops/SOLO-00-state`, which never merges into main. The branch starts from main so that the pre-push secret scan can run. At the Sunday repo maintenance it is re-made from the new main, with the `ops/` folder copied over and no merge. That means updating it needs no PR, runs no CI and is not blocked by a merge freeze.

**Last updated:** Tue 2026-11-03 23:45 Lisbon, by SOLO.

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

## Calendar (Lisbon time)

| When | What | State |
|---|---|---|
| Wed 11-04 07:15 | GREEN: read-only comparison run (PR #1691) | ready |
| Wed 11-04 18:00 | Merge freeze starts. No merge to main until Thursday's read reports. | |
| Wed 11-04 after 21:50 | GREEN: reminder switch, or the fallback (PR #1690) | the Tue dry run was clean |
| Thu 11-05 | GREEN: read of the first sending (PR #1692), then SOLO's 13:00 report to strategy | |
| Thu 11-05 and after | Board freeze, RULINGS.md, GitHub Issues tracker, CLAUDE.md slim (owner approved 11-01) | not started |
| Sat 11-07 | Every open PR merged or closed before the repo maintenance | needs a strategy ruling (see "Waiting on others") |
| Sun 11-08 | Repo maintenance (history rewrite). No apply. | |
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
| #1682 | 0109 Saturday hours per clinic | held, head efc0f161, all checks green except the held block (by design) |
| #1704 + #1705 | 0110 appointment types, prices, VAT, and the screen | held |
| #1706 + #1707 | 0111 Sistemas / SubSistemas, and the screen | held |
| #1708 + #1709 | 0112 weekly blocks, and the screen | held |
| #1717 | 0113 patient read speed fix | held, draft, 64 DB tests green on the local DB with 0113 applied |
| #1690 | Fallback reminder re-arm for Wed night | held |
| #1691, #1692, #1679, #1686 | Read-only data operations | dispatch-run by GREEN |
| #1693 | Portal moves write audit rows and re-plan reminders | draft; after Thursday's read, then the R50 key steps |

**Merge rules:**
- Tier A: SOLO merges on green.
- Tier B: needs an R4 PASS plus green.
- Tier C (migrations, RLS): held for its GREEN night.
- Never push to an armed PR: disarm, push, wait for green, re-arm.
- A GATE-CHANGE PR is never armed; it is merged by hand on all green.

## Running now
- A local rehearsal of all 5 migration night documents (0109 to 0113) on the throwaway database. It must be down by 06:30 Lisbon. Transcripts go to `~/osteojp-handover/rh1104-transcripts/`.
- Done 11-03 ~23:40: a fresh R4 re-check of tonight's changes found no MAJOR. 0110, 0111 and 0112 plus four dispatches: SHIP. 0113 and #1682: SHIP AFTER FIXES (wording: the lock time, one NOT REHEARSED line, one gate line, a fault count). These fixes wait until the rehearsal reports, so no bytes change under it.

## Next steps, in order
1. Read the rehearsal and R4 results. Fix what they find. Mark each night document READY only when its gates pass.
2. Wed 07:15: GREEN's comparison run. SOLO reads the results.
3. Wed after 21:50: switch or fallback. SOLO reads the results.
4. Thu: #1692 read, then the 13:00 report to strategy. It must include:
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
- **Strategy, before Sat 11-07:** how the held migration PRs cross Sunday's repo maintenance. That plan requires zero open PRs.
  - SOLO recommends: close them Saturday, carry them over by patch, re-open them Monday, and add an old-history check to every night document.
  - The alternative is to move the maintenance to after 11-18.
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
