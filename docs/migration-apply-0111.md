# 0111: apply Sistemas and SubSistemas (the health_systems list and two fields on the patient)

**TOUCHES WHAT THE SWEEP OR THE SLEEPING JOB READS: YES, ONE TABLE THEY READ IS ALTERED, AND NOTHING IT ADDS.** 0111 alters `public.patients` (ACCESS EXCLUSIVE until its COMMIT), which every reminder send reads at `apps/web/lib/reminders/data.ts:155` (seven `patients` columns at `:140` to `:146`) and the survey job reads inside `public.issue_survey_automatic` (`packages/db/migrations/0102_sat01_satisfaction_survey.sql:501`). Its new table's foreign keys take SHARE ROW EXCLUSIVE on `tenants` and `users`, which the same send joins (`data.ts:156`, `:158`): that blocks writes, not reads. No reminder code reads `health_systems`, `patients.health_system_id` or `patients.health_system_number` (grep below: 0 lines at every ref).

**While its first line reads `NOT READY`, nothing in this document may be pasted.** That line says why, and BEFORE YOU START refuses any copy of this document whose first line begins `NOT READY`: SOLO removes that line, and only that line, at the READY line (block D), after the R4 round and the independent rehearsal. Then come the pull request's state (#1706, held, `held-for-apply`, unarmed) and GREEN's dispatch (`/Users/ivan/osteojp-handover/green-dispatch-0111-1111.txt`), which carries the values this document cannot hold (the held head's sha as HELD, this document's sha256 at that head as DOCSHA, and the run window as WOPEN, WSTART and WEND). **The sitting runs from the pull request's HELD head, before the merge** (see "Applied from the held head"), **in closed hours only, as the third of the four sittings of the chain night (strategy's C1, 2026-11-05)** (see "Closed hours, the night, and the lock").

**Status: AUTHORED 2026-11-03 BY SOLO'S BUILDER, OUTSIDE THE REPOSITORY (`/Users/ivan/osteojp-handover/apply-0111-sistemas.md`), FROM `docs/migration-apply-0109.md` AT #1682's HEAD `7485190a` (THE TEMPLATE) AND 0108'S DISPATCH. THE SIX BLOCKS ARE 0109'S, RE-KEYED BY MACHINE (EVERY REPLACEMENT COUNTED) AND SYNTAX-CHECKED IN `bash -n` AND `zsh -f -n`; THE CHECK FILES (APPENDICES A AND B) ARE NEW. REHEARSED 2026-11-03, 14:55 TO 15:12 LISBON, ON BLUE, BY A SESSION THAT DID NOT WRITE THE BLOCKS, ALL THREE NIGHTS END TO END: EVERY COUNT MATCHED (SEE "REHEARSAL RECORD"). AMENDED AFTER IT (SEE "REVIEW HISTORY"). R4 ROUND ON THE 2026-11-03 BYTES: DONE (SHIP AFTER FIXES), ITS FIXES APPLIED, AND THEIR R4 RE-CHECK DONE (2026-11-03, SHIP / SHIP AFTER FIXES). THE INDEPENDENT REHEARSAL OF THE THEN-FINAL BYTES: DONE (2026-11-04 00:06 LISBON, REHEARSED OK ON BLUE, TRANSCRIPTS `/Users/ivan/osteojp-handover/rh1104-transcripts/`), ON THE OLD MIGRATION BYTES (`ae7cad96` / `4f493188`). 2026-11-05: THE MIGRATION'S BYTES CHANGED FOR Q12 (ACCENT-BLIND UNIQUE NAMES, #1706 HEAD `1950d3e3`); A RE-REHEARSAL ON THE FINAL BYTES IS OWED BEFORE READY. "fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending". PROMOTED 2026-11-05 ON THE STACK ABOVE #1704 (C3, `8790f98a`). NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, `packages/db/migrations/0111_sistemas_subsistemas.sql` (promoted from `packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql` with no byte changed), sha256 `e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f`, journal idx 108, tag `0111_sistemas_subsistemas`, twenty statements (three SET LOCAL lines, CREATE TABLE, CREATE INDEX, COMMENT, the RLS switch, one REVOKE and two GRANTs, the foreign keys, the ALTER TABLE on patients, two COMMENTs, three CREATE POLICY last).

**In plain language.** Each clinic gets its own list of **Sistemas / SubSistemas** (health systems and subsystems, a name each, as in Fisiozero), and every patient gets two empty fields: **Sistema/SubSistema** (an entry of their own clinic's list) and **Nº da Entidade / Subsistema** (free text). Every staff role can read the list; only the owner and admins can add to it or change it; nobody can delete an entry (it is switched off instead, so a ficha that names it keeps its label); the same name cannot be entered twice in one clinic. This migration writes no value into any existing row and changes no behaviour: nothing reads the list or the fields until the screens (#1707) merge after the apply. **It is a list and a label only:** no price, discount, comparticipação or invoice reads anything it adds (strategy's U2: the insurer list and the two ficha fields enter V1; comparticipação, insurer pricing and insurer invoicing stay out). The switch "Usa tabela de preços de Sistemas" needs no column (it lives in the clinic's settings and does nothing yet).

Six blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the held head, every pin, the document's first line, production's journal), stage 0 (the files, the journal, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0111 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md` and of 0109's document, word for word, with the number changed; GREEN's dispatch carries it in the same words.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **Stage 2 is READ ONLY, every psql call of it.** **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`. The second line of each block is `set -o pipefail` and nothing more. **WRITTEN 2026-11-05:** the fault-injection test that runs every block in that shape, in bash and in zsh, with each external call made to fail in turn (`scripts/sistemas-0111.test.mjs`, 0109's test re-keyed by machine), which also proves block A' and the chain gate; its counts are in \"Review history\".

**The check files count, and the blocks count again.** No check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `14 OK / 0 VACUOUS / 0 FAIL` of the pre-check, `25 OK / 0 VACUOUS / 0 FAIL` of the post-check. **A psql exit that is not 0 on any of them means the read did not complete.** Stage 2's STOP on the post-check's own run says so, and never that 0111 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## The sweep and the sleeping job: what 0111 touches that they read

**TOUCHES WHAT THE SWEEP OR THE SLEEPING JOB READS: YES, ONE TABLE THEY READ IS ALTERED, AND NOTHING IT ADDS.** 0111 alters `public.patients` (ACCESS EXCLUSIVE until its COMMIT), which every reminder send reads at `apps/web/lib/reminders/data.ts:155` (seven `patients` columns at `:140` to `:146`) and the survey job reads inside `public.issue_survey_automatic` (`packages/db/migrations/0102_sat01_satisfaction_survey.sql:501`). Its new table's foreign keys take SHARE ROW EXCLUSIVE on `tenants` and `users`, which the same send joins (`data.ts:156`, `:158`): that blocks writes, not reads. No reminder code reads `health_systems`, `patients.health_system_id` or `patients.health_system_number` (grep below: 0 lines at every ref).

**Strategy's R9 (2026-11-04), under the column and policy reading C4 names (2026-11-05):** 0111 touches nothing the sweep or the sleeping job reads by column or by policy. It adds two columns to `patients` that no reminder, survey or Inngest code reads (the grep below: 0 lines; `public.issue_survey_automatic` names its `patients` columns one by one), it creates `health_systems`, which nothing in the jobs reads, and its three policies are on that new table only; no policy of a table the jobs read is created, changed or dropped. Its one contact is the lock on `patients` (and the FK's validation scan of it). The chain starts at 22:00 Lisbon, after the sweep's last pass (21:45) and after the last 24-hour sends for Monday's visits; a send that still meets the lock waits behind it, and a lock the apply cannot take in 5 seconds is a clean lock-timeout STOP with nothing applied, which ends the chain (C2). So it runs on the chain night. C4 also rules that the chain runs while the sweep is in shadow, and that night's heartbeats and shadow rows are flagged in the next compare as "migration night".

**What "the sweep" and "the sleeping job" are, read from the code on `origin/main` at `f065b82e` (2026-11-03), not from memory.**

- **The sweep:** the Inngest function `sweep-due-reminders` (`apps/web/lib/reminders/inngest/sweep.ts:52`, id at `:54`), every 15 minutes from 07:00 to 21:45 Lisbon (`apps/web/lib/reminders/sweep.ts:179`, `SWEEP_CRON = "TZ=Europe/Lisbon */15 7-21 * * *"`). It lists the tenants (`inngest/sweep.ts:67` and `:73`, through `listTenantIdsForRetention`, `packages/db/src/guest-intake-staff.ts:206`, `select id::text as id from public.tenants`), selects due marks from `appointments`, `reminder_claims`, `reminder_dispatches` and `reminder_sweep_passes` (`sweep.ts:331` to `:450`, `sweep-send.ts:192` to `:443`), and in send mode hands each to the dispatcher (`sweep-send.ts:7`, `:524`).
- **The sleeping job:** `send-appointment-reminder` (`apps/web/lib/reminders/inngest/functions.ts:186`, id at `:188`), which sleeps until the mark (`:205`) and then dispatches (`:221`); with it the other sleepers of the same file, `send-follow-up-notification` (`:337`, sleeps 24 hours after the visit at `:347`, dispatches the survey at `:351`), and the backstop (`apps/web/lib/reminders/inngest/backstop.ts:83`, `:90`). `send-appointment-confirmation` (`:293`) and `send-no-show-notification` (`:361`) dispatch the same way without sleeping.
- **What both read, through the one door:** every dispatch, the sweep's sends included, loads its row with `loadReminderData` (`apps/web/lib/reminders/dispatch.ts:991`, defined at `apps/web/lib/reminders/data.ts:128`): one SELECT of `appointments` joined to `patients` (`data.ts:155`), `users` (`:156`), `locations` (`:157`), `tenants` (`:158`) and, LEFT, `services` (`:161`), naming its columns one by one (`:135` to `:152`: seven of `patients`, `users.full_name`, three of `locations`, `services.name` at `:151`, `tenants.settings` at `:152`). The survey path adds the SQL function `public.issue_survey_automatic` (called at `dispatch.ts:2390` through `apps/web/lib/surveys/survey-store.ts`), whose body reads `public.appointments` and `public.patients` (`packages/db/migrations/0102_sat01_satisfaction_survey.sql:483`, `:493`, `:501`), and `survey-store.ts:172` reads `tenants`.

**The grep that decides "does any reminder code read what this migration adds", run on 2026-11-03 at `origin/main` (`f065b82e`) and at every head of #1704 to #1709 (`3d640af1`, `6ed95f0b`, `ae7cad96` (and #1706's Q12 head `1950d3e3`, re-run 2026-11-05: 0 lines), `42342e66`, `f85fa5f3`, `2cd74dbd`):**

```
git grep -n -E "sms_reminders|smsReminders|vat_rate|vat_exemption|vatExemption|follow_up_days|followUpDays|health_system|healthSystem|weekly_block|weeklyBlock|therapist_weekly|services\.color|services\.vatRate" <ref> -- 'apps/web/lib/reminders' 'apps/web/lib/surveys' 'packages/db/src/guest-intake-staff.ts' | grep -v -E '\.test\.(ts|tsx|mjs):'
```

**It found nothing, at all seven refs** (0 lines each). `apps/*/lib/reminders` exists only as `apps/web/lib/reminders` (51 source files, the Inngest functions in its `inngest/` folder among them). A wider grep that also matched `vatRate` and `color:` found only `apps/web/lib/admin/settings-config.ts:44` to `:255`, the clinic's billing VAT rate inside `tenants.settings` (imported by `dispatch.ts:3` for its reminder settings), which is not `services.vat_rate` and which no migration here touches.

**What 0111 alters or locks, read from its statements:**

- `public.patients`: one `ALTER TABLE` adding `health_system_id uuid` and `health_system_number text` (nullable, no default), the CHECK `patients_health_system_number_check` and the composite foreign key `patients_health_system_fkey`; ACCESS EXCLUSIVE until the COMMIT; one scan validates the key and the CHECK, every row NULL; no row rewritten (rehearsed: `pg_relation_filenode` 20599 before and after, 47 rows).
- `public.tenants` and `public.users`: SHARE ROW EXCLUSIVE from section D (the new table's foreign keys) until the COMMIT; writes to them wait, reads do not. Each gains the foreign keys' internal triggers.
- `public.health_systems`: created, with its index, comment, RLS, grants and three policies.
- The platform tables `supautils.policy_grants` names (login, storage, realtime): ACCESS EXCLUSIVE from the first CREATE POLICY to the COMMIT (`CLAUDE.md`, measured on a throwaway on 2026-10-03; production's setting has not been read).
- No function, no sequence. No grant, revoke or policy on `patients`.

**Every read of those tables by the sweep or the sleeping job, file:line at `origin/main` `f065b82e`:**

- **`patients`:** `apps/web/lib/reminders/data.ts:140` to `:146` (`patients.id`, `full_name`, `email`, `phone`, `reminder_sms_enabled`, `reminder_email_enabled`, `deleted_at`) and `:155` (`.innerJoin(patients, ...)`), inside `loadReminderData` (`data.ts:128`, called at `dispatch.ts:991`): the sleeping jobs (`inngest/functions.ts:221`, `:306`, `:351`, `:370`; the backstop) and the sweep's sends (`sweep-send.ts:524`). And the SQL function `public.issue_survey_automatic` (`packages/db/migrations/0102_sat01_satisfaction_survey.sql:501`, `FROM public.patients p`), called at `dispatch.ts:2390` for the survey the sleeping job `send-follow-up-notification` sends (`inngest/functions.ts:351`).
- **`users`:** `data.ts:147` (`users.full_name`) and `:156`.
- **`tenants`:** `data.ts:152` (`tenants.settings`) and `:158`; the sweep's tenant list, `packages/db/src/guest-intake-staff.ts:206`, called at `inngest/sweep.ts:67` and `:73`; `apps/web/lib/surveys/survey-store.ts:172`.
- **Writes by reminder code to any of the three:** only `apps/web/lib/reminders/inbound-reply.ts:247` (`.update(patients)`, a patient's SMS STOP; it also reads `patients` at `:219`), reached from the Twilio inbound webhook (`apps/web/app/api/webhooks/twilio/inbound/route.ts`). It is neither the sweep nor the sleeping job; while 0111 holds `patients` it waits like any read.
- **What 0111 adds: no read anywhere in reminder code** (the grep above). `data.ts` names its `patients` columns one by one, so the two new columns cannot change what it returns.

**What this means for the night.** The ACCESS EXCLUSIVE on `patients` is the contact. A send that starts while the ALTER holds it waits for the COMMIT (54 ms for the whole file in the rehearsal) and then reads as before. A send already inside its read transaction when the ALTER asks for the lock holds ACCESS SHARE on `patients`, so the ALTER waits; after 5 seconds the apply fails clean with nothing applied (rehearsed: refused at the `patients` ALTER, table absent and 0 columns afterwards). The sweep's last pass of the day is 21:45 Lisbon (`sweep.ts:179`), inside the 21:00 to 22:29 start window; the sleeping jobs wake at any minute (`offsets.ts:32` and `:33`; the survey 24 hours after a visit). **SOLO's judgment, not a ruling, carried in the dispatch:** do not paste stage 1 from 21:40 to 21:59 Lisbon (before 21:40, from 22:00, or from 00:00 is fine). The SHARE ROW EXCLUSIVE on `tenants` and `users` and the platform locks of the policies stop no reminder read: the sweep and the sleeping job write neither table and read no login, storage or realtime table.

## What must happen first, in this order, and none of it by GREEN

1. **OPEN, SUNDAY 2026-11-08 (THE CHAIN NIGHT, C1): `0110` applied by GREEN in the sitting before this one, GREEN REPORTED, and SOLO's "NEXT OK" with the journal number this sitting expects (108).** No merge to `main` before this sitting (C5): #1704 merges on Monday morning, in order. Production's journal then reads 108, `0110` at idx 107, sha256 `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`.
2. **DONE BY STRATEGY 2026-11-03 (U2), OPEN FOR SOLO: the scope change recorded** in `CLAUDE.md` and `docs/design/DECISIONS.md`, citing the owner's ruling and the date: the insurer list (Sistemas, SubSistemas) and the two ficha fields enter V1; comparticipação, insurer pricing and insurer invoicing stay out. #1706's option A asked for exactly this.
3. **DONE 2026-11-05 (C3): blocks A' and B on #1706**, stacked on #1704's promotion `bbb58aad` with `main` merged in (promotion commit `8790f98a`), the post-promotion test runs with `DATABASE_URL=` blank, and the push. (#1704's head has moved on since, by commits above the promotion that change no migration, mirror or pending file, which block A' checks.) Then **CI on the promoted head:** the DB-gated job must show `health-systems-rls.db.test.ts` **38 of 38 executed** (35 before Q12; head `1950d3e3` adds three tests) (until the promotion the skip guard reads red on it, by construction: run 41492233915). The run is recorded with its number in GREEN's DISPATCH, not in this document: writing it here is a new commit, and so is block D, so no run of the head GREEN applies from can be named in it. After block D and its push, SOLO confirms that `gh pr view 1706 --repo happygamer1919-tech/OsteoJP --json headRefOid` reads HELD and that `gh pr checks 1706 --repo happygamer1919-tech/OsteoJP` is all green on it, and only then fills the run number into the dispatch.
4. **DONE 2026-11-03: the five policy-expression md5s of verdict 10 read on the rehearsal and written into Appendix B; verdict 7's CHECK definitions and verdict 8's index definition confirmed (verdict 8 on the old bytes).** **Since Q12 (2026-11-05): verdict 8's index definition for the new bytes is pinned in Appendix B from a builder's local apply of the final bytes (2026-11-05 02:35 WET), which is NOT an independent rehearsal. The C3 chain rehearsal, which includes the owner-allowed Q12 setup step, is a HARD READY condition for 0111: until it reads verdict 8 on the final bytes, 0111 is not READY.** **MET 2026-11-05:** the C3 chain rehearsal read verdict 8 OK on the final bytes (md5 `8c26eb6e1d6cc43efa25050cc20d0031`, the pin). DONE 2026-11-05: **block C** (the document set) and **the fault-injection script test**, `scripts/sistemas-0111.test.mjs`.
5. **OPEN, OWED BEFORE READY: the re-rehearsal of the Q12 bytes** (#1706 head `1950d3e3`, migration sha256 `e9afe529...`; 2026-11-05: the migration's bytes changed for Q12 (accent-blind unique names); the rehearsals above ran on the old bytes; the C3 chain rehearsal on the final bytes, a HARD READY condition for 0111, reads them.) **DONE 2026-11-04 (00:06 Lisbon): the independent rehearsal of the then-final bytes, REHEARSED OK on BLUE, on the old migration bytes (`ae7cad96` / `4f493188`)** (transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`); fix round 3 changed lines after it. **DONE 2026-11-03: the independent rehearsal of the blocks** ("Rehearsal record"), 0111 after 0110 after 0109: every count matched, the lock-timeout path and the refusals rehearsed.
6. **R4 round on the 2026-11-03 bytes of the document set: DONE (SHIP AFTER FIXES), its fixes applied, and their R4 re-check DONE (2026-11-03, SHIP / SHIP AFTER FIXES). DONE: the narrow re-check of fix round 3 (2026-11-04, SHIP), and the R4 rounds of 2026-11-05 on the promoted head and on the chain-night changes (PASS, no MAJOR; the narrow round 2 PASS, its prose MINORs fixed)** (its body: "Not run").
7. **OPEN: the chain night (C1, re-ruling U1 for 0109 to 0112):** Sunday 2026-11-08, 0111 the third of four separate GREEN sittings, after SOLO's "NEXT OK" on 0110; no other apply and no data op in the same sitting (C7); if C2 ends the chain before 0111, Monday 2026-11-09 from 21:00 Lisbon.
8. **DONE 2026-11-05: the C3 chain rehearsal on the final bytes (REHEARSED OK, "Rehearsal record"), SOLO's READY line (the first line removed, with the sidecar), the push, and the dispatch filled:** HELD, DOCSHA, SHAPRE and SHAPOST, and the CI run numbers once `gh pr checks` reads all green on HELD (a record only since fix round 3: BEFORE YOU START checks the three required check runs on HELD by machine); and the chain night's run window (see "What GREEN's dispatch carries").

## The promotion: SOLO's commit on the held branch, before the sitting, never GREEN's

**Decided from the template, not assumed.** In every apply of the last month the rename happened on the held branch, by SOLO, before the sitting: 0106 ("The promotion, as done on 2026-10-19": `main` merged in, the pending file renamed, its journal entry, its mirror, the README row moved, `check-journal` run) and 0097 and 0098 ("0097 is promoted on this branch, after main (with 0096 and the app half) is merged in"; "Stage 0 proves the promotion; it never performs it"). 0109 was written at its number from the start. **GREEN never renames, never edits the journal and never commits:** its stage 0 asserts the file at its number, its journal entry, the entry before it and the mirror (through `check-journal`) at the held head, and stops if any is missing. So the rename to `0111_sistemas_subsistemas.sql` is a commit to #1706's branch, made by SOLO, on the stack above the held head of #1704, before `0110` is applied (block A', strategy's C3), and before the READY line. **None of the blocks below has been run, and none pushes.** SOLO pushes once, at the end, with the push block, and only on a fast-forward.

**Why stacked on #1704, before 0110 is applied (strategy's C3, 2026-11-05).** The held head GREEN applies from must carry `0110_services_booking_type_fields.sql` at idx 107 with its journal entry (stage 0 and stage 1 assert both, and `check-journal` reconciles 109 files with 109 entries). The chain night (C1) runs 0109, 0110, 0111 and 0112 in four separate GREEN sittings, with no merge to main between them (C5), so each held head takes the previous migration from the lower held branch, not from `main`: 0110 on 0109, 0111 on 0110, 0112 on 0111, each carrying only its own migration beyond the previous one (C3). **The cost of stacking:** a later change to 0110's bytes or to the lower promotion commit leaves this branch holding a stale copy. Block A' refuses that case (it reads 0110 at the lower branch's head now, not only at the pinned commit), and stage 0, BEFORE YOU START and the pre-check pin 0110's sha256 again; a re-stack means new HELD, DOCSHA, CI and R4 above it. Freeze bottom-up.

**A promotion changes no byte.** Block B renames the pending file with `git mv`, then asserts its sha256 is still `e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f`. The file's own header still opens "PENDING, AND IT FOLLOWS 0109" and names its pending path afterwards: stale on purpose, as 0106's was.

**Block A, stacked (A'): merge `main` and the lower held head into the held branch** (strategy's C3, 2026-11-05: the stacked promotion, done before Sunday 12:00 Lisbon, 0110 under 0111). It does not read whether #1704 is MERGED: no merge to main happens during the chain (C5). Instead it checks 0110 where this branch takes it from: PREVHEAD is the promotion commit of 0110 on #1704 (block B of 0110's document), pinned by sha; the block STOPs unless PREVHEAD is still on `origin/db/RODICA-services-vat-colour`, unless 0110 reads its pinned sha256 at PREVHEAD and at the lower branch's head now, and unless the journal at PREVHEAD ends with `0110_services_booking_type_fields` at idx 107, when 1788503200000. Then, in a new worktree detached at the held head, it merges `origin/main` and PREVHEAD (merges, never a rebase), and checks again on disk: 0110's bytes, the journal's newest entry (so the head carries nothing beyond 0110 but its own pending file), and the pending file's bytes. On a conflict it STOPs; resolve by marker LINES, commit, and paste this block again: it resumes in the same worktree, checks the committed merge for marker lines, and skips what is already merged. **This block gates the stack, not the night.** The gate that refuses a later sitting after a mid-chain halt is in GREEN's own BEFORE YOU START: it STOPs unless production's journal reads exactly the count this migration expects (`journal rows on production: 108`, so 0110 applied), and the pre-check finds 0110 by hash as production's newest row; a halt after 0110's COMMIT is caught only by SOLO's "NEXT OK" (C1).

```
(
set -o pipefail
REPO=/Users/ivan/Projects/GitHub/OsteoJP
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0111
BR=db/RODICA-sistemas-subsistemas
PREVBR=db/RODICA-services-vat-colour
PREVHEAD=bbb58aad229a36118b6fdba5110b5a5fd9d27524
PREVMIG=packages/db/migrations/0110_services_booking_type_fields.sql
SHAPREV=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
PREVTAG=0110_services_booking_type_fields
PREVIDX=107
PREVWHEN=1788503200000
JOURNAL=packages/db/migrations/meta/_journal.json
PEND=packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql
SHA=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
echo "${PREVHEAD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: PREVHEAD is not a full 40-character sha [${PREVHEAD}]. Nothing was changed"; exit 1; }
git -C "${REPO}" fetch origin --prune || { echo "STOP: the fetch failed. Nothing was changed"; exit 1; }
PT=$(git -C "${REPO}" rev-parse "origin/${PREVBR}") || { echo "STOP: origin/${PREVBR}, the lower held branch, could not be read. Nothing was changed"; exit 1; }
echo "${PT}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the lower held head did not read as a full sha [${PT}]. Nothing was changed"; exit 1; }
echo "lower held head: origin/${PREVBR} ${PT}; this stack merges ${PREVHEAD}"
git -C "${REPO}" merge-base --is-ancestor "${PREVHEAD}" "${PT}" || { echo "STOP: ${PREVHEAD} is not on origin/${PREVBR} (now ${PT}): the lower commit this document stacks on was rewritten or is gone. Nothing was changed"; exit 1; }
MP=$(git -C "${REPO}" show "${PREVHEAD}:${PREVMIG}" | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0110 could not be read at ${PREVHEAD}. Nothing was changed"; exit 1; }
[ "${MP}" = "${SHAPREV}" ] || { echo "STOP: 0110 at ${PREVHEAD} is not the file this document pins [${MP}]. Nothing was changed"; exit 1; }
MT=$(git -C "${REPO}" show "${PT}:${PREVMIG}" | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0110 could not be read at the lower held head ${PT}. Nothing was changed"; exit 1; }
[ "${MT}" = "${SHAPREV}" ] || { echo "STOP: the lower held head ${PT} now carries other 0110 bytes [${MT}], so this stack would hold a stale copy. Re-stack from the new lower head, with new pins and R4. Nothing was changed"; exit 1; }
echo "0110 at ${PREVHEAD} and at ${PT}: ${SHAPREV}"
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
MD=$(shasum -a 256 "${PREVMIG}" | cut -d' ' -f1) || { echo "STOP: 0110 could not be hashed on disk after the merges. Nothing was promoted"; exit 1; }
[ "${MD}" = "${SHAPREV}" ] || { echo "STOP: 0110 on disk after the merges is not the pinned file [${MD}]. Nothing was promoted"; exit 1; }
node -e "const L=require('fs').readFileSync(process.argv[4],'utf8');const j=JSON.parse(L);const e=j.entries;const p=e[e.length-1];const want=Number(process.argv[1]);if(e.length===want+1&&p.idx===want&&p.tag===process.argv[2]&&p.when===Number(process.argv[3])){console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length)}else{console.log('journal: newest entry idx '+p.idx+', tag '+p.tag+', when '+p.when+', of '+e.length);process.exit(4)}" "${PREVIDX}" "${PREVTAG}" "${PREVWHEN}" "${JOURNAL}" || { echo "STOP: the journal on disk after the merges does not end with ${PREVTAG} at idx ${PREVIDX}, when ${PREVWHEN}: the stack carries a migration beyond the previous one, or lost it. Nothing was promoted"; exit 1; }
[ "$(shasum -a 256 "${PEND}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the pending file on disk after the merges is not the approved body. Nothing was promoted"; exit 1; }
echo "stacked: $(git rev-parse HEAD), with 0110 at idx ${PREVIDX} under it and the pending file unchanged"
echo "BLOCK A DONE (stacked). Paste block B."
)
```

**Block B: the promotion** (the rename, the journal entry 108 at `when` 1788503300000, the mirror, the README row, `check-journal`, one commit).

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0111
PEND=packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql
MIG=packages/db/migrations/0111_sistemas_subsistemas.sql
MIRROR=supabase/migrations/0111_sistemas_subsistemas.sql
SHA=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
ROW='| `NEXT-AFTER-0109_sistemas_subsistemas.sql` | `packages/db/migrations/0111_sistemas_subsistemas.sql`, bytes unchanged (sha256 `e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f`), journal `idx 108`, `when 1788503300000` | branch `db/RODICA-sistemas-subsistemas` (#1706), held. Promoted on the stack above the held head of #1704 (`0110` at idx 107), before `0110` is applied, under the strategy ruling C3 of 2026-11-05 (the chain night of 0109 to 0112); numbered `0111` by the U1 ruling of 2026-11-03 (and U2, the scope change); **authored, NOT yet applied**. The `health_systems` table and two `patients` columns. GREEN applies it from the held head, from `docs/migration-apply-0111.md`, in closed hours only (it creates three policies). **The promoted file own header still opens PENDING and names its pending path: stale on purpose, because a promotion changes no byte.** |'
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
N=$(find packages/db/migrations -maxdepth 1 -name '0111_*.sql' | wc -l | tr -d ' ')
[ "${N}" = 0 ] || { echo "STOP: ${N} files already claim 0111. Nothing was promoted"; exit 1; }
[ "$(shasum -a 256 "${PEND}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the pending file on disk is not the approved body. Nothing was promoted"; exit 1; }
git mv "${PEND}" "${MIG}" || { echo "STOP: the rename failed"; exit 1; }
[ "$(shasum -a 256 "${MIG}" | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the promoted file is not byte for byte the pending one, and a promotion changes no byte"; exit 1; }
echo "renamed, bytes unchanged: ${MIG} ${SHA}"
node -e "const fs=require('fs');const f='packages/db/migrations/meta/_journal.json';const t=fs.readFileSync(f,'utf8');const j=JSON.parse(t);const p=j.entries[j.entries.length-1];const shape=JSON.stringify(j,null,2)+'\n'===t;const prev=j.entries.length===108&&p.idx===107&&p.tag==='0110_services_booking_type_fields'&&p.when===1788503200000;if(shape&&prev){j.entries.push({idx:108,version:'7',when:1788503300000,tag:'0111_sistemas_subsistemas',breakpoints:true});fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');console.log('journal: idx 108, tag 0111_sistemas_subsistemas, when 1788503300000, of '+j.entries.length)}else{process.exit(shape?4:3)}" || { echo "STOP: the journal entry was not added (exit 3: the file is not in its own JSON shape; exit 4: its newest entry is not 0110_services_booking_type_fields at idx 107, when 1788503200000, of 108)"; exit 1; }
node scripts/sync-supabase-migrations.mjs || { echo "STOP: the mirror could not be written"; exit 1; }
test -f "${MIRROR}" || { echo "STOP: the mirror was not written"; exit 1; }
node scripts/sync-supabase-migrations.mjs --check || { echo "STOP: supabase/migrations is not in sync with packages/db/migrations"; exit 1; }
node -e "const fs=require('fs');const f='packages/db/migrations-pending/README.md';const row=process.argv[1];const L=fs.readFileSync(f,'utf8').split('\n');const key='| '+String.fromCharCode(96)+'NEXT-AFTER-0109_sistemas_subsistemas.sql'+String.fromCharCode(96)+' |';const at=L.findIndex(l=>l.startsWith(key));const h=L.indexOf('## Promoted');if(at<0||h<0||h<at){process.exit(4)}L.splice(at,1);let k=L.indexOf('## Promoted');while(k+1<L.length&&L[k+1].startsWith('|')===false)k++;while(k+1<L.length&&L[k+1].startsWith('|'))k++;L.splice(k+1,0,row);fs.writeFileSync(f,L.join('\n'));console.log('README: the row moved to the Promoted table')" "${ROW}" || { echo "STOP: the README row could not be moved (exit 4: no row for the pending file above the Promoted table)"; exit 1; }
CJ=$(node scripts/check-journal.mjs 2>&1) || { echo "${CJ}"; echo "STOP: check-journal failed"; exit 1; }
echo "${CJ}"
echo "${CJ}" | grep -qF '109 .sql files match 109 journal entries' || { echo "STOP: check-journal did not reconcile 109 files with 109 journal entries"; exit 1; }
git add -A packages/db/migrations packages/db/migrations-pending supabase/migrations || { echo "STOP: git add failed"; exit 1; }
git diff --cached --name-status || { echo "STOP: the staged list could not be read"; exit 1; }
git commit -m "db: promote 0111 (Sistemas and SubSistemas), bytes unchanged" -m "The pending file becomes packages/db/migrations/0111_sistemas_subsistemas.sql with no byte changed (sha256 e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f), journal idx 108 when 1788503300000, and its supabase mirror; the pending README row moves to the Promoted table." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "PROMOTED at $(git rev-parse HEAD). Not pushed."
)
```

After block B, in the same worktree and before pushing: `pnpm install --frozen-lockfile`, then `DATABASE_URL= pnpm --filter @osteojp/db exec vitest run tests/migration-syntax.test.ts` and `DATABASE_URL= node --test scripts/migration-timeouts.test.mjs scripts/gate-freeze.test.mjs`. Every one with `DATABASE_URL=` blank: none of them needs a database, and no inherited URL may reach one.

**Block C: the document set** (this document without its appendices as `docs/migration-apply-0111.md`, Appendix A and B as the two check files, both sha256 pinned into the blocks, and the sidecar). It refuses while the post-check carries a `PIN-PENDING` verdict.

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0111
SRC=/Users/ivan/osteojp-handover/apply-0111-sistemas.md
DOC=docs/migration-apply-0111.md
PIN=docs/migration-apply-0111.sha256
PREF=scripts/db/precheck-0111-sistemas-subsistemas.sql
POSTF=scripts/db/postcheck-0111-sistemas-subsistemas.sql
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
test -f "${SRC}" || { echo "STOP: the handover document is not there"; exit 1; }
test -f packages/db/migrations/0111_sistemas_subsistemas.sql || { echo "STOP: 0111 is not promoted on this worktree; paste block B first"; exit 1; }
test ! -e "${DOC}" || { echo "STOP: ${DOC} already exists"; exit 1; }
awk 'BEGIN { n = 0; p = 0 } /^```sql$/ { n++; if (n == 1) { p = 1; next } } /^```$/ { p = 0 } p' "${SRC}" > "${PREF}" || { echo "STOP: the pre-check could not be cut out of Appendix A"; exit 1; }
awk 'BEGIN { n = 0; p = 0 } /^```sql$/ { n++; if (n == 2) { p = 1; next } } /^```$/ { p = 0 } p' "${SRC}" > "${POSTF}" || { echo "STOP: the post-check could not be cut out of Appendix B"; exit 1; }
echo "cut: ${PREF} and ${POSTF}. They stay untracked until the commit below; a STOP from here on leaves them in place, and a re-run of block C overwrites both (the two cuts write with >)."
head -1 "${PREF}" | grep -q '^-- 0111 PRE-CHECK' || { echo "STOP: the cut pre-check does not open with its title line"; exit 1; }
head -1 "${POSTF}" | grep -q '^-- 0111 POST-CHECK' || { echo "STOP: the cut post-check does not open with its title line"; exit 1; }
if grep -q 'PIN-PENDING' "${POSTF}"; then echo "STOP: the post-check still carries a PIN-PENDING verdict; the rehearsal reads those values first"; exit 1; fi
awk '/^## Appendix A/ { exit } { print }' "${SRC}" > "${DOC}" || { echo "STOP: the document could not be written without its appendices"; exit 1; }
SPRE=$(shasum -a 256 "${PREF}" | cut -d' ' -f1) || { echo "STOP: the pre-check could not be hashed"; exit 1; }
SPOST=$(shasum -a 256 "${POSTF}" | cut -d' ' -f1) || { echo "STOP: the post-check could not be hashed"; exit 1; }
node -e "const fs=require('fs');const f=process.argv[1];let t=fs.readFileSync(f,'utf8');const a='SHAPRE='+String.fromCharCode(39)+'PENDING: the pre-check file sha256, set when the file is committed'+String.fromCharCode(39);const b='SHAPOST='+String.fromCharCode(39)+'PENDING: the post-check file sha256, set when the file is committed'+String.fromCharCode(39);const na=t.split(a).length-1;const nb=t.split(b).length-1;if(na===3&&nb===3){t=t.split(a).join('SHAPRE='+process.argv[2]).split(b).join('SHAPOST='+process.argv[3]);fs.writeFileSync(f,t);console.log('pinned in 3 and 3 places: pre '+process.argv[2]+', post '+process.argv[3])}else{console.log('found '+na+' and '+nb+', not 3 and 3');process.exit(4)}" "${DOC}" "${SPRE}" "${SPOST}" || { echo "STOP: the check files could not be pinned in the blocks"; exit 1; }
shasum -a 256 "${DOC}" > "${PIN}" || { echo "STOP: the sidecar could not be written"; exit 1; }
cat "${PIN}"
git add "${DOC}" "${PIN}" "${PREF}" "${POSTF}" || { echo "STOP: git add failed"; exit 1; }
git commit -m "docs: the 0111 apply document set (NOT READY)" -m "The document, its sha256 sidecar and its read-only pre-check and post-check. Its first line stays NOT READY until the rehearsal and the review." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "DOCUMENT SET COMMITTED at $(git rev-parse HEAD). Not pushed. Copy SHAPRE ${SPRE} and SHAPOST ${SPOST} into the dispatch's BEFORE YOU START."
)
```

**Block D: the READY line** (the first line goes, the sidecar is regenerated; it prints HELD and DOCSHA for the dispatch).

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0111
DOC=docs/migration-apply-0111.md
PIN=docs/migration-apply-0111.sha256
cd "${WT}" || { echo "STOP: the worktree is not there"; exit 1; }
STRAY=$(git status --porcelain) || { echo "STOP: git status failed"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the worktree is not clean"; echo "${STRAY}"; exit 1; }
sed -n 1p "${DOC}" | grep -q '^NOT READY' || { echo "STOP: the first line does not begin NOT READY, so there is no READY line to make"; exit 1; }
if grep -qE '^SHAP(RE|OST)=.PENDING' "${DOC}"; then echo "STOP: a check-file pin is still PENDING in the blocks"; exit 1; fi
if grep -q 'PIN-PENDING' scripts/db/postcheck-0111-sistemas-subsistemas.sql; then echo "STOP: the post-check still carries a PIN-PENDING verdict"; exit 1; fi
tail -n +2 "${DOC}" > "${DOC}.ready" || { echo "STOP: the first line could not be removed"; exit 1; }
mv "${DOC}.ready" "${DOC}" || { echo "STOP: the document could not be replaced"; exit 1; }
shasum -a 256 "${DOC}" > "${PIN}" || { echo "STOP: the sidecar could not be written"; exit 1; }
git add "${DOC}" "${PIN}" || { echo "STOP: git add failed"; exit 1; }
git commit -m "docs: the READY line for 0111" -m "Only the first line of the document goes; the sidecar is regenerated." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB" || { echo "STOP: the commit failed"; exit 1; }
echo "HELD for the dispatch, once pushed: $(git rev-parse HEAD)"
echo "DOCSHA for the dispatch: $(shasum -a 256 "${DOC}" | cut -d' ' -f1)"
)
```

**The push, SOLO's, once, after block B (and again after C and D if they come later): a fast-forward or nothing.**

```
(
set -o pipefail
WT=/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-0111
BR=db/RODICA-sistemas-subsistemas
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
| Ruling | Strategy, 2026-11-03 (U1): "Wed 11-11: 0111 Sistemas and SubSistemas (#1706, then #1707). If a fallback sitting is needed that Wednesday (R47 F1), 0111 moves to Thu 11-12 and everything after it moves one night." Each its own closed-hours GREEN sitting after 21:00; each screen PR merges only after its migration's GREEN REPORTED (R41). U2 (the same day): the insurer list and the two ficha fields enter V1. **Re-ruled 2026-11-05 by C1 to C5:** the third of four separate GREEN sittings on the chain night of Sunday 2026-11-08, never in the same sitting as another apply; the screen merges after its migration's PR on Monday morning (C5) |
| Migration | `packages/db/migrations/0111_sistemas_subsistemas.sql` after block B, renamed from `packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql` with no byte changed. sha256 `e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f` |
| Journal | `idx 108`, tag `0111_sistemas_subsistemas`, `when` 1788503300000 (0110's 1788503200000 plus 100000, the step). Stage 0 asserts it and 0110's entry before it. Production's journal goes 108 to 109 |
| Mirror | `supabase/migrations/0111_sistemas_subsistemas.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0110`, `packages/db/migrations/0110_services_booking_type_fields.sql`, sha256 `e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`, journal `idx 107`, `when` 1788503200000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | **the pull request's HELD head, `origin/db/RODICA-sistemas-subsistemas`, never a merge commit on main.** BEFORE YOU START checks it against HELD. Stage 0 records the sha in `/tmp/0111-head.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if the held head has moved since |
| This document | `docs/migration-apply-0111.md` after block C, pinned by `docs/migration-apply-0111.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0111-sistemas-subsistemas.sql` (Appendix A until block C), READ ONLY, 14 verdicts, 9 CARRY rows and INFO rows, run inside the block's own `begin read only`. sha256 `cd601ad67cdf3d29814241e2edcb0cd42a9899792579e1fcb44a4396f46a1a14` (block C cuts it out byte for byte) |
| Post-check | `scripts/db/postcheck-0111-sistemas-subsistemas.sql` (Appendix B until block C), READ ONLY, 25 verdicts, verdict 15 VACUOUS at 0 rows (a STOP), run inside the block's own `begin read only`. sha256 `4a6e923541b9b994fbd42f4c49f58061d2493a02cac11133e65f4f187da2a441` (block C cuts it out byte for byte) |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0108's and 0109's documents pin, read again on 2026-11-03 at `origin/main` (`f065b82e`) and at #1704 `3d640af1`, #1706 `ae7cad96` (and #1706's Q12 head `1950d3e3`, re-read 2026-11-05), #1708 `f85fa5f3`: identical at every one. Every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0111-window.ok` with the sha stage 0 recorded. **No date is written in any block.** Its end may not fall in a repeated hour |
| What it changes | The three `SET LOCAL` lines, for this transaction only. Then the new table `public.health_systems` (six columns, `UNIQUE (id, tenant_id)`, two CHECKs, the unique normalized-name index `health_systems_tenant_name_key` (case and whitespace normalized and, since Q12 of 2026-11-04, accents folded by a built-in `translate()` map, no extension), a comment), RLS on, REVOKE ALL from PUBLIC, anon, authenticated, patient and service_role, GRANT SELECT and INSERT and UPDATE (name, active) to authenticated, its foreign keys to `tenants` (NO ACTION) and `users` (SET NULL); one `ALTER TABLE public.patients` adding two nullable columns, `patients_health_system_number_check` and the composite key `patients_health_system_fkey`; two column comments; three policies last |
| What it never touches | every existing row of `patients` (both new columns NULL on every one), every other column, constraint, trigger and index of `patients`, every column, constraint and index of `tenants` and `users`, every existing policy, privilege and function, and `health_insurance_numbers` (0051). The post-check proves each it names: 3 to 12 the new table, 13 to 18 `patients`, 19 `tenants` and `users`, 20 to 22 every other table, policy and relation privilege, 23 and 24 the journal |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0111.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document, the removal of its first line included, moves its sha256; the sidecar is regenerated in the same commit (blocks C and D do it).

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`.

## Closed hours, the night, and the lock

**Closed hours only, and R9 does not apply.** This file creates three policies, and strategy's standing rule (S-1004-A) is: "any migration that creates a policy is closed-hours only, never eligible for R9." It also alters `public.patients` under ACCESS EXCLUSIVE, which every booking read and every reminder send reads. The blocks print R9's three proof lines for the record (proof 2 not claimed, proof 3 not held) and have no daytime path and no override.

**The clinic-hours table these blocks check, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed** (0109's table, byte for byte its clock program; the owner's Saturday is 09:00 to 13:00, and 08:00 only ever refuses a minute the owner's hours would allow). BEFORE YOU START and the CLOCK CHECK check the clock by machine against the table and against strategy's start windows; stage 0 and stage 1 check it against the table; stage 1 also reads every active clinic's own weekday hours. Every clock read carries `TZ=Europe/Lisbon`, reads the zone's name in the same `date` call, and STOPs unless it is WET or WEST.

**The night (strategy's C1 to C5, 2026-11-05, re-ruling U1, R38 and B3 for 0109 to 0112 only).** **C1:** the chain night is Sunday 2026-11-08, from 14:00 Sunday to 06:29 Monday Lisbon (the clinic is closed all day). Four separate GREEN sittings in file order, 0109, 0110, 0111, 0112, each a fresh GREEN session with its own pre-check, its own READY line and the owner's freeze lines; one migration in flight at any moment. 0111 is the third sitting. It starts only after SOLO has read GREEN's report on 0110 and printed "NEXT OK" with the journal number this sitting expects (108); BEFORE YOU START holds the same number by machine (it STOPs unless production's journal reads 108), so this sitting cannot start while 0110 is not applied. A halt in 0110's sitting after its COMMIT leaves the journal at 108 too, and only SOLO's "NEXT OK" catches that. **C2:** any STOP, REFUSE, FAIL or harness refusal in any sitting ends the chain for the night; the migrations not yet applied move to Monday 2026-11-09 from 21:00 Lisbon, then the next closed night. No new sitting starts after 02:00 Lisbon. **C5:** no merge to `main` during the chain. **C7:** no data operation joins a migration chain; this sitting runs no other apply and no data op. The dispatch names the window; the blocks hold the clock to it by machine (the start window the clock is in must lie inside the run window the dispatch names). **The chain starts at 22:00 Lisbon on Sunday** (the lead's decision of 2026-11-05, inside strategy's window): after the sweep's last pass of the day (21:45) and after the last reminder sends for Monday's visits. No block holds the 22:00 start or the 02:00 cut: on a Sunday the blocks' start window opens at 00:00 Sunday, so the dispatch's run window stays `202611080000`, `202611090629`, `202611090800` (Monday's fallback `202611092100`, `202611100629`, `202611100800`), with no block change, and SOLO holds the start and the cut in its own steps. No apply window may end inside a repeated hour (strategy, 2026-10-25); November has none, and the blocks check it anyway.

**The locks, read from the statements and measured in part by the builder's rehearsal (BLUE, 2026-11-02, on the old bytes `ae7cad96`, before Q12).** Sections A to C touch only the new table. Section D takes SHARE ROW EXCLUSIVE on `tenants` and `users` until the COMMIT (writes wait, reads do not). Section E takes **ACCESS EXCLUSIVE on `patients`** until the COMMIT; the key and the CHECK are validated by one scan, every row NULL; no rewrite (`pg_relation_filenode` 20599 before and after). Section F's three CREATE POLICY take ACCESS EXCLUSIVE on the platform's login, storage and realtime tables until the COMMIT, so logins and token refreshes wait too, which is why it is closed hours. The whole file ran in **54 ms** on 47 patient rows; **production holds about 16,400 patients** (strategy's U3), so the validating scan is longer there and was NOT measured. Bounds: `lock_timeout` 5s (rehearsed: with another session holding ACCESS SHARE on `patients` the apply was refused after 5 s at the `patients` ALTER, nothing applied), `statement_timeout` 60s, and `idle_in_transaction_session_timeout` 15s. The pre-check's INFO rows print the locks other sessions hold on `patients`, `tenants` and `users`.

## Applied from the held head, before the merge, and which commit the sitting runs from

**The record supports the held head, and this document runs from it**, as 0109's does. **#1706 itself could merge first** (it adds no `schema.ts` line, and nothing on `main` names the new objects), and its body recommended that shape (option A: merge, then apply from `origin/main`). **This document does not take it,** and says why: R41 and S-1004-A both put the merge after GREEN REPORTED for a `held-for-apply` pull request, #1706 carries that label, and U1 rules the same order for all three nights. One shape for the three nights also keeps one dispatch shape. If strategy prefers option A for 0111, it is a new revision of this document (the blocks name `origin/main` and MERGED instead of HELD, as 0106's do), not an edit at the sitting.

- **R41, standing:** SOLO removes `held-for-apply` and merges only after GREEN reports 0111 in the journal. A pull request that may not merge before the apply cannot be the merge commit the apply runs from.
- **Strategy's S-1004-A:** "Any held-for-apply PR waits for the owner's label removal after GREEN reports"; R41 hands that removal to SOLO after GREEN REPORTED.
- **No SECURITY DEFINER count moves** (0111 creates no function), so there is no count GATE-CHANGE and `main` never reads red on the count because of this pull request.

| # | Step | Who |
|---|---|---|
| 1 | GREEN applies 0111 from #1706's HELD head, with this document | GREEN, on the owner's dispatch |
| 2 | GREEN REPORTED (below) is in SOLO's hands, with the journal row | the owner pastes GREEN's report |
| 3 | `main` is merged into #1706 (merge, never rebase), and CI reads green on that head | SOLO |
| 4 | `held-for-apply` comes off #1706 (its own command), and #1706 merges (R41). If the harness refuses either, it is not retried: the owner's two clicks | SOLO under R41, else the owner |
| 5 | `main` is merged into #1707 (the screen), CI green on that head, R4 passed on it (#1707 is a DRAFT that contains #1706's commit and edits `schema.ts`, so it cannot merge before the apply; its R4 is Tier B; `gh pr ready 1707` comes after that round. **#1707 conflicts with today's `main` (`46c9505e`) in `apps/web/app/admin/settings/page.tsx`**, and with #1705 in `apps/web/lib/admin/errors.ts` and the README: a real resolution is owed before its merge, SOLO's job), then its label comes off (its own command) and it merges (R41 and U1: "Each screen PR merges only after its migration's GREEN REPORTED") | SOLO under R41, else the owner |
| 6 | The GATE-CHANGE that names `health-systems-rls.db.test.ts` in `SUITES` (below), owed by #1706's own body | SOLO opens it; the owner merges |

**C5: no merge to `main` during the chain.** On Monday morning, after the last GREEN report, SOLO merges under R41 on green, in order: 0109 (#1682) and its screen pull requests, 0110 (#1704) and #1705, 0111 (#1706) and #1707, 0112 (#1708) and #1709. The first that is not green by Monday 18:00 Lisbon stops the sequence, and the report states the gap between production and `main` until it closes. **The two `supabase/seed.sql` edits merge clean:** #1708's carries #1706's revoke line and its comment byte for byte and adds `therapist_weekly_blocks` in a separate guarded block (proved with `git merge-tree` on 2026-11-05); if a later edit breaks that, the resolution keeps #1708's lines, the superset. Until then production is up to four migrations ahead of `main`, and `prod-drift-check` reports it, correctly.

**Between steps 1 and 4, production is one migration ahead of `main`.** The daily `prod-drift-check` reports a journal row with no matching file on `main` in that window; that report is correct, and it ends at step 4. The application behaves the same before and after the apply: nothing on `main` names the new table or columns until #1707 merges, and the reminder read names its `patients` columns one by one.

**Every block of this document names `origin/db/RODICA-sistemas-subsistemas` and none names `origin/main`.** The `held-for-apply` label keeps the branch where it is: a labelled pull request cannot merge (`.github/workflows/held-for-apply-blocks-merge.yml`) and `.github/workflows/auto-update-prs.yml` does not merge `main` into it, so the head GREEN runs from does not move under the sitting. Every sha a block compares is first read into a variable and refused unless it is 40 hex characters. Stage 1 begins with the HEAD CHECK (`STOP: the held head moved since stage 0 ...`); stage 2 and the closing read run from the recorded sha whatever the branch has done since, and print whether it moved.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0109: `/Users/ivan/osteojp-handover/green-dispatch-0111-1111.txt`. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `HELD`: the held head of the pull request, a full 40-character sha (BEFORE YOU START only), from block D after the push;
- `DOCSHA`: this document's sha256 at that head (both blocks), from block D;
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks), for the chain night (C1): `202611080000`, `202611090629`, `202611090800`. On a Sunday the blocks' start window opens at 00:00 Sunday, so WOPEN is 00:00; the chain starts at 22:00 Lisbon (the lead's decision of 2026-11-05), and SOLO holds that start and the 02:00 cut (C2) in its own steps, which no block holds. If C2 moves 0111 to Monday 2026-11-09: `202611092100`, `202611100629`, `202611100800`. SOLO writes them into the dispatch at the READY pass.

**Two pins of BEFORE YOU START are not the dispatch's five lines but are still PENDING here:** SHAPRE and SHAPOST, the check files' sha256s. Block C writes them into this document's blocks; SOLO copies the same two values into the dispatch's BEFORE YOU START. In this document the five value lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. **BEFORE YOU START also reads this document's first line at the held head and STOPs if it begins `NOT READY`.** The CLOCK CHECK writes ONE line to `/tmp/0111-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2 and the closing read each read by machine.

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
SHA0111=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
SHAPREV=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPRE=cd601ad67cdf3d29814241e2edcb0cd42a9899792579e1fcb44a4396f46a1a14
SHAPOST=4a6e923541b9b994fbd42f4c49f58061d2493a02cac11133e65f4f187da2a441
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0111_sistemas_subsistemas.sql
PREVMIG=packages/db/migrations/0110_services_booking_type_fields.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0111} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){9}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. The journal read has not run"; exit 1; fi
test ! -f /tmp/0111-applied.ok || { AGE=$(find /tmp/0111-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0111 was applied in this sitting (/tmp/0111-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0111-start-head.sha /tmp/0111-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0111 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
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
TIP=$(git rev-parse origin/db/RODICA-sistemas-subsistemas) || { echo "STOP: the held head, origin/db/RODICA-sistemas-subsistemas, could not be read. The journal read has not run"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. The journal read has not run"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the branch was pushed to since the READY line, or it is gone. The journal read has not run"; exit 1; }
echo "held head:     origin/db/RODICA-sistemas-subsistemas IS the commit this block names"
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
DOC=$(git show ${TIP}:docs/migration-apply-0111.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${TIP}:docs/migration-apply-0111.md | sed -n 1p) || { echo "STOP: the document's first line could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's first line read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '^NOT READY|[A-Z]-PENDING' || { echo "STOP: the document's first line begins NOT READY or carries a mark that ends in -PENDING, or it could not be searched, so the document at the held head is not the READY one. The journal read has not run"; exit 1; }
echo "first line:    READY (it does not begin NOT READY and carries no mark that ends in -PENDING)"
SIDE=$(git show ${TIP}:docs/migration-apply-0111.sha256) || { echo "STOP: the sidecar could not be read at the held head. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0111.md" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${TIP}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0111 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0111}" ] || { echo "STOP: 0111 at the held head is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${TIP}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0110 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "0110:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0110 at the held head is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${TIP}:scripts/db/precheck-0111-sistemas-subsistemas.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check at the held head is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${TIP}:scripts/db/postcheck-0111-sistemas-subsistemas.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
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
node ${READER} 2>&1 | tee /tmp/0111-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 108' /tmp/0111-journal-before.out || { echo "STOP: the journal read does not say 108. Nothing was applied"; exit 1; }
echo "${TIP}" > /tmp/0111-start-head.sha || { echo "STOP: the held head could not be recorded. Nothing was applied"; exit 1; }
echo "held head recorded for the CLOCK CHECK: ${TIP}"
echo "BEFORE YOU START: every check passed, and the journal reads 108."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `window end: ... happens once ...`; three `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `held head now:` and `held head:     origin/db/RODICA-sistemas-subsistemas IS the commit this block names`; `--- CI on the held head: ...`, then `CI on HELD:    <name>: completed, success` for each of `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)`, and `CI on HELD:    all three required check runs concluded success on <HELD>` (a required run that is missing, not finished, not success or there twice, no runs at all, or no answer from GitHub, STOPs before the journal read; `held-for-apply-blocks-merge` fails by design and is not read); `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `first line: READY ...`, `sidecar:`; `migration:`, `0110:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 108` (and 0111 listed as not applied on that ref); `held head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 108.` Exit 0. It writes nothing to production. An applied marker under 12 hours old stops the block.

## STAGE 0: the held head, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0111.sha256
MIG=packages/db/migrations/0111_sistemas_subsistemas.sql
SHA0111=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
SHAPREV=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPRE=cd601ad67cdf3d29814241e2edcb0cd42a9899792579e1fcb44a4396f46a1a14
SHAPOST=4a6e923541b9b994fbd42f4c49f58061d2493a02cac11133e65f4f187da2a441
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0111-applied.ok || { AGE=$(find /tmp/0111-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0111 in this sitting, or the age of /tmp/0111-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0111-head.sha /tmp/0111-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so the held head may be stale. Nothing was applied"; exit 1; }
TIP=$(git rev-parse origin/db/RODICA-sistemas-subsistemas) || { echo "STOP: the held head, origin/db/RODICA-sistemas-subsistemas, could not be read. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0111 is not on disk at the held head, so it is not the branch that carries 0111"; exit 1; }
N111=$(find packages/db/migrations -maxdepth 1 -name '0111_*.sql' | wc -l | tr -d ' ')
[ "${N111}" = 1 ] || { echo "STOP: ${N111} files claim migration number 0111, not 1"; exit 1; }
N110=$(find packages/db/migrations -maxdepth 1 -name '0110_*.sql' | wc -l | tr -d ' ')
[ "${N110}" = 1 ] || { echo "STOP: ${N110} files claim migration number 0110, not 1"; exit 1; }
test -f scripts/db/precheck-0111-sistemas-subsistemas.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0111-sistemas-subsistemas.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0111}" ] || { echo "STOP: 0111 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0111-sistemas-subsistemas.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0111-sistemas-subsistemas.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===109&&e.idx===108&&e.tag==='0111_sistemas_subsistemas'&&e.when===1788503300000&&p.idx===107&&p.tag==='0110_services_booking_type_fields'&&p.when===1788503200000?0:1)" || { echo "STOP: the newest journal entry is not idx 108, tag 0111_sistemas_subsistemas, when 1788503300000, of 109, after idx 107 tagged 0110_services_booking_type_fields at when 1788503200000"; exit 1; }
test -f packages/db/migrations/0110_services_booking_type_fields.sql || { echo "STOP: the file of journal idx 107 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0110_services_booking_type_fields.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0110 on disk is not the file this document pins"; exit 1; }
echo "0110 on disk: 0110_services_booking_type_fields.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0111-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '109 .sql files match 109 journal entries' /tmp/0111-check-journal.out || { echo "STOP: check-journal did not reconcile 109 files with 109 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0111 is closed hours only. R9 allows clinic hours only when all three proofs hold, and the third (a pre-check read on production in an earlier sitting) does not. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it creates three policies, so S-1004-A makes it closed hours only, and it alters public.patients under ACCESS EXCLUSIVE, which every booking read joins and the reminder dispatcher reads at apps/web/lib/reminders/data.ts:155)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0111 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0111 is closed hours only, whatever the three proofs read (the third does not hold), and the sitting waits. Nothing was applied"; exit 1; fi

echo "${TIP}" > /tmp/0111-head.sha || { echo "STOP: the sha could not be recorded in /tmp/0111-head.sha. Nothing was applied"; exit 1; }
echo "running from the held head ${TIP}, recorded in /tmp/0111-head.sha"
echo "0111 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `the held head and HEAD: <sha>`, the held head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0111.md: OK`; `newest journal entry: idx 108, when 1788503300000, tag 0111_sistemas_subsistemas, of 109; before it idx 107, when 1788503200000, tag 0110_services_booking_type_fields`; `0110 on disk: 0110_services_booking_type_fields.sql, sha256 e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e`; check-journal's line with `109 .sql files match 109 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (proof 2 `no`, proof 3 `no`; they decide nothing here); `R9: closed hours by the weekday table. 0111 runs in closed hours only`; `running from the held head <sha>, recorded in /tmp/0111-head.sha`; then `0111 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

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
test ! -f /tmp/0111-applied.ok || { AGE=$(find /tmp/0111-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0111 was applied in this sitting (/tmp/0111-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0111-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0111-start-head.sha || { echo "STOP: BEFORE YOU START recorded no held head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0111-start-head.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0111-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0111-head.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0111-head.sha -nt /tmp/0111-start-head.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0111-start-head.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0111-head.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "held head at BEFORE YOU START: ${START}"
echo "recorded by stage 0:            ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: the held head moved between BEFORE YOU START and stage 0: the branch was pushed to during the sitting. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0111.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0111 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
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
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0111-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0111-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0111-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `window end: ... happens once ...`; `held head at BEFORE YOU START: <sha>` and `recorded by stage 0:            <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the three `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0111-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0111_sistemas_subsistemas.sql
SHA0111=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
SHAPREV=e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e
SHAPRE=cd601ad67cdf3d29814241e2edcb0cd42a9899792579e1fcb44a4396f46a1a14
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0111-applied.ok || { AGE=$(find /tmp/0111-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0111 in this sitting, or the age of /tmp/0111-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0111-precheck.new || { echo "STOP: the old /tmp/0111-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the held head must still be the sha stage 0 recorded."
test -f /tmp/0111-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0111-head.sha) || { echo "STOP: stage 0's record /tmp/0111-head.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-sistemas-subsistemas) || { echo "STOP: the held head, origin/db/RODICA-sistemas-subsistemas, could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "the held head now:   ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0111.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0111 is not on disk"; exit 1; }
test -f scripts/db/precheck-0111-sistemas-subsistemas.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N111=$(find packages/db/migrations -maxdepth 1 -name '0111_*.sql' | wc -l | tr -d ' ')
[ "${N111}" = 1 ] || { echo "STOP: ${N111} files claim migration number 0111, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0111}" ] || { echo "STOP: 0111 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0111-sistemas-subsistemas.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T110=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[107];process.stdout.write(p&&p.idx===107&&p.tag==='0110_services_booking_type_fields'?p.tag:'none')") || { echo "STOP: node could not read journal idx 107's tag at the recorded sha. Nothing was applied"; exit 1; }
W110=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[107];process.stdout.write(p&&p.idx===107&&p.tag==='0110_services_booking_type_fields'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 107's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W110}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0110's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T110}.sql || { echo "STOP: the file of journal idx 107 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T110}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0110 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0110: packages/db/migrations/${T110}.sql, sha256 ${SHAPREV}, journal when ${W110}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0111-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0111-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0111-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0111-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0111-window.ok)
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
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0111-sistemas-subsistemas.sql -c "rollback" 2>&1 | tee /tmp/0111-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0111-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0111-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0111-precheck.new || true)
[ "${OKS}" = 14 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 14. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, the patients rows, the locks other sessions hold on patients, the locks other sessions hold on tenants and users, idle_in_transaction_session_timeout): they decide nothing in this block, and the lead reads them"

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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it creates three policies, so S-1004-A makes it closed hours only, and it alters public.patients under ACCESS EXCLUSIVE, which every booking read joins and the reminder dispatcher reads at apps/web/lib/reminders/data.ts:155)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0111 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0111 is closed hours only, whatever the three proofs read (the third does not hold), and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0111-postcheck.out /tmp/0111-stage2.ok /tmp/0111-journal-after.out /tmp/0111-apply.out /tmp/0111-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0111-precheck.new /tmp/0111-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0111-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only command in this document that can leave a write behind. Its full output is teed to /tmp/0111-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0111_sistemas_subsistemas --sha256 ${SHA0111} --expect-pending 1 2>&1 | tee /tmp/0111-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. A lock not taken in 5 seconds reads journal 108 -> 108 (delta 0) above and applied nothing; it is still a halt. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0111-apply.out holds it). Whether 0111 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0111-applied.ok || { echo "STOP: verified-migrate exited 0, so 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0111-applied.ok could not be written, so stage 2 would refuse; stage 2 runs only on the owner's or the lead's word"; exit 1; }
echo "0111 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `the held head now:   <sha>`, the same sha twice; `docs/migration-apply-0111.md: OK`; `0110: packages/db/migrations/0110_services_booking_type_fields.sql, sha256 e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e, journal when 1788503200000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 14 OK (verdict 3 `0 of 2; control true`, verdict 4 `0 of 2; control 1`, verdict 5 `0 named; control 1`, verdict 6 `0 named; control 1`, verdict 7 `0 differ of 24; control true`, verdict 8 `4 of 4`, verdict 11 `0; control 1`, verdict 12 `newest is 0110, when 1788503200000`, and the row `journal_rows_before` reading 108, which is verdict 13's row and one of the 14; nine CARRY rows), its CARRY rows and INFO rows; then `the pre-check profile: 14 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0111 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0111-apply.out`: `pending    1  [0111_sistemas_subsistemas]`, the drizzle-kit banner, `journal    108 -> 109  (delta 1)` and `0111_sistemas_subsistemas present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`. They are not errors.
- `0111 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. If verified-migrate exits non-zero, do not read that as nothing applied: exit 3 or 4 can follow a committed apply. **A lock it cannot take in 5 seconds is a clean failure with nothing applied, and it does not say so in words** (0109's rehearsal): drizzle-kit prints `undefined` instead of the lock-timeout error; **its signs are exit 4, `journal    108 -> 108  (delta 0)` with `present by sha256: NO`, and about 5 seconds between the apply line and the STOP.** It is still a halt, and GREEN reports it and runs nothing else. 

## STAGE 2: the post-check and the journal, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0111=e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f
SHAPOST=4a6e923541b9b994fbd42f4c49f58061d2493a02cac11133e65f4f187da2a441
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0111-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0111 APPLIED, then 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0111 APPLIED, then 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0111-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0111 APPLIED, then 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0111-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0111-head.sha) || { echo "STOP: stage 0's record /tmp/0111-head.sha could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-sistemas-subsistemas) || { echo "STOP: the held head, origin/db/RODICA-sistemas-subsistemas, could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "the held head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0111.sha256 || { echo "STOP: this document is not the approved one. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0111_sistemas_subsistemas.sql || { echo "STOP: 0111 is not on disk. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0111-sistemas-subsistemas.sql || { echo "STOP: the post-check is not on disk. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0111_sistemas_subsistemas.sql | cut -d' ' -f1)" = "${SHA0111}" ] || { echo "STOP: 0111 on disk is not the approved file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0111-sistemas-subsistemas.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0111-window.ok || { echo "STOP: no run window is recorded for this sitting. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0111-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0111-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0111-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0111-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0111-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
PM=$(carry policies_md5)
RM=$(carry relation_acl_md5)
TB=$(carry tables_before)
PR=$(carry patients_rows)
PS=$(carry patients_shape_md5)
NG=$(carry nif_grants_md5)
PF=$(carry patients_filenode)
TU=$(carry tenants_users_shape_md5)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${PM}" ] && [ -n "${RM}" ] && [ -n "${TB}" ] && [ -n "${PR}" ] && [ -n "${PS}" ] && [ -n "${NG}" ] && [ -n "${PF}" ] && [ -n "${TU}" ] || { echo "STOP: a carry did not parse out of the transcript. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${TB} ${PR} ${PF}" | grep -qxE '[0-9]+( [0-9]+){4}' || { echo "STOP: a count carry is not a number. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${RM} ${PS} ${NG} ${TU}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){4}' || { echo "STOP: an md5 carry is not 32 hex characters. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} policies_md5=${PM} relation_acl_md5=${RM} tables_before=${TB} patients_rows=${PR} patients_shape_md5=${PS} nif_grants_md5=${NG} patients_filenode=${PF} tenants_users_shape_md5=${TU}"

unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0111-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v policies_md5="${PM}" -v relation_acl_md5="${RM}" -v tables_before="${TB}" -v patients_rows="${PR}" -v patients_shape_md5="${PS}" -v nif_grants_md5="${NG}" -v patients_filenode="${PF}" -v tenants_users_shape_md5="${TU}" -c "begin read only" -f scripts/db/postcheck-0111-sistemas-subsistemas.sql -c "rollback" 2>&1 | tee /tmp/0111-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation or a column does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0111-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0111-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0111-postcheck.out || true)
[ "${VACS}" = 0 ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not 0. A VACUOUS verdict is not a pass: patients read no row to hold NULL. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = 25 ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not 25. A verdict that is missing prints no FAIL. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0111 by hash"
JA=$(psql "${DATABASE_URL_DIRECT:?}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT:?}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0111}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0111 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0111 present by hash"
echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0111-stage2.ok || { echo "STOP: the pass mark /tmp/0111-stage2.ok could not be written, so the closing read would refuse. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "0111 POST-CHECK PASSED. 14/14 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; health_systems is there, empty, with its three policies and its grants as the migration makes them, both new patients columns are NULL on every one of the ${PR} rows, no patients row was rewritten, and every other policy (${PB} before), every other privilege, tenants and users are as before. Paste the closing journal read now."
)
```

**EXPECT:** the carries line (ten carries, `journal_rows_before=108`); the post-check's table, `25 OK / 0 VACUOUS / 0 FAIL` (verdict 3 `r:postgres:rls true:forced false; control true`, verdicts 4 to 11 the new table as the migration makes it, verdict 12 `0`, verdict 13 the two `patients` columns and `comments 3 of 3`, verdict 15 `0 set of <n> rows`, verdict 16 `1 distinct of 3 columns`, verdict 18 the filenode the pre-check read, verdict 20 `tables_before + 1`, verdict 21 `policies_before + 3`, verdict 23 `1 row, newest is 0111, when 1788503300000; control 1`, verdict 24 `109`); `journal rows before=108 after=109, 0111 present by hash`; the last three journal rows, 0111's sha256 newest; then `0111 POST-CHECK PASSED. ...`. Exit 0. It writes nothing: every psql call opens `begin read only`.

**No block writes after the apply.** An attempted write is the only direct proof that the server refuses a bad value, and a READ ONLY transaction refuses it before any CHECK or policy is evaluated. So the proof is split three ways, and none of it writes on production: **in CI** (`packages/db/tests/health-systems-rls.db.test.ts`, 35 of 35 on the throwaway with the table present, writes real rows as each role and holds every policy, grant and CHECK, and a ficha refused another tenant's Sistema even on the owner connection; its mutation sweep killed 19 of 19; `cross-tenant-rls-isolation.test.ts` 98 of 98); **on the throwaway** (the rehearsal, where a write is at no one's expense); **on production**, the post-check's catalogue verdicts, READ ONLY.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0111 APPLIED, then 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0111-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0111 APPLIED, then 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0111-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0111-head.sha) || { echo "STOP: stage 0's record /tmp/0111-head.sha could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0111.sha256 || { echo "STOP: this document is not the approved one. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/RODICA-sistemas-subsistemas) || { echo "STOP: the held head, origin/db/RODICA-sistemas-subsistemas, could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0: ${REC}"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0111-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0111-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0111-stage2.ok -newer /tmp/0111-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0111-window.ok || { echo "STOP: no run window is recorded for this sitting. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0111-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0111-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
unset DATABASE_URL DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL and DATABASE_URL_DIRECT could not be cleared before the production environment file is loaded, so a value left in the shell could win. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node ${READER} 2>&1 | tee /tmp/0111-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 109' /tmp/0111-journal-after.out || { echo "STOP: the journal read after the apply does not say 109. Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0111_sistemas_subsistemas[.]sql$' /tmp/0111-journal-after.out || { echo "STOP: the journal read does not list 0111 as APPLIED. Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0111-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0111-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 109, 0111 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 109`, the line `APPLIED  0111_sistemas_subsistemas.sql`, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, and `CLOSING READ: the journal reads 109, 0111 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after stage 2 printed its last line; after any STOP, never. **GREEN's report of this line is what R41 waits for.**

## GREEN REPORTED: the line SOLO needs before merging #1706 and then #1707 (R41)

SOLO merges nothing on its own belief that the apply ran. **The evidence is GREEN's report, pasted by the owner, and it must carry all three of these, verbatim, with exit 0 under each block:**

1. stage 1's last line: `0111 APPLIED. Paste stage 2 now.`
2. stage 2's journal rows, with `e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f` as the newest row's hash, and its last line beginning `0111 POST-CHECK PASSED. 14/14 pre-check OK, post-check 25 OK / 0 VACUOUS / 0 FAIL, journal 108 to 109;`
3. the closing read's last line, exactly: `CLOSING READ: the journal reads 109, 0111 is APPLIED, and nothing is pending on the recorded sha.`

**SOLO writes the journal row first** (the board's and CLAUDE.md's number table: 0111 applied, the date and the Lisbon time GREEN printed, production journal 109), **then** steps 3 to 5 of the order above. **The label removal is its own command, never combined with another edit.** A report with any STOP, FAIL, VACUOUS or a missing line is not GREEN REPORTED: SOLO merges nothing, and the lead rules.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `14 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 14: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `25 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: STOP, the state is UNKNOWN. A VACUOUS, or an OK count that is not 25: STOP, the write stands. A psql exit that is not 0: STOP, which says it read nothing |

**The pre-check, `scripts/db/precheck-0111-sistemas-subsistemas.sql`: 14 verdicts OK, 9 CARRY rows, 5 INFO rows.** READ ONLY. 0: read only. 1: the session is `postgres` (control). 2: it reads `patients` past its policies (control). 3: no `health_systems` and no `health_systems_tenant_name_key` in `public` (control: `patients` is found). 4: neither new column on `patients` (control: `nif`). 5: no constraint of the eight new names (control: `patients_pkey` once). 6: no policy of the three new names (control: `patients_select` once). 7: **`nif` holds exactly the table's privileges** for six roles and four privileges, so the new columns will hold exactly what `nif` holds (control: `authenticated` may SELECT `patients`). 8: the four functions the migration calls exist (`public.jwt_tenant_id()`, `public.jwt_role()`, `auth.uid()`, `gen_random_uuid()`, by `to_regprocedure`, never by a call). 9: the five roles. 10: Postgres 17. **The journal:** 0111 absent with 0110 once as the control (11), 0110 the newest at 1788503200000 (12), 108 rows (13). The carries: `policies_before`, `policies_md5`, `relation_acl_md5`, `tables_before`, `patients_rows`, `patients_shape_md5`, `nif_grants_md5`, `patients_filenode`, `tenants_users_shape_md5`.

**The post-check, `scripts/db/postcheck-0111-sistemas-subsistemas.sql`: 25 verdicts.** READ ONLY. 0 to 2: the frame. 3: `health_systems` exists once, ordinary, owned by `postgres`, RLS on and not forced. 4: its six columns. 5: its six constraints, validated. 6: the three foreign keys with columns, targets, actions and MATCH. 7: the three CHECK definitions (pinned without a database, **confirmed on the rehearsal of 2026-11-03**). 8: its three indexes and the normalized-name index's definition (pinned without a database, **confirmed on the rehearsal of 2026-11-03 for the old bytes; for the Q12 bytes `PIN-PENDING-REHEARSAL`, read on the re-rehearsal**). 9: its three policies by command, role, USING and WITH CHECK; none for DELETE or ALL. 10: **the five policy expressions by md5, as read on the rehearsal of 2026-11-03** (0106's way) and confirmed there by this verdict reading OK. 11: its whole grantee list and column grants: the owner, `authenticated` with INSERT and SELECT and UPDATE on `active` and `name`, nobody else. 12: it is empty. 13: the two `patients` columns and the three comments, exactly (the table's as the Q12 bytes word it, written from the bytes, not yet read on a server). 14: the two `patients` constraints, validated. 15: every `patients` row NULL in both, the pre-check's count (VACUOUS at 0). 16: the new columns hold `nif`'s privileges, and `nif`'s equal the carry. 17: the rest of `patients` (its other triggers included) is the carry. 18: **no rewrite of `patients`**. 19: `tenants` and `users` unchanged but for the new keys' internal triggers. 20: the table count plus one. 21: every other policy unchanged, the count plus three. 22: every other relation privilege unchanged. 23 and 24: the journal.

## Rehearsal record

**THE C3 CHAIN REHEARSAL ON THE FINAL BYTES, 2026-11-05, 18:31 TO 18:49 LISBON (WET): REHEARSED OK.** An independent session that did not author the documents ran the whole chain, 0109, 0110, 0111 and 0112 in order, on BLUE (PostgreSQL 17.6, a real local Supabase with the platform's default privileges), built from a scratch clone at `main` `3c81134a` (production's position, 0000 to 0108), seeded with the e2e fixtures plus 16,400 synthetic patients (16,447 patients in all), with the drizzle journal built by hand from `main`'s journal (106 rows, the newest 0108). The heads: #1682 `0a4f4f08`, #1704 `69300cf3`, #1706 `e4916805`, #1708 `8dfe6b57`, with every committed document, check file and migration matching its pin. Each block was cut from the committed document by machine, its dispatch values filled (WOPEN `202611080000`, WSTART `202611090629`, WEND `202611090800`), and run in GREEN's zsh shape. **Substitutions, and nothing else:** (a) the throwaway's URL in DATABASE_URL_DIRECT and DATABASE_URL, so every psql and verified-migrate line ran byte for byte; (b) the unset line and the production environment file load left out; (c) the apply worktree replaced by a scratch clone whose origin is a local bare repository holding the held branches at those heads; (d) every `/tmp/` path moved into the rehearsal's folder; (e) the clock and window lines run as carried, their clinic-hours STOP recorded, then left out; (f) the target guard and the reader run, their refusal of a non-production target recorded, then left out (the reader replaced by a READ ONLY read that prints the reader's own lines, so the blocks' greps ran unchanged); (g) the NOT READY first-line check of 0110 to 0112, its STOP recorded, then left out (0109's passed natively). **Run 1, the whole chain, every block's last line as its EXPECT:** 0109 pre-check 12/0/0, post-check 14/0/0, journal 106 to 107, ACCESS EXCLUSIVE on `locations` 2.6 ms; 0110 11/0/0, 15/0/0, 107 to 108, `services` 2.4 ms; 0111 14/0/0, 25/0/0, 108 to 109, `patients` 15.7 ms (16,447 rows, the FK and CHECK validation included; the whole transaction 23.0 ms); 0112 10/0/0, 20/0/0, 109 to 110, the new table 7.9 ms. The lock times are lower bounds, from a read-only observer session polling `pg_locks` every 2 ms. **0111's verdict 8 read OK on the final bytes:** `pg_get_indexdef(health_systems_tenant_name_key)`, md5 `8c26eb6e1d6cc43efa25050cc20d0031`, the pin; verdicts 13 and 18 OK. **Run 2, the mid-chain halt, on BLUE rebuilt from scratch:** 0109 and 0110 whole, as in Run 1; 0111 STOPPED inside stage 1 before its COMMIT (a second session held a read on `patients`: `STOP: the apply exited 4`, journal 108 to 108, nothing applied, no applied marker); 0112's BEFORE YOU START then REFUSED to start (`journal rows on production: 108`, `STOP: the journal read does not say 109`, no start-head record), its CLOCK CHECK STOPPED, and its pre-check read 3 FAIL at 108; 0111 re-run from the start applied 108 to 109; 0112 then ran whole, 109 to 110. **Blocks A' and B** were run again from scratch clones of the pre-promotion heads: 0110 and 0111 exit 0; 0112's A' stopped on the known `packages/db/index.ts` conflict, which was resolved by marker lines and A' resumed; for all three the promoted migration, mirror and pending trees were byte-identical to the real promotion commits (`bbb58aad`, `8790f98a`, `b43b349c`). **The one EXPECT that differed:** 0110's BEFORE YOU START read the Playwright E2E check failed on `69300cf3` (a Playwright install timeout, infrastructure; SOLO re-ran the job), so as rehearsed 0110 would STOP there; BEFORE YOU START reads CI on HELD by machine at the sitting. **Not rehearsed by it:** the run-window record and every line that reads it, and the start-window and closed-hours passes (it ran on a Thursday, in clinic hours); the target guard and the reader against production; the production environment file load and its unset line; 0110's CI check passing; the first-line check passing for 0110 to 0112 (their first line still read NOT READY); the bash variant of GREEN's shape. **A deviation, recorded and not to be repeated:** in a scratch clone with no hooks, the rehearsal committed the 0112 conflict resolution with `git -c core.hooksPath=/dev/null`, which breaks the standing rule against a hooks-path override; it changed nothing. No classifier or harness refusal. Its record: `/Users/ivan/osteojp-handover/rehearse-chain-1105/RESULTS.md`.

**2026-11-04, 00:06 Lisbon: THE INDEPENDENT REHEARSAL OF THE THEN-FINAL BYTES (THE OLD MIGRATION BYTES, `ae7cad96` / `4f493188`), REHEARSED OK, on BLUE** (transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`). What it could not run is under "NOT REHEARSED, said one by one". Fix round 3 (2026-11-04) changed lines after it. The record below is the earlier one, kept as it was.

**THE INDEPENDENT REHEARSAL, 2026-11-03, 14:55 TO 15:12 LISBON, ON BLUE, OF ALL THREE NIGHTS END TO END** (the independent rehearsal of 2026-11-03 (Tuesday, 14:55 to 15:12 Lisbon, on BLUE, by a session that did not write the blocks; transcripts in `/Users/ivan/osteojp-handover/rh1103-transcripts/`)). 0111 was applied after 0110 (itself after 0109) on a throwaway at production's position, through the blocks of this document as they stood before the amendments listed under "Review history". **Every count matched:** pre-check 14 OK / 0 VACUOUS / 0 FAIL, post-check 25 OK / 0 VACUOUS / 0 FAIL once verdict 10's md5s were read there and written in; the promotion byte-identical (`4f493188...`); check-journal 109 of 109; the migration's own DB test green. Verdict 7's three CHECK definitions and verdict 8's index definition, pinned without a database, read exactly as printed: **confirmed**. Verdict 10's five md5s, read there and confirmed by the post-check reading OK: `health_systems_manager_insert - ea4aed2533ce3479e163b3f011073a3a; health_systems_manager_update 279e0dc4cfb08bc0c417e5159d78d6f9 279e0dc4cfb08bc0c417e5159d78d6f9; health_systems_staff_select 991888d347baf196859fa6009b0c4757 -`. **The lock-timeout path through `verified-migrate.mjs`, rehearsed:** `journal    108 -> 108  (delta 0)`, `0111_sistemas_subsistemas present by sha256: NO`, `FAIL: drizzle-kit migrate exited 1.`, stage 1's STOP `the apply exited 4 ...`, exit 4, about 5 seconds, nothing applied. **The re-run refusals, rehearsed:** stage 0 and stage 1 pasted again each stopped with `STOP: stage 1 has ALREADY APPLIED 0111 in this sitting ...`. **The moved-held-head STOP, rehearsed** on 0112's chain; the line is the same in this document.

**The builder's rehearsal of the migration alone, before the documents existed:**

**The migration (not the blocks) was rehearsed by its builder on the BLUE lane (127.0.0.1:54622; production never contacted), on the then-final bytes (`ae7cad96`, before Q12). No block of this document has been run anywhere.** Recorded in #1706's body: the stack built by `node scripts/lane-stack.mjs up --lane blue` from the branch's `supabase/migrations` (106 migrations, the last `0108`) plus the e2e seed, 47 `patients` rows.

- Before: table absent, 0 of 2 `patients` columns.
- Apply while another session holds ACCESS SHARE on `patients`: **refused after 5 s** at the `patients` ALTER (`canceling statement due to lock timeout`); afterwards table absent, 0 columns.
- Apply (`psql --single-transaction -v ON_ERROR_STOP=1`): every statement, **54 ms**.
- `patients` rows 47 before and after; md5 of every row (existing columns) `66662f1d89c3aa4882a3f606148fa367` before and after. **No rewrite** (`pg_relation_filenode` 20599 before and after). 7 policies on `patients`, digest unchanged; table grants unchanged. The new columns' privileges against `nif`'s, for anon, authenticated, patient and service_role: 0 differences. `health_systems` grants: `authenticated` INSERT and SELECT, column UPDATE on `active` and `name`, nobody else. 0 existing patients with a value in either new column.
- **Second apply refused** (`relation "health_systems" already exists`), catalogue unchanged.
- The header comment was reworded once after the first rehearsal, and the whole rehearsal was run again on the final bytes, with the same results (the body's words).
- Tests with the table present: `health-systems-rls.db.test.ts` 35 of 35; mutation sweep 19 of 19 killed; `cross-tenant-rls-isolation.test.ts` 98 of 98; `migration-syntax.test.ts` 215 of 215; `migration-timeouts.test.mjs` 13 of 13; `check-journal` 106 of 106.
- **NOT REHEARSED by that run:** 0111 applied after 0109 and 0110 (the stack ended at 0108); `drizzle-kit migrate` and `verified-migrate.mjs`; the validating scan on about 16,400 patients (production's size, U3), against 47; every block below.

**THE AUTHOR'S DRY RUNS, 2026-11-03, NOT THE REHEARSAL (no database; production never contacted).** In a scratch clone detached at #1706's head `ae7cad96` (the old bytes, before Q12), with the scratch promotion of 0110 (#1682 and #1704 merged, block B of 0110 run) merged in to stand for `main`: **the merge was clean** (`git merge-tree` had predicted a README conflict against #1704's unpromoted head; after 0110's promotion moves #1704's row, there is none), and **block B** ran whole in bash with errexit off in GREEN's shape and exited 0 (`renamed, bytes unchanged ... 4f493188...`, `journal: idx 108, tag 0111_sistemas_subsistemas, when 1788503300000, of 109`, mirror in sync (109 files), the README row moved, check-journal 109 of 109, one commit). On that head, `DATABASE_URL=` blank: `migration-syntax.test.ts` **219 of 219**; `migration-timeouts.test.mjs` and `gate-freeze.test.mjs` **27 of 27**. **Not run:** block C (at the time it refused, by design, while verdict 10 still held its placeholder; the md5s are written in now), block D, block A, the push, and every GREEN block. **The real `main` on Wednesday may also carry #1705** (merge-tree of #1705's and #1706's heads conflicts in the README only); block A stops on any conflict, and it is resolved by marker lines.

**2026-11-05: the migration's bytes changed for Q12 (accent-blind unique names); the rehearsals above ran on the old bytes; the C3 chain rehearsal on the final bytes, a HARD READY condition for 0111, reads them, and did on 2026-11-05: verdict 8 OK.** Old: #1706 head `ae7cad96`, migration sha256 `4f493188...`. New: head `1950d3e3`, sha256 `e9afe529...`. The only SQL change is the expression of `health_systems_tenant_name_key` (now `translate()` over the lowered, trimmed, space-collapsed name, with an explicit accent map), its comments and the table COMMENT; an independent R4 confirmed the grants, policies, CHECKs, SET LOCAL lines and the index name unchanged. The head also adds three tests to `health-systems-rls.db.test.ts` (38 in all). The re-rehearsal reads verdict 8's index definition, which Appendix B holds as `PIN-PENDING-REHEARSAL` (block C refuses until it is written in), and confirms verdict 13's table COMMENT, written from the new bytes.

**2026-11-05 02:35 WET: verdict 8 pinned.** A builder applied 0109 (#1682 at 0668e845), 0110 (#1704 at 3d640af1) and this migration (#1706 at 1950d3e3, sha256 `e9afe529...`) with `psql -1` and ON_ERROR_STOP on the local BLUE stack (127.0.0.1, at 0108, BLUE down 02:35:36), and read `pg_get_indexdef` of `health_systems_tenant_name_key` (374 bytes, md5 `8c26eb6e1d6cc43efa25050cc20d0031`); Appendix B verdict 8 now pins it. That is a direct apply, NOT a rehearsal of this document's blocks. The independent re-rehearsal through the blocks on the final bytes was started at 02:28 and stopped at 02:31: the harness classifier refused its setup step (a scratch worktree and an eval of 0110's block B, reason "Unverifiable Deletion Scope"); it was not retried. It stays OWED before READY, on the owner's decision.

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, a lock not taken in 5 seconds included, nothing changed (`journal    108 -> 108  (delta 0)`).
- **After the COMMIT, going back is two statements,** run after the SET LOCAL lines, in one transaction: `ALTER TABLE public.patients DROP CONSTRAINT patients_health_system_fkey, DROP CONSTRAINT patients_health_system_number_check, DROP COLUMN health_system_id, DROP COLUMN health_system_number; DROP TABLE public.health_systems;` It takes ACCESS EXCLUSIVE on `patients` for about as long as the apply did, and the `DROP TABLE` takes the table's policies, grants and keys with it. **Before #1707 merges it loses nothing** (the table empty, both columns NULL). **After #1707 merges it BREAKS THE APP FIRST** (its `schema.ts` names the new columns), so #1707 must be reverted and deployed before such a migration runs. **After the clinic has entered Sistemas or filled fichas, it DESTROYS them.**
- **Who runs it: it is owner-confirmable and it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0111 stays: a journal row is never deleted. **GREEN never runs that statement from this document; SOLO never runs it at all; and no block here contains it.**

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | Launch GREEN and hand it SOLO's dispatch, `/Users/ivan/osteojp-handover/green-dispatch-0111-1111.txt`, which names `0111_sistemas_subsistemas.sql` | on the chain night (C1), Sunday 2026-11-08, after SOLO's "NEXT OK" on 0110 (GREEN REPORTED, the journal at 108), the stacked promotion (C3), the R4 round, the independent rehearsal of the whole chain (C3) and SOLO's READY line; from 22:00 Lisbon at the earliest, in closed hours, inside its run window, no new sitting after 02:00 Lisbon (C2) | the sitting, from the held head: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 2 | Paste GREEN's report to SOLO | when it arrives | GREEN REPORTED, if it carries the three lines; if it carries a STOP, nothing is pasted again and the lead rules |
| 3 | Only if the harness refuses SOLO under R41: take `held-for-apply` off #1706, merge it; then the same for #1707 | after GREEN REPORTED, `main` merged into each, CI green | `main` and production agree again, and the screen goes live |

## GATE-CHANGES

- **None before the apply, and none forced by it.** No gate file is edited by the promotion; 0111 creates no SECURITY DEFINER function.
- **Written 2026-11-05: the fault-injection test** `scripts/sistemas-0111.test.mjs` (an added pin the gate freeze tolerates).
- **After GREEN REPORTED, owed by #1706's own body:** a GATE-CHANGE adds `health-systems-rls.db.test.ts` to `SUITES` in `.github/scripts/assert-rls-executed.mjs` (hard-required), as #1631 named `reminder-claims-rls.db.test.ts` for 0106. The owner merges it. **No `PERMITTED_SKIPS` entry** is added at any point.

**Known limits.** The post-check's header comment (`scripts/db/postcheck-0111-sistemas-subsistemas.sql`, lines 17 to 20) still says verdict 8 holds a pending pin and block C refuses; that comment is stale: verdict 8 is pinned, and the C3 chain rehearsal read it OK. It stays as it is, because changing it would change SHAPOST after the rehearsal.

## NOT REHEARSED, said one by one

- **What the C3 chain rehearsal of 2026-11-05 could not run** (see "Rehearsal record"): the run-window record and every line that reads it, and the start-window and closed-hours passes (it ran in clinic hours); the target guard and the reader against production; the production environment file load and its unset line; 0110's CI check passing; the first-line check passing for 0110 to 0112; the bash variant of GREEN's shape.
**THE INDEPENDENT REHEARSAL OF THE THEN-FINAL BYTES (THE OLD MIGRATION BYTES, `ae7cad96` / `4f493188`), 2026-11-04 (00:06 Lisbon, on BLUE, REHEARSED OK; transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`), recorded these as NOT REHEARSED, in its words: the target guard, the journal reader, block A gh MERGED, the pushes, CI on HELD, and the production environment file's contents.**

- **The Q12 bytes (2026-11-05), made after every rehearsal:** 2026-11-05: the migration's bytes changed for Q12 (accent-blind unique names); the rehearsals above ran on the old bytes; the C3 chain rehearsal on the final bytes, a HARD READY condition for 0111, reads them. The migration at #1706 head `1950d3e3` (sha256 `e9afe529...`) was then pinned from a builder's local apply (verdict 8, 2026-11-05 02:35 WET), and rehearsed through the blocks by the C3 chain rehearsal of 2026-11-05 (REHEARSED OK; verdict 8 OK, md5 `8c26eb6e...`, verdict 13 OK).
- **Fix round 3 (2026-11-04), made after that rehearsal:** the `unset DATABASE_URL DATABASE_URL_DIRECT` line, with its own halt, immediately before each of the four lines that load the production environment file (BEFORE YOU START, stage 1, stage 2, the closing read), and BEFORE YOU START's CI check (`gh api repos/happygamer1919-tech/OsteoJP/commits/${HELD}/check-runs`, then `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)`, each once and concluded success). Each passes `bash -n` and `zsh -f -n`; no rehearsal has run them. They are the lines 0109's document carries, with the number changed, and 0109's script test holds them against stubs; this document's own script test (written 2026-11-05) holds them against stubs too. The CI check alone was run in `zsh -f` against GitHub only, read only: #1682's green head `efc0f161` passes and a sha with no check runs STOPs (`/Users/ivan/osteojp-handover/rh1104-transcripts/ci-check-*.out`). "fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending".

**Rehearsed on 2026-11-03 ("Rehearsal record"):** the blocks end to end on a throwaway at production's position, in order after the migration before; the pre-check and post-check profiles; the promotion; the lock-timeout path through `verified-migrate.mjs`; the re-run refusals; the moved-held-head STOP. **Still NOT REHEARSED, one by one:**

- **The CLOCK CHECK's start-window record and the run-window lines of stages 1, 2 and the closing read, on a real night.** The rehearsal ran in clinic hours, so the clock steps stopped as they must (for example `STOP: Lisbon 202611031502, weekday 2, is inside clinic hours by the weekday table ...`); the window comparisons after them ran only with the rehearser's substitutions.
- **The production target guard.** It refuses a throwaway by design, and did on BLUE: `REFUSING: project ref is "postgres", not the production project.` The lines that load the production environment file and run the guard in stages 1 and 2 are NOT REHEARSED.
- **The applied-migrations reader** (BEFORE YOU START's journal read and the closing read). It refuses anything but production, as it did for 0109 (`REFUSED: ... the target's ref is not ...`); the greps after it (`journal rows on production: ...`, `APPLIED ...`, `pending on this ref: 0`) were read in its place by a READ ONLY psql.
- **Block A' (the stacked merge, C3), which replaced block A's read of #1704's MERGED state on 2026-11-05.** A' reads no pull request's state. Its author ran it once, to make the promotion pushed that day (`8790f98a`), which is not a rehearsal; its halts are proven by the fault-injection script test (every external call failing in turn, bash and zsh), not against GitHub. The independent chain rehearsal (C3) runs it again from a scratch clone.
- **The bytes changed after the rehearsal** ("Review history", the amendment of 2026-11-03): the network-time source list (sntp and Cloudflare only), block A's `--repo`, block C's note on its cut files, the filled policy pins and the check files' comments. Each is small and each block still passes `bash -n` and `zsh -f -n`; none has been run again. Nor has the credential load of the closing read and of BEFORE YOU START as the review fixes of 2026-11-03 changed it (the `set -o allexport` and `.` lines of stages 1 and 2, in place of `node --env-file`).
- **The fault-injection script test** (`scripts/sistemas-0111.test.mjs`), written 2026-11-05 after every rehearsal: it runs the blocks against stubs, never against a database.
- **The post-check's missing-variable guards (2026-11-05, a new SHAPOST), made after every rehearsal:** run by the C3 chain rehearsal of 2026-11-05 on the final bytes (the post-check read 25/0/0).
- **Production:** its rows, grants, policies, triggers and locks were not read. The pre-check pins every one it depends on, so a difference stops the sitting at the pre-check rather than passing unseen.
- **DOCSHA and HELD:** the READY line moves both, and any later amendment moves them again.

## Review history

- **2026-11-03:** authored by SOLO's builder from 0109's document at `7485190a` (the template), 0106's promotion section and 0108's dispatch; the blocks re-keyed by machine (`blocks.py`, every replacement counted, every block `bash -n` and `zsh -f -n` clean); the check files written new and run against no database; the sweep and sleeping-job reads grepped at `origin/main` `f065b82e` and at the six pull request heads. The author's dry runs in scratch clones ("Rehearsal record") found two faults in block B before this text was written, both fixed: the conflict-marker check read the whole tree (a committed handoff note under `docs/handoff/` holds marker-like lines) and now reads only the lines the merge added against each parent; the mirror check compared bytes, but `scripts/sync-supabase-migrations.mjs` prepends a header, so it now runs that script with `--check`. Not reviewed. Not rehearsed.
- **2026-11-03, after the independent rehearsal (14:55 to 15:12 Lisbon, BLUE), on the coordinator's word:** the rehearsal's read policy-expression md5s written into the post-check where it had `PIN-PENDING` (0111 and 0112), and no `PIN-PENDING` string left in either check file, so block C no longer stops on its own check; the definitions pinned without a database marked confirmed; **the Date header of https://api.github.com dropped as a network-time source** in BEFORE YOU START and the CLOCK CHECK (cached, read 37 s behind on the rehearsal while sntp read +0.046 s), sntp and Cloudflare kept, the tolerances unchanged, and the same hazard named for 0109's document; block A's `gh pr view` given `--repo happygamer1919-tech/OsteoJP`; block C says that a STOP after its cuts leaves the two check files untracked and that a re-run overwrites them; the rehearsal recorded and "NOT REHEARSED" rewritten; block A's note on conflicts corrected (#1706 merges clean with today's `main`; #1707's conflict in `apps/web/app/admin/settings/page.tsx` named). Every block re-checked with `bash -n` and `zsh -f -n`. **The first line stays `NOT READY`: SOLO removes it after a fresh R4 round on these bytes.**
- **2026-11-03, review fixes (the coordinator's instruction):** the CI runs on the head GREEN applies from are recorded in GREEN's dispatch, not in this document (recording them here is a new commit, and so is block D), after SOLO reads `gh pr checks 1706 --repo happygamer1919-tech/OsteoJP` all green on HELD; the network-time heading says up to two sources, and that any source that disagrees stops the block; the closing read loads the production environment file the way stages 1 and 2 do (`set -o allexport` and `.`), no longer with `node --env-file`; the rehearsal record cites the transcripts at `/Users/ivan/osteojp-handover/rh1103-transcripts/`. The dispatch now says plainly that no block enforces the 06:00 hard end or the 21:40 to 21:59 sweep rule, and that GREEN keeps both by hand. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed closing read is NOT REHEARSED.
- **2026-11-03, BEFORE YOU START's credential load, and the review status (the coordinator's instruction):** BEFORE YOU START's journal read loads the production environment file the way stages 1 and 2 and the closing read do (`set -o allexport` and `.`, the same line as stage 1's), no longer with `node --env-file`, which lets a variable already exported in the shell win over the file; the owner's shell profile exports variables. GREEN's dispatch carries the same block, byte-equal to this document's but for the window values. No block now runs `node --env-file`. The status line, the first line and the order now say where the review stands: the R4 round on the 2026-11-03 bytes is done (SHIP AFTER FIXES), its fixes are applied, and their re-check is pending. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed line is NOT REHEARSED (the reader refuses a throwaway by design).
- **2026-11-04, fix round 3 (the coordinator's instruction; the prior bytes kept as `/Users/ivan/osteojp-handover/apply-0111-sistemas.md.bak-fix3-1104`, sha256 `3bfa5285...`):** the R4 re-check (2026-11-03, SHIP / SHIP AFTER FIXES) and the independent rehearsal of the final bytes (2026-11-04 00:06 Lisbon, REHEARSED OK on BLUE, transcripts `/Users/ivan/osteojp-handover/rh1104-transcripts/`) are recorded in the first line, the status line and the order, with the rehearsal's NOT REHEARSED list. Two rehearsal findings fixed. **(1) Stale variables:** each of the four blocks that load the production environment file (BEFORE YOU START, stage 1, stage 2, the closing read) runs `unset DATABASE_URL DATABASE_URL_DIRECT` immediately before its `set -o allexport` and `.` line, inside the same subshell and with its own halt, so a value left in the shell can never win for a variable the file does not define (the target guard and the reader read `DATABASE_URL_DIRECT` first, then `DATABASE_URL`). **(2) CI on HELD is machine-checked:** BEFORE YOU START, after the held head is verified and before the journal read, reads the check runs on HELD through `gh api` and STOPs unless `DB-gated tests (RLS isolation, seeded DB)`, `Lint + typecheck + test` and `Playwright E2E (seeded DB)` each appear once and concluded success, the names read from #1682's green head `efc0f161`; a missing run, a zero count or an unreadable answer STOPs, and `held-for-apply-blocks-merge` (which fails by design) is not read. The dispatch's CI lines are a record only. R4 NIT-4: the fault count 0109's test reports (the section on explicit halts). GREEN's dispatch carries BEFORE YOU START and the CLOCK CHECK byte-equal to this document's but for the window values. Every changed block re-checked with `bash -n` and `zsh -f -n`. The changed lines are NOT REHEARSED. **"fix round 3 applied 11-04 (unset line, CI check); narrow re-check of those lines pending".**
- **2026-11-05, the Q12 bytes (the coordinator's instruction; the prior bytes kept as `/Users/ivan/osteojp-handover/apply-0111-sistemas.md.bak-q12-1105`):** strategy's answer Q12 (2026-11-04: Sistema names unique ignoring accents and case) changed #1706's migration: head `ae7cad96` to `1950d3e3`, sha256 `4f493188...` to `e9afe529...`. Every pin of the migration's sha256 rewritten (17: the status line, the promotion note, blocks A and B, the facts table, BEFORE YOU START, stage 0, stage 1, stage 2, GREEN REPORTED, the pre-check's comment and journal read, the post-check's journal read and verdict 23); post-check verdict 13's table COMMENT rewritten from the new bytes; verdict 8's index definition set to `PIN-PENDING-REHEARSAL`; the DB test count 35 to 38; the rehearsal records marked as made on the old bytes; the first line, the status line and the order name the re-rehearsal of the Q12 bytes. The program pins and the reminder grep re-read at `1950d3e3`: identical, 0 lines. No block's logic changed. GREEN's dispatch carries the same pins. NOT REHEARSED.
- **2026-11-05, the chain night (the coordinator's instruction, on strategy's C1 to C5 of 2026-11-05):** "What must happen first", the Ruling row, "The night", the dispatch's window text, OWNER CLICKS row 1, the merge order (C5), the NOT REHEARSED line about block A's MERGED read and the R9 statement (C4) reworded to the chain night. The post-check gains 0109's missing-variable guard for each of its 10 carries (a new SHAPOST), and the six psql lines of stages 1 and 2 read `"${DATABASE_URL_DIRECT:?}"`, as 0110's and 0112's do. The migration is byte-identical.
- **2026-11-05, the R4 fixes (R4 of the chain-night changes: PASS, no MAJOR; the coordinator's instruction):** block A' and block B count the merge's conflict marker lines from a diff read with its own halt, and STOP when the count is not a number (it failed open); block A' also STOPs when the lower head changed a migration, mirror or pending file after the pinned lower commit; the chain starts at 22:00 Lisbon (the lead's decision), with the window values and every block unchanged; the R9 statement says so; stale prose (not promoted, the script test not written, the 0109 network-time note, verdict 8's pin and the HARD READY condition) reworded; the seed.sql merge note (C5); the post-check's header, and its new guards in NOT REHEARSED. GREEN's six stage blocks are byte-identical; the post-check's header comments changed, so the SHAPOST value GREEN's blocks pin changed with it.
- **2026-11-05, the READY pass (the coordinator's instruction, after the C3 chain rehearsal, REHEARSED OK, and the narrow R4 round 2, PASS):** the first line goes; the C3 rehearsal is recorded under "Rehearsal record" and "NOT REHEARSED", 0111's HARD READY condition is met, and the stale post-check comment is listed under "Known limits"; the round-2 prose MINORs fixed. Prose only: GREEN's blocks and the check files are byte-identical to the rehearsed ones.

