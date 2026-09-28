# 0094: apply the users, tenants and roles policy split

**Status: NOT APPLIED.** One migration, `packages/db/migrations/0094_users_tenants_roles_policy_split.sql`,
applied from `origin/main` after PR #1459 has merged. Five blocks, each pasted whole, on
its own and in order: stage 0 (the promotion, the files and the head it runs from),
stage 1 (the HEAD CHECK, the pre-check, the behaviour actors and the apply), stage 2
(the post-check), stage 3 (the behaviour check) and the closing journal read. One rule
governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0094 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/data-op-staff-10-v2.md`, word for word, with three
substitutions and no other change,** because the write here is stage 1 and not stage 2:
"After stage 2 has committed" reads "After stage 1 has committed", "stage 3 (READ ONLY)
runs" reads "stages 2 and 3 (READ ONLY) run", and the onward path reads "from stage 1
to stage 2" with this document's own line.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

| Fact | Value |
|---|---|
| Card | the users/tenants/roles policy split, `C9` in the SOLO dispatches |
| Ruling | Owner, 2026-09-20: a ruled Tier C migration splitting the tenant-only `FOR ALL` policies on `users`, `tenants` and `roles`. Numbered `0094` on 2026-09-22 and kept at `0094` by the fourth renumbering of 2026-09-27 (`CLAUDE.md`, "SOLO's record") |
| Ruling for this sitting | Owner, 2026-09-27: the owner removes the label `held-for-apply` from #1459 and merges it FIRST; GREEN then applies 0094 FROM `origin/main`, and the owner freezes merges to main for the sitting |
| Migration | `packages/db/migrations/0094_users_tenants_roles_policy_split.sql`, sha256 `439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c` |
| Promoted from | `packages/db/migrations-pending/NEXT-AFTER-0093_users_tenants_roles_policy_split.sql`, **bytes unchanged**, on 2026-09-28 (`git mv`, 100% similarity) |
| Journal | `idx 91`, `when 1788501500000`, tag `0094_users_tenants_roles_policy_split`; `when` strictly above 0093's `1788501400000` |
| Mirror | `supabase/migrations/0094_users_tenants_roles_policy_split.sql`, written by `scripts/sync-supabase-migrations.mjs` with its fixed header; checked by content by `scripts/check-journal.mjs` (`pnpm db:check-journal`), which stage 0 runs with `node` directly, after asserting its sha256, so that no pnpm dependency check stands between it and the answer |
| Must follow | `0093_patient_rgpd_acceptances`: applied to production (journal 90 to 91, sha256 `7a769298…c454`), merged in #1399 |
| PR | #1459, branch `db/0094-users-tenants-role-policy-split-r6`, labelled `held-for-apply` until the owner takes it off and merges |
| Runs from | `origin/main`, after #1459 has merged. Stage 0 records the sha `origin/main` resolves to in `/tmp/0094-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK, below) |
| This document | `docs/migration-apply-0094.md`, pinned by `docs/migration-apply-0094.sha256` and asserted by every stage; GREEN's dispatch pins its sha256 on its own and checks it by machine twice: on the main BEFORE YOU START resolves, and at the sha stage 0 recorded, in the CLOCK CHECK before stage 1 |
| Pre-check | `scripts/db/precheck-users-tenants-roles.sql`, READ ONLY, 21 verdicts (15 numbered, 6 carries), sha256 `e0fa6a2dfe5237403fe6a3fb8b8782bbe83a9a53d51ed527b431be4b12f82803` |
| Post-check | `scripts/db/postcheck-users-tenants-roles.sql`, READ ONLY, 18 verdicts, six carries in, sha256 `4c62a07c08afe20aa309a4871006861334d6623f74932d87474f34ec2d3ff729` |
| Behaviour check | `scripts/db/behaviour-users-tenants-roles-readonly.sql`, READ ONLY, 14 arms and a SUMMARY row, `-v actor_id` required, sha256 `79c135fca96216baaeef03ea825c4a202b0eb6b4eac82329f61c8721160c5852`. Run TWICE in stage 3, as two actors stage 1 chooses READ ONLY |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `b8c62fd5`, all pinned in every block that runs them |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`, byte-identical to `origin/main` at `b8c62fd5`. It imports nothing but `node:` builtins, so its pin covers everything it runs. Pinned in stage 0 and in GREEN's BEFORE YOU START |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts`, which drizzle-kit loads through `verified-migrate.mjs` (the runbook and 0093 do not pin them either; the config is byte-identical to `b8c62fd5`). Their tree is fixed instead: GREEN's BEFORE YOU START requires `origin/main` to BE #1459's merge commit, not merely to contain it, and the CLOCK CHECK and the HEAD CHECK halt on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0094-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stages 2, 3 and the closing read refuse at or after its end. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can write it |
| What it changes | DROPS the three `FOR ALL` policies 0001 made (`tenants_tenant_isolation`, `roles_tenant_isolation`, `users_tenant_isolation`) and CREATES eight: a tenant SELECT on each table with the old expression verbatim, `tenants_manager_update`, `users_manager_insert`, `users_manager_update`, `users_self_update`, `users_manager_delete`. Adds ONE SECURITY INVOKER function, `public.users_self_service_columns()`, EXECUTE revoked from PUBLIC, `anon`, `authenticated`, `service_role` and `patient`, and its BEFORE UPDATE trigger on `users` |
| What it never touches | every other policy (the two token-hook reads `auth_admin_read_users` and `auth_admin_read_roles` included), every table grant, every existing function (the token hook's body included) and the SECURITY DEFINER count. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/migration-apply-0094.sha256` and every stage
checks it with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits
on the same head as the document, so a main that moved to a new document and a new
sidecar together would pass that check. **The sidecar alone does not close that, and
the HEAD CHECK alone does not either:** the HEAD CHECK compares `origin/main` with the
sha stage 0 recorded, so it cannot see a main that moved BEFORE stage 0 fetched. GREEN's
dispatch closes it by machine. It pins this document's sha256 on its own; its BEFORE
YOU START checks that pin against the `origin/main` it resolves and records that head;
and its CLOCK CHECK, pasted between stage 0 and stage 1, halts before the apply unless
stage 0 recorded that same head and the document at the recorded sha still hashes to
the pin. From stage 0 on, the HEAD CHECK halts on any moved main before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted
into zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its
number). Narration is `echo`.

**The promoted file's own header still reads "NO NUMBER IN THIS FILE NAME YET, BY
CONSTRUCTION".** That is stale, and it is left stale on purpose: a promotion does not
touch one byte of the file, which is the only reason the sha256 above can pin
anything. Read the header as a record of when the file was authored, and
`packages/db/migrations-pending/README.md`'s Promoted table for where it now sits.

## Merged before the apply, by ruling, and why that is safe here

0093 had to be applied before its PR merged, because its app code wrote a table that
did not exist yet. **#1459 carries no app code.** It changes the migration, its mirror
and journal entry, the pending README, the three check files, two DB tests, two script
tests, and adds this document and its sidecar. Every app
writer of `users` and `tenants` (the migration's section 2, W1 to W9) passes both the
old policies and the new ones for the roles that reach it, so the app behaves the same
before and after the apply, and a merged main that production has not caught up with
yet is a state the app already survives.

**Between the merge and the apply, main is ahead of production by exactly one
migration,** and the pre-check says so: it passes only while 0094 is absent from the
journal. The daily `prod-drift-check` (07:00 UTC) would report 0094 as pending if the
sitting halted before the apply; that report is correct, and it is informational.

**Exactly one `packages/db/migrations/0094_*.sql` may exist; if anything else is ever
found under `0094_`, STOP.** The number is the apply authorisation (`CLAUDE.md`, the
binding table under "SOLO's record"): `0094` the users/tenants role fix, `0095` the
conflict check's patient name (#1438), `0096` the grants revoke (#1397). `0095` is not
promoted until 0094 is applied to production, so the journal on the recorded sha ends
at 0094 and `verified-migrate.mjs` finds exactly one pending migration.

## What is new here, because 0094 is not shaped like 0093

0093 CREATED a table. **0094 DROPS three policies and CREATES eight, one function and
one trigger,** so the pre-check proves the starting point exactly and the post-check
proves the end point exactly:

- **the pre-check** proves each of the three `FOR ALL` policies is there with 0001's
  expressions, pinned by md5 (verdicts 1 to 3), that none of the eight new names and
  neither guard object exists (4, 5), that the hook's two read policies stand (6), that
  the three tables carry exactly those five policies and none RESTRICTIVE (7), that
  `users` has no user trigger (8), that row level security is on (9), 0094 absent and
  0093 present by hash (10, 11), the newest `when` is 0093's (12), the three helpers and
  the five database roles the file names exist (13, 14);
- **the post-check** pins every new policy's command, roles and expressions by md5
  (3 to 8), pins the three SELECT policies to the SAME md5 as the policies they replace,
  which is the proof that no read moved (3), pins the guard function and its trigger
  (10 to 12), and asserts the arithmetic: **+5** policies, **+1** public function,
  **+0** SECURITY DEFINER functions, every other policy byte-identical by one md5, the
  token hook's body unchanged, the journal **+1** (14 to 18).

There are **six** carries: `journal_rows_before`, `policies_before`,
`secdef_functions_before` (passed to the post-check as `-v secdef_before`),
`public_functions_before`, `other_policies_md5`, `hook_md5`. No carry's name is a
substring of another's or of any other row's `check` column, because stage 2's
`carry()` matches column 1 with `index()`.

**The md5 pins depend on how the session renders an expression, and here the
pre-check proves the rendering BEFORE the apply.** `pg_get_expr` prints
`jwt_tenant_id()` without its schema only because `public` is on the session's
`search_path`. Pre-check verdicts 1 to 3 compare 0001's expressions, rendered by this
same session, to md5s read on Postgres 17 with that search path. If production renders
them differently, those three verdicts FAIL and nothing is applied. The stage blocks set
no search path, so the post-check renders the new expressions the way the pre-check
rendered the old ones.

**No behaviour run before the apply.** The pre-check pins the starting point by md5,
the post-check pins the end point by md5, and a run of the behaviour check before the
apply adds no discrimination those two lack. Its before profile was measured on the
rehearsal and is held in the lane's owner-only notes, not here.

**What a READ ONLY check cannot measure** is a write, and so the column guard in
action. No production write is allowed, not even a rolled-back one. The guard is proven
as a SHAPE on production (post-check 10 to 12 and behaviour arm 9: present, enabled,
firing on every UPDATE of every column with no WHEN clause, its body pinned by md5), and
IN ACTION only by the rehearsal's 53 write arms and by CI's packages/db suite, which
applies 0094 now that it is a numbered migration.

## The behaviour actors are chosen by the block, READ ONLY, and why

The behaviour check takes its actor as `-v actor_id` and chooses nobody itself. No
production row was read to write this document, so no actor is named here. **Stage 1
chooses two, READ ONLY, after the pre-check and before the apply,** by one query in a
`begin read only` transaction, and records them in `/tmp/0094-actors.out`. Stage 3 runs
the behaviour check once as each:

- **the narrowing actor:** an active staff user, not a shared resource, whose role is a
  role of their own tenant with the slug `reception`, or `therapist` when no
  receptionist qualifies. Among several, reception first, then the lowest id. This is
  the run that proves a staff session without `users:manage` writes nothing but its own
  row;
- **the manager actor:** in the SAME tenant, an active staff user, not a shared
  resource, with the slug `admin`, or `owner` when no admin qualifies, in a tenant that
  holds an `owner` role. Lowest id first. Only an owner or admin claim reaches the
  manager policies, so only this run tests their tenant predicate (arm 13) and the owner
  tier on the new row (arm 12, which needs an owner role to refuse).

**A missing subject is a FAIL, and here it stops the sitting before anything is
applied.** When the query finds no narrowing actor, or no manager actor in that
tenant, or a tenant without an owner role, stage 1 prints a `STOP:` naming which, and
exits 1 before `verified-migrate.mjs` runs. Stage 3 never runs over a missing or
substituted actor: it reads the two ids stage 1 recorded, and the behaviour file
itself STOPs (psql exit 3) on an actor that is no longer active, is a shared resource or
holds no role. The ids reach GREEN's transcript, and nothing else about the actors does:
the file prints one `ACTOR id <uuid> | role <slug> | chosen passed in with -v actor_id`
line and then counts and verdicts only.

## The HEAD CHECK, and running from main

The migration runs from `origin/main`, after #1459 has merged, and the owner freezes
merges to main for the sitting. No block reads a branch, and there is no separate HEAD
CHECK to paste: the machine runs it inside the blocks.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is
  clean, removes the previous sha and run window records, fetches, resolves
  `origin/main`, checks that sha out detached, verifies the sidecar, the promotion, the
  journal and every pin (check-journal's before it runs it), and only then records the
  sha in `/tmp/0094-main.sha` and prints `running from origin/main <sha>`.
- **The run window is checked by machine in every block from stage 1 on,** from the
  record GREEN's CLOCK CHECK writes after stage 0. Stage 1 refuses to start before the
  window opens or after the last minute it may start, and checks again after the
  pre-check, just before the apply; stages 2 and 3 and the closing read refuse at or
  after the window's end. A missing record, or one written for another sha, is a
  `STOP:` in each.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and
  applied nothing. It then checks out the RECORDED sha, never a fresh `origin/main`, and
  asserts every file it runs by sha256 before it runs any.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the
  applied marker `/tmp/0094-applied.ok` exists, and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stages 2 and 3 are READ ONLY** and run from the recorded sha whatever main has done
  since: each prints whether main moved, with both shas, and never stops on it. Every
  file they run is asserted by sha256 at that sha.
- **A moved main before the apply ends the sitting.** Nothing is applied, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/0094-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the promotion, the files and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0094.sha256
MIG=packages/db/migrations/0094_users_tenants_roles_policy_split.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0093_users_tenants_roles_policy_split.sql
SHA0094=439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c
SHAPRE=e0fa6a2dfe5237403fe6a3fb8b8782bbe83a9a53d51ed527b431be4b12f82803
SHAPOST=4c62a07c08afe20aa309a4871006861334d6623f74932d87474f34ec2d3ff729
SHABEHAVIOUR=79c135fca96216baaeef03ea825c4a202b0eb6b4eac82329f61c8721160c5852
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0094-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0094 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0094-main.sha /tmp/0094-window.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0094 is not on disk at origin/main, so #1459 has not merged"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N94=$(find packages/db/migrations -maxdepth 1 -name '0094_*.sql' | wc -l | tr -d ' ')
[ "${N94}" = 1 ] || { echo "STOP: ${N94} files claim migration number 0094, not 1"; exit 1; }
test -f scripts/db/precheck-users-tenants-roles.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-users-tenants-roles.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-users-tenants-roles-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0094}" ] || { echo "STOP: 0094 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-users-tenants-roles-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length);process.exit(j.entries.length===92&&e.idx===91&&e.when===1788501500000&&e.tag==='0094_users_tenants_roles_policy_split'?0:1)" || { echo "STOP: the newest journal entry is not idx 91, when 1788501500000, tag 0094_users_tenants_roles_policy_split, of 92"; exit 1; }
node scripts/check-journal.mjs 2>&1 | tee /tmp/0094-check-journal.out
grep -qF '92 .sql files match 92 journal entries' /tmp/0094-check-journal.out || { echo "STOP: check-journal did not reconcile 92 files with 92 journal entries"; exit 1; }

echo "${MAIN}" > /tmp/0094-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/0094-main.sha"
echo "0094 PROMOTION, NUMBER AND FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/migration-apply-0094.md: OK`, then
`newest journal entry: idx 91, when 1788501500000, tag 0094_users_tenants_roles_policy_split, of 92`,
then check-journal's line `... 92 .sql files match 92 journal entries in order ...`,
then `running from origin/main <sha>, recorded in /tmp/0094-main.sha`, then
`0094 PROMOTION, NUMBER AND FILES VERIFIED`. Exit 0.** It reads no database and prints no
count of anything in it. The sha it prints is the one every later stage runs from.

## STAGE 1: the HEAD CHECK, the pre-check, the behaviour actors, the apply

```
(
set -eo pipefail
SHA0094=439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c
SHAPRE=e0fa6a2dfe5237403fe6a3fb8b8782bbe83a9a53d51ed527b431be4b12f82803
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
UUIDRE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0094-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0094 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0094-precheck.new /tmp/0094-actors.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0094-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0094-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0094.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0094_users_tenants_roles_policy_split.sql || { echo "STOP: 0094 is not on disk"; exit 1; }
test -f scripts/db/precheck-users-tenants-roles.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N94=$(find packages/db/migrations -maxdepth 1 -name '0094_*.sql' | wc -l | tr -d ' ')
[ "${N94}" = 1 ] || { echo "STOP: ${N94} files claim migration number 0094, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0094_users_tenants_roles_policy_split.sql | cut -d' ' -f1)" = "${SHA0094}" ] || { echo "STOP: 0094 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0094-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0094-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0094-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0094-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0094-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-users-tenants-roles.sql 2>&1 | tee /tmp/0094-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0094-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0094-precheck.new || true)
[ "${OKS}" = 21 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 21. Nothing was applied"; exit 1; }

echo "--- the behaviour actors, chosen READ ONLY. A missing subject STOPs here, before the apply"
ACT=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "with s as (select u.id, u.tenant_id, r.slug::text as slug from public.users u join public.roles r on r.id = u.role_id and r.tenant_id = u.tenant_id where u.is_active and not u.is_shared_resource), n as (select id, tenant_id, slug from s where slug in ('reception', 'therapist') order by (slug = 'reception') desc, id limit 1), m as (select s.id, s.slug from s join n on n.tenant_id = s.tenant_id where s.slug in ('admin', 'owner') and exists (select 1 from public.roles o where o.tenant_id = s.tenant_id and o.slug::text = 'owner') order by (s.slug = 'admin') desc, s.id limit 1) select coalesce((select id::text from n), 'none') || ' ' || coalesce((select slug from n), 'none') || ' ' || coalesce((select id::text from m), 'none') || ' ' || coalesce((select slug from m), 'none')")
ACT=$(echo "${ACT}" | tail -1)
NARROW=$(echo "${ACT}" | cut -d' ' -f1)
NSLUG=$(echo "${ACT}" | cut -d' ' -f2)
MANAGER=$(echo "${ACT}" | cut -d' ' -f3)
MSLUG=$(echo "${ACT}" | cut -d' ' -f4)
echo "${NARROW}" | grep -qE "${UUIDRE}" || { echo "STOP: no active, non-resource reception or therapist user holds a role of their own tenant, so stage 3 has no narrowing actor. A missing subject is a FAIL. Nothing was applied"; exit 1; }
echo "${NSLUG}" | grep -qxE 'reception|therapist' || { echo "STOP: the narrowing actor's role read [${NSLUG}]. Nothing was applied"; exit 1; }
echo "${MANAGER}" | grep -qE "${UUIDRE}" || { echo "STOP: the narrowing actor's tenant has no active, non-resource admin or owner, or holds no owner role, so stage 3 has no manager actor. A missing subject is a FAIL. Nothing was applied"; exit 1; }
echo "${MSLUG}" | grep -qxE 'admin|owner' || { echo "STOP: the manager actor's role read [${MSLUG}]. Nothing was applied"; exit 1; }
echo "${NARROW} ${NSLUG} ${MANAGER} ${MSLUG}" > /tmp/0094-actors.new
echo "behaviour actors: narrowing ${NARROW} (${NSLUG}), manager ${MANAGER} (${MSLUG})"

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- only now, with a passing pre-check and both subjects in hand, does the previous sitting's state go"
rm -f /tmp/0094-postcheck.out /tmp/0094-stage2.ok /tmp/0094-behaviour-narrow.out /tmp/0094-behaviour-manager.out /tmp/0094-stage3.ok /tmp/0094-journal-after.out
mv /tmp/0094-precheck.new /tmp/0094-precheck.out
mv /tmp/0094-actors.new /tmp/0094-actors.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0094_users_tenants_roles_policy_split --sha256 ${SHA0094} --expect-pending 1
touch /tmp/0094-applied.ok
echo "0094 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now: <sha>`,
  the same sha twice** (the block halts otherwise), then `docs/migration-apply-0094.md: OK`;
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it (the block halts otherwise), then the target guard;
- **the pre-check prints `21` OK verdicts and no FAIL;**
- **`behaviour actors: narrowing <uuid> (reception or therapist), manager <uuid> (admin or owner)`;**
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`,** now no later
  than that minute (the block halts otherwise);
- **`pending    1  [0094_users_tenants_roles_policy_split]`.** Exactly one.

It then prints `journal    91 -> 92  (delta 1)`,
`0094_users_tenants_roles_policy_split present by sha256: yes`,
`OK: the journal moved by exactly the pending count and carries the approved sha256.`
and the last line, exactly, `0094 APPLIED. Paste stage 2 now.` Stage 2 re-reads the
journal from the database rather than trusting these lines.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment
variable; **3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing
from `_journal.json`, an already-applied migration or a pending count that is not 1,
and AFTER drizzle has run on a journal that moved by the wrong amount or moved without
the approved sha256; **4** if drizzle itself failed or on any thrown error; **5** if
drizzle reports success and the journal did not move. Exit 3 can therefore follow a
committed apply too.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits
4 on ANY thrown error, including its own journal read AFTER drizzle has committed.
drizzle applies the file's statements and the journal row in ONE transaction, so the
migration is either wholly applied or not at all. **If stage 1 ended non-zero after the
`--- drizzle-kit migrate ---` banner had printed, the halt rule governs: GREEN pastes
nothing else, not stage 1 again and not the journal read, and reports the exit code and
the whole output.** The read that answers whether 0094 is applied is
`packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs only on the
owner's or the lead's word. No marker exists after such a halt, so stage 2 refuses
until the lead rules.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle
never ran.** `verified-migrate.mjs` reaches drizzle through `pnpm --filter @osteojp/db exec`,
and pnpm checks the installed dependencies first; in a clone whose `node_modules` does
not match its lockfile it tries to reinstall and, with no terminal, aborts
(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The block then prints `journal    91 -> 91  (delta 0)`:
nothing was applied. The halt rule governs it all the same.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was
applied,** the HEAD CHECK's, the run window's and the missing subject's included, and the previous
sitting's transcripts are untouched: the failed run's output stays in the `.new` files.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0094=439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c
SHAPOST=4c62a07c08afe20aa309a4871006861334d6623f74932d87474f34ec2d3ff729
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

rm -f /tmp/0094-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0094-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0094-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0094.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0094_users_tenants_roles_policy_split.sql || { echo "STOP: 0094 is not on disk"; exit 1; }
test -f scripts/db/postcheck-users-tenants-roles.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0094_users_tenants_roles_policy_split.sql | cut -d' ' -f1)" = "${SHA0094}" ] || { echo "STOP: 0094 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0094-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0094-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0094-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0094-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0094-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0094-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0094-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
S=$(carry secdef_functions_before)
F=$(carry public_functions_before)
O=$(carry other_policies_md5)
H=$(carry hook_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${S}" ] && [ -n "${F}" ] && [ -n "${O}" ] && [ -n "${H}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} secdef_before=${S} public_functions_before=${F} other_policies_md5=${O} hook_md5=${H}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0094-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v policies_before="${P}" -v secdef_before="${S}" -v public_functions_before="${F}" -v other_policies_md5="${O}" -v hook_md5="${H}" -c "begin read only" -f scripts/db/postcheck-users-tenants-roles.sql -c "rollback" 2>&1 | tee /tmp/0094-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0094-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0094-postcheck.out || true)
[ "${OKS}" = 18 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 18. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0094 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0094}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0094 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0094 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0094-stage2.ok
echo "0094 POST-CHECK PASSED. 21/21 pre-check OK, 18/18 post-check OK, journal ${J} to ${JA}. Paste stage 3 now."
)
```

**EXPECT:** `checking from the recorded sha <sha>` and whether main moved;
`run window, Lisbon YYYYMMDDHHMM: everything ends before <t>; now <t>`, with now before
the end (the block halts otherwise, and the write stands); the carry
line reads `journal_before=91`; the post-check prints `18` OK verdicts and no FAIL,
then its FOR THE RECORD table (ten policies on the three tables); the journal reads `91`
before and `92` after, with 0094's sha256 in it **exactly once**; the last line reads
exactly `0094 POST-CHECK PASSED. 21/21 pre-check OK, 18/18 post-check OK, journal 91 to 92. Paste stage 3 now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

## STAGE 3: the behaviour check, as the two actors stage 1 chose. READ ONLY

```
(
set -eo pipefail
SHABEHAVIOUR=79c135fca96216baaeef03ea825c4a202b0eb6b4eac82329f61c8721160c5852
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
UUIDRE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

rm -f /tmp/0094-stage3.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0094-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0094-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0094.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/db/behaviour-users-tenants-roles-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-users-tenants-roles-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 2 must have PASSED on the recorded sha, after this sitting's apply"
test -f /tmp/0094-applied.ok || { echo "STOP: stage 1 left no applied marker. Stage 3 has not run"; exit 1; }
test -f /tmp/0094-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. Stage 3 has not run"; exit 1; }
[ "$(cat /tmp/0094-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. Stage 3 has not run"; exit 1; }
[ -n "$(find /tmp/0094-stage2.ok -newer /tmp/0094-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. Stage 3 has not run"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0094-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0094-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0094-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }

echo "--- the two actors stage 1 chose, READ ONLY, before the apply"
test -f /tmp/0094-actors.out || { echo "STOP: stage 1 recorded no behaviour actors in this sitting. A missing subject is a FAIL"; exit 1; }
NARROW=$(cut -d' ' -f1 /tmp/0094-actors.out)
NSLUG=$(cut -d' ' -f2 /tmp/0094-actors.out)
MANAGER=$(cut -d' ' -f3 /tmp/0094-actors.out)
MSLUG=$(cut -d' ' -f4 /tmp/0094-actors.out)
echo "${NARROW}" | grep -qE "${UUIDRE}" || { echo "STOP: the recorded narrowing actor is not an id. A missing subject is a FAIL"; exit 1; }
echo "${NSLUG}" | grep -qxE 'reception|therapist' || { echo "STOP: the recorded narrowing role is [${NSLUG}]"; exit 1; }
echo "${MANAGER}" | grep -qE "${UUIDRE}" || { echo "STOP: the recorded manager actor is not an id. A missing subject is a FAIL"; exit 1; }
echo "${MSLUG}" | grep -qxE 'admin|owner' || { echo "STOP: the recorded manager role is [${MSLUG}]"; exit 1; }
if [ "${MSLUG}" = owner ]; then ALLOWM='3|10|12'; else ALLOWM='3|10'; fi
echo "narrowing ${NARROW} (${NSLUG}), manager ${MANAGER} (${MSLUG})"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0094-behaviour-narrow.out /tmp/0094-behaviour-manager.out

echo "--- run 1 of 2: the narrowing actor"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${NARROW} -f scripts/db/behaviour-users-tenants-roles-readonly.sql 2>&1 | tee /tmp/0094-behaviour-narrow.out
grep -qF "ACTOR id ${NARROW} | role ${NSLUG} | chosen passed in with -v actor_id" /tmp/0094-behaviour-narrow.out || { echo "STOP: run 1 did not act as the narrowing actor stage 1 chose, with that role"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0094-behaviour-narrow.out || { echo "STOP: run 1 printed no SUMMARY row, so the transcript is truncated"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0094-behaviour-narrow.out && { echo "STOP: a behaviour verdict read FAIL in run 1"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/0094-behaviour-narrow.out || true)
[ "${NV}" = 14 ] || { echo "STOP: run 1 printed ${NV} verdicts, not 14"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0094-behaviour-narrow.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '3|10' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: run 1 read VACUOUS on ${BAD}, and only arms 3 and 10 may be vacuous for this actor"; exit 1; }
PN=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0094-behaviour-narrow.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${PN}" | grep -qE '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' || { echo "STOP: run 1's SUMMARY did not parse: [${PN}]"; exit 1; }

echo "--- run 2 of 2: the manager actor"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${MANAGER} -f scripts/db/behaviour-users-tenants-roles-readonly.sql 2>&1 | tee /tmp/0094-behaviour-manager.out
grep -qF "ACTOR id ${MANAGER} | role ${MSLUG} | chosen passed in with -v actor_id" /tmp/0094-behaviour-manager.out || { echo "STOP: run 2 did not act as the manager actor stage 1 chose, with that role"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0094-behaviour-manager.out || { echo "STOP: run 2 printed no SUMMARY row, so the transcript is truncated"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0094-behaviour-manager.out && { echo "STOP: a behaviour verdict read FAIL in run 2"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/0094-behaviour-manager.out || true)
[ "${NV}" = 14 ] || { echo "STOP: run 2 printed ${NV} verdicts, not 14"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0094-behaviour-manager.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE "${ALLOWM}" | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: run 2 read VACUOUS on ${BAD}, and only arms ${ALLOWM} may be vacuous for a ${MSLUG} actor"; exit 1; }
PM=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0094-behaviour-manager.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${PM}" | grep -qE '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' || { echo "STOP: run 2's SUMMARY did not parse: [${PM}]"; exit 1; }

echo "${REC}" > /tmp/0094-stage3.ok
echo "0094 VERIFIED AT THE RLS LAYER: ${NSLUG} ${PN}; ${MSLUG} ${PM}. The column guard in action is proven by the rehearsal and CI, not by this READ ONLY transcript."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, then a halt
unless stage 1's applied marker exists and stage 2's pass mark names the recorded sha
and is newer than that marker (so a stage 3 pasted after a stage 2 that halted stops
here, before any connection), then the run window line with now before its end, the
two actors stage 1 recorded, and for EACH run: its `ACTOR` line naming that actor and role, 14
verdicts, a SUMMARY row, no FAIL, and VACUOUS only on arms whose comparand a real
database can legitimately leave empty.** The block admits VACUOUS on the arms below
and on no other. **Whether each of them IS empty is decided by the behaviour file, not
by the block:** it counts the rows each arm needs as the connecting role, before it
takes the actor's claims (`SET LOCAL ROLE authenticated` comes after those counts), and
tests FAIL first, then VACUOUS, then OK:

- **arm 3, for both actors,** is VACUOUS only when no `users`, `roles` or `tenants` row
  of another tenant exists (`other_rows = 0`), which is one tenant in the database. With
  two or more, the other tenant's own `tenants` row makes it OK or FAIL;
- **arm 10, for both actors,** is VACUOUS only when no staff row could name another
  tenant's role (`foreign_role_possible` false): one tenant, or other tenants that hold
  no user and no role. A second tenant that holds either makes it OK or FAIL;
- **arm 12 as well, for the manager run only when the manager is an owner** (no
  admin qualified): it is VACUOUS only when the rule refuses no candidate of the
  owner's own tenant (`r_chk_n = own_cands`). An owner may give any of its tenant's
  roles, so that is when no other tenant holds a role: one tenant, or other tenants
  that hold no role.

**The block does not also count tenants, on purpose.** A tenant count would misjudge
arms 10 and 12: a second tenant with no staff and no roles leaves arm 10 legitimately
VACUOUS for every actor, and arm 12 for an owner, while arm 3 reads OK (measured under
"Review round 1", below). And if the connecting role's counts ever read nothing where
rows exist, arm 2, which is never VACUOUS, FAILs, because it needs the actor's own
tenant to hold users and roles.

**Never VACUOUS: 0, 1, 2, 4, 5, 6, 7, 8, 9, 11, 13,** and 12 for the narrowing actor and
for an admin. Arms 5 and 6 would be vacuous only in a tenant with fewer than two staff
rows, and stage 1's choice of two actors in one tenant rules that out. **Arm 13 is the
arm that tests every write policy's tenant predicate on a one-tenant database;** it has
no vacuous branch.

**The profile is printed, not asserted exactly,** because it moves with the data (which
tenants exist, and which staff and roles each holds). On the rehearsal, with 0094 applied: **`12 OK / 2 VACUOUS / 0 FAIL`** (3
and 10) for reception, therapist and admin actors with one tenant (the therapist rows
measured in review round 2, below), **`14 OK / 0 VACUOUS / 0 FAIL`**
with two, and **`11 OK / 3 VACUOUS / 0 FAIL`** (3, 10 and 12) for an owner with one.
Only a pass writes `/tmp/0094-stage3.ok`, the recorded sha, just before the last line;
the block removes it before anything else, so a stage 3 that stops leaves no mark, and
the closing read runs only on it.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line
`0094 VERIFIED AT THE RLS LAYER: ...`. Before the read runs it checks by machine that
the worktree is on the sha stage 0 recorded, that stage 1 applied, that stage 2 and the
last paste of stage 3 passed on that sha after the apply, that the Lisbon clock is
before the end of the run window recorded for that sha, and that the reader is the
pinned file. A check that fails prints a `STOP:` line and exits 1, and the read does not
run.

```
(
set -eo pipefail
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0094-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0094-main.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0094-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0094-stage2.ok || { echo "STOP: stage 2 left no pass mark. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0094-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0094-stage3.ok || { echo "STOP: stage 3 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0094-stage3.ok)" = "${REC}" ] || { echo "STOP: stage 3's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0094-stage3.ok -newer /tmp/0094-applied.ok)" ] || { echo "STOP: stage 3's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0094-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0094-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0094-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
echo "reader: ${RW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0094-journal-after.out
grep -qx 'journal rows on production: 92' /tmp/0094-journal-after.out || { echo "STOP: the journal read after the apply does not say 92"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0094_users_tenants_roles_policy_split[.]sql$' /tmp/0094-journal-after.out || { echo "STOP: the journal read does not list 0094 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0094-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0094-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 92, 0094 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** the run window line with now before its end, the reader's sha256 line, then the read printed IN FULL through `tee`:
`journal rows on production: 92`, every migration file on the recorded sha listed
`APPLIED`, 0094 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 92, 0094 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted: the halt rule says no journal read runs
after a halt, and the block stops on its own when a pass mark is missing.

## What every verdict must read

**Pre-check, 21 rows, all `OK`:** 0 the transaction is READ ONLY; 1 `tenants_tenant_isolation`
is `FOR ALL`, PERMISSIVE, `TO authenticated`, USING and WITH CHECK
`(id = ( SELECT jwt_tenant_id() AS jwt_tenant_id))` (md5 `2fac38fc48c49953b24de49b0da5f197`);
2 and 3 `roles_tenant_isolation` and `users_tenant_isolation` the same with
`(tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id))` (md5 `11ef341951d0d9b55ccd0acbb8d6a2e0`);
4 none of the eight new policy names exists; 5 neither the guard function nor its trigger
exists; 6 `auth_admin_read_roles` and `auth_admin_read_users` are `FOR SELECT`,
`TO supabase_auth_admin`, USING `true`; 7 the three tables carry exactly those five
policies, none RESTRICTIVE; 8 `users` carries no user trigger; 9 row level security is on
all three; 10 0094 absent from the journal by hash; 11 0093 present by hash; 12 the
newest applied `when` is `1788501400000`; `journal_rows_before` **91**; `policies_before`,
`secdef_functions_before` (every one owned by `postgres`), `public_functions_before`,
`other_policies_md5` and `hook_md5`, each whatever production reads, which stage 2
carries; 13 the helpers `public.jwt_tenant_id`, `public.jwt_role` and `auth.uid` exist;
14 the roles `authenticated`, `anon`, `service_role`, `patient` and `supabase_auth_admin`
exist (a REVOKE from a missing role would ERROR part way through the file).

**Post-check, 18 rows, all `OK`:**

1. the three `FOR ALL` policies from 0001 are gone;
2. the three tables carry exactly ten policies (the eight new ones and the two hook
   reads), none `FOR ALL`, none RESTRICTIVE;
3. the three SELECT policies are `FOR SELECT`, `TO authenticated`, and their USING is
   EXACTLY the old expression, the same md5 as pre-check 1 to 3: no read moved;
4. `tenants_manager_update`: `FOR UPDATE`, own tenant AND owner or admin, on both sides
   (md5 `50f1b3c61bc72057a0726f5ed36e48fd`);
5. `users_manager_insert`: `FOR INSERT`, WITH CHECK own tenant AND owner or admin AND
   ROLE_OK (md5 `087290ce1cf065438e8ecd4504ecea3a`);
6. `users_manager_update`: `FOR UPDATE`, the same expression on both sides;
7. `users_self_update`: `FOR UPDATE`, USING own tenant AND own row
   (`194c0ea44a4fd185dc83c6dce8236bcd`), WITH CHECK the same AND ROLE_OK
   (`6a8c4021e6398036c188830d9b3eafde`);
8. `users_manager_delete`: `FOR DELETE`, own tenant AND owner or admin AND never an owner
   row (`77b2d1a1e92b48e0d7d5814e4ea17e68`);
9. `roles` has no INSERT, UPDATE, DELETE or ALL policy; `tenants` has no INSERT, DELETE
   or ALL policy;
10. the guard function is SECURITY INVOKER, plpgsql, `search_path=public`, owned by
    `postgres`, body md5 `9b0fc7485410808653b45cd55626ff39`;
11. neither PUBLIC nor `anon`, `authenticated`, `service_role` or `patient` holds EXECUTE
    on it;
12. its trigger is on `users`, BEFORE UPDATE FOR EACH ROW, of every column, with no WHEN
    clause, enabled, and the only user trigger there;
13. row level security is still on the three tables, and the read grants stand
    (`authenticated` on all three, `supabase_auth_admin` on `users` and `roles`);
14. the policy count is `policies_before` **+ 5**;
15. the SECURITY DEFINER count equals `secdef_before`;
16. the public function count is `public_functions_before` **+ 1**;
17. every OTHER policy in the database still hashes, as one value, to `other_policies_md5`;
18. the token hook's body still hashes to `hook_md5`, and the journal reads
    `journal_rows_before` **+ 1**.

**The post-check is not a standing invariant for 14, 16, 17 and 18:** the next migration
that adds a policy or a function moves them. It is an assertion about this apply.

| Behaviour arm | What it proves | Narrowing actor | Manager actor |
|---|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK | OK |
| 1 | the session IS the named actor: `auth.uid()`, `jwt_tenant_id()` and `jwt_role()` answer for the claims set | OK | OK |
| 2 | reads unchanged: every `users` and `roles` row of the tenant, and the tenant row | OK | OK |
| 3 | no `users`, `roles` or `tenants` row of another tenant is read | VACUOUS with one tenant, else OK | the same |
| 4 | `users` UPDATE (USING) admits exactly the rule's rows: the own row; for owner or admin, the tenant's rows the owner tier allows | OK | OK |
| 5 | `users` DELETE admits exactly the rule's rows: none for a non-manager; never an owner row | OK | OK |
| 6 | `users` INSERT admits exactly the rule's candidates: none for a non-manager; owner rows for an owner only | OK | OK |
| 7 | `tenants`: UPDATE admits the own row for owner or admin only, both sides; INSERT and DELETE admit nothing | OK | OK |
| 8 | `roles`: INSERT, UPDATE (both sides) and DELETE admit nothing | OK | OK |
| 9 | the column guard trigger is there, fires on every UPDATE of every column, SECURITY INVOKER, body pinned | OK | OK |
| 10 | no staff row in any tenant names a role of another tenant | VACUOUS when no other tenant holds a user or a role (one tenant among them), else OK | the same |
| 11 | login still resolves: the token hook returns the actor's tenant and role | OK | OK |
| 12 | `users` UPDATE WITH CHECK admits exactly the rule's candidate new rows | OK | OK for an admin; VACUOUS for an owner when no other tenant holds a role (one tenant among them) |
| 13 | no write on the three tables admits a row of a tenant that does not exist | OK | OK |

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 92, 0094 by hash | stage 2, and the closing journal read | the database |
| the three `FOR ALL` policies are replaced by the eight, exactly | post-check 1 to 9, by md5 | the catalogue |
| no read moves | post-check 3 (the old md5), behaviour arm 2 | the catalogue, and RLS under impersonated claims |
| writes are limited to the roles the app allows, and never cross the tenant | behaviour arms 4 to 8, 12 and 13, as both actors | RLS expressions evaluated with the actor's claims |
| a non-manager changes only their name and the password-rotation flag on their own row | the SHAPE by post-check 10 to 12 and arm 9; the BEHAVIOUR by the rehearsal's write arms and CI's packages/db suite only | the trigger |
| login still works | behaviour arm 11 and post-check 18 (the hook's body) | the token hook |
| the app screens work for each role (Perfil, the first-login password, Equipa, Definicoes) | **NOT DISCHARGED BY THIS DOCUMENT.** The in-app checks are the owner's, after the sitting (PR #1459, "Verification checklist", item 4) | the route |

## Rehearsal

**The check files were rehearsed on these bytes; the blocks of this document are
rehearsed by a separate agent.** By the owner's ruling of 2026-09-27 ("build/rehearse/
document as separate agents"), the lane that writes an apply document does not
rehearse it. The rehearsal agent extracts the five blocks from this document at the
sha256 its sidecar pins and runs them on a throwaway standing at production's position
(main's 91 migrations), with the substitutions it counts and names, and records the
result under "The rehearsal of the blocks and the dispatch" at the end of this section.
If a finding changes one byte of a block, this document, its sidecar and GREEN's
dispatch move together, and the dispatch's document sha256 is refilled. Recording the
rehearsal here changes this document's sha256 and no byte of any block, so the dispatch's
document sha256 is refilled for that reason alone.

**A smoke run of these five blocks, by the document agent, is not that rehearsal.** On
2026-09-28 the blocks were extracted from this document verbatim, from a commit that
carried it and its sidecar as `origin/main` of a private bare origin, and run under
`zsh -f` in a clone of it against a throwaway copied from `c9r2_arms_base` (main's 91
migrations, two tenants, synthetic staff), with five substitutions counted per block:
`/tmp/` to a scratch directory, the `cd` line, the environment line, the target guard to
an `echo`, and the closing read's reader to a local copy without its production-only
guard. Stage 0 exit 0 (`92 .sql files match 92 journal entries`); stage 1 printed 21 OK
and chose a reception and an admin actor, then `verified-migrate.mjs` exited 4 with
journal `91 -> 91`, because pnpm's dependency check refused the clone's linked
`node_modules` (the paragraph above), so 0094 was applied there with `drizzle-kit
migrate` from the promoted tree and the applied marker set by hand; stage 2 exit 0,
18 OK, journal 91 to 92; stage 3 exit 0, `14 OK / 0 VACUOUS / 0 FAIL` for both actors,
and on a one-tenant copy `12 OK / 2 VACUOUS / 0 FAIL` for both (3 and 10); the closing
read exit 0, 92 rows and nothing pending. Three halts, each run for real: stage 1 with
every reception and therapist deactivated STOPs on the missing subject with the journal
at 91; stage 1 after `origin/main` moved STOPs on the HEAD CHECK before the environment
line; a transcript with arm 5 planted VACUOUS is caught by stage 3's filter.

**What has run on these exact check files and this migration,** all on the local
rehearsal container (Postgres 17.6), in throwaway databases standing at `main`'s 91
migrations, with synthetic fixtures only: PR #1459's rehearsal built them with
`drizzle-kit migrate`, and the promotion's own runs copied the template `b13a_app_base`,
whose 91 journal hashes were compared with main's one by one:

| Run | Result |
|---|---|
| the pre-check, unapplied | **21 OK / 0 FAIL** |
| 0094 applied with `drizzle-kit migrate` from the promoted tree | journal 91 to 92, newest hash `439cb53e…6a6c`, `when` 1788501500000 |
| the post-check, applied, with that pre-check's six carries | **18 OK / 0 FAIL** |
| the pre-check on the applied database | 11 OK / 10 FAIL (1, 2, 3, 4, 5, 7, 8, 10, 12, `journal_rows_before`): a second apply is refused before it starts |
| the post-check on main's schema | 2 OK / 16 FAIL, exit 0, no ERROR |
| the behaviour check, applied, two tenants | 14 OK / 0 VACUOUS / 0 FAIL as owner, admin, therapist and reception |
| the behaviour check, applied, one tenant | 12 OK / 2 VACUOUS / 0 FAIL (3, 10) as admin and reception; 11 OK / 3 VACUOUS / 0 FAIL (3, 10, 12) as owner |
| the rehearsal's write arms, applied | 53 of 53 as expected: W1 to W9 succeed for the roles that have them, every write outside the app's rules is refused |
| each control broken on purpose (PR #1459's table), then restored | the post-check and the behaviour check each FAIL on the arm named for it; clean again, 18 OK and 14 OK |
| idempotence | applied three times, the catalogue fingerprint identical after each |
| packages/db, the two flipped tests, fresh applied database, serial | 1363 of 1363, exit 0; the two flipped suites fail exactly their 2 new assertions without 0094 and pass 121 of 121 with it |

### The rehearsal of the blocks and the dispatch, 2026-09-28

**Run by the rehearsal agent, which wrote neither this document nor the dispatch.** It
rehearsed the five blocks of this document as it stood at sha256
`f7bc4e0e488392efe76afd5873c393b7f2996399becee2dc0f34558740d8aded` (commit `f47f0c6d`,
the branch head), and two blocks of GREEN's dispatch `green-dispatch-0094.txt` (sha256
`35e539118de7b717dd8f42d08c03e43bbe22d38bb8e066680e0c9dd1df37da6b`, which stays on the
authoring machine): BEFORE YOU START (its lines 101 to 167) and the CLOCK CHECK (its
lines 215 to 225). Every run below exited as wanted, and no block changed. This record
changes no byte of any block: each block's sha256, taken between its fences, is the same
before this subsection and after it.

| Block | sha256 of its text between the fences |
|---|---|
| stage 0 | `82fdf201afb47c1f8ad99d75abb75cc570d7c0d3ffaea92f59880ecc4b1bd1c4` |
| stage 1 | `f20c93c80f46d84f34bccb3783142339a0f19168fa7f64affe8b3925b24ea0a2` |
| stage 2 | `3a4fa4308da14d77d5955f7c675c3aab10bf07f37c3c1c0c46557493cc8388ec` |
| stage 3 | `5c90bdf6db5a372650f5358bc050a3bc1177993b3eb4266f27a41167e17d5f82` |
| closing read | `245f82196f4a34bd7b34be21feb10d6d7a20ad4a6a6319599c69eaf28bb01bf4` |

**Where it ran.** `t3_0094_prod` on the rehearsal container (Postgres 17.6), built for
this run and not copied from a template: a database from `template0`, the `auth` schema
copied schema-only from the container's own `postgres` database, then every migration on
`origin/main` (`b8c62fd5`, 91 journal entries) applied in journal order with `psql -1`,
then drizzle's journal written the way drizzle writes it, one row per entry, `hash` the
file's sha256 and `created_at` its `when`. Its fingerprint equals that of the templates
`b13a_app_base` and `c9r2_arms_base`, which were built by other means: 91 journal rows
with one md5 over their hashes in id order, one md5 over every policy, and the same
count of SECURITY DEFINER functions in `public`. Synthetic staff only: one tenant, its four
staff roles, eight users (an owner, an inactive admin and an active one, two therapists,
an inactive receptionist whose id sorts first and an active one, and a shared resource
with no role).

**How it ran, and how `origin/main` was replaced.** Each block was extracted verbatim,
substituted, and run under `zsh -f` with a clean environment (`env -i`, with `HOME`,
`PATH` and `TERM` only), from a detached git worktree of the branch head with its own
`pnpm install --frozen-lockfile --offline`, so `verified-migrate.mjs` reached drizzle
through `pnpm --filter @osteojp/db exec` exactly as GREEN's will, and 0094 was applied
by it, not by hand. **`origin/main` became the branch head this way:** a scratch bare
repository whose `main` is the branch head stands in for `origin`; each
`git fetch origin --prune` became a fetch of that repository's `main` into a ref private
to the worktree, and each `git rev-parse origin/main` reads that ref. Moving the stand-in's
`main` is a merge landing on GitHub, and the next block's own fetch sees it. The
substitutions, applied in this order and counted per block:

| Substitution | BEFORE YOU START | stage 0 | CLOCK | stage 1 | stage 2 | stage 3 | closing |
|---|---|---|---|---|---|---|---|
| `/tmp/` to a scratch directory, one per sitting | 2 | 6 | 0 | 20 | 12 | 25 | 14 |
| the `cd` line to the scratch worktree | 1 | 1 | 0 | 1 | 1 | 1 | 1 |
| `git fetch origin --prune` to the stand-in origin's `main` | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| `git rev-parse origin/main` to the worktree's ref | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| the environment line to `export DATABASE_URL_DIRECT=` the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the target guard to an `echo` naming the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the reader's `--env-file` to the throwaway's URL (below) | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `MERGED='<MERGED_SHA>'` to the stand-in merge commit, the branch head | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

After substitution no block named the apply worktree or the secrets directory: the
extractor refuses to write one that does. **The reader ran byte-identical, as pinned.**
Its guard refuses a connection string that does not contain the production ref
somewhere in it (`packages/db/scripts/read-applied-migrations.mjs`, the `url.includes`
test); the throwaway's URL carried the ref inside its `application_name`, so that test
passed on a local database and the read ran the pinned bytes. **The target guard ran
once for real, unsubstituted:** it refuses the throwaway (below).

**The happy path, in GREEN's order, one tenant, by the real clock at Lisbon 01:14 on
Monday 28 September:**

| Block | Exit | What it printed |
|---|---|---|
| BEFORE YOU START | 0 | `main head` the stand-in, `merge commit: on origin/main`, `worktree: clean`, the document, the sidecar and all eight file pins as the dispatch's EXPECT lists them, `Lisbon now: 2026-09-28 01:14`, then the read: `journal rows on production: 91`, 0094 `NOT APPLIED`, `pending on this ref: 1`; the last line |
| stage 0 | 0 | `docs/migration-apply-0094.md: OK`; `newest journal entry: idx 91, when 1788501500000, tag 0094_users_tenants_roles_policy_split, of 92`; check-journal `92 .sql files match 92 journal entries in order`; `running from origin/main f47f0c6d…`; `0094 PROMOTION, NUMBER AND FILES VERIFIED` |
| CLOCK CHECK | 0 | `CLOCK: inside the run window. Paste stage 1 now.` |
| stage 1 | 0 | the same sha twice; the pre-check **21 OK, 0 FAIL**; `behaviour actors: narrowing <id> (reception), manager <id> (admin)`, the ACTIVE receptionist and admin, not the inactive ones whose ids sort first; `pending    1  [0094_users_tenants_roles_policy_split]`; drizzle `exit: 0`; `journal    91 -> 92  (delta 1)`; present by sha256 `yes`; `0094 APPLIED. Paste stage 2 now.` |
| stage 2 | 0 | `main has not moved since stage 0`; the carry line `journal_before=91` with the throwaway's four other counts and two md5s; the post-check **18 OK**; the FOR THE RECORD table, ten policies; `journal rows before=91 after=92, 0094 present by hash`, newest row `439cb53e…6a6c` at `when` 1788501500000; the last line |
| stage 3 | 0 | reception **`12 OK / 2 VACUOUS / 0 FAIL`**, admin **`12 OK / 2 VACUOUS / 0 FAIL`**, VACUOUS on 3 and 10 only; the last line |
| closing read | 0 | `journal rows on production: 92`, 92 files `APPLIED` with 0094 last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, `CLOSING READ: ...` |

**The same sitting on two other shapes, every block exit 0.** Two tenants, and every
block PASTED, fed on stdin to an interactive `zsh -f -i`: `14 OK / 0 VACUOUS / 0 FAIL`
for both actors. One tenant with every admin inactive, so the manager actor is the
owner: reception `12 OK / 2 VACUOUS / 0 FAIL`, owner `11 OK / 3 VACUOUS / 0 FAIL` (3, 10
and 12), which stage 3's filter allows for an owner and for no one else.

**Every halt, each run for real:**

| Arm | Exit | Halted on | Database after |
|---|---|---|---|
| stage 1 on a database where 0094 is applied, in a fresh sitting after stage 0 passed | 1 | the pre-check, **11 OK / 10 FAIL** (1, 2, 3, 4, 5, 7, 8, 10, 12, `journal_rows_before` reading 92), then `STOP: a pre-check verdict read FAIL` | journal 92, nothing applied again; the failed run's transcript in `.new`, no `.out` |
| `verified-migrate.mjs` itself, run on that database | 3 | `PRECONDITION FAILED: ... ALREADY in drizzle.__drizzle_migrations`, before drizzle | journal 92 |
| main moved between stage 0 and stage 1 (a commit on top of the head, in the stand-in origin) | 1 | `STOP: main moved since stage 0, the merge freeze was broken.` with both shas, before the environment line and before psql | journal 91, the three `FOR ALL` policies there, no pre-check transcript |
| stage 0 on a main whose 0094 file has one byte appended | 1 | `STOP: 0094 on disk is not the approved body`, no sha recorded | untouched |
| stage 0 on a main whose pre-check has one byte appended | 1 | `STOP: the pre-check on disk is not the approved file`, no sha recorded | untouched |
| stage 0 on a main whose `verified-migrate.mjs` has one byte appended | 1 | `STOP: verified-migrate on disk is not the approved file`, no sha recorded | untouched |
| stage 0 on a main whose copy of this document has one byte appended, its sidecar not | 1 | `docs/migration-apply-0094.md: FAILED`, then `STOP: this document is not the approved one` | untouched |
| BEFORE YOU START on each of those four mains | 1 each | the matching `STOP: ... on origin/main is not the approved ...` and `The journal read has not run` | untouched |
| the CLOCK CHECK at Lisbon Sunday 20:59, Monday 03:00, Monday 12:00, Tuesday 01:00 and Saturday 22:00 | 1 each | the matching `STOP:` | |
| the CLOCK CHECK at Lisbon Sunday 21:00 and 23:59, Monday 00:00, 01:00 and 02:59 | 0 each | `CLOCK: inside the run window. Paste stage 1 now.` | |
| BEFORE YOU START at Lisbon Monday 03:00, Sunday 20:59 and Tuesday 01:00 | 1 each | the matching `STOP:` and `The journal read has not run`; no journal transcript written | |
| BEFORE YOU START at Lisbon Monday 00:00 | 0 | `BEFORE YOU START: every check passed, and the journal reads 91.` | |
| BEFORE YOU START with `<MERGED_SHA>` still unfilled | 1 | `STOP: MERGED is not a filled-in sha, so this dispatch is NOT READY` | |
| BEFORE YOU START with a MERGED that is not on main | 1 | `STOP: the merge commit of PR 1459 is not on origin/main` | |
| stage 1 with the target guard NOT substituted | 2 | the guard: `REFUSING: project ref is "postgres", not the production project.`, before psql | journal 91 |
| stage 1 with every receptionist and therapist inactive | 1 | the pre-check 21 OK, then `STOP: no active, non-resource reception or therapist user ...` | journal 91 |
| stage 2, stage 3 and the closing read after stage 0, stage 1 never run | 1 each | `stage 1 did not complete an apply`, `stage 1 recorded no behaviour actors`, `stage 1 left no applied marker` | |
| stage 0 and stage 1 again after the apply | 1 each | `STOP: stage 1 has ALREADY APPLIED 0094 in this sitting` | journal 92 |
| main moved AFTER the apply: stage 2, stage 3 and the closing read | 0 each | `MAIN MOVED since stage 0` with both shas; each ran from the recorded sha and passed | |

The clock arms put a `date` on the `PATH` that prints one fixed instant; the blocks call
`date` by name, and nothing else in them was changed for those arms.

| File, in the rehearsal agent's scratchpad (not committed) | sha256 |
|---|---|
| `build-prod91.zsh`, the database at main's 91 migrations | `9660ba0543c4cc5ea0c81c4356a38b157546d270bb0db1f92b18352735ba2107` |
| `fixture-one-tenant.sql`, the synthetic staff | `bbfdeb2dd5666da5c9e24a9b5b86367f044d2087c485abe6315ddda0ae022226` |
| `fixture-second-tenant.sql`, the second tenant | `d1a486fd2e8278c81198a249428b42f2f95842c7a902c7a4a6218a8f6933cca7` |
| `extract.mjs`, the extractor and its counted substitutions, the refill of the dispatch's document sha256 included. The runs above used it before that option was added; without the option the two write the same blocks byte for byte | `60fb754d88adf8017feb7d6a6ed1e20344a9b637bffc378ffd894417cb40e8a0` |
| `run.zsh`, one block under `zsh -f` | `bd28b5aab55393d7fcb99dd9dfe4f56a632914f49b3310e83a59a9bd0c2fecc2` |
| `run-i.zsh`, one block pasted into `zsh -f -i` | `bfc41961b743fa390869cf80909970db1ca086a1d9f054c92a555efd10ecfcdf` |
| `tamper.zsh`, a stand-in main with one byte appended to one file | `f4d3e4c528197e47d526e77bcd31eb72f4fab42cd4450e5880b83baef21659b7` |
| `fakeclock/date`, the fixed clock | `e307c7f1b8a7f62913c590c6ecec1921e85f9f9d92b398269002f50e1b0f1cb7` |

**The committed tree is the rehearsed tree.** After this subsection and the sidecar were
committed, the whole sitting ran once more from that commit as the stand-in `main`, with
the dispatch's document sha256 refilled to this document's (one more counted
substitution, in BEFORE YOU START only): every block exit 0, reception and admin
`12 OK / 2 VACUOUS / 0 FAIL`, the closing read 92. **That refill was a substitution in
the rehearsal's extracted copy only;** the dispatch file itself kept `f7bc4e0e…` until
review round 1, below, refilled it.

### Review round 1, 2026-09-28: what changed, and the runs that measured it

**No byte of any block changed in round 1.** Each block's sha256 between its fences was
still the one in the table above; round 2, below, changed all five. What round 1 changed:

- **the branch carries `origin/main` at `b8c62fd5`** (#1466, the owner's fourth
  renumbering). The one conflict, `packages/db/migrations-pending/README.md`, resolves
  to main's ruled queue with `0094` promoted and held for the apply, and keeps the
  Promoted row. No migration, check file or pinned program changed; `pnpm
  db:check-journal` reads 92 files and 92 journal entries, and the `test:scripts` suite
  passes 1053 of 1053;
- **this document's prose, on two points:** what closes a main that moves before stage 0
  fetches (under "THIS DOCUMENT PINS ITSELF"), and where arms 3, 10 and 12 decide
  VACUOUS (stage 3's EXPECT and the arm table);
- **GREEN's dispatch.** BEFORE YOU START removes, and on a pass records, the main head it
  checked in `/tmp/0094-start-main.sha`. The CLOCK CHECK halts before stage 1 unless
  stage 0 recorded that same head and the document at it hashes to the dispatch's pin.
  Both refuse a start at 02:30 Lisbon or later on Monday, so stage 1 starts by 02:29 and
  the READ ONLY stages end before 03:00. The dispatch's document sha256 is refilled, and
  `<MERGED_SHA>` is its only placeholder.

**Where it ran.** `t3_fix_prod91` on the rehearsal container, built as `t3_0094_prod`
was (from `template0`, the `auth` schema copied schema-only, main's 91 migrations in
journal order with `psql -1`, drizzle's journal seeded by file sha256), with the same
synthetic one-tenant fixture; each run on its own copy. The blocks ran from a new
detached worktree of the commit under test, `040f2af9` (this document at sha256
`fa4bf04d…659d`, the dispatch pinning that same sha256), with its own offline
frozen-lockfile install, and a scratch bare repository whose `main` is that commit stood
in for `origin`. The substitutions are the ones above; the dispatch's two blocks counted
tmp 4, cd 1, fetch 1, rev-parse 1, reader 1 and merged 1 (BEFORE YOU START), and tmp 5
and cd 1 (the CLOCK CHECK). Both read a fixed clock, a `date` on the `PATH`.

| Block, happy path at Lisbon Monday 01:30 | Exit | What it printed |
|---|---|---|
| BEFORE YOU START | 0 | every pin as the EXPECT lists it, `journal rows on production: 91`, `main head recorded for the CLOCK CHECK: 040f2af9…`, the last line |
| stage 0 | 0 | `running from origin/main 040f2af9…`, `0094 PROMOTION, NUMBER AND FILES VERIFIED` |
| CLOCK CHECK | 0 | the same sha twice, `document at the recorded sha: fa4bf04d…659d`, `Lisbon now: 2026-09-28 01:30`, the last line |
| stage 1 | 0 | the same sha twice; pre-check **21 OK**; the active reception and admin; `pending    1`; drizzle `exit: 0`; `journal    91 -> 92  (delta 1)`; `0094 APPLIED. Paste stage 2 now.` |
| stage 2 | 0 | post-check **18 OK**; `journal rows before=91 after=92, 0094 present by hash`; the last line |
| stage 3 | 0 | reception and admin **`12 OK / 2 VACUOUS / 0 FAIL`**, VACUOUS on 3 and 10 only |
| closing read | 0 | `journal rows on production: 92`, 92 files `APPLIED` with 0094 last, `pending on this ref: 0`, `CLOSING READ: ...` |

BEFORE YOU START, stage 0 and the CLOCK CHECK were also pasted into an interactive
`zsh -f -i`: exit 0 each, and the CLOCK CHECK pasted at Monday 02:30 exit 1 on its STOP.

| Arm | Exit | Halted on |
|---|---|---|
| main moved between BEFORE YOU START and stage 0, the document unchanged (one byte appended to the pending README) | BEFORE YOU START 0, stage 0 0, CLOCK CHECK 1 | `STOP: main moved between BEFORE YOU START and stage 0, the merge freeze was broken.` with both shas |
| main moved between BEFORE YOU START and stage 0 to a new document AND a sidecar re-pinned to it, in one commit | BEFORE YOU START 0, **stage 0 0** (`docs/migration-apply-0094.md: OK` on the new pair: the gap this round closes), CLOCK CHECK 1 | the same STOP |
| both records naming that foreign head, written by hand | CLOCK CHECK 1 | `document at the recorded sha: d0c45244…`, then `STOP: the document at the recorded sha is not the approved one` |
| stage 0 run, BEFORE YOU START never run | CLOCK CHECK 1 | `STOP: BEFORE YOU START recorded no main head in this sitting` |
| BEFORE YOU START's record three hours old | CLOCK CHECK 1 | `STOP: BEFORE YOU START's record is over two hours old` |
| BEFORE YOU START passed, stage 0 never run | CLOCK CHECK 1 | `STOP: stage 0 recorded no sha in this sitting` |
| an earlier record in place, then BEFORE YOU START with `<MERGED_SHA>` unfilled, then stage 0 | BEFORE YOU START 1, stage 0 0, CLOCK CHECK 1 | the unfilled MERGED STOP; the earlier record gone; `recorded no main head` |
| the CLOCK CHECK at Lisbon Sunday 21:00 and 23:59, Monday 00:09, 01:08, 01:30, 02:29 and 02:29:59 | 0 each | its last line |
| the CLOCK CHECK at Lisbon Sunday 20:59, Monday 02:30 and 03:00, Tuesday 01:00 | 1 each | the matching STOP |
| BEFORE YOU START at Lisbon Sunday 21:00, Monday 00:09 and 02:29 | 0 each | its last line, the head recorded |
| BEFORE YOU START at Lisbon Sunday 20:59 and Monday 02:30 | 1 each | the matching STOP; no journal transcript and no head recorded |

**Arms 3, 10 and 12 with a second tenant that holds no staff and no roles:** one tenant
row inserted into a copy of the happy path's database after its sitting, and the behaviour
file run on it directly, once per actor.

| Actor | Arm 3 | Arm 10 | Arm 12 | SUMMARY |
|---|---|---|---|---|
| reception | OK, `0 read of 1 that exist` | VACUOUS | OK | `13 OK / 1 VACUOUS / 0 FAIL` |
| admin | OK | VACUOUS | OK | `13 OK / 1 VACUOUS / 0 FAIL` |
| owner | OK | VACUOUS | VACUOUS | `12 OK / 2 VACUOUS / 0 FAIL` |

**packages/db on the merged tree,** on databases built the same way, at the 92
migrations and, as the control, at main's 91: the two flipped suites pass **121 of 121**
at 92. The whole suite, serial, passes 1332 of 1363 at 92 and 1330 at 91. The 31 that
fail at 92 fail identically at 91, and the only two more at 91 are exactly the two
assertions the flip added. Those 31 are this builder's environment, the same with and
without 0094: `permission denied for table tenants` and its kind (a database built from
`template0` has no Supabase default privileges) and a missing `storage` schema (no
storage-api). **They are not evidence about 0094, and CI, whose database has both, is
the gate:** #1459 read CONFLICTING until this merge, so no CI run has yet seen the
promoted journal or the two flipped suites.

| File, in the scratchpad (not committed) | sha256 |
|---|---|
| `build.zsh`, the database at a given migrations tree | `934b8a7efbbf70ef332526a40467ee20f68eaf24ccc864aaa5aeb1c05eebc19f` |
| `fixture-one-tenant.sql`, the same synthetic staff | `bbfdeb2dd5666da5c9e24a9b5b86367f044d2087c485abe6315ddda0ae022226` |
| `extract.mjs`, the extractor, pointed at this round's worktree | `cb6fe3d32c477ebef09fea9422966b73cd29497eaa3a6306fdc164eab695cbda` |
| `run.zsh`, one block under `zsh -f` | `61a6c99b335277c790bc4617d5568a868590caa1c00e67b34671dd5af63130d3` |
| `run-i.zsh`, one block pasted into `zsh -f -i`, the fixed clock passed through | `10aa89a9ac33d95d86867e13f7f670f7442c020f6376a01ea0c54e273498c729` |
| `tamper.zsh`, a stand-in main with one byte appended, the sidecar re-pinned on request | `5017c087e7838133cb71827ea1e77441b62097344e2d61d6ace843006c7b04fd` |
| `fakeclock/date`, the fixed clock | `e307c7f1b8a7f62913c590c6ecec1921e85f9f9d92b398269002f50e1b0f1cb7` |

This subsection, the arm 12 wording and the arm table were written after these runs,
and none of them is a byte of a block. They move this document's sha256 away from
`fa4bf04d…659d`, and the dispatch carries the committed one.

### Review round 2, 2026-09-28: what changed, and the runs that measured it

**All five blocks changed, and both of the dispatch's.** What changed:

- **check-journal is pinned.** Stage 0 asserts `scripts/check-journal.mjs` by sha256
  (`7f89e49a…6c59`) before it runs it, and BEFORE YOU START asserts it on `origin/main`.
  The fact table says what stays unpinned, and why;
- **the run window is checked by machine in every block from stage 1 on.** The CLOCK
  CHECK records it for the recorded sha in `/tmp/0094-window.ok`; stage 1 checks it at
  its start and again after the pre-check, before the apply; stages 2 and 3 and the
  closing read refuse at or after its end; stage 0 removes the record. This document
  still carries no date;
- **stage 3 needs stage 2's pass:** the applied marker, and stage 2's pass mark naming
  the recorded sha and newer than that marker, before any connection;
- **GREEN's dispatch.** BEFORE YOU START requires `origin/main` to BE #1459's merge
  commit (round 1 required only that it contain it); the NOT READY lines add SOLO's step
  to disarm auto-merge on the armed PRs before #1459 merges, and the freeze starts at
  that merge. The window is stated in each of its two blocks as `WOPEN`, `WSTART` and
  `WEND`;
- **the one-tenant profile for a therapist,** measured below.

**Where it ran.** `t3_fix_r2_one` on the rehearsal container, built as round 1's
database was (from `template0`, the `auth` schema copied schema-only, the 91 migrations
of `b8c62fd5` in journal order with `psql -1`, drizzle's journal seeded by file sha256),
with the same synthetic one-tenant fixture. Its fingerprint equals `b13a_app_base`'s and
`c9r2_arms_base`'s: one md5 over the 91 journal hashes in id order, one md5 over every
policy, 26 SECURITY DEFINER functions in `public`. Variants, each a copy: the second
tenant added; the active receptionist made inactive; the active admin made inactive;
every receptionist and therapist inactive. Each run had its own copy. The blocks ran
from a new detached worktree of `831fb515` (this document at sha256 `e0e5a05c…8623`,
pinned by that commit's sidecar), with its own offline frozen-lockfile install, and a
scratch bare repository whose `main` is that commit stood in for `origin`. The dispatch
ran at sha256 `c2d9e17a…e0e5`, its document sha256 already filled with
`e0e5a05c…8623`. The substitutions are round 1's, counted:

| Substitution | BEFORE YOU START | stage 0 | CLOCK | stage 1 | stage 2 | stage 3 | closing |
|---|---|---|---|---|---|---|---|
| `/tmp/` to a scratch directory, one per sitting | 5 | 7 | 9 | 25 | 15 | 33 | 17 |
| the `cd` line to the scratch worktree | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `git fetch origin --prune` to the stand-in origin's `main` | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| `git rev-parse origin/main` to the worktree's ref | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| the environment line to `export DATABASE_URL_DIRECT=` the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the target guard to an `echo` naming the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the reader's `--env-file` to the throwaway's URL | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `MERGED='<MERGED_SHA>'` to the stand-in merge commit | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

| Block | sha256 of its text between the fences, round 2 |
|---|---|
| stage 0 | `d7236d94b49289f35a94f9991b5f2255783863fe28d8856ceb82de82c117c9b2` |
| stage 1 | `98a1358c81d52df758bf6b9f9b492c88569c214481ce216924408de77d09c39d` |
| stage 2 | `3f161231f9a3f27ce47c61c70f3e54fae86b42108998b3b55f30ab1421110304` |
| stage 3 | `cfbb97115d8c43a6c45f598bf8462b5c44443403e4a525e3b08f469b9ba8c35a` |
| closing read | `af467dd9ff6fca6c1c5eb4a6ce27af801b40c3aa071906e6852d182eb8d797bd` |

**The happy path, one tenant, the fixed clock at Lisbon Monday 01:30 for BEFORE YOU
START and moving on a minute or two per block:**

| Block | Exit | What it printed |
|---|---|---|
| BEFORE YOU START | 0 | `merge commit: origin/main IS the merge commit of PR 1459`; the document, the sidecar and all eight file pins, `check-journal: 7f89e49a…6c59` among them; `Lisbon now:   202609280130`; `journal rows on production: 91`, 0094 `NOT APPLIED`, `pending on this ref: 1`; the head recorded; the last line |
| stage 0 | 0 | `docs/migration-apply-0094.md: OK`; the newest journal entry, idx 91, of 92; check-journal `92 .sql files match 92 journal entries`; `running from origin/main 831fb515…`; the last line |
| CLOCK CHECK | 0 | the same sha twice; `document at the recorded sha: e0e5a05c…8623`; `run window recorded in .../0094-window.ok: 831fb515… 202609272100 202609280229 202609280300`; the last line |
| stage 1 | 0 | the same sha twice; `run window, ... now 202609280133`; the pre-check **21 OK**; the active reception and admin; `run window, again before the apply: now 202609280133`; `pending    1`; drizzle `exit: 0`; `journal    91 -> 92  (delta 1)`; `0094 APPLIED. Paste stage 2 now.` |
| stage 2 | 0 | `run window, ... now 202609280135`; the post-check **18 OK**; `journal rows before=91 after=92, 0094 present by hash`; the last line |
| stage 3 | 0 | stage 2's pass mark accepted; `now 202609280136`; reception and admin **`12 OK / 2 VACUOUS / 0 FAIL`**, VACUOUS on 3 and 10 only |
| closing read | 0 | `now 202609280137`; `journal rows on production: 92`, 92 files `APPLIED`, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, `CLOSING READ: ...` |

**Three other shapes, every block exit 0.** Two tenants, every block pasted into
`zsh -f -i`: reception and admin `14 OK / 0 VACUOUS / 0 FAIL`, the closing read 92. One
tenant with the active receptionist inactive: stage 1 chose the lower-id active
therapist and the admin, and stage 3 read therapist `12 OK / 2 VACUOUS / 0 FAIL` and
admin `12 OK / 2 VACUOUS / 0 FAIL`. One tenant with the active admin inactive: reception
`12 OK / 2 VACUOUS / 0 FAIL`, owner `11 OK / 3 VACUOUS / 0 FAIL` (3, 10 and 12).
**The therapist rows:** after the happy path, the behaviour file run directly as each of
the two active therapists read `12 OK / 2 VACUOUS / 0 FAIL`, VACUOUS on 3 and 10.

**Every halt, each run for real:**

| Arm | Exit | Halted on | Database after |
|---|---|---|---|
| stage 1 after BEFORE YOU START and stage 0, the CLOCK CHECK never pasted | 1 | `STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0.`, before the environment line | journal 91, no pre-check transcript |
| the CLOCK CHECK at 02:29, stage 1 at 02:30 | 0, 1 | `STOP: Lisbon 202609280230 is past 202609280229, the last minute the run window lets stage 1 start.`, before the environment line | journal 91 |
| the CLOCK CHECK at Sunday 21:00, stage 1 at 20:59 | 0, 1 | `STOP: Lisbon 202609272059 is before the run window opens at 202609272100.` | journal 91 |
| stage 1 whose clock reads 02:29 at its start and 02:30 after the pre-check | 1 | the pre-check 21 OK and both actors, then `STOP: Lisbon 202609280230 is past 202609280229 after the pre-check, so the apply does not start.` | journal 91; the run's `.new` files kept, no `.out` |
| the run window record rewritten to name another sha | 1 | `STOP: the run window was recorded for b8c62fd5…, not for the sha stage 0 recorded.` | journal 91 |
| stage 0 pasted again after the CLOCK CHECK, then stage 1 | 0, 1 | stage 0 removed the record; stage 1 `recorded no run window` | journal 91 |
| stage 2 at Monday 03:00, after an apply at 01:33 | 1 | `STOP: Lisbon 202609280300 is at or past 202609280300, the end of the run window. The write stands; ...`, before the environment line; no post-check, no pass mark | journal 92 |
| stage 3 pasted after that stage 2 STOP, which the halt rule forbids | 1 | `STOP: stage 2 left no pass mark, so it did not pass. Stage 3 has not run`, before the environment line; no behaviour transcript | journal 92 |
| the closing read after it | 1 | `STOP: stage 2 left no pass mark. The journal read has not run` | |
| stage 2 at 02:59, stage 3 at 03:00 | 0, 1 | stage 3's run window STOP, no behaviour run and no pass mark; the closing read then `stage 3 left no pass mark` | |
| stage 3 at 02:59:59, the closing read at 03:00 | 0, 1 | the run window STOP, `The journal read has not run`, no journal transcript; the same read at 02:59:59 exit 0 | |
| stage 3 with the applied marker touched after stage 2's pass mark | 1 | `STOP: stage 2's pass mark is older than the apply.` | |
| stage 3 with stage 2's pass mark naming another sha | 1 | `STOP: stage 2's pass mark does not name the sha stage 0 recorded.` | |
| stages 2 and 3 and the closing read after stage 0, stage 1 never run | 1 each | `stage 1 did not complete an apply`, then `stage 1 left no applied marker` twice | journal 91 |
| BEFORE YOU START with `origin/main` one commit past MERGED (the pending README with one byte appended) | 1 | `STOP: origin/main is not the merge commit of PR 1459 itself (...)`; no head recorded, no journal read. Round 1's dispatch passed this main | |
| BEFORE YOU START with a MERGED that is not on `origin/main` | 1 | the same STOP | |
| BEFORE YOU START with `<MERGED_SHA>` unfilled | 1 | `STOP: MERGED is not a filled-in sha, so this dispatch is NOT READY` | |
| BEFORE YOU START on a merge whose `check-journal.mjs` has one byte appended | 1 | `check-journal: 3ca4755f…`, then `STOP: check-journal on origin/main is not the approved file` | |
| stage 0 on that main | 1 | `STOP: check-journal on disk is not the approved file`, before it runs; no sha recorded | |
| stage 0 on mains whose 0094 file, pre-check, `verified-migrate.mjs` or this document has one byte appended | 1 each | the matching STOP, `docs/migration-apply-0094.md: FAILED` first for the document; no sha recorded | |
| main moved between the CLOCK CHECK and stage 1 | 0, 1 | `STOP: main moved since stage 0, the merge freeze was broken.`, before the run window line and the environment line | journal 91 |
| main moved between BEFORE YOU START and stage 0 | 0, 1 | the CLOCK CHECK's `STOP: main moved between BEFORE YOU START and stage 0`; no run window recorded | |
| every receptionist and therapist inactive | 1 | the pre-check 21 OK, then the missing-subject STOP | journal 91 |
| stage 1 with the target guard NOT substituted | 2 | `REFUSING: project ref is "postgres", not the production project.` | journal 91 |
| stage 0 and stage 1 pasted again after the apply | 1 each | `STOP: stage 1 has ALREADY APPLIED 0094 in this sitting` | journal 92 |
| main moved after the apply: stages 2 and 3 and the closing read | 0 each | stages 2 and 3 print `MAIN MOVED since stage 0` and pass from the recorded sha; the closing read passes on it | |
| BEFORE YOU START at Lisbon Saturday 22:00, Sunday 20:59, Monday 02:30 and 03:00, Tuesday 01:00 | 1 each | the matching STOP; no head recorded, no journal read | |
| BEFORE YOU START at Lisbon Sunday 21:00 and 23:59, Monday 00:00, 02:29 and 02:29:59 | 0 each | its last line | |
| the CLOCK CHECK at the same ten instants | the same exits | a pass records `<sha> 202609272100 202609280229 202609280300`; a STOP leaves no record, an earlier pass's included | |

The clock arms put a `date` on the `PATH` that prints one fixed instant or, for the
arm that needs time to pass inside stage 1, one instant on its first call and another
after. Not re-run in round 2, because nothing they exercise changed: the pre-check on
an applied database, the controls broken on purpose, and the packages/db suite.

| File, in the scratchpad (not committed) | sha256 |
|---|---|
| `build.zsh`, the database at a given migrations tree | `8de82af5e5740be2a841a446fadd9cc975b75226f6f8c6ce67a59b86bc00507c` |
| `fixture-one-tenant.sql`, the same synthetic staff | `bbfdeb2dd5666da5c9e24a9b5b86367f044d2087c485abe6315ddda0ae022226` |
| `fixture-second-tenant.sql`, the same second tenant | `d1a486fd2e8278c81198a249428b42f2f95842c7a902c7a4a6218a8f6933cca7` |
| `extract.mjs`, the extractor, pointed at this round's worktree | `83d9b83602400aeb2fe5350c708a4c0fc95ac1845316590c2432252f1b52f244` |
| `run.zsh`, one block under `zsh -f` | `8a8c172333d0637986eed4744f2768418aa6a60bc31f263e974821d37320d086` |
| `run-i.zsh`, one block pasted into `zsh -f -i` | `b86f69ed534c5e512f8d2612c7a6a5c277d136f6fea8ec6108216b458cae0042` |
| `sitting.zsh`, a fresh copy and a run of named blocks in order | `cc4c114e79a68f6f6b56bfd2f0deee7b840dab991b7b53a9e06e31189cbaf78e` |
| `lib.zsh`, the arm helpers | `630c444121f3db2ad2e656d308cdaef15394e65bd0909d3ab369140349f9ff9a` |
| `tamper.zsh`, a stand-in main with one byte appended | `ebc9c6d76143544d634145b631246c2d93754ac41b89cc23b042c6db19392b93` |
| `fakeclock/date`, the fixed clock, with a second instant on request | `bad344485eb017321000575e545d5120e809937967a5214e9be2a6114f6ebac3` |

This subsection, the therapist wording above and the sidecar were written after these
runs, and none of them is a byte of a block. They move this document's sha256 away from
`e0e5a05c…8623`, and the dispatch carries the committed one.

## What this does NOT do

- **It changes no read.** The three SELECT policies are the old `FOR ALL` expressions
  verbatim, and post-check 3 proves it by md5.
- **It changes no table grant and no existing function,** the token hook included.
  Post-check 13, 15 and 18 prove the read grants, the SECURITY DEFINER count and the
  hook's body.
- **It binds `authenticated` only.** `postgres`, `service_role`, the operator app, the
  seeds, owner-run SQL and migrations bypass row level security and pass the column
  guard untouched (it returns at once for any `current_user` other than
  `authenticated`).
- **It restates no app rule it does not need:** location scope, the last-owner guard
  and the no-activity guard on delete stay in the app.
- **One edge, by construction.** The claims are only as fresh as the token (one hour).
  A staff member just made owner cannot rename themselves until their token refreshes,
  because ROLE_OK refuses an owner row to an admin claim. The app's own checks read the
  same claim.
