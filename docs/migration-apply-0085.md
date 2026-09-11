# 0085 production apply: clinic opening hours and CB's 13:00-14:00 closure

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0085-clinic-hours-cb-closure` (#1264, PURPLE, "DO NOT MERGE UNTIL APPLIED") |
| Migration | `packages/db/migrations/0085_clinic_hours_and_cb_closure.sql`, sha256 `568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1` |
| Pre-check | `scripts/0085-precheck.sql` **on main**, sha256 `7ad46e11aa36e5090f69fb29e5bdf323c44c1374d16a3f26305a15d3393c4337` |
| Post-check | `scripts/0085-postcheck.sql` **on main**, sha256 `4abea93e2c22a590905e3b3612d42bfbb1067d81561bf076a37e00591945094f` |
| Journal | tag `0085_clinic_hours_and_cb_closure`, `when 1787901200000` (the `idx` renumbers as 0083 and 0084 merge; the file hash is the identity) |
| Depends on | 0082, 0083 **and** 0084 applied, each checked by file hash (pre-check rows 3-5) |
| What it does | Four columns on `locations` (`opens_at` / `closes_at`, NOT NULL, defaulting to today's compiled-in 08:00 / 20:00; `midday_closed_from` / `_to`, nullable), four CHECK constraints, and one UPDATE that gives the clinic named `…(CB)…` a 13:00-14:00 closure |

## Why the checks come from a second ref

The migration's branch belongs to PURPLE and carries no pre- or post-check. Adding files to it would move a branch another lane is working on (the shared-branch collision this project has already paid for). So the checks live on **main**, and each stage reads them out of `origin/main` **by path** into a scratch file, then asserts their sha256 before running anything.

The pin is the same as for the migration itself: **content, not a commit**. If main moves for any other reason, the checks still resolve and still match. If either check differs by one byte, the stage halts.

The migration is still taken from **its own branch's tree**, checked out and hashed on disk (SR-58). Only the two read-only SQL files come from main.

## Why two stages, and why each re-checks out

**SR-58.** Every stage re-checks out its own ref and asserts its files are on disk before invoking drizzle.

**SR-59.** The three carries come from this sitting's pre-check transcript:
- `journal_rows_before`
- `locations_rows_before`
- `cb_rows_before`

Stage 2 parses them out of the file stage 1 wrote, and refuses a transcript older than an hour.

Like the 0084 block, and unlike 0083's, both stages run with `set -o pipefail` and route psql's stderr into the transcript. Without that, `psql … | tee` reports `tee`'s success over a psql that aborted, and an `ERROR` from the post-check's arms would never reach the file that is searched.

Verdicts are matched **in their column** (`| FAIL` / `| OK` at the end of a row) and the OKs are **counted**: 10 for the pre-check, 15 for the post-check. Both files' banners contain the word FAIL, and rehearsing the 0084 block showed that a bare `grep FAIL` stops a sitting in which every row read OK. Stage 1 writes `/tmp/0085-applied.ok` only after `verified-migrate` exits 0, and stage 2 refuses without a fresh one.

## STAGE 1: pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0085=568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1
SHAPRE=7ad46e11aa36e5090f69fb29e5bdf323c44c1374d16a3f26305a15d3393c4337

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0085-precheck.sql /tmp/0085-postcheck.sql /tmp/0085-precheck.out /tmp/0085-postcheck.out /tmp/0085-applied.ok

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean:"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0085-clinic-hours-cb-closure)
CHECKS=$(git rev-parse origin/main)
[ "$(git cat-file -t $PIN)" = commit ]    || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
[ "$(git cat-file -t $CHECKS)" = commit ] || { echo "STOP: $CHECKS does not resolve to a commit"; exit 1; }
echo "applying from $PIN, checks from main $CHECKS"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0085_clinic_hours_and_cb_closure.sql || { echo "STOP: 0085 is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs                    || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs                        || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0085_clinic_hours_and_cb_closure.sql | cut -d' ' -f1)" = "$SHA0085" ] \
  || { echo "STOP: 0085 on disk is not the approved file"; exit 1; }

# --- the pre-check comes from main, by path, pinned by content -------------
git show $CHECKS:scripts/0085-precheck.sql > /tmp/0085-precheck.sql \
  || { echo "STOP: the pre-check is not on origin/main"; exit 1; }
[ "$(shasum -a 256 /tmp/0085-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on main is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f /tmp/0085-precheck.sql 2>&1 | tee /tmp/0085-precheck.out
# A verdict is the LAST column of a row; the banner lines also say "FAIL".
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0085-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0085-precheck.out)" = 10 ] \
  || { echo "STOP: the pre-check did not print 10 OK verdicts"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0085_clinic_hours_and_cb_closure \
     --sha256 $SHA0085 \
     --expect-pending 1
touch /tmp/0085-applied.ok
)
```

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0085=568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1
SHAPOST=4abea93e2c22a590905e3b3612d42bfbb1067d81561bf076a37e00591945094f

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0085-clinic-hours-cb-closure)
CHECKS=$(git rev-parse origin/main)
[ "$(git cat-file -t $PIN)" = commit ]    || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
[ "$(git cat-file -t $CHECKS)" = commit ] || { echo "STOP: $CHECKS does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0085_clinic_hours_and_cb_closure.sql || { echo "STOP: 0085 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0085_clinic_hours_and_cb_closure.sql | cut -d' ' -f1)" = "$SHA0085" ] \
  || { echo "STOP: 0085 on disk is not the approved file"; exit 1; }
git show $CHECKS:scripts/0085-postcheck.sql > /tmp/0085-postcheck.sql \
  || { echo "STOP: the post-check is not on origin/main"; exit 1; }
[ "$(shasum -a 256 /tmp/0085-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on main is not the approved file"; exit 1; }

# --- stage 1 must have APPLIED, in this sitting, not merely run ------------
[ -n "$(find /tmp/0085-applied.ok -mmin -60 2>/dev/null)" ] \
  || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

# --- SR-59: the carries come out of THIS SITTING's pre-check transcript ----
test -f /tmp/0085-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0085-precheck.out -mmin -60)" ] \
  || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0085-precheck.out; }
J=$(carry journal_rows_before)
L=$(carry locations_rows_before)
C=$(carry cb_rows_before)
[ -n "$J" ] && [ -n "$L" ] && [ -n "$C" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=$J locations_before=$L cb_before=$C"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v journal_before="$J" -v locations_before="$L" -v cb_before="$C" \
     -f /tmp/0085-postcheck.sql 2>&1 | tee /tmp/0085-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0085-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0085-postcheck.out)" = 15 ] \
  || { echo "STOP: the post-check did not print 15 OK verdicts"; exit 1; }
grep -q "ARMS 0a-0e OK" /tmp/0085-postcheck.out || { echo "STOP: the arms notice is missing"; exit 1; }
echo "0085 APPLIED. 10/10 pre-check OK, arms 0a-0e OK, 15/15 post-check OK."
)
```

## What every verdict must read

- **Pre-check:** ten `OK` rows, plus one `INFO` row that prints the clinic name row 10 matched:
  - 1, 9 and 10: the three carries;
  - 2: 0085 absent;
  - 3-5: 0082, 0083 and 0084 applied, by hash;
  - 6: nothing newer than 0085 applied;
  - 7 and 8: none of the columns or constraints exist yet;
  - 10: exactly one clinic matches `%(CB)%`.
- **Post-check:** one `NOTICE` reading `ARMS 0a-0e OK: four refusals fired, each by its own constraint, and a valid closure was accepted and rolled back`, then fifteen `OK` rows:
  - 1-3: the journal moved by one, and 0085 plus 0084 are present;
  - 4-7: each column's type, nullability and default;
  - 8-11: each constraint's exact normalised text, VALIDATED;
  - 12-15: the data. Row count unchanged, CB carries 13:00-14:00, no other clinic has a closure, and every clinic reads 08:00-20:00.

**The arms write nothing on either path.** A refused probe rolls back its own savepoint. A probe a missing constraint would have ACCEPTED raises on the next line, which aborts the whole statement, the update included. The one probe that is meant to succeed (0e) rolls itself back with its own SQLSTATE. Each refusal must come from **its own** constraint, by name. A backwards closure refused by the wrong check is a FAIL, not a pass.

## Rows that will FAIL today, and the one that might

**Rows 3, 4 and 5 read `FAIL` until 0082, 0083 and 0084 are applied.** That is the queue enforced. Applying 0085 first would push the newest `created_at` past all three of their `when`s, and drizzle would skip each of them for ever while printing "migrations applied successfully".

**Row 10 is the one this lane cannot predict, and it is the reason the pre-check exists.** 0085 seeds the closure with `WHERE name LIKE '%(CB)%'`, because no clinic id is stable across environments. The migration's comment says production names its clinics `OsteoJP (LV)` / `OsteoJP (CB)`. This lane has no production access, so that is **unverified here**. The local lanes use `Castelo Branco`, which would match nothing. Zero matches is not an error to Postgres: the apply succeeds and every column row passes, but **CB gets no closure**. So row 10 refuses unless exactly one row matches, and row 11 prints what it matched. If row 10 FAILS, stop. The name form is a ruling for the owner and PURPLE, not something to work around in the sitting.

## Rehearsed, 2026-09-10

Both stages were run **as printed above**, on the same throwaway database, straight after the 0084 rehearsal. The database was seeded with two synthetic clinics named `OsteoJP (CB)` and `OsteoJP (LV)`, the form the migration assumes. The same four production-only lines were replaced as for 0084. In addition, `origin/main` in the `CHECKS=` line became the branch that carries these two check files, because they are not on main until this document's PR merges. The files were still read by path out of a git ref and hash-checked, exactly as the block does.

| Stage | Result |
|---|---|
| 1 | migration from `240ece80` and checks from a git ref, both hash-checked. Pre-check **10 OK / 0 FAIL**. `verified-migrate` moved the journal **82 → 83, delta 1**, exit 0 |
| 2 | carries parsed as `journal_before=82 locations_before=2 cb_before=1`; `NOTICE: ARMS 0a-0e OK`; post-check **15 OK / 0 FAIL**; `0085 APPLIED` |

The four constraint texts in rows 8-11 were captured from this database, which is what Postgres normalises the migration to. So the post-check compares against what Postgres actually stores, not against a transcription of the migration.

## Order of the sitting

0082 → 0083 (merge #1227) → 0084 (`docs/migration-apply-0084.md`, merge #1240) → **0085 (this document)** → merge #1264.

The NESA migration is numbered **0086** (`packages/db/migrations/0086_nesa_shared_resource.sql`, branch `db/0086-nesa-shared-resource`). It is applied **after** this one, from `docs/migration-apply-0086.md`.
