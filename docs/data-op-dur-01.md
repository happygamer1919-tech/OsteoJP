# DUR-01: one held data op for the importer's one-minute future appointments

**Status: NOT RUN. HELD, UNARMED, WITH A QUESTION BLOCK.** A DATA operation, not a
migration: no schema change, no journal entry. Stage 0 (files), a HEAD CHECK, stage 1
(measure), stage 2 (write) and stage 3 (verify). Any `STOP:` line, any `FAIL` verdict
or any `ERROR` halts the sitting.

**Authored and rehearsed by SOLO. Run by GREEN,** a fresh session launched with the
apply settings, on the owner's dispatch naming the file or files it may run by
filename (`CLAUDE.md`, "Who applies migrations"). Stage 1 can be dispatched on its own,
as a measurement sitting; stage 2 only after the owner answers the question block. The
authoring lane has run every byte below against a throwaway database and against
nothing else.

| Fact | Value |
|---|---|
| Card | `DUR-01`. NEW: it is on no ruled Tier C list (`CLAUDE.md`, "SOLO's record"), and it rewrites production rows outside STAFF-10, which the TIERS place in D. So it is authored, rehearsed on the throwaway and held unarmed with the question block below |
| Ruling, owner, 2026-09-24, paraphrased | a new held data op: measure the future appointments the Fisiozero importer wrote with a one-minute duration, then author the write that gives them their service's default duration |
| Branch | `data/DUR-01-import-stub-durations`, from `origin/main` at `f4e892cd`. Its PR is labelled `held-for-apply` from the moment it opens and stays unarmed until this op is proven |
| Stage 1 | `scripts/data/dur-01-1-measure.sql`, READ ONLY, sha256 `3942a09a061a422ed61d3e0ab58e730fa93de570290e841c2b1b4e269c5e2e5d` |
| Stage 2 | `scripts/data/dur-01-2-write.sql`, ONE DO block in ONE transaction, sha256 `aa28f519ae2b17c007b014a39f68a1a212c43cc67b7b3d947b1c1fa13d39642f` |
| Stage 3 | `scripts/data/dur-01-3-verify.sql`, READ ONLY, 19 verdicts and a SUMMARY row, sha256 `fc3a9460d7e1aa303e6588b405ab0ab6caea19c445eccde54509004377ba55b4` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, byte-identical to `origin/main` at `f4e892cd` |
| This document | `docs/data-op-dur-01.md`, pinned by `docs/data-op-dur-01.sha256` and asserted by every stage that reads a file |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `appointments.ends_at`, set to `starts_at` plus the service's `duration_min`, and `appointments.updated_at`, set to the op's clock, on the rows stage 1 classifies WRITE and on no other; ONE `audit_log` row, action `staff.dur01.extend_import_duration` |
| What no stage touches | every other column of those rows (status, start, both participants, service, room, confirmation, pack, notes), every other appointment, and every other table: `time_off`, schedule rows, reminders, invoices, clinical records. Stage 2 compares the written rows' other columns and every other appointment in the tenant by md5 inside its own transaction |
| Apply before merge | yes. The PR cannot merge while the label is on (`held-for-apply-blocks-merge.yml`), so every stage derives its head from `origin/data/DUR-01-import-stub-durations`, never from `main` |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/data-op-dur-01.sha256` and every stage checks
it with `shasum -a 256 -c` before it trusts a pin written here.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document).

## What it fixes, in one paragraph

The Fisiozero importer copied each appointment's end from the source as it stood
(`packages/db/src/migration/sources/fisiozero.ts`, the `fim` column), and rejected only
an end at or before the start. Where the old system held a booking as one minute, the
platform holds it as one minute: the agenda draws a sliver, the therapist looks free for
the rest of the hour, and the patient portal offers that hour to someone else, because
its slot check reads `ends_at` (`apps/api/lib/appointments/store.ts`). This op finds
every such future row through the importer's own ledger, classifies each one against
the app's own booking rules, and, for the rows nothing stands in the way of, sets the
end to the start plus the service's default duration, the length the staff drawer gives
a booking of that service. Every row it does not write is listed by id for reception.

## THE QUESTION BLOCK

**blocked_what:** stage 2, the write. It rewrites production rows outside STAFF-10,
which the TIERS place in D, it is on no ruled list, and its premise is a product
question that nothing in the code can answer.

**The premise, plainly: what does a one-minute Fisiozero row mean?** Two readings, and
the code cannot tell them apart:

1. **A placeholder.** The old system could not hold the real length, and the session
   lasts what its service normally lasts. Extending it is a correction.
2. **A real minute.** The therapist starts a machine (NESA) for the patient and is then
   free to see someone else. Extending the row holds that therapist for a full hour in
   which they are free, and removes that hour from the patient portal.

The only documented case, on the AGENDA-TWIN card, is a NESA session the old system
held twice: the machine's row holds the hour and the therapist's row holds one minute,
which reads like the second kind. Stage 1 section 4 (by service) is the evidence: for each
clinic and service it prints how many of these rows sit on a therapist rather than on a
machine, and how many of those have a live NESA booking of the same patient alongside.

**options:**

- **(a)** Write only the rows stage 1 classifies WRITE: live, with a service whose
  default is above one minute, one minute in the source row as well, starting from
  tomorrow, no NESA twin, and clear of every check below. Every other row is listed for
  reception or held.
- **(b)** As (a), and also the NESA twins (verdict 08) once STAFF-10 v2 has run. Not
  built: a ruling for (b) changes the files, their pins and the rehearsal. See "The
  order with STAFF-10 v2" for what (b) can and cannot reach.
- **(c)** No write. Reception edits every row by hand from stage 1's listing.

**recommendation:** run **stage 1 first, alone, as a measurement sitting** (the section
below). Rule on its section 4: if the rows sit mostly on therapists with a machine
alongside, reading 2 holds for those services and they should not be extended. Then run
stage 2 with **option (a)**, the option the files are built to, after STAFF-10 v2 has
run.

## The defaults this op is built to

Each default is what the files do today. A different ruling changes the files, their
pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | Which rows are in scope? | Every appointment the importer wrote, found by its ledger row (`migration_staging_rows`: source `fisiozero`, entity `appointment`, status `imported`, `imported_entity_id`), lasting exactly one minute and starting now or later. Not `origin` (the importer writes the default, `staff`) and not `created_at` |
| Q2 | What is the service's default? | `services.duration_min` of the row's own service, the value the staff drawer takes when a service is picked (`apps/web/app/agenda/appointment-drawer.tsx`, `applyService`). It is one value per service; no clinic or therapist carries its own |
| Q3 | Which checks hold a row? | **Every check reception's own duration change would refuse without "Guardar mesmo assim"** (`rescheduleAppointment`, `apps/web/lib/scheduling/actions.ts`): the therapist's hours (RB-03), the clinic's midday closure (0085), the clinic's start window (AGENDA-2100), and the booking conflicts (therapist, room, and a NESA resource as Terapeuta or as Terapeuta 2) and blocks. Plus three the app's reschedule does not check: a NESA twin, the same patient booked elsewhere, and two one-minute rows that would collide once both are extended. **ADDED DEFAULT:** the ruling named the closure, bookings, blocks, the same patient and the twin. The therapist's hours and the start window are added because the app's reschedule enforces both outside the override, so reception could not make the change herself |
| Q4 | A row that starts later on the run day? | Held (verdict 07), for reception. Stage 2 writes only rows starting from 00:00 Lisbon tomorrow, so the write set cannot move between stage 1 and stage 2 on the same day as starts pass |
| Q5 | A future row already `completed`? | Held (verdict 02). It is the DATA-future card's, not this op's |
| Q6 | A row with no service, or a service of one minute? | No service: held for reception (03), who can pick one. A one-minute service: left alone (04), the row already lasts its default |
| Q7 | Two ledger rows for one appointment, or a source row that does not read as one minute? | Held as findings (05, 06). The source duration is computed from the `inicio` and `fim` keys only, and only when both parse as the importer's own form on the same date |
| Q8 | `updated_at`? | Set to the op's clock on every written row, and the value before is kept in the audit row. NESA-SPLIT left it alone; this op sets it because the row did change and the app sets it on every edit |
| Q9 | When does stage 2 run? | **Outside clinic hours.** It locks `appointments` (SHARE ROW EXCLUSIVE) and `time_off`, `availability_templates`, `staff_notifications` (SHARE) for the seconds the transaction lasts, so no booking lands mid-write. A booking already in flight holds a lock; stage 2 waits five seconds for it and STOPS cleanly |
| Q10 | The order with STAFF-10 v2? | STAFF-10 v2 first. The next section says why, and what either order gives |
| Q11 | A re-run of the importer? | It would write the source's one minute back over this fix (`packages/db/src/migration/upsert.ts`, the re-run branch updates the row from the source). Noted for the owner; not something this op can prevent |
| Q12 | An undo? | Exact, from the audit row: the section "Undoing it". Documented, never run |
| Q13 | A row that would end after closing time? | Written if nothing else holds it. The app has no end-after-close rule (`apps/web/lib/scheduling/clinic-hours.ts`), so this op invents none; stage 1 prints the flag and counts it per clinic |
| Q14 | A one-minute row that is itself an unconfirmed pedido? | Classified like any other live row. The app's reschedule does not refuse one |
| D1 | Added: why is the rule inline? | `appointment_conflicts` and `is_unconfirmed_pedido` filter on `jwt_tenant_id()`, NULL in a psql session, so called from here they answer "no conflict" and "not a pedido" for every row. The rule is carried inline, with the tenant taken from the row, and the rehearsal proves the trap (arm T below) |
| D2 | Added: is the inline rule the app's rule? | `apps/web/lib/scheduling/dur-01-classification.db.test.ts` runs stage 1's own BASE block over a seeded tenant and, for every candidate, the app's `findConflictsForWindow` with `blockingConflicts`, `checkAvailability`, `checkClinicClosure` and `checkClinicWindow` under `runScoped`, and requires them to agree flag for flag, every arm with its opposite |
| D3 | Added: what if production carries a trigger main does not? | R05 refuses, and stage 2's P4 reads the catalog again under the lock and stops too |
| D4 | Added: what if the write set is empty? | R06 refuses: an empty write is a STOP, not a finished state, so every stage 3 arm always compares something |
| D5 | Added: can a held row be written by a verdict order that let it through? | No. R09 re-reads every flag, NULL-safe, on the WRITE set; R07 and R08 re-check the two collisions the database and the classifier could disagree on |
| D6 | Added: a STAFF-10 v2 write between stage 1 and stage 2? | Refused: the fourth carry is STAFF-10 v2's audit row count, and stage 2 compares it |

## The order with STAFF-10 v2 (#1444)

STAFF-10 v2 resolves each FUTURE NESA twin whose two rows are both live by option (a) of
its own ruling: the person row keeps, takes the NESA as `practitioner_2`, and the NESA
row is cancelled. It refuses a pair whose person window does not cover its NESA window
(its R17), so a pair whose person half is a one-minute stub and whose NESA half lasts an
hour stops STAFF-10 v2 rather than being resolved by it. It changes JP(cb)'s
Linda-a-Velha schedule rows, which the therapist-hours check reads.

**This op gives a correct result in either order, and stage 1 classifies every shape
either order can leave:**

| Shape | Where it comes from | What stage 1 does |
|---|---|---|
| a one-minute row with a live twin partner | either order, STAFF-10 v2 not yet run | verdict 08, held for question option (b) |
| a one-minute person row whose twin partner is cancelled, naming the NESA as `practitioner_2` | STAFF-10 v2 run over a pair whose two halves are both one minute | verdict 08: the twin predicate reads the partner in any status. Its cancelled NESA half reads 01 |
| a one-minute row on the NESA whose window meets a person row naming that NESA as `practitioner_2` | STAFF-10 v2 run: the NESA's hour moved from the NESA row to the person row | verdict 12: the resource arm reads the NESA as Terapeuta 2 exactly as it read the NESA row as Terapeuta before. The rehearsal runs both sides (arms S10a and S10b) |
| a therapist's hours changed by STAFF-10 v2's schedule writes | STAFF-10 v2 run | read at run time: verdict 11 follows the schedule as it stands |
| STAFF-10 v2's write landing between this op's stage 1 and stage 2 | the two sittings interleaved | stage 2 STOPS on the fourth carry (arm S10c) |

**Recommended: STAFF-10 v2 first, then this op's stage 1 as the measurement sitting.**
STAFF-10 v2 is ruled and due first. After it, the future twins are resolved, so the
measurement shows the shape that will stand, and the owner's answer to option (b)
reads against what STAFF-10 v2 actually left. Running this op first would not help
STAFF-10 v2: under option (a) no twin is written, so its R17 sees the same pairs either
way. **Never interleave the two:** a sitting of this op, stage 1 to stage 2, has no
STAFF-10 v2 stage inside it.

## A measurement sitting: stage 1 alone

The recommendation asks for this before any decision about stage 2. GREEN runs STAGE 0,
the HEAD CHECK and STAGE 1 below and stops; stage 1 writes nothing, and nothing obliges
a stage 2 after it. Its transcript is the measurement:

- **section 2**: the population with and without the ledger filter, per clinic, and the
  created range as a cross-check against the import windows; **2b** the duration profile
  of the importer's short future rows, so the owner sees whether one minute is the whole
  class;
- **section 3**: the verdicts per clinic, who each belongs to, and the partition line;
- **section 4**: by service, the evidence for the premise question;
- **sections 5 and 6**: every row by id, and the reception list, one line per reason;
- **sections 7 and 8**: the carries, and the refusals with their controls.

A REFUSE line in a measurement sitting is itself a measurement (R06, nothing to write,
is one); the block prints the whole transcript before it stops on it.

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from:"
git rev-parse origin/data/DUR-01-import-stub-durations
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.**

- **Before stage 2 has written:** a moved head means the sitting starts again from
  stage 0, and stage 1 is run again.
- **After stage 2 has written: NEVER run stage 1 or stage 2 again.** Stage 1 and stage 2
  both refuse once the write marker exists, and R04 and P0 refuse in the database
  regardless. Stage 3 is READ ONLY and can be pasted on the new head: it asserts its own
  file by sha256 and stops if that changed. Report both shas.

## STAGE 0: the files, the pins and the head

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
DOCPIN=docs/data-op-dur-01.sha256
SHA1=3942a09a061a422ed61d3e0ab58e730fa93de570290e841c2b1b4e269c5e2e5d
SHA2=aa28f519ae2b17c007b014a39f68a1a212c43cc67b7b3d947b1c1fa13d39642f
SHA3=fc3a9460d7e1aa303e6588b405ab0ab6caea19c445eccde54509004377ba55b4
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

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
test -f scripts/data/dur-01-1-measure.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/data/dur-01-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/dur-01-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-1-measure.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
echo "DUR-01 FILES VERIFIED"
)
```

**EXPECT: `running from <sha>`, then `DUR-01 FILES VERIFIED`.** It reads no database.

## STAGE 1: the measurement

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
SHA1=3942a09a061a422ed61d3e0ab58e730fa93de570290e841c2b1b4e269c5e2e5d
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/dur01-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run stage 1 or 2 again; go to stage 3"; exit 1; }
rm -f /tmp/dur01-stage1.out /tmp/dur01-stage1.ok

echo "--- THE HEAD. The sha printed next MUST equal the one the HEAD CHECK showed."
git fetch origin --prune
git rev-parse origin/${BRANCH}
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
shasum -a 256 -c docs/data-op-dur-01.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/dur-01-1-measure.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-1-measure.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/dur-01-1-measure.sql 2>&1 | tee /tmp/dur01-stage1.out
grep -q 'DUR-01 STAGE 1 COMPLETE' /tmp/dur01-stage1.out || { echo "STOP: stage 1 did not print its COMPLETE line"; exit 1; }
RN=$(grep -cE '^[[:space:]]*R[0-9]{2}[[:space:]]*\|' /tmp/dur01-stage1.out || true)
[ "${RN}" = 9 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 9"; exit 1; }
REF=$(grep -E '^[[:space:]]*R[0-9]{2}[[:space:]]*\|.*\|[[:space:]]*REFUSE[[:space:]]*$' /tmp/dur01-stage1.out | sed -E 's/^[[:space:]]*(R[0-9]{2}).*/\1/' | tr '\n' ' ' || true)
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. Stage 2 refuses on the same lines. Report them; do not go on"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/dur01-stage1.out; }
RD=$(carry dur01_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 read the Lisbon day as ${RD}, and this machine's Lisbon clock disagrees"; exit 1; }
touch /tmp/dur01-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 2, 3, 3b, 4 and 6 before stage 2."
)
```

**Read the output before pasting stage 2.** Section 8 prints nine refusals, `R01` to
`R09`; the block has already stopped if any reads REFUSE. Section 8b must be empty. A
refusal that reads `VACUOUS` read an empty population: that is not a refusal, and the
sections above it say which population it was (R07 is VACUOUS on a day no WRITE row is
confirmed). Section 3b must read `partition holds`. Section 6 is reception's list.

## STAGE 2: the write

**Paste it outside clinic hours** (Q9), within the hour of stage 1, on the same Lisbon
day, after a second HEAD CHECK.

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
SHA2=aa28f519ae2b17c007b014a39f68a1a212c43cc67b7b3d947b1c1fa13d39642f
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
NAMES=(
dur01_run_day
dur01_count
dur01_digest
dur01_s10v2_runs
)

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/dur01-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run it again; go to stage 3"; exit 1; }
[ -n "$(find /tmp/dur01-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not pass in this sitting, or passed over an hour ago. Run stage 1 again"; exit 1; }
test -f /tmp/dur01-stage1.out || { echo "STOP: stage 1 left no transcript; run stage 1 again"; exit 1; }
[ -n "$(find /tmp/dur01-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }

echo "--- THE HEAD. The sha printed next MUST equal the one the HEAD CHECK showed just before this stage."
git fetch origin --prune
git rev-parse origin/${BRANCH}
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
shasum -a 256 -c docs/data-op-dur-01.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/dur-01-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/dur01-stage1.out; }
RD=$(carry dur01_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 ran on Lisbon day ${RD}, not today. Run stage 1 again"; exit 1; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}); [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: run day ${RD}, ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/dur01-stage2.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/dur-01-2-write.sql 2>&1 | tee /tmp/dur01-stage2.out
touch /tmp/dur01-written.ok
grep -q 'DUR-01 STAGE 2 DONE' /tmp/dur01-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its DONE line is missing. Never run stage 1 or 2 again. Paste stage 3 and report both"; exit 1; }
grep -q 'DUR-01 STAGE 2 COMMITTED' /tmp/dur01-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its COMMITTED line is missing. Never run stage 1 or 2 again. Paste stage 3 and report both"; exit 1; }
echo "DUR-01 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the write; every
assertion after it raises too, and a raise inside the DO block rolls back everything
the block did. So a `STOP:` raised in the database (psql exit 3) always means **nothing
was written**, and so does every `STOP:` the block prints before psql runs. **psql exit
0 means the COMMIT ran and the write stands:** the block touches the written marker at
once, before it reads the transcript, and the two `STOP:` lines it can print after that
point say so in their own words. The file pins `client_min_messages = notice`, so a
quieter role or database default cannot hide the step lines. The NOTICE lines name each
step: `L1` the locks, `P0` the re-run refusal, `P1` the sets, `P2` each refusal with its
control, `P3` the run day and the carries, `P4` the triggers the system did not create
(none, or it stops), `P5` the baselines, `W1` the write with its row count, `A1` the
written ends against the carried digest, `A2` the re-measure against the table as it
now stands (any hit STOPS), `A3` the total and both md5s unchanged, and
`DUR-01 STAGE 2 DONE`, then `COMMITTED` after the COMMIT.

**psql exit 3** is every in-database STOP, a lock not granted within `lock_timeout`
included. An undefined carry fails before the block, on the `set_config` statement,
also with exit 3.

## STAGE 3: the verify. READ ONLY, re-issuable

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
SHA3=fc3a9460d7e1aa303e6588b405ab0ab6caea19c445eccde54509004377ba55b4
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "verifying from ${PIN}"
git checkout -q --detach ${PIN}
shasum -a 256 -c docs/data-op-dur-01.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/dur-01-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/dur01-stage3.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/dur-01-3-verify.sql 2>&1 | tee /tmp/dur01-stage3.out
grep -q 'DUR-01 STAGE 3 COMPLETE' /tmp/dur01-stage3.out || { echo "STOP: stage 3 did not print its COMPLETE line"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/dur01-stage3.out || { echo "STOP: stage 3 printed no SUMMARY row"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/dur01-stage3.out && { echo "STOP: a stage 3 verdict read FAIL"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/dur01-stage3.out || true)
[ "${NV}" = 19 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 19"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/dur01-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '18' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/dur01-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "DUR-01 VERIFIED: ${PROFILE}. The RECEPTION section above lists every row stage 2 did not write, by id."
)
```

**EXPECT: no FAIL, 19 verdicts, a SUMMARY row, and VACUOUS on verdict 18 at most**,
which the block enforces: 18 is VACUOUS only on a day every one-minute row was written.
Every other verdict compares something, because R06 refuses an empty write set before
the write. The block prints the profile; the profile moves with the data, so no exact
profile is asserted for production.

## What every verdict, refusal and check means

**Stage 1's verdicts.** Every population row gets exactly ONE, the first that applies,
in this order (the `v` CTE of the BASE block). Only WRITE is written.

| Verdict | When | Belongs to |
|---|---|---|
| `01 NOT LIVE` | cancelled or no-show | left alone |
| `02 COMPLETED IN THE FUTURE` | completed, starting in the future | the owner, the DATA-future card |
| `03 NO SERVICE` | no service, so no default | reception |
| `04 SERVICE DEFAULT NOT ABOVE ONE MINUTE` | the service's default is one minute or less: nothing to extend | left alone |
| `05 LEDGER AMBIGUOUS` | more than one ledger row names the appointment | held as a finding |
| `06 SOURCE ROW NOT ONE MINUTE` | the source row's `inicio` and `fim` do not read as one minute on one date | held as a finding |
| `07 STARTS ON THE RUN DAY` | starts before 00:00 Lisbon tomorrow (Q4) | reception |
| `08 PART OF A NESA TWIN` | a twin: another row, same patient, start and service (NULL-safe), one on a shared resource and one not, the partner in any status | the owner, question option (b) |
| `09 RUNS INTO THE CLINIC CLOSURE` | the extended window touches the clinic's midday closure on its Lisbon day | reception |
| `10 STARTS OUTSIDE CLINIC HOURS` | the start is before `opens_at` or after `closes_at` minus 60 minutes | reception |
| `11 OUTSIDE THE THERAPIST HOURS` | the therapist has hours configured at that clinic and the extended window is not inside one merged run of that day's windows | reception |
| `12 OVERLAPS A BOOKING` | another live row (not cancelled, not no-show, not an unconfirmed pedido) on the same therapist, in the same room at the same clinic, or holding a NESA the row names in either slot, as Terapeuta or as Terapeuta 2, overlaps the extended window, half-open | reception |
| `13 OVERLAPS A BLOCK` | a `time_off` block on the therapist overlaps it | reception |
| `14 OVERLAPS ANOTHER STUB ONCE BOTH ARE EXTENDED` | another live one-minute row, read at its own proposed end, shares a therapist, a resource, a room or the patient | reception |
| `15 SAME PATIENT BOOKED ELSEWHERE` | another live row of the same patient overlaps it | reception |
| `WRITE` | none of the above | stage 2 writes it |

**The flags are printed for every row** (section 5), so a row held for one reason shows
every other that also applies, and section 6 lists each reason with the other row's id
and window. `ends_after_close` is printed and never a verdict (Q13).

**Stage 1 section 8 and stage 2 P2, the same nine lines.** `n` must be 0. `control` is
the population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | the Fisiozero appointment ledger is empty, so the population filter could read nothing. Its control is the ledger itself |
| R02 | a tenant in the population has no active shared resource, so the twin check and the resource arms would read a vacuous zero. Its control is every active shared resource |
| R03 | the population spans more than one tenant; the audit row names one |
| R04 | this op has already run (its audit row). Stage 2's P0 refuses the same before it reads the sets |
| R05 | a trigger the system did not create sits on `appointments` or `audit_log`. Its control is every trigger on the two, the foreign-key constraint triggers included. Section 8b lists what it found |
| R06 | the WRITE set is empty. Its control is the population |
| R07 | a confirmed WRITE row, once extended, would overlap another confirmed row on its practitioner, the `appointments_no_double_confirmed` constraint (0061), another WRITE row read at its proposed end. The classifier and the database disagree. Its control is the confirmed WRITE rows, VACUOUS on a day there are none |
| R08 | two WRITE rows would overlap each other once both are extended, on a therapist, a resource, a room or a patient. Its control is the WRITE set |
| R09 | a WRITE row carries any flag that should have held it, re-read NULL-safe (`IS NOT FALSE`, `IS DISTINCT FROM`), so a verdict order that let a held row through, or a flag that read NULL, refuses. Its control is the WRITE set |

**The carries.** Four names, none a substring of another: the Lisbon run day, the WRITE
count, an md5 over every WRITE id with the epoch of the end stage 2 will give it, and
the count of STAFF-10 v2 audit rows. The block that computes them, between
`DUR-01 BASE BEGIN` and `BASE END`, is byte-identical in stage 1 and stage 2, so a
recomputed carry can only differ when the database moved. Stage 2 checks the digest
three times: recomputed by the BASE (P3), recomputed from the table under the lock
before the write (P5), and read back from the table after it (A1).

**Stage 3's 19 verdicts:**

1. exactly one DUR-01 audit row;
2. the written list: distinct ids, as many as the carried count and the recorded count;
3. every written id still exists, in the recorded tenant;
4. every written id ends at its recorded after end;
5. every written id ends at its start plus its service's default, read now;
6. no written id lasts one minute any more;
7. the recorded after ends reproduce the carried digest;
8. the undo is exact: every recorded before end is its start plus one minute;
9. every written id carries `updated_at` at or after the op's clock;
10. every written id is unchanged in every column the op does not write (md5);
11. the re-measure reads every written id and sees each as a live row, its positive
    control: a live filter that cannot see the written rows would green 12 to 17, so
    this FAILs, never VACUOUS;
12. to 17. the app's rule again, over the written rows at their new ends against the
    table as it stands: no booking overlap (therapist, room, resource in either slot),
    no block, no closure, no start outside the clinic's hours, inside the therapist's
    hours where configured, no other live booking of the same patient;
18. every id the op held still lasts one minute (VACUOUS when none was held);
19. the appointment total, counting rows created up to the op, equals the recorded one.

**Stage 3 is re-issuable, and its answers move with the clinic.** A reception edit
after the sitting can change 3 to 18 honestly: a written row shortened later FAILs 4,
5 and 6, one cancelled later FAILs 11, 12 and 17 (the re-measure no longer sees it as
live), and a new booking over a written row FAILs 12. Read a later FAIL against the audit row's time before calling it a defect of
the op. The block that computes 12 to 17, between `DUR-01 RECHECK BEGIN` and
`RECHECK END`, is byte-identical in stage 2 (A2) and stage 3, and its rule block,
between `DUR-01 RULE BEGIN` and `RULE END`, is byte-identical to the one inside the
BASE.

## Undoing it

**Exact, never run, and never to be run without its own ruling.** The audit row carries
every written id with its before end and before `updated_at`. The undo is one UPDATE
that restores only rows still at the end this op gave them, in one transaction, with
its row count read:

```
BEGIN;
UPDATE public.appointments a
   SET ends_at = (e ->> 'before_end')::timestamptz, updated_at = (e ->> 'before_updated_at')::timestamptz
  FROM public.audit_log al, jsonb_array_elements(al.metadata -> 'written') e
 WHERE al.action = 'staff.dur01.extend_import_duration'
   AND a.id = (e ->> 'id')::uuid
   AND a.ends_at = (e ->> 'after_end')::timestamptz;
ROLLBACK;
```

It is written with `ROLLBACK` on purpose: a real undo is its own data op, authored and
rehearsed with its own count check and its own audit row, on its own ruling. A row
reception has since edited is left alone by the `ends_at` guard, which is what an undo
must do.

## Rehearsed on a throwaway database

Not yet rehearsed.

## What this does NOT do

- **It sends nothing.** A raw UPDATE runs no app path: no reminder is queued or moved,
  no staff notification is written, no patient is told. A reminder already queued for
  a written row goes at its own time, as before.
- **It writes no status, start, participant, service, room or confirmation.** Stage 2
  compares every other column of the written rows by md5, before and after, inside its
  transaction; stage 3 again.
- **It does not touch a twin** (option (a)): verdict 08 is held for the owner.
- **It does not touch a staff-made one-minute row, a past row, or a row of any other
  length.** The population is the importer's ledger, one minute exactly, from now.
- **It does not stop a re-import from writing the minute back** (Q11).
- **It does not add a table** for provenance: the listing and the audit row are it.
