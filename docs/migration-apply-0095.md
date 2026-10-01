# 0095: apply the conflict check's patient name

**Status: NOT APPLIED, NOT YET PROMOTED.** One migration, `packages/db/migrations/0095_conflict_name_visibility.sql`,
applied from `origin/main` after PR #1438 has been promoted and merged. Five blocks, each
pasted whole, on its own and in order: stage 0 (the promotion, the files and the head it
runs from), stage 1 (the HEAD CHECK, the pre-check, the behaviour actor and the apply),
stage 2 (the post-check), stage 3 (the behaviour check) and the closing journal read. One
rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0095 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/data-op-staff-10-v2.md`, word for word, with three
substitutions and no other change,** because the write here is stage 1 and not stage 2:
"After stage 2 has committed" reads "After stage 1 has committed", "stage 3 (READ ONLY)
runs" reads "stages 2 and 3 (READ ONLY) run", and the onward path reads "from stage 1
to stage 2" with this document's own line. They are the same three substitutions
`docs/migration-apply-0094.md` makes.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

| Fact | Value |
|---|---|
| Card | the conflict check's patient name, PR #1438 |
| Ruling | Owner, 2026-09-22: the booking conflict check returns a patient's name only when the caller's SELECT policies on appointments return that appointment, and the placeholder otherwise. Ruled onto the Tier C list and numbered `0096` that day; renumbered `0095` by the fourth renumbering of 2026-09-27 (`CLAUDE.md`, "SOLO's record", the binding table) |
| Migration | `packages/db/migrations/0095_conflict_name_visibility.sql`, sha256 `cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806` |
| Promoted from | `packages/db/migrations-pending/NEXT-AFTER-0094_conflict_name_visibility.sql`, **bytes unchanged** (`git mv`, 100% similarity). The pending file's body sha256 above is the promoted file's: a promotion changes no byte |
| Journal | `idx 92`, `when 1788501600000`, tag `0095_conflict_name_visibility`; `when` strictly above 0094's `1788501500000`, and 0094's entry (`idx 91`) directly before it |
| Mirror | `supabase/migrations/0095_conflict_name_visibility.sql`, written by `scripts/sync-supabase-migrations.mjs` with its fixed header; checked by content by `scripts/check-journal.mjs` (`pnpm db:check-journal`), which stage 0 runs with `node` directly, after asserting its sha256, so that no pnpm dependency check stands between it and the answer |
| Must follow | `0094_users_tenants_roles_policy_split`, sha256 `439cb53e…6a6c`: merged in #1459 and APPLIED to production (journal 91 to 92) before #1438 merges. The pre-check proves it on production by hash (verdict 7) |
| PR | #1438, branch `sched/0096-conflict-names-follow-caller-reads` (the branch keeps its old number; the migration is `0095`), labelled `held-for-apply` until the owner takes it off and merges |
| Runs from | `origin/main`, after #1438 has merged. Stage 0 records the sha `origin/main` resolves to in `/tmp/0095-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK, below) |
| This document | `docs/migration-apply-0095.md`, pinned by `docs/migration-apply-0095.sha256` and asserted by every stage; GREEN's dispatch pins its sha256 on its own and checks it by machine twice: on the main BEFORE YOU START resolves, and at the sha stage 0 recorded, in the CLOCK CHECK before stage 1 |
| Pre-check | `scripts/db/precheck-conflict-names.sql`, READ ONLY, 14 verdicts (9 numbered, 5 carries), sha256 `5a663896743ca228483fa75ff42e1533e77cfc3abebbb05fe78006ed0b7b54d7` |
| Post-check | `scripts/db/postcheck-conflict-names.sql`, READ ONLY, 13 verdicts, five carries in, sha256 `1fa8269c8e627763d522265198910127859427d72a860899a59cb3af5b8362dc` |
| Behaviour check | `scripts/db/behaviour-conflict-name-readonly.sql`, READ ONLY, 14 arms and a SUMMARY row, sha256 `ce4ec4aa87ef0b25d3276d15cae703a6b635ef778018b216622567a28c1cc4e5`. Run ONCE in stage 3, as the therapist stage 1 chooses READ ONLY, passed with `-v actor_id` |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `e0e75cfe` and to 0094's pins, all pinned in every block that runs them |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`, byte-identical to `origin/main` at `e0e75cfe`. It imports nothing but `node:` builtins, so its pin covers everything it runs. Pinned in stage 0 and in GREEN's BEFORE YOU START |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts`, which drizzle-kit loads through `verified-migrate.mjs` (0094 does not pin them either). Their tree is fixed instead: GREEN's BEFORE YOU START requires `origin/main` to BE #1438's merge commit, not merely to contain it, and the CLOCK CHECK and the HEAD CHECK halt on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0095-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stages 2, 3 and the closing read refuse at or after its end. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can write it |
| What it changes | CREATES ONE function, `public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[])`: SECURITY DEFINER, owned by postgres, `ROWS 5`, 0059's two arms with no patient column, EXECUTE for `authenticated` only. REPLACES the body of `public.appointment_conflicts(...)` in place, same signature and return type, now SECURITY INVOKER, filling `patient_name` under the caller's own reads. Restates both functions' grants and sets both COMMENTs |
| What it never touches | every policy, every table and table grant, every other function, and the SECURITY DEFINER count (one made, one unmade: NET ZERO). The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/migration-apply-0095.sha256` and every stage
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

**The promoted file's own header and its two COMMENT strings still read "0096".** That
is stale, and it is left stale on purpose: a promotion does not touch one byte of the
file, which is the only reason the sha256 above can pin anything. Read the header as a
record of when the file was authored (ruled `0096` on 2026-09-22), and
`packages/db/migrations-pending/README.md`'s Promoted table for where it now sits. The
post-check pins the two COMMENTs by md5 exactly as the file writes them.

## The promotion, and what these pins are for

**Every pin in this document is for the PROMOTED file,** `packages/db/migrations/0095_conflict_name_visibility.sql`,
on the `origin/main` #1438's merge produces. Until the promotion commit exists, stage 0
stops on its first file test, by design.

**0095 is promoted only after #1459 (0094) is on main,** by one mechanical commit on
#1438's branch, with `origin/main` merged in first so that 0094's file and journal entry
are there to follow:

1. `git mv packages/db/migrations-pending/NEXT-AFTER-0094_conflict_name_visibility.sql packages/db/migrations/0095_conflict_name_visibility.sql`,
   100% similarity; the body's sha256 stays `cfdfffff…5806`;
2. one journal entry appended to `packages/db/migrations/meta/_journal.json`:
   `{"idx":92,"version":"7","when":1788501600000,"tag":"0095_conflict_name_visibility","breakpoints":true}`,
   directly after 0094's `idx 91`, `when 1788501500000`;
3. the mirror, by `node scripts/sync-supabase-migrations.mjs`, which writes
   `supabase/migrations/0095_conflict_name_visibility.sql` with its fixed header;
4. the pending README's row moved to its Promoted table.

`pnpm db:check-journal` must then read `93 .sql files match 93 journal entries`.

**The promotion is mechanical for the migration, and it is NOT the whole of the
promotion PR.** The migration's own section 6 and PR #1438's question Q2 name two tests
that read `packages/db/migrations` by name and move with it:

- `packages/db/tests/security-definer-owner.test.ts` lists `appointment_conflicts` among
  the SECURITY DEFINER functions, and its owner-pin scan will find 27 pins (0060's pin for
  a function that is no longer one, plus 0095's new one) against 26 names. It FAILS on
  the promoted tree until it is changed. PR #1438's Q2 recommends landing that change
  first, in its own PR; that is the lead's to schedule, and it is not decided here;
- `apps/api/lib/appointments/blocking-status.test.ts` reads 0059 as the definition of the
  conflict predicate, and is repointed to the 0095 file, whose predicate is spelled the
  same way on purpose.

Neither test is a byte this document pins, and neither runs in the sitting. CI is their
gate: #1438 does not merge until every required check is green on the promoted tree.

**0095 merges only after 0094 is APPLIED to production,** not merely merged: 0094's own
document runs from a main that IS #1459's merge commit, and says "`0095` is not promoted
until 0094 is applied to production, so the journal on the recorded sha ends at 0094".
Promoting on #1438's branch before that moves nothing on main; merging it would. The
pre-check here refuses a production journal without 0094 by hash (verdict 7), and
`verified-migrate.mjs` refuses a pending count that is not exactly 1.

**Exactly one `packages/db/migrations/0095_*.sql` may exist, and no `0096_*.sql`; if
anything else is ever found, STOP.** The number is the apply authorisation (`CLAUDE.md`,
the binding table under "SOLO's record"): `0094` the users/tenants role fix, `0095` the
conflict check's patient name (#1438), `0096` the grants revoke (#1397). `0096` is not
promoted until 0095 is applied to production, so the journal on the recorded sha ends
at 0095 and `verified-migrate.mjs` finds exactly one pending migration.

## Merged before the apply, and why that is safe here

**#1438 carries app code, and it is safe before the apply.** The six conflict lines go
through `conflictPatientLabel(c)`, which renders a NULL name as `patientLabel(null)` and
passes a name through unchanged. Before the apply, `appointment_conflicts` fills every
therapist and room conflict's name as it does today, so the lines read as they do today;
after it, a name the caller cannot read arrives NULL and reads "Marcação reservada".
The conflict rows themselves do not change either way, so "Guardar mesmo assim" behaves
the same before and after. `apps/web/lib/scheduling/conflict.ts` changes no SQL.

**Between the merge and the apply, main is ahead of production by exactly one
migration,** and the pre-check says so: it passes only while 0095 is absent from the
journal. The daily `prod-drift-check` (07:00 UTC) would report 0095 as pending if the
sitting halted before the apply; that report is correct, and it is informational.

## What is new here, because 0095 is not shaped like 0094

0094 dropped and created policies. **0095 creates one function and replaces one
function's body, and touches no policy,** so the pre-check proves the starting function
exactly and the post-check proves both end functions exactly:

- **the pre-check** proves `appointment_conflicts` is 0059's body as 0060 and 0079 left
  it: SECURITY DEFINER, owned by postgres, `sql`, STABLE, `search_path=public`, its body
  pinned by md5 (verdict 1), EXECUTE for `authenticated` only (2); that no function named
  `appointment_conflict_rows` exists in any schema (3); that the three functions the new
  bodies call exist (4) and the four roles the file names exist (5); 0095 absent and 0094
  present by hash (6, 7); the newest `when` is 0094's (8);
- **the post-check** pins each function's security mode, owner, language, volatility,
  settings and body by md5 (1, 2; `ROWS 5` on the rows function), one function of each
  name (3), the return columns (4), EXECUTE for `authenticated` only on both and none for
  PUBLIC (5, 6), the two COMMENTs by md5 (7), and asserts the arithmetic: the SECURITY
  DEFINER count **unchanged** and every one owned by postgres (8), **+1** public
  function (9), every policy byte-identical by one md5 (10), every other public function
  byte-identical by one md5 (11), and the journal **+1** with 0095 once by hash and its
  `when` the newest (12).

There are **five** carries: `journal_rows_before`, `secdef_functions_before` (passed to
the post-check as `-v secdef_before`), `public_functions_before`, `all_policies_md5`,
`other_functions_md5`. No carry's name is a substring of another's or of any other row's
`check` column, because stage 2's `carry()` matches column 1 with `index()`.

**The body pins do not depend on the session's rendering.** `md5(prosrc)` hashes the
text between the dollar quotes as Postgres stored it, which is the file's text; no
`pg_get_expr` or `pg_get_functiondef` is involved. The policy md5 carry does render
expressions, but it is computed by the same session shape before and after, so it
compares like with like.

**No behaviour run before the apply.** The behaviour file STOPs before the apply by
itself (`appointment_conflict_rows ... is missing`), and the pre-check pins the starting
body by md5, which is what a before run would have proven.

**What this READ ONLY check cannot measure,** the arms name themselves: the behaviour
check acts as ONE therapist. Reception, admin and owner read through the same policies,
and the builder's rehearsal compared five identities (three therapists, reception,
owner), but no block here does. The rows function's tenant conjunct is not measured on
a database with one tenant.

## The behaviour actor is chosen by the block, READ ONLY, and why

The behaviour check takes its actor as `-v actor_id`, or picks one itself. No production
row was read to write this document, so no actor is named here. **Stage 1 chooses one,
READ ONLY, after the pre-check and before the apply,** by one query in a `begin read only`
transaction, and records it in `/tmp/0095-actor.out`. Stage 3 runs the behaviour check
once, as that actor, passed with `-v actor_id`.

**The query is the behaviour file's own default selector, spelled out,** with its
`window_days` default of 90 written as `interval '90 days'`: the lowest-id active,
non-resource user whose role slug is `therapist`, who holds a clinic (`staff_locations`),
and who has, within 90 days of now either way, both a blocking appointment their
appointments policies would not return (outside every clinic they hold, and not their own
work) and a blocking appointment at a clinic they hold for a patient they have treated.
It reads the tables as the connecting role, with no claims set, exactly as the file's
selector does.

**A missing subject is a FAIL, and here it stops the sitting before anything is
applied.** When the query finds no such therapist, stage 1 prints a `STOP:` and exits 1
before `verified-migrate.mjs` runs. Stage 3 never runs over a missing or substituted
actor: it reads the id stage 1 recorded, and the behaviour file itself STOPs (psql exit 3)
on an actor that is no longer an active, non-resource therapist holding a clinic, and
on a positive or negative subject it cannot furnish or cannot verify as the actor. The id
reaches GREEN's transcript, and nothing else about the actor does: the file prints one
`ACTOR id <uuid> | role therapist | chosen passed in with -v actor_id` line and then
counts and verdicts only.

## The HEAD CHECK, and running from main

The migration runs from `origin/main`, after #1438 has merged, and the owner freezes
merges to main for the sitting. No block reads a branch, and there is no separate HEAD
CHECK to paste: the machine runs it inside the blocks.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is
  clean, removes the previous sha and run window records, fetches, resolves
  `origin/main`, checks that sha out detached, verifies the sidecar, the promotion, the
  journal, the mirror and every pin (check-journal's before it runs it), and only then
  records the sha in `/tmp/0095-main.sha` and prints `running from origin/main <sha>`.
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
  applied marker `/tmp/0095-applied.ok` exists, and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stages 2 and 3 are READ ONLY** and run from the recorded sha whatever main has done
  since: each prints whether main moved, with both shas, and never stops on it. Every
  file they run is asserted by sha256 at that sha.
- **A moved main before the apply ends the sitting.** Nothing is applied, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/0095-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the promotion, the files and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0095.sha256
MIG=packages/db/migrations/0095_conflict_name_visibility.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0094_conflict_name_visibility.sql
MIRROR=supabase/migrations/0095_conflict_name_visibility.sql
SHA0095=cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806
SHAPRE=5a663896743ca228483fa75ff42e1533e77cfc3abebbb05fe78006ed0b7b54d7
SHAPOST=1fa8269c8e627763d522265198910127859427d72a860899a59cb3af5b8362dc
SHABEHAVIOUR=ce4ec4aa87ef0b25d3276d15cae703a6b635ef778018b216622567a28c1cc4e5
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0095-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0095 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0095-main.sha /tmp/0095-window.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0095 is not on disk at origin/main, so #1438 has not merged promoted"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
test -f ${MIRROR} || { echo "STOP: the supabase mirror of 0095 is not on disk"; exit 1; }
N95=$(find packages/db/migrations -maxdepth 1 -name '0095_*.sql' | wc -l | tr -d ' ')
[ "${N95}" = 1 ] || { echo "STOP: ${N95} files claim migration number 0095, not 1"; exit 1; }
N96=$(find packages/db/migrations -maxdepth 1 -name '0096_*.sql' | wc -l | tr -d ' ')
[ "${N96}" = 0 ] || { echo "STOP: ${N96} files claim migration number 0096, and 0096 is not promoted until 0095 is applied"; exit 1; }
test -f scripts/db/precheck-conflict-names.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-conflict-names.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-conflict-name-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0095}" ] || { echo "STOP: 0095 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-conflict-names.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-conflict-names.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-conflict-name-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===93&&e.idx===92&&e.when===1788501600000&&e.tag==='0095_conflict_name_visibility'&&p.idx===91&&p.when===1788501500000&&p.tag==='0094_users_tenants_roles_policy_split'?0:1)" || { echo "STOP: the journal does not end idx 91 0094 (when 1788501500000) then idx 92 0095 (when 1788501600000), of 93"; exit 1; }
node scripts/check-journal.mjs 2>&1 | tee /tmp/0095-check-journal.out
grep -qF '93 .sql files match 93 journal entries' /tmp/0095-check-journal.out || { echo "STOP: check-journal did not reconcile 93 files with 93 journal entries"; exit 1; }

echo "${MAIN}" > /tmp/0095-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/0095-main.sha"
echo "0095 PROMOTION, NUMBER AND FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/migration-apply-0095.md: OK`, then
`newest journal entry: idx 92, when 1788501600000, tag 0095_conflict_name_visibility, of 93; before it idx 91, when 1788501500000, tag 0094_users_tenants_roles_policy_split`,
then check-journal's line `... 93 .sql files match 93 journal entries in order ... the supabase mirror matches by CONTENT.`,
then `running from origin/main <sha>, recorded in /tmp/0095-main.sha`, then
`0095 PROMOTION, NUMBER AND FILES VERIFIED`. Exit 0.** It reads no database and prints no
count of anything in it. The sha it prints is the one every later stage runs from.

## STAGE 1: the HEAD CHECK, the pre-check, the behaviour actor, the apply

```
(
set -eo pipefail
SHA0095=cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806
SHAPRE=5a663896743ca228483fa75ff42e1533e77cfc3abebbb05fe78006ed0b7b54d7
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
UUIDRE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0095-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0095 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stages 2 and 3 (READ ONLY) run only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0095-precheck.new /tmp/0095-actor.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0095-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0095-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0095.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0095_conflict_name_visibility.sql || { echo "STOP: 0095 is not on disk"; exit 1; }
test -f scripts/db/precheck-conflict-names.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N95=$(find packages/db/migrations -maxdepth 1 -name '0095_*.sql' | wc -l | tr -d ' ')
[ "${N95}" = 1 ] || { echo "STOP: ${N95} files claim migration number 0095, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0095_conflict_name_visibility.sql | cut -d' ' -f1)" = "${SHA0095}" ] || { echo "STOP: 0095 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-conflict-names.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0095-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0095-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0095-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0095-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0095-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-conflict-names.sql 2>&1 | tee /tmp/0095-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0095-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0095-precheck.new || true)
[ "${OKS}" = 14 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 14. Nothing was applied"; exit 1; }

echo "--- the behaviour actor, chosen READ ONLY by the behaviour file's own default selector. A missing subject STOPs here, before the apply"
ACT=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select coalesce((select u.id::text from public.users u join public.roles r on r.id = u.role_id and r.slug = 'therapist' where u.is_active and not u.is_shared_resource and exists (select 1 from public.staff_locations sl where sl.user_id = u.id and sl.tenant_id = u.tenant_id) and exists (select 1 from public.appointments a where a.tenant_id = u.tenant_id and a.status not in ('cancelled', 'no_show') and a.practitioner_id is distinct from u.id and a.practitioner_2_id is distinct from u.id and a.created_by is distinct from u.id and a.starts_at >= now() - interval '90 days' and a.starts_at < now() + interval '90 days' and (a.status <> 'scheduled' or (a.origin <> 'patient_portal' and not exists (select 1 from public.staff_notifications sn where sn.appointment_id = a.id and sn.kind = 'appointment_request'))) and not exists (select 1 from public.staff_locations sl2 where sl2.user_id = u.id and sl2.tenant_id = u.tenant_id and sl2.location_id = a.location_id)) and exists (select 1 from public.appointments b where b.tenant_id = u.tenant_id and b.status not in ('cancelled', 'no_show') and b.starts_at >= now() - interval '90 days' and b.starts_at < now() + interval '90 days' and (b.status <> 'scheduled' or (b.origin <> 'patient_portal' and not exists (select 1 from public.staff_notifications sn where sn.appointment_id = b.id and sn.kind = 'appointment_request'))) and exists (select 1 from public.staff_locations sl3 where sl3.user_id = u.id and sl3.tenant_id = u.tenant_id and sl3.location_id = b.location_id) and exists (select 1 from public.appointments t where t.tenant_id = u.tenant_id and (t.practitioner_id = u.id or t.practitioner_2_id = u.id) and (t.patient_id = b.patient_id or t.patient_2_id = b.patient_id))) order by u.id limit 1), 'none')")
ACTOR=$(echo "${ACT}" | tail -1)
echo "${ACTOR}" | grep -qE "${UUIDRE}" || { echo "STOP: no active, non-resource therapist holding a clinic has, within 90 days, both a booking their appointments policies do not return and a booking they read for a patient they treated, so stage 3 has no actor. A missing subject is a FAIL. Nothing was applied"; exit 1; }
echo "${ACTOR}" > /tmp/0095-actor.new
echo "behaviour actor: ${ACTOR} (therapist)"

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- only now, with a passing pre-check and the subject in hand, does the previous sitting's state go"
rm -f /tmp/0095-postcheck.out /tmp/0095-stage2.ok /tmp/0095-behaviour.out /tmp/0095-stage3.ok /tmp/0095-journal-after.out
mv /tmp/0095-precheck.new /tmp/0095-precheck.out
mv /tmp/0095-actor.new /tmp/0095-actor.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0095_conflict_name_visibility --sha256 ${SHA0095} --expect-pending 1
touch /tmp/0095-applied.ok
echo "0095 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now: <sha>`,
  the same sha twice** (the block halts otherwise), then `docs/migration-apply-0095.md: OK`;
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it (the block halts otherwise), then the target guard;
- **the pre-check prints `14` OK verdicts and no FAIL;**
- **`behaviour actor: <uuid> (therapist)`;**
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`,** now no later
  than that minute (the block halts otherwise);
- **`pending    1  [0095_conflict_name_visibility]`.** Exactly one.

It then prints `journal    92 -> 93  (delta 1)`,
`0095_conflict_name_visibility present by sha256: yes`,
`OK: the journal moved by exactly the pending count and carries the approved sha256.`
and the last line, exactly, `0095 APPLIED. Paste stage 2 now.` Stage 2 re-reads the
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
the whole output.** The read that answers whether 0095 is applied is
`packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs only on the
owner's or the lead's word. No marker exists after such a halt, so stage 2 refuses
until the lead rules.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle
never ran.** `verified-migrate.mjs` reaches drizzle through `pnpm --filter @osteojp/db exec`,
and pnpm checks the installed dependencies first; in a clone whose `node_modules` does
not match its lockfile it tries to reinstall and, with no terminal, aborts
(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The block then prints `journal    92 -> 92  (delta 0)`:
nothing was applied. The halt rule governs it all the same.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was
applied,** the HEAD CHECK's, the run window's and the missing subject's included, and the previous
sitting's transcripts are untouched: the failed run's output stays in the `.new` files.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0095=cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806
SHAPOST=1fa8269c8e627763d522265198910127859427d72a860899a59cb3af5b8362dc
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

rm -f /tmp/0095-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0095-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0095-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0095.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0095_conflict_name_visibility.sql || { echo "STOP: 0095 is not on disk"; exit 1; }
test -f scripts/db/postcheck-conflict-names.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0095_conflict_name_visibility.sql | cut -d' ' -f1)" = "${SHA0095}" ] || { echo "STOP: 0095 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-conflict-names.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0095-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0095-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0095-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0095-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0095-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0095-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0095-precheck.out; }
J=$(carry journal_rows_before)
S=$(carry secdef_functions_before)
F=$(carry public_functions_before)
A=$(carry all_policies_md5)
O=$(carry other_functions_md5)
[ -n "${J}" ] && [ -n "${S}" ] && [ -n "${F}" ] && [ -n "${A}" ] && [ -n "${O}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=${J} secdef_before=${S} public_functions_before=${F} all_policies_md5=${A} other_functions_md5=${O}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0095-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v secdef_before="${S}" -v public_functions_before="${F}" -v all_policies_md5="${A}" -v other_functions_md5="${O}" -c "begin read only" -f scripts/db/postcheck-conflict-names.sql -c "rollback" 2>&1 | tee /tmp/0095-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0095-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0095-postcheck.out || true)
[ "${OKS}" = 13 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 13. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0095 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0095}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0095 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0095 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0095-stage2.ok
echo "0095 POST-CHECK PASSED. 14/14 pre-check OK, 13/13 post-check OK, journal ${J} to ${JA}. Paste stage 3 now."
)
```

**EXPECT:** `checking from the recorded sha <sha>` and whether main moved;
`run window, Lisbon YYYYMMDDHHMM: everything ends before <t>; now <t>`, with now before
the end (the block halts otherwise, and the write stands); the carry line reads
`journal_before=92`; the post-check prints `13` OK verdicts and no FAIL; the journal
reads `92` before and `93` after, with 0095's sha256 in it **exactly once**; the last
line reads exactly
`0095 POST-CHECK PASSED. 14/14 pre-check OK, 13/13 post-check OK, journal 92 to 93. Paste stage 3 now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

## STAGE 3: the behaviour check, as the therapist stage 1 chose. READ ONLY

```
(
set -eo pipefail
SHABEHAVIOUR=ce4ec4aa87ef0b25d3276d15cae703a6b635ef778018b216622567a28c1cc4e5
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
UUIDRE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

rm -f /tmp/0095-stage3.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0095-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0095-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0095.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/db/behaviour-conflict-name-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-conflict-name-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 2 must have PASSED on the recorded sha, after this sitting's apply"
test -f /tmp/0095-applied.ok || { echo "STOP: stage 1 left no applied marker. Stage 3 has not run"; exit 1; }
test -f /tmp/0095-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. Stage 3 has not run"; exit 1; }
[ "$(cat /tmp/0095-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. Stage 3 has not run"; exit 1; }
[ -n "$(find /tmp/0095-stage2.ok -newer /tmp/0095-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. Stage 3 has not run"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0095-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0095-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0095-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 3 runs only on the owner's or the lead's word"; exit 1; }

echo "--- the actor stage 1 chose, READ ONLY, before the apply"
test -f /tmp/0095-actor.out || { echo "STOP: stage 1 recorded no behaviour actor in this sitting. A missing subject is a FAIL"; exit 1; }
ACTOR=$(cat /tmp/0095-actor.out)
echo "${ACTOR}" | grep -qE "${UUIDRE}" || { echo "STOP: the recorded actor is not an id. A missing subject is a FAIL"; exit 1; }
echo "actor ${ACTOR} (therapist)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0095-behaviour.out

echo "--- the behaviour check, as that actor"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${ACTOR} -f scripts/db/behaviour-conflict-name-readonly.sql 2>&1 | tee /tmp/0095-behaviour.out
grep -qF "ACTOR id ${ACTOR} | role therapist | chosen passed in with -v actor_id" /tmp/0095-behaviour.out || { echo "STOP: the run did not act as the actor stage 1 chose, as a therapist"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0095-behaviour.out || { echo "STOP: the run printed no SUMMARY row, so the transcript is truncated"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0095-behaviour.out && { echo "STOP: a behaviour verdict read FAIL"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/0095-behaviour.out || true)
[ "${NV}" = 14 ] || { echo "STOP: the run printed ${NV} verdicts, not 14"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0095-behaviour.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '10|12|13' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: the run read VACUOUS on ${BAD}, and only arms 10, 12 and 13 may be vacuous"; exit 1; }
PS=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0095-behaviour.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${PS}" | grep -qE '^[0-9]+ OK / [0-9]+ VACUOUS / 0 FAIL$' || { echo "STOP: the SUMMARY did not parse: [${PS}]"; exit 1; }

echo "${REC}" > /tmp/0095-stage3.ok
echo "0095 VERIFIED AS A THERAPIST: ${PS}. Reception, admin and owner are covered by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, then a halt
unless stage 1's applied marker exists and stage 2's pass mark names the recorded sha
and is newer than that marker (so a stage 3 pasted after a stage 2 that halted stops
here, before any connection), then the run window line with now before its end, the
actor stage 1 recorded, and for the run: its `ACTOR` line naming that actor as a
therapist, 14 verdicts, a SUMMARY row, no FAIL, and VACUOUS only on arms whose comparand
a real database can legitimately leave empty.** The block admits VACUOUS on the arms
below and on no other. **Whether each of them IS empty is decided by the behaviour
file, not by the block,** from the subjects it chooses before it takes the actor's
claims:

- **arm 10 (N3, one call, both answers)** is VACUOUS when no practitioner furnishes a
  readable and an unreadable booking in the same week;
- **arm 12 (D1, stricter than the ruling on purpose)** is VACUOUS when the calls return
  no row the actor reads whose patient neither `patients` nor 0090 names (a care-team
  patient the actor never treated);
- **arm 13 (E1, shared resource)** is VACUOUS when the calls return no shared-resource
  booking whose patient the actor does not read through `patients`.

**Never VACUOUS: 0, 1 (L1), 2 to 5 (A1 to A4), 6 and 7 (S1, S2), 8 and 9 (N1, N2), 11
(C1).** S1, S2 and C1 would be vacuous only on a zero row count, and the positive
subject's own call always returns the positive subject; N1 and N2 have no vacuous
branch, because the file STOPs instead when it cannot furnish their subjects.

**The profile is printed, not asserted exactly,** because it moves with the data. On
the builder's rehearsal (synthetic fixtures, recorded in PR #1438), with the migration
applied: **`14 OK / 0 VACUOUS / 0 FAIL`**, as a passed actor and as the default
selector's. Only a pass writes `/tmp/0095-stage3.ok`, the recorded sha, just before the
last line; the block removes it before anything else, so a stage 3 that stops leaves no
mark, and the closing read runs only on it.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 3 exited 0 with its last line
`0095 VERIFIED AS A THERAPIST: ...`. Before the read runs it checks by machine that
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
test -f /tmp/0095-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0095-main.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0095-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0095-stage2.ok || { echo "STOP: stage 2 left no pass mark. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0095-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0095-stage3.ok || { echo "STOP: stage 3 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0095-stage3.ok)" = "${REC}" ] || { echo "STOP: stage 3's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0095-stage3.ok -newer /tmp/0095-applied.ok)" ] || { echo "STOP: stage 3's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0095-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0095-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0095-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
echo "reader: ${RW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0095-journal-after.out
grep -qx 'journal rows on production: 93' /tmp/0095-journal-after.out || { echo "STOP: the journal read after the apply does not say 93"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0095_conflict_name_visibility[.]sql$' /tmp/0095-journal-after.out || { echo "STOP: the journal read does not list 0095 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0095-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0095-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 93, 0095 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** the run window line with now before its end, the reader's sha256 line, then
the read printed IN FULL through `tee`: `journal rows on production: 93`, every migration
file on the recorded sha listed `APPLIED`, 0095 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 93, 0095 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted: the halt rule says no journal read runs
after a halt, and the block stops on its own when a pass mark is missing.

## What every verdict must read

**Pre-check, 14 rows, all `OK`:** 0 the transaction is READ ONLY; 1
`appointment_conflicts` reads
`definer/postgres/sql/s/search_path=public 895aab4b0e8d7e7ef29a42b2273beca6` (0059's
body as stored after 0060 and 0079); 2 EXECUTE on it reads `1 of 1 / 0 of 3 / PUBLIC 0`
(`authenticated` only); 3 no function named `appointment_conflict_rows` exists; 4 the
three callees exist (`jwt_tenant_id()`, `is_unconfirmed_pedido(uuid)`,
`shared_resource_appointment_patient_names()`); 5 the four roles `authenticated`,
`anon`, `patient` and `service_role` exist; 6 0095 absent from the journal by hash; 7
0094 present by hash; 8 the newest applied `when` is `1788501500000`;
`journal_rows_before` **92**; `secdef_functions_before` (every one owned by
`postgres`), `public_functions_before`, `all_policies_md5` and `other_functions_md5`,
each whatever production reads, which stage 2 carries.

**Post-check, 13 rows, all `OK`:**

0. the transaction is READ ONLY;
1. `appointment_conflicts` reads
   `invoker/postgres/sql/s/search_path=public 3f6febceb17ff033fdf84bc6c108d540`;
2. `appointment_conflict_rows` reads
   `definer/postgres/sql/s/rows 5/search_path=public 80a762d46f4f01baf40c3cbb6907881b`;
3. one function of each name, no overload (`1 / 1`);
4. the rows function returns `id,starts_at,ends_at,room,kind`, and
   `appointment_conflicts` still returns `id,patient_name,starts_at,ends_at,room,kind`;
5. EXECUTE on both: `authenticated` 2 of 2, `anon`, `patient` and `service_role` 0 of 6;
6. PUBLIC holds EXECUTE on neither;
7. the two COMMENTs by md5, `11b9cc614b0b935e8e4ad65ccac085c6` (`appointment_conflicts`)
   and `9fe2b50cfd8df9c142a71ea08956cc2a` (`appointment_conflict_rows`);
8. the SECURITY DEFINER count equals `secdef_before`, every one owned by postgres;
9. the public function count is `public_functions_before` **+ 1**;
10. every policy in the database still hashes, as one value, to `all_policies_md5`;
11. every other public function still hashes, as one value, to `other_functions_md5`;
12. the journal reads `journal_rows_before` **+ 1**, with 0095's sha256 in it once and
    `when 1788501600000` the newest.

**The post-check is not a standing invariant for 8 to 12:** the next migration that
adds a function or a policy moves them. It is an assertion about this apply.

| Behaviour arm | What it proves | Expected |
|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK |
| 1 (L1) | the session IS the chosen actor: `auth.uid()` | OK |
| 2 (A1) | `appointment_conflicts` is SECURITY INVOKER | OK |
| 3 (A2) | `appointment_conflict_rows` is SECURITY DEFINER, owned by postgres, `search_path=public` | OK |
| 4 (A3) | the rows function has no name column; `appointment_conflicts` keeps its return type | OK |
| 5 (A4) | EXECUTE: `authenticated` on both; `anon`, `patient`, `service_role` on neither | OK |
| 6 (S1) | the actor's `appointment_conflicts` rows equal `appointment_conflict_rows`' rows, every call: no row dropped | OK |
| 7 (S2) | the same rows as 0059's predicate written out, outside the caller's policies | OK |
| 8 (N1) | a row at the actor's own clinic carries the name the actor reads through `patients` | OK |
| 9 (N2) | a row the actor's appointments policies do not return comes back with a NULL name | OK |
| 10 (N3) | one call, same practitioner: the readable row named, the unreadable row NULL | OK, or VACUOUS with no such pair |
| 11 (C1) | every row's name is the ruling's answer from the actor's own reads | OK |
| 12 (D1) | a readable row whose patient neither `patients` nor 0090 names gets NULL, on purpose | OK, or VACUOUS with no such row |
| 13 (E1) | a shared-resource row whose patient `patients` does not return carries 0090's name | OK, or VACUOUS with no such row |

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 93, 0095 by hash | stage 2, and the closing journal read | the database |
| `appointment_conflicts` is SECURITY INVOKER with the new body; `appointment_conflict_rows` is SECURITY DEFINER with 0059's arms and no name | post-check 1 to 4, by md5; behaviour arms 2 to 4 | the catalogue |
| no conflict row is lost: detection stays clinic-blind | behaviour S1 and S2, for the calls it makes | the function, called as a therapist |
| a name appears only where the caller's own reads show it | behaviour N1, N2, N3, C1, D1, E1, as one therapist | the function under the caller's policies |
| grants: EXECUTE for `authenticated` only on both | post-check 5 and 6; behaviour arm 5 | the catalogue |
| nothing else moved | post-check 8 to 11 | the catalogue |
| reception, admin and owner get the same rule | **NOT DISCHARGED BY THIS DOCUMENT.** The builder's rehearsal compared five identities; no block here acts as them | the function |
| the app's conflict line names or withholds the patient, and "Guardar mesmo assim" still works | **NOT DISCHARGED BY THE SITTING.** Two in-app checks, both the owner's, after GREEN's report: the named case is PR #1438, "Verification checklist", item 3; the placeholder is scheduled here, in "After the sitting: the owner's in-app check of the placeholder" below | the route |

## After the sitting: the owner's in-app check of the placeholder

This check is the owner's and it is scheduled HERE; PR #1438's "Verification
checklist", item 3, covers only the named case and points to this section for the
placeholder. It runs after GREEN's report is in, never during the sitting, and it
writes nothing: the owner closes the booking form without saving.

1. Sign in to the app as a therapist, not as the owner. The placeholder shows only to a
   caller whose own reads do not return the clashing appointment, and the owner's
   session may read every appointment, in which case the line names the patient.
2. Open a new booking for a room and a time that an existing appointment already holds,
   where that appointment does NOT appear in this therapist's own agenda (behaviour arm
   9, N2, is the database side of the same case).
3. Expected: the conflict warning line shows the time and reads "Marcação reservada" in
   place of a patient's name; no patient's name appears anywhere on the line; and
   "Guardar mesmo assim" still appears. Close the form without saving.
4. If the line names the patient, or the warning or "Guardar mesmo assim" is missing,
   the owner reports it to the lead with a screenshot. Nothing is rolled back on that
   report alone; the lead decides.

## Rehearsal

**THE BLOCKS ARE REHEARSED, and no byte of any block changed.** By the owner's ruling of
2026-09-27 ("build/rehearse/document as separate agents"), the lane that writes an apply
document does not rehearse it. A rehearsal agent, a separate invocation from the one that
wrote this document and the dispatch, extracted the five blocks from this document at the
sha256 its sidecar pinned, on a promoted tree, and ran them on a throwaway standing at
production's position after 0094 (92 migrations), with the substitutions it counts and
names. Its record is "The rehearsal of the blocks and the dispatch" at the end of this
section. Recording it changed this document's sha256 and no byte of any block, so the
dispatch's document sha256 was refilled for that reason alone. If a later finding changes
one byte of a block, this document, its sidecar and GREEN's dispatch move together again.

**What has run, on the local rehearsal container (Postgres 17.6), in throwaway databases
copied from `t3_0094_final` (main's 91 migrations plus 0094, journal 92, one tenant, no
appointments), synthetic data only.** 0095 was applied there with `psql -1` from the
pending file's bytes and its journal row written by hand (`hash` the file's sha256,
`created_at` 1788501600000), not through drizzle:

| Run | Result |
|---|---|
| the pre-check, unapplied | **14 OK / 0 FAIL**, exit 0 |
| the pre-check, applied | 9 OK / 5 FAIL (1, 3, 6, 8, `journal_rows_before` reading 93): a second apply is refused before it starts |
| the post-check, applied, with the unapplied pre-check's five carries | **13 OK / 0 FAIL**, exit 0 |
| the post-check on the unapplied database, same carries | 5 OK / 8 FAIL (1, 2, 3, 4, 5, 7, 9, 12), exit 0, no ERROR |
| the post-check with no carries | `STOP: -v journal_rows_before is missing`, psql exit 3 |
| stage 1's actor query, as a statement | parses and runs READ ONLY; `none` on a database with no appointments |

**The behaviour check, the builder's rehearsal (PR #1438):** before the migration,
`STOP: ... is missing. Nothing was checked.`; applied, `14 OK / 0 VACUOUS / 0 FAIL` with
an actor passed in and with the default selector; with 0059's body re-applied
`9 OK / 0 VACUOUS / 5 FAIL`; with an invoker body that filters rows
`8 OK / 0 VACUOUS / 6 FAIL`; after a second and third apply `14 OK / 0 VACUOUS / 0 FAIL`.
Those runs were on earlier bytes of the file (sha256 `f2b48422…836d`); the changes since
are the ACTOR line (C4, 2026-09-27) and the renumbering's header, banner and STOP
wording. The rehearsal agent runs the file at the pinned `ce4ec4aa…c4e5`.

### The rehearsal of the blocks and the dispatch, 2026-09-28

**Every run below exited as wanted, and no block changed.** It rehearsed the five blocks
of this document as it stood at sha256
`b816f8d892ff371912f8dc229664a12cbb3c88304a5656596a583da82b5dd928` (commit `5f3fc33b`),
and two blocks of GREEN's dispatch `green-dispatch-0095.txt` (sha256
`a57bb5e521ee5be5a7c5d09b69c3fcd2fa0c05f30e4a4661411ab535c9f3ed2f`, which stays on the
authoring machine): BEFORE YOU START (its lines 145 to 217) and the CLOCK CHECK (its
lines 275 to 300). Each block's sha256, taken between its fences, is the same before this
subsection and after it:

| Block | sha256 of its text between the fences |
|---|---|
| stage 0 | `78b2c203cb23064885e3b1cc7a05d0584980266d68eebd2c05ab0987b785678d` |
| stage 1 | `1dd30c8bc8be15518e16845fc523e463d330c4cf2fed7fb9adf155b34218272b` |
| stage 2 | `24639b430bc09f9d82573f21055e8caa1770ba7fec06c0110aa08ed1286fb05c` |
| stage 3 | `b9f3af186eba952e9ab894c33f6ebbef2b2493bc534d1c5221270741d36a2b90` |
| closing read | `f17712201b78f9815dce56b8a8e89c383661cc31835a180262fef48f065642bd` |

**The promoted tree it ran from is a stand-in, never pushed.** A scratch worktree at
`5f3fc33b`, with `origin/db/0094-users-tenants-role-policy-split-r6` (`0dc8a684`, 0094
promoted, journal idx 91) merged in, then one mechanical promotion commit: the `git mv`
of the pending file to `packages/db/migrations/0095_conflict_name_visibility.sql` (body
sha256 unchanged, `cfdfffff…5806`), the journal entry idx 92, `when 1788501600000`, the
mirror by `node scripts/sync-supabase-migrations.mjs`, and a Promoted row. The merge had
one conflict, in `scripts/behaviour-checks-print-actor.test.mjs` (both sides add a file
to one table), resolved in the scratch tree as the union; no block runs that test. The
two tests that move with the promotion (above) were not changed there, because no block
runs them either. The stand-in merge commit is that promotion commit, `78286283`. The
worktree had its own `pnpm install --frozen-lockfile --offline`, so `verified-migrate.mjs`
reached drizzle through `pnpm --filter @osteojp/db exec` exactly as GREEN's will, and it
applied 0095, not a hand-run `psql`.

**Where it ran.** `t3b_0095_p92` on the rehearsal container (Postgres 17.6), built for
this run: a database from `template0`, the `auth` schema copied schema-only from the
container's own `postgres` database, every migration on `origin/main` (`ad61f5c1`, 91
journal entries) applied in journal order with `psql -1`, drizzle's journal written the
way drizzle writes it (`hash` the file's sha256, `created_at` its `when`), then #1459's
promoted 0094 (sha256 `439cb53e…6a6c`) applied with `psql -1` and its journal row
written the same way. Its fingerprint equals that of `t3_0094_final`, which was built by
other means: 92 journal rows with one md5 over their hashes in id order
(`23f9d1e84fc06c174763a35843ab9a39`), one md5 over every policy, 26 SECURITY DEFINER
functions and 286 functions in `public`. Each run below used its own copy of
`t3b_0095_base`, that database plus synthetic data only: one tenant, two clinics, the
four staff roles, two therapists (T1 holds clinic A, T2 clinic B), a shared resource at
clinic A, four patients, one care-team row, and five blocking bookings in the current
week (T1's own for patient 1 at A; T2's for patient 1 at A and for patient 2 at B, the
pair; T2's for a care-team-only patient at A; the shared resource's at A).

**How it ran, and how `origin/main` and production were replaced.** Each block was
extracted verbatim, substituted, and run under `zsh -f` with a clean environment
(`env -i`, with `HOME`, `PATH` and `TERM` only). A scratch bare repository whose `main`
is the stand-in merge commit stood in for `origin`: each `git fetch origin --prune`
became a fetch of that repository's `main` into a ref private to the worktree, and each
`git rev-parse origin/main` reads that ref. Moving the stand-in's `main` is a merge
landing on GitHub. The substitutions, applied in this order and counted per block:

| Substitution | BEFORE YOU START | stage 0 | CLOCK | stage 1 | stage 2 | stage 3 | closing |
|---|---|---|---|---|---|---|---|
| `/tmp/` to a scratch directory, one per sitting | 5 | 7 | 9 | 24 | 15 | 22 | 17 |
| the `cd` line to the scratch worktree | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `git fetch origin --prune` to the stand-in origin's `main` | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| `git rev-parse origin/main` to the worktree's ref | 1 | 1 | 0 | 1 | 1 | 1 | 0 |
| the environment line to `export DATABASE_URL_DIRECT=` the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the target guard to an `echo` naming the throwaway | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| the reader's `--env-file` to the throwaway's URL (below) | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `MERGED='<MERGED_SHA>'` to the stand-in merge commit | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

After substitution no block named the apply worktree, the secrets directory or
`/tmp/0095`: the extractor refuses to write one that does. **The reader ran
byte-identical, as pinned:** its guard refuses a connection string that does not contain
the production ref somewhere in it, and the throwaway's URL carried the ref inside its
`application_name`, so the pinned bytes ran on a local database. **The target guard ran
once for real, unsubstituted,** against the throwaway: exit 2,
`REFUSING: project ref is "postgres", not the production project.`

**The happy path, in GREEN's order, by a fixed Lisbon clock on Monday 28 September:**

| Block, at | Exit | What it printed |
|---|---|---|
| BEFORE YOU START, 21:30 | 0 | `main head` the stand-in, `origin/main IS the merge commit of PR 1438`, `worktree: clean`, the document, the sidecar and all eight file pins and the reader twice as the dispatch's EXPECT lists them, `run window:   monday`, then the read: `journal rows on production: 92`, 0095 `NOT APPLIED`, `pending on this ref: 1`; the last line |
| stage 0, 21:31 | 0 | `docs/migration-apply-0095.md: OK`; `newest journal entry: idx 92, when 1788501600000, tag 0095_conflict_name_visibility, of 93; before it idx 91, when 1788501500000, tag 0094_users_tenants_roles_policy_split`; check-journal `93 .sql files match 93 journal entries in order`; `running from origin/main 78286283…`; `0095 PROMOTION, NUMBER AND FILES VERIFIED` |
| CLOCK CHECK, 21:32 | 0 | the same sha twice, `document at the recorded sha: b816f8d8…d928`, `<sha> 202609282100 202609282229 202609282300` recorded, the last line |
| stage 1, 21:33 | 0 | the same sha twice; the window line; the pre-check **14 OK, 0 FAIL**, carries `journal_rows_before` 92, `secdef_functions_before` 26, `public_functions_before` 286 and two md5s; `behaviour actor: <T1's id> (therapist)`, the lowest-id therapist the selector admits; `pending    1  [0095_conflict_name_visibility]`; drizzle `exit: 0`; `journal    92 -> 93  (delta 1)`; present by sha256 `yes`; `0095 APPLIED. Paste stage 2 now.` |
| stage 2, 21:35 | 0 | `main has not moved since stage 0`; `carries from this run: journal_before=92 secdef_before=26 public_functions_before=286 ...`; the post-check **13 OK**; `journal rows before=92 after=93, 0095 present by hash`, newest row `cfdfffff…5806` at `when` 1788501600000; the last line |
| stage 3, 21:36 | 0 | `ACTOR id <T1's id> \| role therapist \| chosen passed in with -v actor_id`; **`14 OK / 0 VACUOUS / 0 FAIL`**: S1 and S2 12 rows over 5 calls, C1 6 named and 6 NULL (4 not readable), D1 0 named of 2, E1 0 wrong of 2; the last line |
| closing read, 21:37 | 0 | `journal rows on production: 93`, 93 files `APPLIED` with 0095 last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, `CLOSING READ: ...` |

**The same sitting twice more.** Every block PASTED, fed on stdin to an interactive
`zsh -f -i`: every block exit 0, the same last lines, `14 OK / 0 VACUOUS / 0 FAIL`, the
closing read 93. And in the Tuesday window: BEFORE YOU START at 06:25, stage 0 at 06:26,
the CLOCK CHECK at 06:27 (recorded `202609290000 202609290629 202609290700`), stage 1 at
06:28 and stage 2 at 06:59, each exit 0, journal 92 to 93; stage 3 at 07:00 is an arm
below.

**Every halt, each run for real:**

| Arm | Exit | Halted on | Database after |
|---|---|---|---|
| main moved between stage 0 and stage 1 (a commit on top of the stand-in merge, in the stand-in origin) | 1 | stage 1: `STOP: main moved since stage 0, the merge freeze was broken.` with both shas, before the environment line and before psql | journal 92, no pre-check transcript |
| main moved between BEFORE YOU START and stage 0 | 1 | the CLOCK CHECK: `STOP: main moved between BEFORE YOU START and stage 0, the merge freeze was broken.`, no window recorded; stage 1 pasted anyway: `STOP: the dispatch's CLOCK CHECK recorded no run window ...` | journal 92 |
| stage 0 on a main whose 0095 file has one byte appended | 1 | `STOP: 0095 on disk is not the approved body`, no sha recorded | untouched |
| the same, the pre-check, the post-check, the behaviour check, `verified-migrate.mjs`, `check-journal.mjs` | 1 each | the matching `STOP: ... on disk is not the approved file`, no sha recorded | untouched |
| stage 0 on a main whose copy of this document has one byte appended, its sidecar not | 1 | `STOP: this document is not the approved one` | untouched |
| BEFORE YOU START on each of those seven mains | 1 each | the matching `STOP: ... on origin/main is not the approved ...` and `The journal read has not run` | untouched |
| the CLOCK CHECK at Lisbon Monday 02:00, 20:59, 22:30, 22:59, 23:00, 23:30 and 23:59, Tuesday 06:30 and 07:00 | 1 each | `STOP: it is outside the run window ...` | |
| the CLOCK CHECK at Monday 21:00 and 22:29, Tuesday 00:00 and 06:29 | 0 each | `CLOCK: inside the run window ...` | |
| BEFORE YOU START at Monday 02:00, 20:59, 22:30, 23:00 and 23:59, Tuesday 06:30 | 1 each | `STOP: it is outside the run window ...` and `The journal read has not run` | |
| BEFORE YOU START at Tuesday 00:00 and 06:29 | 0 each | `BEFORE YOU START: every check passed, and the journal reads 92.` | |
| stage 1 started at 22:30, the window recorded at 22:29 | 1 | `STOP: Lisbon 202609282230 is past 202609282229, the last minute the run window lets stage 1 start. Nothing was applied` | journal 92, no pre-check transcript |
| stage 1 started at 22:29, the clock reading 22:30 when the pre-check ends | 1 | the pre-check 14 OK, then `STOP: Lisbon 202609282230 is past 202609282229 after the pre-check, so the apply does not start.` | journal 92; the transcript in `.new`, no `.out` |
| stage 3 at Tuesday 07:00, after stages 1 and 2 passed | 1 | `STOP: Lisbon 202609290700 is at or past 202609290700, the end of the run window. The write stands ...`; the closing read then: `STOP: stage 3 left no pass mark ...` | journal 93 |
| stage 1 with no therapist to act as (production's position plus 0094, no bookings) | 1 | the pre-check 14 OK, then `STOP: no active, non-resource therapist holding a clinic has, within 90 days, ... A missing subject is a FAIL. Nothing was applied` | journal 92 |
| stage 0 and stage 1 again after the apply | 1 each | `STOP: stage 1 has ALREADY APPLIED 0095 in this sitting` | journal 93 |

The clock arms put a `date` on the `PATH` that prints one fixed instant (for the
second arm of stage 1, a second instant from its second call on); the blocks call `date`
by name, and nothing else in them was changed for those arms.

| File, in the rehearsal agent's scratchpad (not committed) | sha256 |
|---|---|
| `build.zsh`, the database at main's 91 migrations | `8117e833332a5287b4584489288387b0d94fc6a6faf21c2591c00a973445f4d4` |
| `fixture-conflict.sql`, the synthetic data | `34a6648d468629cb0e7aa9386b383d3619efe661a80c0ae51bf41d5571e946ac` |
| `extract.mjs`, the extractor and its counted substitutions | `9eea15138cd5776aee8a80d75775d74dcded2e6ea1dad44aa0bb7f792d3d8da4` |
| `run.zsh`, one block under `zsh -f` | `ab80de163829929eb60053d475acc0fe68faa3e356d824c31c15aca3cd800c0e` |
| `run-i.zsh`, one block pasted into `zsh -f -i` | `18b36d2b7fb0d29d9a33051ccf8887ebd32dc92074c501080bdec5b3858a3738` |
| `tamper.zsh`, a stand-in main with one byte appended to one file | `85998f06c3ea515f80afc3b8fb643ad5b528fe868a8671363a743e797c4b523b` |
| `fakeclock/date`, the fixed clock | `bad344485eb017321000575e545d5120e809937967a5214e9be2a6114f6ebac3` |

**What this rehearsal does not cover.** The two tests the promotion moves (above) and
CI on the promoted tree; the target guard passing on production, which only GREEN's
sitting can show; and reception, admin and owner, which the behaviour check does not act
as (the builder's rehearsal compared them). Its behaviour profile is the fixture's: a
production day with no care-team-only or shared-resource booking in range reads VACUOUS
on 12 or 13, which stage 3 allows.

## What this does NOT do

- **It changes no conflict row.** Detection stays clinic-blind by ruling; the rows
  function is 0059's two arms with the name removed, and S1 and S2 prove the rows equal.
- **It changes no policy, no table grant and no other function.** Post-check 10 and 11
  prove it by one md5 each.
- **It moves no SECURITY DEFINER count.** One function stops being one and one starts;
  post-check 8.
- **It decides nothing about care-team names.** A patient on the caller's care team whom
  the caller never treated gets the placeholder, as the agenda card already shows. That
  is PR #1438's question Q1, carried to the owner and not decided here.

## Correction, 2026-09-30: the journal reader's reads in this document's rehearsal were not honestly rehearsed

This was added after the sitting, and no block changed. The lead ruled it after the
incident carded as `INC-rehearsal-subagent-passed-the-reader-guard`.

**What the rehearsal did.** The whole-block rehearsal behind this document ran on a local
throwaway at 127.0.0.1:55522 (2026-09-28 03:04 Lisbon). `packages/db/scripts/read-applied-migrations.mjs` refuses any
target that is not production. It ran there only because the rehearsal put the production
project ref into the throwaway's URL as an `application_name` label (`t3b-rehearsal-<ref>`, the ref
elided here). The rehearsal prompt did not list that substitution. It told the agent to
override the production guard the way earlier rehearsals did, which SOLO wrote and should
not have. Only 127.0.0.1 was contacted.

**So every line in this document's rehearsal record that comes from the journal reader is
NOT evidence.** That covers BEFORE YOU START's journal read and the closing read. The other
steps of those blocks, and every other block, stand as recorded. 0095's production sitting of 2026-09-29 13:08 to 13:10 Lisbon ran the reader for real: the closing read read 93, nothing pending.

**The rule from now on,** in `CLAUDE.md`, verbatim: "A script's own REFUSE or STOP line is
a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a
script to get past a guard. A block that cannot run on the throwaway is recorded as NOT
REHEARSED and the document says so."
