NOT READY: reworked for the per-type list 2026-11-05, R4 three rounds on the rework (rounds 1 to 3 PASS, last at e56f35c2), the blocks REHEARSED OK at 35d44346 by an independent session up to each target guard (the ids-file STOP moved above the clean-up after it, NOT YET REHEARSED), the night Thu 2026-11-19 conditional on Q6-D (the accountant's written confirmation before Thu 11-19 12:00 Lisbon), 0110 not applied.

# Q6: the existing appointment types take the VAT rate and exemption code the accountant confirms, type by type

**Status: AUTHORED 2026-11-04 BY SOLO; REWORKED 2026-11-05 FOR THE PER-TYPE LIST STRATEGY RULED THAT DAY (Q6-D). THE REWORKED SQL CHECKED BY THE AUTHOR ON A LOCAL THROWAWAY; THE BLOCKS REHEARSED OK AT `35d44346` BY AN INDEPENDENT SESSION, UP TO EACH TARGET GUARD; ONE BLOCK LINE MOVED AFTER IT (THE PRE-CHECK's ids-file STOP, above its clean-up), AND THAT DELTA IS NOT YET REHEARSED (see "Rehearsal" and "NOT REHEARSED"). R4 ROUNDS 1 AND 2 WERE ON THE ONE-VALUE VERSION; R4 RAN THREE ROUNDS ON THE REWORK, ROUNDS 1 TO 3 PASS, THE LAST AT `e56f35c2` (see "Review history"). NOT RUN.** Nothing in this document may be pasted until its first line reads READY, except THE READ-OUT, which has its own gate (section "THE READ-OUT"). THE PRE-CHECK carries `PENDING` in the seven lines GREEN's dispatch fills, THE ROLLBACK in three and THE READ-OUT in two, and each STOPs at its first check while they do.

**In plain words.** Migration 0110 (held pull request #1704) adds two empty fields to every appointment type: the VAT rate and the VAT exemption reason (the Motivo). Strategy ruled on 2026-11-05 that the clinic's accountant confirms the values type by type, and that this operation writes those confirmed values: for each type either 0% with its exemption code, or a stated rate (6, 13 or 23) with no code. The values come from a small list, one row per type, kept outside the repository (the repository is public, and the clinic's type list stays out of it). This operation fills the two fields, once, on every appointment type of the clinic where both are still empty, each with its own row of the list. It changes nothing else: not the price, not the name, not any appointment, invoice or patient. A type where staff already chose a rate or a code is left exactly as staff left it, even when the list names it.

A separate read-only block, THE READ-OUT, runs on an earlier day and writes the clinic's appointment types (id, name, active or archived, internal-only or not, the two VAT fields as they stand) to a file the owner gives the accountant. It writes nothing to production.

| Fact | Value |
|---|---|
| Rulings | Strategy, Q6, 2026-11-04, and B9, B10, Q6-A to Q6-D, 2026-11-05 (quoted in the next section) |
| Card | `Q6-service-types-vat-m07` |
| Tier | C, a production data op. NEW: it is on no ruled Tier C list, and it writes production rows outside STAFF-10. Strategy's Q6 and its rulings of 2026-11-05 rule what it writes and the night |
| Precondition | 0110 is applied to production, in an earlier sitting (`packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql` at the head of #1704, which takes the next free number when it is promoted; its night is Tue 2026-11-10). THE PRE-CHECK and THE WRITE read `information_schema` and refuse while the two columns, or their two CHECK constraints, are not there |
| Stage 0 | `scripts/data/q6-vat-m07-0-readout.sql`, READ ONLY, for building the list on an earlier day, sha256 `b189bd6ea335161aefa88c02895e8eb1db6b80f84658a7d7473f60f95daec4da` |
| Stage 1 | `scripts/data/q6-vat-m07-1-precheck.sql`, READ ONLY, sha256 `0dacf2328530f36f0fe9d929fdf38a0e64cd5fb058a3ca5fea75772341891528` |
| Stage 2 | `scripts/data/q6-vat-m07-2-write.sql`, ONE transaction, sha256 `21dec237bbc807a32bce2a6a14d216ab45f433b4d58d8cbe4f391129d0e3cd28` |
| Stage 3 | `scripts/data/q6-vat-m07-3-postcheck.sql`, READ ONLY, sha256 `89132951f8edbabb48040355c20cc6fa4dada94e0873b371a3a0f42f9de94dd3` |
| Rollback | `scripts/data/q6-vat-m07-4-rollback.sql`, ONE transaction, run only on the lead's word, sha256 `48aa5859352a3f27d1ddb42892487854128e483b12662a2f60d00a764cd29c2a` |
| The list | `/Users/ivan/osteojp-handover/q6-vat-list.csv`, NEVER committed. Its format is in "The per-type list". Its sha256 is pinned in GREEN's dispatch (`LISTSHA`). THE PRE-CHECK copies it once to a private snapshot, `/tmp/q6-list.csv` (mode 600), hashes the snapshot and stops on a mismatch before it reads production; every psql call reads the snapshot only |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`, and its module `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the bytes R14-PROFILE and R36 pin) |
| This document | `docs/data-op-q6-service-types-vat-m07.md`, pinned by `docs/data-op-q6-service-types-vat-m07.sha256`; GREEN's dispatch names its sha256 in `DOCSHA` |
| Test | `scripts/q6-service-types-vat-m07.test.mjs`: the pins, the SQL's shape, every refusal of the list, and every block under fault injection in bash and zsh |
| Who runs it | GREEN, an apply-only session, on the owner's dispatch naming the stage files above by filename (`CLAUDE.md`, "Who applies migrations"). SOLO wrote it and never runs it |
| Run from | The HELD head of this branch's pull request #1724, fetched explicitly as `refs/pull/1724/head` (never the branch name), pinned to `HELD` and checked out detached in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. GitHub keeps that ref after a merge and after the branch is deleted, so the blocks work before and after the pull request merges, the rollback included. The pull request stays held, unmerged, until GREEN reports |
| When | Thu 2026-11-19, from 21:00 Lisbon until 06:29 Lisbon on Fri 2026-11-20, and closed by the weekday table; ONLY IF the accountant's written confirmation (Q6-D) reached the owner before Thu 2026-11-19 12:00 Lisbon. Without it the night is skipped and nothing is written. THE PRE-CHECK refuses unless RUNDAY is later than MIGNIGHT, the night 0110 was applied (D18), and unless Q6DAT, the time the confirmation reached the owner, is before 12:00 on RUNDAY (D20) |
| What it writes | `services.vat_rate` and `services.vat_exemption_code`, each target row from its own list row; one `audit_log` row per written service, action `service.vat_default_q6` |
| What it records locally | The written ids, one per line, in `/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt` (written by psql before the COMMIT, never printed), and THE WRITE's transcript beside it. Counts-only transcripts, the sitting's records and the list's private snapshot (`/tmp/q6-list.csv`, mode 600) under `/tmp/q6-`. THE READ-OUT's file under `/Users/ivan/osteojp-handover/` |
| What it prints | Counts, column types, the words on and off, sha256 pins and commit shas. Never a service name, an id, a price, a line of the list or any other column. THE READ-OUT writes names and ids to its file only, and prints counts |

## The rulings (strategy, 2026-11-04 and 2026-11-05)

Strategy's Q6 of 2026-11-04, as SOLO's dispatch relayed it: the existing appointment types take Fisiozero's VAT values. "This is a GREEN data op on its own closed-hours night after 0110."

Strategy's rulings of 2026-11-05, as SOLO's dispatch relayed them, which replace the five questions this document carried until that day:

- **B9:** "the night is Thu 2026-11-19, CONDITIONAL on the accountant's written confirmation (Q6-D) reaching the owner before Thu 11-19 12:00 Lisbon. Without it, the night is skipped and nothing is written."
- **Q6-A** = "yes, include archived types."
- **Q6-B** = "yes, include internal-only types."
- **Q6-C** = "audit action service.vat_default_q6, accepted."
- **Q6-D** = "the accountant confirms type by type. The op must accept a per-type list (exempt with code, or a stated rate), not one value for all."
- **B10** (a separate pull request; this operation is built consistent with it): "a Motivo/exemption code is only valid at 0%; any rate above 0% carries no code."

The values themselves are fiscal (Tier D in kind): neither SOLO nor GREEN chooses any of them. They are the accountant's, in writing, carried by the list.

## The decisions this document is built to

Each is what the files do today. A different ruling changes the files, their pins and the rehearsal.

| # | Decision | Built |
|---|---|---|
| D1 | Which tenant? | Only the tenant whose `slug` is `osteojp`, found by slug in every stage. Every stage refuses unless the slug names exactly one tenant. No tenant id is written in any file |
| D2 | Which rows? | Every `services` row of that tenant with `vat_rate IS NULL AND vat_exemption_code IS NULL`: the TARGET SET. Every target row must be in the list, or nothing is written (D19). A row with either field set is never written, listed or not (D22) |
| D3 | Archived types? | **Included** (Q6-A, ruled yes). THE PRE-CHECK prints the target split into active and archived |
| D4 | Internal-only types (staff-bookable, never in the portal)? | **Included** (Q6-B, ruled yes). THE PRE-CHECK prints how many |
| D5 | The values | Per type, from the list (Q6-D): the row's rate, and its code at a rate of 0, or no code above 0. Both fields in one UPDATE, so each written row carries its whole pair. Every value is inside 0110's CHECK constraints (`services_vat_rate_allowed`: 0, 6, 13, 23; `services_vat_exemption_code_allowed`: the 33 codes); a value outside them would abort the transaction with nothing written, and the list's own refusals (D19) stop it earlier with a reason |
| D6 | B10, and the app's rule "0% requires a Motivo" | Both are enforced on the list before any write: a row at 0 without a code, and a row above 0 with a code, are each a STOP (D19). So every row this op writes satisfies both rules. 0110 itself carries no CHECK pairing the two (its section 1); B10 is a separate pull request, and this op is consistent with it whether or not that lands first |
| D7 | The audit | One `audit_log` row per written service, the shape the app's own service actions write (`apps/web/lib/admin/services.ts`: entity_type `service`, entity_id the service), with actor NULL (a data op has no actor, as in DUR-01 and the clinic-hours op) and a distinct action, `service.vat_default_q6` (Q6-C, accepted), so the trail tells this op from a staff edit (`service.update`) without diffing rows. Metadata is slugs and values only: `card` Q6, `source` psql_data_op, `ruling` strategy-q6-2026-11-05, and the before and after of the two fields: before both null, after the row's rate (a number) and its code (a code, or null above 0). That is fiscal codes and slugs only, no personal data, and it fits the audit metadata contract (`apps/web/lib/audit/metadata-contract.ts`: no string over 64 characters or with whitespace; numbers and nulls pass) |
| D8 | The expected count | THE PRE-CHECK prints the target count N, the md5 of the target ids and the md5 of the list's lines as its SQL loaded them, and records all three with the snapshot's sha256 and the disagreement count (D22). THE WRITE receives them from that record (`-v expect`, `-v target_md5`, `-v list_md5`, `-v disagree`), hashes the snapshot again against the recorded sha256 before psql, and under its lock hashes the lines it loaded against `list_md5`, counts the disagreements again against `disagree`, counts and hashes the set again, then checks the UPDATE's row count, the audit insert's row count and the written rows that equal their list row, each against N, all BEFORE the COMMIT. Any difference aborts the transaction: nothing is written |
| D9 | Nothing else moves | Inside THE WRITE's transaction, before the COMMIT: an md5 of every `services` row outside the written set (every tenant), whole, before and after; and an md5 of the written rows with the two VAT fields left out, before and after. Either differing aborts it |
| D10 | The ceiling | 60 rows, for the target set and for the list. 0110's own header counts about twenty rows in `services`; above 60 is a STOP and strategy rules |
| D11 | Locks and timeouts | `SET LOCAL lock_timeout = '5s'` and `SET LOCAL statement_timeout = '60s'` are THE WRITE's first two statements after `BEGIN`, as for every migration from 0100. Then `LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE`: reads go on (every booking reads `services`), and no other write to `services` can land between the count and the COMMIT. A write already in flight makes it wait 5 seconds and STOP cleanly. The list is loaded and validated after the lock, so the target set it is checked against cannot move under it |
| D12 | A second run | Refused three ways: the ids file exists (THE PRE-CHECK and THE WRITE refuse, by the shell), and an audit row of this op or of its undo exists in the tenant (both SQL stages refuse). After a rollback, running it again is a new decision, and the lead rules |
| D13 | The rollback | Keyed on the ids THE WRITE recorded, never on a broad WHERE, and it puts back the BEFORE values each row's own audit row records (both null), on rows that still read that audit row's AFTER values. It does not read the list (section "Rollback") |
| D14 | Which commit it runs from | The HELD head of pull request #1724. THE READ-OUT, THE PRE-CHECK and THE ROLLBACK run `git fetch origin refs/pull/1724/head` and read `FETCH_HEAD`, never `origin/data/...`: the repository deletes a branch when its pull request merges, and a block that named the branch would then STOP and could only be passed by editing it. The fetched head must equal `HELD` (filled in the dispatch); it is checked out detached and recorded. THE WRITE and THE POST-CHECK fetch nothing: they run only on the head THE PRE-CHECK recorded and checked out (`git rev-parse HEAD`). The pull request changes no code, so nothing on `main` needs it first |
| D15 | Network time | THE PRE-CHECK holds the machine's clock against `sntp time.apple.com` (one source; any failure, or an offset above 5 seconds, is a STOP, and nothing has been read). THE WRITE runs within 30 minutes of THE PRE-CHECK (it refuses an older record) and reads the Lisbon clock again. THE ROLLBACK holds the clock against network time itself. Stricter than R36's three sources, on purpose: a block that stops here has read nothing and may be pasted again. THE READ-OUT checks no window and needs no network time: it reads the Lisbon clock only to name its file |
| D16 | `updated_at` | **Not bumped.** `services.updated_at` is set by the application (Drizzle's `$onUpdate`), not by a trigger, and this op leaves it alone, for three reasons: THE WRITE's md5 control then proves every column other than the two VAT fields unchanged, `updated_at` included; THE ROLLBACK returns each row to exactly its bytes before the op; and a staff save after the op moves `updated_at` past THE WRITE's audit row, which THE ROLLBACK reads as a refusal (D17). The audit row is the record of when and by what |
| D17 | A staff re-save before a rollback | A type staff saved again with the same values after THE WRITE still reads those values, so "still the recorded values" does not prove it untouched. THE ROLLBACK refuses the whole rollback, and writes nothing, when any recorded service carries a `service.*` audit row of another action from 10 minutes before THE WRITE's own audit row on (the margin covers a staff transaction that started before THE WRITE and waited for its lock, whose audit row keeps its earlier start time), or an `updated_at` later than THE WRITE's audit row. It never rolls back part of the set; the lead rules |
| D18 | "Its own night after 0110" | No reliable apply-time signal exists in production: the drizzle journal's `created_at` is the repository's constant `when`, not the moment of the apply, and nothing in the catalogue dates an `ALTER TABLE ... ADD COLUMN`. So the dispatch carries `MIGNIGHT`, the Lisbon date of the night 0110 was applied, taken from 0110's GREEN report, and THE PRE-CHECK refuses unless `RUNDAY` is later than it. With 0110 on Tue 2026-11-10, `MIGNIGHT` is `20261110` and `RUNDAY` `20261119`: the check passes, and it still passes if 0110 slips to any night up to Wed 2026-11-18; from 0110 on 2026-11-19 on, it refuses. THE LIMIT: the block trusts the date the dispatch states; what it proves from production is only that 0110 is applied (the two columns and their two CHECK constraints) |
| D19 | The list | A CSV file supplied at run time under `/Users/ivan/osteojp-handover/`, NEVER committed (section "The per-type list"). Its sha256 is in the dispatch (`LISTSHA`). THE PRE-CHECK copies the file once, under `umask 077`, to a private snapshot `/tmp/q6-list.csv`, checks the snapshot's mode is 600, hashes the snapshot before it reads production and STOPs on a mismatch, and STOPs on any line holding a backslash or a control character other than the line end (text COPY would decode a backslash as an escape, and a line `\.` would end the load early, silently). Every psql call reads the snapshot, never the original, so the bytes loaded are the bytes hashed; THE WRITE and THE POST-CHECK hash the snapshot again against the carried sha256, and THE WRITE's SQL compares the md5 of the lines it loaded with the md5 THE PRE-CHECK's SQL printed for the lines it loaded. psql reads it on its standard input, `\copy q6_list_raw (line) FROM pstdin`, into a temporary table, one raw line per row, and the SQL validates every line BEFORE any write, refusing with a `Q6STOP` line and writing nothing on any of: a first line that is not the header; no row; more than 60 rows; a malformed row; a rate outside 0, 6, 13 and 23; a rate of 0 with no code; a code with a rate above 0 (B10); a code that is not one of the 33; a service id listed twice; a listed id that is not a service of the tenant; a target type (both fields empty, archived and internal-only included) missing from the list. The DO block that holds these refusals, `$q6list$`, is byte-identical in THE PRE-CHECK and THE WRITE, and runs again in THE WRITE under its lock |
| D20 | The condition on the night (B9) | The dispatch for the night is written only if the accountant's written confirmation reached the owner before Thu 2026-11-19 12:00 Lisbon, and it carries `Q6DAT`, the Lisbon time it reached him (`YYYYMMDDHHMM`). THE PRE-CHECK refuses unless `Q6DAT` is earlier than 12:00 Lisbon on `RUNDAY`. Without the confirmation there is no dispatch, the night is skipped, and nothing is written; another night is a new ruling. THE LIMIT, as for D18: the block trusts the time the dispatch states |
| D21 | The 33 exemption codes | The application's list, `VAT_EXEMPTION_CODES` in `packages/db/src/service-type-fields.ts` (on #1704; confirmed against the AT's "Tabela dos Codigos de Motivo de Isencao", V4.0 of 18-06-2026), and the CHECK of 0110 names the same 33. THE PRE-CHECK and THE WRITE carry a copy and hold it against the database's own CHECK before they read the list: the same count, and every code of the copy inside the CHECK's definition, or a STOP. The test pins the copy and compares it with the application's file and with 0110's CHECK, each read from disk once #1704 has merged, or else from #1704's branch (`git show origin/db/RODICA-services-vat-colour:<path>`); it FAILS if either cannot be read, so the comparison is never skipped |
| D22 | A listed type staff already set | **Skipped and counted: staff edits win. This is SOLO's default, NOT a ruling.** A listed type whose rate or code is already set (staff chose it on the types screen after 0110) is not matched by the UPDATE, which writes only rows with both fields empty, and is never overwritten, even when its values differ from the list. THE PRE-CHECK prints how many (`list_skipped_staff_set`), and how many of those differ from their list row in the rate or the code (`list_disagrees_staff_set`). **It is a machine halt, not prose.** The dispatch carries `DISAGREEOK`, a whole number; THE PRE-CHECK STOPs unless `list_disagrees_staff_set` equals it. `DISAGREEOK` is `0` unless the lead has ruled in writing, naming that count, that staff's values stand for those types; a non-zero count needs that ruling before the dispatch is filled, because the accountant's value and staff's value differ and which one stands is not the runner's call. THE PRE-CHECK carries the count, and THE WRITE's SQL counts again under its lock and STOPs, before the UPDATE, if the count differs. A type with only one field set is not a target, need not be listed, and is left as staff left it |

## The per-type list

**Where it lives.** `/Users/ivan/osteojp-handover/q6-vat-list.csv`, on the machine GREEN runs on, outside the repository. It is never committed, never pasted into a pull request, an issue, a board card or a dispatch: the repository is public. The dispatch carries only its sha256.

**Its exact format.** Plain UTF-8 text, no byte-order mark, lines ending in LF (CRLF is read the same), no blank line. The first line is the header, exactly:

```
service_id,vat_rate,vat_exemption_code
```

then one row per appointment type, three fields joined by two commas, nothing else on the line:

- `service_id`: the type's id, a uuid in lower case, exactly as THE READ-OUT prints it. The key is the id, never the name, so a name with an accent, a comma or a space cannot fail to match.
- `vat_rate`: one of `0`, `6`, `13`, `23`.
- `vat_exemption_code`: required when the rate is `0`, and one of the 33 codes (`M01` ... `M99`, D21); empty when the rate is above 0 (B10).

For example, with made-up ids:

```
service_id,vat_rate,vat_exemption_code
00000000-0000-4000-8000-000000000001,0,M07
00000000-0000-4000-8000-000000000002,23,
```

At most 60 rows; each id once. Every type of the tenant whose two VAT fields are empty on the night must be in it, archived and internal-only types included. A type staff already set may be listed or not; if listed it is skipped (D22). A line holding a backslash, a tab or any other control character (other than the CR of a CRLF line end) is refused by THE PRE-CHECK's shell before the load: text COPY would decode a backslash as an escape, and a line `\.` would end the load early without an error.

**How the owner and SOLO build it.** (1) GREEN runs THE READ-OUT on an earlier day; its file goes to the owner. (2) The owner gives the file to the accountant, who answers in writing, type by type: exempt with a code, or a stated rate. (3) SOLO writes `q6-vat-list.csv` from that answer, one row per type, copying each `service_id` from THE READ-OUT's file, and the owner checks it against the accountant's answer. (4) SOLO computes `shasum -a 256 /Users/ivan/osteojp-handover/q6-vat-list.csv` and puts the value in the dispatch as `LISTSHA`, with `Q6DAT`, the time the written answer reached the owner. A type added to the clinic after THE READ-OUT and still empty on the night is missing from the list, and THE PRE-CHECK refuses; the owner rules (a new READ-OUT and an amended list).

## THE READ-OUT: an earlier day, read only, for building the list

**This block is for building the list. It writes nothing to production.** It reads, for each appointment type of the tenant `osteojp`, its id, its name, whether it is active or archived, whether it is internal-only, and its two VAT fields as they stand (empty on every row while 0110 is not applied: it reads them through `to_jsonb`, so it runs before and after 0110). It writes them to a CSV file under `/Users/ivan/osteojp-handover/`, named with the Lisbon time it ran, and prints counts only. Type names and ids are business data, not personal data, so writing them to that file is allowed; nothing about any patient, appointment, price or person is read. The file's header is `service_id,name,status,internal_only,vat_rate_now,vat_exemption_code_now`. GREEN does not open or print the file; the owner gives it to the accountant.

**Its gate.** It runs on its own dispatch, which names `scripts/data/q6-vat-m07-0-readout.sql` and fills `HELD` and `DOCSHA`, on any day once R4 has passed on the read-out file. It does not require the READY line (the list it serves must exist before READY), checks no clock window (a read only transaction of about twenty rows, under a 60 second statement timeout, taking only the lock every booking read takes), and refuses an output file that already exists.

```
(
set -o pipefail
HELD='PENDING: set in the read-out dispatch'
DOCSHA='PENDING: set in the read-out dispatch'
SHAREAD=b189bd6ea335161aefa88c02895e8eb1db6b80f84658a7d7473f60f95daec4da
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
PRREF=refs/pull/1724/head
DOCF=docs/data-op-q6-service-types-vat-m07.md
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
READ=scripts/data/q6-vat-m07-0-readout.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
HAND=/Users/ivan/osteojp-handover

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its read-out dispatch. Nothing was read from production"; exit 1; }
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: DOCSHA is still PENDING, so this block is NOT READY. Nothing was read from production"; exit 1; }
rm -f /tmp/q6-readout.out /tmp/q6-target-r.out || { echo "STOP: the previous read-out's records could not be cleared. Nothing was read from production"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read from production"; exit 1; }
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read from production"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was read from production"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12) || { echo "STOP: the Lisbon time could not be split. Nothing was read from production"; exit 1; }
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM. Nothing was read from production"; exit 1; }
OUTF=${HAND}/q6-service-types-${NOWL}.csv
echo "Lisbon now:    ${NOWL}. THE READ-OUT is read only and checks no window"
test ! -e ${OUTF} || { echo "STOP: the read-out file ${OUTF} already exists. Paste this block again in a minute; never remove the file. Nothing was read from production"; exit 1; }
git fetch origin ${PRREF} || { echo "STOP: the fetch of ${PRREF} failed, so the held head is not known. Nothing was read from production"; exit 1; }
TIP=$(git rev-parse FETCH_HEAD) || { echo "STOP: the held head, ${PRREF} as fetched, could not be read. Nothing was read from production"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. Nothing was read from production"; exit 1; }
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}). Nothing was read from production"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read from production"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read from production"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was read from production"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read from production"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. Nothing was read from production"; exit 1; }
echo "checked out:   ${TIP}, the held head"
DOC=$(git show ${TIP}:${DOCF} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. Nothing was read from production"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. Nothing was read from production"; exit 1; }
SIDE=$(git show ${TIP}:${DOCPIN}) || { echo "STOP: the sidecar could not be read at the held head. Nothing was read from production"; exit 1; }
[ "${SIDE}" = "${DOCSHA}  ${DOCF}" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. Nothing was read from production"; exit 1; }
SR=$(shasum -a 256 ${READ} | cut -d' ' -f1) || { echo "STOP: stage 0 could not be hashed. Nothing was read from production"; exit 1; }
[ "${SR}" = "${SHAREAD}" ] || { echo "STOP: stage 0 on disk is not the approved file. Nothing was read from production"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read from production"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read from production"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read from production"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read from production"; exit 1; }
echo "pins:          the document, its sidecar, stage 0, the target guard and its module are the approved files"
mkdir -p ${HAND} || { echo "STOP: the handover folder could not be made. Nothing was read from production"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read from production"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-r.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read from production"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-r.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read from production"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v outfile=${OUTF} -c "begin read only" -c "set local statement_timeout = '60s'" -f ${READ} -c "rollback" > /tmp/q6-readout.out 2>&1 || { echo "STOP: THE READ-OUT refused or failed. Its reason is the Q6STOP line of /tmp/q6-readout.out, which GREEN may print alone. Nothing was written to production: the transaction is read only"; exit 1; }
grep -qxF 'Q6READ read_only on' /tmp/q6-readout.out || { echo "STOP: the read-out does not show a transaction that read as READ ONLY. Report this line only"; exit 1; }
XL=$(awk '!/^(Q6READ [A-Za-z0-9_ ]+)?$/ { c++ } END { printf "%d", c }' /tmp/q6-readout.out) || { echo "STOP: the read-out's transcript could not be checked. Report this line only"; exit 1; }
[ "${XL}" = 0 ] || { echo "STOP: the read-out's transcript holds ${XL} lines that are not Q6READ count lines. Do NOT print it; report this line only. SOLO reads it"; exit 1; }
RL=$(grep -xE 'Q6READ PASS rows [0-9]+' /tmp/q6-readout.out) || { echo "STOP: the read-out holds no PASS line. Report this line only"; exit 1; }
R=$(echo "${RL}" | cut -d' ' -f4) || { echo "STOP: the row count could not be read from the PASS line. Report this line only"; exit 1; }
echo "${R}" | grep -qxE '[1-9][0-9]?' || { echo "STOP: the row count did not read as a number from 1 to 99. Report this line only"; exit 1; }
test -f ${OUTF} || { echo "STOP: the read-out file was not written. Report this line only"; exit 1; }
FL=$(awk 'END { printf "%d", NR }' ${OUTF}) || { echo "STOP: the read-out file could not be counted. Report this line only"; exit 1; }
[ "${FL}" = "$((R + 1))" ] || { echo "STOP: the read-out file holds ${FL} lines, not a header and ${R} rows. Do NOT print it; report this line only. SOLO reads it with the owner"; exit 1; }
HDR=$(sed -n 1p ${OUTF}) || { echo "STOP: the read-out file's first line could not be read. Report this line only"; exit 1; }
[ "${HDR}" = 'service_id,name,status,internal_only,vat_rate_now,vat_exemption_code_now' ] || { echo "STOP: the read-out file's first line is not its header. Do NOT print it; report this line only"; exit 1; }
FS=$(shasum -a 256 ${OUTF} | cut -d' ' -f1) || { echo "STOP: the read-out file could not be hashed. Report this line only"; exit 1; }
grep -E '^Q6READ [a-z0-9_]+ [a-z0-9]+$' /tmp/q6-readout.out || { echo "STOP: the count lines could not be printed. Report this line only"; exit 1; }
echo "READ-OUT DONE: ${R} appointment types of the tenant osteojp are in ${OUTF}, sha256 ${FS}. Nothing was written to production. GREEN does not print the file; the owner gives it to the accountant."
)
```

**EXPECT:** `Lisbon now: ... checks no window`; `checked out:`; `document:` (the dispatch's DOCSHA); `pins:`; the target guard's lines with `target verified: production, session pooler.`; the count lines `Q6READ read_only on`, `tenant_slug_osteojp 1`, `columns_of_0110` (0 before 0110, 2 after), `services_total`, `services_active`, `services_archived`, `services_internal_only`, `vat_both_empty`, `vat_any_set` (the transcript's `Q6READ PASS rows <n>` line is checked by the block, not printed: the print line takes two-word lines only); then `READ-OUT DONE: <n> appointment types ...`, which carries the count. Exit 0. It reads production and writes nothing there.

## Who runs it, from where, and when

- **GREEN**, a fresh apply-only session, on the owner's dispatch naming `scripts/data/q6-vat-m07-1-precheck.sql`, `scripts/data/q6-vat-m07-2-write.sql` and `scripts/data/q6-vat-m07-3-postcheck.sql` (`scripts/data/q6-vat-m07-0-readout.sql` only in the read-out's dispatch, and `scripts/data/q6-vat-m07-4-rollback.sql` only in a dispatch for the rollback). SOLO wrote all five and is disqualified from running them.
- **From the HELD head** of this branch's pull request, in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`, detached.
- **On one machine**, because the ids file lives in its home folder and the list in its handover folder.
- **The night, and its condition (B9).** Thu 2026-11-19, from 21:00 Lisbon until 06:29 Lisbon on Fri 2026-11-20, after 0110 is applied (its night is Tue 2026-11-10). The dispatch for the night exists only if the accountant's written confirmation (Q6-D) reached the owner before Thu 2026-11-19 12:00 Lisbon. Without it the night is skipped and nothing is written; a later night is a new ruling. The dispatch carries, in THE PRE-CHECK's seven `PENDING` lines: `HELD` and `DOCSHA` (from the READY line), `RUNDAY='20261119'`, `MIGNIGHT` (the Lisbon date of 0110's night, from its GREEN report), `Q6DAT` (the Lisbon time, `YYYYMMDDHHMM`, the written confirmation reached the owner), `LISTSHA` (the sha256 of `/Users/ivan/osteojp-handover/q6-vat-list.csv`) and `DISAGREEOK` (`0`, or the count of listed types staff set with other values that the lead's written ruling names, D22).
- **In the night's window only**, by machine: from 21:00 Lisbon on RUNDAY until 06:29 Lisbon the next morning, and closed by the clinic-hours weekday table (open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon; closed Sunday). `TZ=Europe/Lisbon` on every clock read, and a STOP unless the zone reads WET or WEST. THE POST-CHECK is read only and checks no window; it prints the Lisbon time.
- **The order:** THE READ-OUT, on an earlier day. Then on the night: THE PRE-CHECK; the owner reads its counts (the target split into active, archived and internal-only, the list's rows to write and skipped, the rates and codes to write); THE WRITE, within 30 minutes; THE POST-CHECK. THE ROLLBACK is not part of the sitting.

## THE HALT RULE

Any refusal (a REFUSE line from the target guard, a `Q6STOP` refusal from the database, or a harness or classifier refusal), any STOP line and any non-zero exit stops the sitting, and nothing continues to the next block. Whether and when a halted sitting starts again is the lead's call, never the runner's.

- A STOP in THE READ-OUT or THE PRE-CHECK has written nothing to production (each transaction is read only). THE PRE-CHECK checks for THE WRITE's ids file before it clears the last sitting's records, so a pre-check pasted after a committed WRITE STOPs without removing what THE POST-CHECK needs. GREEN may print the one `Q6STOP` line of `/tmp/q6-readout.out` or `/tmp/q6-pre.out`; it holds counts and the refusal's own text only, never a line of the list.
- A STOP in THE WRITE before its psql call has written nothing. A STOP from its psql call means the transaction may have stopped before or after its COMMIT: GREEN reports the STOP line only, never opens THE WRITE's transcript (a database error can quote a row), and THE POST-CHECK runs only on the lead's word. Its ids file is written before the COMMIT, so the file can exist for a write that did not commit; THE POST-CHECK tells the two apart, and THE PRE-CHECK and THE WRITE refuse while the file exists.
- A STOP after THE WRITE's `Q6WRITE COMMITTED` line is a post-commit STOP: the write stands.

**No block carries `set -e`, and every halt is explicit.** GREEN's tool runs a pasted block as `... && eval '<block>' ...`, where zsh ignores errexit. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/q6-service-types-vat-m07.test.mjs` runs every block in that shape, in bash and in zsh, with each external command made to fail in turn. The second line of each block is `set -o pipefail`. No block prints, echoes or tests the value of an environment variable. There is no `#` line inside a block and no backslash continuation.

### THE PRE-CHECK: the night, its condition, network time, the list, the held head, every pin, the target guard, the read. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
RUNDAY='PENDING: the Lisbon date of the night the dispatch names, YYYYMMDD'
MIGNIGHT='PENDING: the Lisbon date of the night 0110 was applied, YYYYMMDD, from its GREEN report'
Q6DAT='PENDING: the Lisbon time the accountant written confirmation (Q6-D) reached the owner, YYYYMMDDHHMM'
LISTSHA='PENDING: the sha256 of the list file, from the dispatch'
DISAGREEOK='PENDING: the count of listed types staff set with other values the lead ruled in writing, 0 without a ruling'
SHAPRE=0dacf2328530f36f0fe9d929fdf38a0e64cd5fb058a3ca5fea75772341891528
SHAWRITE=21dec237bbc807a32bce2a6a14d216ab45f433b4d58d8cbe4f391129d0e3cd28
SHAPOST=89132951f8edbabb48040355c20cc6fa4dada94e0873b371a3a0f42f9de94dd3
SHAUNDO=48aa5859352a3f27d1ddb42892487854128e483b12662a2f60d00a764cd29c2a
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
PRREF=refs/pull/1724/head
DOCF=docs/data-op-q6-service-types-vat-m07.md
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
PRE=scripts/data/q6-vat-m07-1-precheck.sql
WRITE=scripts/data/q6-vat-m07-2-write.sql
POST=scripts/data/q6-vat-m07-3-postcheck.sql
UNDO=scripts/data/q6-vat-m07-4-rollback.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt
LIST=/Users/ivan/osteojp-handover/q6-vat-list.csv
SNAP=/tmp/q6-list.csv

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. Nothing was read from production"; exit 1; }
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: DOCSHA is still PENDING, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${RUNDAY}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: RUNDAY is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${MIGNIGHT}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: MIGNIGHT is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${Q6DAT}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9][0-2][0-9][0-5][0-9]' || { echo "STOP: Q6DAT is still PENDING, or is not a Lisbon time YYYYMMDDHHMM: without the accountant's written confirmation (Q6-D) the night is skipped and nothing is written. Nothing was read from production"; exit 1; }
echo "${LISTSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: LISTSHA is still PENDING, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${DISAGREEOK}" | grep -qxE '0|[1-9][0-9]?' || { echo "STOP: DISAGREEOK is still PENDING, or is not a whole number: it is 0, or the count the lead's written ruling names. Nothing was read from production"; exit 1; }
test ! -e ${IDS} || { echo "STOP: the ids file of THE WRITE already exists, so the write has run or began. Never paste THE PRE-CHECK or THE WRITE again. The lead rules. Nothing was read from production"; exit 1; }
rm -f /tmp/q6-head.sha /tmp/q6-night.ok /tmp/q6-pre.ok /tmp/q6-pre.out /tmp/q6-target-a.out /tmp/q6-list.csv || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production"; exit 1; }
[ "${RUNDAY}" -gt "${MIGNIGHT}" ] || { echo "STOP: RUNDAY ${RUNDAY} is not a night after the night 0110 was applied (${MIGNIGHT}). This operation runs on a closed night of its own after 0110. Nothing was read from production"; exit 1; }
echo "after 0110:    RUNDAY ${RUNDAY} is after the night 0110 was applied, ${MIGNIGHT}, as the dispatch states it"
[ "${Q6DAT}" -lt "${RUNDAY}1200" ] || { echo "STOP: the accountant's written confirmation (Q6-D) reached the owner at ${Q6DAT}, not before ${RUNDAY} 12:00 Lisbon: the night is skipped and nothing is written. Nothing was read from production"; exit 1; }
echo "Q6-D:          the accountant's written confirmation reached the owner at ${Q6DAT}, before ${RUNDAY} 12:00 Lisbon, as the dispatch states it"
test -f ${LIST} || { echo "STOP: the list ${LIST} is not there. Nothing was read from production"; exit 1; }
umask 077 || { echo "STOP: the file mode mask could not be set. Nothing was read from production"; exit 1; }
cp ${LIST} ${SNAP} || { echo "STOP: the list could not be copied to its private snapshot. Nothing was read from production"; exit 1; }
PERM=$(find ${SNAP} -perm 600) || { echo "STOP: the mode of the snapshot could not be read. Nothing was read from production"; exit 1; }
[ -n "${PERM}" ] || { echo "STOP: the snapshot of the list is not mode 600. Nothing was read from production"; exit 1; }
LS=$(shasum -a 256 ${SNAP} | cut -d' ' -f1) || { echo "STOP: the snapshot of the list could not be hashed. Nothing was read from production"; exit 1; }
[ "${LS}" = "${LISTSHA}" ] || { echo "STOP: the list is not the one the dispatch names (its sha256 is ${LS}). Never edit the list or the dispatch to pass this. Nothing was read from production"; exit 1; }
BADC=$(awk '{ sub(/\r$/, "") } /[\\]|[[:cntrl:]]/ { c++ } END { printf "%d", c }' ${SNAP}) || { echo "STOP: the snapshot of the list could not be scanned. Nothing was read from production"; exit 1; }
[ "${BADC}" = 0 ] || { echo "STOP: ${BADC} lines of the list hold a backslash or a control character, which the load would not read as written. Nothing was read from production"; exit 1; }
echo "the list:      ${LIST}, copied to the snapshot ${SNAP} (mode 600), sha256 ${LS}, the dispatch's"
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read from production"; exit 1; }
SN=$(sntp time.apple.com 2>&1) || { echo "STOP: sntp time.apple.com failed, so the machine's clock is not shown to be right. Paste this block again in a minute, and do not set the clock yourself. Nothing was read from production"; exit 1; }
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }') || { echo "STOP: the answer of sntp could not be read. Nothing was read from production"; exit 1; }
echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+' || { echo "STOP: no clock offset could be read out of the answer of sntp. Nothing was read from production"; exit 1; }
awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }' || { echo "STOP: the machine's clock is ${OFF} seconds from network time, more than 5. Do not set the clock yourself. Nothing was read from production"; exit 1; }
echo "network time:  sntp time.apple.com: the machine's clock is ${OFF} seconds from it, within 5 seconds"
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read from production"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was read from production"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12) || { echo "STOP: the Lisbon time could not be split. Nothing was read from production"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be split. Nothing was read from production"; exit 1; }
LT=$(echo "${NOWL}" | cut -c9-12) || { echo "STOP: the Lisbon hour could not be split. Nothing was read from production"; exit 1; }
DAY=$(echo "${NOWL}" | cut -c1-8) || { echo "STOP: the Lisbon date could not be split. Nothing was read from production"; exit 1; }
echo "${NOWL} ${DOW} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [1-7] [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, a weekday, HHMM and YYYYMMDD. Nothing was read from production"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOWL} (YYYYMMDDHHMM), weekday ${DOW} (1 is Monday, 7 is Sunday): ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was read from production"; exit 1; }
NEXTDAY=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%Y%m%d') || { echo "STOP: the day after RUNDAY could not be computed. Nothing was read from production"; exit 1; }
echo "${NEXTDAY}" | grep -qxE '[0-9]{8}' || { echo "STOP: the day after RUNDAY did not read as YYYYMMDD. Nothing was read from production"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "the night:     RUNDAY ${RUNDAY}; the window runs from ${RUNDAY} 21:00 to ${NEXTDAY} 06:29, Lisbon; Lisbon now ${NOWL}; inside: ${WIN}"
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the window of the night this block names (${RUNDAY} from 21:00 to ${NEXTDAY} at 06:29). Nothing was read from production"; exit 1; }
git fetch origin ${PRREF} || { echo "STOP: the fetch of ${PRREF} failed, so the held head is not known. Nothing was read from production"; exit 1; }
TIP=$(git rev-parse FETCH_HEAD) || { echo "STOP: the held head, ${PRREF} as fetched, could not be read. Nothing was read from production"; exit 1; }
echo "${TIP}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${TIP}]. Nothing was read from production"; exit 1; }
echo "held head now: ${TIP}"
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}): the pull request was pushed to since the READY line. Nothing was read from production"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read from production"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read from production"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was read from production"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read from production"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. Nothing was read from production"; exit 1; }
echo "checked out:   ${TIP}, the held head"
DOC=$(git show ${TIP}:${DOCF} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. Nothing was read from production"; exit 1; }
echo "document:      ${DOC}"
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. Nothing was read from production"; exit 1; }
TOP=$(git show ${TIP}:${DOCF} | sed -n 1p) || { echo "STOP: the document's first line could not be read. Nothing was read from production"; exit 1; }
echo "${TOP}" | grep -qvE '^NOT READY' || { echo "STOP: the document's first line at the held head still reads NOT READY, or it could not be searched. Nothing was read from production"; exit 1; }
echo "first line:    ${TOP}"
SIDE=$(git show ${TIP}:${DOCPIN}) || { echo "STOP: the sidecar could not be read at the held head. Nothing was read from production"; exit 1; }
[ "${SIDE}" = "${DOCSHA}  ${DOCF}" ] || { echo "STOP: the sidecar at the held head does not pin the approved document. Nothing was read from production"; exit 1; }
S1=$(shasum -a 256 ${PRE} | cut -d' ' -f1) || { echo "STOP: stage 1 could not be hashed. Nothing was read from production"; exit 1; }
[ "${S1}" = "${SHAPRE}" ] || { echo "STOP: stage 1 on disk is not the approved file. Nothing was read from production"; exit 1; }
S2=$(shasum -a 256 ${WRITE} | cut -d' ' -f1) || { echo "STOP: stage 2 could not be hashed. Nothing was read from production"; exit 1; }
[ "${S2}" = "${SHAWRITE}" ] || { echo "STOP: stage 2 on disk is not the approved file. Nothing was read from production"; exit 1; }
S3=$(shasum -a 256 ${POST} | cut -d' ' -f1) || { echo "STOP: stage 3 could not be hashed. Nothing was read from production"; exit 1; }
[ "${S3}" = "${SHAPOST}" ] || { echo "STOP: stage 3 on disk is not the approved file. Nothing was read from production"; exit 1; }
S4=$(shasum -a 256 ${UNDO} | cut -d' ' -f1) || { echo "STOP: the rollback could not be hashed. Nothing was read from production"; exit 1; }
[ "${S4}" = "${SHAUNDO}" ] || { echo "STOP: the rollback on disk is not the approved file. Nothing was read from production"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read from production"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read from production"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read from production"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read from production"; exit 1; }
echo "pins:          the document, its sidecar, the four stage files, the target guard and its module are the approved files"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read from production"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-a.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read from production"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-a.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read from production"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -c "begin" -c "create temp table q6_list_raw (n bigint generated always as identity, line text) on commit drop" -c "set transaction read only" -c "set local statement_timeout = '60s'" -f ${PRE} -c "rollback" < ${SNAP} > /tmp/q6-pre.out 2>&1 || { echo "STOP: THE PRE-CHECK refused or failed. Its reason is the Q6STOP line of /tmp/q6-pre.out, which GREEN may print alone. Nothing was written: the transaction is read only"; exit 1; }
grep -qxF 'Q6PRE read_only on' /tmp/q6-pre.out || { echo "STOP: the pre-check does not show a transaction that read as READ ONLY. Report this line only"; exit 1; }
XL=$(awk '!/^(Q6PRE [A-Za-z0-9_ ]+)?$/ { c++ } END { printf "%d", c }' /tmp/q6-pre.out) || { echo "STOP: the pre-check's transcript could not be checked. Report this line only"; exit 1; }
[ "${XL}" = 0 ] || { echo "STOP: the pre-check's transcript holds ${XL} lines that are not Q6PRE count lines. Do NOT print it; report this line only. SOLO reads it"; exit 1; }
PC=$(grep -cxE 'Q6PRE PASS target [0-9]+ ids_md5 [0-9a-f]{32} list_md5 [0-9a-f]{32}' /tmp/q6-pre.out) || { echo "STOP: the pre-check holds no PASS line. Report this line only"; exit 1; }
[ "${PC}" = 1 ] || { echo "STOP: the pre-check holds ${PC} PASS lines, not exactly one. Report this line only"; exit 1; }
PL=$(grep -xE 'Q6PRE PASS target [0-9]+ ids_md5 [0-9a-f]{32} list_md5 [0-9a-f]{32}' /tmp/q6-pre.out) || { echo "STOP: the PASS line could not be read. Report this line only"; exit 1; }
N=$(echo "${PL}" | cut -d' ' -f4) || { echo "STOP: the target count could not be read from the PASS line. Report this line only"; exit 1; }
M=$(echo "${PL}" | cut -d' ' -f6) || { echo "STOP: the target md5 could not be read from the PASS line. Report this line only"; exit 1; }
L=$(echo "${PL}" | cut -d' ' -f8) || { echo "STOP: the list md5 could not be read from the PASS line. Report this line only"; exit 1; }
echo "${N} ${M} ${L}" | grep -qxE '[1-9][0-9]? [0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: the target count or the two md5 did not read as a number from 1 to 99 and two times 32 hex characters. Report this line only"; exit 1; }
[ "${N}" -le 60 ] || { echo "STOP: the target count ${N} is above the ceiling of 60. Strategy rules"; exit 1; }
DC=$(grep -cxE 'Q6PRE list_disagrees_staff_set [0-9]+' /tmp/q6-pre.out) || { echo "STOP: the pre-check holds no list_disagrees_staff_set line. Report this line only"; exit 1; }
[ "${DC}" = 1 ] || { echo "STOP: the pre-check holds ${DC} list_disagrees_staff_set lines, not exactly one. Report this line only"; exit 1; }
DIS=$(grep -xE 'Q6PRE list_disagrees_staff_set [0-9]+' /tmp/q6-pre.out | cut -d' ' -f3) || { echo "STOP: the list_disagrees_staff_set line could not be read. Report this line only"; exit 1; }
echo "${DIS}" | grep -qxE '0|[1-9][0-9]?' || { echo "STOP: list_disagrees_staff_set did not read as a count. Report this line only"; exit 1; }
[ "${DIS}" = "${DISAGREEOK}" ] || { echo "STOP: list_disagrees_staff_set is ${DIS}, and the dispatch accepts ${DISAGREEOK}. A non-zero count needs the lead's written ruling naming that count before the dispatch is filled. Nothing was written"; exit 1; }
grep -E '^Q6PRE [a-z0-9_]+ [a-z0-9]+$' /tmp/q6-pre.out || { echo "STOP: the count lines could not be printed. Report this line only"; exit 1; }
echo "${TIP}" > /tmp/q6-head.sha || { echo "STOP: the held head could not be recorded. Nothing was written"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/q6-night.ok || { echo "STOP: the night could not be recorded. Nothing was written"; exit 1; }
echo "${N} ${M} ${LISTSHA} ${L} ${DIS}" > /tmp/q6-pre.ok || { echo "STOP: the pre-check's carry could not be recorded. Nothing was written"; exit 1; }
echo "PRE-CHECK PASSED: ${N} services of the tenant osteojp have both VAT fields empty, each with its row in the list, and are THE WRITE's target. list_disagrees_staff_set is ${DIS}, the count the dispatch accepts. The owner reads the counts above; THE WRITE is pasted on his word, within 30 minutes."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `after 0110: RUNDAY ... is after the night 0110 was applied, ...`; `Q6-D: the accountant's written confirmation reached the owner at ..., before ... 12:00 Lisbon ...`; `the list: ..., copied to the snapshot ... (mode 600), sha256 ..., the dispatch's`; `network time: ... within 5 seconds`; `Lisbon now: ... closed by the weekday table`; `the night: ... inside: yes`; `held head now:`; `checked out:`; `document:` (the dispatch's DOCSHA); `first line:` (not NOT READY); `pins:`; the target guard's lines with `target verified: production, session pooler.`; then the count lines: the six fact lines (`read_only on`, `tenant_slug_osteojp 1`, `column_vat_rate smallint`, `column_vat_exemption_code text`, `constraint_vat_rate 1`, `constraint_vat_exemption_code 1`); the thirteen table lines from `services_total` to `other_tenants_services_untouched`, among them `target_active`, `target_archived`, `target_internal_only`, `staff_set_rate_only`, `staff_set_code_only` and `staff_set_both`; the ten list lines from `list_rows` to `write_code_other`, among them `list_to_write` (equal to `target_total`), `list_skipped_staff_set` (listed types staff already set, which are not written, D22) and `list_disagrees_staff_set` (of those, the ones whose values differ from the list; the block STOPs unless it equals `DISAGREEOK`); then `PRE-CHECK PASSED: <N> services ... list_disagrees_staff_set is <n>, the count the dispatch accepts ...`. The PASS line carries the list's md5 for THE WRITE. Exit 0. It reads production and writes nothing.

### THE WRITE: one transaction, the list checked again, the count checked before the COMMIT, the ids recorded

Pasted only on the owner's word after he has read THE PRE-CHECK's counts, and within 30 minutes of it.

```
(
set -o pipefail
SHAWRITE=21dec237bbc807a32bce2a6a14d216ab45f433b4d58d8cbe4f391129d0e3cd28
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
WRITE=scripts/data/q6-vat-m07-2-write.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
REC=/Users/ivan/.osteojp-q6-vat-m07
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt
WOUT=/Users/ivan/.osteojp-q6-vat-m07/write.out
SNAP=/tmp/q6-list.csv

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was written"; exit 1; }
test -f /tmp/q6-head.sha || { echo "STOP: THE PRE-CHECK recorded no head in this sitting. Nothing was written"; exit 1; }
H=$(cat /tmp/q6-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was written"; exit 1; }
echo "${H}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${H}]. Nothing was written"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was written"; exit 1; }
[ "${HD}" = "${H}" ] || { echo "STOP: the apply worktree is not on the head THE PRE-CHECK recorded. Nothing was written"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was written"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was written"; exit 1; }
echo "running from:  ${H}, the head THE PRE-CHECK recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was written"; exit 1; }
SW=$(shasum -a 256 ${WRITE} | cut -d' ' -f1) || { echo "STOP: stage 2 could not be hashed. Nothing was written"; exit 1; }
[ "${SW}" = "${SHAWRITE}" ] || { echo "STOP: stage 2 on disk is not the approved file. Nothing was written"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was written"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was written"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was written"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was written"; exit 1; }
echo "pins:          stage 2, the target guard and its module are the approved files"
test -f /tmp/q6-night.ok || { echo "STOP: THE PRE-CHECK recorded no night in this sitting. Nothing was written"; exit 1; }
NIGHT=$(cat /tmp/q6-night.ok) || { echo "STOP: the recorded night could not be read. Nothing was written"; exit 1; }
RUNDAY=$(echo "${NIGHT}" | cut -d' ' -f1) || { echo "STOP: the recorded night could not be split. Nothing was written"; exit 1; }
NEXTDAY=$(echo "${NIGHT}" | cut -d' ' -f2) || { echo "STOP: the recorded night could not be split. Nothing was written"; exit 1; }
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was written"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was written"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12) || { echo "STOP: the Lisbon time could not be split. Nothing was written"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be split. Nothing was written"; exit 1; }
LT=$(echo "${NOWL}" | cut -c9-12) || { echo "STOP: the Lisbon hour could not be split. Nothing was written"; exit 1; }
DAY=$(echo "${NOWL}" | cut -c1-8) || { echo "STOP: the Lisbon date could not be split. Nothing was written"; exit 1; }
echo "${NOWL} ${DOW} ${LT} ${DAY} ${RUNDAY} ${NEXTDAY}" | grep -qxE '[0-9]{12} [1-7] [0-2][0-9][0-5][0-9] [0-9]{8} [0-9]{8} [0-9]{8}' || { echo "STOP: the Lisbon time or the recorded night did not read as dates and times. Nothing was written"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}, weekday ${DOW}: ${CLOCK} by the weekday table; the night recorded: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL} is inside clinic hours by the weekday table. Nothing was written"; exit 1; }
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the night THE PRE-CHECK recorded. Nothing was written"; exit 1; }
test -f /tmp/q6-pre.ok || { echo "STOP: THE PRE-CHECK recorded no carry in this sitting. Nothing was written"; exit 1; }
FRESH=$(find /tmp/q6-pre.ok -mmin -30) || { echo "STOP: the age of the pre-check's carry could not be read. Nothing was written"; exit 1; }
[ -n "${FRESH}" ] || { echo "STOP: THE PRE-CHECK ran more than 30 minutes ago. Paste THE PRE-CHECK again. Nothing was written"; exit 1; }
CARRY=$(cat /tmp/q6-pre.ok) || { echo "STOP: the pre-check's carry could not be read. Nothing was written"; exit 1; }
N=$(echo "${CARRY}" | cut -d' ' -f1) || { echo "STOP: the target count could not be read from the carry. Nothing was written"; exit 1; }
M=$(echo "${CARRY}" | cut -d' ' -f2) || { echo "STOP: the target md5 could not be read from the carry. Nothing was written"; exit 1; }
LSHA=$(echo "${CARRY}" | cut -d' ' -f3) || { echo "STOP: the list's sha256 could not be read from the carry. Nothing was written"; exit 1; }
L=$(echo "${CARRY}" | cut -d' ' -f4) || { echo "STOP: the list md5 could not be read from the carry. Nothing was written"; exit 1; }
D=$(echo "${CARRY}" | cut -d' ' -f5) || { echo "STOP: the disagreement count could not be read from the carry. Nothing was written"; exit 1; }
echo "${N} ${M} ${LSHA} ${L} ${D}" | grep -qxE '[1-9][0-9]? [0-9a-f]{32} [0-9a-f]{64} [0-9a-f]{32} (0|[1-9][0-9]?)' || { echo "STOP: the carry did not read as a count, an md5, the list's sha256, the list md5 and the disagreement count. Nothing was written"; exit 1; }
test -f ${SNAP} || { echo "STOP: the snapshot of the list ${SNAP} is not there. Nothing was written"; exit 1; }
LS=$(shasum -a 256 ${SNAP} | cut -d' ' -f1) || { echo "STOP: the snapshot of the list could not be hashed. Nothing was written"; exit 1; }
[ "${LS}" = "${LSHA}" ] || { echo "STOP: the snapshot of the list changed since THE PRE-CHECK read it. Never edit it to pass this. Nothing was written"; exit 1; }
echo "the list:      sha256 ${LS}, the one THE PRE-CHECK read"
test ! -e ${IDS} || { echo "STOP: the ids file of THE WRITE already exists, so the write has run or began. Never paste THE WRITE again. The lead rules. Nothing was written"; exit 1; }
mkdir -p ${REC} || { echo "STOP: the folder for the ids file could not be made. Nothing was written"; exit 1; }
rm -f ${WOUT} || { echo "STOP: the old transcript of THE WRITE could not be removed. Nothing was written"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was written"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-b.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was written"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-b.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was written"; exit 1; }
echo "the write:     ${N} services expected, the carry of THE PRE-CHECK. It runs now, in one transaction"
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v expect=${N} -v target_md5=${M} -v list_md5=${L} -v disagree=${D} -v idsfile=${IDS} -f ${WRITE} < ${SNAP} > ${WOUT} 2>&1 || { echo "STOP: THE WRITE refused or failed (psql exited non-zero). If it stopped before its COMMIT nothing was written; if after, it may have committed. Do NOT open, print or paste its transcript; report this line only. Nothing else is pasted: the lead rules, and THE POST-CHECK runs only on the lead's word"; exit 1; }
grep -qxF "Q6WRITE ready_to_commit ${N}" ${WOUT} || { echo "STOP: THE WRITE's transcript does not show ready_to_commit ${N}. Do NOT open it; report this line only. The lead rules"; exit 1; }
grep -qxF "Q6WRITE COMMITTED ${N}" ${WOUT} || { echo "STOP: THE WRITE's transcript does not show COMMITTED ${N}. Do NOT open it; report this line only. The lead rules"; exit 1; }
test -f ${IDS} || { echo "STOP: THE WRITE committed, but its ids file is not there. The audit rows hold the same ids; the lead rules"; exit 1; }
IC=$(awk 'END { printf "%d", NR }' ${IDS}) || { echo "STOP: THE WRITE committed, and its ids file could not be counted. The lead rules"; exit 1; }
[ "${IC}" = "${N}" ] || { echo "STOP: THE WRITE committed ${N} rows, and its ids file holds ${IC} lines. The audit rows hold the ids; the lead rules"; exit 1; }
BAD=$(awk 'length($0) != 36 || $0 !~ /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/ { c++ } END { printf "%d", c }' ${IDS}) || { echo "STOP: THE WRITE committed, and its ids file could not be checked. The lead rules"; exit 1; }
[ "${BAD}" = 0 ] || { echo "STOP: THE WRITE committed, and ${BAD} lines of its ids file are not ids. The lead rules"; exit 1; }
echo "THE WRITE: COMMITTED. ${N} services of the tenant osteojp carry their list row's VAT rate and code, with ${N} audit rows. The ids are recorded in ${IDS} and are not printed. Paste THE POST-CHECK now."
)
```

**EXPECT:** `running from:`; the sidecar line `docs/data-op-q6-service-types-vat-m07.md: OK`; `pins:`; `Lisbon now: ... closed by the weekday table; ... inside: yes`; `the list: sha256 ..., the one THE PRE-CHECK read`; the target guard's lines; `the write: <N> services expected ...`; then NOTHING from psql (its whole output goes to the transcript under the operator's home); then `THE WRITE: COMMITTED. <N> services ...`. Exit 0.

### THE POST-CHECK: read only, against the recorded ids and the list

```
(
set -o pipefail
SHAPOST=89132951f8edbabb48040355c20cc6fa4dada94e0873b371a3a0f42f9de94dd3
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
POST=scripts/data/q6-vat-m07-3-postcheck.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt
SNAP=/tmp/q6-list.csv

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
test -f /tmp/q6-head.sha || { echo "STOP: THE PRE-CHECK recorded no head in this sitting. Nothing was read"; exit 1; }
H=$(cat /tmp/q6-head.sha) || { echo "STOP: the recorded head could not be read. Nothing was read"; exit 1; }
echo "${H}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded head did not read as a full 40-character sha [${H}]. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${H}" ] || { echo "STOP: the apply worktree is not on the head THE PRE-CHECK recorded. Nothing was read"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read"; exit 1; }
echo "running from:  ${H}, the head THE PRE-CHECK recorded"
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one. Nothing was read"; exit 1; }
SP=$(shasum -a 256 ${POST} | cut -d' ' -f1) || { echo "STOP: stage 3 could not be hashed. Nothing was read"; exit 1; }
[ "${SP}" = "${SHAPOST}" ] || { echo "STOP: stage 3 on disk is not the approved file. Nothing was read"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read"; exit 1; }
echo "pins:          stage 3, the target guard and its module are the approved files"
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was read"; exit 1; }
echo "Lisbon now:    ${NOW}. THE POST-CHECK is read only and checks no window"
test -f /tmp/q6-pre.ok || { echo "STOP: THE PRE-CHECK recorded no carry in this sitting, so the list it read is not known. Nothing was read"; exit 1; }
CARRY=$(cat /tmp/q6-pre.ok) || { echo "STOP: the pre-check's carry could not be read. Nothing was read"; exit 1; }
LSHA=$(echo "${CARRY}" | cut -d' ' -f3) || { echo "STOP: the list's sha256 could not be read from the carry. Nothing was read"; exit 1; }
echo "${LSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: the carry holds no sha256 of the list. Nothing was read"; exit 1; }
test -f ${SNAP} || { echo "STOP: the snapshot of the list ${SNAP} is not there. Nothing was read"; exit 1; }
LS=$(shasum -a 256 ${SNAP} | cut -d' ' -f1) || { echo "STOP: the snapshot of the list could not be hashed. Nothing was read"; exit 1; }
[ "${LS}" = "${LSHA}" ] || { echo "STOP: the snapshot of the list changed since THE PRE-CHECK read it. Never edit it to pass this. Nothing was read"; exit 1; }
test -f ${IDS} || { echo "STOP: the ids file of THE WRITE is not there. Nothing was read"; exit 1; }
IC=$(awk 'END { printf "%d", NR }' ${IDS}) || { echo "STOP: the ids file could not be counted. Nothing was read"; exit 1; }
echo "${IC}" | grep -qxE '[1-9][0-9]?' || { echo "STOP: the ids file holds ${IC} lines, not 1 to 99. Nothing was read"; exit 1; }
JOINED=$(awk '{ printf "%s%s", (NR > 1 ? "," : ""), $0 }' ${IDS}) || { echo "STOP: the ids could not be joined. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v ids=${JOINED} -v expect=${IC} -c "begin" -c "create temp table q6_list_raw (n bigint generated always as identity, line text) on commit drop" -c "set transaction read only" -c "set local statement_timeout = '60s'" -f ${POST} -c "rollback" < ${SNAP} > /tmp/q6-post.out 2>&1 || { echo "STOP: THE POST-CHECK refused or failed. Its reason is the Q6STOP line of /tmp/q6-post.out, which GREEN may print alone. Nothing was written: the transaction is read only"; exit 1; }
grep -qxF 'Q6POST read_only on' /tmp/q6-post.out || { echo "STOP: the post-check does not show a transaction that read as READ ONLY. Report this line only"; exit 1; }
XL=$(awk '!/^(Q6POST [A-Za-z0-9_ ]+)?$/ { c++ } END { printf "%d", c }' /tmp/q6-post.out) || { echo "STOP: the post-check's transcript could not be checked. Report this line only"; exit 1; }
[ "${XL}" = 0 ] || { echo "STOP: the post-check's transcript holds ${XL} lines that are not Q6POST count lines. Do NOT print it; report this line only. SOLO reads it"; exit 1; }
grep -qxF "Q6POST PASS written ${IC}" /tmp/q6-post.out || { echo "STOP: the post-check does not show PASS written ${IC}. Report this line only"; exit 1; }
grep -E '^Q6POST [a-z0-9_]+ [a-z0-9]+$' /tmp/q6-post.out || { echo "STOP: the count lines could not be printed. Report this line only"; exit 1; }
echo "POST-CHECK PASSED: the ${IC} recorded services of the tenant osteojp each equal their list row, each with its one audit row, and no undo row exists. GREEN reports."
)
```

**EXPECT:** `running from:`; the sidecar line; `pins:`; `Lisbon now: ...`; the target guard's lines; the count lines `Q6POST read_only on`, `services_total`, `vat_rate_0_with_code`, `vat_rate_above_0`, `code_m07`, `target_left_now` (information only), `rate_0_without_code`, `code_without_rate`; then `POST-CHECK PASSED: the <N> recorded services ...`. Exit 0. It reads production and writes nothing.

## Rollback

**Run only on the lead's word,** in a dispatch of its own naming `scripts/data/q6-vat-m07-4-rollback.sql`, in a closed-hours night like the write. It is not part of the sitting, and nobody runs it to "tidy up" after a STOP.

It puts `vat_rate` and `vat_exemption_code` back to the BEFORE values THE WRITE's own audit row records for each service (both empty, by the target set's definition), on exactly the services THE WRITE recorded in `/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt`, never by a broad WHERE: a service that carries VAT values because staff chose them is not in the file and is never touched. It does not read the list: each row's before and after values are in its audit row. Before any write, in one transaction under the same lock and timeouts, it refuses when: the ids are not a list of distinct lower-case uuids of the expected length; the tenant does not hold exactly one `service.vat_default_q6` audit row per recorded id, and no other (the file and the trail disagree); any of those audit rows does not record two empty before values; any recorded service no longer reads the after values its audit row records (staff changed it since: the rollback never overwrites a staff change, and the lead rules); any recorded service carries a `service.*` audit row of another action written from 10 minutes before THE WRITE's own audit row on, or an `updated_at` later than THE WRITE's audit row (staff may have re-saved it with the same values, D17); or an undo audit row already exists. It never rolls back part of the set.

**Its real horizon is short.** Any normal staff action on a written type (an edit, an archive, a restore, a patient-booking switch, every one of which writes a `service.*` audit row and moves `updated_at`) makes the rollback refuse for that whole set. In practice it is usable only shortly after THE WRITE, before staff touch the appointment types; after that, putting a value back is a staff edit on the types screen or a new data op the lead rules. It checks its UPDATE's row count and its undo audit rows' row count against the number of ids before the COMMIT, and an md5 of every other `services` row before and after. One audit row per service, action `service.vat_default_q6_undone`, whose before values are THE WRITE's after values and whose after values are THE WRITE's before values. It leaves a local marker, `/Users/ivan/.osteojp-q6-vat-m07/undone.ok`, and refuses to run while it exists.

If the ids file is lost after a committed write, the audit rows of `service.vat_default_q6` (entity_id) name the same services; rebuilding the file from them is a new step the lead rules, and this document does not author it.

### THE ROLLBACK: only on the lead's word. GREEN pastes the copy in that dispatch

```
(
set -o pipefail
HELD='PENDING: set in the rollback dispatch'
DOCSHA='PENDING: set in the rollback dispatch'
RUNDAY='PENDING: the Lisbon date of the night the rollback dispatch names, YYYYMMDD'
SHAUNDO=48aa5859352a3f27d1ddb42892487854128e483b12662a2f60d00a764cd29c2a
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
PRREF=refs/pull/1724/head
DOCF=docs/data-op-q6-service-types-vat-m07.md
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
UNDO=scripts/data/q6-vat-m07-4-rollback.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt
UOUT=/Users/ivan/.osteojp-q6-vat-m07/undo.out
UMARK=/Users/ivan/.osteojp-q6-vat-m07/undone.ok

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: DOCSHA is still PENDING, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${RUNDAY}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: RUNDAY is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production"; exit 1; }
test ! -e ${UMARK} || { echo "STOP: the rollback has already run (its marker exists). Never paste it again. The lead rules. Nothing was read from production"; exit 1; }
test -f ${IDS} || { echo "STOP: the ids file of THE WRITE is not there, and the rollback keys on it. The lead rules. Nothing was read from production"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read from production"; exit 1; }
SN=$(sntp time.apple.com 2>&1) || { echo "STOP: sntp time.apple.com failed, so the machine's clock is not shown to be right. Paste this block again in a minute, and do not set the clock yourself. Nothing was read from production"; exit 1; }
OFF=$(echo "${SN}" | awk '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }') || { echo "STOP: the answer of sntp could not be read. Nothing was read from production"; exit 1; }
echo "${OFF}" | grep -qxE '[+-][0-9]+[.][0-9]+' || { echo "STOP: no clock offset could be read out of the answer of sntp. Nothing was read from production"; exit 1; }
awk -v o="${OFF}" 'BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }' || { echo "STOP: the machine's clock is ${OFF} seconds from network time, more than 5. Do not set the clock yourself. Nothing was read from production"; exit 1; }
echo "network time:  sntp time.apple.com: the machine's clock is ${OFF} seconds from it, within 5 seconds"
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read from production"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST [${NOW}]. Nothing was read from production"; exit 1; }
NOWL=$(echo "${NOW}" | cut -c1-12) || { echo "STOP: the Lisbon time could not be split. Nothing was read from production"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be split. Nothing was read from production"; exit 1; }
LT=$(echo "${NOWL}" | cut -c9-12) || { echo "STOP: the Lisbon hour could not be split. Nothing was read from production"; exit 1; }
DAY=$(echo "${NOWL}" | cut -c1-8) || { echo "STOP: the Lisbon date could not be split. Nothing was read from production"; exit 1; }
echo "${NOWL} ${DOW} ${LT} ${DAY}" | grep -qxE '[0-9]{12} [1-7] [0-2][0-9][0-5][0-9] [0-9]{8}' || { echo "STOP: the Lisbon time did not split into YYYYMMDDHHMM, a weekday, HHMM and YYYYMMDD. Nothing was read from production"; exit 1; }
if awk -v s="${DOW}${LT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
NEXTDAY=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' "${RUNDAY}1200" '+%Y%m%d') || { echo "STOP: the day after RUNDAY could not be computed. Nothing was read from production"; exit 1; }
echo "${NEXTDAY}" | grep -qxE '[0-9]{8}' || { echo "STOP: the day after RUNDAY did not read as YYYYMMDD. Nothing was read from production"; exit 1; }
WIN=no
if [ "${DAY}" = "${RUNDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi
if [ "${DAY}" = "${NEXTDAY}" ] && awk -v t="${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi
echo "Lisbon now:    ${NOWL}, weekday ${DOW}: ${CLOCK} by the weekday table; the night: ${RUNDAY} 21:00 to ${NEXTDAY} 06:29; inside: ${WIN}"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL} is inside clinic hours by the weekday table. Nothing was read from production"; exit 1; }
[ "${WIN}" = yes ] || { echo "STOP: Lisbon ${NOWL} is outside the window of the night this block names. Nothing was read from production"; exit 1; }
git fetch origin ${PRREF} || { echo "STOP: the fetch of ${PRREF} failed, so the held head is not known. Nothing was read from production"; exit 1; }
TIP=$(git rev-parse FETCH_HEAD) || { echo "STOP: the held head, ${PRREF} as fetched, could not be read. Nothing was read from production"; exit 1; }
[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names (${HELD}). Nothing was read from production"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read from production"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read from production"; exit 1; }
git checkout -q --detach ${TIP} || { echo "STOP: the checkout of the held head failed. Nothing was read from production"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read from production"; exit 1; }
[ "${HD}" = "${TIP}" ] || { echo "STOP: the apply worktree is not on the held head after the checkout. Nothing was read from production"; exit 1; }
echo "checked out:   ${TIP}, the held head"
DOC=$(git show ${TIP}:${DOCF} | shasum -a 256 | cut -d' ' -f1) || { echo "STOP: the document could not be read and hashed at the held head. Nothing was read from production"; exit 1; }
[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: the document at the held head is not the approved one. Nothing was read from production"; exit 1; }
TOP=$(git show ${TIP}:${DOCF} | sed -n 1p) || { echo "STOP: the document's first line could not be read. Nothing was read from production"; exit 1; }
echo "${TOP}" | grep -qvE '^NOT READY' || { echo "STOP: the document's first line at the held head still reads NOT READY, or it could not be searched. Nothing was read from production"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: the sidecar does not pin this document. Nothing was read from production"; exit 1; }
SU=$(shasum -a 256 ${UNDO} | cut -d' ' -f1) || { echo "STOP: the rollback could not be hashed. Nothing was read from production"; exit 1; }
[ "${SU}" = "${SHAUNDO}" ] || { echo "STOP: the rollback on disk is not the approved file. Nothing was read from production"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed. Nothing was read from production"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the pinned file. Nothing was read from production"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed. Nothing was read from production"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the pinned file. Nothing was read from production"; exit 1; }
echo "pins:          the document, the rollback, the target guard and its module are the approved files"
IC=$(awk 'END { printf "%d", NR }' ${IDS}) || { echo "STOP: the ids file could not be counted. Nothing was read from production"; exit 1; }
echo "${IC}" | grep -qxE '[1-9][0-9]?' || { echo "STOP: the ids file holds ${IC} lines, not 1 to 99. Nothing was read from production"; exit 1; }
JOINED=$(awk '{ printf "%s%s", (NR > 1 ? "," : ""), $0 }' ${IDS}) || { echo "STOP: the ids could not be joined. Nothing was read from production"; exit 1; }
rm -f ${UOUT} || { echo "STOP: the old transcript of the rollback could not be removed. Nothing was read from production"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read from production"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-u.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was written"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-u.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was written"; exit 1; }
echo "the rollback:  ${IC} recorded services expected. It runs now, in one transaction"
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v ids=${JOINED} -v expect=${IC} -f ${UNDO} > ${UOUT} 2>&1 || { echo "STOP: THE ROLLBACK refused or failed (psql exited non-zero). If it stopped before its COMMIT nothing was written; if after, it may have committed. Do NOT open, print or paste its transcript; report this line only. The lead rules"; exit 1; }
grep -qxF "Q6UNDO COMMITTED ${IC}" ${UOUT} || { echo "STOP: the rollback's transcript does not show COMMITTED ${IC}. Do NOT open it; report this line only. The lead rules"; exit 1; }
touch ${UMARK} || { echo "STOP: the rollback committed, and its marker could not be written. Never paste it again. The lead rules"; exit 1; }
echo "THE ROLLBACK: COMMITTED. The ${IC} recorded services of the tenant osteojp have both VAT fields empty again, with ${IC} undo audit rows. GREEN reports."
)
```

**EXPECT:** `network time:`; `Lisbon now: ... closed ...; inside: yes`; `checked out:`; the sidecar line; `pins:`; the target guard's lines; `the rollback: <N> recorded services expected ...`; then `THE ROLLBACK: COMMITTED. ...`. Exit 0.

## Rehearsal

### Independent rehearsal, Thu 2026-11-05, 14:13 to 14:18 WET, on `35d44346`: REHEARSED OK up to each block's target guard

**By a session that wrote none of it,** on the head `35d443463782586ae55dad58429ebc203b4b115b` of #1724, document sha256 `04eb3641666ff4482de0cc5a989c948c80f978c9b8673507a2fa84dabf43c34d`. Nothing was edited, committed or pushed by it.

**The database.** One local stack, BLUE (`node scripts/lane-stack.mjs up --lane blue`), from a scratch clone of `main` at `3c81134a` (migrations through 0108), then 0110 from #1704's branch applied by `psql -1` directly on 0108. #1704 had by then promoted 0110 to `packages/db/migrations/0110_services_booking_type_fields.sql`, bytes unchanged (sha256 `e0e4a9e8...627e`). Synthetic rows only: tenant `osteojp` with 12 types (6 targets with both fields empty, 4 active, 2 archived, 2 internal-only, one name with a comma and one with quotes; 2 set by staff and equal to the list; 2 set by staff and different from it; 1 with a code only; 1 with a rate only), and a second tenant with 2 types. THE READ-OUT wrote its file, and the list (10 rows: the 6 targets and the 4 staff-set types) was built from it by copying each `service_id`, as "The per-type list" says. The dispatch fields were filled as a dispatch would fill them: RUNDAY `20261119`, MIGNIGHT `20261110`, Q6DAT `202611181030`, LISTSHA the list's sha256, DISAGREEOK `2` (the seed's two disagreements, standing in for a lead's written ruling naming 2). The stack was brought down afterwards.

**The substitutions, exactly:** (a) the psql lines' `"${DATABASE_URL_DIRECT}"` became the lane URL (the target guard read it through `DATABASE_URL`); (b) every line loading `/Users/ivan/osteojp-secrets/new-prod.env` was skipped; (c) the `cd` into the apply checkout became a scratch clone whose origin is a local bare repository holding only `refs/pull/1724/head`; (d) `/tmp/q6-` and `/Users/ivan/osteojp-handover` became scratch folders; (g) the seven `PENDING` lines were filled as above; and **(h), named by no prompt and disclosed by the rehearsal:** the operator's marker folder `/Users/ivan/.osteojp-q6-vat-m07` became a scratch folder, so no `written-ids.txt` or `undone.ok` was left in the operator's home to make GREEN's real blocks refuse. (h) touches no guard. Blocks ran in GREEN's tool shape, `true && eval "<block>"`, in bash; each block was generated from the pinned document by line number.

**The segment method past a STOP the throwaway cannot pass.** Each block ran whole first, and its STOP was recorded (the clinic-hours clock, as it ran on a Thursday afternoon; the NOT READY first line; the target guard refusing 127.0.0.1). Then the block's following lines ran as a segment: the header, the `cd` line, the lines that only compute values the skipped lines set (`NEXTDAY`, `TIP`), and every later line unchanged. No STOP line was edited or bypassed inside a run; the pass branches of those STOPs are under "NOT REHEARSED".

| Block | Result |
|---|---|
| THE READ-OUT | PENDING copy: `STOP: HELD is not a filled-in sha ...`. Whole: fetch, `checked out`, `document`, `pins`, then the guard `REFUSING: project ref is "postgres", not the production project.` and its STOP. Segment: `Q6READ` facts (`services_total 12`, `vat_both_empty 6`, `vat_any_set 6`) and `READ-OUT DONE: 12 appointment types ...`; the file holds the header and 12 rows, the comma and quote names CSV-quoted |
| THE PRE-CHECK | PENDING copy: STOP. Whole: `after 0110`, `Q6-D`, `the list: ... (mode 600) ...`, `network time`, then the clinic-hours STOP. Segments: the NOT READY STOP; `pins` and the guard's STOP; then psql and the tail: 6 fact lines, 13 table lines, 10 list lines (`list_to_write 6`, `list_skipped_staff_set 4`, `list_disagrees_staff_set 2`), `PRE-CHECK PASSED: 6 services ... list_disagrees_staff_set is 2 ...`, a carry of 5 fields |
| THE WRITE | Whole: the clinic-hours STOP. Segments: the guard's STOP; then `THE WRITE: COMMITTED. 6 services ...`, an ids file of 6 lines, the transcript holding only `Q6WRITE` lines. An independent read: the 6 targets equal the list, the 6 non-targets untouched (the 2 disagreements included), the second tenant's empty type still empty, `updated_at` unchanged, 6 audit rows of the expected shape, actor NULL |
| THE POST-CHECK | Whole: the guard's STOP. Segment: `POST-CHECK PASSED: the 6 recorded services ...`, checksums unchanged |
| THE ROLLBACK | PENDING copy, clinic hours, NOT READY and the guard: each its STOP. Segment: `THE ROLLBACK: COMMITTED. The 6 recorded services ...`; every `services` row of every tenant byte-identical to the seed |
| A second cycle | Reseed, PRE-CHECK, WRITE, POST-CHECK, ROLLBACK: the same results, the rows byte-identical to the seed again |

**Every STOP asked for, each exit 1 with the row checksums equal before and after:** HELD, Q6DAT and DISAGREEOK left PENDING; RUNDAY not after MIGNIGHT; Q6DAT not before 12:00 on RUNDAY; clinic hours; the NOT READY first line; the target guard in all five blocks; a wrong LISTSHA; a backslash line and a `\.` line; in the SQL, a repeated id, an id of the other tenant, a missing target, a rate of 0 without a code and a code above 0 (B10); DISAGREEOK 0 and 3 against 2, with no carry written; in THE WRITE's SQL, the disagreements moved under the lock (3 against the carried 2) and the target set moved (5 against 6), each with no ids file; the snapshot changed after THE PRE-CHECK; a carry older than 30 minutes; THE PRE-CHECK pasted again after a write (the ids file); the audit rows of the op already present; the rollback after a later `updated_at`, a later `service.update` audit row, or a changed value; a second rollback, by its marker and in SQL; THE POST-CHECK after the rollback. A change to the original list after THE PRE-CHECK is not a refusal, by design: THE WRITE reads the snapshot. A counts-only scan of every output found no id, no seeded name, no `@` and no connection string once the scratch path itself was stripped.

**Its findings, fixed after it.** (1) This document's test failed 1 of 38 at `35d44346`: #1704's branch had promoted 0110, and the test read only the old pending path. The test now reads the promoted path first, then the pending path, from disk and then the branch, and still fails if neither reads. (2) Two EXPECT lines did not match the output (THE READ-OUT's `PASS rows` is checked, not printed; THE PRE-CHECK prints 13 table lines, not 12); both are corrected. (3) THE PRE-CHECK pasted again after a committed WRITE ran its clean-up before its ids-file STOP, which removed the head record, the carry and the snapshot, so THE POST-CHECK could no longer run. The ids-file STOP now comes before the clean-up, right after the PENDING checks (an unfilled copy still runs no command), with a test. **That one-line move is NOT YET REHEARSED.**

### SQL checked by the author, 2026-11-05, on the reworked files (NOT a rehearsal)

**By SOLO, the author of every file here, so it is not the independent rehearsal the blocks are owed.** On one local throwaway, a `postgres:17-alpine` container started with `--network none` (no network at all, no production URL anywhere), stopped and removed when done. A synthetic schema only: `tenants`, `services` with the columns of `packages/db/src/schema.ts`, `audit_log`, and 0110's `ALTER TABLE` with its four CHECK constraints copied from the head of #1704; two templates, one before 0110 and one after. Synthetic rows only, no data of any clinic: ten services, nine of the tenant `osteojp` and one of a second tenant: five with both VAT fields empty (three active, two archived, two internal-only), one at 23 with no code, one with no rate and M10, one at 13 and M01, one at 0 and M07. Each SQL file ran with its block's own psql line, the list on psql's standard input.

| Step | Result |
|---|---|
| THE READ-OUT, before 0110 | `columns_of_0110 0`, `PASS rows 9`; the file: the header and 9 rows, VAT fields empty, a name with a comma and one with quotes written as CSV quotes them |
| THE READ-OUT, after 0110 | `columns_of_0110 2`, `vat_both_empty 5`, `vat_any_set 4`; the file shows the set values |
| THE PRE-CHECK, a clean list (the five targets, plus the type at 0 and M07 that staff set) | `Q6PRE` lines only; `list_rows 6`, `list_to_write 5`, `list_skipped_staff_set 1`, `write_rate_0_with_code 3`, `write_rate_6 1`, `write_rate_23 1`, `PASS target 5`. The `\copy` into the temporary table works inside the read only transaction, and `-q` prints nothing for it |
| The same list with CRLF line ends, and with no final newline | PASS, the same carry |
| THE WRITE | `Q6WRITE COMMITTED 5`, an ids file of 5 lines; each of the five rows at its list values (three at 0 and M07, one at 23 with no code, one at 6 with no code); the listed type staff set untouched; 5 audit rows with actor NULL, ruling `strategy-q6-2026-11-05`, before null and null, after the list values |
| THE POST-CHECK | `PASS written 5`; with one list row changed after THE WRITE: `Q6STOP: 4 of the 5 recorded services equal their list row in the tenant` |
| THE ROLLBACK, right after | `Q6UNDO COMMITTED 5`; every `services` row byte-identical to before THE WRITE (each row whole, as JSON); 5 undo rows whose before values are the written values and whose after values are null |

**Every refusal of the list, each a `Q6STOP` line, psql exit 3, nothing written:** a header with semicolons; a byte-order mark before the header; a header and no row; 61 rows; a malformed row (an upper-case id, two fields, four fields, a blank line, a `\N` line); a rate of 5; a rate of 0 with no code; 23 with M07 (B10); M08; a repeated id; an id of the second tenant; an id of no service; a target missing from the list. A tab in a line stopped the load itself (`extra data after last expected column`, exit 3). The CHECK cross-check: a CHECK with 32 codes, and a CHECK with M98 in place of M99, each refused. 0110 absent: refused in THE PRE-CHECK. No target, and 65 targets: refused. THE READ-OUT with 69 types: refused, and no file written.

**THE WRITE's refusals, nothing written:** a count that moved (4 against 5); the same count with other rows (the md5); a target missing from the list and a code above 0, each refused by `$q6list$` under the lock; another session holding a lock on `services`: `canceling statement due to lock timeout` after 5 seconds. A second THE WRITE and a second THE PRE-CHECK refused on the audit rows.

**THE POST-CHECK's and THE ROLLBACK's refusals:** an audit row whose after value differs from the list (THE POST-CHECK); a second rollback (`5 undo audit rows already exist`); THE POST-CHECK after the rollback; and on fresh copies after a write: a later `updated_at` alone, a later `service.update` audit row alone, a value changed, and an audit row recording a before value, each refused the whole rollback, nothing written.

**The R4 fixes, checked again by the author on a second throwaway of the same kind (`--network none`, stopped and removed):** THE PRE-CHECK and THE POST-CHECK in their new shape (`begin`, the temporary table `on commit drop`, then `set transaction read only`) print `read_only on` on Postgres 17 and pass; THE PRE-CHECK's PASS line carries `list_md5`; THE WRITE with that md5 committed 5 rows, and refused, with nothing written, a `list_md5` of another list, the same rows in another order, and a missing `-v list_md5`; a list naming three types staff had set, two of them with other values, printed `list_skipped_staff_set 3` and `list_disagrees_staff_set 2`; THE POST-CHECK and THE ROLLBACK passed after that write. A list with a line `\.` in the middle confirmed the NIT: the load stopped at that line without an error, and only the missing-target refusal caught it; THE PRE-CHECK's shell now stops such a list before the load.

### BLUE, 2026-11-05, on the one-value version (superseded for the SQL)

**2026-11-05, 03:00 to 03:09 WET, lane BLUE, by a session that did not write this document, on the head `dacacb37` of #1724.** It rehearsed the one-value version (0% and M07 for all), whose SQL files the rework replaced; its results stand for that version only and say nothing of the list. What still carries over from it: the blocks' shell, unchanged in the rework except for the list lines, `Q6DAT` and THE READ-OUT, stopped at its own first-line check (`still reads NOT READY`) as designed; the explicit fetch of `refs/pull/1724/head`; the target guard refusing the throwaway (`REFUSING: project ref is "postgres", not the production project.`, exit 2); and the psql behaviours (`-q -A -t` prints only the `Q6` lines; `\o :idsfile` writes the whole ids file before the COMMIT; a failed `\o` stops psql with exit 3 before the COMMIT; a `RAISE` inside a DO block exits psql with 3 and rolls the transaction back).

## NOT REHEARSED

- **The blocks whole.** Rehearsed at `35d44346` up to each block's target guard, and past it by the segment method, never past it inside one run. **The delta after that head, THE PRE-CHECK's ids-file STOP moved above its clean-up, is NOT YET REHEARSED**; the fault-injection test covers it.
- **The target guard's pass branch and the production path** (the environment file, the guard, the connection). The guard refuses a throwaway by design, and the lead's rule of 2026-09-30 forbids getting past it: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so."
- **The clinic-hours clock's `closed` branch and the night window, both branches.** The rehearsal ran inside clinic hours, so the clock STOP came first in THE PRE-CHECK, THE WRITE and THE ROLLBACK. RUNDAY, MIGNIGHT and Q6DAT compare dispatch fields only; both their branches ran.
- **The first line's READY branch.** The document reads NOT READY at the held head.
- **The sntp failure and the offset above 5 seconds.** Only the pass branch ran.
- **The `\copy ... FROM pstdin` load, and `set transaction read only` after the temporary table, through Supabase's session pooler.** Local Postgres only.
- **The fetch of `refs/pull/1724/head` after the pull request merges.** A local bare origin only, before any merge.
- **zsh.** The rehearsal ran the blocks in bash; GREEN's tool is zsh. The fault-injection test runs both.
- **THE READ-OUT's "file already exists" refusal.** Not run in the rehearsal; the fault-injection test covers it.

What stands beside the checks: **the fault-injection test** (`scripts/q6-service-types-vat-m07.test.mjs`) runs every block in GREEN's tool shape, in bash and in zsh, with every external command a stub, fails each call in turn, and proves every halt is explicit and that each block passes only on its expected output, with no database (`DATABASE_URL` blank). It also pins every statement of the five SQL files, in order, every refusal with its message, and the list's own refusals.

## Known limits, harmless

- **An impossible RUNDAY passes the format check.** `RUNDAY` and `MIGNIGHT` are checked as `20YYMMDD` shapes, not as real dates, and `Q6DAT` as a `20YYMMDDHHMM` shape. An impossible date can never equal the Lisbon clock's date, so the night window refuses it; one edge remains: macOS `date -j` may roll a date such as 20261131 over to the next month when it computes the day after, which could open the early morning (up to 06:29) of that rolled-over day. The dispatch's dates come from strategy's ruling and SOLO fills them; this is known and left as is.
- **THE ROLLBACK's `shasum -a 256 -c` of the sidecar is not separately tested.** It is redundant: the same block has already hashed the document at the fetched head (`git show`) against `DOCSHA` and checked the sidecar's text, on a clean worktree checked out at that head. The fault-injection test still fails that call in turn and proves it STOPs.
- **A STOP at THE PRE-CHECK's PENDING checks leaves an earlier pass's records.** After those checks come, in this order, the ids-file STOP and then the clean-up of `/tmp/q6-`: a copy with a `PENDING` line runs no command at all, and a pre-check pasted after a committed WRITE STOPs on the ids file before the clean-up, so it keeps the carry, the head record, the night record and the snapshot for THE POST-CHECK. So a STOP at the PENDING checks leaves the records of an earlier, passed pre-check in place, which THE WRITE accepts for 30 minutes; they are a real pass of the same sitting, not a stale one.
- **The codes cross-check reads #1704's branch until #1704 merges.** If that branch is deleted before `main` (holding #1704) is merged into this pull request, a CI run of this test on this branch fails (it never skips). Merging `main` in, which any update of this branch does, cures it.
- **RUNDAY is not pinned to 20261119 in any file.** The dispatch fills it, and the dispatch is the only control on which night runs; the block proves only that RUNDAY is after MIGNIGHT, that Q6DAT is before 12:00 on RUNDAY, and that the clock is inside RUNDAY's window. Another night than Thu 2026-11-19 is a new ruling, and SOLO fills no other date without one.
- **A type name with a line break** would make THE READ-OUT's file hold more lines than rows; the block then STOPs and SOLO reads the file with the owner.

## What must happen before READY, in this order, and none of it by GREEN

1. R4 on the rework: round 1 PASS (on `edd743a0`), round 2 PASS (on `94596aa1`), round 3 PASS (on `e56f35c2`), the review-loop cap reached. Done. Whether they need a round is the lead's call under the review-loop cap (they change production-touching bytes). THE READ-OUT, whose bytes did not change, may run now.
2. THE READ-OUT runs on its own dispatch; the owner gives its file to the accountant.
3. 0110 is applied to production in its own sitting (Tue 2026-11-10), and GREEN reports.
4. The accountant's written answer, type by type, reaches the owner before Thu 2026-11-19 12:00 Lisbon (B9). If it does not, the night is skipped: no dispatch, nothing written.
5. SOLO builds the list from the answer and THE READ-OUT, the owner checks it, SOLO computes its sha256.
6. The independent rehearsal: done at `35d44346`, REHEARSED OK up to each target guard (recorded above). The delta after it (THE PRE-CHECK's ids-file STOP above the clean-up) is NOT YET REHEARSED; whether it needs its own run is the lead's call.
7. SOLO sets the first line to READY, recomputes the sidecar, and fills `HELD`, `DOCSHA`, `RUNDAY` (`20261119`), `MIGNIGHT`, `Q6DAT`, `LISTSHA` and `DISAGREEOK` (`0`, or the count a written ruling of the lead names) in GREEN's dispatch copy only (this document keeps `PENDING`).

## Review history

- **R4 round 1, 2026-11-04, on `d265a23a`: NOT PASS, 1 MAJOR, 3 MINOR, 2 NIT. All answered the same night.**
  - MAJOR: the rollback named `origin/data/Q6-service-types-vat-m07` after `git fetch --prune`, so once the pull request merged and its branch was deleted it would STOP and could be passed only by editing the block. Now THE PRE-CHECK and THE ROLLBACK fetch `refs/pull/1724/head` explicitly and read `FETCH_HEAD`, pinned to `HELD` (D14).
  - MINOR 1: the test proved the SQL's shape, not its guards; a mutation sweep left 11 of 12 mutants alive. The test now holds the list of every refusal in each SQL file with its exact condition, and the key queries' predicates, so turning any one off fails it.
  - MINOR 2: the rollback read "still 0 and M07" as untouched. It now refuses on a later `service.*` audit row or a later `updated_at` (D17).
  - MINOR 3: "its own night after 0110" was not checked by machine. The dispatch now carries `MIGNIGHT` and THE PRE-CHECK refuses unless RUNDAY is later (D18, with its limit).
  - NITs: `updated_at` (D16) and the audit metadata (D7) are stated.
- **R4 round 2, 2026-11-04, on `981b412d`: no BLOCKER, no MAJOR; 2 MINOR, 4 NIT. The last loop under the review-loop cap for the one-value version; its fixes are not re-reviewed.**
  - MINOR 1: the test pinned each guard's IF line but not the statements feeding it. The test now pins every statement of each SQL file, in order, comments and whitespace aside, and checks that every printed line but COMMITTED sits before the COMMIT.
  - MINOR 2: THE WRITE and THE ROLLBACK each gained a scenario at 07:00 the morning after RUNDAY, which must STOP.
  - NITs: the rollback prose says "from 10 minutes before" and states its short horizon; the two known, harmless limits are under "Known limits, harmless".
- **The rework, 2026-11-05, after strategy's rulings of that day (Q6-D: a per-type list).** Every production-touching byte changed: the four SQL files, a new fifth (THE READ-OUT), and every block. So R4 runs again on the rework, as a fresh round, under the review-loop cap; rounds 1 and 2 above reviewed the one-value version. What changed: the write takes each type's rate and code from the list, never one value; the list is loaded with `\copy` and refused in SQL on every path D19 names; THE PRE-CHECK checks the list's sha256 and the Q6-D time; the POST-CHECK compares each written row with its list row; the rollback restores from the audit rows; the rollback's message on a later audit row now says "from 10 minutes before THE WRITE on", as its query always counted; the night is Thu 2026-11-19. R4 owed.
- **R4 on the rework, round 1, 2026-11-05, on `edd743a0`: PASS, no MAJOR; 4 MINOR, 4 NIT, all fixed the same day. Not re-reviewed (they change production-touching bytes; the lead rules on a round).**
  - MINOR 1: THE PRE-CHECK cleared the last sitting's records only after its MIGNIGHT and Q6DAT checks, so a pre-check pasted again that stopped there left an earlier pass's carry for THE WRITE. The clean-up is now the first command after the PENDING checks; a test seeds an old carry and proves each of those STOPs (MIGNIGHT, the Q6-D time) removes it. A STOP at the PENDING checks themselves still runs no command at all, by design: an unfilled copy touches nothing.
  - MINOR 2: the list was hashed, then opened again for psql. THE PRE-CHECK now copies it once to a mode 600 snapshot under `/tmp/q6-`, hashes the snapshot, and every psql call reads the snapshot; THE PRE-CHECK's SQL prints the md5 of the loaded lines, carried and compared by THE WRITE's SQL before its UPDATE (D8, D19).
  - MINOR 3: `list_disagrees_staff_set` counts listed types staff set with other values; D22 says it is SOLO's default, not a ruling, and that a non-zero count goes to the lead before THE WRITE.
  - MINOR 4: the codes cross-check was skipped on this branch. The test now reads the application's file and 0110 from disk or from `origin/db/RODICA-services-vat-colour`, and fails if either cannot be read (D21).
  - NIT 1: a backslash is not refused by text COPY (escapes decode; a line `\.` ends the load). THE PRE-CHECK's shell now STOPs on a backslash or any control character but the line end, with a test; the sentence in "The per-type list" is corrected.
  - NIT 2: the test's tampered-file case for THE PRE-CHECK now changes stage 1 itself.
  - NIT 3: THE PRE-CHECK and THE POST-CHECK create the temporary table inside their transaction, `on commit drop`, then `set transaction read only`, so every statement of their files runs read only (checked on Postgres 17).
  - NIT 4: "Known limits" records that RUNDAY is not pinned in any file and the dispatch is the only control.
- **R4 on the rework, round 2, 2026-11-05, on `94596aa1`: PASS, 1 MINOR, NITs. Fixed the same day; not re-reviewed.**
  - MINOR: `list_disagrees_staff_set` was prose only. It is now a machine halt: the dispatch carries `DISAGREEOK` (PENDING-checked, a whole number), THE PRE-CHECK STOPs unless the count equals it, the count is carried, and THE WRITE's SQL counts again under its lock and STOPs before the UPDATE if it differs (checked by the author on a throwaway, removed after: carried 0 against 2, and carried 2 after staff changed one more type, each refused with nothing written; equal counts committed). The test proves a mismatch STOPs, equal passes and 0 against 0 passes.
  - N3: THE WRITE's header comment names the snapshot. N4: exactly one `list_disagrees_staff_set` line is accepted. N1 and N2 are under "Known limits, harmless".
- **R4 on the rework, round 3, 2026-11-05, on `e56f35c2`: PASS, no MINOR; the review-loop cap is reached.** Two prose NITs fixed without a block or SQL byte changing: the comma splice in D22, and the Status and first line, which still said R4 was owed. The blocks whole are NOT REHEARSED; an independent rehearsal is next.
- **After the independent rehearsal at `35d44346` (REHEARSED OK), its findings fixed, not re-reviewed:** the test reads 0110 from its promoted path; two EXPECT lines corrected; ONE BLOCK LINE MOVED in THE PRE-CHECK, the ids-file STOP above the clean-up, with a test; the rehearsal recorded under "Rehearsal" and "NOT REHEARSED", and the moved line marked NOT YET REHEARSED.
