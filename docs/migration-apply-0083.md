# 0083 production apply — `switch_amount_cents` / `switch_reason`

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0083-pack-switch-amount` (#1227, held, merges only after this apply) |
| Migration | `packages/db/migrations/0083_pack_switch_amount.sql`, sha256 `12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d` |
| Pre-check | `scripts/0083-precheck.sql`, sha256 `446203301a8a075bab13193a734c74a5b99e2070619b669cdb00e2d60181ca69` |
| Post-check | `scripts/0083-postcheck.sql`, sha256 `9cca35278d6f718ace2854b9038ab75c9d3e717c3482a43d6aa09850895b2cb3` |
| Journal | tag `0083_pack_switch_amount`, `when 1787701200000` (the `idx` is a row counter; the file hash is the identity) |
| Depends on | 0082 applied (`b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9`). **It is** (MIG-0082), so the pre-check row that checks it reads OK today |

### Where this document lives

Until 2026-09-10 it existed **only on the #1227 branch**, so
`git show origin/main:docs/migration-apply-0083.md` answered
`fatal: path ... does not exist`. It is now on **main**, and the #1227 branch carries
the **identical bytes**, so #1227's merge adds nothing and its own test
(`scripts/0083-checks-quote-the-real-file.test.mjs`, which reads this file) keeps
passing on both trees. The blocks below run the migration and both checks from the
**branch**, never from main, because that is where those three files are.

### The pin is the CONTENT, not a commit sha, and that is deliberate

The runbook pins a commit because a branch that keeps moving while a block sits in
review silently stops being the tree that was reviewed — 0061 and 0062 both lost that
way. **A commit sha cannot be written into the document that is part of that commit**;
the moment this file is committed, the sha it names is the previous one.

So each stage derives the head from the branch and then asserts **the sha256 of every
file it runs**. That is strictly stronger for the thing at risk: if the branch moves and
the migration, pre-check or post-check differs by one byte, the stage halts. If it
moves for an unrelated commit — a doc edit, a rebase onto main — it proceeds, which is
correct, because none of the three files changed.

## Why two stages and why each re-checks out

**SR-58:** *every* stage re-checks out its own ref and asserts its files are on disk,
by sha256, before invoking drizzle. A stage that inherits a working tree from a
previous stage is not a valid apply — 0038-0041 and 0049 were all applies where the
tree was not what the block assumed.

**SR-59:** the post-check's carry values come from **this sitting's** pre-check
transcript, never an earlier one. They are not retyped at all: stage 2 parses them out
of the file stage 1 wrote, and refuses a transcript more than an hour old.

### What this block does that its first draft did not

The first draft of this block (on #1227 since 2026-09-09) had the right shape and three
gaps, found while writing and rehearsing the 0084 and 0085 blocks:

1. **`set -o pipefail`, and psql's stderr goes into the transcript.** In
   `psql … | tee file` without pipefail, psql's own non-zero exit is replaced by
   `tee`'s zero, and psql writes `ERROR:` lines to stderr, which `tee` never sees. The
   post-check's arms fail by RAISING - so an arm that fired would have stopped psql, left
   a transcript with no `FAIL` row in it, and the block would have printed its success
   line under the ERROR on the screen. Now the pipeline's failure ends the stage, and the
   error text is in the file too.
2. **Stale transcripts are deleted first, and stage 2 requires an applied-marker.** Stage
   1 writes `/tmp/0083-applied.ok` only after `verified-migrate` exits 0; stage 2
   refuses without a fresh one, so a stage 1 that halted cannot be followed by a
   post-check that reads an unchanged database.
3. **A verdict is matched in its column, and the OKs are counted** - 12 pre, 12 post - so
   a run that printed fewer rows cannot pass either. (0083's checks print no banner
   containing the word FAIL, so the old bare grep happened to work here; the 0084 block
   showed that it does not in general.)

## STAGE 1 — pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0083=12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d
SHAPRE=446203301a8a075bab13193a734c74a5b99e2070619b669cdb00e2d60181ca69

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0083-precheck.out /tmp/0083-postcheck.out /tmp/0083-applied.ok

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean:"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0083-pack-switch-amount)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
echo "applying from $PIN"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0083_pack_switch_amount.sql || { echo "STOP: 0083 is not on disk"; exit 1; }
test -f scripts/0083-precheck.sql                          || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs           || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs               || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0083_pack_switch_amount.sql | cut -d' ' -f1)" = "$SHA0083" ] \
  || { echo "STOP: 0083 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0083-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0083-precheck.sql 2>&1 | tee /tmp/0083-precheck.out
# A verdict is the LAST column of a row: match it there, and count the OKs.
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0083-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0083-precheck.out)" = 12 ] \
  || { echo "STOP: the pre-check did not print 12 OK verdicts"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0083_pack_switch_amount \
     --sha256 $SHA0083 \
     --expect-pending 1
touch /tmp/0083-applied.ok
)
```

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not
move. That is the silent no-op, and it is the state that has cost this project days.

## STAGE 2 — post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0083=12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d
SHAPOST=9cca35278d6f718ace2854b9038ab75c9d3e717c3482a43d6aa09850895b2cb3

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0083-pack-switch-amount)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0083_pack_switch_amount.sql || { echo "STOP: 0083 is not on disk"; exit 1; }
test -f scripts/0083-postcheck.sql                         || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0083_pack_switch_amount.sql | cut -d' ' -f1)" = "$SHA0083" ] \
  || { echo "STOP: 0083 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0083-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

# --- stage 1 must have APPLIED, in this sitting, not merely run ------------
[ -n "$(find /tmp/0083-applied.ok -mmin -60 2>/dev/null)" ] \
  || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

# --- SR-59: the carries come out of THIS SITTING's pre-check transcript ----
test -f /tmp/0083-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0083-precheck.out -mmin -60)" ] \
  || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0083-precheck.out; }
J=$(carry journal_rows_before)
I=$(carry instances_rows_before)
C=$(carry "CHECK constraints on the table (before)")
[ -n "$J" ] && [ -n "$I" ] && [ -n "$C" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=$J instances_before=$I checks_before=$C"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v journal_before="$J" -v instances_before="$I" -v checks_before="$C" \
     -f scripts/0083-postcheck.sql 2>&1 | tee /tmp/0083-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0083-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0083-postcheck.out)" = 12 ] \
  || { echo "STOP: the post-check did not print 12 OK verdicts"; exit 1; }
grep -q "ARMS 0a-0d OK" /tmp/0083-postcheck.out || { echo "STOP: the arms notice is missing"; exit 1; }
echo "0083 APPLIED. 12/12 pre-check OK, arms 0a-0d OK, 12/12 post-check OK."
)
```

## What every verdict must read

Twelve `OK` from the pre-check. Then, from the post-check, one `NOTICE` reading
`ARMS 0a-0d OK: three refusals fired, zero-with-a-reason was accepted`, and twelve `OK`.

**Arm 0d is the one that is not a refusal**, and it is not decoration: `CHECK (false)`
passes 0a, 0b and 0c perfectly. The ruling's content is that **zero is accepted while
missing is refused**, so a post-check proving only the refusals would be green over a
schema that refuses the goodwill upgrade the ruling exists to record.

**The arms need one existing `patient_pack_instances` row to clone.** On an empty table
the post-check refuses ("the constraints are UNPROVEN, not proven") rather than passing
vacuously. Every probe is rolled back and the row count is re-asserted afterwards.

## The pre-check row that used to fail, and why it reads OK now

`0082 IS applied (by file hash)` read **FAIL** until 0082 was applied - the queue
enforced, not a defect. 0082's journal `when` is `1787601200000` and 0083's is
`1787701200000`, and drizzle applies a file only when its `when` exceeds the newest
`created_at` already recorded, so **applying 0083 first would have made 0082
unapplyable for ever while printing "migrations applied successfully"**. 0082 has since
been applied (MIG-0082), so that row reads **OK** today. If it reads FAIL in the
sitting, stop: the target is not the database this block was written for.

## The carry parser

It uses `index()` - a fixed-string match - because a regex match on
`CHECK constraints on the table (before)` silently returned empty in the first
rehearsal: the parentheses are regex grouping. An empty carry is a `STOP:`, never a `-v`
of nothing.

## Order of the sitting

0082 (applied) → **0083 (this document)** → merge #1227 → 0084
(`docs/migration-apply-0084.md`) → merge #1240 → 0085
(`docs/migration-apply-0085.md`) → merge #1264.

## Rehearsed, 2026-09-11

Both stages were run **as printed above** against a throwaway Postgres built from
`origin/main`'s `supabase/migrations` (through 0082). It had a drizzle journal of 80
rows carrying the real file hash of every migration on main, and two synthetic
`patient_pack_instances` rows for the arms to clone. Only the four lines that cannot run
off production were replaced mechanically: the apply tree became a lane worktree, the env
file became the throwaway's URL, the target guard became an echo, and `/tmp` became a
scratch directory (replaced first, so no inserted path was itself rewritten).

| Run | Result |
|---|---|
| stage 2 **before** stage 1 | `STOP: stage 1 did not complete an apply in this sitting`, exit 1. The applied-marker refuses a post-check over an unchanged database |
| stage 1 | `applying from 7f9e191e`, pre-check **12 OK / 0 FAIL** (the 0082 row reads `present`), `verified-migrate` journal **80 -> 81, delta 1**, exit 0 |
| stage 2 | carries parsed as `journal_before=80 instances_before=2 checks_before=3`; `NOTICE: ARMS 0a-0d OK: three refusals fired, zero-with-a-reason was accepted, 2 rows`; post-check **12 OK / 0 FAIL**; `0083 APPLIED. 12/12 pre-check OK, arms 0a-0d OK, 12/12 post-check OK.` |

Afterwards the database carried both switch columns, CHECK constraints went 3 -> 6, and
it still had 2 instance rows: the arms left nothing behind.
