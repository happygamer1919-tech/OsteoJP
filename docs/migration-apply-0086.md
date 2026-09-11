# 0086 production apply: NESA as a shared resource (SCHED-17)

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0086-nesa-shared-resource` (BLUE, "DO NOT MERGE UNTIL APPLIED") |
| Migration | `packages/db/migrations/0086_nesa_shared_resource.sql`, sha256 `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99` |
| Pre-check | `scripts/0086-precheck.sql` on the branch, sha256 `bb3317e6a762f8a3d196d9495ee592e059223379a27a81a2b6a6382ef951164f` |
| Post-check | `scripts/0086-postcheck.sql` on the branch, sha256 `030f7a4baab3cae26b7879570f0ba9e3b5fd4f3309cde8dab76653618db1b5bb` |
| Gate | `scripts/nesa-equivalence.sql` on the branch, sha256 `cd0d748db2e07185a16f41a4def5cbc5e1cc9ff5114aba724613f13ab0044a75` (read-only; run against production in stage 1) |
| Owner checker | `packages/db/scripts/check-security-definer-owner.mjs` on the branch, sha256 `df55a186d6d29832f93bfc09417e43892933f104b3c100e6cbe758e13ee3eadb` (read-only; expects 22 after this apply) |
| Journal | tag `0086_nesa_shared_resource`, `when 1788001200000` (the `idx` renumbers as 0083, 0084 and 0085 merge; the file hash is the identity) |
| Depends on | 0082, 0083, 0084 **and** 0085 applied, each checked by file hash (pre-check rows 3-6) |
| What it does | One column (`users.is_shared_resource`, NOT NULL, default false), one nullary STABLE SECURITY DEFINER function (`shared_resource_practitioner_ids()`), and `appointments_rls` restated with one new therapist disjunct in both USING and WITH CHECK. It creates **no** NESA row |

## The migration's bytes, and why its header still says "NO NUMBER"

This file was authored on 2026-09-10 as `packages/db/migrations-pending/NEXT-AFTER-0085_nesa_shared_resource.sql`, measured by both gate arms, and merged un-numbered (#1267). The pending directory's rule is that promotion is a rename and nothing else. So `0086_nesa_shared_resource.sql` is **byte for byte** the file the gate measured: same sha256, `d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99`. Its opening comment still reads "NO NUMBER. THIS FILE IS NOT APPLIABLE". That sentence was true of the pending file and is not an instruction; editing it would change the hash that every check and both gate runs are pinned to.

## Why stage 1 runs the gate against production

The migration's own header says nothing in it is applied until strategy has read `scripts/nesa-equivalence.sql` run **against production**. Stage 1 runs it, read-only, after the pre-check and before the apply. It refuses to continue unless the gate's single answer reads **INERT**, with loosened, tightened, outside-expected and missed all **0**. That is the true state of a production with no shared resource flagged yet. The transcript `/tmp/0086-gate.out` is the output strategy reads.

The gate writes nothing: one temporary table and session settings, both gone when psql exits.

## Why the checks live on this branch

Unlike 0085, this migration's branch is BLUE's own, so there is no other lane's branch to avoid moving. The checks, the gate and the owner checker all sit beside the migration, and each stage checks the branch out and asserts every file it runs by sha256 on disk (SR-58).

## Why two stages, and why each re-checks out

**SR-58.** Every stage re-checks out its own ref and asserts its files are on disk before invoking drizzle.

**SR-59.** The five carries come from this sitting's pre-check transcript:
- `journal_rows_before`
- `users_rows_before`
- `appointments_rows_before`
- `clinic_rows_before`
- `staff_location_links_before`

Stage 2 parses them out of the file stage 1 wrote, and refuses a transcript older than an hour. No carry name is a substring of another, because the parser matches with `index()`.

Both stages run with `set -o pipefail` and route psql's stderr into the transcript, so an `ERROR` from the post-check's arms reaches the file that is searched and ends the stage. Verdicts are matched **in their column** (`| FAIL` / `| OK` at the end of a row) and the OKs are **counted**: 16 for the pre-check, 15 for the post-check. Stage 1 writes `/tmp/0086-applied.ok` only after `verified-migrate` exits 0, and stage 2 refuses without a fresh one.

## STAGE 1: pre-flight, pre-check, gate, apply

```
(
set -eo pipefail
SHA0086=d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99
SHAPRE=bb3317e6a762f8a3d196d9495ee592e059223379a27a81a2b6a6382ef951164f
SHAGATE=cd0d748db2e07185a16f41a4def5cbc5e1cc9ff5114aba724613f13ab0044a75

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0086-precheck.out /tmp/0086-gate.out /tmp/0086-postcheck.out /tmp/0086-owner.out /tmp/0086-applied.ok

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean:"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0086-nesa-shared-resource)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
echo "applying from $PIN"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0086_nesa_shared_resource.sql || { echo "STOP: 0086 is not on disk"; exit 1; }
test -f scripts/0086-precheck.sql                            || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/nesa-equivalence.sql                         || { echo "STOP: the gate is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs             || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs                 || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0086_nesa_shared_resource.sql | cut -d' ' -f1)" = "$SHA0086" ] \
  || { echo "STOP: 0086 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0086-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/nesa-equivalence.sql | cut -d' ' -f1)" = "$SHAGATE" ] \
  || { echo "STOP: the gate on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0086-precheck.sql 2>&1 | tee /tmp/0086-precheck.out
# A verdict is the LAST column of a row: match it there, and count the OKs.
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0086-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0086-precheck.out)" = 16 ] \
  || { echo "STOP: the pre-check did not print 16 OK verdicts"; exit 1; }

# --- the gate, against production, read-only. Strategy reads this file -----
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/nesa-equivalence.sql 2>&1 | tee /tmp/0086-gate.out
grep -qE '^[[:space:]]*0[[:space:]]*\|[[:space:]]*0[[:space:]]*\|[[:space:]]*0[[:space:]]*\|[[:space:]]*0[[:space:]]*\|[^|]*\|[^|]*\|[[:space:]]*INERT' /tmp/0086-gate.out \
  || { echo "STOP: the gate did not read INERT with loosened, tightened, outside-expected and missed all 0"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0086_nesa_shared_resource \
     --sha256 $SHA0086 \
     --expect-pending 1
touch /tmp/0086-applied.ok
)
```

## STAGE 2: post-check, carries derived from stage 1, owner count

```
(
set -eo pipefail
SHA0086=d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99
SHAPOST=030f7a4baab3cae26b7879570f0ba9e3b5fd4f3309cde8dab76653618db1b5bb
SHAOWNER=df55a186d6d29832f93bfc09417e43892933f104b3c100e6cbe758e13ee3eadb

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0086-nesa-shared-resource)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0086_nesa_shared_resource.sql     || { echo "STOP: 0086 is not on disk"; exit 1; }
test -f scripts/0086-postcheck.sql                               || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/check-security-definer-owner.mjs     || { echo "STOP: the owner checker is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0086_nesa_shared_resource.sql | cut -d' ' -f1)" = "$SHA0086" ] \
  || { echo "STOP: 0086 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0086-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/check-security-definer-owner.mjs | cut -d' ' -f1)" = "$SHAOWNER" ] \
  || { echo "STOP: the owner checker on disk is not the approved file"; exit 1; }

# --- stage 1 must have APPLIED, in this sitting, not merely run ------------
[ -n "$(find /tmp/0086-applied.ok -mmin -60 2>/dev/null)" ] \
  || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

# --- SR-59: the carries come out of THIS SITTING's pre-check transcript ----
test -f /tmp/0086-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0086-precheck.out -mmin -60)" ] \
  || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0086-precheck.out; }
J=$(carry journal_rows_before)
U=$(carry users_rows_before)
A=$(carry appointments_rows_before)
C=$(carry clinic_rows_before)
K=$(carry staff_location_links_before)
[ -n "$J" ] && [ -n "$U" ] && [ -n "$A" ] && [ -n "$C" ] && [ -n "$K" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=$J users_before=$U appointments_before=$A clinics_before=$C links_before=$K"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v journal_before="$J" -v users_before="$U" -v appointments_before="$A" \
     -v clinics_before="$C" -v links_before="$K" \
     -f scripts/0086-postcheck.sql 2>&1 | tee /tmp/0086-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0086-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0086-postcheck.out)" = 15 ] \
  || { echo "STOP: the post-check did not print 15 OK verdicts"; exit 1; }
grep -q "ARMS F1 V1 V2 V3 W1 W2 OK" /tmp/0086-postcheck.out || { echo "STOP: the arms notice is missing"; exit 1; }

# --- the SECURITY DEFINER owner count, read only, now 22 -------------------
pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs 2>&1 | tee /tmp/0086-owner.out
echo "0086 APPLIED. 16/16 pre-check OK, gate INERT, arms F1-W2 OK, 15/15 post-check OK, owner check passed."
)
```

## What every verdict must read

- **Pre-check:** sixteen `OK` rows.
  - 1 and 12-15: the five carries;
  - 2: 0086 absent;
  - 3-6: 0082, 0083, 0084 and 0085 applied, by hash;
  - 7: nothing newer than 0086's `when` applied;
  - 8 and 9: neither the column nor the function exists yet;
  - 10 and 11: `appointments_rls` is **exactly** 0078's, by md5 of the stored expression;
  - 16: the post-check's arms have a therapist role and a patient to borrow.
- **Gate:** the single answer reads `0 | 0 | 0 | 0 | … | INERT`.
- **Post-check:** one `NOTICE` reading `ARMS F1 V1 V2 V3 W1 W2 OK: …`, then fifteen `OK` rows:
  - 1-3: the journal moved by one, 0086 is present by hash, 0085 still is;
  - 4-6: the column's type, nullability and default, the user count unchanged, and nobody flagged yet;
  - 7-9: the function's volatility, security, owner and search path, and EXECUTE for `authenticated` only (not `anon`, `patient`, `service_role` or PUBLIC);
  - 10-11: `appointments_rls` is exactly 0086's, by md5;
  - 12-15: appointments, clinics and staff links unchanged, and no fixture row survived.
- **Owner checker:** 22 SECURITY DEFINER functions, all owned by `postgres`.

## The arms, and what they write

Production has no shared resource until the owner flags one, so the arms build their own inside **one transaction that ends in ROLLBACK**. They create two clinics, a therapist and a colleague at the first, and a resource at the first; they borrow one existing therapist role and one existing patient. As the fixture therapist, through RLS, they prove:
- the function returns exactly the resource (F1);
- the resource's appointment at the therapist's clinic is visible (V2) and bookable on someone else's behalf (W1);
- its appointment at the other clinic is invisible (V1) and refused 42501 (W2);
- a colleague's own appointment at the same clinic stays invisible (V3).

A failed probe raises before the ROLLBACK, which aborts the transaction and psql with it, so nothing is kept on either path. Rows 12-15 re-assert that afterwards.

## Rows that will FAIL today

**Rows 3, 4, 5 and 6 read `FAIL` until 0082, 0083, 0084 and 0085 are applied.** That is the queue enforced. Applying 0086 first would push the newest `created_at` past all of their `when`s, and drizzle would skip each of them for ever while printing "migrations applied successfully".

**The owner checker reports 21, not 22, until this apply.** Since this branch, `EXPECTED_COUNT` is 22, so running it against production before 0086 is a count mismatch by design. Stage 2 runs it after the apply.

## After the apply

Nothing changes for anyone until the owner flags the NESA resource. That is a data step, not a migration: a bookable `users` row with `is_shared_resource = true` and its `staff_locations` row at Castelo Branco. The SCHED-17 app layer (#1276, merged) detects the column within a minute of the apply and stays inert until a resource exists. Then the gate should be re-run with `-v resource_ids='{<nesa-user-uuid>}'` to measure the real widening.

## Rehearsed

Not yet rehearsed. This section is filled from the rehearsal run before the PR is opened.

## Order of the sitting

0082 → 0083 (merge #1227) → 0084 (`docs/migration-apply-0084.md`, merge #1240) → 0085 (`docs/migration-apply-0085.md`, merge #1264) → **0086 (this document)** → merge this branch.
