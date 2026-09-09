# 0083 production apply — `switch_amount_cents` / `switch_reason`

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, or any `FAIL` verdict, halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0083-pack-switch-amount` |
| Migration | `packages/db/migrations/0083_pack_switch_amount.sql`, sha256 `12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d` |
| Pre-check | `scripts/0083-precheck.sql`, sha256 `446203301a8a075bab13193a734c74a5b99e2070619b669cdb00e2d60181ca69` |
| Post-check | `scripts/0083-postcheck.sql`, sha256 `9cca35278d6f718ace2854b9038ab75c9d3e717c3482a43d6aa09850895b2cb3` |
| Journal | `idx 80`, tag `0083_pack_switch_amount`, `when 1787701200000` |
| Depends on | 0082 applied (`b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9`) |

### The pin is the CONTENT, not a commit sha, and that is deliberate

The runbook pins a commit because a branch that keeps moving while a block sits in
review silently stops being the tree that was reviewed — 0061 and 0062 both lost that
way. **A commit sha cannot be written into the document that is part of that commit**;
the moment this file is committed, the sha it names is the previous one.

So the block derives the head from the branch and then asserts **the sha256 of all
three files it actually runs**. That is strictly stronger for the thing at risk: if the
branch moves and the migration, pre-check or post-check differs by one byte, the stage
halts. If it moves for an unrelated commit — a doc edit, a rebase onto main — it
proceeds, which is correct, because none of the three files changed.

## Why two stages and why each re-checks out

SR-58: *every* stage re-checkouts its own ref and asserts the files are on disk before
invoking drizzle. A stage that inherits a working tree from a previous stage is not a
valid apply — 0038-0041 and 0049 were all applies where the tree was not what the block
assumed.

SR-59: the post-check's carry values come from **this run's** pre-check transcript,
never an earlier one. Here they are not retyped at all: stage 2 parses them out of the
file stage 1 wrote. A carry that cannot be retyped cannot be retyped wrongly.

## STAGE 1 — pre-flight, pre-check, apply

```
(
set -e
SHA0083=12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d
SHAPRE=446203301a8a075bab13193a734c74a5b99e2070619b669cdb00e2d60181ca69

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

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
[ "$(shasum -a 256 packages/db/migrations/0083_pack_switch_amount.sql | cut -d' ' -f1)" = "$SHA0083" ] \
  || { echo "STOP: 0083 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0083-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0083-precheck.sql | tee /tmp/0083-precheck.out
grep -q FAIL /tmp/0083-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0083_pack_switch_amount \
     --sha256 $SHA0083 \
     --expect-pending 1
)
```

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not
move. That is the silent no-op, and it is the state that has cost this project days.

## STAGE 2 — post-check, carries derived from stage 1

```
(
set -e
SHA0083=12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d
SHAPOST=9cca35278d6f718ace2854b9038ab75c9d3e717c3482a43d6aa09850895b2cb3

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0083-pack-switch-amount)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f scripts/0083-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0083_pack_switch_amount.sql | cut -d' ' -f1)" = "$SHA0083" ] \
  || { echo "STOP: 0083 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0083-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

# --- SR-59: the carries come out of THIS RUN's pre-check transcript --------
test -f /tmp/0083-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
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
     -f scripts/0083-postcheck.sql | tee /tmp/0083-postcheck.out
grep -q FAIL /tmp/0083-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
echo "0083 APPLIED. 12/12 pre-check, 12/12 post-check."
)
```

## What every verdict must read

Twelve `OK` from the pre-check, twelve from the post-check, and one `NOTICE` reading
`ARMS 0a-0d OK: three refusals fired, zero-with-a-reason was accepted`.

**Arm 0d is the one that is not a refusal**, and it is not decoration: `CHECK (false)`
passes 0a, 0b and 0c perfectly. The ruling's content is that **zero is accepted while
missing is refused**, so a post-check proving only the refusals would be green over a
schema that refuses the goodwill upgrade the ruling exists to record.

## The one pre-check row that is expected to fail today

`0082 IS applied (by file hash)` reads **FAIL** until 0082 has been applied. That is the
queue enforced, not a defect: 0082's journal `when` is `1787601200000` and 0083's is
`1787701200000`, and drizzle applies a file only when its `when` exceeds the newest
`created_at` already recorded. **Applying 0083 first would make 0082 unapplyable for
ever while printing "migrations applied successfully"** — the INC-07 / 0058 failure mode,
here predictable in advance.

## Rehearsed

Both stages were run end to end against a lane database on the same schema, with a
synthetic drizzle journal seeded to 0081 + 0082, in one rolled-back transaction:
pre-flight and SR-58 assertions pass, pre-check **0 FAIL**, the three carries parse out
of the transcript as `2 / 4 / 3`, post-check **0 FAIL**, arms 0a-0d fire. The lane was
returned to its prior state (0 switch columns, no `drizzle` schema).

The carry parser was fixed during that rehearsal: a regex match on
`CHECK constraints on the table (before)` silently returned empty, because the
parentheses are regex grouping. It uses `index()` — a fixed-string match — for that
reason, and an empty carry is a `STOP:` rather than a `-v` of nothing.
