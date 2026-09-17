# NESA-NAMES: apply the shared-resource patient-name function

**Status: NOT APPLIED.** One migration, currently UNNUMBERED in
`packages/db/migrations-pending/`. Any `STOP:` line, any `FAIL` verdict or any
`ERROR` halts the sitting.

**Authored by BLUE. Applied by GREEN, or by the owner.** BLUE has no production
access and has run every byte below against a throwaway database and nothing
else.

| Fact | Value |
|---|---|
| Card | `NESA-NAMES` |
| Request | Owner, 2026-09-17: every therapist must see the patient's name on NESA bookings instead of "Marcação reservada" |
| Ruling | Strategy, 2026-09-17: the name on any appointment held by a shared-resource staff row installed at a clinic where that therapist is installed; the same card fields their own appointments show and **nothing more**; no ficha, phone or NIF; reception, owner and portal unchanged; a narrow SECURITY DEFINER function, **never a wider policy on `patients`** |
| File | `packages/db/migrations-pending/NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql`, sha256 `cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642` |
| Becomes | `packages/db/migrations/0090_nesa_patient_name_for_therapists.sql` at promotion, **bytes unchanged** |
| Must follow | `0089_attachments_soft_delete` (applied 2026-09-16, journal `idx 86`) |
| Branch | `sched/B8-nesa-names-to-therapists` |
| Post-check | `scripts/db/postcheck-nesa-names.sql`, sha256 `ebda1b85b3bef488f6ecee73b3749dbba913c5b0f7f0610478105e6a831ca7ea` |
| What it creates | ONE function, `public.shared_resource_appointment_patient_names()`. No table, no column, no policy, no trigger |
| What it never touches | `patients_select`, `appointments_rls`, 0088's shared-resource policy, and every other policy in the schema |

**Each stage derives the head from `origin/sched/B8-nesa-names-to-therapists`,
not `origin/main`.** The PR is held until this apply succeeds, so `origin/main`
CANNOT contain the migration at the moment the apply runs. This is the same
correction `docs/migration-apply-0089.md` carries, for the same reason.

## STAGE 0: promotion. The number is taken HERE, not earlier

**Why this stage exists.** The file is unnumbered, and `drizzle-kit migrate`
reads `packages/db/migrations` and its journal only, so the applier cannot see
it. The alternative - applying the pending file directly with `psql` - would put
a function on production that the journal does not name, which is the drift that
bit 0042 and again 0089. So the number is taken, the journal entry is written,
and the ordinary applier does the work.

**`0090` is this file's number by the B8 dispatch's ordering.**
`NEXT-AFTER-0089_care_team.sql` (branch `care/CARE-01-assigned-therapists`, PR
#1374) also claims `NEXT-AFTER-0089`; the dispatch ruled NESA-NAMES goes first,
so care-team becomes `0091`. If care-team has been promoted in the meantime,
**STOP**: this file becomes `0091` and this document needs re-issuing.

```
(
set -eo pipefail
SHA=cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642
BRANCH=sched/B8-nesa-names-to-therapists

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

PEND=packages/db/migrations-pending/NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql
test -f ${PEND} || { echo "STOP: the pending migration is not on disk"; exit 1; }
[ "$(shasum -a 256 ${PEND} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the pending file is not the approved one"; exit 1; }
test ! -f packages/db/migrations/0090_care_team.sql || { echo "STOP: care-team already took 0090; this document must be re-issued for 0091"; exit 1; }
test ! -f packages/db/migrations/0090_nesa_patient_name_for_therapists.sql || { echo "STOP: 0090 already exists; promotion has already happened"; exit 1; }
echo "PROMOTION PRE-FLIGHT OK"
)
```

Then promote, **changing no byte of the body**:

```
(
set -eo pipefail
SHA=cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

git mv packages/db/migrations-pending/NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql \
       packages/db/migrations/0090_nesa_patient_name_for_therapists.sql
cp packages/db/migrations/0090_nesa_patient_name_for_therapists.sql \
   supabase/migrations/0090_nesa_patient_name_for_therapists.sql

# THE BYTES ARE ASSERTED AFTER THE RENAME TOO. A promotion is a rename and
# nothing else; if the digest moved, something edited the body.
[ "$(shasum -a 256 packages/db/migrations/0090_nesa_patient_name_for_therapists.sql | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: the body changed during promotion"; exit 1; }

echo "Now add the journal entry for idx 87, tag 0090_nesa_patient_name_for_therapists,"
echo "with a 'when' strictly greater than 0089's, then run:"
echo "  pnpm db:check-journal"
)
```

`pnpm db:check-journal` must print that the `.sql` files and the journal
reconcile in order with `when` strictly increasing and the supabase mirror
matching by CONTENT. If it does not, **STOP**.

## STAGE 1: the pre-check. READ ONLY

It asserts the function is ABSENT. That is what makes the post-check mean
something: a post-check that passes on a database which already had the function
proves nothing about this apply.

```
(
set -eo pipefail
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
\echo '=== 1. the function must be ABSENT ==='
SELECT count(*)::int AS observed, '0' AS expected,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names';

\echo '=== 2. the carries this apply must not move ==='
SELECT (SELECT count(*)::int FROM pg_policy) AS policies_before,
       (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef) AS secdef_functions_before;

\echo '=== 3. patients_select as it stands, which this apply may not change ==='
SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) AS patients_select_md5
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
 WHERE c.relname = 'patients' AND pol.polname = 'patients_select';
SQL
)
```

**Record `policies_before`, `secdef_functions_before` and
`patients_select_md5`.** Stage 2's post-check is given them.

## STAGE 2: the apply, then the post-check

```
(
set -eo pipefail
POLICIES_BEFORE=<from stage 1>
SECDEF_BEFORE=<from stage 1>
PATIENTS_MD5=<from stage 1>

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

pnpm db:migrate

SHAP=ebda1b85b3bef488f6ecee73b3749dbba913c5b0f7f0610478105e6a831ca7ea
test -f scripts/db/postcheck-nesa-names.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-nesa-names.sql | cut -d' ' -f1)" = "${SHAP}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off \
     -v policies_before=${POLICIES_BEFORE} -v secdef_before=${SECDEF_BEFORE} -v patients_md5=${PATIENTS_MD5} \
     -f scripts/db/postcheck-nesa-names.sql 2>&1 | tee /tmp/nesa-names-postcheck.out
grep -qE '\| FAIL' /tmp/nesa-names-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\| OK' /tmp/nesa-names-postcheck.out || true)
[ "${OKS}" = 14 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 14"; exit 1; }
echo "NESA-NAMES APPLIED"
)
```

The post-check asserts **fourteen** verdicts, each on its own row, and the stage
block above refuses unless all fourteen read OK:

1. the function EXISTS, exactly once;
2. it is `SECURITY DEFINER`;
3. it is owned by `postgres`, whose privileges it runs with;
4. `search_path` is pinned to `public`;
5. its result signature is exactly `appointment_id uuid, patient_name text`, and
   contains no `phone`, `nif`, `email` or `patient_id`;
6. `anon` has no `EXECUTE`;
7. the portal's `patient` role has no `EXECUTE`;
8. `service_role` has no `EXECUTE` (0079);
9. `authenticated` DOES. That is the positive control, without which 6, 7 and 8
   would be satisfied by a function nobody can call;
10. the POLICY COUNT equals `policies_before` — this migration creates none;
11. the SECURITY DEFINER function count equals `secdef_before` **+ 1**;
12. `patients_select`'s expression still hashes to `patients_md5`;
13. it still keys on `viewer_treated_patient_ids`;
14. and it names no `shared_resource` helper.

**THE JOURNAL IS DELIBERATELY NOT ONE OF THEM.**
`drizzle.__drizzle_migrations` identifies a migration by a `hash` whose
derivation the post-check would have to assume, and identifying one by tag is
the trap recorded against 0088 ("the journal id is not the tag"). The journal is
proven at **stage 0** instead: `pnpm db:check-journal` reconciles the files, the
entries, their order and the supabase mirror BY CONTENT, and drizzle's own apply
output names what it ran.

## Rehearsed on a throwaway database

A dedicated throwaway Supabase stack on `127.0.0.1:55512`, brought to **0089** by
applying `0089_attachments_soft_delete` read from PR #1338's branch (sha256
`ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced`, matching what
`docs/migration-postcheck-0089.md` asserts). #1338 was never modified and never
pushed to.

| Arm | Expected | Result |
|---|---|---|
| the suite at 0089 **without** this migration | cannot pass | **9 failed, 2 passed** - and the 2 are the arms that do not need the function (the patient row IS withheld; `patients_select` IS untouched) |
| apply this migration at 0089 | exit 0, function present | exit 0, `pg_proc` count 1 |
| the suite at 0089 **with** it | every arm passes | **11 passed, 0 failed** |
| the post-check, function applied | every verdict OK | **14 OK, 0 FAIL**, exit 0 |
| **negative control:** a wrong `secdef_before` carry | arm 11 FAILS | **FAIL** (`25` against an expected `26`) |
| **negative control:** a wrong `patients_md5` carry | arm 12 FAILS | **FAIL** (`30d5b2b6...` against `deadbeef`) |
| **negative control:** `policies_before` omitted | refuses, non-zero | **exit 3**, nothing read |

The carries on the throwaway were `policies_before=89`, `secdef_before=24`
(25 after the apply) and `patients_md5=30d5b2b6dd3e7154ec2b8475961bf296`.
Production's will differ, and stage 1 prints them.

`packages/db/tests/nesa-patient-name-for-therapists.db.test.ts` is that suite. It
runs in CI's DB-gated job on every PR.

## What this does NOT do

- **It shows nobody a name by itself.** The agenda has to ask, and the read that
  asks (`apps/web/lib/scheduling/data.ts`) ships in the same PR. Without the
  function that read returns nothing and every row passes through untouched,
  which is why the app half is safe on a database that has not been migrated.
- **It touches no policy.** `patients_select` is the ruling's central
  prohibition, and post-check items **12, 13 and 14** are its guard: the
  expression's hash, that it still keys on `viewer_treated_patient_ids`, and
  that it names no `shared_resource` helper. Item 10 adds that the POLICY COUNT
  did not move at all.
- **It does not reach the drawer.** `getAppointment` still renders "Marcação
  reservada"; the overlay is on the card surfaces only. Widening it is a
  separate ruling.
