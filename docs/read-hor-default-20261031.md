# HOR-DEFAULT-READ, 2026-10-31: who the new Horarios default (#1683) would affect, counts only

**READ ONLY. One block. No apply, no write.**
**Status: AUTHORED 2026-10-31 by SOLO's builder; THE SQL REHEARSED ON THROWAWAY DATABASES ON THE LOCAL STACK (lane blue, synthetic rows, the cases below) WITH A MUTATION SWEEP OF EVERY PREDICATE; THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-hor-default-20261031.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED"). R4: NOT YET REVIEWED.** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy, in which `PRHEAD` is the pull request's head commit SOLO names.

## Why this read exists

Pull request #1683 (HOR-01, branch `scheduling/HOR-01-clinic-hours-default`, not merged) makes a therapist with no schedule in force in Horarios work the clinic's opening hours, Monday to Friday, at every active clinic they belong to. Its body lists the production reads to run "before anyone relies on this". This is those reads as one file: how many therapists the default would reach, how many keep their own schedule, for how many "Usar horario da clinica" would refuse, which clinics' hours would be used, and how many therapists the patient portal shows today for comparison. It prints counts and clinic names only. It decides nothing and writes nothing.

## What it reads

`scripts/db/read-hor-default-20261031.sql`, sha256 `7f8285b65dedee02c22f117dc63c953bb3882a044af19b0311c7fb2279720944`. One result set, columns `n | check | observed | expected | verdict`. It prints counts, times of day, the read's Lisbon clock, a tenant ORDINAL (`tenant 1`, by creation order; never a tenant id or name) and clinic names. No person's id, name, email or phone. Tables read: `tenants`, `locations`, `users` (the three flags only), `availability_templates`, `staff_locations`, `therapist_services`, `services`, and the catalogue (`information_schema.columns`, `pg_attribute`) for the Saturday probe.

## The resolver's definitions, and where each comes from

Every predicate is copied from the code, not paraphrased. Line numbers are at the head of #1683, `ef66b8d133d6934bc9685babd3ca03d28f587b55`, unless marked `main` (`a63b9175`). A change to those lines changes this read's meaning.

| Term | Definition in the read | Source |
|---|---|---|
| eligible | `users.is_active` and `is_bookable` and not `is_shared_resource` (NESA). No role is read: the resolver reads none | `apps/web/lib/scheduling/effective-availability-core.ts:59-62` (`isClinicDefaultEligible`), read by `effective-availability.ts:113-132` |
| own row | an `availability_templates` row of the therapist with `is_active` true, at ANY clinic | `effective-availability.ts:53-70` |
| in force | an own row with `valid_until` null or on or after today's Lisbon date; a row that starts later counts | `effective-availability-core.ts:104-106` (`isCurrentOwnRow`); today is `effective-availability.ts:107-110` (`lisbonToday`) |
| who gets the default | per therapist: ANY own row in force anywhere means the typed schedule is the whole schedule and no clinic hours anywhere; ZERO such rows and eligible means the clinic's hours at every active clinic they are a member of | `effective-availability-core.ts:127-146` (`resolveEffectiveTemplates`), `effective-availability.ts:85-104` |
| member | a `staff_locations` row at a location with `is_active` true, both rows of the same tenant | `effective-availability.ts:140-161` (`readMemberClinics`), `apps/web/lib/admin/clinic-default-schedule.ts:55-59` |
| the switch refuses | an eligible therapist with own rows in force, one of which sits at a clinic (archived clinics included) that is not an active clinic they are a member of (`not_member`) | `effective-availability-core.ts:171-184` (`clinicDefaultSwitchVerdict`), fed by `clinic-default-schedule.ts:37-89` (rows in force at `:60-74`) |
| the clinic's hours | `locations.opens_at` to `closes_at`, Monday to Friday; nothing is generated unless `closes_at` is after `opens_at` | `effective-availability-core.ts:73-95` (`clinicDefaultTemplates`) |
| the midday closure | `midday_closed_from`, `midday_closed_to`: printed for reference, still its own rule | the PR body, default 8 |
| Saturday | `locations.saturday_closes_at` does not exist yet (#1682, held). Probed in the catalogue (`information_schema.columns` and `pg_attribute`), never named as a column; its value is read as `to_jsonb(l) ->> 'saturday_closes_at'`, which is NULL when the column is absent instead of raising 42703 | `packages/db/src/location-saturday.ts` (the same `information_schema` probe) |
| the portal shows | active, bookable, not a shared resource; an active template at the clinic whose dates overlap today to today + 14; mapped to an active, patient-bookable, not internal-only service offered at that clinic (`location_id` null or this clinic); the clinic active | `apps/api/lib/appointments/store.ts:867-886` (`listBookableTherapists`), `:299-309` (the mapping), `:418-425` and `:433-435` (the catalogue's services), `booking.ts:419` (`OPEN_SLOTS_HORIZON_DAYS = 14`), all on `main` |

Every table is read at its own tenant, as the application's tenant-scoped reads see it: a membership row whose location belongs to another tenant is not a membership.

## THE VERDICTS, AND WHAT EACH EXPECTS

A PASS is **10 OK / 0 REVIEW / 0 VACUOUS / 0 FAIL**. A zero is never a pass: a verdict whose subject is empty reads VACUOUS, and a fault seen directly reads FAIL first. The counts are measurements, not verdicts: a zero count is an answer, and the block never judges one.

| n | Verdict | EXPECT (OK) | VACUOUS when | FAIL when |
|---|---|---|---|---|
| 0 | the transaction is READ ONLY | `on` | never | anything else |
| 1 | tenants | at least 1 | none | never |
| 2 | active clinics, every tenant | at least 1 | none | never |
| 3 | active clinics whose `closes_at` is not after `opens_at` (the default would generate nothing there) | 0 of at least 1 | no active clinic | any |
| 4 | active clinics whose midday closure is half set, not ordered, or outside the clinic's hours | 0 of at least 1 | no active clinic | any |
| 5 | the column `locations.saturday_closes_at`, by `information_schema` and by `pg_attribute` | `absent` (OK). `present` reads REVIEW: #1682 has been applied, the Saturday hours in rows 40 apply to the default, and SOLO reads them | never | the two probes disagree, or there is no `locations` table |
| 6 | eligible therapists, every tenant | at least 1 | none | never |
| 7 | the groups add up: eligible = own (switch runs) + own (switch refuses) + zero in force; zero = members of 0 + 1 + 2 or more clinics; default = 1 + 2 or more; expired-only within zero; and a second count of who gets the default, written from the tables again and sharing no step with the first but the clock, agrees | every equation holds | no eligible therapist | any equation fails |
| 8 | the per-clinic membership counts (rows 41 and 42 summed) equal the per-therapist ones | equal | no eligible membership at all | they differ |
| 9 | therapists the portal shows today with no own row in force | 0 of at least 1 | the portal shows nobody | any. The default must never reach the portal (#1683 leaves it unchanged); a FAIL means the read's two definitions have drifted |

**The block's verdict rule.** It counts the ten verdict rows. PASSED: each of 0 to 9 exactly once, all OK. REVIEW (exit 0, never PASSED): the same, except verdict 5 reads REVIEW. Anything else, any FAIL, any VACUOUS, a REVIEW on another verdict, or a verdict missing, doubled or extra, is a STOP; the table is still in the file for SOLO.

## THE COUNTS (INFO rows, never judged)

| n | Per | What |
|---|---|---|
| 20 | the read | the read's clock in Lisbon, and today's Lisbon date, from which "in force" is measured |
| 21 | tenant | eligible therapists |
| 22 | tenant | eligible with own rows in force: they keep their own schedule and get no clinic hours anywhere |
| 23 | tenant | of 22, "Usar horario da clinica" would run |
| 24 | tenant | of 22, it would refuse (rows in force at a clinic they are not an active member of) |
| 25 | tenant | eligible with zero own rows in force: the default is for them |
| 26, 27, 28 | tenant | of 25, members of 0 active clinics (no hours anywhere, as today), of exactly 1, of 2 or more |
| 29 | tenant | eligible whose only active rows are expired |
| 30 | tenant | of 29, members of 1 or more active clinics: they newly get the clinic's hours |
| 31 | tenant | eligible with no active row at all |
| 32 | tenant | not eligible, for context: NESA (active, bookable, shared), active not bookable, inactive |
| 40 | clinic | active or archived; `opens_at`, `closes_at`; the midday closure; Saturday (`no column`, or its closing time when the column exists) |
| 41 | clinic | eligible therapists who are active members |
| 42 | clinic | of 41, zero own rows in force: they get the clinic's hours here |
| 43 | clinic | of 42, only expired rows |
| 44 | clinic | eligible therapists with own rows in force here |
| 45 | clinic | of 44, not an active member here: the switch refuses them and names this clinic |
| 46 | clinic | active members whose rows in force are all at other clinics: no hours here, neither their own nor the clinic's |
| 47 | clinic | therapists the portal shows here today |
| 50 | all tenants | `HOR_SUMMARY`: the totals of rows 21 to 31 and the portal count, counts only. The block echoes this one row |

A clinic row is labelled `tenant <n> / <clinic name>`, with ` (archived)` for a clinic whose `is_active` is false. An archived clinic's rows 41 to 43 read 0 by definition; its row 45 is where a schedule left at a closed clinic shows.

## Known limits

- **Who is a therapist.** The resolver reads no role, only the three flags, so neither does this read. An owner or an administrator marked bookable is counted, exactly as the resolver would give them the default.
- **The online-booking hold.** `ONLINE_BOOKING_HELD_LOCATION_IDS` is an environment variable of the portal, not a database row, and is not read. A held clinic's row 47 counts therapists the portal would show if it were not held.
- **The portal count is the roster, not the slots.** Row 47 is the therapist step's question (would it name this therapist for some service here). It does not test that a slot is free, as the roster does not.
- **The day.** "In force" is measured from the read's own Lisbon date. A row whose `valid_until` is today counts as in force, as in the resolver.
- **Saturday.** When the column exists, row 40 prints its value; this read does not judge it. Verdict 5 reads REVIEW so a person looks.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes to production, so no STOP leaves anything changed there.** A VACUOUS or FAIL verdict stops the block after the table is written: GREEN reports the printed lines, and SOLO reads the file.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-hor-default-20261031.sql`, sha256 `7f8285b65dedee02c22f117dc63c953bb3882a044af19b0311c7fb2279720944` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes the shadow-compare documents pin) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-hor-default-20261031.sha256` pins it |
| The commit | the dispatch names the pull request's head commit in `PRHEAD`; the block fetches `refs/pull/1686/head` and refuses any other sha |

## When

Any time after the dispatch is filled and while no other GREEN sitting runs. It is read only, so clinic hours do not bind it. Its answer is about the day it runs: "in force" is measured from that Lisbon date.

## Where the output goes

To `/Users/ivan/osteojp-handover/hor-default-read-20261031.out` and nowhere else. It holds counts and clinic names only, but it is production's shape and stays out of the repository, a pull request, a card and a commit. psql writes it there directly (`> ${OUT} 2>&1`, no `tee`). The block prints only the verdict counts and the `HOR_SUMMARY` row (counts only). GREEN never opens the file; SOLO reads it.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
PRHEAD=PENDING
DOCSHA=PENDING
PRNUM=1686
SHAREAD=7f8285b65dedee02c22f117dc63c953bb3882a044af19b0311c7fb2279720944
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-hor-default-20261031.sql
DOC=docs/read-hor-default-20261031.md
OUTDIR=/Users/ivan/osteojp-handover
OUT=/Users/ivan/osteojp-handover/hor-default-read-20261031.out
echo "${PRHEAD} ${DOCSHA}" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64}' || { echo "STOP: the head commit or the document's sha256 still reads PENDING, so it is NOT READY. Nothing was read"; exit 1; }
ZONE=$(TZ=Europe/Lisbon date +%Z) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
[ "${ZONE}" = "WET" ] || [ "${ZONE}" = "WEST" ] || { echo "STOP: the Lisbon zone reads [${ZONE}], not WET or WEST. Nothing was read"; exit 1; }
NOW=$(TZ=Europe/Lisbon date +%Y%m%d%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was read"; exit 1; }
echo "lisbon now:  ${NOW} ${ZONE}"
[ -d "${OUTDIR}" ] || { echo "STOP: the handover folder is not there. Nothing was read"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
DIRTY=$(git status --porcelain) || { echo "STOP: the worktree's status could not be read. Nothing was read"; exit 1; }
[ -z "${DIRTY}" ] || { echo "STOP: the apply worktree is not clean. Nothing was read"; exit 1; }
git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request's head could not be fetched. Nothing was read"; exit 1; }
FH=$(git rev-parse FETCH_HEAD) || { echo "STOP: the fetched head could not be read. Nothing was read"; exit 1; }
[ "${FH}" = "${PRHEAD}" ] || { echo "STOP: the pull request's head is [${FH}], not the commit the dispatch names. Nothing was read"; exit 1; }
git checkout --quiet --detach ${PRHEAD} || { echo "STOP: the head commit could not be checked out. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was read"; exit 1; }
[ "${HD}" = "${PRHEAD}" ] || { echo "STOP: the worktree is not on the head commit [${HD}]. Nothing was read"; exit 1; }
echo "checked out: ${HD}"
D=$(shasum -a 256 ${DOC} | cut -d' ' -f1) || { echo "STOP: this document could not be hashed. Nothing was read"; exit 1; }
echo "document:    ${D}"
[ "${D}" = "${DOCSHA}" ] || { echo "STOP: this document is not the one the dispatch names. Nothing was read"; exit 1; }
shasum -a 256 -c docs/read-hor-default-20261031.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as hor_read_transaction" -f ${READFILE} -c "rollback" > ${OUT} 2>&1 || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are in ${OUT}), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are in ${OUT}), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "REVIEW") w++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d OK / %d REVIEW / %d VACUOUS / %d FAIL", o, w, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. The table is in ${OUT}"; exit 1; }
echo "verdicts: ${CNT}"
RES=$(awk -F'|' '{ n = $1; gsub(/[[:space:]]/, "", n); v = $NF; gsub(/[[:space:]]/, "", v); if (v != "OK" && v != "REVIEW" && v != "VACUOUS" && v != "FAIL") next; c[n]++; t++; if (v == "REVIEW") { w++; if (n != "5") x++ } else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { s = 1; for (i = 0; i <= 9; i++) if (c[i] != 1) s = 0; if (t != 10) s = 0; if (f + a + x == 0 && s == 1) print (w == 0 ? "PASS" : "REVIEW"); else print "STOP" }' ${OUT}) || { echo "STOP: the verdicts could not be judged. The table is in ${OUT}"; exit 1; }
[ "${RES}" = "PASS" ] || [ "${RES}" = "REVIEW" ] || { echo "STOP: the read has a FAIL or a VACUOUS verdict, a REVIEW outside verdict 5, or a verdict missing, doubled or extra. The table is in ${OUT}; GREEN does not open it, SOLO reads it"; exit 1; }
SUM=$(grep -E '^[[:space:]]*50[[:space:]]*[|][[:space:]]*HOR_SUMMARY[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no HOR_SUMMARY row. The table is in ${OUT}"; exit 1; }
echo "${SUM}"
[ "${RES}" = "REVIEW" ] || echo "HOR-DEFAULT-READ PASSED: 10 OK / 0 REVIEW / 0 VACUOUS / 0 FAIL. The whole table is in ${OUT}; GREEN does not open it, SOLO reads it"
[ "${RES}" = "PASS" ] || echo "HOR-DEFAULT-READ REVIEW: no FAIL, no VACUOUS, every verdict OK but verdict 5: the Saturday column exists. This is NOT a pass: SOLO reads the Saturday hours in ${OUT} (rows 40); GREEN does not open it"
)
```

**EXPECT:** `lisbon now:  <the time> WET`; `checked out: <PRHEAD>`; `document:`, then `docs/read-hor-default-20261031.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; `verdicts: 10 OK / 0 REVIEW / 0 VACUOUS / 0 FAIL`; one line `50 | HOR_SUMMARY | eligible=... | ... | INFO` (counts only); then `HOR-DEFAULT-READ PASSED: 10 OK / 0 REVIEW / 0 VACUOUS / 0 FAIL. ...`. Exit 0. If #1682 has been applied before the read runs, `verdicts: 9 OK / 1 REVIEW / 0 VACUOUS / 0 FAIL` and `HOR-DEFAULT-READ REVIEW: ...`, also exit 0, and **REVIEW is not a pass**. psql prints nothing to the terminal. **REPORT THESE LINES AND THE FILE'S PATH.** It writes nothing to production. The apply worktree is left detached at `PRHEAD` after the read: the next sitting does its own checkout and checks its own commit.

**STOP:** any `STOP:` line. The likely ones: `NOT READY` (the dispatch was not filled in); `the pull request's head is [...]` (the pull request moved after the dispatch was written: SOLO re-pins); `a FAIL or a VACUOUS verdict` (the read ran: report the printed lines and the file's path; SOLO reads the file before anything is decided).

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly: `set transaction read only; set local statement_timeout = '120s';`
3. Below it, paste the whole of `scripts/db/read-hor-default-20261031.sql`. To copy it exactly, once a clone holds the pull request's head, type this in Claude Code. It copies the file only if it is the reviewed one, and otherwise prints a STOP and copies nothing:
   `! F=/Users/ivan/Projects/GitHub/osteojp-solo-clone/scripts/db/read-hor-default-20261031.sql; [ "$(shasum -a 256 "$F" | cut -d' ' -f1)" = "7f8285b65dedee02c22f117dc63c953bb3882a044af19b0311c7fb2279720944" ] && pbcopy < "$F" && echo "COPIED: the reviewed read is on the clipboard" || echo "STOP: the file is not the reviewed read, or it could not be copied. Paste nothing"`
4. Run. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1 to 9 must read `OK` (row 5 may read `REVIEW` once #1682 is applied, and that is not a pass).
5. Send the whole table to SOLO privately (counts and clinic names; no person). Do not post it anywhere public.

The editor runs the text as one transaction, so the first line makes the server refuse any write.

## Rehearsal

2026-10-31, throwaway databases on the local stack, lane blue (127.0.0.1:54622), synthetic rows only. The lane was already up; it was not reset. The test copies the lane's `public` schema with `pg_dump --schema-only` into a throwaway base database, seeds it, makes one throwaway per case from that base, and drops them all at the end. The read ran as the block runs it (`begin read only`, 120 seconds, `rollback`) with ONE substitution: its single clock line `select now() as t1` replaced by a fixed instant, 2026-10-31 10:00 Lisbon unless the case says otherwise. The test (`HOR_READ_TEST_PGURL` set to the lane) refuses any host but 127.0.0.1 or localhost.

**The seed.** Two synthetic tenants. Tenant 1 has clinics LV (08:00 to 21:00), CB (08:00 to 20:00, midday 13:00 to 14:00) and ARQ (archived), and five services (one for every clinic, one for CB only, one internal-only, one switched off, one not patient-bookable). Tenant 2 has clinic BL. 23 synthetic users, each built to one rule: no rows at one clinic, at two, at an archived one only, at none; only expired rows (with and without a clinic); only a switched-off row; rows in force at a clinic they belong to, ending today, starting inside and after the portal's 14 days, at a clinic they do not belong to, at the archived clinic; an expired row at another clinic beside rows in force; portal mappings that do and do not count; NESA with and without rows; NESA not bookable; not bookable; inactive; and in tenant 2 a membership row pointing at tenant 1's clinic.

| Case | Seeded | Verdicts | Counts asserted |
|---|---|---|---|
| base | the seed | 10 OK | every row 21 to 47 exactly, and row 50: `eligible=18 own=9 switch_runs=7 switch_refuses=2 zero_in_force=9 clinics_0=4 clinics_1=4 clinics_2plus=1 get_default=5 expired_only=2 expired_only_get_default=1 no_active_row=7 portal_visible=4`. Per clinic (41 to 47): LV 12, 4, 1, 6, 0, 2, 2; CB 2, 1, 0, 2, 1, 0, 2; ARQ (archived) 0, 0, 0, 1, 1, 0, 0; BL 1, 1, 0, 0, 0, 0, 0 |
| empty | no tenant at all | 1, 2, 3, 4, 6, 7, 8, 9 VACUOUS; 0 and 5 OK | row 50 all zero |
| nobody eligible | every user not bookable | 6, 7, 8, 9 VACUOUS | row 32: `0, 20, 1` and `0, 2, 0` |
| no active clinic | every clinic archived | 2, 3, 4, 8, 9 VACUOUS; 7 OK | tenant 1: all 9 with rows in force refused, all 7 without rows at 0 clinics |
| closes when it opens | LV `closes_at = opens_at` (its CHECK dropped in the throwaway) | 3 FAIL | `1 of 3` |
| midday half set | CB `midday_closed_to` null (CHECK dropped) | 4 FAIL | |
| midday outside the hours | CB 07:00 to 08:30 (CHECK dropped) | 4 FAIL | |
| midday not ordered | CB 14:00 to 13:00 (CHECK dropped) | 4 FAIL | |
| Saturday column exists | `saturday_closes_at` added, CB 13:00 | 5 REVIEW, all others OK | every base count unchanged; row 40 prints `Saturday closes 13:00:00` at CB and `column present, no time` elsewhere |
| Saturday column added and dropped | added, then dropped | 10 OK | every base count; `absent` (a dropped column is renamed in `pg_attribute`) |
| Lisbon date | clock 2026-08-16 00:30 WEST (23:30 UTC the day before), a row ending 2026-08-15 | 10 OK | row 20 `2026-08-16 00:30, today 2026-08-16`; row 29 for tenant 1 reads 1 |

**The mutation sweep** (one sweep, every predicate once, mechanically). 52 mutants, each a single text change to the read that must occur exactly once in it, each run against all 11 cases: **52 killed, 0 survivors.** They cover: "in force" (today counts, an open row counts, active rows only, the Lisbon date); eligible (active, bookable, not NESA, each alone); membership (active clinic, same tenant); the switch's refusal (rows in force only, membership of that clinic, archived clinics included); the 0, 1 and 2-or-more buckets; who gets the default; expired-only and its clinic condition; no active row; the context counts; every portal predicate (horizon, not expired, not NESA, bookable, active user, active clinic, active template, template at this clinic, the therapist's own mapping, active service, not internal, patient-bookable, service at this clinic); every per-clinic count; the recount's two conditions; verdict 3's strict order; verdict 4's three conditions; verdict 5's two probes and its REVIEW. The test lists which case killed each mutant. Two controls were run once by hand and both failed as they should: a wrong expected count (41 at LV set to 13) and a mutant that changes only a comment (listed as a survivor).

**What no case can reach, said plainly.** Verdicts 7, 8 and 9 compare the read with itself; on consistent data they cannot FAIL. Their FAIL arms are shown reachable by mutants of the other side (the recount, the per-clinic member count, the portal's expiry and template predicates each turn them FAIL), not by data. A mutant that disables one of those three comparisons would survive every case, so none is in the sweep.

Run: `HOR_READ_TEST_PGURL=postgresql://postgres:postgres@127.0.0.1:54622/postgres node --test scripts/read-hor-default-20261031.test.mjs`, through the lane's clean-environment wrapper.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway ("A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so."). So the block's production path (the environment file, the guard, the connection, the fetch of the pull request's head) is NOT REHEARSED. What stands in for it: the SQL rehearsed above with exactly the block's psql transaction arguments and one named clock substitution, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit, that the block passes only on ten single OK verdicts with a `HOR_SUMMARY` row, and that it prints REVIEW only for verdict 5.

Not measured: the read's run time on production's row counts. Its inputs are a few dozen users, a handful of clinics and a few hundred schedule rows; 120 seconds is the bound.
