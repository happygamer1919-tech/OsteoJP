NOT READY: awaiting R4 review
# 0109: apply the Saturday hours columns

**Nothing in this document may be pasted yet.** Its first line says why, and BEFORE YOU START refuses any copy of this document whose first line begins `NOT READY`: SOLO removes that line, and only that line, at the READY line, after the R4 round and the independent rehearsal. Then come the pull request's state (#1682, held, `held-for-apply`, unarmed) and GREEN's dispatch, which carries the values this document cannot hold (the held head's sha as HELD, this document's sha256 at that head as DOCSHA, and the run window as WOPEN, WSTART and WEND). **The sitting runs from the pull request's HELD head, before the merge** (see "Applied from the held head"), **in closed hours only, on its own night** (see "Closed hours, the night, and the lock").

**Status: AUTHORED 2026-10-31 (the migration at `257412ee`; this document, its two check files and its fault-injection test after it, on `db/HOR-02-saturday-closing-time`). REHEARSED 2026-10-31 (13:25 TO 13:28 LISBON, WET) BY BLUE, A SESSION THAT DID NOT AUTHOR THE BLOCKS, ON ITS LANE AT PRODUCTION'S POSITION, AT `8acd79c3` (see "Rehearsal record"). NOT REVIEWED. NOT APPLIED ANYWHERE BUT A THROWAWAY.** One migration, `packages/db/migrations/0109_location_saturday_hours.sql`, sha256 `ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a`, journal idx 106, tag `0109_location_saturday_hours`, five statements (the two SET LOCAL lines, one ALTER TABLE, two COMMENTs).

**In plain language.** Each clinic gets two new empty fields: the time it opens on Saturday and the time it closes on Saturday. A rule on the table refuses a clinic with only one of the two filled in, or with a Saturday that closes at or before it opens. This migration fills in nothing: every clinic reads "no Saturday hours recorded" after it, which is exactly how the staff app treats every clinic today. The owner's 09:00 to 13:00 is written later by a separate data operation (`docs/data-op-0109-saturday-hours.md`, a draft with its own review and its own ruling). Nobody gains or loses access to anything: the two fields are readable and writable by exactly the roles that read and write the weekday hours.

Six blocks, each pasted whole, on its own and in this order: BEFORE YOU START (network time, the held head, every pin, the document's first line, production's journal), stage 0 (the files, the journal, the clock and the head it runs from), CLOCK CHECK (the start window, recorded), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check and the journal) and the closing journal read. GREEN pastes BEFORE YOU START and CLOCK CHECK from its dispatch, where SOLO has filled their five value lines; the copies here carry `PENDING` in those lines and STOP at their first check. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0109 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed; GREEN's dispatch carries it in the same words.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **Stage 2 is READ ONLY, every psql call of it**: nothing after the apply opens a transaction that could write (see "The CHECK's refusals, and why no block writes to prove them"). **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/location-saturday-hours-0109.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**The check files count, and the blocks count again.** No check file ends with an error on a FAIL verdict: each prints its rows and exits 0. The blocks count OK, VACUOUS and FAIL in the transcript and require the whole profile: `12 OK / 0 VACUOUS / 0 FAIL` of the pre-check, `14 OK / 0 VACUOUS / 0 FAIL` of the post-check. **A psql exit that is not 0 on any of them means the read did not complete** (a carry not handed in, a lost connection, an object that is not there, a lock not taken in time). Stage 2's STOP on the post-check's own run says so, and never that 0109 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## What must happen first, in this order, and none of it by GREEN

1. **DONE: `0108` is applied to production and merged.** GREEN applied it on 2026-10-31 between 00:28 and 00:33 Lisbon; production's journal reads 106, `0108` at idx 105, sha256 `7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb`.
2. **DONE 2026-10-31: the migration at its number,** with its journal entry and its mirror (`257412ee`), its DB-gated suite `packages/db/tests/location-saturday-hours.db.test.ts`, and, after it, this document, its sidecar, its two check files and its fault-injection test.
3. **OPEN: the R4 round** on this document, the two check files and the script test.
4. **DONE 2026-10-31: the rehearsal of the blocks by a session that did not write them** (BLUE, at `8acd79c3`, this document's sha256 `4cb1ef07...`), on a throwaway at production's position (0000 to 0108 applied, at least one active clinic), under the lead's rule of 2026-09-30. **The throwaway's drizzle journal was built by hand from the files**, as 0108's rehearsal did: a local lane is migrated by `supabase db reset` and records in `supabase_migrations.schema_migrations`, not in `drizzle.__drizzle_migrations`, so the rehearsal created `drizzle.__drizzle_migrations` and inserted one row per entry of the journal on `main`, in `idx` order, each row's `hash` the sha256 of that migration file's bytes and its `created_at` the entry's `when`: 106 rows, the newest `0108` at 1788502900000. It READ the three values pinned here without a database, and each matched (see "Rehearsal record"). A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so ("NOT REHEARSED, said one by one").
5. **OPEN: #1678 has settled, and the night is 0109's own (R38):** no other apply and no data op in the same sitting.
6. **OPEN: SOLO's READY line,** which is the removal of this document's first line, with the sidecar regenerated in the same commit.
7. **OPEN: SOLO fills GREEN's dispatch:** HELD (the held head's sha), DOCSHA (this document's sha256 at that head) and a run window while every clinic is closed, on a night R38 and R39 allow, whose end is not in a repeated hour.

## Written at its number

The number is the next free one after 0108, ruled by strategy on 2026-10-31 (R38). The file is in `packages/db/migrations`, with its journal entry and its mirror in the same branch, as 0108's was.

| Fact | Value |
|---|---|
| Ruling | Strategy, 2026-10-31 (R38): 0109, after 0108, Tier C, held; its own night, never with another apply, not before #1678 settles. R41 (standing): SOLO removes `held-for-apply` and merges only after GREEN reports 0109 in the journal |
| Migration | `packages/db/migrations/0109_location_saturday_hours.sql`, written at its number. sha256 `ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a` |
| Journal | `idx 106`, tag `0109_location_saturday_hours`, `when` 1788503100000. Stage 0 asserts it and 0108's entry before it. Production's journal goes 106 to 107 |
| Mirror | `supabase/migrations/0109_location_saturday_hours.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0108`, sha256 `7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb`, journal `idx 105`, `when` 1788502900000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | **the pull request's HELD head, `origin/db/HOR-02-saturday-closing-time`, never a merge commit on main.** BEFORE YOU START checks it against HELD. Stage 0 records the sha in `/tmp/0109-head.sha`; every later stage checks out that recorded sha, and the CLOCK CHECK and stage 1 HALT if the held head has moved since |
| This document | `docs/migration-apply-0109.md`, pinned by `docs/migration-apply-0109.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own (DOCSHA) |
| Pre-check | `scripts/db/precheck-0109-location-saturday-hours.sql`, READ ONLY, 12 verdicts (11 is the row `journal_rows_before`), 6 more CARRY rows and 5 INFO rows, run inside the block's own `begin read only`. sha256 `28541a46185d7cb10e7b2148804d0943095f7e2e8865b35b447f93cf34fac143` |
| Post-check | `scripts/db/postcheck-0109-location-saturday-hours.sql`, READ ONLY, 14 verdicts (verdict 7 can read VACUOUS, and the block stops on it), seven carries in, run inside the block's own `begin read only`. sha256 `9a62cbc3f67aa0bb35b0be50ca2eb2c167c45ab65b806e520c9f952f560a99b3` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (BEFORE YOU START's journal read and the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0108's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch (WOPEN, WSTART, WEND in its BEFORE YOU START and CLOCK CHECK), never in a stage block: the CLOCK CHECK records the start window in `/tmp/0109-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block.** **Its end may not fall in a repeated hour** |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then `ALTER TABLE public.locations` adding `saturday_opens_at time` and `saturday_closes_at time` (both nullable, no default) and the CHECK `locations_saturday_hours_valid`; a comment on each column |
| What it never touches | every row (no value is written; every row reads NULL in both), every other column, constraint, trigger and index of `locations`, every other table, every policy, every grant, every function. The post-check proves what its verdicts read: the two columns (3, 4), the CHECK (5, 6), every row NULL (7), the grants (8), the rest of `locations` (9), every policy and every relation privilege in `public` (10, 11), the journal (12, 13). It does not read default privileges or functions: for those the proof is the migration itself, pinned by its sha256 |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0109.sha256` and every block checks it, by `shasum -a 256 -c` or against DOCSHA. Every amendment of this document, the removal of its first line included, moves its sha256; the sidecar is regenerated in the same commit (`shasum -a 256 docs/migration-apply-0109.md > docs/migration-apply-0109.sha256`, as 0108's was), and `scripts/location-saturday-hours-0109.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`.

## Closed hours, the night, and the lock

**Closed hours only, and not R9-eligible.** R9 allows a clinic-hours sitting only when all three of its proofs hold. Proof 1 (the SET LOCAL gate, `scripts/migration-timeouts.test.mjs`, hashed at the held head against SHAGATE) holds when the gate file is on that head. Proof 2 (catalog-only, or no table reception writes) is NOT claimed: the migration alters `public.locations` under ACCESS EXCLUSIVE, a table every booking read joins, and validates its CHECK by a scan of it. **Proof 3 does not hold: the read-only pre-check has not run on production in an earlier sitting.** So the blocks have no daytime path and no override.

**The clinic-hours table these blocks check, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed.** The owner answered on 2026-10-31 that the clinics are open on Saturday from 09:00 to 13:00, which narrows the Saturday row strategy ruled on 2026-10-03 (S-1003-A, R29: 08:00 to 13:00). **These blocks keep 08:00, on purpose:** it treats Saturday 08:00 to 08:59 as open, which only ever refuses a minute the owner's hours would allow, never the other way; it is the row in `CLAUDE.md`; and the clock program is then byte for byte 0108's, which a rehearsal has already run. It changes nothing a dispatch can name: strategy's start windows (below) never start a sitting between 06:30 and 20:59, so no start window touches Saturday 08:00 to 09:00 either way.

**BEFORE YOU START and the CLOCK CHECK check the clock by machine against the table and against strategy's start windows; stage 0 and stage 1 check it against the table; stage 1 also reads every active clinic's own weekday hours** (a clinic whose `opens_at` or `closes_at` is not set, or reaches outside 08:00 to 21:00, stops the sitting). Every clock read carries `TZ=Europe/Lisbon`, reads the zone's name in the same `date` call, and STOPs unless it is WET or WEST.

**The night (R38, R39).** 0109 has its own night: no other apply and no data op in the same sitting, and not before #1678 settles. The dispatch names the night; the blocks hold the clock to it by machine (the start window the clock is in must lie inside the run window the dispatch names). **R39: no sitting on Sunday 2026-11-01 before 23:00.** The blocks satisfy it without a date in any block and without a new branch in the clock: a dispatch for that night names a run window that opens at 21:00 that Sunday, lets stage 1 start until 06:29 Monday and ends at 08:00 Monday. Every minute of the Sunday then STOPs (Sunday's start window opens at 00:00 Sunday, before the window the dispatch names), and the sitting can start from 00:00 Monday. The hour 23:00 to 23:59 Sunday is given up, deliberately, rather than adding a clock path no rehearsal has run. The script test proves both edges (Sunday 22:59 and 23:30 STOP, Monday 00:00 passes) on the harness's own calendar.

**No apply window may end inside a repeated hour (strategy, 2026-10-25).** On the night the clocks go back (the last Sunday of October), 01:00 to 01:59 Lisbon happens twice. BEFORE YOU START and the CLOCK CHECK each STOP, before anything else runs, when WEND falls 01:00 to 01:59 on the last Sunday of October, by arithmetic on the typed value. 0108's lines, unchanged.

**The lock, measured by the rehearsal (BLUE, PostgreSQL 17.6, 2026-10-31).** `ALTER TABLE ... ADD COLUMN` of a nullable column with no default rewrites no row; `ADD CONSTRAINT ... CHECK` validates by one scan of `locations`, a table of a handful of rows. The ALTER TABLE took **5.2 ms**. The locks the transaction held until its end, as read inside it: **ACCESS EXCLUSIVE on `public.locations`**, and, for information, **SHARE UPDATE EXCLUSIVE on `locations`** (the CHECK's validation), **ROW EXCLUSIVE on `graphql.seq_schema_version`** (pg_graphql's DDL event trigger, which counts schema changes) and ROW EXCLUSIVE on `pg_description` (the two COMMENTs). While it waits for the ACCESS EXCLUSIVE lock, and while it holds it, every other session that reads `locations` (every booking read joins it) queues behind it. **Two bounds:** `lock_timeout` 5s, the migration's first statement, so a lock it cannot take in 5 seconds (an open transaction that has read `locations`, an idle-in-transaction session) fails the apply clean with nothing applied; and `statement_timeout` 60s (both read back inside the transaction as `5s` and `1min`). The pre-check's INFO rows print the locks other sessions hold on `locations` and `idle_in_transaction_session_timeout`, for the report. **What a lock timeout looks like here (rehearsed, with a second session holding a lock on `locations`):** drizzle-kit prints **`undefined`** where the error should be, after its `applying migrations...` spinner, and pnpm reports `Command failed with exit code 1: drizzle-kit migrate`; verified-migrate then prints `journal    106 -> 106  (delta 0)` and `0109_location_saturday_hours present by sha256: NO` and **exits 4**, about **5 seconds** after it started (6 s of wall time in the rehearsal, start-up included). Nothing was applied. **GREEN reads those three signs (exit 4, delta 0, about 5 s), not the missing error text;** stage 1 prints its STOP (`the apply exited 4 ...`); GREEN pastes nothing else, not stage 1 again, and reports the whole output. Whether and when to try again is the lead's call.

## Applied from the held head, before the merge, and which commit the sitting runs from

**The record supports the held head, and this document runs from it.** `CLAUDE.md` ("Which commit a sitting runs from") records two kinds. `0100` and `0101` were merged first and applied from the merge commit on `main`; `0102` and `0108` (SECURITY DEFINER functions, which a required check counts on a database built from `main`) were applied from the held head. **0109 creates no SECURITY DEFINER function, so nothing forces either kind; three things decide it:**

- **R41, standing:** SOLO removes `held-for-apply` and merges only after GREEN reports 0109 in the journal. A pull request that may not merge before the apply cannot be the merge commit the apply runs from.
- **Strategy's S-1004-A:** "Any held-for-apply PR waits for the owner's label removal after GREEN reports." `CLAUDE.md` records that `0101` followed the older precedent instead and the lane reported the difference; every apply since (`0102` to `0108`) ran from a held head or merged first for a reason this file does not have.
- **Nothing on `main` needs 0109 first.** The staff app asks the catalogue whether BOTH columns exist and reads them only then (`packages/db/src/location-saturday.ts`, on `main` since HOR-01), and the columns are deliberately not in the Drizzle schema. So `main` builds, tests and serves the same before and after the apply.

**No SECURITY DEFINER count moves, so there is no count GATE-CHANGE and `main` never reads red because of this pull request.** That part of 0108's order does not apply. The order is:

| # | Step | Who |
|---|---|---|
| 1 | GREEN applies 0109 from this pull request's HELD head, with this document | GREEN, on the owner's dispatch |
| 2 | `main` is merged into this pull request (merge, never rebase), and CI reads green on that head | SOLO |
| 3 | `held-for-apply` comes off, and this pull request merges (R41). If the harness refuses either, it is not retried (R5): the owner's two clicks | SOLO under R41, else the owner |
| 4 | The data op, `docs/data-op-0109-saturday-hours.md`, only on its own R4 round and strategy's ruling on when it runs | GREEN, on its own dispatch |

**Between steps 1 and 3, production is one migration ahead of `main`.** The daily `prod-drift-check` reports a journal row with no matching file on `main` in that window; that report is correct, and it ends at step 3. The application behaves the same before and after the apply: both columns are NULL on every row, and NULL is "no Saturday hours", which is what the app does today.

**Every block of this document names `origin/db/HOR-02-saturday-closing-time` and none names `origin/main`.** The `held-for-apply` label keeps the branch where it is: a labelled pull request cannot merge (`.github/workflows/held-for-apply-blocks-merge.yml`) and `.github/workflows/auto-update-prs.yml` does not merge `main` into it, so the head GREEN runs from does not move under the sitting.

- **Two shas are compared only as checked variables.** Every sha a block compares (the held head, the recorded sha, the worktree's HEAD, the sha in the run window record, stage 2's pass mark) is first read into a variable and refused unless it is 40 hex characters.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve the held branch again, print both, and HALT on any difference with `STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting.` It runs before the environment is loaded and before psql.
- **Stage 2 and the closing read** run from the recorded sha whatever the branch has done since: each prints whether it moved, with both shas, and never stops on it. A fetch that fails, or a held branch that cannot be read, is a STOP in every block.

## What GREEN's dispatch carries, and the two blocks it fills

The dispatch is SOLO's, outside the repository, as for 0103 to 0108. It carries this document's BEFORE YOU START and CLOCK CHECK blocks with five lines filled, and nothing else changed in them:

- `HELD`: the held head of the pull request, a full 40-character sha (BEFORE YOU START only);
- `DOCSHA`: this document's sha256 at that head (both blocks);
- `WOPEN`, `WSTART` and `WEND`: the run window, three Lisbon times `YYYYMMDDHHMM` (both blocks): it opens, the last minute stage 1 may start, and its end. WEND may not fall in a repeated hour. For the night R39 names, see "The night" above.

In this document the five lines read `PENDING`, so a block pasted from here STOPs at its first check with nothing run. **BEFORE YOU START also reads this document's first line at the held head and STOPs if it begins `NOT READY`, so a dispatch filled from a head where the READY line has not happened stops before the journal read.** The CLOCK CHECK writes ONE line to `/tmp/0109-window.ok`: the sha stage 0 recorded, then the start window it is in (opens, stage 1 starts by, ends before), which stage 1, stage 2 and the closing read each read by machine.

**THE START WINDOWS (strategy's S-1002-D P1.4, as the dispatches of 0100 to 0108 hold them), read from the clock, never typed.** Stage 1 starts inside one: Monday to Saturday 21:00 to 22:29 (everything before 08:00 the next morning) or 00:00 to 06:29 (everything before 08:00 that morning); Sunday any hour (stage 1 by Monday 06:29, everything before Monday 08:00). The two dispatch blocks stop unless the start window the clock is in lies inside the run window the dispatch names. Two judgments carried over from 0101's to 0108's dispatches, SOLO's and not rulings: Saturday 13:00 to 20:59 is closed by the table and is not a start window; Sunday is one window.

**THE MACHINE'S CLOCK IS HELD AGAINST NETWORK TIME, BY MACHINE, TWICE, ON THREE SOURCES** (BEFORE YOU START and the CLOCK CHECK): `sntp time.apple.com` (up to three attempts; within 5 seconds), and the Date headers of https://api.github.com and https://www.cloudflare.com (each with `curl -sI --max-time 8`; within 30 seconds). The clock is accepted when at least one of the three can be read and every one that was read agrees; the block STOPs if none can be read, and STOPs if any one that was read disagrees. GREEN never sets the clock. These lines are 0108's, unchanged.

## BEFORE YOU START: network time, the held head, every pin, production's journal. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
WOPEN='PENDING: set with the run window'
WSTART='PENDING: set with the run window'
WEND='PENDING: set with the run window'
SHA0109=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPREV=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPRE=28541a46185d7cb10e7b2148804d0943095f7e2e8865b35b447f93cf34fac143
SHAPOST=9a62cbc3f67aa0bb35b0be50ca2eb2c167c45ab65b806e520c9f952f560a99b3
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
MIG=packages/db/migrations/0109_location_saturday_hours.sql
PREVMIG=packages/db/migrations/0108_pack_instance_consuming_sessions.sql
READER=packages/db/scripts/read-applied-migrations.mjs
PTM=scripts/production-target.mjs

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. The journal read has not run"; exit 1; }
echo "${DOCSHA} ${SHA0109} ${SHAPREV} ${SHAPRE} ${SHAPOST} ${SHAVM} ${SHAGUARD} ${SHAPTM} ${SHAREADER} ${SHACJ}" | grep -qxE '[0-9a-f]{64}( [0-9a-f]{64}){9}' || { echo "STOP: a sha256 in this block is still PENDING, so it is NOT READY. The journal read has not run"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the run window in this block (WOPEN, WSTART, WEND) is still PENDING, or is not three Lisbon times YYYYMMDDHHMM, so it is NOT READY. The journal read has not run"; exit 1; }
[ "${WOPEN}" -le "${WSTART}" ] || { echo "STOP: the run window this block names is out of order: it opens at ${WOPEN}, after ${WSTART}, the last minute it lets stage 1 start. The journal read has not run"; exit 1; }
[ "${WSTART}" -lt "${WEND}" ] || { echo "STOP: the run window this block names is out of order: ${WSTART}, the last minute it lets stage 1 start, is not before its end ${WEND}. The journal read has not run"; exit 1; }
if awk -v w="${WEND}" 'BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }'; then echo "window end:    ${WEND} happens once on the Lisbon clock (it is not in the hour the clocks repeat, 01:00 to 01:59 on the last Sunday of October)"; else echo "STOP: the run window's end ${WEND} falls in the hour the Lisbon clocks repeat (01:00 to 01:59 on the last Sunday of October, when they go back), or it could not be decided. No apply window may end inside a repeated hour (strategy, 2026-10-25): the blocks compare wall time, so such a window could let stage 1 start up to an hour late. The journal read has not run"; exit 1; fi
test ! -f /tmp/0109-applied.ok || { AGE=$(find /tmp/0109-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0109 was applied in this sitting (/tmp/0109-applied.ok is there and under 12 hours old), or its age could not be read. BEFORE YOU START is never pasted after the apply. Nothing was changed"; exit 1; }
rm -f /tmp/0109-start-head.sha /tmp/0109-window.ok || { echo "STOP: the previous sitting's records could not be cleared. The journal read has not run"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0109 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. The journal read has not run"; exit 1; }
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
TIP=$(git rev-parse origin/db/HOR-02-saturday-closing-time) || { echo "STOP: the held head, origin/db/HOR-02-saturday-closing-time, could not be read. The journal read has not run"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. The journal read has not run"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the branch was pushed to since the READY line, or it is gone. The journal read has not run"; exit 1; }
echo "held head:     origin/db/HOR-02-saturday-closing-time IS the commit this block names"
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. The journal read has not run"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. The journal read has not run"; echo "${STRAY}"; exit 1; }
WAS=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. The journal read has not run"; exit 1; }
echo "worktree:      clean, on ${WAS}"
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. The journal read has not run"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. The journal read has not run"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. The journal read has not run"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. The journal read has not run"; exit 1; }
echo "checked out:   ${TIP}, the held head, so the read below runs the reader it holds"
DOC=$(git show ${TIP}:docs/migration-apply-0109.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. The journal read has not run"; exit 1; }
BAN=$(git show ${TIP}:docs/migration-apply-0109.md | sed -n 1p) || { echo "STOP: the document's first line could not be read. The journal read has not run"; exit 1; }
[ -n "${BAN}" ] || { echo "STOP: the document's first line read empty. The journal read has not run"; exit 1; }
echo "${BAN}" | grep -qvE '^NOT READY|[A-Z]-PENDING' || { echo "STOP: the document's first line begins NOT READY or carries a mark that ends in -PENDING, or it could not be searched, so the document at the held head is not the READY one. The journal read has not run"; exit 1; }
echo "first line:    READY (it does not begin NOT READY and carries no mark that ends in -PENDING)"
SIDE=$(git show ${TIP}:docs/migration-apply-0109.sha256) || { echo "STOP: the sidecar could not be read at the held head. The journal read has not run"; exit 1; }
echo "sidecar:       ${SIDE}"
[ "${SIDE}" = "${DOCSHA}  docs/migration-apply-0109.md" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. The journal read has not run"; exit 1; }
SM=$(git show ${TIP}:${MIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0109 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "migration:     ${SM}"
[ "${SM}" = "${SHA0109}" ] || { echo "STOP: 0109 at the held head is not the approved body. The journal read has not run"; exit 1; }
SP=$(git show ${TIP}:${PREVMIG} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: 0108 could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "0108:          ${SP} (${PREVMIG})"
[ "${SP}" = "${SHAPREV}" ] || { echo "STOP: 0108 at the held head is not the file this block pins. The journal read has not run"; exit 1; }
SPRE=$(git show ${TIP}:scripts/db/precheck-0109-location-saturday-hours.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the pre-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
echo "pre-check:     ${SPRE}"
[ "${SPRE}" = "${SHAPRE}" ] || { echo "STOP: the pre-check at the held head is not the approved file. The journal read has not run"; exit 1; }
SPOST=$(git show ${TIP}:scripts/db/postcheck-0109-location-saturday-hours.sql | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the post-check could not be read and hashed at the held head. The journal read has not run"; exit 1; }
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
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0109-journal-before.out || { echo "STOP: the journal read failed; its lines are above. Nothing was applied"; exit 1; }
grep -qx 'journal rows on production: 106' /tmp/0109-journal-before.out || { echo "STOP: the journal read does not say 106. Nothing was applied"; exit 1; }
echo "${TIP}" > /tmp/0109-start-head.sha || { echo "STOP: the held head could not be recorded. Nothing was applied"; exit 1; }
echo "held head recorded for the CLOCK CHECK: ${TIP}"
echo "BEFORE YOU START: every check passed, and the journal reads 106."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `window end: ... happens once ...`; four `network time:` lines (one per source, then the summary; a source that could not be read prints `NOT READ (...)` and is a pass while one other was read); `Lisbon now: ... closed by the weekday table`; `start window: ...`, `run window: ...` and `the night: ...`; `held head now:` and `held head:     origin/db/HOR-02-saturday-closing-time IS the commit this block names`; `worktree: clean, on <sha>`; `checked out: <sha>`; `document:`, `first line: READY ...`, `sidecar:`; `migration:`, `0108:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:`, each the pinned sha256; the reader's lines IN FULL, with `journal rows on production: 106` (and 0109 listed as not applied on that ref); `held head recorded for the CLOCK CHECK: <sha>`; then `BEFORE YOU START: every check passed, and the journal reads 106.` Exit 0. It writes nothing to production. **The first-line check is a tripwire for a dispatch filled before the READY line; DOCSHA is the gate.** An applied marker under 12 hours old stops the block.

## STAGE 0: the held head, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0109.sha256
MIG=packages/db/migrations/0109_location_saturday_hours.sql
SHA0109=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPREV=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPRE=28541a46185d7cb10e7b2148804d0943095f7e2e8865b35b447f93cf34fac143
SHAPOST=9a62cbc3f67aa0bb35b0be50ca2eb2c167c45ab65b806e520c9f952f560a99b3
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0109-applied.ok || { AGE=$(find /tmp/0109-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0109 in this sitting, or the age of /tmp/0109-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0109-head.sha /tmp/0109-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so the held head may be stale. Nothing was applied"; exit 1; }
TIP=$(git rev-parse origin/db/HOR-02-saturday-closing-time) || { echo "STOP: the held head, origin/db/HOR-02-saturday-closing-time, could not be read. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0109 is not on disk at the held head, so it is not the branch that carries 0109"; exit 1; }
N109=$(find packages/db/migrations -maxdepth 1 -name '0109_*.sql' | wc -l | tr -d ' ')
[ "${N109}" = 1 ] || { echo "STOP: ${N109} files claim migration number 0109, not 1"; exit 1; }
N108=$(find packages/db/migrations -maxdepth 1 -name '0108_*.sql' | wc -l | tr -d ' ')
[ "${N108}" = 1 ] || { echo "STOP: ${N108} files claim migration number 0108, not 1"; exit 1; }
test -f scripts/db/precheck-0109-location-saturday-hours.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0109-location-saturday-hours.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0109}" ] || { echo "STOP: 0109 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0109-location-saturday-hours.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0109-location-saturday-hours.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===107&&e.idx===106&&e.tag==='0109_location_saturday_hours'&&e.when===1788503100000&&p.idx===105&&p.tag==='0108_pack_instance_consuming_sessions'&&p.when===1788502900000?0:1)" || { echo "STOP: the newest journal entry is not idx 106, tag 0109_location_saturday_hours, when 1788503100000, of 107, after idx 105 tagged 0108_pack_instance_consuming_sessions at when 1788502900000"; exit 1; }
test -f packages/db/migrations/0108_pack_instance_consuming_sessions.sql || { echo "STOP: the file of journal idx 105 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0108_pack_instance_consuming_sessions.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0108 on disk is not the file this document pins"; exit 1; }
echo "0108 on disk: 0108_pack_instance_consuming_sessions.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0109-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '107 .sql files match 107 journal entries' /tmp/0109-check-journal.out || { echo "STOP: check-journal did not reconcile 107 files with 107 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0109 is closed hours only. R9 allows clinic hours only when all three proofs hold, and the third (a pre-check read on production in an earlier sitting) does not. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it alters public.locations under ACCESS EXCLUSIVE, which every booking read joins, and scans it to validate its CHECK)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0109 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0109 is closed hours only, whatever the three proofs read (the third does not hold), and the sitting waits. Nothing was applied"; exit 1; fi

echo "${TIP}" > /tmp/0109-head.sha || { echo "STOP: the sha could not be recorded in /tmp/0109-head.sha. Nothing was applied"; exit 1; }
echo "running from the held head ${TIP}, recorded in /tmp/0109-head.sha"
echo "0109 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `the held head and HEAD: <sha>`, the held head BEFORE YOU START printed; the sidecar line `docs/migration-apply-0109.md: OK`; `newest journal entry: idx 106, when 1788503100000, tag 0109_location_saturday_hours, of 107; before it idx 105, when 1788502900000, tag 0108_pack_instance_consuming_sessions`; `0108 on disk: ...`; check-journal's line with `107 .sql files match 107 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (proof 2 `no`, proof 3 `no`; they decide nothing here); `R9: closed hours by the weekday table. 0109 runs in closed hours only`; `running from the held head <sha>, recorded in /tmp/0109-head.sha`; then `0109 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

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
test ! -f /tmp/0109-applied.ok || { AGE=$(find /tmp/0109-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: 0109 was applied in this sitting (/tmp/0109-applied.ok is there and under 12 hours old), or its age could not be read. The CLOCK CHECK is never pasted after the apply. Nothing was changed"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied. Do not paste stage 1"; exit 1; }
rm -f /tmp/0109-window.ok || { echo "STOP: the old window record could not be cleared. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0109-start-head.sha || { echo "STOP: BEFORE YOU START recorded no held head in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0109-start-head.sha -mmin -120)" ] || { echo "STOP: BEFORE YOU START's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
test -f /tmp/0109-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. Nothing was applied. Do not paste stage 1"; exit 1; }
[ -n "$(find /tmp/0109-head.sha -mmin -120)" ] || { echo "STOP: stage 0's record is over two hours old, so it is not this sitting's. Nothing was applied. Do not paste stage 1"; exit 1; }
[ /tmp/0109-head.sha -nt /tmp/0109-start-head.sha ] || { echo "STOP: stage 0's record is not newer than BEFORE YOU START's, so the order of this sitting is wrong. Nothing was applied. Do not paste stage 1"; exit 1; }
START=$(cat /tmp/0109-start-head.sha) || { echo "STOP: BEFORE YOU START's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
REC=$(cat /tmp/0109-head.sha) || { echo "STOP: stage 0's record could not be read. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${START}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: BEFORE YOU START's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record is not a full sha. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "held head at BEFORE YOU START: ${START}"
echo "recorded by stage 0:            ${REC}"
[ "${REC}" = "${START}" ] || { echo "STOP: the held head moved between BEFORE YOU START and stage 0: the branch was pushed to during the sitting. Nothing was applied. Do not paste stage 1. Report both shas above"; exit 1; }
DOC=$(git show ${REC}:docs/migration-apply-0109.md | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the recorded sha. Nothing was applied. Do not paste stage 1"; exit 1; }
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
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0109 is closed hours only (R9's third proof, a pre-check read on production in an earlier sitting, does not hold), so its sitting is closed hours only, and it has no override. Nothing was applied. Do not paste stage 1"; exit 1; }
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
echo "${REC} ${SOPEN} ${SSTART} ${SEND}" > /tmp/0109-window.ok || { echo "STOP: the window could not be recorded. Nothing was applied. Do not paste stage 1"; exit 1; }
WREAD=$(cat /tmp/0109-window.ok) || { echo "STOP: the window record could not be read back. Nothing was applied. Do not paste stage 1"; exit 1; }
[ "${WREAD}" = "${REC} ${SOPEN} ${SSTART} ${SEND}" ] || { echo "STOP: the window record does not read back as written. Nothing was applied. Do not paste stage 1"; exit 1; }
echo "run window recorded in /tmp/0109-window.ok: ${WREAD}"
echo "CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now."
)
```

**EXPECT:** `window end: ... happens once ...`; `held head at BEFORE YOU START: <sha>` and `recorded by stage 0:            <sha>`, the same sha twice; `document at the recorded sha: <DOCSHA>`; the four `network time:` lines; `Lisbon now: ... closed by the weekday table`; `start window: ...` and `run window: ...`; `run window recorded in /tmp/0109-window.ok: <sha> <opens> <last minute> <ends>`; then `CLOCK: closed hours by the weekday table, inside the run window the dispatch names, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now.` Exit 0. It touches no database.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0109_location_saturday_hours.sql
SHA0109=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPREV=7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb
SHAPRE=28541a46185d7cb10e7b2148804d0943095f7e2e8865b35b447f93cf34fac143
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0109-applied.ok || { AGE=$(find /tmp/0109-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0109 in this sitting, or the age of /tmp/0109-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0109-precheck.new || { echo "STOP: the old /tmp/0109-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the held head must still be the sha stage 0 recorded."
test -f /tmp/0109-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0109-head.sha) || { echo "STOP: stage 0's record /tmp/0109-head.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/db/HOR-02-saturday-closing-time) || { echo "STOP: the held head, origin/db/HOR-02-saturday-closing-time, could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "the held head now:   ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0109.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0109 is not on disk"; exit 1; }
test -f scripts/db/precheck-0109-location-saturday-hours.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N109=$(find packages/db/migrations -maxdepth 1 -name '0109_*.sql' | wc -l | tr -d ' ')
[ "${N109}" = 1 ] || { echo "STOP: ${N109} files claim migration number 0109, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0109}" ] || { echo "STOP: 0109 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0109-location-saturday-hours.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T108=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[105];process.stdout.write(p&&p.idx===105&&p.tag==='0108_pack_instance_consuming_sessions'?p.tag:'none')") || { echo "STOP: node could not read journal idx 105's tag at the recorded sha. Nothing was applied"; exit 1; }
W108=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[105];process.stdout.write(p&&p.idx===105&&p.tag==='0108_pack_instance_consuming_sessions'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 105's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W108}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0108's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T108}.sql || { echo "STOP: the file of journal idx 105 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T108}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0108 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0108: packages/db/migrations/${T108}.sql, sha256 ${SHAPREV}, journal when ${W108}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0109-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0109-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0109-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0109-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0109-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f scripts/db/precheck-0109-location-saturday-hours.sql -c "rollback" 2>&1 | tee /tmp/0109-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0109-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0109-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. No verdict of this pre-check may read VACUOUS, and a VACUOUS verdict is not a pass. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0109-precheck.new || true)
[ "${OKS}" = 12 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 12. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the server version, the clinics as they are, the opens_at grants, the locks other sessions hold on locations, idle_in_transaction_session_timeout): they decide nothing in this block, and the lead reads them"

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
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (opens_at < time '08:00' or closes_at > time '21:00' or opens_at is null or closes_at is null)) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1) || { echo "STOP: the clinics' own hours could not be read (psql's lines are above). Nothing was applied"; exit 1; }
echo "active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row, or are not set: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=inside; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=outside; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "the clinics' own rows against the weekday table: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on the held head (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, not claimed (it alters public.locations under ACCESS EXCLUSIVE, which every booking read joins, and scans it to validate its CHECK)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0109 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0109 is closed hours only, whatever the three proofs read (the third does not hold), and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0109-postcheck.out /tmp/0109-stage2.ok /tmp/0109-journal-after.out /tmp/0109-apply.out /tmp/0109-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0109-precheck.new /tmp/0109-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0109-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only command in this document that can leave a write behind. Its full output is teed to /tmp/0109-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0109_location_saturday_hours --sha256 ${SHA0109} --expect-pending 1 2>&1 | tee /tmp/0109-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. A lock not taken in 5 seconds reads journal 106 -> 106 (delta 0) above and applied nothing; it is still a halt. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0109-apply.out holds it). Whether 0109 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0109-applied.ok || { echo "STOP: verified-migrate exited 0, so 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0109-applied.ok could not be written, so stage 2 would refuse; stage 2 runs only on the owner's or the lead's word"; exit 1; }
echo "0109 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `the held head now:   <sha>`, the same sha twice; `docs/migration-apply-0109.md: OK`; `0108: packages/db/migrations/0108_pack_instance_consuming_sessions.sql, sha256 7f481ae4..., journal when 1788502900000`.
- The run window line, with now inside it; the target guard's `host:`, `port:`, `ref:` and `target verified: production, session pooler.`
- The pre-check's table: 12 OK (verdict 3 `0 of 2; control 1`, verdict 4 `0 named; control 1`, verdict 5 `0 with a column ACL; control true`, the journal verdicts 9 and 10 naming 0109 absent and 0108 the newest row at 1788502900000, and the row `journal_rows_before` reading 106, which is verdict 11's row and one of the 12), 6 CARRY rows and 5 INFO rows; then `the pre-check profile: 12 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, every INFO row ...`. **GREEN reports, as printed, every INFO row and the CARRY `locations_rows`.**
- `run window, again before the apply: ...`; the clock again, `closed`, `active clinics ...: 0 of <n>` with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0109 runs in closed hours only`.
- verified-migrate's lines, teed to `/tmp/0109-apply.out`: `pending    1  [0109_location_saturday_hours]`, the drizzle-kit banner, `journal    106 -> 107  (delta 1)` and `0109_location_saturday_hours present by sha256: yes`. **Inside the drizzle-kit banner, two NOTICE objects are expected** on a database that already holds drizzle's journal, as production does: code `42P06`, `schema "drizzle" already exists, skipping`, and code `42P07`, `relation "__drizzle_migrations" already exists, skipping`. They are not errors and decide nothing.
- `0109 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL, a VACUOUS, or an OK count that is not 12 is such a STOP. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition, but exit 3 or 4 can also follow a committed apply. **A lock it cannot take in 5 seconds is a clean failure with nothing applied, and here it does not say so in words:** drizzle-kit prints `undefined` instead of the lock-timeout error. **Its signs are exit 4, `journal    106 -> 106  (delta 0)` with `present by sha256: NO`, and about 5 seconds between the apply line and the STOP** (rehearsed, see "The lock" above). It is still a halt, and GREEN reports it and runs nothing else.

## STAGE 2: the post-check and the journal, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0109=ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a
SHAPOST=9a62cbc3f67aa0bb35b0be50ca2eb2c167c45ab65b806e520c9f952f560a99b3
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0109-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0109 APPLIED, then 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0109 APPLIED, then 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0109-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0109 APPLIED, then 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0109-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0109-head.sha) || { echo "STOP: stage 0's record /tmp/0109-head.sha could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/HOR-02-saturday-closing-time) || { echo "STOP: the held head, origin/db/HOR-02-saturday-closing-time, could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "the held head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0109.sha256 || { echo "STOP: this document is not the approved one. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0109_location_saturday_hours.sql || { echo "STOP: 0109 is not on disk. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0109-location-saturday-hours.sql || { echo "STOP: the post-check is not on disk. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0109_location_saturday_hours.sql | cut -d' ' -f1)" = "${SHA0109}" ] || { echo "STOP: 0109 on disk is not the approved file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0109-location-saturday-hours.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0109-window.ok || { echo "STOP: no run window is recorded for this sitting. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0109-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0109-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0109-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0109-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0109-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
PM=$(carry policies_md5)
RM=$(carry relation_acl_md5)
LR=$(carry locations_rows)
LS=$(carry locations_shape_md5)
OG=$(carry opens_at_grants_md5)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${PM}" ] && [ -n "${RM}" ] && [ -n "${LR}" ] && [ -n "${LS}" ] && [ -n "${OG}" ] || { echo "STOP: a carry did not parse out of the transcript. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${LR}" | grep -qxE '[0-9]+( [0-9]+){2}' || { echo "STOP: a count carry is not a number. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${RM} ${LS} ${OG}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){3}' || { echo "STOP: an md5 carry is not 32 hex characters. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} policies_md5=${PM} relation_acl_md5=${RM} locations_rows=${LR} locations_shape_md5=${LS} opens_at_grants_md5=${OG}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0109-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v policies_md5="${PM}" -v relation_acl_md5="${RM}" -v locations_rows="${LR}" -v locations_shape_md5="${LS}" -v opens_at_grants_md5="${OG}" -c "begin read only" -f scripts/db/postcheck-0109-location-saturday-hours.sql -c "rollback" 2>&1 | tee /tmp/0109-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. If psql's lines say a relation or a column does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0109-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0109, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0109-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0109-postcheck.out || true)
[ "${VACS}" = 0 ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not 0. A VACUOUS verdict is not a pass: locations read no row to hold NULL. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = 14 ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not 14. A verdict that is missing prints no FAIL. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0109 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0109, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0109}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0109 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0109, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0109 present by hash"
echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0109-stage2.ok || { echo "STOP: the pass mark /tmp/0109-stage2.ok could not be written, so the closing read would refuse. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the blocks after it run again only on the owner's or the lead's word"; exit 1; }
echo "0109 POST-CHECK PASSED. 12/12 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; both Saturday columns and their CHECK are there as the migration makes them, every one of the ${LR} rows is NULL in both, and every other column of locations, every policy (${PB} in all) and every privilege is as before. Paste the closing journal read now."
)
```

**EXPECT:** the carries line (seven carries, `journal_rows_before=106`); the post-check's table, `14 OK / 0 VACUOUS / 0 FAIL` (verdict 3 `1; time without time zone/nullable/no default/16b8e2cb...`, verdict 4 `1; time without time zone/nullable/no default/f88333ba...`, verdict 5 `1 named; c/validated CHECK (...)`, verdict 6 `admitted,admitted,refused,refused,refused,refused`, verdict 7 `0 set of <n> rows`, verdict 12 `1 row, newest is 0109, when 1788503100000; control 1`, verdict 13 `107`); `journal rows before=106 after=107, 0109 present by hash`; the last three journal rows, 0109's sha256 newest; then `0109 POST-CHECK PASSED. ...`. Exit 0. It writes nothing: every psql call opens `begin read only`.

### The CHECK's refusals, and why no block writes to prove them

**No block writes after the apply.** An attempted write is the only direct proof that the server refuses a half pair or a backwards pair, and a READ ONLY transaction refuses an UPDATE (25006) before any CHECK is evaluated, so such a proof would need a read-write transaction on production after the commit. It would buy nothing the post-check does not already prove, and a classifier refusal in the middle of stage 2 would leave the sitting half-reported. So the proof is split three ways, and none of it writes on production:

- **In CI:** `packages/db/tests/location-saturday-hours.db.test.ts` (13 of 13 at `466042e4`) writes real rows against the migration and holds the refusals by the CHECK's name: one end alone, closing at opening, closing before opening, and closing after the weekday opening but before the Saturday one; both NULL and both set are admitted, and an UPDATE that would leave one end alone is refused.
- **On the throwaway:** the rehearsal (step 4 of "What must happen first") runs the blocks after the apply, where a write is at no one's expense, and records what it read.
- **On production:** verdict 5 pins the CHECK's exact `pg_get_constraintdef` text, its type (`c`) and that it is validated; verdict 6 evaluates the stored expression itself, read from the catalogue, on six literal pairs, READ ONLY. A validated CHECK with that exact definition on `locations` is the one the CI suite exercised.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0109 APPLIED, then 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0109-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0109 APPLIED, then 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0109-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0109-head.sha) || { echo "STOP: stage 0's record /tmp/0109-head.sha could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0109.sha256 || { echo "STOP: this document is not the approved one. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/HOR-02-saturday-closing-time) || { echo "STOP: the held head, origin/db/HOR-02-saturday-closing-time, could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0: ${REC}"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0109-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0109-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0109-stage2.ok -newer /tmp/0109-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0109-window.ok || { echo "STOP: no run window is recorded for this sitting. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0109-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0109-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1) || { echo "STOP: the migration reader could not be hashed at the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the reader's target module could not be hashed at the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0109-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 107' /tmp/0109-journal-after.out || { echo "STOP: the journal read after the apply does not say 107. Stage 1 recorded that it applied 0109, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0109_location_saturday_hours[.]sql$' /tmp/0109-journal-after.out || { echo "STOP: the journal read does not list 0109 as APPLIED. Stage 1 recorded that it applied 0109, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0109-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0109-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0109 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 107, 0109 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 107`, the line `APPLIED  0109_location_saturday_hours.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 107, 0109 is APPLIED, and nothing is pending on the recorded sha.` Exit 0. It runs after stage 2 printed its last line; after any STOP, never. **GREEN's report of this line is what R41 waits for.**

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `12 OK / 0 VACUOUS / 0 FAIL` | Any FAIL, any VACUOUS, or an OK count that is not 12: stage 1's own STOP, nothing applied. A psql exit that is not 0: STOP, nothing applied |
| Post-check | `14 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: STOP, the state is UNKNOWN. A VACUOUS, or an OK count that is not 14: STOP, the write stands. A psql exit that is not 0: STOP, which says it read nothing |

**The pre-check, `scripts/db/precheck-0109-location-saturday-hours.sql`: 12 verdicts OK, 6 more CARRY rows, 5 INFO rows.** READ ONLY. 0: the transaction is read only. 1: the session is `postgres` (control: `authenticated` is not). 2: it reads `locations` past its policies (control: `authenticated` does not). 3: neither new column exists (control: `opens_at` is found). 4: no constraint `locations_saturday_hours_valid` in `public` (control: `locations_open_before_close` is found once). 5: no column of `locations` carries a column-level grant, the migration's premise (control: `authenticated` may SELECT `opens_at`). 6: `opens_at` and `closes_at` are `time without time zone`. 7: the five roles exist. 8: Postgres 17. **The journal:** 0109 absent by hash with 0108 found once as the control (9), 0108 the newest row by hash at its `when` 1788502900000 (10), and 106 rows (11, the row `journal_rows_before`, which stage 2 carries). The six other carries: `policies_before`, `policies_md5`, `relation_acl_md5`, `locations_rows`, `locations_shape_md5`, `opens_at_grants_md5`. The INFO rows: the server version; the clinics as they are (counts only); the `opens_at` grants as `role:privilege:allowed`; the locks other sessions hold on `locations` now; `idle_in_transaction_session_timeout`.

**The post-check, `scripts/db/postcheck-0109-location-saturday-hours.sql`: 14 verdicts.** READ ONLY. 0 to 2 repeat the pre-check's frame. 3 and 4: each new column once, `time without time zone`, nullable, no default, its comment by md5. 5: the CHECK once in `public`, on `locations`, `c`, validated, and its `pg_get_constraintdef` exactly the migration's. 6: its stored expression, from the catalogue, on six literal pairs (both NULL and 09:00 to 13:00 admitted; 09:00 alone, 13:00 alone, 13:00 to 09:00 and 09:00 to 09:00 refused), nothing written. 7: every existing row NULL in both, and as many rows as the pre-check counted (VACUOUS at 0 rows; the block stops on it). 8: the grants on both new columns equal those on `opens_at`, `opens_at`'s equal the carry, and no column carries a column ACL. 9: the rest of `locations` (every other column, constraint, trigger, index, and its RLS flags) gives the carry `locations_shape_md5`. 10 and 11: every policy and every relation privilege in `public` unchanged. **The journal:** 0109 present once by hash as the newest row at its `when` 1788503100000, with 0108 found once as the control (12), and the journal moved by exactly one from `journal_rows_before` (13).

## Rehearsal record

### The independent rehearsal, 2026-10-31: the blocks ran as far as a throwaway lets them, and matched

**By BLUE, a session that did not author the blocks,** on its lane (a local Supabase stack, PostgreSQL 17.6), never production. Saturday 2026-10-31, **13:25 to 13:28 Lisbon (WET)**. The document at `8acd79c3`, sha256 `4cb1ef07b04167e10e9f95d378fd6b1ea2e8117463d99dd0d7cb592a47263cc4`, byte for byte this file at that commit. Each block was cut from the document by machine into segments, and each segment was run in a fresh `zsh -f` with a cleared environment, in GREEN's shape (`true && eval '<segment>' < /dev/null`). Its outputs are the rehearser's, outside the repository.

**The throwaway, and its journal built by hand.** BLUE's lane was reset by the lane-stack to production's migration position, `0000` to `0108` applied, and seeded with the e2e fixtures (3 `locations` rows, 2 of them active, both with weekday hours set). **The drizzle journal is not something a local lane has**, so it was built by hand from `main`'s journal, as 0108's rehearsal did: `drizzle.__drizzle_migrations` created, then one row per journal entry in `idx` order, `hash` the sha256 of the migration file's bytes and `created_at` the entry's `when`. 106 rows, the newest `0108` (`7f481ae4...`, 1788502900000), then `0107` (`56c310cd...`, 1788502800000).

**The substitutions, a to g, and nothing else.** The lead's rule of 2026-09-30 held throughout: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so."
The rehearsal prompt's substitutions, verbatim (the prompt allowed these and nothing else):
- (a) Every production connection string -> `postgresql://postgres:postgres@127.0.0.1:54622/postgres` passed directly on the command line or as the variable the block reads, set inline for that one command. Never write it into any env file.
- (b) Lines that source `~/osteojp-secrets/...` or any env file: skip them (do not read those files, ever).
- (c) `cd /Users/ivan/Projects/GitHub/osteojp-prod-apply` -> a scratch clone whose `origin` is a LOCAL BARE repo containing branch `db/HOR-02-saturday-closing-time` at 8acd79c3 (and `main` at origin/main). NEVER cd into /Users/ivan/Projects/GitHub/osteojp-prod-apply, and never run any git command there.
- (d) `/tmp/` paths in blocks -> a scratch folder.
- (e) The Lisbon clock / closed-hours check: do NOT fake the clock. If the block STOPs because now is clinic hours, record that block's clock step as NOT REHEARSED for the window and run the rest of that block's commands individually, in order, with explicit halts, saying exactly which lines you ran.
- (f) The production target guard (`assert-production-target.mjs` / `production-target.mjs`) and the applied-migrations reader's production check will refuse 127.0.0.1. That refusal is a halt for that step: record NOT REHEARSED, then continue with the next step only if the document's own later steps do not depend on the guard's output; if they do, run those later SQL files directly with psql against the throwaway (a) and say so.
- (g) The `NOT READY` first-line check: record that it STOPs as designed (prove it), then continue past it by running the remaining lines of that block individually.

One step outside (a) to (g), judged by SOLO as building the throwaway and not as passing a guard: the drizzle journal table was created by hand (106 rows from main's journal), as 0108's rehearsal did.

The two dispatch blocks were run as this document carries them (their PENDING values unfilled) and in segments; the run-window lines of stages 1, 2 and the closing read were run on their own, and STOP with no window recorded, as they must when no CLOCK CHECK has passed.

| Block | Result |
|---|---|
| BEFORE YOU START, as carried | `STOP: HELD is not a filled-in sha, so this block is NOT READY ...` |
| BEFORE YOU START, the clock (e) | `closed by the weekday table`, then `STOP: Lisbon 1325, weekday 6, is closed by the weekday table but outside strategy's start windows ...`, as it must on a Saturday afternoon |
| BEFORE YOU START, the first line (g) | `STOP: the document's first line begins NOT READY ...`, before the journal read |
| BEFORE YOU START, the rest | REHEARSED TO THE READER LINE: `held head now: 8acd79c3...`, the worktree clean, `checked out: 8acd79c3...`, `document:` and `sidecar:` both `4cb1ef07...`, and `migration:`, `0108:`, `pre-check:`, `post-check:`, `migrate:`, `guard:`, `check-journal:`, `reader:`, `module:` each the pinned sha256 |
| Stage 0 | RUN WHOLE, exit 0: `the held head and HEAD: 8acd79c3...`; `newest journal entry: idx 106, when 1788503100000, tag 0109_location_saturday_hours, of 107; before it idx 105, when 1788502900000, tag 0108_pack_instance_consuming_sessions`; check-journal 107 of 107; `closed by the weekday table` (Saturday 13:25); proofs 1 `yes`, 2 `no, not claimed`, 3 `no`; `0109 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED` |
| CLOCK CHECK | as carried: `STOP: the document's sha256 in this block is still PENDING ...`; with no BEFORE YOU START record: `STOP: BEFORE YOU START recorded no held head in this sitting ...`; the rest: the recorded sha and the document `4cb1ef07...`, then the start-window STOP of a Saturday afternoon |
| Stage 1, the run window | `STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied` |
| Stage 1, the rest | RUN (window, environment-file and guard lines left out): the HEAD CHECK, the same sha twice; the pre-check **`12 OK / 0 VACUOUS / 0 FAIL`** (verdict 3 `0 of 2; control 1`, 4 `0 named; control 1`, 5 `0 with a column ACL; control true`, 8 `170006`, 9 `0; control 1`, 10 `newest is 0108, when 1788502900000`, `journal_rows_before` 106; INFO `rows 3; active 2; active with weekday hours set 2`, locks held by others `0`); clinics `0 of 2`, inside; verified-migrate **`pending    1  [0109_location_saturday_hours]`**, the two NOTICE objects (42P06, 42P07), **`journal    106 -> 107  (delta 1)`**, `present by sha256: yes`; `0109 APPLIED. Paste stage 2 now.` |
| Stage 2, the run window | `STOP: no run window is recorded for this sitting. 0109 IS APPLIED and the write stands. ...` |
| Stage 2, the rest | RUN (window, environment-file and guard lines left out): the seven carries (`journal_rows_before=106 policies_before=108 ... locations_rows=3 ...`); the post-check **`14 OK / 0 VACUOUS / 0 FAIL`** (verdict 7 `0 set of 3 rows`, verdict 8 the same md5 three times, verdict 12 `1 row, newest is 0109, when 1788503100000; control 1`, verdict 13 `107`); `journal rows before=106 after=107, 0109 present by hash`; the last three rows, `ddce91be...` newest at 1788503100000; `0109 POST-CHECK PASSED. ...` |
| The closing read | the HEAD CHECK and the document `OK`, the held head not moved, the reader and its module the pinned sha256s; the run-window line alone: `STOP: no run window is recorded for this sitting. ...`; the reader (f): `REFUSED: ... the target's ref is not dfotoodqvmjhbdcxyaxf ...`, exit 2; the READ ONLY read in its place: journal 107 rows, 0109 by hash 1, nothing pending on the ref, no row without a file |
| The target guard (f) | `REFUSING: project ref is "postgres", not the production project.`, exit 2, in stages 1 and 2 alike |

**The three values pinned without a database, READ on the applied throwaway, each matched exactly:**
- Verdict 5's definition, as `pg_get_constraintdef` renders it: `CHECK ((((saturday_opens_at IS NULL) AND (saturday_closes_at IS NULL)) OR ((saturday_opens_at IS NOT NULL) AND (saturday_closes_at IS NOT NULL) AND (saturday_closes_at > saturday_opens_at))))`.
- Verdicts 3 and 4's comment md5s: `saturday_opens_at 16b8e2cb90a4143e8a770cae666ee0db`, `saturday_closes_at f88333bab7d166e367ae610e590e0ea3`.
- Verdict 6's six outcomes: `admitted,admitted,refused,refused,refused,refused`.

**The CHECK proof, on the throwaway only,** inside one transaction that was rolled back: each pair written to one `locations` row in its own exception block.

| # | Pair (opens / closes) | Outcome |
|---|---|---|
| 1 | 09:00 / NULL | REFUSED, sqlstate 23514, constraint `locations_saturday_hours_valid` |
| 2 | NULL / 13:00 | REFUSED, sqlstate 23514, constraint `locations_saturday_hours_valid` |
| 3 | 09:00 / 09:00 | REFUSED, sqlstate 23514, constraint `locations_saturday_hours_valid` |
| 4 | 13:00 / 09:00 | REFUSED, sqlstate 23514, constraint `locations_saturday_hours_valid` |
| 5 | NULL / NULL | ADMITTED |
| 6 | 09:00 / 13:00 | ADMITTED (`09:00:00/13:00:00`) |

After the ROLLBACK: `0` rows with a Saturday value, of `3`.

**The lock and the lock-timeout path** are recorded under "The lock" above: the ALTER TABLE took 5.2 ms; with a second session holding a lock on `locations`, verified-migrate exited 4 with `journal    106 -> 106  (delta 0)`, about 6 s of wall time, and nothing applied.

**One segment did not parse,** the first cut of stage 2's run-window lines (`parse error near ')'`): the cut ended inside an `if`, a fault of the segment, not of a block line. A smaller cut of the same lines ran and STOPPED as it must.

## Rollback

**There is no automatic rollback, and nobody runs one from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, a lock not taken in 5 seconds included, nothing changed (`journal    106 -> 106  (delta 0)`).
- **After the COMMIT, going back is one statement,** run after the two SET LOCAL lines, in one transaction: `ALTER TABLE public.locations DROP CONSTRAINT locations_saturday_hours_valid, DROP COLUMN saturday_closes_at, DROP COLUMN saturday_opens_at;`. It takes ACCESS EXCLUSIVE on `locations` for as long as the apply did. **Before the data op it loses nothing** (every row is NULL in both). **After the data op it DESTROYS each clinic's Saturday hours**, which then exist only in the data op's audit rows. The staff app needs nothing first: it re-asks the catalogue, and a read that meets a dropped column inside a running process (42703) falls back to "no Saturday hours" inside a savepoint (`packages/db/src/location-saturday.ts`).
- **Who runs it: it is owner-confirmable and it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0109 stays: a journal row is never deleted. **GREEN never runs that statement from this document; SOLO never runs it at all; and no block here contains it.**

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | Launch GREEN and hand it SOLO's dispatch, which names `0109_location_saturday_hours.sql` | after the R4 round, the independent rehearsal, #1678 settled, and SOLO's READY line; in closed hours, inside its run window, on 0109's own night (R38, R39) | the sitting, from the held head: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 2 | Read GREEN's report on 0109 | when it arrives | if it carries a STOP: nothing is pasted again, and the lead rules |
| 3 | Only if the harness refuses SOLO under R41: take `held-for-apply` off this pull request, then merge it | after GREEN's clean report and `main` merged into the branch, CI green | `main` and production agree again |
| 4 | The data op's own dispatch | only after its R4 round and strategy's ruling on when it runs | the owner's 09:00 to 13:00 on each clinic |

## GATE-CHANGES

- **None before the apply, and none forced by it.** No gate file is edited by this branch. 0109 creates no SECURITY DEFINER function, so `EXPECTED_COUNT` does not move, and `main` never reads red because of this pull request.
- **The fault-injection test for this document's blocks** is the new file `scripts/location-saturday-hours-0109.test.mjs`, run by `pnpm test:scripts`. Adding a `scripts/*.test.mjs` is an added pin that `scripts/gate-freeze.test.mjs` tolerates (precedent #1684); it is frozen at the next GATE-CHANGE that regenerates the manifest.
- **Optional, after the merge, the owner's:** `.github/scripts/assert-rls-executed.mjs` may list `location-saturday-hours.db.test.ts` (`hard: true`), so the suite's absence from CI becomes red. It is its own GATE-CHANGE, after the merge, as 0108's is.

## NOT REHEARSED, said one by one

**A block that cannot run on the throwaway is recorded as NOT REHEARSED, and these are the lines of this document the rehearsal of 2026-10-31 could not run:**

- **The five PENDING dispatch values** (HELD, DOCSHA, WOPEN, WSTART, WEND): BEFORE YOU START and the CLOCK CHECK ran as this document carries them, unfilled, and STOPPED at their first check; their filled copies run only in GREEN's dispatch. Their window-end test is proven by the script test, not on a throwaway.
- **Network time:** the `sntp` and Date-header lines of both dispatch blocks did not run (the clock segment began at the Lisbon clock read).
- **The start-window record and every line that depends on it:** the CLOCK CHECK never wrote `0109-window.ok` (a Saturday afternoon is in no start window), so the run-window lines of stage 1, stage 2 and the closing read ran only to their STOP on a missing record, and the window comparisons after it (now inside the window, before its end) did not run on the throwaway. The script test holds them.
- **The target guard and the applied-migrations reader:** they refuse 127.0.0.1 by design (`REFUSING: project ref is "postgres"`, `REFUSED: ... the target's ref is not dfotoodqvmjhbdcxyaxf`), which is their purpose, and the lead's rule forbids getting past them. So the lines that load the production environment file, the guard's lines in stages 1 and 2, and the reader lines of BEFORE YOU START and the closing read, with the tails after them (the 106 and 107 greps, the APPLIED, pending and orphan greps, BEFORE YOU START's own writing of `0109-start-head.sha`), are NOT REHEARSED; the closing read's journal facts were read in their place by a READ ONLY `psql`.
- **The bash variant of GREEN's shape:** only `zsh -f` ran on the throwaway. The script test runs every block in bash with errexit off as well as in zsh, against stubs.
- **Production:** its `locations` rows, grants, policies, triggers and locks were not read. The pre-check pins every one it depends on, so a difference stops the sitting at the pre-check rather than passing unseen.
- **DOCSHA at the held head GREEN will run from:** the READY line (the removal of this document's first line) moves it, and any later amendment moves it again.

## Review history

- **2026-10-31:** authored, with its then three check files, its sidecar and its script test, at the migration's `257412ee`. `scripts/location-saturday-hours-0109.test.mjs`: 47 of 47, the fault injection 381 faults in bash with errexit off and 381 in zsh, every one halting or, for the network-time and R9 proof 1 calls, going on as the document allows; 66 pinned-file cases, each a STOP before anything ran with credentials. `scripts/migration-timeouts.test.mjs` and `scripts/gate-freeze.test.mjs` pass with the new file (an added pin). No SQL was run against any database. Not yet reviewed, not yet rehearsed.
- **2026-10-31, the CHECK probe removed (the coordinator's instruction, before the rehearsal):** `scripts/db/probe-0109-location-saturday-hours.sql`, its lines in stage 2, its pin in BEFORE YOU START, stage 0 and stage 2, and its test cases are gone, and the post-check's comment on verdict 6 says where the refusals are proven instead (see "The CHECK's refusals, and why no block writes to prove them"). Every psql call of every block now opens `begin read only`. After it: `scripts/location-saturday-hours-0109.test.mjs` 47 of 47, the fault injection 365 faults in bash and 365 in zsh, 60 pinned-file cases; `migration-timeouts` and `gate-freeze` 27 of 27; the document-scanning script tests (`0083-checks-quote-the-real-file`, `owner-blocks-survive-zsh`, `anexo-link-v2-data-op`, `inc-1007-rearm-reminders-emit`) 158 of 158. The data op draft now names three clinics (CB, LV and MN) and blocks on the owner's answer about Montemor.
- **2026-10-31, the rehearsal recorded (the coordinator's instruction):** BLUE's independent rehearsal of `8acd79c3` (13:25 to 13:28 Lisbon) is recorded under "Rehearsal record"; the three values pinned without a database matched and moved there; "The lock" and "WHAT THE EXIT MEANS" say what a lock timeout looks like here (drizzle-kit prints `undefined`; exit 4, delta 0, about 5 s) and list the other locks the transaction takes; the R9 proof 1 lines of stages 0 and 1 say the gate is hashed at the held head, not on main (a change to bytes in two blocks, printed text only). After it: `scripts/location-saturday-hours-0109.test.mjs` 47 of 47 (365 faults in bash and 365 in zsh, 60 pinned-file cases); `migration-timeouts` and `gate-freeze` 27 of 27; the document-scanning script tests 158 of 158. Not yet reviewed: the changed bytes take their R4 round.
