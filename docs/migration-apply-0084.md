# 0084 production apply: a patient note becomes deletable

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0084-note-delete-policies` (#1240, held, merges only after this apply) |
| Migration | `packages/db/migrations/0084_note_delete_policies.sql`, sha256 `6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36` |
| Pre-check | `scripts/0084-precheck.sql`, sha256 `1e0df1773a0595b9e76629248466df16be310825ab3db74b75e3f41cb80fc41d` |
| Post-check | `scripts/0084-postcheck.sql`, sha256 `cbfe41a28f3d4234a23998bd6ec75afdd6b1db77693587dee81703a4dba16185` |
| Journal | tag `0084_note_delete_policies`, `when 1787801200000` (the `idx` is a row counter and renumbers when 0083 merges; the file hash is the identity) |
| Depends on | 0082 applied (`b43423ae…`) **and** 0083 applied (`12a756bd…`). Pre-check rows 8 and 9 refuse otherwise |
| What it does | Two `CREATE POLICY … FOR DELETE TO authenticated USING (tenant_id = jwt_tenant_id())`, one on `appointment_notes`, one on `patient_note_revisions`. No table, column, grant or existing policy is touched |

## The pin is the CONTENT, not a commit sha

This is the same reasoning as 0083's block. A branch that keeps moving while a block sits in review silently stops being the tree that was reviewed. A commit sha cannot be written into a document before that document exists. So each stage derives the head from the branch and asserts **the sha256 of every file it runs**. If the migration, pre-check or post-check differs by one byte, the stage halts. A rebase or an unrelated commit proceeds, correctly, because none of the three files changed.

## Why two stages, and why each re-checks out

**SR-58.** *Every* stage re-checks out its own ref and asserts its files are on disk before invoking drizzle. A stage that inherits a working tree from an earlier stage is not a valid apply.

**SR-59.** The post-check's carry comes from **this run's** pre-check transcript. Stage 2 parses it out of the file stage 1 wrote and refuses a transcript older than an hour, so a leftover from a rehearsal or an earlier sitting cannot be carried.

**Two things this block does that 0083's does not.**

1. **`set -o pipefail`, and psql's stderr goes into the transcript.** In `psql … | tee file` without pipefail, psql's own non-zero exit is replaced by `tee`'s zero. psql writes `ERROR:` lines to stderr, which `tee` never sees. So a check that aborts leaves a transcript with no `FAIL` in it, and the block goes on to print its success line. Here the pipeline's failure ends the stage, and any error text is also in the file.
2. **Stale transcripts are deleted first**, so stage 2 can only ever read the file this sitting's stage 1 produced.

## STAGE 1: pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0084=6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36
SHAPRE=1e0df1773a0595b9e76629248466df16be310825ab3db74b75e3f41cb80fc41d

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0084-precheck.out /tmp/0084-postcheck.out

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean:"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0084-note-delete-policies)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
echo "applying from $PIN"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0084_note_delete_policies.sql || { echo "STOP: 0084 is not on disk"; exit 1; }
test -f scripts/0084-precheck.sql                            || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs             || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs                 || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0084_note_delete_policies.sql | cut -d' ' -f1)" = "$SHA0084" ] \
  || { echo "STOP: 0084 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0084-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0084-precheck.sql 2>&1 | tee /tmp/0084-precheck.out
grep -q FAIL /tmp/0084-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0084_note_delete_policies \
     --sha256 $SHA0084 \
     --expect-pending 1
)
```

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not move. That is the silent no-op, the state that has cost this project days.

## STAGE 2: post-check, carry derived from stage 1

```
(
set -eo pipefail
SHA0084=6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36
SHAPOST=cbfe41a28f3d4234a23998bd6ec75afdd6b1db77693587dee81703a4dba16185

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0084-note-delete-policies)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0084_note_delete_policies.sql || { echo "STOP: 0084 is not on disk"; exit 1; }
test -f scripts/0084-postcheck.sql                           || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0084_note_delete_policies.sql | cut -d' ' -f1)" = "$SHA0084" ] \
  || { echo "STOP: 0084 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0084-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

# --- SR-59: the carry comes out of THIS SITTING's pre-check transcript -----
test -f /tmp/0084-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0084-precheck.out -mmin -60)" ] \
  || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0084-precheck.out; }
J=$(carry "journal row count")
[ -n "$J" ] || { echo "STOP: the carry did not parse out of the transcript"; exit 1; }
echo "carry from this run: expected_before=$J"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v expected_before="$J" \
     -f scripts/0084-postcheck.sql 2>&1 | tee /tmp/0084-postcheck.out
grep -q FAIL /tmp/0084-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
echo "0084 APPLIED. 9/9 pre-check OK, 8/8 post-check OK."
)
```

## What every verdict must read

- **Pre-check, 9 rows, all `OK`:**
  - 1: the journal count, which is the carry;
  - 2: 0084 absent;
  - 3 and 4: no DELETE policy yet;
  - 5: nothing newer than 0084 applied;
  - 6 and 7: DELETE already granted to `authenticated`, which is why 0084 adds no grant;
  - 8 and 9: 0082 and 0083 applied.
- **Post-check, 8 rows, all `OK`:**
  - 1: the journal grew by exactly one;
  - 2: 0084's hash is present;
  - 3 and 4: both policies exist, `FOR DELETE`;
  - 5: both target `authenticated` and nobody else;
  - 6 and 7: the full policy set on each table;
  - 8: `audit_log` still has no delete policy.

## The rows that are expected to FAIL today, and must

**Rows 8 and 9 read `FAIL` until 0082 and then 0083 have been applied.** That is the queue enforced, not a defect. 0083's journal `when` is `1787701200000` and 0084's is `1787801200000`. drizzle applies a file only when its `when` exceeds the newest `created_at` already recorded. So applying 0084 first would make 0083 unapplyable for ever while printing "migrations applied successfully": the INC-07 / 0058 failure, predictable in advance.

Row 5 does **not** guard this, and until 2026-09-10 the pre-check's header said it did. Row 5 passes whenever nothing newer than 0084 is applied, and it passed with 0083 still pending. Rows 8 and 9 were added for exactly that reason.

## Order of the sitting

0082 → 0083 (merge #1227) → **0084 (this document)** → merge #1240 → 0085 (`docs/migration-apply-0085.md`).

#1240 is one click from merge once this apply reads green, **provided #1227 has not merged in between**. If it has, both branches append a journal entry after 0082, so #1240 needs one sync with main before the button is live. The migration's bytes do not change in that sync, so the pins above still hold.
