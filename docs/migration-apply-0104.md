# 0104: apply the episode-policy item (the policies on clinical_episodes)

**NOT READY. Nothing in this document may be pasted yet.** The migration is promoted to its number, the two check files and the applier were rehearsed on a throwaway on 2026-10-13 (see "Rehearsal"), and the four blocks below are 0103's reviewed blocks with the number, the files, the pins, the journal position and the verdict profiles changed. Open, in order: the R4 review and the one mutation sweep; a rehearsal of the four blocks whole against a database; SOLO's READY line; the pull request, opened held; `main` merged in with CI green; the owner's two clicks; and GREEN's dispatch, which carries the three values this document cannot hold (the merge commit's sha, this document's sha256 and the run window). Until the pull request is merged every block below STOPs at its first file check, because this document is not on `origin/main`. **The sitting is closed hours only** (see "Closed hours, and the locks").

**Status: AUTHORED. PARTLY REHEARSED on 2026-10-13 (the check files, the applier, the restoring statements and the DB-gated suites ran on a throwaway; the four blocks did not run whole against a database). NOT APPLIED.** One migration, `packages/db/migrations/0104_clinical_episodes_role_matrix.sql`, sha256 `eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9`.

**In plain language.** An episode is the folder a patient's registos of one treatment are filed in: ids, dates, a status and a title such as the specialty. It holds no clinical text. Until this migration one database rule covers that table for all staff. This migration replaces it with three rules, one each for reading, opening and changing an episode, so that the database itself follows the roles:

- **The owner:** nothing changes. The owner reads, opens and changes every episode of the clinic group.
- **An administrator:** reads the episodes of the patients linked to one of the administrator's clinics, which is exactly where the administrator already reads those patients' registos. Opens and changes none, as in the application today.
- **Reception:** reads the episodes of the patients linked to the receptionist's clinic. Opens and changes none. A receptionist with no clinic assignment reads none.
- **A therapist:** reads the episodes of the patients they treat or registered, and of the patients whose care team they are on at their own clinics. Opens an episode in their own name for a patient they treat or registered, and changes the episodes of those patients.
- **Nobody signed in as staff deletes an episode.** The application has no such button, and now the database refuses it as well.
- **Patients:** nothing changes. The rule for the patient portal is not touched.

It adds no table, no column, no function and no row, and it moves no data. What a member of staff sees on the Registos tab, on a registo's page, on an episode's page and in the "+ Episodio" and "+ Avaliacao" buttons is the same as today for every case the application allows today; the DB-gated suites prove each one as the real role (see "Every reader and writer").

Four blocks, each pasted whole, on its own and in order: stage 0 (the merge, the files, the clock and the head it runs from), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the clinics, and the apply), stage 2 (the read-only post-check) and the closing journal read. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0104 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number changed and no other change.** This document has no stage 3, so where the rule names stages 2 and 3, read stage 2 and the closing read. **A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any count the profile does not name** (see "What every verdict must read").

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`, zsh ignores errexit inside it. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/episode-policies-0104.test.mjs` runs every block in that shape, in bash and in zsh, with each external call made to fail in turn. The second line of each block is `set -o pipefail` and nothing more.

**A FAIL verdict ends a check file with an error, as well.** Both check files read back the profile they printed and raise unless it ends `0 FAIL`, so psql exits 3 and the block's own halt on the psql line fires. The blocks still count OK, VACUOUS and FAIL themselves and assert the whole profile. **So stage 2's STOP on the post-check's own run can mean two things, and says which:** a FAIL verdict printed above it is a read that does not agree with the apply (the state is UNKNOWN); no FAIL verdict above it means the read did not complete, and it confirmed nothing and contradicted nothing. It never says 0104 is applied.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE on this branch, `db/0104-episode-policy`, locally:** `main` merged in at `5d4e8091` (which carries 0103); the migration promoted to its number with no byte changed (sha256 `eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9` before and after); its journal entry (`idx 101`, tag `0104_clinical_episodes_role_matrix`, `when` 1788502500000); its mirror `supabase/migrations/0104_clinical_episodes_role_matrix.sql`; the pending README's rows; the pre-check and the post-check in their final form; this document, its sidecar and its script test. `node scripts/check-journal.mjs` reads 102 files and 102 entries.
2. **WAITS FOR 0103:** 0103 is applied to production and GREEN's report on it is clean. One migration is in flight at a time, and nothing of 0104 is pushed before that report.
3. **DONE 2026-10-13, WITH LIMITS: the rehearsal on a throwaway** (see "Rehearsal" and "NOT REHEARSED").
4. **OPEN: the four blocks run whole against a database,** in a clone whose `origin/main` is the promoted head, with the named substitutions of 0100's recipe.
5. **OPEN: the one mutation sweep** of the two check files' predicates and of the blocks' halting predicates.
6. **OPEN: R4** on the pull request's diff, at most three rounds.
7. **OPEN: the pull request,** opened by SOLO held (`held-for-apply`, unarmed), only after step 2.
8. **OPEN: `main` merged into the branch and CI green on that head,** before the owner's first click.
9. **OPEN, THE OWNER:** he takes `held-for-apply` off and merges. Merges to main stop from that merge until GREEN's report on 0104.
10. **OPEN: SOLO fills GREEN's dispatch** after the merge: the merge sha, this document's sha256, and a run window while both clinics are closed.

| Fact | Value |
|---|---|
| Ruling | Strategy's dispatches S-1008-B (2026-10-08) and S-1012-A (2026-10-12) number it `0104` (`CLAUDE.md`, the number table). Tier C. The sitting is ruled for a closed night after 0103's clean report, merged first and applied from `main`, as 0103 was |
| Migration | `packages/db/migrations/0104_clinical_episodes_role_matrix.sql`, promoted from `packages/db/migrations-pending/NEXT-AFTER-0103_clinical_episodes_role_matrix.sql` with no byte changed. sha256 `eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9` |
| Journal | `idx 101`, tag `0104_clinical_episodes_role_matrix`, `when` 1788502500000 (0103's 1788502400000 plus 100000). Stage 0 asserts it and 0103's entry before it. Production's journal goes 101 to 102 |
| Mirror | `supabase/migrations/0104_clinical_episodes_role_matrix.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0103` (#1573), body sha256 `8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59`, journal `idx 100`, `when` 1788502400000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the pull request's merge commit. Stage 0 records the sha in `/tmp/0104-main.sha`; every later stage checks out that recorded sha, and stage 1 HALTS if `origin/main` has moved since |
| This document | `docs/migration-apply-0104.md`, pinned by `docs/migration-apply-0104.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own |
| Pre-check | `scripts/db/precheck-0104-episode-policies.sql`, READ ONLY, 15 verdicts, 15 CARRY rows (verdict 3 prints a carried number too), 8 INFO rows and a SUMMARY row, `-v prev_hash` and `-v prev_when` required, sha256 `64198e3e4f63b47fcde1e63f4e2d8f836428bd4f0c2004b8401909788d8190d3` |
| Post-check | `scripts/db/postcheck-0104-episode-policies.sql`, READ ONLY, 21 verdicts and a SUMMARY row, fourteen carries in, sha256 `d4d6256052f4189008814281528696f914095bccddc3df3278a3b638188a9e61` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The same bytes 0103's document pins; every block that runs one compares it first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs`: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6`. It feeds a line that is printed and decides nothing here |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0104-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM`. **No date is written in any block** |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then, on `public.clinical_episodes` and nowhere else: DELETE is revoked from `authenticated`; the policy `clinical_episodes_tenant_isolation` is dropped; the policies `clinical_episodes_select`, `clinical_episodes_insert` and `clinical_episodes_update` are created, each TO `authenticated` |
| What it never touches | every row, every other table, every other policy (the patient policy on this table included), every function (the SECURITY DEFINER count stays 36: **no count GATE-CHANGE after the apply**), every other privilege, every trigger. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so the digest lives in `docs/migration-apply-0104.sha256` and every block checks it with `shasum -a 256 -c`. Every amendment of this document moves its sha256; the sidecar is regenerated in the same commit, and `scripts/episode-policies-0104.test.mjs` fails until it is.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no backslash continuations and no `!` except `test !`.

**The migration's own header still says it is pending and names its pending path.** Stale on purpose: a promotion changes no byte, and the sha256 above is what every pin points at. Its section 4 names line numbers as they stood on 2026-10-08; "Every reader and writer" below gives them as they stand on this head.

## Closed hours, and the locks

**Closed hours only, and R9 does not apply.** Strategy's standing ruling: "any migration that creates a policy is closed-hours only, never eligible for R9." The weekday table (Lisbon): open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00; closed Sunday. Stage 0 and stage 1 check the clock by machine against it, and stage 1 also reads every active clinic's own hours.

**The locks, measured on the throwaway on 2026-10-13** (Postgres 17.6, a full local Supabase stack, the file's statements in one transaction, read from a second session, rolled back):

| Statement | Lock taken, held until the COMMIT |
|---|---|
| the two `SET LOCAL` lines | none |
| `REVOKE DELETE ... FROM authenticated` | no table lock (ROW EXCLUSIVE on one sequence in the platform's `graphql` schema, its own counter) |
| `DROP POLICY` | **ACCESS EXCLUSIVE on `public.clinical_episodes` and on the 23 tables the platform's `supautils.policy_grants` setting names:** 16 in `auth` (`auth.users`, `auth.sessions` and `auth.refresh_tokens` among them), 5 in `storage`, 2 in `realtime` |
| the three `CREATE POLICY` | the same 24 tables, nothing more |

- **So the DROP POLICY takes the platform's locks too.** The migration's header left that unmeasured; it is measured now, and it changes nothing in the file: the DROP stands directly before the three creates, as its last four statements.
- **What waits while they are held:** every read and write of episodes, every sign-in and session refresh, every file read or upload, every realtime message. Nothing fails; it waits for the COMMIT.
- **For how long:** on the throwaway the five statements took under 5 milliseconds in all (0.9, 0.9, 0.8, 0.5 and 0.5), on a table of five rows. On production the hold is those statements, the journal row and the COMMIT, each a round trip through the session pooler, so a fraction of a second is expected and **was not measured there**.
- **The bounds:** `SET LOCAL lock_timeout = '5s'` makes a lock this transaction cannot take in 5 seconds a clean failure with nothing applied (the journal reads `101 -> 101`); `SET LOCAL statement_timeout = '60s'` bounds each statement. Neither bounds how long a granted lock is held; the COMMIT does.
- **Production's `supautils.policy_grants` has not been read.** The pre-check prints it as an INFO row (the role, the number of tables named, whether `auth.users` is one), so the sitting's record will say which tables were locked.

## Merged before the apply, and which commit the sitting runs from

0104 creates no function, so no required check counts anything it adds. The pull request merges first and GREEN applies from the merge commit on `main`, as 0100, 0101 and 0103 were. **Between the merge and the apply, `main` is one migration ahead of production.** Nothing on `main` depends on the new policies being there: the application code is unchanged by this pull request, and no application code path changes in it. The suites that read episodes ran green with 0104 applied on 2026-10-13; the unapplied side is the database every pull request has been tested on until now.

## What GREEN's dispatch carries (it is not in this document)

The dispatch is SOLO's, outside the repository, as for 0103. It carries two blocks of its own around this document's stage 0, and three values:

- **BEFORE YOU START:** `origin/main` IS the merge commit, pinned by its full sha, and this document at that commit hashes to the sha256 the dispatch pins on its own.
- **CLOCK CHECK, after stage 0:** it checks the Lisbon clock against the run window and the weekday table, and writes ONE line to `/tmp/0104-window.ok`: the sha stage 0 recorded, then three Lisbon times `YYYYMMDDHHMM` separated by single spaces (the window opens; the last minute stage 1 may start; the window ends).
- **Its halt rule is THE HALT RULE above, in the same words.**

## STAGE 0: the merge, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0104.sha256
MIG=packages/db/migrations/0104_clinical_episodes_role_matrix.sql
SHA0104=eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9
SHAPREV=8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59
SHAPRE=64198e3e4f63b47fcde1e63f4e2d8f836428bd4f0c2004b8401909788d8190d3
SHAPOST=d4d6256052f4189008814281528696f914095bccddc3df3278a3b638188a9e61
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0104-applied.ok || { AGE=$(find /tmp/0104-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0104 in this sitting, or the age of /tmp/0104-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0104-main.sha /tmp/0104-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
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
test -f ${MIG} || { echo "STOP: 0104 is not on disk at origin/main, so the PR has not merged"; exit 1; }
N104=$(find packages/db/migrations -maxdepth 1 -name '0104_*.sql' | wc -l | tr -d ' ')
[ "${N104}" = 1 ] || { echo "STOP: ${N104} files claim migration number 0104, not 1"; exit 1; }
N103=$(find packages/db/migrations -maxdepth 1 -name '0103_*.sql' | wc -l | tr -d ' ')
[ "${N103}" = 1 ] || { echo "STOP: ${N103} files claim migration number 0103, not 1"; exit 1; }
test -f scripts/db/precheck-0104-episode-policies.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0104-episode-policies.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0104}" ] || { echo "STOP: 0104 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0104-episode-policies.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0104-episode-policies.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===102&&e.idx===101&&e.tag==='0104_clinical_episodes_role_matrix'&&e.when===1788502500000&&p.idx===100&&p.tag==='0103_revoke_anon_sequences_default'&&p.when===1788502400000?0:1)" || { echo "STOP: the newest journal entry is not idx 101, tag 0104_clinical_episodes_role_matrix, when 1788502500000, of 102, after idx 100 tagged 0103_revoke_anon_sequences_default at when 1788502400000"; exit 1; }
test -f packages/db/migrations/0103_revoke_anon_sequences_default.sql || { echo "STOP: the file of journal idx 100 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0103_revoke_anon_sequences_default.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0103 on disk is not the file this document pins"; exit 1; }
echo "0103 on disk: 0103_revoke_anon_sequences_default.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0104-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '102 .sql files match 102 journal entries' /tmp/0104-check-journal.out || { echo "STOP: check-journal did not reconcile 102 files with 102 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0104 creates policies, and by the standing ruling such a migration is never eligible for R9, so only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it drops one policy and creates three on public.clinical_episodes, and a migration that creates a policy is closed hours only by the standing ruling)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0104 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0104 creates policies, so it runs in closed hours only, whatever the three proofs read, and the sitting waits. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0104-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0104-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0104-main.sha"
echo "0104 MERGE, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `origin/main and HEAD: <sha>`; the sidecar line `docs/migration-apply-0104.md: OK`; `newest journal entry: idx 101, when 1788502500000, tag 0104_clinical_episodes_role_matrix, of 102; before it idx 100, when 1788502400000, tag 0103_revoke_anon_sequences_default`; check-journal's line with `102 .sql files match 102 journal entries`; the clock line reading `closed by the weekday table`; the three proof lines (they decide nothing here); `running from origin/main <sha>, recorded in /tmp/0104-main.sha`; then `0104 MERGE, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database.

**Until the pull request is merged, this stage ends at its first file check,** `STOP: the document pin is not on disk at origin/main`.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0104_clinical_episodes_role_matrix.sql
SHA0104=eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9
SHAPREV=8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59
SHAPRE=64198e3e4f63b47fcde1e63f4e2d8f836428bd4f0c2004b8401909788d8190d3
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0104-applied.ok || { AGE=$(find /tmp/0104-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0104 in this sitting, or the age of /tmp/0104-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0104-precheck.new || { echo "STOP: the old /tmp/0104-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0104-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0104-main.sha) || { echo "STOP: stage 0's record /tmp/0104-main.sha could not be read. Nothing was applied"; exit 1; }
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
shasum -a 256 -c docs/migration-apply-0104.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0104 is not on disk"; exit 1; }
test -f scripts/db/precheck-0104-episode-policies.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N104=$(find packages/db/migrations -maxdepth 1 -name '0104_*.sql' | wc -l | tr -d ' ')
[ "${N104}" = 1 ] || { echo "STOP: ${N104} files claim migration number 0104, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0104}" ] || { echo "STOP: 0104 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0104-episode-policies.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T103=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[100];process.stdout.write(p&&p.idx===100&&p.tag==='0103_revoke_anon_sequences_default'?p.tag:'none')") || { echo "STOP: node could not read journal idx 100's tag at the recorded sha. Nothing was applied"; exit 1; }
W103=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[100];process.stdout.write(p&&p.idx===100&&p.tag==='0103_revoke_anon_sequences_default'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 100's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W103}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0103's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T103}.sql || { echo "STOP: the file of journal idx 100 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T103}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0103 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0103: packages/db/migrations/${T103}.sql, sha256 ${SHAPREV}, journal when ${W103}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0104-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0104-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0104-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0104-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0104-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W103} -f scripts/db/precheck-0104-episode-policies.sql 2>&1 | tee /tmp/0104-precheck.new || { echo "STOP: the pre-check did not complete, or it printed a FAIL verdict and ended with its own STOP (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0104-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0104-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. A VACUOUS verdict means the table holds no episode or a staff role has no active member in the tenant read, so the behaviour read proved nothing. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0104-precheck.new || true)
[ "${OKS}" = 15 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 15. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, the CARRY rows post_vacuous_expected and registos_in_another_patients_episode and every INFO row: they are counts, they decide nothing in this block, and the lead reads them"

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
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it drops one policy and creates three on public.clinical_episodes, and a migration that creates a policy is closed hours only by the standing ruling)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0104 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0104 creates policies, so it runs in closed hours only, whatever the three proofs read, and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0104-postcheck.out /tmp/0104-stage2.ok /tmp/0104-journal-after.out /tmp/0104-apply.out /tmp/0104-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0104-precheck.new /tmp/0104-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0104-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0104-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0104_clinical_episodes_role_matrix --sha256 ${SHA0104} --expect-pending 1 2>&1 | tee /tmp/0104-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0104-apply.out holds it). Whether 0104 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0104-applied.ok || { echo "STOP: verified-migrate exited 0, so 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0104-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0104 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the same sha twice.
- The run window line, with now inside it.
- The pre-check's table, then `the pre-check profile: 15 OK / 0 VACUOUS / 0 FAIL`. **GREEN reports, as printed, the CARRY rows `post_vacuous_expected` and `registos_in_another_patients_episode` and every INFO row** (the episodes by status and origin, the admins and receptionists with no clinic assignment, what each of the four actors reads now and what the new read policy admits, and the platform's policy_grants setting).
- The clock again, `closed`, and `the clinics' own rows against the weekday table: inside`.
- verified-migrate's lines: `journal    101 -> 102  (delta 1)` and `0104_clinical_episodes_role_matrix present by sha256: yes`.
- `0104 APPLIED. Paste stage 2 now.` Exit 0.

**WHAT THE EXIT MEANS.** Any STOP before the apply line means nothing was applied. A pre-check that prints a FAIL ends with psql's own error and the block's STOP. A pre-check that prints a VACUOUS stops the sitting too: it means the table is empty or a staff role has no active member, and the lead rules. The apply is the only writing command in this document. If verified-migrate exits non-zero, do not read that as nothing applied: its exit 3 before the migration ran is a precondition (on a database that already holds 0104 it reads `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`, exit 3, nothing run), but exit 3 or 4 can also follow a committed apply.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0104=eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9
SHAPOST=d4d6256052f4189008814281528696f914095bccddc3df3278a3b638188a9e61
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0104-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0104 APPLIED, then 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0104 APPLIED, then 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0104-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0104 APPLIED, then 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0104-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0104-main.sha) || { echo "STOP: stage 0's record /tmp/0104-main.sha could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0104.sha256 || { echo "STOP: this document is not the approved one. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0104_clinical_episodes_role_matrix.sql || { echo "STOP: 0104 is not on disk. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0104-episode-policies.sql || { echo "STOP: the post-check is not on disk. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0104_clinical_episodes_role_matrix.sql | cut -d' ' -f1)" = "${SHA0104}" ] || { echo "STOP: 0104 on disk is not the approved file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0104-episode-policies.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0104-window.ok || { echo "STOP: no run window is recorded for this sitting. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0104-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0104-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0104-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0104-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \t]+|[ \t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \t]+|[ \t]+$/, "", b); print b; exit } }' /tmp/0104-precheck.out; }
J=$(carry journal_rows_before)
PB=$(carry policies_before)
OP=$(carry other_policies_md5)
FM=$(carry functions_md5)
S=$(carry secdef_before)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
TM=$(carry triggers_md5)
T=$(carry tables_before)
ER=$(carry episodes_rows)
EM=$(carry episodes_md5)
BT=$(carry behaviour_tenant_md5)
BA=$(carry behaviour_actors_md5)
PV=$(carry post_vacuous_expected)
[ -n "${J}" ] && [ -n "${PB}" ] && [ -n "${OP}" ] && [ -n "${FM}" ] && [ -n "${S}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${TM}" ] && [ -n "${T}" ] && [ -n "${ER}" ] && [ -n "${EM}" ] && [ -n "${BT}" ] && [ -n "${BA}" ] && [ -n "${PV}" ] || { echo "STOP: a carry did not parse out of the transcript. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${PB} ${S} ${T} ${ER}" | grep -qxE '[0-9]+( [0-9]+){4}' || { echo "STOP: a count carry is not a number. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${OP} ${FM} ${RM} ${CM} ${DM} ${TM} ${EM} ${BT} ${BA}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){8}' || { echo "STOP: an md5 carry is not 32 hex characters. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${PV}" | grep -qxE '[0-4]' || { echo "STOP: the carry post_vacuous_expected reads [${PV}], not a number from 0 to 4. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_rows_before=${J} policies_before=${PB} other_policies_md5=${OP} functions_md5=${FM} secdef_before=${S} relation_acl_md5=${RM} column_acl_md5=${CM} default_acl_md5=${DM} triggers_md5=${TM} tables_before=${T} episodes_rows=${ER} episodes_md5=${EM} behaviour_tenant_md5=${BT} behaviour_actors_md5=${BA} post_vacuous_expected=${PV}"
WVAC=${PV}
WOK=$((21 - PV))
echo "the post-check profile this sitting must print, chosen by post_vacuous_expected=${PV}: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL (the verdict of an actor the new read policy admits to no episode reads VACUOUS, and never OK)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0104-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${PB}" -v other_policies_md5="${OP}" -v functions_md5="${FM}" -v secdef_before="${S}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v triggers_md5="${TM}" -v tables_before="${T}" -v episodes_rows="${ER}" -v episodes_md5="${EM}" -v behaviour_tenant_md5="${BT}" -v behaviour_actors_md5="${BA}" -c "begin read only" -f scripts/db/postcheck-0104-episode-policies.sql -c "rollback" 2>&1 | tee /tmp/0104-postcheck.out || { echo "STOP: the post-check ended with an error (psql's lines are above), or its transcript could not be written. If a FAIL verdict is printed above, the file raised its own STOP on it: stage 1 recorded that it applied 0104 and this read does not agree, so the state is UNKNOWN. If no FAIL verdict is printed, this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0104-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0104, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0104-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0104-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}, the number post_vacuous_expected=${PV} allows. A VACUOUS verdict is not a pass. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0104 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0104, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0104}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0104 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0104, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0104 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0104-stage2.ok || { echo "STOP: the pass mark /tmp/0104-stage2.ok could not be written, so the closing read would refuse. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0104 POST-CHECK PASSED. 15/15 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, the profile for post_vacuous_expected=${PV}, journal ${J} to ${JA}; public.clinical_episodes carries its three staff policies and the patient policy, authenticated holds no DELETE on it, episodes ${ER}, tables ${T} and SECURITY DEFINER functions ${S} unchanged. Paste the closing journal read now."
)
```

**EXPECT:** the carries line; `the post-check profile this sitting must print, chosen by post_vacuous_expected=<k>: <21 minus k> OK / <k> VACUOUS / 0 FAIL`; the post-check's table with that profile; `journal rows before=101 after=102, 0104 present by hash`; the last three journal rows; then `0104 POST-CHECK PASSED. ...`. Exit 0.

## THE CLOSING JOURNAL READ. READ ONLY

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0104 APPLIED, then 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0104-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0104 APPLIED, then 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0104-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0104-main.sha) || { echo "STOP: stage 0's record /tmp/0104-main.sha could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0104.sha256 || { echo "STOP: this document is not the approved one. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0104-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0104-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0104-stage2.ok -newer /tmp/0104-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0104-window.ok || { echo "STOP: no run window is recorded for this sitting. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0104-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0104-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0104-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 102' /tmp/0104-journal-after.out || { echo "STOP: the journal read after the apply does not say 102. Stage 1 recorded that it applied 0104, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0104_clinical_episodes_role_matrix[.]sql$' /tmp/0104-journal-after.out || { echo "STOP: the journal read does not list 0104 as APPLIED. Stage 1 recorded that it applied 0104, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0104-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0104-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0104 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 102, 0104 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `journal rows on production: 102`, the line `APPLIED  0104_clinical_episodes_role_matrix.sql`, `pending on this ref: 0`, and `CLOSING READ: the journal reads 102, 0104 is APPLIED, and nothing is pending on the recorded sha.` Exit 0.

## What every verdict must read

| File | Profile the block requires | Otherwise |
|---|---|---|
| Pre-check | `15 OK / 0 VACUOUS / 0 FAIL` | Any FAIL: the file itself raises, psql exits 3, STOP, nothing applied. Any VACUOUS (verdict 14: the table holds no episode, or a staff role has no active member in the tenant read): STOP, nothing applied, the lead rules |
| Post-check | `(21 - k) OK / k VACUOUS / 0 FAIL`, where `k` is the pre-check's carry `post_vacuous_expected`: how many of the four actors the new read policy admits to NO episode, counted from the tables before the apply. On the rehearsal `k` was 0 | Any FAIL: the file raises, STOP, the state is UNKNOWN. Any other count: STOP; the write stands |

**What the pre-check counts, because the design rests on it:**

- **The journal:** 0104 absent by hash, 0103 present once as the newest row at its `when`, 101 rows.
- **The policy it drops and the policy it leaves,** each pinned by md5 of Postgres 17's rendering; two policies on the table, none of the three new names taken.
- **The privileges on the table,** by name, per role.
- **The six functions the new policies call,** each by its flags, owner, EXECUTE for `authenticated` and body md5; and the SECURITY DEFINER count, 36.
- **Verdict 14, the behaviour before:** one real active member of staff per role, in the tenant with the most episodes, is impersonated inside the READ ONLY transaction (identity checked first), and each must read EVERY episode of the tenant today. Any other number is a FAIL.
- **What the new read policy will admit for each of those four,** computed from the tables and not through the helper functions (an INFO row), and `post_vacuous_expected` from it.
- **`registos_in_another_patients_episode`:** the registos filed in an episode whose patient or tenant is not the registo's own. A count the sitting reports; it does not stop the sitting (see "QUESTIONS").
- **Profiles (INFO):** episodes open and closed, imported or not, with no practitioner; active admins and receptionists with no clinic assignment (the clinic test admits such a session to nothing).

**What the post-check proves:** each of the three policies by md5; four policies on the table and the patient policy unchanged; the privileges (no DELETE for `authenticated`, everything else as before); the policy count plus 2; every other policy, every function, every other privilege, every column and default privilege, every trigger and the table count unchanged by md5; no row moved (count and md5); 0104 in the journal once as the newest row; the same four actors as the pre-check; and, per role, that the episodes the actor reads as `authenticated` EQUAL the episodes the new policy admits, computed from the tables.

**The limit of the behaviour verdicts:** they compare counts, not sets, for one actor per role. The DB-gated suites carry the per-row proofs.

## Every reader and writer the changed policies govern

Read on this head (`main` at `5d4e8091` merged in). Every staff reader and writer runs under `withTenantContext` (`SET LOCAL ROLE authenticated` and the JWT claims), so the policies apply to it. "Proved" names the DB-gated test that ran it as the real role on the throwaway with 0104 applied, 2026-10-13.

| Where | What it does | After 0104 | Proved by |
|---|---|---|---|
| `apps/web/lib/clinical/episodes.ts:140` `insertOpenEpisode` (callers: `createEpisode`, `apps/web/app/patients/[id]/episode-actions.ts:47`; `createDraftRecord`) | INSERT ... RETURNING, in the caller's own name | unchanged: the callers ask the narrow patient scope first, which is the insert policy's own test | `episodes.create.db.test.ts` (12), `episodes-role-matrix.db.test.ts` |
| `episodes.ts:231` `findOpenEpisodeOfSpecialty` (`episodes.ts:109`, `records.ts:751`) | the reuse decision | unchanged: a therapist who treats the patient reads a colleague's open episode of that patient and reuses it | `episodes-role-matrix.db.test.ts`: "reads a colleague's open episode", "opens no second one" |
| `episodes.ts:312` `listOpenAppEpisodes` (`apps/web/app/patients/[id]/page.tsx:344`) | the Registos tab's open episodes | unchanged | `episodes-role-matrix.db.test.ts`: "the Registos tab lists that open episode" |
| `episodes.ts:363` `getEpisodeDetail` (`apps/web/app/clinical/episodes/[id]/page.tsx:27`) | the episode page | unchanged where the viewer reads the patient's registos; **changed, on purpose: not found for an admin of another clinic** | `episodes-role-matrix.db.test.ts`: "the episode page opens for the owner and for an admin of the patient's clinic, and is not found for ..." |
| `apps/web/lib/clinical/ficha-groups.ts:61` `listFichaRecords` | the Registos tab, each registo with its episode's title | unchanged for the owner, an admin of the patient's clinic, a treating therapist and a care-team therapist at their own clinic | `episodes-role-matrix.db.test.ts`: four "reads every registo on the Registos tab with its episode's title" |
| `apps/web/lib/clinical/records.ts:242` `getRecordDetail` | the registo page, the same join | unchanged | `episodes-role-matrix.db.test.ts`: "the registo page shows an admin of the patient's clinic the episode's title" |
| `records.ts:432` `listEpisodes` | no caller in the application (dead) | none | not run |
| `records.ts:462` `listEpisodesForPicker` (`apps/web/app/clinical/new/page.tsx:26`) | the new-registo picker | **changed, on purpose: a therapist is offered the open episodes of patients they treat, and none of a patient they do not** | `episodes-role-matrix.db.test.ts`: "the new-registo picker offers ..." |
| `records.ts:612` `assertEpisodeIsThePatients` | the guard before a registo is filed in an episode | unchanged for an episode the caller reads; an episode the caller does not read is no row, and no row is a refusal: it fails closed | `records.episode-guard.db.test.ts` (28) |
| `apps/web/lib/clinical/report/episode-export.ts:106` `readEpisodeExportRows` (`:179`) | the existence read before an episode's PDF | unchanged for the Registos tab's own reach | `episode-export.db.test.ts` (17), `export-audit.db.test.ts` (35) |
| `apps/web/lib/patients/actions.ts:547` `hardDeletePatient`, `apps/web/lib/patients/queries.ts:251` `getPatientHardDeleteBlockers` | count a patient's episodes before a hard delete | the count is the caller's own read. Where the caller reads fewer, the database still refuses the delete (the foreign key ignores row level security) and the action names it `has_references`. Nothing is deleted | `episodes-role-matrix.db.test.ts`: "the hard delete ... is refused as has_references"; `actions.hard-delete.db.test.ts` (4) |
| `apps/web/lib/admin/staff.ts:587` `countStaffActivity` (`deleteStaffMember`) | counts episodes in a member of staff's name before removal | the same: the foreign key refuses, the action names it `has_activity` | `episodes-role-matrix.db.test.ts`: "the removal of a member of staff ..."; `staff.delete.db.test.ts` (4) |
| `packages/db/src/migration/upsert.ts:615`, `:871`, `:883`; `packages/db/src/migration/reconciliation.ts:187` | the Fisiozero importer: insert, update, integrity read, with OWNER claims | unchanged: the owner arms admit it | the importer's suites in packages/db ran green on the applied throwaway; that they run as `authenticated` with owner claims was read in the code, not measured separately |
| `public.merge_patients` (0005, SECURITY DEFINER, owner `postgres`) | re-points a merged patient's episodes | not under the policies: unchanged | `merge-refusals.db.test.ts` (5), the merge arm of `clinical-episodes-role-matrix.db.test.ts` |
| owner-run scripts under `packages/db/scripts` and `scripts/import` | read and, for two dated scripts, update episodes as the connecting role | not under the policies when the session reads past row level security, which pre-check verdict 5 asserts for the sitting's own session | pre-check verdict 5, on the throwaway. Production's connecting role was not read |
| `apps/portal`, `apps/api`, `apps/admin`, `packages/ingestion` | no reader or writer of the table (searched) | none | the patient arms of `clinical-episodes-role-matrix.db.test.ts` and `cross-tenant-rls-isolation.test.ts` |

**The database matrix itself,** ten staff cases by four commands, one test per cell, plus the named arms and the patient role: `packages/db/tests/clinical-episodes-role-matrix.db.test.ts`, 55 of 55 on the applied throwaway. `cross-tenant-rls-isolation.test.ts` (98) and `adversarial-rls-escape.test.ts` (23) passed on it too.

## Rollback

**There is no automatic rollback, the restoring statements are five, and nobody runs them from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the statements and the journal row in one transaction. If anything fails, nothing changed (`journal    101 -> 101  (delta 0)`).
- **After the COMMIT, the statements that restore the table are the migration's own turned round:** drop the three new policies, grant DELETE on the table back to `authenticated`, and create `clinical_episodes_tenant_isolation` again exactly as migration 0001 writes it (FOR ALL, TO `authenticated`, USING and WITH CHECK on the tenant of the JWT). They take the same locks as the apply.
- **Measured on the throwaway on 2026-10-13:** after 0104 and then those statements, the pre-check read 12 OK / 0 VACUOUS / 3 FAIL, the three being the journal verdicts (1, 2 and 3), because the journal row stays. Verdicts 7, 8, 9 and 14 read OK again: the restored policy hashes to the md5 pinned for 0001's, the privileges are as before, and each actor reads the whole tenant. With the throwaway's journal row removed as well, it read 15 OK / 0 VACUOUS / 0 FAIL, and every carry (other policies, functions, relation, column and default privileges, triggers, episode rows) was byte-identical to the first pre-check.
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed and reviewed, and is applied by GREEN on the owner's dispatch. The journal row of 0104 stays: a journal row is never deleted. **GREEN never runs those statements from this document; SOLO never runs them at all; and no block here contains them.**
- **What a rollback does not reach:** nothing. 0104 writes no row, so there is no data to put back.

## OWNER CLICKS, in order

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | On the pull request: take the label `held-for-apply` off | after GREEN's clean report on 0103, SOLO's READY line, and `main` merged into the branch with CI green on that head | nothing by itself |
| 2 | On the pull request: merge | right after click 1, and never while a sitting of GREEN's is in flight | `main` is then one migration ahead of production. Nothing else merges until GREEN's report on 0104 |
| 3 | Launch GREEN and hand it SOLO's dispatch, which names `0104_clinical_episodes_role_matrix.sql` | after SOLO has filled the dispatch; in closed hours, inside its run window | the sitting: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 4 | Read GREEN's report on 0104 | when it arrives | merges resume. If the report carries a STOP: nothing is pasted again, and the lead rules |

**There is no click after the apply for 0104 itself:** no count GATE-CHANGE and no second merge. One GATE-CHANGE is owed AFTER the merge, as its own pull request: the two new DB-gated suites join the skip guard's required list (see "GATE-CHANGES").

## GATE-CHANGES

- **None for the promotion.** With the file in place `node scripts/check-journal.mjs` reads 102 of 102, `pnpm test:scripts` passes whole and `node scripts/assert-gates-unchanged.mjs` finds every pin unchanged. No test of 0103's needed a journal cut.
- **None for the apply.** The SECURITY DEFINER count stays 36 (`packages/db/scripts/check-security-definer-owner.mjs`, read on the applied throwaway: 36, all owned by postgres).
- **One owed after the merge, the owner's to merge:** `.github/scripts/assert-rls-executed.mjs` gains two entries in its required list, after the entry for `survey-page.db.test.ts`: `{ file: "clinical-episodes-role-matrix.db.test.ts", hard: true },` and `{ file: "episodes-role-matrix.db.test.ts", hard: true },`, and `.github/gate-manifest.json` takes that file's new sha256. Until then both suites run and are counted; the entries make their ABSENCE red too.

## Rehearsal

**2026-10-13, 22:10 to 22:30 Lisbon, on a throwaway built by the recipe `docs/migration-apply-0100.md` records.** Never a lane, never production. It is the second run of the evening: a first session ran the same steps from 21:46 and was cut off before it committed anything, so every figure below is the second session's own, on a throwaway it built afresh. The two runs agree on every line they share.

**The throwaway.** A local Supabase stack, project id `r0104`, Supabase CLI 2.100.0, PostgreSQL 17.6, database on 127.0.0.1:55402, started with CI's exclude list. Built at production's position after 0103: this head's `supabase/migrations` minus 0104, so 101 migrations, `0000` to `0103` (101 rows in `supabase_migrations.schema_migrations`), then `supabase/seed.sql`; a drizzle journal of 101 rows built from `_journal.json` entries idx 0 to 100, each `hash` the sha256 of its file and each `created_at` its `when`, the newest 0103 (`8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59`, `when` 1788502400000). A synthetic fixture in the seed tenant: nine members of staff over the four roles, two active clinics (08:00 to 21:00), four patients, three appointments, one care-team row, five episodes. No real name anywhere.

| Step | What ran | Result |
|---|---|---|
| Pre-check, whole, the real file, the real journal | `psql ... -v prev_hash=<0103> -v prev_when=1788502400000 -f scripts/db/precheck-0104-episode-policies.sql` | exit 0, `15 OK / 0 VACUOUS / 0 FAIL`. Behaviour row: `admin 5 of 5, 0104 admits 2; owner 5 of 5, 0104 admits 5; reception 5 of 5, 0104 admits 2; therapist 5 of 5, 0104 admits 2`. `post_vacuous_expected` 0, `registos_in_another_patients_episode` 0. `supautils.policy_grants`: `postgres: 24 tables, auth.users yes` |
| The locks | the file's statements in one transaction, read from a second session, rolled back | the table under "Closed hours, and the locks". The pre-check, run again after the rollback, printed the same rows |
| The apply, through the real applier | `node packages/db/scripts/verified-migrate.mjs --tag 0104_clinical_episodes_role_matrix --sha256 eb849478f1db3cc725034d7246c11c9398714649f6a599761c4075c9a654dee9 --expect-pending 1`, the database URL pointing at the throwaway | exit 0: `journal    101 -> 102  (delta 1)`, `0104_clinical_episodes_role_matrix present by sha256: yes`. The applier has no target check of its own, so it runs locally unchanged; the target guard is a separate program and was not run (see "NOT REHEARSED") |
| The second apply | the same command again | **a clear refusal, exit 3, nothing run:** `PRECONDITION FAILED: 0104_clinical_episodes_role_matrix's sha256 is ALREADY in drizzle.__drizzle_migrations.` The journal stayed at 102 |
| An apply that fails inside its transaction | the same command, on a throwaway where the five statements had already been run by hand and the journal still read 101 (a rehearsal mistake: a timing script ran outside its transaction; that throwaway was thrown away and built again before every other row of this table) | **exit 4, nothing applied:** the DROP POLICY found no policy to drop, drizzle rolled back, `journal    101 -> 101  (delta 0)`, `0104_clinical_episodes_role_matrix present by sha256: NO`, `FAIL: drizzle-kit migrate exited 1.` |
| Post-check, whole, the carries from the pre-check's transcript | `psql ... -v <14 carries> -c "begin read only" -f scripts/db/postcheck-0104-episode-policies.sql -c "rollback"` | exit 0, `21 OK / 0 VACUOUS / 0 FAIL`. Reads: owner 5 of 5, admin 2 of 5, reception 2 of 5, therapist 2 of 5, each equal to the count from the tables |
| Negative control: the pre-check on the APPLIED database | the same pre-check command | **psql exit 3:** 7 FAIL verdicts (1, 2, 3, 7, 8, 9, 14), then the file's own `STOP: the 0104 pre-check printed a FAIL verdict` |
| packages/db, every suite, the way `db-tests.yml` runs it | `pnpm exec vitest run` with only the throwaway's URL in the environment | Test Files 103 passed (103); Tests 1617 passed (1617); 0 skipped; exit 0 |
| apps/web, every DB-gated suite | `pnpm exec vitest run .db.test.ts` | Test Files 64 passed (64); Tests 778 passed (778); exit 0 |
| apps/api, every DB-gated suite | `pnpm exec vitest run .db.test.ts` | Test Files 10 passed (10); Tests 96 passed (96); exit 0 |
| The SECURITY DEFINER count | `node scripts/check-security-definer-owner.mjs` in packages/db | `OK: all 36 owned by postgres.` exit 0 |
| The restoring statements, then the pre-check again | the five statements of "Rollback" in one transaction, after every suite had run | `12 OK / 0 VACUOUS / 3 FAIL` with the journal row left (exit 3, by design); `15 OK / 0 VACUOUS / 0 FAIL` and every carry identical once the throwaway's journal row was removed too |
| The application's matrix suite on that restored database | `pnpm exec vitest run lib/clinical/episodes-role-matrix.db.test.ts` in apps/web | **it THROWS, by design, exit 1:** `0104 IS PROMOTED (0104_clinical_episodes_role_matrix.sql creates clinical_episodes_select) BUT THIS DATABASE DOES NOT HAVE IT.` So from this pull request on, a database built without 0104 cannot turn these suites green, and the side before the apply can no longer be run from this head |
| The throwaway removed | `supabase stop --no-backup`, 22:30 Lisbon | no `r0104` container or volume left |

### NOT REHEARSED, said one by one

- **The four blocks, whole, against a database.** They ran only in the script test's harness, where git, psql, node and the clock are stand-ins. What ran against the throwaway are the commands the blocks wrap: the pre-check, verified-migrate and the post-check, with the same arguments.
- **The target guard** (`scripts/assert-production-target.mjs`) and **the closing read's reader** (`packages/db/scripts/read-applied-migrations.mjs`): both refuse any target that is not production, and under the lead's rule of 2026-09-30 a guard is never passed. Neither was run.
- **The dispatch's two blocks** (BEFORE YOU START, CLOCK CHECK): the dispatch is not written yet.
- **Production.** Its policy text and helper bodies (the md5 pins were read on Postgres 17.6 local stacks; the pre-check STOPs if production's differ), its `supautils.policy_grants`, its episode count, its staff per role, the count of registos in another patient's episode, and the time the locks are held there.
- **The cost of the two per-row helper functions on a table of production's size.** Not measured anywhere.
- **No Playwright spec ran with 0104 applied.**
- **A VACUOUS post-check verdict** (`post_vacuous_expected` above 0): the fixture gave 0. The arm is exercised only by the script test's stand-in transcripts.

## QUESTIONS THIS DOCUMENT DOES NOT ANSWER

1. **`registos_in_another_patients_episode` above zero on production.** Such a registo shows its episode's title only to a session the new read policy admits to the OTHER patient's episodes; for anyone else the title comes back empty on the Registos tab. Options: (a) the count is reported and the sitting goes on; (b) a non-zero count is a STOP in stage 1. Built: (a). Recommended: (a) if the count is small and the lead has seen it, because 0104 neither causes nor changes such a registo; (b) costs one line in stage 1 and a new sidecar. The lead's call, before the READY line.
2. **A VACUOUS pre-check on production** (a role with no active member of staff in the tenant with the most episodes) stops the sitting. Options: (a) keep; (b) accept `14 OK / 1 VACUOUS`. Built and recommended: (a).
3. **Who may see this pull request before the apply.** `CLAUDE.md` says 0104's "detail is private until it is applied". The migration's header, the two check files and this document describe the change in full, and the branch's first commit message names it. Pushing the branch publishes all of it some hours before the sitting. Options: (a) push as it stands on the morning of the sitting, as 0097's held pull request was; (b) push only minutes before the merge; (c) rebuild the branch as one commit with a neutral message first, which needs a human's word (a rewrite is refused to the lane). The owner's call.

## JUDGMENTS, NOT RULINGS, in this document

- **The blocks are 0103's, changed by substitution,** not written afresh: the number, the file names, the pins, the journal position, the pre-check's profile (15), the carries, the post-check's profile and the R9 lines. 0103's blocks were reviewed and swept; these have had no review of their own yet.
- **`carry()` matches a row's name exactly** (0103's matched a substring), because `policies_before` and `other_policies_md5` are both rows here.
- **R9's three proof lines are still printed,** proof 2 reading `no`, and decide nothing: the clock arm passes in closed hours only, whatever they read.
- **A FAIL ends the check file with an error** in addition to the block's count. 0103's files did not. Because of it, the STOP on stage 2's post-check run was rewritten: 0103's said the write stands (a run that did not complete has contradicted nothing), which is no longer the only way that line can fire. It is the one STOP of the four blocks whose sentence is 0104's own, and `scripts/episode-policies-0104.test.mjs` holds it to that sentence.
- **Verdict 14 of the pre-check keeps VACUOUS as its ELSE** (FAIL first, then OK under its own condition, anything else VACUOUS). 0103's rule was VACUOUS before OK; the script test accepts either, and refuses OK as an ELSE.
