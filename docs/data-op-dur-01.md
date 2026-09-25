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
| Stage 1 | `scripts/data/dur-01-1-measure.sql`, READ ONLY, sha256 `95b9243b142776f132fe3559506998c8c0b3277def687db9823674988d0145eb` |
| Stage 2 | `scripts/data/dur-01-2-write.sql`, ONE DO block in ONE transaction, sha256 `20778922b5d4409f03d62bbbc9314c57d8b5c4e37c869f71c008a7db39a39978` |
| Stage 3 | `scripts/data/dur-01-3-verify.sql`, READ ONLY, 22 verdicts and a SUMMARY row, sha256 `d5a347834665bfe2aa628baca023d272c75d142ccf14f74776662f53ef99b61d` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, byte-identical to `origin/main` at `f4e892cd` |
| This document | `docs/data-op-dur-01.md`, pinned by `docs/data-op-dur-01.sha256` and asserted by every stage that reads a file |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `appointments.ends_at`, set to `starts_at` plus the service's `duration_min`, and `appointments.updated_at`, set to the op's clock, on the rows stage 1 classifies WRITE and on no other; ONE `audit_log` row, action `staff.dur01.extend_import_duration` |
| What no stage touches | every other column of those rows (status, start, both participants, service, room, confirmation, pack, notes), every other appointment, and every other table: `time_off`, schedule rows, reminders, invoices, clinical records. Stage 2 compares the written rows' other columns and every other appointment in the tenant by md5 inside its own transaction |
| Apply before merge | yes. The PR cannot merge while the label is on (`held-for-apply-blocks-merge.yml`), so every stage derives its head from `origin/data/DUR-01-import-stub-durations`, never from `main`. The one exception is stage 3, READ ONLY, re-issued after the merge has deleted the branch: it then reads the last `main` commit that changed its file, and its own sha256 pin still decides (the HEAD CHECK section) |
| Ids the stage files name | four, and no other: the two staff rows of JP, the one person the tenant holds twice (JP(cb) `54d486e0-a9c3-4c82-acac-8b909ce5a2d0`, JP(lv) `0c1a0000-0000-4000-8000-000000000001`), and the two clinics that are their own (Castelo Branco `de000002-0000-0000-0000-000000000002`, Linda-a-Velha `de000002-0000-0000-0000-000000000001`). They are `JP_CB`, `JP_LV`, `CB` and `LV` of `packages/db/scripts/staff-11-jp-one-clinic-check.mjs` on `main`, and the unit test holds them equal |

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
- **(b)** As (a), and also the NESA twins (verdict 08). Not built: a ruling for (b)
  changes the files, their pins and the rehearsal. **Said plainly, (b) cannot wait for
  STAFF-10 v2 on the twins that matter most.** STAFF-10 v2's R17 stops its WHOLE
  transaction on any live future twin whose person row is shorter than its NESA row,
  and the only documented case (AGENDA-TWIN) is exactly that: a one-minute person stub
  against an hour on the machine. While one such pair exists STAFF-10 v2 cannot run, so
  "(b) once STAFF-10 v2 has run" never reaches it. For those pairs (b) is either **run
  BEFORE STAFF-10 v2**, giving the person stub its service's default so that STAFF-10
  v2's R17 then passes, or it is not needed because **reception fixes those person rows
  by hand first**, after which they are no longer one minute and leave this op's
  population. Only a twin whose two halves are BOTH one minute can reach (b) after
  STAFF-10 v2: its person row keeps, still one minute, now naming the NESA as
  Terapeuta 2. Stage 1 section 1d counts each kind: of the live future pairs whose
  person half is an importer minute, how many stand against a longer NESA row (the
  AGENDA-TWIN shape, which its R17 refuses), how many have both halves one minute, and
  how many are neither.
- **(c)** No write. Reception edits every row by hand from stage 1's listing.

**Also for the owner, JP's two staff rows (ADDED DEFAULT, review round 2).** JP is one
person the tenant holds as two staff rows, JP(cb) for Castelo Branco and JP(lv) for
Linda-a-Velha, and the app's booking rule reads them as two therapists. Built: a
one-minute row on JP(cb) at Linda-a-Velha (or on JP(lv) at Castelo Branco) is never
written, it goes to reception (verdict 18), because STAFF-10 v2 hands exactly those rows
to reception and changes their hours and their staff row; and every other JP row is
held when the other staff row has a booking or a block over its extended hour (verdicts
12 and 13, arm `same_person`), so no write books JP twice. Once reception moves such a
row to JP(lv), it is a JP(lv) row at JP(lv)'s own clinic, still in the ledger and still
one minute, and a later stage 1 reads it like any other row. A different ruling, for
example to extend them where they stand, changes the files, their pins and the
rehearsal.

**recommendation:** run **stage 1 first, alone, as a measurement sitting** (the section
below). Rule on its section 4: if the rows sit mostly on therapists with a machine
alongside, reading 2 holds for those services and they should not be extended. Then run
stage 2 with **option (a)**, the option the files are built to, **after STAFF-10 v2**
when its R17 lets it run (section 1d says whether it can). **The order does change what
(a) writes, in two ways, both on JP's rows,** and neither order writes a row that books
a person or a NESA twice (the order section): STAFF-10 v2 first can write JP rows that
the JP(cb) block its W3 deletes would otherwise hold, and can hold JP(lv) rows that the
Saturday hours its W2 gives JP(lv) leave outside JP(lv)'s hours. Section 1e prints the
rows each way turns on.

## The defaults this op is built to

Each default is what the files do today. A different ruling changes the files, their
pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | Which rows are in scope? | Every appointment the importer wrote, found by its ledger row (`migration_staging_rows`: source `fisiozero`, entity `appointment`, status `imported`, `imported_entity_id`), lasting exactly one minute and starting now or later. Not `origin` (the importer writes the default, `staff`) and not `created_at` |
| Q2 | What is the service's default? | `services.duration_min` of the row's own service, the value the staff drawer takes when a service is picked (`apps/web/app/agenda/appointment-drawer.tsx`, `applyService`). It is one value per service; no clinic or therapist carries its own |
| Q3 | Which checks hold a row? | **Every check reception's own duration change would refuse without "Guardar mesmo assim"** (`rescheduleAppointment`, `apps/web/lib/scheduling/actions.ts`) that reads the row rather than the person making the change: SCHED-17, a NESA booked only at a clinic where it is installed (`sharedResourceLocationAllowed`, which refuses every role, the owner included, and which the reschedule asks before any check on the window); the therapist's hours (RB-03); the clinic's midday closure (0085); the clinic's start window (AGENDA-2100); and the booking conflicts (therapist, room, and a NESA resource as Terapeuta or as Terapeuta 2) and blocks. Plus six the app's reschedule does not check: a NESA twin, the same patient booked elsewhere, two one-minute rows that would collide once both are extended, the NESA hour a live twin's person row will hold after STAFF-10 v2 (verdict 17), a booking or block on JP's other staff row (arm `same_person` of verdicts 12 and 13, and verdict 14 between two stubs), and a JP row at the other row's clinic (verdict 18). **Not read, because a data op has no actor:** the two checks on the person making the change, STAFF-02's own clinics and SCHED-17's actor condition; the owner passes both. **ADDED DEFAULT:** the ruling named the closure, bookings, blocks, the same patient and the twin. SCHED-17, the therapist's hours and the start window are added because the app's reschedule enforces each outside the override, so reception could not make the change herself; verdict 17 is added so the order with STAFF-10 v2 cannot double-book a NESA; the JP checks and verdict 18 are added so neither order can double-book JP (Q15) |
| Q4 | A row that starts later on the run day? | Held (verdict 07), for reception. Stage 2 writes only rows starting from 00:00 Lisbon tomorrow, so the write set cannot move between stage 1 and stage 2 on the same day as starts pass |
| Q5 | A future row already `completed`? | Held (verdict 02). It is the DATA-future card's, not this op's |
| Q6 | A row with no service, or a service of one minute? | No service: held for reception (03), who can pick one. A one-minute service: left alone (04), the row already lasts its default |
| Q7 | Two ledger rows for one appointment, or a source row that does not read as one minute? | Held as findings (05, 06). The source duration is computed from the `inicio` and `fim` keys only, and only when both parse as the importer's own form on the same date |
| Q8 | `updated_at`? | Set to the op's clock on every written row, and the value before is kept in the audit row. NESA-SPLIT left it alone; this op sets it because the row did change and the app sets it on every edit |
| Q9 | When does stage 2 run? | **Outside clinic hours.** It locks `appointments` (SHARE ROW EXCLUSIVE) and `time_off`, `availability_templates`, `staff_notifications` (SHARE) for the seconds the transaction lasts, so no booking lands mid-write. A booking already in flight holds a lock; stage 2 waits five seconds for it and STOPS cleanly |
| Q10 | The order with STAFF-10 v2? | STAFF-10 v2 first when its R17 lets it run; this op first otherwise. The two orders do NOT give the same write: they differ on JP's rows in the two ways the next section names (STAFF-10 v2's W3 block deletion and its W2 Saturday hours), and in no other way. Neither order writes a row that double-books a person or a NESA, and neither leaves a written row for STAFF-10 v2 to move |
| Q11 | A re-run of the importer? | It would write the source's one minute back over this fix (`packages/db/src/migration/upsert.ts`, the re-run branch updates the row from the source). Noted for the owner; not something this op can prevent |
| Q12 | An undo? | Exact, from the audit row: the section "Undoing it". Documented, never run |
| Q13 | A row that would end after closing time? | Written if nothing else holds it. The app has no end-after-close rule (`apps/web/lib/scheduling/clinic-hours.ts`), so this op invents none; stage 1 prints the flag and counts it per clinic |
| Q14 | A one-minute row that is itself an unconfirmed pedido? | Held for reception (verdict 19), by the live filter's own pedido test (0067: scheduled, and from the portal or with an `appointment_request` notification). The rule does not read a pedido as live, so stage 2's re-measure could not see it as a row that holds its hour, and reception confirms or refuses it first. It cannot happen for an importer row today, since only the portal writes a pedido; the fixture builds all three shapes |
| Q15 | JP, one person held as two staff rows? | Built: a booking or a block on either row holds the person on the other (arm `same_person`), two stubs on the two rows are compared once both are extended (verdict 14), and a row on one row at the other row's clinic is held outright (verdict 18). R10 refuses when the pair does not resolve. The question block says why; the ids are STAFF-11's |
| D1 | Added: why is the rule inline? | `appointment_conflicts` and `is_unconfirmed_pedido` filter on `jwt_tenant_id()`, NULL in a psql session, so called from here they answer "no conflict" and "not a pedido" for every row. The rule is carried inline, with the tenant taken from the row, and the rehearsal proves the trap (arm T below) |
| D2 | Added: is the inline rule the app's rule? | `apps/web/lib/scheduling/dur-01-classification.db.test.ts` runs stage 1's own BASE block over a seeded tenant and, for every candidate, the app's `findConflictsForWindow` with `blockingConflicts`, `checkAvailability`, `checkClinicClosure` and `checkClinicWindow` under `runScoped`, and requires them to agree flag for flag, every arm with its opposite |
| D3 | Added: what if production carries a trigger main does not? | R05 refuses, and stage 2's P4 reads the catalog again under the lock and stops too |
| D4 | Added: what if the write set is empty? | R06 refuses: an empty write is a STOP, not a finished state, so every stage 3 arm always compares something |
| D5 | Added: can a held row be written by a verdict order that let it through? | No. R09 re-reads every flag, NULL-safe, on the WRITE set; R07 and R08 re-check the two collisions the database and the classifier could disagree on |
| D6 | Added: a STAFF-10 v2 write between stage 1 and stage 2? | Refused: the fourth carry is STAFF-10 v2's audit row count, and stage 2 compares it |
| D7 | Added: can a stub written before STAFF-10 v2 be double-booked by it? | No. Verdict 17 reads the person row of every live twin as already holding that twin's NESA over its whole window, which is what STAFF-10 v2's W6 makes it do; stage 2's re-measure and stage 3's verdict 21 read it again. And no row this op writes is one STAFF-10 v2 moves: verdict 18 holds every JP(cb) row at Linda-a-Velha, which its W4 takes, and verdicts 08 and 16 every row its W5 takes. The next section has both shapes |
| D8 | Added: why does stage 3 not count the table for its total? | A live count moves with the clinic: a later hard delete, or a booking that began before stage 2 and committed after it with an earlier `created_at`, would FAIL a correct write on its first verify. Stage 2 counts the total under its lock before and after the write and records both; verdict 19 compares the two recorded numbers |
| D9 | Added: which stage 3 verdicts may read VACUOUS, and why only those? | 14, 16, 18, 20, 21 and 22, each for a subject a real day may lack: no written row at a clinic with a midday closure configured (14: the closure is a per-clinic setting, and a day may write nothing at the one clinic that has one), no written row with hours configured (16), no row held (18), no written row on a NESA (20), none naming a NESA in either slot (21), none on a JP row (22). Each prints its subject, so a VACUOUS is read as "nothing to check", never as a pass. Every other verdict compares the written rows themselves, and R06 refuses an empty write set |
| D10 | Added: can stage 3 be re-issued after the PR merges? | Yes. The merge deletes the held branch, so `origin/data/DUR-01-import-stub-durations` stops resolving; stage 3's block then reads the last `main` commit that changed `scripts/data/dur-01-3-verify.sql` (not the tip of `main`, which later commits may move), prints which one, and asserts the file by its sha256 as before; the document at that commit checks against its own sidecar. Stages 0 to 2 never read `main` |
| D11 | Added: which room does the room arm read? | The candidate's room trimmed exactly as the app trims it before it asks `appointment_conflicts` (`args.room?.trim() || null` in `conflict.ts`): every character of ECMAScript's WhiteSpace and LineTerminator sets, the tab, the line ends and the no-break space among them, is stripped from both ends (CTE `c_room`, in the rule and so in every stage); a room that trims to nothing asks no room arm; the other row's room is compared as stored, both lower-cased, at the same clinic. Postgres `btrim` with no second argument strips the ASCII space only, so the round 3 files missed a room ending in a tab or a no-break space and could write a row reception's own change would refuse. The unit test holds `c_room`'s set equal to what JavaScript's trim strips over every code point of the Basic Multilingual Plane, and the DB-gated suite compares the two on a tab, a no-break space, a room of whitespace only and a tab inside the name |

## The order with STAFF-10 v2 (#1444)

STAFF-10 v2, in one transaction: retires or moves every active JP(cb) schedule row at
Linda-a-Velha (W1; W2 moves the dated real Saturdays JP(lv) does not hold to JP(lv)),
deletes one JP(cb) block over 30 September (W3), moves JP(cb)'s Linda-a-Velha
appointments that start before its run day to JP(lv), in any status (W4, its ruling a),
moves each past NESA twin row booked where its NESA is not installed to the NESA that is
(W5, ruling b), and resolves each FUTURE NESA twin whose two rows are both live by its
ruling (c): the person row keeps and takes the NESA as `practitioner_2` (W6, the NESA
row's own practitioner), and the NESA row is cancelled (W7). **From then on the NESA is
held over the PERSON window.** Its R17 lets that window be longer than the NESA window,
and stops its WHOLE transaction on any pair whose person window does not cover its NESA
window. Its R14 refuses a move that would put two overlapping confirmed rows on JP(lv).
JP(cb)'s FUTURE Linda-a-Velha rows stay on JP(cb): they are reception's list (its Q1).

**The two shapes that made the order matter, and what holds each.**

- **A NESA stub inside a live twin's longer person window.** A live future twin: the
  person row runs 10:00 to 11:00, the NESA row 10:00 to 10:30. A one-minute NESA stub of
  another patient starts at 10:30. Read by the app's rule alone, its hour, 10:30 to
  11:30, is clear of the NESA row (half-open) and the person row names no NESA, so it
  would read WRITE and be extended; STAFF-10 v2 would then hold the NESA on the person
  row until 11:00, and the machine would be booked twice. **Verdict 17 holds that
  stub.** The rule reads the person row of every live twin as holding that twin's NESA
  over its whole window, whether STAFF-10 v2 has run or not; after it has, no such live
  pair is left and verdict 12's Terapeuta 2 arm reads the same hold through
  `practitioner_2`.
- **JP booked twice across his two staff rows** (review round 2). A JP(cb) stub at
  Linda-a-Velha whose hour overlaps a JP(lv) booking there reads clear under the app's
  rule, which compares a row with its own therapist only. After STAFF-10 v2 it is worse:
  W1 and W2 leave JP(cb) no hours at Linda-a-Velha, so verdict 11 cannot hold it either.
  **Verdict 18 holds every JP row booked at the other row's clinic, in either order,**
  and arm `same_person` of verdicts 12 and 13 holds every other JP row whose hour
  overlaps a booking or a block on the other staff row. So no JP(cb) row at
  Linda-a-Velha is ever written, and W4 can never move a row this op wrote.

Stage 2's re-measure (A2) and stage 3's verdicts 12, 13, 21 and 22 read each hold again
after the write.

**Stage 1 classifies every shape either order can leave:**

| Shape | Where it comes from | What stage 1 does |
|---|---|---|
| a one-minute row with a live twin partner | STAFF-10 v2 not yet run, or its R17 stopped it | verdict 08, held for question option (b) |
| a one-minute person row whose twin partner is cancelled, naming the NESA as `practitioner_2` | STAFF-10 v2 run over a pair whose two halves are both one minute | verdict 08: the twin predicate reads the partner in any status. Its cancelled NESA half reads 01 |
| a one-minute NESA row over the NESA row of a live twin | STAFF-10 v2 not yet run | verdict 12 (the stub and the NESA row share a practitioner, arm `therapist`); section 5 also flags `twin_hold` when it overlaps the person row |
| a one-minute NESA row clear of a live twin's NESA row but inside its longer person window | STAFF-10 v2 not yet run | **verdict 17** |
| the same NESA row, once STAFF-10 v2 has run | the NESA's hour moved from the NESA row to the person row | verdict 12, arm `resource_as_terapeuta_2` on the person row |
| a JP(cb) row at Linda-a-Velha, with or without JP(cb) hours there | STAFF-10 v2 not yet run (hours there), or run (W1 and W2 took them) | **verdict 18** in both orders, unless an earlier verdict holds it first |
| a JP row whose hour overlaps a booking or a block on the other staff row | either order | verdict 12 or 13, arm `same_person`; verdict 14 when the other is a stub read at its proposed end |
| a JP(cb) row that this op wrote, past by STAFF-10 v2's run day | this op first | cannot exist: verdict 18 never lets a JP(cb) row at Linda-a-Velha be written, so W4 moves none of this op's rows and stage 3's verdict 10 cannot FAIL on it |
| a NESA row this op wrote, taken by W5 | this op first | cannot exist: W5 takes only rows of a past twin whose NESA is not installed at its clinic, and verdicts 08 and 16 hold both |
| a JP row inside the JP(cb) block W3 deletes | this op first: held (13); STAFF-10 v2 first: the block is gone | **differs by order.** STAFF-10 v2 first can write it. Section 1e counts the JP rows held by a block (`of_which_over_a_block`) |
| a JP(lv) row at Linda-a-Velha when JP(lv) holds no active schedule row there today | this op first: not configured, so no hours check; STAFF-10 v2 first: W2's Saturdays configure JP(lv), and verdict 11 holds a weekday row | **differs by order.** STAFF-10 v2 first can hold it; this op first writes it, and a stage 3 re-issued after STAFF-10 v2 then reads verdict 16 FAIL on it (the clinic moved). Section 1e prints `hours_rows_own_clinic` for JP(lv) |
| STAFF-10 v2's write landing between this op's stage 1 and stage 2 | the two sittings interleaved | stage 2 STOPS on the fourth carry (arm S10c) |

**Which order, and why.**

- **STAFF-10 v2 first, when its R17 lets it run.** It is ruled and due first. After it,
  the future twins are resolved, JP(cb) holds no Linda-a-Velha hours, the wrong
  30 September block is gone and JP(lv) holds its Saturdays, so the measurement reads the
  state that will stand and the owner's answers read against it.
- **It cannot run while any live future twin has a person row shorter than its NESA
  row.** The AGENDA-TWIN shape, a one-minute person stub against an hour on the machine,
  is exactly that. Stage 1's section 1d counts those pairs (`its_r17_refuses`, and
  `of_which_nesa_row_longer` for the importer's person minutes). Stage 1 reads it; it
  does not refuse on it.
- **If it cannot, this op may run first** under option (a). No row it writes is one
  STAFF-10 v2 later moves, cancels or re-attributes, and no NESA or JP is double-booked
  by either order. What it writes differs from the other order only in the two JP shapes
  above, and section 1e prints both before the owner decides. What unblocks STAFF-10 v2
  is those person rows reaching their NESA window: reception by hand, or option (b) run
  BEFORE STAFF-10 v2 (the question block).
- **Never interleave the two:** a sitting of this op, stage 1 to stage 2, has no STAFF-10
  v2 stage inside it, and stage 2 refuses if one landed.

## A measurement sitting: stage 1 alone

The recommendation asks for this before any decision about stage 2. GREEN runs STAGE 0,
the HEAD CHECK and STAGE 1 below and stops; stage 1 writes nothing, and nothing obliges
a stage 2 after it. Its transcript is the measurement:

- **section 1d**: the live future NESA twins STAFF-10 v2 resolves, how many of them its
  R17 would stop on, and how many person halves are the importer's one-minute rows, by
  kind (against a longer NESA row, both halves a minute, other): the facts the order
  and option (b) turn on;
- **section 1e**: JP's two staff rows: whether the pair resolves, each row's active
  schedule rows at its own clinic and at the other, its blocks from now, and its
  one-minute rows at its own clinic (how many read WRITE, how many a block holds, how
  many the other staff row holds) and at the other clinic (verdict 18): the rows the
  order changes;
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
- **After the PR has merged,** the branch is deleted and this block prints an error
  for `rev-parse`: that is expected, and stage 1 and stage 2 are over. Stage 3 alone can
  still be pasted: it then prints `the held branch is gone` and verifies from the last
  `main` commit that changed its file, under the same sha256 pin (D10).

## STAGE 0: the files, the pins and the head

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
DOCPIN=docs/data-op-dur-01.sha256
SHA1=95b9243b142776f132fe3559506998c8c0b3277def687db9823674988d0145eb
SHA2=20778922b5d4409f03d62bbbc9314c57d8b5c4e37c869f71c008a7db39a39978
SHA3=d5a347834665bfe2aa628baca023d272c75d142ccf14f74776662f53ef99b61d
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
SHA1=95b9243b142776f132fe3559506998c8c0b3277def687db9823674988d0145eb
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
[ "${RN}" = 10 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 10"; exit 1; }
REF=$(grep -E '^[[:space:]]*R[0-9]{2}[[:space:]]*\|.*\|[[:space:]]*REFUSE[[:space:]]*$' /tmp/dur01-stage1.out | sed -E 's/^[[:space:]]*(R[0-9]{2}).*/\1/' | tr '\n' ' ' || true)
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. Stage 2 refuses on the same lines. Report them; do not go on"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/dur01-stage1.out; }
RD=$(carry dur01_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 read the Lisbon day as ${RD}, and this machine's Lisbon clock disagrees"; exit 1; }
touch /tmp/dur01-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 1d, 1e, 2, 3, 3b, 4 and 6 before stage 2."
)
```

**Read the output before pasting stage 2.** Section 8 prints ten refusals, `R01` to
`R10`; the block has already stopped if any reads REFUSE. Section 8b must be empty. A
refusal that reads `VACUOUS` read an empty population: that is not a refusal, and the
sections above it say which population it was (R07 is VACUOUS on a day no WRITE row is
confirmed). Section 3b must read `partition holds`. Section 6 is reception's list.
Section 1d says whether STAFF-10 v2 can run yet (its R17), and section 1e what the order
changes on JP's rows, which the order section turns on; neither refuses anything.

## STAGE 2: the write

**Paste it outside clinic hours** (Q9), within the hour of stage 1, on the same Lisbon
day, after a second HEAD CHECK.

```
(
set -eo pipefail
BRANCH=data/DUR-01-import-stub-durations
SHA2=20778922b5d4409f03d62bbbc9314c57d8b5c4e37c869f71c008a7db39a39978
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
SHA3=d5a347834665bfe2aa628baca023d272c75d142ccf14f74776662f53ef99b61d
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse -q --verify origin/${BRANCH} || true)
[ -n "${PIN}" ] || { echo "the held branch is gone (its PR merged): verifying from the last main commit that changed stage 3"; PIN=$(git log -1 --format=%H origin/main -- scripts/data/dur-01-3-verify.sql); }
[ -n "${PIN}" ] || { echo "STOP: neither the held branch nor main carries stage 3"; exit 1; }
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
[ "${NV}" = 22 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 22"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/dur01-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '14|16|18|20|21|22' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/dur01-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "DUR-01 VERIFIED: ${PROFILE}. The RECEPTION section above lists every row stage 2 did not write, by id."
)
```

**EXPECT: no FAIL, 22 verdicts, a SUMMARY row, and VACUOUS on 14, 16, 18, 20, 21 and 22
at most**, which the block enforces (D9). Each of those six prints its subject: 14 the
written rows at a clinic with a midday closure configured, 16 the written rows with
hours configured, 18 the rows held, 20 the written rows on a NESA, 21 those naming a
NESA, 22 those on a JP row. A VACUOUS there says the day had nothing of
that kind to check, and is reported as that, never as a pass. Every other verdict
compares the written rows themselves, because R06 refuses an empty write set before the
write. The block prints the profile; the profile moves with the data, so no exact
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
| `12 OVERLAPS A BOOKING` | another live row (not cancelled, not no-show, not an unconfirmed pedido) on the same therapist, on JP's other staff row when the row is on one of the two (arm `same_person`), in the same room at the same clinic (the row's room trimmed as the app trims it, D11), or holding a NESA the row names in either slot, as Terapeuta or as Terapeuta 2, overlaps the extended window, half-open | reception |
| `13 OVERLAPS A BLOCK` | a `time_off` block on the therapist, or on JP's other staff row, overlaps it | reception |
| `14 OVERLAPS ANOTHER STUB ONCE BOTH ARE EXTENDED` | another live one-minute row, read at its own proposed end, shares a therapist (JP's two rows counting as one), a resource, a room or the patient | reception |
| `15 SAME PATIENT BOOKED ELSEWHERE` | another live row of the same patient overlaps it | reception |
| `16 NESA NOT INSTALLED AT THE CLINIC` | the row's Terapeuta is an active shared resource with no `staff_locations` row at the row's clinic (SCHED-17). The app refuses any change to it there, for every role; reception moves it to the machine installed at that clinic | reception |
| `17 OVERLAPS THE NESA HOUR OF A LIVE TWIN` | it names a NESA, in either slot, and its extended window overlaps the person row of a live twin on that NESA, which holds the machine over its whole window once STAFF-10 v2 has run (the order section) | reception |
| `18 ON A STAFF ROW MEANT FOR ANOTHER CLINIC` | it sits on one of JP's two staff rows at a clinic that is not that row's own: JP(cb) at Linda-a-Velha, or JP(lv) at Castelo Branco (Q15). STAFF-10 v2 hands these rows to reception and changes their hours and their staff row | reception, who moves it to the row for that clinic |
| `19 AN UNCONFIRMED PEDIDO` | the row itself is an unconfirmed pedido: scheduled, and from the patient portal or with an `appointment_request` notification (Q14) | reception, who confirms or refuses it |
| `WRITE` | none of the above | stage 2 writes it |

**The flags are printed for every row** (section 5), so a row held for one reason shows
every other that also applies, and section 6 lists each reason with the other row's id
and window. `ends_after_close` is printed and never a verdict (Q13).

**Stage 1 section 8 and stage 2 P2, the same ten lines.** `n` must be 0. `control` is
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

**The carries.** Four names, none a substring of another: the Lisbon run day, the WRITE
count, an md5 over every WRITE id with the epoch of the end stage 2 will give it, and
the count of STAFF-10 v2 audit rows. The block that computes them, between
`DUR-01 BASE BEGIN` and `BASE END`, is byte-identical in stage 1 and stage 2, so a
recomputed carry can only differ when the database moved. Stage 2 checks the digest
three times: recomputed by the BASE (P3), recomputed from the table under the lock
before the write (P5), and read back from the table after it (A1).

**Stage 3's 22 verdicts:**

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
21. no written id overlaps the NESA hour a live twin's person row holds, or will hold
    once STAFF-10 v2 has run (verdict 17's rule), VACUOUS when no written row names a
    NESA in either slot;
22. no written id sits on one of JP's two staff rows at the other row's clinic (verdict
    18's rule), VACUOUS when no written row is on a JP row.

**Stage 3 is re-issuable, and its answers move with the clinic.** A reception edit
after the sitting can change 3 to 18 and 20 to 22 honestly: a written row shortened
later FAILs 4, 5 and 6, one cancelled later FAILs 10 (status is a column the op does not
write), 11, 12, 17 and 21 (the re-measure no longer sees it as live), a new booking over
a written row FAILs 12 (on JP's other staff row too), a NESA taken out of a clinic FAILs
20, a new live twin booked over a written row FAILs 21, and a written JP row moved to
the other clinic FAILs 22. **STAFF-10 v2 run after this op moves it too, in one way:**
when JP(lv) held no active schedule row at Linda-a-Velha at this op's stage 1, its W2
then gives JP(lv) Saturday hours there, and a written weekday JP(lv) row there reads
verdict 16 FAIL (the second JP shape of the order section). It moves none of this op's
written rows (verdict 18 and verdicts 08 and 16 keep its W4 and W5 away from them), so
10 does not move with it. Read a later FAIL against the audit row's time, and against
STAFF-10 v2's, before calling it a defect of the op. **Verdict 19 does not move:** it
compares two numbers stage 2 counted inside its own transaction, under its lock, and
recorded. A live count would move with a later hard delete, or with a booking whose
transaction began before stage 2, waited on its lock and committed after it with a
`created_at` earlier than the audit row, and would FAIL a correct write on its very
first verify. When STAFF-10 v2 runs after this op, the NESA hold its W6 puts on a person
row is the one verdict 21 already read there: 21 reads 0 and 12 reads the same hold. The
block that computes 12 to 17 and 20 to 22, between `DUR-01 RECHECK BEGIN` and
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
`appointment_request` notification (a pedido), and confirmed (not one). One stub is
placed ninety minutes after the fixture loads, so it is always later on the run day.
The fixture is reset BY ID between arms, in FK order, and its shape is read back after
every reset.

| File, in the authoring lane's scratchpad (not committed, as for STAFF-10 v2) | sha256 |
|---|---|
| `rehearsal-dur01/fixture.sql` | `5fe22c3f9794048e91b63b7db90ada72de6a99d0f0475738cd377fc97d077d3d` |
| `rehearsal-dur01/reset.sql` | `0369d957d9d878574a09840068f615c20b5ed03d693d3bd880f4635a1baefc68` |
| `rehearsal-dur01/arms/*.sql`, one mutation per arm, concatenated in name order | `965840c545129863f5bff3fc5f081ff707aeded3e0158b9b256ec51074647af0` |
| `rehearsal-dur01/run-dur01-arms.zsh`, the arms runner | `0e4099b5c7289092e9b42f27ed8b6199be0366792f56349cefad1a6014226cd1` |
| `rehearsal-dur01/extract-stage.mjs`: the handover extractor (`f82cad1e6e8cc1be3b7c491fff787138161e0f079b6424119329d71c63d72198`) with ONE change, that stage 3's one fallback line may name `origin/main` (D10); every other refusal stands, on that line too | `d0208f3e18cee4dc3be24cefa0d1dc252e7c017dc9a57a3084fb4e00b3cdc674` |
| `rehearsal-dur01/r1/*.sql`, the round 1 stage files read from `d37ce61e`, checked against round 1's own pins before use | stage 1 `3942a09a061a422ed61d3e0ab58e730fa93de570290e841c2b1b4e269c5e2e5d`, stage 2 `aa28f519ae2b17c007b014a39f68a1a212c43cc67b7b3d947b1c1fa13d39642f`, stage 3 `fc3a9460d7e1aa303e6588b405ab0ab6caea19c445eccde54509004377ba55b4` |
| `rehearsal-dur01/r2/*.sql`, the round 2 stage files read from `6642f01b`, checked the same way | stage 1 `9897028bf670d3db3b6c0040ed8165782074fbf424030453728bbc2bcbf42db3`, stage 2 `35cea1ace3773e47f40fb37f3de639fc24f2873b031ba33a9c681e12d743a213`, stage 3 `65c7138337bc72db675b4180feb534bb21a8c5a165c43ad45774d31395125d74` |

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
| `WRITE` | the confirmed stub, R07's control; a booking starting exactly at the proposed end (half-open); a cancelled neighbour; a no-show neighbour; a portal pedido neighbour; a notified pedido neighbour; the same room name at the other clinic; a block starting at the proposed end; 12:30 at the clinic with no closure; a start exactly at the last start; two adjacent hour windows; a stub on the Castelo Branco NESA at Castelo Branco (the opposite of 16); JP(cb) at Castelo Branco and JP(lv) at Linda-a-Velha, each clear (the opposites of 18 and of arm `same_person`); a confirmed stub through the portal (the opposite of 19) |
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
| `12 OVERLAPS A BOOKING` | the therapist arm; the same pedido, confirmed; a room clash in another case with a trailing space; a NESA stub against a row naming that NESA as Terapeuta 2; a NESA stub against the NESA row of a twin (flagged `twin_hold` as well); the earlier of two stubs 30 minutes apart; **arm `same_person`**: the JP(cb) stub at Linda-a-Velha over the JP(lv) booking (flagged `person_away` too), the JP(cb) stub at Castelo Branco while JP(lv) is booked at Linda-a-Velha, and the earlier of the JP(lv) and JP(cb) stubs half an hour apart |
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
| stage 2 | 0 | L1 the locks and `lock_timeout 5s`; P0 no audit row; P3 the run day and all four carries match; P4 no trigger the system did not create; P5 the baselines; W1 its row count equal to the WRITE set; A1 the written ends reproduce the carried digest; A2 the re-measure reading every written row as live and every arm at 0, `person_away` included, with the subjects of 20, 21 and 22 each above 0; A3 the total and both md5s unchanged; `DONE`, `COMMITTED`. Every WRITE row then ends at its start plus its default; every held stub still lasts one minute; the audit row lists the written ids and the held ids under each verdict |
| stage 3 | 0 | `22 OK / 0 VACUOUS / 0 FAIL`, then the RECEPTION section by id |
| stage 3 after the merge (D10): the branch deleted from the private origin, `main` set to a commit carrying the same tree | 0 | `the held branch is gone (its PR merged)`, `verifying from 0bb3465`, the round 3 fix commit, the last to change stage 3 (the head is the later record commit), `22 OK / 0 VACUOUS / 0 FAIL` |
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
| **the whole op on a day no written row has hours configured, is on or names a NESA, or is on a JP row** (the stubs of each kind cancelled) | 0, 0, 0 | none; VACUOUS on 16, 20, 21 and 22, each printing its subject at 0: `18 OK / 4 VACUOUS / 0 FAIL`. **Round 2's stage 3 on the same written database reads `21 OK / 0 VACUOUS / 0 FAIL`**: its 16, 20 and 21 called nothing checked OK, the review's point | |

**Verdict 19 does not move with the clinic (D8).** Each arm passes on this head and
FAILs on the round 1 files, run directly on the same fixture with the same change:

| Arm, after the write | This head, stage 3 | Round 1 files, stage 3 |
|---|---|---|
| V19a: an unrelated appointment hard-deleted | exit 0, verdict 19 `after 72 / before 72` OK, `22 OK / 0 VACUOUS / 0 FAIL` | FAIL on 19 only, `18 OK / 0 VACUOUS / 1 FAIL` |
| V19b: a booking whose transaction began before stage 2 (it slept on an open transaction while stage 2 ran) and committed after it; the runner confirmed its `created_at` is earlier than the audit row's | exit 0, the same `22 OK / 0 VACUOUS / 0 FAIL` | FAIL on 19 only, `18 OK / 0 VACUOUS / 1 FAIL`: the first verify of a correct write |

The round 1 and round 2 files have no pedido verdict, so every arm that runs them first
takes the two pedido stubs out of the ledger (`arms/OLD-no-pedido.sql`), except the
arm below that shows what they do with them.

**JP's two staff rows (review round 2, the MAJOR).**

| Arm | This head | Round 2 files, the same fixture |
|---|---|---|
| stage 1 on the JP stubs | the clear JP(cb) stub at Linda-a-Velha and the JP(lv) stub at Castelo Branco read 18; the review's shape (JP(cb) at Linda-a-Velha over a JP(lv) booking), the JP(cb) stub at Castelo Branco while JP(lv) is booked, and the earlier of the two stubs half an hour apart read 12, arm `same_person`; the later reads 14; the JP(lv) stub under the JP(cb) block reads 13; the clear stub on each row reads WRITE | every one of those reads WRITE |
| stages 2 and 3 | exit 0, 0; JP booked twice afterwards: 0 overlapping pairs of live JP(cb) and JP(lv) rows; no JP(cb) row at Linda-a-Velha written; `22 OK / 0 VACUOUS / 0 FAIL` | exit 0, 0; JP booked twice afterwards: 3 overlapping pairs, and round 2's own stage 3 reads `21 OK / 0 VACUOUS / 0 FAIL` over them. This head's stage 3 on that database FAILs on 12, 13 and 22 |

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
block reading `main` without its guard (U12). Each failed its own test (and the pin
test, since the file moved; U7, U9 and U11 also the byte-identity tests, as each touched
stage 1 only); the unmutated copy passes all.

**The app's own checks, on a real database.**
`apps/web/lib/scheduling/dur-01-classification.db.test.ts`, unchanged this round, against
a new throwaway cloned from `s10v2_schema`, reading this round's BASE block: **5 passed**. Its
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
portal pedido clause), each failing on exactly its own stub, were not re-run: the suite
and the rule's lines they swap are unchanged. The suite is new, so
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

**The pushed tree is the rehearsed tree.** The last full run of the arms runner
extracted every block from the commit that carries this section, sidecar included.

## What this does NOT do

- **It sends nothing.** A raw UPDATE runs no app path: no reminder is queued or moved,
  no staff notification is written, no patient is told. A reminder already queued for
  a written row goes at its own time, as before.
- **It writes no status, start, participant, service, room or confirmation.** Stage 2
  compares every other column of the written rows by md5, before and after, inside its
  transaction; stage 3 again.
- **It does not touch a twin** (option (a)): verdict 08 is held for the owner.
- **It does not move a row between JP's two staff rows,** and writes none that sits on
  one of them at the other's clinic (verdict 18): that is reception's, as STAFF-10 v2
  leaves it.
- **It does not touch a staff-made one-minute row, a past row, or a row of any other
  length.** The population is the importer's ledger, one minute exactly, from now.
- **It does not stop a re-import from writing the minute back** (Q11).
- **It does not add a table** for provenance: the listing and the audit row are it.
