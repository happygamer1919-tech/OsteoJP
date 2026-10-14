# 0105: apply the Q9 guard (a registo and its episode name one patient)

**NOT READY. Nothing in this document may be pasted yet.** The migration is promoted to its number, on top of the branch that holds 0104. The four blocks below are 0104's blocks (`docs/migration-apply-0104.md`) with the number, the files, the pins, the journal position, the carries and the verdict profiles changed. Open, in order: 0104 applied to production with a clean report and merged; one R4 round on this document, the two check files and the script test; SOLO's READY line; the pull request, opened held; `main` merged in with CI green; the owner's two clicks; and GREEN's dispatch, which carries the three values this document cannot hold (the merge commit's sha, this document's sha256 and the run window). Until the pull request is merged every block below STOPs at its first file check, because this document is not on `origin/main`. **The sitting is closed hours only** (see "Closed hours, and the locks").

**Status: AUTHORED 2026-10-14. REHEARSED WITH LIMITS on 2026-10-14 (every line of the four blocks ran against a throwaway in bash and in zsh except five: the two that load the production environment file and the two that run the target guard, in stages 1 and 2, and the closing read's reader line; see "NOT REHEARSED"). NOT APPLIED.** One migration, `packages/db/migrations/0105_clinical_records_episode_key.sql`, sha256 `980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441`.

**In plain language.** A registo may be filed in an episode, the folder of one treatment of one patient. Today the application checks, before it files a registo, that the episode belongs to the same patient. After this migration the database holds the same rule itself:

- **A registo that names an episode names that episode's own patient, in the same clinic group.** A statement that would leave a registo in another patient's episode is refused by the database, whichever of the two tables it writes. The application already answers that refusal with the message it shows today (`episode_mismatch`).
- **A registo with no episode is not checked** and is filed as before.
- **The patient merge still moves an episode and its registos to the surviving patient together.** It does so in two steps, so the function that does it now tells the database to check the rule once, after both steps. Nothing else in that function changes.
- **Nobody sees more or less than today.** No policy, no grant, no column and no row changes. No screen changes.

It adds one index on the episodes table, one foreign key on the registos table, and replaces one function with two statements added. It writes no row and repairs none: **if a single registo already sits in another patient's episode, the sitting stops in stage 1 with nothing applied** (see the next paragraph but two).

Four blocks, each pasted whole, on its own and in order: stage 0 (the merge, the files, the clock and the head it runs from), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check) and the closing journal read. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0105 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed and no other change.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any.**

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/registo-episode-key-0105.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**Any profile but the expected one ends a check file with an error, as well.** Both check files read back the profile they printed. The pre-check raises unless it is exactly `18 OK / 0 VACUOUS / 0 FAIL`; the post-check raises unless it is exactly `20 OK / 0 VACUOUS / 0 FAIL`. So psql exits 3 and the block's own halt on the psql line fires. The blocks still count OK, VACUOUS and FAIL themselves and assert the whole profile. **So stage 2's STOP on the post-check's own run can mean three things, and says which:** a FAIL verdict printed above it is a read that does not agree with the apply (the state is UNKNOWN); no FAIL verdict but the file's own STOP naming a profile means a verdict read VACUOUS or is missing (stage 2 did not pass); neither means the read did not complete, and it confirmed nothing and contradicted nothing. It never says 0105 is applied.

**A REGISTO THE KEY WOULD REFUSE STOPS STAGE 1, WITH NOTHING APPLIED.** That is a registo that names an episode of another patient, of another tenant, or an episode that is not there. The migration would fail on it at its VALIDATE statement and roll back whole; the pre-check finds it first, so the sitting never reaches the apply. Three things stop the sitting on any count but 0, each on its own: the pre-check's verdict 6 reads FAIL; the pre-check then ends with its own STOP sentence naming the count (psql exit 3); and stage 1 reads the carried count `registos_the_key_would_refuse` out of the transcript itself and STOPs. The number goes to SOLO. The repair is not in this migration: it is its own ruled operation (strategy, dispatch S-1008-B).

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE on this branch, `db/0105-registo-episode-key`, locally:** the branch `db/0104-episode-policy` merged in; the migration promoted to its number with no byte changed (sha256 `980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441` before and after); its journal entry (`idx 102`, tag `0105_clinical_records_episode_key`, `when` 1788502600000); its mirror `supabase/migrations/0105_clinical_records_episode_key.sql`; the pending README's rows; the pre-check and the post-check in their final form; this document, its sidecar and its script test. `node scripts/check-journal.mjs` reads 103 files and 103 entries.
2. **WAITS FOR 0104:** 0104 is applied to production, GREEN's report on it is clean and its pull request is merged. One migration is in flight at a time, and nothing of 0105 is pushed before that.
3. **DONE 2026-10-14, WITH LIMITS: the rehearsal on a throwaway with 0103 and 0104 applied (the two check files and the applier by hand, the four blocks in bash and in zsh, each refusal seeded once, the one mutation sweep, the rollback and the removal; see "Rehearsal" and "NOT REHEARSED").**
4. **OPEN: R4.** The review of the pull request's diff, at most three rounds.
5. **OPEN: the pull request,** opened by SOLO held (`held-for-apply`, unarmed), only after step 2. `main` then holds 0104 as one squashed commit; this branch holds the same files commit by commit, and `main` is merged into it (no rebase).
6. **OPEN: `main` merged into the branch and CI green on that head,** before the owner's first click.
7. **OPEN, THE OWNER:** he takes `held-for-apply` off and merges. Merges to main stop from that merge until GREEN's report on 0105.
8. **OPEN: SOLO fills GREEN's dispatch** after the merge: the merge sha, this document's sha256, and a run window while both clinics are closed.

| Fact | Value |
|---|---|
| Ruling | Strategy's dispatches S-1008-B (2026-10-08) and S-1012-A (2026-10-12) number it `0105` (`CLAUDE.md`, the number table: "the Q9 guard"). Tier C. The sitting is ruled for a closed night after 0104's clean report, merged first and applied from `main`, as 0103 was |
| Migration | `packages/db/migrations/0105_clinical_records_episode_key.sql`, promoted from `packages/db/migrations-pending/NEXT-AFTER-0104_clinical_records_episode_key.sql` with no byte changed. sha256 `980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441` |
| Journal | `idx 102`, tag `0105_clinical_records_episode_key`, `when` 1788502600000 (0104's 1788502500000 plus 100000). Stage 0 asserts it and 0104's entry before it. Production's journal goes 102 to 103 |
| Mirror | `supabase/migrations/0105_clinical_records_episode_key.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0104`, body sha256 `eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9`, journal `idx 101`, `when` 1788502500000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the pull request's merge commit. Stage 0 records the sha in `/tmp/0105-main.sha`; every later stage checks out that recorded sha, and stage 1 HALTS if `origin/main` has moved since |
| This document | `docs/migration-apply-0105.md`, pinned by `docs/migration-apply-0105.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own |
| Pre-check | `scripts/db/precheck-0105-registo-episode-key.sql`, READ ONLY, 18 verdicts, 20 CARRY rows (verdict 3 prints a carried number too), 9 INFO rows and a SUMMARY row, `-v prev_hash` and `-v prev_when` required; it ends with an error on any profile but `18 OK / 0 VACUOUS / 0 FAIL`, sha256 `ec1bb9928f18e8e9fb352b20194d84d594eb13b177fd575a824759decb07545b` |
| Post-check | `scripts/db/postcheck-0105-registo-episode-key.sql`, READ ONLY, 20 verdicts and a SUMMARY row, twenty carries in; it ends with an error on any profile but `20 OK / 0 VACUOUS / 0 FAIL`, sha256 `576ce143d56040f3833d93d9d99f178609c8eea9f702a7aec351d3e44ebe0c89` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0104's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0105-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block** |
| What it changes | The three `SET LOCAL` lines, for this transaction only. Then: the unique index `clinical_episodes_id_patient_tenant_uq` on `public.clinical_episodes (id, patient_id, tenant_id)`; the foreign key `clinical_records_episode_patient_tenant_fk` from `public.clinical_records (episode_id, patient_id, tenant_id)` to those three columns, DEFERRABLE INITIALLY IMMEDIATE, added NOT VALID and validated by the next statement; and `public.merge_patients` replaced, 0005's body with two `SET CONSTRAINTS` statements added |
| What it never touches | every row, every other table, every policy, every privilege (the function's own ACL included), every other function (the SECURITY DEFINER count stays 36: **no count GATE-CHANGE after the apply**), every other constraint and index, every trigger. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0105.sha256` and every block checks it with `shasum -a 256 -c`. Every amendment of this document moves its sha256; the sidecar is regenerated in the same commit, and `scripts/registo-episode-key-0105.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`.

**The migration's own header still says it is pending and names its pending path.** Stale on purpose: a promotion changes no byte, and the sha256 above is what every pin points at. Its section 3 names line numbers as they stood on 2026-10-08; "Every writer and reader" below gives them as they stand on this head. **The function's body carries four dashes that are 0005's own bytes** (one of them inside a message the function raises); they are kept, because the body is 0005's byte for byte but for the added lines.

## Closed hours, and the locks

**Closed hours only, and R9 does not apply.** Strategy ruled closed hours for this migration (S-1008-B): it is not catalogue-only. The weekday table (Lisbon): open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00; closed Sunday. Stage 0 and stage 1 check the clock by machine against it, and stage 1 also reads every active clinic's own hours.

**The locks, measured on the throwaway on 2026-10-14** (Postgres 17.6, a local Supabase stack with 0103 and 0104 applied, the file's statements in one transaction, `pg_locks` read after each, rolled back):

| Statement | Lock taken, held until the COMMIT | Who waits |
|---|---|---|
| the three `SET LOCAL` lines | none | nobody |
| `CREATE UNIQUE INDEX` | SHARE on `public.clinical_episodes` | a write to an episode (opening one, a merge). Every read goes on |
| `ADD CONSTRAINT ... NOT VALID` | SHARE ROW EXCLUSIVE on `public.clinical_records` and on `public.clinical_episodes` | a write to a registo or to an episode: saving a draft, locking, signing, an addendum, the AI ingestion, a patient's form. Every read goes on |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE on `public.clinical_records` and ROW SHARE on `public.clinical_episodes`, both weaker than the locks already held | nobody more |
| `CREATE OR REPLACE FUNCTION` | no table lock | nobody more |

- **No table is locked against reading, and no login, storage or realtime table is locked at all.** This migration creates no policy, so the platform's locks that 0104 takes are not taken here. Measured: the only other lock is ROW EXCLUSIVE on one sequence in the platform's `graphql` schema, its own counter.
- **What waits while they are held:** every write to an episode from the first statement on, and every write to a registo from the second, until the COMMIT. Nothing fails unless it waits longer than its own timeout; it waits for the COMMIT.
- **For how long, and the assumption.** The hold is the four statements, the journal row and the COMMIT. Measured on the throwaway: on its fixture (5 episodes, 2 registos) the four statements took under 10 milliseconds in all. On invented rows written and rolled back in the same transaction (60,005 episodes; 150,002 registos, 120,002 of them in an episode, each with a form of about 2 KB; the registos table 48 MB) the index took 26 milliseconds, the ADD 1, the VALIDATE 20 and the function 2. **THE ASSUMPTION: production's two tables are no larger than that by an order of magnitude** (the registos imported from the previous system and those written since). On that assumption the locks are held for well under one second, plus one round trip through the session pooler per statement. **Production's size has not been read. The pre-check measures it:** its INFO row "the size of the work" prints the rows and the bytes of both tables (heap, and total with TOAST and indexes), and GREEN reports it as printed. The time on production **was not measured there**.
- **The bounds:** `SET LOCAL lock_timeout = '5s'` makes a lock this transaction cannot take in 5 seconds a clean failure with nothing applied (the journal reads `102 -> 102`); `SET LOCAL statement_timeout = '60s'` bounds each statement, so a VALIDATE that ran longer than a minute would fail clean too; `SET LOCAL idle_in_transaction_session_timeout = '15s'` ends a stalled session and releases its locks. None bounds how long a granted lock is held beyond that; the COMMIT does.
- **Why closed hours, then.** Reception does not write these two tables, but therapists do, all day: every save of a draft waits while the locks are held, and a sitting that met a long-running write would fail on its 5 seconds. A closed night meets neither. The pre-check's INFO row "other sessions holding or awaiting a lock on either table now" says what it found; it decides nothing.
- **A merge and a registo being filed for the same patient at the same instant.** Either may be rolled back by the database as a deadlock victim; the application already names that for both (`concurrent_change`, M-4 on `main`), and nothing is written by the one rolled back. This migration puts a second key between the two tables; the race itself was not run in this rehearsal.

## Merged before the apply, and which commit the sitting runs from

0105 adds no function (it replaces one), so no required check counts anything it adds. The pull request merges first and GREEN applies from the merge commit on `main`, as 0100, 0101 and 0103 were. **Between the merge and the apply, `main` is one migration ahead of production.** Nothing on `main` depends on the key being there: the application code is unchanged by this pull request, it has asked the same rule itself since before this migration, and it already answers the database's refusal. The suites that ask the schema whether the key exists run on either side, and from this promotion on they throw on a database built from the repository without it.

## What GREEN's dispatch carries (it is not in this document)

The dispatch is SOLO's, outside the repository, as for 0103 and 0104. It carries two blocks of its own around this document's stage 0, and three values:

- **BEFORE YOU START:** `origin/main` IS the merge commit, pinned by its full sha, and this document at that commit hashes to the sha256 the dispatch pins on its own.
- **CLOCK CHECK, after stage 0:** it checks the Lisbon clock against the run window and the weekday table, and writes ONE line to `/tmp/0105-window.ok`: the sha stage 0 recorded, then three Lisbon times `YYYYMMDDHHMM` separated by single spaces (the window opens; the last minute stage 1 may start; the window ends).
- **Its halt rule is THE HALT RULE above, in the same words.**

## STAGE 0: the merge, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0105.sha256
MIG=packages/db/migrations/0105_clinical_records_episode_key.sql
SHA0105=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPREV=eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9
SHAPRE=ec1bb9928f18e8e9fb352b20194d84d594eb13b177fd575a824759decb07545b
SHAPOST=576ce143d56040f3833d93d9d99f178609c8eea9f702a7aec351d3e44ebe0c89
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0105-applied.ok || { AGE=$(find /tmp/0105-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0105 in this sitting, or the age of /tmp/0105-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0105-main.sha /tmp/0105-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0105 is not on disk at origin/main, so the PR has not merged"; exit 1; }
N105=$(find packages/db/migrations -maxdepth 1 -name '0105_*.sql' | wc -l | tr -d ' ')
[ "${N105}" = 1 ] || { echo "STOP: ${N105} files claim migration number 0105, not 1"; exit 1; }
N104=$(find packages/db/migrations -maxdepth 1 -name '0104_*.sql' | wc -l | tr -d ' ')
[ "${N104}" = 1 ] || { echo "STOP: ${N104} files claim migration number 0104, not 1"; exit 1; }
test -f scripts/db/precheck-0105-registo-episode-key.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0105-registo-episode-key.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0105}" ] || { echo "STOP: 0105 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0105-registo-episode-key.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0105-registo-episode-key.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===103&&e.idx===102&&e.tag==='0105_clinical_records_episode_key'&&e.when===1788502600000&&p.idx===101&&p.tag==='0104_clinical_episodes_role_matrix'&&p.when===1788502500000?0:1)" || { echo "STOP: the newest journal entry is not idx 102, tag 0105_clinical_records_episode_key, when 1788502600000, of 103, after idx 101 tagged 0104_clinical_episodes_role_matrix at when 1788502500000"; exit 1; }
test -f packages/db/migrations/0104_clinical_episodes_role_matrix.sql || { echo "STOP: the file of journal idx 101 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0104_clinical_episodes_role_matrix.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0104 on disk is not the file this document pins"; exit 1; }
echo "0104 on disk: 0104_clinical_episodes_role_matrix.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0105-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '103 .sql files match 103 journal entries' /tmp/0105-check-journal.out || { echo "STOP: check-journal did not reconcile 103 files with 103 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0105 is not catalogue-only and strategy ruled closed hours for it, so only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it builds an index on public.clinical_episodes and adds a foreign key on public.clinical_records, and a write to an episode or a registo waits while it runs)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0105 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0105 is ruled closed hours only, whatever the three proofs read, and the sitting waits. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0105-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0105-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0105-main.sha"
echo "0105 MERGE, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `origin/main and HEAD: <sha>`; the sidecar line `docs/migration-apply-0105.md: OK`; `newest journal entry: idx 102, when 1788502600000, tag 0105_clinical_records_episode_key, of 103; before it idx 101, when 1788502500000, tag 0104_clinical_episodes_role_matrix`; check-journal's line with `103 .sql files match 103 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (they decide nothing here); `running from origin/main <sha>, recorded in /tmp/0105-main.sha`; then `0105 MERGE, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

**Until the pull request is merged, this stage ends at its first file check,** `STOP: the document pin is not on disk at origin/main`.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0105_clinical_records_episode_key.sql
SHA0105=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPREV=eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9
SHAPRE=ec1bb9928f18e8e9fb352b20194d84d594eb13b177fd575a824759decb07545b
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0105-applied.ok || { AGE=$(find /tmp/0105-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0105 in this sitting, or the age of /tmp/0105-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0105-precheck.new || { echo "STOP: the old /tmp/0105-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0105-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0105-main.sha) || { echo "STOP: stage 0's record /tmp/0105-main.sha could not be read. Nothing was applied"; exit 1; }
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
shasum -a 256 -c docs/migration-apply-0105.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0105 is not on disk"; exit 1; }
test -f scripts/db/precheck-0105-registo-episode-key.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N105=$(find packages/db/migrations -maxdepth 1 -name '0105_*.sql' | wc -l | tr -d ' ')
[ "${N105}" = 1 ] || { echo "STOP: ${N105} files claim migration number 0105, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0105}" ] || { echo "STOP: 0105 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0105-registo-episode-key.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T104=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[101];process.stdout.write(p&&p.idx===101&&p.tag==='0104_clinical_episodes_role_matrix'?p.tag:'none')") || { echo "STOP: node could not read journal idx 101's tag at the recorded sha. Nothing was applied"; exit 1; }
W104=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[101];process.stdout.write(p&&p.idx===101&&p.tag==='0104_clinical_episodes_role_matrix'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 101's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W104}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0104's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T104}.sql || { echo "STOP: the file of journal idx 101 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T104}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0104 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0104: packages/db/migrations/${T104}.sql, sha256 ${SHAPREV}, journal when ${W104}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0105-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0105-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0105-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0105-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0105-window.ok)
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

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W104} -f scripts/db/precheck-0105-registo-episode-key.sql 2>&1 | tee /tmp/0105-precheck.new || { echo "STOP: the pre-check did not complete, or it ended with its own STOP on a FAIL verdict, a VACUOUS verdict or a count of registos the key would refuse that is not 0 (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0105-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0105-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. A VACUOUS verdict means no registo names an episode or the table holds no episode, so that read proved nothing. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0105-precheck.new || true)
[ "${OKS}" = 18 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 18. Nothing was applied"; exit 1; }
MISF=$(awk -F'|' -v k=registos_the_key_would_refuse '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0105-precheck.new)
echo "${MISF}" | grep -qxE '[0-9]+' || { echo "STOP: the count of registos the key would refuse did not read as a number out of the pre-check transcript [${MISF}]. Nothing was applied"; exit 1; }
[ "${MISF}" = 0 ] || { echo "STOP: the pre-check counted ${MISF} registos that name an episode of another patient or tenant, or an episode that is not there. 0105 would fail on them at its VALIDATE statement and it repairs no row, so the sitting stops on any number but 0. Nothing was applied. Report the number ${MISF} to SOLO"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, every INFO row (the size of the two tables and the counts C1 to C3 among them): they are counts, they decide nothing in this block, and the lead reads them"

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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it builds an index on public.clinical_episodes and adds a foreign key on public.clinical_records, and a write to an episode or a registo waits while it runs)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0105 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0105 is ruled closed hours only, whatever the three proofs read, and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0105-postcheck.out /tmp/0105-stage2.ok /tmp/0105-journal-after.out /tmp/0105-apply.out /tmp/0105-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0105-precheck.new /tmp/0105-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0105-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0105-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0105_clinical_records_episode_key --sha256 ${SHA0105} --expect-pending 1 2>&1 | tee /tmp/0105-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0105-apply.out holds it). Whether 0105 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0105-applied.ok || { echo "STOP: verified-migrate exited 0, so 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0105-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0105 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the same sha twice.
- The run window line, with now inside it.
- The pre-check's table, then `the pre-check profile: 18 OK / 0 VACUOUS / 0 FAIL`. The CARRY row `registos_the_key_would_refuse` reads `0`, or the sitting has stopped. **GREEN reports, as printed, every INFO row** (the size of the two tables, the registos that do not fit the key by status, other sessions holding a lock, the timeout, the clock, and the three counts C1 to C3).
- The clock again, `closed`, and `the clinics' own rows against the weekday table: inside`.
- verified-migrate's lines: `journal    102 -> 103  (delta 1)` and `0105_clinical_records_episode_key present by sha256: yes`.
- `0105 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL or a VACUOUS ends with the file's own STOP, psql's error and the block's STOP. **A count of registos the key would refuse that is not 0 stops the sitting the same way,** the file's own STOP naming the count: nothing was applied, and GREEN reports the number to SOLO. Stage 1's own line reads the same count out of the transcript and would stop on it even if the file had not. The apply is the only writing command in this document. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition (on a database that already holds 0105 it reads `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`, exit 3, nothing run), but exit 3 or 4 can also follow a committed apply.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0105=980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441
SHAPOST=576ce143d56040f3833d93d9d99f178609c8eea9f702a7aec351d3e44ebe0c89
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0105-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0105 APPLIED, then 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0105 APPLIED, then 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0105-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0105 APPLIED, then 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0105-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0105-main.sha) || { echo "STOP: stage 0's record /tmp/0105-main.sha could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0105.sha256 || { echo "STOP: this document is not the approved one. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0105_clinical_records_episode_key.sql || { echo "STOP: 0105 is not on disk. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0105-registo-episode-key.sql || { echo "STOP: the post-check is not on disk. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0105_clinical_records_episode_key.sql | cut -d' ' -f1)" = "${SHA0105}" ] || { echo "STOP: 0105 on disk is not the approved file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0105-registo-episode-key.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0105-window.ok || { echo "STOP: no run window is recorded for this sitting. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0105-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0105-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0105-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0105-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0105-precheck.out; }
J=$(carry journal_rows_before)
S=$(carry secdef_before)
T=$(carry tables_before)
RR=$(carry registos_rows)
RMD=$(carry registos_md5)
ER=$(carry episodes_rows)
EM=$(carry episodes_md5)
RE=$(carry registos_in_an_episode)
RF=$(carry registos_filenode)
EF=$(carry episodes_filenode)
OC=$(carry other_constraints_md5)
OI=$(carry other_indexes_md5)
OF=$(carry other_functions_md5)
MA=$(carry merge_acl_md5)
PB=$(carry policies_before)
PM=$(carry policies_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
TM=$(carry triggers_md5)
[ -n "${J}" ] && [ -n "${S}" ] && [ -n "${T}" ] && [ -n "${RR}" ] && [ -n "${RMD}" ] && [ -n "${ER}" ] && [ -n "${EM}" ] && [ -n "${RE}" ] && [ -n "${RF}" ] && [ -n "${EF}" ] && [ -n "${OC}" ] && [ -n "${OI}" ] && [ -n "${OF}" ] && [ -n "${MA}" ] && [ -n "${PB}" ] && [ -n "${PM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${TM}" ] || { echo "STOP: a carry did not parse out of the transcript. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${S} ${T} ${RR} ${ER} ${RE} ${RF} ${EF} ${PB}" | grep -qxE '[0-9]+( [0-9]+){8}' || { echo "STOP: a count carry is not a number. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${RMD} ${EM} ${OC} ${OI} ${OF} ${MA} ${PM} ${RM} ${CM} ${DM} ${TM}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){10}' || { echo "STOP: an md5 carry is not 32 hex characters. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} secdef_before=${S} tables_before=${T} registos_rows=${RR} registos_md5=${RMD} episodes_rows=${ER} episodes_md5=${EM} registos_in_an_episode=${RE} registos_filenode=${RF} episodes_filenode=${EF} other_constraints_md5=${OC} other_indexes_md5=${OI} other_functions_md5=${OF} merge_acl_md5=${MA} policies_before=${PB} policies_md5=${PM} relation_acl_md5=${RM} column_acl_md5=${CM} default_acl_md5=${DM} triggers_md5=${TM}"
WVAC=0
WOK=20
echo "the post-check profile this sitting must print: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL, and no other (a VACUOUS verdict is not a pass, and a verdict that is missing prints no FAIL)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0105-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v secdef_before="${S}" -v tables_before="${T}" -v registos_rows="${RR}" -v registos_md5="${RMD}" -v episodes_rows="${ER}" -v episodes_md5="${EM}" -v registos_in_an_episode="${RE}" -v registos_filenode="${RF}" -v episodes_filenode="${EF}" -v other_constraints_md5="${OC}" -v other_indexes_md5="${OI}" -v other_functions_md5="${OF}" -v merge_acl_md5="${MA}" -v policies_before="${PB}" -v policies_md5="${PM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v triggers_md5="${TM}" -c "begin read only" -f scripts/db/postcheck-0105-registo-episode-key.sql -c "rollback" 2>&1 | tee /tmp/0105-postcheck.out || { echo "STOP: the post-check ended with an error (psql's lines are above), or its transcript could not be written. If a FAIL verdict is printed above, the file raised its own STOP on it: stage 1 recorded that it applied 0105 and this read does not agree, so the state is UNKNOWN. If no FAIL verdict is printed and the file's own STOP names a profile, a verdict read VACUOUS or is missing: a VACUOUS verdict is not a pass, and stage 2 did not pass. If neither is printed, this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0105-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0105, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0105-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0105-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}: no verdict of this post-check may read VACUOUS. A VACUOUS verdict is not a pass. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0105 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0105, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0105}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0105 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0105, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0105 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0105-stage2.ok || { echo "STOP: the pass mark /tmp/0105-stage2.ok could not be written, so the closing read would refuse. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0105 POST-CHECK PASSED. 18/18 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, journal ${J} to ${JA}; public.clinical_episodes carries the unique index on (id, patient_id, tenant_id), public.clinical_records carries the validated foreign key on it, public.merge_patients has the pinned body, and registos ${RR}, episodes ${ER}, tables ${T} and SECURITY DEFINER functions ${S} are unchanged. Paste the closing journal read now."
)
```

**EXPECT:** the carries line; `the post-check profile this sitting must print: 20 OK / 0 VACUOUS / 0 FAIL, and no other ...`; the post-check's table with that profile; `journal rows before=102 after=103, 0105 present by hash`; the last three journal rows; then `0105 POST-CHECK PASSED. ...`. Exit 0.

**A FAIL IN VERDICT 15 THAT IS NOT THE MIGRATION'S.** Verdict 15 wants the row count and the md5 over every row of both tables to be exactly the pre-check's, because 0105 writes no row. A registo or an episode that the application writes between the pre-check and the post-check (the AI ingestion and a patient's form are not tied to clinic hours) makes that verdict read FAIL although the apply is sound, and stage 2 STOPs saying the state is UNKNOWN. That is a false alarm, never a false pass. The lead then reads the other nineteen verdicts: 1, 2, 5, 6, 17, 18 and 19 are the ones that say 0105 is in place.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0105 APPLIED, then 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0105-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0105 APPLIED, then 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0105-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0105-main.sha) || { echo "STOP: stage 0's record /tmp/0105-main.sha could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0105.sha256 || { echo "STOP: this document is not the approved one. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0105-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0105-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0105-stage2.ok -newer /tmp/0105-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0105-window.ok || { echo "STOP: no run window is recorded for this sitting. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0105-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0105-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0105-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 103' /tmp/0105-journal-after.out || { echo "STOP: the journal read after the apply does not say 103. Stage 1 recorded that it applied 0105, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0105_clinical_records_episode_key[.]sql$' /tmp/0105-journal-after.out || { echo "STOP: the journal read does not list 0105 as APPLIED. Stage 1 recorded that it applied 0105, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0105-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0105-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0105 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 103, 0105 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 103`, the line `APPLIED  0105_clinical_records_episode_key.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 103, 0105 is APPLIED, and nothing is pending on the recorded sha.` Exit 0.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `18 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: the file itself raises, psql exits 3, STOP, nothing applied. Any VACUOUS (verdict 6: no registo names an episode; verdict 17: the table holds no episode): the file raises, STOP, nothing applied, the lead rules. `registos_the_key_would_refuse` not 0: verdict 6 FAIL, the file's own STOP with the count, and stage 1's own STOP on the carried count; nothing applied, and the number goes to SOLO |
| Post-check | `20 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: the file raises, STOP, the state is UNKNOWN. Any other count: the file raises on the profile and the block counts it too, STOP; the write stands |

**What the pre-check counts on production, because the migration's correctness rests on it. Each line is a STOP in stage 1, with nothing applied, when it does not read as written:**

| Case | Verdict | What a wrong reading would mean |
|---|---|---|
| A registo names an episode of another patient | 6, counted twice two ways; the CARRY row prints the greater | the VALIDATE fails and the whole migration rolls back; the registo needs a repair of its own first |
| A registo names an episode of another tenant | 6 | the same |
| A registo names an episode that is not there | 6 | the same (the key of 0000 should make it impossible; counted, not assumed) |
| No registo names any episode | 6, VACUOUS | the join the count rests on was not exercised; the lead rules |
| Two episodes share (id, patient_id, tenant_id) | 17 | the unique index could not be built (the primary key should make it impossible; counted from the rows) |
| An episode holds a NULL id, patient or tenant; a registo holds a NULL patient or tenant | 17 (the rows) and 7 (the columns are NOT NULL) | a registo with a NULL among its three values would slip past the key unchecked |
| The table holds no episode | 17, VACUOUS | nothing was measured |
| A relation already carries the index's name, or a constraint the key's | 8 | the migration fails at its first statement, or 0105 is partly there already |
| The session is not `postgres`, or `postgres` does not own both tables | 4, and 5 by a count of its own from `pg_tables` | the ALTER TABLE and the CREATE INDEX are the owner's: **an unexpected owner is found here, before the apply,** by two verdicts |
| The session does not read past row level security | 5 | every count above could be a filtered zero |
| `merge_patients` is not 0005's body, not SECURITY DEFINER with an empty search_path, not owned by `postgres`, or its EXECUTE is not `authenticated`'s alone | 12 | the replace would change something other than the two statements, or keep an owner nobody pinned |
| The function's ACL holds an item nobody named: another grantee, or a grant made by another role than `postgres` | 16, every item read; and 12, which counts the ACL's items its own way | CREATE OR REPLACE keeps the ACL, so that grantee would run the new body. **A second grantor is found here, before the apply,** by two verdicts |
| The key of 0000, the immutability trigger, the nine indexes, the five key columns | 9, 10, 11, 7 | the tables are not the tables this migration was written for |
| The journal: 0105 absent by hash, 0104 present once as the newest row at its `when`, 102 rows | 1, 2, 3 | production is not at the position this migration follows |
| 36 SECURITY DEFINER functions, all owned by `postgres`; Postgres 17; the five roles | 13, 14, 15 | the pins of both files were read on another shape |

**The three counts C1 to C3 are INFO rows and stop nothing.** They count the same kind of pair on three other links (a note and its episode, an attachment and its registo, a registo and the one it supersedes). Strategy ruled them into this file as counts for the record; 0105 touches none of those tables and adds no key on them, so nothing existing is lost or refused by this migration whatever they read. GREEN reports them as printed.

**What the post-check proves:** the index by its shape and its printed definition; the key by its shape and its printed definition, resting on that index; every other constraint and index of the two tables unchanged, ten indexes in all; the function by the md5 of its body, its flags, its owner, its EXECUTE and its ACL (by md5 in verdict 5 and item by item in verdict 7); the body as 0005's plus the added lines, read from the catalogue; the SECURITY DEFINER count, every other function, every policy, every relation, column and default privilege, every trigger and the table count unchanged by md5; no row written and no table rewritten (count, md5 and file node of both tables); the rows fit the key, by the pre-check's own query; the key's four internal triggers there and enabled (so the key is enforced, not only declared); and 0105 in the journal once, as the newest row, one more than before.

**The limit of the post-check:** a READ ONLY transaction cannot show a statement being refused. That the key refuses and the merge still moves is proven by the DB-gated suites (see the next section).

## Every writer and reader the key governs

Read on this head. A foreign key ignores row level security and is checked for every role, the table's owner included; so unlike a policy it governs every writer whatever it runs as. It governs no reader: a SELECT never meets it. "Proved" names the DB-gated test that ran the statement as the real principal on the throwaway with 0105 applied, 2026-10-14.

| Where | What it writes | After 0105 | Proved by |
|---|---|---|---|
| `apps/web/lib/clinical/records.ts:769` `createDraftRecord` (the INSERT; the guard `assertEpisodeIsThePatients` at `:612` reads the episode first; the wrapper at `:651` answers the key's refusal) | a registo, in an episode of its own patient, or in none | unchanged for every case the application allows today. A registo aimed at another patient's episode was refused by the application's guard and still is; where a statement gets past the guard the database now refuses it, and the caller gets the same `episode_mismatch` | `records.episode-guard.db.test.ts` (28): as a therapist, the refusal read by SQLSTATE and by the key's name |
| `records.ts:909` `createAddendum` | a new version, copying the patient and the episode of the registo it supersedes | unchanged: that pair already fits the key | `records.episode-guard.db.test.ts`; `clinical-records-episode-key.db.test.ts` (5) |
| `records.ts:850`, `:975`, `:1060`; `apps/web/lib/clinical/review.ts:253`, `:414`, `:522`, `:596`, `:631` | UPDATEs of a registo and one DELETE; none sets `episode_id`, `patient_id` or `tenant_id` | unchanged: the key is not asked | the registo suites of apps/web, whole, on the applied throwaway |
| `review.ts:319` (a registo from a patient's form), `apps/web/lib/ingestion/store.ts:79` (the AI ingestion) | a registo with NO episode | unchanged: not checked (MATCH SIMPLE) | the ingestion and review suites of apps/web and apps/api, whole |
| `apps/web/lib/clinical/episodes.ts:140` `insertOpenEpisode` | a new episode | unchanged: no registo names it yet | `episodes.create.db.test.ts`, `episodes-role-matrix.db.test.ts` |
| `public.merge_patients` (SECURITY DEFINER, owner `postgres`), called by `apps/web/lib/patients/actions.ts:1054` and by the importer at `packages/db/src/migration/upsert.ts:1003` | moves a merged patient's episodes, then its registos | **changed, on purpose, in one respect: the key is deferred around the two UPDATEs and checked once after them.** The value returned, the audit row and every moved row are the same | `merge-refusals.db.test.ts` (5); the merge arms of `clinical-records-episode-key.db.test.ts`: a draft, a locked and a signed registo move with their episode |
| `packages/db/src/migration/upsert.ts:615` and `:621` (in chunks), `:883` and `:935` (row by row), `:871` (an UPDATE of an imported episode), with OWNER claims | the Fisiozero importer: episodes first, then registos | unchanged where a source row's patient and episode agree. **Changed, on purpose:** where they do not, the key refuses that one INSERT inside its savepoint and the importer records the refusal (`sanitizeImportError`, `:1058`); before, the row went in | the importer's suites in packages/db ran green on the applied throwaway. No arm imports a row that disagrees with itself: read in the code, not run |
| `packages/db/seed/episodes-dev.ts`, `apps/web/e2e/seed/seed-e2e.mjs`, `scripts/import/cleanup-test-patients.sql` | seeds (episodes first, registos of the same patients) and a cleanup (registos first, then episodes) | unchanged | not run here |
| owner-run scripts under `packages/db/scripts` and `scripts/data` | none of the three columns of either table | none | read, not run |
| every reader | nothing | none: a key is not asked on a read | the three DB-gated suites, whole |

**The three suites, whole, on the applied throwaway, the way `db-tests.yml` runs them** are under "Rehearsal".

## Rollback

**There is no automatic rollback, the restoring statements are three, and nobody runs them from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, nothing changed (`journal    102 -> 102  (delta 0)`).
- **After the COMMIT, the statements that restore the state before are:** `CREATE OR REPLACE FUNCTION public.merge_patients` with the statement of migration 0005 exactly (so that it no longer names the key), `ALTER TABLE public.clinical_records DROP CONSTRAINT clinical_records_episode_patient_tenant_fk`, and `DROP INDEX public.clinical_episodes_id_patient_tenant_uq`, in that order, in one transaction after the two SET LOCAL lines. The DROP CONSTRAINT takes ACCESS EXCLUSIVE on `clinical_records` and on `clinical_episodes`, which the apply does not: for that instant reads wait too.
- **Measured on the throwaway on 2026-10-14:** see "Rehearsal".
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0105 stays: a journal row is never deleted. **GREEN never runs those statements from this document; SOLO never runs them at all; and no block here contains them.**
- **What a rollback does not reach:** nothing. 0105 writes no row, so there is no data to put back.

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | On the pull request: take the label `held-for-apply` off | after GREEN's clean report on 0104 and its merge, SOLO's READY line, and `main` merged into the branch with CI green on that head | nothing by itself |
| 2 | On the pull request: merge | right after click 1, and never while a sitting of GREEN's is in flight | `main` is then one migration ahead of production. Nothing else merges until GREEN's report on 0105 |
| 3 | Launch GREEN and hand it SOLO's dispatch, which names `0105_clinical_records_episode_key.sql` | after SOLO has filled the dispatch; in closed hours, inside its run window | the sitting: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 4 | Read GREEN's report on 0105 | when it arrives | merges resume. If the report carries a STOP: nothing is pasted again, and the lead rules |

**There is no click after the apply for 0105 itself:** no count GATE-CHANGE and no second merge.

## GATE-CHANGES

- **None for the promotion.** With the file in place `node scripts/check-journal.mjs` reads 103 of 103, `pnpm test:scripts` passes whole and `node scripts/assert-gates-unchanged.mjs` finds every pin unchanged. No test of 0104's needed a journal cut.
- **None for the apply.** The SECURITY DEFINER count stays 36 (`packages/db/scripts/check-security-definer-owner.mjs`, read on the applied throwaway: 36, all owned by postgres).
- **None owed after the merge for this migration.** The suites that prove the key are already on `main` and already in the skip guard's reach.

## Rehearsal

**2026-10-14, 01:44 to 02:29 Lisbon, on a throwaway built by the recipe `docs/migration-apply-0100.md` records. Never a lane, never production.** Every figure below was read on that throwaway.

**The throwaway.** A local Supabase stack, project id `r0105`, Supabase CLI 2.100.0, PostgreSQL 17.6, database on 127.0.0.1:55602, started with CI's exclude list (CLI 2.100.0 does not know the names `analytics`, `storage`, `functions`, `inbucket` and `meta`, so those containers ran too). Built at the position 0105 follows: this branch's `supabase/migrations` minus 0105, so 102 migrations, `0000` to `0104` (**0103 and 0104 applied**; 102 rows in `supabase_migrations.schema_migrations`), then `supabase/seed.sql`; a drizzle journal of 102 rows built from `_journal.json` entries idx 0 to 101, each `hash` the sha256 of its file and each `created_at` its `when`, the newest 0104 (`eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9`, `when` 1788502500000). The fixture is the one of 0104's rehearsal, in the seed tenant: nine members of staff over the four roles, two active clinics (08:00 to 21:00), four patients, three appointments, one care-team row, five episodes, and two draft registos, each filed in an episode of its own patient. No real name anywhere. Removed at 02:29:34 Lisbon on 2026-10-14: no `r0105` container or volume left, and the other project's stack on this machine untouched.

### The check files and the applier, by hand

| Step | What ran | Result |
|---|---|---|
| Pre-check, whole, the real file, the real journal | `psql ... -v prev_hash=<0104> -v prev_when=1788502500000 -f scripts/db/precheck-0105-registo-episode-key.sql` | exit 0, `18 OK / 0 VACUOUS / 0 FAIL`. Verdict 6: `registos 2, naming an episode 2, joined 2; another patient 0, another tenant 0, episode not there 0; the key would refuse 0`. Verdict 16: `authenticated EXECUTE by postgres, postgres EXECUTE by postgres; 2 items`. `registos_the_key_would_refuse` 0 |
| The locks | the file's statements in one transaction, `pg_locks` read after each, rolled back | the table under "Closed hours, and the locks" |
| The time on invented rows | 60,005 episodes and 150,002 registos written, the four statements run, all rolled back | index 26 ms, ADD 1 ms, VALIDATE 20 ms, function 2 ms |
| The post-check BEFORE the apply | the post-check command, on the database the pre-check had just passed | **psql exit 3:** `12 OK / 0 VACUOUS / 8 FAIL`, then the file's own `STOP: the 0105 post-check printed a FAIL verdict`. A post-check on a database without 0105 cannot end with exit 0 |
| The apply, through the real applier | `node packages/db/scripts/verified-migrate.mjs --tag 0105_clinical_records_episode_key --sha256 980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441 --expect-pending 1`, the database URL pointing at the throwaway | exit 0: `journal    102 -> 103  (delta 1)`, `0105_clinical_records_episode_key present by sha256: yes` |
| The second apply | the same command again | **a clear refusal, exit 3, nothing run:** `PRECONDITION FAILED: 0105_clinical_records_episode_key's sha256 is ALREADY in drizzle.__drizzle_migrations.` |
| Post-check, whole, the carries from the pre-check's transcript | `psql ... -v <20 carries> -c "begin read only" -f scripts/db/postcheck-0105-registo-episode-key.sql -c "rollback"` | exit 0, `20 OK / 0 VACUOUS / 0 FAIL` |
| Negative control: the pre-check on the APPLIED database | the same pre-check command | **psql exit 3:** `12 OK / 0 VACUOUS / 6 FAIL` (verdicts 1, 2, 3, 8, 11, 12), then the file's own STOP |
| The applier on a database with one misfiled registo, the pre-check left out | the apply command | **exit 4, nothing applied:** the VALIDATE failed, drizzle rolled back, `journal    102 -> 102  (delta 0)`, `present by sha256: NO`; no index, no key, the function's body unchanged |
| The applier with a wrong sha256 | the apply command, one hex digit changed | exit 3: `PRECONDITION FAILED: 0105_clinical_records_episode_key.sql is on disk but is NOT the approved file.` |
| The applier while another session holds a write on an episode open | the apply command | **exit 4 after 6 seconds, nothing applied:** `journal    102 -> 102  (delta 0)`. A lock it cannot take in 5 seconds is a clean failure |

### The four blocks against the database, in bash and in zsh

**How each block was run.** From this branch at `cfbd29a5` (`cfbd29a501c357777550476a21090a61605f1d08`), with this document as it stood at that commit, before this record was written into it (sha256 `e031104fe0595e3f54acbdb58291161c9f97883b7bd9b4c081f960a28a4369bb`). **This record changed no byte of any block.** The four blocks were taken out of the document by machine and each ran in GREEN's tool shape, `true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`, under `zsh -f` and under `bash --noprofile --norc`, with an environment of seven names the runner sets itself and nothing inherited (`PATH`, `HOME`, `LANG`, `TERM`, `TMPDIR`, and the throwaway's URL as `DATABASE_URL_DIRECT` and `DATABASE_URL`). The production environment file was never read, sourced or handed to a program.

- **SUBSTITUTIONS, ONLY THESE.** (1) The `cd` to the apply checkout became a rehearsal clone. (2) The `/tmp/0105-` paths became a scratch folder, a new one for each sitting, so the machine's real `/tmp` never held a `0105-` file. (3) The clone's `origin` was a local bare repository whose `main` is this branch's head, fetched from the branch by path; nothing was pushed anywhere, and no block's text changed for it.
- **LINES NOT RUN, five.** Stage 1 and stage 2: the line that loads the production environment file, and the line that runs the target guard. The closing read: the reader's line. Why: the file is production's secrets and no lane but GREEN reads it; the guard and the reader refuse any target that is not production, and a guard is never passed in a rehearsal.
- **WRITTEN BY HAND.** The run window record, in place of the dispatch's CLOCK CHECK: the recorded sha, then three Lisbon times.
- **The real guard and the real reader each ran once on their own,** against the throwaway, in the clone, and refused it: `host: 127.0.0.1`, `port: 55602`, `ref:  postgres`, `REFUSING: project ref is "postgres", not the production project.` (exit 2); and `REFUSED: this script reads drizzle.__drizzle_migrations, which only production uses, and the target's ref is not dfotoodqvmjhbdcxyaxf. ...` (exit 2).

| Block | zsh, Lisbon 2026-10-14, exit | bash, exit | What it printed |
|---|---|---|---|
| Stage 0, WHOLE, no line left out | 02:26:39, 0 | 02:26:41, 0 | `origin/main and HEAD: cfbd29a5...`; `docs/migration-apply-0105.md: OK`; `newest journal entry: idx 102, when 1788502600000, tag 0105_clinical_records_episode_key, of 103; before it idx 101, when 1788502500000, tag 0104_clinical_episodes_role_matrix`; check-journal's `103 .sql files match 103 journal entries`; `Lisbon weekday and time 30226 (...; the clock read 30226 WEST): closed by the weekday table`; proofs `yes`, `no`, `no`; `0105 MERGE, NUMBER, FILES AND CLOCK VERIFIED`; `TOOL-CHAIN-CONTINUED` |
| Stage 1, two lines not run | 02:26:39, 0 | 02:26:41, 0 | the same sha twice; the window line; the pre-check, `18 OK / 0 VACUOUS / 0 FAIL`; `the pre-check profile: 18 OK / 0 VACUOUS / 0 FAIL. REPORT, ...`; `closed`, `the clinics' own rows against the weekday table: inside`; verified-migrate through drizzle-kit: `journal    102 -> 103  (delta 1)`, `0105_clinical_records_episode_key present by sha256: yes`; `0105 APPLIED. Paste stage 2 now.`; `TOOL-CHAIN-CONTINUED` |
| Stage 2, two lines not run | 02:26:40, 0 | 02:26:42, 0 | `main has not moved since stage 0`; the twenty carries; `the post-check profile this sitting must print: 20 OK / 0 VACUOUS / 0 FAIL, and no other ...`; the post-check, `20 OK / 0 VACUOUS / 0 FAIL`; `journal rows before=102 after=103, 0105 present by hash`; the last three journal rows; `0105 POST-CHECK PASSED. 18/18 pre-check OK, post-check 20 OK / 0 VACUOUS / 0 FAIL, journal 102 to 103; ...`; `TOOL-CHAIN-CONTINUED` |
| The closing read, the reader's line not run | 02:26:41, 1 | 02:26:42, 1 | the HEAD CHECK, the sidecar, `main has not moved since stage 0`, the pass mark, the window, and `reader: 825b7818..., its target module: e037104d... (at the recorded sha cfbd29a5...)`; then, because the reader did not run and left no output, the block's first check of that output: `STOP: the journal read after the apply does not say 103. ...`. **That STOP is the missing line's, not a finding.** No `TOOL-CHAIN-CONTINUED` |

Between the two shells the throwaway was put back (the three restoring statements and the throwaway's journal row). The same four blocks had run the same way twice before on the two commits before `cfbd29a5` (02:10 and 02:14 Lisbon), with the same lines; between those commits and this one only the pre-check and the post-check changed (verdicts 5 and 12 of the first and verdict 7 of the second each gained a second read; see the sweep).

**EACH REFUSAL, SEEDED ONCE, both shells, on the throwaway before 0105.** Stage 0 ran first each time; stage 1 ran with its two lines not run. After each, the seed was undone, the journal read 102, and at the end the pre-check read `18 OK / 0 VACUOUS / 0 FAIL` again.

| Seed | Stage 1, in both shells | Applied |
|---|---|---|
| One registo in an episode of another patient (an episode of the fixture handed to another patient) | exit 1. Verdict 6 FAIL, `another patient 1`; the pre-check's own STOP with `[1]`; then `STOP: the pre-check did not complete, or it ended with its own STOP on a FAIL verdict, a VACUOUS verdict or a count of registos the key would refuse that is not 0 ... Nothing was applied` | nothing, journal 102 |
| One registo in an episode of another tenant | exit 1. Verdict 6 FAIL, `another tenant 1`; the same two STOPs | nothing, journal 102 |
| No registo names an episode | exit 1. Verdict 6 VACUOUS; the pre-check's STOP on the profile `[17 OK / 1 VACUOUS / 0 FAIL]`; stage 1's STOP on the pre-check's run | nothing, journal 102 |
| EXECUTE on `merge_patients` granted to a role nobody named | exit 1. Verdicts 12 and 16 FAIL (`ACL items 3`; `supabase_auth_admin EXECUTE by postgres`); the pre-check's STOP on `[16 OK / 0 VACUOUS / 2 FAIL]`; stage 1's STOP on the pre-check's run | nothing, journal 102 |
| A second grantor of `authenticated`'s EXECUTE (`service_role`, given the grant option for the seed, grants it too) | exit 1. Verdicts 12 and 16 FAIL (`authenticated EXECUTE by service_role` among the items); the same two STOPs | nothing, journal 102 |
| An unexpected owner of `clinical_episodes` (a role made for the seed) | exit 1. Verdicts 4 and 5 FAIL (`clinical_episodes rk0105_seed`; `owns 1 of 2`); the same two STOPs | nothing, journal 102 |
| The registo of the first seed, and a pre-check made blind to it on purpose (verdict 6 unable to FAIL and the file's own STOP removed; a named change of this one run) | exit 1. `STOP: the pre-check counted 1 registos that name an episode of another patient or tenant, or an episode that is not there. ... Nothing was applied. Report the number 1 to SOLO` | nothing, journal 102 |
| A wrong sha256: stage 1's own `SHA0105` line changed by one hex digit (a named change of this one run) | exit 1. `STOP: 0105 on disk is not the approved file`, before any database was read | nothing |
| A second apply, the blocks pasted again in the same sitting (run at `90fc8a49`, two commits before, 02:13) | stage 0 and stage 1, exit 1: `STOP: stage 1 has ALREADY APPLIED 0105 in this sitting, or the age of /tmp/0105-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. ...` | nothing more, journal 103 |
| A second apply, a later sitting (no applied marker) on the database that holds 0105 (at `90fc8a49`, 02:13) | stage 0 passes; stage 1 exit 1: the pre-check reads `12 OK / 0 VACUOUS / 6 FAIL` (verdicts 1, 2, 3, 8, 11, 12), its own STOP, and stage 1's STOP on the pre-check's run | nothing more, journal 103 |

**NOT SEEDED, and why.** A registo naming an episode that is not there: the key of 0000 forbids writing one, and the session is not a superuser. Two episodes sharing the three values, and a NULL in a key column of an episode: the primary key and NOT NULL forbid both. A registo with a NULL patient was seeded in the sweep below (the column made nullable for the seed), where verdict 7 stopped stage 1. A table with no episode at all: not seeded.

### THE MUTATION SWEEP, 2026-10-14, one pass, mechanical

A pin test (a sha256 or an md5 compare) fails on any edit by construction, so no kill below is counted from a pin: the script test's sha256 pins, and the post-check's compare of the function's body by md5, are named apart where they are the only thing that sees a mutant.

*Part 1, the migration's statements: 21 mutants, each the migration's own seven statements with one clause dropped or weakened, applied to the throwaway in one transaction in 0105's place with the journal row a real apply writes. Then four DB-gated suites (`packages/db` `clinical-records-episode-key.db.test.ts` and the two SECURITY DEFINER suites; `apps/web` `records.episode-guard.db.test.ts` and `merge-refusals.db.test.ts`) and the post-check; then the throwaway put back, and the pre-check reading 18 OK again before the next. Run at `5bfed8ca`; the migration and the suites are the same bytes at the final head.*

| Mutants | Count | Killed by |
|---|---|---|
| The index not UNIQUE; on (id, patient_id) only; dropped | 3 | the migration itself: the key cannot be created without a unique index on its three columns, the transaction fails and nothing is applied |
| The key not DEFERRABLE; INITIALLY DEFERRED for everyone; cascading an UPDATE; MATCH FULL | 4 | a named failing test of the packages/db key suite, each (and of an apps/web suite on three of the four) |
| The VALIDATE dropped; the key dropped whole | 2 | both key suites refuse to measure: the key is half there, or promoted and not carried |
| The replace of `merge_patients` dropped; the function without its DEFERRED; the IMMEDIATE moved above the UPDATE of the registos | 3 | a named failing test: "the merge moves it with its registos" |
| **The index and the key without `tenant_id`** | **1** | **no suite.** The post-check's verdicts 1 and 2 (the printed definitions). A patient belongs to one tenant, so a registo and an episode of one patient in two tenants would need a row that is already wrong on its own |
| **The key cascading a DELETE** | **1** | **no suite.** The post-check's verdicts 2 and 19. Whether any behaviour differs was not measured: the key of 0000 still refuses the delete of an episode that holds registos |
| **The function without its IMMEDIATE; ALL DEFERRED in place of the key's name; ALL IMMEDIATE in place of the key's name** | **3** | **no suite.** The post-check's verdicts 5 and 6, and the script test's compare of the function with 0005's. Without the IMMEDIATE the key would be checked at the caller's COMMIT instead of inside the function; no DB suite has an arm for "immediate again after a merge" |
| **The function not SECURITY DEFINER; with search_path = public** | **2** | **no DB suite.** The post-check's verdict 5 (and 7 for the first). At the level of the file: the script test's shape rule, and the required count of SECURITY DEFINER functions |
| **The `SET LOCAL lock_timeout` line dropped; the `SET LOCAL idle_in_transaction_session_timeout` line dropped** | **2** | **nothing on the database** (the lines last one transaction). The first by the SET LOCAL gate, `scripts/migration-timeouts.test.mjs`; the second by the script test's shape rule only |
| Control: the migration unchanged | 1 (not counted) | every suite passes; post-check exit 0, 20 OK |

So of 21: 3 cannot be applied at all, 9 are killed by a DB suite, and 9 are not killed by any DB suite. The post-check ends with an error on 7 of those 9; the two SET LOCAL lines leave no trace in a database. **No test was added for the survivors:** the suites are on `main` already and this branch changes no application test. They are listed for the review.

*Part 2, the check files' verdicts and STOPs, and the blocks' own lines: 18 mutants, each run through stage 1 under zsh (and stage 2 where stage 1 applied) on a throwaway seeded for it, at the final check files.*

| Mutant | Seed | Killed by |
|---|---|---|
| Verdict 6 unable to FAIL | a misfiled registo | the pre-check's own STOP on the count, exit 3; nothing applied |
| Verdict 6's count of another patient made 0; its count by the key's own question made 0 | a misfiled registo | the other counts of verdict 6, and the pre-check's own STOP; nothing applied |
| The pre-check's own STOP on the count removed | a misfiled registo | verdict 6 FAIL and the pre-check's STOP on the profile; nothing applied |
| The CARRY row no longer stores the count | none | the pre-check's own STOP reads `[no count]`: no sitting passes; nothing applied |
| The pre-check's STOP on the profile loosened to "ends 0 FAIL" | no registo names an episode | stage 1's own count of VACUOUS verdicts; nothing applied |
| The pre-check's STOP on the profile removed | a grantee nobody named | stage 1's own count of FAIL verdicts; nothing applied |
| Verdict 16 always OK | a grantee nobody named | verdict 12's own count of the ACL's items; nothing applied |
| Verdict 12 accepting any number of ACL items | a grantee nobody named | verdict 16; nothing applied |
| Verdict 4 no longer reading the tables' owners | an unexpected owner | verdict 5's own count of the tables the session owns; nothing applied |
| Verdict 17 unable to FAIL | a registo with a NULL patient (the column made nullable for the seed) | verdict 7; nothing applied |
| Stage 1 without its own line on the carried count | a misfiled registo | the real pre-check; nothing applied |
| **Verdict 6's VACUOUS arm removed** | **no registo names an episode** | **nothing before the apply: stage 1 applied.** Stage 2 then stopped: the post-check's verdict 16 read VACUOUS and the file ended on the profile `[19 OK / 1 VACUOUS / 0 FAIL]`. Nothing can be misfiled where no registo names an episode, so a sitting that goes on there loses nothing (QUESTIONS 2) |
| The post-check's STOP on a FAIL verdict removed | EXECUTE granted to `anon` between stage 1 and stage 2 | the post-check's STOP on the profile, exit 3 |
| Both of the post-check's STOPs removed | the same | stage 2's own count of FAIL verdicts: the state is UNKNOWN |
| Post-check verdict 15 unable to FAIL | a registo taken out of its episode between the stages | verdict 16's control (registos that name an episode, as the pre-check counted them) |
| Post-check verdict 5 unable to FAIL | EXECUTE granted to `anon` between the stages | verdict 7's own read of the function's ACL |
| Post-check verdict 2 unable to FAIL | the key replaced between the stages by one that is not deferrable and not validated | verdict 19 |

Two controls ran with the real files: with nothing seeded, stage 1 applied and stage 2 passed; and with a registo changed between the stages the post-check ended with an error by itself, exit 3, `[18 OK / 0 VACUOUS / 2 FAIL]` (verdicts 15 and 16), which is the false alarm the stage 2 section describes. **On the first pass two more survived everything:** verdict 4 no longer reading the owners (the unexpected owner was then applied over, and stage 2 passed), and post-check verdict 5 unable to FAIL (the grant made between the stages was then not seen). Verdict 5 of the pre-check now counts the tables the session owns, and verdict 7 of the post-check reads the function's ACL item by item; verdict 12 of the pre-check had gained its count of the ACL's items the same way, before the sweep. Part 2 was run again whole on those files, and the table above is that second run.

**NOT SWEPT.** Post-check verdict 19 could not be made to FAIL by a seed of its own kind: disabling a key's internal triggers needs a superuser, which the session is not, locally or on production. It read FAIL only where the key itself was replaced. The halting predicates the blocks share with 0104's (the clock, the window, the pins, the records) were swept with 0103's and 0104's and were not swept again; the script test runs their fault injection in both shells.

### The rollback, and the pre-check repeated

| Step | Result |
|---|---|
| The pre-check on the applied throwaway (negative control) | exit 3, `12 OK / 0 VACUOUS / 6 FAIL`: verdicts 1, 2, 3, 8, 11 and 12 |
| The three restoring statements of "Rollback", one transaction; then the pre-check | exit 3 by design, `15 OK / 0 VACUOUS / 3 FAIL`: the three journal verdicts, because the journal row stays |
| The throwaway's journal row removed; then the pre-check | exit 0, `18 OK / 0 VACUOUS / 0 FAIL`; every verdict, carry and count identical to the first run's, the file node of both tables included (no table was rewritten by the apply or by the restore) |

That sequence ran first at 01:45 Lisbon and again at 02:29, after every suite below had run on the applied throwaway, with the same three lines.

### The DB-gated suites on the applied throwaway, the way `db-tests.yml` runs them

At the final head, from the rehearsal clone, only the throwaway's URL in the environment:

| Suite | Result |
|---|---|
| packages/db, every suite | Test Files 103 passed (103); Tests 1629 passed (1629); 0 skipped |
| apps/web, every DB-gated suite | Test Files 67 passed (67); Tests 832 passed (832) |
| apps/api, every DB-gated suite | Test Files 10 passed (10); Tests 96 passed (96) |
| The SECURITY DEFINER count | `OK: all 36 owned by postgres.` |

Among them, the suites that prove the key as the real principals: `packages/db/tests/clinical-records-episode-key.db.test.ts` 5 of 5 (`THE DATABASE CARRIES clinical_records_episode_patient_tenant_fk`), `apps/web/lib/clinical/records.episode-guard.db.test.ts` 28 of 28, `apps/web/lib/patients/merge-refusals.db.test.ts` 5 of 5, `apps/web/lib/clinical/episodes.create.db.test.ts` 12 of 12, `apps/web/lib/clinical/episodes-role-matrix.db.test.ts` 13 of 13 (0104's), and the importer's (`migration-upsert-idempotency` 14, `migration-batch-import` 4, `migration-reconciliation` 19). The same three suites had passed whole at 01:46 to 01:47 Lisbon, the first time 0105 was applied to the throwaway: 1629, 832 and 96.

### NOT REHEARSED, said one by one

- **Five lines of the four blocks.** In stage 1 and in stage 2: the line that loads the production environment file (`set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport`), because no lane but GREEN reads that file; and the line that runs the target guard, because the guard refuses the throwaway and a guard is never passed. In the closing read: the reader's line (`node --env-file=... ${READER}`), for both reasons. Every other line of every block ran, in order, in both shells. **So no block has run whole with its guard, and the closing read has not run past its reader.**
- **The target guard and the reader as a pass.** Each ran once for real against the throwaway and refused it, which is what they are for. What either prints on production was not seen.
- **The closing read's checks of the reader's output** (103 rows, 0105 APPLIED, nothing pending): with the reader's line not run there is no output, so the block stopped at the first of them. They ran only in the script test's harness.
- **The dispatch's two blocks** (BEFORE YOU START, CLOCK CHECK): the dispatch is not written yet. `/tmp/0105-window.ok` was written by hand for the rehearsal, in the shape this document names.
- **Production.** Its count of registos the key would refuse; the rows and bytes of its two tables; the function's ACL and body there (the pins were read on Postgres 17.6 local stacks; the pre-check STOPs if production's differ); whether 0104 is applied; and the time the locks are held there.
- **0104 on production.** This rehearsal ran on a throwaway that holds 0104 as the local branch `db/0104-episode-policy` has it. If 0104 changes before it is applied, 0105's pin of it (`SHAPREV`) and this document move with it.
- **The race of a merge with a registo being filed for the same patient.** Not run here.
- **No Playwright spec ran with 0105 applied.**
- **The seeds listed under "NOT SEEDED".**

## QUESTIONS THIS DOCUMENT DOES NOT ANSWER

1. **What happens after a STOP on a registo the key would refuse.** Production's count is unknown to the build lane, and this document has no earlier read-only sitting to learn it. If it is not 0, the registos have to be put right before 0105 can sit again, and a locked or signed registo cannot be changed by an UPDATE. That repair is a data operation of its own (Tier C or D), ruled and rehearsed. Options: (a) let the sitting find the number; (b) a read-only sitting of the pre-check alone on an earlier closed night, which would also record production's sizes. Recommended: (b), if a night is free before the sitting.
2. **A VACUOUS pre-check on production** stops the sitting: no registo naming any episode (verdict 6), or no episode at all (verdict 17). Built and recommended: keep the stop, as 0104's document does. With no registo in any episode nothing can be misfiled, so accepting it would be safe; it would cost a new sidecar.
3. **The counts C1 to C3 above zero on the day.** Built: printed as INFO rows and reported, and the sitting goes on, since 0105 touches none of those tables. Option: make a number above zero a STOP. Recommended: keep as built; a number above zero becomes its own card.
4. **A registo or an episode written between the pre-check and the post-check** makes post-check verdict 15 read FAIL on a sound apply (see stage 2). Options: (a) keep; (b) a later change that compares only the rows that existed at the pre-check. Recommended: (a) for this sitting, with the lead knowing how to read it.
5. **Whether an imported row that disagrees with itself should be refused.** After 0105 the importer records a refusal for a registo whose source row names an episode of another patient, where before the row went in. That is what the rule asks. No import is planned in the sitting's window as far as this lane knows.

## JUDGMENTS, NOT RULINGS, in this document

- **The blocks are 0104's, changed by substitution,** not written afresh: the number, the file names, the pins, the journal position, the pre-check's profile (18), the carries (twenty), the post-check's profile (a fixed 20) and the R9 lines. 0104's blocks were run against a database and swept; these were run and swept as "Rehearsal" records, and have had no review of their own yet.
- **The post-check's profile is fixed.** 0104's depended on a carry (`post_vacuous_expected`); 0105 has no verdict that may read VACUOUS after a passing pre-check, so stage 2 wants `20 OK / 0 VACUOUS / 0 FAIL` and nothing else, and the post-check takes no such carry.
- **The post-check runs inside the block's own `begin read only`,** as 0104's does, and stops before any read outside one. The draft of 2026-10-08 opened its own transaction.
- **C1 to C3 are INFO rows.** The draft printed them as a second profile with OK, VACUOUS and FAIL; a FAIL word there would have stopped stage 1 by the block's own count although the file calls them "not this file's STOP".
- **Verdicts 12 and 16 pin the function's whole ACL, two items.** It was read on local stacks only. If production's differs the sitting stops in stage 1 with nothing applied, which is the purpose; the cost is one sitting.
- **R9's three proof lines are still printed,** proof 2 reading `no`, and decide nothing: the clock arm passes in closed hours only, whatever they read.
- **The STOP sentences that are 0105's own, and not 0104's by substitution:** the pre-check's on the count, stage 1's two lines on the carried count, stage 1's VACUOUS sentence, and stage 2's on a profile.
