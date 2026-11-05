NOT READY: authored 2026-11-04, R4 rounds 1 and 2 answered (round 2's fixes not re-reviewed, review-loop cap), NOT YET REHEARSED, five questions open for strategy (Q6-A to Q6-E), the night not ruled, 0110 not applied.

# Q6: the existing appointment types take 0% VAT and the exemption code M07

**Status: AUTHORED 2026-11-04 BY SOLO. NOT YET REHEARSED (see "NOT YET REHEARSED"). R4 ROUND 1 (NOT PASS, 1 MAJOR, 3 MINOR, 2 NIT) AND ROUND 2 (2 MINOR, 4 NIT) ANSWERED 2026-11-04; round 2 was the last loop under the review-loop cap (see "Review history"). NOT RUN.** Nothing in this document may be pasted until its first line reads READY. THE PRE-CHECK carries `PENDING` in the four lines GREEN's dispatch fills and THE ROLLBACK in three, and STOP at their first check while they do.

**In plain words.** Migration 0110 (held pull request #1704) adds two empty fields to every appointment type: the VAT rate and the VAT exemption reason. Strategy ruled that the types the clinic already has take the values Fisiozero used for them: a rate of 0% and the exemption code M07. This operation fills those two fields, once, on every appointment type of the clinic where both are still empty. It changes nothing else: not the price, not the name, not any appointment, invoice or patient. A type where staff already chose a rate or a code after 0110 is left exactly as staff left it.

| Fact | Value |
|---|---|
| Ruling | Strategy, Q6, owner-delegated, 2026-11-04 (quoted in the next section) |
| Card | `Q6-service-types-vat-m07` |
| Tier | C, a production data op. NEW: it is on no ruled Tier C list, and it writes production rows outside STAFF-10. Strategy's Q6 rules what it writes; the night and the five questions below are not yet ruled |
| Precondition | 0110 is applied to production, in an earlier sitting (`packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql` at the head of #1704, which takes the next free number when it is promoted). THE PRE-CHECK and THE WRITE read `information_schema` and refuse while the two columns, or their two CHECK constraints, are not there |
| Stage 1 | `scripts/data/q6-vat-m07-1-precheck.sql`, READ ONLY, sha256 `f083d835009f056786238b233d8fcd461c4e9e64fdd91053222d535497529d8f` |
| Stage 2 | `scripts/data/q6-vat-m07-2-write.sql`, ONE transaction, sha256 `f8ce2bf1b1585a92d3f9518a0292533c958adcb74b46943b6bbcc297db741f97` |
| Stage 3 | `scripts/data/q6-vat-m07-3-postcheck.sql`, READ ONLY, sha256 `0a6ff1138605e2c7d045afb23cad5daa9a5a63d816a8554269534d1cc18718fa` |
| Rollback | `scripts/data/q6-vat-m07-4-rollback.sql`, ONE transaction, run only on the lead's word, sha256 `cec11f5a7b827da3c75700a00ce560ae8419591708e2e55c974ba6c43c0edc61` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`, and its module `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the bytes R14-PROFILE and R36 pin) |
| This document | `docs/data-op-q6-service-types-vat-m07.md`, pinned by `docs/data-op-q6-service-types-vat-m07.sha256`; GREEN's dispatch names its sha256 in `DOCSHA` |
| Test | `scripts/q6-service-types-vat-m07.test.mjs`: the pins, the SQL's shape, and every block under fault injection in bash and zsh |
| Who runs it | GREEN, an apply-only session, on the owner's dispatch naming the four stage files above by filename (`CLAUDE.md`, "Who applies migrations"). SOLO wrote it and never runs it |
| Run from | The HELD head of this branch's pull request #1724, fetched explicitly as `refs/pull/1724/head` (never the branch name), pinned to `HELD` and checked out detached in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. GitHub keeps that ref after a merge and after the branch is deleted, so the blocks work before and after the pull request merges, the rollback included. The pull request stays held, unmerged, until GREEN reports |
| When | One closed-hours night of its own, after the night 0110 is applied: from 21:00 Lisbon on RUNDAY until 06:29 Lisbon the next morning, and closed by the weekday table. THE PRE-CHECK refuses unless RUNDAY is later than MIGNIGHT, the night 0110 was applied, which the dispatch carries (D18). Proposed: Monday 2026-11-16 (NOT ruled by strategy) |
| What it writes | `services.vat_rate` := 0 and `services.vat_exemption_code` := `M07` on the target set (below); one `audit_log` row per written service, action `service.vat_default_q6` |
| What it records locally | The written ids, one per line, in `/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt` (written by psql before the COMMIT, never printed), and THE WRITE's transcript beside it. Counts-only transcripts and the sitting's records under `/tmp/q6-` |
| What it prints | Counts, column types, the words on and off, sha256 pins and commit shas. Never a service name, an id, a price or any other column |

## The ruling (strategy, Q6, 2026-11-04)

Strategy's words, as SOLO's dispatch relayed them: the existing appointment types take Fisiozero's VAT values, 0% and exemption code M07. "This is a GREEN data op on its own closed-hours night after 0110."

## The decisions this document is built to

Each is what the files do today. A different ruling changes the files, their pins and the rehearsal.

| # | Decision | Built |
|---|---|---|
| D1 | Which tenant? | Only the tenant whose `slug` is `osteojp`, found by slug in every stage. Every stage refuses unless the slug names exactly one tenant. No tenant id is written in any file |
| D2 | Which rows? | Every `services` row of that tenant with `vat_rate IS NULL AND vat_exemption_code IS NULL`: the TARGET SET. A row with either field set is never written (staff set it after 0110, and this op never overwrites a staff value). A row with one field set and the other empty is counted (`partial_left_alone`) and left alone |
| D3 | Archived types? | **Included**, so a type staff re-activate later already carries the same VAT values as the rest. THE PRE-CHECK prints the target split into active and archived. Asked of strategy as Q6-A |
| D4 | Internal-only types (staff-bookable, never in the portal)? | Included, as any other type of the tenant. THE PRE-CHECK prints how many. Asked of strategy as Q6-B |
| D5 | The values | `vat_rate = 0`, `vat_exemption_code = 'M07'`, both in one UPDATE, so every written row carries the pair. Both values are inside 0110's CHECK constraints (`services_vat_rate_allowed`: 0, 6, 13, 23; `services_vat_exemption_code_allowed`: 33 codes, M07 among them). A value outside them would abort the transaction with nothing written |
| D6 | The server rule "0% requires a Motivo" | It lives in the application's save path (the types screen), not in the database, so SQL does not meet it. It is irrelevant to this op's SQL, and every row this op writes satisfies it anyway: the rate 0 and the code M07 are written together. A partial row (D2) is not written, so this op never creates a 0% row without a code. 0110 itself deliberately carries no CHECK pairing the two (its section 1: a fiscal rule, for the owner and his accountant) |
| D7 | The audit | One `audit_log` row per written service, the shape the app's own service actions write (`apps/web/lib/admin/services.ts`: entity_type `service`, entity_id the service), with actor NULL (a data op has no actor, as in DUR-01 and the clinic-hours op) and a distinct action, `service.vat_default_q6`, so the trail tells this op from a staff edit (`service.update`) without diffing rows. Metadata is slugs and values only: `card` Q6, `source` psql_data_op, `ruling` strategy-q6-2026-11-04, and the before and after of the two fields (numbers, a code and nulls). That is fiscal codes and slugs only, no personal data, and it fits the audit metadata contract (`apps/web/lib/audit/metadata-contract.ts`: no string over 64 characters or with whitespace; numbers and nulls pass). Asked of strategy as Q6-C (the action name) |
| D8 | The expected count | THE PRE-CHECK prints the target count N and the md5 of the target ids, and records both. THE WRITE receives them from that record (`-v expect`, `-v target_md5`), and under its lock counts and hashes the set again, then checks the UPDATE's row count and the audit insert's row count, each against N, all BEFORE the COMMIT. Any difference aborts the transaction: nothing is written |
| D9 | Nothing else moves | Inside THE WRITE's transaction, before the COMMIT: an md5 of every `services` row outside the written set (every tenant), whole, before and after; and an md5 of the written rows with the two VAT fields left out, before and after. Either differing aborts it |
| D10 | The ceiling | 60 rows. 0110's own header counts about twenty rows in `services`; a target above 60 is a STOP and strategy rules |
| D11 | Locks and timeouts | `SET LOCAL lock_timeout = '5s'` and `SET LOCAL statement_timeout = '60s'` are THE WRITE's first two statements after `BEGIN`, as for every migration from 0100. Then `LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE`: reads go on (every booking reads `services`), and no other write to `services` can land between the count and the COMMIT. A write already in flight makes it wait 5 seconds and STOP cleanly |
| D12 | A second run | Refused three ways: the ids file exists (THE PRE-CHECK and THE WRITE refuse, by the shell), and an audit row of this op or of its undo exists in the tenant (both SQL stages refuse). After a rollback, running it again is a new decision, and the lead rules |
| D13 | The rollback | Keyed on the ids THE WRITE recorded, never on a broad WHERE (section "Rollback") |
| D14 | Which commit it runs from | The HELD head of pull request #1724. THE PRE-CHECK and THE ROLLBACK run `git fetch origin refs/pull/1724/head` and read `FETCH_HEAD`, never `origin/data/...`: the repository deletes a branch when its pull request merges, and a block that named the branch would then STOP and could only be passed by editing it. The fetched head must equal `HELD` (filled in the dispatch); it is checked out detached and recorded. THE WRITE and THE POST-CHECK fetch nothing: they run only on the head THE PRE-CHECK recorded and checked out (`git rev-parse HEAD`). The pull request changes no code, so nothing on `main` needs it first |
| D15 | Network time | THE PRE-CHECK holds the machine's clock against `sntp time.apple.com` (one source; any failure, or an offset above 5 seconds, is a STOP, and nothing has been read). THE WRITE runs within 30 minutes of THE PRE-CHECK (it refuses an older record) and reads the Lisbon clock again. THE ROLLBACK holds the clock against network time itself. Stricter than R36's three sources, on purpose: a block that stops here has read nothing and may be pasted again |
| D16 | `updated_at` | **Not bumped.** `services.updated_at` is set by the application (Drizzle's `$onUpdate`), not by a trigger, and this op leaves it alone, for three reasons: THE WRITE's md5 control then proves every column other than the two VAT fields unchanged, `updated_at` included; THE ROLLBACK returns each row to exactly its bytes before the op; and a staff save after the op moves `updated_at` past THE WRITE's audit row, which THE ROLLBACK reads as a refusal (D17). The audit row is the record of when and by what |
| D17 | A staff re-save before a rollback | A type staff saved again with 0% and M07 after THE WRITE still reads 0% and M07, so "still 0 and M07" does not prove it untouched. THE ROLLBACK refuses the whole rollback, and writes nothing, when any recorded service carries a `service.*` audit row of another action from 10 minutes before THE WRITE's own audit row on (the margin covers a staff transaction that started before THE WRITE and waited for its lock, whose audit row keeps its earlier start time), or an `updated_at` later than THE WRITE's audit row. It never rolls back part of the set; the lead rules |
| D18 | "Its own night after 0110" | No reliable apply-time signal exists in production: the drizzle journal's `created_at` is the repository's constant `when`, not the moment of the apply, and nothing in the catalogue dates an `ALTER TABLE ... ADD COLUMN`. So the dispatch carries `MIGNIGHT`, the Lisbon date of the night 0110 was applied, taken from 0110's GREEN report, and THE PRE-CHECK refuses unless `RUNDAY` is later than it. THE LIMIT: the block trusts the date the dispatch states; what it proves from production is only that 0110 is applied (the two columns and their two CHECK constraints) |

## Questions for strategy

Each has a built default (the decision named) so the document can be reviewed and rehearsed now; a different answer changes the files and their pins.

- **Q6-A (archived types).** blocked_what: whether the archived appointment types also take 0% and M07. Options: (a) include them (built, D3); (b) active types only. Recommendation: (a), so a type that is re-activated is consistent with the rest; THE PRE-CHECK prints both counts for the owner before the write.
- **Q6-B (internal-only types).** blocked_what: whether types staff book but the portal never shows (for example a "Diversos" type) also take 0% and M07. Options: (a) include them (built, D4); (b) leave them empty for staff to set. Recommendation: (a), if every type the clinic sells is a health service under the same exemption; otherwise (b).
- **Q6-C (the audit action).** blocked_what: the audit action name. Options: (a) `service.vat_default_q6`, one row per service (built, D7); (b) the app's generic `service.update`. Recommendation: (a): the trail then says which values came from this op and which from staff.
- **Q6-D (every type is article-9 exempt).** blocked_what: the premise that EVERY existing type is invoiced at 0% under M07. If any type is not a health service (a product sale, a course, a rental), 0% and M07 would be wrong for it. Options: (a) every type, as built; (b) strategy names the types to leave out, and the target set excludes them by name inside SQL (never printed). Recommendation: (a) only if the owner or his accountant confirms Fisiozero carried 0% and M07 on every type; this is a fiscal value (Tier D in kind), and SOLO does not decide it.
- **Q6-E (the night).** blocked_what: the night. Proposed: Monday 2026-11-16, 21:00 to 06:29 Lisbon, on its own night after the night 0110 is applied. Strategy rules it; the dispatch fills `RUNDAY`.

## Who runs it, from where, and when

- **GREEN**, a fresh apply-only session, on the owner's dispatch naming `scripts/data/q6-vat-m07-1-precheck.sql`, `scripts/data/q6-vat-m07-2-write.sql` and `scripts/data/q6-vat-m07-3-postcheck.sql` (and `scripts/data/q6-vat-m07-4-rollback.sql` only in a dispatch for the rollback). SOLO wrote all four and is disqualified from running them.
- **From the HELD head** of this branch's pull request, in `/Users/ivan/Projects/GitHub/osteojp-prod-apply`, detached.
- **On one machine**, because the ids file lives in its home folder.
- **In the night's window only**, by machine: from 21:00 Lisbon on RUNDAY until 06:29 Lisbon the next morning, and closed by the clinic-hours weekday table (open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon; closed Sunday). `TZ=Europe/Lisbon` on every clock read, and a STOP unless the zone reads WET or WEST. THE POST-CHECK is read only and checks no window; it prints the Lisbon time.
- **The order:** THE PRE-CHECK; the owner reads its counts (the target split into active, archived and internal-only, the partial rows left alone); THE WRITE, within 30 minutes; THE POST-CHECK. THE ROLLBACK is not part of the sitting.

## THE HALT RULE

Any refusal (a REFUSE line from the target guard, a `Q6STOP` refusal from the database, or a harness or classifier refusal), any STOP line and any non-zero exit stops the sitting, and nothing continues to the next block. Whether and when a halted sitting starts again is the lead's call, never the runner's.

- A STOP in THE PRE-CHECK has written nothing (its transaction is read only). GREEN may print the one `Q6STOP` line of `/tmp/q6-pre.out`; it holds counts and the refusal's own text only.
- A STOP in THE WRITE before its psql call has written nothing. A STOP from its psql call means the transaction may have stopped before or after its COMMIT: GREEN reports the STOP line only, never opens THE WRITE's transcript (a database error can quote a row), and THE POST-CHECK runs only on the lead's word. Its ids file is written before the COMMIT, so the file can exist for a write that did not commit; THE POST-CHECK tells the two apart, and THE PRE-CHECK and THE WRITE refuse while the file exists.
- A STOP after THE WRITE's `Q6WRITE COMMITTED` line is a post-commit STOP: the write stands.

**No block carries `set -e`, and every halt is explicit.** GREEN's tool runs a pasted block as `... && eval '<block>' ...`, where zsh ignores errexit. Each command a later step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and `scripts/q6-service-types-vat-m07.test.mjs` runs every block in that shape, in bash and in zsh, with each external command made to fail in turn. The second line of each block is `set -o pipefail`. No block prints, echoes or tests the value of an environment variable. There is no `#` line inside a block and no backslash continuation.

### THE PRE-CHECK: the night, network time, the held head, every pin, the target guard, the read. GREEN pastes its dispatch's filled copy

```
(
set -o pipefail
HELD='PENDING: set at the READY line'
DOCSHA='PENDING: set at the READY line'
RUNDAY='PENDING: the Lisbon date of the night the dispatch names, YYYYMMDD'
MIGNIGHT='PENDING: the Lisbon date of the night 0110 was applied, YYYYMMDD, from its GREEN report'
SHAPRE=f083d835009f056786238b233d8fcd461c4e9e64fdd91053222d535497529d8f
SHAWRITE=f8ce2bf1b1585a92d3f9518a0292533c958adcb74b46943b6bbcc297db741f97
SHAPOST=0a6ff1138605e2c7d045afb23cad5daa9a5a63d816a8554269534d1cc18718fa
SHAUNDO=cec11f5a7b827da3c75700a00ce560ae8419591708e2e55c974ba6c43c0edc61
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

echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: HELD is not a filled-in sha, so this block is NOT READY: GREEN pastes the copy in its dispatch, where SOLO filled it. Nothing was read from production"; exit 1; }
echo "${DOCSHA}" | grep -qxE '[0-9a-f]{64}' || { echo "STOP: DOCSHA is still PENDING, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${RUNDAY}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: RUNDAY is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production"; exit 1; }
echo "${MIGNIGHT}" | grep -qxE '20[0-9]{2}[01][0-9][0-3][0-9]' || { echo "STOP: MIGNIGHT is still PENDING, or is not a Lisbon date YYYYMMDD, so this block is NOT READY. Nothing was read from production"; exit 1; }
[ "${RUNDAY}" -gt "${MIGNIGHT}" ] || { echo "STOP: RUNDAY ${RUNDAY} is not a night after the night 0110 was applied (${MIGNIGHT}). This operation runs on a closed night of its own after 0110. Nothing was read from production"; exit 1; }
echo "after 0110:    RUNDAY ${RUNDAY} is after the night 0110 was applied, ${MIGNIGHT}, as the dispatch states it"
test ! -e ${IDS} || { echo "STOP: the ids file of THE WRITE already exists, so the write has run or began. Never paste THE PRE-CHECK or THE WRITE again. The lead rules. Nothing was read from production"; exit 1; }
rm -f /tmp/q6-head.sha /tmp/q6-night.ok /tmp/q6-pre.ok /tmp/q6-pre.out /tmp/q6-target-a.out || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read from production"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '60s'" -f ${PRE} -c "rollback" > /tmp/q6-pre.out 2>&1 || { echo "STOP: THE PRE-CHECK refused or failed. Its reason is the Q6STOP line of /tmp/q6-pre.out, which GREEN may print alone. Nothing was written: the transaction is read only"; exit 1; }
grep -qxF 'Q6PRE read_only on' /tmp/q6-pre.out || { echo "STOP: the pre-check does not show a transaction that read as READ ONLY. Report this line only"; exit 1; }
XL=$(awk '!/^(Q6PRE [A-Za-z0-9_ ]+)?$/ { c++ } END { printf "%d", c }' /tmp/q6-pre.out) || { echo "STOP: the pre-check's transcript could not be checked. Report this line only"; exit 1; }
[ "${XL}" = 0 ] || { echo "STOP: the pre-check's transcript holds ${XL} lines that are not Q6PRE count lines. Do NOT print it; report this line only. SOLO reads it"; exit 1; }
PC=$(grep -cxE 'Q6PRE PASS target [0-9]+ ids_md5 [0-9a-f]{32}' /tmp/q6-pre.out) || { echo "STOP: the pre-check holds no PASS line. Report this line only"; exit 1; }
[ "${PC}" = 1 ] || { echo "STOP: the pre-check holds ${PC} PASS lines, not exactly one. Report this line only"; exit 1; }
PL=$(grep -xE 'Q6PRE PASS target [0-9]+ ids_md5 [0-9a-f]{32}' /tmp/q6-pre.out) || { echo "STOP: the PASS line could not be read. Report this line only"; exit 1; }
N=$(echo "${PL}" | cut -d' ' -f4) || { echo "STOP: the target count could not be read from the PASS line. Report this line only"; exit 1; }
M=$(echo "${PL}" | cut -d' ' -f6) || { echo "STOP: the target md5 could not be read from the PASS line. Report this line only"; exit 1; }
echo "${N} ${M}" | grep -qxE '[1-9][0-9]? [0-9a-f]{32}' || { echo "STOP: the target count or md5 did not read as a number from 1 to 99 and 32 hex characters. Report this line only"; exit 1; }
[ "${N}" -le 60 ] || { echo "STOP: the target count ${N} is above the ceiling of 60. Strategy rules"; exit 1; }
grep -E '^Q6PRE [a-z0-9_]+ [a-z0-9]+$' /tmp/q6-pre.out || { echo "STOP: the count lines could not be printed. Report this line only"; exit 1; }
echo "${TIP}" > /tmp/q6-head.sha || { echo "STOP: the held head could not be recorded. Nothing was written"; exit 1; }
echo "${RUNDAY} ${NEXTDAY}" > /tmp/q6-night.ok || { echo "STOP: the night could not be recorded. Nothing was written"; exit 1; }
echo "${N} ${M}" > /tmp/q6-pre.ok || { echo "STOP: the pre-check's carry could not be recorded. Nothing was written"; exit 1; }
echo "PRE-CHECK PASSED: ${N} services of the tenant osteojp have both VAT fields empty and are THE WRITE's target. The owner reads the counts above; THE WRITE is pasted on his word, within 30 minutes."
)
```

**EXPECT**, each line checked by the block itself, which stops on any difference: `after 0110: RUNDAY ... is after the night 0110 was applied, ...`; `network time: ... within 5 seconds`; `Lisbon now: ... closed by the weekday table`; `the night: ... inside: yes`; `held head now:`; `checked out:`; `document:` (the dispatch's DOCSHA); `first line:` (not NOT READY); `pins:`; the target guard's lines with `target verified: production, session pooler.`; then the thirteen count lines, from `Q6PRE services_total <n>` to `Q6PRE other_tenants_services_untouched <n>`, among them `target_active`, `target_archived`, `target_internal_only` and `partial_left_alone`, plus the six fact lines (`read_only on`, `tenant_slug_osteojp 1`, `column_vat_rate smallint`, `column_vat_exemption_code text`, `constraint_vat_rate 1`, `constraint_vat_exemption_code 1`); then `PRE-CHECK PASSED: <N> services ...`. Exit 0. It reads production and writes nothing.

### THE WRITE: one transaction, the count checked before the COMMIT, the ids recorded

Pasted only on the owner's word after he has read THE PRE-CHECK's counts, and within 30 minutes of it.

```
(
set -o pipefail
SHAWRITE=f8ce2bf1b1585a92d3f9518a0292533c958adcb74b46943b6bbcc297db741f97
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
WRITE=scripts/data/q6-vat-m07-2-write.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
REC=/Users/ivan/.osteojp-q6-vat-m07
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt
WOUT=/Users/ivan/.osteojp-q6-vat-m07/write.out

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
echo "${N} ${M}" | grep -qxE '[1-9][0-9]? [0-9a-f]{32}' || { echo "STOP: the carry did not read as a count and an md5. Nothing was written"; exit 1; }
test ! -e ${IDS} || { echo "STOP: the ids file of THE WRITE already exists, so the write has run or began. Never paste THE WRITE again. The lead rules. Nothing was written"; exit 1; }
mkdir -p ${REC} || { echo "STOP: the folder for the ids file could not be made. Nothing was written"; exit 1; }
rm -f ${WOUT} || { echo "STOP: the old transcript of THE WRITE could not be removed. Nothing was written"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was written"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-b.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was written"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-b.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was written"; exit 1; }
echo "the write:     ${N} services expected, the carry of THE PRE-CHECK. It runs now, in one transaction"
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v expect=${N} -v target_md5=${M} -v idsfile=${IDS} -f ${WRITE} > ${WOUT} 2>&1 || { echo "STOP: THE WRITE refused or failed (psql exited non-zero). If it stopped before its COMMIT nothing was written; if after, it may have committed. Do NOT open, print or paste its transcript; report this line only. Nothing else is pasted: the lead rules, and THE POST-CHECK runs only on the lead's word"; exit 1; }
grep -qxF "Q6WRITE ready_to_commit ${N}" ${WOUT} || { echo "STOP: THE WRITE's transcript does not show ready_to_commit ${N}. Do NOT open it; report this line only. The lead rules"; exit 1; }
grep -qxF "Q6WRITE COMMITTED ${N}" ${WOUT} || { echo "STOP: THE WRITE's transcript does not show COMMITTED ${N}. Do NOT open it; report this line only. The lead rules"; exit 1; }
test -f ${IDS} || { echo "STOP: THE WRITE committed, but its ids file is not there. The audit rows hold the same ids; the lead rules"; exit 1; }
IC=$(awk 'END { printf "%d", NR }' ${IDS}) || { echo "STOP: THE WRITE committed, and its ids file could not be counted. The lead rules"; exit 1; }
[ "${IC}" = "${N}" ] || { echo "STOP: THE WRITE committed ${N} rows, and its ids file holds ${IC} lines. The audit rows hold the ids; the lead rules"; exit 1; }
BAD=$(awk 'length($0) != 36 || $0 !~ /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/ { c++ } END { printf "%d", c }' ${IDS}) || { echo "STOP: THE WRITE committed, and its ids file could not be checked. The lead rules"; exit 1; }
[ "${BAD}" = 0 ] || { echo "STOP: THE WRITE committed, and ${BAD} lines of its ids file are not ids. The lead rules"; exit 1; }
echo "THE WRITE: COMMITTED. ${N} services of the tenant osteojp read 0% and M07, with ${N} audit rows. The ids are recorded in ${IDS} and are not printed. Paste THE POST-CHECK now."
)
```

**EXPECT:** `running from:`; the sidecar line `docs/data-op-q6-service-types-vat-m07.md: OK`; `pins:`; `Lisbon now: ... closed by the weekday table; ... inside: yes`; the target guard's lines; `the write: <N> services expected ...`; then NOTHING from psql (its whole output goes to the transcript under the operator's home); then `THE WRITE: COMMITTED. <N> services ...`. Exit 0.

### THE POST-CHECK: read only, against the recorded ids

```
(
set -o pipefail
SHAPOST=0a6ff1138605e2c7d045afb23cad5daa9a5a63d816a8554269534d1cc18718fa
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
DOCPIN=docs/data-op-q6-service-types-vat-m07.sha256
POST=scripts/data/q6-vat-m07-3-postcheck.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
IDS=/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt

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
test -f ${IDS} || { echo "STOP: the ids file of THE WRITE is not there. Nothing was read"; exit 1; }
IC=$(awk 'END { printf "%d", NR }' ${IDS}) || { echo "STOP: the ids file could not be counted. Nothing was read"; exit 1; }
echo "${IC}" | grep -qxE '[1-9][0-9]?' || { echo "STOP: the ids file holds ${IC} lines, not 1 to 99. Nothing was read"; exit 1; }
JOINED=$(awk '{ printf "%s%s", (NR > 1 ? "," : ""), $0 }' ${IDS}) || { echo "STOP: the ids could not be joined. Nothing was read"; exit 1; }
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/q6-target-c.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/q6-target-c.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -v ids=${JOINED} -v expect=${IC} -c "begin read only" -c "set local statement_timeout = '60s'" -f ${POST} -c "rollback" > /tmp/q6-post.out 2>&1 || { echo "STOP: THE POST-CHECK refused or failed. Its reason is the Q6STOP line of /tmp/q6-post.out, which GREEN may print alone. Nothing was written: the transaction is read only"; exit 1; }
grep -qxF 'Q6POST read_only on' /tmp/q6-post.out || { echo "STOP: the post-check does not show a transaction that read as READ ONLY. Report this line only"; exit 1; }
XL=$(awk '!/^(Q6POST [A-Za-z0-9_ ]+)?$/ { c++ } END { printf "%d", c }' /tmp/q6-post.out) || { echo "STOP: the post-check's transcript could not be checked. Report this line only"; exit 1; }
[ "${XL}" = 0 ] || { echo "STOP: the post-check's transcript holds ${XL} lines that are not Q6POST count lines. Do NOT print it; report this line only. SOLO reads it"; exit 1; }
grep -qxF "Q6POST PASS written ${IC}" /tmp/q6-post.out || { echo "STOP: the post-check does not show PASS written ${IC}. Report this line only"; exit 1; }
grep -E '^Q6POST [a-z0-9_]+ [a-z0-9]+$' /tmp/q6-post.out || { echo "STOP: the count lines could not be printed. Report this line only"; exit 1; }
echo "POST-CHECK PASSED: the ${IC} recorded services of the tenant osteojp read 0% and M07, each with its one audit row, and no undo row exists. GREEN reports."
)
```

**EXPECT:** `running from:`; the sidecar line; `pins:`; `Lisbon now: ...`; the target guard's lines; the count lines `Q6POST read_only on`, `services_total`, `at_0_m07_total`, `at_0_m07_active`, `at_0_m07_archived`, `target_left_now` (information only), `partial_left_alone`, `other_values_left_alone`; then `POST-CHECK PASSED: the <N> recorded services ...`. Exit 0. It reads production and writes nothing.

## Rollback

**Run only on the lead's word,** in a dispatch of its own naming `scripts/data/q6-vat-m07-4-rollback.sql`, in a closed-hours night like the write. It is not part of the sitting, and nobody runs it to "tidy up" after a STOP.

It sets `vat_rate` and `vat_exemption_code` back to NULL on exactly the services THE WRITE recorded in `/Users/ivan/.osteojp-q6-vat-m07/written-ids.txt`, never by a broad WHERE: a service that reads 0% and M07 because staff chose it is not in the file and is never touched. Before any write, in one transaction under the same lock and timeouts, it refuses when: the ids are not a list of distinct lower-case uuids of the expected length; the tenant does not hold exactly one `service.vat_default_q6` audit row per recorded id, and no other (the file and the trail disagree); any recorded service no longer reads 0% and M07 (staff changed it since: the rollback never overwrites a staff change, and the lead rules); any recorded service carries a `service.*` audit row of another action written from 10 minutes before THE WRITE's own audit row on, or an `updated_at` later than THE WRITE's audit row (staff may have re-saved it with the same values, D17); or an undo audit row already exists. It never rolls back part of the set. (The RAISE text in `scripts/data/q6-vat-m07-4-rollback.sql` says "from THE WRITE on" for the first of those two; the query counts from 10 minutes before, as D17 says. The file is not changed for the wording, because its sha256 is pinned and rehearsed.)

**Its real horizon is short.** Any normal staff action on a written type (an edit, an archive, a restore, a patient-booking switch, every one of which writes a `service.*` audit row and moves `updated_at`) makes the rollback refuse for that whole set. In practice it is usable only shortly after THE WRITE, before staff touch the appointment types; after that, putting a value back is a staff edit on the types screen or a new data op the lead rules. It checks its UPDATE's row count and its undo audit rows' row count against the number of ids before the COMMIT, and an md5 of every other `services` row before and after. One audit row per service, action `service.vat_default_q6_undone`. It leaves a local marker, `/Users/ivan/.osteojp-q6-vat-m07/undone.ok`, and refuses to run while it exists.

If the ids file is lost after a committed write, the audit rows of `service.vat_default_q6` (entity_id) name the same services; rebuilding the file from them is a new step the lead rules, and this document does not author it.

### THE ROLLBACK: only on the lead's word. GREEN pastes the copy in that dispatch

```
(
set -o pipefail
HELD='PENDING: set in the rollback dispatch'
DOCSHA='PENDING: set in the rollback dispatch'
RUNDAY='PENDING: the Lisbon date of the night the rollback dispatch names, YYYYMMDD'
SHAUNDO=cec11f5a7b827da3c75700a00ce560ae8419591708e2e55c974ba6c43c0edc61
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

## NOT YET REHEARSED

**Nothing in this document has run against a database.** It was authored on 2026-11-04 with no Docker and no database started (another session held the only local stack that night). What stands today:

- **The fault-injection test** (`scripts/q6-service-types-vat-m07.test.mjs`) runs every block in GREEN's tool shape, in bash and in zsh, with every external command a stub, fails each call in turn, and proves every halt is explicit and that each block passes only on its expected output. It runs with no database (`DATABASE_URL` blank). It also holds the SQL's shape: the write's first statements, its single UPDATE and its predicate, the count checks before the COMMIT, the rollback keyed on the recorded ids.
- **NOT YET REHEARSED, to be done on a throwaway database by a session that did not write this, before the READY line:**
  - the four SQL files against a schema built from `main` plus 0110 at the head of #1704, with synthetic services rows: the clean case (both VAT fields empty on active, archived and internal-only rows, plus a partial row, a row at other values and a row of a second tenant), and each refusal (no tenant, two tenants, 0110 absent, a prior audit row, an empty target, a target above 60, a moved target between THE PRE-CHECK and THE WRITE by count and by md5, a mismatched `expect`);
  - the psql details the blocks rely on and that only a real psql shows: that `-q -A -t` prints only the `Q6` lines (THE PRE-CHECK and THE POST-CHECK STOP on any other line); that `\o :idsfile` writes the ids before the COMMIT, and whether a failed `\o` stops psql under `ON_ERROR_STOP=1`; that a `RAISE` inside the DO blocks exits psql with a non-zero code and rolls the transaction back;
  - the rollback, after a rehearsed write, including its refusals when staff changed one row after the write, and when staff re-saved one with the same 0% and M07 (a later `service.update` audit row; a later `updated_at`);
  - `git fetch origin refs/pull/1724/head` and `FETCH_HEAD` in the apply worktree, before and after the pull request merges (the fault-injection test stubs git);
  - the blocks themselves against the throwaway: THE PRE-CHECK, THE WRITE, THE POST-CHECK and THE ROLLBACK read only production, because the target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway. "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so." So each block's production path (the environment file, the guard, the connection) stays NOT REHEARSED; the rehearsal runs the SQL files with exactly the blocks' psql arguments.
- **No R4 round yet.** The review runs after the rehearsal, on the bytes the rehearsal ran.

## Known limits, harmless

- **An impossible RUNDAY passes the format check.** `RUNDAY` and `MIGNIGHT` are checked as `20YYMMDD` shapes, not as real dates. An impossible date can never equal the Lisbon clock's date, so the night window refuses it; one edge remains: macOS `date -j` may roll a date such as 20261131 over to the next month when it computes the day after, which could open the early morning (up to 06:29) of that rolled-over day. The dispatch's dates come from strategy's ruling and SOLO fills them; this is known and left as is.
- **THE ROLLBACK's `shasum -a 256 -c` of the sidecar is not separately tested.** It is redundant: the same block has already hashed the document at the fetched head (`git show`) against `DOCSHA` and checked the sidecar's text, on a clean worktree checked out at that head. The fault-injection test still fails that call in turn and proves it STOPs.

## What must happen before READY, in this order, and none of it by GREEN

1. Strategy answers Q6-A to Q6-E (a different answer changes the files, their pins and this document).
2. 0110 is applied to production in its own sitting, and GREEN reports.
3. The rehearsal above, by a session that did not write this, recorded in this document.
4. R4 rounds on the document, the four SQL files and the test, under the review-loop cap.
5. SOLO sets the first line to READY, recomputes the sidecar, and fills `HELD`, `DOCSHA`, `RUNDAY` and `MIGNIGHT` in GREEN's dispatch copy only (this document keeps `PENDING`).

## Review history

- **R4 round 1, 2026-11-04, on `d265a23a`: NOT PASS, 1 MAJOR, 3 MINOR, 2 NIT. All answered the same night; round 2 pending.**
  - MAJOR: the rollback named `origin/data/Q6-service-types-vat-m07` after `git fetch --prune`, so once the pull request merged and its branch was deleted it would STOP and could be passed only by editing the block. Now THE PRE-CHECK and THE ROLLBACK fetch `refs/pull/1724/head` explicitly and read `FETCH_HEAD`, pinned to `HELD` (D14).
  - MINOR 1: the test proved the SQL's shape, not its guards; a mutation sweep left 11 of 12 mutants alive. The test now holds the list of every refusal in each SQL file with its exact condition, and the key queries' predicates, so turning any one off fails it.
  - MINOR 2: the rollback read "still 0 and M07" as untouched. It now refuses on a later `service.*` audit row or a later `updated_at` (D17).
  - MINOR 3: "its own night after 0110" was not checked by machine. The dispatch now carries `MIGNIGHT` and THE PRE-CHECK refuses unless RUNDAY is later (D18, with its limit).
  - NITs: `updated_at` (D16) and the audit metadata (D7) are stated.
- **R4 round 2, 2026-11-04, on `981b412d`: no BLOCKER, no MAJOR; 2 MINOR, 4 NIT. The last loop under the review-loop cap; its fixes are not re-reviewed.** No SQL file changed.
  - MINOR 1: the test pinned each guard's IF line but not the statements feeding it (deleted GET DIAGNOSTICS, an assignment set to NULL, an md5 replaced by its baseline, a print moved past the COMMIT survived). The test now pins every statement of each SQL file, in order, comments and whitespace aside, and checks that every printed line but COMMITTED sits before the COMMIT. One mechanical sweep over the four files (each statement deleted, each assignment's right side set to NULL, each compared pair swapped and each comparison made against itself, each print moved past the COMMIT, a column dropped from each md5) leaves no survivor.
  - MINOR 2: THE WRITE and THE ROLLBACK each gained a scenario at 07:00 the morning after RUNDAY, which must STOP.
  - NITs: the rollback prose now says "from 10 minutes before" and states its short horizon; the two known, harmless limits are under "Known limits, harmless".
