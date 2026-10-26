# R14-PROFILE, 2026-10-27: the appointments profile, counts and dates only

**READ ONLY. One block. No window, no apply, no write.**
**Status: AUTHORED 2026-10-26; THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-r14-profile-20261027.test.mjs`); THE SQL NOT YET REHEARSED ON A THROWAWAY (pending a free database lane); NOT YET REVIEWED (R4).** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, which names `<MERGED>` and this document's sha256.

## Why this read exists

Strategy's R14, deliverable 2: "one read-only GREEN profile document. Counts and date ranges only. Never names, patient ids or free text." It answers, from production, the questions the code alone could not settle (the clinic's Q1 to Q10 on appointments, and R12's AI-recording counts). Its output stays in `/Users/ivan/osteojp-handover/`, never in the repository.

It is information, not a gate on anything else. It writes nothing.

## What it reads

`scripts/db/read-r14-profile-20261027.sql`, sha256 `64dc5f49d06e1ae8057c4c0a2ac261fbd2da7e4d30022e7bcfb078e154547d63`. One result set, columns `n | check | observed | expected | verdict`, ordered by `n` then `check`.

**What may be printed:** counts, Lisbon dates and months, a clinic CODE (`LV`, `CB`, `MN`, found by name as MN-READ finds them), and words from fixed lists: the appointment `status` and `confirmation_state` values, the origin class (`imported`, `native_staff`, `native_portal`), the source `estado` (`realizada`, `falta`, `marcada`, else `other`), the block `reason`, the consultation state (`pending`, `fired`, `needs_attention`, else `other`), the SMS outcome (`confirmed`, `cancelled`, `opt_out`, `review`, else `other`). **Never printed:** a name of a person, a patient id, an appointment id, a staff id, a phone, an email, a NIF, a date of birth, a note, a source row, an audit metadata value outside the named keys, an error text, a service name. Names are matched inside SQL only (the person-rows rule, the duplicate-looking patients, the placeholder patients), and only counts leave the match.

**Definitions.** *Imported*: the appointment's id is an `imported_entity_id` of the import ledger (`source_system` `fisiozero`, `entity_type` `appointment`, `status` `imported`), the only marker there is. *Native*: every other row, `native_portal` when `origin` is `patient_portal`, else `native_staff`. *Year* and *month*: of the CURRENT planned start, in Lisbon. *Moved*: a native row whose start differs, to the minute, from the `startsAt` of its first `appointment.create` audit row.

### The verdicts (each with a control, so a zero never passes by default)

| n | Check | OK when | Otherwise |
|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | FAIL |
| 1 | every location is one of LV, CB, MN by name: LV once, CB once, MN at most once, no OTHER, no AMBIGUOUS | as stated | FAIL |
| 2 | there is something to measure: imported appointments, native appointments, live patients, appointments whose service has a default length | each > 0 | VACUOUS |
| 3 | the reschedule measure can see a move: native rows whose first create row carries `startsAt` | > 0 | VACUOUS |
| 4 | schedule coverage has rows: `availability_templates`, `time_off` | each > 0 | VACUOUS |
| 5 | the person-rows rule finds the known splits: the two JP rows (their ids are in `docs/data-op-staff-10-v2.md`) fall in one group, and every row named like NESA (two or more) falls in one group | as stated | VACUOUS |
| 6 | no printed row carries a uuid fragment (`-xxxx-xxxx-`), an at sign or nine digits in a row (a phone or a NIF) | `0 of N`, N > 0 | FAIL |

The expected profile is **7 OK / 0 VACUOUS / 0 FAIL**.

### The INFO rows, by ruling bullet

The `check` text of every INFO row starts with the bullet it answers (B1 to B7; B7 is R12) and the count of the code answers it implements (P1 to P30, private file `r14-q1-q10-code-answers-20261026.md`). Rows marked *Q* go beyond the bullet's words and are included because they settle one of Q1 to Q10.

| n | Bullet | What it counts |
|---|---|---|
| 10 | B1, P1 | appointments by origin class and clinic: rows, first and last Lisbon start date |
| 11 | B1, P2 | appointments by year, clinic, origin class and status |
| 12 | B1, P2 | the same by month, for the last 13 months |
| 13 | B1, P3 (Q1, Q8) | imported appointments by source `estado`, mapped status and clinic (the size of the "past `marcada` became `cancelled`" bucket) |
| 14 | B1, P4 (Q8) | imported appointments by clinic: first and last Lisbon `created_at` date, distinct import days |
| 15 | B1, P5 (Q1) | past rows still `scheduled` or `confirmed` (outcome unknown), by month (last 13) or year, clinic and origin |
| 16 | B1, P6 (Q1) | native rows by `confirmation_state` and status |
| 17 | B1, P15 P18 (Q3, Q5) | by year and origin: rows on a shared-resource practitioner, with a second therapist, with a booking group, with a second patient |
| 18 | B1, P13 (Q3) | imported rows with no service, by clinic, and the COUNT of distinct source service types among them (never the types) |
| 19 | B1 | import ledger appointment rows, and how many of their appointments no longer exist |
| 20 | B2, P8 | native rows by origin: rows, with any audit row, with a create row, whose create row carries `startsAt` |
| 21 | B2, P10 | SAME ROW MOVED: native rows moved from their first planned start; of those, with an `appointment.reschedule` row, with only a `rescheduled` staff notification, with neither |
| 22 | B2, P9 | `appointment.reschedule`: audit rows, distinct appointments, appointments moved 1, 2, 3+ times, of those still present |
| 23 | B2 | NEW ROW: native rows created as a copy (`clonedFrom`); cancels with a known time; of those, followed within 24 hours by a new native row for the same patient (a reschedule done as cancel plus rebook) |
| 24 | B2, P7 P11 P20 (Q2, Q5) | appointment audit rows by Lisbon month: create, update with and without from/to status, reschedule, cancel, estado correction, hard delete, create and reschedule with `allowConflict` |
| 25 | B2, P11 (Q1) | estado corrections by from and to status |
| 26 | B2, P11 (Q2) | patient SMS replies by outcome |
| 27 | B2, P11 (Q2) | staff notifications by Lisbon month: distinct appointments cancelled, rescheduled |
| 30 | B3 | duration by origin class: `1 minute`, `service default`, `other` (shorter, longer, no service) |
| 31 | B3, P16 (Q5) | duration in minute bands by origin class and clinic |
| 32 | B3, P17 (Q5) | imported one-minute rows, past or future, by status |
| 33 | B3, P19 (Q5) | rows (not cancelled, not no_show) overlapping an earlier row of the same practitioner, by year and origin |
| 34 | B3, P20 (Q5) | native rows not cancelled whose start falls outside every active schedule row of that practitioner, clinic and weekday (TODAY's rows), by month |
| 40 | B4 | schedule rows in force (active, created by then, valid in the month), by month from the first month to two months ahead, and clinic: person rows, holders, weekly hours; shared rows |
| 41 | B4 | blocks overlapping the month, by month from the first month to two months ahead, and reason: person blocks, people, hours inside the month; shared blocks |
| 42 | B4, P22 (Q6) | schedule rows by kind, active, `valid_from` set, `valid_until` set: rows and created date range |
| 43 | B4, P23 P24 (Q6) | schedule audit rows by Lisbon month (template create, update, archive, day removal, alternating, day by day; block create, update, delete; staff delete; location update) |
| 44 | B4, P24 (Q6) | blocks by kind, reason and length |
| 45 | B4, P25 (Q6) | each clinic's hours: active, opens, closes, midday closure, slot minutes |
| 50 | B5 | DUPLICATE-LOOKING PATIENTS: six candidate rules, groups and rows each (below) |
| 51 | B5, P26 (Q7) | patients: live, merged, deleted; live linked to 2+ clinics; live with appointments at 2+ clinics; imported |
| 52 | B5, P26 (Q7) | patients by Lisbon year of `created_at` and imported or native |
| 53 | B5, P27 (Q7) | patients by year, clinic and origin of their FIRST completed visit |
| 54 | B5, P21 (Q5) | placeholder-looking patients (the `cb-reconciliation.sql` section 11 pattern): count, and their appointments by year and status |
| 60 | B6 | PERSON ROWS: users rows in groups of 2+; groups of 2, 3, 4+; groups holding a shared resource; at 2+ clinics; with 2+ active rows; with 2+ bookable rows |
| 61 | B6, P14 | bookable people (not shared resources): how many map to 0, 1, 2, 3+ services; deliver 0, 1, 2, 3+ distinct services in completed visits, all time and last 365 days; how many are active |
| 62 | B6, P12 | services: total, active, patient bookable, internal only; distinct default lengths |
| 70 | B7 (R12) | `R12_FIRES`: consultations created in the last 90 days, and of them pending, sent (`fired`), needs attention; the same three states all time; any other state |
| 71 | B7, P28 | consultations in the last 90 days by Lisbon month and state |
| 72 | B7, P29 | pending with the last attempt over an hour ago; needs-attention oldest and newest created date |

**B6 caveat.** There is no service AREA anywhere in the schema (Q3). Row 61 counts services, which is the upper bound of areas; areas need the ruled service-to-area list first.

**The person-rows rule (B6, verdict 5).** `users` rows grouped by their full name with accents folded, any bracketed text removed (so `(CB)` and `(LV)` go), a trailing clinic code (`CB`, `LV`, `MN`) removed, spaces and case normalised. Verdict 5 proves it on the two splits on record.

### B5: the 2,288 rule is not on record

No rule for the earlier 2,288 figure was found: not in the repository on any branch (`git grep` for `2288`, `2,288` and `2.288` across every remote branch, `docs/`, `scripts/`, `packages/db/scripts` and `docs/board/portal-board.json`), not in the handover folder, and not in the lane's memory. Row 50 therefore prints six candidate rules side by side, so the one that reproduces 2,288 names itself, and the rule needs a ruling. All of them read live rows only (not deleted, not merged), and a row's clinics are its `patient_locations` links plus the clinics of its appointments:

| Rule | Groups of two or more live rows sharing |
|---|---|
| D1 | the normalised full name, and the group touches two or more clinics |
| D2 | the normalised full name and the date of birth, two or more clinics |
| D3 | the normalised full name, any clinic |
| D4 | the normalised full name and the date of birth, any clinic |
| D5 | the NIF (digits only) |
| D6 | the mobile number (context only: families share numbers) |

Recommendation if none reads 2,288: D2. Name alone joins namesakes; NIF is missing on many imported rows; a name and a date of birth on rows linked to different clinics is the shape the import produces when one person had a different `id_paciente` in each clinic's delivery.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed, except where the STOP line says to report only that line. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to the database, so no STOP leaves anything changed.** A VACUOUS or FAIL verdict stops the block after the table has printed: report the table from the transcript file.

## THE GATE

The ruling's gate: "CHECK the profile output. EXPECT no personal data and no patient row ids." Three layers carry it:

1. the read prints only what the list above allows, and the test (`scripts/read-r14-profile-20261027.test.mjs`) refuses any select list that names a personal column, any printed CTE that names an id column, and any `raw` or `metadata` key outside the named ones;
2. verdict 6 reads every printed row for a uuid fragment, an at sign or nine digits in a row, inside the transaction;
3. the block reads the transcript file for the same three before it counts the verdicts, and STOPs with "report this line only" when any is there.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-r14-profile-20261027.sql`, sha256 `64dc5f49d06e1ae8057c4c0a2ac261fbd2da7e4d30022e7bcfb078e154547d63` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes MN-READ pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-r14-profile-20261027.sha256` pins it |
| The commit | the dispatch names the merge commit in `MERGED`; the block refuses a sha that is not on `origin/main` |
| The transcript | `/Users/ivan/osteojp-handover/r14-profile-20261027.out`, outside the repository |

## When

Any time, while no other GREEN sitting runs. It is read only, so the clinic-hours rule for sittings does not apply. The read takes at most 300 seconds.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
MERGED=PENDING
DOCSHA=PENDING
SHAREAD=64dc5f49d06e1ae8057c4c0a2ac261fbd2da7e4d30022e7bcfb078e154547d63
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-r14-profile-20261027.sql
DOC=docs/read-r14-profile-20261027.md
OUT=/Users/ivan/osteojp-handover/r14-profile-20261027.out
echo "${MERGED} ${DOCSHA}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64}' || { echo "STOP: the merge commit or the document's sha256 still reads PENDING, so it is NOT READY. Nothing was read"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
DIRTY=$(git status --porcelain) || { echo "STOP: the worktree's status could not be read. Nothing was read"; exit 1; }
[ -z "${DIRTY}" ] || { echo "STOP: the apply worktree is not clean. Nothing was read"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed. Nothing was read"; exit 1; }
git merge-base --is-ancestor ${MERGED} origin/main || { echo "STOP: the merge commit ${MERGED} is not on origin/main. Nothing was read"; exit 1; }
git checkout --quiet --detach ${MERGED} || { echo "STOP: the merge commit could not be checked out. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${MERGED}" ] || { echo "STOP: the worktree is not on the merge commit [${HD}]. Nothing was read"; exit 1; }
echo "checked out: ${HD}"
D=$(shasum -a 256 ${DOC} | cut -d' ' -f1) || { echo "STOP: this document could not be hashed. Nothing was read"; exit 1; }
echo "document:    ${D}"
[ "${D}" = "${DOCSHA}" ] || { echo "STOP: this document is not the one the dispatch names. Nothing was read"; exit 1; }
shasum -a 256 -c docs/read-r14-profile-20261027.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
R=$(shasum -a 256 ${READFILE} | cut -d' ' -f1) || { echo "STOP: the read could not be hashed. Nothing was read"; exit 1; }
echo "read:        ${R}"
[ "${R}" = "${SHAREAD}" ] || { echo "STOP: the read on disk is not the reviewed file. Nothing was read"; exit 1; }
G=$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
echo "guard:       ${G}"
[ "${G}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
M=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
echo "module:      ${M}"
[ "${M}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was read"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was read"; exit 1; }
rm -f ${OUT} || { echo "STOP: the old transcript could not be removed. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '300s'" -c "select 'read only: ' || current_setting('transaction_read_only') as profile_read_transaction" -f ${READFILE} -c "rollback" 2>&1 | tee ${OUT} || { echo "STOP: the read did not complete (an error, or longer than 300 seconds; psql's lines are above), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are above), so its table is not reported"; exit 1; }
PD=$(awk '/@/ || /-[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]-[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]-/ || /[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]/ { c++ } END { printf "%d", c }' ${OUT}) || { echo "STOP: the transcript could not be checked for personal data. Report this line only"; exit 1; }
[ "${PD}" = "0" ] || { echo "STOP: ${PD} transcript line(s) carry a uuid fragment, an at sign or nine digits in a row. Do NOT report the table; report this line only"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d %d %d", o, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. Report the table from the transcript file"; exit 1; }
echo "verdicts (OK VACUOUS FAIL): ${CNT}"
[ "${CNT}" = "7 0 0" ] || { echo "STOP: the read's verdicts are not 7 OK / 0 VACUOUS / 0 FAIL. Report the table from the transcript file; its INFO rows are not to be relied on"; exit 1; }
L=$(grep -E '^[[:space:]]*70[[:space:]]*[|][[:space:]]*R12_FIRES[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no R12_FIRES row. Report the table from the transcript file"; exit 1; }
echo "R14-PROFILE PASSED: 7 OK / 0 VACUOUS / 0 FAIL, and no uuid fragment, at sign or nine-digit run in the transcript. The whole table is in ${OUT}. R12: ${L}"
)
```

**EXPECT:** `checked out: <MERGED>`; `document:`, then `docs/read-r14-profile-20261027.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; psql's `BEGIN`, `SET`, the row `read only: on`, the table (verdicts 0 to 6 OK, then the INFO rows), `ROLLBACK`; `verdicts (OK VACUOUS FAIL): 7 0 0`; then `R14-PROFILE PASSED: ...` with the `R12_FIRES` row. Exit 0. The table stays in `/Users/ivan/osteojp-handover/r14-profile-20261027.out`; GREEN reports the PASSED line and the path, and SOLO reads the file. It writes nothing to production.

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly: `set transaction read only; set local statement_timeout = '300s';`
3. Below it, paste the whole of `scripts/db/read-r14-profile-20261027.sql`. To copy it exactly, once the clone is on main, type this in Claude Code. It copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! F=/Users/ivan/Projects/GitHub/osteojp-solo-clone/scripts/db/read-r14-profile-20261027.sql; [ "$(shasum -a 256 "$F" | cut -d' ' -f1)" = "64dc5f49d06e1ae8057c4c0a2ac261fbd2da7e4d30022e7bcfb078e154547d63" ] && pbcopy < "$F" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1 to 6 must read `OK`.
5. Download the result as CSV into `/Users/ivan/osteojp-handover/`, and tell SOLO the file name. It holds counts, dates and codes only.

## Rehearsal

PENDING: the SQL has not run on a database yet. It runs on a throwaway on a free lane (the `public` schema copied from the local database, synthetic rows only), as the block runs it (`begin read only`, 300 seconds, `rollback`), with these cases: the clean profile (7 OK); each verdict flipped by its seeded fault (a second Linda-a-Velha row, no imported rows, no create row with `startsAt`, no time_off rows, the JP rows renamed apart, a printed row carrying a uuid in a mutant of the read); and a synthetic placeholder patient and a synthetic duplicate pair, counted and never named.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway. So the block's production path (the environment file, the guard, the connection) is NOT REHEARSED. What stands in for it: the SQL rehearsal above (pending) with exactly the block's psql arguments, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit and that the block passes only on the profile `7 0 0` with an `R12_FIRES` row and a transcript free of uuid fragments, at signs and nine-digit runs.
