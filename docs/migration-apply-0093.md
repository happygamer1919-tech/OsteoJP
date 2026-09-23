# 0093: apply RGPD-01, the per-patient RGPD consent table

**Status: NOT APPLIED.** One migration, `packages/db/migrations/0093_patient_rgpd_acceptances.sql`
on the branch below. Any `STOP:` line, any `FAIL` verdict or any `ERROR` halts the
sitting.

**This document is written at the standard `docs/migration-apply-0092.md` set,
section for section,** and nothing is carried over from 0092's numbers: every count
below was read off production READ ONLY on 2026-09-23 or measured on a throwaway
standing at production's position, and the transcript is the rehearsal section near
the end.

| Fact | Value |
|---|---|
| Card | `RGPD-01` |
| Ruling | Owner, Q-RGPD-NEW = (b): the RGPD consent is asked at patient creation and is NOT required; a patient without it reads "RGPD em falta" until it is recorded. Number ruled 2026-09-22: **0093** |
| Migration | `packages/db/migrations/0093_patient_rgpd_acceptances.sql`, sha256 `7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454` |
| Promoted from | `packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql`, **bytes unchanged**, on 2026-09-23 |
| Journal | `idx 90`, `when 1788501400000`, tag `0093_patient_rgpd_acceptances` |
| Must follow | `0092_care_team_location`: applied to production (journal row id 90, sha256 `23964a4b…abfa`), merged to main 2026-09-23 in #1426 |
| Branch | `patients/RGPD-01-consent-at-creation`, PR #1399, labelled `held-for-apply` |
| Before the sitting | PR #1399 reads **all required checks green on the head being applied**. It cannot until the GATE-CHANGE **#1436**, which teaches the frozen `scripts/import/cleanup-test-patients.test.mjs` the new table, has merged and main has been merged into this branch: the table is a child of `patients`, so that test goes red the moment 0093 is a numbered migration. This is checked by the operator before stage 0, not by a block |
| This document | `docs/migration-apply-0093.md`, pinned by `docs/migration-apply-0093.sha256` and asserted in STAGE 0 and again in STAGE 1 |
| Pre-check | `scripts/db/precheck-rgpd.sql`, READ ONLY, 15 verdicts, sha256 `7741655847f34fe8dd04c6709e194d68e55113352895a01be9f08ee607005883` |
| Post-check | `scripts/db/postcheck-rgpd.sql`, READ ONLY, 14 verdicts, sha256 `7c2067b9de12d3b0cbdc75b8c97c83b6726f0b92afacd8ef554bd407ac6a9a35` |
| Behaviour check | `scripts/db/behaviour-rgpd-readonly.sql`, READ ONLY, 7 arms, sha256 `0acff2e2c31a1fb6cb81c48ad6fb3f156f6a0de7e7d9d69947c956de86005469`. Run TWICE in this sitting, before the apply and after it, with the same actor |
| Behaviour actor | `4750c272-8559-466d-8d8a-b6898be93e06`, an active reception user, passed as `-v actor_id` |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `a1f51b44`, both pinned in every block that runs them |
| What it creates | ONE table (`public.patient_rgpd_acceptances`) with ONE index, row level security ENABLED, SELECT and INSERT granted to `authenticated`, UPDATE, DELETE and TRUNCATE revoked from it, everything revoked from the portal `patient` role, and TWO policies: a tenant SELECT, and an INSERT that pins `recorded_by` to the acting user |
| What it never touches | every existing table, policy, function and grant. The post-check proves the policies by one md5 over all of them, and the function count by the SECURITY DEFINER count |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0093.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter that a colon follows is braced, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces, and
now reads this document by its number). No backslash continuations, and no `!` except
as the `test !` operator followed by a space. Narration is `echo`.

**Each stage derives the head from `origin/patients/RGPD-01-consent-at-creation`, not
`origin/main`.** PR #1399 is held until this apply succeeds, so `origin/main` cannot
contain the migration at the moment the apply runs.

**Apply before merge, and why it matters more here than for a policy change.** The
app code on #1399 reads and writes this table. Merged before the apply, patient
creation would call a table that does not exist.

## STAGE 0: verify the promotion and the number

**This stage PROVES the promotion; it never performs it.** The promotion happened on
the branch on 2026-09-23: the pending file was renamed into `packages/db/migrations/`
with its bytes unchanged, the journal entry was written, and the supabase mirror was
generated by `node scripts/sync-supabase-migrations.mjs`.

**The promoted file's own header still reads "PARKED, NOT NUMBERED" and names
`NEXT-AFTER-0089`.** That is stale, and it is left stale on purpose: a promotion does
not touch one byte of the file, which is the only reason the sha256 above can pin
anything. Read the header as a record of when the file was authored, and
`packages/db/migrations-pending/README.md`'s Promoted table for where it now sits.

The number is the apply authorisation, ruled 2026-09-22: `0092` CARE-LOC, **`0093`
RGPD-01**, `0094` the users/tenants role fix, `0095` the grants revoke, `0096` the
conflict check's patient name. Exactly one `packages/db/migrations/0093_*.sql` may
exist; if anything else is ever found under `0093_`, **STOP**.

```
(
set -eo pipefail
SHA=7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454
BRANCH=patients/RGPD-01-consent-at-creation
MIG=packages/db/migrations/0093_patient_rgpd_acceptances.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql
DOCPIN=docs/migration-apply-0093.sha256

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }

test -f ${MIG} || { echo "STOP: 0093 is not on disk; the promotion is not on this branch"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0093 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N93=$(find packages/db/migrations -maxdepth 1 -name '0093_*.sql' | wc -l | tr -d ' ')
[ "${N93}" = 1 ] || { echo "STOP: ${N93} files claim migration number 0093, not 1"; exit 1; }

pnpm db:check-journal
echo "PROMOTION AND NUMBER VERIFIED"
)
```

**EXPECT: `PROMOTION AND NUMBER VERIFIED`, and nothing else is expected of this
stage.** It reads no database and prints no count. `pnpm db:check-journal` must print
**91 `.sql` files against 91 journal entries**, `when` strictly increasing, the
supabase mirror matching by CONTENT. The newest entry is `idx 90`,
`when 1788501400000`, tag `0093_patient_rgpd_acceptances`, and stage 1 re-proves it by
sha256 through `verified-migrate.mjs`. If the count is not 91, **STOP**.

## What is new here, because 0093 is not shaped like 0092

0092 ALTERed one policy, so its pre-check proved a policy PRESENT and its post-check
proved no count moved. **0093 CREATES**, so this is 0091's shape: the pre-check proves
the table, its index and both its policies ABSENT (`CREATE TABLE IF NOT EXISTS` would
silently adopt a table already there, rows and all; `CREATE POLICY` would ERROR part
way through the file), and the post-check asserts the deltas: **+2** policies, **+1**
public table, **+0** SECURITY DEFINER functions, and every existing policy
byte-identical by one md5.

There are **five** carries: `journal_rows_before`, `policies_before`,
`secdef_functions_before`, `public_tables_before`, `other_policies_md5`. No carry's
name is a substring of another's or of any other row's `check` column, because stage
2's `carry()` matches column 1 with `index()`.

**The behaviour check runs TWICE, as an A/B on production itself.** Before the apply
the table does not exist, and the check must say so: every table arm FAILS,
`2 OK / 0 VACUOUS / 5 FAIL`, failing on exactly R2, R3, R4, R5 and R6. After the apply
the table exists and ships EMPTY, so R2 and R3 have zero comparands:
`5 OK / 2 VACUOUS / 0 FAIL`, exactly. The two VACUOUS arms are
expected and named; any other profile halts.

**What a READ ONLY check cannot measure** is an INSERT, and so the `recorded_by` pin
in action. No production write is allowed, not even a rolled-back one. The pin is
proven as an EXACT EXPRESSION on production (R5 and post-check 9 compare the INSERT
policy's WITH CHECK to its md5, so an added OR fails them) and as a shape in
CI (`packages/db/tests/patient-rgpd-acceptances.db.test.ts`, which RUNS now that 0093
is a numbered migration CI applies, reads the same policy and refuses a real UPDATE
and DELETE). It is proven IN ACTION only by the rehearsal below, which inserts as the
actor and as somebody else. Neither this sitting nor CI performs that INSERT.

## The behaviour actor is named, and why

`4750c272-8559-466d-8d8a-b6898be93e06` is an active reception user. The consent table is read by every staff role
that can open a ficha, and reception is the role that records a consent at the desk,
so it is the actor whose view matters. The file verifies the actor (active, not a
shared resource, holds a role) and checks that `auth.uid()`, `jwt_tenant_id()` and
`jwt_role()` answer for the claims it set before it reads anything. If the actor is
deactivated before the sitting, the file STOPs before the apply. Report it; do not
substitute another actor.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from:"
git rev-parse origin/patients/RGPD-01-consent-at-creation
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.** That is
the comparand: stage 0 is where the promotion, the number, the sidecar and the journal
were verified.

**This branch carries the label `held-for-apply`.** Once the GATE-CHANGE #1434 is
merged, `.github/workflows/auto-update-prs.yml` does not merge main into it. Until
then it still can, and a moved head means opposite things depending on WHEN:

- **Before stage 1 has applied:** the sitting starts again from stage 0.
- **After stage 1 has applied: NEVER go back to stage 1.** Go on to stage 2 on the new
  head. Stage 2 asserts the migration, the post-check and the guard by sha256, so a
  merge of main that left those bytes alone changes nothing it reads, and one that
  changed them halts it. Both shas go on the SR-51 card.

**Two halts that case can produce, named so they are not improvised around.** Two
pinned files live on main, not only on this branch: `scripts/assert-production-target.mjs`
(pinned by stages 1, 2 and 3) and `packages/db/scripts/verified-migrate.mjs` (stage 1).
If a merge of main changes the guard after stage 1 has applied, stage 2 or stage 3
stops on `the target guard on disk is not the approved file`, with production already
applied. The applied-marker is good for **60 minutes**. Do not edit a pin and do not
re-run stage 1. Report it to the owner with both shas; the post-check and the
behaviour check are READ ONLY and can be re-issued against the new guard.

Stage 1 refuses to start while a fresh applied-marker exists, and it never touches the
previous transcripts until a new pre-check AND a new before-run have passed.

## STAGE 1: pre-flight, pre-check, the instrument BEFORE, apply

```
(
set -eo pipefail
SHA0093=7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454
SHAPRE=7741655847f34fe8dd04c6709e194d68e55113352895a01be9f08ee607005883
SHABEHAVIOUR=0acff2e2c31a1fb6cb81c48ad6fb3f156f6a0de7e7d9d69947c956de86005469
ACTOR=4750c272-8559-466d-8d8a-b6898be93e06
BRANCH=patients/RGPD-01-consent-at-creation

SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0093-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0093-precheck.new /tmp/0093-behaviour-before.new

echo "--- ASSERTION 1, THE HEAD. The sha printed next MUST equal the one the HEAD CHECK showed."
git fetch origin --prune
git rev-parse origin/${BRANCH}

echo "--- pre-flight: the tree holds nothing but the checkout"
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "applying from ${PIN}"

echo "--- SR-58: this stage checks out its own ref and proves the files"
git checkout -q --detach ${PIN}
test -f docs/migration-apply-0093.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0093.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0093_patient_rgpd_acceptances.sql || { echo "STOP: 0093 is not on disk"; exit 1; }
test -f scripts/db/precheck-rgpd.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-rgpd-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N93=$(find packages/db/migrations -maxdepth 1 -name '0093_*.sql' | wc -l | tr -d ' ')
[ "${N93}" = 1 ] || { echo "STOP: ${N93} files claim migration number 0093, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0093_patient_rgpd_acceptances.sql | cut -d' ' -f1)" = "${SHA0093}" ] || { echo "STOP: 0093 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-rgpd.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-rgpd-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-rgpd.sql 2>&1 | tee /tmp/0093-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0093-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0093-precheck.new || true)
[ "${OKS}" = 15 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 15"; exit 1; }

echo "--- the behaviour check BEFORE the apply. READ ONLY. The table does not exist yet: R2 to R6 FAIL, and nothing else"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${ACTOR} -f scripts/db/behaviour-rgpd-readonly.sql 2>&1 | tee /tmp/0093-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0093-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
FAILSET=$(grep -E '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0093-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | sort | tr '\n' ' ' || true)
[ "${FAILSET}" = "R2 R3 R4 R5 R6 " ] || { echo "STOP: before the apply the behaviour check must FAIL on exactly R2, R3, R4, R5 and R6. It failed on [${FAILSET}]"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0093-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "2 OK / 0 VACUOUS / 5 FAIL" ] || { echo "STOP: before the apply the profile must read 2 OK / 0 VACUOUS / 5 FAIL. It read ${PROFILE}"; exit 1; }
echo "the instrument sees the table is absent: ${PROFILE}, failing on ${FAILSET}"

echo "--- only now, with a passing pre-check and a discriminating instrument in hand, does the previous sitting's state go"
rm -f /tmp/0093-postcheck.out /tmp/0093-behaviour-after.out /tmp/0093-applied.ok
mv /tmp/0093-precheck.new /tmp/0093-precheck.out
mv /tmp/0093-behaviour-before.new /tmp/0093-behaviour-before.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0093_patient_rgpd_acceptances --sha256 ${SHA0093} --expect-pending 1
touch /tmp/0093-applied.ok
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the pre-check prints `15` OK verdicts and no FAIL;**
- **the behaviour check BEFORE prints `2 OK / 0 VACUOUS / 5 FAIL`, failing on exactly
  `R2`, `R3`, `R4`, `R5` and `R6`.** Those five FAILs are correct and required: the
  table does not exist yet. A run that failed on anything else halts here with nothing
  applied;
- **`pending    1  [0093_patient_rgpd_acceptances]`.** Exactly one.

It then prints `journal    90 -> 91  (delta 1)` and
`0093_patient_rgpd_acceptances present by sha256: yes`. Stage 2 re-reads both from the
database rather than trusting this line.

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
If it lists 0093 as APPLIED, production is applied and no marker exists, so stage 2
will refuse: stop and ask the owner to rule. **If it lists 0093 as NOT APPLIED,
nothing changed:** drizzle applies the file's statements and the journal row in ONE
transaction (measured for 0092 by refusing a statement part way). Stop and report the
exit code and the drizzle output. Do not re-run stage 1 on your own.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0093=7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454
SHAPOST=7c2067b9de12d3b0cbdc75b8c97c83b6726f0b92afacd8ef554bd407ac6a9a35
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=patients/RGPD-01-consent-at-creation

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

echo "--- ASSERTION 1, THE HEAD. Record the sha printed next beside the one stage 1 applied from. If it has MOVED, carry on: never go back to stage 1 after an apply. Everything this stage reads is asserted by sha256 below."
git fetch origin --prune
git rev-parse origin/${BRANCH}

echo "--- SR-58 again. This stage inherits nothing from stage 1"
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
test -f packages/db/migrations/0093_patient_rgpd_acceptances.sql || { echo "STOP: 0093 is not on disk"; exit 1; }
test -f scripts/db/postcheck-rgpd.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0093_patient_rgpd_acceptances.sql | cut -d' ' -f1)" = "${SHA0093}" ] || { echo "STOP: 0093 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-rgpd.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0093-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0093-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0093-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0093-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
S=$(carry secdef_functions_before)
T=$(carry public_tables_before)
O=$(carry other_policies_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${S}" ] && [ -n "${T}" ] && [ -n "${O}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} secdef_before=${S} public_tables_before=${T} other_policies_md5=${O}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0093-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v secdef_before="${S}" -v public_tables_before="${T}" -v other_policies_md5="${O}" -c "begin read only" -f scripts/db/postcheck-rgpd.sql -c "rollback" 2>&1 | tee /tmp/0093-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0093-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0093-postcheck.out || true)
[ "${OKS}" = 14 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 14"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0093 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0093}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0093 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0093 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0093 APPLIED. 15/15 pre-check OK, 14/14 post-check OK, journal ${J} to ${JA}."
)
```

**EXPECT:** the carry line reads `journal_before=90`; the post-check prints `14` OK
verdicts and no FAIL; the journal reads `90` before and `91` after, with 0093's sha256
in it **exactly once**; the final line reads exactly
`0093 APPLIED. 15/15 pre-check OK, 14/14 post-check OK, journal 90 to 91.`

## STAGE 3: the behaviour check AFTER the apply. READ ONLY

Same file, same actor as stage 1's BEFORE run, so the two transcripts are an A/B on
the database itself.

```
(
set -eo pipefail
SHABEHAVIOUR=0acff2e2c31a1fb6cb81c48ad6fb3f156f6a0de7e7d9d69947c956de86005469
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
ACTOR=4750c272-8559-466d-8d8a-b6898be93e06
BRANCH=patients/RGPD-01-consent-at-creation
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f scripts/db/behaviour-rgpd-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-rgpd-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
test -f /tmp/0093-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0093-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${ACTOR} -f scripts/db/behaviour-rgpd-readonly.sql 2>&1 | tee /tmp/0093-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0093-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0093-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0093-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0093-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${AFTER}" = "5 OK / 2 VACUOUS / 0 FAIL" ] || { echo "STOP: after the apply the profile must read 5 OK / 2 VACUOUS / 0 FAIL: the table empty. It read ${AFTER}"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0093-behaviour-after.out | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | sort | tr '\n' ' ' || true)
[ "${VACSET}" = "R2 R3 " ] || { echo "STOP: the two VACUOUS arms must be R2 and R3, the two with a zero comparand on an empty table. They were [${VACSET}]"; exit 1; }
echo "RGPD-01 BEHAVES AS RULED AT THE RLS LAYER. before ${BEFORE}, after ${AFTER}. The INSERT pin in action is proven by the rehearsal, not by this READ ONLY transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, the profile EXACTLY `5 OK / 2 VACUOUS / 0 FAIL`, and
the two VACUOUS arms exactly R2 and R3**, which the block asserts. R2 and R3 are
VACUOUS because the table ships empty: their comparands are zero. That is expected today and says nothing wrong; it is also why this
transcript is not the proof that the policies admit and refuse the right rows. That
proof is the rehearsal below, which loads rows. CI's DB-gated suite proves the
privileges and the policy shapes, on an empty table. **Re-run
later, once reception has recorded consents, the profile changes** (R2 becomes OK), and
that is the data moving, not a regression.

## What every verdict must read

- **Pre-check, 15 rows, all `OK`:** 0 the transaction is READ ONLY; 1 the table is
  ABSENT; 2 its index is ABSENT; 3 neither policy exists; 4 0093 absent from the
  journal by hash; 5 0092 present by hash; 6 the newest `when` is below 0093's
  `1788501400000`; `journal_rows_before` **90**; `policies_before` (production read
  **93** on 2026-09-23); `secdef_functions_before`, every one owned by `postgres`
  (**26**); `public_tables_before` (**47**); `other_policies_md5` (production read
  `a8044a3327d5d5656833fb9606e94ebf`); 7 the three FK parents exist; 8 the roles `authenticated` and
  `patient` exist; 9 the helpers `jwt_tenant_id` and `auth.uid` exist.
- **Post-check, 14 rows, all `OK`:**

1. the table exists, exactly once;
2. row level security is ENABLED on it;
3. exactly two indexes: the primary key, and the plain (not UNIQUE, not partial)
   index whose definition is EXACTLY `... USING btree (tenant_id, patient_id, accepted_at DESC)`;
4. the not-blank CHECK is exactly `CHECK ((btrim(rgpd_version) <> ''::text))`, and the
   three foreign keys go to `public.patients`, `public.users` and `public.tenants`, each
   NO ACTION on delete and update: a consent record never vanishes in a cascade;
5. `authenticated` may SELECT and INSERT, and may NOT UPDATE, DELETE or TRUNCATE. The
   two positives are the control for the three negatives;
6. the portal `patient` role and `anon` hold none of the seven table privileges,
   TRUNCATE included, because TRUNCATE ignores row level security;
7. exactly two policies on the table, and none for UPDATE, DELETE or ALL;
8. the SELECT policy is PERMISSIVE, `FOR SELECT`, `TO authenticated`, and its USING
   is EXACTLY `(tenant_id = jwt_tenant_id())`, compared by md5
   (`5b37a2d7c011bd469945c04a0c99f85c`);
9. the INSERT policy is PERMISSIVE, `FOR INSERT`, `TO authenticated`, and its WITH
   CHECK is EXACTLY `((tenant_id = jwt_tenant_id()) AND (recorded_by = auth.uid()))`,
   compared by md5 (`6d13847414c740c8540fbcef55bb6c68`). A LIKE would pass the same
   text with `OR true` added; the md5 does not, and the rehearsal proves it;
10. the POLICY COUNT is `policies_before` **+ 2**;
11. the SECURITY DEFINER count equals `secdef_before`;
12. the public table count is `public_tables_before` **+ 1**;
13. every OTHER policy still hashes, as one value, to `other_policies_md5`;
14. the table ships EMPTY.

**Verdict 14 is true at the sitting and not forever.** The moment reception records a
consent it stops being empty; re-running the post-check then would read FAIL on 14
alone. It is an assertion about the apply, not an invariant.

| Behaviour verdict | What it proves | BEFORE | AFTER, production |
|---|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK | OK |
| R1 | the session IS the named actor | OK | OK |
| R2 | the actor reads exactly their tenant's consent rows | **FAIL** (no table) | VACUOUS (none yet) |
| R3 | the actor reads no row of another tenant | **FAIL** (no table) | VACUOUS (no rows yet) |
| R4 | append-only: no UPDATE, DELETE or TRUNCATE for `authenticated` | **FAIL** (no table) | OK |
| R5 | the control: SELECT and INSERT, and the INSERT check is exactly tenant AND `recorded_by = auth.uid()` (md5) | **FAIL** (no table) | OK |
| R6 | the portal `patient` role and `anon` hold nothing, of all seven privileges | **FAIL** (no table) | OK |

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 91, 0093 by hash | stage 2, and `read-applied-migrations.mjs` | the database |
| the table is append-only and tenant-scoped | post-check 5 to 9, behaviour R4 to R6 | the catalogue and the privileges |
| a staff member reads their tenant's consents and no other tenant's | behaviour R2 and R3, **VACUOUS on production on apply day**; proven with rows on the rehearsal only | RLS |
| `recorded_by` is pinned to the acting user | the shape by post-check 9, R5 and the CI suite; the behaviour by the rehearsal's INSERT arms only | RLS, WITH CHECK |
| the consent is asked at patient creation and the ficha reads "RGPD em falta" until given | **NOT DISCHARGED BY THIS DOCUMENT.** The app code ships when #1399 merges, after the apply; the screen check is the owner's | the route |

## Rehearsed on 2026-09-23 on a throwaway standing at production's position

**Where it ran.** A throwaway Postgres 17 database cloned from a snapshot that
matches production on every fingerprint this document relies on, each read on
2026-09-23 on production READ ONLY and on the snapshot:

| Fingerprint | Production | Throwaway |
|---|---|---|
| journal rows / newest `when` | 90 / 1788501300000 | MATCH |
| md5 over every journal hash, in id order | `9767e394255b6aada496688473235a14` | MATCH |
| policies / md5 over every policy | 93 / `d23f9e7bcb700d2ec4fb38f3c9a3b20c` | MATCH |
| SECURITY DEFINER functions in `public` | 26 | MATCH |
| public tables | 47 | MATCH |
| `patient_rgpd_acceptances` | absent | MATCH |
| pre-check carry `other_policies_md5` | `a8044a3327d5d5656833fb9606e94ebf` | MATCH |

**How it ran.** The five blocks were extracted from this document verbatim and run
under `zsh -f` from a clone of a private bare origin holding this branch, with
exactly four substitutions, each COUNTED per block: `/tmp/` to a scratch directory
(substituted first), the `cd` line to the clone, the env line to the throwaway's
URL, and the production target guard's invocation to an `echo`. A block that
still named production after substitution would have been refused.

| Substitution | stage 0 | HEAD CHECK | stage 1 | stage 2 | stage 3 |
|---|---|---|---|---|---|
| `/tmp/` | 0 | 0 | 18 | 8 | 8 |
| `cd` | 1 | 1 | 1 | 1 | 1 |
| env | 0 | 0 | 1 | 1 | 1 |
| guard | 0 | 0 | 1 | 1 | 1 |

**The happy path, in order:**

| Arm | Exit | What it printed |
|---|---|---|
| stage 0 | 0 | `running from <head>`; check-journal 91 = 91; `PROMOTION AND NUMBER VERIFIED` |
| HEAD CHECK | 0 | the same sha |
| stage 1 | 0 | pre-check 15 OK; BEFORE `2 OK / 0 VACUOUS / 5 FAIL` on `R2 R3 R4 R5 R6`; `pending 1 [0093_patient_rgpd_acceptances]`; `journal 90 -> 91 (delta 1)`; present by sha256 |
| stage 2 | 0 | carries `journal_before=90 policies_before=93 secdef_before=26 public_tables_before=47 other_policies_md5=a8044a33…`; post-check 14 OK; `0093 APPLIED. 15/15 pre-check OK, 14/14 post-check OK, journal 90 to 91.` |
| stage 3 | 0 | `before 2 OK / 0 VACUOUS / 5 FAIL, after 5 OK / 2 VACUOUS / 0 FAIL` |

The journal's newest row after the apply: id 91, hash
`7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454` (the file's
sha256), `when` 1788501400000, present exactly once.

**Every halt, each run for real:**

| Arm | Exit | Halted on | Database after |
|---|---|---|---|
| stage 0 on a dirty tree | 1 | `the apply worktree is not clean` | untouched |
| stage 2 before stage 1 | 1 | `stage 1 did not complete an apply in this sitting` | untouched |
| stage 3 before stage 1 | 1 | `stage 1's BEFORE transcript is missing` | untouched |
| stage 1 a second time in the sitting | 1 | `stage 1 ALREADY APPLIED`; both transcripts byte-identical | journal 91 |
| stage 2 with the transcript backdated 61 minutes | 1 | `over an hour old` | journal 91 |
| stage 2 with the marker removed | 1 | `did not complete an apply` | journal 91 |
| stage 1 on the APPLIED database, marker gone | 1 | pre-check FAIL on 1, 2, 3, 4, 6 and `journal_rows_before`; the previous transcript byte-identical, the failed run in `.new` | journal 91, nothing re-applied |
| stage 3 with UPDATE granted back to `authenticated` | 1 | R4 FAIL, `U=true` | restored |
| stage 3 with the INSERT policy recreated WITHOUT `recorded_by` | 1 | R5 FAIL, `pin=false` | restored, then stage 3 green again |
| stage 3 with rows loaded | 1 | the exact profile: `It read 7 OK / 0 VACUOUS / 0 FAIL`. By design: the data moved | |
| stage 1 with the table already created by hand | 1 | pre-check 1, 2, 3 FAIL | journal 90, nothing applied |
| stage 1 with only a bare table present | 1 | pre-check 1 FAIL | journal 90, nothing applied |
| stage 1 with the named actor deactivated | 3 | the behaviour file's actor STOP, before the apply | journal 90, table absent |
| stage 1 with 0092 missing from the journal | 1 | pre-check 5 and `journal_rows_before` FAIL | journal 89, nothing applied |
| stage 0 with a second `0093_*.sql` pushed to the branch (private origin only, reset after) | 1 | `2 files claim migration number 0093, not 1` | untouched |
| a write inside the READ ONLY form stage 2 uses | 1 | `cannot execute CREATE TABLE in a read-only transaction` | no table created |

**The post-check's carries, each broken on the applied database:** correct carries
14 OK; a wrong `other_policies_md5` FAILs 13; a wrong `policies_before` FAILs 10; a
wrong `public_tables_before` FAILs 12; `other_policies_md5` omitted STOPs with exit
3; an UPDATE policy added on the table FAILs 7, 10 and 13; a table with a policy
added elsewhere FAILs 10, 12 and 13. Back to clean: 14 OK.

**The INSERT pin in action, which no READ ONLY check can show.** On the applied
throwaway, as the named actor (flat claims, `SET LOCAL ROLE authenticated`):

| Arm | Result |
|---|---|
| I1 insert, own tenant, `recorded_by` = the actor | `INSERT 0 1` |
| I2 insert, own tenant, `recorded_by` = a colleague | refused: `new row violates row-level security policy` |
| I3 insert, another tenant, `recorded_by` = the actor | refused: the same |
| I4 UPDATE of the actor's own row | refused: `permission denied` |
| I5 DELETE of the actor's own row | refused: `permission denied` |
| I6 TRUNCATE | refused: `permission denied` |
| I7 the portal `patient` role SELECTs | refused: `permission denied` |
| I8 a blank version | refused by `patient_rgpd_acceptances_version_not_blank` |

With one row for the actor's tenant and one written as the owner for another
tenant, the behaviour check read `7 OK / 0 VACUOUS / 0 FAIL`: R2 `1 read of 1`, R3
`0 read of 1 that exist`. That is the proof R2 and R3 cannot give on production on
apply day.

**CI's DB suite on the same shapes.** `packages/db/tests/patient-rgpd-acceptances.db.test.ts`
against the applied throwaway: 9 passed. Against the unapplied snapshot: 9 skipped,
which is the suite's schema gate saying "not measured".

**The patient cleanup script.** On the applied throwaway with a consent row for each
of the tenant's patients: `main`'s `scripts/import/cleanup-test-patients.sql`
aborts on `violates foreign key constraint "patient_rgpd_acceptances_patient_id_fkey"`,
exit 3, nothing deleted. This branch's version completes, exit 0, patients and
consent rows both 0.

## What this does NOT do

- **It records no consent and backfills nothing.** Every existing patient simply has
  no row, which is what makes them read "RGPD em falta" without one row being touched.
- **It changes no existing table, policy, function or grant.** Post-check 11 and 13
  prove the function count and every other policy unchanged.
- **The append-only rule binds `authenticated`, and NOT `service_role`.** Supabase's
  default privileges give `service_role` full rights on every new table in `public`,
  as they do for every other table, and it bypasses RLS. Not a regression and not
  something this file could fix; the privileges this document asserts are
  `authenticated`'s, `patient`'s and `anon`'s.
- **One test-infrastructure entry goes stale, and it is NOT harmless.** `.github/scripts/assert-rls-executed.mjs`
  lists this table's DB suite in `PERMITTED_SKIPS`, because until now CI could not
  apply the migration. Now that it can, the suite runs. But the entry is read exactly
  when the suite skips, and the suite skips on any probe error, so while the entry
  stands a future skip would print PERMITTED inside a green required check. It cannot
  be deleted before this PR merges (main still skips until then), and the file is
  frozen, so it goes in a GATE-CHANGE **immediately after this PR merges**, together
  with the now-inert `AHEAD_OF_MIGRATION` entry #1436 adds and the cleanup test's
  floor raised from 19 to 20.
