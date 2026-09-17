# NESA split: the LV bookings move to the LV row, then both rows are flagged

**Status: NOT RUN.** A DATA operation, not a migration: no schema changes, no
journal entry, no `drizzle-kit`. Two stages and a post-check. Every command is
literal; there is nothing to substitute. Any `STOP:` line, any `FAIL` verdict or
any `ERROR` halts the sitting.

**Authored by BLUE. Run by GREEN.** Author and applier are different lanes
(SR-63); BLUE has run every byte below against a throwaway database and against
nothing else.

| Fact | Value |
|---|---|
| Card | `NESA-SPLIT-lv-bookings-to-the-lv-row` |
| Ruling | Owner, 2026-09-16: (a) every FUTURE appointment at Linda-a-Velha held by the CB-labelled NESA row moves to the LV NESA row, any status, cancelled included; past appointments never move. (b) NESA leaves the patient portal at both clinics, accepted. (c) after the move, `is_shared_resource = true` on both rows |
| CB-labelled row | `0c1a0000-0000-4000-8000-000000000002` (NESA, installed at Castelo Branco only) |
| LV row | `bdc466d7-f81f-4f8c-aa2e-b85194d73e1a` (NESA, installed at Linda-a-Velha) |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Stage 1 | `scripts/data/nesa-split-1-move.sql`, sha256 `e240a5b9a56b1366d1c20f7a804d128750e59d6bb72235e5a85981bbc8a9a864` |
| Stage 2 | `scripts/data/nesa-split-2-flag.sql`, sha256 `2da45349ce436cd8879ab77bdfa83cf33c3dbe0d08d838808d6f5e061950fb06` |
| Post-check | `scripts/data/nesa-split-3-postcheck.sql`, sha256 `1fdc926e116b14f224ac818f391ba22e10eb9e7cac23bc8c17dee50cf4ed6472` |
| What stage 1 writes | `appointments.practitioner_id` on exactly N rows, plus one `audit_log` row (`staff.nesa_split.reassign`) carrying every moved id |
| What stage 2 writes | `users.is_shared_resource` on exactly 2 rows, plus one `audit_log` row per row (`staff.set_shared_resource`) |
| What neither touches | `clinical_records` (authorship included), `clinical_episodes`, `attachments`, `availability_templates`, `is_bookable`, `is_active`, `staff_locations`, and every PAST appointment |
| N, measured on production 2026-09-16 23:34Z | **32**, all `scheduled` |

## Why the move comes before the flag, and why that is the whole design

`is_shared_resource` turns on `sharedResourceLocationAllowed`
(`apps/web/lib/scheduling/shared-resource-guard.ts:39`), which refuses any
booking of a flagged row at a clinic where the row is not installed — **for the
owner too**. GREEN measured the three consequences on a local rehearsal
(NESA-R9 N7, Q-NESA-FLAG-4): with the flag on, `rescheduleAppointment`,
`cloneAppointment` and the un-cancel path of `updateAppointment` all return
`shared_resource_location`.

So flagging first would freeze the 32 future LV bookings the CB row is holding:
they could still be cancelled and nobody, owner included, could reschedule,
clone or restore them. Moving first leaves all 32 on a row installed at
Linda-a-Velha, where the same guard admits them. The stage files enforce the
order in both directions: stage 2 refuses without stage 1's audit row, and stage
1 refuses if either row is already flagged.

## What changes for the clinic

- **NESA disappears from the patient portal at both clinics.** That is ruling
  (b), and it is this flag's doing:
  `apps/api/lib/appointments/store.ts` filters `u.is_shared_resource = false`
  out of the bookable roster. No appointment on either NESA row has ever come
  through the portal.
- **The 32 LV bookings keep their patient, their time, their clinic and their
  status.** Only the practitioner row changes, from the CB-labelled NESA row to
  the LV NESA row. Both are named NESA, so no screen shows a different name.
- **Reception and the owner keep every action on those 32.** Rehearsed below.
- **The CB row's own 4,211 Castelo Branco appointments are untouched**, and
  under 0086 they become readable by CB therapists the moment the flag lands.
  That widening was ruled separately (Q-NESA-FLAG-1 = EVERYONE) and is not this
  document's subject.
- **Not in scope: Q-NESA-CAP**, how many patients NESA may hold in one hour. A
  separate dispatch. Nothing here changes `appointments_no_double_confirmed`.

## The pin is the CONTENT, not a commit sha

Each stage fetches, re-checks out `origin/main` detached, and asserts the sha256
of every file it runs (SR-58). A rebase that leaves these files unchanged
proceeds; one changed byte halts. The three files must be on `origin/main`
before the sitting: they are delivered by their own PR, which merges first
(SR-61).

## STAGE 1: pre-checks and the move

```
(
set -eo pipefail
SHA1=e240a5b9a56b1366d1c20f7a804d128750e59d6bb72235e5a85981bbc8a9a864

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/nesa-split-stage1.out /tmp/nesa-split-stage1.ok

STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f scripts/data/nesa-split-1-move.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/nesa-split-1-move.sql | cut -d' ' -f1)" = "$SHA1" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-1-move.sql 2>&1 | tee /tmp/nesa-split-stage1.out
grep -q 'NESA SPLIT STAGE 1 DONE' /tmp/nesa-split-stage1.out || { echo "STOP: stage 1 did not print its DONE line"; exit 1; }
touch /tmp/nesa-split-stage1.ok
)
```

The whole file is one `DO` block, so it is one transaction: every pre-check and
the update either all happen or none do. A `STOP:` line means nothing was
written. **Read the `P3` notice before going on**: it prints N and the status
breakdown, and N is what stage 1 claims to have moved in its `DONE` line.

## STAGE 2: pre-checks, the flag, and the post-check

```
(
set -eo pipefail
SHA2=2da45349ce436cd8879ab77bdfa83cf33c3dbe0d08d838808d6f5e061950fb06
SHA3=1fdc926e116b14f224ac818f391ba22e10eb9e7cac23bc8c17dee50cf4ed6472

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/nesa-split-stage2.out /tmp/nesa-split-postcheck.out

[ -n "$(find /tmp/nesa-split-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete in this sitting"; exit 1; }

git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}

test -f scripts/data/nesa-split-2-flag.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/nesa-split-3-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/nesa-split-2-flag.sql | cut -d' ' -f1)" = "$SHA2" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/nesa-split-3-postcheck.sql | cut -d' ' -f1)" = "$SHA3" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-2-flag.sql 2>&1 | tee /tmp/nesa-split-stage2.out
grep -q 'NESA SPLIT STAGE 2 DONE' /tmp/nesa-split-stage2.out || { echo "STOP: stage 2 did not print its DONE line"; exit 1; }

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-3-postcheck.sql 2>&1 | tee /tmp/nesa-split-postcheck.out
grep -qE '\| FAIL' /tmp/nesa-split-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\| OK' /tmp/nesa-split-postcheck.out || true)
[ "$OKS" = 15 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 15"; exit 1; }
echo "NESA SPLIT COMPLETE"
)
```

**The post-check types no carry.** Stage 1 records its own before-counts and
every moved id in its audit row, so the post-check reads them back out of the
database and compares them with what it recomputes. SR-59's hazard — a number
that travelled through a human hand — cannot arise, because no number does.

## The production pre-state, read read-only on 2026-09-16 23:34Z

Target asserted `dfotoodqvmjhbdcxyaxf` port 5432, one `read only` transaction,
no patient data read.

| Pre-check | Measured |
|---|---|
| P1 both rows exist, `is_shared_resource` false on both | 2 rows, 0 flagged, both named NESA, both active, both bookable, 0 logins |
| P2 installation | CB row: OsteoJP (CB) only. LV row: OsteoJP (LV) |
| P3 **N** = future LV appointments on the CB row | **32**, all `scheduled`, 2026-09-18 11:00Z to 2026-12-29 10:00Z |
| P3 context | 5,591 PAST LV on the CB row (never move); 4,211 at CB (9 future); 0 as Terapeuta 2; 0 at a third clinic |
| P4 clinical rows on those 32 | records 0, episodes 0, attachments 0 |
| P5 confirmed overlaps on the LV row after the move | 1 confirmed row in the set, **0 overlapping pairs** |
| P6 active LV hour rows on the CB row | **0** (so stage 2 may run) |
| P7 future CB appointments on the LV row | **0** (so stage 2 may run) |
| P8 triggers on `appointments` | none. Policies: `appointments_patient_selfscope`, `appointments_rls`, `appointments_shared_resource_second_participant_select` |

**A premise correction for whoever reads the older cards: 0088 IS applied on
production.** Its policy
`appointments_shared_resource_second_participant_select` exists, measured in P8
above. Card `NESA-DIAG-shared-resource-flag-never-set` recorded it as not
applied on 2026-09-15, and that was true then.

## Rehearsed, in full, on a throwaway database

Supabase local stack on `127.0.0.1:54622` at migration 0088, a throwaway tenant,
and a fixture carrying the **production ids** for both NESA rows and both
clinics — so the stage files ran as the exact bytes that will run on production,
against production's own shape: 32 future LV on the CB row, 5,591 past LV, 4,211
at CB, 6 on the LV row, 74 active CB hour rows, 0 active LV hour rows, 0 future
CB appointments on the LV row, 0 rows flagged.

Six arms, in order:

| Arm | Expected | Result |
|---|---|---|
| 1. stage 2 BEFORE stage 1 | refuses | `STOP: stage 1 has not run (no staff.nesa_split.reassign audit row ...)`, exit 3 |
| 2. stage 1 | moves 32 | `NESA SPLIT STAGE 1 DONE: 32 appointments moved`, CB row 9834 → 9802, LV row 6 → 38, exit 0 |
| 3. stage 1 again | refuses | `STOP: this block has already run ... (audit row staff.nesa_split.reassign present)`, exit 3 |
| 4. stage 2 | flags 2 | `NESA SPLIT STAGE 2 DONE: is_shared_resource true on both; is_bookable and is_active unchanged`, exit 0 |
| 5. stage 2 again | refuses | `STOP: is_shared_resource is already true on at least one row (CB t, LV t)`, exit 3 |
| 6. post-check | 15 OK | **15 OK, 0 FAIL** |

Stage 1's pre-check notices on arm 2, verbatim:

```
P3 N = 32 future LV appointments on the CB row; by status {"scheduled": 32}
P3 future LV appointments holding the CB row as Terapeuta 2: 0
P4 clinical_records 0 / clinical_episodes 0 / attachments 0
P5 confirmed rows on the LV row after the move 1, overlapping pairs 0
P6 active LV availability rows on the CB row: 0 (stage 2 refuses if > 0)
P7 future CB appointments on the LV row: 0 (stage 2 refuses if > 0)
P8 triggers on appointments: none
```

### Then the screens, as the owner, on the moved rows

Real server actions against the rehearsed database, owner role, only the request
context, the client IP and the reminder send mocked. **4 of 4 passed:**

| Arm | Result |
|---|---|
| CONTROL: a booking left at LV on the CB row | refused `shared_resource_location` — so the flag IS in force and the three passes below mean something |
| reschedule a moved booking | `ok`, and the row moved |
| Marcar novamente (clone) a moved booking | `ok`, one new row |
| cancel a moved booking, then bring it back | `ok`, status back to `scheduled` |

That is the FLAG-4 lock measured from the other side: it still bites a booking
left at the wrong clinic, and it does not bite the 32 once they are on the LV
row.

### Negative controls, each from a clean fixture

| Control | Expected | Result |
|---|---|---|
| one moved appointment carries a `clinical_record` | stage 1 STOPs, writes nothing | `STOP: 1 clinical rows are attached to the move set (records 1, episodes 0, attachments 0)`, exit 3. State after: 32 still on the CB row, LV row 6, 0 audit rows, 0 flagged |
| a moved appointment is `confirmed` on an hour the LV row already holds confirmed | stage 1 STOPs, writes nothing | `STOP: the move would put 1 overlapping confirmed pairs on the LV row`, exit 3. State after: 32 still on the CB row, LV row 6, 0 audit rows, 0 flagged |

## What the rehearsal caught, which is the reason for doing it

**P8 aborted the transaction on a line that only prints.** `pg_trigger.tgenabled`
is `"char"` and `pg_proc.proname` is `name`; `text || "char"` resolves to no
unique operator, so the first rehearsal died with
`ERROR: operator is not unique: text || "char"` **after every pre-check had
passed and before the update**. On production that would have been a sitting
that stopped for a reason unconnected to the data, on a diagnostic line. Every
piece of that expression is now cast, and the fix is pinned by a comment saying
why. Nothing was written on that run — arms 3 to 5 of the failed sequence
confirmed 32 rows still on the CB row, no audit row and no flag.

## Undoing it

Not authored here, and it is exact if it is ever wanted: stage 1's audit row
carries `moved_ids` (all 32), `from_practitioner_id`, `to_practitioner_id` and
both before-counts, and stage 2's two audit rows carry each row's
`is_shared_resource_before`. An undo re-points exactly those ids and restores
exactly those flags. It would need its own authoring, its own rehearsal and its
own ruling.
