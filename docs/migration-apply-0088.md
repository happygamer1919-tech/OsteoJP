# 0088 production apply: NESA as Terapeuta 2 is visible to the clinic's therapists (SCHED-29.3)

**Status: NOT APPLIED.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Branch | `db/0088-nesa-second-participant-visible` (held, never armed, merges only after this apply) |
| Migration | `packages/db/migrations/0088_nesa_second_participant_visible.sql`, sha256 `e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56` |
| Pre-check | `scripts/0088-precheck.sql`, sha256 `dc7b63c40bc7c504253c4093d77b8d9986fbd611a0bd17bfaa668f0564b025c3` |
| Post-check | `scripts/0088-postcheck.sql`, sha256 `530bd9e5f7890e01a114eaf62f90937d4c90cbdaff861fbc9a27ded6b558f5bf` |
| Journal | tag `0088_nesa_second_participant_visible`, idx 85, `when 1788201200000`, above every `when` on main |
| Depends on | 0086 (`d3eb9e41…`) and 0087 (`ec6556aa…`) applied, by file hash (pre-check rows 3 and 4) |
| What it does | One PERMISSIVE FOR SELECT policy on `public.appointments`, TO `authenticated`: a therapist may READ a booking whose Terapeuta 2 is a shared resource at a clinic they share with it, recorded at one of their clinics. No new function, no column, no data. `appointments_rls` is not touched |
| Card | `MIG-0088-nesa-second-participant-visible-to-cb-therapists` |

## What changes for the clinic, and when

Nothing is visible until a machine is flagged. With no `users` row carrying `is_shared_resource`, the policy admits no row; that is production today unless GREEN's NESA flag block has run. Pre-check rows 13 and 14 report how many machines are flagged and how many existing bookings the policy widens the moment it lands.

Once NESA is flagged at Castelo Branco: a CB therapist's agenda shows a colleague's booking that has NESA as Terapeuta 2, in NESA's diary. They can open it and cannot change or remove it. Linda-a-Velha therapists see nothing new.

## Why a separate SELECT policy

`appointments_rls` is FOR ALL, and its USING expression also decides which rows an UPDATE may target and a DELETE may remove. A disjunct added there would have given every CB therapist delete on a colleague's booking. A PERMISSIVE FOR SELECT policy is ORed for SELECT only; the post-check's arms V2 and V3 measure the two refusals on production.

## The pin is the CONTENT, not a commit sha

Each stage derives the head from the branch and asserts the sha256 of every file it runs. A rebase or a DECISIONS sync that leaves the three files unchanged proceeds; one changed byte halts.

## Why two stages, and what each one refuses

**SR-58.** Every stage fetches, re-checks out its own ref detached, and asserts its files on disk by sha256 before anything runs.

**SR-59.** The post-check's three carries (`journal_rows_before`, `appointments_policies_before`, `secdef_functions_before`) come from this sitting's pre-check transcript. Stage 2 parses them out of the file stage 1 wrote and refuses a transcript older than 60 minutes. No carry name is a substring of another.

The 0084 standard, kept whole: `set -eo pipefail` with psql's stderr in the transcript; stale transcripts and the marker deleted first, and stage 2 refuses without a fresh `/tmp/0088-applied.ok`; a verdict matched in its column and the OKs counted (14 pre, 9 post), each count ending `|| true` so a zero count reaches the refusal instead of killing the subshell; no backslash continuations and no parameter followed by a colon, because these blocks are pasted into zsh.

## STAGE 1: pre-flight, pre-check, apply

```
(
set -eo pipefail
SHA0088=e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56
SHAPRE=dc7b63c40bc7c504253c4093d77b8d9986fbd611a0bd17bfaa668f0564b025c3

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0088-precheck.out /tmp/0088-postcheck.out /tmp/0088-applied.ok

# --- pre-flight: the tree holds nothing but the checkout -------------------
STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/db/0088-nesa-second-participant-visible)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
echo "applying from $PIN"

# --- SR-58: this stage checks out its own ref and proves the files ---------
git checkout -q --detach $PIN
test -f packages/db/migrations/0088_nesa_second_participant_visible.sql || { echo "STOP: 0088 is not on disk"; exit 1; }
test -f scripts/0088-precheck.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0088_nesa_second_participant_visible.sql | cut -d' ' -f1)" = "$SHA0088" ] || { echo "STOP: 0088 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0088-precheck.sql | cut -d' ' -f1)" = "$SHAPRE" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }

# --- the production target, asserted by the guard, not by the prompt -------
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

# --- the pre-check. Its transcript IS the carry, so it is kept -------------
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off -f scripts/0088-precheck.sql 2>&1 | tee /tmp/0088-precheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0088-precheck.out && { echo "STOP: a pre-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0088-precheck.out || true)
[ "$OKS" = 14 ] || { echo "STOP: the pre-check printed $OKS OK verdicts, not 14"; exit 1; }

# --- the apply. It is the only writing command in this document -----------
node packages/db/scripts/verified-migrate.mjs --tag 0088_nesa_second_participant_visible --sha256 $SHA0088 --expect-pending 1
touch /tmp/0088-applied.ok
)
```

`verified-migrate.mjs` exits **5** if drizzle reports success and the journal did not move. `--expect-pending 1` holds because after 0087 the pending set is 0088 alone.

## STAGE 2: post-check, carries derived from stage 1

```
(
set -eo pipefail
SHA0088=e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56
SHAPOST=530bd9e5f7890e01a114eaf62f90937d4c90cbdaff861fbc9a27ded6b558f5bf

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0088-postcheck.out

# --- SR-58 again. This stage inherits nothing from stage 1 -----------------
git fetch origin --prune
PIN=$(git rev-parse origin/db/0088-nesa-second-participant-visible)
[ "$(git cat-file -t $PIN)" = commit ] || { echo "STOP: $PIN does not resolve to a commit"; exit 1; }
git checkout -q --detach $PIN
test -f packages/db/migrations/0088_nesa_second_participant_visible.sql || { echo "STOP: 0088 is not on disk"; exit 1; }
test -f scripts/0088-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0088_nesa_second_participant_visible.sql | cut -d' ' -f1)" = "$SHA0088" ] || { echo "STOP: 0088 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/0088-postcheck.sql | cut -d' ' -f1)" = "$SHAPOST" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

# --- stage 1 must have APPLIED, in this sitting, not merely run ------------
[ -n "$(find /tmp/0088-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting"; exit 1; }

# --- SR-59: the carries come out of THIS SITTING's pre-check transcript ----
test -f /tmp/0088-precheck.out || { echo "STOP: stage 1's transcript is missing; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/0088-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0088-precheck.out; }
J=$(carry journal_rows_before)
P=$(carry appointments_policies_before)
S=$(carry secdef_functions_before)
[ -n "$J" ] && [ -n "$P" ] && [ -n "$S" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "carries from this run: journal_before=$J policies_before=$P secdef_before=$S"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off -v journal_before="$J" -v policies_before="$P" -v secdef_before="$S" -f scripts/0088-postcheck.sql 2>&1 | tee /tmp/0088-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0088-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0088-postcheck.out || true)
[ "$OKS" = 9 ] || { echo "STOP: the post-check printed $OKS OK verdicts, not 9"; exit 1; }
grep -q "ARMS V1 V2 V3 V4 V5 V6 OK" /tmp/0088-postcheck.out || { echo "STOP: the arms notice is missing"; exit 1; }
echo "0088 APPLIED. 14/14 pre-check OK, arms V1 to V6 OK, 9/9 post-check OK."
)
```

## What every verdict must read

- **Pre-check, 14 rows, all `OK`:**
  - 1: the journal count (carry);
  - 2: 0088 absent by hash;
  - 3 and 4: 0086 and 0087 present by hash;
  - 5: the newest applied journal `when` is below 0088's (the 7.0b skip guard);
  - 6: the 0088 policy does not exist yet;
  - 7: `appointments_rls` is 0086's: FOR ALL, TO authenticated, the same expression in both halves by md5 (`22e12827…`);
  - 8: the four helpers the policy calls exist;
  - 9: the four columns it reads exist;
  - 10: the role `authenticated` exists;
  - 11: `appointments` carries exactly two policies (carry);
  - 12: the SECURITY DEFINER count, every one owned by `postgres` (carry);
  - 13 and 14: reports, always `OK`: machines flagged as shared resources, and bookings that name a flagged machine as Terapeuta 2 (what the policy widens on landing).
- **Post-check, the arms first**, in one transaction that is rolled back, printed as one NOTICE (`ARMS V1 V2 V3 V4 V5 V6 OK`) so they add no `| OK` row. They borrow one tenant and build two clinics, a flagged machine, four therapists, a patient and two bookings:
  - V1: a colleague at the machine's clinic reads the booking with the machine as Terapeuta 2;
  - V2 and V3: the same colleague's UPDATE and DELETE touch 0 rows;
  - V4: the colleague cannot read a booking whose Terapeuta 2 is a PERSON;
  - V5: a therapist at the other clinic reads nothing;
  - V6: with the machine unflagged, the colleague reads nothing.
- **Post-check, 9 rows, all `OK`:**
  - 1: the journal grew by exactly one;
  - 2: 0088's hash is present;
  - 3: the newest journal `when` is 0088's;
  - 4: the policy is PERMISSIVE, SELECT, TO authenticated, with no WITH CHECK;
  - 5: the policy's expression by md5 and length (`ef838bdf…`, 359), measured on a database built from this branch;
  - 6: `appointments_rls` is untouched, both halves;
  - 7: exactly one more policy on `appointments`;
  - 8: no SECURITY DEFINER function added;
  - 9: nothing the arms created survived the rollback.

## Rehearsed

Both stages were extracted from this document by a script and run **under `zsh -f`** (no rc files, the shell the owner pastes into) on 2026-09-13, against the BLUE lane database (Supabase local, Postgres 17), whose schema is main's `supabase/migrations` through 0087. The lane was given the drizzle journal production has after 0087: 85 rows, one per journal entry through `0087_guest_clinical_intake`, each carrying its real file sha256 and its `when`. The apply ran from a clean detached worktree of this branch.

Only four things were replaced, mechanically, with the count of each asserted:
- `/tmp/` became a scratch directory (7 occurrences in stage 1, 9 in stage 2);
- the `cd` line became the rehearsal worktree;
- the env-source line became `export DATABASE_URL_DIRECT=<the lane>`;
- the target guard became an echo.

| Run | Result |
|---|---|
| A: stage 2 first | exit 1, `STOP: stage 1 did not complete an apply in this sitting` |
| B: stage 1 | `applying from d522877f`, SR-58 assertions pass, pre-check **14 OK / 0 FAIL**, `verified-migrate` pending 1 `[0088_nesa_second_participant_visible]`, journal **85 → 86, delta 1**, sha256 present, exit 0 |
| C: stage 2 | carries parsed as `journal_before=85 policies_before=2 secdef_before=24`, `ARMS V1 V2 V3 V4 V5 V6 OK`, post-check **9 OK / 0 FAIL**, `0088 APPLIED`, exit 0 |
| D: stage 2, pre-check transcript backdated 61 minutes | exit 1, `STOP: stage 1's transcript is over an hour old; it is not this sitting's` |
| E: stage 2, marker removed | exit 1, `STOP: stage 1 did not complete an apply in this sitting` |

**Negative control on the pre-check:** run against the lane with 0088 applied it reads **10 OK / 4 FAIL**, on rows 2 (hash present), 5 (the `when` guard), 6 (the policy exists) and 11 (three policies).

**Found by rehearsing, fixed before this was marked ready:** the first post-check inserted the arms' two bookings through a `UNION ALL` whose bare `'scheduled'` literal resolved to `text`, and `appointments.status` is the `appointment_status` enum. Stage 2 halted on it with psql exit 3 and printed no verdict, which is the refusal working; the literal is cast now, the post-check's sha256 above is the fixed file's, and runs B to E are the second rehearsal on a lane reset to the pre-apply state.

**The isolation suite, separately:** `packages/db/tests/appointments-shared-resource-second-participant.db.test.ts` 11/11 and `apps/web/lib/scheduling/nesa-agenda-second-participant.db.test.ts` 5/5 on the lane with 0088 applied; the whole packages/db DB-gated suite 91 files, 1286/1286.

## Order of the sitting

GREEN's NESA flag block may run before or after this apply; the policy is inert until a machine is flagged. #1319 (SCHED-29.2, no migration) is independent of this apply and merges on its own checks. **0088 (this document)**, then merge this PR.
