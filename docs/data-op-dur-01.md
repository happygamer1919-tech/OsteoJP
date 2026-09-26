# DUR-01: one data op for the importer's one-minute future appointments

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no journal
entry. Four blocks, each pasted whole, on its own and in order: stage 0 (the files and
the head it runs from), stage 1 (measure), stage 2 (write) and stage 3 (verify). One
rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 2 has committed, a post-commit STOP
still stops the sitting: the write stands, and stage 3 (READ ONLY) runs only on the
owner's or the lead's word. The only onward path from stage 2 to stage 3 is exit 0
with the line "DUR-01 WRITTEN. Paste stage 3 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**It runs AFTER STAFF-10 v2 (#1444), by the owner's ruling, with a fresh stage 1 on its
own run day.** Stage 1 and stage 2 refuse (R11) while STAFF-10 v2's audit row, action
`staff.staff10_v2.apply`, is absent from the population's tenant.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings,
on the owner's dispatch naming the three stage files below by filename (`CLAUDE.md`,
"Who applies migrations"). The authoring lane runs these blocks against a throwaway
database and against nothing else; the section "Rehearsed on a throwaway database"
says what has run on these exact bytes.

| Fact | Value |
|---|---|
| Card | `DUR-01`. NEW: it is on no ruled Tier C list (`CLAUDE.md`, "SOLO's record"), and it rewrites production rows outside STAFF-10, which the TIERS place in D. The owner has ruled on what it writes and when (the two rows below) |
| Ruling, owner, 2026-09-24, paraphrased | a new data op: measure the future appointments the Fisiozero importer wrote with a one-minute duration, then author the write that gives them their service's default duration |
| Rulings, owner, 2026-09-26, paraphrased | (1) write the WRITE set at each service's default duration; (2) the NESA twins are STAFF-10 v2's, and this op does not write them; (3) the rows outside the therapist's hours and the rows over a block go to reception, and this op does not write them; (4) the rows that are not live stay untouched; (5) this op runs after STAFF-10 v2, with a fresh stage 1 on its own run day, and stage 1 and stage 2 refuse while STAFF-10 v2 has not run, with a control; (6) stage 3 proves the durations, and proves that no other column moved by one md5 over the written rows' untouched columns and one md5 over every other appointment of the tenant, each against the baseline stage 2 records, each with a control that can fail; (7) it runs from `origin/main` after its PR merges, the way STAFF-10 v2 does |
| Runs from | `origin/main`, after this op's PR has merged. The owner freezes merges to main for the sitting. Stage 0 records the sha `origin/main` resolves to in `/tmp/dur01-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stages 1 and 2 HALT if `origin/main` has moved since (the HEAD CHECK, below) |
| Stage 1 | `scripts/data/dur-01-1-measure.sql`, READ ONLY, sha256 `0bf5fca17b9c29e5a202c1ee1f8b054250bbebeb46e8c1e42c52744e3cf7f5dc` |
| Stage 2 | `scripts/data/dur-01-2-write.sql`, ONE DO block in ONE transaction, sha256 `e571291a11564c2648836e4f3d7303560eefe54a23805f8b1d9baf35e59206f0` |
| Stage 3 | `scripts/data/dur-01-3-verify.sql`, READ ONLY, 23 verdicts and a SUMMARY row, sha256 `71de3658ba89fcaf319f79fe1a33959f8b907d396e6c3ca58c713dae4628a335` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, the only other program a block runs; it imports nothing |
| This document | `docs/data-op-dur-01.md`, pinned by `docs/data-op-dur-01.sha256` and asserted by every stage; GREEN's dispatch names its sha256 as well |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `appointments.ends_at`, set to `starts_at` plus the service's `duration_min`, and `appointments.updated_at`, set to the op's clock, on the rows stage 1 classifies WRITE and on no other; ONE `audit_log` row, action `staff.dur01.extend_import_duration` |
| What no stage touches | every other column of those rows (status, start, both participants, service, room, confirmation, pack, notes), every other appointment, and every other table: `time_off`, schedule rows, reminders, invoices, clinical records. Stage 2 compares the written rows' other columns and every other appointment in the tenant by md5 inside its own transaction and records both baselines in its audit row; stage 3 compares them again (verdicts 10 and 23) |
| Ids the stage files name | four, and no other: the two staff rows of JP, the one person the tenant holds twice (JP(cb) `54d486e0-a9c3-4c82-acac-8b909ce5a2d0`, JP(lv) `0c1a0000-0000-4000-8000-000000000001`), and the two clinics that are their own (Castelo Branco `de000002-0000-0000-0000-000000000002`, Linda-a-Velha `de000002-0000-0000-0000-000000000001`). They are `JP_CB`, `JP_LV`, `CB` and `LV` of `packages/db/scripts/staff-11-jp-one-clinic-check.mjs` on `main`, and the unit test holds them equal |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/data-op-dur-01.sha256` and every stage checks
it with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the
same head as the document, so a main that moved to a new document and a new sidecar
together would pass that check: GREEN's dispatch names this document's sha256, and the
HEAD CHECK halts on any moved main.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document, and
`scripts/dur-01-data-op.test.mjs` holds the other rules).

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

## The owner's rulings of 2026-09-26, and what the files do with each

Paraphrased, no counts. They replace the question block this document carried until
then (options a, b and c), and they rule option (a).

| # | Ruling, paraphrased | What the files do |
|---|---|---|
| 1 | Write the WRITE set at each service's default duration | Stage 2's W1 sets `ends_at` to `starts_at` plus the row's own service's `duration_min`, on the rows stage 1 classifies WRITE and on no other, only while each still lasts one minute and is live, its row count asserted |
| 2 | The NESA twins are STAFF-10 v2's; this op does not write them | Verdict 08 holds every twin, its partner read in any status. STAFF-10 v2's ruling (c) cancels each live future twin's NESA row and gives its person row the NESA as Terapeuta 2 (its W5 and W6), so run after it the NESA stubs of those pairs read `01 NOT LIVE`, and a one-minute person row whose partner it cancelled still reads 08 |
| 3 | The rows outside the therapist's hours and the rows over a block go to reception; this op does not write them | Verdicts 11 and 13. Section 6 lists each with every reason and the other row's or block's id and window, section 9 prints the evidence the code cannot give (who made the block, whether the series is real), and stage 3's RECEPTION section lists them again after the write |
| 4 | The rows that are not live stay untouched | Verdict 01, never written; stage 3 verdict 18 proves every held row still lasts one minute |
| 5 | This op runs after STAFF-10 v2, with a fresh stage 1 on its own run day; stage 1 and stage 2 refuse while STAFF-10 v2 has not run, with a control | R11 in the BASE: stage 1 prints it in section 8 and its block stops on it; stage 2 raises it in P2 before any write. Its control is STAFF-10 v2's audit rows in the population's tenant, at least 1 once it has run. The fourth carry still refuses a STAFF-10 v2 row that lands between stage 1 and stage 2. Stage 1 runs on stage 2's own Lisbon day (the block and the database both check) |
| 6 | Stage 3 proves the durations and that no other column moved, each md5 against stage 2's baseline, each with a control that can fail | Verdicts 4, 5 and 6: every written row ends at its recorded end and at its start plus its service's default, read now, and none lasts one minute. Verdict 10: the written rows' untouched columns, count and md5 against the audit row's baseline. Verdict 23: every other appointment of the tenant, whole, count and md5 against its baseline. For 10 and 23 the control is the same md5 with one row left out, which must differ from the baseline, or the verdict FAILs |
| 7 | It runs from `origin/main` after its PR merges, the way STAFF-10 v2 does | The section "The HEAD CHECK, and running from main" and the four stage blocks |

**Carried forward, not re-ruled: JP's two staff rows (ADDED DEFAULT, review round 2).**
JP is one person the tenant holds as two staff rows, JP(cb) for Castelo Branco and
JP(lv) for Linda-a-Velha, and the app's booking rule reads them as two therapists.
Built: a one-minute row on JP(cb) at Linda-a-Velha (or on JP(lv) at Castelo Branco) is
never written, it goes to reception (verdict 18), because STAFF-10 v2 leaves JP(cb)'s
Linda-a-Velha rows from its run day on for reception; and every other JP row is held
when the other staff row has a booking or a block over its extended hour (verdicts 12
and 13, arm `same_person`), so no write books JP twice. A different ruling changes the
files, their pins and the rehearsal.

## The defaults this op is built to

Each default is what the files do today. A different ruling changes the files, their
pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | Which rows are in scope? | Every appointment the importer wrote, found by its ledger row (`migration_staging_rows`: source `fisiozero`, entity `appointment`, status `imported`, `imported_entity_id`), lasting exactly one minute and starting now or later. Not `origin` (the importer writes the default, `staff`) and not `created_at` |
| Q2 | What is the service's default? | `services.duration_min` of the row's own service, the value the staff drawer takes when a service is picked (`apps/web/app/agenda/appointment-drawer.tsx`, `applyService`). It is one value per service; no clinic or therapist carries its own |
| Q3 | Which checks hold a row? | **Every check reception's own duration change would refuse without "Guardar mesmo assim"** (`rescheduleAppointment`, `apps/web/lib/scheduling/actions.ts`) that reads the row rather than the person making the change: SCHED-17, a NESA booked only at a clinic where it is installed (`sharedResourceLocationAllowed`, which refuses every role, the owner included, and which the reschedule asks before any check on the window); the therapist's hours (RB-03); the clinic's midday closure (0085); the clinic's start window (AGENDA-2100); and the booking conflicts (therapist, room, and a NESA resource as Terapeuta or as Terapeuta 2) and blocks. Plus six the app's reschedule does not check: a NESA twin, the same patient booked elsewhere, two one-minute rows that would collide once both are extended, the NESA hour a live twin's person row holds (verdict 17), a booking or block on JP's other staff row (arm `same_person` of verdicts 12 and 13, and verdict 14 between two stubs), and a JP row at the other row's clinic (verdict 18). **Not read, because a data op has no actor:** the two checks on the person making the change, STAFF-02's own clinics and SCHED-17's actor condition; the owner passes both. **ADDED DEFAULT:** the ruling of 2026-09-24 named the closure, bookings, blocks, the same patient and the twin. SCHED-17, the therapist's hours and the start window are added because the app's reschedule enforces each outside the override, so reception could not make the change herself; verdict 17 and the JP checks are added so no write double-books a NESA or JP |
| Q4 | A row that starts later on the run day? | Held (verdict 07), for reception. Stage 2 writes only rows starting from 00:00 Lisbon tomorrow, so the write set cannot move between stage 1 and stage 2 on the same day as starts pass |
| Q5 | A future row already `completed`? | Held (verdict 02). It is the DATA-future card's, not this op's |
| Q6 | A row with no service, or a service of one minute? | No service: held for reception (03), who can pick one. A one-minute service: left alone (04), the row already lasts its default |
| Q7 | Two ledger rows for one appointment, or a source row that does not read as one minute? | Held as findings (05, 06). The source duration is computed from the `inicio` and `fim` keys only, and only when both parse as the importer's own form on the same date |
| Q8 | `updated_at`? | Set to the op's clock on every written row, and the value before is kept in the audit row. NESA-SPLIT left it alone; this op sets it because the row did change and the app sets it on every edit |
| Q9 | When does stage 2 run? | **Outside clinic hours.** It locks `appointments` (SHARE ROW EXCLUSIVE) and `time_off`, `availability_templates`, `staff_notifications` (SHARE) for the seconds the transaction lasts, so no booking lands mid-write. A booking already in flight holds a lock; stage 2 waits five seconds for it and STOPS cleanly |
| Q10 | The order with STAFF-10 v2? | **Ruled by the owner on 2026-09-26: STAFF-10 v2 first.** R11 refuses this op in stage 1 and in stage 2 until STAFF-10 v2's audit row exists. The section "The order with STAFF-10 v2" says what stage 1 then meets |
| Q11 | A re-run of the importer? | It would write the source's one minute back over this fix (`packages/db/src/migration/upsert.ts`, the re-run branch updates the row from the source). Noted for the owner; not something this op can prevent |
| Q12 | An undo? | Exact, from the audit row: the section "Undoing it". Documented, never run |
| Q13 | A row that would end after closing time? | Written if nothing else holds it. The app has no end-after-close rule (`apps/web/lib/scheduling/clinic-hours.ts`), so this op invents none; stage 1 prints the flag and counts it per clinic |
| Q14 | A one-minute row that is itself an unconfirmed pedido? | Held for reception (verdict 19), by the live filter's own pedido test (0067: scheduled, and from the portal or with an `appointment_request` notification). The rule does not read a pedido as live, so stage 2's re-measure could not see it as a row that holds its hour, and reception confirms or refuses it first. It cannot happen for an importer row today, since only the portal writes a pedido; the fixture builds all three shapes |
| Q15 | JP, one person held as two staff rows? | Built: a booking or a block on either row holds the person on the other (arm `same_person`), two stubs on the two rows are compared once both are extended (verdict 14), and a row on one row at the other row's clinic is held outright (verdict 18). R10 refuses when the pair does not resolve. The ids are STAFF-11's |
| D1 | Added: why is the rule inline? | `appointment_conflicts` and `is_unconfirmed_pedido` filter on `jwt_tenant_id()`, NULL in a psql session, so called from here they answer "no conflict" and "not a pedido" for every row. The rule is carried inline, with the tenant taken from the row, and the rehearsal proves the trap (arm T below) |
| D2 | Added: is the inline rule the app's rule? | `apps/web/lib/scheduling/dur-01-classification.db.test.ts` runs stage 1's own BASE block over a seeded tenant and, for every candidate, the app's `findConflictsForWindow` with `blockingConflicts`, `checkAvailability`, `checkClinicClosure` and `checkClinicWindow` under `runScoped`, and requires them to agree flag for flag, every arm with its opposite |
| D3 | Added: what if production carries a trigger main does not? | R05 refuses, and stage 2's P4 reads the catalog again under the lock and stops too |
| D4 | Added: what if the write set is empty? | R06 refuses: an empty write is a STOP, not a finished state, so every stage 3 arm always compares something |
| D5 | Added: can a held row be written by a verdict order that let it through? | No. R09 re-reads every flag, NULL-safe, on the WRITE set; R07 and R08 re-check the two collisions the database and the classifier could disagree on |
| D6 | Added: a STAFF-10 v2 write between stage 1 and stage 2? | Refused: the fourth carry is STAFF-10 v2's audit row count, and stage 2 compares it |
| D7 | Added: what does this op still guard once STAFF-10 v2 has run? | The twin predicate and verdict 17 stay, unconditional on STAFF-10 v2's audit row: a live twin booked after STAFF-10 v2 ran reads 08, and a NESA stub inside such a twin's person window reads 17. Verdict 18 holds JP(cb)'s rows at Linda-a-Velha from STAFF-10 v2's run day on, which it leaves on JP(cb) for reception (its Q1) |
| D8 | Added: why does stage 3 not count the table for its total? | A live count moves with the clinic: a later hard delete, or a booking that began before stage 2 and committed after it with an earlier `created_at`, would FAIL a correct write on its first verify. Stage 2 counts the total under its lock before and after the write and records both; verdict 19 compares the two recorded numbers |
| D9 | Added: which stage 3 verdicts may read VACUOUS, and why only those? | 14, 16, 18, 20, 21 and 22, each for a subject a real day may lack: no written row at a clinic with a midday closure configured (14), no written row with hours configured (16), no row held (18), no written row on a NESA (20), none naming a NESA in either slot (21), none on a JP row (22). Each prints its subject, so a VACUOUS is read as "nothing to check", never as a pass. Every other verdict compares the written rows themselves, or every other appointment of the tenant (23), and R06 and P5 refuse an empty set of either before the write |
| D10 | Added: can stage 3 run again? | Only on the owner's or the lead's word, never on the runner's (the halt rule). It is READ ONLY and runs from the sha stage 0 recorded in `/tmp/dur01-main.sha`, whatever main has done since; it prints whether main moved, with both shas, and never stops on it. If the recorded sha is gone, stage 3 stops and the lead rules. The PR merges before the sitting, so no block reads a branch |
| D11 | Added: which room does the room arm read? | The candidate's room trimmed exactly as the app trims it before it asks `appointment_conflicts` (`args.room?.trim() || null` in `conflict.ts`): every character of ECMAScript's WhiteSpace and LineTerminator sets, the tab, the line ends and the no-break space among them, is stripped from both ends (CTE `c_room`, in the rule and so in every stage); a room that trims to nothing asks no room arm; the other row's room is compared as stored, both lower-cased, at the same clinic. The unit test holds `c_room`'s set equal to what JavaScript's trim strips over every code point of the Basic Multilingual Plane |
| D12 | Added: R11's control | R11 counts the population's tenant when it has no `staff.staff10_v2.apply` audit row, and prints as its control the audit rows of that action in that tenant: 0 and REFUSE before STAFF-10 v2, at least 1 and OK after it. With no population it reads VACUOUS, and R06 refuses. The rehearsal runs both ways on the same fixture |
| D13 | Added: verdict 23 moves with the clinic | By the ruling it compares EVERY other appointment of the tenant with the baseline stage 2 recorded under its lock. So any booking, edit or delete in the tenant after the write, a portal booking at night or an SMS confirmation included, FAILs it, on the first verify as on a later one. Its observed column counts the rows the app stamped (`created_at` or `updated_at`) after the op's audit row, and its count shows a row added or removed, so the reader can tell the clinic's own change from the op's. Stage 3 runs straight after stage 2, outside clinic hours, which keeps that window short |
| D14 | Added: section 9, what the code cannot answer | READ ONLY evidence in stage 1, never a verdict or a refusal: every block that holds a population row, whole, with the audit trail the app leaves when it writes one; the series of every row held for reception, its past and the patient's whole span; every row of those series from today with its ledger batch and every audit row and status change naming it; the hours of every therapist verdict 11 reads. Ids, times, counts, enum values and flags only: no patient name is read, a note prints only as present or not and which listed blocks share one, and the importer's raw row is not read there |

## The order with STAFF-10 v2 (#1444)

**Ruled by the owner on 2026-09-26: STAFF-10 v2 runs first, and this op after it, with a
fresh stage 1 on its own run day.** R11 refuses this op, in stage 1 and in stage 2
before any write, until STAFF-10 v2's audit row exists in the population's tenant.

STAFF-10 v2, in one transaction (its document, `docs/data-op-staff-10-v2.md`): retires
or moves every active JP(cb) schedule row at Linda-a-Velha (W1; W2 moves the dated real
Saturdays JP(lv) does not hold to JP(lv)), moves JP(cb)'s Linda-a-Velha appointments
that start before its run day to JP(lv), in any status (W3, its ruling a), moves each
past NESA twin row booked where its NESA is not installed to the NESA that is (W4, its
ruling b), and resolves each FUTURE NESA twin whose two rows are both live by its ruling
(c): the person row keeps and takes the NESA as `practitioner_2` (W5), and the NESA row
is cancelled (W6). It writes no block: the owner removes JP(cb)'s 30 September block in
the app before its sitting. Its R17 stops its WHOLE transaction on any live future pair
whose person window does not cover its NESA window.

**What this op's stage 1 meets after it:**

| Shape | What stage 1 does |
|---|---|
| STAFF-10 v2 has not run | R11 refuses, in stage 1 and in stage 2 |
| a one-minute NESA row of a future twin STAFF-10 v2 resolved | cancelled by its W6: `01 NOT LIVE`, left alone |
| a one-minute person row of a resolved twin whose two halves were both one minute | still a twin, its partner read in any status: `08`, STAFF-10 v2's |
| a one-minute NESA row over a person row that now holds the NESA as Terapeuta 2 | verdict 12, arm `resource_as_terapeuta_2` |
| a live twin booked after STAFF-10 v2 ran | its rows read 08; a NESA stub inside its person window reads **17** |
| a JP(cb) row at Linda-a-Velha from STAFF-10 v2's run day on | **verdict 18**: STAFF-10 v2 leaves it on JP(cb) for reception |
| a JP row whose hour overlaps a booking or a block on the other staff row | verdict 12 or 13, arm `same_person`; verdict 14 when the other is a stub read at its proposed end |
| STAFF-10 v2's write landing between this op's stage 1 and stage 2 | stage 2 STOPS on the fourth carry |

Section 1c prints STAFF-10 v2's audit rows, section 1d the live future pairs still
standing (none of the pairs it resolved), and section 1e JP's two rows.

## A measurement sitting: stage 0 and stage 1 alone

GREEN may be dispatched stage 0 and stage 1 alone, as a measurement sitting: stage 1
writes nothing, and nothing obliges a stage 2 after it. **A refusal in a measurement
sitting also stops it:** before STAFF-10 v2 has run, R11 refuses, and the block stops
like any other, after psql has printed the whole transcript, sections 1 to 9 included.
Its transcript is the measurement:

- **section 1c**: what has run, by audit row: this op, STAFF-10 v2 (R11 reads it) and
  NESA-SPLIT;
- **section 1d**: the live future NESA twins still standing;
- **section 1e**: JP's two staff rows: whether the pair resolves, each row's active
  schedule rows at its own clinic and at the other, its blocks from now, and its
  one-minute rows at its own clinic and at the other (verdict 18);
- **section 2**: the population with and without the ledger filter, per clinic, and the
  created range as a cross-check against the import windows; **2b** the duration profile
  of the importer's short future rows, so the owner sees whether one minute is the whole
  class;
- **section 3**: the verdicts per clinic, who each belongs to, and the partition line;
- **section 4**: by service, how many rows sit on a person with a machine alongside;
- **sections 5 and 6**: every row by id, and the reception list, one line per reason,
  each block's window with its end date when it ends on another day;
- **sections 7 and 8**: the carries, and the refusals with their controls;
- **section 9**: what the code cannot answer (D14): who made each block that holds a row
  and how, and whether each held row's series is a real one.

## The HEAD CHECK, and running from main

The op runs from `origin/main`, after its PR has merged, and the owner freezes merges
to main for the sitting. No block reads a branch, and there is no separate HEAD CHECK
to paste: the machine runs it inside the blocks, and halts on it.

- **Stage 0** refuses once stage 2 has written, checks that the apply worktree is
  clean, fetches, resolves `origin/main`, checks that sha out detached, verifies the
  sidecar and every pin, and only then records the sha in `/tmp/dur01-main.sha` and
  prints `running from origin/main <sha>`.
- **Stages 1 and 2 begin with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and
  written nothing. Each then checks out the RECORDED sha, never a fresh `origin/main`,
  and asserts its own file and the target guard by sha256 before it runs either.
- **Stage 1 marks its pass with the recorded sha,** and stage 2 refuses unless that
  mark names the sha it is about to run from.
- **After stage 2 has written: NEVER run stage 0, 1 or 2 again.** Each refuses once the
  written marker exists, and R04 and P0 refuse in the database regardless. **Stage 3 is
  READ ONLY** and runs from the recorded sha whatever main has done since: it prints
  whether main moved, with both shas, and never stops on it.
- **A moved main before the write ends the sitting.** Nothing is written, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/dur01-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the files, the pins and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/data-op-dur-01.sha256
SHA1=0bf5fca17b9c29e5a202c1ee1f8b054250bbebeb46e8c1e42c52744e3cf7f5dc
SHA2=e571291a11564c2648836e4f3d7303560eefe54a23805f8b1d9baf35e59206f0
SHA3=71de3658ba89fcaf319f79fe1a33959f8b907d396e6c3ca58c713dae4628a335
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/dur01-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/dur01-main.sha /tmp/dur01-stage1.out /tmp/dur01-stage1.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

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
echo "${MAIN}" > /tmp/dur01-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/dur01-main.sha"
echo "DUR-01 FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/data-op-dur-01.md: OK`, then
`running from origin/main <sha>, recorded in /tmp/dur01-main.sha`, then
`DUR-01 FILES VERIFIED`.** It reads no database. The sha it prints is the one every
later stage runs from.

## STAGE 1: the measurement

```
(
set -eo pipefail
SHA1=0bf5fca17b9c29e5a202c1ee1f8b054250bbebeb46e8c1e42c52744e3cf7f5dc
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/dur01-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/dur01-stage1.out /tmp/dur01-stage1.ok
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/dur01-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/dur01-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
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
[ "${RN}" = 11 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 11"; exit 1; }
REF=$(grep -E '^[[:space:]]*R[0-9]{2}[[:space:]]*\|.*\|[[:space:]]*REFUSE[[:space:]]*$' /tmp/dur01-stage1.out | sed -E 's/^[[:space:]]*(R[0-9]{2}).*/\1/' | tr '\n' ' ' || true)
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. The sitting stops here, and stage 2 would refuse on the same lines. Report them"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/dur01-stage1.out; }
RD=$(carry dur01_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 read the Lisbon day as ${RD}, and this machine's Lisbon clock disagrees"; exit 1; }
echo "${REC}" > /tmp/dur01-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 1c, 1d, 1e, 2, 3, 3b, 4, 6 and 9 before stage 2."
)
```

**Read the output before pasting stage 2.** The HEAD CHECK prints both shas, and they
are equal or the block has already halted. Section 8 prints eleven refusals, `R01` to
`R11`; the block has already stopped if any reads REFUSE. R11 reads OK with a control
of at least 1: STAFF-10 v2 has run. Section 8b must be empty. A refusal that reads
`VACUOUS` read an empty population: that is not a refusal, and the sections above it
say which population it was (R07 is VACUOUS on a day no WRITE row is confirmed).
Section 3b must read `partition holds`. Section 6 is reception's list, and section 9
the evidence for it; neither refuses anything.

## STAGE 2: the write

**Paste it outside clinic hours** (Q9), within the hour of stage 1, on the same Lisbon
day.

```
(
set -eo pipefail
SHA2=e571291a11564c2648836e4f3d7303560eefe54a23805f8b1d9baf35e59206f0
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
NAMES=(
dur01_run_day
dur01_count
dur01_digest
dur01_s10v2_runs
)

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/dur01-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/dur01-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not pass in this sitting, or passed over an hour ago. The sitting stops"; exit 1; }
test -f /tmp/dur01-stage1.out || { echo "STOP: stage 1 left no transcript. The sitting stops"; exit 1; }
[ -n "$(find /tmp/dur01-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded, and stage 1 must have passed on it."
test -f /tmp/dur01-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/dur01-main.sha)
[ "$(cat /tmp/dur01-stage1.ok)" = "${REC}" ] || { echo "STOP: stage 1 did not pass on the recorded sha ${REC}. The sitting stops"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-dur-01.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/dur-01-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/dur-01-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/dur01-stage1.out; }
RD=$(carry dur01_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 ran on Lisbon day ${RD}, not today. The sitting stops"; exit 1; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}); [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript. The sitting stops"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: run day ${RD}, ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/dur01-stage2.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/dur-01-2-write.sql 2>&1 | tee /tmp/dur01-stage2.out
touch /tmp/dur01-written.ok
grep -q 'DUR-01 STAGE 2 DONE' /tmp/dur01-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its DONE line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
grep -q 'DUR-01 STAGE 2 COMMITTED' /tmp/dur01-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its COMMITTED line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "DUR-01 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the write; every
assertion after it raises too, and a raise inside the DO block rolls back everything
the block did. So a `STOP:` raised in the database (psql exit 3) always means **nothing
was written**, and so does every `STOP:` the block prints before psql runs, the HEAD
CHECK's included. **psql exit 0 means the COMMIT ran and the write stands:** the block
touches the written marker at once, before it reads the transcript, and the two `STOP:`
lines it can print after that point say so in their own words. Either one stops the
sitting like every other `STOP:`: GREEN reports the whole output, never runs stage 0, 1
or 2 again, and stage 3, READ ONLY, runs only on the owner's or the lead's word. The
file pins `client_min_messages = notice`, so a quieter role or database default cannot
hide the step lines. The NOTICE lines name each step: `L1` the locks, `P0` the re-run
refusal, `P1` the sets, `P2` each refusal with its control (R11 among them), `P3` the
run day and the carries, `P4` the triggers the system did not create (none, or it
stops), `P5` the baselines, `W1` the write with its row count, `A1` the written ends
against the carried digest, `A2` the re-measure against the table as it now stands (any
hit STOPS), `A3` the total and both md5s unchanged, and `DUR-01 STAGE 2 DONE`, then
`COMMITTED` after the COMMIT.

**Only exit 0 with the `DONE` and `COMMITTED` lines goes on to stage 3,** and the block
then prints `DUR-01 WRITTEN. Paste stage 3 now.` **Every other exit stops the sitting,
with nothing else pasted.** psql exit 3 is every in-database STOP, a lock not granted
within `lock_timeout` included, and nothing was written; an undefined carry fails
before the block, on the `set_config` statement, also with exit 3. A `STOP:` the block
prints exits 1: before psql nothing was written, and after it (the two lines above) the
write stands. Any other exit (psql exits 2 on a lost connection, possibly during the
COMMIT) leaves open whether the write stands. In every case GREEN reports the exit code
and the whole output, and stage 3, READ ONLY, runs only on the owner's or the lead's
word; its verdict 1 answers whether the write stands. R04 and P0 refuse a second write
regardless.

## STAGE 3: the verify. READ ONLY

```
(
set -eo pipefail
SHA3=71de3658ba89fcaf319f79fe1a33959f8b907d396e6c3ca58c713dae4628a335
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/dur01-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/dur01-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
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
[ "${NV}" = 23 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 23"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/dur01-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '14|16|18|20|21|22' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/dur01-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "DUR-01 VERIFIED: ${PROFILE}. The RECEPTION section above lists every row stage 2 did not write, by id."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, no FAIL, 23
verdicts, a SUMMARY row, and VACUOUS on 14, 16, 18, 20, 21 and 22 at most**, which the
block enforces (D9). Each of those six prints its subject: 14 the written rows at a
clinic with a midday closure configured, 16 the written rows with hours configured, 18
the rows held, 20 the written rows on a NESA, 21 those naming a NESA, 22 those on a JP
row. A VACUOUS there says the day had nothing of that kind to check, and is reported as
that, never as a pass. **Never VACUOUS:** every other verdict, 10 and 23 among them:
R06 refuses an empty write set and P5 a tenant with no other appointment, before the
write. The block prints the profile; the profile moves with the data, so no exact
profile is asserted for production. After the SUMMARY, stage 3 prints the RECEPTION
section: every row stage 2 held, by the verdict it held it under, ids only.

## What every verdict, refusal and check means

**Stage 1's verdicts.** Every population row gets exactly ONE, the first that applies,
in this order (the `v` CTE of the BASE block). Only WRITE is written.

| Verdict | When | Belongs to |
|---|---|---|
| `01 NOT LIVE` | cancelled or no-show | left alone (ruling 4) |
| `02 COMPLETED IN THE FUTURE` | completed, starting in the future | the owner, the DATA-future card |
| `03 NO SERVICE` | no service, so no default | reception |
| `04 SERVICE DEFAULT NOT ABOVE ONE MINUTE` | the service's default is one minute or less: nothing to extend | left alone |
| `05 LEDGER AMBIGUOUS` | more than one ledger row names the appointment | held as a finding |
| `06 SOURCE ROW NOT ONE MINUTE` | the source row's `inicio` and `fim` do not read as one minute on one date | held as a finding |
| `07 STARTS ON THE RUN DAY` | starts before 00:00 Lisbon tomorrow (Q4) | reception |
| `08 PART OF A NESA TWIN` | a twin: another row, same patient, start and service (NULL-safe), one on a shared resource and one not, the partner in any status | STAFF-10 v2, its ruling (c) (ruling 2) |
| `09 RUNS INTO THE CLINIC CLOSURE` | the extended window touches the clinic's midday closure on its Lisbon day | reception |
| `10 STARTS OUTSIDE CLINIC HOURS` | the start is before `opens_at` or after `closes_at` minus 60 minutes | reception |
| `11 OUTSIDE THE THERAPIST HOURS` | the therapist has hours configured at that clinic and the extended window is not inside one merged run of that day's windows | reception (ruling 3) |
| `12 OVERLAPS A BOOKING` | another live row (not cancelled, not no-show, not an unconfirmed pedido) on the same therapist, on JP's other staff row when the row is on one of the two (arm `same_person`), in the same room at the same clinic (the row's room trimmed as the app trims it, D11), or holding a NESA the row names in either slot, as Terapeuta or as Terapeuta 2, overlaps the extended window, half-open | reception |
| `13 OVERLAPS A BLOCK` | a `time_off` block on the therapist, or on JP's other staff row, overlaps it | reception (ruling 3) |
| `14 OVERLAPS ANOTHER STUB ONCE BOTH ARE EXTENDED` | another live one-minute row, read at its own proposed end, shares a therapist (JP's two rows counting as one), a resource, a room or the patient | reception |
| `15 SAME PATIENT BOOKED ELSEWHERE` | another live row of the same patient overlaps it | reception |
| `16 NESA NOT INSTALLED AT THE CLINIC` | the row's Terapeuta is an active shared resource with no `staff_locations` row at the row's clinic (SCHED-17). The app refuses any change to it there, for every role; reception moves it to the machine installed at that clinic | reception |
| `17 OVERLAPS THE NESA HOUR OF A LIVE TWIN` | it names a NESA, in either slot, and its extended window overlaps the person row of a live twin on that NESA, which holds the machine over its whole window (D7) | reception |
| `18 ON A STAFF ROW MEANT FOR ANOTHER CLINIC` | it sits on one of JP's two staff rows at a clinic that is not that row's own: JP(cb) at Linda-a-Velha, or JP(lv) at Castelo Branco (Q15) | reception, who moves it to the row for that clinic |
| `19 AN UNCONFIRMED PEDIDO` | the row itself is an unconfirmed pedido: scheduled, and from the patient portal or with an `appointment_request` notification (Q14) | reception, who confirms or refuses it |
| `WRITE` | none of the above | stage 2 writes it (ruling 1) |

**The flags are printed for every row** (section 5), so a row held for one reason shows
every other that also applies, and section 6 lists each reason with the other row's id
and window. A window that ends on another Lisbon day prints its end date too.
`ends_after_close` is printed and never a verdict (Q13).

**Stage 1 section 8 and stage 2 P2, the same eleven lines.** `n` must be 0. `control` is
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
| R10 | JP's two staff rows do not resolve: a staff row or the clinic the rule pairs with it is missing from the population's tenant, so arm `same_person` and verdict 18 would read a vacuous zero. Its control is the pair rows that do resolve; with no population at all it reads VACUOUS, and R06 refuses |
| R11 | STAFF-10 v2 has not run: the population's tenant holds no audit row of action `staff.staff10_v2.apply` (ruling 5). Its control is those audit rows, at least 1 once STAFF-10 v2 has run (D12); with no population at all it reads VACUOUS, and R06 refuses |

**The carries.** Four names, none a substring of another: the Lisbon run day, the WRITE
count, an md5 over every WRITE id with the epoch of the end stage 2 will give it, and
the count of STAFF-10 v2 audit rows. The block that computes them, between
`DUR-01 BASE BEGIN` and `BASE END`, is byte-identical in stage 1 and stage 2, so a
recomputed carry can only differ when the database moved. Stage 2 checks the digest
three times: recomputed by the BASE (P3), recomputed from the table under the lock
before the write (P5), and read back from the table after it (A1).

**Stage 3's 23 verdicts:**

1. exactly one DUR-01 audit row;
2. the written list: distinct ids, as many as the carried count and the recorded count;
3. every written id still exists, in the recorded tenant;
4. every written id ends at its recorded after end;
5. every written id ends at its start plus its service's default, read now;
6. no written id lasts one minute any more;
7. the recorded after ends reproduce the carried digest;
8. the undo is exact: every recorded before end is its start plus one minute;
9. every written id carries `updated_at` at or after the op's clock;
10. every written id is unchanged in every column the op does not write: the count and
    one md5 of those columns equal the baseline stage 2 recorded in the audit row, and
    the control, the same md5 with one row left out, differs from it (ruling 6);
11. the re-measure reads every written id and sees each as a live row, its positive
    control: a live filter that cannot see the written rows would green 12 to 17 and 20
    to 22, so this FAILs, never VACUOUS;
12. to 17. the rule again, over the written rows at their new ends against the table as
    it stands: no booking overlap (therapist, JP's other staff row, room, resource in
    either slot), no block (on the therapist or on JP's other staff row), no closure
    (VACUOUS when no written row sits at a clinic with a closure configured, D9), no
    start outside the clinic's hours, inside the therapist's hours where configured
    (VACUOUS when no written row has hours configured, D9), no other live booking of the
    same patient;
18. every id the op held still lasts one minute (VACUOUS when none was held);
19. the appointment total stage 2 counted under its lock after the write equals the one
    it counted before, both read from the audit row (D8): never a live count;
20. no written id is a NESA at a clinic where it is not installed (SCHED-17), VACUOUS
    when no written row is on a NESA;
21. no written id overlaps the NESA hour a live twin's person row holds (verdict 17's
    rule), VACUOUS when no written row names a NESA in either slot;
22. no written id sits on one of JP's two staff rows at the other row's clinic (verdict
    18's rule), VACUOUS when no written row is on a JP row;
23. every other appointment of the tenant is unchanged: the count and one md5 of the
    whole rows equal the baseline stage 2 recorded, and the control, the same md5 with
    one row left out, differs from it (ruling 6, D13).

**Stage 3 can run again, on the owner's or the lead's word, and its answers move with the clinic.** A reception edit
after the sitting can change 3 to 18 and 20 to 23 honestly: a written row shortened
later FAILs 4, 5 and 6, one cancelled later FAILs 10 (status is a column the op does not
write), 11, 12, 17 and 21 (the re-measure no longer sees it as live), a new booking over
a written row FAILs 12 (on JP's other staff row too) and 23, a NESA taken out of a
clinic FAILs 20, a new live twin booked over a written row FAILs 21, a written JP row
moved to the other clinic FAILs 22, and ANY change to any other appointment of the
tenant FAILs 23 (D13). Read a later FAIL against the audit row's time before calling it
a defect of the op. **Verdict 19 does not move:** it compares two numbers stage 2
counted inside its own transaction, under its lock, and recorded. The block that
computes 12 to 17 and 20 to 22, between `DUR-01 RECHECK BEGIN` and `RECHECK END`, is
byte-identical in stage 2 (A2) and stage 3, and its rule block, between
`DUR-01 RULE BEGIN` and `RULE END`, is byte-identical to the one inside the BASE.

## Section 9: what the code cannot answer

Stage 1 prints it after section 8b. READ ONLY, never a verdict and never a refusal; the
sitting reads it and reception acts on it. It answers the two questions the code cannot:
who made each block that holds a row, and whether each held row's series is a real one.

- **9a, every block that holds a population row, whole.** Both ends as a Lisbon date and
  time, so a block over several days reads as such (section 6 prints a window's end date
  too when it ends on another day). Its shape: whole Lisbon days, which is what the app's
  ausencia prolongada writes (reason `vacation`); hours inside one Lisbon day, which is
  what a single block and every date of a batch write (reason `other`); or another shape,
  which the app does not write. Its reason, whether it has a note and which listed blocks
  share one, when it was made, and how many blocks of that therapist were made in the
  same transaction.
- **9b, how each of those blocks was made.** `apps/web/lib/admin/time-off.ts` is the only
  writer of `time_off` in the code, and it writes an audit row every time:
  `time_off.create` naming the block it wrote, `time_off.create_batch` naming none, in
  the same transaction as every block of the batch (so it is matched by that
  transaction's time), `time_off.update` naming the block it changed. Each is printed
  with its time, the actor's id and role, the app's mode, the batch's block count and the
  number of bookings the screen warned about. The importer never writes a block
  (`packages/db/src/migration` writes patients, appointments, episodes, records and
  attachments), so a block with no audit row at all was written some other way.
- **9c, the series of every row held for reception**: every appointment of the same
  patient with the same therapist at the same clinic, on the same Lisbon weekday at the
  same Lisbon start time. How many are held, how many exist from today and in what state,
  and, before today, how many were completed (the importer maps the source's `realizada`
  to `completed`), were no-shows, were cancelled or are still open, how many last one
  minute, how many the importer wrote and how many carry a clinical record. A series with
  completed rows and records has happened; one with none has never been seen to happen.
- **9d, each series' patient, whole**: appointments, therapists, completed rows, clinical
  records and invoices, ever. No name is read: a patient booked with many therapists and
  never with a record or an invoice reads like a marker the old system used to hold
  time, not like a person.
- **9e, every row of those series from today, in any status**: its status and length,
  its origin, its ledger batch and staging time when the importer wrote it, when it was
  created and last updated, who created it, whether it has notes, every audit row naming
  it by action with the last one's time and actor, and every status change the app
  recorded for it.
- **9f, the hours of every therapist whose row verdict 11 reads**, at that row's clinic:
  every active schedule row, by weekday.

It prints ids, times, counts, enum values and flags only. A block's note prints only as
present or not, with a class number shared by the listed blocks whose note is the same
(an md5, ranked); an appointment's notes only as present or not; no patient name is read,
and the importer's raw row is not read there. The unit test holds each of those.

**No separate READ ONLY sitting is needed before this op's own run.** Section 9 is read
on the run day, after STAFF-10 v2, in stage 1 itself. Before that, reception can see
what it needs in the app: a block's first and last day and its note in the therapist's
blocks list (Horarios, Bloquear horario), and a patient's appointment history on the
patient's page. What only section 9 adds is the audit trail of who made a block, which
the app does not show.

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

### These files: NOT RUN YET

PLACEHOLDER, replaced by the run.

### The previous files, at `2d0f585e`, kept as history

**Not evidence for these files.** Everything below was measured on the op as it stood
at `2d0f585e` (review round 3): its blocks took their head from the op's branch, stage
3 fell back to `main` once that branch was gone (the old D10), it had ten refusals and
22 verdicts, verdict 10 had no count and no control, there was no verdict 23 and no
section 9, and either order with STAFF-10 v2 was allowed. It stays as the record of
what the three review rounds found and of the arms this round carries forward for the
shapes that did not change.

**Where it ran.** The throwaway container `supabase_db_OsteoJP-solo-rehearsal`
(Postgres 17, `127.0.0.1:55522`), never an existing database: each run makes a NEW one,
`CREATE DATABASE <run> TEMPLATE s10v2_schema`. `s10v2_schema` is the STAFF-10 v2
rehearsal's schema copy: production's schema at 0092 (from the 0093 rehearsal) with
main's `0093_patient_rgpd_acceptances.sql` applied and its journal row added, and every
public table emptied, so the only rows in a run database are the fixture's.

| Fingerprint of a run database | Value |
|---|---|
| drizzle journal: entries, and md5 over the sha256 of every migration file in journal order | `91 139cb96adcdf063d9c6a8613f77503a8`, equal to main's migration files at `f4e892cd` (MATCH) |
| public tables / policies | 48 / 95 |
| appointment rows before the fixture loads | none |

**The fixture is synthetic.** No real patient data. The stage files name four ids, JP's
two staff rows and their two clinics (the facts table), so the fixture uses exactly
those four and every other id starts `d010`; the files run as the exact bytes GREEN
will run. One tenant, two clinics (Castelo Branco with a midday closure from 13:00 to
14:00, Linda-a-Velha without, both 08:00 to 20:00), twenty therapists, JP(cb) installed
at both clinics as before the split and JP(lv) at Linda-a-Velha, neither with hours,
two flagged NESA rows each installed at one clinic, a 60-minute and a one-minute
service, and one Wednesday in November 2026 (Lisbon on UTC). One importer stub per
verdict and, where it has one, its opposite, each with a synthetic ledger row whose
`raw` carries other keys too; the neighbours they stand next to; therapist hours (one
all day, one ending at 10:30 with an expired all-day window beside it, one in two
adjacent windows); three blocks, one of them on JP(cb); a staff-made one-minute row, a
past stub and a two-minute stub, which the population must not take. Four live future
NESA twins: at Linda-a-Velha the AGENDA-TWIN shape (a one-minute person stub against an
hour on the machine, which STAFF-10 v2's R17 refuses), a pair of an hour each, and a
pair whose two halves are both stubs; at Castelo Branco a pair whose person row (an
hour) is longer than its NESA row (half an hour), with a NESA stub of another patient
starting where the NESA row ends. The Linda-a-Velha NESA booked at Castelo Branco,
where it is not installed. **Review round 2's shapes:** JP(cb) stubs at Linda-a-Velha,
one clear of everything and one whose hour overlaps a confirmed JP(lv) booking there
(the shape the review found); a JP(cb) stub at Castelo Branco while JP(lv) is booked at
Linda-a-Velha; a JP(lv) stub under the JP(cb) block; a JP(lv) stub and a JP(cb) stub
half an hour apart; a JP(lv) stub at Castelo Branco; a clear JP stub on each row (the
opposites); and three one-minute rows through the portal: scheduled (a pedido), with an
`appointment_request` notification (a pedido), and confirmed (not one). **Review round
3's shapes:** four stubs of one therapist at Linda-a-Velha an hour apart, each beside a
live row of another therapist in the room it names: a room ending in a tab (beside the
name in capitals), one ending in a no-break space (beside it in lower case), a room of
only a tab (beside a row whose room is the same tab), and a tab inside the name (beside
the name with a space); and two arms that take verdict 14's subject away, the one
closure removed, or the two WRITE stubs at the clinic that has it cancelled. One stub is
placed ninety minutes after the fixture loads, so it is always later on the run day.
The fixture is reset BY ID between arms, in FK order, and its shape is read back after
every reset.

| File, in the authoring lane's scratchpad (not committed, as for STAFF-10 v2) | sha256 |
|---|---|
| `rehearsal-dur01/fixture.sql` | `1889a45117c7a09740679448d15ad45326e9a12db60d3c52fbfeea93dd58a064` |
| `rehearsal-dur01/reset.sql` | `0369d957d9d878574a09840068f615c20b5ed03d693d3bd880f4635a1baefc68` |
| `rehearsal-dur01/arms/*.sql`, one mutation per arm, concatenated in name order | `6fcb6642a6a5bf31f253890a9c0dfd7b4fb50e6c04e6b2cc1d88c1b7c9d82170` |
| `rehearsal-dur01/run-dur01-arms.zsh`, the arms runner | `ef1251ed2edb7d3d8cfab605afd9b1f21443a43687e2ea8ac6e8aa62f7fb8dd2` |
| `rehearsal-dur01/extract-stage.mjs`: the handover extractor (`f82cad1e6e8cc1be3b7c491fff787138161e0f079b6424119329d71c63d72198`) with ONE change, that stage 3's one fallback line may name `origin/main` (D10); every other refusal stands, on that line too | `d0208f3e18cee4dc3be24cefa0d1dc252e7c017dc9a57a3084fb4e00b3cdc674` |
| `rehearsal-dur01/r1/*.sql`, the round 1 stage files read from `d37ce61e`, checked against round 1's own pins before use | stage 1 `3942a09a061a422ed61d3e0ab58e730fa93de570290e841c2b1b4e269c5e2e5d`, stage 2 `aa28f519ae2b17c007b014a39f68a1a212c43cc67b7b3d947b1c1fa13d39642f`, stage 3 `fc3a9460d7e1aa303e6588b405ab0ab6caea19c445eccde54509004377ba55b4` |
| `rehearsal-dur01/r2/*.sql`, the round 2 stage files read from `6642f01b`, checked the same way | stage 1 `9897028bf670d3db3b6c0040ed8165782074fbf424030453728bbc2bcbf42db3`, stage 2 `35cea1ace3773e47f40fb37f3de639fc24f2873b031ba33a9c681e12d743a213`, stage 3 `65c7138337bc72db675b4180feb534bb21a8c5a165c43ad45774d31395125d74` |
| `rehearsal-dur01/r3/*.sql`, the round 3 stage files read from `299476a7`, the head the round 3 review read (the files last changed in `0bb3465c`), checked the same way | stage 1 `8d0b536fdf37df823d9a59096a6824edfc70451dafa9498c98d812a1bceceda3`, stage 2 `d9410f4ba875a94199c7d6c238a857e03bf70b294230527df70a19fec19ed677`, stage 3 `c11e78791e9281cc4dbba4a59edeb10b7dbec97283775a94943d5aa625ce752a` |

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

**The verdict profile, stage 1 on the fixture** (exit 0, all ten refusals OK, none
VACUOUS, `partition holds`). Every verdict fired, each on the stub built for it:

| Verdict | The stub, and its opposite |
|---|---|
| `WRITE` | the confirmed stub, R07's control; a booking starting exactly at the proposed end (half-open); a cancelled neighbour; a no-show neighbour; a portal pedido neighbour; a notified pedido neighbour; the same room name at the other clinic; a block starting at the proposed end; 12:30 at the clinic with no closure; a start exactly at the last start; two adjacent hour windows; a stub on the Castelo Branco NESA at Castelo Branco (the opposite of 16); JP(cb) at Castelo Branco and JP(lv) at Linda-a-Velha, each clear (the opposites of 18 and of arm `same_person`); a confirmed stub through the portal (the opposite of 19); a room of only a tab beside a row in that same tab room, which the app reads as no room, and a tab inside the room name beside the name with a space (the opposites of the two room stubs under 12) |
| `01 NOT LIVE` | a cancelled stub, a no-show stub |
| `02 COMPLETED IN THE FUTURE` | a completed future stub |
| `03 NO SERVICE` | a stub with no service |
| `04 SERVICE DEFAULT NOT ABOVE ONE MINUTE` | a stub on the one-minute service |
| `05 LEDGER AMBIGUOUS` | a stub two ledger rows point at |
| `06 SOURCE ROW NOT ONE MINUTE` | a one-minute stub whose source row said 60 minutes |
| `07 STARTS ON THE RUN DAY` | the stub ninety minutes after the load (it also starts outside the clinic's hours, printed as a flag) |
| `08 PART OF A NESA TWIN` | a person stub with a NESA row at the same start, patient and service, which the app's rule alone would call WRITE; and both halves of a twin whose two rows are one-minute stubs |
| `09 RUNS INTO THE CLINIC CLOSURE` | 12:30 plus 60 at the clinic that closes at 13:00 |
| `10 STARTS OUTSIDE CLINIC HOURS` | a 19:30 start, after the last start of 19:00 |
| `11 OUTSIDE THE THERAPIST HOURS` | a 10:00 start for a therapist whose hours end at 10:30 |
| `12 OVERLAPS A BOOKING` | the therapist arm; the same pedido, confirmed; a room clash in another case with a trailing space; a room ending in a tab and one ending in a no-break space, each beside the name in another case, as JavaScript's trim reads them (review round 3); a NESA stub against a row naming that NESA as Terapeuta 2; a NESA stub against the NESA row of a twin (flagged `twin_hold` as well); the earlier of two stubs 30 minutes apart; **arm `same_person`**: the JP(cb) stub at Linda-a-Velha over the JP(lv) booking (flagged `person_away` too), the JP(cb) stub at Castelo Branco while JP(lv) is booked at Linda-a-Velha, and the earlier of the JP(lv) and JP(cb) stubs half an hour apart |
| `13 OVERLAPS A BLOCK` | a block inside the window; the JP(lv) stub under the JP(cb) block |
| `14 OVERLAPS ANOTHER STUB ONCE BOTH ARE EXTENDED` | the later of the two stubs 30 minutes apart; the later of the JP(lv) and JP(cb) stubs, on the other staff row |
| `15 SAME PATIENT BOOKED ELSEWHERE` | the patient at the other clinic 30 minutes in; a person stub with a NESA row of the same patient and start but another service (not a twin), which section 4 counts as `machine_alongside` |
| `16 NESA NOT INSTALLED AT THE CLINIC` | the Linda-a-Velha NESA booked at Castelo Branco, clear of every other check |
| `17 OVERLAPS THE NESA HOUR OF A LIVE TWIN` | the Castelo Branco NESA stub at 15:30: clear of its twin's NESA row (15:00 to 15:30, half-open), inside the twin's person row (15:00 to 16:00) |
| `18 ON A STAFF ROW MEANT FOR ANOTHER CLINIC` | the JP(cb) stub at Linda-a-Velha clear of everything; the JP(lv) stub at Castelo Branco |
| `19 AN UNCONFIRMED PEDIDO` | the scheduled portal stub; the stub with an `appointment_request` notification |

Section 1d read, at Linda-a-Velha, three live future pairs, one of them refused by R17,
and two importer person minutes, one against a longer NESA row and one with both halves
a minute; at Castelo Branco one pair, covered. Section 1e read both JP rows resolving,
no hours on either, the JP(cb) block ahead, and on each row its clear stub as its one
WRITE at its own clinic, the stub a block holds (JP(lv)), the stubs the other row holds,
and its rows at the other clinic.

Section 2 counted the staff-made one-minute row under `not_in_ledger` and never
classified it; the past stub was not in the population; section 2b printed the
two-minute stub in the profile and the population did not take it.

**The happy path, pasted interactively:**

| Arm | Exit | What it printed |
|---|---|---|
| HEAD CHECK | 0 | the head |
| stage 1 | 0 | ten refusals OK, none VACUOUS; `partition holds`; `STAGE 1 READ, NO REFUSAL` |
| HEAD CHECK | 0 | the same head |
| stage 2 | 0 | L1 the locks and `lock_timeout 5s`; P0 no audit row; P3 the run day and all four carries match; P4 no trigger the system did not create; P5 the baselines; W1 its row count equal to the WRITE set; A1 the written ends reproduce the carried digest; A2 the re-measure reading every written row as live and every arm at 0, `person_away` included, with the subjects of 14, 16, 20, 21 and 22 each above 0; A3 the total and both md5s unchanged; `DONE`, `COMMITTED`. Every WRITE row then ends at its start plus its default; every held stub still lasts one minute; the audit row lists the written ids and the held ids under each verdict |
| stage 3 | 0 | `22 OK / 0 VACUOUS / 0 FAIL`, then the RECEPTION section by id |
| stage 3 after the merge (D10): the branch deleted from the private origin, `main` set to a commit carrying the same tree | 0 | `the held branch is gone (its PR merged)`, `verifying from 5a82597`, the fix commit of review round 3, the last to change stage 3 (the head is the later record commit), `22 OK / 0 VACUOUS / 0 FAIL` |
| the same, with `main` at `f4e892cd`, which does not carry stage 3 | 1 | `STOP: neither the held branch nor main carries stage 3` |
| HEAD CHECK, the branch restored | 0 | the head |

**Every refusal, run for real.** For each arm: reset, one mutation, stage 1 (must exit 1
with REFUSE on the code), then the stage 1 marker forced so stage 2's SQL is reached
(must exit 3, `STOP: <code> refuses`), then the database compared with its state after
the mutation by one md5 over appointments, audit rows, blocks, schedule rows, the ledger
and users.

| Code | Mutation | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|---|
| R01 | the ledger's `source_system` renamed | 1 | R01 and R06 (its consequence: nothing to write); R10 VACUOUS, having no population | 3, STOP R01 | unchanged |
| R02 | neither NESA row flagged | 1 | R02 | 3, STOP R02 | unchanged |
| R03 | a second tenant, with its own shared resource and one stub | 1 | R03 | 3, STOP R03 | unchanged |
| R04 | this op's audit row | 1 | R04 | 3, `STOP: DUR-01 has already run` (P0, before the sets) | unchanged |
| R05 | a no-op `AFTER UPDATE` trigger on `appointments` | 1 | R05 | 3, STOP R05 | unchanged |
| R06 | every stub cancelled | 1 | R06 | 3, STOP R06 | unchanged |
| R10 | JP(lv) moved to a third tenant | 1 | R10 | 3, STOP R10 | unchanged |

**R07, R08 and R09 cannot fire on the real files**: each guards a verdict order. Each ran
on a copy with one verdict disarmed (`WHEN f.<flag> THEN` to `WHEN false THEN`), through
this document's own stage block with only the SQL file and its pin swapped (the pin
once, the path three times, both counted); each copy differs from its source by the
lines the runner printed.

| Code | The copy | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|---|
| R07 | verdict 12 disarmed, and the stub next to a confirmed booking made confirmed. The real files on the same data: that stub reads 12, R07 OK | 1 | R07 and R09 | 3, STOP R07 | unchanged |
| R08 | verdicts 12 and 14 disarmed, so the stubs 30 minutes apart read WRITE, the JP pair among them | 1 | R08 and R09 | 3, STOP R08 | unchanged |
| R09 | verdict 13 disarmed, so the stubs over a block read WRITE | 1 | R09 | 3, STOP R09 | unchanged |
| R09, verdict 16 | verdict 16 disarmed, so the NESA booked where it is not installed reads WRITE | 1 | R09 | 3, STOP R09 | unchanged |
| R09, verdict 17 | verdict 17 disarmed, so the NESA stub inside a live twin's person row reads WRITE | 1 | R09 | 3, STOP R09 | unchanged |
| R09, verdict 18 | verdict 18 disarmed, so the JP stubs at the other row's clinic read WRITE | 1 | R09 | 3, STOP R09 | unchanged |
| R09, verdict 19 | verdict 19 disarmed, so the two pedido stubs read WRITE | 1 | R09 | 3, STOP R09 | unchanged |

**Stage 2's re-measure is the backstop behind both.** Copies with verdict 17 AND its R09
term disarmed (two lines each): stage 1 exits 0 and calls the stub WRITE; stage 2
extends it (W1 printed), then A2 reads `"twin_hold": 1` against the table as it now
stands and STOPS, exit 3. The same with verdict 18 AND its R09 term disarmed: both JP
stubs at the other row's clinic read WRITE, stage 2 extends them, A2 reads
`"person_away": 2` and STOPS, exit 3. Each time the database is unchanged and no audit
row is written.

**The handshake, the clock, the lock and the instrument:**

| Arm | Exit | Halted on, or printed | Database after |
|---|---|---|---|
| stage 2 before stage 1 | 1 | `stage 1 did not pass in this sitting` | untouched |
| stage 0 | 0 | `DUR-01 FILES VERIFIED` | untouched |
| stage 0 on a dirty tree | 1 | `the apply worktree is not clean` | untouched |
| stage 2 with the digest altered in stage 1's transcript | 3 | `carry dur01_digest reads ... and stage 1 printed ...` | unchanged |
| stage 2 with stage 1's run day set to yesterday | 1 | the block: `stage 1 ran on Lisbon day ..., not today` | unchanged |
| the stage 2 file run directly with yesterday's run day | 3 | the database: `stage 1 ran on Lisbon day ..., and today is ...` | unchanged |
| stage 2 with stage 1's transcript backdated 61 minutes | 1 | `over an hour old` | unchanged |
| stage 2 with the stage 1 marker removed | 1 | `stage 1 did not pass in this sitting` | unchanged |
| the stage 2 file run with no carry at all | 3 | a syntax error on the `set_config` statement, before the block | unchanged |
| stage 2 after a new importer stub landed between stage 1 and stage 2 | 3 | `carry dur01_count reads ... The database moved since stage 1` | unchanged |
| stage 2 after reception edited a WRITE row by hand between the stages | 3 | the same, the count one lower | unchanged |
| stage 2 with a trap that fails the audit insert, the last step after the write (a `NOT VALID` CHECK constraint on `audit_log`) | 3 | W1, A1, A2 and A3 printed, then `violates check constraint "zz_dur01_trap"` | **unchanged**: the write rolled back, every stub still one minute, no audit row |
| stage 2 while another session holds a row lock on `appointments` (an open UPDATE, held until cancelled) | 3 | `canceling statement due to lock timeout` after five seconds, before L1 | unchanged, no audit row |
| a copy of stage 2 whose UPDATE skips one WRITE id | 3 | `STOP: W1 extended ... expected ...` | unchanged |
| copies with verdict 12, R07 and R09's booking term disarmed, over a confirmed stub next to a confirmed booking | 0, then 3 | stage 1 calls the stub WRITE; stage 2's UPDATE: `conflicting key value violates exclusion constraint "appointments_no_double_confirmed"` (SQLSTATE `23P01` when the same extension is made by hand) | unchanged, no audit row |
| stage 2 again after the write | 1 | `stage 2 has ALREADY WRITTEN in this sitting` | written once |
| stage 1 again after the write | 1 | the same | written once |
| stage 1 after the write, marker removed | 1 | REFUSE on R04 and R06 | written once |
| stage 2 after the write, markers forced | 3 | `STOP: DUR-01 has already run` | written once |
| a database whose default hides NOTICEs: stage 1, then stage 2 | 0, 0 | every step line, `DONE` and `COMMITTED`, because the file pins `client_min_messages` | written once |
| negative control: the stage 2 file with only its pin line removed, run directly on that database | 0 | no step line and no `DONE`, but `COMMITTED`: the write committed unseen, the case the block's post-psql lines name | written once |
| a write inside the READ ONLY form stages 1 and 3 use | 1 | `cannot execute CREATE TABLE in a read-only transaction` | no table |

**Stage 3 can go red, exactly on the verdicts a change reaches:**

| Arm, on the written database | Exit | FAIL on | Restored |
|---|---|---|---|
| one written row shortened back to one minute | 1 | 4, 5 and 6 | 0, `22 OK / 0 VACUOUS / 0 FAIL` |
| a new booking over a written row | 1 | 12 | 0, the same |
| a written row cancelled | 1 | 10 (status is a column the op does not write), 11, 12, 17 and 21 (the re-measure no longer sees it as live) | 0, the same |
| a new JP(lv) booking over the written JP(cb) stub | 1 | 12 (arm `same_person`) | 0, the same |
| the whole op on a day nothing is held (every held stub's ledger row removed) | 0, 0, 0 | none; VACUOUS on 18 only, which the block allows: `21 OK / 1 VACUOUS / 0 FAIL` | |
| **the whole op on a day no written row has hours configured, is on or names a NESA, or is on a JP row** (the stubs of each kind cancelled; the two at Castelo Branco among them were its only WRITE stubs there, so verdict 14 loses its subject too) | 0, 0, 0 | none; VACUOUS on 14, 16, 20, 21 and 22, each printing its subject at 0: `17 OK / 5 VACUOUS / 0 FAIL`. **Round 2's stage 3 on the same written database reads `21 OK / 0 VACUOUS / 0 FAIL`**: its 14, 16, 20 and 21 called nothing checked OK, review round 2's point | |
| **Q14a, review round 3: the one midday closure removed before stage 1**, so no written row sits at a clinic with one (the stub the closure held is then written) | 0, 0, 0 | none; VACUOUS on 14 only, its subject at 0 (`0 / at a clinic with a closure 0 / control 18`): `21 OK / 1 VACUOUS / 0 FAIL`. **Round 3's stage 3 on the same written database reads 14 OK over nothing checked**, `22 OK / 0 VACUOUS / 0 FAIL`, review round 3's point | |
| **Q14b, the review's own shape:** the closure kept, the two WRITE stubs at its clinic cancelled, so every written row is at the clinic without one | 0, 0, 0 | none; VACUOUS on 14, 20 and 21 (the cancelled NESA stub was the only written row on or naming a NESA): `19 OK / 3 VACUOUS / 0 FAIL`. Round 3's stage 3 on the same written database reads 14 OK there, `20 OK / 2 VACUOUS / 0 FAIL` | |

The three arms that compare an older stage 3 with this head's on a VACUOUS verdict first cancel
the tab-room neighbour of the stub whose room is only a tab (`arms/OLD-no-ws-room.sql`).
The older files trim a room with `btrim`'s default, so they read that room as a room and
would FAIL 12 on a row this head and the app both write correctly; the first run of this
round showed it, and the comparison then read two verdicts instead of the one it is for.

**Verdict 19 does not move with the clinic (D8).** Each arm passes on this head and
FAILs on the round 1 files, run directly on the same fixture with the same change:

| Arm, after the write | This head, stage 3 | Round 1 files, stage 3 |
|---|---|---|
| V19a: an unrelated appointment hard-deleted | exit 0, verdict 19 `after 80 / before 80` OK, `22 OK / 0 VACUOUS / 0 FAIL` | FAIL on 19 only, `18 OK / 0 VACUOUS / 1 FAIL` |
| V19b: a booking whose transaction began before stage 2 and stayed open until the op's audit row was visible, then inserted and committed; the runner confirmed, on each set of files, that its `created_at` is earlier than the audit row's. It waits on the audit row itself because in this round's first run a fixed sleep lost the race on a loaded machine: the booking committed before the round 1 stage 2 counted, and the round 1 verify read OK | exit 0, the same `22 OK / 0 VACUOUS / 0 FAIL` | FAIL on 19 only, `18 OK / 0 VACUOUS / 1 FAIL`: the first verify of a correct write |

The round 1 and round 2 files have no pedido verdict, so every arm that runs them first
takes the two pedido stubs out of the ledger (`arms/OLD-no-pedido.sql`), except the
arm below that shows what they do with them.

**JP's two staff rows (review round 2, the MAJOR).**

| Arm | This head | Round 2 files, the same fixture |
|---|---|---|
| stage 1 on the JP stubs | the clear JP(cb) stub at Linda-a-Velha and the JP(lv) stub at Castelo Branco read 18; the review's shape (JP(cb) at Linda-a-Velha over a JP(lv) booking), the JP(cb) stub at Castelo Branco while JP(lv) is booked, and the earlier of the two stubs half an hour apart read 12, arm `same_person`; the later reads 14; the JP(lv) stub under the JP(cb) block reads 13; the clear stub on each row reads WRITE | every one of those reads WRITE |
| stages 2 and 3 | exit 0, 0; JP booked twice afterwards: 0 overlapping pairs of live JP(cb) and JP(lv) rows; no JP(cb) row at Linda-a-Velha written; `22 OK / 0 VACUOUS / 0 FAIL` | exit 0, 0; JP booked twice afterwards: 3 overlapping pairs, and round 2's own stage 3 reads `21 OK / 0 VACUOUS / 0 FAIL` over them. This head's stage 3 on that database FAILs on 12, 13 and 22 |

**The room as the app trims it (review round 3, the second minor).**

| Arm | This head | Round 3 files, the same fixture |
|---|---|---|
| stage 1 on the room stubs | the room ending in a tab and the one ending in a no-break space read 12, `booking, room`; the room of only a tab and the tab inside the name read WRITE, as the app reads them | the first two read WRITE; the room of only a tab reads 12 (`btrim`'s default leaves the tab, so the rule reads it as a room and its neighbour's tab room as a clash); the tab inside the name reads WRITE |
| stages 2 and 3 | exit 0, 0; the room double-booked afterwards: 0 overlapping pairs; the two held stubs still one minute, the two written at their default; `22 OK / 0 VACUOUS / 0 FAIL` | exit 0, 0; the room double-booked afterwards: 2 overlapping pairs, and round 3's own stage 3 reads `22 OK / 0 VACUOUS / 0 FAIL` over them. This head's stage 3 on that database FAILs on 12 only, `21 OK / 0 VACUOUS / 1 FAIL` |

The runner counts a room double-booked as the app would find it: two live rows of two
therapists at one clinic whose windows overlap, one row's room trimmed with the set the
unit test holds equal to JavaScript's trim, equal to the other's as stored, both
lower-cased. Before any write it reads 0 overlapping pairs on the fixture.

**The order with STAFF-10 v2** (D5). STAFF-10 v2 itself cannot run here: its files name
production ids that the fixture does not carry beyond the JP pair. Its steps are
SIMULATED by hand-written copies: `arms/S10-w67.sql` its W6 and W7 and its audit row over
EVERY live future twin, `arms/S10-w4.sql` its W4 over every JP(cb) row at Linda-a-Velha
in any status (as if it ran after the fixture's day, so every one is past), with its
audit row, `arms/S10-w3.sql` its W3 (the JP(cb) block deleted), and `arms/S10-w2.sql` its
W2 (a dated real Saturday given to JP(lv) at Linda-a-Velha, where it held no hours). The
real op cannot leave the W6 and W7 state while a pair its R17 refuses stands, so every
timeline that applies them first runs `arms/S10-fix26.sql`: reception gives the
AGENDA-TWIN person stub its NESA row's window, which also takes it out of this op's
population.

| Arm | Exit | What it showed |
|---|---|---|
| S10a, before: the fixture as it is | 0 | the AGENDA-TWIN person stub reads 08 (partner scheduled); the NESA stub over the NESA row of an hour-long pair reads 12, arm `therapist`, flagged `twin_hold` too; both one-minute halves of the other pair read 08; the NESA stub inside the Castelo Branco twin's person row reads **17**; the NESA at the clinic without it reads **16** |
| S10b, STAFF-10 v2 first: fix, then W6 and W7, then this op | 0, 0, 0 | the stub that read 12 still reads 12, now arm `resource_as_terapeuta_2` on the person row; the stub that read 17 now reads **12**, the same arm: the same hold, seen by the app's own rule; the person half of the one-minute pair reads 08 (partner cancelled), its cancelled NESA half 01; 16 unchanged; section 1d reads no live future pair; stage 1 read the STAFF-10 v2 audit row and carried it; stages 2 and 3 then wrote and verified, `22 OK / 0 VACUOUS / 0 FAIL` |
| S10c, between: a STAFF-10 v2 audit row lands after stage 1 | 3 | stage 2: `carry dur01_s10v2_runs reads 1 now and stage 1 printed 0`; unchanged |
| S10d, this op first: fix, this op's stages 1 and 2, THEN W6 and W7, then stage 3 | 0, 0, 0 | stage 1 held the stub as 17 and the away NESA as 16, and stage 2 wrote neither; stage 3 after STAFF-10 v2's writes: `22 OK / 0 VACUOUS / 0 FAIL` |
| S10e, the S10d timeline on the ROUND 1 files, run directly | 0, 0, 0 | round 1's stage 1 called both NESA stubs WRITE and its stage 2 extended both; after W6 and W7 the Castelo Branco NESA is held twice (the runner counted the overlapping pair); round 1's stage 3 FAILs on 12 only. This head's stage 3 run on that same database FAILs on 12, 13, 19, 20 and 22 (the JP stubs round 1 also wrote, and a round 1 audit row records no total after the write) |
| **S10f, this op first, then W4** (review round 2) | 0, 0, 0 | W4 moved both JP(cb) stubs at Linda-a-Velha to JP(lv); this op had held both (18 and 12) and wrote neither, so stage 3 after W4 reads `22 OK / 0 VACUOUS / 0 FAIL`. **The round 2 files on the same timeline** wrote those stubs, and their own stage 3 after W4 FAILs on 10 (a frozen column, `practitioner_id`, moved under a written row) and 12 |
| **S10g, W3** (review round 2) | 0, 0 | the JP(lv) stub under the JP(cb) block reads 13 before W3 and WRITE after it: STAFF-10 v2 first writes it, the first order difference, as the order section says |
| **S10h, W2** (review round 2) | 0, 0; then 0, 0, 1 | the clear JP(lv) stub at Linda-a-Velha reads WRITE before W2 and 11 after it: STAFF-10 v2 first holds it, the second order difference. This op first, then W2: stage 3 FAILs on 16 only, `21 OK / 0 VACUOUS / 1 FAIL`, the clinic having moved under a correct write, as the verify section says |

**The same fixture with the LV NESA row not flagged (C8), mirroring the app:** the NESA
stub that read 12 through the Terapeuta 2 arm reads WRITE, because the app reads no
resource arm for a row that is not a shared resource; the twin is no longer a twin and
its person stub reads 15; the unflagged NESA at Castelo Branco reads WRITE, as SCHED-17
asks nothing of a row that is not a shared resource; the Castelo Branco stub, on the
NESA still flagged, still reads 17.

**A one-minute row that is itself a pedido (Q14, review round 2).** This head holds the
scheduled portal stub and the notified stub as 19 and writes the confirmed portal stub.
The round 2 files on the same fixture call both pedidos WRITE, and their stage 2 STOPS
on the re-measure, `the re-measure read ... written row(s) and saw ... as live`, exit 3,
the misleading "blind instrument" stop the review predicted; no audit row.

**The no-claims trap, measured (T).** On the fixture, from psql with no JWT:
`appointment_conflicts` for the extended window of the stub next to a confirmed booking
returns nothing, and with the tenant claim set it returns that booking;
`is_unconfirmed_pedido` on the portal pedido answers `f` with no claims and `t` with
them. The inline rule reads the booking (verdict 12) and the pedido (its neighbour
reads WRITE) with no claims at all.

**The unit test can fail.** Each property it pins was broken on a copy of the pushed
tree and the test run there: a byte of stage 2's BASE, a third key of `raw` read in the
ledger, the UPDATE also setting `status`, a column dropped from stage 3's frozen list,
the twin filtered on its partner's status, a `jwt_tenant_id()` call in stage 3, the live
twin's hold gated on STAFF-10 v2 not having run (U7), verdict 19 counting the live
table (U8), and, new in this round, the `same_person` arm switched off in stage 1 (U9),
verdict 16's VACUOUS branch dropped (U10), verdict 19 switched off (U11), and stage 3's
block reading `main` without its guard (U12), and, new in review round 3, verdict 14's
VACUOUS branch dropped (U13), the no-break space taken out of `c_room`'s set (U14), and
the pair's room arm put back to `btrim`'s default (U15). Each failed its own test (and
the pin test, since the file moved; U7, U9, U11 and U14 also the byte-identity tests,
as each touched stage 1 only, and U15 the BASE one); the unmutated copy passes all.

**The app's own checks, on a real database.**
`apps/web/lib/scheduling/dur-01-classification.db.test.ts`, against a new throwaway cloned
from `s10v2_schema`, reading this round's BASE block: **5 passed**. Review round 3 added
its room arms: a room ending in a tab, one ending in a no-break space, a room of only a
tab and a tab inside the name, each beside a live row in that room written another way;
and its two loops that ask the app once per stub now have three minutes each, because on
this round's loaded machine the control loop of one negative-control run first ran past
its one-minute budget (a timeout, not a verdict; rerun, it fails only where it should,
below). Its
seed carries no JP row, so the pair the rule names finds nothing there and every flag it
compares reads as before. The control arm first proves the seed makes the app say what
each arm expects (every flag true on some stub and false on another); stage 1's BASE
then agrees with `findConflictsForWindow` plus `blockingConflicts`, `checkAvailability`,
`checkClinicClosure`, `checkClinicWindow` and SCHED-17 (`listSharedResourcesTx` with
`sharedResourceLocationAllowed`, for the owner, as `sharedResourceBookingCheck` asks it)
on every flag of every stub; the twin the app sees nothing on reads 08; **the D5 arm**:
a NESA stub inside a live twin's longer person row is clear to the app and reads 17,
then, with STAFF-10 v2's W6 and W7 applied to that twin inside the test and undone
after, the app sees the booking and stage 1 reads 12; `appointment_conflicts` with no
JWT finds nothing where the inline rule finds the booking. The JP checks are the op's
own, not the app's (the app reads JP(cb) and JP(lv) as two therapists), so there is no
app answer to agree with: the fixture arms above are their proof. Round 2's negative
controls on the suite (SCHED-17's clause, the live twin's hold, the Terapeuta 2 arm, the
portal pedido clause), each failing on exactly its own stub, were not re-run: the rule's
lines they swap are unchanged. **Review round 3's two**, each a copy of stage 1 read by a
copy of the suite on its own new throwaway: the room trimmed by `btrim`'s default again
fails the agreement test on `room ends in a tab` (the rule reads no booking, the app
reads one), and the set without the no-break space fails it on `room ends in a no-break
space`; in both the control test passes, so the seed still says what the app says. The
suite is new, so
`.github/scripts/assert-rls-executed.mjs` covers it through its derived pass: it must
execute in the DB Tests job.

**What the rehearsal and the reviews caught.**

- **The pedido test the brief proposed was stale.** It excluded an unconfirmed pedido by
  its `appointment_request` notification only. 0067 redefined `is_unconfirmed_pedido`:
  a `scheduled` row whose `origin` is `patient_portal` is a pedido too. The files carry
  0067's body, the unit test fails if a later migration redefines the function, and the
  DB-gated suite's portal pedido arm proves it.
- **The app's reschedule enforces two checks the brief did not list**, the therapist's
  hours and the clinic's start window, outside the "Guardar mesmo assim" override. They
  are verdicts 10 and 11 (Q3, marked as an added default).
- **The carry parse read an echo line.** The first form of the stage blocks found a carry
  by substring, and stage 1 printed a note naming the fourth carry, so the parse read
  the note and got nothing; stage 2 stopped on `carry ... was not passed`. The blocks now
  match the carry's name exactly, stage 1 names no carry outside its carries section,
  and the unit test holds both.
- **The first lock arm proved nothing.** Its holder slept 25 seconds, and on a machine
  under load stage 2 reached its LOCK after the holder had let go, so stage 2 wrote. The
  op was right to; the arm was wrong. The holder now sleeps until the runner cancels it,
  and the runner checks it is still holding when stage 2 ends.
- **Review round 1 found two misses and two gaps, each now an arm that passes on the
  round 1 files and fails on this head:** the order with STAFF-10 v2 could double-book a
  NESA (S10e, verdict 17); the app's SCHED-17 refusal had no verdict (verdict 16);
  verdict 19 counted the live table (V19a, V19b); option (b)'s text promised a reach
  STAFF-10 v2's R17 forbids.
- **Review round 2 found one major and six minor defects, each now an arm or a
  statement that the round 2 files fail and this head passes:** JP's two staff rows
  could be booked twice (the JP arms, S10f: verdict 18 and arm `same_person`); the doc
  said the order did not change the write (the order section, S10g and S10h); W4 was
  left out (S10f); 16, 20 and 21 read OK over nothing (arm Q); the stage 2 header said
  the reschedule takes no advisory lock (it takes them on its destination slots); a
  pedido stub had no verdict (Q14); stage 3 could not be re-issued after the merge (D10,
  the after-merge arms). The first run of the new arms stopped before any stage ran: the
  handover extractor refuses any block that names `origin/main`, stage 3's fallback
  among them, so the extractor now exempts that one line and nothing else.
- **Review round 3 found two minor defects, each now an arm that the round 3 files fail
  and this head passes:** verdict 14 read OK over nothing checked on a day no written
  row sits at a clinic with a closure (Q14a and Q14b; arm Q's day is one too), and the
  room arm trimmed a room with `btrim`'s default, so a room ending in a tab or a
  no-break space missed the live row the app finds, and round 3 wrote both such stubs
  into a booked room (arm RM). The same arm shows the opposite: round 3 read a room of
  only a tab as a room and held a row the app would let through. This round's first
  full run also caught two faults of the rehearsal, not of the op: the round 1
  late-commit arm raced a fixed sleep on a loaded machine, and an older stage 3
  compared on a VACUOUS verdict also FAILed 12 on the whitespace-only room. The late
  booking now waits on the audit row, and those comparisons cancel the tab-room
  neighbour first.

**The pushed tree is the rehearsed tree.** The last full run of the arms runner
extracted every block from the commit that carries this section, sidecar included.

## What this does NOT do

- **It sends nothing.** A raw UPDATE runs no app path: no reminder is queued or moved,
  no staff notification is written, no patient is told. A reminder already queued for
  a written row goes at its own time, as before.
- **It writes no status, start, participant, service, room or confirmation.** Stage 2
  compares every other column of the written rows by md5, before and after, inside its
  transaction, and records the baseline; stage 3 compares it again (verdict 10), and
  every other appointment of the tenant too (verdict 23).
- **It does not touch a twin** (ruling 2): verdict 08 is STAFF-10 v2's.
- **It does not run before STAFF-10 v2** (ruling 5): R11 refuses.
- **It does not move a row between JP's two staff rows,** and writes none that sits on
  one of them at the other's clinic (verdict 18): that is reception's, as STAFF-10 v2
  leaves it.
- **It does not touch a staff-made one-minute row, a past row, or a row of any other
  length.** The population is the importer's ledger, one minute exactly, from now.
- **It writes no block and reads no patient name.** Section 9 reads the blocks and the
  series; it prints ids, times, counts and flags.
- **It does not stop a re-import from writing the minute back** (Q11).
- **It does not add a table** for provenance: the listing and the audit row are it.
