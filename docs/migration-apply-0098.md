# 0098: apply the staging index, the importer ledger looked up by its target row

**Status: HELD. NOT PROMOTED, NOT APPLIED.** One migration, today the pending file
`packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql`,
applied only once it is promoted to `packages/db/migrations/0098_migration_staging_imported_entity_idx.sql`
on the branch below. Any `STOP:` line, any `FAIL` verdict or any `ERROR` halts the
sitting.

**It is applied only AFTER `0096` and `0097`, in that order, and never by the lane
that wrote it.** The owner ruled on 2026-09-27 that the staging index and CARE-02a are
"authored now" and held; GREEN applies them later (`CLAUDE.md` on `origin/main`, the
section "Owner rulings, 2026-09-27", and the section "Who applies migrations"). On
2026-09-30 he renumbered the held queue, the fifth renumbering: "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file order from now; the lead rules apply order only in number order or after a renumber." So
`0096` is CARE-02a, `0097` the registo write policies, and this file `0098`; it was
`0097` under the 2026-09-27 queue. Stage 0 refuses a branch where `0096` and `0097` are
not numbered migrations, and stage 1 refuses, before anything is written, a production
journal that does not carry each of the two by the sha256 of its file.

**This document is written at the standard `docs/migration-apply-0093.md` set,
section for section,** and nothing is carried over from 0093's numbers. **No
production read was made for it:** the lane that wrote it was forbidden one. The
rehearsal sections near the end were measured on 2026-09-27 on the throwaway rehearsal
container, on databases built from `main` plus what were then the pending `0094`,
`0095` and `0096`, under the name `docs/migration-apply-0097.md`; the numbers they print
are that queue's. **The blocks as renumbered on 2026-09-30 have not been re-run**: see
"Renumbered on 2026-09-30" below, which says what changed and what must be rehearsed
again before the sitting.

| Fact | Value |
|---|---|
| Card | `MIG-0097-staging-index` on the board; the card id keeps the number it was opened under. The owner's words are "the staging index": he numbered it `0097` on 2026-09-24, ruled it "authored now", held, on 2026-09-27, and renumbered it `0098` on 2026-09-30 |
| Ruling | Owner, 2026-09-30, the fifth renumbering: "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file order from now; the lead rules apply order only in number order or after a renumber." The number is the apply authorisation. Under the 2026-09-27 queue it was `0097`, after `0096` |
| Migration, as it stands | `packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql`, sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0` |
| Migration, once promoted | `packages/db/migrations/0098_migration_staging_imported_entity_idx.sql`, **bytes unchanged**, so the same sha256. Stage 0 proves the promotion; it never performs it |
| Journal | `idx` set at promotion, tag `0098_migration_staging_imported_entity_idx`, `when` set at the promotion and strictly greater than `0097`'s. **Neither the `idx` nor the `when` is pinned here**: stage 0 reads both, requires the entry to be the journal's last, and `pnpm db:check-journal` proves the order |
| Must follow | `0096` CARE-02a (#1471, `care/0098-CARE-02a-care-team-reads`), then `0097` the registo write policies (#1475, `db/0099-registo-write-matrix`): each applied to production and merged to main, in that order, before `0098` is promoted. `0094` and `0095` were applied on 2026-09-29, which left the production journal at 93 rows. The branch names keep the numbers they were opened under |
| Branch | `db/0097-staging-imported-entity-index` (the name keeps the number it was opened under), its PR #1469 labelled `held-for-apply` |
| Before the sitting | (1) `0096` and `0097` are applied and merged, in that order; (2) main is merged into this branch and `0098` is promoted on it (the rename, the journal entry, the supabase mirror, `pnpm db:check-journal`); (3) the PR reads **all required checks green on the head being applied**; (4) the owner's dispatch names this file; (5) the Lisbon clock is inside the run window below. The operator checks all five before stage 0; stage 0 re-checks 2 and 5 by machine, and stage 1 re-checks 1 and 5 |
| Run window | **21:00 to 07:59 Lisbon**, while both clinics are closed. The owner ruled on 2026-09-27 "Sittings only while the clinics are closed." (`CLAUDE.md` on `origin/main`, the section "Owner rulings, 2026-09-27"). Their ruled hours are 08:00 to 21:00 on every open day (owner ruling of 2026-09-17, `docs/data-op-location-hours.md`, line 18). Stage 0 and stage 1 read the Lisbon clock and STOP outside the window |
| This document | `docs/migration-apply-0098.md`, pinned by `docs/migration-apply-0098.sha256` and asserted in STAGE 0 and again in STAGE 1 |
| Pre-check | `scripts/db/precheck-0098-staging-imported-entity-idx.sql`, READ ONLY, 14 verdicts, sha256 `499436b296fda73356616a8a27d218ed40f56bd7e356e435590beb70fff473cc` |
| Post-check | `scripts/db/postcheck-0098-staging-imported-entity-idx.sql`, READ ONLY, 13 verdicts, sha256 `e1287a0f42db16cc696421461dfafea1b7162d450498dc92df528bef2fa69c1b`. Stage 2 runs it; stage 1 asserts its sha256 too, before the apply |
| Behaviour check | **None, by design.** 0098 changes no policy, grant or function, so there is no row a role may or may not read to A/B. What the index does to a query plan is proven on the rehearsal (A5 below), not on production, because a plan depends on production's statistics |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `453cf2c4` (read 2026-09-30), both pinned in every block that runs them. The lock-timeout change the owner ruled on 2026-09-30 will change `verified-migrate.mjs` after `0096` and `0097` are applied, and this document is refilled with its new sha256 then |
| What it creates | ONE btree index, `migration_staging_imported_entity_idx`, on `public.migration_staging_rows (imported_entity_id, entity_type)`, partial `WHERE imported_entity_id IS NOT NULL`, and a COMMENT on it saying why |
| What it never touches | every table, column, policy, grant, function and row. The post-check proves every OTHER index on the table unchanged by one md5, and the index count up by exactly one |
| Shape test | `scripts/migration-0098-staging-index.test.mjs`, in `pnpm test:scripts`: exactly one CREATE INDEX, on this table, these columns, no other statement, both checks pinning the file's sha256, and every CTE, column and verdict row of both checks' verdict queries pinned to its reviewed text. The same test reads this document: every sha256 a block sets is the real sha256 of its file, the table above quotes each, stage 1 compares every file stage 2 reads before its apply line, and the sidecar is this document's sha256 |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0098.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**Nothing here changes at the promotion.** Every sha256 above is of a file the
promotion does not touch (a rename changes no byte), the tag follows from the ruled
number, and the two values the promotion sets, the journal `idx` and `when`, are read,
never pinned. So the sidecar written with this document is the one stage 0 checks.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter that a colon follows is braced, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces and
reads this document by its number). No backslash continuations, and no `!` except as
the `test !` operator followed by a space. Narration is `echo`.

**Each stage runs from `origin/db/0097-staging-imported-entity-index`, not
`origin/main`.** The PR is held until this apply succeeds, so `origin/main` cannot
contain the migration while the apply runs. **If the branch is gone** (its PR merged
before the apply, as #1399 was before 0093's), stage 0 and stage 1 STOP and say so.
Never apply from main instead: report it and let the owner rule.

**Apply before merge.** Nothing in the app reads the index by name, so a merge before
the apply would break no page; it would put a numbered migration on main that
production does not have, which is the state this order exists to prevent.

## STAGE 0: verify the run window, the promotion, the number and the queue

**This stage PROVES the promotion; it never performs it.** The promotion happens on
the branch, after `0097` is applied and merged: the pending file is renamed into
`packages/db/migrations/` with its bytes unchanged, the journal entry is written, and
the supabase mirror is generated by `node scripts/sync-supabase-migrations.mjs`.

**The promoted file's own header will still read "RULED NUMBER 0097. NO NUMBER IN THIS
FILE NAME YET, BY CONSTRUCTION"**, it names `0096` (the conflict check's patient name)
as the migration it follows and `0094`, `0095` and `0096` as the ones before it, and the
index COMMENT it installs begins `0097.`. All of that is the 2026-09-27 queue, stale
since the fifth renumbering and again after the rename, and it stays stale on purpose:
neither the renumbering nor the promotion touches one byte of the file, which is the
only reason the sha256 above can pin anything.

The number is the apply authorisation: `0096` CARE-02a, `0097` the registo write
policies, **`0098` the staging index**, `0099` the grants revoke, `0100` onward SAT-01.
Exactly one `packages/db/migrations/0098_*.sql` may exist, it must be the newest file,
and `0096` and `0097` must each exist exactly once; anything else is a **STOP**. The
file count and the journal `idx` are set at the promotion, so stage 0 pins neither: it
requires check-journal to reconcile every file on the branch against as many journal
entries, and `0098`'s entry to be the journal's last.

```
(
set -eo pipefail
SHA=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
BRANCH=db/0097-staging-imported-entity-index
TAG=0098_migration_staging_imported_entity_idx
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql
DOCPIN=docs/migration-apply-0098.sha256

LISBON=$(TZ=Europe/Lisbon date +%H%M)
echo "the Lisbon clock reads ${LISBON}. This sitting runs only from 2100 to 0759 Lisbon, while both clinics are closed"
[ "${LISBON}" -ge 2100 ] || [ "${LISBON}" -lt 800 ] || { echo "STOP: the Lisbon clock reads ${LISBON}, inside the clinics' opening hours. The sitting does not start"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not start again. Go to stage 2"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0098-head.sha /tmp/0098-journal.out
git fetch origin --prune
git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null || { echo "STOP: origin/${BRANCH} does not exist. If its PR merged before this apply, the sitting stops here. Report it; never apply from main"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }

test -f ${MIG} || { echo "STOP: 0098 is not on disk; the promotion is not on this branch"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0098 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
for N in 0096 0097 0098; do
C=$(find packages/db/migrations -maxdepth 1 -name "${N}_*.sql" | wc -l | tr -d ' ')
[ "${C}" = 1 ] || { echo "STOP: ${C} files claim migration number ${N}, not 1"; exit 1; }
done
NEWEST=$(find packages/db/migrations -maxdepth 1 -name '*.sql' | sort | tail -1)
[ "${NEWEST}" = "${MIG}" ] || { echo "STOP: the newest migration on this branch is ${NEWEST}, not 0098"; exit 1; }
NSQL=$(find packages/db/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')

pnpm db:check-journal 2>&1 | tee /tmp/0098-journal.out
grep -q "${NSQL} .sql files match ${NSQL} journal entries in order" /tmp/0098-journal.out || { echo "STOP: check-journal did not reconcile the ${NSQL} migration files on this branch against ${NSQL} journal entries"; exit 1; }
JE=$(node -e 'const j = require("./packages/db/migrations/meta/_journal.json"); const e = j.entries.filter((x) => x.tag === process.argv[1]); console.log(e.length === 1 ? "idx " + e[0].idx + " when " + e[0].when + (e[0].idx === j.entries.length - 1 ? " LAST" : " EARLIER") : "entries " + e.length);' ${TAG})
case "${JE}" in "idx "*" when "*" LAST") ;; *) echo "STOP: the journal entry for ${TAG} reads [${JE}], not one entry and the journal's last"; exit 1;; esac
echo "0098 in the journal on disk: ${JE}"

echo "${PIN}" > /tmp/0098-head.sha
echo "PROMOTION, NUMBER AND QUEUE VERIFIED. Recorded ${PIN} in /tmp/0098-head.sha"
)
```

**EXPECT: the clock line, `running from <sha>`, the sidecar line
`docs/migration-apply-0098.md: OK`, check-journal's
`<N> .sql files match <N> journal entries in order` with N the number of migration
files on the branch, the line
`0098 in the journal on disk: idx <set at promotion> when <13 digits> LAST`, and last
`PROMOTION, NUMBER AND QUEUE VERIFIED`.** It reads no database. The sha it records is
the one stage 1 applies from, and stage 1 refuses a different one. `when` strictly
increasing is check-journal's own rule, so 0098's `when` is above 0097's or this
stage has already stopped.

## What is new here, because 0098 is not shaped like 0093

0093 CREATED a table with policies, so it had grants, policies and an RLS behaviour to
A/B. **0098 CREATES ONE INDEX**, and nothing a role can read changes. So the pre-check
proves the index ABSENT, both by name (row 3: `CREATE INDEX IF NOT EXISTS` matches a
NAME against every relation in the schema and would skip in silence) and by column
(row 4: an index keying `imported_entity_id` under another name would not stop `IF NOT
EXISTS`, and the apply would build a duplicate), and proves 0014's four indexes on the
table exactly as they are. The post-check proves the new index exactly (the definition
whole, the key in order, the predicate, valid, ready and live, the comment by md5) and
proves nothing else on the table moved.

There are **three** carries: `journal_rows_before`, `staging_indexes_before`,
`staging_indexes_md5`. No carry's name is a substring of another's or of any other
row's `check` column, and stage 2's `carry()` matches column 1 EXACTLY, trimmed.

**Two profiles are correct, and which one production prints was not measured.** The
only verdict that can read VACUOUS is the ledger profile: pre-check 10 and post-check
12 count the ledger rows the index holds (`imported_entity_id` set). With at least one
such row the pre-check reads `14 OK / 0 VACUOUS / 0 FAIL` and the post-check
`13 OK / 0 VACUOUS / 0 FAIL`; on a ledger with none, `13 OK / 1 VACUOUS / 0 FAIL` and
`12 OK / 1 VACUOUS / 0 FAIL`, the VACUOUS on exactly that row. **Stage 1 accepts
either pre-check profile and nothing else; stage 2 accepts only the post-check profile
that follows from the pre-check this sitting printed.** A VACUOUS ledger says the
index was built over nothing, which is correct and proves nothing about a probe; it
greens no other verdict, because every other verdict reads the catalogue or the
journal.

**What a READ ONLY check cannot measure** is what the index does to a query. A plan
depends on the database's statistics, so no verdict here asserts one. The plan change
is proven on the rehearsal (A5 below): the ledger probe of `importerSourcedRecordSql`
goes from a Seq Scan to an Index Scan on this index, under RLS and without it.

**The lock.** A plain `CREATE INDEX` holds a SHARE lock on `migration_staging_rows`
while it builds: reads go on, writes wait. `CONCURRENTLY` is not possible, because
drizzle runs every pending migration inside one transaction and `CREATE INDEX
CONCURRENTLY` refuses to run in one (the migration file, section 6). The only writer
of the ledger is the importer, which the owner runs and which does not run during a
sitting. No other write runs in the same sitting.

## HEAD CHECK: run this after stage 0, and before stage 2

Paste it on its own. It writes nothing and touches no database.

```
(
set -eo pipefail
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
test -f /tmp/0098-head.sha || { echo "STOP: stage 0 has recorded no head in this sitting"; exit 1; }
REC=$(cat /tmp/0098-head.sha)
NOW=$(git rev-parse -q --verify refs/remotes/origin/db/0097-staging-imported-entity-index || echo "the branch no longer exists")
echo "recorded by stage 0: ${REC}"
echo "origin now:          ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "HEAD UNCHANGED"; exit 0; fi
echo "HEAD MOVED"
[ -n "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: the branch moved since stage 0 and stage 1 has not applied. Nothing is applied. Start again from stage 0"; exit 1; }
echo "stage 1 has applied in this sitting, so NEVER go back to stage 1. Go on to stage 2, which runs from the recorded sha. Both shas go on the SR-51 card"
)
```

**EXPECT: `HEAD UNCHANGED`, exit 0.** The block decides what a moved head means, by
the applied-marker, so nothing here is read by eye. **The branch carries the label
`held-for-apply`**, so `.github/workflows/auto-update-prs.yml` never merges main into
it (#1434), and a moved head means somebody pushed to it:

- **Before stage 1 has applied:** this block STOPs, exit 1, and so would stage 1,
  which asserts the same comparison. The sitting starts again from stage 0.
- **After stage 1 has applied:** this block prints `HEAD MOVED`, then
  `stage 1 has applied in this sitting, so NEVER go back to stage 1. Go on to stage 2,
  which runs from the recorded sha. ...`, exit 0. Stage 2 checks out the sha
  stage 1 applied from, which the local clone keeps whatever happens to the branch,
  and asserts the migration, the post-check and the guard by sha256. Both shas go on
  the SR-51 card. A branch that no longer exists reads the same way, with
  `origin now: the branch no longer exists`.

**The halt that case can still produce, named so it is not improvised around.**
`scripts/assert-production-target.mjs` lives on main, not only on this branch, and
stage 2 pins it. If the approved guard is not what that sha holds, stage 2 stops on
`the target guard on disk is not the approved file`, with production already applied.
The applied-marker is good for **60 minutes**. Do not edit a pin and do not re-run
stage 1. Report it to the owner with both shas; the post-check is READ ONLY and can be
re-issued against a new guard.

Stage 1 refuses to start while a fresh applied-marker exists, and it never touches the
previous transcript until a new pre-check has passed.

## STAGE 1: the run window, pre-flight, the queue, the pre-check, apply

```
(
set -eo pipefail
SHA0098=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPRE=499436b296fda73356616a8a27d218ed40f56bd7e356e435590beb70fff473cc
SHAPOST=e1287a0f42db16cc696421461dfafea1b7162d450498dc92df528bef2fa69c1b
BRANCH=db/0097-staging-imported-entity-index
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql

SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

LISBON=$(TZ=Europe/Lisbon date +%H%M)
echo "the Lisbon clock reads ${LISBON}. The apply runs only from 2100 to 0759 Lisbon"
[ "${LISBON}" -ge 2100 ] || [ "${LISBON}" -lt 800 ] || { echo "STOP: the Lisbon clock reads ${LISBON}, inside the clinics' opening hours. Nothing is applied"; exit 1; }

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0098-precheck.new

echo "--- pre-flight: the tree holds nothing but the checkout"
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD: origin/${BRANCH} must still be the sha stage 0 recorded"
test -f /tmp/0098-head.sha || { echo "STOP: stage 0 recorded no head in this sitting"; exit 1; }
[ -n "$(find /tmp/0098-head.sha -mmin -60)" ] || { echo "STOP: stage 0 ran over an hour ago. Run stage 0 again"; exit 1; }
REC=$(cat /tmp/0098-head.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
git rev-parse -q --verify refs/remotes/origin/${BRANCH} > /dev/null || { echo "STOP: origin/${BRANCH} no longer exists. Report it; never apply from main"; exit 1; }
NOW=$(git rev-parse origin/${BRANCH})
echo "recorded by stage 0: ${REC}"
echo "origin now:          ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the branch moved since stage 0. Nothing is applied. Start again from stage 0"; exit 1; }
echo "applying from ${REC}"

echo "--- SR-58: this stage checks out its own ref and proves the files"
git checkout -q --detach ${REC}
test -f docs/migration-apply-0098.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0098.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f scripts/db/precheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- THE QUEUE. READ ONLY. 0096 and 0097 are each in the production journal, found by the sha256 of its file on this branch"
for N in 0096 0097; do
F=$(find packages/db/migrations -maxdepth 1 -name "${N}_*.sql")
test -f "${F}" || { echo "STOP: no single file for migration ${N} on this branch"; exit 1; }
H=$(shasum -a 256 ${F} | cut -d' ' -f1)
C=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${H}'" | tail -1)
[ "${C}" = 1 ] || { echo "STOP: ${F} is in the production journal ${C} times, not once. 0098 follows 0096 and 0097. Nothing was applied"; exit 1; }
echo "${F} is applied, by hash"
done

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-0098-staging-imported-entity-idx.sql 2>&1 | tee /tmp/0098-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
PRE=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-precheck.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-precheck.new | sed -E 's/^[[:space:]]*([0-9]+)\..*/\1/' | tr '\n' ' ' || true)
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-precheck.new || true)
if [ "${PRE}" = "14 OK / 0 VACUOUS / 0 FAIL" ] && [ -z "${VACSET}" ] && [ "${OKS}" = 14 ]; then echo "the pre-check reads ${PRE}: the ledger holds rows with a target"; elif [ "${PRE}" = "13 OK / 1 VACUOUS / 0 FAIL" ] && [ "${VACSET}" = "10 " ] && [ "${OKS}" = 13 ]; then echo "the pre-check reads ${PRE}: the ledger holds no row with a target, VACUOUS on 10 only"; else echo "STOP: the pre-check must read 14 OK / 0 VACUOUS / 0 FAIL, or 13 OK / 1 VACUOUS / 0 FAIL with only verdict 10 VACUOUS. It read [${PRE}], ${OKS} OK lines, VACUOUS on [${VACSET}]. Nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check in hand, does the previous sitting's state go"
rm -f /tmp/0098-postcheck.out /tmp/0098-applied.ok
mv /tmp/0098-precheck.new /tmp/0098-precheck.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0098_migration_staging_imported_entity_idx --sha256 ${SHA0098} --expect-pending 1
touch /tmp/0098-applied.ok
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the clock line, inside the window;**
- **the HEAD lines, both shas equal;**
- **two lines `packages/db/migrations/009N_<slug>.sql is applied, by hash`, for
  0096 and 0097;**
- **the pre-check prints no FAIL and one of the two profiles:** `14 OK / 0 VACUOUS /
  0 FAIL`, or `13 OK / 1 VACUOUS / 0 FAIL` with verdict 10 the VACUOUS one. The block
  names which;
- **`pending    1  [0098_migration_staging_imported_entity_idx]`.** Exactly one.

It then prints `journal    95 -> 96  (delta 1)` and
`0098_migration_staging_imported_entity_idx present by sha256: yes`. Stage 2 re-reads
both from the database rather than trusting this line.

**Stage 1 pins the post-check too, although only stage 2 runs it.** Stage 2 runs from
the sha stage 1 applied from and compares the post-check with the same sha256, so a
post-check edited on the branch after this document was written STOPs the sitting
here, before the apply, and not in stage 2 with production already written (rehearsed
below).

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment
variable; **3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing
from `_journal.json`, an already-applied migration or a pending count that is not 1,
and AFTER drizzle has run on a journal that moved by the wrong amount or moved without
the approved sha256; **4** if drizzle itself failed or on any thrown error; **5** if
drizzle reports success and the journal did not move. Exit 3 can therefore follow a
committed apply too: the rule below covers every non-zero exit after the banner.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits
4 on ANY thrown error, including its own journal read AFTER drizzle has committed. So:
**if stage 1 ended non-zero after the `drizzle-kit migrate` banner had printed, do not
paste stage 1 again.** Run, READ ONLY,
`cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && node --env-file=/Users/ivan/osteojp-secrets/new-prod.env packages/db/scripts/read-applied-migrations.mjs`.
If it lists 0098 as APPLIED, production is applied and no marker exists, so stage 2
will refuse: stop and ask the owner to rule. **If it lists 0098 as NOT APPLIED,
nothing changed:** drizzle applies the file's statements and the journal row in ONE
transaction (measured for 0092 by refusing a statement part way). Stop and report the
exit code and the drizzle output. Do not re-run stage 1 on your own.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0098=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPOST=e1287a0f42db16cc696421461dfafea1b7162d450498dc92df528bef2fa69c1b
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=db/0097-staging-imported-entity-index
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- THE HEAD. This stage runs from the sha stage 1 applied from. If the branch has MOVED or gone, carry on: never go back to stage 1 after an apply. Everything this stage reads is asserted by sha256 below"
test -f /tmp/0098-head.sha || { echo "STOP: the sha stage 1 applied from is not recorded"; exit 1; }
REC=$(cat /tmp/0098-head.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
echo "stage 1 applied from: ${REC}"
echo "origin now:           $(git rev-parse -q --verify refs/remotes/origin/${BRANCH} || echo 'the branch no longer exists')"
git checkout -q --detach ${REC}
test -f ${MIG} || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0098-precheck.out || { echo "STOP: stage 1's transcript is missing"; exit 1; }
[ -n "$(find /tmp/0098-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/0098-precheck.out; }
J=$(carry journal_rows_before)
I=$(carry staging_indexes_before)
M=$(carry staging_indexes_md5)
[ "${J}" = 95 ] && [ "${I}" = 4 ] && [ -n "${M}" ] || { echo "STOP: the carries did not parse out of the transcript as journal 95 and 4 indexes. Read: [${J}] [${I}] [${M}]"; exit 1; }
PRE=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-precheck.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
if [ "${PRE}" = "14 OK / 0 VACUOUS / 0 FAIL" ]; then WANT="13 OK / 0 VACUOUS / 0 FAIL"; WANTVAC=""; WANTOK=13; elif [ "${PRE}" = "13 OK / 1 VACUOUS / 0 FAIL" ]; then WANT="12 OK / 1 VACUOUS / 0 FAIL"; WANTVAC="12 "; WANTOK=12; else echo "STOP: the pre-check transcript's profile [${PRE}] is not one stage 1 accepts"; exit 1; fi
echo "carries from this run: journal_before=${J} staging_indexes_before=${I} staging_indexes_md5=${M}; pre-check ${PRE}, so the post-check must read ${WANT}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0098-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v staging_indexes_before="${I}" -v staging_indexes_md5="${M}" -c "begin read only" -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql -c "rollback" 2>&1 | tee /tmp/0098-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
POST=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-postcheck.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${POST}" = "${WANT}" ] || { echo "STOP: the post-check must read ${WANT}, following the pre-check's ${PRE}. It read [${POST}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-postcheck.out | sed -E 's/^[[:space:]]*([0-9]+)\..*/\1/' | tr '\n' ' ' || true)
[ "${VACSET}" = "${WANTVAC}" ] || { echo "STOP: the post-check's VACUOUS rows are [${VACSET}], not [${WANTVAC}]"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${OKS}" = "${WANTOK}" ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not ${WANTOK}"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0098 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0098}'" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0098 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0098 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0098 APPLIED. pre-check ${PRE}, post-check ${POST}, journal ${J} to ${JA}."
)
```

**EXPECT:** the carry line reads `journal_before=95 staging_indexes_before=4`; the
post-check prints no FAIL and the profile that follows from stage 1's; the journal
reads `95` before and `96` after, with 0098's sha256 in it **exactly once**; the final
line reads exactly one of

- `0098 APPLIED. pre-check 14 OK / 0 VACUOUS / 0 FAIL, post-check 13 OK / 0 VACUOUS / 0 FAIL, journal 95 to 96.`
- `0098 APPLIED. pre-check 13 OK / 1 VACUOUS / 0 FAIL, post-check 12 OK / 1 VACUOUS / 0 FAIL, journal 95 to 96.`

The post-check ends with a `FOR THE RECORD` table: the five indexes on the ledger, the
new one first. Nothing in it is a verdict.

**If stage 2 STOPs, production is already applied.** Never re-run stage 1 and never
edit a pin. One STOP there is the data moving, not a fault: `the post-check must read
<profile>, following the pre-check's <profile>. It read [<profile>]`, with no FAIL
above it, means the ledger gained its first row with a target, or lost its last one,
between stage 1 and stage 2 (rehearsed below). That line already prints both
profiles: report it to the owner with `/tmp/0098-precheck.out` and
`/tmp/0098-postcheck.out`. Report any other stage 2 STOP the same way. Stage 2 ends at
its first STOP, so no check after that line ran; the post-check is READ ONLY and can
be re-issued on the owner's word.

## What every verdict must read

- **Pre-check, 14 verdict rows and a SUMMARY row:** 0 the transaction is READ ONLY;
  1 `public.migration_staging_rows` exists, an ordinary table; 2 its two key columns
  read exactly `imported_entity_id pg_catalog.uuid NULL, entity_type
  public.migration_entity_type NOT NULL`; 3 no relation named
  `migration_staging_imported_entity_idx` exists in `public`; 4 no index on the table
  keys `imported_entity_id`, under any name; 5 to 8 the four indexes 0014 made
  (`migration_staging_rows_pkey`, `migration_staging_tenant_source_uq`,
  `migration_staging_tenant_batch_idx`, `migration_staging_tenant_status_idx`), each
  exactly as Postgres renders 0014's definition and each valid, ready and live; 9 0098
  is absent from the journal, by hash; 10 PROFILE, the ledger rows the index will hold:
  OK when there is at least one, VACUOUS when there is none; `journal_rows_before`
  **95**, fixed by the ruled order (production's 93 after 0094 and 0095 were applied
  on 2026-09-29, plus 0096 and 0097);
  `staging_indexes_before` **4**; `staging_indexes_md5`, any 32 hex characters. The
  rehearsal read `096b491fe3c4aba4b875df4e365cc036`. With verdicts 5 to 8 OK and the
  count 4, production's value can be no other, because the md5 is over exactly those
  four names, definitions and flags, ordered by name; it is not pinned, and stage 2
  compares the post-check against THIS sitting's value.
- **Post-check, 13 verdict rows and a SUMMARY row:**

0. the transaction is READ ONLY;
1. exactly one relation in `public` has the index's name, and it is an index on
   `public.migration_staging_rows`;
2. it is a btree, and not unique, primary or an exclusion constraint;
3. it is VALID, READY and LIVE (`pg_index.indisvalid`, `indisready`, `indislive`);
4. its key is exactly `imported_entity_id, entity_type`, in that order, 2 key columns,
   2 in all (no INCLUDE), no expression;
5. its predicate is exactly `(imported_entity_id IS NOT NULL)`;
6. its whole definition is exactly `CREATE INDEX migration_staging_imported_entity_idx
   ON public.migration_staging_rows USING btree (imported_entity_id, entity_type) WHERE
   (imported_entity_id IS NOT NULL)`;
7. its COMMENT is the migration file's text, by md5 (`5212f3ec29a6efafa4f3ea0ab388d5b4`);
8. it is the only index on the table that keys `imported_entity_id`;
9. the table carries `staging_indexes_before` **+ 1** indexes (5);
10. every OTHER index on the table still hashes, as one value, to
    `staging_indexes_md5`;
11. 0098 is in the journal by hash, once, and the journal is `journal_rows_before`
    **+ 1** (96);
12. PROFILE, the ledger rows the index holds: OK when there is at least one, VACUOUS
    when there is none. It counts what pre-check 10 counts, and stage 2 requires the
    two verdicts to agree (both OK or both VACUOUS).

**Verdict 12 moves with the data, and so does pre-check 10.** An import run after the
sitting adds rows. The post-check re-issued later, by hand, is still correct, and a
ledger that was empty on apply day would then read OK: that is the data moving, not a
regression. Inside the sitting, stage 2 holds verdict 12 to this sitting's pre-check
10, so the same movement between stage 1 and stage 2 STOPs stage 2 after the apply;
the paragraph after stage 2's EXPECT says what to do.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 96, 0098 by hash | stage 2, and `read-applied-migrations.mjs` | the database |
| 0098 is applied only after 0096 and 0097 | stage 0 (the two numbered files), stage 1 (each in the production journal by its file's sha256), pre-check `journal_rows_before` 95, and `--expect-pending 1` | the branch and the journal |
| exactly one index, the named columns in order, partial, valid and ready | post-check 1 to 8 | the catalogue |
| no other index on the table changed | post-check 9 and 10, against this sitting's carries | the catalogue |
| a second apply is a no-op | **the rehearsal only** (A5, apply #2). drizzle never re-runs a hash it holds, so production cannot show it | the migration file |
| the ledger probe of `importerSourcedRecordSql` switches from a Seq Scan to an Index Scan | **the rehearsal only** (A5, EXPLAIN before and after, under RLS and without it) | the planner |

## Renumbered on 2026-09-30: what changed, and what was not re-run

**The ruling, the fifth renumbering of the held queue:** "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file order from now; the lead rules apply order only in number order or after a renumber."

**What changed in the renumbering, and nothing else did:**

- the pending file's name, from `NEXT-AFTER-0096_` to `NEXT-AFTER-0097_`, by `git mv`.
  Its bytes are unchanged, sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0`;
- this document's name, from `docs/migration-apply-0097.md` to
  `docs/migration-apply-0098.md`, its sidecar with it, and every number in its facts,
  its stage prose, its blocks, its EXPECT lines and its verdict list;
- the check scripts' and the shape test's names (`0097` to `0098`), their comments,
  the verdict labels of pre-check 9 and post-check 11, the column `has_0097` (now
  `has_0098`), and the pre-check's journal carry, `94` to `95`. So both checks have new
  sha256s, refilled above and in every block; the shape test pins the same reviewed
  text with those names and that number;
- stage 0 no longer pins a file count or a journal `idx`: both are set at the
  promotion, and stage 0 requires check-journal to reconcile every file on the branch
  and `0098`'s entry to be the journal's last. Stage 1's queue reads `0096` and `0097`
  by hash, and stage 2's carry expects journal `95`.

**What stays stale on purpose:** the migration's own header ("RULED NUMBER 0097", "It
must follow 0096 (the conflict check's patient name)", "applied only AFTER 0094, 0095
AND 0096") and the index COMMENT, which begins `0097.` and so will read `0097.` in
production after the apply. Changing either would change the sha256 that both checks,
every block and the journal row pin. The branch name,
`db/0097-staging-imported-entity-index`, and the board card id,
`MIG-0097-staging-index`, keep the number they were opened under.

**NOT RE-RUN.** The rehearsals below ran on 2026-09-27 under the fourth renumbering's
queue, on a base of `main` plus the then-pending `0094` (users/tenants role fix), `0095`
(grants revoke) and `0096` (conflict check), 94 journal rows, and every number in them
(`0097`, `idx 94`, 95 files, journal 94 to 95, the `/tmp/0097-*` paths) is that run's.
They are kept as the record of what ran. The blocks, the pre-check and the post-check
at their 2026-09-30 bytes have not been run. Before the owner's dispatch names this
file, the four blocks are re-rehearsed on a throwaway built from `main` plus `0096` and
`0097` (95 journal rows), with the promotion simulated as before, and the result is
recorded here.

**Two things the sitting will meet that the rehearsal did not.** The owner ruled on
2026-09-30 that, after `0096` and `0097` are applied, `verified-migrate.mjs` gains
`PGOPTIONS "-c lock_timeout=10s -c statement_timeout=300s"`, and its new sha256 is
pinned in later documents only; this is one, so `SHAVM` and the facts table are
refilled when that change merges. With it, this `CREATE INDEX` must take its SHARE lock
within 10 seconds and build within 300; production's ledger size was not measured
(see "What this rehearsal does not show"), so the re-rehearsal should time the build on
a ledger of production's order of size.

## Rehearsed on 2026-09-27: the migration and its checks (B13a)

**Where it ran.** The throwaway rehearsal container on 127.0.0.1:55522, never
production. `b13a_base` was built from every migration on `origin/main` at `e674100b`
(91; main has since moved to `dd9ca93a` without touching `packages/db` or
`supabase/`, 0 files changed under either), then the pending `0094` (branch head `69ea425d`, sha256 `439cb53e…`),
`0095` (`077ee449`, `fbc5e545…`) and `0096` (`67cdc97e`, `cfdfffff…`), in that order:
**94 journal rows**. The pending 0097 read sha256 `198054ab…` and matched the hash
both checks pin.

**One adaptation, stated.** The rehearsal applied each file with `psql -1 -f` and
wrote its journal row in the same transaction, as drizzle does (hash = the file's
sha256, `created_at` = the `when`). The pending files have no `when` yet, so synthetic
ones were used: `0094` 1788501500000, `0095` 1788501600000, `0096` 1788501700000,
`0097` 1788501800000. The blocks of this document, which apply through
`verified-migrate.mjs`, were run separately; see the next section.

**A5, on a copy of `b13a_base` (`b13a_a5`, dropped afterwards):**

| Step | Exit | Result |
|---|---|---|
| create | 0 | |
| pre-check, empty ledger | 0 | `13 OK / 1 VACUOUS / 0 FAIL`, the VACUOUS on 10 |
| seed | 0 | 20000 ledger rows, 18001 with a target, 4001 of them `clinical_record` |
| pre-check | 0 | `14 OK / 0 VACUOUS / 0 FAIL`; carries `journal_rows_before` 94, `staging_indexes_before` 4, `staging_indexes_md5` `096b491fe3c4aba4b875df4e365cc036` |
| EXPLAIN before | 0 | |
| apply #1 | 0 | `CREATE INDEX`, `COMMENT`, the journal row |
| post-check | 0 | `13 OK / 0 VACUOUS / 0 FAIL`; 5 indexes, journal 95, comment md5 `5212f3ec…` |
| apply #2 | 0 | NOTICE `relation "migration_staging_imported_entity_idx" already exists, skipping`; the index state (md5 over name, definition, oid and comment, and the count) read `9ac5a5ef6b150761898e99b4d0541110`, 5 indexes, identical before and after; the post-check still `13 OK / 0 VACUOUS / 0 FAIL` |
| EXPLAIN after | 0 | |

**The plan, EXPLAIN ANALYZE of `importerSourcedRecordSql`
(`apps/web/lib/clinical/record-origin.ts:62-81`), `importer_sourced = t` on every
run:**

- **Under RLS** (`authenticated`, owner claims):
  - before: `Result (cost=377.76..)` over `Hash Semi Join (cost=0.62..696.14)` over
    `Seq Scan on migration_staging_rows ledger (cost=0.00..685.00 rows=4000) (actual
    rows=4001)`, `Filter: ((tenant_id = (InitPlan 12).col1) AND (entity_type =
    'clinical_record'::migration_entity_type))`, `Rows Removed by Filter: 15999`;
  - after: `Result (cost=75.85..)` over `Nested Loop (cost=0.79..92.14)` over `Index
    Scan using migration_staging_imported_entity_idx on migration_staging_rows ledger
    (cost=0.29..8.31 rows=1)`, `Index Cond: (imported_entity_id = chain_1.id)`,
    `Filter: ((tenant_id = ...) AND (entity_type = 'clinical_record'...))`.
- **As `postgres`, bypassing RLS:**
  - before: `Seq Scan ... (cost=0.00..635.00 rows=4001)`, `Rows Removed by Filter:
    15999`, total cost 337.06;
  - after: `Index Only Scan using migration_staging_imported_entity_idx`, `Index Cond:
    ((imported_entity_id = chain_1.id) AND (entity_type = 'clinical_record'...))`,
    `Heap Fetches: 1`, total cost 60.13.

Under RLS `entity_type` stays a filter and `imported_entity_id` is the index
condition, which is why the key leads with `imported_entity_id` (the migration file,
section 4).

## Rehearsed on 2026-09-27: the blocks of this document

**Where it ran.** Ten throwaway databases `b13a2_fix_r97_*` on the same container, each a
fresh copy of `b13a_base` (main plus the pending 0094, 0095 and 0096, 94 journal rows,
an empty ledger), all dropped afterwards; the arms that halt before any database read
were pointed at a name that does not exist. **The promotion was simulated**, because it
cannot happen before 0096 is applied and merged: in a plain copy of this worktree
(no `.git`), the pending 0094, 0095 and 0096 files at the bytes `b13a_base` was built
from were numbered `0094_users_tenants_roles_policy_split.sql`,
`0095_revoke_truncate_trigger_references.sql` and `0096_conflict_name_visibility.sql`,
0097 was renamed from its pending file with its bytes unchanged, the journal was given
the four synthetic `when`s above, and the supabase mirror was synced. The real
promotions may name the three earlier files differently; the blocks find them by
number, never by name.

**How it ran.** The four blocks were extracted from this document verbatim and run
under `zsh -f` with stdin closed, with exactly four text substitutions, each counted
per block: `/tmp/` to a scratch directory (substituted first), the `cd` line to the
copy, the env line to an `export` of the throwaway's URL, and the production target
guard's invocation to an `echo`. A block that still named production after
substitution would have been refused. Two commands were answered by shims on the
PATH rather than substituted: `git`, a fake that answers only the calls the blocks
make, on the one ref they name, and refuses anything else (no real git operation ran),
and `date`, the Lisbon clock, set per arm, which refuses a call made without
`TZ=Europe/Lisbon`. No shim refused a call. One environment setting,
`pnpm_config_verify_deps_before_run=false`, because pnpm 11 will not run a script in a
copied tree whose `node_modules` it did not install; it changes no command in the
blocks. The two `git rev-parse` forms the blocks use were also run for real, READ
ONLY, in the authoring clone: `-q --verify refs/remotes/origin/<branch>` printed the
sha and exited 0 for a branch that exists, and printed nothing and exited 1 for one
that does not, which is what the shim answers.

| Substitution | stage 0 | HEAD CHECK | stage 1 | stage 2 |
|---|---|---|---|---|
| `/tmp/` | 7 | 3 | 15 | 13 |
| `cd` | 1 | 1 | 1 | 1 |
| env | 0 | 0 | 1 | 1 |
| guard | 0 | 0 | 1 | 1 |

**The happy paths, in order, with the clock at 23:30:**

| Arm | Exit | What it printed |
|---|---|---|
| H1, empty ledger: stage 0 | 0 | the sidecar OK; check-journal `95 .sql files match 95 journal entries in order`; `0097 in the journal on disk: idx 94 when 1788501800000`; `PROMOTION, NUMBER AND QUEUE VERIFIED` |
| HEAD CHECK | 0 | `HEAD UNCHANGED` |
| stage 1 | 0 | the three queue lines, `... is applied, by hash`; pre-check `13 OK / 1 VACUOUS / 0 FAIL`, VACUOUS on 10 only; `pending 1 [0097_migration_staging_imported_entity_idx]`; `journal 94 -> 95 (delta 1)`; present by sha256 |
| HEAD CHECK | 0 | `HEAD UNCHANGED` |
| stage 2 | 0 | `0097 APPLIED. pre-check 13 OK / 1 VACUOUS / 0 FAIL, post-check 12 OK / 1 VACUOUS / 0 FAIL, journal 94 to 95.` |
| H2, the ledger seeded with A5's 20000 rows (18001 with a target): stages 0, 1 and 2 and both HEAD CHECKs | 0 each | pre-check `14 OK / 0 VACUOUS / 0 FAIL`; carries `journal_before=94 staging_indexes_before=4 staging_indexes_md5=096b491fe3c4aba4b875df4e365cc036`; post-check 18001 in verdict 12; `0097 APPLIED. pre-check 14 OK / 0 VACUOUS / 0 FAIL, post-check 13 OK / 0 VACUOUS / 0 FAIL, journal 94 to 95.` |

The journal's newest row after each apply: id 95, hash
`198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0` (the file's
sha256), `created_at` 1788501800000, present exactly once. drizzle-kit printed
`migrations applied successfully!` and two NOTICEs that the `drizzle` schema and its
table already exist.

**Every halt, each run for real:**

| Arm | Exit | Halted on | Database after |
|---|---|---|---|
| stage 0 at 12:00 Lisbon | 1 | `inside the clinics' opening hours. The sitting does not start`, before any git call | untouched |
| stage 0 at 20:59 Lisbon (at 07:59 it passes) | 1 | the same | untouched |
| stage 1 at 08:00, after stage 0 at 23:30 | 1 | `inside the clinics' opening hours. Nothing is applied` | untouched |
| stage 0 on a dirty tree | 1 | `the apply worktree is not clean` | untouched |
| stage 0 with the branch gone | 1 | `does not exist. If its PR merged before this apply, the sitting stops here` | untouched |
| stage 1 with the branch gone after stage 0 | 1 | `no longer exists. Report it; never apply from main` | untouched |
| stage 1 with the head moved since stage 0 | 1 | `the branch moved since stage 0`; the HEAD CHECK before it printed `HEAD MOVED` and STOPped, exit 1, on `the branch moved since stage 0 and stage 1 has not applied` | untouched |
| stage 1 with stage 0's record 61 minutes old | 1 | `stage 0 ran over an hour ago` | untouched |
| HEAD CHECK before stage 0 | 1 | `stage 0 has recorded no head in this sitting` | untouched |
| HEAD CHECK with the branch gone after stage 0, before stage 1 | 1 | `origin now: the branch no longer exists`, then `stage 1 has not applied` | untouched |
| stage 2 before stage 1 | 1 | `stage 1 did not complete an apply in this sitting` | untouched |
| stage 0 with the pending copy still present | 1 | `the pending copy still exists, so the rename did not happen` | untouched |
| stage 0 with a second `0097_*.sql` | 1 | `2 files claim migration number 0097, not 1` | untouched |
| stage 0 with a `0098_*.sql` on the branch | 1 | `the newest migration on this branch is packages/db/migrations/0098_something_else.sql, not 0097` | untouched |
| stage 0 with this document one line longer | 1 | `this document is not the approved one` | untouched |
| stage 0 with 0097's `when` set to 0095's | 1 | check-journal: `journal "when" is not strictly increasing` | untouched |
| stage 1 with the pre-check edited after stage 0 | 1 | `the pre-check on disk is not the approved file` | journal 94, nothing applied |
| stage 1 with the post-check edited after stage 0 | 1 | `the post-check on disk is not the approved file` | journal 94, nothing applied |
| stage 1 with 0096's journal row deleted | 1 | after 0094 and 0095 read applied: `0096_conflict_name_visibility.sql is in the production journal 0 times, not once` | journal 93, nothing applied |
| stage 1 with the index already created by hand | 1 | pre-check FAIL on 3, 4 and `staging_indexes_before` | journal 94, nothing applied |
| stage 1 with another index keying `imported_entity_id` | 1 | pre-check FAIL on 4 and `staging_indexes_before` | journal 94, nothing applied |
| stage 1 a second time in the sitting | 1 | `stage 1 ALREADY APPLIED`; the kept transcript byte-identical | journal 95 |
| stage 0 again after the apply | 1 | `stage 1 ALREADY APPLIED` | journal 95 |
| stage 1 on the APPLIED database, marker gone | 1 | pre-check FAIL on 3, 4, 9, `journal_rows_before` and `staging_indexes_before` | journal 95, nothing re-applied |
| stage 2 with the transcript backdated 61 minutes | 1 | `over an hour old` | journal 95 |
| stage 2 after the ledger gained rows between a VACUOUS stage 1 and stage 2 | 1 | `the post-check must read 12 OK / 1 VACUOUS / 0 FAIL, following the pre-check's 13 OK / 1 VACUOUS / 0 FAIL. It read [13 OK / 0 VACUOUS / 0 FAIL]` | journal 95 |
| stage 2 with the applied index replaced by a non-partial one of the same name | 1 | post-check FAIL on 5, 6 and 7 | journal 95 |
| the HEAD CHECK and stage 2 with the branch moved AFTER the apply | 0 and 0 | the HEAD CHECK: `HEAD MOVED`, then `Go on to stage 2, which runs from the recorded sha`; stage 2 ran from the sha stage 1 applied from, printed both shas, `0097 APPLIED ...` | journal 95 |
| the HEAD CHECK and stage 2 with the branch deleted AFTER the apply | 0 and 0 | the HEAD CHECK: `origin now: the branch no longer exists`, `HEAD MOVED`, `Go on to stage 2`; stage 2: `origin now: the branch no longer exists`, then `0097 APPLIED ...` | journal 95 |

**What this rehearsal does not show.** The git lines ran against a shim, and the
target guard never ran. The promotion was simulated with synthetic `when`s; the real
one is what stage 0 checks at the sitting. Production's ledger size, and so how long
the build holds its lock, was not measured. The final run extracted the blocks from
this document as it stood on 2026-09-27, under the name `docs/migration-apply-0097.md`,
with the sidecar written from it, and every arm read as above.

## What this does NOT do

- **It edits no reader.** The planner picks the index; `record-origin.ts` and the
  scripts that probe the ledger stay as they are.
- **It is not mirrored in `packages/db/src/schema.ts`**, like 0068's
  `appointments_patient_2_idx` and 0091's `patient_care_team` indexes. `drizzle-kit
  generate` diffs `schema.ts` against its own snapshots, not the database, so it never
  emits a DROP for an index it never knew.
- **It changes no table, column, policy, grant, function or row.** Post-check 9 and 10
  prove the other four indexes unchanged; the file has one CREATE INDEX and one COMMENT
  and nothing else, which `scripts/migration-0098-staging-index.test.mjs` pins.
- **It does not prove the plan on production.** A plan depends on production's
  statistics and ledger; the rehearsal proves the switch on 20000 rows, and no verdict
  in this sitting asserts a plan.
