# 0092: apply CARE-LOC, the patient-following view stops at the therapist's own clinic

**Status: NOT APPLIED.** One migration, `packages/db/migrations/0092_care_team_location.sql`
on the branch below. Any `STOP:` line, any `FAIL` verdict or any `ERROR` halts the
sitting.

**This document is written in the shape `docs/migration-apply-0091.md` settled on,
section for section,** and nothing is carried over from 0091's numbers: every count
below was read off production READ ONLY on 2026-09-22 or measured on a throwaway
standing at production's position, and the transcript is the rehearsal section near
the end.

| Fact | Value |
|---|---|
| Card | `CARE-LOC` (the location narrowing of `CARE-01-assigned-therapists`) |
| Ruling | Owner, 2026-09-21, option (b): a therapist sees appointments of patients they treat or are assigned to **only at clinics in `viewer_location_ids()`**. Number ruled 2026-09-22: **0092** |
| Owner's gate for this document | 2026-09-22: 0092 does not go READY-TO-APPLY until `viewer_location_ids()` returns Castelo Branco alone for JP(cb) and Linda-a-Velha alone for JP(lv), proven in the same run. That is pre-check rows **J4a** and **J4b** |
| Migration | `packages/db/migrations/0092_care_team_location.sql`, sha256 `23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa` |
| Journal | `idx 89`, `when 1788501300000`, tag `0092_care_team_location` |
| Must follow | `0091_care_team`: applied to production (journal `idx 88`, row id 89, sha256 `bd207cdc…a972f`), merged to main 2026-09-21 in #1374 |
| Branch | `care/CARE-LOC-0092-per-clinic`, PR #1426 |
| This document | `docs/migration-apply-0092.md`, pinned by `docs/migration-apply-0092.sha256` and asserted in STAGE 0 and again in STAGE 1 |
| Pre-check | `scripts/db/precheck-care-loc.sql`, READ ONLY, **18 verdicts, J4a and J4b among them**, sha256 `77528e87d78f9c6740b39af4bdb1028da64596b408c22de4bf753b2bc9281064` |
| Post-check | `scripts/db/postcheck-care-loc.sql`, READ ONLY, 11 verdicts, sha256 `3cced312d6a996b2e28325ff31b74ff1bef681a2558c81b650264ed25a0a2f6a` |
| Behaviour check | `scripts/db/behaviour-care-loc-readonly.sql`, READ ONLY, sha256 `3992a562f4e0afdca3ffc72933104cf3e7483c7d64ef41e76cbaf347a39282fb`. Run TWICE in this sitting, before the apply and after it, with the same actor |
| Behaviour actor | `a821521d-b67d-4a99-ac35-319c9e95fe6a`, passed as `-v actor_id`. Why this therapist and not the file's default selector: see "The behaviour actor is named, and why" |
| The two programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`. Both byte-identical to `origin/main` at `4310f72e` on 2026-09-22, both pinned in every block that runs them |
| What it changes | ONE policy's `USING` (`appointments_care_team_patient_history_select` gains `location_id = ANY (viewer_location_ids())`) and that policy's `COMMENT`. Nothing is created and nothing is dropped |
| What it never touches | `appointments_rls`, and every other policy in the database: the post-check proves both, the second by one md5 over all of them |

## No production figure appears in this document, by ruling

The owner ruled on 2026-09-21 that the cross-clinic figures which produced option (b)
stay out of every PR body, card and committed document until 0092 is applied: this
repository is public and the disclosure is unfixed until then. The migration's own
header points at "the apply document's owner-only section" for them. **This is that
section, and it holds no numbers.** The figures are in the owner's report. Every count
elsewhere in this document is either a structural count (journal rows, policies,
functions), a verdict profile, or a measurement on synthetic rehearsal data.

**The ruling was broken once on this branch, and this document says so rather than
claiming otherwise.** A test comment added in commit `9cff3b65` (2026-09-22, 07:37)
stated the size of the gap to an order of magnitude, and the CARE-01 behaviour
script's header carried production counts from the same day. The Tier C REVIEWER
caught both; both are removed at the tip. The commit is in the branch's pushed
history on a public repository, and removing it from there needs a force push, which
this repository forbids without the owner. The owner has been told.

The same ruling shapes the behaviour transcripts: they are written to `/tmp` on the
applier's machine and print counts, never ids or names, and they are reported to the
owner rather than committed.

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256: writing the value changes the value. So the digest lives beside it in
`docs/migration-apply-0092.sha256` and STAGE 0 checks it with `shasum -a 256 -c`.

**There is no `#` comment inside any block in this document, deliberately,** and every
parameter is braced, including before a colon, because the blocks are pasted into an
interactive zsh (`scripts/owner-blocks-survive-zsh.test.mjs` enforces the braces). No
backslash continuations, and no `!` except as the `test !` operator followed by a
space. Narration is `echo`.

**Each stage derives the head from `origin/care/CARE-LOC-0092-per-clinic`, not
`origin/main`.** PR #1426 is held until this apply succeeds, so `origin/main` cannot
contain the migration at the moment the apply runs.

## The number: 0092, ruled 2026-09-22, the THIRD renumbering of this set

The owner's 2026-09-22 ruling, final: **`0092` CARE-LOC (#1426), `0093` RGPD-01
(#1399), `0094` the users/tenants role fix, `0095` the grants revoke (#1397).** It moved
RGPD-01 off `0092`, where the 2026-09-21 table had put it, and pushed the three items
behind it down one slot. `CLAUDE.md` carries the binding table, corrected in the same
PR as this document.

The number is the apply authorisation, so both stage 0 and stage 1 count the files
that claim it: **exactly one `packages/db/migrations/0092_*.sql` may exist.** RGPD-01
is still `packages/db/migrations-pending/NEXT-AFTER-0089_patient_rgpd_acceptances.sql`
on its own branch, which `drizzle-kit migrate` cannot see; if it or anything else is
ever found under `0092_` beside this file, **STOP**: two migrations have taken one
number and this document must be re-issued.

## STAGE 0: verify the file and the number

**This stage proves; it performs nothing.** 0092 was authored under its number on the
branch (there was no `migrations-pending` copy to promote), the journal entry was
written, and the supabase mirror was generated by `node scripts/sync-supabase-migrations.mjs`.
Nothing here renames, copies or writes anything.

```
(
set -eo pipefail
SHA=23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa
BRANCH=care/CARE-LOC-0092-per-clinic
MIG=packages/db/migrations/0092_care_team_location.sql
DOCPIN=docs/migration-apply-0092.sha256

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

test -f ${MIG} || { echo "STOP: 0092 is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA}" ] || { echo "STOP: 0092 is not the approved body"; exit 1; }
N92=$(find packages/db/migrations -maxdepth 1 -name '0092_*.sql' | wc -l | tr -d ' ')
[ "${N92}" = 1 ] || { echo "STOP: ${N92} files claim migration number 0092, not 1"; exit 1; }

pnpm db:check-journal
echo "NUMBER AND FILE VERIFIED"
)
```

**EXPECT: `NUMBER AND FILE VERIFIED`, and nothing else is expected of this stage.** It
reads no database and prints no count. `pnpm db:check-journal` must print that the
`.sql` files and the journal reconcile in order with `when` strictly increasing and the
supabase mirror matching by CONTENT: **90 `.sql` files against 90 journal entries**. The
check does not print the newest entry; it is `idx 89`, `when 1788501300000`, tag
`0092_care_team_location`, and stage 1 re-proves it by sha256 through
`verified-migrate.mjs`. If the count is not 90, **STOP**.

**The mirror's own sha256 differs from the migration's, and that is expected.**
`scripts/sync-supabase-migrations.mjs` writes an AUTO-GENERATED header into
`supabase/migrations/`, which is why `db:check-journal` compares the two by CONTENT.

## What is new here, because 0092 is not shaped like 0091

0091 CREATED a table, a function and four policies, so its pre-check proved them
ABSENT and its post-check asserted four deltas. **0092 creates nothing and drops
nothing.** It is one `ALTER POLICY ... USING` and one `COMMENT ON POLICY`, so:

- **the pre-check proves the policy PRESENT, and proves it is exactly the one 0091
  created**, by the md5 of its expression (`2f3548c5…`). `ALTER POLICY ... USING`
  replaces whatever expression it finds, so a policy somebody had edited by hand would
  be overwritten without a word, and one that already carried 0092's clause would mean
  0092 had run outside the journal;
- **the post-check asserts that NO count moved**: policies, policies on
  `appointments`, SECURITY DEFINER functions. That is meaningful only because the file
  ALTERs; a drop-and-create would take the count down and back up and pass on a run
  where the create had silently failed. Post-check verdict 3 is what proves the ALTER
  landed, by the md5 of the new expression;
- **"nothing else moved" is ONE comparison, not a list.** Stage 1 carries
  `other_policies_md5`, a single md5 over every policy in the database except the one
  0092 amends (name, command, permissive, roles, USING, WITH CHECK), and post-check
  verdict 9 compares it. `patients_select`, which was examined and deliberately left
  alone, is inside that value;
- **the behaviour check runs TWICE, as an A/B on production itself.** Before the
  apply it must FAIL on exactly L2, L3 and L4, the three arms that see the gap 0092
  closes; after the apply the same file, the same actor, must read no FAIL. The
  0091 sitting could only run its instrument afterwards.

There are therefore **six** carries: `journal_rows_before`, `policies_before`,
`secdef_functions_before`, `appointments_policy_count_before`, `appointments_rls_md5`,
`other_policies_md5`. No carry's name is a substring of another's or of any other row's
`check` column, because stage 2's `carry()` matches column 1 with `index()`.

## The behaviour actor is named, and why

`scripts/db/behaviour-care-loc-readonly.sql` needs ONE therapist who furnishes all four
of its named subjects: a row the pre-0092 view admitted at a clinic they do not belong
to (L4), a followed patient's booking at their own clinic (L5), an unfollowed patient's
booking at their own clinic (L6), and work of their own at a foreign clinic (L7). Its
default selector guarantees the first and cannot test the other three, because they
need the helper arrays and those need the claims. The file says so, and gives the
remedy: `-v actor_id=<therapist>`.

**On production the default selector halts.** Measured READ ONLY on 2026-09-22 against
the file pinned above: `STOP: the chosen actor holds no work of their own at a clinic
they do not belong to, so L7 has no subject`. Every active therapist holding a clinic
was then tried in turn with `-v actor_id`, and **`a821521d-b67d-4a99-ac35-319c9e95fe6a` furnishes all four**: it ran
to its SUMMARY with the profile `5 OK / 0 VACUOUS / 3 FAIL`, the three being L2, L3
and L4, which is exactly what a correct instrument must print BEFORE 0092. That is the
actor this document passes, in both runs.

**If the named actor stops furnishing a subject before the sitting** (a roster change
can do it: an L7 subject exists only while the therapist holds work at a clinic they are
not installed at), stage 1 halts on the STOP **before anything is applied**. That is the
point of running the instrument first. Report it; do not substitute another actor, which
would be a different document.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from:"
git rev-parse origin/care/CARE-LOC-0092-per-clinic
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.** That is
the comparand: stage 0 is where the file, the number, the sidecar and the journal were
verified, so it is the head those verifications are about.

**This branch is auto-updated, so its head moves every time anything merges to main,
and it is not a person doing it.** `.github/workflows/auto-update-prs.yml` runs on every
push to `main` and merges `main` into every open, non-draft PR that is behind it, using
the `AUTO_UPDATE_TOKEN` secret. Measured on 2026-09-22: run `35752301819` merged main
into this branch at 16:10:21Z (commit `63b4f4bf`, committer `GitHub`), eleven seconds
after #1429 merged. What a moved head means depends on WHEN, and the two cases are
opposite:

- **Before stage 1 has applied:** the sitting starts again from stage 0. The pin is a
  statement about a moment, and the moment that matters is this one.
- **After stage 1 has applied: NEVER go back to stage 1.** Go on to stage 2 on the new
  head. Stage 2 asserts the migration, the post-check and the guard by sha256, so a
  merge of main that left those bytes alone changes nothing it reads, and one that
  changed them halts it. Both shas, the one stage 1 applied from and the one stage 2
  checked from, go on the SR-51 card.

**Two halts that case can produce, named so they are not improvised around.** Two
pinned files live on main, not only on this branch: `scripts/assert-production-target.mjs`
(pinned by stages 1, 2 and 3) and `scripts/db/behaviour-care-loc-readonly.sql` (pinned
by stages 1 and 3). If a merge of main changes either one after stage 1 has applied,
stage 2 stops on `the target guard on disk is not the approved file`, or stage 3 stops
on `the behaviour check on disk is not the approved file`, with production already
applied. The applied-marker is good for **60 minutes**. Do not edit a pin and do not
re-run stage 1. Report it to the owner with both shas; the post-check and the behaviour
check are READ ONLY and can be re-issued against the new files.

Stage 1 enforces the second case itself: it refuses to start while a fresh
applied-marker exists, and it never touches the previous transcripts until a new
pre-check AND a new before-run have passed. An accidental second paste of stage 1
therefore costs nothing.

## STAGE 1: pre-flight, pre-check with J4, the instrument BEFORE, apply

```
(
set -eo pipefail
SHA0092=23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa
SHAPRE=77528e87d78f9c6740b39af4bdb1028da64596b408c22de4bf753b2bc9281064
SHABEHAVIOUR=3992a562f4e0afdca3ffc72933104cf3e7483c7d64ef41e76cbaf347a39282fb
ACTOR=a821521d-b67d-4a99-ac35-319c9e95fe6a
BRANCH=care/CARE-LOC-0092-per-clinic

SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0092-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 ALREADY APPLIED in this sitting. Do not run it again. Go to stage 2"; exit 1; }
rm -f /tmp/0092-precheck.new /tmp/0092-behaviour-before.new

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
test -f docs/migration-apply-0092.sha256 || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c docs/migration-apply-0092.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0092_care_team_location.sql || { echo "STOP: 0092 is not on disk"; exit 1; }
test -f scripts/db/precheck-care-loc.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/behaviour-care-loc-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N92=$(find packages/db/migrations -maxdepth 1 -name '0092_*.sql' | wc -l | tr -d ' ')
[ "${N92}" = 1 ] || { echo "STOP: ${N92} files claim migration number 0092, not 1"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0092_care_team_location.sql | cut -d' ' -f1)" = "${SHA0092}" ] || { echo "STOP: 0092 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-care-loc.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care-loc-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept. J4a and J4b are in it"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-care-loc.sql 2>&1 | tee /tmp/0092-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0092-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0092-precheck.new || true)
[ "${OKS}" = 18 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 18"; exit 1; }
grep -qE '^[[:space:]]*J4a\..*\|[[:space:]]*OK[[:space:]]*$' /tmp/0092-precheck.new || { echo "STOP: J4a did not read OK. The owner's gate for this document is not met"; exit 1; }
grep -qE '^[[:space:]]*J4b\..*\|[[:space:]]*OK[[:space:]]*$' /tmp/0092-precheck.new || { echo "STOP: J4b did not read OK. The owner's gate for this document is not met"; exit 1; }

echo "--- the behaviour check BEFORE the apply. READ ONLY. It must see the gap 0092 closes: L2, L3 and L4 FAIL, and nothing else"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${ACTOR} -f scripts/db/behaviour-care-loc-readonly.sql 2>&1 | tee /tmp/0092-behaviour-before.new
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0092-behaviour-before.new || { echo "STOP: the behaviour check printed no SUMMARY row before the apply"; exit 1; }
FAILSET=$(grep -E '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0092-behaviour-before.new | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([A-Z0-9]+)\..*/\1/' | sort | tr '\n' ' ' || true)
[ "${FAILSET}" = "L2 L3 L4 " ] || { echo "STOP: before the apply the behaviour check must FAIL on exactly L2, L3 and L4. It failed on [${FAILSET}]"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0092-behaviour-before.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${PROFILE}" = "5 OK / 0 VACUOUS / 3 FAIL" ] || { echo "STOP: before the apply the profile must read 5 OK / 0 VACUOUS / 3 FAIL. It read ${PROFILE}"; exit 1; }
echo "the instrument sees the gap: ${PROFILE}, failing on ${FAILSET}"

echo "--- only now, with a passing pre-check and a discriminating instrument in hand, does the previous sitting's state go"
rm -f /tmp/0092-postcheck.out /tmp/0092-behaviour-after.out /tmp/0092-applied.ok
mv /tmp/0092-precheck.new /tmp/0092-precheck.out
mv /tmp/0092-behaviour-before.new /tmp/0092-behaviour-before.out

echo "--- the apply. It is the only writing command in this document"
node packages/db/scripts/verified-migrate.mjs --tag 0092_care_team_location --sha256 ${SHA0092} --expect-pending 1
touch /tmp/0092-applied.ok
)
```

**EXPECT, and these are what stage 1 is read for:**

- **the pre-check prints `18` OK verdicts and no FAIL, J4a and J4b among them.** The
  stage asserts the count and both J4 rows by name, so the owner's gate is a halt and
  not an eyeball;
- **the behaviour check BEFORE prints `5 OK / 0 VACUOUS / 3 FAIL`, failing on exactly
  `L2`, `L3` and `L4`.** Those three FAILs are correct and required: they are the
  arms that see the rows 0092 closes. A run that failed on anything else, or on
  fewer, halts here with nothing applied;
- **`pending    1  [0092_care_team_location]`.** Exactly one. `verified-migrate.mjs`
  refuses to call drizzle at all if it is not 1.

It then prints `journal    89 -> 90  (delta 1)` and
`0092_care_team_location present by sha256: yes`. Stage 2 re-reads both from the
database rather than trusting this line.

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not
move, **3** on a missing file, a wrong sha256, an already-applied migration or a
pending count that is not 1, and **4** if drizzle itself failed.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits
4 on ANY thrown error, including its own journal read AFTER drizzle has committed (a
dropped connection is enough). So: **if stage 1 ended non-zero after the
`drizzle-kit migrate` banner had printed, do not paste stage 1 again.** Run
`node --env-file=/Users/ivan/osteojp-secrets/new-prod.env packages/db/scripts/read-applied-migrations.mjs`,
which is READ ONLY. If it lists 0092 as APPLIED, production is applied and no marker
exists, so stage 2 will refuse: stop and ask the owner to rule. The carry transcript in
`/tmp/0092-precheck.out` is intact and is what a ruled post-check would use. **If it
lists 0092 as NOT APPLIED, nothing changed** (see the next paragraph): stop and report
the exit code and the drizzle output to the owner. Do not re-run stage 1 on your own.

**0092 is two statements**, separated by `--> statement-breakpoint`: the ALTER and the
COMMENT. **drizzle applies both, and the journal row, in ONE transaction,** so a failure
leaves none of the three: measured on a throwaway by refusing the COMMENT with an event
trigger, `verified-migrate.mjs` exited 4 with `journal 89 -> 89`, the expression still
0091's and the comment unchanged. Post-check verdict 10 still reads the comment, as a
check on the file rather than on the transaction.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0092=23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa
SHAPOST=3cced312d6a996b2e28325ff31b74ff1bef681a2558c81b650264ed25a0a2f6a
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
BRANCH=care/CARE-LOC-0092-per-clinic

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

echo "--- ASSERTION 1, THE HEAD. Record the sha printed next beside the one stage 1 applied from. If it has MOVED, carry on: never go back to stage 1 after an apply. Everything this stage reads is asserted by sha256 below."
git fetch origin --prune
git rev-parse origin/${BRANCH}

echo "--- SR-58 again. This stage inherits nothing from stage 1"
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
test -f packages/db/migrations/0092_care_team_location.sql || { echo "STOP: 0092 is not on disk"; exit 1; }
test -f scripts/db/postcheck-care-loc.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0092_care_team_location.sql | cut -d' ' -f1)" = "${SHA0092}" ] || { echo "STOP: 0092 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-care-loc.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0092-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0092-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0092-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0092-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry policies_before)
S=$(carry secdef_functions_before)
A=$(carry appointments_policy_count_before)
M=$(carry appointments_rls_md5)
O=$(carry other_policies_md5)
[ -n "${J}" ] && [ -n "${P}" ] && [ -n "${S}" ] && [ -n "${A}" ] && [ -n "${M}" ] && [ -n "${O}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=${J} policies_before=${P} secdef_before=${S} appt_policies_before=${A} appt_rls_md5=${M} other_policies_md5=${O}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0092-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v policies_before="${P}" -v secdef_before="${S}" -v appt_policies_before="${A}" -v appt_rls_md5="${M}" -v other_policies_md5="${O}" -c "begin read only" -f scripts/db/postcheck-care-loc.sql -c "rollback" 2>&1 | tee /tmp/0092-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0092-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0092-postcheck.out || true)
[ "${OKS}" = 11 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 11"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0092 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0092}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0092 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0092 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "0092 APPLIED. 18/18 pre-check OK, 11/11 post-check OK, journal ${J} to ${JA}."
)
```

**EXPECT:**

- **the post-check prints `11` OK verdicts and no FAIL**, and the stage asserts that
  count itself;
- **the journal reads `89` before and `90` after**, and 0092's sha256 is in it
  **exactly once**. The final line must read
  `0092 APPLIED. 18/18 pre-check OK, 11/11 post-check OK, journal 89 to 90.`

The carry line before it must read `journal_before=89`. If it reads anything else,
something was applied that this document does not know about, and the pre-check's own
`journal_rows_before` verdict will already have said FAIL.

## STAGE 3: the behaviour check AFTER the apply. READ ONLY

Stage 2 proves the shape. This block proves the behaviour on production, with the same
file and the same actor stage 1 ran BEFORE the apply, so the two transcripts are an A/B
on the database itself: the three arms that failed must now pass, and nothing else may
move.

```
(
set -eo pipefail
SHABEHAVIOUR=3992a562f4e0afdca3ffc72933104cf3e7483c7d64ef41e76cbaf347a39282fb
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
ACTOR=a821521d-b67d-4a99-ac35-319c9e95fe6a
BRANCH=care/CARE-LOC-0092-per-clinic
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "checking from ${PIN}"
git checkout -q --detach ${PIN}
test -f scripts/db/behaviour-care-loc-readonly.sql || { echo "STOP: the behaviour check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/behaviour-care-loc-readonly.sql | cut -d' ' -f1)" = "${SHABEHAVIOUR}" ] || { echo "STOP: the behaviour check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
test -f /tmp/0092-behaviour-before.out || { echo "STOP: stage 1's BEFORE transcript is missing, so there is nothing to compare against"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs
rm -f /tmp/0092-behaviour-after.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v actor_id=${ACTOR} -f scripts/db/behaviour-care-loc-readonly.sql 2>&1 | tee /tmp/0092-behaviour-after.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0092-behaviour-after.out && { echo "STOP: a behaviour verdict read FAIL after the apply"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/0092-behaviour-after.out || { echo "STOP: the behaviour check printed no SUMMARY row, so the transcript is truncated"; exit 1; }
BEFORE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0092-behaviour-before.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
AFTER=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/0092-behaviour-after.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${AFTER}" = "8 OK / 0 VACUOUS / 0 FAIL" ] || { echo "STOP: after the apply the profile must read 8 OK / 0 VACUOUS / 0 FAIL: the three BEFORE failures turned, nothing else moved. It read ${AFTER}"; exit 1; }
echo "CARE-LOC BEHAVES AS RULED AT THE RLS LAYER. before ${BEFORE}, after ${AFTER}. The route-level half of the acceptance is NOT discharged by this transcript."
)
```

**EXPECT: no FAIL, a SUMMARY row, and the profile EXACTLY `8 OK / 0 VACUOUS / 0 FAIL`,**
and the block asserts all three. The exact profile is not a guess made in advance: it
is the BEFORE profile this same sitting measured, `5 OK / 0 VACUOUS / 3 FAIL`, with
the three arms 0092 exists to turn (L2, L3, L4) turned and nothing else moved. VACUOUS
cannot legitimately appear: L2 and L3 are the only arms with a vacuous branch, L2's
comparand includes L5's subject and L3's includes L4's, and stage 1 proved both exist
for this actor minutes earlier. So any other profile, a VACUOUS included, means the
policy or the data moved between the two runs, and the block halts on it rather than
calling it a pass. The CARE-01 document's behaviour block asserts an allowlist of
VACUOUS arms instead; that shape was reviewed as too loose, and this block does not
copy it.

## What every verdict must read

- **Pre-check, 18 rows, all `OK`:**
  - 0: the transaction is READ ONLY;
  - 1: the policy `appointments_care_team_patient_history_select` exists on
    `appointments`, exactly once. `ALTER POLICY` on a missing policy is an ERROR;
  - 2: its expression is 0091's by md5, `2f3548c5576a1b731d19d2cfc8f8c767`, read off
    production on 2026-09-22. The md5 is of the SERVER's deparse, which qualifies names
    by the session's `search_path`: with `public` on it (production's default, and
    measured) the value is the one above; a session without `public` reads another
    value and the pre-check halts before anything is applied, which is the safe way to
    be wrong;
  - 3: PERMISSIVE, `FOR SELECT`, `TO authenticated` alone, no WITH CHECK;
  - 4: 0092 is absent from the journal by hash;
  - 5: 0091 is present by hash;
  - 6: the newest applied `when` is below 0092's `1788501300000` (the 0058 skip guard);
  - `journal_rows_before` (carry): **89**. Any other number is a halt;
  - `policies_before` (carry); production read **93** on 2026-09-22;
  - `secdef_functions_before` (carry), every one owned by `postgres`; production read
    **26**;
  - `appointments_policy_count_before` (carry); production read **4**;
  - `appointments_rls_md5` (carry); production read `22e128271c25d59ca149731cb04e55aa`;
  - `other_policies_md5` (carry); production read `14e325105961a8721016cd8a67992ead`;
  - 7: the five helpers the amended predicate calls exist (`jwt_tenant_id`,
    `jwt_role`, `viewer_location_ids`, `viewer_care_team_patient_ids`,
    `viewer_treated_patient_ids`);
  - 8: `authenticated` can execute `viewer_location_ids()`. The new clause runs as the
    reading therapist, so without the grant it would not narrow the policy, it would
    make every therapist's read of `appointments` ERROR;
  - 9: `appointments` carries `location_id`, `patient_id` and `patient_2_id`;
  - **J4a**: under JP(cb)'s claims, `auth.uid()` is JP(cb) AND `viewer_location_ids()`
    is Castelo Branco alone;
  - **J4b**: the same for JP(lv) and Linda-a-Velha.
- **Post-check, 11 rows, all `OK`:**

1. the policy exists, exactly once;
2. still PERMISSIVE, `FOR SELECT`, `TO authenticated` alone, no WITH CHECK. A policy
   that came out `FOR ALL` would hand every therapist the right to change or delete a
   colleague's booking;
3. its expression is 0092's, by md5 `155e57e4d6759878d8f7f468cee48dfa`, the value
   read back off the rehearsal database immediately after `verified-migrate.mjs`
   applied this exact file;
4. it names `viewer_location_ids` and `location_id`, and still names role
   `therapist`, both care helpers and both patient columns;
5. the POLICY COUNT equals `policies_before` (ALTER, not drop and create);
6. the count on `appointments` equals `appointments_policy_count_before`;
7. the SECURITY DEFINER count equals `secdef_before`;
8. `appointments_rls`'s expression still hashes to `appointments_rls_md5`;
9. every OTHER policy still hashes, as one value, to `other_policies_md5`;
10. the policy comment names CARE-LOC, so the second statement landed;
11. `authenticated` can still execute `viewer_location_ids()`.

- **Then the journal, asserted by the stage and not by the file:** the row count is
  `journal_rows_before` + 1, so **89 to 90**; 0092's sha256 is present exactly once;
  and the last three rows are printed. Those three lines, with the pre-check and
  post-check counts and both behaviour profiles, are what the **SR-51** card carries.

| Behaviour verdict | What it proves | BEFORE | AFTER |
|---|---|---|---|
| 0 | the transaction is READ ONLY and REPEATABLE READ | OK | OK |
| L1 | the session IS the named actor, and holds the clinics counted | OK | OK |
| L2 | the actor reads EXACTLY `own work OR (followed AND own clinic)`: no row more, no row fewer | **FAIL** | OK |
| L3 | everything still readable at a foreign clinic is the actor's own work | **FAIL** | OK |
| L4 | one row the pre-0092 view admitted, at a foreign clinic, is refused | **FAIL** | OK |
| L5 | the control for L4, through the SAME policy: a followed patient's booking at the own clinic IS read | OK | OK |
| L6 | at the own clinic, a patient the actor neither follows nor treated is still refused | OK | OK |
| L7 | ON PURPOSE: the actor still reads work they personally hold at a foreign clinic | OK | OK |

### Which acceptance check this sitting discharges, and which it does not

Evidence is only evidence at the layer it was taken.

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 90, 0092 by hash | stage 2, and `read-applied-migrations.mjs` | the database |
| J4: the helper answers CB alone for JP(cb) and LV alone for JP(lv), in the same run | pre-check J4a and J4b | RLS helper, under impersonated claims |
| a therapist no longer reads a followed patient's appointment at a clinic they do not belong to, **through the policies on `appointments`** | L3 and L4, FAIL before and OK after, same actor, same sitting | RLS, under impersonated claims. Not the whole database surface: `public.appointment_conflicts(...)` is SECURITY DEFINER, callable by `authenticated`, and clinic-blind by an earlier ruling, so it still answers for any clinic. That predates 0092, is not the patient-following view, and is carded separately |
| they still read it at their own clinic | L5, OK both times | RLS |
| nothing else changed | post-check 5 to 9 | the catalogue |
| the agenda, the ficha and the Marcacoes screens show the narrowed set to a signed-in therapist | **NOT DISCHARGED BY THIS DOCUMENT.** No terminal holds a staff credential, by rule. CI's DB-gated suites on #1426 (`care-team-appointment-visibility.db.test.ts`, `appointments-location-rls.test.ts`) run the policy against the seeded database; the screen check is the owner's, after #1426 merges | the route |

## Rehearsed on 2026-09-22 on a throwaway standing at production's position

A fresh database, `reh0092`, on the throwaway Supabase Postgres 17 container the 0090
and 0091 rehearsals used (project `OsteoJP-solo-rehearsal`, database container only, on
`127.0.0.1:55522`), copied from that container's own database. **That database was NOT
at production's position when found**: an earlier rehearsal of #1426 had left 0092's
expression on the policy without a journal row. One `ALTER POLICY` restored 0091's
expression, taken byte for byte from `packages/db/migrations/0091_care_team.sql`, and
then the copy was **read against production, not assumed**. Both sides READ ONLY, the
same afternoon:

| Fingerprint | Production | Throwaway |
|---|---|---|
| journal rows, newest `when` | 89, `1788501200000` | 89, `1788501200000` |
| md5 over every journal hash, in id order | `742731a97df29bc868f4ab6ba2ae226f` | `742731a97df29bc868f4ab6ba2ae226f` |
| policies, and one md5 over every policy's name, command, permissive, roles, USING and WITH CHECK | 93, `fbff7a7280b7faf534409dd0036342f5` | 93, `fbff7a7280b7faf534409dd0036342f5` |
| the patient-following policy's expression | `2f3548c5576a1b731d19d2cfc8f8c767` | `2f3548c5576a1b731d19d2cfc8f8c767` |
| `appointments_rls` | `22e128271c25d59ca149731cb04e55aa` | `22e128271c25d59ca149731cb04e55aa` |
| `other_policies_md5` (the pre-check's own carry) | `14e325105961a8721016cd8a67992ead` | `14e325105961a8721016cd8a67992ead` |
| SECURITY DEFINER functions, owner | 26, all `postgres` | 26, all `postgres` |

Production was connected to READ ONLY, and never written.

**All five blocks were extracted from this document by a script and run under `zsh -f`**
from a clean detached clone whose `origin` was a private bare repository holding this
branch, so `git fetch origin --prune`, `git rev-parse origin/care/CARE-LOC-0092-per-clinic`,
the sidecar check and `pnpm db:check-journal` all ran for real and nothing was pushed to
GitHub. Exactly four substitutions, each counted, and the extractor refuses a block that
still names `origin/main`, the secrets directory, the apply worktree or a guard
invocation:

| Substitution | stage 0 | HEAD CHECK | stage 1 | stage 2 | stage 3 |
|---|---|---|---|---|---|
| `/tmp/` becomes a scratch directory, **substituted FIRST** | 0 | 0 | 20 | 8 | 7 |
| the `cd` line | 1 | 1 | 1 | 1 | 1 |
| the env-source line becomes `export DATABASE_URL_DIRECT=<the throwaway>` | 0 | 0 | 1 | 1 | 1 |
| `node scripts/assert-production-target.mjs` becomes an `echo` | 0 | 0 | 1 | 1 | 1 |

**Run twice, and the second run is the one recorded.** First from a local commit that
merged #1430's head before #1430 had merged; then, after the Tier C REVIEWER's fix (a
production figure removed from a test comment, production counts removed from the
CARE-01 script's header, post-check verdict 4 tightened, prose corrected), from
`7226a16d`, a local commit of exactly this branch's tree: main merged in as `e753dbf1`,
plus that fix. Every arm read the same both times.

### The arms. Each one was RUN, not reasoned about

| Arm | Expected | Result |
|---|---|---|
| **DIRTY:** stage 0 with one stray byte appended to `README.md` | refuses | exit **1**, `STOP: the apply worktree is not clean` |
| stage 0, clean | **`NUMBER AND FILE VERIFIED`**, nothing else | exit **0**; the sidecar `OK`; `Migration journal reconciled: 90 .sql files match 90 journal entries`; `NUMBER AND FILE VERIFIED` |
| HEAD CHECK | the sha stage 0 printed as `running from` | both printed the rehearsed commit |
| **A:** stage 2 BEFORE stage 1 | refuses | exit **1**, `STOP: stage 1 did not complete an apply in this sitting`. Journal still 89, expression still 0091's |
| stage 3 BEFORE stage 1 | refuses | exit **1**, `STOP: stage 1's BEFORE transcript is missing` |
| **B:** stage 1 | applies | pre-check **18 OK / 0 FAIL**, J4a and J4b OK; the instrument BEFORE: L2 `4` against `3` FAIL, L3 FAIL, L4 FAIL, `the instrument sees the gap: 5 OK / 0 VACUOUS / 3 FAIL, failing on L2 L3 L4`; `pending 1 [0092_care_team_location]`; `journal 89 -> 90 (delta 1)`; `0092_care_team_location present by sha256: yes`; exit **0**. Expression now `155e57e4…` |
| **G:** stage 1 pasted AGAIN, straight after the apply | refuses, destroys nothing | exit **1**, `STOP: stage 1 ALREADY APPLIED in this sitting`. Both transcripts **byte-identical** (`cmp`) to the ones arm B wrote |
| **C:** stage 2 | passes | carries parsed out of the transcript, not typed: `journal_before=89 policies_before=93 secdef_before=26 appt_policies_before=4 appt_rls_md5=22e12827… other_policies_md5=14e32510…`; post-check **11 OK / 0 FAIL**; journal 89 to 90, 0092 present by hash once; final line `0092 APPLIED. 18/18 pre-check OK, 11/11 post-check OK, journal 89 to 90.`; exit **0** |
| stage 3, after | the three FAILs turn | exit **0**, `CARE-LOC BEHAVES AS RULED AT THE RLS LAYER. before 5 OK / 0 VACUOUS / 3 FAIL, after 8 OK / 0 VACUOUS / 0 FAIL` |
| **stage 3 NEGATIVE:** 0091's expression put back after the apply, marker and BEFORE transcript intact | stage 3 halts | exit **1**, L2 `4` against `3`, L3 and L4 FAIL, `STOP: a behaviour verdict read FAIL after the apply`. 0092's expression then re-applied (`155e57e4…`) and the remaining arms run on it |
| **D:** stage 2, transcript backdated 61 minutes | refuses | exit **1**, `STOP: stage 1's transcript is over an hour old` |
| **E:** stage 2, marker removed | refuses | exit **1**, `STOP: stage 1 did not complete an apply in this sitting` |
| **F: negative control:** stage 1 AGAIN on the applied database, marker gone | the pre-check FAILs, nothing applied, the old transcript survives | exit **1**, four FAILs: verdict 2 (`155e57e4…` against `2f3548c5…`), 4, 6 and `journal_rows_before` (90 against 89). Journal still **90**, previous transcript **byte-identical**, the failed run in `.new` |
| **H:** the READ ONLY form the stages use | the server refuses a write | `ERROR: cannot execute CREATE TABLE in a read-only transaction`, exit 1, table absent |
| **the journal identity, BY HASH** | the row IS this file | the file hashes to `23964a4b…abfa`; the newest journal row, id **90**, carries that value at `when 1788501300000`; a count by that hash reads **1** |
| post-check, wrong `other_policies_md5` | verdict 9 FAILs | **FAIL** on 9 |
| post-check, wrong `policies_before` | verdict 5 FAILs | **FAIL** on 5 (93 against 94) |
| post-check, `other_policies_md5` omitted | refuses, reads nothing | exit **3**, `STOP: -v other_policies_md5 is missing` |
| post-check where the ALTER landed and the COMMENT did not | verdict 10 FAILs | **FAIL** on 10, `the old comment` |
| **J4b negative:** JP(lv) given a second clinic, fresh database | stage 1 halts BEFORE the apply | exit **1**, `J4b ... another set of clinics ... FAIL`, `STOP: a pre-check verdict read FAIL. Nothing was applied`. Journal **89**, expression 0091's |
| **J4a negative:** JP(cb) with no clinic, fresh database | the same | exit **1**, `J4a ... no clinic at all ... FAIL`. Journal **89** |
| **the named actor loses its L7 subject**, fresh database | the instrument halts BEFORE the apply | exit **3**, `STOP: the chosen actor holds no work of their own at a clinic they do not belong to, so L7 has no subject`. Journal **89**, nothing applied |
| **0092 already present outside the journal** (the ALTER run by hand) | stage 1 halts | exit **1**, verdict 2 FAIL (`155e57e4…` against `2f3548c5…`). Journal **89** |
| **a second file claiming 0092 on the branch** (`0092_patient_rgpd_acceptances.sql`, pushed to the private origin only, then removed) | stage 0 halts | exit **1**, `STOP: 2 files claim migration number 0092, not 1` |

### Measured on production, READ ONLY, 2026-09-22, before this document was written

- the pre-check, verbatim: **18 OK / 0 FAIL, J4a OK, J4b OK**. That is the owner's gate,
  met on production in one run;
- the behaviour check with the named actor: **`5 OK / 0 VACUOUS / 3 FAIL`, failing on
  exactly L2, L3 and L4**, in one second. That is the BEFORE stage 1 will assert;
- the behaviour check with the file's default selector: `STOP: ... L7 has no subject`,
  which is why the actor is named.

### The fixtures, and what each one is for

Synthetic rows, invented names, no production row read or copied, under the ids this
document pins so its blocks run unchanged: the seed tenant; its two clinics; JP(cb)
installed at Castelo Branco and JP(lv) at Linda-a-Velha (J4's subjects); the named actor
at Castelo Branco and a colleague at Linda-a-Velha; a patient the actor treated and a
stranger; and five appointments giving L4, L5, L6 and L7 one subject each: the actor's
own work at their clinic (making them a treater), their own work at the other clinic
(L7), the colleague's booking for the treated patient at the actor's clinic (L5) and at
the other clinic (L4, the row 0092 closes), and the colleague's booking for the stranger
at the actor's clinic (L6).

### CI carries the rest

The DB-gated suites on #1426, which apply every migration to a seeded database, carry the
behaviour at the route-free layer: `care-team-appointment-visibility.db.test.ts` and
`appointments-location-rls.test.ts` were re-based to 0092's behaviour on this branch.

**The stage blocks above are byte-identical to the ones these arms ran.** This section was
appended after the arms, which changed the document's own sha256, and
`docs/migration-apply-0092.sha256` was regenerated over the final bytes. Nothing inside
any fenced block was touched after arm B.

### The pushed tree is the rehearsed tree

The arms ran from `7226a16d`. The commit pushed differs from it in exactly two files:
this document, whose only change is this rehearsal record, outside every fenced block,
and its sidecar. The five fenced blocks were re-extracted from the pushed document and
compared to the ones the arms ran: identical.

## What this does NOT do

- **It does not narrow a therapist's OWN work.** `appointments_rls` admits
  `created_by = auth.uid()` and `practitioner_id` / `practitioner_2_id = auth.uid()`
  with no location predicate, so after 0092 a therapist still reads appointments they
  personally booked or worked at a clinic they no longer belong to. Narrowing that
  would hide a therapist's own history from them; it was not ruled, and it is carried
  to the owner as a question. **L7 asserts it on purpose**, so if it is ever narrowed
  the instrument says so. Post-check 8 proves `appointments_rls` did not move.
- **It does not touch `patients_select`.** Its therapist arm is
  `id = ANY (viewer_treated_patient_ids())`: patients the therapist personally
  treated, which is not a cross-clinic disclosure. Narrowing it would hide a patient
  they genuinely treated. Examined and deliberately left; post-check 9 proves it is
  byte-identical.
- **It does not change the NESA paths.** 0088's policy and 0090's function already
  carry `location_id = ANY (viewer_location_ids())`; 0092 makes the patient-following
  policy agree with them, so there is one definition of "this therapist's clinic" to
  change.
- **It does not change the application.** The agenda reads one practitioner set per
  viewer (`apps/web/lib/scheduling/data.ts`), which is what makes a day view a day
  view; 0092 changes what RLS admits, not what a screen asks for. The app's own
  location reader, `apps/web/lib/auth/viewer-locations.ts`, is a parallel TypeScript
  implementation that the policy never calls, and it fails OPEN on a therapist with no
  clinic where the SQL helper fails CLOSED. That divergence is known and is not this
  migration's to fix.
- **After this apply the CARE-01 behaviour file is no longer the live instrument.**
  `scripts/db/behaviour-care-team-readonly.sql` compares against the pre-0092
  predicate, so on a database standing at 0092 its B2 reads FAIL, correctly.
  `docs/migration-apply-0091.md` says so, and this document's stage 3 is its successor.
- **It is not reversible by editing it.** If 0092 must be undone, that is a new
  numbered migration whose `ALTER POLICY` restores 0091's expression, which is in
  `packages/db/migrations/0091_care_team.sql`. Never a hand-edit on production.
