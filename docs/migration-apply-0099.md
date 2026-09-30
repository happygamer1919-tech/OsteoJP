# 0099: apply the TRUNCATE, TRIGGER, REFERENCES revoke from `authenticated`

**NOT READY. OPTION 1 IS RULED (the lead, 2026-09-30). It waits on 0096, 0097 and 0098 applied and merged, the promotion, and the whole-block rehearsal on the promoted head.**

**Status: NOT READY. NOT PROMOTED. NOT APPLIED.** One migration, today the pending file
`packages/db/migrations-pending/NEXT-AFTER-0098_revoke_truncate_trigger_references.sql`,
which the promotion renames, byte for byte, to
`packages/db/migrations/0099_revoke_truncate_trigger_references.sql`. It is applied from
`origin/main` at #1397's merge commit, after #1397 has merged. Five blocks, each pasted
whole, on its own and in order: stage 0 (the promotion, the files and the head it runs
from), stage 1 (the HEAD CHECK, the pre-check, the behaviour check BEFORE and the apply),
stage 2 (the post-check), stage 3 (the behaviour check AFTER) and the closing journal read.
One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0099 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number
changed and no other change.**

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE 2026-09-30: OPTION 1 RULED.** The lead's dispatch of that evening: "0099: option 1
   (revoke across public plus matching default privileges)". As first written, this step
   read: **The owner rules on `SEC-truncate-grant-platform-default`.** The card puts three
   options: (1) revoke across `public` plus the matching `ALTER DEFAULT PRIVILEGES`,
   (2) revoke only on the tables holding patient data, (3) accept the platform default and
   record the acceptance. **This document prepares option 1, exactly as #1397 builds it.**
   A ruling of 2 or 3 retires this document: option 2 needs a different migration body
   and new check files, and option 3 needs no migration.
2. **0096, 0097 and 0098 are applied to production and merged, in that order** (the fifth
   renumbering: apply order equals file order). One migration is in flight at a time, so
   0099 is not promoted until 0098 is applied and #1469 is merged. Production then reads
   journal 96 (`0000` to `0098`; the numbering has gaps).
3. **SOLO promotes 0099 on this branch, `sec/B10-revoke-truncate-trigger-references`:**
   merge `origin/main` in (no rebase); `git mv` the pending file to
   `packages/db/migrations/0099_revoke_truncate_trigger_references.sql` (a rename, not one
   byte changed: sha256 `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b`
   before and after); append its journal entry to `packages/db/migrations/meta/_journal.json`
   at **`idx 96`**, tag `0099_revoke_truncate_trigger_references`, with a **`when` strictly
   greater than 0098's** (by the queue's pattern, 0098's `when` plus `100000`; a `when`
   equal or lower makes drizzle skip the file in silence, which is why
   `scripts/check-journal.mjs` refuses one); run `node scripts/sync-supabase-migrations.mjs`
   for the mirror; run `node scripts/check-journal.mjs` (97 files, 97 entries); move the
   README row into the Promoted table.
4. **SOLO re-reads every pin against the promoted head,** because three may move before
   then: 0098's sha256 (pinned below as `198054ab…35b0`, read from #1469's branch on
   2026-09-30; a review fix there would move it); `verified-migrate.mjs` (the lead ruled on
   2026-09-30 that a Tier B PR adds a lock and statement timeout to it after 0096 and 0097
   are applied, "with its new sha256 pinned in later documents only"); and this document's
   own. If any pin moves, this document, its sidecar and GREEN's dispatch move together.
5. **The rehearsal agent runs this document's five blocks and GREEN's two** on a throwaway
   standing at production's position with the Supabase platform default privileges in
   place, and the three check files there, and records it here (see "Rehearsal", which
   says what the authoring lane could and could not run). **The build lane's own rehearsal
   on the OsteoJP schema was BLOCKED on 2026-09-30 by the classifier,** verbatim below.
6. **CI is green on the promoted head** (the required checks, and `db-tests`, which
   applies 0099 with every other migration on a real Supabase stack and runs the packages/db
   suite over it). **Corrected 2026-09-30:** this step first called that run "the first run
   of the whole app suite with the three privileges gone", which is probably false.
   `supabase/seed.sql` says Supabase CLI v2.106.0 stopped applying the platform's default
   Data API privileges, and `db-tests.yml` pins v2.107.0. If so, CI's stack never gave
   `authenticated` the three privileges. `db-tests` still shows the app does not need them,
   but it cannot stand in for the premise. The premise was measured on the throwaway of
   16:16 (see "Rehearsal").
7. **The owner takes `held-for-apply` off #1397 and merges it**, and freezes merges to
   main from that merge until GREEN's report is in (SOLO disarms every armed PR first).
   The title's DRAFT marker is the lead's to remove.
8. **SOLO fills the merge commit's sha into GREEN's dispatch** (its two placeholders),
   refills the dispatch's document sha256 if this document moved, and deletes the
   dispatch's NOT READY paragraph.

| Fact | Value |
|---|---|
| Card | `SEC-truncate-grant-platform-default` (PURPLE, #1396). **Option 1 ruled by the lead on 2026-09-30**; the card is updated on the board |
| Ruling | **None yet on the option.** The number is ruled: `0099` by the owner and the lead on 2026-09-30 (the fifth renumbering), was `0096` (2026-09-27) and `0095` (2026-09-22). The binding table is in `CLAUDE.md` under "SOLO's record" |
| Migration | today `packages/db/migrations-pending/NEXT-AFTER-0098_revoke_truncate_trigger_references.sql`; at the sitting `packages/db/migrations/0099_revoke_truncate_trigger_references.sql`. sha256 `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b` in both places |
| Journal | `idx 96`, tag `0099_revoke_truncate_trigger_references`, `when` strictly above 0098's. Stage 0 reads both from the journal and requires the order; no `when` is pinned here, because 0098's is set at its own promotion |
| Mirror | `supabase/migrations/0099_revoke_truncate_trigger_references.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs with `node` directly after asserting its sha256 |
| Must follow | `0098`, the staging index (#1469): its body sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`, applied to production (journal 95 to 96) and merged. Stage 0 finds it at `idx 95` by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| PR | #1397, branch `sec/B10-revoke-truncate-trigger-references`, labelled `held-for-apply` until the owner takes it off and merges |
| Runs from | `origin/main`, when it IS #1397's merge commit. Stage 0 records the sha `origin/main` resolves to in `/tmp/0099-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK) |
| This document | `docs/migration-apply-0099.md`, pinned by `docs/migration-apply-0099.sha256` and asserted by every stage; GREEN's dispatch pins its sha256 on its own and checks it by machine twice |
| Pre-check | `scripts/db/precheck-0099-grants-revoke.sql`, READ ONLY, 15 verdicts each with its control, 12 carries, 3 INFO rows, `-v prev_hash` and `-v prev_when` required, sha256 `2860eab70cff72dbd53b09203abb0b0b8a45130e875654d7156c7ab8ac98f761` |
| Post-check | `scripts/db/postcheck-0099-grants-revoke.sql`, READ ONLY, 15 verdicts, nine carries in, sha256 `4aedfa68a2f119783d0ec3acebea279300c9b8c34e5c5c1437b053d1365f9e14` |
| Behaviour check | `scripts/db/behaviour-0099-grants-readonly.sql`, READ ONLY, 7 arms and a SUMMARY row, run TWICE: `-v phase=before` in stage 1 before the apply, `-v phase=after` in stage 3 with the BEFORE run's two outcome md5s. sha256 `580202037bf7f7e5d06460f3b64b0c3dea0abd2f4af2dfdf4360c9051e106470` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three as `origin/main` holds them on 2026-09-30 (`f884be4d`), and all pinned in every block that runs them. NOT READY step 4 says why `verified-migrate.mjs`'s pin may move |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`. It imports nothing but `node:` builtins |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts` (0094 to 0097 did not pin them either). Their tree is fixed instead: GREEN's BEFORE YOU START requires `origin/main` to BE #1397's merge commit, and the CLOCK CHECK and the HEAD CHECK halt on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0099-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stages 2, 3 and the closing read refuse at or after its end. Stage 0 removes the record |
| What it changes | On every ordinary and partitioned table in `public`: `REVOKE TRUNCATE, TRIGGER, REFERENCES ... FROM authenticated`. Then `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated`, for the role that runs it (`postgres`), so the next `CREATE TABLE` does not re-grant them |
| What it never touches | every policy, every function (so the SECURITY DEFINER count, 28 after 0096 and 0097, stays 28: **no GATE-CHANGE**), every column, every row, `SELECT`, `INSERT`, `UPDATE`, `DELETE` and `MAINTAIN` for every role, and every privilege of every other role. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256, so the digest lives in `docs/migration-apply-0099.sha256` and every stage checks it
with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same
head as the document, so a main that moved to a new document and a new sidecar together
would pass that check. **GREEN's dispatch closes that by machine:** it pins this
document's sha256 on its own; its BEFORE YOU START checks that pin against the
`origin/main` it resolves and records that head; its CLOCK CHECK, pasted between stage 0
and stage 1, halts unless stage 0 recorded that same head and the document at the recorded
sha still hashes to the pin. From stage 0 on, the HEAD CHECK halts on any moved main before
the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted into
zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number).
Narration is `echo`.

**The migration's own header names no number at all,** so the rename leaves nothing stale
in it. This document's earlier name was `docs/migration-apply-revoke-truncate-trigger-references.md`,
renamed with `git mv` on 2026-09-30 when the number was ruled.

## 1. What it does

Two statements.

| # | Statement | Effect |
|---|---|---|
| 1 | a `DO` loop over every ordinary and partitioned table in `public` | `REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE ... FROM authenticated` |
| 2 | `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated` | the next `CREATE TABLE` by `postgres` does not re-grant those three |

No policy, function, column or row is touched. No backfill. No data change.

**It takes no lock on any table, measured.** On the rehearsal container (Postgres 17.6),
the whole body ran to completion, with a 2 second `lock_timeout`, while another session
held an open `INSERT` on a table it revokes on, and again while another session held
`ACCESS EXCLUSIVE` on it; afterwards the applying session held no lock on that table.
GRANT and REVOKE rewrite the catalogue row, not the table. That is why a sitting while the
clinics are open (the owner's override for this day) cannot queue behind, or in front of,
a clinic's reads and writes.

## 2. Why

`authenticated` is not a theoretical role in this product. Every tenant-scoped staff read
and write runs as it: `packages/db/src/client.ts:152` issues `set local role authenticated`
inside `withTenantContext`, and that role drop is what makes RLS apply at all, because the
connecting role is the owner and has BYPASSRLS. So a privilege held by `authenticated` is a
privilege held by the application on every request.

It holds three it has never used. They were never granted by this repository. They come
from Supabase's `ALTER DEFAULT PRIVILEGES`, which grants ALL on new tables to
`authenticated`, and ALL includes these three. `0021_grants_hardening.sql:57` closed exactly
this door for `anon` (`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM
anon`) and has no counterpart for `authenticated`. `0080_reschedule_requests.sql:204-215`
records the same mechanism biting once already, on DELETE. **TRUNCATE ignores row level
security:** no policy constrains it.

### 2a. The measurement this acts on, and it is not SOLO's

Board card **`SEC-truncate-grant-platform-default`** measured it on production on
2026-09-17, alongside the 0089 read-only post-check: `authenticated` held TRUNCATE on
**30 of the 46** tables in `public`, TRIGGER and REFERENCES on **38 of the 46**. Reproduced
on a throwaway built from `supabase/migrations` with that one platform default added and
nothing else changed; built without it, the same migrations produce zero of all three.

**This document implements that card's option 1, which the lead ruled on 2026-09-30.** The
card notes only option 1 survives the next `CREATE TABLE`. The migration is held so the
decision has something to approve rather than something to specify.

### 2b. One correction to that card, and it cuts toward acting

The card says the application "connects as `postgres` over DATABASE_URL and never as
`authenticated`". The first half is right and the second is not: the app connects as the
owner and then drops role for the body of every tenant-scoped transaction
(`client.ts:152`), and the portal drops to `patient` (`:196`). **No exposure is
demonstrated:** PostgREST issues no TRUNCATE, and no code path here issues one. The
distance between the over-grant and a statement that would use it is one line of SQL inside
an already-open transaction.

## 3. What breaks: nothing, and here is the evidence rather than the claim

- **TRUNCATE is not used anywhere.** The token does not appear as SQL in `apps/`,
  `packages/`, `scripts/` or `supabase/`. Deletion here is DELETE under RLS, a cascade, or a
  soft delete.
- **TRIGGER and REFERENCES are DDL privileges.** All DDL is in migrations, which run as the
  owner. **Existing triggers keep firing and foreign keys keep checking** for a session that
  lacks them: TRIGGER is needed only to CREATE a trigger, and REFERENCES only to CREATE a
  foreign key. Measured on the rehearsal container, below (W1): after the revoke, an
  `authenticated` session inserted a row whose foreign key was checked, and an UPDATE fired
  a BEFORE UPDATE trigger.
- **No column-level REFERENCES grant exists to be lost.** A table-level REVOKE REFERENCES
  also drops the column-level REFERENCES grants (the same privilege at column level).
  Pre-check verdict 10 requires there to be none, and post-check verdict 9 requires every
  column privilege in `public` unchanged.
- **What the app roles may SELECT, INSERT, UPDATE and DELETE does not move,** proven three
  ways in the sitting: the catalogue (post-check 10, one md5 over every such privilege of
  `authenticated`, `patient`, `anon` and `service_role` on every relation in `public`), every
  other privilege (post-check 8), and the executor (the behaviour check: every pair asked
  of the executor BEFORE and AFTER, with identical answers).

## Merged before the apply, and why that is safe here

**#1397 carries no app code.** It carries the migration, this document and its sidecar, the
three check files, a script test and the pending README. Nothing in the app uses the three
privileges, so the app behaves the same before and after the apply, and a merged main that
production has not caught up with yet is a state the app already lives in.

**Between the merge and the apply, main is ahead of production by exactly one migration,**
and the pre-check says so: it passes only while 0099 is absent from the journal and 0098 is
its newest row. The daily `prod-drift-check` would report 0099 as pending if the sitting
halted before the apply; that report is correct, and it is informational.

**Exactly one `packages/db/migrations/0099_*.sql` may exist; if anything else is ever found
under `0099_`, STOP.** The number is the apply authorisation (`CLAUDE.md`, the binding table
under "SOLO's record").

## What is new here, because 0099 changes grants and not policies

Every earlier apply in this series moved POLICIES, and its behaviour check impersonated a
staff actor to evaluate them. **0099 moves GRANTS, and a grant belongs to a role, not to a
person.** So:

- **the pre-check** proves the premise with a control on every verdict: `authenticated`
  holds each of the three on at least one table (a zero means this is not the database the
  card measured, and the apply would change nothing: FAIL), the owner holds all three on
  every table (so the zero after the apply is not a blind instrument), the session is the
  owner of every table and the grantor of every grant it will revoke, the `public` TABLES
  default of the session's role grants `authenticated` all three, and no GLOBAL default does
  (a per-schema REVOKE cannot remove a global grant);
- **the post-check** proves both halves (no table grants the three; the default no longer
  does) and proves everything else unchanged by one md5 each: every other default privilege,
  every other relation privilege in `public`, every column privilege, every SELECT, INSERT,
  UPDATE and DELETE of the four API roles, every policy, every function and the SECURITY
  DEFINER count; and the journal moved by exactly one;
- **the behaviour check chooses no actor.** It asks the EXECUTOR, as `authenticated` and as
  `patient`, whether each of SELECT, INSERT, UPDATE and DELETE would be allowed on every
  table: it runs `EXPLAIN` of each statement as that role. `EXPLAIN` without `ANALYZE` plans
  and never executes, and in a READ ONLY transaction it still runs the executor's permission
  check, so a missing privilege refuses with 42501 exactly as the real statement would. It
  runs BEFORE the apply (stage 1) and AFTER (stage 3), and arm 5 requires both roles'
  answers identical, by md5. It never names a staff member, a patient or a row.

**What a READ ONLY check cannot measure** is the refusal itself. A READ ONLY transaction
refuses `TRUNCATE` with 25006 before it reads the privilege (measured, W4 below), and
`CREATE TRIGGER` is DDL. So on production the three are proven by the catalogue
(`has_table_privilege`, the function the executor's own check calls), and IN ACTION only by
the rehearsal (W2, W3) and CI.

## The HEAD CHECK, and running from main

No block reads a branch, and there is no separate HEAD CHECK to paste: the machine runs it
inside every block.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean,
  removes the previous sha and run window records, fetches, resolves `origin/main`, checks
  that sha out detached and verifies HEAD is it, verifies the sidecar, the promotion, the
  journal, 0098's bytes and every pin, and only then records the sha in `/tmp/0099-main.sha`.
- **The run window is checked by machine in every block from stage 1 on,** from the record
  GREEN's CLOCK CHECK writes after stage 0.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql. It then checks out the RECORDED sha and asserts
  every file it runs by sha256.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied
  marker `/tmp/0099-applied.ok` exists, and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stages 2 and 3 and the closing read are READ ONLY** and run from the recorded sha
  whatever main has done since: each prints whether main moved, with both shas, and never
  stops on it, and each verifies the worktree HEAD is the recorded sha.
- **A moved main before the apply ends the sitting.** Nothing is applied, both shas go in the
  report, and whether and when to start again is the lead's call.

## STAGE 0: the promotion, the files and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0099.sha256
MIG=packages/db/migrations/0099_revoke_truncate_trigger_references.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0098_revoke_truncate_trigger_references.sql
SHA0099=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPREV=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPRE=2860eab70cff72dbd53b09203abb0b0b8a45130e875654d7156c7ab8ac98f761
SHAPOST=4aedfa68a2f119783d0ec3acebea279300c9b8c34e5c5c1437b053d1365f9e14
SHABEHAVIOUR=580202037bf7f7e5d06460f3b64b0c3dea0abd2f4af2dfdf4360c9051e106470
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0099-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0099 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0099-main.sha /tmp/0099-window.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}
echo "--- THE HEAD CHECK: the worktree must be on the origin/main this stage records"
[ "$(git rev-parse HEAD)" = "${MAIN}" ] || { echo "STOP: the worktree is not on origin/main after the checkout"; exit 1; }
echo "origin/main and HEAD: ${MAIN}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0099 is not on disk at origin/main, so #1397 has not merged"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 1 ] || { echo "STOP: ${N99} files claim migration number 0099, not 1"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
test -f scripts/db/precheck-0099-grants-revoke.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0099-grants-revoke.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-0099-grants-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0099}" ] || { echo "STOP: 0099 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0099-grants-revoke.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0099-grants-revoke.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-0099-grants-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===97&&e.idx===96&&e.tag==='0099_revoke_truncate_trigger_references'&&p.idx===95&&p.tag.startsWith('0098_')&&e.when>p.when?0:1)" || { echo "STOP: the newest journal entry is not idx 96, tag 0099_revoke_truncate_trigger_references, of 97, after idx 95 tagged 0098_ with a lower when"; exit 1; }
T98=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));process.stdout.write(j.entries[95].tag)")
test -f packages/db/migrations/${T98}.sql || { echo "STOP: the file of journal idx 95, ${T98}.sql, is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T98}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0098 on disk (${T98}.sql) is not the file this document pins"; exit 1; }
echo "0098 on disk: ${T98}.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0099-check-journal.out
grep -qF '97 .sql files match 97 journal entries' /tmp/0099-check-journal.out || { echo "STOP: check-journal did not reconcile 97 files with 97 journal entries"; exit 1; }

echo "${MAIN}" > /tmp/0099-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/0099-main.sha"
echo "0099 PROMOTION, NUMBER AND FILES VERIFIED"
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and `origin/main and HEAD: <sha>`; the sidecar line
`docs/migration-apply-0099.md: OK`; then
`newest journal entry: idx 96, when <W99>, tag 0099_revoke_truncate_trigger_references, of 97; before it idx 95, when <W98>, tag 0098_<slug>`,
with `<W99>` greater than `<W98>`; then `0098 on disk: 0098_<slug>.sql, sha256 198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`;
then check-journal's line `... 97 .sql files match 97 journal entries in order ...`; then
`running from origin/main <sha>, recorded in /tmp/0099-main.sha`; then
`0099 PROMOTION, NUMBER AND FILES VERIFIED`. Exit 0. It reads no database. The sha it
prints is the one every later stage runs from.

## STAGE 1: the HEAD CHECK, the pre-check, the behaviour check BEFORE, the apply

```
(
set -eo pipefail
SHA0099=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPREV=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPRE=2860eab70cff72dbd53b09203abb0b0b8a45130e875654d7156c7ab8ac98f761
SHABEHAVIOUR=580202037bf7f7e5d06460f3b64b0c3dea0abd2f4af2dfdf4360c9051e106470
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0099-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0099 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0099-precheck.new /tmp/0099-behaviour-before.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0099-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0099-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0099.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0099_revoke_truncate_trigger_references.sql || { echo "STOP: 0099 is not on disk"; exit 1; }
test -f scripts/db/precheck-0099-grants-revoke.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-0099-grants-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 1 ] || { echo "STOP: ${N99} files claim migration number 0099, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0099_revoke_truncate_trigger_references.sql | cut -d' ' -f1)" = "${SHA0099}" ] || { echo "STOP: 0099 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0099-grants-revoke.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-0099-grants-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
T98=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[95];process.stdout.write(p&&p.idx===95&&p.tag.startsWith('0098_')?p.tag:'none')")
W98=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[95];process.stdout.write(p&&p.idx===95&&p.tag.startsWith('0098_')?String(p.when):'none')")
echo "${W98}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0098's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T98}.sql || { echo "STOP: the file of journal idx 95 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T98}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0098 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0098: packages/db/migrations/${T98}.sql, sha256 ${SHAPREV}, journal when ${W98}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0099-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0099-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0099-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0099-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0099-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W98} -f scripts/db/precheck-0099-grants-revoke.sql 2>&1 | tee /tmp/0099-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-precheck.new || true)
[ "${OKS}" = 15 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 15. Nothing was applied"; exit 1; }

echo "--- the behaviour check BEFORE the apply. READ ONLY. Its two outcome md5s are what stage 3 compares"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v phase=before -f scripts/db/behaviour-0099-grants-readonly.sql 2>&1 | tee /tmp/0099-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.new || { echo "STOP: the BEFORE run printed no SUMMARY row, so the transcript is truncated. Nothing was applied"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-behaviour-before.new && { echo "STOP: a behaviour verdict read FAIL before the apply. Nothing was applied"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/0099-behaviour-before.new || true)
[ "${NV}" = 7 ] || { echo "STOP: the BEFORE run printed ${NV} verdicts, not 7. Nothing was applied"; exit 1; }
VAC=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0099-behaviour-before.new | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | tr '\n' ' ' || true)
echo " ${VAC}" | grep -qF ' 5 ' || { echo "STOP: arm 5 must read VACUOUS in the BEFORE run, and it read [${VAC}]. Nothing was applied"; exit 1; }
BAD=$(echo "${VAC}" | tr ' ' '\n' | grep -E '[0-9]' | grep -vxE '2|4|5' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: the BEFORE run read VACUOUS on ${BAD}, and only arms 2, 4 and 5 may be vacuous. Nothing was applied"; exit 1; }
A5=$(awk -F'|' 'index($1,"authenticated_exec_md5")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-behaviour-before.new)
P5=$(awk -F'|' 'index($1,"patient_exec_md5")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-behaviour-before.new)
echo "${A5} ${P5}" | grep -qxE '[0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: the BEFORE run's outcome md5s did not parse. Nothing was applied"; exit 1; }
PB=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${PB}" | grep -qE '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' || { echo "STOP: the BEFORE run's SUMMARY did not parse: [${PB}]. Nothing was applied"; exit 1; }
echo "behaviour BEFORE: ${PB}; outcome md5s authenticated ${A5}, patient ${P5}"

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check and the BEFORE run, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- only now, with a passing pre-check and a passing BEFORE run, does the previous sitting's state go"
rm -f /tmp/0099-postcheck.out /tmp/0099-stage2.ok /tmp/0099-behaviour-after.out /tmp/0099-stage3.ok /tmp/0099-journal-after.out /tmp/0099-apply.out /tmp/0099-applied.ok
mv /tmp/0099-precheck.new /tmp/0099-precheck.out
mv /tmp/0099-behaviour-before.new /tmp/0099-behaviour-before.out

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0099-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0099_revoke_truncate_trigger_references --sha256 ${SHA0099} --expect-pending 1 2>&1 | tee /tmp/0099-apply.out
touch /tmp/0099-applied.ok
echo "0099 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now: <sha>`, the
  same sha twice** (the block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0099.md: OK`;
- **`0098: packages/db/migrations/0098_<slug>.sql, sha256 198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0, journal when <W98>`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it, then the target guard;
- **the pre-check prints `15` OK verdicts and no FAIL,** `journal_rows_before` 96, verdict 2
  naming 0098 as the newest row at `<W98>`, and its carries and INFO rows (report them as
  printed: `truncate_before`, `trigger_before` and `references_before` are the counts the
  apply takes to zero);
- **the behaviour check BEFORE:** 7 verdict rows, a SUMMARY row, no FAIL, VACUOUS on arm 5
  and on no arm but 2, 4 and 5, then `behaviour BEFORE: <n> OK / <n> VACUOUS / 0 FAIL;
  outcome md5s authenticated <md5>, patient <md5>`. On the synthetic rehearsal it read
  `6 OK / 1 VACUOUS / 0 FAIL`;
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`;**
- **verified-migrate, teed whole to `/tmp/0099-apply.out`:**
  `file       0099_revoke_truncate_trigger_references.sql present, sha256 matches`,
  `journal    96 row(s) applied, last when=<W98>`,
  `pending    1  [0099_revoke_truncate_trigger_references]` (exactly one), the drizzle-kit
  banner with its stdout, stderr and exit, then `journal    96 -> 97  (delta 1)`,
  `0099_revoke_truncate_trigger_references present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0099 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the
  journal from the database rather than trusting these lines.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable;
**3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from
`_journal.json`, an already-applied migration or a pending count that is not 1, and AFTER
drizzle has run on a journal that moved by the wrong amount or moved without the approved
sha256; **4** if drizzle itself failed or on any thrown error; **5** if drizzle reports
success and the journal did not move. Exit 3 can therefore follow a committed apply too.
The `tee` keeps that exit: the block runs with `pipefail`, so the stage exits with
verified-migrate's own code.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits 4 on
ANY thrown error, including its own journal read AFTER drizzle has committed. drizzle applies
the file's statements and the journal row in ONE transaction (0099 is two statements, each
ended by `--> statement-breakpoint`), so the migration is either wholly applied or not at
all. **If stage 1 ended non-zero after the `--- drizzle-kit migrate ---` banner had printed,
the halt rule governs: GREEN pastes nothing else, not stage 1 again and not the journal read,
and reports the exit code and the whole output** (`/tmp/0099-apply.out` holds it). The read
that answers whether 0099 is applied is `packages/db/scripts/read-applied-migrations.mjs`,
READ ONLY, and it runs only on the owner's or the lead's word.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle never
ran** (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in a clone whose `node_modules` does not
match its lockfile). The block then prints `journal    96 -> 96  (delta 0)`: nothing was
applied. The halt rule governs it all the same.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was
applied,** the HEAD CHECK's, the run window's, the pre-check's and the BEFORE run's included,
and the previous sitting's transcripts are untouched: the failed run's output stays in the
`.new` files.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0099=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPOST=4aedfa68a2f119783d0ec3acebea279300c9b8c34e5c5c1437b053d1365f9e14
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

rm -f /tmp/0099-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0099-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0099-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout"; exit 1; }
shasum -a 256 -c docs/migration-apply-0099.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0099_revoke_truncate_trigger_references.sql || { echo "STOP: 0099 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0099-grants-revoke.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0099_revoke_truncate_trigger_references.sql | cut -d' ' -f1)" = "${SHA0099}" ] || { echo "STOP: 0099 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0099-grants-revoke.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0099-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0099-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0099-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0099-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0099-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0099-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
S=$(carry secdef_functions_before)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
XM=$(carry dml_profile_md5)
TB=$(carry truncate_before)
GB=$(carry trigger_before)
FB=$(carry references_before)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${S}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${XM}" ] && [ -n "${TB}" ] && [ -n "${GB}" ] && [ -n "${FB}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "${J} ${T} ${S} ${TB} ${GB} ${FB}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+ [0-9]+ [0-9]+ [0-9]+' || { echo "STOP: a count carry is not a number"; exit 1; }
echo "${PM} ${FM} ${RM} ${CM} ${DM} ${XM}" | grep -qxE '[0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: an md5 carry is not 32 hex characters"; exit 1; }
echo "carries from this run: journal_before=${J} tables_before=${T} secdef_before=${S} policies=${PM} functions=${FM} relation_acl=${RM} column_acl=${CM} default_acl=${DM} dml_profile=${XM}; authenticated held TRUNCATE ${TB}, TRIGGER ${GB}, REFERENCES ${FB}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0099-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v secdef_before="${S}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v dml_profile_md5="${XM}" -c "begin read only" -f scripts/db/postcheck-0099-grants-revoke.sql -c "rollback" 2>&1 | tee /tmp/0099-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-postcheck.out || true)
[ "${OKS}" = 15 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 15. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0099 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0099}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0099 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0099 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0099-stage2.ok
echo "0099 POST-CHECK PASSED. 15/15 pre-check OK, 15/15 post-check OK, journal ${J} to ${JA}; authenticated TRUNCATE ${TB} to 0, TRIGGER ${GB} to 0, REFERENCES ${FB} to 0 of ${T} tables. Paste stage 3 now."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `checking from the recorded sha <sha>` and whether main
moved; `docs/migration-apply-0099.md: OK`; the run window line with now before the end (the
block halts otherwise, and the write stands); the carry line reads `journal_before=96`; the
post-check prints `15` OK verdicts and no FAIL, then its FOR THE RECORD table (the `public`
TABLES default of `postgres`: `authenticated` holding `DELETE,INSERT,MAINTAIN,SELECT,UPDATE`,
the three gone); the journal reads `96` before and `97` after, with 0099's sha256 in it
exactly once; the last line reads exactly
`0099 POST-CHECK PASSED. 15/15 pre-check OK, 15/15 post-check OK, journal 96 to 97; authenticated TRUNCATE <t> to 0, TRIGGER <g> to 0, REFERENCES <r> to 0 of <N> tables. Paste stage 3 now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

## STAGE 3: the behaviour check AFTER the apply, against stage 1's BEFORE run. READ ONLY

```
(
set -eo pipefail
SHABEHAVIOUR=580202037bf7f7e5d06460f3b64b0c3dea0abd2f4af2dfdf4360c9051e106470
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

rm -f /tmp/0099-stage3.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- THE HEAD CHECK: stage 3 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0099-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0099-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout"; exit 1; }
shasum -a 256 -c docs/migration-apply-0099.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/db/behaviour-0099-grants-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-0099-grants-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 2 must have PASSED on the recorded sha, after this sitting's apply"
test -f /tmp/0099-applied.ok || { echo "STOP: stage 1 left no applied marker. Stage 3 has not run"; exit 1; }
test -f /tmp/0099-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. Stage 3 has not run"; exit 1; }
[ "$(cat /tmp/0099-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. Stage 3 has not run"; exit 1; }
[ -n "$(find /tmp/0099-stage2.ok -newer /tmp/0099-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. Stage 3 has not run"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0099-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0099-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0099-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }

echo "--- the BEFORE run's outcome md5s, from THIS sitting's stage 1 transcript"
test -f /tmp/0099-behaviour-before.out || { echo "STOP: stage 1's BEFORE run transcript is missing. Stage 3 has not run"; exit 1; }
[ -n "$(find /tmp/0099-behaviour-before.out -mmin -90)" ] || { echo "STOP: stage 1's BEFORE run transcript is over 90 minutes old; it is not this sitting's"; exit 1; }
A5=$(awk -F'|' 'index($1,"authenticated_exec_md5")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-behaviour-before.out)
P5=$(awk -F'|' 'index($1,"patient_exec_md5")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0099-behaviour-before.out)
echo "${A5} ${P5}" | grep -qxE '[0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: the BEFORE run's outcome md5s did not parse. Stage 3 has not run"; exit 1; }
PB=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "BEFORE: ${PB}; authenticated ${A5}, patient ${P5}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0099-behaviour-after.out

echo "--- the behaviour check AFTER the apply. READ ONLY"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v phase=after -v before_auth_md5=${A5} -v before_patient_md5=${P5} -f scripts/db/behaviour-0099-grants-readonly.sql 2>&1 | tee /tmp/0099-behaviour-after.out
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-after.out || { echo "STOP: the AFTER run printed no SUMMARY row, so the transcript is truncated"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0099-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/0099-behaviour-after.out || true)
[ "${NV}" = 7 ] || { echo "STOP: the AFTER run printed ${NV} verdicts, not 7"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0099-behaviour-after.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '2|4' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: the AFTER run read VACUOUS on ${BAD}, and only arms 2 and 4 may be vacuous"; exit 1; }
grep -qE '^[[:space:]]*5[[:space:]]*\|.*authenticated same, patient same.*\|[[:space:]]*OK[[:space:]]*$' /tmp/0099-behaviour-after.out || { echo "STOP: arm 5 did not read OK with both roles unchanged"; exit 1; }
PA=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0099-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${PA}" | grep -qE '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' || { echo "STOP: the AFTER run's SUMMARY did not parse: [${PA}]"; exit 1; }

echo "${REC}" > /tmp/0099-stage3.ok
echo "0099 VERIFIED AT THE EXECUTOR: before ${PB}, after ${PA}; authenticated and patient read and write exactly what they did. The TRUNCATE and CREATE TRIGGER refusals in action are proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `verifying from the recorded sha <sha>`, whether main
moved; a halt unless stage 1's applied marker exists and stage 2's pass mark names the
recorded sha and is newer than it; the run window line with now before its end; the BEFORE
line from stage 1's transcript; the target guard; then the AFTER run: 7 verdict rows, a
SUMMARY row, no FAIL, VACUOUS on no arm but 2 and 4, **arm 5 OK reading
`authenticated same, patient same`**, arm 6 OK reading `0, 0, 0 of <N>; control <N> of <N>`;
and the last line
`0099 VERIFIED AT THE EXECUTOR: before <n> OK / <n> VACUOUS / 0 FAIL, after <n> OK / <n> VACUOUS / 0 FAIL; authenticated and patient read and write exactly what they did. ...`.
On the synthetic rehearsal: before `6 OK / 1 VACUOUS / 0 FAIL`, after `7 OK / 0 VACUOUS / 0 FAIL`.

**Arms 2 and 4 may be VACUOUS, and only they:** each is VACUOUS only when the role holds
every one of the four verbs on every table, so the instrument has no refusal to show.
`authenticated` lacks DELETE on the tables whose migrations revoked it (the card: 16 of 46),
and `patient` reads a handful of tables, so on production both are expected OK. The profile
is printed, not asserted exactly.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line
`0099 VERIFIED AT THE EXECUTOR: ...`.

```
(
set -eo pipefail
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0099-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0099-main.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0099-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0099-stage2.ok || { echo "STOP: stage 2 left no pass mark. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0099-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0099-stage3.ok || { echo "STOP: stage 3 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0099-stage3.ok)" = "${REC}" ] || { echo "STOP: stage 3's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0099-stage3.ok -newer /tmp/0099-applied.ok)" ] || { echo "STOP: stage 3's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0099-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0099-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0099-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
echo "reader: ${RW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0099-journal-after.out
grep -qx 'journal rows on production: 97' /tmp/0099-journal-after.out || { echo "STOP: the journal read after the apply does not say 97"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0099_revoke_truncate_trigger_references[.]sql$' /tmp/0099-journal-after.out || { echo "STOP: the journal read does not list 0099 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0099-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0099-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 97, 0099 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and whether main moved; the run window line with now
before its end; the reader's sha256 line; then the read printed IN FULL through `tee`:
`journal rows on production: 97`, every migration file on the recorded sha listed `APPLIED`,
0099 last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, and
the last line, exactly,
`CLOSING READ: the journal reads 97, 0099 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted.

## What every verdict must read

**Pre-check, 15 verdicts, all `OK`, each with its control:** 0 the transaction is READ ONLY;
1 0099 absent by hash (control: the same count finds 0098 once); 2 0098 present by hash once,
the newest row, at its journal `when`; `journal_rows_before` **96**; 4 the session is
`postgres`, a member of `authenticated` and `patient` (control: `authenticated` is no member
of `postgres`); 5 every ordinary and partitioned table in `public` is owned by the session
role (control: there is one); 6 every grant of the three to `authenticated` names the session
role as grantor (control: one exists); 7, 8, 9 the premise, `authenticated` holds TRUNCATE,
TRIGGER and REFERENCES on at least one table each (control: the owner holds each on every
table); 10 no column-level REFERENCES grant to `authenticated` (control: a planted aclitem
counts 1); 11 the session role's `public` TABLES default grants `authenticated` all three
(control: planted); 12 no GLOBAL default of the session role grants any of the three
(control: planted); 13 the five roles exist; `secdef_functions_before`, every one owned by
`postgres`. Then 10 CARRY rows (with `journal_rows_before` and `secdef_functions_before`, the 12 carries stage 2 reads) and 3 INFO rows (below).

**Post-check, 15 verdicts, all `OK`:** 0 READ ONLY; 1, 2, 3 `authenticated` holds TRUNCATE,
TRIGGER, REFERENCES on 0 of N tables, N the pre-check's N (control: the owner holds each on N
of N); 4 no column-level REFERENCES (control: planted); 5 the default no longer grants the
three, and the entry still exists (control: planted); 6 no GLOBAL default grants them; 7 every
other default privilege unchanged (md5); 8 every other relation privilege in `public`
unchanged (md5); 9 every column privilege unchanged (md5); 10 every SELECT, INSERT, UPDATE and
DELETE of `authenticated`, `patient`, `anon` and `service_role` on every relation in `public`
unchanged (md5); 11 every policy unchanged (md5); 12 every function in `public` unchanged
(md5) and the SECURITY DEFINER count equal; 13 the journal `+ 1`; 14 0099 by hash once, the
newest row.

**The post-check is not a standing invariant for 7 to 13:** the next migration that grants,
creates a function or adds a policy moves them. It is an assertion about this apply.

| Behaviour arm | What it proves | BEFORE | AFTER |
|---|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK | OK |
| 1 | `authenticated`: every (table, verb) the catalogue grants PLANS at the executor | OK | OK |
| 2 | `authenticated`: every pair the catalogue does not grant is REFUSED 42501 | OK, VACUOUS only if it holds everything | the same |
| 3 | `patient`: arm 1's rule | OK | OK |
| 4 | `patient`: arm 2's rule | OK, VACUOUS only if it holds everything | the same |
| 5 | no pair changed its answer since the BEFORE run, both roles, by md5 | VACUOUS (nothing to compare) | OK |
| 6 | `authenticated` holds TRUNCATE, TRIGGER, REFERENCES (control: the owner holds all three on every table) | each on at least one table | on none |

**The CARRY rows** are `tables_before`, `truncate_before`, `trigger_before`,
`references_before`, `policies_md5`, `functions_md5`, `relation_acl_md5`, `column_acl_md5`,
`default_acl_md5`, `dml_profile_md5`, with `journal_rows_before` and
`secdef_functions_before` from the verdicts. No carry's name is a substring of another's or
of any other row's `check` column, because stage 2's `carry()` matches column 1 with
`index()`. **The INFO rows** are never counted: the other creator roles whose `public`
TABLES default grants `authenticated` the three (on a Supabase project, `supabase_admin`),
MAINTAIN held by `authenticated`, and views on which `authenticated` holds TRIGGER. Each is
named under "Out of scope" below.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 97, 0099 by hash | stage 2, and the closing journal read | the database |
| no table in `public` grants `authenticated` TRUNCATE, TRIGGER or REFERENCES | post-check 1 to 3, with controls; behaviour arm 6 | the catalogue |
| the next `CREATE TABLE` does not re-grant them | post-check 5 and 6; IN ACTION by the rehearsal's W5 | the default ACL |
| nothing else moved | post-check 7 to 12 | the catalogue, by md5 |
| the app roles still read and write what they do today | post-check 10 (catalogue); behaviour arms 1, 3 and 5 (executor, before and after); IN ACTION by the rehearsal's W1 and CI's `db-tests` on the promoted head | catalogue, executor, and writes |
| a TRUNCATE or a CREATE TRIGGER by `authenticated` is refused | **NOT DISCHARGED ON PRODUCTION** (a READ ONLY transaction refuses TRUNCATE first, W4). The rehearsal's W2 and W3 | the executor, on a throwaway |

## Rehearsal

**The build lane's rehearsal on the OsteoJP schema did NOT run, and this document is NOT
READY until the rehearsal agent's does.** On 2026-09-30 the lane started a throwaway
(`supabase/postgres:17.6.1.106`, its own container, a clone of the image's `postgres`
database so the platform default privileges were in place) and began applying `main`'s
migrations to it. `0001_rls.sql` stopped on `function auth.jwt() does not exist`: the image
carries a minimal `auth` schema, and the full one comes from GoTrue's own migrations. Every
next step toward a full `auth` schema was refused by the harness classifier, and under R5
none was retried another way. Verbatim, three times:

> Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Production Reads].

The three refused steps: a schema-only dump of the `auth` schema from another lane's LOCAL
Supabase database (PURPLE's, port 54522, not production); a read-only search of this
repository for the `auth` functions the migrations call; a read of the header of an earlier
pre-check file. **What stands in its place is a synthetic smoke run, below, and it is not
the rehearsal.** It proves the check files, the migration body and the mechanisms on a
database with the Supabase platform default privileges; it does not prove them on the
OsteoJP schema, and in particular it has not run the behaviour check's `EXPLAIN` over the
OsteoJP policies (a policy expression that errors at PLANNING time with empty claims would
make arm 1 or 3 FAIL; in stage 1 that halts before the apply with nothing applied).

### The synthetic smoke run, 2026-09-30, by the authoring lane

**Where.** Container `b10-0099-reh` (Postgres 17.6, `supabase/postgres:17.6.1.106`), a
database cloned from the image's `postgres` database, which carries Supabase's
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO postgres, anon, authenticated,
service_role` for `postgres` and for `supabase_admin`. A role `patient`, granted to
`postgres`. Synthetic fixture, no OsteoJP schema, no data: four tables created by
`postgres` in `public` (one with RLS, a policy calling a STABLE claims function and a
BEFORE UPDATE trigger; one with a foreign key to it and RLS; one partitioned table and its
partition with `DELETE, TRUNCATE` revoked from `authenticated`, the pattern the card
found), a view, one SECURITY DEFINER function, `SELECT` and a column-level `UPDATE (note)`
granted to `patient`, 0021's `REVOKE ALL ON TABLES FROM anon` default, and a drizzle journal
of 96 rows whose newest is 0098's real sha256 at `when` 1788501900000. The migration was
applied with `psql -1` from the pending file (these exact bytes, sha256 `fbc5e545…163b`)
and its journal row written by hand: verified-migrate did not run.

**The happy path, with these exact check files** (run again on `hp3` with the fixed files
after the review fix below, with the same results):

| Run | Result |
|---|---|
| pre-check, unapplied | **15 OK / 0 FAIL**; premise 2 of 4 (TRUNCATE), 4 of 4 (TRIGGER, REFERENCES); default `authenticated` `DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`; INFO `supabase_admin`, MAINTAIN 4 of 4, 1 view |
| behaviour BEFORE | **6 OK / 1 VACUOUS / 0 FAIL** (arm 5); `authenticated` 14 pairs plan, 2 refused 42501 (DELETE on the partitioned pair); `patient` 1 plans, 15 refused |
| the 0099 body | exit 0 |
| post-check, with the pre-check's carries | **15 OK / 0 FAIL**; the default now `DELETE,INSERT,MAINTAIN,SELECT,UPDATE` for `authenticated` |
| behaviour AFTER, with the BEFORE md5s | **7 OK / 0 VACUOUS / 0 FAIL**; arm 5 `authenticated same, patient same` |

**Every control broken on purpose, each on its own copy:**

| Arm | Result |
|---|---|
| N1 the pre-check on an APPLIED database | FAIL on 1, 2, `journal_rows_before`, 6, 7, 8, 9, 11 (a second apply is refused before it starts) |
| N2 the post-check on an UNAPPLIED database | FAIL on 1, 2, 3, 5, 13, 14 |
| N3 the loop only, no `ALTER DEFAULT PRIVILEGES` | FAIL on 5 only: the half that is easy to skip is caught alone |
| N4 the `ALTER DEFAULT PRIVILEGES` only, no loop | FAIL on 1, 2, 3 only |
| N5 applied, and `patient` then loses SELECT on one table | FAIL on 8 and 10 |
| N6 a column-level REFERENCES grant to `authenticated` before the apply | pre-check FAIL on 10 only |
| N7 a table in `public` owned by another role | pre-check FAIL on 5 and 6 |
| N8 a GLOBAL default of `postgres` granting `authenticated` TRUNCATE | pre-check FAIL on 12 only |
| N9 the premise false (the three already gone, and the default too) | pre-check FAIL on 6, 7, 8, 9, 11 |
| N10 behaviour AFTER when `authenticated` lost INSERT on a table after the BEFORE run | arm 5 FAIL, `authenticated CHANGED, patient same` |
| N11 behaviour AFTER on an unapplied database | arm 6 FAIL |
| N12 a missing `-v`: the pre-check without `prev_hash`, the post-check without a carry, the behaviour check without `phase` or without the BEFORE md5s | each STOPs with psql exit 3 before any verdict |

**The writes in action, each in a transaction rolled back, as `authenticated`:**

| Arm | Before 0099 | After 0099 |
|---|---|---|
| W1 INSERT a row and a child row through its foreign key, read, UPDATE (the BEFORE UPDATE trigger fired: `touched=1`), DELETE | all succeed | **all succeed** |
| W2 `TRUNCATE` a table | SUCCEEDED | **`permission denied for table syn_b`** |
| W3 `CREATE TRIGGER` on a table | SUCCEEDED | **`permission denied for table syn_b`** |
| W4 `TRUNCATE` inside a READ ONLY transaction | `cannot execute TRUNCATE TABLE in a read-only transaction` | the same: the read-only refusal comes before the privilege, which is why production cannot show W2 |
| W5 the next `CREATE TABLE` by `postgres` | `authenticated` TRUNCATE, TRIGGER, REFERENCES true | **false, false, false**; SELECT, INSERT, UPDATE, DELETE true; MAINTAIN true |

**No lock:** the whole body completed with a 2 second `lock_timeout` while another session
held an open INSERT, and again while another held ACCESS EXCLUSIVE, on a table it revokes
on (section 1).

| File, in the authoring lane's scratchpad (not committed) | sha256 |
|---|---|
| `fixture-synthetic.sql`, the synthetic tables and journal | `4c92e1870e1ee7c026eabf2680b9d1002df9a02e9a9b9e5347c4b1cbd2cbfeb4` |
| `happy.zsh`, the happy path | `f23ce9472bb0ed52d999d409bcca21d76dc7a92cc881ac1149110441c62f838e` |
| `arms.zsh`, N1 to N12 | `2a23e3c9e2efe3cc2434ebe09159b48a61a95900ac368d31ca1fc4da94b57b13` |
| `in-action.sql`, W1 to W5 | `422252bd9d451802970b718ee28ec1a828223d784dab7bd7ec93615be1d24130` |
| `verify.zsh`, the review fix: previous against fixed, and N13 | `fa5ac6095fe7e52224fe2197a2e38229a7b9bd9e5da5fac13d64052807f79fef` |

### The review fix of 2026-09-30: acldefault's code for a sequence

**The defect.** Both check files read a NULL `relacl` as `acldefault()` of the relation's
type, and passed the capital `'S'` for a sequence. In `acldefault`, the capital `'S'` is
FOREIGN SERVER (`owner=U`); a SEQUENCE is the small `'s'` (`owner=rwU`). `pg_class.relkind`
spells a sequence with the capital letter, which is how the slip happened. So a sequence
whose ACL had never been touched hashed as `owner=U`, and the pre-check's claim that a NULL
`relacl` reads as what a REVOKE materialises was false for sequences. **No 0099 verdict
moved:** both files hashed it the same way, 0099 touches no sequence, and a sequence
`postgres` creates under the Supabase defaults carries an explicit ACL anyway. **The fix**
passes `'s'` in both files, one line each, and says so in each header;
`scripts/grants-revoke-0099.test.mjs` now requires it, with a control that plants the
capital code back and goes red. Both files' sha256 moved, so every pin to them moved with
them, and this document's sha256 with it.

**Measured on `b10-0099-reh`, 2026-09-30, finished by 14:24 Lisbon (read by machine):**

| Run | Result |
|---|---|
| the previous and the fixed pre-check, the same database at the same moment, on `syn0`, `syn1`, `hp`, `hp2` and `n1` to `n9` | **identical output, byte for byte, on all 13** |
| the previous and the fixed post-check, the same carries, on `hp`, `hp2`, `syn1` and `n2` to `n5` | **identical output, byte for byte, on all 7** |
| the happy path again, `happy.zsh hp3`, with the fixed files | pre-check 15 OK / 0 FAIL; behaviour BEFORE 6 OK / 1 VACUOUS / 0 FAIL; the body exit 0; post-check 15 OK / 0 FAIL; behaviour AFTER 7 OK / 0 VACUOUS / 0 FAIL |
| N13, the arm that tells them apart: a sequence in `public` owned by a role with no default privileges (`relacl` NULL), then a GRANT and REVOKE pair that changes no privilege but materialises its ACL as `{syn_seq_owner=rwU/syn_seq_owner}` | the previous file's `relation_acl_md5` MOVED (`8535f63d…` to `12df657e…`), so its post-check verdict 8 read **FAIL** with nothing changed; the fixed file's read `12df657e…` before and after, and its verdict 8 read **OK**. The fixed file reads the NULL `relacl` as exactly the ACL a GRANT or REVOKE materialises, as its header says |

So N1 to N12 above, run with the previous files, stand for the fixed files too: on every
one of those databases the two print the same bytes.

### The rehearsal agent's runs of 2026-09-30: one TAINTED, one clean

**13:54 to 14:11 Lisbon: TAINTED, NOT EVIDENCE.** A rehearsal agent ran this document's
blocks on a local database at 127.0.0.1:54722. It passed the journal reader's
production-only guard by putting the production ref into the local URL as an
`application_name` label (`reh0099-lane-amber-<ref>`, the ref elided here). Its prompt did
not list that substitution. This is the fourth run in the incident carded as
`INC-rehearsal-subagent-passed-the-reader-guard`. The lead ruled it listed here as tainted
and not evidence. Its results were never recorded in this document, and none of them is
relied on.

**16:16 to 16:23 Lisbon: CLEAN. THIS IS THE DOCUMENT'S REHEARSAL** of steps 1 and 2 below,
the lead's ruling of 2026-09-30. It is a separate agent. It never ran the journal reader,
only psql, and no guard was passed.
- **The throwaway:**
  - A local Supabase stack (CLI 2.100.0, `supabase/postgres:17.6.1.106`, `gotrue:v2.188.1`,
    so the full `auth` schema existed), project `r0099`, torn down after.
  - It stood at production's position after 0098: supabase/migrations from #1471's
    `f94075e6` (main plus 0096), then 0097's pending file from #1475 (`076481bf...`), then
    0098's (`198054ab...`, equal to its pin), each applied with `psql -1` and its journal
    row. The drizzle journal read 96 rows.
  - The platform default privileges were in place: `authenticated` held TRUNCATE on
    **31 of 48** tables, and TRIGGER and REFERENCES on **40 of 48**.
- **The check files** were read from #1397's `acc881f6`, and each equals its pin.

| step | result |
|---|---|
| pre-check, unapplied | **15 OK / 0 FAIL**. The premise is non-zero: 31, 40, 40 of 48; control 48 of 48 |
| behaviour check BEFORE, claims `{}`, the real OsteoJP policies | **6 OK / 1 VACUOUS / 0 FAIL**. **Arms 1 and 3 OK**: no policy errors at planning time with empty claims, the one thing the synthetic run could not show. Arm 5 VACUOUS, as required |
| the apply | `psql -X -1`: 0099's pending file (`fbc5e545...`, equal to its pin) plus its journal row, exit 0. verified-migrate cannot run before promotion |
| post-check | **15 OK / 0 FAIL**: `journal 96 to 97; authenticated TRUNCATE 31 to 0, TRIGGER 40 to 0, REFERENCES 40 to 0 of 48 tables` |
| behaviour check AFTER | **7 OK / 0 VACUOUS / 0 FAIL** |

**Two notes from that run:**
- The card's counts have moved: "30 of 46 / 38 of 46" is now 31/40/40 of 48, because two
  tables were added since. The document prints this profile and does not assert it.
- `public.patient_care_team` revokes DELETE from `authenticated` but not TRUNCATE (31 vs 30),
  and 0099 removes that too.

**Still owed at promotion:** steps 3 and 4 below. Step 3 runs under the lead's standing
rule: the journal reader will refuse the throwaway, and its two reads are recorded as NOT
REHEARSED.

### What the rehearsal agent owes before the dispatch is issued

1. A throwaway at production's position (main's migrations, then 0096, 0097, 0098 as
   applied) WITH the Supabase platform default privileges and a full `auth` schema, the
   pre-check reading its premise non-zero there (the card's shape: TRUNCATE on the tables
   whose migrations did not revoke DELETE, TRIGGER and REFERENCES on more);
2. the three check files there, unapplied and applied, the behaviour check BEFORE and AFTER
   over the real OsteoJP policies with empty claims (arms 1 and 3 must read OK: this is the
   one thing the synthetic run cannot show), and the post-check;
3. this document's five blocks and GREEN's two, extracted verbatim from the promoted head,
   with `verified-migrate.mjs` reaching drizzle through pnpm, and every halt run for real;
4. the packages/db suite on the applied throwaway, or CI's `db-tests` on the promoted head,
   which applies 0099 on a real Supabase stack.

## What this does NOT do, and what is out of scope

- **It changes no read and no write the app makes.** Post-check 8 and 10 prove every other
  privilege and every SELECT, INSERT, UPDATE and DELETE unchanged; behaviour arm 5 proves the
  executor answers the same.
- **MAINTAIN stays.** Postgres 17 added an eighth table privilege, MAINTAIN (VACUUM,
  ANALYZE, CLUSTER, REINDEX, REFRESH MATERIALIZED VIEW, LOCK TABLE), and Supabase's ALL
  includes it. Option 1 as built revokes the three the card names, so `authenticated` keeps
  MAINTAIN on every table and on the next one (W5). `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`
  inside an open transaction is the reachable consequence: it blocks, it does not destroy.
  The pre-check prints it as an INFO row. **Whether option 1 should also revoke MAINTAIN is a
  question for the owner's ruling, not a change this lane makes:** the migration body is not
  edited.
- **Views are outside the loop.** The loop covers relkind `r` and `p`. The default privilege
  (second half) covers views created from now on, because `ON TABLES` includes views; an
  existing view in `public` keeps TRIGGER (an INSTEAD OF trigger needs it). The pre-check
  prints the count as an INFO row.
- **`supabase_admin`'s default is not touched,** and cannot be: `ALTER DEFAULT PRIVILEGES`
  without `FOR ROLE` changes only the running role's default, and `postgres` is not a member
  of `supabase_admin`. It applies only to a table `supabase_admin` creates in `public`; pre-check
  verdict 5 shows every table there is `postgres`'s.
- **The `patient` role.** `withPatientContext` (`client.ts:196`) drops to `patient`, a
  different principal. It may hold some of the same three. This migration does not touch it,
  because the question asked was about `authenticated`; the portal's grant surface deserves
  its own measurement. The behaviour check proves its SELECT, INSERT, UPDATE and DELETE do
  not move.
- **The first draft's post-check had a defect, and it is gone.** Its query 4b matched
  `authenticated=[^,]*[tDx]` in the text of the default ACL, and the grantor's name
  `postgres` after the `/` contains a `t`, so it would have read non-zero after a correct
  apply. The post-check now parses the ACL with `aclexplode()` and names privileges.
- **A review found a second defect, in both check files, and it is gone.** They read a
  sequence's NULL ACL through `acldefault()` with the FOREIGN SERVER code. No verdict moved;
  "The review fix of 2026-09-30" under Rehearsal gives the fix and the measurement.

## The op carries no DELETE and no TRUNCATE statement

Measured on the migration's code with its comments removed: **0 statements begin with
DELETE, 0 begin with TRUNCATE**, and no string it EXECUTEs begins with either. The word
TRUNCATE appears in code twice, both times as a PRIVILEGE NAME in a REVOKE list
(`REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated` and the
`ALTER DEFAULT PRIVILEGES` line). **A REVOKE of the TRUNCATE privilege is not a TRUNCATE
statement:** it empties nothing; it takes away the right to. The check files write nothing:
the pre-check and the behaviour check open their own READ ONLY transaction and the post-check
runs inside the block's `begin read only`. The behaviour check builds `EXPLAIN` of an INSERT,
an UPDATE and a DELETE (`... WHERE false`) and runs them under `EXPLAIN` without `ANALYZE`,
which plans and never executes, inside a READ ONLY transaction that ends in ROLLBACK.
