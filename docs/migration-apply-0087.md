# 0087 production apply: the guest clinical intake (INTAKE-01)

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0087-guest-clinical-intake` (held, merges only after this apply) |
| Migration | `packages/db/migrations/0087_guest_clinical_intake.sql`, sha256 `ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14` |
| Pre-check | `scripts/0087-precheck.sql`, sha256 `85a3e5805a42e533617cb65380555b776ad6bf49b4193ef7f95b5b1a0235819e` |
| Post-check | `scripts/0087-postcheck.sql`, sha256 `6c893b4cc6bdbcc19970180ef54b27c3f589c8a1195e5e4e9cc822f185a75d46` |
| Journal | tag `0087_guest_clinical_intake`, `when 1788101200000`, above every `when` on main and on the 0083 to 0086 branches. The `idx` is a row counter and renumbers when those branches merge; the file hash is the identity |
| Depends on | 0082 (`b43423ae…`), 0083 (`12a756bd…`), 0084 (`6636764d…`), 0085 (`568ad2cf…`) and 0086 (`d3eb9e41…`) all applied, by file hash. Pre-check rows 3 to 7 refuse otherwise |
| What it does | Creates the enum `intake_answer` (`sim`, `nao`, `nao_perguntado`), the table `guest_clinical_intakes` (one row per guest request at most, eight CHECKs, a tenant-match trigger), two SELECT policies (staff, patient), the grants (SELECT to `authenticated` and `patient`; SELECT and INSERT to `service_role`; nothing else), and two SECURITY DEFINER functions owned by `postgres`: `patient_guest_request_ids()` (EXECUTE to `patient` only) and `purge_expired_guest_intakes(uuid)` (EXECUTE to no application role). It writes no row to any existing table |

## The pin is the CONTENT, not a commit sha

Same reasoning as 0084. A branch that moves while a block sits in review silently stops being the tree that was reviewed, and a commit sha cannot be written into a document before that document exists. So each stage derives the head from the branch and asserts **the sha256 of every file it runs**. If the migration, the pre-check or the post-check differs by one byte, the stage halts. A rebase, or the journal and owner-count sync that follows the 0086 merge, proceeds correctly, because none of the three files changes.

## Why two stages, and what each one refuses

**SR-58.** *Every* stage fetches, re-checks out its own ref detached, and asserts its files on disk by sha256 before anything runs. A stage that inherits a working tree from an earlier stage is not a valid apply.

**SR-59.** The post-check's three carries (`journal_rows_before`, `secdef_functions_before`, `guest_requests_rows_before`) come from **this sitting's** pre-check transcript. Stage 2 parses them out of the file stage 1 wrote and refuses a transcript older than 60 minutes, so a leftover from a rehearsal or an earlier sitting cannot be carried. Nobody retypes a number.

The rest is the 0084 standard, kept whole:

1. **`set -eo pipefail`, and psql's stderr goes into the transcript** (`2>&1 | tee`). Without pipefail, psql's non-zero exit is replaced by `tee`'s zero, and an aborted check leaves a transcript with no `FAIL` in it.
2. **Stale transcripts and the marker are deleted first.** Stage 1 writes `/tmp/0087-applied.ok` only after `verified-migrate` exits 0, and stage 2 refuses without a fresh one, so a stage 1 that halted cannot be followed by a post-check that reads an unchanged database.
3. **A verdict is matched in its column, and the OKs are counted**: `| FAIL` at the end of a row halts, and exactly 18 (pre) and 18 (post) `| OK` rows are required, so a run that printed fewer rows cannot pass.
4. **Every parameter a colon follows is braced** (`${X}:`, never `$X:`). The owner pastes these blocks into zsh, where `$X:s...` is a substitution modifier; that is what stopped the 0085 block on 2026-09-11. In the blocks below no parameter is followed by a colon at all.

**`created_at` is not a time.** drizzle writes `drizzle.__drizzle_migrations.created_at` as the migration's journal `when` (a constant from `_journal.json`), not the moment the row was inserted. Pre-check row 8 and post-check row 3 print it and compare it as a journal `when`. When this apply happened is recorded by the mtime of `/tmp/0087-applied.ok`, nothing else.

## STAGE 1: pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0087=ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14
SHAPRE=85a3e5805a42e533617cb65380555b776ad6bf49b4193ef7f95b5b1a0235819e

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0087-precheck.out /tmp/0087-postcheck.out /tmp/0087-applied.ok

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0087-guest-clinical-intake)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
echo "applying from $PIN"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0087_guest_clinical_intake.sql || { echo "STOP: 0087 is not on disk"; exit 1; }
test -f scripts/0087-precheck.sql                             || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs              || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs                  || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0087_guest_clinical_intake.sql | cut -d' ' -f1)" = "$SHA0087" ] \
  || { echo "STOP: 0087 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0087-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] \
  || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0087-precheck.sql 2>&1 | tee /tmp/0087-precheck.out
# A verdict is the LAST column of a row: match it there, and count the OKs.
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0087-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0087-precheck.out)" = 18 ] \
  || { echo "STOP: the pre-check did not print 18 OK verdicts"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs \
     --tag 0087_guest_clinical_intake \
     --sha256 $SHA0087 \
     --expect-pending 1
touch /tmp/0087-applied.ok
)
```

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not move: the silent no-op, named. `--expect-pending 1` holds because drizzle's pending set is "every journal entry whose `when` exceeds the newest applied", and after 0086 that is 0087 alone.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0087=ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14
SHAPOST=6c893b4cc6bdbcc19970180ef54b27c3f589c8a1195e5e4e9cc822f185a75d46

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0087-postcheck.out

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0087-guest-clinical-intake)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0087_guest_clinical_intake.sql || { echo "STOP: 0087 is not on disk"; exit 1; }
test -f scripts/0087-postcheck.sql                            || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0087_guest_clinical_intake.sql | cut -d' ' -f1)" = "$SHA0087" ] \
  || { echo "STOP: 0087 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0087-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] \
  || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

# --- stage 1 must have APPLIED, in this sitting, not merely run ------------
[ -n "$(find /tmp/0087-applied.ok -mmin -60 2>/dev/null)" ] \
  || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

# --- SR-59: the carries come out of THIS SITTING's pre-check transcript ----
test -f /tmp/0087-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0087-precheck.out -mmin -60)" ] \
  || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0087-precheck.out; }
J=$(carry journal_rows_before)
S=$(carry secdef_functions_before)
G=$(carry guest_requests_rows_before)
[ -n "$J" ] && [ -n "$S" ] && [ -n "$G" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=$J secdef_before=$S guest_requests_before=$G"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v journal_before="$J" -v secdef_before="$S" -v guest_requests_before="$G" \
     -f scripts/0087-postcheck.sql 2>&1 | tee /tmp/0087-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0087-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
[ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0087-postcheck.out)" = 18 ] \
  || { echo "STOP: the post-check did not print 18 OK verdicts"; exit 1; }
grep -q "ARMS S1 S2 S3 S4 S5 W1 W2 W3 P1 P2 P3 P4 P5 OK" /tmp/0087-postcheck.out || { echo "STOP: the arms notice is missing"; exit 1; }
echo "0087 APPLIED. 18/18 pre-check OK, arms S1 to P5 OK, 18/18 post-check OK."
)
```

**Stage 2 does not run `check-security-definer-owner.mjs`, on purpose.** Its `EXPECTED_COUNT` is 23 on this branch (main's 21 plus 0087's two); 0086's PR adds its own one, and the two are summed only when both have merged. A stale constant would halt a correct apply. Post-check row 16 asserts the same property by delta from this sitting's carry: exactly two more SECURITY DEFINER functions than before, every one owned by `postgres`.

## What every verdict must read

- **Pre-check, 18 rows, all `OK`:**
  - 1: the journal count (carry);
  - 2: 0087 absent by hash;
  - 3 to 7: 0082, 0083, 0084, 0085 and 0086 present by hash (the queue);
  - 8: the newest applied journal `when` is below 0087's (the 7.0b skip guard);
  - 9, 10 and 11: the enum, the table and the three functions do not exist yet;
  - 12: the six helpers the policies call exist;
  - 13: the four roles 0087 grants and revokes exist;
  - 14: `guest_booking_requests` has the four columns 0087 reads;
  - 15: `audit_log` accepts the purge's row (a NULL actor, a uuid entity, jsonb metadata), so the job cannot fail on its first deletion days from now;
  - 16: exactly 22 SECURITY DEFINER functions, all owned by `postgres` (carry);
  - 17: the guest request count (carry);
  - 18: a tenant with a location and a service exists for the post-check's arms.
- **Post-check, the arms first**, in one transaction that is rolled back, printed as one NOTICE (`ARMS S1 ... P5 OK`) so they add no `| OK` row:
  - S1 to S5: reception without a location sees the three fixture intakes; reception assigned only to another clinic sees none; a therapist who treats nobody sees none, the converted one included; the owner sees all three; another tenant's owner sees none;
  - W1 to W3: INSERT, UPDATE and DELETE as `authenticated` are refused by privilege (42501), and any other refusal reads as a failure;
  - P1 to P5: `purge(NULL)` is refused 22004; `purge(tenant)` returns exactly 1; it took the 8-day unconverted intake and kept the 8-day converted one and the fresh one; all three requests survive; exactly one PII-free audit row (`guest_intake.purged`, metadata keys `intake_arrived_at` and `reason` only).
  - The patient arm is **not** exercised against production: whether `postgres` may `SET ROLE patient` on the hosted project has never been measured, and a post-check that halts on a role switch after a clean apply proves nothing. It is proven by `packages/db/tests/guest-clinical-intakes.db.test.ts`; rows 9, 11 and 14 assert its policy and its helper's grant.
- **Post-check, 18 rows, all `OK`:**
  - 1: the journal grew by exactly one (`before + 1`);
  - 2: 0087's hash is present;
  - 3: the newest journal `when` is 0087's;
  - 4: the enum's three labels, in order;
  - 5: RLS enabled, not forced;
  - 6: the fifteen columns exact (there is no `updated_at`: the clock runs on arrival);
  - 7: eight CHECKs, one UNIQUE, two FKs, the request one ON DELETE CASCADE;
  - 8: the tenant-match trigger, enabled, BEFORE INSERT OR UPDATE;
  - 9: exactly two policies, both SELECT, one per reading role;
  - 10 and 11: each policy's expression by md5 and length, measured on a database built from this branch;
  - 12: the privilege end state, read with `has_table_privilege` so a PUBLIC grant counts;
  - 13: the purge is SECURITY DEFINER, owned by `postgres`, path pinned, and no application role can execute it;
  - 14: the patient helper is SECURITY DEFINER, `postgres`, STABLE, executable by `patient` only;
  - 15: the deployed purge never names `converted_appointment_id`, and no 0087 body names a contraindication;
  - 16: SECURITY DEFINER count is `before + 2`, all owned by `postgres`;
  - 17: `guest_booking_requests` lost no row (at least the carry: the public form may add some between the stages);
  - 18: nothing the arms created survived the rollback.

## The rows that are expected to FAIL today, and must

**Pre-check rows 6 and 7 read `FAIL` until 0085 and then 0086 have been applied.** That is the queue enforced, not a defect. 0087's `when` is `1788101200000`, the highest in the repository. drizzle applies a file only when its `when` exceeds the newest `created_at` already recorded, so applying 0087 first would make 0085 and 0086 unapplyable for ever while printing "migrations applied successfully": the INC-07 / 0058 failure. Rows 3 to 7 prevent it; row 8 alone does not, because it passes whenever nothing newer than 0087 is applied.

Pre-check row 16 reads `FAIL` until 0086 is applied (21 functions, not 22), for the same reason.

## Rehearsed, 2026-09-11

REHEARSAL_RESULTS

## Order of the sitting

0085 (after its fix, `docs/migration-apply-0085.md`) → merge #1264 → 0086 (`docs/migration-apply-0086.md`) → merge #1282 → **0087 (this document)** → merge this PR.

This PR needs one sync with main before its merge button is live, once #1282 has merged: the journal gains 0083 to 0086 above 0087's entry, and `EXPECTED_COUNT` becomes 24. The migration's, the pre-check's and the post-check's bytes do not change in that sync, so the pins above still hold.
