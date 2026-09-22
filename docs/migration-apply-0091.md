# 0091: apply the care-team appointment history (CARE-01)

**Status: NOT APPLIED.** One migration, already promoted to
`packages/db/migrations/0091_care_team.sql` on the branch below. Any `STOP:`
line, any `FAIL` verdict or any `ERROR` halts the sitting.

**No CARE apply document has ever existed, so this one is written from
scratch** in the shape `docs/migration-apply-0090.md` settled on 2026-09-19,
section for section. Nothing here is edited from a predecessor and nothing is
carried over from 0090's numbers: every count below was measured against a
throwaway database standing at production's position, and the transcript is the
rehearsal section near the end.

| Fact | Value |
|---|---|
| Card | `CARE-01-assigned-therapists` |
| Request | Rodica, Linda-a-Velha, 2026-09-16: a patient is treated by several therapists over time and each needs that patient's full past history |
| Ruling | Owner, Q-CARE-1 = (c), 2026-09-16: a therapist may READ every appointment of a patient assigned to them by reception, **or of any patient they have themselves treated**, with **exactly the status set the measurement used**, which was no status filter at all. Visibility only: no booking right, no right to change or delete a colleague's appointment. Registos, episodes and documents are out of scope, because they were measured as already visible |
| Migration | `packages/db/migrations/0091_care_team.sql`, sha256 `bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f` |
| Promoted from | `packages/db/migrations-pending/NEXT-AFTER-0089_care_team.sql`, **bytes unchanged**, on 2026-09-21 |
| Journal | `idx 88`, `when 1788501200000`, tag `0091_care_team` |
| Must follow | `0090_nesa_patient_name_for_therapists` — applied to production 2026-09-19 (journal `idx 87`, row id 88), merged to main 2026-09-21 in #1390 |
| Branch | `care/CARE-01-assigned-therapists`, PR #1374 |
| This document | `docs/migration-apply-0091.md`, pinned by `docs/migration-apply-0091.sha256` and asserted in STAGE 0 and again in STAGE 1 |
| Pre-check | `scripts/db/precheck-care-team.sql`, READ ONLY, sha256 `1fe31122ac6b371aa43fd82271472c5952e6297fc91a9aa7d947b10e9351864b` |
| Post-check | `scripts/db/postcheck-care-team.sql`, READ ONLY, sha256 `7ba44f65dba515f8e63716eb06425204e889b524d1fa899f3b1a541f899b8b2a` |
| Behaviour check | `scripts/db/behaviour-care-team-readonly.sql`, READ ONLY, sha256 `578bcbdb9a4e7432f00458f5b322213481dfc586cb0a317c610b03a368405007` |
| Behaviour check AS IT RAN on 2026-09-21 | sha256 `7e5ebbaedf57a946e79e4eebb7b7e0cf6a673e4ceec5a074f660b56991fb0c0f`. The row above is the CURRENT file, not the one this sitting ran; see "The behaviour check has moved" below |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `60105a36` on 2026-09-21, both pinned in every block that runs them |
| What it creates | ONE table (`public.patient_care_team`, with three indexes), ONE function (`public.viewer_care_team_patient_ids()`), FOUR policies: three on the new table and **one** on `appointments` |
| What it never touches | `appointments_rls` — the FOR ALL policy whose USING governs SELECT, the rows an UPDATE may target AND the rows a DELETE may remove — and every clinical policy: `clinical_records`, `clinical_episodes`, `attachments`, storage |

## The behaviour check has moved since this sitting

**The pin in the table is the CURRENT file. This sitting ran a different one**, and
its digest is in the table too, in its own row, so it survives as a field a machine
can read rather than as prose. The 0091 apply ran
`7e5ebbae…`; on 2026-09-22 the file gained the three-value
verdict contract (OK / VACUOUS / FAIL plus a printed profile) on the owner's
ruling (#1430, digest `b8d6550c…`), and in the same day, in #1426, a
`MATERIALIZED` helper CTE and a 90-day bound, without which the file could not
finish on production: run as a real therapist it hit the 300-second statement
timeout. The file in the table carries both, digest `578bcbdb…`. It differs from the
first merged form, `e021c192…`, in comments only (production counts a reviewer found
in its header were removed), and BOTH digests were run, and measured
READ ONLY on production on 2026-09-22 standing at 0091: **one second, `6 OK / 2
VACUOUS / 0 FAIL`**, the two VACUOUS arms being B6 (the actor it chose holds no
live care-team assignment) and B7 (production holds one tenant). The transcript
recorded further down is the one that ran, unchanged.

**The pin is re-cut, and the honest reason is NOT "otherwise a re-run would halt".**
It would halt either way, and earlier: `BRANCH=care/CARE-01-assigned-therapists`
at line 470 names a branch that no longer exists on the remote (PR #1374 merged as
`23494a11` and the branch was deleted), so `git rev-parse origin/$BRANCH` exits 128
before the sha check is reached. That is pre-existing and is not this change. The
pin is re-cut so the table states what is true of the file on `origin/main` today.

**THE OK COUNT IS NO LONGER THE ASSERTION, and could not be.** The block below used
to demand exactly 8 OK. Under the verdict contract that is the same claim as "no
VACUOUS", which this project's own measurement refutes: production holds exactly 1
tenant, so B7's comparand is 0 and B7 reads VACUOUS on a correct database. Measured
on a throwaway standing where production stands: `7 OK / 1 VACUOUS / 0 FAIL`, and
the old assertion printed `STOP: the behaviour check printed 7 OK verdicts, not 8`
on a sitting where nothing had failed. What the block asserts now is that there is
no FAIL, that the SUMMARY row is present, and that **every VACUOUS arm is one of
B5, B6 or B7** - the three whose comparands can legitimately be zero. An
unexpected arm going vacuous is still a halt.

**AFTER 0092 IS APPLIED THIS FILE IS NO LONGER THE LIVE INSTRUMENT.** Its B2
compares against the pre-0092 predicate, so it reads FAIL by design; measured,
`6 OK / 1 VACUOUS / 1 FAIL`. Its successor is
`scripts/db/behaviour-care-loc-readonly.sql`. **Do not run that file from this
document**: nothing here pins it, greps its transcript or states its expected
profile, and psql exits 0 even when a verdict reads FAIL. It gets its pin and its
runner block in the CARE-LOC apply document, and not before.

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain
its own sha256: writing the value changes the value. So the digest lives beside
it in `docs/migration-apply-0091.sha256` and STAGE 0 checks it with
`shasum -a 256 -c`. That catches the failure this project has actually had - a
stale copy exported to the Desktop and pasted after the original was fixed.

**There is no `#` comment inside any block in this document, deliberately.** A
pasted line beginning with `#` is a COMMAND in an interactive zsh, not a comment
(`zsh: command not found: #`, measured 2026-09-18), so all reasoning lives in
prose out here and every block stays pasteable.

**Each stage derives the head from `origin/care/CARE-01-assigned-therapists`,
not `origin/main`.** PR #1374 is held until this apply succeeds, so `origin/main`
CANNOT contain the migration at the moment the apply runs. This is the same
correction `docs/migration-apply-0089.md` and `docs/migration-apply-0090.md`
both carry, for the same reason.

## STAGE 0: verify the promotion. The number was ALREADY taken

**This stage PROVES the promotion; it never performs it.** The promotion
happened on the branch on 2026-09-21: the pending file was renamed into
`packages/db/migrations/`, the journal entry was written, and the supabase
mirror was generated by `node scripts/sync-supabase-migrations.mjs`. Nothing
here renames, copies or writes anything.

**Why the number is taken in the repository and not by the applier.**
`drizzle-kit migrate` reads `packages/db/migrations` and its journal only, so a
file in `migrations-pending` is invisible to it. Applying a pending file
directly with `psql` would put a table, a function and four policies on
production that the journal does not name, which is the drift that bit 0042 and
again 0089.

**`0091` is this file's number, and it was RE-RULED onto it.** The owner's
2026-09-20 order gave `0091` to the users/tenants role fix and `0092` to
CARE-01; the 2026-09-21 ruling moved CARE-01 to **0091**, RGPD-01 to `0092`, the
role fix to `0093` and the grants revoke to `0094`. That is the SECOND
renumbering of this set, and `CLAUDE.md` carries the binding table. If a
`0091_users_tenants_role_fix.sql` or a `0091_rgpd_consent.sql` is ever found on
any branch, **STOP**: two migrations have taken one number and this document
must be re-issued.

```
(
set -eo pipefail
SHA=bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f
BRANCH=care/CARE-01-assigned-therapists
MIG=packages/db/migrations/0091_care_team.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0089_care_team.sql
DOCPIN=docs/migration-apply-0091.sha256

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

test -f ${MIG} || { echo "STOP: 0091 is not on disk; the promotion is not on this branch"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0091 is not the approved body"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
test ! -f packages/db/migrations/0091_rgpd_consent.sql || { echo "STOP: RGPD-01 also took 0091"; exit 1; }
test ! -f packages/db/migrations/0091_users_tenants_role_fix.sql || { echo "STOP: the role fix also took 0091"; exit 1; }

pnpm db:check-journal
echo "PROMOTION VERIFIED"
)
```

**EXPECT: `PROMOTION VERIFIED`, and nothing else is expected of this stage.** It
takes no number, reads no database and prints no count. `pnpm db:check-journal`
must print that the `.sql` files and the journal reconcile in order with `when`
strictly increasing and the supabase mirror matching by CONTENT, and the
journal's newest entry must be `idx 88`, `when 1788501200000`, tag
`0091_care_team`. If it does not, **STOP**.

**The mirror's own sha256 differs from the migration's, and that is expected.**
`scripts/sync-supabase-migrations.mjs` writes a four-line AUTO-GENERATED header
into `supabase/migrations/`, which is why `db:check-journal` compares the two by
CONTENT rather than by digest.

## What this document took from 0090's revision, and what is new

0090's document was re-issued on 2026-09-19 after six defects were found in its
first revision. Every one of those six corrections is built into this document
from the start rather than discovered on it:

| # | The defect 0090 found | Here |
|---|---|---|
| 1 | stage 2 ran `pnpm db:migrate`, which since 2026-09-08 is a refusal that exits 2 | the apply is `node packages/db/scripts/verified-migrate.mjs --tag ... --sha256 ... --expect-pending 1` |
| 2 | only stage 0 checked out the ref | **SR-58**: every stage fetches, detaches and asserts its own files by sha256 |
| 3 | the carries were typed in by hand | **SR-59**: stage 2 parses all five out of `/tmp/0091-precheck.out` and refuses one older than 60 minutes |
| 4 | the pre-check was an inline heredoc with one verdict | `scripts/db/precheck-care-team.sql`, READ ONLY, **16 verdicts**, pinned above |
| 5 | apply and post-check shared one stage | the apply is stage 1 and leaves `/tmp/0091-applied.ok`; stage 2 refuses without it |
| 6 | the journal was "deliberately not checked" | **SR-51**: stage 2 asserts the count grew by exactly one, that 0091's sha256 is in it once, and prints the last three rows |

**What is genuinely new here, because 0091 is not shaped like 0090.** 0090
created one function and no policy, so its post-check could assert "the policy
count did not move". 0091 creates a table, a function and four policies, so the
post-check asserts the four **deltas** instead (`+4` policies overall, `+1` of
them on `appointments`, `+1` SECURITY DEFINER function) and pins the one policy
that must NOT move, `appointments_rls`, by the md5 of its expression. There are
therefore **five** carries rather than four.

**These blocks are pasted into an INTERACTIVE zsh.** So: no backslash
continuations; every parameter braced, including before a colon; no `#` line
inside a block; and no `!` except as the `test !` operator followed by a space,
which zsh does not history-expand. Narration is `echo`.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes
nothing and touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from:"
git rev-parse origin/care/CARE-01-assigned-therapists
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.**
That is the comparand: stage 0 is where the promotion, the sidecar and the
journal were verified, so it is the head those verifications are about.

**This branch is auto-updated, so its head moves every time anything merges to
main.** What a moved head means depends on WHEN, and the two cases are opposite:

- **Before stage 1 has applied:** the sitting starts again from stage 0. The pin
  is a statement about a moment, and the moment that matters is this one.
- **After stage 1 has applied: NEVER go back to stage 1.** Go on to stage 2 on
  the new head. Stage 2 asserts the migration, the post-check and the guard by
  sha256, so a merge of main that left those bytes alone changes nothing it
  reads, and one that changed them halts it. Both shas, the one stage 1 applied
  from and the one stage 2 checked from, go on the SR-51 card.

**One halt that case can produce, named so it is not improvised around.** Stage 2
pins `scripts/assert-production-target.mjs` by sha256, and that file lives on
main. If a merge of main changes it between stage 1 and stage 2, stage 2 stops on
`the target guard on disk is not the approved file` with production already
applied, and the applied-marker is good for **60 minutes**. Do not edit the pin
and do not re-run stage 1. Report it to the owner with both shas; the post-check
is READ ONLY and can be re-issued against the new guard.

Stage 1 enforces the second case itself: it refuses to start while a fresh
applied-marker exists, and it never touches the previous transcript until a new
pre-check has passed. An accidental second paste of stage 1 therefore costs
nothing.

## STAGE 1: pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0091=bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f
SHAPRE=1fe31122ac6b371aa43fd82271472c5952e6297fc91a9aa7d947b10e9351864b
BRANCH=care/CARE-01-assigned-therapists

SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0091-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0091-precheck.new

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
test -f docs/migration-apply-0091.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0091.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0091_care_team.sql || { echo "STOP: 0091 is not on disk"; exit 1; }
test -f scripts/db/precheck-care-team.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test ! -f packages/db/migrations/0091_rgpd_consent.sql || { echo "STOP: RGPD-01 also took 0091"; exit 1; }
test ! -f packages/db/migrations/0091_users_tenants_role_fix.sql || { echo "STOP: the role fix also took 0091"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0091_care_team.sql | cut -d' ' -f1)" = "${SHA0091}" ] || { echo "STOP: 0091 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-care-team.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-care-team.sql 2>&1 | tee /tmp/0091-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0091-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0091-precheck.new || true)
[ "${OKS}" = 16 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 16"; exit 1; }

echo "--- only now, with a passing pre-check in hand, does the previous sitting's state go"
rm -f /tmp/0091-postcheck.out /tmp/0091-applied.ok
mv /tmp/0091-precheck.new /tmp/0091-precheck.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0091_care_team --sha256 ${SHA0091} --expect-pending 1
touch /tmp/0091-applied.ok
)
```

**EXPECT, and these two numbers are what stage 1 is read for:**

- **the pre-check prints `16` OK verdicts and no FAIL.** The stage asserts the
  count itself, so a pre-check that printed 15 halts here rather than being
  eyeballed;
- **`pending    1  [0091_care_team]`.** Exactly one. `--expect-pending 1` holds
  because after 0090 the pending set is 0091 alone. `verified-migrate.mjs`
  refuses to call drizzle at all if it is not 1.

It then prints `journal    88 -> 89  (delta 1)` and
`0091_care_team present by sha256: yes`. Those belong to stage 2's assertions as
well, and stage 2 re-reads them from the database rather than trusting this
line.

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did
not move, **3** on a missing file, a wrong sha256, an already-applied migration or
a pending count that is not 1, and **4** if drizzle itself failed.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also
exits 4 on ANY thrown error, including its own journal read AFTER drizzle has
committed (a dropped connection is enough). So: **if stage 1 ended non-zero after
the `drizzle-kit migrate` banner had printed, do not paste stage 1 again.** Run
`node --env-file=/Users/ivan/osteojp-secrets/new-prod.env packages/db/scripts/read-applied-migrations.mjs`,
which is READ ONLY. If it lists 0091 as APPLIED, production is applied and no
marker exists, so stage 2 will refuse: stop and ask the owner to rule. The carry
transcript in `/tmp/0091-precheck.out` is intact and is what a ruled post-check
would use. This window exists in every apply document since 0084; it is written
down here, not closed.

**0091 is NOT one statement, and that matters more here than it did for 0090.**
The file carries `--> statement-breakpoint` between every object, so drizzle
applies the table, the three indexes, the comment, the grants, the three table
policies, the function, its owner/grants, and the appointments policy as
separate statements. A failure part way leaves the earlier objects in place. The
pre-check's verdicts 1, 2 and 3 exist for exactly that: on a re-run after a
partial apply the table would be present, verdict 1 would read FAIL, and the
stage stops before drizzle is invoked.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0091=bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f
SHAPOST=7ba44f65dba515f8e63716eb06425204e889b524d1fa899f3b1a541f899b8b2a
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/CARE-01-assigned-therapists

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

echo "--- ASSERTION 1, THE HEAD. Record the sha printed next beside the one stage 1 applied from. If it has MOVED, carry on: never go back to stage 1 after an apply. Everything this stage reads is asserted by sha256 below."
git fetch origin --prune
git rev-parse origin/${BRANCH}

echo "--- SR-58 again. This stage inherits nothing from stage 1"
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
test -f packages/db/migrations/0091_care_team.sql || { echo "STOP: 0091 is not on disk"; exit 1; }
test -f scripts/db/postcheck-care-team.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0091_care_team.sql | cut -d' ' -f1)" = "${SHA0091}" ] || { echo "STOP: 0091 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-care-team.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0091-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0091-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0091-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0091-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
S=$(carry secdef_functions_before)
A=$(carry appointments_policy_count_before)
M=$(carry appointments_rls_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${S}" ] && [ -n "${A}" ] && [ -n "${M}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} secdef_before=${S} appt_policies_before=${A} appt_rls_md5=${M}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0091-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v secdef_before="${S}" -v appt_policies_before="${A}" -v appt_rls_md5="${M}" -c "begin read only" -f scripts/db/postcheck-care-team.sql -c "rollback" 2>&1 | tee /tmp/0091-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0091-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0091-postcheck.out || true)
[ "${OKS}" = 22 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 22"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0091 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0091}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0091 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0091 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0091 APPLIED. 16/16 pre-check OK, 22/22 post-check OK, journal ${J} to ${JA}."
)
```

**EXPECT:**

- **the post-check prints `22` OK verdicts and no FAIL**, and the stage asserts
  that count itself;
- **the journal reads `88` before and `89` after**, and 0091's sha256 is in it
  **exactly once**. The final line must read
  `0091 APPLIED. 16/16 pre-check OK, 22/22 post-check OK, journal 88 to 89.`

The carry line before it must read `journal_before=88`. If it reads anything
else, something was applied that this document does not know about, and the
pre-check's own `journal_rows_before` verdict will already have said FAIL.

## What every verdict must read

- **Pre-check, 16 rows, all `OK`:**
  - 0: the transaction is READ ONLY;
  - 1: the TABLE `patient_care_team` is ABSENT. It is created with `IF NOT
    EXISTS`, so a table already there would be silently adopted, rows and all;
  - 2: the FUNCTION is ABSENT (it is `CREATE OR REPLACE`);
  - 3: the new appointments POLICY is ABSENT. `CREATE POLICY` is not
    idempotent, so one already there ERRORs part way through the file;
  - 4: 0091 is absent from the journal by hash;
  - 5: 0090 is present by hash;
  - 6: the newest applied journal `when` is below 0091's `1788501200000` (the
    0058 skip guard);
  - `journal_rows_before` (carry): **88**, which is what production read after
    0090 was applied on 2026-09-19. Any other number is a halt: something was
    applied that this document does not know;
  - `policies_before` (carry);
  - `secdef_functions_before` (carry), every one owned by `postgres`;
  - `appointments_policy_count_before` (carry). It is named that way and not
    `appointments_policies_before` because the latter CONTAINS `policies_before`
    and stage 2's awk parser matches on a substring;
  - `appointments_rls_md5` (carry);
  - 12: `appointments_rls` is the FOR ALL policy (`polcmd` = `*`);
  - 13: the four helpers the new objects call exist (`jwt_tenant_id`,
    `jwt_role`, `viewer_treated_patient_ids`, `auth.uid`);
  - 14: the four roles the migration and the post-check name exist;
  - 15: the three FK parents exist and `appointments` carries both patient
    columns.
- **Post-check, 22 rows, all `OK`:**

1. the table `patient_care_team` exists, exactly once;
2. row level security is ENABLED on it;
3. its three indexes exist and `patient_care_team_live_unique` is UNIQUE **and
   partial** - without the partial predicate a re-assignment would collide with
   the historical row the table exists to keep;
4. `authenticated` has SELECT, INSERT and UPDATE on it and **NOT DELETE**;
5. the function exists once, is NULLARY and returns `uuid[]`;
6. it is `SECURITY DEFINER`;
7. it is owned by `postgres`, whose privileges it runs with;
8. `search_path` is pinned to `public`;
9. it is **STABLE**, which is what keeps the nullary call an initplan evaluated
   once per statement rather than once per row;
10. `anon` has no `EXECUTE`;
11. the portal's `patient` role has no `EXECUTE`;
12. `service_role` has no `EXECUTE` (0079);
13. **PUBLIC** holds no `EXECUTE`. `has_function_privilege` takes no PUBLIC, and
    a NULL `proacl` means PUBLIC holds EXECUTE by default, so this reads the ACL
    itself: it must exist and carry no grant to grantee 0 (SR-52);
14. `authenticated` DOES. That is the positive control, without which 10 to 13
    would be satisfied by a function nobody can call;
15. the new appointments policy is PERMISSIVE, `FOR SELECT`, `TO authenticated`
    alone, and has **no** WITH CHECK. A policy that came out `FOR ALL` would
    hand every therapist the right to change or delete a colleague's booking;
16. its predicate names role `therapist`, **both** helpers and **both** patient
    columns;
17. the POLICY COUNT is `policies_before` **+ 4**;
18. exactly **one** of those four landed on `appointments`;
19. the SECURITY DEFINER function count is `secdef_before` **+ 1**;
20. `appointments_rls`'s expression still hashes to `appointments_rls_md5`;
21. all three policies on the new table name `owner` and `reception`, and none
    names `therapist`;
22. the table ships EMPTY: this migration assigns nobody.

- **Then the journal, asserted by the stage and not by the file:** the row count
  is `journal_rows_before` + 1, so **88 to 89**; 0091's sha256 is present
  exactly once; and the last three rows are printed. Those three lines, with the
  pre-check and post-check counts, are what the **SR-51** card carries.

**Verdict 22 is true at the sitting and not forever.** The moment reception
assigns a first therapist the table stops being empty, and re-running the
post-check then would read FAIL on 22 alone. It is an assertion about the apply,
not an invariant, and it is written here so nobody re-runs the file a week later
and reports a regression.

## After the apply: what the policy DOES, to a real actor, AT THE RLS LAYER. READ ONLY

The post-check proves the shapes. `scripts/db/behaviour-care-team-readonly.sql`
proves the behaviour on the database it was applied to, inside one
`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, by impersonating
a therapist the way `packages/db/tests/rls-harness.ts` does (`SET LOCAL ROLE
authenticated` plus the `request.jwt.claims` GUC). It logs in as nobody and
prints **counts and verdicts only**: the actor and both appointments are chosen
into psql variables and never echoed, so no name, phone, email, patient id or
appointment id reaches the transcript.

```
(
set -eo pipefail
SHABEHAVIOUR=578bcbdb9a4e7432f00458f5b322213481dfc586cb0a317c610b03a368405007
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/CARE-01-assigned-therapists
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f scripts/db/behaviour-care-team-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care-team-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/behaviour-care-team-readonly.sql 2>&1 | tee /tmp/0091-behaviour.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0091-behaviour.out && { echo "STOP: a behaviour verdict read FAIL"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0091-behaviour.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated or the file is a pre-contract revision"; exit 1; }
BADVAC=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0091-behaviour.out | grep -cvE '\|[[:space:]]*(B5|B6|B7)\.' || true)
[ "${BADVAC}" = 0 ] || { echo "STOP: ${BADVAC} arm(s) OTHER than B5, B6 or B7 read VACUOUS. Only those three have a comparand that may legitimately be zero"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0091-behaviour.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/')
echo "CARE-01 BEHAVES AS RULED AT THE RLS LAYER. ${PROFILE}. The route-level half of the acceptance is NOT discharged by this transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, and every VACUOUS arm one of B5/B6/B7**, which is this block's own rule and not
the pre-check's or the post-check's.

| Verdict | What it proves |
|---|---|
| 0 | the transaction is READ ONLY |
| B1 | the RULED set contains appointments the pre-0091 predicate did NOT admit, so this actor is a subject the migration has work on. **B1 is about the DATA, not the policy** |
| B2 | the actor reads EXACTLY the union of the old predicate and the ruled one, computed outside RLS in the same transaction: no row more and no row fewer. **This is the arm that fails if the policy is missing or wrong** |
| B3 | **the negative:** an appointment admitted by NEITHER arm is refused |
| B4 | **the positive control for B3**, same actor, same table, same transaction: one of their own IS readable |
| B5 | the care-team table itself shows a therapist nothing, against the number of rows that exist |
| B6 | `viewer_care_team_patient_ids()` agrees with the table: as many ids as the actor has LIVE assignments, `removed_at` respected. It is also the proof that `authenticated` can call the function at all |
| B7 | tenant isolation: zero appointments of any other tenant are readable, against a non-zero number that exist |

It stops with a `STOP:` exception, having checked nothing, if production holds
no therapist with a patient of their own whose history also carries an
appointment somebody else holds, or no appointment that neither arm admits, or
no appointment of the actor's own. That is a halt to report, not a pass. Every
selector is a scalar subquery for that reason: a `\gset` over zero rows would
otherwise end the run on psql's own "no rows returned" before the line that
explains it.

**B5 is vacuous on the day of the apply, and it says so in its own `observed`
column.** The table ships empty, so it will read `0 read of 0 rows`. It becomes
a real assertion the moment reception assigns anybody, and the rehearsal ran it
non-vacuously (`0 read of 2 rows`) so that the arm is known to work. The same is
true of B6 in the other direction: on production it compares 0 against 0, and
the rehearsal compared 1 against 1 with a second, REMOVED row present that the
helper correctly ignored.

### Which acceptance check this transcript discharges, and which it does not

Evidence is only evidence at the layer it was taken.

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 89, 0091 by hash | stage 2, and `read-applied-migrations.mjs` | the database |
| a therapist reads the whole appointment history of a patient they treat | B1 and B2 | RLS, under impersonated claims |
| a therapist is refused a patient they neither treat nor are assigned to, with a positive control proving the session answers at all | **B3 and B4 prove the refusal and its control at the RLS layer ONLY. The route is NOT exercised here** | see below |
| reception can assign and remove a therapist, and the ficha shows the section | **NOT DISCHARGED BY THIS DOCUMENT AT ALL.** The table ships empty; the UI that writes it is in PR #1374 and needs its own check after the merge | the route |

**The route half is not something a terminal can do.** No terminal holds a staff
credential, by rule, so no terminal can sign in to `app.osteojp.pt` as a
therapist. It is covered two ways, and neither is this transcript:

1. **In CI, on the seeded database:**
   `packages/db/tests/care-team-appointment-visibility.db.test.ts` is the
   behavioural suite, and **it could not run at all before this promotion** -
   the table did not exist in any database CI touches, so it was on an
   exemption list in `.github/scripts/assert-rls-executed.mjs`. That exemption
   is deleted in the same change that promotes this file. Its 15 arms running
   green is the first thing to read on #1374 after the merge.
2. **On production, by the owner or reception, only AFTER #1374 has merged and
   its deployment reads READY**: open a patient's ficha, add a therapist to the
   care team, sign in as that therapist and open that patient's history; then
   remove the assignment and confirm the history closes again. The result goes
   on the `CARE-01` card.

Whether RLS-layer evidence plus the CI suite is ACCEPTED in place of step 2 is
the owner's ruling to make, not the author's.

## Rehearsed on 2026-09-21 on a throwaway standing at production's position

A brand-new sitting on the throwaway Supabase Postgres 17 the 0090 rehearsal
left behind (project `OsteoJP-solo-rehearsal`, database container only, on
`127.0.0.1:55522`), **standing at production's position and read, not assumed**:
journal **88 rows**, the newest carrying 0090's sha256
`cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642` at
`when 1788401200000`; `patient_care_team` ABSENT, `viewer_care_team_patient_ids`
ABSENT, **89** policies, **25** SECURITY DEFINER functions, every one owned by
`postgres`. Production was never connected to, at any point.

**All five blocks were extracted from this document by a script and run under
`zsh -f`** from a clean detached clone whose `origin` was a private bare
repository holding this branch, so `git fetch origin --prune`,
`git rev-parse origin/care/CARE-01-assigned-therapists` and the sidecar check
all ran for real and nothing was pushed to GitHub. Exactly four substitutions,
each with its count asserted, and the extractor refuses a block that still names
`origin/main`, the secrets directory, the guard invocation or the apply
worktree:

| Substitution | stage 0 | HEAD CHECK | stage 1 | stage 2 | behaviour |
|---|---|---|---|---|---|
| `/tmp/` becomes a scratch directory, **substituted FIRST** | 0 | 0 | 10 | 8 | 3 |
| the `cd` line | 1 | 1 | 1 | 1 | 1 |
| the env-source line becomes `export DATABASE_URL_DIRECT=<the throwaway>` | 0 | 0 | 1 | 1 | 1 |
| `node scripts/assert-production-target.mjs` becomes an `echo` | 0 | 0 | 1 | 1 | 1 |

`/tmp/` is substituted first on purpose: the scratch path itself contains
`/tmp/`, and 0090's rehearsal recorded the extractor defect where substituting
it last rewrote the `cd` target and stage 1 died on `cd: no such file or
directory`.

### The arms. Each one was RUN, not reasoned about

| Arm | Expected | Result |
|---|---|---|
| **DIRTY:** stage 0 with one stray byte appended to `README.md` | refuses | exit **1**, `STOP: the apply worktree is not clean`, followed by ` M README.md` |
| stage 0, clean | **`PROMOTION VERIFIED`, and nothing else** | exit **0**. `docs/migration-apply-0091.md: OK` from the sidecar; `✓ Migration journal reconciled: 89 .sql files match 89 journal entries in order, when strictly increasing, and the supabase mirror matches by CONTENT.`; then `PROMOTION VERIFIED`. No count, no database read |
| HEAD CHECK | the same sha stage 0 printed as `running from` | both printed `d36423523cf21a24b366143cd0f67cebbb6ca611` |
| **A:** stage 2 BEFORE stage 1 | refuses | exit **1**, `STOP: stage 1 did not complete an apply in this sitting`. Journal still 88, `patient_care_team` still absent |
| **B:** stage 1 | applies | pre-check **16 OK / 0 FAIL**; carries `journal_rows_before=88 policies_before=89 secdef_functions_before=25 appointments_policy_count_before=3 appointments_rls_md5=22e128271c25d59ca149731cb04e55aa`; `pending    1  [0091_care_team]`; `journal    88 -> 89  (delta 1)`; `0091_care_team present by sha256: yes`; exit **0** |
| **G:** stage 1 pasted AGAIN, straight after the apply | refuses and destroys nothing | exit **1**, `STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2`. Marker still present, transcript **byte-identical** (`cmp`) to the one arm B wrote. Arm C then ran from it |
| **C:** stage 2 | passes | carries parsed out of the transcript, not typed; post-check **22 OK / 0 FAIL**; journal before 88 after 89; 0091 present by hash exactly once; last three rows printed, the newest being row id `89` carrying `bd207cdc…` at `1788501200000`; final line `0091 APPLIED. 16/16 pre-check OK, 22/22 post-check OK, journal 88 to 89.`; exit **0** |
| **D:** stage 2, transcript backdated 61 minutes | refuses | exit **1**, `STOP: stage 1's transcript is over an hour old; it is not this sitting's` |
| **E:** stage 2, marker removed | refuses | exit **1**, `STOP: stage 1 did not complete an apply in this sitting` |
| **F: negative control:** stage 1 AGAIN on the applied database, marker gone | the pre-check FAILs, nothing is applied, the old transcript survives | **10 OK / 6 FAIL**, exit **1**, `STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched`. The six: verdicts 1, 2, 3, 4, 6 and `journal_rows_before` (89 against 88). Journal still **89**, old transcript **byte-identical**, the failed run's output sitting harmlessly in `.new` |
| **H:** the READ ONLY form the stages use, `-c "begin read only" -c "<a write>"` | the server refuses | `ERROR: cannot execute CREATE TABLE in a read-only transaction`, exit 1, and the table does not exist |
| the behaviour block **before any fixture existed** | halts, says why, checks nothing | exit **3**, `ERROR: STOP: no active therapist has a patient of their own whose history also carries an appointment somebody else holds. Nothing was checked.` |
| the behaviour block, verbatim, on the applied database with synthetic fixtures | every verdict | **8 OK / 0 FAIL**, exit **0**. B1 `2 new-only of 3 admitted`; B2 `3` against `3`; B3 `0`; B4 `1`; B5 `0 read of 2 rows`; B6 `1` against `1`; B7 `0 read of 6 that exist` |
| **the behaviour block with the new policy DROPPED** | B2 must FAIL | **B2 FAILED**, reading `1` against `3`. B1 stayed OK, which is exactly why B1's wording says it is about the DATA: the arm that catches a missing or wrong policy is B2 |
| `packages/db/tests/care-team-appointment-visibility.db.test.ts`, the suite CI could not run before this promotion | runs, and does not skip | **15 passed, 0 skipped**, exit **0**. The promotion achieves its point |
| the four files carrying the five arms the deleted exemption named | pass on the applied database | **4 files, 55 passed, 0 failed**, exit **0** |
| the whole `packages/db` DB-gated suite | passes | **96 files, 1346 tests, 1345 passed, 0 skipped**. One failure: `tests/migration-batch-import.test.ts`, on vitest's 20 s per-test cap |
| **that one failure, A/B'd rather than excused** | is 0091 the cause? | **No.** It failed IDENTICALLY with `appointments_care_team_patient_history_select` DROPPED, and passed **4/4 in 11.4 s** with the cap lifted and the policy restored. Machine load average at the time: **32.47**. The policy was then recreated and `appointments_rls`'s md5 re-read as `22e128271c25d59ca149731cb04e55aa`, unchanged |
| post-check with a wrong `appointments_rls_md5` carry | 20 FAILs | **FAIL** (`22e128…` against `deadbeef…`) |
| post-check with a wrong `secdef_before` carry | 19 FAILs | **FAIL** (26 against 25) |
| post-check with a wrong `policies_before` carry | 17 FAILs | **FAIL** (93 against 94) |
| post-check with `policies_before` omitted | refuses, non-zero, reads nothing | **exit 3**, `STOP: -v policies_before is missing. Stage 1 prints it; this file refuses to guess.` |
| post-check re-run once the fixtures had put 2 rows in the table | **only** verdict 22 turns | **21 OK / 1 FAIL**, and the FAIL is `22. the table ships EMPTY`, reading 2 against 0. That is the measured proof of the warning above: 22 is an assertion about the sitting, not an invariant |
| **the journal identity, BY HASH and not by the serial id** | the row IS this file | the file hashes to `bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f`; the newest journal row (id **89**) carries that same value, and a count by that hash reads **1** |

### The fixtures, and what each one is for

The behaviour block needs subjects, and production has them where a fresh
throwaway does not. Two synthetic tenants were built, with invented names and no
production row read or copied: a therapist **A** (the actor) and a therapist
**B** at one location; patient **P1** whom A has treated and B also has an
appointment with; patient **P2** assigned to A with a LIVE care-team row and
seen only by B; patient **P3** assigned to A with a **REMOVED** row and seen
only by B; and a second tenant with its own therapist, patient and appointment.

That shape is what makes each arm non-vacuous. B1 reads `2 new-only` because
**both** arms of the new policy fire, one through `viewer_treated_patient_ids()`
(P1) and one through `viewer_care_team_patient_ids()` (P2). P3's appointment is
B3's subject precisely BECAUSE its care-team row is removed, so B6 reading `1`
rather than `2` is the measured proof that the helper honours `removed_at`.

**On production both B5 and B6 will be vacuous on the day of the apply**, and
they say so in their own `observed` columns: the table ships empty, so B5 reads
`0 read of 0 rows` and B6 compares 0 against 0. They are written to become real
assertions the moment reception assigns anybody, and the rehearsal is where they
were proven to work.

### One thing this rehearsal changed about the document

The pre-check originally called its fourth carry `appointments_policies_before`.
Stage 2's `carry()` matches on a SUBSTRING of column 1, and
`appointments_policies_before` **contains** `policies_before` - so the parser was
correct only by the order the rows happened to come out in. It is now
`appointments_policy_count_before`, which contains no other carry's name. Found
by reading the parser against the file, before the rehearsal ran.

**The stage blocks above are byte-identical to the ones this table records.**
This section was appended after the arms were run, which changed the document's
own sha256, and `docs/migration-apply-0091.sha256` was regenerated over the
final bytes. Nothing inside any fenced block was touched after arm C.

## What this does NOT do

- **The soft-delete-only rule binds `authenticated`, and NOT `service_role`.**
  The file grants SELECT, INSERT and UPDATE to `authenticated` and then REVOKEs
  DELETE from it, and post-check item **4** pins exactly that. Measured on the
  applied database, the table's ACL reads
  `{postgres=arwdDxtm/postgres, authenticated=arwDxtm/postgres, service_role=arwdDxtm/postgres}`:
  **`service_role` holds `d` (DELETE) and `D` (TRUNCATE)**, and it bypasses RLS.
  Neither arrives from a statement in this file - both come from Supabase's
  `ALTER DEFAULT PRIVILEGES` on schema `public`, exactly as they do for every
  other table in the schema. So this is not a regression and not something this
  migration could fix, but the invariant is narrower than the words
  "no DELETE grant" suggest, and a post-check that tested only `authenticated`
  would have let a reader believe otherwise.
  **It is already queued to be closed.** PR #1397, the ruled `0094`, revokes
  TRUNCATE, TRIGGER and REFERENCES through a `FOR r IN ... pg_class` loop plus
  `ALTER DEFAULT PRIVILEGES` rather than a static table list, so
  `patient_care_team` is covered by it automatically when it lands. Recorded here
  so nobody re-derives it, and so nobody adds a static entry for this table.

- **It assigns nobody.** The table ships empty; every row comes from reception
  pressing a control, and that control ships in PR #1374. Until then the only
  arm of the new policy that admits anything is the one keyed on
  `viewer_treated_patient_ids()`, which is the arm the ruling's own measurement
  was taken over.
- **It grants no right to change anything.** The new policy is `FOR SELECT`.
  UPDATE and DELETE on `appointments` still require `appointments_rls`, which
  this file does not touch and which post-check item **20** pins by the md5 of
  its expression. That is this apply's central prohibition: widening the FOR ALL
  policy instead of adding a SELECT one would have handed every therapist the
  right to delete a colleague's booking.
- **It does not widen the agenda.** The agenda queries one practitioner's own
  column, and that WHERE clause is what makes a day view a day view. A readable
  row appears only where a query asks for it.
- **It touches no clinical policy.** `clinical_records`, `clinical_episodes`,
  `attachments` and storage are untouched, as is every INSERT, UPDATE and DELETE
  policy in the schema. Registos, episodes and documents were measured as
  ALREADY visible to a therapist on 2026-09-16 (zero blocked pairs), which is
  why the ruling put them out of scope rather than granting them.
- **A single cancelled appointment is enough to open a patient's whole history
  to that therapist, permanently.** That follows from the ruling as measured:
  `viewer_treated_patient_ids()` has no status predicate, because the
  measurement that produced option (c) applied none. If the clinic wants
  cancelled visits excluded it is a predicate change and a new count, not a
  redesign.
