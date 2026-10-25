# 0107: apply the record_annulments INSERT policy

**NOT READY. Nothing in this document may be pasted yet.** The migration is promoted to its number after 0106, and this document carries its six blocks, proven by their fault-injection test. Open, in order: SOLO's READY line; the pull request, opened held; `main` merged in with CI green; the owner's two clicks; and GREEN's dispatch, which carries the values this document cannot hold (the merge commit's sha as MERGED, this document's sha256 as DOCSHA, and the run window as WOPEN, WSTART and WEND). Until the pull request is merged every block below STOPs at its first check, because this document is not on `origin/main`. **The sitting is closed hours only** (this migration alters a policy; see "Closed hours, and the locks").

**Status: AUTHORED 2026-10-12; REVIEWED (a fresh reviewer PASSED the draft aligned with strategy's ruling of 2026-10-13, option b); REHEARSED WITH LIMITS 2026-10-13 on a throwaway (the migration, both check files, the suites and going back; see "The first rehearsal"); PROMOTED 2026-10-25 (`packages/db/migrations/0107_record_annulments_insert_policy.sql`, journal idx 104); BLOCKS WRITTEN 2026-10-25 AND PROVEN BY THEIR FAULT-INJECTION TEST; REHEARSED 2026-10-25 BY THEIR AUTHOR ONLY, ON LANE AMBER AT PRODUCTION'S POSITION (see "The second rehearsal"): STAGES 0, 1 AND 2 AND THE CLOCK CHECK RAN WHOLE, BEFORE YOU START AND THE CLOSING READ TO THEIR READER LINES; REHEARSED INDEPENDENTLY 2026-10-25 BY AN AGENT THAT DID NOT WRITE THEM (run 2, PASS; see "The independent rehearsal"); ONE R4 ROUND ON THE BLOCKS, THE CHECK FILES AND THE SCRIPT TEST 2026-10-25 (NO BLOCKER, NO MAJOR, THREE MINOR WORDING FINDINGS, ANSWERED IN `9784c346` WITH NO BLOCK BYTE CHANGED, NOT RE-REVIEWED (MINOR, UNDER THE REVIEW-LOOP CAP)); A NARROW R4 ROUND ON THE RECORD OF THE REHEARSALS 2026-10-25 (PASS, THREE MINOR WORDING FINDINGS, ANSWERED IN THE NEXT COMMIT WITH NO BLOCK BYTE CHANGED, LIKEWISE NOT RE-REVIEWED). NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, sha256 `56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a`, three statements, unchanged by the promotion.

**In plain language.** Anular marks a signed registo as annulled by writing one row to `record_annulments`. After this migration the database accepts that row only from the owner, or from a therapist who authored the registo or who treats or created its patient, written in their own name, for a signed registo of their own clinic group. That is exactly who the application's Anular serves today, so nobody loses anything they can do today, and no application change travels with it. It changes one expression of one policy. It touches no row, no grant, no function and no other policy. Every annulment already written stays, and stays readable.

Six blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the merge commit, every pin, production's journal), stage 0 (the files, the journal, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0107 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed; GREEN's dispatch carries it in the same words.** This document has no stage 3 and no S12 count, so where the rule names stages 2 and 3, read stage 2 and the closing read; 0106's one exception does not exist here. **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/annulment-insert-policy-0107.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**The check files count, and the blocks count again.** Neither check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `14 OK / 0 VACUOUS / 0 FAIL` of the pre-check, `19 OK / 0 VACUOUS / 0 FAIL` of the post-check. **A psql exit that is not 0 on either file means the read did not complete** (a carry not handed in, a lost connection, an object that is not there). Stage 2's STOP on the post-check's own run says so, and never that 0107 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE: `0106` is applied to production and merged.** GREEN applied it on Sunday 2026-10-25, 01:45:05 to 01:46:56 WEST, before the clocks went back; production's journal reads 104, `0106` at idx 103 (#1623 merged 2026-10-20 at `2c9aea28`, W-9 merge first).
2. **DONE 2026-10-13: a fresh reviewer passed the draft** as aligned with strategy's ruling of 2026-10-13 (option b: the therapist arm reads `public.clinical_therapist_sees_patient`), after the first draft had followed the ruling's first words ("the owner and the registo's author") and would have refused a treating therapist the application allows (the owner's ruling of 2026-09-14, Q-SR62-P4-1).
3. **DONE 2026-10-25: the promotion** (the next section). No gate edit is forced by it (see "GATE-CHANGES").
4. **DONE 2026-10-25: this document's blocks, its sidecar and its fault-injection test** (`scripts/annulment-insert-policy-0107.test.mjs`), and the check files' journal verdicts.
5. **DONE 2026-10-25: the rehearsal of the blocks by an agent that did not write them,** on a throwaway at production's position (`0000` to `0106` applied, a drizzle journal of 104 rows), under the lead's rule of 2026-09-30: run 2, PASS (see "The independent rehearsal"). The author's own run of the same day is recorded below it and is not that rehearsal.
6. **DONE 2026-10-25: one R4 round** on the blocks, the check files' journal verdicts and the script test: no BLOCKER, no MAJOR, three MINOR wording findings (stage 1's EXPECT counted the carry rows wrong; the fact table's "What it never touches" claimed more than the post-check reads; the policy suite's header placed R15 wrongly), answered in `9784c346`, not re-reviewed (MINOR, under the review-loop cap). No block byte changed (compared by machine), so the rehearsals stand for the blocks; the document's own sha256 moved. A narrow R4 round on the record of the rehearsals (2026-10-25) PASSED with three MINOR wording findings, answered in the commit after `9e9559aa` with no block byte changed, likewise not re-reviewed.
7. **OPEN: SOLO's READY line; the pull request, opened held (`held-for-apply`, unarmed); `main` merged into the branch with CI green on that head.**
8. **OPEN, THE OWNER: he takes `held-for-apply` off and merges.** Merges to main stop from that merge until GREEN's report on 0107.
9. **OPEN: SOLO fills GREEN's dispatch** after the merge: MERGED (the merge commit), DOCSHA (this document's sha256 at that commit) and a run window while both clinics are closed, whose end is not in a repeated hour.

## The promotion, as done on 2026-10-25

The number is the next free one after 0106, given at authoring (strategy, S-1012-A: after 0106 "numbers are assigned at authoring", this item first in the queue). It changed no byte of the migration.

1. A new branch from `origin/main` (`7370388a`), `db/0107-annulment-insert-policy`; the draft's content brought over file by file, never by rebase.
2. `packages/db/migrations-pending/NEXT-AFTER-0105_record_annulments_insert_policy.sql` became `packages/db/migrations/0107_record_annulments_insert_policy.sql`. sha256 `56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a` before and after; the file's own header still says "PENDING, AND IT FOLLOWS 0105" and names 0106 as the next free number on 2026-10-12, stale on purpose, because a promotion changes no byte.
3. Its journal entry: `idx 104`, tag `0107_record_annulments_insert_policy`, `when` 1788502800000 (0106's 1788502700000 plus 100000, the existing step).
4. Its mirror, `supabase/migrations/0107_record_annulments_insert_policy.sql`, written by `scripts/sync-supabase-migrations.mjs`.
5. A row of `packages/db/migrations-pending/README.md` in its "Promoted" table.
6. The pre-check gained verdicts 11 to 13 (0107 absent by hash, with 0106 found once as the control; 0106 the newest row by hash at its `when`; 104 rows); its old verdict 11 (VACUOUS on an empty table) became an INFO row, because the migration governs new rows only and an empty table decides nothing about it. The post-check gained verdicts 17 and 18 (0107 present once by hash as the newest row at its `when`, with 0106 found once as the control; the journal moved by exactly one) and takes `journal_rows_before` as a carry. Both now run inside their block's own `begin read only` and say so.
7. The two DB-gated suites' headers name the promoted path; from the promotion commit on they throw on a database without the ruled expression.
8. `node scripts/check-journal.mjs`: `105 .sql files match 105 journal entries in order, when strictly increasing, and the supabase mirror matches by CONTENT`.

| Fact | Value |
|---|---|
| Ruling | Strategy, S-1012-A (2026-10-12): "E-6: yes, first", numbered at authoring; the therapist arm, option b (2026-10-13). The owner, 2026-10-25: "E-6 push: GO under its tier rules". Tier C. Merged first and applied from `main`, on a closed night |
| Migration | `packages/db/migrations/0107_record_annulments_insert_policy.sql`, promoted from `packages/db/migrations-pending/NEXT-AFTER-0105_record_annulments_insert_policy.sql` with no byte changed. sha256 `56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a` |
| Journal | `idx 104`, tag `0107_record_annulments_insert_policy`, `when` 1788502800000. Stage 0 asserts it and 0106's entry before it. Production's journal goes 104 to 105 |
| Mirror | `supabase/migrations/0107_record_annulments_insert_policy.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0106`, sha256 `2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9`, journal `idx 103`, `when` 1788502700000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the pull request's merge commit (BEFORE YOU START checks it against MERGED). Stage 0 records the sha in `/tmp/0107-main.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if `origin/main` has moved since |
| This document | `docs/migration-apply-0107.md`, pinned by `docs/migration-apply-0107.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0107-annulment-insert-policy.sql`, READ ONLY, 14 verdicts (13 is the row `journal_rows_before`), 7 more CARRY rows and 6 INFO rows, run inside the block's own `begin read only`. sha256 `8e11a4d085a05bf17653abb8474721f2e5aba0d74e5d3b4e429f41acce14c86f` |
| Post-check | `scripts/db/postcheck-0107-annulment-insert-policy.sql`, READ ONLY, 19 verdicts, none of which can read VACUOUS, eight carries in, run inside the block's own `begin read only`. sha256 `bf1a86591951ecfb3299cd794631f4483f3a65ac14a3fbb68316ff5262424349` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0106's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0107-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block.** **Its end may not fall in a repeated hour** (see the next section) |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then the `WITH CHECK` of `record_annulments_tenant_insert`, one `ALTER POLICY` |
| What it never touches | every row, every table's columns, every other policy, privilege, function, trigger and default privilege (the SECURITY DEFINER count stays 36: **no count GATE-CHANGE after the apply**). The post-check proves what its verdicts read: the table's owner, row level security and triggers (3), the SELECT policy and the policy count on the table (5), `clinical_records_select` (6), the table's privileges (7), the functions the expression calls (8), and, against the pre-check's carries, the number of policies in the database, every other policy, every function in `public`, the SECURITY DEFINER count, every relation privilege in `public`, and the table's rows (10 to 16). It does not read default privileges, column grants or triggers database-wide: for those the proof is the migration itself, pinned by its sha256, three statements of which the only one that is not a SET LOCAL is the ALTER POLICY |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0107.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document moves its sha256; the sidecar is regenerated in the same commit, and `scripts/annulment-insert-policy-0107.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`. Git's pathspec exclusions, if any, are written `:(exclude)` for that reason.

## Closed hours, and the locks

**Closed hours only, and R9 does not apply.** This file alters a policy. Strategy's standing rule (S-1004-A): "any migration that creates a policy is closed-hours only, never eligible for R9." An `ALTER POLICY` takes the same locks a `CREATE POLICY` takes (measured, below), so the rule is applied to it in full. The weekday table (Lisbon): open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00; closed Sunday. BEFORE YOU START and the CLOCK CHECK check the clock by machine against it and against strategy's start windows; stage 0 and stage 1 check it against the table, and stage 1 also reads every active clinic's own hours.

**The locks, measured on a local stack (2026-10-12 and 2026-10-13, PostgreSQL 17.6).** The `ALTER POLICY`, run as `postgres`, holds ACCESS EXCLUSIVE on `public.record_annulments` and on the 23 login, storage and realtime tables the platform's `supautils.policy_grants` setting names there, until the COMMIT, and ACCESS SHARE on `public.clinical_records`. On an idle database that is some tens of milliseconds. **What waits while they are held:** every annulment, and every login, token refresh, storage or realtime call, until the COMMIT. A lock this transaction cannot take in 5 seconds fails it clean, with nothing applied (`journal    104 -> 104  (delta 0)`; measured 2026-10-13 with another session holding an ordinary read on `auth.users`). **Production's `supautils.policy_grants` setting has not been read;** the pre-check prints it as an INFO row.

**No apply window may end inside a repeated hour (strategy, 2026-10-25; card `DST-apply-window-never-ends-in-a-repeated-hour`).** On the night the clocks go back (the last Sunday of October, 02:00 WEST becomes 01:00 WET), 01:00 to 01:59 Lisbon happens twice, and the blocks compare wall time, so a window ending inside that hour could let stage 1 start up to an hour late. BEFORE YOU START and the CLOCK CHECK each STOP, before anything else runs, when the window's end (WEND) falls 01:00 to 01:59 on the last Sunday of October. The test is arithmetic on the typed value (the day of the week by Zeller's rule, in `awk`), so it reads no clock and runs the same on BSD and GNU. The night the clocks go forward has no repeated hour and is not tested.

## Merged before the apply, and which commit the sitting runs from

0107 creates no function, so no required check counts anything it adds. The pull request merges first and GREEN applies from the merge commit on `main`, as 0100, 0101, 0103, 0104, 0105 and 0106 were. **Between the merge and the apply, `main` is one migration ahead of production.** No application code reads the policy's text, and the one application writer of the table, `annulRecord`, already asks what the new expression asks (see "Who it admits"), so nothing that runs in production notices. The two suites that read the expression run on CI against a database built from `main`, which has it.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0106. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `MERGED`: the merge commit of the pull request, a full 40-character sha (BEFORE YOU START only);
- `DOCSHA`: this document's sha256 at that commit (both blocks);
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks): it opens, the last minute stage 1 may start, and its end. WEND may not fall in a repeated hour.

In this document the five lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. Its halt rule is THE HALT RULE above, in the same words. The CLOCK CHECK writes ONE line to `/tmp/0107-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2 and the closing read each read by machine.

**THE START WINDOWS (strategy's S-1002-D P1.4, as the dispatches of 0100 to 0106 hold them), read from the clock, never typed.** Stage 1 starts inside one: Monday to Saturday 21:00 to 22:29 (everything before 08:00 the next morning) or 00:00 to 06:29 (everything before 08:00 that morning); Sunday any hour (stage 1 by Monday 06:29, everything before Monday 08:00). The two dispatch blocks stop unless the start window the clock is in lies inside the run window the dispatch names. Two judgments carried over from 0101's to 0106's dispatches, SOLO's and not rulings: Saturday 13:00 to 20:59 is closed by the table and is not a start window; Sunday is one window.

**THE MACHINE'S CLOCK IS HELD AGAINST NETWORK TIME, BY MACHINE, TWICE, ON THREE SOURCES** (BEFORE YOU START and the CLOCK CHECK): `sntp time.apple.com` (up to three attempts; within 5 seconds), and the Date headers of https://api.github.com and https://www.cloudflare.com (each with `curl -sI --max-time 8`; within 30 seconds). The clock is accepted when at least one of the three can be read and every one that was read agrees; the block STOPs if none can be read, and STOPs if any one that was read disagrees. A source that fails is NOT READ, which alone is not a STOP. GREEN never sets the clock. These lines are 0106's, unchanged, and use BSD `date -j` (macOS, where GREEN runs).

## BEFORE YOU START: network time, the merge commit, every pin, production's journal. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
MERGED='PENDING: set after the merge'
DOCSHA='PENDING: set after the merge'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
SHA0107=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPREV=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPRE=8e11a4d085a05bf17653abb8474721f2e5aba0d74e5d3b4e429f41acce14c86f
SHAPOST=bf1a86591951ecfb3299cd794631f4483f3a65ac14a3fbb68316ff5262424349
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0107_record_annulments_insert_policy.sql
PREVMIG=packages/db/migrations/0106_reminder_claims.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${MERGED}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: MERGED is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0107} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){9}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. The journal read has not run"; exit 1; fi
test ! -f /tmp/0107-applied.ok || { AGE=$(find /tmp/0107-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0107 was applied in this sitting (/tmp/0107-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0107-start-main.sha /tmp/0107-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0107 alters a policy, so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
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
DOC=$(git show ${MAIN}:docs/migration-apply-0107.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document on origin/main is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${MAIN}:docs/migration-apply-0107.md | sed -n 3p) || { echo "STOP: the document's banner (its third line) could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's banner (its third line) read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '[A-Z]-PENDING' || { echo "STOP: the document's banner (its third line) carries a mark that ends in -PENDING, or it could not be searched, so the document that merged is not shown to be the final one. The journal read has not run"; exit 1; }
echo "banner:        final (it carries no mark that ends in -PENDING)"
SIDE=$(git show ${MAIN}:docs/migration-apply-0107.sha256) || { echo "STOP: the sidecar could not be read at the merge commit. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0107.md" ] || { echo "STOP: the sidecar on origin/main does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${MAIN}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0107 could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0107}" ] || { echo "STOP: 0107 on origin/main is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${MAIN}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0106 could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "0106:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0106 on origin/main is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${MAIN}:scripts/db/precheck-0107-annulment-insert-policy.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check on origin/main is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${MAIN}:scripts/db/postcheck-0107-annulment-insert-policy.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the merge commit. The journal read has not run"; exit 1; }
echo "post-check:    ${SPOST}"
[ "${SPOST}" = "${SHAPOST}" ] || { echo "STOP: the post-check on origin/main is not the approved file. The journal read has not run"; exit 1; }
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
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0107-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 104' /tmp/0107-journal-before.out || { echo "STOP: the journal read does not say 104. Nothing was applied"; exit 1; }
echo "${MAIN}" > /tmp/0107-start-main.sha || { echo "STOP: the main head could not be recorded. Nothing was applied"; exit 1; }
echo "main head recorded for the CLOCK CHECK: ${MAIN}"
echo "BEFORE YOU START: every check passed, and the journal reads 104."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `window end: ... happens once ...`; four `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `main head:` and `merge commit: origin/main IS the commit this block names`; `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `banner: final ...`, `sidecar:`; `migration:`, `0106:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 104` (and 0107 listed as pending on that ref); `main head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 104.` Exit 0. It writes nothing to production. **The banner check catches only a mark that ends in `-PENDING` on the document's third line; it is a tripwire, not the gate. DOCSHA is the gate:** the document must hash to the value the dispatch names, or the block stops. **An applied marker is read as stages 0 and 1 read it:** one under 12 hours old stops the block, and an older one, left from an earlier night, does not.

## STAGE 0: the merge, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0107.sha256
MIG=packages/db/migrations/0107_record_annulments_insert_policy.sql
SHA0107=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPREV=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPRE=8e11a4d085a05bf17653abb8474721f2e5aba0d74e5d3b4e429f41acce14c86f
SHAPOST=bf1a86591951ecfb3299cd794631f4483f3a65ac14a3fbb68316ff5262424349
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0107-applied.ok || { AGE=$(find /tmp/0107-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0107 in this sitting, or the age of /tmp/0107-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0107-main.sha /tmp/0107-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0107 is not on disk at origin/main, so the PR has not merged"; exit 1; }
N107=$(find packages/db/migrations -maxdepth 1 -name '0107_*.sql' | wc -l | tr -d ' ')
[ "${N107}" = 1 ] || { echo "STOP: ${N107} files claim migration number 0107, not 1"; exit 1; }
N106=$(find packages/db/migrations -maxdepth 1 -name '0106_*.sql' | wc -l | tr -d ' ')
[ "${N106}" = 1 ] || { echo "STOP: ${N106} files claim migration number 0106, not 1"; exit 1; }
test -f scripts/db/precheck-0107-annulment-insert-policy.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0107-annulment-insert-policy.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0107}" ] || { echo "STOP: 0107 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0107-annulment-insert-policy.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0107-annulment-insert-policy.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===105&&e.idx===104&&e.tag==='0107_record_annulments_insert_policy'&&e.when===1788502800000&&p.idx===103&&p.tag==='0106_reminder_claims'&&p.when===1788502700000?0:1)" || { echo "STOP: the newest journal entry is not idx 104, tag 0107_record_annulments_insert_policy, when 1788502800000, of 105, after idx 103 tagged 0106_reminder_claims at when 1788502700000"; exit 1; }
test -f packages/db/migrations/0106_reminder_claims.sql || { echo "STOP: the file of journal idx 103 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0106_reminder_claims.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0106 on disk is not the file this document pins"; exit 1; }
echo "0106 on disk: 0106_reminder_claims.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0107-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '105 .sql files match 105 journal entries' /tmp/0107-check-journal.out || { echo "STOP: check-journal did not reconcile 105 files with 105 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0107 alters a policy, which takes the locks a CREATE POLICY takes, and a migration that creates a policy is closed hours only, never eligible for R9 (S-1004-A). The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it alters the INSERT policy of public.record_annulments, which takes the locks a CREATE POLICY takes, and a migration that creates or alters a policy is closed hours only)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0107 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0107 alters a policy and is closed hours only, whatever the three proofs read, and the sitting waits. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0107-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0107-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0107-main.sha"
echo "0107 MERGE, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `origin/main and HEAD: <sha>`, the main head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0107.md: OK`; `newest journal entry: idx 104, when 1788502800000, tag 0107_record_annulments_insert_policy, of 105; before it idx 103, when 1788502700000, tag 0106_reminder_claims`; `0106 on disk: ...`; check-journal's line with `105 .sql files match 105 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (they decide nothing here); `R9: closed hours by the weekday table. 0107 runs in closed hours only`; `running from origin/main <sha>, recorded in /tmp/0107-main.sha`; then `0107 MERGE, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

**Until the pull request is merged, this stage ends at its first file check,** `STOP: the document pin is not on disk at origin/main`.

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
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. Nothing was applied. Do not paste stage 1"; exit 1; fi
test ! -f /tmp/0107-applied.ok || { AGE=$(find /tmp/0107-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0107 was applied in this sitting (/tmp/0107-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0107-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0107-start-main.sha || { echo "STOP: BEFORE YOU START recorded no main head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0107-start-main.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0107-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0107-main.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0107-main.sha -nt /tmp/0107-start-main.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0107-start-main.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0107-main.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "main at BEFORE YOU START: ${START}"
echo "recorded by stage 0:      ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: main moved between BEFORE YOU START and stage 0, the merge freeze was broken. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0107.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0107 alters a policy, so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
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
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0107-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0107-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0107-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the main BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `window end: ... happens once ...`; `main at BEFORE YOU START: <sha>` and `recorded by stage 0:      <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0107-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the main BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database. Every STOP but the last two leaves no window recorded, so stage 1 would stop too; the last two come after the record is written, and the halt rule governs.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0107_record_annulments_insert_policy.sql
SHA0107=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPREV=2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9
SHAPRE=8e11a4d085a05bf17653abb8474721f2e5aba0d74e5d3b4e429f41acce14c86f
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0107-applied.ok || { AGE=$(find /tmp/0107-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0107 in this sitting, or the age of /tmp/0107-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0107-precheck.new || { echo "STOP: the old /tmp/0107-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0107-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0107-main.sha) || { echo "STOP: stage 0's record /tmp/0107-main.sha could not be read. Nothing was applied"; exit 1; }
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
shasum -a 256 -c docs/migration-apply-0107.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0107 is not on disk"; exit 1; }
test -f scripts/db/precheck-0107-annulment-insert-policy.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N107=$(find packages/db/migrations -maxdepth 1 -name '0107_*.sql' | wc -l | tr -d ' ')
[ "${N107}" = 1 ] || { echo "STOP: ${N107} files claim migration number 0107, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0107}" ] || { echo "STOP: 0107 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0107-annulment-insert-policy.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T106=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[103];process.stdout.write(p&&p.idx===103&&p.tag==='0106_reminder_claims'?p.tag:'none')") || { echo "STOP: node could not read journal idx 103's tag at the recorded sha. Nothing was applied"; exit 1; }
W106=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[103];process.stdout.write(p&&p.idx===103&&p.tag==='0106_reminder_claims'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 103's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W106}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0106's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T106}.sql || { echo "STOP: the file of journal idx 103 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T106}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0106 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0106: packages/db/migrations/${T106}.sql, sha256 ${SHAPREV}, journal when ${W106}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0107-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0107-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0107-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0107-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0107-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0107-annulment-insert-policy.sql -c "rollback" 2>&1 | tee /tmp/0107-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0107-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0107-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0107-precheck.new || true)
[ "${OKS}" = 14 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 14. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, the profile of the annulments the table already holds, the registos with more than one, idle_in_transaction_session_timeout, supautils.policy_grants, the row count): they decide nothing in this block, and the lead reads them"

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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it alters the INSERT policy of public.record_annulments, which takes the locks a CREATE POLICY takes, and a migration that creates or alters a policy is closed hours only)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0107 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0107 alters a policy and is closed hours only, whatever the three proofs read, and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0107-postcheck.out /tmp/0107-stage2.ok /tmp/0107-journal-after.out /tmp/0107-apply.out /tmp/0107-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0107-precheck.new /tmp/0107-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0107-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0107-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0107_record_annulments_insert_policy --sha256 ${SHA0107} --expect-pending 1 2>&1 | tee /tmp/0107-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0107-apply.out holds it). Whether 0107 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0107-applied.ok || { echo "STOP: verified-migrate exited 0, so 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0107-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0107 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the same sha twice; `docs/migration-apply-0107.md: OK`; `0106: packages/db/migrations/0106_reminder_claims.sql, sha256 2f309b8a..., journal when 1788502700000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 14 OK (the journal verdicts 11 and 12 naming 0107 absent and 0106 the newest row at 1788502700000, and the row `journal_rows_before` reading 104, which is verdict 13's row and one of the 14), 7 CARRY rows (rows 20 to 26) and 6 INFO rows; then `the pre-check profile: 14 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0107 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0107-apply.out`: `pending    1  [0107_record_annulments_insert_policy]`, the drizzle-kit banner, `journal    104 -> 105  (delta 1)` and `0107_record_annulments_insert_policy present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal, as production does: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`, then the line ending `migrations applied successfully!`. They are not errors and decide nothing (0106's fourth rehearsal printed both).
- `0107 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL, a VACUOUS, or an OK count that is not 14 is such a STOP. The apply is the only writing command in this document. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition (on a database that already holds 0107 it reads `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`, exit 3, nothing run), but exit 3 or 4 can also follow a committed apply. A lock it cannot take in 5 seconds is a clean failure with nothing applied (`journal    104 -> 104  (delta 0)`); it is still a halt.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0107=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPOST=bf1a86591951ecfb3299cd794631f4483f3a65ac14a3fbb68316ff5262424349
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0107-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0107 APPLIED, then 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0107 APPLIED, then 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0107-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0107 APPLIED, then 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0107-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0107-main.sha) || { echo "STOP: stage 0's record /tmp/0107-main.sha could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0107.sha256 || { echo "STOP: this document is not the approved one. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0107_record_annulments_insert_policy.sql || { echo "STOP: 0107 is not on disk. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0107-annulment-insert-policy.sql || { echo "STOP: the post-check is not on disk. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0107_record_annulments_insert_policy.sql | cut -d' ' -f1)" = "${SHA0107}" ] || { echo "STOP: 0107 on disk is not the approved file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0107-annulment-insert-policy.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0107-window.ok || { echo "STOP: no run window is recorded for this sitting. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0107-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0107-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0107-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0107-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0107-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
OPM=$(carry other_policies_md5)
FM=$(carry functions_md5)
S=$(carry secdef_before)
RM=$(carry relation_acl_md5)
AR=$(carry annulments_rows)
AM=$(carry annulments_md5)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${OPM}" ] && [ -n "${FM}" ] && [ -n "${S}" ] && [ -n "${RM}" ] && [ -n "${AR}" ] && [ -n "${AM}" ] || { echo "STOP: a carry did not parse out of the transcript. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${S} ${AR}" | grep -qxE '[0-9]+( [0-9]+){3}' || { echo "STOP: a count carry is not a number. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${OPM} ${FM} ${RM} ${AM}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){3}' || { echo "STOP: an md5 carry is not 32 hex characters. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} other_policies_md5=${OPM} functions_md5=${FM} secdef_before=${S} relation_acl_md5=${RM} annulments_rows=${AR} annulments_md5=${AM}"
WVAC=0
WOK=19
echo "the post-check profile this sitting must print: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL, and no other (a VACUOUS verdict is not a pass, and a verdict that is missing prints no FAIL)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0107-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v other_policies_md5="${OPM}" -v functions_md5="${FM}" -v secdef_before="${S}" -v relation_acl_md5="${RM}" -v annulments_rows="${AR}" -v annulments_md5="${AM}" -c "begin read only" -f scripts/db/postcheck-0107-annulment-insert-policy.sql -c "rollback" 2>&1 | tee /tmp/0107-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0107-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0107, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0107-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0107-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}: no verdict of this post-check may read VACUOUS. A VACUOUS verdict is not a pass. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0107 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0107, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0107}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0107 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0107, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0107 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0107-stage2.ok || { echo "STOP: the pass mark /tmp/0107-stage2.ok could not be written, so the closing read would refuse. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0107 POST-CHECK PASSED. 14/14 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; the INSERT policy of public.record_annulments holds the ruled expression, every other policy (${PB} in all), function, SECURITY DEFINER count (${S}) and privilege as before, and the ${AR} annulments the table held are unchanged. Paste the closing journal read now."
)
```

**EXPECT:** the carries line (eight carries, `journal_rows_before=104`); `the post-check profile this sitting must print: 19 OK / 0 VACUOUS / 0 FAIL, and no other ...`; the post-check's table with that profile (verdict 17 `0107 once, the newest row, when 1788502800000; control 1`, verdict 18 `105`); `journal rows before=104 after=105, 0107 present by hash`; the last three journal rows, 0107's sha256 newest; then `0107 POST-CHECK PASSED. ...`. Exit 0.

**A FAIL IN VERDICT 15 OR 16 THAT IS NOT THE MIGRATION'S.** Verdicts 15 and 16 want the annulments the table holds unchanged, by count and by md5, because 0107 writes no row. An annulment made by staff while the sitting ran moves both: stage 2 STOPs saying the state is UNKNOWN, and the lead reads the other seventeen verdicts. On a closed night nobody annuls, and the window is short.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0107 APPLIED, then 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0107-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0107 APPLIED, then 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0107-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0107-main.sha) || { echo "STOP: stage 0's record /tmp/0107-main.sha could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0107.sha256 || { echo "STOP: this document is not the approved one. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0107-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0107-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0107-stage2.ok -newer /tmp/0107-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0107-window.ok || { echo "STOP: no run window is recorded for this sitting. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0107-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0107-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0107-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 105' /tmp/0107-journal-after.out || { echo "STOP: the journal read after the apply does not say 105. Stage 1 recorded that it applied 0107, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0107_record_annulments_insert_policy[.]sql$' /tmp/0107-journal-after.out || { echo "STOP: the journal read does not list 0107 as APPLIED. Stage 1 recorded that it applied 0107, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0107-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0107-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0107 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 105, 0107 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 105`, the line `APPLIED  0107_record_annulments_insert_policy.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 105, 0107 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after stage 2 printed its last line; after any STOP, never.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `14 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 14: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `19 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: STOP, the state is UNKNOWN. An OK count that is not 19, or any VACUOUS: STOP, the write stands. A psql exit that is not 0: STOP, which says it read nothing |

**The pre-check, `scripts/db/precheck-0107-annulment-insert-policy.sql`: 14 verdicts OK, 7 more CARRY rows, 6 INFO rows.** READ ONLY. Verdicts 0 to 10: the transaction is read only; the session is `postgres` and reads the table past its policies (controls: `authenticated` is neither); the table is owned by `postgres`, row level security on and not forced, no trigger; the INSERT policy is exactly as `0035` left it, by exact text; the SELECT policy is as `0035` left it, two policies, none restrictive; `clinical_records_select`, which the new expression reads registos through, is as `0096` left it; the table's privileges; every function the new expression calls, by its flags, owner, EXECUTE and body md5; the twelve columns and the `signed` label; Postgres 17 and the four roles. **Since the promotion, the journal:** 0107 absent by hash with 0106 found once as the control (11), 0106 the newest row by hash at its `when` 1788502700000 (12), and 104 rows (13, the row `journal_rows_before`, which stage 2 carries). The seven other carries: `policies_before`, `other_policies_md5`, `functions_md5`, `secdef_before`, `relation_acl_md5`, `annulments_rows`, `annulments_md5`. The INFO rows: the server version; the profile of the annulments the table already holds (by annuller role, registo status and tenant, counts only); registos with more than one annulment; `idle_in_transaction_session_timeout`; `supautils.policy_grants`, per role; the row count.

**The post-check, `scripts/db/postcheck-0107-annulment-insert-policy.sql`: 19 verdicts OK.** READ ONLY. Verdicts 0 to 9 repeat the pre-check's frame, with verdict 4 now requiring the RULED expression, character for character, as Postgres 17 renders it; 10 to 16 compare every carry (nothing else moved, no row was written); **the journal:** 0107 present once by hash as the newest row at its `when` 1788502800000, with 0106 found once as the control (17), and the journal moved by exactly one from `journal_rows_before` (18).

**Existing annulments the new expression would not admit stay.** A policy for INSERT decides new rows only. The pre-check's INFO profile shows how many of today's rows each term would have admitted; it decides nothing, and GREEN reports it as printed.

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, nothing changed (`journal    104 -> 104  (delta 0)`).
- **After the COMMIT, going back is one statement,** run after the two SET LOCAL lines, in one transaction: `ALTER POLICY "record_annulments_tenant_insert" ON public.record_annulments WITH CHECK (tenant_id = (select public.jwt_tenant_id()));`, the expression `0035` gave it. It writes no row and loses none: every annulment written in between stays, and stays readable. It takes the same locks as the apply, so it is closed hours only too. Run on the throwaways of 2026-10-13 and 2026-10-25; after it the pre-check read its starting profile again, all carries equal, once the journal row was also removed on the throwaway.
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0107 stays: a journal row is never deleted. **GREEN never runs that statement from this document; SOLO never runs it at all; and no block here contains it.**

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | On this pull request: take the label `held-for-apply` off | after the independent rehearsal of the blocks, the R4 round on them, SOLO's READY line, and `main` merged into the branch with CI green on that head | nothing by itself |
| 2 | On this pull request: merge | right after click 1, and never while a sitting of GREEN's is in flight | `main` is then one migration ahead of production. Nothing else merges until GREEN's report on 0107 |
| 3 | Launch GREEN and hand it SOLO's dispatch, which names `0107_record_annulments_insert_policy.sql` | after SOLO has filled the dispatch (MERGED, DOCSHA, the window); in closed hours, inside its run window | the sitting: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 4 | Read GREEN's report on 0107 | when it arrives | merges resume. If the report carries a STOP: nothing is pasted again, and the lead rules |
| 5 | Merge the skip guard's GATE-CHANGE (below) | after this pull request has merged | the two suites' absence from CI becomes red |

## GATE-CHANGES

- **None before the promotion merges, and none for the apply.** No gate file is edited by this branch; the SECURITY DEFINER count stays 36; no table is added, so the cleanup test of the test patients is untouched.
- **After the merge, ONE, the owner's (click 5), its own pull request:** `.github/scripts/assert-rls-executed.mjs` lists `record-annulments-insert-policy.db.test.ts` and `annul-record.db.test.ts` (`hard: true`), with `.github/gate-manifest.json` regenerated. Until then both suites run on CI, but their absence would not be red. It cannot merge first: the skip guard would look for files `main` does not have yet.
- **A fault-injection test for this document's blocks** is the new file `scripts/annulment-insert-policy-0107.test.mjs`, run by `pnpm test:scripts`. Adding one trips no gate; it is frozen at the next GATE-CHANGE after it lands.

## Who it admits, and who it refuses

Proven as assigned principals (`authenticated`, with the tenant, the role and the user id in the claims) by `packages/db/tests/record-annulments-insert-policy.db.test.ts`, and through the application's own `annulRecord` by `apps/web/lib/clinical/annul-record.db.test.ts`.

| who | the registo | answer |
|---|---|---|
| the owner, in their own name | signed, of their tenant | written |
| a therapist, in their own name | signed, and they authored it | written |
| a therapist, in their own name | signed, of a patient they have an appointment with (first or second practitioner, the patient in either slot) or created | written |
| a therapist with neither tie, the care team included | signed | refused, 42501 |
| an admin, a receptionist | signed | refused, 42501 |
| anyone, naming another member of staff or nobody | signed | refused, 42501 |
| anyone | a draft or a locked registo | refused, 42501 |
| anyone | a registo of another tenant, or a row of another tenant | refused, 42501 |
| the patient role, anon | any | refused, 42501, no privilege on the table (unchanged) |

**The one application writer** is `annulRecord` (`apps/web/lib/clinical/records.ts`), called by `annulRecordAction` (`apps/web/app/patients/[id]/actions.ts`). It reads the registo under `therapistRegistoWriteScope` (`apps/web/lib/patients/scope.ts`) before its INSERT, which is the policy's therapist arm word for word, and it writes `annulled_by_user_id` as the caller. So every caller it lets through to the INSERT is admitted. No other application code, seed, importer or function writes the table. Neither the reminder job nor the reminder sweep reads it (searched 2026-10-25: no line under `apps/web/lib/reminders`, any Inngest function or the guest-intake job names `record_annulments`), so 0107 is outside strategy's shadow protection of 2026-10-25 (R9).

## Rehearsal

### The independent rehearsal, 2026-10-25 (run 2): PASS, with the limits the document names

**By an agent that did not write the blocks,** on lane amber (a local Supabase stack, PostgreSQL 17.6), never production. Sunday 2026-10-25, 17:22 to 18:14 Lisbon (WET), a closed day; a usage limit cut the run off after the second paste of stage 1, and it resumed at 18:13. The main sitting ran 17:28 to 17:29, the fault sitting 18:13 to 18:14. The full record is the rehearser's, outside the repository.

**The bytes.** Rehearsed at `324b4b7b` (this document's sha256 there `980ee437...df1b`, equal to its sidecar). The branch then moved to `9784c346` (the R4 round's wording): its six blocks are byte for byte those of `324b4b7b`, checked by machine (the concatenated blocks hash to `bbd95cdd...35d2` in both). Only the document's own sha256 moved, so GREEN's dispatch carries the value at the merge commit, never the rehearsed one.

**The position.** Built by this document's method: the INSERT policy set back to `0035`'s expression, a drizzle journal of 104 rows built from the files, one synthetic signed registo and two synthetic annulments written as `postgres` (one naming the registo's practitioner, one naming nobody); two active clinics, 08:00 to 20:00, read `inside`. A read-only pre-check by hand read 14 OK / 0 VACUOUS / 0 FAIL before any block ran.

**The substitutions, exactly four, and the dispatch fills.**
- (a) `DATABASE_URL_DIRECT` came from the environment (127.0.0.1); no block line was edited for it.
- (b) Removed whole, NOT REHEARSED: the reader line of BEFORE YOU START and of the closing read; the environment-file line and the target guard's line of stages 1 and 2.
- (c) The `cd` into the apply worktree went to a scratch clone whose `origin` is a local bare repository with `main` at `324b4b7b` (six lines).
- (d) Every `/tmp/0107-` went to a scratch folder.
- The two dispatch blocks were run FILLED: MERGED `324b4b7b`, DOCSHA as above, the window 202610250000, 202610260629, 202610260800.

Every block ran in a fresh `zsh -f` with an emptied environment, in GREEN's shape.

**The hand step, stated plainly.** With the reader line removed, BEFORE YOU START stops at the grep after it and so never writes `/tmp/0107-start-main.sha`, which the CLOCK CHECK needs. The rehearser read the lane's journal count READ ONLY (`104`) and wrote the head's sha into that file by hand, as the author's rehearsal did. The lead (SOLO) accepts it as a stand-in for a line that is NOT REHEARSED, not as a way past a guard: no guard line was altered or run; the guard lines were removed whole under (b) and are NOT REHEARSED, and the production reader never ran.

| Block | Result | Exit |
|---|---|---|
| BEFORE YOU START, filled | all three time sources read and agreeing; closed by the weekday table; `merge commit: origin/main IS the commit this block names`; every pin equal; then, the reader line removed, `STOP: the journal read does not say 104. Nothing was applied`, as predicted | 1 |
| Stage 0 | `newest journal entry: idx 104, ... of 105; before it idx 103 ... 0106_reminder_claims`; check-journal 105 of 105; `R9: closed hours by the weekday table. 0107 runs in closed hours only`; `0107 MERGE, NUMBER, FILES AND CLOCK VERIFIED` | 0 |
| CLOCK CHECK, filled | `run window recorded in ...0107-window.ok: 324b4b7b... 202610250000 202610260629 202610260800`; `CLOCK: ... Paste stage 1 now.` | 0 |
| Stage 1 | pre-check `14 OK / 0 VACUOUS / 0 FAIL` (7 CARRY rows, 6 INFO rows); clinics `0 of 2`, inside; verified-migrate with its two NOTICE objects, `journal 104 -> 105 (delta 1)`, `present by sha256: yes`; `0107 APPLIED. Paste stage 2 now.` | 0 |
| Stage 2 | the eight carries; post-check `19 OK / 0 VACUOUS / 0 FAIL`; verdict 17 `1 row, newest is 0107, when 1788502800000; control 1`; `0107 POST-CHECK PASSED. ...` | 0 |
| The closing read | head, window and pins pass; then, the reader line removed, `STOP: the journal read after the apply does not say 105. ... Treat the state as UNKNOWN ...`, as predicted | 1 |
| Stage 1, pasted again | `STOP: stage 1 has ALREADY APPLIED 0107 in this sitting ...` | 1 |
| Stage 0, pasted again | the same STOP | 1 |

After the two refusals the journal still read 105: nothing more was applied.

**The suites,** on the applied lane, one file at a time: `record-annulments-insert-policy.db.test.ts` 35 of 35, `record-annulments.test.ts` 6 of 6, `apps/web` `annul-record.db.test.ts` 9 of 9.

**The fault test, on a fresh position** (the lane reset, the position rebuilt, the same substitutions and the same hand step; BEFORE YOU START stopped at the reader grep, stage 0 and the CLOCK CHECK exit 0). With `EXECUTE` on `public.clinical_therapist_sees_patient(uuid)` revoked from `authenticated`, stage 1's pre-check read verdict 8 FAIL, `13 OK / 0 VACUOUS / 1 FAIL`, then `STOP: the pre-check printed [1] FAIL verdicts ... Nothing was applied`, exit 1: the journal still 104, the policy still `0035`'s, no applied marker. The grant was restored and the pre-check read 14 OK again.

**Its NOT REHEARSED:** the production journal reader in BEFORE YOU START and the closing read, and so the tail of both after it (the 104 and 105 greps, the APPLIED, pending and orphan greps, the record and the last lines); the environment file and the target guard in stages 1 and 2; BEFORE YOU START's own writing of `0107-start-main.sha` (the hand step above); production's real policy text, counts and `supautils.policy_grants`; and DOCSHA at `9784c346` or at the merge commit.

**Run 1, the same afternoon, was PARTIAL:** its prompt allowed too few substitutions. It lacked two: the apply worktree's `cd` to a scratch clone with a local fake `origin`, and the `/tmp` folder moved to a scratch folder. So every block that ran stopped at its first check (stage 0 was not run, to avoid moving GREEN's checkout), and no sequence ran. Run 2 is the rehearsal of record.

### The second rehearsal, 2026-10-25: the blocks, by their author (not the independent rehearsal above)

**No STOP that the document does not predict, and no finding against a block.** Run on Sunday 2026-10-25, 16:36 to 16:38 Lisbon (WET), a closed day, by SOLO, the author of the blocks. **It is not the independent rehearsal NOT READY step 5 asks for,** and it does not replace it.

**The bytes.** The document at `29ceb6db` (sha256 `8adb0ebfd778c225c938694890a4cd708502b20f740dfee5233edf4957690ca6`, matching its sidecar). This revision changed only this section and the status line, so its six blocks are byte for byte those of `29ceb6db` (compared by machine).

**The throwaway and the method (0106's).** Lane amber (a local Supabase stack, PostgreSQL 17.6), built from this branch's migrations `0000` to `0107`, then put at production's position by hand: the INSERT policy set back to `0035`'s expression; a drizzle journal of 104 rows built from the files (each `hash` its file's sha256, each `created_at` its `when`); two synthetic annulments written as `postgres` (one naming the registo's practitioner, one naming nobody), so the profile and the row md5 had rows to read; two active clinics, 08:00 to 21:00. Each block was cut from the document by machine and run in a fresh `zsh -f` with a cleared environment (`env -i`), in GREEN's shape (`true && eval "<block>" < /dev/null && ...`). **Substituted, and nothing else:** the `cd` into the apply worktree went to a scratch clone whose `origin` is a local bare repository with `main` at `29ceb6db`; `/tmp/0107-*` went to a scratch folder; `DATABASE_URL_DIRECT` came from the environment (127.0.0.1). **Removed, NOT REHEARSED:** the lines that load the production environment file, the target guard's line and the reader's line. The two dispatch blocks were run FILLED (MERGED `29ceb6db`, DOCSHA as above, the window 202610250000, 202610260629, 202610260800).

| Block | Result |
|---|---|
| BEFORE YOU START, filled | REHEARSED TO THE READER LINE: `window end: 202610260800 happens once ...`; the four `network time:` lines (all three sources read and agreeing); `closed by the weekday table`; the start window and the run window; `merge commit: origin/main IS the commit this block names`; every pin; then, the reader line removed, `STOP: the journal read does not say 104. Nothing was applied`, as it must. `/tmp/0107-start-main.sha` was then written by hand with the head |
| Stage 0 | REHEARSED-OK: exit 0; `newest journal entry: idx 104, when 1788502800000, tag 0107_record_annulments_insert_policy, of 105; ...`; check-journal `105 .sql files match 105 journal entries`; closed; `0107 MERGE, NUMBER, FILES AND CLOCK VERIFIED` |
| CLOCK CHECK, filled | REHEARSED-OK: exit 0; `run window recorded in .../0107-window.ok: 29ceb6db... 202610250000 202610260629 202610260800`; `CLOCK: ... Paste stage 1 now.` |
| Stage 1 | REHEARSED-OK (the guard line removed): pre-check `14 OK / 0 VACUOUS / 0 FAIL`; clinics `0 of 2`, inside; verified-migrate `pending 1 [0107_record_annulments_insert_policy]`, the two NOTICE objects (42P06, 42P07), `journal 104 -> 105 (delta 1)`, `present by sha256: yes`; `0107 APPLIED. Paste stage 2 now.` |
| Stage 2 | REHEARSED-OK (the guard line removed): the eight carries (`journal_rows_before=104 policies_before=108 ... secdef_before=36 ... annulments_rows=2 ...`); post-check `19 OK / 0 FAIL`; `journal rows before=104 after=105, 0107 present by hash`; the last three rows, 0107's sha256 newest; `0107 POST-CHECK PASSED. ...` |
| The closing read | REHEARSED TO THE READER LINE: head, document, window and pins pass; then, the reader line removed, `STOP: the journal read after the apply does not say 105. ... Treat the state as UNKNOWN ...`, as it must |

**Repeats and negatives.** A second paste: stage 1, then stage 0, each stopped with `STOP: stage 1 has ALREADY APPLIED 0107 in this sitting ...`, exit 1. Nothing more was applied.

**By hand, outside the blocks.** On the applied throwaway: `record-annulments-insert-policy.db.test.ts` 35 of 35, `record-annulments.test.ts` 6 of 6, `apps/web` `annul-record.db.test.ts` 9 of 9. Going back (the statement in "Rollback"), then the pre-check: `11 OK / 0 VACUOUS / 3 FAIL`, the three journal verdicts, because the journal row stays; with that row removed on the throwaway, `14 OK / 0 VACUOUS / 0 FAIL` and all seven other carries equal to the first run's.

**The script test, the same day:** 45 of 45; the fault injection 361 faults in bash with errexit off and 361 in zsh, every one halting or, for the network-time and R9 proof 1 calls, going on as the document allows; the window-end rule against the calendar for every hour that matters of 20 to 31 October, 2026 to 2035. The 0104, 0105 and 0106 tests still pass on this tree (119 of 119, their sweeps not rerun).

### The first rehearsal, 2026-10-13: the migration, the check files, the suites and going back

**REHEARSED WITH LIMITS on 2026-10-13 (apply 1 at 19:02 Lisbon, going back at 19:05), on a throwaway. Never on a lane, never on production.** The check files were then without their journal verdicts, and the migration had no number.

**The throwaway.** A local Supabase stack, project id `re6`, built from `origin/main` at `5d4e8091`: Supabase CLI 2.100.0, `supabase/postgres:17.6.1.106` (PostgreSQL 17.6). The head's `supabase/migrations`, 101 files, `0000` to `0103`, applied by `supabase start`, then `supabase/seed.sql`. No drizzle journal table. Torn down after.

**The apply was NOT the real applier.** Each apply ran every statement of the file, split on the statement marker, in ONE transaction as `postgres` through `psql`, the way `drizzle-kit migrate` runs one file, and read `pg_locks` for its own backend before the COMMIT.

| step | result |
|---|---|
| the three touched suites, not applied | `packages/db`: 26 passed, 15 skipped (41). `apps/web`: 9 passed (9) |
| pre-check, clean throwaway | `11 OK / 1 VACUOUS / 0 FAIL` (the table empty; that verdict is an INFO row since the promotion) |
| ten synthetic annulments of known answers written, then the pre-check | `12 OK / 0 VACUOUS / 0 FAIL`; every number of the profile is the seeded one |
| a run that ends in ROLLBACK instead of COMMIT | the policy read as before it |
| post-check before the apply (a control) | `16 OK / 1 FAIL`, the failure is verdict 4, as it must be |
| apply 1 | 3 statements, COMMITTED. Locks held: ACCESS EXCLUSIVE on 24 relations, ACCESS SHARE on 2, ROW EXCLUSIVE on 1 |
| post-check | `17 OK / 0 FAIL` (the ten rows unchanged, by count and by md5) |
| apply 2, the second apply | COMMITTED, a no-op. The same locks |
| pre-check after the apply (a control) | `11 OK / 0 VACUOUS / 1 FAIL`, the failure is verdict 4 |
| the three touched suites, applied | `packages/db`: 41 passed (41). `apps/web`: 9 passed (9) |
| both whole DB-gated sets, applied, the commands of `.github/workflows/db-tests.yml` | `packages/db`: 103 files, 1597 tests, all passed. `apps/web`: 64 files, 774 tests, all passed |
| going back, then the pre-check | exit 0; `12 OK / 0 VACUOUS / 0 FAIL`, and all seven carries equal to the ones read before apply 1 |
| the apply while another session holds an ordinary read on `auth.users` | `ERROR: canceling statement due to lock timeout` after 5 seconds, exit 3; nothing was applied |

**One mutation sweep, over the therapist arm's second term** (2026-10-13). Fifteen mutants of the expression, each set with `ALTER POLICY` on the throwaway and met by the arms of `record-annulments-insert-policy.db.test.ts`. Control: the ruled expression, 34 of 34. First pass: 13 killed, 2 survived; both were fixture gaps, closed in the fixture, then 15 of 15 killed. The file's statements did not change in the sweep.

## NOT REHEARSED, said one by one

- **What the independent rehearsal names as NOT REHEARSED** (its own list, above): the production reader and the tail of both blocks after it, the environment file and the target guard, BEFORE YOU START's own writing of `0107-start-main.sha`, production's real values, and DOCSHA at the merge commit.
- **BEFORE YOU START and the CLOCK CHECK as GREEN pastes them:** their PENDING lines stop them first on any throwaway; the filled copies run only in GREEN's dispatch. Their window-end test is proven by the script test, not on a throwaway.
- **The lines that load the production environment file, the target guard's lines and the reader's lines:** they refuse any throwaway by design (`REFUSING: project ref is "postgres" ...`), which is their purpose, and the lead's rule forbids getting past them.
- **Production:** its policy text, its row counts and its `supautils.policy_grants` were not read. The pre-check pins every one it depends on, so a difference stops the sitting at the pre-check rather than passing unseen.

## Review history

- **2026-10-12:** the first draft, to the letter of "the owner and the registo's author"; its own builder raised that it refuses a treating therapist the application allows (the owner's ruling of 2026-09-14). To strategy.
- **2026-10-13:** strategy ruled option b; the draft aligned (`clinical_therapist_sees_patient`), and a fresh reviewer PASSED it, with one finding answered at the promotion (the check files exited 0 on a FAIL verdict and nothing counted them: the blocks now count every profile).
- **2026-10-25:** promoted to 0107; blocks, sidecar and script test written.
- **2026-10-25: one R4 round** on the blocks, the check files and the script test: no BLOCKER, no MAJOR, three MINOR wording findings, answered in `9784c346` (no block byte changed); not re-reviewed, under the review-loop cap (MINOR, no production-touching byte).
- **2026-10-25: a narrow R4 round** on the record of the rehearsals (`9e9559aa`): PASS, with three MINOR wording findings (run 1's paragraph, the hand step's sentence on the guard lines, and these review-cap notes), answered in the next commit with no block byte changed; not re-reviewed, MINOR, under the review-loop cap.
