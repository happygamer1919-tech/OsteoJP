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
| Mirror | `supabase/migrations/0094_users_tenants_roles_policy_split.sql`, written by `scripts/sync-supabase-migrations.mjs` with its fixed header; checked by content by `scripts/check-journal.mjs` (`pnpm db:check-journal`), which stage 0 runs with `node` directly so that no pnpm dependency check stands between it and the answer |
| Must follow | `0093_patient_rgpd_acceptances`: applied to production (journal 90 to 91, sha256 `7a769298…c454`), merged in #1399 |
| PR | #1459, branch `db/0094-users-tenants-role-policy-split-r6`, labelled `held-for-apply` until the owner takes it off and merges |
| Runs from | `origin/main`, after #1459 has merged. Stage 0 records the sha `origin/main` resolves to in `/tmp/0094-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK, below) |
| This document | `docs/migration-apply-0094.md`, pinned by `docs/migration-apply-0094.sha256` and asserted by every stage; GREEN's dispatch names its sha256 as well |
| Pre-check | `scripts/db/precheck-users-tenants-roles.sql`, READ ONLY, 21 verdicts (15 numbered, 6 carries), sha256 `e0fa6a2dfe5237403fe6a3fb8b8782bbe83a9a53d51ed527b431be4b12f82803` |
| Post-check | `scripts/db/postcheck-users-tenants-roles.sql`, READ ONLY, 18 verdicts, six carries in, sha256 `4c62a07c08afe20aa309a4871006861334d6623f74932d87474f34ec2d3ff729` |
| Behaviour check | `scripts/db/behaviour-users-tenants-roles-readonly.sql`, READ ONLY, 14 arms and a SUMMARY row, `-v actor_id` required, sha256 `79c135fca96216baaeef03ea825c4a202b0eb6b4eac82329f61c8721160c5852`. Run TWICE in stage 3, as two actors stage 1 chooses READ ONLY |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `b8c62fd5`, all pinned in every block that runs them |
| What it changes | DROPS the three `FOR ALL` policies 0001 made (`tenants_tenant_isolation`, `roles_tenant_isolation`, `users_tenant_isolation`) and CREATES eight: a tenant SELECT on each table with the old expression verbatim, `tenants_manager_update`, `users_manager_insert`, `users_manager_update`, `users_self_update`, `users_manager_delete`. Adds ONE SECURITY INVOKER function, `public.users_self_service_columns()`, EXECUTE revoked from PUBLIC, `anon`, `authenticated`, `service_role` and `patient`, and its BEFORE UPDATE trigger on `users` |
| What it never touches | every other policy (the two token-hook reads `auth_admin_read_users` and `auth_admin_read_roles` included), every table grant, every existing function (the token hook's body included) and the SECURITY DEFINER count. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/migration-apply-0094.sha256` and every stage
checks it with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits
on the same head as the document, so a main that moved to a new document and a new
sidecar together would pass that check: GREEN's dispatch names this document's sha256,
and the HEAD CHECK halts on any moved main before the apply.

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
  clean, fetches, resolves `origin/main`, checks that sha out detached, verifies the
  sidecar, the promotion, the journal and every pin, and only then records the sha in
  `/tmp/0094-main.sha` and prints `running from origin/main <sha>`.
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

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0094-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0094 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0094-main.sha
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
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0094}" ] || { echo "STOP: 0094 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-users-tenants-roles.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-users-tenants-roles-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }

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
  the same sha twice** (the block halts otherwise), then `docs/migration-apply-0094.md: OK`
  and the target guard;
- **the pre-check prints `21` OK verdicts and no FAIL;**
- **`behaviour actors: narrowing <uuid> (reception or therapist), manager <uuid> (admin or owner)`;**
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
applied,** the HEAD CHECK's and the missing subject's included, and the previous
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

**EXPECT:** `checking from the recorded sha <sha>` and whether main moved; the carry
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

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, the two actors
stage 1 recorded, and for EACH run: its `ACTOR` line naming that actor and role, 14
verdicts, a SUMMARY row, no FAIL, and VACUOUS only on arms whose comparand a real
database can legitimately leave empty,** which the block enforces:

- **arms 3 and 10, for both actors,** when the database holds one tenant: there is no
  other tenant's row to hide (3) and no other tenant's role to name (10). With two or
  more tenants both read OK;
- **arm 12 as well, for the manager run only when the manager is an owner** (no
  admin qualified) and the database holds one tenant: an owner may give any of its
  tenant's roles, so no candidate of its own tenant is refused.

**Never VACUOUS: 0, 1, 2, 4, 5, 6, 7, 8, 9, 11, 13,** and 12 for the narrowing actor and
for an admin. Arms 5 and 6 would be vacuous only in a tenant with fewer than two staff
rows, and stage 1's choice of two actors in one tenant rules that out. **Arm 13 is the
arm that tests every write policy's tenant predicate on a one-tenant database;** it has
no vacuous branch.

**The profile is printed, not asserted exactly,** because it moves with the data (the
tenant count). On the rehearsal, with 0094 applied: **`12 OK / 2 VACUOUS / 0 FAIL`** (3
and 10) for reception, therapist and admin actors with one tenant, **`14 OK / 0 VACUOUS / 0 FAIL`**
with two, and **`11 OK / 3 VACUOUS / 0 FAIL`** (3, 10 and 12) for an owner with one.
Only a pass writes `/tmp/0094-stage3.ok`, the recorded sha, just before the last line;
the block removes it before anything else, so a stage 3 that stops leaves no mark, and
the closing read runs only on it.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line
`0094 VERIFIED AT THE RLS LAYER: ...`. Before the read runs it checks by machine that
the worktree is on the sha stage 0 recorded, that stage 1 applied, that stage 2 and the
last paste of stage 3 passed on that sha after the apply, and that the reader is the
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

**EXPECT:** the reader's sha256 line, then the read printed IN FULL through `tee`:
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
| 10 | no staff row in any tenant names a role of another tenant | VACUOUS with one tenant, else OK | the same |
| 11 | login still resolves: the token hook returns the actor's tenant and role | OK | OK |
| 12 | `users` UPDATE WITH CHECK admits exactly the rule's candidate new rows | OK | OK for an admin; VACUOUS for an owner with one tenant |
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
result in PR #1459 under that sha256. If a finding changes one byte of a block, this
document, its sidecar and GREEN's dispatch move together, and the dispatch's document
sha256 is refilled.

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
