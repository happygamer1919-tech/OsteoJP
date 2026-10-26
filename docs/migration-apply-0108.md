# 0108: apply the pack read function

**NOT READY. Nothing in this document may be pasted yet.** The migration is written at its number after 0107, on its held branch, and this document carries its six blocks, proven by their fault-injection test. Open, in order: the R4 round on the migration, the check files and the blocks; SOLO's READY line; the pull request, opened held; and GREEN's dispatch, which carries the values this document cannot hold (the held head's sha as HELD, this document's sha256 as DOCSHA, and the run window as WOPEN, WSTART and WEND). **The sitting runs from the pull request's HELD head, before the merge** (it creates a SECURITY DEFINER function; see "Applied from the held head"), **and in closed hours only** (see "Closed hours, and the locks").

**Status: AUTHORED 2026-10-26 AT ITS NUMBER (`packages/db/migrations/0108_pack_instance_consuming_sessions.sql`, journal idx 105); BLOCKS WRITTEN 2026-10-26 AND PROVEN BY THEIR FAULT-INJECTION TEST; REHEARSED 2026-10-26 BY THEIR AUTHOR ONLY, ON LANE AMBER AT PRODUCTION'S POSITION (see "Rehearsal"). NOT REVIEWED. NOT REHEARSED BY AN AGENT THAT DID NOT WRITE THE BLOCKS. NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, sha256 `7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb`, seven statements.

**In plain language.** A pack's balance and the number "Sessao N de M" on each visit come from the visits linked to the pack that are not cancelled. This migration adds one database function that returns those visits for one pack, as two columns (the visit's id and when it starts), to a member of staff who may already open that pack's patient. Who may open a patient is decided exactly as the patient list decides it today. Nobody else gets anything from it. It changes no table, no row, no policy and no other function, and no application code reads it yet: the balance, the booking path, the pack link guard and the per-visit number move to it in their own pull requests, after the apply.

Six blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the held head, every pin, production's journal), stage 0 (the files, the journal, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0108 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed; GREEN's dispatch carries it in the same words.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any the profile does not name.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/pack-instance-consuming-sessions-0108.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**The check files count, and the blocks count again.** Neither check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `13 OK / 0 VACUOUS / 0 FAIL` of the pre-check; of the post-check, `13 OK / 0 VACUOUS / 0 FAIL` when the pre-check's carry `probe_instances` is above 0 and `12 OK / 1 VACUOUS / 0 FAIL` when it is 0 (stage 2 decides which, from the carry, before it runs the file). **A psql exit that is not 0 on either file means the read did not complete** (a carry not handed in, a lost connection, an object that is not there). Stage 2's STOP on the post-check's own run says so, and never that 0108 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE: `0107` is applied to production and merged.** GREEN applied it on Sunday 2026-10-25 between 22:10 and 22:14 WET; production's journal reads 105, `0107` at idx 104 (#1651 merged before its sitting).
2. **DONE 2026-10-26: the migration, at its number** (the next section), with its journal entry and its mirror; the two check files; the DB-gated suite; this document's blocks, its sidecar and its fault-injection test (`scripts/pack-instance-consuming-sessions-0108.test.mjs`).
3. **DONE 2026-10-26: the author's rehearsal** on lane amber at production's position (see "Rehearsal").
4. **OPEN: one R4 round** on the migration, the two check files, the suite, the blocks and the script test.
5. **OPEN: the rehearsal of the blocks by an agent that did not write them,** on a throwaway at production's position, under the lead's rule of 2026-09-30, with the substitutions "Rehearsal" names.
6. **OPEN: SOLO's READY line; the pull request, opened held (`held-for-apply`, unarmed).** Its CI reads red on the SECURITY DEFINER count, by construction (see "GATE-CHANGES").
7. **OPEN: SOLO fills GREEN's dispatch:** HELD (the held head's sha), DOCSHA (this document's sha256 at that head) and a run window while both clinics are closed, whose end is not in a repeated hour.

## Written at its number, 2026-10-26

The number is the next free one after 0107, given at authoring (strategy, S-1012-A: after 0106 "numbers are assigned at authoring", and the pack read function is first in the queue after 0107). `0107` was applied and merged before this file was written, so nothing else was in flight and there was no number to wait for: the file was written in `packages/db/migrations` as `0108`, with its journal entry and its mirror in the same commit, as `0103` was. No pending file preceded it.

1. A new branch from `origin/main` (`38721f0b`), `db/0108-pack-read-function`.
2. `packages/db/migrations/0108_pack_instance_consuming_sessions.sql`, sha256 `7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb`.
3. Its journal entry: `idx 105`, tag `0108_pack_instance_consuming_sessions`, `when` 1788502900000 (0107's 1788502800000 plus 100000, the existing step).
4. Its mirror, `supabase/migrations/0108_pack_instance_consuming_sessions.sql`, written by `scripts/sync-supabase-migrations.mjs`.
5. A row of `packages/db/migrations-pending/README.md` in its "Promoted" table, as 0103's.
6. `node scripts/check-journal.mjs`: `106 .sql files match 106 journal entries in order, when strictly increasing, and the supabase mirror matches by CONTENT`.

| Fact | Value |
|---|---|
| Ruling | Strategy, S-1008-B (2026-10-08) and S-1012-A (2026-10-12): the pack read function, numbered at authoring, first in the queue after 0107. Tier C. Authored and rehearsed by SOLO, held; applied by GREEN from the held head, on a closed night |
| Migration | `packages/db/migrations/0108_pack_instance_consuming_sessions.sql`, written at its number. sha256 `7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb` |
| Journal | `idx 105`, tag `0108_pack_instance_consuming_sessions`, `when` 1788502900000. Stage 0 asserts it and 0107's entry before it. Production's journal goes 105 to 106 |
| Mirror | `supabase/migrations/0108_pack_instance_consuming_sessions.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0107`, sha256 `56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a`, journal `idx 104`, `when` 1788502800000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | **the pull request's HELD head, `origin/db/0108-pack-read-function`, never a merge commit on main.** BEFORE YOU START checks it against HELD. Stage 0 records the sha in `/tmp/0108-head.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if the held head has moved since |
| This document | `docs/migration-apply-0108.md`, pinned by `docs/migration-apply-0108.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0108-pack-instance-consuming-sessions.sql`, READ ONLY, 13 verdicts (12 is the row `journal_rows_before`), 7 more CARRY rows and 3 INFO rows, run inside the block's own `begin read only`. sha256 `ac0765325157257fc5ddee1281222f359d35eb526d76b0ebda62d8caa9f7fd80` |
| Post-check | `scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql`, READ ONLY, 13 verdicts (verdict 6 may read VACUOUS, and only when `probe_instances` is 0), eight carries in, run inside the block's own `begin read only`. sha256 `c70e5258c951ec5c32c477e9e31da50a159c036afc616da23ddc452ad14989cc` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0107's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0108-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block.** **Its end may not fall in a repeated hour** |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then one `CREATE FUNCTION`, `public.pack_instance_consuming_sessions(uuid)`; its owner pin; one `REVOKE` and one `GRANT` of EXECUTE on it; its comment |
| What it never touches | every table, row, column, policy and trigger, and every other function and its ACL. The post-check proves what its verdicts read: the new function's signature, flags, body, EXECUTE and comment (2 to 5); its answers on production's own packs (6); against the pre-check's carries, every other function in `public`, the SECURITY DEFINER count (one more), every policy and every relation privilege in `public` (7 to 10). It does not read default privileges, column grants or triggers: for those the proof is the migration itself, pinned by its sha256 |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0108.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document moves its sha256; the sidecar is regenerated in the same commit, and `scripts/pack-instance-consuming-sessions-0108.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`. Git's pathspec exclusions, if any, are written `:(exclude)` for that reason.

## Closed hours, and the locks

**Closed hours only.** This file creates one function and touches no table, so R9's second proof holds (catalog-only); its first holds when the SET LOCAL gate is on the head. **Its third does not: the read-only pre-check has not run on production in an earlier sitting** (strategy's S-1002-A R9), so a clinic-hours sitting is not allowed and the blocks have no daytime path. The weekday table (Lisbon): open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00; closed Sunday. BEFORE YOU START and the CLOCK CHECK check the clock by machine against it and against strategy's start windows; stage 0 and stage 1 check it against the table, and stage 1 also reads every active clinic's own hours.

**The locks, measured on lane amber (2026-10-26, PostgreSQL 17.6).** The file's statements, run as `postgres` in one transaction, hold no lock on any table of `public`: ACCESS EXCLUSIVE and SHARE UPDATE EXCLUSIVE on the new function's own object, ACCESS SHARE on four role objects, and the catalogue locks of a CREATE FUNCTION and a COMMENT (`pg_proc`, `pg_description`). The body is plpgsql, so it is checked for syntax only at CREATE time and no table it reads is opened (a SQL-language body would take ACCESS SHARE on the tables it reads, until the COMMIT). **What waits while they are held:** nothing an application session does. A lock this transaction cannot take in 5 seconds fails it clean, with nothing applied.

**No apply window may end inside a repeated hour (strategy, 2026-10-25; card `DST-apply-window-never-ends-in-a-repeated-hour`).** On the night the clocks go back (the last Sunday of October, 02:00 WEST becomes 01:00 WET), 01:00 to 01:59 Lisbon happens twice, and the blocks compare wall time, so a window ending inside that hour could let stage 1 start up to an hour late. BEFORE YOU START and the CLOCK CHECK each STOP, before anything else runs, when the window's end (WEND) falls 01:00 to 01:59 on the last Sunday of October. The test is arithmetic on the typed value (the day of the week by Zeller's rule, in `awk`), so it reads no clock and runs the same on BSD and GNU.

## Applied from the held head, before the merge, and which commit the sitting runs from

**0108 creates a SECURITY DEFINER function, so it cannot merge first** (`CLAUDE.md`, "Which commit a sitting runs from"): the required check `packages/db/scripts/check-security-definer-owner.mjs` counts those functions on a database built from `main`, and its `EXPECTED_COUNT` is a frozen gate that moves only in its own GATE-CHANGE. The order is 0096's, 0097's and 0102's:

| # | Step | Who |
|---|---|---|
| 1 | GREEN applies 0108 from this pull request's HELD head, with this document | GREEN, on the owner's dispatch |
| 2 | The count's GATE-CHANGE merges: `EXPECTED_COUNT` 36 to 37 | the owner, by hand |
| 3 | `main` is merged into this pull request (merge, never rebase) | SOLO |
| 4 | The owner takes `held-for-apply` off and merges this pull request | the owner |
| 5 | The skip guard's GATE-CHANGE merges (`assert-rls-executed.mjs` learns the new suite) | the owner, by hand |

**Between steps 2 and 4, `main` reads red on the count for every other pull request** (it expects 37 and builds 36). Steps 2, 3 and 4 are done back to back. **Between steps 1 and 4, production is one migration ahead of `main`.** The daily `prod-drift-check` reports a journal row with no matching file on `main` in that window; that report is correct, and it ends at step 4. Nothing in the application reads the function before step 4 and its own later pull requests, so the application behaves the same before and after the apply.

**Every block of this document names `origin/db/0108-pack-read-function` and none names `origin/main`.** The `held-for-apply` label keeps the branch where it is: a labelled pull request cannot merge (`.github/workflows/held-for-apply-blocks-merge.yml`) and `.github/workflows/auto-update-prs.yml` does not merge `main` into it, so the head GREEN runs from does not move under the sitting.

- **Two shas are compared only as checked variables.** Every sha a block compares (the held head, the recorded sha, the worktree's HEAD, the sha in the run window record, stage 2's pass mark) is first read into a variable and refused unless it is 40 hex characters.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve the held branch again, print both, and HALT on any difference with `STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting.` It runs before the environment is loaded and before psql.
- **Stage 2 and the closing read are READ ONLY** and run from the recorded sha whatever the branch has done since: each prints whether it moved, with both shas, and never stops on it. A fetch that fails, or a held branch that cannot be read, is a STOP in every block.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0107. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `HELD`: the held head of the pull request, a full 40-character sha (BEFORE YOU START only);
- `DOCSHA`: this document's sha256 at that head (both blocks);
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks): it opens, the last minute stage 1 may start, and its end. WEND may not fall in a repeated hour.

In this document the five lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. Its halt rule is THE HALT RULE above, in the same words. The CLOCK CHECK writes ONE line to `/tmp/0108-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2 and the closing read each read by machine.

**THE START WINDOWS (strategy's S-1002-D P1.4, as the dispatches of 0100 to 0107 hold them), read from the clock, never typed.** Stage 1 starts inside one: Monday to Saturday 21:00 to 22:29 (everything before 08:00 the next morning) or 00:00 to 06:29 (everything before 08:00 that morning); Sunday any hour (stage 1 by Monday 06:29, everything before Monday 08:00). The two dispatch blocks stop unless the start window the clock is in lies inside the run window the dispatch names. Two judgments carried over from 0101's to 0107's dispatches, SOLO's and not rulings: Saturday 13:00 to 20:59 is closed by the table and is not a start window; Sunday is one window.

**THE MACHINE'S CLOCK IS HELD AGAINST NETWORK TIME, BY MACHINE, TWICE, ON THREE SOURCES** (BEFORE YOU START and the CLOCK CHECK): `sntp time.apple.com` (up to three attempts; within 5 seconds), and the Date headers of https://api.github.com and https://www.cloudflare.com (each with `curl -sI --max-time 8`; within 30 seconds). The clock is accepted when at least one of the three can be read and every one that was read agrees; the block STOPs if none can be read, and STOPs if any one that was read disagrees. GREEN never sets the clock. These lines are 0107's, unchanged.

## BEFORE YOU START: network time, the held head, every pin, production's journal. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
SHA0108=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPREV=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPRE=ac0765325157257fc5ddee1281222f359d35eb526d76b0ebda62d8caa9f7fd80
SHAPOST=c70e5258c951ec5c32c477e9e31da50a159c036afc616da23ddc452ad14989cc
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0108_pack_instance_consuming_sessions.sql
PREVMIG=packages/db/migrations/0107_record_annulments_insert_policy.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0108} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){9}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. The journal read has not run"; exit 1; fi
test ! -f /tmp/0108-applied.ok || { AGE=$(find /tmp/0108-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0108 was applied in this sitting (/tmp/0108-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0108-start-head.sha /tmp/0108-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0108 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
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
TIP=$(git rev-parse origin/db/0108-pack-read-function) || { echo "STOP: the held head, origin/db/0108-pack-read-function, could not be read. The journal read has not run"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. The journal read has not run"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the branch was pushed to since the READY line, or it is gone. The journal read has not run"; exit 1; }
echo "held head:     origin/db/0108-pack-read-function IS the commit this block names"
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. The journal read has not run"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. The journal read has not run"; echo "${STRAY}"; exit 1; }
WAS=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. The journal read has not run"; exit 1; }
echo "worktree:      clean, on ${WAS}"
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. The journal read has not run"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. The journal read has not run"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. The journal read has not run"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. The journal read has not run"; exit 1; }
echo "checked out:   ${TIP}, the held head, so the read below runs the reader it holds"
DOC=$(git show ${TIP}:docs/migration-apply-0108.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${TIP}:docs/migration-apply-0108.md | sed -n 3p) || { echo "STOP: the document's banner (its third line) could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's banner (its third line) read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '[A-Z]-PENDING' || { echo "STOP: the document's banner (its third line) carries a mark that ends in -PENDING, or it could not be searched, so the document at the held head is not shown to be the final one. The journal read has not run"; exit 1; }
echo "banner:        final (it carries no mark that ends in -PENDING)"
SIDE=$(git show ${TIP}:docs/migration-apply-0108.sha256) || { echo "STOP: the sidecar could not be read at the held head. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0108.md" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${TIP}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0108 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0108}" ] || { echo "STOP: 0108 at the held head is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${TIP}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0107 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "0107:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0107 at the held head is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${TIP}:scripts/db/precheck-0108-pack-instance-consuming-sessions.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check at the held head is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${TIP}:scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
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
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0108-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 105' /tmp/0108-journal-before.out || { echo "STOP: the journal read does not say 105. Nothing was applied"; exit 1; }
echo "${TIP}" > /tmp/0108-start-head.sha || { echo "STOP: the held head could not be recorded. Nothing was applied"; exit 1; }
echo "held head recorded for the CLOCK CHECK: ${TIP}"
echo "BEFORE YOU START: every check passed, and the journal reads 105."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `window end: ... happens once ...`; four `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `held head now:` and `held head:     origin/db/0108-pack-read-function IS the commit this block names`; `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `banner: final ...`, `sidecar:`; `migration:`, `0107:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 105` (and 0108 listed as pending on that ref); `held head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 105.` Exit 0. It writes nothing to production. **The banner check catches only a mark that ends in `-PENDING` on the document's third line; it is a tripwire, not the gate. DOCSHA is the gate.** An applied marker under 12 hours old stops the block.

## STAGE 0: the held head, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0108.sha256
MIG=packages/db/migrations/0108_pack_instance_consuming_sessions.sql
SHA0108=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPREV=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPRE=ac0765325157257fc5ddee1281222f359d35eb526d76b0ebda62d8caa9f7fd80
SHAPOST=c70e5258c951ec5c32c477e9e31da50a159c036afc616da23ddc452ad14989cc
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0108-applied.ok || { AGE=$(find /tmp/0108-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0108 in this sitting, or the age of /tmp/0108-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0108-head.sha /tmp/0108-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so the held head may be stale. Nothing was applied"; exit 1; }
TIP=$(git rev-parse origin/db/0108-pack-read-function) || { echo "STOP: the held head, origin/db/0108-pack-read-function, could not be read. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0108 is not on disk at the held head, so it is not the branch that carries 0108"; exit 1; }
N108=$(find packages/db/migrations -maxdepth 1 -name '0108_*.sql' | wc -l | tr -d ' ')
[ "${N108}" = 1 ] || { echo "STOP: ${N108} files claim migration number 0108, not 1"; exit 1; }
N107=$(find packages/db/migrations -maxdepth 1 -name '0107_*.sql' | wc -l | tr -d ' ')
[ "${N107}" = 1 ] || { echo "STOP: ${N107} files claim migration number 0107, not 1"; exit 1; }
test -f scripts/db/precheck-0108-pack-instance-consuming-sessions.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0108}" ] || { echo "STOP: 0108 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0108-pack-instance-consuming-sessions.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===106&&e.idx===105&&e.tag==='0108_pack_instance_consuming_sessions'&&e.when===1788502900000&&p.idx===104&&p.tag==='0107_record_annulments_insert_policy'&&p.when===1788502800000?0:1)" || { echo "STOP: the newest journal entry is not idx 105, tag 0108_pack_instance_consuming_sessions, when 1788502900000, of 106, after idx 104 tagged 0107_record_annulments_insert_policy at when 1788502800000"; exit 1; }
test -f packages/db/migrations/0107_record_annulments_insert_policy.sql || { echo "STOP: the file of journal idx 104 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0107_record_annulments_insert_policy.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0107 on disk is not the file this document pins"; exit 1; }
echo "0107 on disk: 0107_record_annulments_insert_policy.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0108-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '106 .sql files match 106 journal entries' /tmp/0108-check-journal.out || { echo "STOP: check-journal did not reconcile 106 files with 106 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0108 creates one function and touches no table, but R9 allows clinic hours only when all three proofs hold, and the third (a pre-check read on production in an earlier sitting) does not. So it runs in closed hours only. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=yes
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${TIP} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it creates one function, its grants and its comment, and touches no table)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0108 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0108 is closed hours only, whatever the three proofs read (the third does not hold), and the sitting waits. Nothing was applied"; exit 1; fi

echo "${TIP}" > /tmp/0108-head.sha || { echo "STOP: the sha could not be recorded in /tmp/0108-head.sha. Nothing was applied"; exit 1; }
echo "running from the held head ${TIP}, recorded in /tmp/0108-head.sha"
echo "0108 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `the held head and HEAD: <sha>`, the held head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0108.md: OK`; `newest journal entry: idx 105, when 1788502900000, tag 0108_pack_instance_consuming_sessions, of 106; before it idx 104, when 1788502800000, tag 0107_record_annulments_insert_policy`; `0107 on disk: ...`; check-journal's line with `106 .sql files match 106 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (proof 2 `yes`, proof 3 `no`; they decide nothing here); `R9: closed hours by the weekday table. 0108 runs in closed hours only`; `running from the held head <sha>, recorded in /tmp/0108-head.sha`; then `0108 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

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
test ! -f /tmp/0108-applied.ok || { AGE=$(find /tmp/0108-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0108 was applied in this sitting (/tmp/0108-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0108-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0108-start-head.sha || { echo "STOP: BEFORE YOU START recorded no held head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0108-start-head.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0108-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0108-head.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0108-head.sha -nt /tmp/0108-start-head.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0108-start-head.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0108-head.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "held head at BEFORE YOU START: ${START}"
echo "recorded by stage 0:            ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: the held head moved between BEFORE YOU START and stage 0: the branch was pushed to during the sitting. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0108.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0108 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
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
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0108-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0108-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0108-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `window end: ... happens once ...`; `held head at BEFORE YOU START: <sha>` and `recorded by stage 0:            <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0108-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0108_pack_instance_consuming_sessions.sql
SHA0108=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPREV=56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a
SHAPRE=ac0765325157257fc5ddee1281222f359d35eb526d76b0ebda62d8caa9f7fd80
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0108-applied.ok || { AGE=$(find /tmp/0108-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0108 in this sitting, or the age of /tmp/0108-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0108-precheck.new || { echo "STOP: the old /tmp/0108-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the held head must still be the sha stage 0 recorded."
test -f /tmp/0108-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0108-head.sha) || { echo "STOP: stage 0's record /tmp/0108-head.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/db/0108-pack-read-function) || { echo "STOP: the held head, origin/db/0108-pack-read-function, could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "the held head now:   ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0108.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0108 is not on disk"; exit 1; }
test -f scripts/db/precheck-0108-pack-instance-consuming-sessions.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N108=$(find packages/db/migrations -maxdepth 1 -name '0108_*.sql' | wc -l | tr -d ' ')
[ "${N108}" = 1 ] || { echo "STOP: ${N108} files claim migration number 0108, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0108}" ] || { echo "STOP: 0108 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0108-pack-instance-consuming-sessions.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T107=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[104];process.stdout.write(p&&p.idx===104&&p.tag==='0107_record_annulments_insert_policy'?p.tag:'none')") || { echo "STOP: node could not read journal idx 104's tag at the recorded sha. Nothing was applied"; exit 1; }
W107=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[104];process.stdout.write(p&&p.idx===104&&p.tag==='0107_record_annulments_insert_policy'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 104's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W107}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0107's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T107}.sql || { echo "STOP: the file of journal idx 104 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T107}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0107 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0107: packages/db/migrations/${T107}.sql, sha256 ${SHAPREV}, journal when ${W107}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0108-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0108-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0108-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0108-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0108-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0108-pack-instance-consuming-sessions.sql -c "rollback" 2>&1 | tee /tmp/0108-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0108-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0108-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0108-precheck.new || true)
[ "${OKS}" = 13 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 13. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, the packs as they are, idle_in_transaction_session_timeout): they decide nothing in this block, and the lead reads them"

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
D2=yes
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it creates one function, its grants and its comment, and touches no table)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0108 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0108 is closed hours only, whatever the three proofs read (the third does not hold), and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0108-postcheck.out /tmp/0108-stage2.ok /tmp/0108-journal-after.out /tmp/0108-apply.out /tmp/0108-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0108-precheck.new /tmp/0108-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0108-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0108-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0108_pack_instance_consuming_sessions --sha256 ${SHA0108} --expect-pending 1 2>&1 | tee /tmp/0108-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0108-apply.out holds it). Whether 0108 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0108-applied.ok || { echo "STOP: verified-migrate exited 0, so 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0108-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0108 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `the held head now:   <sha>`, the same sha twice; `docs/migration-apply-0108.md: OK`; `0107: packages/db/migrations/0107_record_annulments_insert_policy.sql, sha256 56c310cd..., journal when 1788502800000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 13 OK (the journal verdicts 10 and 11 naming 0108 absent and 0107 the newest row at 1788502800000, the SECURITY DEFINER count 36 as verdict 9, and the row `journal_rows_before` reading 105, which is verdict 12's row and one of the 13), 7 CARRY rows (rows 20 to 26) and 3 INFO rows; then `the pre-check profile: 13 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row and the CARRY `probe_instances`.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0108 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0108-apply.out`: `pending    1  [0108_pack_instance_consuming_sessions]`, the drizzle-kit banner, `journal    105 -> 106  (delta 1)` and `0108_pack_instance_consuming_sessions present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal, as production does: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`. They are not errors and decide nothing.
- `0108 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL, a VACUOUS, or an OK count that is not 13 is such a STOP. The apply is the only writing command in this document. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition, but exit 3 or 4 can also follow a committed apply. A lock it cannot take in 5 seconds is a clean failure with nothing applied (`journal    105 -> 105  (delta 0)`); it is still a halt.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0108=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPOST=c70e5258c951ec5c32c477e9e31da50a159c036afc616da23ddc452ad14989cc
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0108-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0108 APPLIED, then 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0108 APPLIED, then 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0108-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0108 APPLIED, then 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0108-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0108-head.sha) || { echo "STOP: stage 0's record /tmp/0108-head.sha could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/0108-pack-read-function) || { echo "STOP: the held head, origin/db/0108-pack-read-function, could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "the held head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0108.sha256 || { echo "STOP: this document is not the approved one. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0108_pack_instance_consuming_sessions.sql || { echo "STOP: 0108 is not on disk. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql || { echo "STOP: the post-check is not on disk. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0108_pack_instance_consuming_sessions.sql | cut -d' ' -f1)" = "${SHA0108}" ] || { echo "STOP: 0108 on disk is not the approved file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0108-window.ok || { echo "STOP: no run window is recorded for this sitting. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0108-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0108-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0108-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0108-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0108-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
PM=$(carry policies_md5)
FB=$(carry functions_before)
FM=$(carry functions_md5)
S=$(carry secdef_before)
RM=$(carry relation_acl_md5)
PI=$(carry probe_instances)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${PM}" ] && [ -n "${FB}" ] && [ -n "${FM}" ] && [ -n "${S}" ] && [ -n "${RM}" ] && [ -n "${PI}" ] || { echo "STOP: a carry did not parse out of the transcript. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${FB} ${S} ${PI}" | grep -qxE '[0-9]+( [0-9]+){4}' || { echo "STOP: a count carry is not a number. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${FM} ${RM}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){2}' || { echo "STOP: an md5 carry is not 32 hex characters. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} policies_md5=${PM} functions_before=${FB} functions_md5=${FM} secdef_before=${S} relation_acl_md5=${RM} probe_instances=${PI}"
WVAC=0
WOK=13
if [ "${PI}" = 0 ]; then WVAC=1; WOK=12; fi
echo "the post-check profile this sitting must print: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL, and no other (probe_instances=${PI}: verdict 6 reads VACUOUS exactly when it is 0; a VACUOUS verdict is not a pass, and a verdict that is missing prints no FAIL)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0108-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v policies_md5="${PM}" -v functions_before="${FB}" -v functions_md5="${FM}" -v secdef_before="${S}" -v relation_acl_md5="${RM}" -v probe_instances="${PI}" -c "begin read only" -f scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql -c "rollback" 2>&1 | tee /tmp/0108-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0108-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0108-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0108-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}, the number probe_instances allows. A VACUOUS verdict is not a pass. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0108 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0108}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0108 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0108 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0108-stage2.ok || { echo "STOP: the pass mark /tmp/0108-stage2.ok could not be written, so the closing read would refuse. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0108 POST-CHECK PASSED. 13/13 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; public.pack_instance_consuming_sessions(uuid) is there as the migration makes it, the SECURITY DEFINER count is one more than ${S}, and every other function (${FB} before), every policy (${PB} in all) and every privilege is as before. Paste the closing journal read now."
)
```

**EXPECT:** the carries line (eight carries, `journal_rows_before=105`, `secdef_before=36`); `the post-check profile this sitting must print: 13 OK / 0 VACUOUS / 0 FAIL, and no other (probe_instances=<n> ...` (or `12 OK / 1 VACUOUS / 0 FAIL` when `probe_instances=0`); the post-check's table with that profile (verdict 6 `<n> instances called; <n> answered in full and in order; <n> refused all four others`, verdict 8 `37, 0 not owned by postgres`, verdict 11 `1 row, newest is 0108, when 1788502900000; control 1`, verdict 12 `106`); `journal rows before=105 after=106, 0108 present by hash`; the last three journal rows, 0108's sha256 newest; then `0108 POST-CHECK PASSED. ...`. Exit 0.

**VERDICT 6 CALLS THE FUNCTION ON PRODUCTION'S OWN PACKS, READ ONLY.** For up to 20 pack instances with a consuming visit, it sets the JWT claims inside its own read-only transaction (`set_config(..., true)`, transaction-local) to the owner of the instance's tenant and compares the function's answer with a direct read, as one ordered list of ids; then to four callers who must get nothing. It prints counts only, and puts the claims back. It writes nothing: the transaction is READ ONLY (verdict 0) and the function is STABLE.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0108 APPLIED, then 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0108-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0108 APPLIED, then 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0108-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0108-head.sha) || { echo "STOP: stage 0's record /tmp/0108-head.sha could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0108.sha256 || { echo "STOP: this document is not the approved one. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/0108-pack-read-function) || { echo "STOP: the held head, origin/db/0108-pack-read-function, could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0: ${REC}"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0108-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0108-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0108-stage2.ok -newer /tmp/0108-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0108-window.ok || { echo "STOP: no run window is recorded for this sitting. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0108-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0108-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0108-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 106' /tmp/0108-journal-after.out || { echo "STOP: the journal read after the apply does not say 106. Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0108_pack_instance_consuming_sessions[.]sql$' /tmp/0108-journal-after.out || { echo "STOP: the journal read does not list 0108 as APPLIED. Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0108-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0108-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 106, 0108 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 106`, the line `APPLIED  0108_pack_instance_consuming_sessions.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 106, 0108 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after stage 2 printed its last line; after any STOP, never.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `13 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 13: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `13 OK / 0 VACUOUS / 0 FAIL` when `probe_instances` is above 0; `12 OK / 1 VACUOUS / 0 FAIL` when it is 0 | Any FAIL: STOP, the state is UNKNOWN. An OK or VACUOUS count that is not the one the carry names: STOP, the write stands. A psql exit that is not 0: STOP, which says it read nothing |

**The pre-check, `scripts/db/precheck-0108-pack-instance-consuming-sessions.sql`: 13 verdicts OK, 7 more CARRY rows, 3 INFO rows.** READ ONLY. Verdicts 0 to 2: the transaction is read only; the session is `postgres` (control: `authenticated` is not); it reads `patient_pack_instances`, `patients` and `appointments` past their policies (control: `authenticated` does not). 3: no function of the new name exists (control: `jwt_role()` resolves). 4: `patients_select`, whose terms the function restates, is as 0096 left it, by md5. 5: every function the body calls, by its flags, owner, EXECUTE and body md5, and `auth.uid()`. 6: the eleven columns the body reads, the two output types and the label `cancelled`. 7: the five roles and plpgsql. 8: Postgres 17. 9: the SECURITY DEFINER functions are 36, all owned by `postgres`. **The journal:** 0108 absent by hash with 0107 found once as the control (10), 0107 the newest row by hash at its `when` 1788502800000 (11), and 105 rows (12, the row `journal_rows_before`, which stage 2 carries). The seven other carries: `policies_before`, `policies_md5`, `functions_before`, `functions_md5`, `secdef_before`, `relation_acl_md5`, `probe_instances`. The INFO rows: the server version; the packs as they are (counts only); `idle_in_transaction_session_timeout`.

**The post-check, `scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql`: 13 verdicts.** READ ONLY. 0 and 1 repeat the pre-check's frame. 2 to 5: the function's signature and result, its flags and body md5, EXECUTE by `has_function_privilege` (authenticated only; no PUBLIC item; the ACL printed), and its comment. 6: its answers on production's own packs (OK, VACUOUS when there is none to call it for, or FAIL). 7 to 10 compare the carries: one function more and every other unchanged, the SECURITY DEFINER count one more, every policy and every relation privilege unchanged. **The journal:** 0108 present once by hash as the newest row at its `when` 1788502900000, with 0107 found once as the control (11), and the journal moved by exactly one from `journal_rows_before` (12).

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, nothing changed (`journal    105 -> 105  (delta 0)`).
- **After the COMMIT, going back is one statement,** run after the two SET LOCAL lines, in one transaction: `DROP FUNCTION public.pack_instance_consuming_sessions(uuid);`. It writes no row and loses none, and it takes only the function's own lock. Until application code calls the function nothing notices it is gone; once code calls it, that code must go back first. Run on the throwaway of 2026-10-26; after it the pre-check read its starting profile again once the journal row was also removed on the throwaway.
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch; the SECURITY DEFINER count moves back in its own GATE-CHANGE. The journal row of 0108 stays: a journal row is never deleted. **GREEN never runs that statement from this document; SOLO never runs it at all; and no block here contains it.**

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | Launch GREEN and hand it SOLO's dispatch, which names `0108_pack_instance_consuming_sessions.sql` | after the R4 round, the independent rehearsal, SOLO's READY line and the pull request opened held; in closed hours, inside its run window | the sitting, from the held head: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 2 | Read GREEN's report on 0108 | when it arrives | if it carries a STOP: nothing is pasted again, and the lead rules |
| 3 | Merge the count's GATE-CHANGE (`EXPECTED_COUNT` 36 to 37) | after GREEN's clean report | `main` reads red on the count until click 5 |
| 4 | (SOLO) `main` merged into this pull request, CI green on that head | right after click 3 | nothing by itself |
| 5 | On this pull request: take `held-for-apply` off, then merge | right after step 4 | `main` and production agree again |
| 6 | Merge the skip guard's GATE-CHANGE (below) | after click 5 | the new suite's absence from CI becomes red |

## GATE-CHANGES

- **None before the apply.** No gate file is edited by this branch.
- **The SECURITY DEFINER count, after the apply (click 3), its own pull request:** `packages/db/scripts/check-security-definer-owner.mjs`, `EXPECTED_COUNT` 36 to 37, with its comment naming 0108 and `public.pack_instance_consuming_sessions(uuid)`, and `.github/gate-manifest.json` regenerated. Until it merges, this branch reads red, by construction: the DB-gated job's count step (`expected exactly 36 SECURITY DEFINER function(s) in public, found 37`) and `packages/db/tests/security-definer-owner.test.ts` (7 of its 28 arms, every one the count; 28 of 28 with the count at 37, measured on 2026-10-26). `packages/db/tests/security-definer-execute-acl.db.test.ts` needs no edit: the function is executable by `authenticated` and by no other role it names.
- **After the merge, ONE more, the owner's (click 6), its own pull request:** `.github/scripts/assert-rls-executed.mjs` lists `pack-instance-consuming-sessions.db.test.ts` (`hard: true`), with `.github/gate-manifest.json` regenerated. It cannot merge first: the skip guard would look for a file `main` does not have yet.
- **A fault-injection test for this document's blocks** is the new file `scripts/pack-instance-consuming-sessions-0108.test.mjs`, run by `pnpm test:scripts`. Adding one trips no gate; it is frozen at the next GATE-CHANGE after it lands.

## Who gets rows, and who gets nothing

Proven as assigned principals (`authenticated`, with the tenant, the role and the user id in the claims) by `packages/db/tests/pack-instance-consuming-sessions.db.test.ts`: one tenant, two clinics, a pack whose visits are at both clinics with three practitioners, and a second patient seen at one clinic only. Every staff answer is also held against the caller's own read of `patients` under `patients_select`, in the same run.

| who | the pack's patient | answer |
|---|---|---|
| the owner | any of the tenant | every consuming visit, in order |
| an admin or a receptionist with no clinic row | any of the tenant | every consuming visit, in order |
| an admin or a receptionist with clinic rows | one their clinics reach (an appointment there, or the primary clinic) | every consuming visit, in order, at every clinic |
| an admin or a receptionist with clinic rows | one their clinics do not reach | nothing |
| anyone with a staff role | one they created | every consuming visit, in order |
| a therapist, with or without clinic rows | one they treat (either practitioner, the patient in either slot) | every consuming visit, in order, at every clinic |
| a therapist | one on whose care team they are, at one of their own clinics | every consuming visit, in order |
| a therapist | one they neither treat nor follow | nothing |
| a patient's JWT, a JWT with no staff role, another tenant's caller, no claims | any | nothing |
| the `patient` role, `anon`, `service_role`, PUBLIC | any | no EXECUTE (asserted in the catalogue, never by a call) |

**"Consuming" is the balance's own definition** (`PACK_CONSUMING_STATUS_SQL`, `packages/db/src/pack-balance.ts`): every linked visit whose status is not `cancelled`. The suite holds the row count to `packLinkedCountSql`, read as the owner reads it, for every instance of the fixture.

## Rehearsal

To be written after the rehearsal.

## NOT REHEARSED, said one by one

To be written after the rehearsal.

## Review history

- **2026-10-26:** authored at its number, with its check files, its suite, its blocks, its sidecar and its script test. One mutation sweep over the function's predicate on lane amber: 20 mutants, 20 killed by the suite (three survived the first pass, all three fixture gaps, closed in the fixture). Not yet reviewed.
