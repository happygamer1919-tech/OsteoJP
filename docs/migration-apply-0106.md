# 0106: apply the reminder sweep's two tables

**NOT READY. Nothing in this document may be pasted yet.** The migration is promoted to its number on `main`'s position after 0105, and this document carries its seven blocks, reviewed; five of them rehearsed on a throwaway at production's position by an agent that did not write them (BEFORE YOU START and the CLOCK CHECK stop at their PENDING lines there and are NOT REHEARSED). Open, in order: one R4 round on this revision's record of the rehearsal (the status lines, the NOT READY list, "Rehearsal", "NOT REHEARSED" and stage 1's EXPECT; no block byte changed); SOLO's READY line; the pull request, opened held; `main` merged in with CI green; the owner's two clicks; and GREEN's dispatch, which carries the values this document cannot hold (the merge commit's sha as MERGED, this document's sha256 as DOCSHA, and the run window as WOPEN, WSTART and WEND). Until the pull request is merged every block below STOPs at its first check, because this document is not on `origin/main`. **The sitting is closed hours only** (this migration creates policies; see "Closed hours, and the locks").

**Status: AUTHORED; REVIEWED (a fresh reviewer PASSED the migration revision on 2026-10-19 with three MINOR findings, all answered; see "Review history"); PROMOTED 2026-10-19 (`packages/db/migrations/0106_reminder_claims.sql`, journal idx 103); BLOCKS WRITTEN 2026-10-19 AND PROVEN BY THEIR FAULT-INJECTION TEST; ONE R4 ROUND ON THEM 2026-10-19 (ONE MAJOR, FOUR MINOR FINDINGS, ALL ANSWERED) AND A RE-REVIEW OF THE FIXES THE SAME DAY (READY, TWO MINOR WORDING FINDINGS, ANSWERED); REHEARSED 2026-10-19 AND 2026-10-20 ON A THROWAWAY BY AN AGENT THAT DID NOT WRITE THEM ("The fourth rehearsal"): STAGES 0, 1 AND 2, AND THE S12 COUNT'S BLOCK RAN, AND THE CLOSING READ RAN TO ITS READER LINE, WHICH A THROWAWAY CANNOT RUN; NO BLOCKER AND NO MAJOR; BEFORE YOU START AND THE CLOCK CHECK STOP AT THEIR PENDING LINES THERE, AS THEY MUST, AND ARE NOT REHEARSED. NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, sha256 `2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9`, 24 statements, unchanged by the promotion.

**In plain language.** The daily reminder sweep needs a place of its own to write down which reminders it took and when it ran. This migration creates that place: two new, empty tables. Only the reminder job's own session may add a row; staff of the clinic group may read them; nobody may change or remove a row; `service_role` holds nothing on either. Nothing that exists today changes: no existing table, policy, function or grant. No screen changes. Nothing reads or writes the tables until the sweep's own pull requests merge, after the apply.

Seven blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the merge commit, every pin, production's journal), stage 0 (the files, the journal, the W-9 search, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal), the S12 count (read only, information for strategy) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0106 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's. The one exception: a STOP line that begins
"STOP: the S12 count's block only:" ends that block alone, because the S12 count's
own query failed inside a transaction that read as READ ONLY; that line and its
non-zero exit end that block alone, and the closing read is pasted next.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed and its last sentence, the one exception, added; GREEN's dispatch carries it in the same words.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2, the S12 count's block and the closing read. **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.** **THE ONE EXCEPTION IS NARROW.** Strategy's words, "never a STOP condition" (2026-10-14), are about the S12 count's values: whatever it counts, the sitting goes on. They do not cover a read that cannot be trusted. So exactly one STOP line in this document is the exception, the S12 block's line on its own query: psql ended with an error or ran past its 120 seconds after the transaction had read as READ ONLY. Every other STOP of the S12 block (no applied marker, no pass mark from stage 2, the head, a pinned file, the window, the environment, the target guard's refusal, a transaction that is not read only, psql that never reached the query) is a full STOP of the halt rule, worded as every other block's are.

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/reminder-claims-0106.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**The check files count, and the blocks count again.** Neither check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `13 OK / 0 VACUOUS / 0 FAIL` of the pre-check, `26 OK / 0 VACUOUS / 0 FAIL` of the post-check. **A psql exit that is not 0 on either file means the read did not complete** (a carry not handed in, a lost connection, an object that is not there). On the post-check that can be a read that contradicts stage 1: its verdict 14 counts the rows of both tables, so on a database without them the file ends with `relation ... does not exist`. Stage 2's STOP on the post-check's own run says both, and never that 0106 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE: `0104` and `0105` are applied to production and merged.** GREEN applied both on 2026-10-15 (`0104` 00:40 to 00:45 Lisbon, `0105` 21:30 to 21:32); production's journal reads 103, `0105` at idx 102. `main` was merged into this branch on 2026-10-19 (merge commit `f3ac14f6`; no conflict).
2. **DONE 2026-10-19: a fresh reviewer passed the migration's revision** (R4, Tier C), with three MINOR findings: (a) the S12 file's printed Run line did not carry the 120 second bound its block sets; (b) the `a.tenant_id` mutant (mutant 4 of the second sweep) survived the suite on CI; (c) the header, this list and the status lines were stale. Each is answered: (a) the Run line carries it, and every pin of the S12 file moved to `d8c94f0f...150fb7`; (b) the suite gained the arm "THE CLAIMS INSERT POLICY'S WITH CHECK is the pinned expression", which reads mutant 4 red (see "Mutation sweeps"); (c) this header, this list and the status lines.
3. **DONE 2026-10-19: the GATE-CHANGE the promotion forces is merged,** as its own pull request: the cleanup test learns `reminder_claims` (#1617, merged by the owner at 17:32 Lisbon). `main` was merged into this branch after it (`4c4bc929`); the cleanup test passes 26 of 26 on this branch.
4. **DONE 2026-10-19: the promotion** (the next section).
5. **DONE 2026-10-19: this document's blocks, its sidecar and its fault-injection test** (`scripts/reminder-claims-0106.test.mjs`), and the check files' journal verdicts. **DONE 2026-10-19: one R4 round** on the blocks, the check files' new verdicts and the script test (one MAJOR, four MINOR, all answered), **and a re-review of the changed bytes** (READY; two MINOR wording findings, answered in `8df52cee`; see "Review history"). **DONE 2026-10-19 and 2026-10-20: the rehearsal,** by an agent that did not write them, of every block on a throwaway at production's position (`0000` to `0105` applied, a drizzle journal of 103 rows), under the lead's rule of 2026-09-30 (see "The fourth rehearsal"). No BLOCKER and no MAJOR. Its two MINOR findings, the stale record lines and four items missing from "NOT REHEARSED" and stage 1's EXPECT, are answered in this revision, which changes no block byte. **OPEN: one R4 round on this revision's changed prose.**
6. **OPEN: SOLO's READY line; the pull request, opened held (`held-for-apply`, unarmed); `main` merged into the branch with CI green on that head.**
7. **OPEN, THE OWNER: he takes `held-for-apply` off and merges** (strategy W-9: "merge first, apply from main"). Merges to main stop from that merge until GREEN's report on 0106.
8. **OPEN: SOLO fills GREEN's dispatch** after the merge: MERGED (the merge commit), DOCSHA (this document's sha256 at that commit) and a run window while both clinics are closed. Stage 0 runs the W-9 search on the commit the sitting runs from, by itself.
9. **AFTER THE APPLY, AND NOT GREEN'S: the sweep's steps,** already moved onto the tables on the local branches `reminders/SWEEP-13-on-table` and `reminders/SWEEP-47-sweep-sends`, merge only after the apply. Code that queries a table production does not have fails at run time.

## The promotion, as done on 2026-10-19

The number is ruled (W-8), so none of this was a decision. It changed no byte of the migration.

1. `main` merged into the branch (a merge, never a rebase): `f3ac14f6`, no conflict.
2. `packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` renamed to `packages/db/migrations/0106_reminder_claims.sql`. sha256 `2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9` before and after; the file's own header still says "PENDING" and names its pending path, stale on purpose.
3. Its journal entry: `idx 103`, tag `0106_reminder_claims`, `when` 1788502700000 (0105's 1788502600000 plus 100000, the existing step).
4. Its mirror, `supabase/migrations/0106_reminder_claims.sql`, written by `scripts/sync-supabase-migrations.mjs`.
5. The row of `packages/db/migrations-pending/README.md` moved to its "Promoted" table.
6. `scripts/import/cleanup-test-patients.sql` deletes from `reminder_claims` by appointment (its appointment is the test tenant's patient's, through `patient_id` or `patient_2_id`), before the delete from `appointments`, after the survey tables, in the file's own style. Its foreign key to the appointment is ON DELETE CASCADE; the rows are deleted explicitly, as the cascading tables already are.
7. The pre-check gained verdicts 10 to 12 (0106 absent by hash, with 0105 found once as the control; 0105 the newest row by hash at its `when`; 103 rows), and its header names the promoted path. The post-check gained verdicts 24 and 25 (0106 present once by hash as the newest row at its `when`, with 0105 found once as the control; the journal moved by exactly one) and takes `journal_rows_before` as a carry.
8. `packages/db/src/schema.ts`'s comment and the suite's header name the promoted path.
9. `node scripts/check-journal.mjs`: `104 .sql files match 104 journal entries in order, when strictly increasing, and the supabase mirror matches by CONTENT`.

`packages/db/tests/reminder-claims-rls.db.test.ts` needed no edit for the promotion: from the promotion commit on it throws, instead of skipping, on a database without the tables.

| Fact | Value |
|---|---|
| Ruling | Strategy's ruling of 2026-10-13, W-8: "the sweep table is 0106". Tier C. Merged first and applied from `main` (W-9), on a closed night after 0105's clean report |
| Migration | `packages/db/migrations/0106_reminder_claims.sql`, promoted from `packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` with no byte changed. sha256 `2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9` |
| Journal | `idx 103`, tag `0106_reminder_claims`, `when` 1788502700000. Stage 0 asserts it and 0105's entry before it. Production's journal goes 103 to 104 |
| Mirror | `supabase/migrations/0106_reminder_claims.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0105`, sha256 `980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441`, journal `idx 102`, `when` 1788502600000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the pull request's merge commit (BEFORE YOU START checks it against MERGED). Stage 0 records the sha in `/tmp/0106-main.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if `origin/main` has moved since |
| This document | `docs/migration-apply-0106.md`, pinned by `docs/migration-apply-0106.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0106-reminder-claims.sql`, READ ONLY, 13 verdicts (12 is the row `journal_rows_before`), 9 CARRY rows and 3 INFO rows, run inside the block's own `begin read only`. sha256 `5276d797e9c262865ad38bd64ffc4780f67814093469667858e2dd75b87ba260` |
| Post-check | `scripts/db/postcheck-0106-reminder-claims.sql`, READ ONLY, 26 verdicts (22 and 23 may read VACUOUS, which is a STOP), ten carries in, run inside the block's own `begin read only`. sha256 `4d6a6f71e7a736be28afb00ead0ca3b9fa8c071ada242a8fa8b83fd32c3afc79` |
| The S12 count | `scripts/db/s12-never-had-a-reminder-count.sql`, READ ONLY, information for strategy, never a verdict. sha256 `d8c94f0fb7833785152a4edd099289a4fd60dce20331fef7a72353759f150fb7` (the handover query below its marker is unchanged byte for byte, sha256 `334e9e3a...feb00df`) |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0105's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0106-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block** |
| What it changes | The three `SET LOCAL` lines, for this transaction only. Then two new tables, `public.reminder_claims` and `public.reminder_sweep_passes`, with their indexes, comments, row level security, grants, foreign keys and four policies (section 1) |
| What it never touches | every row, every existing table's columns, every existing policy, privilege, function, trigger and default privilege (the SECURITY DEFINER count stays 36: **no count GATE-CHANGE after the apply**). The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0106.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document moves its sha256; the sidecar is regenerated in the same commit, and `scripts/reminder-claims-0106.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`. Git's pathspec exclusions are written `:(exclude)` for that reason.

## Closed hours, and the locks

**Closed hours only, and R9 does not apply.** This file creates four policies. Strategy's standing rule (S-1004-A): "any migration that creates a policy is closed-hours only, never eligible for R9." The weekday table (Lisbon): open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00; closed Sunday. BEFORE YOU START and the CLOCK CHECK check the clock by machine against it and against strategy's start windows; stage 0 and stage 1 check it against the table, and stage 1 also reads every active clinic's own hours. Strategy's calendar of 2026-10-13: one migration in flight, each on a closed night after the previous one's clean report and merge.

**The locks** are measured and recorded in "The locks, measured on the throwaway" below: none on any existing table until the foreign keys (SHARE ROW EXCLUSIVE on `public.appointments` and `public.tenants`: writes to them wait, reads do not), then ACCESS EXCLUSIVE on the platform's login, storage and realtime tables from the policies to the COMMIT. Both new tables are empty, so the foreign keys validate at once. **What waits while they are held:** every write to an appointment or a tenant from statement 19, and every login, token refresh, storage or realtime call from statement 21, until the COMMIT. Nothing fails unless it waits longer than its own timeout. A lock this transaction cannot take in 5 seconds fails it clean, with nothing applied (`journal    103 -> 103  (delta 0)`). **Production's `supautils.policy_grants` setting has not been read,** and the time the locks are held there was not measured.

## Merged before the apply, and which commit the sitting runs from

0106 creates no function, so no required check counts anything it adds. The pull request merges first and GREEN applies from the merge commit on `main`, as 0100, 0101, 0103, 0104 and 0105 were (W-9). **Between the merge and the apply, `main` is one migration ahead of production.** Nothing on `main` reads either table (W-9; stage 0 searches again on the commit the sitting runs from), so nothing that runs in production notices. The suite that reads the tables runs on CI against a database built from `main`, which has them.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0105. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `MERGED`: the merge commit of the pull request, a full 40-character sha (BEFORE YOU START only);
- `DOCSHA`: this document's sha256 at that commit (both blocks);
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks): it opens, the last minute stage 1 may start, and its end.

In this document the five lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. Its halt rule is THE HALT RULE above, in the same words. The CLOCK CHECK writes ONE line to `/tmp/0106-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2, the S12 count's block and the closing read each read by machine.

**THE START WINDOWS (strategy's S-1002-D P1.4, as the dispatches of 0100 to 0105 hold them), read from the clock, never typed.** Stage 1 starts inside one: Monday to Saturday 21:00 to 22:29 (everything before 08:00 the next morning) or 00:00 to 06:29 (everything before 08:00 that morning); Sunday any hour (stage 1 by Monday 06:29, everything before Monday 08:00). The two dispatch blocks stop unless the start window the clock is in lies inside the run window the dispatch names. Two judgments carried over from 0101's to 0105's dispatches, SOLO's and not rulings: Saturday 13:00 to 20:59 is closed by the table and is not a start window; Sunday is one window.

**THE MACHINE'S CLOCK IS HELD AGAINST NETWORK TIME, BY MACHINE, TWICE, ON THREE SOURCES** (BEFORE YOU START and the CLOCK CHECK): `sntp time.apple.com` (up to three attempts; within 5 seconds), and the Date headers of https://api.github.com and https://www.cloudflare.com (each with `curl -sI --max-time 8`; within 30 seconds). The clock is accepted when at least one of the three can be read and every one that was read agrees; the block STOPs if none can be read, and STOPs if any one that was read disagrees. A source that fails is NOT READ, which alone is not a STOP. On 2026-10-13 this clock was found 7 hours off. GREEN never sets the clock. These lines are 0105's dispatch's, unchanged, and use BSD `date -j` (macOS, where GREEN runs).

## BEFORE YOU START: network time, the merge commit, every pin, production's journal. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
MERGED='PENDING: set after the merge'
DOCSHA='PENDING: set after the merge'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
SHA0106=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPREV=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPRE=5276d797e9c262865ad38bd64ffc4780f67814093469667858e2dd75b87ba260
SHAPOST=4d6a6f71e7a736be28afb00ead0ca3b9fa8c071ada242a8fa8b83fd32c3afc79
SHAS12=d8c94f0fb7833785152a4edd099289a4fd60dce20331fef7a72353759f150fb7
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0106_reminder_claims.sql
PREVMIG=packages/db/migrations/0105_clinical_records_episode_key.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${MERGED}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: MERGED is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0106} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAS12} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){10}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
test ! -f /tmp/0106-applied.ok || { AGE=$(find /tmp/0106-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0106 was applied in this sitting (/tmp/0106-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0106-start-main.sha /tmp/0106-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. The journal read has not run"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://api.github.com https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. On 2026-10-13 this clock was found 7 hours off. Do not set the clock yourself. The journal read has not run"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: none of the three sources could be read (sntp time.apple.com, the Date header of https://api.github.com, the Date header of https://www.cloudflare.com), so the clock is not shown to be right. Do not set the clock yourself. The journal read has not run"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0106 creates policies, so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
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
git fetch origin --prune || { echo "STOP: the fetch failed, so origin/main may be stale. The journal read has not run"; exit 1; }
MAIN=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. The journal read has not run"; exit 1; }
echo "${MAIN}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAIN}]. The journal read has not run"; exit 1; }
echo "main head:     ${MAIN}"
[ "${MAIN}" = "${MERGED}" ] || { echo "STOP: origin/main is not the commit this block names (${MERGED}): something else has landed since, or the merge has not. The merge freeze starts at that merge. The journal read has not run"; exit 1; }
echo "merge commit:  origin/main IS the commit this block names"
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. The journal read has not run"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. The journal read has not run"; echo "${STRAY}"; exit 1; }
WAS=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. The journal read has not run"; exit 1; }
echo "worktree:      clean, on ${WAS}"
git checkout -q --detach ${MAIN} || { echo "STOP: the checkout of the merge commit failed. The journal read has not run"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. The journal read has not run"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. The journal read has not run"; exit 1; }
[ "${HD}" = "${MAIN}" ] || { echo "STOP: the apply worktree is not on the merge commit after the checkout. The journal read has not run"; exit 1; }
echo "checked out:   ${MAIN}, the merge commit, so the read below runs the reader it holds"
DOC=$(git show ${MAIN}:docs/migration-apply-0106.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document on origin/main is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${MAIN}:docs/migration-apply-0106.md | sed -n 3p) || { echo "STOP: the document's banner (its third line) could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's banner (its third line) read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '[A-Z]-PENDING' || { echo "STOP: the document's banner (its third line) carries a mark that ends in -PENDING, or it could not be searched, so the document that merged is not shown to be the final one. The journal read has not run"; exit 1; }
echo "banner:        final (it carries no mark that ends in -PENDING)"
SIDE=$(git show ${MAIN}:docs/migration-apply-0106.sha256) || { echo "STOP: the sidecar could not be read at the merge commit. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0106.md" ] || { echo "STOP: the sidecar on origin/main does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${MAIN}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0106 could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0106}" ] || { echo "STOP: 0106 on origin/main is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${MAIN}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0105 could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "0105:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0105 on origin/main is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${MAIN}:scripts/db/precheck-0106-reminder-claims.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check on origin/main is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${MAIN}:scripts/db/postcheck-0106-reminder-claims.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "post-check:    ${SPOST}"
[ "${SPOST}" = "${SHAPOST}" ] || { echo "STOP: the post-check on origin/main is not the approved file. The journal read has not run"; exit 1; }
SS12=$(git show ${MAIN}:scripts/db/s12-never-had-a-reminder-count.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the S12 file could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "S12 count:     ${SS12}"
[ "${SS12}" = "${SHAS12}" ] || { echo "STOP: the S12 file on origin/main is not the approved file. The journal read has not run"; exit 1; }
SV=$(git show ${MAIN}:packages/db/scripts/verified-migrate.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: verified-migrate could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "migrate:       ${SV}"
[ "${SV}" = "${SHAVM}" ] || { echo "STOP: verified-migrate on origin/main is not the approved file. The journal read has not run"; exit 1; }
SG=$(git show ${MAIN}:scripts/assert-production-target.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the target guard could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "guard:         ${SG}"
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on origin/main is not the approved file. The journal read has not run"; exit 1; }
SC=$(git show ${MAIN}:scripts/check-journal.mjs | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: check-journal could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "check-journal: ${SC}"
[ "${SC}" = "${SHACJ}" ] || { echo "STOP: check-journal on origin/main is not the approved file. The journal read has not run"; exit 1; }
test -f ${READER} || { echo "STOP: the migration reader is not on disk at the merge commit. The journal read has not run"; exit 1; }
test -f ${PTM} || { echo "STOP: scripts/production-target.mjs is not on disk at the merge commit. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed. The journal read has not run"; exit 1; }
echo "reader:        ${RW} (on disk at the merge commit: the program this read runs, and the closing read runs it from the same sha)"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the merge commit is not the pinned file. The journal read has not run"; exit 1; }
MW=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: scripts/production-target.mjs could not be hashed. The journal read has not run"; exit 1; }
echo "module:        ${MW} (scripts/production-target.mjs on disk, which the reader and the guard import)"
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the merge commit is not the pinned file. The journal read has not run"; exit 1; }
echo "every check passed. The journal read runs now"
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0106-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 103' /tmp/0106-journal-before.out || { echo "STOP: the journal read does not say 103. Nothing was applied"; exit 1; }
echo "${MAIN}" > /tmp/0106-start-main.sha || { echo "STOP: the main head could not be recorded. Nothing was applied"; exit 1; }
echo "main head recorded for the CLOCK CHECK: ${MAIN}"
echo "BEFORE YOU START: every check passed, and the journal reads 103."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: four `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `main head:` and `merge commit: origin/main IS the commit this block names`; `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `banner: final ...`, `sidecar:`; `migration:`, `0105:`, `pre-check:`, `post-check:`, `S12 count:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 103` (and 0106 listed as pending on that ref); `main head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 103.` Exit 0. It writes nothing to production. **The banner check catches only a mark that ends in `-PENDING` on the document's third line; it is a tripwire, not the gate. DOCSHA is the gate:** the document must hash to the value the dispatch names, or the block stops. **An applied marker is read as stages 0 and 1 read it:** one under 12 hours old stops the block, and an older one, left from an earlier night, does not.

## STAGE 0: the merge, the files, the W-9 search, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0106.sha256
MIG=packages/db/migrations/0106_reminder_claims.sql
SHA0106=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPREV=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPRE=5276d797e9c262865ad38bd64ffc4780f67814093469667858e2dd75b87ba260
SHAPOST=4d6a6f71e7a736be28afb00ead0ca3b9fa8c071ada242a8fa8b83fd32c3afc79
SHAS12=d8c94f0fb7833785152a4edd099289a4fd60dce20331fef7a72353759f150fb7
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0106-applied.ok || { AGE=$(find /tmp/0106-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0106 in this sitting, or the age of /tmp/0106-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0106-main.sha /tmp/0106-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so origin/main may be stale. Nothing was applied"; exit 1; }
MAIN=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
echo "${MAIN}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAIN}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN} || { echo "STOP: the checkout of origin/main failed. Nothing was applied"; exit 1; }
echo "--- THE HEAD CHECK: the worktree must be on the origin/main this stage records"
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${MAIN}" ] || { echo "STOP: the worktree is not on origin/main after the checkout. Nothing was applied"; exit 1; }
echo "origin/main and HEAD: ${MAIN}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0106 is not on disk at origin/main, so the PR has not merged"; exit 1; }
N106=$(find packages/db/migrations -maxdepth 1 -name '0106_*.sql' | wc -l | tr -d ' ')
[ "${N106}" = 1 ] || { echo "STOP: ${N106} files claim migration number 0106, not 1"; exit 1; }
N105=$(find packages/db/migrations -maxdepth 1 -name '0105_*.sql' | wc -l | tr -d ' ')
[ "${N105}" = 1 ] || { echo "STOP: ${N105} files claim migration number 0105, not 1"; exit 1; }
test -f scripts/db/precheck-0106-reminder-claims.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0106-reminder-claims.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/db/s12-never-had-a-reminder-count.sql || { echo "STOP: the S12 file is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0106}" ] || { echo "STOP: 0106 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0106-reminder-claims.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0106-reminder-claims.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/s12-never-had-a-reminder-count.sql | cut -d' ' -f1)" = "${SHAS12}" ] || { echo "STOP: the S12 file on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===104&&e.idx===103&&e.tag==='0106_reminder_claims'&&e.when===1788502700000&&p.idx===102&&p.tag==='0105_clinical_records_episode_key'&&p.when===1788502600000?0:1)" || { echo "STOP: the newest journal entry is not idx 103, tag 0106_reminder_claims, when 1788502700000, of 104, after idx 102 tagged 0105_clinical_records_episode_key at when 1788502600000"; exit 1; }
test -f packages/db/migrations/0105_clinical_records_episode_key.sql || { echo "STOP: the file of journal idx 102 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0105_clinical_records_episode_key.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0105 on disk is not the file this document pins"; exit 1; }
echo "0105 on disk: 0105_clinical_records_episode_key.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0106-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '104 .sql files match 104 journal entries' /tmp/0106-check-journal.out || { echo "STOP: check-journal did not reconcile 104 files with 104 journal entries"; exit 1; }

echo "--- THE W-9 SEARCH (strategy W-9): no code at origin/main reads either table; the only lines are one test's local helper of the same name"
W9=$(git grep -n -I -E 'reminder_claims|reminder_sweep_passes|reminderClaims|reminderSweepPasses' -- apps packages scripts supabase ':(exclude)packages/db/migrations' ':(exclude)packages/db/migrations-pending' ':(exclude)supabase/migrations' ':(exclude)packages/db/src/schema.ts' ':(exclude)packages/db/tests/reminder-claims-rls.db.test.ts' ':(exclude)scripts/db/precheck-0106-reminder-claims.sql' ':(exclude)scripts/db/postcheck-0106-reminder-claims.sql' ':(exclude)supabase/seed.sql' ':(exclude)scripts/import/cleanup-test-patients.sql' ':(exclude)scripts/import/cleanup-test-patients.test.mjs' ':(exclude)scripts/reminder-claims-0106.test.mjs') || { echo "STOP: the W-9 search failed, or found no line at all where it must find three. Nothing was applied"; exit 1; }
echo "${W9}"
W9N=$(printf '%s\n' "${W9}" | wc -l | tr -d ' ') || { echo "STOP: the W-9 search's lines could not be counted. Nothing was applied"; exit 1; }
W9X=$(printf '%s\n' "${W9}" | grep -cv '^packages/db/tests/reschedule-requests-rls[.]db[.]test[.]ts:' || true)
[ "${W9X}" = 0 ] || { echo "STOP: the W-9 search printed [${W9X}] lines outside packages/db/tests/reschedule-requests-rls.db.test.ts (they are above): code that reads either table merged before the apply. Nothing was applied"; exit 1; }
[ "${W9N}" = 3 ] || { echo "STOP: the W-9 search printed ${W9N} lines of packages/db/tests/reschedule-requests-rls.db.test.ts, not its three. Nothing was applied"; exit 1; }
echo "W-9: the three lines of one test's local helper, and nothing else"

echo "--- THE CLOCK (R9): 0106 creates four policies, and a migration that creates a policy is closed hours only, never eligible for R9 (S-1004-A). The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${MAIN} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it adds foreign keys to public.appointments, which reception writes, and it creates four policies)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0106 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0106 creates policies and is closed hours only, whatever the three proofs read, and the sitting waits. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0106-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0106-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0106-main.sha"
echo "0106 MERGE, NUMBER, FILES, W-9 SEARCH AND CLOCK VERIFIED"
)
```

**EXPECT:** `origin/main and HEAD: <sha>`, the main head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0106.md: OK`; `newest journal entry: idx 103, when 1788502700000, tag 0106_reminder_claims, of 104; before it idx 102, when 1788502600000, tag 0105_clinical_records_episode_key`; `0105 on disk: ...`; check-journal's line with `104 .sql files match 104 journal entries`; the W-9 search's three lines, all of `packages/db/tests/reschedule-requests-rls.db.test.ts`, then `W-9: the three lines of one test's local helper, and nothing else`; the clock line reading `closed by the weekday table`; the three proof lines (they decide nothing here); `R9: closed hours by the weekday table. 0106 runs in closed hours only`; `running from origin/main <sha>, recorded in /tmp/0106-main.sha`; then `0106 MERGE, NUMBER, FILES, W-9 SEARCH AND CLOCK VERIFIED`. Exit 0. It reads no database.

**Until the pull request is merged, this stage ends at its first file check,** `STOP: the document pin is not on disk at origin/main`. **A W-9 STOP** means a reader of either table reached `main` before the apply: nothing was applied, and the lead rules.

## CLOCK CHECK: the start window, recorded. GREEN pastes its dispatch's filled copy, right after stage 0

```
(
set -o pipefail
DOCSHA='PENDING: set after the merge'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: the document's sha256 in this block is still PENDING, so it is NOT READY. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. Nothing was applied. Do not paste stage 1"; exit 1; }
test ! -f /tmp/0106-applied.ok || { AGE=$(find /tmp/0106-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0106 was applied in this sitting (/tmp/0106-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0106-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0106-start-main.sha || { echo "STOP: BEFORE YOU START recorded no main head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0106-start-main.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0106-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0106-main.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0106-main.sha -nt /tmp/0106-start-main.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0106-start-main.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0106-main.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "main at BEFORE YOU START: ${START}"
echo "recorded by stage 0:      ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: main moved between BEFORE YOU START and stage 0, the merge freeze was broken. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0106.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "document at the recorded sha: ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the recorded sha is not the approved one. Nothing was applied. Do not paste stage 1"; exit 1; }
TOK=""; TBAD=""; TNOT=""
SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=$(sntp time.apple.com 2>&1) || SN=""
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }')
if echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+'; then if awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }'; then TOK="${TOK} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, within 5 seconds"; else TBAD="${TBAD} sntp"; echo "network time:  sntp time.apple.com: read, the machine's clock is ${OFF} seconds from it, MORE THAN 5 seconds, or the offset could not be compared"; fi; else TNOT="${TNOT} sntp"; echo "network time:  sntp time.apple.com: NOT READ (it failed three times in a row, or no offset could be read out of its answer)"; fi
for TU in https://api.github.com https://www.cloudflare.com; do
TH=$(curl -sI --max-time 8 "${TU}" 2>/dev/null) || TH=""
TL=$(date -u '+%s') || TL=""
TD=$(printf '%s\n' "${TH}" | awk '{ sub(/\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }')
TE=""; if printf '%s\n' "${TD}" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' "${TD}" '+%s' 2>/dev/null) || TE=""; fi
if printf '%s %s\n' "${TE}" "${TL}" | grep -qxE '[1-9][0-9]{8,10} [1-9][0-9]{8,10}'; then TDIF=$(( ${TL} - ${TE} )); if [ "${TDIF}" -ge -30 ] && [ "${TDIF}" -le 30 ]; then TOK="${TOK} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), within 30 seconds"; else TBAD="${TBAD} ${TU}"; echo "network time:  ${TU}: read, its Date header says ${TD}, the machine's clock is ${TDIF} seconds ahead of it (a minus sign means behind), MORE THAN 30 seconds"; fi; else TNOT="${TNOT} ${TU}"; echo "network time:  ${TU}: NOT READ (curl failed or ran past 8 seconds, or it sent no Date header that could be parsed)"; fi
done
[ -z "${TBAD}" ] || { echo "STOP: the machine's clock disagrees with network time, by more than the tolerance, at:${TBAD} (the network time lines above carry the numbers). One source that can be read and disagrees stops the block, whatever the others say. On 2026-10-13 this clock was found 7 hours off. Do not set the clock yourself. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "${TOK}" ] || { echo "STOP: the machine's clock could not be held against network time: none of the three sources could be read (sntp time.apple.com, the Date header of https://api.github.com, the Date header of https://www.cloudflare.com), so the clock is not shown to be right. Do not set the clock yourself. Nothing was applied. Do not paste stage 1"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0106 creates policies, so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
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
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0106-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0106-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0106-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the main BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `main at BEFORE YOU START: <sha>` and `recorded by stage 0:      <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0106-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the main BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database. Every STOP but the last two leaves no window recorded, so stage 1 would stop too; the last two come after the record is written, and the halt rule governs.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0106_reminder_claims.sql
SHA0106=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPREV=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPRE=5276d797e9c262865ad38bd64ffc4780f67814093469667858e2dd75b87ba260
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0106-applied.ok || { AGE=$(find /tmp/0106-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0106 in this sitting, or the age of /tmp/0106-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0106-precheck.new || { echo "STOP: the old /tmp/0106-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0106-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0106-main.sha) || { echo "STOP: stage 0's record /tmp/0106-main.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0106.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0106 is not on disk"; exit 1; }
test -f scripts/db/precheck-0106-reminder-claims.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N106=$(find packages/db/migrations -maxdepth 1 -name '0106_*.sql' | wc -l | tr -d ' ')
[ "${N106}" = 1 ] || { echo "STOP: ${N106} files claim migration number 0106, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0106}" ] || { echo "STOP: 0106 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0106-reminder-claims.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T105=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[102];process.stdout.write(p&&p.idx===102&&p.tag==='0105_clinical_records_episode_key'?p.tag:'none')") || { echo "STOP: node could not read journal idx 102's tag at the recorded sha. Nothing was applied"; exit 1; }
W105=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[102];process.stdout.write(p&&p.idx===102&&p.tag==='0105_clinical_records_episode_key'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 102's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W105}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0105's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T105}.sql || { echo "STOP: the file of journal idx 102 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T105}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0105 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0105: packages/db/migrations/${T105}.sql, sha256 ${SHAPREV}, journal when ${W105}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0106-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0106-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0106-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0106-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0106-window.ok)
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
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was applied"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was applied"; exit 1; }

echo "--- the pre-check. READ ONLY, inside this block's own begin read only. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0106-reminder-claims.sql -c "rollback" 2>&1 | tee /tmp/0106-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0106-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0106-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0106-precheck.new || true)
[ "${OKS}" = 13 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 13. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, what postgres hands out by default on a new table, the planner's estimates of the rows behind the two locks): they decide nothing in this block, and the lead reads them"

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
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (opens_at < time '08:00' or closes_at > time '21:00')) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1) || { echo "STOP: the clinics' own hours could not be read (psql's lines are above). Nothing was applied"; exit 1; }
echo "active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=inside; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=outside; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "the clinics' own rows against the weekday table: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it adds foreign keys to public.appointments, which reception writes, and it creates four policies)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0106 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0106 creates policies and is closed hours only, whatever the three proofs read, and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0106-postcheck.out /tmp/0106-stage2.ok /tmp/0106-s12-count.out /tmp/0106-journal-after.out /tmp/0106-apply.out /tmp/0106-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0106-precheck.new /tmp/0106-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0106-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0106-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0106_reminder_claims --sha256 ${SHA0106} --expect-pending 1 2>&1 | tee /tmp/0106-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0106-apply.out holds it). Whether 0106 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0106-applied.ok || { echo "STOP: verified-migrate exited 0, so 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0106-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0106 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the same sha twice; `docs/migration-apply-0106.md: OK`; `0105: packages/db/migrations/0105_clinical_records_episode_key.sql, sha256 980c6f24..., journal when 1788502600000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 13 OK (the journal verdicts 10 and 11 naming 0106 absent and 0105 the newest row at 1788502600000, and the row `journal_rows_before` reading 103), 9 CARRY rows and 3 INFO rows; then `the pre-check profile: 13 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0106 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0106-apply.out`: `pending    1  [0106_reminder_claims]`, the drizzle-kit banner, `journal    103 -> 104  (delta 1)` and `0106_reminder_claims present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal, as production does: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`, then the line ending `migrations applied successfully!`. They are not errors and decide nothing (the fourth rehearsal printed both).
- `0106 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL, a VACUOUS, or an OK count that is not 13 is such a STOP. The apply is the only writing command in this document. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition (on a database that already holds 0106 it reads `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`, exit 3, nothing run), but exit 3 or 4 can also follow a committed apply. A lock it cannot take in 5 seconds is a clean failure with nothing applied (`journal    103 -> 103  (delta 0)`); it is still a halt.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0106=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPOST=4d6a6f71e7a736be28afb00ead0ca3b9fa8c071ada242a8fa8b83fd32c3afc79
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0106-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0106-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0106-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0106-main.sha) || { echo "STOP: stage 0's record /tmp/0106-main.sha could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0106.sha256 || { echo "STOP: this document is not the approved one. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0106_reminder_claims.sql || { echo "STOP: 0106 is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0106-reminder-claims.sql || { echo "STOP: the post-check is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0106_reminder_claims.sql | cut -d' ' -f1)" = "${SHA0106}" ] || { echo "STOP: 0106 on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0106-reminder-claims.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0106-window.ok || { echo "STOP: no run window is recorded for this sitting. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0106-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0106-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0106-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0106-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0106-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
Q=$(carry sequences_before)
S=$(carry secdef_before)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
TM=$(carry triggers_md5)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${Q}" ] && [ -n "${S}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${TM}" ] || { echo "STOP: a carry did not parse out of the transcript. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${T} ${Q} ${S}" | grep -qxE '[0-9]+( [0-9]+){3}' || { echo "STOP: a count carry is not a number. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${FM} ${RM} ${CM} ${DM} ${TM}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){5}' || { echo "STOP: an md5 carry is not 32 hex characters. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} tables_before=${T} sequences_before=${Q} secdef_before=${S} policies_md5=${PM} functions_md5=${FM} relation_acl_md5=${RM} column_acl_md5=${CM} default_acl_md5=${DM} triggers_md5=${TM}"
WVAC=0
WOK=26
echo "the post-check profile this sitting must print: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL, and no other (a VACUOUS verdict is not a pass, and a verdict that is missing prints no FAIL)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0106-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v sequences_before="${Q}" -v secdef_before="${S}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v triggers_md5="${TM}" -c "begin read only" -f scripts/db/postcheck-0106-reminder-claims.sql -c "rollback" 2>&1 | tee /tmp/0106-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0106-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0106, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0106-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0106-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}: no verdict of this post-check may read VACUOUS. A VACUOUS verdict is not a pass. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0106 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0106, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0106}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0106 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0106, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0106 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0106-stage2.ok || { echo "STOP: the pass mark /tmp/0106-stage2.ok could not be written, so the closing read would refuse. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0106 POST-CHECK PASSED. 13/13 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; public.reminder_claims and public.reminder_sweep_passes stand as pinned, with row level security on, their four policies, SELECT and INSERT for authenticated and nothing for service_role, both empty; tables ${T} before, SECURITY DEFINER functions ${S} unchanged. Paste the S12 count's block now."
)
```

**EXPECT:** the carries line (ten carries, `journal_rows_before=103`); `the post-check profile this sitting must print: 26 OK / 0 VACUOUS / 0 FAIL, and no other ...`; the post-check's table with that profile (verdict 24 `1 row, newest is 0106, when 1788502700000; control 1`, verdict 25 `104`); `journal rows before=103 after=104, 0106 present by hash`; the last three journal rows, 0106's sha256 newest; then `0106 POST-CHECK PASSED. ...`. Exit 0.

**A FAIL IN VERDICT 14 THAT IS NOT THE MIGRATION'S.** Verdict 14 wants both tables empty, because 0106 writes no row. Nothing writes them until the sweep's code merges after the apply, so a row there is a writer nobody expected: stage 2 STOPs saying the state is UNKNOWN, and the lead reads the other twenty-five verdicts.

## THE S12 COUNT: read only, information for strategy; its counts never stop the sitting

Strategy, 2026-10-14: "S12: provisional ruling = your first definition (history-based). Run s12-never-had-a-reminder-count-20261013.sql read-only in the 0106 sitting as its own block; final ruling on the counts, before arming." The file is `scripts/db/s12-never-had-a-reminder-count.sql`: a header, then the handover file byte for byte (sha256 `334e9e3a...feb00df`). It prints one row per tenant: the tenant's id and seven counts. No patient id, name, phone or email.

**WHAT IT IS NOT.** It is no verdict and no gate. Whatever numbers it prints, the sitting's result is the post-check's. **Its STOPs are of two kinds.** One line is THE HALT RULE's one exception: the count's own query ended with an error or ran past its 120 seconds after the transaction had read as READ ONLY; that STOP begins `STOP: the S12 count's block only:`, ends this block alone, and the closing read is pasted next. Every other STOP of this block (the sitting's records, the head, a pinned file, the window, the environment, the target guard's refusal, a transaction that is not read only, psql that never reached the query) is a full STOP of the halt rule: nothing is pasted after it, the closing read included. GREEN pastes the printed table into its report as it stands, for strategy. **It runs after stage 2 passed and before the closing read, and it loads the production environment itself:** each block is its own shell, so nothing a block before it set is there.

```
(
set -o pipefail
SHAS12=d8c94f0fb7833785152a4edd099289a4fd60dce20331fef7a72353759f150fb7
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
S12FILE=scripts/db/s12-never-had-a-reminder-count.sql

rm -f /tmp/0106-s12-count.out || { echo "STOP: the old S12 transcript could not be removed. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
test -f /tmp/0106-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
test -f /tmp/0106-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0106-main.sha) || { echo "STOP: stage 0's record could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0106-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0106-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "running from the recorded sha ${REC}"
shasum -a 256 -c docs/migration-apply-0106.sha256 || { echo "STOP: this document is not the approved one. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f ${S12FILE} || { echo "STOP: the S12 file is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 ${S12FILE} | cut -d' ' -f1)" = "${SHAS12}" ] || { echo "STOP: the S12 file on disk is not the reviewed one. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0106-window.ok || { echo "STOP: no run window is recorded for this sitting. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0106-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0106-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
S12OK=yes
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as s12_transaction" -f ${S12FILE} -c "rollback" 2>&1 | tee /tmp/0106-s12-count.out || S12OK=no
grep -q 'read only: on' /tmp/0106-s12-count.out || { echo "STOP: the S12 count did not reach its query inside a transaction that read as READ ONLY (psql's lines are above), or its transcript could not be written, so the counts are not reported. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${S12OK}" = yes ] || { echo "STOP: the S12 count's block only: the count's own query did not complete (an error, or longer than 120 seconds; psql's lines are above), inside a transaction that read as READ ONLY, so nothing was written. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The S12 count is information and never a STOP condition for the sitting: report this output, and paste the closing journal read next"; exit 1; }
echo "S12 COUNT PRINTED: information for strategy's final S12 ruling. NOT a verdict and NOT a STOP condition. Paste the closing journal read now."
)
```

**EXPECT:** `running from the recorded sha <sha>`; `docs/migration-apply-0106.md: OK`; the run window line; the target guard's four lines; psql's `BEGIN`, `SET`, the row `read only: on`, the S12 table (one row per tenant, the tenant's id and seven counts), `ROLLBACK`; then `S12 COUNT PRINTED: ... Paste the closing journal read now.` Exit 0. **REPORT THE TABLE AS PRINTED.**

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0106-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0106 APPLIED, then 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0106-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0106-main.sha) || { echo "STOP: stage 0's record /tmp/0106-main.sha could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0106.sha256 || { echo "STOP: this document is not the approved one. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0106-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0106-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0106-stage2.ok -newer /tmp/0106-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0106-window.ok || { echo "STOP: no run window is recorded for this sitting. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0106-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0106-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0106-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 104' /tmp/0106-journal-after.out || { echo "STOP: the journal read after the apply does not say 104. Stage 1 recorded that it applied 0106, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0106_reminder_claims[.]sql$' /tmp/0106-journal-after.out || { echo "STOP: the journal read does not list 0106 as APPLIED. Stage 1 recorded that it applied 0106, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0106-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0106-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0106 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 104, 0106 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 104`, the line `APPLIED  0106_reminder_claims.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 104, 0106 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after the S12 count's block printed its last line, or its one STOP that begins `STOP: the S12 count's block only:`; after any other STOP, never.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `13 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 13: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `26 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: STOP, the state is UNKNOWN. A VACUOUS (22 or 23, where `service_role` is not there) or an OK count that is not 26: STOP, the write stands. A psql exit that is not 0: STOP, which says when it is a contradiction (a relation that does not exist) and otherwise that it read nothing |

**The pre-check, `scripts/db/precheck-0106-reminder-claims.sql`: 13 verdicts OK, 9 CARRY rows, 3 INFO rows.** READ ONLY. It proves the session is `postgres`; that none of the ten relation names the migration creates is taken; that `appointments` and `tenants` exist with a primary key on `id`; that the three helpers the policies call exist AND that `authenticated` may execute each; that the four roles exist; that the server is Postgres 17; that every SECURITY DEFINER function is owned by `postgres`; that `authenticated` reads `appointments` and may execute every function its policies there depend on (verdict 8, for W-6); that the default privileges hand a new table to no role the migration does not revoke by name (verdict 9, for W-5); **and, since the promotion, the journal:** 0106 absent by hash with 0105 found once as the control (verdict 10), 0105 the newest row by hash at its `when` 1788502600000 (verdict 11), and 103 rows (verdict 12, the row `journal_rows_before`, which stage 2 carries). It carries nine more values for the post-check.

**The post-check, `scripts/db/postcheck-0106-reminder-claims.sql`: 26 verdicts OK (24 until the promotion).** READ ONLY. It proves both tables exist and are owned by `postgres`; the columns (17 on `reminder_claims`), the constraints (21), the foreign keys with their delete actions, and the indexes (6 and 2), each against a pinned value; RLS on and not forced; exactly one SELECT and one INSERT policy per table, to `authenticated` alone, with pinned expressions; `authenticated` holding exactly SELECT and INSERT of the eight table privileges; `anon`, `patient`, `service_role` and `PUBLIC` holding nothing; the whole grantee list of each table (verdict 21); no column grant and no trigger; both tables empty; that nothing else moved; `service_role`'s privileges read directly, per privilege and per column (verdicts 22 and 23); **and the journal:** 0106 present once by hash as the newest row at its `when` 1788502700000, with 0105 found once as the control (verdict 24), and the journal moved by exactly one from the pre-check's `journal_rows_before` (verdict 25).

**Verdicts 22 and 23 (strategy Q-4, 2026-10-14): `service_role`, read directly on the database the sitting applied to.** Production runs no seed, so the migration's own `REVOKE` is the only thing that makes W-5 true there, and the suite's proof ran on a seeded test database. Verdict 22 asks `has_table_privilege('service_role', table, p)` on both tables for SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN only where the server has it (17 and later). Verdict 23 asks `has_column_privilege` for SELECT, INSERT, UPDATE and REFERENCES on each of the 28 columns, and `has_any_column_privilege` per table. Both read **VACUOUS, never OK,** unless both tables and the role exist and the cells were read; VACUOUS is a STOP like FAIL. Expected: `0 of 16 held (none); MAINTAIN asked true; tables 2, role true` and `0 of 112 column cells held, 0 of 2 tables with any; 28 columns; tables 2, role true`. Shown failing on lane blue on 2026-10-14, each in a rolled-back transaction (see the third rehearsal). A missing TABLE cannot reach VACUOUS: verdict 14 counts the rows of both tables, so the file stops with an error first, which stage 2 reads as described above.

**The journal verdicts, read on the builder's throwaway on 2026-10-19** (not a rehearsal; see "The check files' journal verdicts, read once"): pre-check 10 `0; control 1` OK, 11 `newest is 0105, when 1788502600000` OK, 12 `103` OK on a drizzle journal of 103 rows; post-check 24 `1 row, newest is 0106, when 1788502700000; control 1` OK and 25 `104` OK on 104 rows with the carry 103, and 25 FAIL with the carry 102; both files print FAIL `no journal table (absent)` where the journal does not exist, and the post-check stops with `-v journal_rows_before is missing` (psql exit 3) without the carry.

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, nothing changed (`journal    103 -> 103  (delta 0)`).
- **After the COMMIT, the statements that remove it** are the two of "The rollback, as run" below: `DROP TABLE public.reminder_sweep_passes` and `DROP TABLE public.reminder_claims`, in one transaction after the two SET LOCAL lines. They take ACCESS EXCLUSIVE on `appointments` and `tenants` while they run (dropping a foreign key removes its triggers from the table it points at), which the apply does not.
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0106 stays: a journal row is never deleted. **GREEN never runs those statements from this document; SOLO never runs them at all; and no block here contains them.**
- **What a rollback destroys:** every row in both tables. Before the sweep's code merges there is none. After it, the claims are what the dispatcher reads to decide whether a reminder was already taken, so from then on a rollback is an owner decision and not a routine step.

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | DONE 2026-10-19 (#1617, merged 17:32 Lisbon): merge the GATE-CHANGE `ci/GATE-CHANGE-cleanup-learns-reminder-claims` (the cleanup test learns `reminder_claims`) | on green, before this pull request merges | `pnpm test:scripts` on this branch goes whole once `main` is merged in |
| 2 | On this pull request: take the label `held-for-apply` off | after the rehearsal of the blocks, the R4 round on them, SOLO's READY line, and `main` merged into the branch with CI green on that head | nothing by itself |
| 3 | On this pull request: merge | right after click 2, and never while a sitting of GREEN's is in flight | `main` is then one migration ahead of production. Nothing else merges until GREEN's report on 0106 |
| 4 | Launch GREEN and hand it SOLO's dispatch, which names `0106_reminder_claims.sql` | after SOLO has filled the dispatch (MERGED, DOCSHA, the window); in closed hours, inside its run window | the sitting: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the S12 count, the closing read |
| 5 | Read GREEN's report on 0106 | when it arrives | merges resume. If the report carries a STOP: nothing is pasted again, and the lead rules |
| 6 | Merge the skip guard's GATE-CHANGE and the cleanup test's second GATE-CHANGE (below) | after this pull request has merged | the suite's absence from CI becomes red; the cleanup test's floor is fixed at 25 |

## GATE-CHANGES

- **Before the promotion merges, ONE, the owner's (click 1):** `scripts/import/cleanup-test-patients.test.mjs` learns `reminder_claims` (`DELETE_ORDER`, the pair `["reminder_claims", "appointments"]`, `AHEAD_OF_MIGRATION` holding `reminder_claims`, and a floor that raises itself from 24 to 25 the moment a migration creates the table), with `.github/gate-manifest.json` regenerated. It is on the branch `ci/GATE-CHANGE-cleanup-learns-reminder-claims` (two commits on `main` at `88d0aa4f`). Measured on 2026-10-19: against this promoted tree that test file passes 26 of 26; `main`'s version of it reads 2 failures here (`reminder_claims is deleted from but is not in the patient dependency graph`, and `reminder_claims has an FK path to patients but the script never deletes from it`). Merged 2026-10-19 as #1617; `main` carries it and this branch passes 26 of 26 since `4c4bc929`.
- **None for the apply.** The SECURITY DEFINER count stays 36.
- **After the merge, TWO, the owner's (click 6), each its own pull request:**
  - `.github/scripts/assert-rls-executed.mjs`: the skip guard lists `reminder-claims-rls.db.test.ts` (`{ file: "reminder-claims-rls.db.test.ts", hard: true },` after the list's last entry), with the manifest regenerated. Until then the suite runs on CI but its absence would not be red.
  - `scripts/import/cleanup-test-patients.test.mjs` again: its `AHEAD_OF_MIGRATION` entry is emptied (`new Set([])`, inert once 0106 is on `main`), and the floor of "every table with an FK path to patients is covered" is fixed at 25 (the self-raising term dropped), with the manifest regenerated.
- **A fault-injection test for this document's blocks** is the new file `scripts/reminder-claims-0106.test.mjs`. Adding one trips no gate; it is frozen at the next GATE-CHANGE after it lands. No gate file is edited by this branch.

## 1. What it does

It creates two tables and nothing else. No function, no sequence, no trigger, no row, and no
change to any existing table, policy, function or grant.

- **`public.reminder_claims`**: the reminder sweep's claim store. Three kinds of row, each about
  one reminder of one appointment (appointment, offset, channel):
  - `claim`: a sender took this reminder for this start time. Its `id` is the claim id.
  - `release`: the sender of a claim gave it up. It names the claim in `claim_id`.
  - `shadow`: the sweep, while switched off, would have handed this reminder over in this pass.
- **`public.reminder_sweep_passes`**: the heartbeat. One row per tenant per pass of the sweep,
  with the counts of that pass.

The 24 statements, in order: three `SET LOCAL` lines (lock wait 5 s, statement 60 s, idle in
transaction 15 s); `CREATE TABLE reminder_claims`; four indexes (the fourth is the one claim per
attempt of Q-5); its comment; `CREATE TABLE
reminder_sweep_passes`; one index; its comment; `ENABLE ROW LEVEL SECURITY` on both; a `REVOKE
ALL` on each from `PUBLIC`, `anon`, `authenticated`, `patient` and `service_role`; a `GRANT
SELECT, INSERT` on each to `authenticated`; two `ALTER TABLE` statements that add the three
foreign keys to `appointments` and `tenants`; and four `CREATE POLICY` statements, last. The
INSERT policy of `reminder_claims` reads `public.appointments` in a sub-select.

## 2. Strategy's rulings of 2026-10-13 and 2026-10-14, and the proof of each

Every command below ran on the throwaway of the second rehearsal (see "Rehearsal"), and again on
the third, which added the rulings of 2026-10-14. "The suite" is `pnpm exec vitest run
tests/reminder-claims-rls.db.test.ts` in `packages/db`, 59 tests since 2026-10-19 (58 on
2026-10-14, 52 on 2026-10-13), each
access arm as the real principal in a transaction that is rolled back, except the concurrency
arm of Q-5, whose winner commits.

| Ruling | In the file | Proof, and its result line |
|---|---|---|
| **W-1** the writer is the userless `authenticated` session, as `0102`. Gate: a logged-in owner, admin, reception and therapist are each refused INSERT on both tables | The two INSERT policies ask for the tenant, the role `owner` or `admin`, and `auth.uid()` null | The suite, four arms "a (owner, admin, reception, therapist) with a user is REFUSED an insert on both tables": each inserts a claim, a release and a heartbeat and reads `row-level security` three times. `Tests 52 passed (52)`. Mutants: without "no user", 2 red on each table; with reception and therapist admitted, 1 red on each table |
| **W-2** the heartbeat keeps its own table | `reminder_sweep_passes` | Post-check verdict 1: `reminder_claims:r:postgres, reminder_sweep_passes:r:postgres; control true`, OK |
| **W-3** cascade with the appointment | `reminder_claims_appointment_id_fkey ... ON DELETE CASCADE` | Post-check verdict 6 (`-> appointments del c`), OK. The suite: an owner's hard delete of an appointment takes its four rows and keeps the heartbeats |
| **W-4** RLS enabled, not forced | `ENABLE ROW LEVEL SECURITY`, no `FORCE` | Post-check verdict 8: `reminder_claims on true forced false, reminder_sweep_passes on true forced false`, OK |
| **W-5** `service_role` revoked by name on both tables. Gates: the job's write path still succeeds; PUBLIC holds nothing | `service_role` is in both `REVOKE ALL` lists | See "W-5" below. Post-check verdict 11 `0 cells, 0 PUBLIC items; control 2` and verdict 21 (the whole grantee list), both OK. The suite: `service_role` is refused 10 statements with `permission denied`, and the job writes through the real tenant context and the real Drizzle tables. Mutants: `service_role` left out of either REVOKE, 4 red each |
| **W-6** the INSERT policy proves the appointment is of the row's tenant | An `EXISTS` sub-select on `appointments` in `reminder_claims_job_insert` | See "W-6" below. The suite, five arms, and since 2026-10-19 a catalogue arm pinning the policy's expression. Mutants: the `EXISTS` dropped, 3 red; its `a.tenant_id` test dropped, 1 red (the catalogue arm) |
| **W-7** no duplicate refusal while in shadow | No unique key over shadow rows or heartbeats; the Q-5 index is partial on `kind = 'claim'` | The suite: two heartbeats of one tenant for one pass id are accepted, and, as the job, the same shadow row twice and the same heartbeat twice in one transaction. **The duplicate refusal the send mode needs is now on the claim: Q-5** |
| **W-8** the number is `0106` | Promoted on 2026-10-19: `packages/db/migrations/0106_reminder_claims.sql`, journal idx 103, no byte changed | This document, the two check files' journal verdicts (pre-check 10 to 12, post-check 24 and 25), and the README's Promoted row |
| **W-9** merge first, apply from `main`. Gate: a search of `main` proves no code reads either table before the apply | Stage 0 runs the search on the commit the sitting runs from, and STOPs on any line but the three below | See "No code on `main` reads either table": 0 lines for the table names; 3 lines for the Drizzle name, all one test's local helper of the same name |
| **W-10** keep all rows until the ledger's retention is ruled; a 90 day purge of shadow rows and heartbeats as a card; a claim is never purged by age alone | No purge, no retention, and after W-5 no role but the owner can delete | Post-check verdict 21. **Carded, not built** |
| **W-11** confirmed as built: `send` in the mode list, one release per claim, `due_at` and `early` stored | Unchanged | Post-check verdicts 4 and 5 (the constraints, pinned), OK |
| **Q-5 (2026-10-14)** the TABLE refuses a duplicate claim for the same attempt, not only the sending code | The stored column `attempt`, two CHECKs, and the partial unique index `reminder_claims_claim_attempt_key` | See "Q-5" below. The suite, as the job: same attempt `23505`, the next attempt and a retry after a release accepted, shadow rows and heartbeats not refused, six concurrent sessions with one winner. Mutation sweep: 8 of 9 killed, the ninth equivalent |
| **Q-4 (2026-10-14)** the post-check reads `service_role`'s grants on both tables directly | Post-check verdicts 22 and 23 | See "What every verdict must read". 24 OK on lane blue; each shown FAIL in a rolled-back transaction; VACUOUS shown on a scratch copy |
| **S12 (2026-10-14)** the read-only count runs in the sitting as its own block, for the final S12 ruling | `scripts/db/s12-never-had-a-reminder-count.sql` and "THE S12 COUNT" block, between stage 2 and the closing read | Its earlier form was rehearsed on lane blue on 2026-10-14, in bash and zsh, with two halts shown; its form of 2026-10-19 (it loads the environment and asserts the target itself) ran in the fourth rehearsal on 2026-10-20: it printed the count, ended that block alone when its query ran past 120 seconds, and stopped the sitting on the guard's refusal. Its counts are never a STOP condition |

## 3. The design, in brief

**The shape.**

`reminder_claims` (17 columns):

| Column | Carried by | Meaning |
|---|---|---|
| `id` | all | the row; for a claim, the claim id |
| `tenant_id` | all | NOT NULL |
| `appointment_id` | all | NOT NULL; the rows go with the appointment's hard delete |
| `kind` | all | `claim`, `release` or `shadow` |
| `offset_id` | all | `48h`, `24h`; text, not a closed list |
| `channel` | all | `sms` or `email` |
| `starts_at` | claim, shadow | the start the reminder was for |
| `due_at` | claim, shadow | the start minus the offset. Always on a shadow row; NULL on a claim for an offset the application did not know |
| `taker` | claim | `run` (the sleeping job) or `sweep` |
| `early` | claim | taken more than the early margin before `due_at`; NULL exactly when `due_at` is |
| `attempt` | claim | which try of this reminder for this start, from 1; required on a claim, NULL on every other row; one claim per attempt (Q-5) |
| `claim_id` | release | the claim it gives up; one release per claim |
| `claim_kind` | release | written by the database, never by the application: `claim` on a release, NULL on every other row |
| `minutes_after_mark` | shadow | minutes between `due_at` and the pass; may be negative |
| `saved_after_mark` | shadow | the visit was saved after `due_at` |
| `pass_id` | any | the scheduler's id for the pass, when there is one |
| `created_at` | all | when the row was written |

`reminder_sweep_passes` (11 columns): `id`, `tenant_id`, `pass_id`, `mode` (`shadow` or `send`),
`pass_at` (the pass's own clock), `look_ahead_before` (the last pass of the day only),
`due_count`, `recorded_count`, `over_ceiling`, `excluded_count` (visits left out because they
never had a reminder), `created_at`.

**What the rulings settled.** Two tables (W-2). The writer is the session with a tenant and no
user (W-1). The rows of an appointment go with it (W-3). RLS enabled, not forced (W-4).
`service_role` holds nothing (W-5). `send` is in the mode list, one release per claim, and
`due_at` and `early` are stored (W-11).

**Still the lane's judgments, none of them questioned so far.**

1. **The shadow row is a kind of `reminder_claims`, not a third table.** It has the claim's key
   (appointment, offset, channel, start), and the sweep's "have I taken this reminder" read asks
   for its own shadow rows and its own claims together.
2. **The INSERT policies also ask for the role `owner` or `admin`,** the ledger's own narrowing
   (`0075`). The job is `admin`. A session with no user and the role `reception` or `therapist`
   is refused on both tables (tested); nothing makes one.
3. **Readers are `owner`, `admin` and `reception`, not `therapist`:** the ledger's readers, and
   the roles that hold `reminders:log_read` in the application.
4. **Append only is by grants and by policies, not by a trigger.** A trigger that refuses every
   DELETE would refuse the appointment's cascade too.
5. **`offset_id` is free text,** because the offsets live in the application.

**A release names a claim of the same reminder, and the table now proves it.** The first draft
tied a release to a row of the same tenant and the same appointment and nothing more; its
reviewer showed a release naming another release, with another offset and channel, accepted.
The key now has six columns: the release's tenant, appointment, offset, channel, `claim_kind`
and `claim_id` must be the tenant, appointment, offset, channel, kind and id of one existing
row. `claim_kind` is a generated column that reads `claim` on a release, so the row named is of
kind `claim`. Cost: one more column, written by the database, and a wider unique key. It was
cheap and it is proven (the suite refuses a release with another offset, another channel, and a
release that names a shadow row or another release; three mutants, each killed). The code on
the local sweep branch already writes a release with its claim's offset and channel
(`releaseReminderClaim`), so nothing there changes; it never sends `claim_kind`.

**What is NOT enforced by the table, said plainly.**

- **That at most one claim of a reminder is live.** The dispatcher's advisory lock does that.
  What the table does refuse, since Q-5, is two claims of the same ATTEMPT: two takers that both
  read "the next attempt is 3" cannot both store it. That the number a writer stores is really
  one more than the highest stored is the writer's to compute, under the lock; the table only
  refuses the collision.
- **That a claim's appointment is of its tenant, FOR A WRITER THAT BYPASSES ROW LEVEL
  SECURITY.** W-6 puts the test in the INSERT policy, so it binds every session the application
  can make. The table's owner is not bound by a policy, and no key ties the two columns:
  `appointments` has no unique key over `(tenant_id, id)` for a foreign key to point at, and
  this file changes no existing table. After W-5 the owner is the only such writer.

## W-5: `service_role` holds nothing

The platform's default privileges hand `service_role` every table privilege at `CREATE TABLE`,
and it bypasses row level security, so the first draft left it able to rewrite or remove any
row (its reviewer changed a row as `service_role` to show it). The file now revokes it by name.
These are the first tables in the schema where it holds nothing.

**Gate 1, the reminder job's write path still succeeds after the revoke.** The job never runs
as `service_role`: `withReminderTenantContext` calls `withTenantContext`, which sets the role
`authenticated` (`apps/web/lib/reminders/context.ts:25-33`, `packages/db/src/client.ts:146-158`).
The suite's arm "THE JOB'S WRITE PATH STILL SUCCEEDS" calls that same `withTenantContext` with
the job's claims, reads inside the transaction that `service_role` holds no privilege on either
table, and then inserts a claim, a release, a shadow row and a heartbeat through the Drizzle
tables `reminderClaims` and `reminderSweepPasses`. Result: passed, in `Tests 52 passed (52)`.

**Gate 2, PUBLIC holds no privilege on either table.** Post-check verdict 11: `0 cells, 0 PUBLIC
items; control 2`. Verdict 21 reads every entry of both ACLs: `reminder_claims authenticated
[INSERT,SELECT]; reminder_claims postgres [all eight]; reminder_sweep_passes authenticated
[INSERT,SELECT]; reminder_sweep_passes postgres [all eight]`, and nobody else. The suite has
the same two reads.

**The whole grantee list is pinned, not a list of named roles.** A role nobody named that the
defaults hand a grant to would have passed the first draft's post-check. Two things close it:
the pre-check's verdict 9 reads the default privileges BEFORE the apply and fails if they name
a role the migration does not revoke, and the post-check's verdict 21 pins the list after.
Both were shown a real failure on the throwaway, in transactions that were rolled back: with a
default grant to another role, verdict 9 read `supabase_auth_admin; control true`, FAIL; with a
grant to `service_role` on one table and to another role on the other, verdicts 11 and 21 read
FAIL.

**THE SEED WOULD HAVE HANDED IT BACK, ON EVERY LOCAL AND CI DATABASE.** `supabase/seed.sql`
grants `service_role` SELECT, INSERT, UPDATE and DELETE on ALL tables in `public`, and it runs
after every migration on each `supabase db reset`. Production runs no seed. So after the
promotion, CI and every lane would have read a state production does not have, and the suite
that proves the revoke would have been red there. Measured on the throwaway: with `main`'s
seed run after the migration, `service_role` held `DELETE,INSERT,SELECT,UPDATE` on
`reminder_claims` and the suite read `Tests 4 failed | 48 passed (52)`; with this branch's
seed, 0 privileges and `Tests 52 passed (52)`. The seed now ends with a guarded block that
revokes `service_role` on the two tables where they exist, and does nothing where they do not.
`supabase/seed.sql` is not a gate file.

**What this costs.** Nothing reads or writes the tables as `service_role` today (no code reads
them at all). A later job that wants to purge old rows cannot run as `service_role`: it needs
a function of its own or an owner-run statement. That is the purge card's to decide (W-10).

## W-6: a claim's appointment is of the row's tenant

The first draft held the row's tenant to the session's and the appointment to an existing one,
and nothing tied the two: the job of one tenant could write a row with its own tenant that named
another tenant's appointment, and an id that did not exist was refused by the foreign key, so
the insert answered whether an appointment id existed anywhere. The INSERT policy of
`reminder_claims` now also asks:

```sql
EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.id = reminder_claims.appointment_id
     AND a.tenant_id = reminder_claims.tenant_id
)
```

**Proven both ways, as the real principal** (the suite, as `authenticated` with the job's
claims):

| Arm | Result |
|---|---|
| The job inserts a claim, a release and a shadow row for its own tenant's appointment, a cancelled appointment included | accepted |
| The job inserts a row with its own tenant that names another tenant's appointment, of each kind | `row-level security`, three times |
| The job inserts a row that names an appointment id that does not exist | the same error text as for another tenant's appointment: the insert no longer says whether an id exists |
| The other tenant's job claims its own appointment, and then this tenant's | accepted, then `row-level security` |

**What it rests on: the sub-select runs under the row level security of `appointments`, as the
job's session.** A policy's sub-select runs as the caller. The job's session (a tenant, the role
`admin`, no user) reads every appointment of its tenant through the admin arm of
`appointments_rls` (`0086`): with no user it has no location assignment, so no location
narrowing applies. Proven: the suite's arm "the job's session SEES the appointments it must
claim" reads, as the job, the three appointments of its tenant (two scheduled, one cancelled)
and not the other tenant's; and the other tenant's job reads its own one. The pre-check's
verdict 8 reads, before any apply, that `authenticated` holds SELECT on `appointments` and may
execute every function a policy on `appointments` that applies to it depends on (read from
`pg_depend`, not from a list): `true; 0 refused of at least 3; control true`. With one of those
functions revoked in a rolled-back transaction it read `1 refused`, FAIL.

**What it costs.**

- **A coupling.** A later migration that narrows what an admin session with no user reads in
  `appointments` narrows what the job can claim, without touching this table. On the open path
  (`takeReminderClaim`) the claim fails open: the reminder still goes, the claim is not recorded
  and an error is logged. On SWEEP-47's closed path (`takeReminderClaimClosed`) the refusal
  throws `ReminderClaimStoreError` and the reminder is NOT sent, so such a narrowing would
  silently stop the sweep's sends (corrected 2026-10-19; this line used to say nothing a patient
  receives changes). The suite's "SEES" arm is the tripwire: it goes red in CI on the pull
  request that makes such a change.
- **Time.** One lookup in `appointments` for each row inserted into `reminder_claims`. Measured
  on the throwaway as the job, with `EXPLAIN (ANALYZE)`: with 20,000 appointments in the tenant
  and the statistics fresh, an index scan on `appointments_pkey`, `Execution Time: 0.309 ms`
  for the whole insert (planning 0.397 ms). The first insert of a cold session on a table of two
  rows read 4.2 ms, of which 2 ms was the first call of the location helper. A heartbeat insert,
  which has no sub-select, read 0.37 ms. At about one claim per reminder this is nothing.
- **Not measured on production's data,** and never under load.

**The `a.tenant_id` test repeats what the `appointments` policies already hold, on purpose.**
Under those policies the job cannot see another tenant's appointment at all, so with the test
removed every arm that inserts still passes. It is the part that does not depend on another
table's policies. **Since 2026-10-19 (the review's finding b) the suite reads it anyway:** the
catalogue arm "THE CLAIMS INSERT POLICY'S WITH CHECK is the pinned expression" compares
`md5(pg_get_expr(polwithcheck))` of `reminder_claims_job_insert` with
`3db6b5cccdd94267bf0633f2323ec17a`, the value the post-check's verdict 9 pins, so that mutant goes
red on CI (measured: `1 failed | 58 passed (59)`, the arm alone; see "Mutation sweeps"). It is a
pin, so it fails on any edit of that expression, which is what is wanted of it; it is Postgres
17's printing of the expression, as the post-check's is. Shown on its own on the throwaway: with
row level security on `appointments` switched off inside one rolled-back transaction, the job
of tenant A sees tenant B's appointment (control: 1 row), and its row naming it is still
`REFUSED: new row violates row-level security policy for table "reminder_claims"`; with the
test removed from the policy, the same row is `ACCEPTED`. That probe is not a standing test,
because switching a policy off takes a lock on `appointments` that a shared test database
cannot afford.

**The heartbeat is unchanged.** It names no appointment.

## Q-5: the table refuses a second claim of the same attempt (strategy, 2026-10-14)

Strategy's words: "Q-5 yes, add the attempt number column and the unique index to the 0106 draft
now." Before this, the sending code refused a duplicate in code only: a lock, then a read, then
its own row. A release was already its own row, and one release per claim already a unique
index.

**What was added.**

```sql
attempt            integer,
CONSTRAINT reminder_claims_attempt_matches_kind CHECK ((attempt IS NOT NULL) = (kind = 'claim')),
CONSTRAINT reminder_claims_attempt_positive CHECK (attempt IS NULL OR attempt >= 1),
CREATE UNIQUE INDEX reminder_claims_claim_attempt_key
  ON public.reminder_claims (appointment_id, offset_id, channel, starts_at, attempt)
  WHERE kind = 'claim';
```

**Each choice, and why.**

| Choice | Why |
|---|---|
| STORED, not derived | A number the database derived at insert (a count of earlier claims, a sequence) could only collide if it saw the racing row, which an uncommitted row is not. A stored number written by the taker is what two takers can both choose, and what the index can refuse |
| NO DEFAULT | A default of 1 would let a writer that never learnt of the column write attempt 1 every time, and a default is one value for every kind while a shadow row and a release must carry none |
| NOT NULL on a claim, NULL on every other row, by an equivalence CHECK, not a column NOT NULL | Two of the three kinds carry no attempt. The equivalence (the ledger's rule, `0075`) refuses a claim without one with `23514`, rather than storing a NULL that the unique index would never compare |
| At least 1, no upper bound | How many tries a reminder gets is the sending code's rule |
| PARTIAL on `kind = 'claim'` | Row kinds share the table. W-7: shadow rows and heartbeats are not refused. (Shadow rows and releases hold NULL, which a unique index never compares, so the predicate refuses nothing more; it keeps the index to the claims and says so. Mutant 2 below.) |
| Key `(appointment_id, offset_id, channel, starts_at, attempt)` | The reminder (appointment, offset, channel) for one START: a visit moved to another time earns a reminder of its own, from attempt 1. No `tenant_id`: an appointment is of one tenant (W-6), so the key is already narrower |
| A retry after a release is not refused | A release frees no number. The retry takes the next one, and two takers of that next one are refused. Shown both ways below |
| One number across both takers and early claims | The sleeping job (`run`) and the sweep (`sweep`) claiming the same attempt is exactly the duplicate. An early claim holds its number like any other |

**How a writer computes it.** Under the reminder's advisory lock it already takes
(`acquireReminderClaimLock`, keyed on tenant, appointment, offset and channel), before the
insert: one more than the highest `attempt` stored for this appointment, offset, channel and
start among rows of kind `claim`, any taker, early or not, released or not; 1 when there is none.
The lock makes the read and the insert one step for every writer that takes it; the index
refuses the collision for one that does not.

**Proven as the real principal** (the suite's "Q-5" arms, as `authenticated` with the job's
claims; on lane blue, `Tests 58 passed (58)`):

| Arm | Result |
|---|---|
| The same attempt twice; the same attempt by `run` and by `sweep`; an early claim and a claim of the same attempt | each `{ code: "23505", constraint: "reminder_claims_claim_attempt_key" }` |
| Attempts 1, 2, 3 | accepted |
| Claim 1, its release, then attempt 2 | accepted |
| Claim 1, its release, then attempt 1 again | `23505`: the release does not free the number |
| Attempt 1 again for another start, another channel, another offset, another appointment | accepted |
| As the job, the same shadow row twice, a claim beside it, and the same heartbeat twice | accepted (W-7) |
| Six sessions released together by an advisory-lock barrier, each the job inserting attempt 1 of one reminder and committing (three `run`, three `sweep`) | exactly 1 fulfilled, 5 rejected `23505 reminder_claims_claim_attempt_key`, 1 row stored |
| On the owner connection: a claim with no attempt; attempt 0; attempt -1; a release or a shadow row with an attempt | `attempt_matches_kind`, `attempt_positive`, `attempt_positive`, `attempt_matches_kind` twice |

**EVERY WRITER OF THIS TABLE ON THE TWO SWEEP BRANCHES, and what Q-5 asks of each.** Read on
2026-10-14 from the worktrees, not edited. The line numbers below are that day's.

**CORRECTED 2026-10-19: BOTH BRANCHES NOW SET THE ATTEMPT NUMBER.** The tables below are the
2026-10-14 survey of what had to change, kept as the record. Since 2026-10-15 both branches carry
this branch merged in (`d62027ee`, a merge, no rebase), and every claim writer sets `attempt` to
one more than the highest attempt of that reminder's claims for the same start, read inside the
claim's transaction after its lock (`nextReminderClaimAttempt` in
`apps/web/lib/reminders/reminder-claim.ts`, called from `takeReminderClaim` and, on SWEEP-47, from `takeReminderClaimClosed`). The release and shadow
writers set none, as the CHECK requires; the heartbeats write `reminder_sweep_passes`, which has no
attempt column. The test fixtures that insert a claim set a distinct number per claim, except the
arms that provoke the collision on purpose. Heads checked on 2026-10-19:
`reminders/SWEEP-13-on-table` `13d496e4`,
`reminders/SWEEP-47-sweep-sends` `83d48e7b`. Both branches are local; none of it is on `main`.

`reminders/SWEEP-13-on-table` (`914417fe`):

| Writer | Kind | Must set `attempt`? |
|---|---|---|
| `apps/web/lib/reminders/reminder-claim.ts:379` `takeReminderClaim` | claim | **YES.** Inside the transaction, after `acquireReminderClaimLock` and `claimIsHeld`, read the highest attempt for (appointment, offset, channel, start) of kind claim and store one more |
| `apps/web/lib/reminders/reminder-claim.ts:428` `releaseReminderClaim` | release | no (must stay NULL) |
| `apps/web/lib/reminders/sweep.ts:477` `sweepTenantInShadow` | shadow | no (must stay NULL) |
| `apps/web/lib/reminders/sweep.ts:484` the heartbeat | `reminder_sweep_passes` | no column |
| test fixtures that insert a claim: `reminder-claim.db.test.ts:275`, `reminder-log.db.test.ts:799`, `sweep.db.test.ts:205` (all under `apps/web/lib/reminders/`) | claim | **YES**, a distinct number per claim of one reminder and start |
| test fixtures that insert a shadow row or a release: `reminder-claim.db.test.ts:287` and `:295`, `reminder-log.db.test.ts:793`, `sweep.db.test.ts:179` and `:213` | shadow, release | no |

`reminders/SWEEP-47-sweep-sends` (`7910b586`):

| Writer | Kind | Must set `attempt`? |
|---|---|---|
| `apps/web/lib/reminders/reminder-claim.ts:396` `takeReminderClaim` | claim | **YES**, as above |
| `apps/web/lib/reminders/reminder-claim.ts:445` `releaseReminderClaim` | release | no |
| `apps/web/lib/reminders/reminder-claim.ts:589` `takeReminderClaimClosed` | claim | **YES.** After `claimIsLive`: the highest attempt of ALL claims of this start, early ones included (`claimIsLive` ignores early claims for "held", but they hold their numbers) |
| `apps/web/lib/reminders/sweep.ts:477` | shadow | no |
| `apps/web/lib/reminders/sweep.ts:484`, `apps/web/lib/reminders/sweep-send.ts:607` | heartbeats | no column |
| test fixtures that insert a claim: `reminder-claim-closed.db.test.ts:194`, `reminder-claim.db.test.ts:275`, `reminder-log.db.test.ts:799`, `sweep-send.db.test.ts:192`, `sweep.db.test.ts:205` | claim | **YES** |
| test fixtures that insert a shadow row, a release or a heartbeat: `reminder-claim-closed.db.test.ts:203` and `:387`, `reminder-claim.db.test.ts:287` and `:295`, `reminder-log.db.test.ts:793`, `sweep-send.db.test.ts:197`, `:211` and `:536`, `sweep.db.test.ts:179` and `:213` | other | no |

**The `23505` from this index, RULED AND BUILT (strategy Q-A (a), 2026-10-15; corrected
2026-10-19).** Until then `takeReminderClaim` caught every failure and answered "not held, no
claim id", so the open path would have sent a duplicate the table refused. Now, on both branches,
the open path (`takeReminderClaim`) answers HELD on a `23505` naming
`reminder_claims_claim_attempt_key`: nothing is sent, the outcome is `claim_held_by_duplicate`,
and one log line carries only the reason, the offset and the channel. No ledger row is written,
the same as an ordinary held claim. On SWEEP-47 the closed path (`takeReminderClaimClosed`)
answers the same, and the sending pass counts it apart (`heldByDuplicate`); any other error there
still throws `ReminderClaimStoreError` and sends nothing. SWEEP-13 has no closed path and no
sending pass (its sweep is shadow only).

## No code on `main` reads either table (W-9)

Run on 2026-10-13 against `origin/main` at `5d4e8091` (the commit that has `0103`).

The tables' SQL names, the whole tree:

```text
$ git grep -n -I -i -E 'reminder_claims|reminder_sweep_passes|reminder_claim|sweep_passes' origin/main -- .
$ echo $?
1
```

No line. The control, the ledger, with the same command shape:

```text
$ git grep -I -i -E 'reminder_dispatches|reminderDispatches' origin/main -- . | wc -l
219
```

The Drizzle names the application would import:

```text
$ git grep -n -I -E 'reminderClaims|reminderSweepPasses' origin/main -- .
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:89:const reminderClaims = (tenantId: string): string =>
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:236:    const rows = await asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:247:      asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
```

Three lines, one file, and not the table: a local function of that test that builds the
reminder job's JWT claims as a string. It imports nothing from the schema under that name.

**At the sitting the tables' own pull request is on `main`, so the search leaves its files
out.** On this promoted branch the names appear in this document, the numbered migration, its
mirror, the journal, the pending README, `packages/db/src/schema.ts` (the declaration), the
suite, the two check files, `supabase/seed.sql`, the cleanup script, this document's script test
(`scripts/reminder-claims-0106.test.mjs`) and the unrelated test above; the cleanup test's
GATE-CHANGE adds its test file. **Stage 0 runs the search itself, on the commit the sitting runs
from,** in the worktree it has just checked out and found clean, with git's `:(exclude)`
spelling (a block carries no `!`):

```text
git grep -n -I -E 'reminder_claims|reminder_sweep_passes|reminderClaims|reminderSweepPasses' -- apps packages scripts supabase ':(exclude)packages/db/migrations' ':(exclude)packages/db/migrations-pending' ':(exclude)supabase/migrations' ':(exclude)packages/db/src/schema.ts' ':(exclude)packages/db/tests/reminder-claims-rls.db.test.ts' ':(exclude)scripts/db/precheck-0106-reminder-claims.sql' ':(exclude)scripts/db/postcheck-0106-reminder-claims.sql' ':(exclude)supabase/seed.sql' ':(exclude)scripts/import/cleanup-test-patients.sql' ':(exclude)scripts/import/cleanup-test-patients.test.mjs' ':(exclude)scripts/reminder-claims-0106.test.mjs'
```

Exactly the three lines of `reschedule-requests-rls.db.test.ts` above, and nothing else: stage 0
STOPs on any line outside that file and on any count but three. Run on this branch's head on
2026-10-19 it printed exactly those three (lines 89, 236 and 247). Any other line is a reader
that merged before the apply. `git grep -E` has no `\s` and no `\b`; the pattern uses neither.

**One excluded file deletes from the table: `scripts/import/cleanup-test-patients.sql`.** It is an
owner-run script, not code that runs in production. If the owner ran it on production between
the merge and the apply, its `delete from reminder_claims` would end it with `relation
"reminder_claims" does not exist`, and its one transaction would roll back, so nothing would be
deleted. **The owner does not run it in that window;** after the apply it runs as before.

## The locks, measured on the throwaway (2026-10-13, PostgreSQL 17.6)

Read from `pg_locks` for the applying session, at the end of the file, inside a transaction that
was then rolled back. Measured again for the revision of 2026-10-13; the strongest lock on each
table is unchanged from the first draft. **Not measured again for the revision of 2026-10-14:**
its one new statement is a `CREATE UNIQUE INDEX` on the new table, created empty in the same
transaction, which names no existing table; the numbers below are shifted by one for it.

| Part of the file | Locks on relations that existed before |
|---|---|
| Statements 1 to 18 (the `SET LOCAL` lines, both tables, the indexes, the comments, RLS, the revokes and grants) | **none, in any mode** (measured on the first draft; these statements name no existing table in this revision either) |
| Statements 19 and 20 (the foreign keys) | SHARE ROW EXCLUSIVE on `public.appointments` and `public.tenants`: writes to them wait, reads do not |
| Statements 21 to 24 (the policies) | ACCESS EXCLUSIVE on 23 platform tables: 16 in `auth` (`users`, `sessions`, `refresh_tokens`, `identities` and the rest), 5 in `storage`, 2 in `realtime`. The claims INSERT policy also takes ACCESS SHARE on `public.appointments`, weaker than the lock statement 19 already holds |

All are held until the COMMIT. `lock_timeout` read `5s`, `statement_timeout` `1min` and
`idle_in_transaction_session_timeout` `15s` inside the transaction. Both new tables are empty,
so each foreign key is validated at once. **Production's `supautils.policy_grants` setting has
not been read,** so the list of platform tables there is not established; `0102` took the same
kind of lock in its sitting.

**The rollback takes a stronger lock than the apply:** ACCESS EXCLUSIVE on `public.appointments`
and `public.tenants` (dropping a foreign key removes its triggers from the table it points at),
so reads of both wait while it runs. Measured on the first draft's throwaway.

## The order of pull requests

Strategy ruled the kind (W-9): the pull request merges first, and GREEN applies from `main`, as
`0100` and `0101` did. Nothing on `main` reads the tables before the apply, and the migration
creates no function, so no required check counts anything it changes.

Measured on the first draft, 2026-10-13, by promoting in place, running `pnpm test:scripts`,
and undoing all of it: `check-journal` reconciled its files with its entries, and **1 script
test failed**, the cleanup test below. **Measured again on the real promotion, 2026-10-19:**
`check-journal` reads 104 of 104, and `scripts/import/cleanup-test-patients.test.mjs` reads 2
failures of 26 (`reminder_claims is deleted from but is not in the patient dependency graph`,
now that the cleanup script deletes from it, and `reminder_claims has an FK path to patients but
the script never deletes from it`); the GATE-CHANGE's version of that file passes 26 of 26 here.

| # | Pull request | Kind | When |
|---|---|---|---|
| 1 | DONE 2026-10-19 (#1617, merged 17:32 Lisbon): the cleanup test learns `reminder_claims` (branch `ci/GATE-CHANGE-cleanup-learns-reminder-claims`) | GATE-CHANGE, the owner merges | before the promotion merges |
| 2 | The promotion, with `scripts/import/cleanup-test-patients.sql` gaining its delete, this document with its blocks, the check files, the suite, the schema entry and the seed's guarded revoke | Tier C, `held-for-apply` until the owner takes the label off and merges | after 1, and after `0105` is on `main` |
| 3 | GREEN applies from `main` | the sitting | after 2 has merged |
| 4 | The skip guard lists the suite; the cleanup test's `AHEAD_OF_MIGRATION` emptied and its floor fixed at 25 | GATE-CHANGEs, the owner merges | after 2 has merged |
| 5 | The sweep's steps, on the tables | Tier B | after the apply |

**The gate files a GATE-CHANGE must touch, with the lines as they stand on `main` at
`5d4e8091`.** None is edited on this branch.

- **`scripts/import/cleanup-test-patients.test.mjs`** (pull request 1):
  - line 47, inside `DELETE_ORDER` (it opens at line 30): add `"reminder_claims",` on a new line
    before `"appointments",`;
  - line 244, `const AHEAD_OF_MIGRATION = new Set([]);`: becomes
    `new Set(["reminder_claims"])` while the table's migration is not on `main`, and is emptied
    again by the next GATE-CHANGE after the merge;
  - line 314, `assert.ok(reached.size >= 24, ...)`: as built on the GATE-CHANGE branch, a floor
    that raises itself to 25 the moment a migration creates `reminder_claims` (a fixed 25 would
    redden `main` before the promotion lands), fixed at 25 by the GATE-CHANGE after the merge;
  - the ordered pairs that end at line 351: add `["reminder_claims", "appointments"]`.
  Why: its test "every table with an FK path to patients is covered" fails on the promoted
  tree with `reminder_claims has an FK path to patients but the script never deletes from it`.
  `reminder_sweep_passes` points at `tenants` only and is not on that path.
- **`.github/scripts/assert-rls-executed.mjs`** (pull request 4): after line 295, the list's last
  entry (`{ file: "survey-page.db.test.ts", hard: true },`), add
  `{ file: "reminder-claims-rls.db.test.ts", hard: true },` with its comment. Until then the
  suite runs on CI but its absence would not be red.
- **`.github/gate-manifest.json`**, in each of the two GATE-CHANGE pull requests: line 82 (the
  hash of the cleanup test) and line 28 (the hash of the skip guard), regenerated by
  `scripts/gate-manifest.mjs`, never by hand.

- **An observation, not part of this change.** The ledger, `reminder_dispatches`, also points
  at `appointments`, and the cleanup has never listed it: its `REFERENCES` clause sits on its
  own line in `0075`, a form the test's reader does not match. Its delete cascades, so the
  cleanup has not failed for it. Whether the cleanup should count those rows is the lead's.
- **No count GATE-CHANGE.** The migration creates no function. The SECURITY DEFINER count read
  36 before and 36 after.
- **The fault-injection test for this document's blocks** is the new file
  `scripts/reminder-claims-0106.test.mjs`. Adding one trips no gate; it is frozen at the next
  GATE-CHANGE after it lands.

## The proof per role

`packages/db/tests/reminder-claims-rls.db.test.ts`, 59 tests (58 until 2026-10-19, 52 until 2026-10-14), DB-gated.
Every arm about access runs as the real principal, in a transaction that is rolled back (the
concurrency arm of Q-5 commits its one winner, which `afterAll` removes), and is shown both ways.

| Who | Allowed, shown to succeed | Refused, shown to fail |
|---|---|---|
| The reminder job (`authenticated`, a tenant, `admin`, no user) | inserts a claim with RETURNING and reads it back; inserts a release, a shadow row and a heartbeat; reads its tenant's rows; reads its tenant's appointments | a row naming another tenant (`row-level security`); a row with its own tenant naming another tenant's appointment, or one that does not exist (`row-level security`); any insert with no tenant in the session; any insert with the role `reception` or `therapist`, on both tables; every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: owner, admin, reception (with a user) | read the tenant's claims and heartbeats | every insert, on both tables (`row-level security`); every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: therapist | nothing | reads zero rows; inserts, updates, deletes refused as above |
| Another tenant's admin | reads its own rows | sees none of this tenant's |
| `service_role` | nothing (control: it still reads the ledger) | every read, insert, update, delete and truncate on both tables (`permission denied`) |
| A patient session | nothing | read and insert (`permission denied`) |
| `anon` | nothing | read and insert (`permission denied`) |

Also proven: with UPDATE and DELETE granted to `authenticated` for the length of one rolled-back
transaction, the job and the tenant's owner still reach zero rows, while the same sessions see
three (the policies refuse apart from the grants); an owner's hard delete of an appointment
takes that appointment's claim, release and shadow rows with it and leaves the heartbeats; a
tenant with a heartbeat cannot be deleted from under it; each CHECK, each foreign key and the
one-release-per-claim index, by the constraint's own name; a value written into `claim_kind`
is refused; and the five Q-5 arms of "Q-5" above, as the job. Every claim an arm does not number
itself takes a fresh attempt number (from 1000), so the Q-5 index answers only where it is asked.

**The suite on a database without the tables read 58 skipped, exit 0** (lane blue, after the
rollback, 2026-10-14): that was its answer on CI until the promotion. **From the promotion commit
on (2026-10-19) it throws instead of skipping,** and it throws on a database that holds one
table of the two. On a database built from this promoted branch it read `Tests 59 passed (59)`
(see "The check files' journal verdicts, read once").

The catalogue arm added on 2026-10-19 (the review's finding b) reads, as the owner, that the
claims INSERT policy's WITH CHECK hashes to `3db6b5cccdd94267bf0633f2323ec17a`, the post-check's
verdict 9 value; it is the standing test of the sub-select's `a.tenant_id` (see "W-6").

## Mutation sweeps

**The third sweep, 2026-10-14, once, over the clauses Q-5 added,** on lane blue the same way:
each rule weakened in a copy, the tables dropped, the copy applied, the suite run; the real file
applied again at the end (exit 0), and the suite on it read 58 passed.

| # | Weakened | Tests that went red | Killed by |
|---|---|---|---|
| 1 | the index `reminder_claims_claim_attempt_key` dropped | 3 | "REFUSES a second claim of the same attempt", "ACCEPTS the next attempt, and a retry after a RELEASE", "SEVERAL SESSIONS AT ONCE" |
| 2 | the index without its predicate `WHERE kind = 'claim'` | **0, EQUIVALENT** | a shadow row and a release carry a NULL attempt (the CHECK), and a unique index never compares NULLs, so the full index refuses exactly the rows the partial one does. Kept partial: it names the rows it is about and indexes no other |
| 3 | the key without `starts_at` | 1 | "ACCEPTS attempt 1 again for another START, ..." |
| 4 | the key without `channel` | 1 | the same arm |
| 5 | the key without `offset_id` | 1 | the same arm |
| 6 | the key without `attempt` (one claim per reminder and start) | 9 | the Q-5 arms, 7b, and every arm that claims one reminder twice |
| 7 | `reminder_claims_attempt_matches_kind` dropped | 1 | "REFUSES a claim with no attempt number or one below 1, and an attempt on a release or a shadow row" |
| 8 | `reminder_claims_attempt_positive` dropped | 1 | the same arm |
| 9 | the key without `appointment_id` | 1 | "ACCEPTS attempt 1 again for ... another APPOINTMENT" |

Eight of nine killed; the ninth is equivalent, said above.

**The second sweep, 2026-10-13, once, over the clauses this revision added.** Each rule was
weakened in a copy of the file, the tables dropped, the copy applied and the suite run; the
real file was applied again at the end and read 52 passed.

| # | Weakened | Tests that went red | Killed by |
|---|---|---|---|
| 1 | W-5: `service_role` left out of the REVOKE on `reminder_claims` | 4 | "service_role is REFUSED every read, insert, update, delete and truncate", "THE JOB'S WRITE PATH STILL SUCCEEDS", the two catalogue arms |
| 2 | W-5: `service_role` left out of the REVOKE on `reminder_sweep_passes` | 4 | the same four |

*Note added 2026-10-19 (review):* mutants 1 and 2 were measured on a stack where the platform's
default privileges applied and no seed ran after the migration. On CI the tables get no default
privileges and the seed's blanket grant, then its guarded revoke, decide what `service_role` holds,
so the CI suite cannot tell the migration's REVOKE from the seed's. On production the migration's
REVOKE is what counts, and post-check verdicts 22 and 23 read it directly (Q-4).

| # | Weakened | Tests that went red | Killed by |
|---|---|---|---|
| 3 | W-6: the tenant tie (the whole `EXISTS`) dropped | 3 | "REFUSED a row with its OWN tenant that names ANOTHER tenant's appointment", "REFUSED an appointment that does not exist by the SAME error", "the other tenant's job ... REFUSED this tenant's" |
| 4 | W-6: the `EXISTS` kept, its `a.tenant_id` test dropped | **0 IN THE SUITE AS IT WAS; 1 SINCE 2026-10-19** | the one-off probe in "W-6" above: with this mutant the row is `ACCEPTED`, with the real file `REFUSED`. Under the `appointments` policies no arm that inserts can tell them apart. **The review's finding b:** the catalogue arm "THE CLAIMS INSERT POLICY'S WITH CHECK is the pinned expression" now reads it red, measured 2026-10-19 on the builder's throwaway: the policy dropped and recreated without the line, `md5` `884472a3f1a0474f1d75b6cb8d81efbe`, `Tests 1 failed | 58 passed (59)`; the real policy recreated, `3db6b5cc...3ec17a`, `Tests 59 passed (59)`. A pin, so it is killed by construction rather than by behaviour |
| 5 | W-1: the claims INSERT policy also admits `reception` and `therapist` | 1 | "REFUSED when a session with no user carries the role reception or therapist" |
| 6 | W-1: the heartbeat INSERT policy also admits them | 1 | the same arm (this is the mutant that survived the first draft's review; the arm now inserts into both tables) |
| 7 | W-1: the claims INSERT policy without "no user" | 2 | "a owner with a user is REFUSED", "a admin with a user is REFUSED" |
| 8 | W-1: the heartbeat INSERT policy without "no user" | 2 | the same two |
| 9 | the release key without the offset | 1 | "REFUSES a release whose offset or channel is not its claim's" |
| 10 | the release key without the channel | 1 | the same arm |
| 11 | the release key without the kind | 1 | "REFUSES a release that names a SHADOW row or ANOTHER RELEASE" |

Ten of eleven killed by a behaviour test on 2026-10-13; the eleventh, equivalent to every arm
that inserts, is told apart by the probe, and since 2026-10-19 by the catalogue pin.

**The first sweep, on the first draft** (nine rules: the claims INSERT policy without "no
user"; UPDATE and DELETE granted on `reminder_claims`; the claims SELECT policy without the
role list; the heartbeat SELECT policy without the tenant; SELECT on the heartbeats granted to
`anon`; the appointment foreign key without CASCADE; the heartbeat INSERT policy without the
tenant; the one-release-per-claim index dropped; TRUNCATE granted on the heartbeats): nine of
nine went red. Not run again.

## Rehearsal

**The fourth rehearsal, first below, ran this document's blocks.** The first three are not
sitting rehearsals: they ran before the blocks were written. What ran each time is the migration
itself, the two check files, the suite and the rollback; the third also ran the S12 block as it
stood then.

### The fourth rehearsal, 2026-10-19 and 2026-10-20: the blocks, by an agent that did not write them

**No BLOCKER and no MAJOR.** Every block that can run on a throwaway did what this document says;
the two dispatch blocks stopped at their PENDING lines, and the closing read stopped at the reader
line the rehearsal does not run, both as expected.

**The bytes.** The document at `8fa7af89` (sha256 `f5c58bf0c719cea50ef5e56f9711fa2c473283d77f449f02a030e28141aa2e4e`)
and at `f68aa79e` (sha256 `d973c681ef7552e225341f2452e3fa04e0eb6bf7a59b769aef595f415ecaa01d`), each
matching its sidecar. The document as it stands now was not run as a whole: every fenced block in
it is byte for byte that of `f68aa79e` (compared by machine on 2026-10-20), and only its prose has
changed since.

**The throwaway and the method (0105's).** A local Supabase stack of its own (`r0106`, PostgreSQL
17.6), built from `main`'s migrations `0000` to `0105` and `main`'s seed; a drizzle journal of 103
rows built by hand (each `hash` its file's sha256, each `created_at` its `when`); two active clinics,
08:00 to 21:00. Each block was cut from the document by machine and run in a fresh `zsh -f` with a
cleared environment (`exec -c`), in GREEN's shape. Substituted: the `cd` into the apply worktree went
to a scratch clone whose origin is a local bare repository with `main` at the rehearsed commit, and
`/tmp/0106-*` went to a scratch folder. Not run: the lines that load the production environment
file, the target guard's lines and the reader's lines (see "NOT REHEARSED"). The guard and the
reader each ran once on their own against the throwaway and refused it, exit 2
(`REFUSING: project ref is "postgres", not the production project.`, and the reader's `REFUSED:`
line), which is their purpose.

| Block | 8fa7af89 (Mon 2026-10-19, 21:59 Lisbon) | f68aa79e (Tue 2026-10-20, 21:01) |
|---|---|---|
| BEFORE YOU START | NOT REHEARSED: `STOP: MERGED is not a filled-in sha, so this block is NOT READY ...` | NOT REHEARSED: the same STOP; its new applied-marker age lines come after it and never ran |
| Stage 0 | REHEARSED-OK: exit 0, W-9 three lines, check-journal 104 of 104. At 15:01 it stopped on the clock (`... inside clinic hours ...`); at 23:31 it passed (closed hours), and the CLOCK CHECK's clock lines, run by hand, stopped at "outside strategy's start windows" | Byte-identical; run again to make the sitting's records |
| CLOCK CHECK | NOT REHEARSED: `STOP: the document's sha256 in this block is still PENDING ...` | NOT REHEARSED: the same STOP |
| Stage 1 | REHEARSED-OK: pre-check 13 OK / 0 VACUOUS / 0 FAIL (9 CARRY, 3 INFO); clinics `0 of 2`, inside; `journal    103 -> 104  (delta 1)`; `0106 APPLIED. Paste stage 2 now.` | Byte-identical; pre-check 13 OK again after the rollback |
| Stage 2 | REHEARSED-OK: post-check 26 OK / 0 VACUOUS / 0 FAIL; `0106 POST-CHECK PASSED` | Byte-identical |
| The S12 count | REHEARSED-OK (its form before the R4 fixes): `read only: on`, `(0 rows)` | REHEARSED-OK: `read only: on`, `(0 rows)`, `S12 COUNT PRINTED` |
| The closing read | REHEARSED-STOPPED at the reader line not run: `STOP: the journal read after the apply does not say 104 ...` | The same |

**Repeats and negatives.**

- **A second paste:** stage 1, then stage 0, each stopped with `STOP: stage 1 has ALREADY APPLIED 0106 in this sitting ...`, exit 1. Nothing more was applied.
- **A fresh sitting on a database that already holds 0106** (no applied marker; Tue 21:01): stage 0 exit 0; stage 1's pre-check read 9 OK / 4 FAIL (verdicts 2, 10, 11 and `journal_rows_before` 104), then `STOP: the pre-check printed [4] FAIL verdicts ...`. Nothing was applied; the journal stayed at 104.
- **The S12 count's query failing (a):** another session held an ACCESS EXCLUSIVE lock on `appointments`, a database condition, not an edit. The block printed `read only: on`, then `ERROR: canceling statement due to statement timeout` after 120 seconds, then the one STOP that ends that block alone, ending `... report this output, and paste the closing journal read next`.
- **The S12 count's guard refusing (b):** only the environment-file line was left out, so the real guard ran. It printed `REFUSING: project ref is "postgres"`, then the full halt: `STOP: the target guard refused or failed ... the S12 count's block and the closing read (READ ONLY) run again only on the owner's or the lead's word`.

**By hand, outside the blocks.** The post-check before the apply: psql exit 3, `relation
"public.reminder_claims" does not exist`, as "What every verdict must read" says. verified-migrate:
exit 0, and run a second time exit 3, `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`.
The rollback in "Rollback": the pre-check then read 10 OK / 3 FAIL, the three journal verdicts,
because the journal row stays; with that row removed, every verdict and carry matched the first run.

**Counts.** Pre-check 13 OK / 0 VACUOUS / 0 FAIL. Post-check 26 OK / 0 VACUOUS / 0 FAIL in all six of its outputs
(after the hand apply, after each block apply, after each suite run). `reminder-claims-rls` 59 of 59
three times on record (a fourth run printed nothing: its script passed the wrong argument); the whole `packages/db` suite 1690 of 1690 (104 files).

**Cleanup.** The stack was stopped with `--no-backup`; no container or volume of it is left, and no
other stack was touched. No real `/tmp/0106-*` file existed before the rehearsal or after it.

**Its two findings, both MINOR,** answered on 2026-10-20 in this revision: the status line, NOT
READY step 5 and the first item of "NOT REHEARSED" still said no block had run; and "NOT
REHEARSED" lacked the dispatch blocks whole, the environment, guard and reader lines and the
hand-written window record, while stage 1's EXPECT lacked verified-migrate's two NOTICE lines.

### The check files' journal verdicts, read once, 2026-10-19 (the builder, not a rehearsal)

**The throwaway.** A local Supabase stack of its own, project id `t0106b`, in a scratch folder
outside the repository, every port moved to the 57000s (database 57022), started without
realtime, storage, imgproxy, studio, edge-runtime, logflare, vector, supavisor and mailpit;
Supabase CLI 2.100.0, PostgreSQL 17.6. `supabase db reset` built it from this promoted branch's
`supabase/migrations` (`0000` to `0106`, so **0104 and 0105 under it**) and ran `supabase/seed.sql`
with the tables present. Stopped with `supabase stop --no-backup` at the end; no other stack was
touched. Nothing below ran a block.

| Step | Result |
|---|---|
| The suite | `Tests 59 passed (59)`, with the seed's guarded revoke run by `supabase db reset` with the tables present |
| Mutant 4, the claims INSERT policy recreated without `a.tenant_id` | `Tests 1 failed | 58 passed (59)`: the new catalogue arm only; the real policy recreated, 59 passed |
| The pre-check on the applied database, no drizzle journal | exit 0; verdict 2 FAIL (`10; control 4`, the tables exist), verdicts 10 to 12 FAIL `no journal table (absent)`, every other verdict OK, **verdict 8 OK on top of 0104 and 0105** (`true; 0 refused of at least 3; control true`) |
| A drizzle journal of 103 rows built from the journal's entries (each `hash` its file's sha256, each `created_at` its `when`), then the pre-check | verdict 10 `0; control 1` OK, 11 `newest is 0105, when 1788502600000` OK, 12 `103` OK |
| 0106's row added (104 rows), then the post-check with `journal_rows_before=103` and the other carries made up | verdicts 24 `1 row, newest is 0106, when 1788502700000; control 1` OK and 25 OK; 22 OK in all, the four FAIL being 17 to 20, whose md5 carries were made up |
| The same with `journal_rows_before=102` | verdict 25 FAIL (`104`, wanted `103`) |
| The post-check without `-v journal_rows_before` | psql exit 3, `STOP: -v journal_rows_before is missing. This file refuses to guess.` |

### The script test, 2026-10-19 (stubs, not a database)

`scripts/reminder-claims-0106.test.mjs`, 46 tests, all passing on this branch's head. Its two
sweeps run the seven blocks in GREEN's tool shape, under `bash --noprofile --norc` with errexit
forced off and under `zsh -f`, every external program a stub: **401 faults in each shell**
(BEFORE YOU START 90, stage 0 56, CLOCK CHECK 52, stage 1 79, stage 2 59, the S12 count 31, the
closing read 34), each external call made to fail in turn, plus a missing worktree, a missing
env file, a record path that is a directory, verified-migrate's other exits, and every clock and
window read answering empty. Every fault halts the block with a STOP line and no pass line,
except, by design, 19 faults on the 16 network-time calls of each dispatch block (a source that
fails is NOT READ while another is read, and a disagreement STOPs), each call named by its program
and its arguments, never by its place, and 3 calls of R9's proof 1 in stages 0 and 1 (printed,
deciding nothing). Since the R4 review of 2026-10-19 the S12 arm proves that only the count's own
query, failing after the transaction read as READ ONLY, ends that block alone, and that the
guard's refusal, a transaction that is not read only, psql that never reached the query and a
missing pass mark or applied marker are full STOPs; and the applied-marker arm runs the two
dispatch blocks at 719 and 780 minutes. The other arms run each block whole on inputs no fault gives: the
dispatch blocks unfilled and half filled, the start windows at nine instants and another night,
network time with each source down or off by 42 seconds, the W-9 search with a reader added, a
line short and none, the S12 count not read only, failed and without stage 2's pass mark, the
weekday table at the six ruled minutes, the clinics' rows, the verdict profiles, a zone that did
not load, records that read empty or short, reads that contradict the marker, the window feed,
the applied marker's age, every pinned file changed and removed (70 cases), the journal wrong in
one fact, a second file under a number, a dirty worktree, a checkout that did not move, and the
real `date` at fixed instants.

### The third rehearsal, 2026-10-14, on lane blue, on the bytes of Q-5, Q-4 and S12

**The throwaway.** Lane blue (`node scripts/lane-stack.mjs up --lane blue`, database
`127.0.0.1:54622`), started from this worktree, so built from this branch's
`supabase/migrations` (`0000` to `0103`) and `supabase/seed.sql` (its guarded block ran with
the tables absent), then the lane's e2e seed. `up` exited 0. PostgreSQL 17.6. Stopped at the
end (`down`, then `status` read `NOT RUNNING`). The run began 14:10 Lisbon (WEST).

| Step | Result |
|---|---|
| The pre-check | exit 0; 10 OK, 9 CARRY, 3 INFO (`tables_before` 51, `secdef_before` 36) |
| The apply, `psql -1` | exit 0; 3 SET, 2 CREATE TABLE, 5 CREATE INDEX, 2 COMMENT, 4 ALTER TABLE, 2 REVOKE, 2 GRANT, 4 CREATE POLICY |
| The apply, a second time | exit 3, `ERROR:  relation "reminder_claims" already exists` |
| The post-check with the old pins | 21 OK and 3 FAIL, exactly verdicts 2, 4 and 7 (the columns, constraints and indexes Q-5 changed); 22 and 23 OK. The new values were read from the catalogue (`attempt integer`, the two CHECKs, the index definition) and pinned |
| The post-check with the new pins | exit 0; **24 OK** |
| 22 and 23 shown failing, four rolled-back grants to `service_role` | see "What every verdict must read" |
| VACUOUS shown | a scratch copy naming a missing role: 22 and 23 VACUOUS |
| The suite | exit 0; `Tests 58 passed (58)` |
| The mutation sweep | "Mutation sweeps", the third; then the real file again and 58 passed |
| The post-check after the suite | exit 0; 24 OK (the suite left both tables empty) |
| The S12 block, extracted by machine | bash and `zsh -f`: exit 0, `read only: on`, `(0 rows)` (the lane's upcoming visits all have a history), the closing line. Halts: the variable unset, exit 1; a closed port, exit 1, each with its STOP line. **That run pinned the file's earlier header** (sha256 `08978423...e5dac5`, which said "eight counts"; there are seven). The header was corrected after the lane was stopped and the pin moved to `72762c75...2846d2`; with the new pin the block was run again in bash and `zsh -f` against a closed port, and passed its hash step to reach psql (exit 1 at the connection, its STOP line). The query below the marker is byte for byte the same in both, sha256 `334e9e3a...feb00df` |
| The S12 count's control | in a rolled-back transaction, two upcoming visits with no history added under seed tenant A (one in 5 days, `confirmed`; one in 30 days, `scheduled`): the file read `2`, `0`, `0`, `0`, `1`, `1`, `0` |
| The rollback block | exit 0; 2 DROP TABLE, committed |
| The pre-check again | exit 0; 10 OK; the verdicts and the nine carries identical to the first |
| The suite on the rolled-back database | exit 0; 58 skipped |

**A zsh run that read the user's shell profile.** The S12 block was first run with `zsh -c`,
which reads the user's own zsh start-up file; that run's psql went to a local socket and
failed, and the profile was not read by this lane. Every zsh run recorded above is `zsh -f`
(no start-up files). The connection went nowhere but the local machine.

### The second rehearsal, 2026-10-13, on this revision's bytes

**The throwaway.** A local Supabase stack of its own, project id `t0106`, in a scratch folder
outside the repository, never lane blue, purple or amber. Supabase CLI 2.100.0, PostgreSQL 17.6.
Ports, each checked free first: database 56102, API 56101, shadow 56100. Started without
realtime, imgproxy, edge-runtime, logflare, vector, studio, postgres-meta, supavisor and
mailpit. Built by `supabase start` from this branch's `supabase/migrations` after `main` was
merged in, which is `origin/main`'s at `5d4e8091`: 101 migrations, `0000` to `0103`, then this
branch's `supabase/seed.sql` (its guarded block ran with the tables absent and did nothing).

**The run, from 18:08 Lisbon (WEST).**

| Step | Command (connection flags left out) | Result |
|---|---|---|
| The pre-check | `psql -c "begin read only" -f scripts/db/precheck-0106-reminder-claims.sql -c "rollback"` | exit 0; 10 OK, 0 FAIL, 9 CARRY, 3 INFO |
| Locks, the whole file | the file in a rolled-back transaction, then `pg_locks` | exit 0; the table above; 0 of the two tables left after the rollback |
| The apply | `psql -1 -f packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` | exit 0; 3 SET, 2 CREATE TABLE, 4 CREATE INDEX, 2 COMMENT, 4 ALTER TABLE, 2 REVOKE, 2 GRANT, 4 CREATE POLICY |
| The apply, a second time | the same command | **a clear refusal, not a no-op:** exit 3, `ERROR:  relation "reminder_claims" already exists`, at the first CREATE TABLE; the transaction rolled back |
| The post-check | the same form, with the nine carries of the pre-check | exit 0; 22 OK, 0 FAIL |
| The suite | `pnpm exec vitest run tests/reminder-claims-rls.db.test.ts` in `packages/db`, `DATABASE_URL` at the throwaway | exit 0; 1 file, 52 passed |
| The cost and the tenant test on its own | the two probes of "W-6", each in a rolled-back transaction | exit 0; the figures and the two lines quoted there |
| The whole `packages/db` suite, first run | `pnpm exec vitest run` in `packages/db`, the same way | **exit 1: 102 of 103 files, 1613 of 1614 tests.** One test of `tests/migration-batch-import.test.ts` timed out at 20 s, with the machine's load average at 22 (other lanes were running) |
| That file alone | `pnpm exec vitest run tests/migration-batch-import.test.ts` | exit 0; 4 passed, 1.9 s |
| The whole `packages/db` suite, second run | as the first | exit 0; 103 files, 1614 passed, none skipped |
| The seed after the migration, `main`'s | `psql -f` of `origin/main`'s `supabase/seed.sql`, then the suite | `service_role` holds `DELETE,INSERT,SELECT,UPDATE`; the suite exit 1, 4 failed, 48 passed |
| The seed after the migration, this branch's | `psql -f supabase/seed.sql`, then the suite | 0 privileges; the suite exit 0, 52 passed |
| The mutation sweep | "Mutation sweeps" above | 10 of 11 red; the real file again, 52 passed |
| The checks shown a real failure | "W-5" and "W-6" above, in rolled-back transactions | post-check verdicts 11 and 21 FAIL; pre-check verdicts 8 and 9 FAIL |
| The rollback | the block below, with one heartbeat row in the table | exit 0; 2 DROP TABLE, committed |
| The pre-check again | as the first | exit 0; 10 OK; **the nine carries are identical to the ones read before the apply** |
| The suite on the rolled-back database | as above | exit 0; 52 skipped |
| The whole `packages/db` suite on the rolled-back database | as above | exit 0; 102 files passed and 1 skipped; 1562 passed, 52 skipped. This is what CI reads until the promotion |

So no existing `packages/db` suite needs the new tables named in it. The timed-out test is in a
file that never touches these tables, passed alone and passed in the second whole run; it is
recorded as it happened, not explained away.

**The seed's guarded block was run through the Supabase CLI only with the tables absent** (at
`supabase start`). With the tables present it was run with `psql -f`, not through the CLI.

### The first rehearsal, 2026-10-13, on the first draft (sha256 `a78b2c9d...`)

On a throwaway of the same kind, project id `r0106`, at `main`'s position of that morning
(`0102`): pre-check 8 OK; apply exit 0; second apply exit 3, the same clear refusal; post-check
21 OK; the suite 41 passed; the whole `packages/db` suite 103 files, 1601 passed; the rollback
exit 0 with rows in the tables and with them empty; the nine carries identical before the apply
and after the rollback. Its reviewer repeated the apply, the second apply, both checks, the
suite and the rollback on a throwaway of its own.

**What that rehearsal found.** The very first draft of the file (sha256 `ca451e27...`) had one
more clause in each INSERT policy: that `public.jwt_patient_id()` is null, copied from `0102`'s
doors. `authenticated` holds no EXECUTE on that function (only `patient` does), and a policy
runs as the caller. On the throwaway the job's first insert ended the server process (signal
11; the local image is known to do that where a healthy server answers `permission denied for
function`), and the stack recovered by itself. Either way no insert by the job could have
succeeded. The clause was removed: it was redundant, because the policies are TO
`authenticated` and a patient session's role is `patient`, which holds nothing on either table.
The pre-check has read since then, before any apply, that `authenticated` may execute each
helper the policies call. The catalogue could not see that defect; the suite that inserts as
the job did. **The same class of risk is why verdict 8 exists for W-6:** the new sub-select
makes the job's insert depend on the functions the `appointments` policies call.

### The rollback, as run

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP TABLE public.reminder_sweep_passes;
DROP TABLE public.reminder_claims;
COMMIT;
```

It removes the tables with their indexes, constraints and policies, and **every row in them.**
After the sweep has run in production a rollback destroys the claims, which the dispatcher
reads to decide whether a reminder was already taken, so from then on it is an owner decision
and not a routine step. It takes ACCESS EXCLUSIVE on `appointments` and `tenants` while it runs.
It does not touch the journal: a sitting document would have to say what happens to the
journal row, and this draft does not.

### NOT REHEARSED, said one by one

Added on 2026-10-20, by the fourth rehearsal:

- **BEFORE YOU START and the CLOCK CHECK, whole.** A copy from this document STOPs at its first
  check on a PENDING value (MERGED, DOCSHA, the run window), as it must, so no line after those
  checks ran on the throwaway, the applied-marker age lines added after the R4 round among them.
  Those lines are proven by `scripts/reminder-claims-0106.test.mjs` only. The dispatch's filled
  copies run for the first time at the sitting.
- **In every block: the line that loads the production environment file, the target guard's
  lines and the reader's lines.** The guard and the reader refuse any target but production, so
  the rehearsal left them out (its substitution diffs are kept with its evidence). Each ran once
  on its own against the throwaway and refused it, exit 2. The closing read therefore stopped at
  the reader's line, not on anything this document says.
- **The run window record that stage 1 reads (`/tmp/0106-window.ok`)** was written by hand, by
  running the CLOCK CHECK's own clock lines on the real clock, because the CLOCK CHECK stops at
  its PENDING lines.
- **The apply worktree and `/tmp`.** The `cd` went to a scratch clone whose origin is a local bare
  repository, and the `/tmp/0106-*` files to a scratch folder.

Added on 2026-10-19:

- **EVERY BLOCK OF THIS DOCUMENT.** *Superseded 2026-10-20:* the fourth rehearsal ran stage 0,
  stage 1, stage 2, the S12 count's block and the closing read against a throwaway; what it
  could not run is the list above. All seven blocks are also proven by
  `scripts/reminder-claims-0106.test.mjs`: every block in GREEN's tool shape, in bash and in zsh,
  against stubs, each external call made to fail in turn.
- **The network-time lines and the start-window lines of BEFORE YOU START and the CLOCK CHECK**
  use BSD `date -j` (macOS, where GREEN runs). In the script test they run against a stub, on
  Linux as on macOS; they are 0105's dispatch's lines, unchanged.
- **The S12 count's block in its form of 2026-10-19.** *Ran 2026-10-20* in the fourth rehearsal,
  but for its environment-file line and, in its pass, its guard's lines: the count, the block-only
  STOP and the guard's full halt are each shown there.
- **The journal verdicts on a journal that drizzle wrote.** *Partly answered 2026-10-20:* in the
  fourth rehearsal 0106's row, the 104th, was written by `verified-migrate.mjs` (drizzle-kit
  migrate), and the post-check's verdicts 24 and 25 read OK on it. The 103 rows under it were
  built by hand, as on the builder's throwaway.

Added on 2026-10-14:

- **The sending code on the attempt number.** *Superseded 2026-10-19:* both sweep branches now
  set `attempt` (see the corrected paragraph under "EVERY WRITER OF THIS TABLE"), and their
  DB-gated suites ran against this revision on 2026-10-15 (SWEEP-13 lib/reminders 1471 of 1471,
  SWEEP-47 1797 of 1797, on a local database with this migration applied). The line as written
  on 2026-10-14 said neither branch set it and every claim would be refused (`23514`).
- **The S12 count on production's data,** which is its point; and the S12 block with its
  final pin against a live database (see the third rehearsal).
- **Verdicts 22 and 23 on a server other than Postgres 17.** The MAINTAIN guard was read only on
  17.6, where the word is asked; the older-server arm is by construction, not run.
- **The lock table for the revision of 2026-10-14** (its one new statement names no existing
  table).

Carried from 2026-10-13:

- **Any block.** *Superseded 2026-10-19:* the blocks are written; see the first list above.
- **The real applier.** *Answered 2026-10-20:* stage 1 ran `verified-migrate.mjs` (drizzle-kit
  migrate) in the fourth rehearsal, and stage 0 ran check-journal; the production reader refuses a
  throwaway and is NOT REHEARSED (above). As written on 2026-10-13: the file was applied with
  `psql -1`, one transaction. `drizzle-kit migrate` through `verified-migrate.mjs` was not run, and
  neither journal reader. Under the
  Supabase CLI each file runs in its own implicit transaction; that path ran the 101 migrations
  under this one and not this one.
- **On top of `0104` and `0105`.** *Answered 2026-10-19:* the builder's throwaway was built
  from `0000` to `0106`, so with both under it; the suite's "SEES" arm passed (59 of 59) and the
  pre-check's verdict 8 read OK there. Neither touches `appointments`' policies (open question
  3, closed).
- **The promotion's commit.** *Done 2026-10-19:* see "The promotion, as done on 2026-10-19".
  The cleanup script's new delete was read by its test, not run against a database.
- **The seed's guarded block through `supabase db reset` with the tables present.** *Ran
  2026-10-19* on the builder's throwaway: the suite, whose arms read that `service_role` holds
  nothing, passed 59 of 59 after it.
- **Production's values.** Not read by this lane, ever: the default privileges (verdict 9 reads
  them at the sitting, before the apply), the helpers' grants, the `supautils.policy_grants`
  list, the row counts behind the two locks, and what an admin session with no user reads in
  production's `appointments`.
- **The locks under load.** Measured with no other session. No lock wait, no deadlock.
- **The application on these tables, on this revision's bytes.** The sweep's local branch was
  built and tested on the first draft's tables. It never sends `claim_kind`, and its release
  carries its claim's offset and channel, so the lane expects no change; its DB-gated suites
  were not run again.
- **The DB-gated suites of `apps/web`** were not run on the applied throwaway; no application
  file changed.

## What this does NOT do, and what is out of scope

- It does not move the sweep's code onto the tables.
- It does not send, and cannot.
- It builds no late rule, no purge, no retention and no watch.
- It builds no duplicate refusal for shadow rows or heartbeats (W-7). The one the send mode
  needs, on the claim, is built: Q-5.
- It does not compute the attempt number: the writer does, under its lock.
- It does not change `audit_log`, the ledger, `appointments`, or any existing policy, function
  or grant.

## The op carries no DELETE and no TRUNCATE statement

The migration has none. The rollback block above drops two tables this file created.

## Open questions

Strategy's rulings of 2026-10-13 closed the nine questions of the first draft. What is open now:

0. **CLOSED 2026-10-15: the open claim and a `23505`.** Strategy ruled (a): a `23505` naming
   `reminder_claims_claim_attempt_key` is held, nothing is sent, and it is recorded as
   held-by-duplicate. Built on both sweep branches; see the corrected paragraph under "EVERY
   WRITER OF THIS TABLE".

1. **A release tied to its claim's kind, offset and channel, by a generated column (strategy,
   to confirm).** Built, because the brief asked for it if cheap and provable, and it was both.
   It adds a column that only the database writes (the seventeenth, since Q-5 added `attempt`). (a) As built. (b) Offset and
   channel only, no generated column: a release could then name a shadow row or another
   release, and the reader would go on checking the kind itself. Recommend (a).
2. **The seed's guarded revoke (the lead, to confirm).** Without it the suite that proves W-5
   is red on CI and on every lane from the promotion on. (a) As built: a guarded block at the
   end of `supabase/seed.sql`. (b) Narrow the seed's blanket grant to leave the two tables out.
   (c) Drop the blanket grant and grant `service_role` table by table in a migration, which the
   seed's own comment names as the durable path; a larger change with its own sitting.
   Recommend (a) now.
3. **CLOSED 2026-10-19: neither `0104` nor `0105` touches `appointments`' policies.** `0104`
   changed only `clinical_episodes`' policies and its DELETE grant; `0105` added a unique index
   on `clinical_episodes` and a foreign key on `clinical_records`, and replaced `merge_patients`
   (whose body still updates `appointments` as `0005`'s did). Both are on `main` (journal: `0104`
   idx 101, `0105` idx 102, 103 entries) and applied by GREEN on 2026-10-15 (`0104` 00:40 to
   00:45 Lisbon, `0105` 21:30 to 21:32), whose post-checks read every other policy unchanged by
   hash (`0104` verdict 7, `0105` verdict 9, both OK in GREEN's reports).

4. **ACCEPTED BY STRATEGY 2026-10-18 (Q-I): the attempt key has no tenant column.**
   `reminder_claims_claim_attempt_key` is unique on the reminder's appointment, offset, channel,
   start and attempt, with no `tenant_id`. A claim row of one tenant naming another tenant's
   appointment would take that reminder's attempt number and hold it for good. The job's INSERT
   policy makes such a row impossible for every role that row security binds (W-6: a row's
   appointment must belong to the row's tenant, checked against `appointments`), so only a role
   that bypasses row security (the table's owner, a superuser) could write it. Strategy accepted
   this as is; nothing in the migration changes for it.

## Review history

**The first draft (sha256 `a78b2c9d...`): one fresh reviewer, PASS, no blocker and no major,
five minor findings.** What became of each in this revision:

| Finding | Now |
|---|---|
| A surviving mutant: the heartbeat INSERT policy without its role list passed the suite, because the arm for a userless `reception` or `therapist` inserted into `reminder_claims` only | The arm inserts into both tables. Mutant 6 of the second sweep is that mutant: 1 red |
| The post-check did not pin the whole grantee list of the two tables | Verdict 21, and the pre-check's verdict 9 before the apply. Both shown a real failure |
| A release was tied to its claim by tenant and appointment only | The six-column key and `claim_kind`. Three mutants, each killed |
| `service_role` kept UPDATE, DELETE and TRUNCATE and bypasses RLS | Ruled W-5 and revoked |
| The job of one tenant could name another tenant's appointment, and the insert said whether an id exists | Ruled W-6 and closed |
| Stale wording (the file and this document called ruled points judgments, and the number provisional) | Rewritten here, in the file's header, in the schema's comment and in the README row |

**The revisions of 2026-10-13 and 2026-10-14 (Q-5, Q-4, S12): one fresh reviewer, PASS on
2026-10-19, three MINOR findings,** each answered on 2026-10-19:

| Finding | Now |
|---|---|
| (a) The S12 file's printed Run line did not carry the 120 second `statement_timeout` its block sets | The Run line carries it. The query below the marker is byte for byte the handover file still (`334e9e3a...feb00df`); the file's sha256 moved from `72762c75...2846d2` to `d8c94f0fb7833785152a4edd099289a4fd60dce20331fef7a72353759f150fb7`, and every pin in this document moved with it |
| (b) Mutant 4 (the claims INSERT policy without `a.tenant_id`) survived the suite, so CI could not see it | The suite's catalogue arm pins `md5(pg_get_expr(polwithcheck))` of `reminder_claims_job_insert` to the post-check's verdict 9 value; with the mutant applied it reads `1 failed | 58 passed (59)` |
| (c) The header, the NOT READY list and the status lines were stale | Rewritten to the state of 2026-10-19 |

**The blocks of 2026-10-19, the check files' journal verdicts and the script test: one R4 round,
2026-10-19, one MAJOR and four MINOR findings,** each answered the same day:

| Finding | Now |
|---|---|
| MAJOR: every STOP of the S12 block sent GREEN on to the closing read, against THE HALT RULE; strategy's "never a STOP condition" is about the count's values | Only the count's own query failing after the transaction read as READ ONLY ends that block alone. The exception is written into the halt rule's own text. Every other S12 STOP (the guard's refusal, not read only, no pass mark, no applied marker, and the rest) is a full STOP worded as every other block's |
| MINOR: the banner check looks like a gate | A sentence under BEFORE YOU START says it catches only a mark ending in `-PENDING`, and DOCSHA is the gate. No code changed |
| MINOR: BEFORE YOU START stopped on an applied marker of any age, stages 0 and 1 only on one under 12 hours | Both dispatch blocks read it with stage 0's 720-minute rule (the CLOCK CHECK had the same line and got the same fix) |
| MINOR: the script test exempted network-time calls by position | They are named by program and arguments (`NETWORK_CALLS`), and the test proves the named set is exactly the 16 calls between the first `sntp` and the Lisbon clock read |
| MINOR: the W-9 search leaves out the cleanup script, which now deletes from `reminder_claims` | A paragraph under "No code on `main` reads either table": run on production between the merge and the apply it ends with `relation does not exist` and rolls back; the owner does not run it in that window |

The fixes change the bytes of three blocks (BEFORE YOU START, the CLOCK CHECK, the S12 count's
block). Stage 0, stage 1, stage 2 and the closing read are unchanged by them. No pinned file changed.
**A re-review of the fixes, 2026-10-19: READY, two MINOR wording findings,** answered in `8df52cee`
with no block byte changed: the halt rule's exception now names "that line and its non-zero exit",
and the S12 heading says that its counts, not its STOPs, never stop the sitting.

**The fourth rehearsal, 2026-10-20: no BLOCKER and no MAJOR, two MINOR findings,** answered in this
revision (see the end of "The fourth rehearsal"). No block byte changed.

**The R4 round on that record, 2026-10-20: NOT READY, four MINOR findings,** each answered the same
night with no block byte changed: stage 0 at 23:31 passed (the start-window STOP came from the
CLOCK CHECK's clock lines run by hand); the post-check read 26 OK in six outputs and the suite 59 of
59 in three; the header and the status line overstated what ran (five blocks, and the closing read
only to its reader line); and three places still showed #1617 as pending.

## JUDGMENTS, NOT RULINGS, in this document (2026-10-19)

- **The two dispatch blocks read the applied marker as stages 0 and 1 do** (revised after the R4 review): a marker under 12 hours old stops them, an older one does not. 0105's dispatch stopped on a marker of any age, which a file left from an earlier night would turn into a block on every sitting.
- **The two dispatch blocks stand in this document, with their five value lines reading `PENDING`.** For 0103 to 0105 they lived only in GREEN's dispatch. Here they are written, reviewed and fault-tested with the stage blocks, and the dispatch carries them with five lines filled and no other change; a copy pasted from here STOPs at its first check. They are 0105's dispatch's blocks with the number, the files, the pins and the journal count changed, and with an explicit halt added to every `$( ... )` that hashes a file at the merge commit (0105's compared the result only).
- **One STOP of the S12 count's block ends that block alone (revised after the R4 review of 2026-10-19).** Strategy's "never a STOP condition" is about the count's values, so only the line on the count's own query (psql ended with an error or ran past 120 seconds after the transaction had read as READ ONLY) ends the block alone and lets GREEN go on to the closing read. The exception is written into THE HALT RULE's own text, so the dispatch carries it word for word. Every other STOP of that block, the target guard's refusal, a transaction that is not read only and a missing pass mark or applied marker among them, is a full STOP of the halt rule, worded as every other block's. The first draft let every S12 STOP send GREEN on; the review found that it contradicted the halt rule.
- **The S12 block loads the production environment and runs the target guard itself.** The draft of 2026-10-14 expected `DATABASE_URL_DIRECT` "already set by the sitting's env step", but each block is its own shell, so it would always have stopped there. It also now runs from the recorded sha, after stage 2's pass mark, before the window's end, with the S12 file, the guard and its module pinned. Its transcript is teed to `/tmp/0106-s12-count.out` (it was redirected to a `.txt` file and printed after).
- **The W-9 search is in stage 0,** which reads no database, so a reader that reached `main` stops the sitting before the clock is even read. It STOPs on any line outside the one test's helper and on any count but three; a later edit of that test that moves its lines does not STOP it, an added line does.
- **The check files do not end with an error on a FAIL verdict,** unlike 0104's and 0105's. They were reviewed that way, and the blocks count OK, VACUOUS and FAIL themselves. So stage 2's STOP on the post-check's own run speaks of a run that did not complete, and names the case where that is a contradiction (a relation that does not exist).
- **The pre-check pins 0105's hash and `when` as literals** rather than taking them from the block with `-v` as 0105's did: the file is pinned by its own sha256, so a literal is as fixed, and the block hands the file nothing it could get wrong.
- **R9's three proof lines are still printed,** proof 2 reading `no` and decide nothing: the arm passes in closed hours only, whatever they read.
