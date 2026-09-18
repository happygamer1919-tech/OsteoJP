# STAFF-10 schedule rows: JP(cb) stops holding hours at Linda-a-Velha

**Status: NOT RUN.** Two stages. Every command is literal; there is nothing to
substitute. Any `STOP:` line, any `FAIL` verdict, or any `ERROR` halts the
sitting.

| Fact | Value |
|---|---|
| Card | `STAFF-10-jp-split-phase-2-reassignment-script` (the rewrite) |
| Rulings, owner, 2026-09-18 | the two JP rows STAY; JP works Linda-a-Velha every OTHER Saturday; JP(cb)'s Wednesday blocks mean "not at Castelo Branco" only; JP(cb)'s 30 September block was wrong; clinical authorship never moves; PAST APPOINTMENTS NEVER MOVE |
| JP(cb) | `54d486e0-a9c3-4c82-acac-8b909ce5a2d0` (the Castelo Branco row) |
| JP(lv) | `0c1a0000-0000-4000-8000-000000000001` (the Linda-a-Velha row) |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Stage 1 | `scripts/data/staff-10-1-preview.sql`, sha256 `e641882c585884059d272b65b0287e130a023326f3bf5c86e77f0f182cd52eef` |
| Stage 2 | `scripts/data/staff-10-2-apply.sql`, sha256 `5d01cda4e743a8edb92b4f9ea1f79e66e9827322309b5ce6d3e9415edf41e899` |
| Post-check | `scripts/data/staff-10-3-postcheck.sql`, sha256 `adf6a25132b717e83f5704e61ad4992f988ceaa15381ef1a10050b7d17266550` |
| Pin | `origin/main`. All three files merge first, by their own PR |
| What stage 1 writes | **nothing.** It is a read |
| What stage 2 writes | `availability_templates.is_active` false on the retired rows; `availability_templates.user_id` on the moved Saturdays; ONE `time_off` row DELETED; ONE `audit_log` row (`staff.jp_lv_schedule_rows.retire`) carrying every id and every before-count |
| What NEITHER touches | `appointments` (past or future, any status), `clinical_records`, `clinical_episodes`, `attachments`, `users`, `staff_locations`, and every JP(cb) row at Castelo Branco |

## What it fixes, in one paragraph

JP exists as two staff rows, one per clinic. The Castelo Branco row still holds
working hours at Linda-a-Velha, so the patient portal offers the same person
twice at that clinic, and the agenda carries hours for a JP who is not there.
This retires the Castelo Branco row's Linda-a-Velha hours: the ones the
Linda-a-Velha row already covers are switched off, the future Saturdays it does
not cover are handed to it, the recurring every-Saturday window is switched off
because the owner ruled every OTHER Saturday, the expired rows are switched off,
and one wrong absence block on 30 September is removed.

## No appointment is cancelled by this operation, and that was checked

The duplicate bookings are NOT touched here. They go to reception, one at a
time, from `docs/staff-10-reception-list.md`, which stage 1 prints the rows for.

The reason is not that a cancel would be noisy. That was read before this was
scoped: a cancel sends the patient **nothing** (no SMS, no email; no
cancellation template exists in the registry), and a reminder already scheduled
is suppressed when it wakes, because the dispatcher re-reads the appointment's
status before sending. The reason is that choosing which of two bookings stands
is a diary decision about a real person's visit, and it is reception's to make.

## Why the retire is a switch and the block is a deletion

`availability_templates` carries `is_active`, and switching it off is how this
codebase retires a schedule row everywhere else, so the row survives as history
and the operation is reversible from the ids in the audit row.

`time_off` carries **no** `is_active` and no `deleted_at` (its columns are
tenant, user, starts_at, ends_at, reason, note, created_at). A block can
therefore only be deleted. Stage 2 copies the whole row into its audit metadata
**before** the delete, so re-creating it is a single insert from values this
operation recorded.

JP(cb)'s WEDNESDAY blocks are left exactly as they are, by all three stages. The
owner ruled they mean "not at Castelo Branco" only, and `time_off` has no
location column at all, so honouring that ruling needs a schema change rather
than a data op. It belongs to its own card.

## The pin is the CONTENT, not a commit sha

Each block fetches, re-checks out `origin/main` detached, and asserts the sha256
of every file it runs. A rebase that leaves the three files unchanged proceeds;
one changed byte halts. The three files must be on `origin/main` before the
sitting starts.

## STAGE 1: the preview. It writes nothing.

```
(
set -eo pipefail
SHA1=e641882c585884059d272b65b0287e130a023326f3bf5c86e77f0f182cd52eef

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/staff10-stage1.out /tmp/staff10-stage1.ok

STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f scripts/data/staff-10-1-preview.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-1-preview.sql | cut -d' ' -f1)" = "$SHA1" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-1-preview.sql 2>&1 | tee /tmp/staff10-stage1.out
grep -q 'STAFF-10 STAGE 1 PREVIEW COMPLETE' /tmp/staff10-stage1.out || { echo "STOP: stage 1 did not print its COMPLETE line"; exit 1; }
touch /tmp/staff10-stage1.ok
)
```

**Read the output before pasting stage 2.** Section 2 lists **eight** refusals,
`R1` to `R8`, and **every one must read 0**. `R8` is the one that protects the
clinic: it counts future Linda-a-Velha rows that neither side of this operation
accounts for, and if it is not 0 the operation is out of scope and must be
re-scoped rather than run. Section 3 shows each target row and what stage 2 will
do to it; section 4 is the reception list.

## STAGE 2: the write, then the post-check

```
(
set -eo pipefail
SHA2=5d01cda4e743a8edb92b4f9ea1f79e66e9827322309b5ce6d3e9415edf41e899
SHA3=adf6a25132b717e83f5704e61ad4992f988ceaa15381ef1a10050b7d17266550

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/staff10-stage2.out /tmp/staff10-postcheck.out

[ -n "$(find /tmp/staff10-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete in this sitting"; exit 1; }
test -f /tmp/staff10-stage1.out || { echo "STOP: stage 1 left no transcript; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/staff10-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }

git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}

test -f scripts/data/staff-10-2-apply.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/staff-10-3-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-2-apply.sql | cut -d' ' -f1)" = "$SHA2" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-3-postcheck.sql | cut -d' ' -f1)" = "$SHA3" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/staff10-stage1.out; }
CNT=$(carry staff10_expected_count)
DIG=$(carry staff10_expected_digest)
[ -n "$CNT" ] && [ -n "$DIG" ] || { echo "STOP: a carry did not parse out of stage 1's transcript"; exit 1; }
echo "carries from this sitting: count=${CNT} digest=${DIG}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -v staff10_expected_count="$CNT" -v staff10_expected_digest="$DIG" -f scripts/data/staff-10-2-apply.sql 2>&1 | tee /tmp/staff10-stage2.out
grep -q 'STAFF-10 STAGE 2 DONE' /tmp/staff10-stage2.out || { echo "STOP: stage 2 did not print its DONE line"; exit 1; }

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-3-postcheck.sql 2>&1 | tee /tmp/staff10-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/staff10-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/staff10-postcheck.out || true)
[ "$OKS" = 14 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 14"; exit 1; }

echo "STAFF-10 SCHEDULE ROWS COMPLETE."
)
```

**The post-check types no carry.** Stage 2 records its own before-counts and
every id it touched in its audit row, so the post-check reads them back out of
the database and compares them with what it recomputes. A number that travelled
through a human hand cannot disagree with the database here, because no number
does.

## What every verdict must read

The post-check prints **14 rows, all `OK`**: stage 2 left exactly one audit row
(1); the retired ids match the recorded count and every one is now inactive
(2, 3); the moved ids match the recorded count and every one now belongs to
JP(lv) (4, 5); JP(cb) holds no active Linda-a-Velha row from today forward (6);
**JP(cb) has left the Linda-a-Velha portal list** under the portal's own
predicate, active and inside the template's date window (7); JP(lv)'s own
Saturdays are unchanged, plus exactly the moved ones (8); JP(cb)'s Castelo
Branco rows are untouched (9); no previously-inactive row was reactivated (10);
the 30 September block is gone (11) and was recorded whole so it can be restored
(12); no appointment changed hands (13); and the appointment total is unchanged
(14).

## Rehearsed, in full, on a throwaway database

A throwaway built on the purple lane's Postgres 17.6 at `127.0.0.1:54522`, its
schema taken from the lane database (46 public tables), seeded with a fixture at
production shape and **under the production ids** for both JP rows and both
clinics, so the three files ran as the exact bytes that will run on production:
5 active JP(cb) Linda-a-Velha rows (one already covered by JP(lv), two future
Saturdays it does not hold, one recurring every-Saturday window, one expired),
one already-inactive row, 2 JP(cb) Castelo Branco rows, JP(lv)'s own two
every-other-Saturday rows, the 30 September block, a Wednesday block, and 4
appointments including a duplicate pair on both JP rows at one start.

| Arm | Expected | Result |
|---|---|---|
| 1. stage 2 with no carries (stage 2 before stage 1) | refuses, writes nothing | exit 3. psql refuses to substitute an undefined variable: `syntax error at or near ":"` |
| 2. stage 1 | reads, writes nothing | exit 0, all eight refusals **0**, carries `count=6` `digest=8d0fbd91…` |
| 3. stage 2, wrong digest | refuses | exit 3, `STOP: the target SET has changed since stage 1 (same size, different rows)` |
| 4. stage 2, this sitting's carries | writes | exit 0, `W1 retired 3`, `W2 moved 2`, `W3 deleted the 2026-09-30 block`, `STAFF-10 STAGE 2 DONE` |
| 5. stage 2 again | refuses | exit 3, `STOP: this block has already run (audit row staff.jp_lv_schedule_rows.retire present)` |
| 6. post-check | 14 OK | **14 OK, 0 FAIL**, exit 0 |
| 7. a FUTURE LV row JP(lv) does not cover | stage 1 R8 fires, stage 2 refuses | `R8 = 1`; exit 3, `STOP: 1 future JP(cb) LV row(s) are in no target set`. After it: 6 active LV rows still there, **0 audit rows** |

**Arm 1's refusal is real but its message is poor**, and that is stated rather
than dressed up: an undefined psql variable fails at substitution, so the
operator sees a syntax error rather than a sentence. The readable refusal is the
marker and transcript guard at the top of the stage 2 block, which is what the
owner actually pastes; the SQL-level failure is the second line of defence.

### Negative control on the instrument

Fourteen OK rows mean nothing unless they can go red. From a clean applied
state, one retired row was switched back on: the post-check went to **12 OK, 2
FAIL**, naming rows 3 (`every retired row is now inactive`) and 10 (`no
previously-inactive row was reactivated`). Switching it back off returned
**14 OK, 0 FAIL**.

## What the rehearsal caught, which is the reason for doing it

**Stage 2 did not parse at all.** psql does not interpolate `:'variable'` inside
a dollar-quoted body: everything between `$$` and `$$` reaches the server
verbatim, so the two carries were sent as those literal characters and the
server answered `syntax error at or near ":"` on the `DECLARE` section, before a
single precondition had run. On production that is a sitting that stops on a
substitution rule rather than on the data. Both carries are now lifted into
session settings in plain SQL, where psql does substitute, and read back inside
the block with `current_setting`.

**A whole class of row was in no target set.** A future Linda-a-Velha row on a
weekday JP(lv) does not cover, or a recurring non-Saturday window, belonged to
none of the four sets, so stage 2 would have written its three changes and then
aborted on its own final assertion, mid-sitting. That is safe but it fails at
the wrong moment and says the wrong thing. It is now refusal `R8` in stage 1 and
`P5b` in stage 2, so it is seen before the sitting starts. Arm 7 is that case.

## Undoing it

Not authored here, and it is exact if it is ever wanted. Stage 2's audit row
carries `retired_covered_ids`, `retired_sat_window_ids`, `retired_past_ids` and
`moved_saturday_ids`, so an undo switches exactly those rows back on and
re-points exactly those Saturdays; and it carries `deleted_block` as the whole
deleted row, so the absence block is one insert from recorded values. It would
need its own authoring, its own rehearsal and its own ruling.

## Order of the sitting

The three files and this document merge first, by their own PR. **Nothing runs
on merge.** Then stage 1, read its output in full, then stage 2. The reception
list is worked separately, by reception, and is not part of the sitting.
