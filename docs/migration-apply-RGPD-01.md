# RGPD-01 production apply: per-patient RGPD consent, captured at creation

**Status: NOT APPLIED, AND NOT YET APPLICABLE.** Read "Why this cannot run today"
before anything else. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts
the sitting.

| Fact | Value |
|---|---|
| Branch | `patients/RGPD-01-consent-at-creation` (held, never armed, merges only after this apply) |
| Migration | `packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql`, sha256 `7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454` |
| Pin | `origin/patients/RGPD-01-consent-at-creation` — this migration is NOT on main and must not be, so the pin is the branch and never `origin/main` |
| Journal | **NOT ALLOCATED.** The file is unnumbered by design; see below |
| What it does | Creates ONE table, `public.patient_rgpd_acceptances`, with its index, RLS, two policies and its grants. No column on any existing table, no function, no trigger, no data written or backfilled. ADDITIVE |
| Card | `RGPD-01` (owner ruling Q-RGPD-NEW = b) |

## Why this cannot run today, and that is deliberate

`packages/db/migrations-pending/` is invisible to the applier by construction:
`drizzle-kit migrate` reads `packages/db/migrations` and its journal, and this is
a sibling directory. **There is no number to give this file yet.** 0089 is applied
on production but its file still sits on the PR #1338 branch, and two other
branches — CARE-01 and B8 — already hold a `NEXT-AFTER-0089` of their own. Whoever
merges first takes 0090; a number written here now would be a number written
twice, which is the exact defect `migrations-pending` exists to prevent (INC-07).

So this document pins the CONTENT and refuses to apply it. Stage 1 below proves
the approved file is the file on disk and that production does not already carry
the table. **Stage 2 cannot be written until the number is known**, because the
tag, the journal `idx` and the `when` are all inputs to it.

## The promotion, which happens BEFORE any apply

Per `packages/db/migrations-pending/README.md`, and the rename is the only edit:

1. rename to `packages/db/migrations/<NNNN>_patient_rgpd_acceptances.sql`, where
   `<NNNN>` is one above the highest number then on `origin/main`;
2. add its `meta/_journal.json` entry, with a `when` above every `when` on main;
3. mirror it with `node scripts/sync-supabase-migrations.mjs`;
4. run `pnpm db:check-journal`;
5. fill in the Journal row of this table, write stage 2 against the numbered
   path, and re-measure the sha256 — **the rename does not change the body, so
   the hash above must still match; if it does not, the body was edited and this
   document is describing a file that no longer exists.**

Until step 1 lands on this branch, the only block below is the read-only one.

## STAGE 1: the pre-check. READ-ONLY, and it refuses rather than applies

Pasted into an interactive zsh. Every parameter is braced — `${NAME}:`, never
`$NAME:`, which zsh reads as a modifier and which is what stopped the 0085
sitting. `scripts/owner-blocks-survive-zsh.test.mjs` enforces that on this file.

```
(
set -eo pipefail
SHAMIG=7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454
BRANCH=origin/patients/RGPD-01-consent-at-creation

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/rgpd01-precheck.out

echo "--- the pin, and the tree holds nothing but the checkout"
git fetch origin --prune
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse ${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
echo "running from ${PIN}"

echo "--- the migration is the approved file, by sha256"
test -f packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql || { echo "STOP: the pending migration is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql | cut -d' ' -f1)" = "${SHAMIG}" ] || { echo "STOP: the pending migration on disk is not the approved file"; exit 1; }

echo "--- it is still UNNUMBERED, so there is nothing to apply yet"
NUMBERED=$(ls packages/db/migrations | grep patient_rgpd_acceptances || true)
[ -z "${NUMBERED}" ] || { echo "STOP: it has been promoted to ${NUMBERED} - use the numbered apply, not this block"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- READ-ONLY pre-check: production must NOT already carry the table"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY;" -c "SELECT 'the table is absent' AS check, coalesce(to_regclass('public.patient_rgpd_acceptances')::text, 'absent') AS observed, 'absent' AS expected, CASE WHEN to_regclass('public.patient_rgpd_acceptances') IS NULL THEN 'OK' ELSE 'FAIL' END AS verdict;" -c "ROLLBACK;" 2>&1 | tee /tmp/rgpd01-precheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/rgpd01-precheck.out && { echo "STOP: a verdict read FAIL"; exit 1; }

echo "RGPD-01 PRE-CHECK PASSED. The migration is approved and unapplied. Promote it before applying."
)
```

## STAGE 2: the apply

**NOT WRITTEN YET, ON PURPOSE.** It needs the tag, the journal `idx` and the
`when`, none of which exist while the file is unnumbered. Writing it now would
mean writing a command against a path that does not exist, which is the SR-61
symptom this project already paid for once: the owner pastes it, gets "No such
file or directory", and it is indistinguishable from a script that was never
merged.

When the promotion lands, stage 2 is the ordinary two-stage apply of
`docs/runbook-prod-migrations.md`, with the post-check asserting: the table
exists; RLS is enabled on it; it carries exactly two policies, both named in the
migration; `authenticated` holds SELECT and INSERT and does NOT hold UPDATE,
DELETE or TRUNCATE; the `patient` role holds nothing; and `patients` has gained
no column.

## What changes for the clinic, and when

**Nothing, until reception ticks the box.** The table arrives empty. Every
existing patient has no row in it, which is exactly what makes them read
`RGPD em falta` on the ficha without the migration touching a single existing
row. The tick on the create form is optional and refuses nothing: a patient
registered without it is a normal registration with a visible mark, which is the
owner's ruling (Q-RGPD-NEW = b) rather than an implementation convenience.

## Order

The PR is **HELD** and unarmed. Promote, apply, then merge — a merge before the
apply would put a read of `patient_rgpd_acceptances` on production against a
table that does not exist, and the ficha would throw for every patient.
