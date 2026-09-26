# STAFF-10 v2: one data op for JP(cb) at Linda-a-Velha and the NESA twins

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no journal
entry. Four blocks, each pasted whole, on its own and in order: stage 0 (the files and
the head it runs from), stage 1 (read), stage 2 (write) and stage 3 (verify). Any
`STOP:` line, any REFUSE, any `FAIL` verdict, any `ERROR` and any non-zero exit halts
the sitting:

A refusal or a STOP stops the sitting, and nothing continues to the next block.

Whether and when a halted sitting starts again is the lead's call, never the runner's.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings,
on the owner's dispatch naming the three files below by filename (`CLAUDE.md`, "Who
applies migrations"). The authoring lane runs these blocks against a throwaway database
and against nothing else; the section "Rehearsal" says what has run on these exact
bytes.

| Fact | Value |
|---|---|
| Card | `STAFF-10`, a ruled Tier C item |
| Replaces | PR #1433 (branch `data/STAFF-10-list-c-nesa-twins`, kept, not merged) and the original STAFF-10 write in `docs/data-op-staff-10.md`, which carries a SUPERSEDED banner and must not be run |
| Rulings, owner, 2026-09-24, paraphrased | (a) JP(cb)'s Linda-a-Velha appointments from before the start of the Lisbon run day move to JP(lv); (b) a past NESA twin pair whose NESA row is not installed at the booking clinic has that row moved to the NESA installed there; (c) a future NESA twin pair takes option a: the person row keeps, takes the NESA as practitioner_2, and the NESA row is cancelled, with a proof that the machine hour stays held; (d) every other past twin is listed and never changed; (e) the original schedule-row actions carry forward with their defects fixed |
| Rulings, owner, on this restructure, paraphrased | the op contains no DELETE, DROP or TRUNCATE and writes no `time_off` row; the owner removes the 30 September block in the app before the sitting, and stage 1 refuses while it is there; the op runs from `origin/main` after its PR merges, and main is frozen for the sitting; the audit row carries the ids of every future pair ruling (c) acts on |
| JP(cb) | `54d486e0-a9c3-4c82-acac-8b909ce5a2d0` (the Castelo Branco row) |
| JP(lv) | `0c1a0000-0000-4000-8000-000000000001` (the Linda-a-Velha row) |
| NESA(cb) | `0c1a0000-0000-4000-8000-000000000002` (installed at Castelo Branco) |
| NESA(lv) | `bdc466d7-f81f-4f8c-aa2e-b85194d73e1a` (installed at Linda-a-Velha) |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Runs from | `origin/main`, after this op's PR has merged. The owner freezes merges to main for the sitting. Stage 0 records the sha `origin/main` resolves to in `/tmp/staff10v2-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stages 1 and 2 HALT if `origin/main` has moved since (the HEAD CHECK, below) |
| Stage 1 | `scripts/data/staff-10-v2-1-read.sql`, READ ONLY, sha256 `095ffe9185b3bace41da43b39b9f46096a8a16af68ab057d0d52310c445fe15b` |
| Stage 2 | `scripts/data/staff-10-v2-2-write.sql`, ONE DO block in ONE transaction, sha256 `a0929941d340303660eeb07e7fe1861d57ee3b6a3986781543b5266f49c5b422` |
| Stage 3 | `scripts/data/staff-10-v2-3-verify.sql`, READ ONLY, 27 verdicts and a SUMMARY row, sha256 `857ea80004f0227c931b2874adc155206bb42a548a51dee3045dbaf9c78f1991` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, the only other program a block runs; it imports nothing |
| This document | `docs/data-op-staff-10-v2.md`, pinned by `docs/data-op-staff-10-v2.sha256` and asserted by every stage; GREEN's dispatch names its sha256 as well |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `availability_templates.is_active` false (four retire classes); `availability_templates.user_id` to JP(lv) (the moved Saturdays); `appointments.practitioner_id` (rulings a and b); `appointments.practitioner_2_id` and `appointments.status` = cancelled (ruling c); `appointments.updated_at` on every appointment it writes; ONE `audit_log` row, action `staff.staff10_v2.apply`. **No `time_off` row. No stage file holds a DELETE, DROP or TRUNCATE statement** |
| The 30 September block | JP(cb)'s block on the Lisbon day 30 September is ruled wrong, and the owner removes it by hand in the app **before the sitting**. No stage writes it. Stage 1 refuses while any JP(cb) block overlaps that day (R06) and names each one in section 2c by id, Lisbon start and end, and reason; stage 2 raises the same refusal in the database before any write; stage 3 verdict 11 reads it again |
| What no stage touches | `time_off` (stage 2 compares every block of the tenant by count and md5 inside its transaction, and stage 3 verdict 12 compares them with the audit row), `clinical_records` (authorship included), `invoices`, `users`, `staff_locations`, every appointment outside the four sets, JP(cb)'s PAST Castelo Branco appointments and JP(cb)'s Castelo Branco schedule rows. Stage 2 compares each by md5 inside its own transaction. A FUTURE JP(cb) Castelo Branco appointment is not in this list: when it is the person row of a future NESA pair (stage 1 section 7), ruling (c) writes its `practitioner_2_id` and `updated_at`, as for every such person row |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/data-op-staff-10-v2.sha256` and every stage
checks it with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits
on the same head as the document, so a main that moved to a new document and a new
sidecar together would pass that check: GREEN's dispatch names this document's sha256,
and the HEAD CHECK halts on any moved main.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted
into zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document, and
`scripts/staff-10-v2-data-op.test.mjs` holds the other three rules).

## What it fixes, in one paragraph

JP exists as two staff rows, one per clinic. The Castelo Branco row still holds hours
and history at Linda-a-Velha, and the Fisiozero import left one NESA session on two
rows (a NESA row and a person row) wherever the old system held it in both columns.
This op, in one transaction: retires or moves every active JP(cb) Linda-a-Velha
schedule row, moves JP(cb)'s past Linda-a-Velha appointments to JP(lv), moves each
past NESA row booked at a clinic its NESA is not installed at to the NESA that is
(unless its person row is one of those JP(cb) rows, question Q3), and resolves each
future NESA twin into one row that holds both the therapist's hour and the machine's.
The wrong 30 September block is not the op's to write: the owner removes it in the app
before the sitting, and the op refuses while it is there.

## The owner questions, and the default this op is built to

Paraphrased, no counts. Each default is what the files do today; a different ruling
changes the files, their pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | What does ruling (a) cover? | Appointments only, past only: `starts_at` before 00:00 Lisbon on the run day. JP(cb)'s future Linda-a-Velha appointments stay on JP(cb); they are reception's list. An appointment at Linda-a-Velha naming JP(cb) as practitioner_2 refuses (R12) |
| Q2 | Past list A pairs (JP(cb) and JP(lv) booked for one patient at one start) | Moved like any other past row, so both end on JP(lv). Stage 1 section 5b lists them; R14 refuses a move that would put two overlapping confirmed rows on JP(lv) |
| Q3 | A past twin whose person row is JP(cb) at Linda-a-Velha | Ruling (a) moves the person row to JP(lv); the NESA row is left alone and listed, whether or not its NESA is installed at its clinic. So set X never takes a NESA row that sits in any past pair whose person row is in set H: that row is listed in stage 1 section 8 (`person_row_moved_by_a = true`, and `nesa_installed_there` says whether it is booked at a clinic its NESA is not installed at), goes into `p_pairs` and `keep_ids`, and stage 3 verdict 20 proves it unchanged. The rehearsal runs the shape (arm Q3). A ruling that ruling (b) should also move such a NESA row changes the files, their pins and the rehearsal |
| Q4 | Ruling (b)'s target | Exactly one active shared resource installed at the booking clinic; none or more than one refuses (R11) |
| Q5 | A future pair whose person window does not cover the NESA window | Refuses (R17). The op never extends a window |
| Q6 | A future NESA row with a pack session, a clinical record or an invoice | Refuses (R20): cancelling it would give a pack session back or orphan a record |
| Q7 | The raw cancel writes no per-row cancel audit entry and sends no staff notification | The op's one audit row stands in for both, carrying every id; `updated_at` is set on every appointment written. For every future pair ruling (c) acts on, its `f_pairs` names the kept person row (`p`) and the cancelled NESA row (`n`), with the NESA (`r`) and the NESA window (`s`, `e`), and stage 3 verdicts 26 and 27 prove those lists are exactly the rows the op cancelled and the rows it gave a practitioner_2 (D20) |
| Q8 | What is the provenance record of ruling (d)? | Stage 1 section 8 plus the `p_pairs` and `keep_ids` arrays in the audit row. No new database table |
| Q9 | What counts as a real Saturday, and where? | Both: the move set requires the date itself to be a Saturday, and stage 3 checks the Linda-a-Velha roster on the next real Saturday JP(lv) holds. Everywhere a real Saturday row is the date a Saturday AND the weekday column 6: the slot query and the confirm guard (`apps/api/lib/appointments/store.ts`) compare that column with the day, so a dated Saturday carrying another weekday is never offered, and R28 and verdict 8 do not count it |
| Q10 | A phantom row (the weekday column differs from the date's weekday) | Retired (`retire_phantom`) |
| Q11 | The open-ended Saturday window `e37ba817` | Classified by the NULL-safe rule, so it is a `retire_sat_window`. Stage 1 section 2 prints, for every Saturday window, how many JP(lv) Saturday rows exist from its start |
| Q12 | A dated real Saturday JP(lv) does not already hold | Moves to JP(lv), whatever the cadence |
| Q13 | When must this run? | READY-TO-APPLY by Friday 25 September. It must run before the first future pair's date: on or after that date the pair is a past twin, which changes what the op does to it |
| Q14 | New v2 files or a rewrite in place? | New v2 files. The original files and the frozen `scripts/staff-10-data-op.test.mjs` stay byte-identical |
| Q15 | The figures already on main and in #1433's history | Left as they are: the owner's call |
| Q16 | Who fills in the reception list for the future pairs? | An owner-only template, written now and never committed; stage 3 prints the ids on the run day |
| D1 | Added: what if NESA-SPLIT has not run, so the NESA rows are not flagged? | Refuses (R10): the shared resources must be exactly the two NESA rows, both active. Without the flag no twin is visible and ruling (c) would silently do nothing |
| D2 | Added: a future row in more than one live pair | Refuses (R22): which row keeps would be a guess |
| D3 | Added: when does a future pair start within the sitting? | A future pair starting before now plus two hours refuses (R21). Stage 2 must follow stage 1 within the hour |
| D4 | Added: a future pair whose two rows sit at two clinics | Refuses (R18): the booking clinic would be ambiguous |
| D5 | Added: which rows are `retire_past`? | Every active row whose window ended before the run day, dated or not. The original op retired dated past rows only and left an expired undated window standing |
| D6 | Added: a future NESA row that is itself an unconfirmed pedido | Refuses (R23): it holds no machine hour today, so the before-proof has nothing to prove |
| D7 | Added: the original STAFF-10 write has already run | Refuses (R07): the schedule it would meet is not the one ruled on |
| D8 | Added: stage 2 isolation | REPEATABLE READ, so every comparison inside it reads one snapshot and a concurrent write to a row it updates aborts it rather than racing it |
| D9 | Added: what if the 30 September block is still there when the sitting starts? | Refuses (R06), in stage 1 and again in the database in stage 2 before any write: any JP(cb) block whose `[starts_at, ends_at)` overlaps the Lisbon day 30 September, whether it starts and ends that day, starts the day before, or covers it among other days. Section 2c names each by id. The read is ONE tstzrange overlap with the day, and R26 proves it on two synthetic JP(cb) blocks, one inside the day and one across it: a read that misses either refuses. The op writes no block, by the owner's ruling: the removal is his, by hand in the app |
| D10 | Added: which sets must be non-empty? | The four untouched sets stage 3 compares by md5: JP(cb)'s Castelo Branco schedule rows and past Castelo Branco appointments (R25), the clinical records on the rows the op writes, and the past twin rows it leaves alone (R27). An empty one refuses before the write. Stage 1 section 5 prints how many ruling (a) rows carry a clinical record, so a refusal here is visible before stage 2 |
| D11 | Added: what is the booking clinic of a past pair under ruling (b)? | The NESA row's own clinic (`location_id`), and the person row must sit at the same clinic. A pair to move whose two rows sit at two clinics refuses (R29), as a future one does (R18, D4): which clinic booked the session would be a guess. Section 6 prints both clinics and a `two_clinics` flag |
| D12 | Added: what if stage 3's roster check would find no real Saturday to check? | Refuses (R28) before the write, for the same reason as D10. A dated Saturday JP(lv) holds with a weekday column other than 6 is not one (Q9) |
| D13 | Added: what if a table stage 2 writes carries a trigger the system did not create? | Refuses (R30), and stage 2's P4 reads the catalog again and stops too. The tables are the three stage 2 writes: `appointments`, `availability_templates` and `audit_log`. Main has none, but production has run ahead of main before, and such a trigger would write outside the whitelist inside the committed transaction with no row count checked. Stage 1 section 4b lists any it finds |
| D14 | Added: verdict 10 on a day with nothing to retire | VACUOUS, and allowed: with no JP(cb) row inactive before the op and none retired by it, there is nothing a reactivation could be read against. Verdicts 2 to 5 are VACUOUS on that day too |
| D15 | Added: the md5 families stage 2 compares inside its own transaction | Every one goes into the audit row, digest (`md5`) and row count (`md5_rows`), and P5 prints each with OK or VACUOUS. A family a refusal already guarantees non-empty STOPS before the write if it reads empty: the appointments and schedule rows outside the op's sets and JP(cb)'s Castelo Branco rows (R25), the written appointments, their clinical records, the tenant's clinical records and the kept twin rows (R27), the tenant's users (R01), its staff installs (R03, R04). The rest may be empty on a real day and print VACUOUS without stopping: the per-ruling written sets (`h`, `x`, `fp`, `fn`) and the written schedule rows (`av_w`), empty when that action has nothing to do, and the tenant's blocks (`to`) and invoices (`inv`), which no ruling promises exist. Each of those two is a whole tenant table, so even empty its md5 still changes on the one write it could suffer, a new row |
| D16 | Added: what if JP(lv) is active but not bookable, or flagged a shared resource? | Refuses (R02). The Linda-a-Velha roster lists a practitioner only when active, bookable and not a shared resource (`apps/api/lib/appointments/store.ts`), so the moved Saturdays would never be offered and verdict 8 would FAIL after the write |
| D17 | Added: which columns of a written appointment does stage 2 hold still? | Every `appointments` column but the four the op writes (`practitioner_id`, `practitioner_2_id`, `status`, `updated_at`), `confirmation_received_at` and `confirmation_channel` included: the written-row fingerprint (`w_fixed`) is taken before the writes and compared after them, and a difference STOPS the op with nothing written. The unit test derives the column list from `packages/db/src/schema.ts` and from the migrations, which must agree, and fails when a column the op does not write is missing from either copy of that fingerprint |
| D18 | Added: can verdict 11 read 0 because its own read is wrong? | No. It is stage 1's 30 September read, byte for byte (the unit test holds all three stages to one text): ONE tstzrange overlap with the Lisbon day over `time_off` and two synthetic JP(cb) blocks. A wrong user id, a wrong day or the containment form misses a synthetic block, and 11 FAILs. JP(cb)'s blocks at any date, read now, are its second control: with none, the read has nothing to show that it sees rows, and 11 reads VACUOUS, never OK. 11 stays on the allowed-VACUOUS list, because a JP(cb) with no block at all is a real day that no ruling rules out |
| D19 | Added: what if main moves during the sitting? | The owner freezes merges to main for the sitting, and the blocks check that the freeze held. Stages 1 and 2 HALT on a moved main before they load the environment or run psql (the HEAD CHECK), so before the write a moved main writes nothing and ends the sitting. After the write, stage 3 still runs, READ ONLY, from the recorded sha, and prints both shas |
| D20 | Added: how does stage 3 know the audit row's ruling (c) lists are exact (Q7)? | Stage 2 sets `updated_at` to its transaction time on every appointment it writes, and asserts that the audit row's `created_at` is that same time. Verdicts 26 and 27 find the rows by that stamp, without the lists, and FAIL unless the rows the op cancelled are exactly the listed NESA rows and the rows it gave a practitioner_2 are exactly the listed person rows, each naming its NESA. Rulings (a) and (b) rows are set aside by their own recorded ids, because they keep whatever status and practitioner_2 they had |

## Why a twin is what it is, and why the conflict proof is inline

A twin is a pair of appointments in one tenant with the same patient, the same
`starts_at` and the same service (NULL-safe), one on a user with
`is_shared_resource` and one on a user without it. PAST means `starts_at` before
00:00 Lisbon on the run day.

**The machine hour is held by the app's own rule,** `apps/web/lib/scheduling/conflict.ts`:
`findConflicts` reads `appointment_conflicts` for the Terapeuta slot and, for a shared
resource, `secondParticipantConflicts` for the Terapeuta 2 slot. A row holds a resource
when it names it in either slot, is not `cancelled` or `no_show`, is not an unconfirmed
pedido, and overlaps. `public.appointment_conflicts` and `public.is_unconfirmed_pedido`
both filter on `jwt_tenant_id()`, which is NULL in a psql session, so called from here
they answer "nothing" and "false" for every row. Every stage therefore carries that
rule INLINE, the pedido test included (`status = scheduled` and either
`origin = patient_portal` or an `appointment_request` staff notification, 0067's body
with the tenant taken from JP(cb)'s row).

**Option a keeps the hour held.** Before the write each future pair's NESA row holds its
NESA over its own window (stage 2 P6 asserts it for every pair). After it the NESA row
is cancelled and no longer holds anything, and the person row, still live and not a
pedido, names the NESA as practitioner_2 over a window that covers the NESA window
(stage 2 A2 and stage 3 verdicts 15 to 18). A fixed window in the year 2000 is the
control: it must read 0 before and after, or the rule is not discriminating.

## The HEAD CHECK, and running from main

The op runs from `origin/main`, after its PR has merged, and the owner freezes merges
to main for the sitting. No block reads a branch, and there is no separate HEAD CHECK
to paste: the machine runs it inside the blocks, and halts on it.

- **Stage 0** refuses once stage 2 has written, checks that the apply worktree is
  clean, fetches, resolves `origin/main`, checks that sha out detached, verifies the
  sidecar and every pin, and only then records the sha in `/tmp/staff10v2-main.sha`
  and prints `running from origin/main <sha>`.
- **Stages 1 and 2 begin with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and
  written nothing. Each then checks out the RECORDED sha, never a fresh `origin/main`,
  and asserts its own file and the target guard by sha256 before it runs either.
- **Stage 1 marks its pass with the recorded sha,** and stage 2 refuses unless that
  mark names the sha it is about to run from.
- **After stage 2 has written: NEVER run stage 0, 1 or 2 again.** Each refuses once the
  written marker exists, and R08 refuses in the database regardless. **Stage 3 is READ
  ONLY** and runs from the recorded sha whatever main has done since: it prints whether
  main moved, with both shas, and never stops on it.
- **A moved main before the write ends the sitting.** Nothing is written, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/staff10v2-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the files, the pins and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/data-op-staff-10-v2.sha256
SHA1=095ffe9185b3bace41da43b39b9f46096a8a16af68ab057d0d52310c445fe15b
SHA2=a0929941d340303660eeb07e7fe1861d57ee3b6a3986781543b5266f49c5b422
SHA3=857ea80004f0227c931b2874adc155206bb42a548a51dee3045dbaf9c78f1991
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/staff10v2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run stage 0, 1 or 2 again; stage 3 runs from the sha stage 0 recorded"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/staff10v2-main.sha /tmp/staff10v2-stage1.out /tmp/staff10v2-stage1.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/staff-10-v2-1-read.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/data/staff-10-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/staff-10-v2-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-1-read.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
echo "${MAIN}" > /tmp/staff10v2-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/staff10v2-main.sha"
echo "STAFF-10 V2 FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/data-op-staff-10-v2.md: OK`, then
`running from origin/main <sha>, recorded in /tmp/staff10v2-main.sha`, then
`STAFF-10 V2 FILES VERIFIED`.** It reads no database. The sha it prints is the one
every later stage runs from.

## STAGE 1: the read

```
(
set -eo pipefail
SHA1=095ffe9185b3bace41da43b39b9f46096a8a16af68ab057d0d52310c445fe15b
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/staff10v2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run stage 1 or 2 again; stage 3 only"; exit 1; }
rm -f /tmp/staff10v2-stage1.out /tmp/staff10v2-stage1.ok
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/staff10v2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/staff10v2-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-staff-10-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/staff-10-v2-1-read.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-1-read.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-v2-1-read.sql 2>&1 | tee /tmp/staff10v2-stage1.out
grep -q 'STAFF-10 V2 STAGE 1 COMPLETE' /tmp/staff10v2-stage1.out || { echo "STOP: stage 1 did not print its COMPLETE line"; exit 1; }
RN=$(grep -cE '^[[:space:]]*R[0-9]{2}[[:space:]]*\|' /tmp/staff10v2-stage1.out || true)
[ "${RN}" = 30 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 30"; exit 1; }
REF=$(grep -E '^[[:space:]]*R[0-9]{2}[[:space:]]*\|.*\|[[:space:]]*REFUSE[[:space:]]*$' /tmp/staff10v2-stage1.out | sed -E 's/^[[:space:]]*(R[0-9]{2}).*/\1/' | tr '\n' ' ' || true)
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. The sitting stops here, and stage 2 would refuse on the same lines. Report them"; exit 1; }
RD=$(awk -F'|' 'index($1,"s10v2_run_day")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/staff10v2-stage1.out)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 read the Lisbon day as ${RD}, and this machine's Lisbon clock disagrees"; exit 1; }
echo "${REC}" > /tmp/staff10v2-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 2, 2b, 2c, 4, 4b, 6, 7 and 8 before stage 2."
)
```

**Read the output before pasting stage 2.** The HEAD CHECK prints both shas, and they
are equal or the block has already halted. Section 4 prints 30 refusals, `R01` to
`R30`; the block has already stopped if any reads REFUSE. Section 2c must list nothing:
the 30 September block is gone. Section 4b must be empty. A refusal that reads
`VACUOUS` read an empty population: that is not a refusal, and the sections above it
say which population it was. Section 2b must read `partition holds`. Sections 6, 7 and
8 are the pairs rulings (b), (c) and (d) act on, by id.

## STAGE 2: the write

```
(
set -eo pipefail
SHA2=a0929941d340303660eeb07e7fe1861d57ee3b6a3986781543b5266f49c5b422
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
NAMES=(
s10v2_run_day
s10v2_count_rcov s10v2_digest_rcov
s10v2_count_rpast s10v2_digest_rpast
s10v2_count_msat s10v2_digest_msat
s10v2_count_rphan s10v2_digest_rphan
s10v2_count_rwin s10v2_digest_rwin
s10v2_count_hjp s10v2_digest_hjp
s10v2_count_xnesa s10v2_digest_xnesa
s10v2_count_ft2 s10v2_digest_ft2
s10v2_count_fcan s10v2_digest_fcan
)

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/staff10v2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run it again; stage 3 only"; exit 1; }
[ -n "$(find /tmp/staff10v2-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not pass in this sitting, or passed over an hour ago. The sitting stops"; exit 1; }
test -f /tmp/staff10v2-stage1.out || { echo "STOP: stage 1 left no transcript. The sitting stops"; exit 1; }
[ -n "$(find /tmp/staff10v2-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded, and stage 1 must have passed on it."
test -f /tmp/staff10v2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/staff10v2-main.sha)
[ "$(cat /tmp/staff10v2-stage1.ok)" = "${REC}" ] || { echo "STOP: stage 1 did not pass on the recorded sha ${REC}. The sitting stops"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-staff-10-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/staff-10-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/staff10v2-stage1.out; }
RD=$(carry s10v2_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 ran on Lisbon day ${RD}, not today. The sitting stops"; exit 1; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}); [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: run day ${RD}, ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/staff10v2-stage2.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/staff-10-v2-2-write.sql 2>&1 | tee /tmp/staff10v2-stage2.out
touch /tmp/staff10v2-written.ok
grep -q 'STAFF-10 V2 STAGE 2 DONE' /tmp/staff10v2-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its DONE line is missing. Never run stage 0, 1 or 2 again. Paste stage 3 and report both"; exit 1; }
grep -q 'STAFF-10 V2 STAGE 2 COMMITTED' /tmp/staff10v2-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its COMMITTED line is missing. Never run stage 0, 1 or 2 again. Paste stage 3 and report both"; exit 1; }
echo "STAFF-10 V2 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the first write;
every assertion after a write raises too, and a raise inside the DO block rolls back
everything the block did. So a `STOP:` raised in the database (psql exit 3) always
means **nothing was written**, and so does every `STOP:` the block prints before psql
runs, the HEAD CHECK's included. **psql exit 0 means the COMMIT ran and the write
stands:** the block touches the written marker at once, before it reads the
transcript, and the two `STOP:` lines it can print after that point say so in their
own words. The file pins `client_min_messages = notice`, so a quieter role or database
default cannot hide the step lines. The NOTICE lines name each step: `P1` the sets,
`P2` each refusal with its control, `P3` the run day and the carries, `P4` the triggers
the system did not create (none, or it stops), `P5` the baselines and the md5 family
profile (D15), `P6` the machine hour before, `W1` to `W6` each write with its row count,
`A2` the machine hour after, and `STAFF-10 V2 STAGE 2 DONE`, then `COMMITTED` after the
COMMIT.

**psql exit 3** is every in-database STOP. An undefined carry fails before the block,
on the `set_config` statement, also with exit 3. **Any other exit** (psql exits 2 on a
lost connection, possibly during the COMMIT) stops the sitting with nothing else
pasted: stage 3 is READ ONLY, and its verdict 1 answers whether the write stands, on
the lead's call. R08 refuses a second write regardless.

## STAGE 3: the verify. READ ONLY, re-issuable

```
(
set -eo pipefail
SHA3=857ea80004f0227c931b2874adc155206bb42a548a51dee3045dbaf9c78f1991
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/staff10v2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/staff10v2-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-staff-10-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/staff-10-v2-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/staff10v2-stage3.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-v2-3-verify.sql 2>&1 | tee /tmp/staff10v2-stage3.out
grep -q 'STAFF-10 V2 STAGE 3 COMPLETE' /tmp/staff10v2-stage3.out || { echo "STOP: stage 3 did not print its COMPLETE line"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/staff10v2-stage3.out || { echo "STOP: stage 3 printed no SUMMARY row"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/staff10v2-stage3.out && { echo "STOP: a stage 3 verdict read FAIL"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/staff10v2-stage3.out || true)
[ "${NV}" = 27 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 27"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/staff10v2-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '2|3|4|5|6|10|11|12|13|14|15|16|17|18|23|24|25|26|27' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/staff10v2-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "STAFF-10 V2 VERIFIED: ${PROFILE}. The RECEPTION section above lists each future pair by id."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, no FAIL, 27
verdicts, a SUMMARY row, and VACUOUS only on arms whose set can legitimately be empty
on the day**, which the block enforces: 2 to 6 (a schedule class with nothing in it),
10 (nothing retired and no JP(cb) row inactive before, D14), 11 (JP(cb) holds no block
at all, so the read has nothing to show it sees rows, D18), 12 (the tenant holds no
block), 13 to 18 (a ruling with nothing to do), 23 (nothing written), 24 and 25 (no
practitioner_2 or no confirmed row to compare), 26 and 27 (no future pair). **Never
VACUOUS: 1, 7, 8, 9, 19, 20, 21, 22.** The four md5 comparisons (9, 19, 20, 21) are
the untouched sets, and an empty one refuses before the write (R25, R27), so after it
each of them always compares something; verdict 8's Saturday is guaranteed the same
way (R28), and its JP(lv) listing by R02. The block prints the profile; the profile
moves with the data, so no exact profile is asserted for production. After the
SUMMARY, stage 3 prints the RECEPTION section: each future pair after the write, ids
only, which stays in `/tmp/staff10v2-stage3.out` until stage 3 is pasted again.

## What every refusal and every verdict means

**Stage 1 section 4 and stage 2 P2, the same 30 lines.** `n` must be 0. `control` is
the population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | a JP row is missing, or the two JP rows are in different tenants |
| R02 | JP(lv) is inactive, not bookable, or a shared resource (D16): the roster's own user predicate |
| R03 | JP(cb) is not installed at Castelo Branco |
| R04 | JP(lv) is not installed at Linda-a-Velha |
| R05 | a Saturday to move already exists identically on JP(lv), active or not (`availability_templates_dedupe_uq`, NULLS NOT DISTINCT). Counted over the MOVE set only, so a covered Saturday no longer refuses |
| R06 | a JP(cb) block overlaps the Lisbon day 30 September. The owner removes that block in the app before the sitting, so this refuses while it is still there, whether it starts and ends on the day, starts the day before, or covers it among other days. The predicate is ONE tstzrange overlap of `[starts_at, ends_at)` with the Lisbon day, Lisbon midnight to the next Lisbon midnight. Section 2c names each block by id, Lisbon start and end, and reason. Its control is the two synthetic JP(cb) blocks the same read matches (R26) |
| R07 | the original STAFF-10 write has already run |
| R08 | this v2 write has already run |
| R09 | an active JP(cb) Linda-a-Velha row is UNCLASSIFIED, or sits in other than exactly one class. Section 2b is the partition line |
| R10 | the shared resources are not exactly the two NESA rows, both active |
| R11 | a booking clinic of a past pair to move, or of a future pair, has no installed NESA or more than one |
| R12 | an appointment at Linda-a-Velha names JP(cb) as practitioner_2 |
| R13 | a ruling (a) row already names JP(lv) as practitioner_2 |
| R14 | ruling (a) would put two overlapping confirmed rows on JP(lv) (`appointments_no_double_confirmed`, 0061). Its control is the confirmed rows ruling (a) moves: with none no collision is possible, and the line prints VACUOUS |
| R15 | ruling (b) would put two overlapping confirmed rows on one NESA row. Its control is the confirmed rows ruling (b) moves, VACUOUS as for R14 |
| R16 | a future pair's person row already has a practitioner_2 |
| R17 | a future pair's person window does not cover its NESA window |
| R18 | a future pair's NESA row is not shared, active and installed at the booking clinic, or the two rows sit at two clinics |
| R19 | a future pair's person row is an unconfirmed pedido |
| R20 | a future pair's NESA row has a clinical record, an invoice or a `pack_instance_id` |
| R21 | a future pair starts before now plus two hours |
| R22 | a future row sits in more than one live pair |
| R23 | a future pair's NESA row is an unconfirmed pedido |
| R24 | every action set is empty |
| R25 | an untouched set stage 3 compares by md5 is empty: JP(cb) has no past Castelo Branco appointment, or no Castelo Branco schedule row. Refused before the write, so verdicts 9 and 21 can never be vacuous after it |
| R26 | the 30 September read missed a synthetic JP(cb) block it must match: one from 09:00 to 20:00 on the day, one from 20:00 the day before to 09:00 the day after. A read that misses either (a wrong user id, a wrong day, the containment form) would miss a real block too, and R06 would read 0 over it. Its control is the two synthetic blocks offered |
| R27 | an untouched set stage 3 compares by md5 is empty: no row the op writes carries a clinical record, or no past twin row is left untouched. Refused before the write, so verdicts 19 and 20 can never be vacuous after it |
| R28 | the roster check would have no real Saturday: JP(lv) holds no dated Linda-a-Velha real Saturday from today (the date a Saturday and the weekday column 6, Q9) and no Saturday moves to it, so verdict 8 could not run. Refused before the write |
| R29 | a past pair ruling (b) would move has its two rows at two clinics, so which clinic booked it is a guess (D11). Its control is every past pair ruling (b) acts on |
| R30 | a table stage 2 writes (`appointments`, `availability_templates`, `audit_log`) carries a trigger the system did not create (D13). Its control is every trigger on those tables, the constraint triggers of each foreign key included, so an empty catalog read prints VACUOUS. Section 4b lists what it found |

**The classes (stage 1 section 2).** `is_dated` has one definition in every file:
`valid_from IS NOT NULL AND valid_until IS NOT NULL AND valid_from = valid_until`. It
is never NULL, so no row falls out of a class through a NULL bound; that is the defect
that made the original P5b stop on `e37ba817` while the original R8 read 0. The classes
are written as separate predicates, mutually exclusive by construction, and R09 proves
each row sets exactly one:

- `retire_covered`: dated, and JP(lv) holds an identical active row;
- `retire_past`: not covered, and its window ended before the run day;
- `move_saturday`: not covered, not ended, dated, weekday 6 **and** `extract(dow from valid_from) = 6`;
- `retire_phantom`: not covered, not ended, dated, and the weekday column is not the date's weekday;
- `retire_sat_window`: not covered, not ended, undated, weekday 6 (open-ended included);
- `UNCLASSIFIED`: none of those. Refuses.

**The carries.** For each of nine actions (`rcov`, `rpast`, `msat`, `rphan`, `rwin`,
`hjp`, `xnesa`, `ft2`, `fcan`) a count and an md5 over the action's ordered keys, plus
the Lisbon run day: 19 names, none a substring of another. The block that computes
them, between `STAFF-10 V2 SETS BEGIN` and `SETS END`, is byte-identical in stage 1
and stage 2, so a recomputed carry can only differ when the database moved. No carry
names a block: the op writes none.

**Stage 3's 27 verdicts:**

1. exactly one v2 audit row;
2. to 5. every retired id of each class is inactive;
6. every moved id is an active real Saturday on JP(lv) at Linda-a-Velha;
7. JP(cb) holds no active Linda-a-Velha row, with the control that JP(lv) holds one from today (FAIL if the control is 0);
8. on the next real Saturday JP(lv) holds a dated Linda-a-Velha row (the date a Saturday and the weekday column 6), the app's own predicates (`apps/api/lib/appointments/store.ts`: the user active, bookable and not a shared resource, as the roster reads it; the schedule row active, its weekday column the day's weekday and its window covering the day, as the slot query and the confirm guard read it) list JP(lv) (the positive control) and JP(cb) holds no active row covering that day, whatever its weekday column. The day is picked from JP(lv)'s own rows, so the schedule half of the control holds by construction; the user half does not, and a JP(lv) the roster would not list FAILs here;
9. JP(cb)'s Castelo Branco schedule rows unchanged by md5;
10. JP(cb)'s inactive rows are exactly the ones before plus the retired ones (VACUOUS when both are none, D14);
11. no JP(cb) block overlaps the Lisbon day 30 September: the owner's removal held. It is R06's read, byte for byte, with its controls: both synthetic blocks match (FAIL if not), and JP(cb)'s blocks at any date read now are above 0 (VACUOUS if not, D18);
12. `time_off` is unchanged by the op: every block of the tenant, count and md5, equals the baseline stage 2 recorded in the audit row (FAIL if not), and the same md5 less one block differs from that baseline, so the digest sees a block go (FAIL if not); VACUOUS when the tenant held no block;
13. every ruling (a) id is on JP(lv), at Linda-a-Velha, before the run day;
14. every ruling (b) id is on its recorded target, installed at its clinic;
15. and 16. every future person row names its NESA as practitioner_2, is live and covers the window; every future NESA row is cancelled;
17. the machine hour: for every future pair a live row other than the cancelled NESA row holds that NESA over the whole NESA window; the control window reads 0;
18. the therapist hour: every future person row is still live and not a pedido;
19. the clinical records on every written appointment are unchanged by md5;
20. the past twin rows no write touched are unchanged by md5;
21. JP(cb)'s past Castelo Branco appointments are unchanged by md5;
22. the appointment total, counting rows created up to the op, equals the op's before-count;
23. every written appointment carries `updated_at` at or after the op;
24. no Linda-a-Velha row names JP(cb) as practitioner_2 and no row holds JP(lv) in both slots;
25. no two confirmed rows overlap on JP(lv) or either NESA row;
26. ruling (c): the NESA rows the audit row's `f_pairs` lists are exactly the rows the op cancelled, found by the op's stamp and not by the list (D20);
27. ruling (c): the person rows it lists are exactly the rows the op gave a practitioner_2, each naming its NESA, found the same way.

**Stage 3 is re-issuable, and its answers move with the clinic.** A reception edit
after the sitting can change 12, 15 to 23, 26 and 27 honestly: a future person row
cancelled later FAILs 15, 17 and 18, and 26 or 27 with them; a block the clinic adds or
edits FAILs 12, and a JP(cb) block added on 30 September FAILs 11 too. Read a later
FAIL against the audit row's time before calling it a defect of the op.

## Rehearsal

### These files: NOT RUN YET

**PLACEHOLDER, TO BE REPLACED BY THE RE-RUN. The database rehearsal has not run on
the files this document pins, and until it has, this op is not READY-TO-APPLY.** The
throwaway container was not available to the authoring lane when these files were
written, so nothing that reads or writes a database has run on them. What has run on
these bytes: the unit test, `scripts/staff-10-v2-data-op.test.mjs`, which holds their
properties and was run red against a seeded wrong copy for each new one; and the
kit's 21 arms that need no database (stage 0 and its pins, the HEAD CHECK halts in
stages 1 and 2, the refusals on a missing or foreign stage 1 mark, the written marker,
a missing recorded sha, and stage 3's report of a moved main before its psql), run
under `zsh -f` on the commit that carries this sentence, every one exiting as wanted.

The kit for the re-run is ready in the authoring lane's scratchpad, `b7-rehearsal/`
(not committed, as for 0090 to 0093): a fixture with no 30 September block, the state
after the owner's removal; the earlier arms that still apply; a new arm for every shape
in the table below; and one runner that makes a new database per run and a simulated
origin whose `main` carries the commit under test, extracts every block from this
document, and substitutes exactly four things per block (`/tmp/`, the `cd`, the
environment line and the target guard's invocation), each counted. The re-run replaces
this placeholder with the kit's sha256s, the substitution counts, each arm's exit
against the one wanted, the happy path's stage 3 profile, and the commit it ran on.

| New arm, on the restructured files | Wanted |
|---|---|
| a JP(cb) block that starts and ends on 30 September | stage 1 exit 1, REFUSE on R06; stage 2 with the stage 1 mark forced, exit 3, `STOP: R06 refuses`; database unchanged |
| a JP(cb) block from 29 September 20:00 to 30 September 10:00 | the same, on R06 |
| a JP(cb) block across several days that covers 30 September | the same, on R06 |
| a JP(cb) block on 29 September ending 23:59 Lisbon | stage 1 exit 0, no REFUSE |
| a JP(cb) block from Lisbon midnight to Lisbon midnight on 29 September | stage 1 exit 0: the block ends where the day begins, and a range's end is exclusive |
| a JP(lv) block on 30 September | stages 1, 2 and 3 exit 0; verdict 12 OK |
| a copy of stage 1 whose 30 September read names JP(lv), then a copy with the containment form | stage 1 exit 1, REFUSE on R26; stage 2 from the same copy, exit 3, `STOP: R26 refuses` |
| the happy path, no block, pasted as an interactive zsh reads it | stages 0 to 3 exit 0; the fixture's blocks equal by md5 before and after; stage 3 every verdict OK |
| main moved between stage 0 and stage 1 | stage 1 exit 1, `STOP: main moved since stage 0`, before psql; database untouched |
| main moved between stage 1 and stage 2 | stage 2 exit 1, the same STOP, before psql; nothing written |
| main moved after stage 2 | stage 3 exit 0 from the recorded sha, `MAIN MOVED since stage 0` with both shas |
| main carries a stage file that is not its pin | stage 0 exit 1, `STOP: stage 1 on disk is not the approved file`; no sha recorded |
| the worktree's copy of a pinned file edited after stage 0 | stage 1 exit 1, `STOP: the apply worktree is not clean` |
| stage 1 passed on another recorded sha | stage 2 exit 1, `STOP: stage 1 did not pass on the recorded sha` |
| stage 0 again after the write | exit 1, `STOP: stage 2 has ALREADY WRITTEN` |
| after the write, a JP(cb) block added on 30 September | stage 3 exit 1, FAIL on 11 and 12 |
| after the write, a block of the tenant edited | stage 3 exit 1, FAIL on 12 |
| after the write, a live appointment cancelled with the op's stamp | stage 3 exit 1, FAIL on 26 |
| after the write, a row given a practitioner_2 with the op's stamp | stage 3 exit 1, FAIL on 27 |
| JP(cb) holds no block at all | stages 1, 2 and 3 exit 0, verdict 11 VACUOUS, which the block allows |

The DB-gated suite `apps/web/lib/scheduling/staff-10-v2-option-a-conflict.db.test.ts`
is unchanged but for its comments: the op is no longer called held, and the two ruling
(c) writes it repeats carry their new numbers, `W5` and `W6`. CI's DB Tests job runs it.

### The previous files, at `8e65d777`, kept as history

**Not evidence for these files.** Everything below was measured on the op as it stood
at `8e65d777`: its stage 2 removed the 30 September block itself (its write `W3`, so its
later writes were `W4` to `W7`, now `W3` to `W6`) and refused a longer one (the old
R26); it carried a `dblk` carry and copied the block into the audit row (the old
verdicts 11 and 12); and every block took its head from the op's branch. It stays as the
record of the arms the re-run carries forward for the shapes that did not change.

**Where it ran.** The throwaway container `supabase_db_OsteoJP-solo-rehearsal`
(Postgres 17, `127.0.0.1:55522`), never an existing database: each run makes a NEW one,
`CREATE DATABASE <run> TEMPLATE s10v2_schema`. `s10v2_schema` is a copy of the
container's `reh93_base` (production's schema at 0092, from the 0093 rehearsal) with
main's `0093_patient_rgpd_acceptances.sql` applied and its journal row added, and every
public table then emptied, so the only rows in a run database are the fixture's.

| Fingerprint of a run database | Value |
|---|---|
| drizzle journal: entries, and md5 over the sha256 of every migration file in journal order | `91 139cb96adcdf063d9c6a8613f77503a8`, equal to main's migration files at `f4e892cd` (MATCH) |
| public tables / policies | 48 / 95 |
| appointment rows before the fixture loads | none |

**The fixture is synthetic.** No real patient data; staff, resource and clinic ids are
production's (already on main), every other id starts `5f10`. It has every shape the
op meets: one active JP(cb) Linda-a-Velha row per class (a covered 26 September
Saturday, two dated real Saturdays to move, a phantom dated Wednesday with weekday 6,
an open-ended Saturday window from 28 November, a recurring Saturday window, a past
dated Monday and a past dated Saturday) plus one already inactive; JP(cb)'s Castelo
Branco rows; JP(lv)'s own Saturday and Wednesday rows; a JP(cb) block that starts and
ends on 30 September and two other Wednesday blocks; past JP(cb) Linda-a-Velha
appointments including one with a clinical record, a list A pair and a confirmed row
next to a JP(lv) row that a refusal arm turns into a confirmed overlap; a JP(cb)
Linda-a-Velha row later on the run day itself, dated from the day the rehearsal runs,
so it is never past and stays on JP(cb); JP(cb)'s past Castelo Branco appointments, one
with an invoice; a confirmed NESA(cb) row booked at Linda-a-Velha (so R15 reads a
confirmed mover) and a NESA(lv) row booked at Castelo Branco, both past; past pairs at
home, one whose person row is JP(cb) at Linda-a-Velha; future pairs with both rows live;
a future pair with the NESA side already cancelled; a near miss with no service on one
side; both NESA rows flagged and installed. It is reset BY ID between arms, in FK
order, whoever wrote the rows, and its shape is read back after every reset. Five more
shapes come from an arm rather than the fixture, so the other arms keep theirs: a past
pair whose person row is JP(cb) at Linda-a-Velha and whose NESA row is NESA(cb) booked
there, that NESA row twinned with a second person row as well (Q3); a ruling (b) pair
whose person row sits at the other clinic (R29); a trigger the system did not create
(R30, dropped again by the reset); a JP(cb) Linda-a-Velha schedule with nothing to
retire and no row inactive (verdict 10); and a tenant with no invoice and no confirmed
row among the ones rulings (a) and (b) move (arm W). Review round 3 adds three more:
JP(lv)'s dated Saturdays carrying weekday column 5 with no Saturday moving (R28), the
same weekday column after the write with the moved Saturdays shifted into the past
(verdict 8), and JP(cb)'s other blocks of that fortnight removed after the write
(verdict 11).

| File, in the authoring lane's scratchpad (not committed, as for 0090 to 0093) | sha256 |
|---|---|
| `rehearsal/fixture.sql` | `e54fd110c5e5f92b6181e038976126534d98e27c25abc9502fa265c8096328f7` |
| `rehearsal/reset.sql` | `74d74fe72c1f33fe014ff563db5c0e43c187c049cf05c29c70dabe32dd6b055b` |
| `rehearsal/arms/*.sql`, one mutation per arm, concatenated in name order | `690677242df07156480eff39bc3ed7fde36638120494c866ccc33a4fc66e6949` |
| `rehearsal/run-s10v2-arms.zsh`, the arms runner | `5efd7130b778bd3d170fd88f14fc6ef24a4525433b72a8d5776f0434c6efc2d2` |
| `rehearsal/extract-stage.mjs`, a byte copy of `/Users/ivan/osteojp-handover/extract-stage.mjs` | `f82cad1e6e8cc1be3b7c491fff787138161e0f079b6424119329d71c63d72198` |

**How it ran.** Each block was extracted from this document at the pushed branch head
(cloned from a private bare origin holding the branch) and run under `zsh -f`; the
happy path ran as an interactive paste, `zsh -f -i < block`. Exactly four
substitutions, each counted per block: `/tmp/` to a scratch directory, the `cd` line to
the clone, the env line to the run database's URL, and the target guard's invocation to
an `echo`. The extractor refuses a block that still names production.

| Substitution | stage 0 | HEAD CHECK | stage 1 | stage 2 | stage 3 |
|---|---|---|---|---|---|
| `/tmp/` | 0 | 0 | 9 | 10 | 8 |
| `cd` | 1 | 1 | 1 | 1 | 1 |
| env | 0 | 0 | 1 | 1 | 1 |
| guard | 0 | 0 | 1 | 1 | 1 |

**The happy path, pasted interactively:**

| Arm | Exit | What it printed |
|---|---|---|
| HEAD CHECK | 0 | the head |
| stage 1 | 0 | every refusal line OK, none VACUOUS (R14 and R15 each read a confirmed mover); `partition holds`; `STAGE 1 READ, NO REFUSAL` |
| HEAD CHECK | 0 | the same head |
| stage 2 | 0 | P3 the run day and all 21 carries match; P4 no trigger the system did not create; P5 every md5 family OK, none empty; P6 the machine hour held by each future pair's NESA row, control window 0; W1 to W7 each with its row count equal to its set; A2 the machine hour held by each person row over the whole NESA window, no cancelled NESA row still holding, the therapist hour held, control window 0; `DONE`, `COMMITTED`; the audit row's `md5` and `md5_rows` objects each name every family P5 printed |
| stage 3 | 0 | `25 OK / 0 VACUOUS / 0 FAIL`, then the RECEPTION section by id. Verdict 8 reads `JP(lv) 1` on 26 September: only the dated Saturday, since JP(lv)'s Wednesday window no longer counts (round 2 read 2). Verdict 11 reads `0 / control 1 of 1 recorded, 2 read now` |

**Every refusal, run for real.** For each arm: reset, one mutation, stage 1 (must exit 1
with REFUSE on the code), then the stage 1 marker forced so stage 2's SQL is reached
(must exit 3, `STOP: <code> refuses`), then the database compared with its state
after the mutation by one md5 over appointments, schedule rows, blocks, audit rows and
users.

| Code | Mutation | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|---|
| R01 | JP(lv) moved to a second tenant | 1 | R01 | 3, STOP R01 | unchanged |
| R02 | JP(lv) inactive | 1 | R02 | 3, STOP R02 | unchanged |
| R02 | JP(lv) active but not bookable | 1 | R02 | 3, STOP R02 | unchanged |
| R03 | JP(cb)'s Castelo Branco install removed | 1 | R03 | 3, STOP R03 | unchanged |
| R04 | JP(lv)'s Linda-a-Velha install removed | 1 | R04 | 3, STOP R04 | unchanged |
| R05 | an INACTIVE JP(lv) copy of a Saturday to move | 1 | R05 | 3, STOP R05 | unchanged |
| R06 | a second JP(cb) block on 30 September | 1 | R06 | 3, STOP R06 | unchanged |
| R07 | the original STAFF-10 audit row | 1 | R07 | 3, STOP R07 | unchanged |
| R08 | a v2 audit row | 1 | R08 | 3, STOP R08 | unchanged |
| R09 | a future dated Tuesday on JP(cb) at Linda-a-Velha | 1 | R09 | 3, STOP R09 | unchanged |
| R10 | NESA(cb) not flagged | 1 | R10 and R11 (its consequence) | 3, STOP R10 | unchanged |
| R11 | NESA(cb) also installed at Linda-a-Velha | 1 | R11 | 3, STOP R11 | unchanged |
| R12 | a Linda-a-Velha row with JP(cb) as practitioner_2 | 1 | R12 | 3, STOP R12 | unchanged |
| R13 | a ruling (a) row with JP(lv) as practitioner_2 | 1 | R13 | 3, STOP R13 | unchanged |
| R14 | the JP(lv) row next to a confirmed ruling (a) row made confirmed | 1 | R14 | 3, STOP R14 | unchanged |
| R15 | a ruling (b) row confirmed, and a confirmed NESA(lv) row over it | 1 | R15 | 3, STOP R15 | unchanged |
| R16 | a future person row given a practitioner_2 | 1 | R16 | 3, STOP R16 | unchanged |
| R17 | a future person row cut to one minute | 1 | R17 | 3, STOP R17 | unchanged |
| R18 | a future NESA row moved to NESA(cb), not installed there | 1 | R18 | 3, STOP R18 | unchanged |
| R19 | an `appointment_request` notification on a future person row | 1 | R19 | 3, STOP R19 | unchanged |
| R20 | an invoice on a future NESA row | 1 | R20 | 3, STOP R20 | unchanged |
| R20 | a pack session on a future NESA row | 1 | R20 | 3, STOP R20 | unchanged |
| R20 | a clinical record on a future NESA row | 1 | R20 | 3, STOP R20 | unchanged |
| R21 | a future pair moved to start in one hour | 1 | R21 | 3, STOP R21 | unchanged |
| R22 | a second person row on a future pair | 1 | R22 | 3, STOP R22 | unchanged |
| R23 | an `appointment_request` notification on a future NESA row | 1 | R23 | 3, STOP R23 | unchanged |
| R24 | every action already done by hand | 1 | R24 and R27 (its consequence: with nothing written, no written row carries a record) | 3, STOP R24 | unchanged |
| R25 | JP(cb)'s Castelo Branco schedule rows removed | 1 | R25 | 3, STOP R25 | unchanged |
| R26 | the 30 September block replaced by one from 29 September to 1 October | 1 | R26 | 3, STOP R26 | unchanged |
| R27 | the clinical records on the rows the op writes removed | 1 | R27 | 3, STOP R27 | unchanged |
| R27 | every past twin row the op leaves alone removed | 1 | R27 | 3, STOP R27 | unchanged |
| R28 | JP(lv)'s dated Saturdays and every Saturday that would move removed | 1 | R28 | 3, STOP R28 | unchanged |
| R28 | JP(lv)'s dated Saturdays given weekday column 5, and no Saturday moving (round 3) | 1 | R28 | 3, STOP R28 | unchanged |
| R29 | the person row of the Linda-a-Velha ruling (b) pair moved to Castelo Branco | 1 | R29 | 3, STOP R29 | unchanged |
| R30 | a no-op `AFTER UPDATE` trigger created on `appointments` | 1 | R30 | 3, STOP R30 | unchanged |

R26's control: the same 30 September block stored the way the app stores a whole day, Lisbon midnight to the next Lisbon midnight, gives stage 1 exit 0 with no REFUSE, and section 2c marks it `deleted_by_stage_2 = true`.

**The handshake, the clock, the order and the instrument:**

| Arm | Exit | Halted on, or printed | Database after |
|---|---|---|---|
| stage 2 before stage 1 | 1 | `stage 1 did not pass in this sitting` | untouched |
| stage 0 | 0 | `STAFF-10 V2 FILES VERIFIED` | untouched |
| stage 0 on a dirty tree | 1 | `the apply worktree is not clean` | untouched |
| stage 2 with one digest altered in stage 1's transcript | 3 | `carry s10v2_digest_msat reads ... and stage 1 printed ...` | unchanged |
| stage 2 with stage 1's run day set to yesterday | 1 | the block: `stage 1 ran on Lisbon day ..., not today` | unchanged |
| the stage 2 file run directly with yesterday's run day | 3 | the database: `stage 1 ran on Lisbon day ..., and today is ...` | unchanged |
| stage 2 with stage 1's transcript backdated 61 minutes | 1 | `over an hour old` | unchanged |
| stage 2 with the stage 1 marker removed | 1 | `stage 1 did not pass in this sitting` | unchanged |
| the stage 2 file run with no carry at all | 3 | a syntax error on the `set_config` statement, before the block | unchanged |
| stage 2 after a new future pair was added between stage 1 and stage 2 | 3 | `carry s10v2_count_fcan reads ... The database moved since stage 1` | unchanged |
| stage 2 with a trap that fails the audit insert, the last step after every write (a `NOT VALID` CHECK constraint on `audit_log`) | 3 | all seven write notices printed, then `violates check constraint` | **unchanged**: every write rolled back, no audit row |
| stage 2 again after the write | 1 | `stage 2 has ALREADY WRITTEN in this sitting` | written once |
| stage 1 again after the write | 1 | the same | written once |
| stage 1 after the write, marker removed | 1 | REFUSE on R08, R24 and R27 | written once |
| stage 2 after the write, markers forced | 3 | `STOP: R08 refuses` | written once |
| stage 3 with a retired covered row switched back on | 1 | FAIL on 2, 7, 8 and 10 | restored |
| stage 3 with a future person row cancelled | 1 | FAIL on 15, 17 and 18 | restored |
| stage 3 restored | 0 | `25 OK / 0 VACUOUS / 0 FAIL` | |
| stage 3 with every dated JP(lv) Saturday, its own and the moved ones, shifted to a past Saturday | 1 | no FAIL; `VACUOUS on 8, which the op never allows to be vacuous` | restored |
| stage 3 restored again | 0 | `25 OK / 0 VACUOUS / 0 FAIL` | |
| stage 3 with JP(lv) made not bookable, its Saturday rows standing | 1 | FAIL on 8 only: JP(lv) reads 0 on the Saturday | restored |
| stage 3 restored a third time | 0 | `25 OK / 0 VACUOUS / 0 FAIL` | |
| the whole op on a fixture with no 30 September block | 0, 0, 0 | stage 3 `23 OK / 2 VACUOUS / 0 FAIL`, VACUOUS on 11 and 12, which the block allows | written |
| a write inside the READ ONLY form stages 1 and 3 use | 1 | `cannot execute CREATE TABLE in a read-only transaction` | no table |

**Review round 1, each finding run for real:**

Round 1 also ran an arm for question Q3, on a build that moved that NESA row; round 2
conformed the build to the written default, and its arm below replaces that one.

| Arm | Exit | What it printed | Database after |
|---|---|---|---|
| verdict 10: stages 1, 2 and 3 with nothing to retire and no JP(cb) row inactive | 0, 0, 0 | verdict 10 observed 0, expected 0, VACUOUS (it read OK before this round); VACUOUS on 2, 3, 4, 5 and 10, which the block allows | written |
| a database whose default hides NOTICEs: stage 1, then stage 2 | 0, 0 | every step line, `DONE` and `COMMITTED`, because the file pins `client_min_messages` | written once |
| negative control: the stage 2 file with only its pin line removed, run directly on that database | 0 | no step line and no `DONE`, but `COMMITTED`: the write committed unseen, the case the block's post-psql lines now name | written once |

**Review round 2, each finding run for real:**

| Arm | Exit | What it printed | Database after |
|---|---|---|---|
| Q3: stage 1 on the fixture plus the pairs of question Q3 | 0 | section 6 lists no pair of NESA row 50; section 8 lists both of its pairs, `nesa_installed_there = false`, `person_row_moved_by_a` true on the JP(cb) person row and false on the other | untouched |
| Q3: stage 2, then stage 3 | 0, 0 | `25 OK / 0 VACUOUS / 0 FAIL` | NESA row 50 still on NESA(cb), person row 51 on JP(lv), person row 52 on its own therapist; the audit row has row 50 in `keep_ids` and in both of its `p_pairs`, not in `x_pairs`, and row 51 in `h_ids` |
| W: no invoice and no confirmed mover: stages 1, 2 and 3 | 0, 0, 0 | R14 and R15 VACUOUS, control 0 (OK with a control above 0 on the happy path); P5 `inv 0 VACUOUS`, every other family OK; stage 3 `25 OK / 0 VACUOUS / 0 FAIL` | written |
| R02 on a JP(lv) that is active but not bookable, and verdict 8 on one made not bookable after the write | as in the tables above | | |
| negative control: the unit test's four new round 2 tests against the round 1 files | | all four fail; all four pass on this head | |

**Review round 3, each finding run for real.** Each fix has an arm that passes on the
round 2 files and fails on this head. The runner reads the round 2 files out of the
rehearsal clone at the round 2 commit (`a02bbde2`) and checks them against round 2's own
three pins (MATCH) before any arm runs. Each file is run through this document's own
stage block with only its SQL file and that file's pin swapped (the pin once, the path
three times, both counted), so the block's own checks decide the exit on both sides.
Each copy that carries a defect differs from its source by one line, and the runner
prints that count.

| Arm | Round 2 file | This head | Database after |
|---|---|---|---|
| R28, stage 1: JP(lv)'s dated Saturdays carry weekday column 5 and no Saturday moves | 0: R28 OK, no REFUSE | 1: REFUSE on R28; stage 2 with the marker forced, 3: `STOP: R28 refuses` (the refusal table above) | unchanged |
| verdict 8, stage 3 after the write: JP(lv)'s own dated Saturdays carry weekday column 5, and the moved ones are shifted to past Saturdays | 0: verdict 8 OK, `JP(lv) 2` on 26 September, a day the app would not offer JP(lv) | 1: `VACUOUS on 8, which the op never allows to be vacuous`: no Saturday from today is one the app would offer | restored; stage 3 0, verdict 8 `JP(lv) 1` |
| verdict 11, stage 3 after the write, a copy whose `time_off` read names JP(lv) in place of JP(cb) | 0: verdict 11 OK, observed 0 | 1: FAIL on 11, `0 / control 0 of 1 recorded, 0 read now` | untouched (READ ONLY) |
| verdict 11, a copy with the containment form (starts before 30 September and ends after it) in place of the overlap form | 0: verdict 11 OK, observed 0 | 1: FAIL on 11, `0 / control 0 of 1 recorded, 2 read now` | untouched |
| verdict 11, after the write JP(cb)'s other blocks of that fortnight removed | 0: verdict 11 OK | 0: verdict 11 VACUOUS, which the block allows (D18); `24 OK / 1 VACUOUS / 0 FAIL` | restored; stage 3 0, verdict 11 OK |
| the written-row fingerprint: a copy of stage 2 whose W6 also sets `confirmation_channel` | 0: `STAFF-10 V2 WRITTEN`, and both future person rows carry the stray value: the change committed unseen | 3: `STOP: a written appointment changed in a column this op does not write` | round 2: written; this head: unchanged, no audit row, no stray value |
| the same, with W6 also setting `confirmation_received_at` | 0: `WRITTEN`, both person rows carry it | 3: the same STOP | the same |
| negative control: the unit test's three new round 3 tests against the round 2 files | all three fail | all three pass | |

The full runner at this round's head ran 140 arms, and every one exited as wanted.

**What the rehearsal caught.** The first full run had no R25. On a fixture with no past
JP(cb) Castelo Branco appointment, stages 1 and 2 passed and wrote, and only stage 3,
after the write, stopped on VACUOUS 21. A comparison set that is empty proves nothing,
and learning that after the write is too late, so R25 now refuses it in stage 1 and in
stage 2 before any write. The unit test caught two post-write checks that tested
`valid_from = valid_until` without the NULL guards; both now use the one NULL-safe form.
In review round 1, R30 caught the rehearsal's own trap: the arm that fails the audit insert
used to be a trigger on `audit_log`, and the first round 1 run stopped it on R30 before
the first write, with no write notice printed, so the arm no longer proved the rollback.
The trap is now a CHECK constraint, which R30 does not read and which fails the same
insert after every write.

**The app's own conflict check, on a real database.**
`apps/web/lib/scheduling/staff-10-v2-option-a-conflict.db.test.ts` seeds a twin, applies
stage 2's two ruling (c) writes to it, and books through `createAppointment` (so
`findConflicts`, under `runScoped` with RLS). Against a throwaway cloned from
`s10v2_schema`: **5 passed**: before the rewrite the NESA row holds the NESA hour; after
it a booking of NESA as Terapeuta, and a booking naming NESA as Terapeuta 2, are both
refused, and the therapist's own hour is still held; the negative control (the NESA row
cancelled without the Terapeuta 2 write) frees the hour and the booking succeeds.
**Negative control on the suite:** a copy with the practitioner_2 write removed fails
exactly the two NESA-hour arms and passes the other three. The suite is new, so
`.github/scripts/assert-rls-executed.mjs` covers it through its derived pass: it must
execute in the DB Tests job, and a skip there would read RED because it has no
`PERMITTED_SKIPS` entry. **Round 3:** re-run against a new throwaway cloned from
`s10v2_schema`: **5 passed**. Two earlier attempts in this round stopped on vitest's
10 s hook timeout, one in `afterAll` after all five tests had passed and one in
`beforeAll` before any ran, while the machine's load average stood above 40 (a first connection to a new
database was measured at 18 s). The passing run raised `--hookTimeout` and
`--testTimeout` on the command line for that sitting, changed no file, and finished in
5 s.

**At `8e65d777` the pushed tree was the rehearsed tree:** the last full run of that
runner extracted every block from the commit that carried that section, sidecar
included.

## Undoing it

Not authored here, and exact if it is ever wanted: the audit row carries every retired
and moved schedule id, every ruling (a) id, every ruling (b) id with its from and to
NESA, and every ruling (c) pair with its NESA. The op writes no `time_off` row, so it
leaves no block to restore: the 30 September block was removed by the owner in the app
before the sitting, and putting it back would be his own edit there. An undo would
need its own authoring, rehearsal and ruling.

## What this does NOT do

- **It writes no clinical record and moves no authorship.** `clinical_records` is
  compared by md5 inside stage 2 and again by stage 3.
- **It sends nothing.** A raw status write emits no staff notification and no patient
  message, and the reminder dispatcher sends only for `scheduled` or `confirmed`
  (`REMINDABLE_STATUSES`, `apps/web/lib/reminders/dispatch.ts`), so a reminder already
  queued for a cancelled NESA row is dropped when it wakes.
- **It does not touch JP(cb)'s future Linda-a-Velha appointments.** They stay on
  JP(cb) and are reception's.
- **It writes no block.** No stage writes `time_off`, and no stage file holds a DELETE,
  DROP or TRUNCATE statement. The 30 September block is the owner's to remove in the
  app before the sitting; the op refuses while it is there and leaves every other
  JP(cb) block as it is.
- **It does not add a database table** for provenance: the listing and the audit row are it.
