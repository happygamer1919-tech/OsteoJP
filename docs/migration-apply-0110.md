NOT READY: awaiting the R4 re-check of the 2026-11-05 R4 fixes, the independent rehearsal of the whole chain on the final bytes (C3), and SOLO's READY line (block D). Done: the stacked promotion, the document set in the repository, the fault-injection script test, and the R4 of the chain-night changes (PASS).
# 0110: apply the appointment-type columns on services (types, prices and VAT)

**TOUCHES WHAT THE SWEEP OR THE SLEEPING JOB READS: YES, ONE TABLE, AND NOTHING IT ADDS.** 0110 alters `public.services` (ACCESS EXCLUSIVE until its COMMIT), which every reminder send reads at `apps/web/lib/reminders/data.ts:161` (`services.name` at `:151`), for the sleeping job and the sweep's sends alike. No reminder code reads any of the five new columns, **`services.sms_reminders` included** (grep below: 0 lines at `origin/main` and at every head of #1704 to #1709), and none may until a later ruled change.

**While its first line reads `NOT READY`, nothing in this document may be pasted.** That line says why, and BEFORE YOU START refuses any copy of this document whose first line begins `NOT READY`: SOLO removes that line, and only that line, at the READY line (block D), after the R4 round and the independent rehearsal. Then come the pull request's state (#1704, held, `held-for-apply`, unarmed) and GREEN's dispatch (`/Users/ivan/osteojp-handover/green-dispatch-0110-1110.txt`), which carries the values this document cannot hold (the held head's sha as HELD, this document's sha256 at that head as DOCSHA, and the run window as WOPEN, WSTART and WEND). **The sitting runs from the pull request's HELD head, before the merge** (see "Applied from the held head"), **in closed hours only, as the second of the four sittings of the chain night (strategy's C1, 2026-11-05)** (see "Closed hours, the night, and the lock").

**Status: AUTHORED 2026-11-03 BY SOLO'S BUILDER, OUTSIDE THE REPOSITORY (`/Users/ivan/osteojp-handover/apply-0110-types-prices-vat.md`), FROM `docs/migration-apply-0109.md` AT #1682's HEAD `7485190a` (THE TEMPLATE) AND 0108'S DISPATCH. THE SIX BLOCKS ARE 0109'S, RE-KEYED BY MACHINE (EVERY REPLACEMENT COUNTED) AND SYNTAX-CHECKED IN `bash -n` AND `zsh -f -n`; THE CHECK FILES (APPENDICES A AND B) ARE NEW. REHEARSED 2026-11-03, 14:55 TO 15:12 LISBON, ON BLUE, BY A SESSION THAT DID NOT WRITE THE BLOCKS, ALL THREE NIGHTS END TO END: EVERY COUNT MATCHED (SEE "REHEARSAL RECORD"). AMENDED AFTER IT (SEE "REVIEW HISTORY"). R4 ROUND ON THE 2026-11-03 BYTES: DONE (SHIP AFTER FIXES), ITS FIXES APPLIED, AND THEIR R4 RE-CHECK DONE (2026-11-03, SHIP / SHIP AFTER FIXES). THE INDEPENDENT REHEARSAL OF THE BYTES BEFORE FIX ROUND 3: DONE (2026-11-04 00:06 LISBON, REHEARSED OK ON BLUE, TRANSCRIPTS `/Users/ivan/osteojp-handover/rh1104-transcripts/`). "fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending". PROMOTED 2026-11-05 ON THE STACK ABOVE #1682 (C3, `bbb58aad`). NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, `packages/db/migrations/0110_services_booking_type_fields.sql` (promoted from `packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql` with no byte changed), sha256 `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`, journal idx 107, tag `0110_services_booking_type_fields`, eight statements (the two SET LOCAL lines, one ALTER TABLE, five COMMENTs).

**In plain language.** Each appointment type (a row of `services`) gets five new fields, for the clinic's "Tipos de Marcação / Tabelas de Preços" table: a colour, a VAT rate (0, 6, 13 or 23 %), a VAT exemption reason (one of the 33 AT codes, M01 to M99), a follow-up rule (none, or 2 days) and an SMS on/off switch. Four start empty; the SMS switch starts ON for every existing type, which is what happens today. A rule on each of the four refuses a value outside its list. This migration writes no value and changes no behaviour: nothing reads the fields until the screen (#1705) merges after the apply, and that screen only shows and saves them. **Reminders, invoices, the agenda colour and follow-ups stay exactly as they are** until each has its own later decision; in particular the SMS switch is read by no reminder code. Nobody gains or loses access to anything: the fields are read and written by exactly the roles that read and write the price.

Six blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the held head, every pin, the document's first line, production's journal), stage 0 (the files, the journal, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0110 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md` and of 0109's document, word for word, with the number changed; GREEN's dispatch carries it in the same words.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **Stage 2 is READ ONLY, every psql call of it.** **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`. The second line of each block is `set -o pipefail` and nothing more. **WRITTEN 2026-11-05:** the fault-injection test that runs every block in that shape, in bash and in zsh, with each external call made to fail in turn (`scripts/services-type-fields-0110.test.mjs`, 0109's test re-keyed by machine), which also proves block A' and the chain gate; its counts are in \"Review history\". **One halt is implicit, and it cannot be reached.** Every psql line that connects to production reads `psql "${DATABASE_URL_DIRECT:?}"`, so an unset variable fails loudly. Where that form stands bare, in neither a pipe nor a `$(...)` (stage 2's read of the last three journal rows), an unset variable would end the block's shell with the shell's own error and no STOP line. It is never reached: stage 2's earlier piped post-check line already STOPs on an unset variable, and nothing between the two sets the variable again.

**The check files count, and the blocks count again.** No check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `11 OK / 0 VACUOUS / 0 FAIL` of the pre-check, `15 OK / 0 VACUOUS / 0 FAIL` of the post-check. **A psql exit that is not 0 on any of them means the read did not complete.** Stage 2's STOP on the post-check's own run says so, and never that 0110 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## The sweep and the sleeping job: what 0110 touches that they read

**TOUCHES WHAT THE SWEEP OR THE SLEEPING JOB READS: YES, ONE TABLE, AND NOTHING IT ADDS.** 0110 alters `public.services` (ACCESS EXCLUSIVE until its COMMIT), which every reminder send reads at `apps/web/lib/reminders/data.ts:161` (`services.name` at `:151`), for the sleeping job and the sweep's sends alike. No reminder code reads any of the five new columns, **`services.sms_reminders` included** (grep below: 0 lines at `origin/main` and at every head of #1704 to #1709), and none may until a later ruled change.

**Strategy's R9 (2026-11-04): "a migration night whose apply document cannot show it touches nothing the sweep or the sleeping job reads waits for a clean verdict."** 0110: **ONE TABLE THEY READ, BY NAME ONLY, AND NOTHING IT ADDS IS READ.** From an independent read-only audit at `origin/main` `94e8fa68` (2026-11-04), each line cited here re-read at that commit: the reminder jobs run as `authenticated` with the claims `{tenant_id, user_role: admin}` and no user id (`apps/web/lib/reminders/context.ts:18`, `:29` to `:31`); every message text is built in `apps/web/lib/reminders/data.ts:133` to `:161` from named columns only; the files the reminder functions import hold no whole-row select, no bare `returning()` and no `SELECT *`; and there are no views. 0110 adds columns to `services`, which the jobs read by name only (`services.name` at `data.ts:151`, through the LEFT join at `:161`); no reminder code reads its new columns (the grep below). The lock is the only contact: ACCESS EXCLUSIVE on `services` for milliseconds to about a second, on the chain night, from 22:00 Lisbon, after the sweep's last pass and the last 24-hour sends for Monday's visits, when the sweep is idle (it runs only 07:00 to 21:45 Lisbon, `apps/web/lib/reminders/sweep.ts:179`). **Strategy's R9 (2026-11-04), under the column and policy reading C4 names (2026-11-05):** 0110 touches nothing the sweep or the sleeping job reads by column or by policy. It adds five columns to `services` that no reminder, survey or Inngest code reads (the grep below: 0 lines), and it creates, changes or drops no policy; the jobs read `services.name` only, by name. Its one contact is the lock on `services`, under a second. The chain starts at 22:00 Lisbon, after the sweep's last pass (21:45) and after the last 24-hour sends for Monday's visits; a send that still meets the lock waits behind it, and a lock the apply cannot take in 5 seconds is a clean lock-timeout STOP with nothing applied, which ends the chain (C2). So it runs on the chain night. C4 also rules that the chain runs while the sweep is in shadow, and that night's heartbeats and shadow rows are flagged in the next compare as "migration night".

**What "the sweep" and "the sleeping job" are, read from the code on `origin/main` at `f065b82e` (2026-11-03), not from memory.**

- **The sweep:** the Inngest function `sweep-due-reminders` (`apps/web/lib/reminders/inngest/sweep.ts:52`, id at `:54`), every 15 minutes from 07:00 to 21:45 Lisbon (`apps/web/lib/reminders/sweep.ts:179`, `SWEEP_CRON = "TZ=Europe/Lisbon */15 7-21 * * *"`). It lists the tenants (`inngest/sweep.ts:67` and `:73`, through `listTenantIdsForRetention`, `packages/db/src/guest-intake-staff.ts:206`, `select id::text as id from public.tenants`), selects due marks from `appointments`, `reminder_claims`, `reminder_dispatches` and `reminder_sweep_passes` (`sweep.ts:331` to `:450`, `sweep-send.ts:192` to `:443`), and in send mode hands each to the dispatcher (`sweep-send.ts:7`, `:524`).
- **The sleeping job:** `send-appointment-reminder` (`apps/web/lib/reminders/inngest/functions.ts:186`, id at `:188`), which sleeps until the mark (`:205`) and then dispatches (`:221`); with it the other sleepers of the same file, `send-follow-up-notification` (`:337`, sleeps 24 hours after the visit at `:347`, dispatches the survey at `:351`), and the backstop (`apps/web/lib/reminders/inngest/backstop.ts:83`, `:90`). `send-appointment-confirmation` (`:293`) and `send-no-show-notification` (`:361`) dispatch the same way without sleeping.
- **What both read, through the one door:** every dispatch, the sweep's sends included, loads its row with `loadReminderData` (`apps/web/lib/reminders/dispatch.ts:991`, defined at `apps/web/lib/reminders/data.ts:128`): one SELECT of `appointments` joined to `patients` (`data.ts:155`), `users` (`:156`), `locations` (`:157`), `tenants` (`:158`) and, LEFT, `services` (`:161`), naming its columns one by one (`:135` to `:152`: seven of `patients`, `users.full_name`, three of `locations`, `services.name` at `:151`, `tenants.settings` at `:152`). The survey path adds the SQL function `public.issue_survey_automatic` (called at `dispatch.ts:2390` through `apps/web/lib/surveys/survey-store.ts`), whose body reads `public.appointments` and `public.patients` (`packages/db/migrations/0102_sat01_satisfaction_survey.sql:483`, `:493`, `:501`), and `survey-store.ts:172` reads `tenants`.

**The grep that decides "does any reminder code read what this migration adds", run on 2026-11-03 at `origin/main` (`f065b82e`) and at every head of #1704 to #1709 (`3d640af1`, `6ed95f0b`, `ae7cad96`, `42342e66`, `f85fa5f3`, `2cd74dbd`):**

```
git grep -n -E "sms_reminders|smsReminders|vat_rate|vat_exemption|vatExemption|follow_up_days|followUpDays|health_system|healthSystem|weekly_block|weeklyBlock|therapist_weekly|services\.color|services\.vatRate" <ref> -- 'apps/web/lib/reminders' 'apps/web/lib/surveys' 'packages/db/src/guest-intake-staff.ts' | grep -v -E '\.test\.(ts|tsx|mjs):'
```

**It found nothing, at all seven refs** (0 lines each). `apps/*/lib/reminders` exists only as `apps/web/lib/reminders` (51 source files, the Inngest functions in its `inngest/` folder among them). A wider grep that also matched `vatRate` and `color:` found only `apps/web/lib/admin/settings-config.ts:44` to `:255`, the clinic's billing VAT rate inside `tenants.settings` (imported by `dispatch.ts:3` for its reminder settings), which is not `services.vat_rate` and which no migration here touches.

**What 0110 alters or locks, read from its statements:**

- `public.services`: one `ALTER TABLE` adding five columns and four CHECKs; ACCESS EXCLUSIVE until the COMMIT, plus one scan of `services` to validate the CHECKs; no row rewritten (rehearsed: `pg_relation_filenode` the same before and after).
- `pg_description`: five COMMENTs (ROW EXCLUSIVE, as 0109's).
- No other table is named. No policy, no grant, no function.

**Every read of those tables by the sweep or the sleeping job, file:line at `origin/main` `f065b82e`:**

- `apps/web/lib/reminders/data.ts:151` (`serviceName: services.name`) and `:161` (`.leftJoin(services, eq(services.id, appointments.serviceId))`), inside `loadReminderData` (`data.ts:128`), called once per send at `apps/web/lib/reminders/dispatch.ts:991`: by the sleeping jobs (`inngest/functions.ts:221`, `:306`, `:351`, `:370`; the backstop through `inngest/backstop.ts:1`) and by the sweep in send mode (`sweep-send.ts:524`).
- Nothing else in the sweep reads `services`: `sweep.ts:4` and `sweep-send.ts:4` import `appointments`, `reminderClaims`, `reminderDispatches` and `reminderSweepPasses` only, and `inngest/sweep.ts:1` imports the tenant listing only. The sleeping job's own files (`inngest/functions.ts`, `inngest/backstop.ts`) import no table.
- **The new columns: no read anywhere in reminder code** (the grep above). `data.ts` names its columns one by one, so a new column of `services` cannot change what it returns, before or after #1704's `schema.ts` declares them.
- **`services.sms_reminders` is read today only by the screen of #1705**, at its head `6ed95f0b`: `apps/web/lib/admin/services.ts:105` and `:238` (and the form, `service-types-form.ts:181`, and the table, `ServiceTypesTable.tsx:301`). #1705's body says the same: "Not read by the reminder sender yet: unticking SMS sends exactly what was sent before." **Whether the SMS tag stops only the SMS or every reminder is not ruled** (the column's own COMMENT); wiring it into `dispatch.ts` or the sweep is a later change with its own ruling.

**What this means for the night.** The lock is the only contact. A send that starts while the ALTER holds ACCESS EXCLUSIVE on `services` waits for the COMMIT (under a second in the rehearsal) and then reads as before. A send already inside its read transaction when the ALTER asks for the lock holds ACCESS SHARE on `services` until it ends, so the ALTER waits; after 5 seconds (`lock_timeout`) the apply fails clean with nothing applied, a halt and never a half-apply. The sweep's last pass of the day is 21:45 Lisbon (`sweep.ts:179`), inside the 21:00 to 22:29 start window; the sleeping jobs wake at any minute (48 and 24 hours before each visit, `apps/web/lib/reminders/offsets.ts:32` and `:33`, and 24 hours after a visit for the survey). **SOLO's judgment, not a ruling, carried in the dispatch:** do not paste stage 1 from 21:40 to 21:59 Lisbon (before 21:40, from 22:00, or from 00:00 is fine). The blocks do not enforce it; a collision costs a clean lock-timeout STOP and the night, not a wrong write.

## What must happen first, in this order, and none of it by GREEN

1. **OPEN, SUNDAY 2026-11-08 (THE CHAIN NIGHT, C1): `0109` applied by GREEN in the sitting before this one, GREEN REPORTED, and SOLO's "NEXT OK" with the journal number this sitting expects (107).** No merge to `main` before this sitting (C5): #1682 merges on Monday morning, in order. Production's journal then reads 107, `0109` at idx 106, sha256 `ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a`.
2. **DONE 2026-11-05 (C3): blocks A' and B on #1704**, stacked on #1682's promotion `2a32af7d` with `main` merged in (promotion commit `bbb58aad`), the post-promotion test runs with `DATABASE_URL=` blank, and the push. (#1682's head is now `0a4f4f08`, after the READY commit `8b1080df` and its R4 fixes; its commits above `2a32af7d` change documents only, no migration, mirror or pending file, which block A' checks.) Then **CI on the promoted head**: the DB-gated job must show `services-booking-type-fields.db.test.ts` **40 of 40 executed** (until the promotion the skip guard reads red on it, by construction: run 41490323844) and E2E green (until the promotion it is red for a real reason: `schema.ts` names the five columns in every insert into `services`). The builder's recommendation, adopted as amended: those two runs, on HELD (the exact head GREEN applies from), are recorded with their run numbers in GREEN's DISPATCH, not in this document. This document cannot hold them: writing them here is a new commit, and so is block D, so no run of the head GREEN applies from can be named in it. After block D and its push, SOLO confirms that `gh pr view 1704 --repo happygamer1919-tech/OsteoJP --json headRefOid` reads HELD and that `gh pr checks 1704 --repo happygamer1919-tech/OsteoJP` is all green on it, and only then fills the run numbers into the dispatch.
3. **DONE 2026-11-05: block C** (the document set in the repository) and **the fault-injection script test**, `scripts/services-type-fields-0110.test.mjs` (it also proves block A' and the chain gate).
4. **DONE 2026-11-04 (00:06 Lisbon): the independent rehearsal of the bytes before fix round 3, REHEARSED OK on BLUE** (transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`); fix round 3 changed lines after it. **DONE 2026-11-03: the independent rehearsal of the blocks** ("Rehearsal record"): every count matched, verdict 6 confirmed, the lock-timeout path and the refusals rehearsed. What it could not run is listed under "NOT REHEARSED, said one by one".
5. **R4 round on the 2026-11-03 bytes of the document set: DONE (SHIP AFTER FIXES), its fixes applied, and their R4 re-check DONE (2026-11-03, SHIP / SHIP AFTER FIXES). OPEN: the narrow re-check of fix round 3 ("fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending"), and an R4 round on the promoted head.** **#1704's own R4 record is inconsistent:** its body cites "R4 MINOR-3" and an M31 to M34 check "by the R4 reviewer", yet its section "R4 review" reads "Not run". SOLO says which is true, in the body, before the READY line.
6. **OPEN: #1704's body** cites the rehearsal of the earlier bytes (`dc39d204`); SOLO adds the re-rehearsal on the final bytes (interim report, 2026-11-03 09:29) with its numbers.
7. **OPEN: the chain night (C1, re-ruling U1 for 0109 to 0112):** Sunday 2026-11-08, 0110 the second of four separate GREEN sittings, after SOLO's "NEXT OK" on 0109; no other apply and no data op in the same sitting (C7); if C2 ends the chain before 0110, Monday 2026-11-09 from 21:00 Lisbon.
8. **OPEN: SOLO's READY line (block D), the push, and the dispatch filled:** HELD, DOCSHA, SHAPRE and SHAPOST, and the CI run numbers once `gh pr checks` reads all green on HELD (a record only since fix round 3: BEFORE YOU START checks the three required check runs on HELD by machine); and the chain night's run window (see "What GREEN's dispatch carries").

## The promotion: SOLO's commit on the held branch, before the sitting, never GREEN's

**Decided from the template, not assumed.** In every apply of the last month the rename happened on the held branch, by SOLO, before the sitting: 0106 ("The promotion, as done on 2026-10-19": `main` merged in, the pending file renamed, its journal entry, its mirror, the README row moved, `check-journal` run) and 0097 and 0098 ("0097 is promoted on this branch, after main (with 0096 and the app half) is merged in"; "Stage 0 proves the promotion; it never performs it"). 0109 was written at its number from the start. **GREEN never renames, never edits the journal and never commits:** its stage 0 asserts the file at its number, its journal entry, the entry before it and the mirror (through `check-journal`) at the held head, and stops if any is missing. So the rename to `0110_services_booking_type_fields.sql` is a commit to #1704's branch, made by SOLO, on the stack above the held head of #1682, before `0109` is applied (block A', strategy's C3), and before the READY line. **None of the blocks below has been run, and none pushes.** SOLO pushes once, at the end, with the push block, and only on a fast-forward.

**Why stacked on #1682, before 0109 is applied (strategy's C3, 2026-11-05).** The held head GREEN applies from must carry `0109_location_saturday_hours.sql` at idx 106 with its journal entry (stage 0 and stage 1 assert both, and `check-journal` reconciles 108 files with 108 entries). The chain night (C1) runs 0109, 0110, 0111 and 0112 in four separate GREEN sittings, with no merge to main between them (C5), so each held head takes the previous migration from the lower held branch, not from `main`: 0110 on 0109, 0111 on 0110, 0112 on 0111, each carrying only its own migration beyond the previous one (C3). **The cost of stacking:** a later change to 0109's bytes or to the lower promotion commit leaves this branch holding a stale copy. Block A' refuses that case (it reads 0109 at the lower branch's head now, not only at the pinned commit), and stage 0, BEFORE YOU START and the pre-check pin 0109's sha256 again; a re-stack means new HELD, DOCSHA, CI and R4 above it. Freeze bottom-up.

**A promotion changes no byte.** Block B renames the pending file with `git mv`, then asserts its sha256 is still `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`. The file's own header still opens "PENDING, AND IT FOLLOWS 0109" and names its pending path afterwards: stale on purpose, as 0106's was.

**Block A, stacked (A'): merge `main` and the lower held head into the held branch** (strategy's C3, 2026-11-05: the stacked promotion, done before Sunday 12:00 Lisbon, 0109 under 0110). It does not read whether #1682 is MERGED: no merge to main happens during the chain (C5). Instead it checks 0109 where this branch takes it from: PREVHEAD is the held head of #1682 (0109 is written at its number there, so its head is its promotion), pinned by sha; the block STOPs unless PREVHEAD is still on `origin/db/HOR-02-saturday-closing-time`, unless 0109 reads its pinned sha256 at PREVHEAD and at the lower branch's head now, and unless the journal at PREVHEAD ends with `0109_location_saturday_hours` at idx 106, when 1788503100000. Then, in a new worktree detached at the held head, it merges `origin/main` and PREVHEAD (merges, never a rebase), and checks again on disk: 0109's bytes, the journal's newest entry (so the head carries nothing beyond 0109 but its own pending file), and the pending file's bytes. On a conflict it STOPs; resolve by marker LINES, commit, and paste this block again: it resumes in the same worktree, checks the committed merge for marker lines, and skips what is already merged. **This block gates the stack, not the night.** The gate that refuses a later sitting after a mid-chain halt is in GREEN's own BEFORE YOU START: it STOPs unless production's journal reads exactly the count this migration expects (`journal rows on production: 107`, so 0109 applied), and the pre-check finds 0109 by hash as production's newest row; a halt after 0109's COMMIT is caught only by SOLO's "NEXT OK" (C1).

```
(
set -o pipefail
REPO=/Users/ivan/Projects/GitHub/OsteoJP
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0110
BR=db/RODICA-services-vat-colour
PREVBR=db/HOR-02-saturday-closing-time
PREVHEAD=2a32af7d48469491e0272c6ab586a5e995de332b
PREVMIG=packages/db/migrations/0109_location_saturday_hours.sql
SHAPREV=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
PREVTAG=0109_location_saturday_hours
PREVIDX=106
PREVWHEN=1788503100000
JOURNAL=packages/db/migrations/meta/_journal.json
PEND=packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql
SHA=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
echo "${PREVHEAD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: PREVHEAD is not a full 40-character sha [${PREVHEAD}]. Nothing was changed"; exit 1; }
git -C "${REPO}" fetch origin --prune || { echo "STOP: the fetch failed. Nothing was changed"; exit 1; }
PT=$(git -C "${REPO}" rev-parse "origin/${PREVBR}") || { echo "STOP: origin/${PREVBR}, the lower held branch, could not be read. Nothing was changed"; exit 1; }
echo "${PT}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the lower held head did not read as a full sha [${PT}]. Nothing was changed"; exit 1; }
echo "lower held head: origin/${PREVBR} ${PT}; this stack merges ${PREVHEAD}"
git -C "${REPO}" merge-base --is-ancestor "${PREVHEAD}" "${PT}" || { echo "STOP: ${PREVHEAD} is not on origin/${PREVBR} (now ${PT}): the lower commit this document stacks on was rewritten or is gone. Nothing was changed"; exit 1; }
MP=$(git -C "${REPO}" show "${PREVHEAD}:${PREVMIG}" | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0109 could not be read at ${PREVHEAD}. Nothing was changed"; exit 1; }
[ "${MP}" = "${SHAPREV}" ] || { echo "STOP: 0109 at ${PREVHEAD} is not the file this document pins [${MP}]. Nothing was changed"; exit 1; }
MT=$(git -C "${REPO}" show "${PT}:${PREVMIG}" | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0109 could not be read at the lower held head ${PT}. Nothing was changed"; exit 1; }
[ "${MT}" = "${SHAPREV}" ] || { echo "STOP: the lower held head ${PT} now carries other 0109 bytes [${MT}], so this stack would hold a stale copy. Re-stack from the new lower head, with new pins and R4. Nothing was changed"; exit 1; }
echo "0109 at ${PREVHEAD} and at ${PT}: ${SHAPREV}"
LD=$(git -C "${REPO}" diff --name-only "${PREVHEAD}" "${PT}" -- packages/db/migrations supabase/migrations packages/db/migrations-pending) || { echo "STOP: the lower held head could not be compared with ${PREVHEAD}. Nothing was changed"; exit 1; }
[ -z "${LD}" ] || { echo "STOP: the lower held head ${PT} changed a migration file, a mirror or a pending file after ${PREVHEAD} [${LD}], so this stack would hold a stale copy. Re-stack from the new lower head, with new pins and R4. Nothing was changed"; exit 1; }
git -C "${REPO}" show "${PREVHEAD}:${JOURNAL}" | node -e "const L=require('fs').readFileSync(0,'utf8');const j=JSON.parse(L);const e=j.entries;const p=e[e.length-1];const want=Number(process.argv[1]);if(e.length===want+1&&p.idx===want&&p.tag===process.argv[2]&&p.when===Number(process.argv[3])){console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length)}else{console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length);process.exit(4)}" "${PREVIDX}" "${PREVTAG}" "${PREVWHEN}" || { echo "STOP: the journal at ${PREVHEAD} does not end with ${PREVTAG} at idx ${PREVIDX}, when ${PREVWHEN}, of ${PREVIDX} plus one entries. Nothing was changed"; exit 1; }
TIP=$(git -C "${REPO}" rev-parse "origin/${BR}") || { echo "STOP: origin/${BR} could not be read. Nothing was changed"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full sha [${TIP}]. Nothing was changed"; exit 1; }
PS=$(git -C "${REPO}" show "${TIP}:${PEND}" | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pending file could not be read at the held head. Nothing was changed"; exit 1; }
[ "${PS}" = "${SHA}" ] || { echo "STOP: the pending file at the held head is not the approved body [${PS}]. Nothing was changed"; exit 1; }
if test -e "${WT}"; then
cd "${WT}" || { echo "STOP: ${WT} is there but cannot be entered. Nothing was changed"; exit 1; }
if git rev-parse -q --verify MERGE_HEAD > /dev/null; then echo "STOP: a merge is still in progress in ${WT}; resolve it by marker LINES and commit it, then paste this block again"; exit 1; fi
STRAY=$(git status --porcelain) || { echo "STOP: git status failed in ${WT}"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: ${WT} is not clean"; echo "${STRAY}"; exit 1; }
git merge-base --is-ancestor "${TIP}" HEAD || { echo "STOP: ${WT} is there and its HEAD does not descend from the held head ${TIP}. Nothing was changed"; exit 1; }
echo "resuming in ${WT} at $(git rev-parse HEAD), which descends from the held head ${TIP}"
else
git -C "${REPO}" worktree add --detach "${WT}" "${TIP}" || { echo "STOP: the worktree could not be made. Nothing was changed"; exit 1; }
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
echo "held head ${TIP}, in a new worktree ${WT}"
fi
if git rev-parse -q --verify HEAD^2 > /dev/null; then
D1=$(git diff HEAD^1 HEAD) || { echo "STOP: the merge at HEAD could not be compared with its first parent. Nothing was promoted"; exit 1; }
D2=$(git diff HEAD^2 HEAD) || { echo "STOP: the merge at HEAD could not be compared with its second parent. Nothing was promoted"; exit 1; }
M1=$(printf '%s\n' "${D1}" | grep -c -E '^[+](<<<<<<<|>>>>>>>)( |$)')
M2=$(printf '%s\n' "${D2}" | grep -c -E '^[+](<<<<<<<|>>>>>>>)( |$)')
echo "${M1} ${M2}" | grep -qxE '[0-9]+ [0-9]+' || { echo "STOP: the conflict marker lines of the merge at HEAD could not be counted. Nothing was promoted"; exit 1; }
echo "conflict marker lines the merge at HEAD added: ${M1} against its first parent, ${M2} against its second"
[ "${M1}" = 0 ] || [ "${M2}" = 0 ] || { echo "STOP: the merge at HEAD added conflict marker lines against both of its parents, so a conflict was committed unresolved. Nothing was promoted"; exit 1; }
fi
for R in origin/main "${PREVHEAD}"; do
if git merge-base --is-ancestor "${R}" HEAD; then echo "already in: ${R}"; else
echo "merging ${R} into the held branch, a merge and never a rebase"
git merge --no-ff -m "Merge ${R} into ${BR}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" "${R}" || { echo "STOP: the merge of ${R} stopped; its conflicted files are listed above. Resolve them in ${WT} by marker LINES, keeping both sides' rows and lines and never a whole side, check that no marker line is left, commit the merge with the trailer, then paste this block again: it resumes in ${WT}. Nothing was promoted"; exit 1; }
echo "merged: ${R} at $(git rev-parse HEAD)"
fi
done
git merge-base --is-ancestor origin/main HEAD || { echo "STOP: origin/main is not in HEAD after the merges. Nothing was promoted"; exit 1; }
git merge-base --is-ancestor "${PREVHEAD}" HEAD || { echo "STOP: ${PREVHEAD} is not in HEAD after the merges. Nothing was promoted"; exit 1; }
MD=$(shasum -a 256 "${PREVMIG}" | cut -d' ' -f1) || { echo "STOP: 0109 could not be hashed on disk after the merges. Nothing was promoted"; exit 1; }
[ "${MD}" = "${SHAPREV}" ] || { echo "STOP: 0109 on disk after the merges is not the pinned file [${MD}]. Nothing was promoted"; exit 1; }
node -e "const L=require('fs').readFileSync(process.argv[4],'utf8');const j=JSON.parse(L);const e=j.entries;const p=e[e.length-1];const want=Number(process.argv[1]);if(e.length===want+1&&p.idx===want&&p.tag===process.argv[2]&&p.when===Number(process.argv[3])){console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length)}else{console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length);process.exit(4)}" "${PREVIDX}" "${PREVTAG}" "${PREVWHEN}" "${JOURNAL}" || { echo "STOP: the journal on disk after the merges does not end with ${PREVTAG} at idx ${PREVIDX}, when ${PREVWHEN}: the stack carries a migration beyond the previous one, or lost it. Nothing was promoted"; exit 1; }
[ "$(shasum -a 256 "${PEND}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the pending file on disk after the merges is not the approved body. Nothing was promoted"; exit 1; }
echo "stacked: $(git rev-parse HEAD), with 0109 at idx ${PREVIDX} under it and the pending file unchanged"
echo "BLOCK A DONE (stacked). Paste block B."
)
```

**Block B: the promotion** (the rename, the journal entry 107 at `when` 1788503200000, the mirror, the README row, `check-journal`, one commit).

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0110
PEND=packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql
MIG=packages/db/migrations/0110_services_booking_type_fields.sql
MIRROR=supabase/migrations/0110_services_booking_type_fields.sql
SHA=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
ROW='| `NEXT-AFTER-0109_services_booking_type_fields.sql` | `packages/db/migrations/0110_services_booking_type_fields.sql`, bytes unchanged (sha256 `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`), journal `idx 107`, `when 1788503200000` | branch `db/RODICA-services-vat-colour` (#1704), held. Promoted on the stack above the held head of #1682 (`0109` at idx 106), before `0109` is applied, under the strategy ruling C3 of 2026-11-05 (the chain night of 0109 to 0112); numbered `0110` by the U1 ruling of 2026-11-03; **authored, NOT yet applied**. Five columns on `services` for the Tipos de Marcacao table. GREEN applies it from the held head, from `docs/migration-apply-0110.md`, in closed hours. **The promoted file own header still opens PENDING and names its pending path: stale on purpose, because a promotion changes no byte.** |'
cd "${WT}" || { echo "STOP: the worktree is not there. Paste block A first"; exit 1; }
if git rev-parse -q --verify MERGE_HEAD > /dev/null; then echo "STOP: a merge is still in progress; commit it first. Nothing was promoted"; exit 1; fi
STRAY=$(git status --porcelain) || { echo "STOP: git status failed. Nothing was promoted"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the worktree is not clean. Nothing was promoted"; echo "${STRAY}"; exit 1; }
if git rev-parse -q --verify HEAD^2 > /dev/null; then
D1=$(git diff HEAD^1 HEAD) || { echo "STOP: the merge at HEAD could not be compared with its first parent. Nothing was promoted"; exit 1; }
D2=$(git diff HEAD^2 HEAD) || { echo "STOP: the merge at HEAD could not be compared with its second parent. Nothing was promoted"; exit 1; }
M1=$(printf '%s\n' "${D1}" | grep -c -E '^[+](<<<<<<<|>>>>>>>)( |$)')
M2=$(printf '%s\n' "${D2}" | grep -c -E '^[+](<<<<<<<|>>>>>>>)( |$)')
echo "${M1} ${M2}" | grep -qxE '[0-9]+ [0-9]+' || { echo "STOP: the conflict marker lines of the merge at HEAD could not be counted. Nothing was promoted"; exit 1; }
echo "conflict marker lines the merge at HEAD added: ${M1} against its first parent, ${M2} against its second"
[ "${M1}" = 0 ] || [ "${M2}" = 0 ] || { echo "STOP: the merge at HEAD added conflict marker lines against both of its parents, so a conflict was committed unresolved. Nothing was promoted"; exit 1; }
fi
test -f "${PEND}" || { echo "STOP: the pending file is not on disk. Nothing was promoted"; exit 1; }
test ! -e "${MIG}" || { echo "STOP: ${MIG} already exists. Nothing was promoted"; exit 1; }
N=$(find packages/db/migrations -maxdepth 1 -name '0110_*.sql' | wc -l | tr -d ' ')
[ "${N}" = 0 ] || { echo "STOP: ${N} files already claim 0110. Nothing was promoted"; exit 1; }
[ "$(shasum -a 256 "${PEND}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the pending file on disk is not the approved body. Nothing was promoted"; exit 1; }
git mv "${PEND}" "${MIG}" || { echo "STOP: the rename failed"; exit 1; }
[ "$(shasum -a 256 "${MIG}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the promoted file is not byte for byte the pending one, and a promotion changes no byte"; exit 1; }
echo "renamed, bytes unchanged: ${MIG} ${SHA}"
node -e "const fs=require('fs');const f='packages/db/migrations/meta/_journal.json';const t=fs.readFileSync(f,'utf8');const j=JSON.parse(t);const p=j.entries[j.entries.length-1];const shape=JSON.stringify(j,null,2)+'\n'===t;const prev=j.entries.length===107&&p.idx===106&&p.tag==='0109_location_saturday_hours'&&p.when===1788503100000;if(shape&&prev){j.entries.push({idx:107,version:'7',when:1788503200000,tag:'0110_services_booking_type_fields',breakpoints:true});fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');console.log('journal: idx 107, tag 0110_services_booking_type_fields, when 1788503200000, of '+j.entries.length)}else{process.exit(shape?4:3)}" || { echo "STOP: the journal entry was not added (exit 3: the file is not in its own JSON shape; exit 4: its newest entry is not 0109_location_saturday_hours at idx 106, when 1788503100000, of 107)"; exit 1; }
node scripts/sync-supabase-migrations.mjs || { echo "STOP: the mirror could not be written"; exit 1; }
test -f "${MIRROR}" || { echo "STOP: the mirror was not written"; exit 1; }
node scripts/sync-supabase-migrations.mjs --check || { echo "STOP: supabase/migrations is not in sync with packages/db/migrations"; exit 1; }
node -e "const fs=require('fs');const f='packages/db/migrations-pending/README.md';const row=process.argv[1];const L=fs.readFileSync(f,'utf8').split('\n');const key='| '+String.fromCharCode(96)+'NEXT-AFTER-0109_services_booking_type_fields.sql'+String.fromCharCode(96)+' |';const at=L.findIndex(l=>l.startsWith(key));const h=L.indexOf('## Promoted');if(at<0||h<0||h<at){process.exit(4)}L.splice(at,1);let k=L.indexOf('## Promoted');while(k+1<L.length&&L[k+1].startsWith('|')===false)k++;while(k+1<L.length&&L[k+1].startsWith('|'))k++;L.splice(k+1,0,row);fs.writeFileSync(f,L.join('\n'));console.log('README: the row moved to the Promoted table')" "${ROW}" || { echo "STOP: the README row could not be moved (exit 4: no row for the pending file above the Promoted table)"; exit 1; }
CJ=$(node scripts/check-journal.mjs 2>&1) || { echo "${CJ}"; echo "STOP: check-journal failed"; exit 1; }
echo "${CJ}"
echo "${CJ}" | grep -qF '108 .sql files match 108 journal entries' || { echo "STOP: check-journal did not reconcile 108 files with 108 journal entries"; exit 1; }
git add -A packages/db/migrations packages/db/migrations-pending supabase/migrations || { echo "STOP: git add failed"; exit 1; }
git diff --cached --name-status || { echo "STOP: the staged list could not be read"; exit 1; }
git commit -m "db: promote 0110 (appointment-type columns on services), bytes unchanged" -m "The pending file becomes packages/db/migrations/0110_services_booking_type_fields.sql with no byte changed (sha256 e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e), journal idx 107 when 1788503200000, and its supabase mirror; the pending README row moves to the Promoted table." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "PROMOTED at $(git rev-parse HEAD). Not pushed."
)
```

After block B, in the same worktree and before pushing: `pnpm install --frozen-lockfile`, then `DATABASE_URL= pnpm --filter @osteojp/db exec vitest run tests/migration-syntax.test.ts` and `DATABASE_URL= node --test scripts/migration-timeouts.test.mjs scripts/gate-freeze.test.mjs`. Every one with `DATABASE_URL=` blank: none of them needs a database, and no inherited URL may reach one.

**Block C: the document set** (this document without its appendices as `docs/migration-apply-0110.md`, Appendix A and B as the two check files, both sha256 pinned into the blocks, and the sidecar). It refuses while the post-check carries a `PIN-PENDING` verdict.

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0110
SRC=/Users/ivan/osteojp-handover/apply-0110-types-prices-vat.md
DOC=docs/migration-apply-0110.md
PIN=docs/migration-apply-0110.sha256
PREF=scripts/db/precheck-0110-services-booking-type-fields.sql
POSTF=scripts/db/postcheck-0110-services-booking-type-fields.sql
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
test -f "${SRC}" || { echo "STOP: the handover document is not there"; exit 1; }
test -f packages/db/migrations/0110_services_booking_type_fields.sql || { echo "STOP: 0110 is not promoted on this worktree; paste block B first"; exit 1; }
test ! -e "${DOC}" || { echo "STOP: ${DOC} already exists"; exit 1; }
awk 'BEGIN { n = 0; p = 0 } /^```sql$/ { n++; if (n == 1) { p = 1; next } } /^```$/ { p = 0 } p' "${SRC}" > "${PREF}" || { echo "STOP: the pre-check could not be cut out of Appendix A"; exit 1; }
awk 'BEGIN { n = 0; p = 0 } /^```sql$/ { n++; if (n == 2) { p = 1; next } } /^```$/ { p = 0 } p' "${SRC}" > "${POSTF}" || { echo "STOP: the post-check could not be cut out of Appendix B"; exit 1; }
echo "cut: ${PREF} and ${POSTF}. They stay untracked until the commit below; a STOP from here on leaves them in place, and a re-run of block C overwrites both (the two cuts write with >)."
head -1 "${PREF}" | grep -q '^-- 0110 PRE-CHECK' || { echo "STOP: the cut pre-check does not open with its title line"; exit 1; }
head -1 "${POSTF}" | grep -q '^-- 0110 POST-CHECK' || { echo "STOP: the cut post-check does not open with its title line"; exit 1; }
if grep -q 'PIN-PENDING' "${POSTF}"; then echo "STOP: the post-check still carries a PIN-PENDING verdict; the rehearsal reads those values first"; exit 1; fi
awk '/^## Appendix A/ { exit } { print }' "${SRC}" > "${DOC}" || { echo "STOP: the document could not be written without its appendices"; exit 1; }
SPRE=$(shasum -a 256 "${PREF}" | cut -d' ' -f1) || { echo "STOP: the pre-check could not be hashed"; exit 1; }
SPOST=$(shasum -a 256 "${POSTF}" | cut -d' ' -f1) || { echo "STOP: the post-check could not be hashed"; exit 1; }
node -e "const fs=require('fs');const f=process.argv[1];let t=fs.readFileSync(f,'utf8');const a='SHAPRE='+String.fromCharCode(39)+'PENDING: the pre-check file sha256, set when the file is committed'+String.fromCharCode(39);const b='SHAPOST='+String.fromCharCode(39)+'PENDING: the post-check file sha256, set when the file is committed'+String.fromCharCode(39);const na=t.split(a).length-1;const nb=t.split(b).length-1;if(na===3&&nb===3){t=t.split(a).join('SHAPRE='+process.argv[2]).split(b).join('SHAPOST='+process.argv[3]);fs.writeFileSync(f,t);console.log('pinned in 3 and 3 places: pre '+process.argv[2]+', post '+process.argv[3])}else{console.log('found '+na+' and '+nb+', not 3 and 3');process.exit(4)}" "${DOC}" "${SPRE}" "${SPOST}" || { echo "STOP: the check files could not be pinned in the blocks"; exit 1; }
shasum -a 256 "${DOC}" > "${PIN}" || { echo "STOP: the sidecar could not be written"; exit 1; }
cat "${PIN}"
git add "${DOC}" "${PIN}" "${PREF}" "${POSTF}" || { echo "STOP: git add failed"; exit 1; }
git commit -m "docs: the 0110 apply document set (NOT READY)" -m "The document, its sha256 sidecar and its read-only pre-check and post-check. Its first line stays NOT READY until the rehearsal and the review." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "DOCUMENT SET COMMITTED at $(git rev-parse HEAD). Not pushed. Copy SHAPRE ${SPRE} and SHAPOST ${SPOST} into the dispatch's BEFORE YOU START."
)
```

**Block D: the READY line** (the first line goes, the sidecar is regenerated; it prints HELD and DOCSHA for the dispatch).

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0110
DOC=docs/migration-apply-0110.md
PIN=docs/migration-apply-0110.sha256
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
STRAY=$(git status --porcelain) || { echo "STOP: git status failed"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the worktree is not clean"; echo "${STRAY}"; exit 1; }
sed -n 1p "${DOC}" | grep -q '^NOT READY' || { echo "STOP: the first line does not begin NOT READY, so there is no READY line to make"; exit 1; }
if grep -qE '^SHAP(RE|OST)=.PENDING' "${DOC}"; then echo "STOP: a check-file pin is still PENDING in the blocks"; exit 1; fi
if grep -q 'PIN-PENDING' scripts/db/postcheck-0110-services-booking-type-fields.sql; then echo "STOP: the post-check still carries a PIN-PENDING verdict"; exit 1; fi
tail -n +2 "${DOC}" > "${DOC}.ready" || { echo "STOP: the first line could not be removed"; exit 1; }
mv "${DOC}.ready" "${DOC}" || { echo "STOP: the document could not be replaced"; exit 1; }
shasum -a 256 "${DOC}" > "${PIN}" || { echo "STOP: the sidecar could not be written"; exit 1; }
git add "${DOC}" "${PIN}" || { echo "STOP: git add failed"; exit 1; }
git commit -m "docs: the READY line for 0110" -m "Only the first line of the document goes; the sidecar is regenerated." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "HELD for the dispatch, once pushed: $(git rev-parse HEAD)"
echo "DOCSHA for the dispatch: $(shasum -a 256 "${DOC}" | cut -d' ' -f1)"
)
```

**The push, SOLO's, once, after block B (and again after C and D if they come later): a fast-forward or nothing.**

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0110
BR=db/RODICA-services-vat-colour
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed"; exit 1; }
git merge-base --is-ancestor "origin/${BR}" HEAD || { echo "STOP: origin/${BR} moved and is not an ancestor of this worktree's HEAD; a push now would not be a fast-forward. Never force"; exit 1; }
git push origin "HEAD:refs/heads/${BR}" || { echo "STOP: the push failed. Never force, never --no-verify"; exit 1; }
echo "pushed $(git rev-parse HEAD) to ${BR}"
)
```

**Tell the owner nothing new is needed from him for the promotion:** it is a code commit on a held branch. The `held-for-apply` label stays on throughout.

## Written at its number

| Fact | Value |
|---|---|
| Ruling | Strategy, 2026-11-03 (U1): "Tue 11-10: 0110 appointment types, prices and VAT (#1704, then #1705)." Each its own closed-hours GREEN sitting after 21:00; each screen PR merges only after its migration's GREEN REPORTED (R41). **Re-ruled 2026-11-05 by C1 to C5:** the second of four separate GREEN sittings on the chain night of Sunday 2026-11-08, never in the same sitting as another apply; the screen merges after its migration's PR on Monday morning (C5) |
| Migration | `packages/db/migrations/0110_services_booking_type_fields.sql` after block B, renamed from `packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql` with no byte changed. sha256 `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e` |
| Journal | `idx 107`, tag `0110_services_booking_type_fields`, `when` 1788503200000 (0109's 1788503100000 plus 100000, the step). Stage 0 asserts it and 0109's entry before it. Production's journal goes 107 to 108 |
| Mirror | `supabase/migrations/0110_services_booking_type_fields.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0109`, `packages/db/migrations/0109_location_saturday_hours.sql`, sha256 `ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a`, journal `idx 106`, `when` 1788503100000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | **the pull request's HELD head, `origin/db/RODICA-services-vat-colour`, never a merge commit on main.** BEFORE YOU START checks it against HELD. Stage 0 records the sha in `/tmp/0110-head.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if the held head has moved since |
| This document | `docs/migration-apply-0110.md` after block C, pinned by `docs/migration-apply-0110.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0110-services-booking-type-fields.sql` (Appendix A until block C), READ ONLY, 11 verdicts, 7 CARRY rows and INFO rows, run inside the block's own `begin read only`. sha256 `29c55065878c900f8469ff33a9ae8faf0c0f23a8051a006667a96de3d1616d02` (block C cuts it out byte for byte) |
| Post-check | `scripts/db/postcheck-0110-services-booking-type-fields.sql` (Appendix B until block C), READ ONLY, 15 verdicts, verdict 7 VACUOUS at 0 rows (a STOP), run inside the block's own `begin read only`. sha256 `c84c701fe7f44af372aa0f758a64b0d746c706e99c0842a63f0e8ea5d1eee013` (block C cuts it out byte for byte) |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0108's and 0109's documents pin, read again on 2026-11-03 at `origin/main` (`f065b82e`) and at #1704 `3d640af1`, #1706 `ae7cad96`, #1708 `f85fa5f3`: identical at every one. Every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0110-window.ok` with the sha stage 0 recorded. **No date is written in any block.** Its end may not fall in a repeated hour |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then one `ALTER TABLE public.services` adding `color text`, `vat_rate smallint`, `vat_exemption_code text`, `follow_up_days smallint` (each nullable, no default) and `sms_reminders boolean NOT NULL DEFAULT true` (a constant default: catalogue only, no row rewritten), with the four CHECKs `services_color_hex`, `services_vat_rate_allowed`, `services_vat_exemption_code_allowed` and `services_follow_up_days_allowed`; a COMMENT on each column |
| What it never touches | every existing value of every row (the four nullable columns read NULL, `sms_reminders` reads true on every row), every other column, constraint, trigger and index of `services`, every other table, every policy, every grant, every function. The post-check proves the columns (3, 4), the CHECKs (5, 6), the rows (7), the grants (8), the rest of `services` (9), no rewrite (10), every policy and every relation privilege in `public` (11, 12) and the journal (13, 14) |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0110.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document, the removal of its first line included, moves its sha256; the sidecar is regenerated in the same commit (blocks C and D do it).

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`.

## Closed hours, the night, and the lock

**Closed hours only, and not R9-eligible.** R9 allows a clinic-hours sitting only when all three of its proofs hold. Proof 1 (the SET LOCAL gate, hashed at the held head against SHAGATE) holds when the gate file is on that head. **Proof 2 (catalog-only, or no table reception writes) is NOT claimed:** the migration alters `public.services` under ACCESS EXCLUSIVE, a table every booking read joins and the reminder dispatcher reads, and validates its CHECKs by a scan. (#1704's body asked strategy whether R9 could apply because only owner and admin hold `services:write`; U1 ruled the closed-hours sitting, so the question is closed.) **Proof 3 does not hold:** the read-only pre-check has not run on production in an earlier sitting. So the blocks have no daytime path and no override.

**The clinic-hours table these blocks check, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed** (0109's table, byte for byte its clock program; the owner's Saturday is 09:00 to 13:00, and 08:00 only ever refuses a minute the owner's hours would allow). BEFORE YOU START and the CLOCK CHECK check the clock by machine against the table and against strategy's start windows; stage 0 and stage 1 check it against the table; stage 1 also reads every active clinic's own weekday hours. Every clock read carries `TZ=Europe/Lisbon`, reads the zone's name in the same `date` call, and STOPs unless it is WET or WEST.

**The night (strategy's C1 to C5, 2026-11-05, re-ruling U1, R38 and B3 for 0109 to 0112 only).** **C1:** the chain night is Sunday 2026-11-08, from 14:00 Sunday to 06:29 Monday Lisbon (the clinic is closed all day). Four separate GREEN sittings in file order, 0109, 0110, 0111, 0112, each a fresh GREEN session with its own pre-check, its own READY line and the owner's freeze lines; one migration in flight at any moment. 0110 is the second sitting. It starts only after SOLO has read GREEN's report on 0109 and printed "NEXT OK" with the journal number this sitting expects (107); BEFORE YOU START holds the same number by machine (it STOPs unless production's journal reads 107), so this sitting cannot start while 0109 is not applied. A halt in 0109's sitting after its COMMIT leaves the journal at 107 too, and only SOLO's "NEXT OK" catches that. **C2:** any STOP, REFUSE, FAIL or harness refusal in any sitting ends the chain for the night; the migrations not yet applied move to Monday 2026-11-09 from 21:00 Lisbon, then the next closed night. No new sitting starts after 02:00 Lisbon. **C5:** no merge to `main` during the chain. **C7:** no data operation joins a migration chain; this sitting runs no other apply and no data op. The dispatch names the window; the blocks hold the clock to it by machine (the start window the clock is in must lie inside the run window the dispatch names). **The chain starts at 22:00 Lisbon on Sunday** (the lead's decision of 2026-11-05, inside strategy's window): after the sweep's last pass of the day (21:45) and after the last reminder sends for Monday's visits. No block holds the 22:00 start or the 02:00 cut: on a Sunday the blocks' start window opens at 00:00 Sunday, so the dispatch's run window stays `202611080000`, `202611090629`, `202611090800` (Monday's fallback `202611092100`, `202611100629`, `202611100800`), with no block change, and SOLO holds the start and the cut in its own steps. No apply window may end inside a repeated hour (strategy, 2026-10-25); November has none, and the blocks check it anyway.

**The lock, measured by the builder's rehearsal (BLUE, PostgreSQL 17, 2026-11-02, on the earlier bytes).** `ALTER TABLE ... ADD COLUMN` of four nullable columns with no default and one boolean with a constant default rewrites no row (`pg_relation_filenode` 18673 before and after); the four `ADD CONSTRAINT ... CHECK` validate by one scan of `services` (23 rows on the throwaway; about twenty on production by the migration's own comment). The whole transaction ran under 1 s. **While it waits for ACCESS EXCLUSIVE on `services`, and while it holds it, every booking read and every reminder send that reads `services` queues behind it.** Two bounds: `lock_timeout` 5s, the migration's first statement, so a lock it cannot take in 5 seconds fails the apply clean with nothing applied (rehearsed with a second session holding a lock: `canceling statement due to lock timeout`, 0 of 5 columns after); and `statement_timeout` 60s. **Through `verified-migrate.mjs` too, rehearsed on 2026-11-03:** with a second session holding a lock on `services`, stage 1 printed `journal    107 -> 107  (delta 0)` and `0110_services_booking_type_fields present by sha256: NO` and stopped with exit 4 after about 5 seconds, nothing applied. The pre-check's INFO rows print the locks other sessions hold on `services` and `idle_in_transaction_session_timeout`, for the report. The other locks the transaction takes (the `graphql.seq_schema_version` row of pg_graphql's DDL trigger, `pg_description`) were read for 0109 and not for this file: NOT REHEARSED.

## Applied from the held head, before the merge, and which commit the sitting runs from

**The record supports the held head, and this document runs from it**, as 0109's does. **#1704 cannot merge before the apply:** `packages/db/src/schema.ts` declares the five columns, so Drizzle names them in every insert into `services`; merged first, the production app would name columns production does not have, and adding a service on Administração > Serviços would fail (#1704's body). So the shape is 0102's and 0108's: held head, apply, then merge.

- **R41, standing:** SOLO removes `held-for-apply` and merges only after GREEN reports 0110 in the journal. A pull request that may not merge before the apply cannot be the merge commit the apply runs from.
- **Strategy's S-1004-A:** "Any held-for-apply PR waits for the owner's label removal after GREEN reports"; R41 hands that removal to SOLO after GREEN REPORTED.
- **No SECURITY DEFINER count moves** (0110 creates no function), so there is no count GATE-CHANGE and `main` never reads red on the count because of this pull request.

| # | Step | Who |
|---|---|---|
| 1 | GREEN applies 0110 from #1704's HELD head, with this document | GREEN, on the owner's dispatch |
| 2 | GREEN REPORTED (below) is in SOLO's hands, with the journal row | the owner pastes GREEN's report |
| 3 | `main` is merged into #1704 (merge, never rebase), and CI reads green on that head | SOLO |
| 4 | `held-for-apply` comes off #1704 (its own command), and #1704 merges (R41). If the harness refuses either, it is not retried: the owner's two clicks | SOLO under R41, else the owner |
| 5 | `main` is merged into #1705 (the screen), CI green on that head, R4 passed on it (#1705 is a DRAFT stacked on #1704; its R4 is Tier B and "Not run" in its body; `gh pr ready 1705` comes after that round. **#1705 conflicts with today's `main` (`46c9505e`, read 2026-11-03 with `git merge-tree`) in `apps/web/app/admin/services/page.tsx`, `docs/guide/pdf/guia-plataforma-osteojp.pdf` (binary: marker lines cannot resolve it; the PDF is rebuilt, not merged) and `docs/guide/pdf/guide-pdf.manifest.json`. A real resolution is owed before Monday 2026-11-09 morning, when C5 merges #1705 right after #1704, SOLO's job; until then step 5 cannot start), then its label comes off (its own command) and it merges (R41 and U1: "Each screen PR merges only after its migration's GREEN REPORTED") | SOLO under R41, else the owner |
| 6 | Follow-ups each need their own ruling before any code reads the new columns: the SMS tag in reminders (does it stop only the SMS or every reminder), FollowUp 2 dias, VAT on invoices, the agenda colour | strategy and the owner, then SOLO |

**C5: no merge to `main` during the chain.** On Monday morning, after the last GREEN report, SOLO merges under R41 on green, in order: 0109 (#1682) and its screen pull requests, 0110 (#1704) and #1705, 0111 (#1706) and #1707, 0112 (#1708) and #1709. The first that is not green by Monday 18:00 Lisbon stops the sequence, and the report states the gap between production and `main` until it closes. **The two `supabase/seed.sql` edits merge clean:** #1708's carries #1706's revoke line and its comment byte for byte and adds `therapist_weekly_blocks` in a separate guarded block (proved with `git merge-tree` on 2026-11-05); if a later edit breaks that, the resolution keeps #1708's lines, the superset. Until then production is up to four migrations ahead of `main`, and `prod-drift-check` reports it, correctly.

**Between steps 1 and 4, production is one migration ahead of `main`.** The daily `prod-drift-check` reports a journal row with no matching file on `main` in that window; that report is correct, and it ends at step 4. The application behaves the same before and after the apply: nothing on `main` names the five columns until #1704 merges, and the reminder read names its columns one by one.

**Every block of this document names `origin/db/RODICA-services-vat-colour` and none names `origin/main`.** The `held-for-apply` label keeps the branch where it is: a labelled pull request cannot merge (`.github/workflows/held-for-apply-blocks-merge.yml`) and `.github/workflows/auto-update-prs.yml` does not merge `main` into it, so the head GREEN runs from does not move under the sitting. Every sha a block compares is first read into a variable and refused unless it is 40 hex characters. Stage 1 begins with the HEAD CHECK (`STOP: the held head moved since stage 0 ...`); stage 2 and the closing read run from the recorded sha whatever the branch has done since, and print whether it moved.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0109: `/Users/ivan/osteojp-handover/green-dispatch-0110-1110.txt`. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `HELD`: the held head of the pull request, a full 40-character sha (BEFORE YOU START only), from block D after the push;
- `DOCSHA`: this document's sha256 at that head (both blocks), from block D;
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks), for the chain night (C1): `202611080000`, `202611090629`, `202611090800`. On a Sunday the blocks' start window opens at 00:00 Sunday, so WOPEN is 00:00; the chain starts at 22:00 Lisbon (the lead's decision of 2026-11-05), and SOLO holds that start and the 02:00 cut (C2) in its own steps, which no block holds. If C2 moves 0110 to Monday 2026-11-09: `202611092100`, `202611100629`, `202611100800`. SOLO writes them into the dispatch at the READY pass.

**Two pins of BEFORE YOU START are not the dispatch's five lines but are still PENDING here:** SHAPRE and SHAPOST, the check files' sha256s. Block C writes them into this document's blocks; SOLO copies the same two values into the dispatch's BEFORE YOU START. In this document the five value lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. **BEFORE YOU START also reads this document's first line at the held head and STOPs if it begins `NOT READY`.** The CLOCK CHECK writes ONE line to `/tmp/0110-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2 and the closing read each read by machine.

**THE START WINDOWS (strategy's S-1002-D P1.4, as the dispatches of 0100 to 0109 hold them), read from the clock, never typed.** Stage 1 starts inside one: Monday to Saturday 21:00 to 22:29 (everything before 08:00 the next morning) or 00:00 to 06:29 (everything before 08:00 that morning); Sunday any hour (stage 1 by Monday 06:29, everything before Monday 08:00). The two dispatch blocks stop unless the start window the clock is in lies inside the run window the dispatch names.

**THE MACHINE'S CLOCK IS HELD AGAINST NETWORK TIME, BY MACHINE, TWICE, ON UP TO TWO SOURCES; ANY SOURCE THAT DISAGREES STOPS THE BLOCK** (BEFORE YOU START and the CLOCK CHECK): `sntp time.apple.com` (up to three attempts; within 5 seconds) and the Date header of https://www.cloudflare.com (`curl -sI --max-time 8`; within 30 seconds). The clock is accepted when at least one of the two can be read and every one that was read agrees. GREEN never sets the clock. **One change from 0108's and 0109's lines, and only one: the Date header of https://api.github.com is dropped as a source.** The independent rehearsal of 2026-11-03 read it 37 seconds behind the machine (that header is cached, `max-age=60`) while `sntp` read the machine +0.046 s from network time; a source that is read and disagrees stops the block, so a cached header alone could STOP a correct night. The tolerances (5 s and 30 s) are unchanged. **The same hazard is in 0109's document (#1682, `docs/migration-apply-0109.md`, its BEFORE YOU START and CLOCK CHECK, and 0109's dispatch): 0109's document carries the same change since 2026-11-03.**

## BEFORE YOU START: network time, the held head, every pin, production's journal. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
SHA0110=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPREV=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPRE=29c55065878c900f8469ff33a9ae8faf0c0f23a8051a006667a96de3d1616d02
SHAPOST=c84c701fe7f44af372aa0f758a64b0d746c706e99c0842a63f0e8ea5d1eee013
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0110_services_booking_type_fields.sql
PREVMIG=packages/db/migrations/0109_location_saturday_hours.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0110} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){9}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. The journal read has not run"; exit 1; fi
test ! -f /tmp/0110-applied.ok || { AGE=$(find /tmp/0110-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0110 was applied in this sitting (/tmp/0110-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0110-start-head.sha /tmp/0110-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. The journal read has not run"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. On 2026-10-13 this clock was found 7 hours off. Do not set the clock yourself. The journal read has not run"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: neither of the two sources could be read (sntp time.apple.com, the Date header of https://www.cloudflare.com), so the clock is not shown to be right. Do not set the clock yourself. The journal read has not run"; exit 1; }
echo "network time:  the machine's clock agrees with every source that could be read. Read:${TOK}. Not read:${TNOT:- none}."
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. The journal read has not run"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. The journal read has not run"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
DOW=$(echo "${NOW}" | cut -c14)
echo "${DOW}" | grep -qx '[1-7]' || { echo "STOP: the weekday did not read as 1 to 7. The journal read has not run"; exit 1; }
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, HHMM and YYYYMMDD. The journal read has not run"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOWL} (YYYYMMDDHHMM), weekday ${DOW} (1 is Monday, 7 is Sunday): ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0110 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
NEXT=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${DAY}1200" '+%Y%m%d') || { echo "STOP: the next day did not compute. The journal read has not run"; exit 1; }
PREV=$(TZ=Europe/Lisbon date -j -v-1d -f '%Y%m%d%H%M' "${DAY}1200" '+%Y%m%d') || { echo "STOP: the previous day did not compute. The journal read has not run"; exit 1; }
echo "${NEXT} ${PREV}" | grep -qxE '[0-9]{8} [0-9]{8}' || { echo "STOP: the next and the previous day did not read as YYYYMMDD. The journal read has not run"; exit 1; }
SOPEN=none
SSTART=none
SEND=none
if [ "${DOW}" = 7 ]; then SOPEN=${DAY}0000; SSTART=${NEXT}0629; SEND=${NEXT}0800; elif awk -v t="${LT}" 'BEGIN { t += 0; if (t >= 2100 && t <= 2229) exit 0; exit 1 }'; then SOPEN=${DAY}2100; SSTART=${DAY}2229; SEND=${NEXT}0800; elif awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then SOPEN=${PREV}2100; SSTART=${DAY}0629; SEND=${DAY}0800; fi
if [ "${SSTART}" = none ]; then echo "STOP: Lisbon ${LT}, weekday ${DOW}, is closed by the weekday table but outside strategy's start windows (Monday to Saturday 21:00 to 22:29 or 00:00 to 06:29; Sunday any hour). The journal read has not run"; exit 1; fi
echo "${SOPEN} ${SSTART} ${SEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the start window did not compute. The journal read has not run"; exit 1; }
echo "start window:  Lisbon ${LT}, weekday ${DOW}, inside strategy's start windows: opens ${SOPEN}, stage 1 starts by ${SSTART}, everything ends before ${SEND}"
echo "run window:    this block names: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}"
[ "${SOPEN}" -ge "${WOPEN}" ] || { echo "STOP: the start window the clock is in opens at ${SOPEN}, before ${WOPEN}, where the run window this block names opens, so this is not the night the dispatch names. The journal read has not run"; exit 1; }
[ "${SSTART}" -le "${WSTART}" ] || { echo "STOP: the start window the clock is in lets stage 1 start until ${SSTART}, past ${WSTART}, the last minute the run window this block names allows, so this is not the night the dispatch names. The journal read has not run"; exit 1; }
[ "${SEND}" -le "${WEND}" ] || { echo "STOP: the start window the clock is in ends at ${SEND}, past ${WEND}, where the run window this block names ends, so this is not the night the dispatch names. The journal read has not run"; exit 1; }
echo "the night:     the start window the clock is in lies inside the run window this block names"
[ "${NOWL}" -le "${SSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${SSTART}, the last minute this start window lets stage 1 start. The journal read has not run"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so the held head may be stale. The journal read has not run"; exit 1; }
TIP=$(git rev-parse origin/db/RODICA-services-vat-colour) || { echo "STOP: the held head, origin/db/RODICA-services-vat-colour, could not be read. The journal read has not run"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. The journal read has not run"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the branch was pushed to since the READY line, or it is gone. The journal read has not run"; exit 1; }
echo "held head:     origin/db/RODICA-services-vat-colour IS the commit this block names"
echo "--- CI on the held head: the three required check runs, read from GitHub by machine; each must have concluded success (held-for-apply-blocks-merge fails by design and is not read)"
CIRUNS=$(gh api "repos/happygamer1919-tech/OsteoJP/commits/${HELD}/check-runs?filter=latest&per_page=100" --jq '.check_runs[] | [.name, .status, (.conclusion // "none")] | join("|")') || { echo "STOP: the check runs on the held head could not be read from GitHub, so CI on HELD is not shown green. The journal read has not run"; exit 1; }
for CN in 'DB-gated tests (RLS isolation, seeded DB)' 'Lint + typecheck + test' 'Playwright E2E (seeded DB)'; do
CIN=$(printf '%s\n' "${CIRUNS}" | awk -F'|' -v n="${CN}" '$1 == n { c++ } END { print c + 0 }') || { echo "STOP: the check runs read from GitHub could not be counted, so CI on HELD is not shown green. The journal read has not run"; exit 1; }
CIS=$(printf '%s\n' "${CIRUNS}" | awk -F'|' -v n="${CN}" '$1 == n && $2 == "completed" && $3 == "success" { c++ } END { print c + 0 }') || { echo "STOP: the check runs read from GitHub could not be counted, so CI on HELD is not shown green. The journal read has not run"; exit 1; }
[ "${CIN}" = 1 ] && [ "${CIS}" = 1 ] || { echo "STOP: CI on the held head is not shown green: the check run ${CN} on ${HELD} is missing, not finished, or did not conclude success (runs by that name: ${CIN}; of them completed with success: ${CIS}). A run that is not there is not a pass. The journal read has not run"; exit 1; }
echo "CI on HELD:    ${CN}: completed, success"
done
echo "CI on HELD:    all three required check runs concluded success on ${HELD}"
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. The journal read has not run"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. The journal read has not run"; echo "${STRAY}"; exit 1; }
WAS=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. The journal read has not run"; exit 1; }
echo "worktree:      clean, on ${WAS}"
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. The journal read has not run"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. The journal read has not run"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. The journal read has not run"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. The journal read has not run"; exit 1; }
echo "checked out:   ${TIP}, the held head, so the read below runs the reader it holds"
DOC=$(git show ${TIP}:docs/migration-apply-0110.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${TIP}:docs/migration-apply-0110.md | sed -n 1p) || { echo "STOP: the document's first line could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's first line read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '^NOT READY|[A-Z]-PENDING' || { echo "STOP: the document's first line begins NOT READY or carries a mark that ends in -PENDING, or it could not be searched, so the document at the held head is not the READY one. The journal read has not run"; exit 1; }
echo "first line:    READY (it does not begin NOT READY and carries no mark that ends in -PENDING)"
SIDE=$(git show ${TIP}:docs/migration-apply-0110.sha256) || { echo "STOP: the sidecar could not be read at the held head. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0110.md" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${TIP}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0110 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0110}" ] || { echo "STOP: 0110 at the held head is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${TIP}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0109 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "0109:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0109 at the held head is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${TIP}:scripts/db/precheck-0110-services-booking-type-fields.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check at the held head is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${TIP}:scripts/db/postcheck-0110-services-booking-type-fields.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "post-check:    ${SPOST}"
[ "${SPOST}" = "${SHAPOST}" ] || { echo "STOP: the post-check at the held head is not the approved file. The journal read has not run"; exit 1; }
SV=$(git show ${TIP}:packages/db/scripts/verified-migrate.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: verified-migrate could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "migrate:       ${SV}"
[ "${SV}" = "${SHAVM}" ] || { echo "STOP: verified-migrate at the held head is not the approved file. The journal read has not run"; exit 1; }
SG=$(git show ${TIP}:scripts/assert-production-target.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the target guard could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "guard:         ${SG}"
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard at the held head is not the approved file. The journal read has not run"; exit 1; }
SC=$(git show ${TIP}:scripts/check-journal.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: check-journal could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "check-journal: ${SC}"
[ "${SC}" = "${SHACJ}" ] || { echo "STOP: check-journal at the held head is not the approved file. The journal read has not run"; exit 1; }
test -f ${READER} || { echo "STOP: the migration reader is not on disk at the held head. The journal read has not run"; exit 1; }
test -f ${PTM} || { echo "STOP: scripts/production-target.mjs is not on disk at the held head. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed. The journal read has not run"; exit 1; }
echo "reader:        ${RW} (on disk at the held head: the program this read runs, and the closing read runs it from the same sha)"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the held head is not the pinned file. The journal read has not run"; exit 1; }
MW=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: scripts/production-target.mjs could not be hashed. The journal read has not run"; exit 1; }
echo "module:        ${MW} (scripts/production-target.mjs on disk, which the reader and the guard import)"
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the held head is not the pinned file. The journal read has not run"; exit 1; }
echo "every check passed. The journal read runs now"
unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. Nothing was applied"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was applied"; exit 1; }
node ${READER} 2>&1 | tee /tmp/0110-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 107' /tmp/0110-journal-before.out || { echo "STOP: the journal read does not say 107. Nothing was applied"; exit 1; }
echo "${TIP}" > /tmp/0110-start-head.sha || { echo "STOP: the held head could not be recorded. Nothing was applied"; exit 1; }
echo "held head recorded for the CLOCK CHECK: ${TIP}"
echo "BEFORE YOU START: every check passed, and the journal reads 107."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `window end: ... happens once ...`; three `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `held head now:` and `held head:     origin/db/RODICA-services-vat-colour IS the commit this block names`; `--- CI on the held head: ...`, then `CI on HELD:    <name>: completed, success` for each of `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)`, and `CI on HELD:    all three required check runs concluded success on <HELD>` (a required run that is missing, not finished, not success or there twice, no runs at all, or no answer from GitHub, STOPs before the journal read; `held-for-apply-blocks-merge` fails by design and is not read); `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `first line: READY ...`, `sidecar:`; `migration:`, `0109:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 107` (and 0110 listed as not applied on that ref); `held head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 107.` Exit 0. It writes nothing to production. An applied marker under 12 hours old stops the block.

## STAGE 0: the held head, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0110.sha256
MIG=packages/db/migrations/0110_services_booking_type_fields.sql
SHA0110=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPREV=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPRE=29c55065878c900f8469ff33a9ae8faf0c0f23a8051a006667a96de3d1616d02
SHAPOST=c84c701fe7f44af372aa0f758a64b0d746c706e99c0842a63f0e8ea5d1eee013
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0110-applied.ok || { AGE=$(find /tmp/0110-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0110 in this sitting, or the age of /tmp/0110-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0110-head.sha /tmp/0110-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so the held head may be stale. Nothing was applied"; exit 1; }
TIP=$(git rev-parse origin/db/RODICA-services-vat-colour) || { echo "STOP: the held head, origin/db/RODICA-services-vat-colour, could not be read. Nothing was applied"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${TIP})" = commit ] || { echo "STOP: the held head does not resolve to a commit"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was applied"; exit 1; }
echo "--- THE HEAD CHECK: the worktree must be on the held head this stage records"
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the worktree is not on the held head after the checkout. Nothing was applied"; exit 1; }
echo "the held head and HEAD: ${TIP}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at the held head"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0110 is not on disk at the held head, so it is not the branch that carries 0110"; exit 1; }
N110=$(find packages/db/migrations -maxdepth 1 -name '0110_*.sql' | wc -l | tr -d ' ')
[ "${N110}" = 1 ] || { echo "STOP: ${N110} files claim migration number 0110, not 1"; exit 1; }
N109=$(find packages/db/migrations -maxdepth 1 -name '0109_*.sql' | wc -l | tr -d ' ')
[ "${N109}" = 1 ] || { echo "STOP: ${N109} files claim migration number 0109, not 1"; exit 1; }
test -f scripts/db/precheck-0110-services-booking-type-fields.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0110-services-booking-type-fields.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0110}" ] || { echo "STOP: 0110 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0110-services-booking-type-fields.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0110-services-booking-type-fields.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===108&&e.idx===107&&e.tag==='0110_services_booking_type_fields'&&e.when===1788503200000&&p.idx===106&&p.tag==='0109_location_saturday_hours'&&p.when===1788503100000?0:1)" || { echo "STOP: the newest journal entry is not idx 107, tag 0110_services_booking_type_fields, when 1788503200000, of 108, after idx 106 tagged 0109_location_saturday_hours at when 1788503100000"; exit 1; }
test -f packages/db/migrations/0109_location_saturday_hours.sql || { echo "STOP: the file of journal idx 106 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0109_location_saturday_hours.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0109 on disk is not the file this document pins"; exit 1; }
echo "0109 on disk: 0109_location_saturday_hours.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0110-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '108 .sql files match 108 journal entries' /tmp/0110-check-journal.out || { echo "STOP: check-journal did not reconcile 108 files with 108 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0110 is closed hours only. R9 allows clinic hours only when all three proofs hold, and the third (a pre-check read on production in an earlier sitting) does not. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on the held head (scripts/migration-timeouts.test.mjs at ${TIP} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it alters public.services under ACCESS EXCLUSIVE, which every booking read joins and the reminder dispatcher reads at apps/web/lib/reminders/data.ts:161, and scans it to validate its four CHECKs)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0110 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0110 is closed hours only, whatever the three proofs read (the third does not hold), and the sitting waits. Nothing was applied"; exit 1; fi

echo "${TIP}" > /tmp/0110-head.sha || { echo "STOP: the sha could not be recorded in /tmp/0110-head.sha. Nothing was applied"; exit 1; }
echo "running from the held head ${TIP}, recorded in /tmp/0110-head.sha"
echo "0110 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `the held head and HEAD: <sha>`, the held head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0110.md: OK`; `newest journal entry: idx 107, when 1788503200000, tag 0110_services_booking_type_fields, of 108; before it idx 106, when 1788503100000, tag 0109_location_saturday_hours`; `0109 on disk: 0109_location_saturday_hours.sql, sha256 ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a`; check-journal's line with `108 .sql files match 108 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (proof 2 `no`, proof 3 `no`; they decide nothing here); `R9: closed hours by the weekday table. 0110 runs in closed hours only`; `running from the held head <sha>, recorded in /tmp/0110-head.sha`; then `0110 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

## CLOCK CHECK: the start window, recorded. GREEN pastes its dispatch's filled copy, right after stage 0

```
(
set -o pipefail
DOCSHA='PENDING: set at the READY line'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: the document's sha256 in this block is still PENDING, so it is NOT READY. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. Nothing was applied. Do not paste stage 1"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. Nothing was applied. Do not paste stage 1"; exit 1; fi
test ! -f /tmp/0110-applied.ok || { AGE=$(find /tmp/0110-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0110 was applied in this sitting (/tmp/0110-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0110-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0110-start-head.sha || { echo "STOP: BEFORE YOU START recorded no held head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0110-start-head.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0110-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0110-head.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0110-head.sha -nt /tmp/0110-start-head.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0110-start-head.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0110-head.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "held head at BEFORE YOU START: ${START}"
echo "recorded by stage 0:            ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: the held head moved between BEFORE YOU START and stage 0: the branch was pushed to during the sitting. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0110.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "document at the recorded sha: ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the recorded sha is not the approved one. Nothing was applied. Do not paste stage 1"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. On 2026-10-13 this clock was found 7 hours off. Do not set the clock yourself. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: neither of the two sources could be read (sntp time.apple.com, the Date header of https://www.cloudflare.com), so the clock is not shown to be right. Do not set the clock yourself. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "network time:  the machine's clock agrees with every source that could be read. Read:${TOK}. Not read:${TNOT:- none}."
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was applied. Do not paste stage 1"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12)
DOW=$(echo "${NOW}" | cut -c14)
echo "${DOW}" | grep -qx '[1-7]' || { echo "STOP: the weekday did not read as 1 to 7. Nothing was applied. Do not paste stage 1"; exit 1; }
LT=$(echo "${NOWL}" | cut -c9-12)
DAY=$(echo "${NOWL}" | cut -c1-8)
echo "${NOWL} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, HHMM and YYYYMMDD. Nothing was applied. Do not paste stage 1"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now: ${NOWL} (YYYYMMDDHHMM), weekday ${DOW} (1 is Monday, 7 is Sunday): ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0110 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
NEXT=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${DAY}1200" '+%Y%m%d') || { echo "STOP: the next day did not compute. Nothing was applied. Do not paste stage 1"; exit 1; }
PREV=$(TZ=Europe/Lisbon date -j -v-1d -f '%Y%m%d%H%M' "${DAY}1200" '+%Y%m%d') || { echo "STOP: the previous day did not compute. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${NEXT} ${PREV}" | grep -qxE '[0-9]{8} [0-9]{8}' || { echo "STOP: the next and the previous day did not read as YYYYMMDD. Nothing was applied. Do not paste stage 1"; exit 1; }
SOPEN=none
SSTART=none
SEND=none
if [ "${DOW}" = 7 ]; then SOPEN=${DAY}0000; SSTART=${NEXT}0629; SEND=${NEXT}0800; elif awk -v t="${LT}" 'BEGIN { t += 0; if (t >= 2100 && t <= 2229) exit 0; exit 1 }'; then SOPEN=${DAY}2100; SSTART=${DAY}2229; SEND=${NEXT}0800; elif awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then SOPEN=${PREV}2100; SSTART=${DAY}0629; SEND=${DAY}0800; fi
if [ "${SSTART}" = none ]; then echo "STOP: Lisbon ${LT}, weekday ${DOW}, is closed by the weekday table but outside strategy's start windows (Monday to Saturday 21:00 to 22:29 or 00:00 to 06:29; Sunday any hour). Nothing was applied. Do not paste stage 1"; exit 1; fi
echo "${SOPEN} ${SSTART} ${SEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the start window did not compute. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "start window: Lisbon ${LT}, weekday ${DOW}, inside strategy's start windows: opens ${SOPEN}, stage 1 starts by ${SSTART}, everything ends before ${SEND}"
echo "run window: this block names: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}"
[ "${SOPEN}" -ge "${WOPEN}" ] || { echo "STOP: the start window the clock is in opens at ${SOPEN}, before ${WOPEN}, where the run window this block names opens, so this is not the night the dispatch names. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${SSTART}" -le "${WSTART}" ] || { echo "STOP: the start window the clock is in lets stage 1 start until ${SSTART}, past ${WSTART}, the last minute the run window this block names allows, so this is not the night the dispatch names. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${SEND}" -le "${WEND}" ] || { echo "STOP: the start window the clock is in ends at ${SEND}, past ${WEND}, where the run window this block names ends, so this is not the night the dispatch names. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${NOWL}" -le "${SSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${SSTART}, the last minute this start window lets stage 1 start. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0110-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0110-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0110-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `window end: ... happens once ...`; `held head at BEFORE YOU START: <sha>` and `recorded by stage 0:            <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the three `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0110-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0110_services_booking_type_fields.sql
SHA0110=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPREV=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPRE=29c55065878c900f8469ff33a9ae8faf0c0f23a8051a006667a96de3d1616d02
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0110-applied.ok || { AGE=$(find /tmp/0110-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0110 in this sitting, or the age of /tmp/0110-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0110-precheck.new || { echo "STOP: the old /tmp/0110-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the held head must still be the sha stage 0 recorded."
test -f /tmp/0110-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0110-head.sha) || { echo "STOP: stage 0's record /tmp/0110-head.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-services-vat-colour) || { echo "STOP: the held head, origin/db/RODICA-services-vat-colour, could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "the held head now:   ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0110.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0110 is not on disk"; exit 1; }
test -f scripts/db/precheck-0110-services-booking-type-fields.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N110=$(find packages/db/migrations -maxdepth 1 -name '0110_*.sql' | wc -l | tr -d ' ')
[ "${N110}" = 1 ] || { echo "STOP: ${N110} files claim migration number 0110, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0110}" ] || { echo "STOP: 0110 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0110-services-booking-type-fields.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T109=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[106];process.stdout.write(p&&p.idx===106&&p.tag==='0109_location_saturday_hours'?p.tag:'none')") || { echo "STOP: node could not read journal idx 106's tag at the recorded sha. Nothing was applied"; exit 1; }
W109=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[106];process.stdout.write(p&&p.idx===106&&p.tag==='0109_location_saturday_hours'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 106's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W109}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0109's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T109}.sql || { echo "STOP: the file of journal idx 106 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T109}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0109 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0109: packages/db/migrations/${T109}.sql, sha256 ${SHAPREV}, journal when ${W109}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0110-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0110-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0110-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0110-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0110-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. Nothing was applied"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. Nothing was applied"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. Nothing was applied"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is not before ${WEND}, the run window's end, so the recorded window is not this sitting's. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. Nothing was applied"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was applied"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was applied"; exit 1; }

echo "--- the pre-check. READ ONLY, inside this block's own begin read only. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0110-services-booking-type-fields.sql -c "rollback" 2>&1 | tee /tmp/0110-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0110-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0110-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0110-precheck.new || true)
[ "${OKS}" = 11 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 11. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, services as they are, the name grants, the locks other sessions hold on services, idle_in_transaction_session_timeout): they decide nothing in this block, and the lead reads them"

NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read again before the apply. Nothing was applied"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST again before the apply, so the Lisbon zone may not have loaded [${NOWZ}]. Nothing was applied"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM again before the apply. Nothing was applied"; exit 1; }
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- THE CLOCK AND THE CLINICS (R9), again, right before the apply: only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
CL=$(psql "${DATABASE_URL_DIRECT:?}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (opens_at < time '08:00' or closes_at > time '21:00' or opens_at is null or closes_at is null)) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1) || { echo "STOP: the clinics' own hours could not be read (psql's lines are above). Nothing was applied"; exit 1; }
echo "active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row, or are not set: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=inside; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=outside; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "the clinics' own rows against the weekday table: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on the held head (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it alters public.services under ACCESS EXCLUSIVE, which every booking read joins and the reminder dispatcher reads at apps/web/lib/reminders/data.ts:161, and scans it to validate its four CHECKs)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0110 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0110 is closed hours only, whatever the three proofs read (the third does not hold), and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0110-postcheck.out /tmp/0110-stage2.ok /tmp/0110-journal-after.out /tmp/0110-apply.out /tmp/0110-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0110-precheck.new /tmp/0110-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0110-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only command in this document that can leave a write behind. Its full output is teed to /tmp/0110-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0110_services_booking_type_fields --sha256 ${SHA0110} --expect-pending 1 2>&1 | tee /tmp/0110-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. A lock not taken in 5 seconds reads journal 107 -> 107 (delta 0) above and applied nothing; it is still a halt. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0110-apply.out holds it). Whether 0110 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0110-applied.ok || { echo "STOP: verified-migrate exited 0, so 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0110-applied.ok could not be written, so stage 2 would refuse; stage 2 runs only on the owner's or the lead's word"; exit 1; }
echo "0110 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `the held head now:   <sha>`, the same sha twice; `docs/migration-apply-0110.md: OK`; `0109: packages/db/migrations/0109_location_saturday_hours.sql, sha256 ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a, journal when 1788503100000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 11 OK (verdict 3 `0 of 5; control 1`, verdict 4 `0 named; control 1`, verdict 5 `0 with a column ACL; control true`, verdict 7 `17xxxx`, verdict 8 `0; control 1`, verdict 9 `newest is 0109, when 1788503100000`, and the row `journal_rows_before` reading 107, which is verdict 10's row and one of the 11; the CARRY rows `policies_before`, `policies_md5`, `relation_acl_md5`, `services_rows`, `services_shape_md5`, `name_grants_md5`, `services_filenode`), its CARRY rows and INFO rows; then `the pre-check profile: 11 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0110 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0110-apply.out`: `pending    1  [0110_services_booking_type_fields]`, the drizzle-kit banner, `journal    107 -> 108  (delta 1)` and `0110_services_booking_type_fields present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`. They are not errors.
- `0110 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. If verified-migrate exits non-zero, do not read that as nothing applied: exit 3 or 4 can follow a committed apply. **A lock it cannot take in 5 seconds is a clean failure with nothing applied, and it does not say so in words** (0109's rehearsal): drizzle-kit prints `undefined` instead of the lock-timeout error; **its signs are exit 4, `journal    107 -> 107  (delta 0)` with `present by sha256: NO`, and about 5 seconds between the apply line and the STOP.** It is still a halt, and GREEN reports it and runs nothing else. 

## STAGE 2: the post-check and the journal, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0110=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPOST=c84c701fe7f44af372aa0f758a64b0d746c706e99c0842a63f0e8ea5d1eee013
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0110-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0110 APPLIED, then 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0110 APPLIED, then 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0110-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0110 APPLIED, then 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0110-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0110-head.sha) || { echo "STOP: stage 0's record /tmp/0110-head.sha could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-services-vat-colour) || { echo "STOP: the held head, origin/db/RODICA-services-vat-colour, could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "the held head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0110.sha256 || { echo "STOP: this document is not the approved one. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0110_services_booking_type_fields.sql || { echo "STOP: 0110 is not on disk. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0110-services-booking-type-fields.sql || { echo "STOP: the post-check is not on disk. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0110_services_booking_type_fields.sql | cut -d' ' -f1)" = "${SHA0110}" ] || { echo "STOP: 0110 on disk is not the approved file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0110-services-booking-type-fields.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0110-window.ok || { echo "STOP: no run window is recorded for this sitting. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0110-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0110-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0110-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0110-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0110-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
PM=$(carry policies_md5)
RM=$(carry relation_acl_md5)
SR=$(carry services_rows)
SS=$(carry services_shape_md5)
NG=$(carry name_grants_md5)
SF=$(carry services_filenode)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${PM}" ] && [ -n "${RM}" ] && [ -n "${SR}" ] && [ -n "${SS}" ] && [ -n "${NG}" ] && [ -n "${SF}" ] || { echo "STOP: a carry did not parse out of the transcript. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${SR} ${SF}" | grep -qxE '[0-9]+( [0-9]+){3}' || { echo "STOP: a count carry is not a number. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${RM} ${SS} ${NG}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){3}' || { echo "STOP: an md5 carry is not 32 hex characters. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} policies_md5=${PM} relation_acl_md5=${RM} services_rows=${SR} services_shape_md5=${SS} name_grants_md5=${NG} services_filenode=${SF}"

unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0110-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v policies_md5="${PM}" -v relation_acl_md5="${RM}" -v services_rows="${SR}" -v services_shape_md5="${SS}" -v name_grants_md5="${NG}" -v services_filenode="${SF}" -c "begin read only" -f scripts/db/postcheck-0110-services-booking-type-fields.sql -c "rollback" 2>&1 | tee /tmp/0110-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation or a column does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0110-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0110, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0110-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0110-postcheck.out || true)
[ "${VACS}" = 0 ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not 0. A VACUOUS verdict is not a pass: services read no row to hold the new values. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = 15 ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not 15. A verdict that is missing prints no FAIL. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0110 by hash"
JA=$(psql "${DATABASE_URL_DIRECT:?}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0110, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT:?}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0110}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0110 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0110, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0110 present by hash"
echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0110-stage2.ok || { echo "STOP: the pass mark /tmp/0110-stage2.ok could not be written, so the closing read would refuse. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "0110 POST-CHECK PASSED. 11/11 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; the five columns and their four CHECKs are there as the migration makes them, every one of the ${SR} rows holds NULL in the four and true in sms_reminders, no row was rewritten, and every other column of services, every policy (${PB} in all) and every privilege is as before. Paste the closing journal read now."
)
```

**EXPECT:** the carries line (eight carries, `journal_rows_before=107`); the post-check's table, `15 OK / 0 VACUOUS / 0 FAIL` (verdict 3 the five columns as the migration makes them, verdict 4 `5 of 5`, verdict 5 the four CHECKs validated, verdict 6 `4 of 4 match; differing: none`, verdict 7 `0 set, 0 not true, of <n> rows`, verdict 8 `1 distinct of 6 columns`, verdict 10 the filenode the pre-check read, verdict 13 `1 row, newest is 0110, when 1788503200000; control 1`, verdict 14 `108`); `journal rows before=107 after=108, 0110 present by hash`; the last three journal rows, 0110's sha256 newest; then `0110 POST-CHECK PASSED. ...`. Exit 0. It writes nothing: every psql call opens `begin read only`.

**No block writes after the apply.** An attempted write is the only direct proof that the server refuses a bad value, and a READ ONLY transaction refuses it before any CHECK or policy is evaluated. So the proof is split three ways, and none of it writes on production: **in CI** (`packages/db/tests/services-booking-type-fields.db.test.ts`, 40 of 40 on the throwaway after the apply, writes real rows and holds every CHECK's refusals by name; `packages/db/tests/service-type-fields.test.ts` (no database), 8 of 8, killed four mutants of the CHECK lists); **on the throwaway** (the rehearsal, where a write is at no one's expense); **on production**, the post-check's catalogue verdicts, READ ONLY.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0110 APPLIED, then 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0110-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0110 APPLIED, then 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0110-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0110-head.sha) || { echo "STOP: stage 0's record /tmp/0110-head.sha could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0110.sha256 || { echo "STOP: this document is not the approved one. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-services-vat-colour) || { echo "STOP: the held head, origin/db/RODICA-services-vat-colour, could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0: ${REC}"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0110-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0110-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0110-stage2.ok -newer /tmp/0110-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0110-window.ok || { echo "STOP: no run window is recorded for this sitting. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0110-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0110-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node ${READER} 2>&1 | tee /tmp/0110-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 108' /tmp/0110-journal-after.out || { echo "STOP: the journal read after the apply does not say 108. Stage 1 recorded that it applied 0110, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0110_services_booking_type_fields[.]sql$' /tmp/0110-journal-after.out || { echo "STOP: the journal read does not list 0110 as APPLIED. Stage 1 recorded that it applied 0110, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0110-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0110-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0110 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 108, 0110 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 108`, the line `APPLIED  0110_services_booking_type_fields.sql`, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, and `CLOSING READ: the journal reads 108, 0110 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after stage 2 printed its last line; after any STOP, never. **GREEN's report of this line is what R41 waits for.**

## GREEN REPORTED: the line SOLO needs before merging #1704 and then #1705 (R41)

SOLO merges nothing on its own belief that the apply ran. **The evidence is GREEN's report, pasted by the owner, and it must carry all three of these, verbatim, with exit 0 under each block:**

1. stage 1's last line: `0110 APPLIED. Paste stage 2 now.`
2. stage 2's journal rows, with `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e` as the newest row's hash, and its last line beginning `0110 POST-CHECK PASSED. 11/11 pre-check OK, post-check 15 OK / 0 VACUOUS / 0 FAIL, journal 107 to 108;`
3. the closing read's last line, exactly: `CLOSING READ: the journal reads 108, 0110 is APPLIED, and nothing is pending on the recorded sha.`

**SOLO writes the journal row first** (the board's and CLAUDE.md's number table: 0110 applied, the date and the Lisbon time GREEN printed, production journal 108), **then** steps 3 to 5 of the order above. **The label removal is its own command, never combined with another edit.** A report with any STOP, FAIL, VACUOUS or a missing line is not GREEN REPORTED: SOLO merges nothing, and the lead rules.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `11 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 11: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `15 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: STOP, the state is UNKNOWN. A VACUOUS, or an OK count that is not 15: STOP, the write stands. A psql exit that is not 0: STOP, which says it read nothing |

**The pre-check, `scripts/db/precheck-0110-services-booking-type-fields.sql`: 11 verdicts OK, 7 CARRY rows, 5 INFO rows.** READ ONLY. 0: the transaction is read only. 1: the session is `postgres` (control: `authenticated` is not). 2: it reads `services` past its policies (control: `authenticated` does not). 3: none of the five new columns exists (control: `price_cents` is found). 4: no constraint of the four new names in `public` (control: `services_tenant_id_tenants_id_fk` is found once). 5: no column of `services` carries a column-level grant, the migration's section 2 premise (control: `authenticated` may SELECT `name`). 6: the five roles exist. 7: Postgres 17. **The journal:** 0110 absent by hash with 0109 found once as the control (8), 0109 the newest row by hash at its `when` 1788503100000 (9), and 107 rows (10, the row `journal_rows_before`). The carries: `policies_before`, `policies_md5`, `relation_acl_md5`, `services_rows`, `services_shape_md5`, `name_grants_md5`, `services_filenode`. The INFO rows: the server version; `services` counts; the `name` grants as `role:privilege:allowed`; the locks other sessions hold on `services` now; `idle_in_transaction_session_timeout`.

**The post-check, `scripts/db/postcheck-0110-services-booking-type-fields.sql`: 15 verdicts.** READ ONLY. 0 to 2 repeat the pre-check's frame. 3: the five columns in column order with type, NOT NULL and default. 4: each COMMENT is the migration's text, exactly (5 of 5). 5: the four CHECKs, each once in `public`, `c`, validated. 6: their four definitions as `pg_get_constraintdef` prints them (pinned without a database, **confirmed on the rehearsal of 2026-11-03**). 7: every existing row: the pre-check's count, none of the four nullable columns set, `sms_reminders` true on all (VACUOUS at 0 rows; the block stops on it). 8: each new column's privileges equal `name`'s for six roles and four privileges, `name`'s equal the carry, and no column ACL. 9: the rest of `services` gives the carry `services_shape_md5`. 10: **no rewrite**: `pg_relation_filenode` is the carry. 11 and 12: every policy and every relation privilege in `public` unchanged. **The journal:** 0110 present once by hash as the newest row at its `when` 1788503200000, with 0109 found once as the control (13), and the journal moved by exactly one (14).

## Rehearsal record

**2026-11-04, 00:06 Lisbon: THE INDEPENDENT REHEARSAL OF THE BYTES BEFORE FIX ROUND 3, REHEARSED OK, on BLUE** (transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`). What it could not run is under "NOT REHEARSED, said one by one". Fix round 3 (2026-11-04) changed lines after it. The record below is the earlier one, kept as it was.

**THE INDEPENDENT REHEARSAL, 2026-11-03, 14:55 TO 15:12 LISBON, ON BLUE, OF ALL THREE NIGHTS END TO END** (the independent rehearsal of 2026-11-03 (Tuesday, 14:55 to 15:12 Lisbon, on BLUE, by a session that did not write the blocks; transcripts in `/Users/ivan/osteojp-handover/rh1103-transcripts/`)). 0110 was applied after 0109 on a throwaway at production's position, through the blocks of this document as they stood before the amendments listed under "Review history". **Every count matched:** pre-check 11 OK / 0 VACUOUS / 0 FAIL, post-check 15 OK / 0 VACUOUS / 0 FAIL; the promotion byte-identical (`e0e4a9e8...`); check-journal 108 of 108; the migration's own DB test green. Verdict 6's four CHECK definitions, pinned without a database, read exactly as printed: **confirmed**. **The lock-timeout path through `verified-migrate.mjs`, rehearsed** (a second session holding a lock on `services`): `journal    107 -> 107  (delta 0)`, `0110_services_booking_type_fields present by sha256: NO`, `FAIL: drizzle-kit migrate exited 1.`, stage 1's STOP `the apply exited 4 ...`, exit 4, about 5 seconds, nothing applied. **The re-run refusals, rehearsed:** after the apply, stage 0 and stage 1 pasted again each stopped with `STOP: stage 1 has ALREADY APPLIED 0110 in this sitting ...`, in zsh and in bash. **The moved-held-head STOP, rehearsed** on 0112's chain (`STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above`); the line is the same in this document.

**The builder's rehearsal of the migration alone, before the documents existed:**

**The migration (not the blocks) was rehearsed by its builder on the BLUE lane (127.0.0.1:54622; production never contacted). No block of this document has been run anywhere.**

- **On the earlier bytes** (sha256 `dc39d204a603fb3b91fac38d311260fe754d418777150516472e267bec15cf6d`, at `08b852a6`), recorded in #1704's body: the stack built from the branch's `supabase/migrations` (106 migrations, the last `0108`), one synthetic tenant with 20 services (23 rows in `services`). Columns before: 0 of 5. Apply while another session holds a lock on `services`: refused after 5 s, `canceling statement due to lock timeout`, 0 of 5 columns after. Apply in one transaction: `ALTER TABLE` and five `COMMENT`, under 1 s. Rows 23 before and after, the md5 of every existing column of every row unchanged. **No rewrite** (`pg_relation_filenode` 18673 before and after). 0 rows with any of the four nullable columns set; 23 of 23 with `sms_reminders` true. The four CHECKs by name. One policy on `services`, unchanged. 0 column grants the new columns hold that `price_cents` lacks. **Second apply refused** (`column "color" ... already exists`), nothing changed. After the apply: `services-booking-type-fields.db.test.ts` 40 of 40; `packages/db` 1838 of 1838; `apps/web` DB-gated 1149 of 1149; `apps/api` DB-gated 166 of 166. Before it, the same file 40 skipped, and with a probe copy of the file in `migrations/` it THROWS, as it must.
- **On the final bytes** (`e0e4a9e8`; the only change is the `sms_reminders` COMMENT text, R4 MINOR-3), recorded in SOLO's interim report of 2026-11-03 (`/Users/ivan/osteojp-handover/report-solo-interim-20261103.md`, line 25), verbatim: "re-rehearsed on final bytes Tue 09:29: apply ok, no table rewrite, re-apply refused, DB test 40/40". **This document cites that line, not a transcript:** the 09:29 output is not in the handover folder, and #1704's body still describes only the earlier bytes (step 6 above).
- **NOT REHEARSED by either run:** 0110 applied after 0109 (both stacks ended at 0108; 0109 alters `locations`, 0110 `services`, no shared object, so the order is not expected to matter); `drizzle-kit migrate` and `verified-migrate.mjs` (both used `psql --single-transaction`); every block below.

**THE AUTHOR'S DRY RUNS, 2026-11-03, NOT THE REHEARSAL (the author wrote these blocks; no database; production never contacted).** In a scratch clone of the repository (`git clone --shared`), detached at #1704's head `3d640af1` with #1682's head `7485190a` merged in to stand for `main` after #1682 merges: **block B** ran whole in `zsh -f` in GREEN's shape and exited 0 (`renamed, bytes unchanged ... e0e4a9e8...`, `journal: idx 107, tag 0110_services_booking_type_fields, when 1788503200000, of 108`, `supabase/migrations in sync (108 files)`, `README: the row moved to the Promoted table`, check-journal `108 .sql files match 108 journal entries`, one commit with the trailer); **block C** exited 0 (the two check files cut out byte for byte equal to Appendices A and B, pinned in 3 and 3 places, the sidecar `OK`); **block D** exited 0 (the first line gone, HELD and DOCSHA printed). Then, with the scratch clone's `origin` pointed at a local bare repository holding that head as `db/RODICA-services-vat-colour`, and its `cd` and `/tmp/0110-` paths substituted, **GREEN's stage 0 ran from the committed document** and printed every line up to its clock: `the held head and HEAD`, `docs/migration-apply-0110.md: OK`, `newest journal entry: idx 107, when 1788503200000, tag 0110_services_booking_type_fields, of 108; before it idx 106, when 1788503100000, tag 0109_location_saturday_hours`, `0109 on disk: ... ddce91be...`, check-journal 108 of 108, the three proof lines, then `STOP: Lisbon 21431 is inside clinic hours by the weekday table ...`, exit 1, as it must on a Tuesday afternoon. With `pnpm install --frozen-lockfile --offline` and `DATABASE_URL=` blank on that head: `migration-syntax.test.ts` **217 of 217**; `migration-timeouts.test.mjs` and `gate-freeze.test.mjs` **27 of 27**. **Not run:** block A (it reads #1682's state from GitHub and merges the real `main`), the push block, BEFORE YOU START, the CLOCK CHECK, stages 1 and 2 and the closing read (each needs the network clock, production's credentials or a database).

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, a lock not taken in 5 seconds included, nothing changed (`journal    107 -> 107  (delta 0)`).
- **After the COMMIT, going back is one statement,** run after the SET LOCAL lines, in one transaction: `ALTER TABLE public.services DROP CONSTRAINT services_color_hex, DROP CONSTRAINT services_vat_rate_allowed, DROP CONSTRAINT services_vat_exemption_code_allowed, DROP CONSTRAINT services_follow_up_days_allowed, DROP COLUMN color, DROP COLUMN vat_rate, DROP COLUMN vat_exemption_code, DROP COLUMN follow_up_days, DROP COLUMN sms_reminders;` It takes ACCESS EXCLUSIVE on `services` for about as long as the apply did. **Before #1704 merges it loses nothing** (every row NULL in the four, true in `sms_reminders`). **After #1704 merges it BREAKS THE APP FIRST:** `schema.ts` then names the five columns in every insert into `services`, so #1704 (and #1705) must be reverted and deployed BEFORE such a migration runs. **After #1705 merges and the clinic has saved values, it DESTROYS them.**
- **Who runs it: it is owner-confirmable and it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0110 stays: a journal row is never deleted. **GREEN never runs that statement from this document; SOLO never runs it at all; and no block here contains it.**

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | Launch GREEN and hand it SOLO's dispatch, `/Users/ivan/osteojp-handover/green-dispatch-0110-1110.txt`, which names `0110_services_booking_type_fields.sql` | on the chain night (C1), Sunday 2026-11-08, after SOLO's "NEXT OK" on 0109 (GREEN REPORTED, the journal at 107), the stacked promotion (C3), the R4 round, the independent rehearsal of the whole chain (C3) and SOLO's READY line; from 22:00 Lisbon at the earliest, in closed hours, inside its run window, no new sitting after 02:00 Lisbon (C2) | the sitting, from the held head: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 2 | Paste GREEN's report to SOLO | when it arrives | GREEN REPORTED, if it carries the three lines; if it carries a STOP, nothing is pasted again and the lead rules |
| 3 | Only if the harness refuses SOLO under R41: take `held-for-apply` off #1704, merge it; then the same for #1705 | after GREEN REPORTED, `main` merged into each, CI green | `main` and production agree again, and the screen goes live |

## GATE-CHANGES

- **None before the apply, and none forced by it.** The promotion edits no gate file (`.github/gate-manifest.json` names no file under `packages/db/tests`). 0110 creates no SECURITY DEFINER function, so `EXPECTED_COUNT` does not move.
- **Written 2026-11-05: the fault-injection test** `scripts/services-type-fields-0110.test.mjs`, run by `pnpm test:scripts`; an added `scripts/*.test.mjs` is a pin `scripts/gate-freeze.test.mjs` tolerates (precedent #1684), frozen at the next GATE-CHANGE that regenerates the manifest.
- **After the merge, the owner's:** `.github/scripts/assert-rls-executed.mjs` lists `services-booking-type-fields.db.test.ts` in `SUITES` (hard), so its absence from CI turns red; its own GATE-CHANGE, as 0108's and 0109's.

## NOT REHEARSED, said one by one

**THE INDEPENDENT REHEARSAL OF THE BYTES BEFORE FIX ROUND 3, 2026-11-04 (00:06 Lisbon, on BLUE, REHEARSED OK; transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`), recorded these as NOT REHEARSED, in its words: the target guard, the journal reader, block A gh MERGED, the pushes, CI on HELD, and the production environment file's contents.**

- **Fix round 3 (2026-11-04), made after that rehearsal:** the `unset DATABASE_URL DATABASE_URL_DIRECT` line, with its own halt, immediately before each of the four lines that load the production environment file (BEFORE YOU START, stage 1, stage 2, the closing read), and BEFORE YOU START's CI check (`gh api repos/happygamer1919-tech/OsteoJP/commits/${HELD}/check-runs`, then `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)`, each once and concluded success). Each passes `bash -n` and `zsh -f -n`; no rehearsal has run them. They are the lines 0109's document carries, with the number changed, and 0109's script test holds them against stubs; this document's own script test (written 2026-11-05) holds them against stubs too. The CI check alone was run in `zsh -f` against GitHub only, read only: #1682's green head `efc0f161` passes and a sha with no check runs STOPs (`/Users/ivan/osteojp-handover/rh1104-transcripts/ci-check-*.out`). "fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending".
- **The READY pass (2026-11-05), made after that rehearsal:** the `:?` in the six psql lines that connect to production (`psql "${DATABASE_URL_DIRECT:?}"`: stage 1's pre-check and clinics read, stage 2's post-check, journal count, hash count and last three rows). No rehearsal on a stack has run them. They are proven by 0109's fault-injection script test, whose blocks these are, re-keyed (and, since 2026-11-05, by this document's own test), and by the R4 reviewer's shell experiment.

**Rehearsed on 2026-11-03 ("Rehearsal record"):** the blocks end to end on a throwaway at production's position, in order after the migration before; the pre-check and post-check profiles; the promotion; the lock-timeout path through `verified-migrate.mjs`; the re-run refusals; the moved-held-head STOP. **Still NOT REHEARSED, one by one:**

- **The CLOCK CHECK's start-window record and the run-window lines of stages 1, 2 and the closing read, on a real night.** The rehearsal ran in clinic hours, so the clock steps stopped as they must (for example `STOP: Lisbon 202611031502, weekday 2, is inside clinic hours by the weekday table ...`); the window comparisons after them ran only with the rehearser's substitutions.
- **The production target guard.** It refuses a throwaway by design, and did on BLUE: `REFUSING: project ref is "postgres", not the production project.` The lines that load the production environment file and run the guard in stages 1 and 2 are NOT REHEARSED.
- **The applied-migrations reader** (BEFORE YOU START's journal read and the closing read). It refuses anything but production, as it did for 0109 (`REFUSED: ... the target's ref is not ...`); the greps after it (`journal rows on production: ...`, `APPLIED ...`, `pending on this ref: 0`) were read in its place by a READ ONLY psql.
- **Block A' (the stacked merge, C3), which replaced block A's read of #1682's MERGED state on 2026-11-05.** A' reads no pull request's state. Its author ran it once, to make the promotion pushed that day (`bbb58aad`), which is not a rehearsal; its halts are proven by the fault-injection script test (every external call failing in turn, bash and zsh), not against GitHub. The independent chain rehearsal (C3) runs it again from a scratch clone.
- **The bytes changed after the rehearsal** ("Review history", the amendment of 2026-11-03): the network-time source list (sntp and Cloudflare only), block A's `--repo`, block C's note on its cut files, the filled policy pins and the check files' comments. Each is small and each block still passes `bash -n` and `zsh -f -n`; none has been run again. Nor has the credential load of the closing read and of BEFORE YOU START as the review fixes of 2026-11-03 changed it (the `set -o allexport` and `.` lines of stages 1 and 2, in place of `node --env-file`).
- **The fault-injection script test** (`scripts/services-type-fields-0110.test.mjs`), written 2026-11-05 after every rehearsal: it runs the blocks against stubs, never against a database.
- **The post-check's missing-variable guards (2026-11-05, a new SHAPOST), made after every rehearsal:** no rehearsal has run the post-check's final bytes. The C3 chain rehearsal runs them.
- **Production:** its rows, grants, policies, triggers and locks were not read. The pre-check pins every one it depends on, so a difference stops the sitting at the pre-check rather than passing unseen.
- **DOCSHA and HELD:** the READY line moves both, and any later amendment moves them again.

## Review history

- **2026-11-03:** authored by SOLO's builder from 0109's document at `7485190a` (the template), 0106's promotion section and 0108's dispatch; the blocks re-keyed by machine (`blocks.py`, every replacement counted, every block `bash -n` and `zsh -f -n` clean); the check files written new and run against no database; the sweep and sleeping-job reads grepped at `origin/main` `f065b82e` and at the six pull request heads. The author's dry runs in scratch clones ("Rehearsal record") found two faults in block B before this text was written, both fixed: the conflict-marker check read the whole tree (a committed handoff note under `docs/handoff/` holds marker-like lines) and now reads only the lines the merge added against each parent; the mirror check compared bytes, but `scripts/sync-supabase-migrations.mjs` prepends a header, so it now runs that script with `--check`. Not reviewed. Not rehearsed.
- **2026-11-03, after the independent rehearsal (14:55 to 15:12 Lisbon, BLUE), on the coordinator's word:** the rehearsal's read policy-expression md5s written into the post-check where it had `PIN-PENDING` (0111 and 0112), and no `PIN-PENDING` string left in either check file, so block C no longer stops on its own check; the definitions pinned without a database marked confirmed; **the Date header of https://api.github.com dropped as a network-time source** in BEFORE YOU START and the CLOCK CHECK (cached, read 37 s behind on the rehearsal while sntp read +0.046 s), sntp and Cloudflare kept, the tolerances unchanged, and the same hazard named for 0109's document; block A's `gh pr view` given `--repo happygamer1919-tech/OsteoJP`; block C says that a STOP after its cuts leaves the two check files untracked and that a re-run overwrites them; the rehearsal recorded and "NOT REHEARSED" rewritten; 0110's order step 5 names #1705's conflicts with today's `main`. Every block re-checked with `bash -n` and `zsh -f -n`. **The first line stays `NOT READY`: SOLO removes it after a fresh R4 round on these bytes.**
- **2026-11-03, review fixes (the coordinator's instruction):** the CI runs on the head GREEN applies from are recorded in GREEN's dispatch, not in this document (recording them here is a new commit, and so is block D), after SOLO reads `gh pr checks 1704 --repo happygamer1919-tech/OsteoJP` all green on HELD; the network-time heading says up to two sources, and that any source that disagrees stops the block; the closing read loads the production environment file the way stages 1 and 2 do (`set -o allexport` and `.`), no longer with `node --env-file`; the rehearsal record cites the transcripts at `/Users/ivan/osteojp-handover/rh1103-transcripts/`. The dispatch now says plainly that no block enforces the 06:00 hard end or the 21:40 to 21:59 sweep rule, and that GREEN keeps both by hand. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed closing read is NOT REHEARSED.
- **2026-11-03, BEFORE YOU START's credential load, and the review status (the coordinator's instruction):** BEFORE YOU START's journal read loads the production environment file the way stages 1 and 2 and the closing read do (`set -o allexport` and `.`, the same line as stage 1's), no longer with `node --env-file`, which lets a variable already exported in the shell win over the file; the owner's shell profile exports variables. GREEN's dispatch carries the same block, byte-equal to this document's but for the window values. No block now runs `node --env-file`. The status line, the first line and the order now say where the review stands: the R4 round on the 2026-11-03 bytes is done (SHIP AFTER FIXES), its fixes are applied, and their re-check is pending. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed line is NOT REHEARSED (the reader refuses a throwaway by design).
- **2026-11-04, fix round 3 (the coordinator's instruction; the prior bytes kept as `/Users/ivan/osteojp-handover/apply-0110-types-prices-vat.md.bak-fix3-1104`, sha256 `776ededb...`):** the R4 re-check (2026-11-03, SHIP / SHIP AFTER FIXES) and the independent rehearsal of the bytes before fix round 3 (2026-11-04 00:06 Lisbon, REHEARSED OK on BLUE, transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`) are recorded in the first line, the status line and the order, with the rehearsal's NOT REHEARSED list. Two rehearsal findings fixed. **(1) Stale variables:** each of the four blocks that load the production environment file (BEFORE YOU START, stage 1, stage 2, the closing read) runs `unset DATABASE_URL DATABASE_URL_DIRECT` immediately before its `set -o allexport` and `.` line, inside the same subshell and with its own halt, so a value left in the shell can never win for a variable the file does not define (the target guard and the reader read `DATABASE_URL_DIRECT` first, then `DATABASE_URL`). **(2) CI on HELD is machine-checked:** BEFORE YOU START, after the held head is verified and before the journal read, reads the check runs on HELD through `gh api` and STOPs unless `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)` each appear once and concluded success, the names read from #1682's green head `efc0f161`; a missing run, a zero count or an unreadable answer STOPs, and `held-for-apply-blocks-merge` (which fails by design) is not read. The dispatch's CI lines are a record only. R4 NIT-4: the fault count 0109's test reports (the section on explicit halts). GREEN's dispatch carries BEFORE YOU START and the CLOCK CHECK byte-equal to this document's but for the window values. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed lines are NOT REHEARSED. **"fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending".**
- **2026-11-05, the READY pass (the coordinator's instruction; R4 on it: PASS, 2 MINOR and 3 NIT, the two MINORs and NIT 1 fixed in prose, NITs 2 and 3 no change):** the six psql lines that connect to production use `"${DATABASE_URL_DIRECT:?}"`, so an unset variable fails loudly, each line keeping its own halt (the one implicit halt this makes, and why it cannot be reached, is under "No block carries `set -e`"); an R9 paragraph (strategy's R9 of 2026-11-04) added under "The sweep and the sleeping job", from the independent audit at `origin/main` `94e8fa68`, each cited line re-read there; the rehearsal of 2026-11-04 00:06 is called the rehearsal of the bytes before fix round 3, not of the final bytes; the new bytes added to "NOT REHEARSED, said one by one". This document has no sidecar.
- **2026-11-05, the chain night (the coordinator's instruction, on strategy's C1 to C5 of 2026-11-05):** "What must happen first", the Ruling row, "The night", the dispatch's window text, OWNER CLICKS row 1, the merge order (C5), the NOT REHEARSED line about block A's MERGED read and the R9 statement (C4) reworded to the chain night. The post-check gains 0109's missing-variable guard for each of its 8 carries (a new SHAPOST). The migration is byte-identical.
- **2026-11-05, the R4 fixes (R4 of the chain-night changes: PASS, no MAJOR; the coordinator's instruction):** block A' and block B count the merge's conflict marker lines from a diff read with its own halt, and STOP when the count is not a number (it failed open); block A' also STOPs when the lower head changed a migration, mirror or pending file after the pinned lower commit; the chain starts at 22:00 Lisbon (the lead's decision), with the window values and every block unchanged; the R9 statement says so; stale prose (not promoted, the script test not written, the 0109 network-time note, #1705's resolution date) reworded; the seed.sql merge note (C5); the post-check's header, and its new guards in NOT REHEARSED. GREEN's stage blocks are unchanged by this round.

