# STAFF-10 v2: one held data op for JP(cb) at Linda-a-Velha and the NESA twins

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no journal
entry. Stage 0 (files), a HEAD CHECK, stage 1 (read), stage 2 (write) and stage 3
(verify). Any `STOP:` line, any `FAIL` verdict or any `ERROR` halts the sitting.

**Authored and rehearsed by SOLO. Run by GREEN,** a fresh session launched with the
apply settings, on the owner's dispatch naming the three files below by filename
(`CLAUDE.md`, "Who applies migrations"). The authoring lane has run every byte below
against a throwaway database and against nothing else.

| Fact | Value |
|---|---|
| Card | `STAFF-10`, a ruled Tier C item |
| Replaces | PR #1433 (branch `data/STAFF-10-list-c-nesa-twins`, kept, not merged) and the original STAFF-10 write in `docs/data-op-staff-10.md`, which now carries a SUPERSEDED banner and must not be run |
| Rulings, owner, 2026-09-24, paraphrased | (a) JP(cb)'s Linda-a-Velha appointments from before the start of the Lisbon run day move to JP(lv); (b) a past NESA twin pair whose NESA row is not installed at the booking clinic has that row moved to the NESA installed there; (c) a future NESA twin pair takes option a: the person row keeps, takes the NESA as practitioner_2, and the NESA row is cancelled, with a proof that the machine hour stays held; (d) every other past twin is listed and never changed; (e) the original schedule-row actions carry forward with their defects fixed |
| JP(cb) | `54d486e0-a9c3-4c82-acac-8b909ce5a2d0` (the Castelo Branco row) |
| JP(lv) | `0c1a0000-0000-4000-8000-000000000001` (the Linda-a-Velha row) |
| NESA(cb) | `0c1a0000-0000-4000-8000-000000000002` (installed at Castelo Branco) |
| NESA(lv) | `bdc466d7-f81f-4f8c-aa2e-b85194d73e1a` (installed at Linda-a-Velha) |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Branch | `data/STAFF-10-v2-one-held-op`, labelled `held-for-apply` from the moment its PR opens, unarmed until this op is proven |
| Stage 1 | `scripts/data/staff-10-v2-1-read.sql`, READ ONLY, sha256 `34ef1b6d1d5e0b000bcb3ced00c9bdce3b841a17458348e5a14fc18aa1633ec1` |
| Stage 2 | `scripts/data/staff-10-v2-2-write.sql`, ONE DO block in ONE transaction, sha256 `098f260040154a662157ba36202c741c3a0d9bab353d53b81dd190973d4e501f` |
| Stage 3 | `scripts/data/staff-10-v2-3-verify.sql`, READ ONLY, 25 verdicts and a SUMMARY row, sha256 `8730fc4a7b27694aed0960a25f3993620949a2f96e3bdc46078bffdd1eb46fc6` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, byte-identical to `origin/main` at `f4e892cd` |
| This document | `docs/data-op-staff-10-v2.md`, pinned by `docs/data-op-staff-10-v2.sha256` and asserted by every stage that reads a file |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `availability_templates.is_active` false (four retire classes); `availability_templates.user_id` to JP(lv) (the moved Saturdays); at most ONE `time_off` DELETE (the 30 September block, copied whole into the audit row first); `appointments.practitioner_id` (rulings a and b); `appointments.practitioner_2_id` and `appointments.status` = cancelled (ruling c); `appointments.updated_at` on every appointment it writes; ONE `audit_log` row, action `staff.staff10_v2.apply` |
| What no stage touches | `clinical_records` (authorship included), `invoices`, `users`, `staff_locations`, every appointment outside the four sets, JP(cb)'s PAST Castelo Branco appointments and JP(cb)'s Castelo Branco schedule rows. Stage 2 compares each by md5 inside its own transaction. A FUTURE JP(cb) Castelo Branco appointment is not in this list: when it is the person row of a future NESA pair (stage 1 section 7), ruling (c) writes its `practitioner_2_id` and `updated_at`, as for every such person row |
| Apply before merge | yes. The PR cannot merge while the label is on (`held-for-apply-blocks-merge.yml`), so every stage derives its head from `origin/data/STAFF-10-v2-one-held-op`, never from `main` |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/data-op-staff-10-v2.sha256` and every stage
checks it with `shasum -a 256 -c` before it trusts a pin written here.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted
into zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document).

## What it fixes, in one paragraph

JP exists as two staff rows, one per clinic. The Castelo Branco row still holds hours
and history at Linda-a-Velha, and the Fisiozero import left one NESA session on two
rows (a NESA row and a person row) wherever the old system held it in both columns.
This op, in one transaction: retires or moves every active JP(cb) Linda-a-Velha
schedule row, removes the wrong 30 September block, moves JP(cb)'s past Linda-a-Velha
appointments to JP(lv), moves each past NESA row booked at a clinic its NESA is not
installed at to the NESA that is, and resolves each future NESA twin into one row that
holds both the therapist's hour and the machine's.

## The owner questions, and the default this op is built to

Paraphrased, no counts. Each default is what the files do today; a different ruling
changes the files, their pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | What does ruling (a) cover? | Appointments only, past only: `starts_at` before 00:00 Lisbon on the run day. JP(cb)'s future Linda-a-Velha appointments stay on JP(cb); they are reception's list. An appointment at Linda-a-Velha naming JP(cb) as practitioner_2 refuses (R12) |
| Q2 | Past list A pairs (JP(cb) and JP(lv) booked for one patient at one start) | Moved like any other past row, so both end on JP(lv). Stage 1 section 5b lists them; R14 refuses a move that would put two overlapping confirmed rows on JP(lv) |
| Q3 | A past twin whose person row is JP(cb) at Linda-a-Velha | **OWNER TO CONFIRM: the build departs from the written default in one case.** The written default was: ruling (a) moves the person row, and the NESA row is left alone and listed. The build does that when the NESA row is installed at its clinic (section 8, `person_row_moved_by_a = true`). When the NESA row is NOT installed at its clinic, ruling (b) also applies to it, and the build moves it to the NESA installed there (section 6, `person_row_moved_by_a = true`), so the pair ends on JP(lv) and that clinic's NESA. Leaving it alone would keep a NESA row booked at a clinic its NESA is not installed at, the very thing ruling (b) corrects. This is likely the common shape (JP(cb) and NESA(cb) both booked at Linda-a-Velha, as the import attributed them), and the rehearsal runs it (arm Q3). A ruling that the NESA row stays changes the files, their pins and the rehearsal |
| Q4 | Ruling (b)'s target | Exactly one active shared resource installed at the booking clinic; none or more than one refuses (R11) |
| Q5 | A future pair whose person window does not cover the NESA window | Refuses (R17). The op never extends a window |
| Q6 | A future NESA row with a pack session, a clinical record or an invoice | Refuses (R20): cancelling it would give a pack session back or orphan a record |
| Q7 | The raw cancel writes no per-row cancel audit entry and sends no staff notification | The op's one audit row stands in for both, carrying every id; `updated_at` is set on every appointment written |
| Q8 | What is the provenance record of ruling (d)? | Stage 1 section 8 plus the `p_pairs` and `keep_ids` arrays in the audit row. No new database table |
| Q9 | What counts as a real Saturday, and where? | Both: the move set requires the date itself to be a Saturday, and stage 3 checks the Linda-a-Velha roster on the next real Saturday JP(lv) holds |
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
| D9 | Added: a block that overlaps 30 September but also covers another day | Refuses (R26): it is a longer absence, not the block ruled wrong |
| D10 | Added: which sets must be non-empty? | The four untouched sets stage 3 compares by md5: JP(cb)'s Castelo Branco schedule rows and past Castelo Branco appointments (R25), the clinical records on the rows the op writes, and the past twin rows it leaves alone (R27). An empty one refuses before the write. Stage 1 section 5 prints how many ruling (a) rows carry a clinical record, so a refusal here is visible before stage 2 |
| D11 | Added: what is the booking clinic of a past pair under ruling (b)? | The NESA row's own clinic (`location_id`), and the person row must sit at the same clinic. A pair to move whose two rows sit at two clinics refuses (R29), as a future one does (R18, D4): which clinic booked the session would be a guess. Section 6 prints both clinics and a `two_clinics` flag |
| D12 | Added: what if stage 3's roster check would find no real Saturday to check? | Refuses (R28) before the write, for the same reason as D10 |
| D13 | Added: what if a table stage 2 writes carries a trigger the system did not create? | Refuses (R30), and stage 2's P4 reads the catalog again and stops too. Main has none, but production has run ahead of main before, and such a trigger would write outside the whitelist inside the committed transaction with no row count checked. Stage 1 section 4b lists any it finds |
| D14 | Added: verdict 10 on a day with nothing to retire | VACUOUS, and allowed: with no JP(cb) row inactive before the op and none retired by it, there is nothing a reactivation could be read against. Verdicts 2 to 5 are VACUOUS on that day too |

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

## HEAD CHECK: run this FIRST, and read it with your eyes

Paste this on its own, before stage 1, and again before stage 2. It writes nothing and
touches no database.

```
(
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
echo "head of the branch this document applies from:"
git rev-parse origin/data/STAFF-10-v2-one-held-op
)
```

**Compare the sha it prints with the one STAGE 0 printed as `running from`.**

- **Before stage 2 has written:** a moved head means the sitting starts again from
  stage 0, and stage 1 is run again.
- **After stage 2 has written: NEVER run stage 1 or stage 2 again.** Stage 1 and stage 2
  both refuse once the write marker exists, and R08 refuses in the database regardless.
  Stage 3 is READ ONLY and can be pasted on the new head: it asserts its own file by
  sha256 and stops if that changed. Report both shas.

## STAGE 0: the files, the pins and the head

```
(
set -eo pipefail
BRANCH=data/STAFF-10-v2-one-held-op
DOCPIN=docs/data-op-staff-10-v2.sha256
SHA1=34ef1b6d1d5e0b000bcb3ced00c9bdce3b841a17458348e5a14fc18aa1633ec1
SHA2=098f260040154a662157ba36202c741c3a0d9bab353d53b81dd190973d4e501f
SHA3=8730fc4a7b27694aed0960a25f3993620949a2f96e3bdc46078bffdd1eb46fc6
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
test -f scripts/data/staff-10-v2-1-read.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/data/staff-10-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/staff-10-v2-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-1-read.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
echo "STAFF-10 V2 FILES VERIFIED"
)
```

**EXPECT: `running from <sha>`, then `STAFF-10 V2 FILES VERIFIED`.** It reads no
database.

## STAGE 1: the read

```
(
set -eo pipefail
BRANCH=data/STAFF-10-v2-one-held-op
SHA1=34ef1b6d1d5e0b000bcb3ced00c9bdce3b841a17458348e5a14fc18aa1633ec1
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/staff10v2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run stage 1 or 2 again; go to stage 3"; exit 1; }
rm -f /tmp/staff10v2-stage1.out /tmp/staff10v2-stage1.ok

echo "--- THE HEAD. The sha printed next MUST equal the one the HEAD CHECK showed."
git fetch origin --prune
git rev-parse origin/${BRANCH}
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
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
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. Stage 2 refuses on the same lines. Report them; do not go on"; exit 1; }
RD=$(awk -F'|' 'index($1,"s10v2_run_day")>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/staff10v2-stage1.out)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 read the Lisbon day as ${RD}, and this machine's Lisbon clock disagrees"; exit 1; }
touch /tmp/staff10v2-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 2, 2b, 2c, 4, 4b, 6, 7 and 8 before stage 2."
)
```

**Read the output before pasting stage 2.** Section 4 prints 30 refusals, `R01` to
`R30`; the block has already stopped if any reads REFUSE. Section 4b must be empty. A
refusal that reads `VACUOUS` read an empty population: that is not a refusal, and the
sections above it say which population it was. Section 2b must read `partition holds`. Sections 6, 7 and
8 are the pairs rulings (b), (c) and (d) act on, by id.

## STAGE 2: the write

```
(
set -eo pipefail
BRANCH=data/STAFF-10-v2-one-held-op
SHA2=098f260040154a662157ba36202c741c3a0d9bab353d53b81dd190973d4e501f
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
NAMES=(
s10v2_run_day
s10v2_count_rcov s10v2_digest_rcov
s10v2_count_rpast s10v2_digest_rpast
s10v2_count_msat s10v2_digest_msat
s10v2_count_rphan s10v2_digest_rphan
s10v2_count_rwin s10v2_digest_rwin
s10v2_count_dblk s10v2_digest_dblk
s10v2_count_hjp s10v2_digest_hjp
s10v2_count_xnesa s10v2_digest_xnesa
s10v2_count_ft2 s10v2_digest_ft2
s10v2_count_fcan s10v2_digest_fcan
)

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/staff10v2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. Never run it again; go to stage 3"; exit 1; }
[ -n "$(find /tmp/staff10v2-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not pass in this sitting, or passed over an hour ago. Run stage 1 again"; exit 1; }
test -f /tmp/staff10v2-stage1.out || { echo "STOP: stage 1 left no transcript; run stage 1 again"; exit 1; }
[ -n "$(find /tmp/staff10v2-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }

echo "--- THE HEAD. The sha printed next MUST equal the one the HEAD CHECK showed just before this stage."
git fetch origin --prune
git rev-parse origin/${BRANCH}
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
shasum -a 256 -c docs/data-op-staff-10-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/staff-10-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/staff-10-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/staff10v2-stage1.out; }
RD=$(carry s10v2_run_day)
[ "${RD}" = "$(TZ=Europe/Lisbon date +%Y-%m-%d)" ] || { echo "STOP: stage 1 ran on Lisbon day ${RD}, not today. Run stage 1 again"; exit 1; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}); [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: run day ${RD}, ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/staff10v2-stage2.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/staff-10-v2-2-write.sql 2>&1 | tee /tmp/staff10v2-stage2.out
touch /tmp/staff10v2-written.ok
grep -q 'STAFF-10 V2 STAGE 2 DONE' /tmp/staff10v2-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its DONE line is missing. Never run stage 1 or 2 again. Paste stage 3 and report both"; exit 1; }
grep -q 'STAFF-10 V2 STAGE 2 COMMITTED' /tmp/staff10v2-stage2.out || { echo "STOP: psql exited 0, so stage 2 COMMITTED and the write stands, but its COMMITTED line is missing. Never run stage 1 or 2 again. Paste stage 3 and report both"; exit 1; }
echo "STAFF-10 V2 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the first write;
every assertion after a write raises too, and a raise inside the DO block rolls back
everything the block did. So a `STOP:` raised in the database (psql exit 3) always
means **nothing was written**, and so does every `STOP:` the block prints before psql
runs. **psql exit 0 means the COMMIT ran and the write stands:** the block touches the
written marker at once, before it reads the transcript, and the two `STOP:` lines it can
print after that point say so in their own words. The file pins
`client_min_messages = notice`, so a quieter role or database default cannot hide the
step lines. The NOTICE lines name each step: `P1` the sets, `P2` each refusal with its
control, `P3` the run day and the carries, `P4` the triggers the system did not create
(none, or it stops), `P5` the baselines, `P6` the machine hour before, `W1` to `W7` each
write with its row count, `A2` the machine hour after, and `STAFF-10 V2 STAGE 2 DONE`,
then `COMMITTED` after the COMMIT.

**psql exit 3** is every in-database STOP. An undefined carry fails before the block,
on the `set_config` statement, also with exit 3.

## STAGE 3: the verify. READ ONLY, re-issuable

```
(
set -eo pipefail
BRANCH=data/STAFF-10-v2-one-held-op
SHA3=8730fc4a7b27694aed0960a25f3993620949a2f96e3bdc46078bffdd1eb46fc6
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
PIN=$(git rev-parse origin/${BRANCH})
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "verifying from ${PIN}"
git checkout -q --detach ${PIN}
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
[ "${NV}" = 25 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 25"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/staff10v2-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '2|3|4|5|6|10|11|12|13|14|15|16|17|18|23|24|25' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/staff10v2-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "STAFF-10 V2 VERIFIED: ${PROFILE}. The RECEPTION section above lists each future pair by id."
)
```

**EXPECT: no FAIL, 25 verdicts, a SUMMARY row, and VACUOUS only on arms whose set can
legitimately be empty on the day**, which the block enforces: 2 to 6 (a schedule class
with nothing in it), 10 (nothing retired and no JP(cb) row inactive before, D14), 11 and
12 (no block overlapped 30 September), 13 to 18 (a ruling with nothing to do), 23
(nothing written), 24 and 25 (no practitioner_2 or no confirmed row to compare).
**Never VACUOUS: 1, 7, 8, 9, 19, 20, 21, 22.** The four md5
comparisons (9, 19, 20, 21) are the untouched sets, and an empty one refuses before the
write (R25, R27), so after it each of them always compares something; verdict 8's
Saturday is guaranteed the same way (R28). The block prints
the profile; the profile moves with the data, so no exact profile is asserted for
production.

## What every refusal and every verdict means

**Stage 1 section 4 and stage 2 P2, the same 30 lines.** `n` must be 0. `control` is
the population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | a JP row is missing, or the two JP rows are in different tenants |
| R02 | JP(lv) is inactive |
| R03 | JP(cb) is not installed at Castelo Branco |
| R04 | JP(lv) is not installed at Linda-a-Velha |
| R05 | a Saturday to move already exists identically on JP(lv), active or not (`availability_templates_dedupe_uq`, NULLS NOT DISTINCT). Counted over the MOVE set only, so a covered Saturday no longer refuses |
| R06 | more than one JP(cb) block overlaps 30 September. The predicate is the overlap form, `starts_at < 1 Oct 00:00 Lisbon AND ends_at > 30 Sep 00:00 Lisbon`, so a block that starts and ends on 30 September is caught. Its control is JP(cb)'s blocks from 23 September to 7 October, printed in section 2c |
| R07 | the original STAFF-10 write has already run |
| R08 | this v2 write has already run |
| R09 | an active JP(cb) Linda-a-Velha row is UNCLASSIFIED, or sits in other than exactly one class. Section 2b is the partition line |
| R10 | the shared resources are not exactly the two NESA rows, both active |
| R11 | a booking clinic of a past pair to move, or of a future pair, has no installed NESA or more than one |
| R12 | an appointment at Linda-a-Velha names JP(cb) as practitioner_2 |
| R13 | a ruling (a) row already names JP(lv) as practitioner_2 |
| R14 | ruling (a) would put two overlapping confirmed rows on JP(lv) (`appointments_no_double_confirmed`, 0061) |
| R15 | ruling (b) would put two overlapping confirmed rows on one NESA row |
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
| R26 | the block overlapping 30 September also covers another day. The app stores a whole-day block as Lisbon midnight to the next Lisbon midnight, which stays inside 30 September; a block reaching past it is a longer absence, not the block that was ruled wrong |
| R27 | an untouched set stage 3 compares by md5 is empty: no row the op writes carries a clinical record, or no past twin row is left untouched. Refused before the write, so verdicts 19 and 20 can never be vacuous after it |
| R28 | the roster check would have no real Saturday: JP(lv) holds no dated Linda-a-Velha real Saturday from today and no Saturday moves to it, so verdict 8 could not run. Refused before the write |
| R29 | a past pair ruling (b) would move has its two rows at two clinics, so which clinic booked it is a guess (D11). Its control is every past pair ruling (b) acts on |
| R30 | a table stage 2 writes (`appointments`, `availability_templates`, `time_off`, `audit_log`) carries a trigger the system did not create (D13). Its control is every trigger on those tables, the constraint triggers of each foreign key included, so an empty catalog read prints VACUOUS. Section 4b lists what it found |

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

**The carries.** For each of ten actions (`rcov`, `rpast`, `msat`, `rphan`, `rwin`,
`dblk`, `hjp`, `xnesa`, `ft2`, `fcan`) a count and an md5 over the action's ordered
keys, plus the Lisbon run day: 21 names, none a substring of another. The block that
computes them, between `STAFF-10 V2 SETS BEGIN` and `SETS END`, is byte-identical in
stage 1 and stage 2, so a recomputed carry can only differ when the database moved.

**Stage 3's 25 verdicts:**

1. exactly one v2 audit row;
2. to 5. every retired id of each class is inactive;
6. every moved id is an active real Saturday on JP(lv) at Linda-a-Velha;
7. JP(cb) holds no active Linda-a-Velha row, with the control that JP(lv) holds one from today (FAIL if the control is 0);
8. on the next real Saturday JP(lv) holds a dated Linda-a-Velha row, the roster predicate (`apps/api/lib/appointments/store.ts`, active and inside the window) finds JP(lv) (the positive control) and not JP(cb);
9. JP(cb)'s Castelo Branco schedule rows unchanged by md5;
10. JP(cb)'s inactive rows are exactly the ones before plus the retired ones (VACUOUS when both are none, D14);
11. and 12. no JP(cb) block overlaps 30 September, and the deleted one is recorded whole;
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
25. no two confirmed rows overlap on JP(lv) or either NESA row.

**Stage 3 is re-issuable, and its answers move with the clinic.** A reception edit
after the sitting can change 15 to 23 honestly: a future person row cancelled later
FAILs 15, 17 and 18. Read a later FAIL against the audit row's time before calling it
a defect of the op.

## Rehearsed on a throwaway database

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
so it is never past and stays on JP(cb); JP(cb)'s past Castelo Branco appointments; a NESA(cb) row
booked at Linda-a-Velha and a NESA(lv) row booked at Castelo Branco, both past; past
pairs at home, one whose person row is JP(cb) at Linda-a-Velha; future pairs with both
rows live; a future pair with the NESA side already cancelled; a near miss with no
service on one side; both NESA rows flagged and installed. It is reset BY ID between
arms, in FK order, whoever wrote the rows, and its shape is read back after every reset.
Four more shapes come from an arm rather than the fixture, so the other arms keep theirs:
a past pair whose person row is JP(cb) at Linda-a-Velha and whose NESA row is NESA(cb)
booked there (Q3); a ruling (b) pair whose person row sits at the other clinic (R29); a
trigger the system did not create (R30, dropped again by the reset); and a JP(cb)
Linda-a-Velha schedule with nothing to retire and no row inactive (verdict 10).

| File, in the authoring lane's scratchpad (not committed, as for 0090 to 0093) | sha256 |
|---|---|
| `rehearsal/fixture.sql` | `d3f37475cdd7ecc4a7ff8585e26038e6fe7aa8535a658d35da269a46c67b4ad2` |
| `rehearsal/reset.sql` | `737b56e098afdf8e87d4d3191507df2fb65cee5df3179faaaca23ab9dd8b64a9` |
| `rehearsal/arms/*.sql`, one mutation per arm, concatenated in name order | `01853fe8130575e2da01006c73a88accc2daeb5d15c9b5f03ad0b7fce4e79eb9` |
| `rehearsal/run-s10v2-arms.zsh`, the arms runner | `d989822f2acc59831d3a0533582756658c4d9e2c7f46e50144d45875936778e8` |
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
| stage 1 | 0 | every refusal line OK, none VACUOUS; `partition holds`; `STAGE 1 READ, NO REFUSAL` |
| HEAD CHECK | 0 | the same head |
| stage 2 | 0 | P3 the run day and all 21 carries match; P4 no trigger the system did not create; P6 the machine hour held by each future pair's NESA row, control window 0; W1 to W7 each with its row count equal to its set; A2 the machine hour held by each person row over the whole NESA window, no cancelled NESA row still holding, the therapist hour held, control window 0; `DONE`, `COMMITTED` |
| stage 3 | 0 | `25 OK / 0 VACUOUS / 0 FAIL`, then the RECEPTION section by id |

**Every refusal, run for real.** For each arm: reset, one mutation, stage 1 (must exit 1
with REFUSE on the code), then the stage 1 marker forced so stage 2's SQL is reached
(must exit 3, `STOP: <code> refuses`), then the database compared with its state
after the mutation by one md5 over appointments, schedule rows, blocks, audit rows and
users.

| Code | Mutation | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|---|
| R01 | JP(lv) moved to a second tenant | 1 | R01 | 3, STOP R01 | unchanged |
| R02 | JP(lv) inactive | 1 | R02 | 3, STOP R02 | unchanged |
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
| stage 2 with a trap that fails the audit insert, the last step after every write | 3 | all seven write notices printed, then the trap | **unchanged**: every write rolled back, no audit row |
| stage 2 again after the write | 1 | `stage 2 has ALREADY WRITTEN in this sitting` | written once |
| stage 1 again after the write | 1 | the same | written once |
| stage 1 after the write, marker removed | 1 | REFUSE on R08, R24 and R27 | written once |
| stage 2 after the write, markers forced | 3 | `STOP: R08 refuses` | written once |
| stage 3 with a retired covered row switched back on | 1 | FAIL on 2, 7, 8 and 10 | restored |
| stage 3 with a future person row cancelled | 1 | FAIL on 15, 17 and 18 | restored |
| stage 3 restored | 0 | `25 OK / 0 VACUOUS / 0 FAIL` | |
| stage 3 with every dated JP(lv) Saturday, its own and the moved ones, shifted to a past Saturday | 1 | no FAIL; `VACUOUS on 8, which the op never allows to be vacuous` | restored |
| stage 3 restored again | 0 | `25 OK / 0 VACUOUS / 0 FAIL` | |
| the whole op on a fixture with no 30 September block | 0, 0, 0 | stage 3 `23 OK / 2 VACUOUS / 0 FAIL`, VACUOUS on 11 and 12, which the block allows | written |
| a write inside the READ ONLY form stages 1 and 3 use | 1 | `cannot execute CREATE TABLE in a read-only transaction` | no table |

**Review round 1, each finding run for real:**

| Arm | Exit | What it printed | Database after |
|---|---|---|---|
| Q3: stage 1 on the fixture plus the overlap pair | 0 | section 6 lists the pair: booking clinic and person row clinic both Linda-a-Velha, `two_clinics = false`, to NESA(lv), `person_row_moved_by_a = true` | untouched |
| Q3: stage 2, then stage 3 | 0, 0 | `25 OK / 0 VACUOUS / 0 FAIL` | the pair's NESA row on NESA(lv), its person row on JP(lv) |
| verdict 10: stages 1, 2 and 3 with nothing to retire and no JP(cb) row inactive | 0, 0, 0 | verdict 10 observed 0, expected 0, VACUOUS (it read OK before this round); VACUOUS on 2, 3, 4, 5 and 10, which the block allows | written |
| a database whose default hides NOTICEs: stage 1, then stage 2 | 0, 0 | every step line, `DONE` and `COMMITTED`, because the file pins `client_min_messages` | written once |
| negative control: the stage 2 file with only its pin line removed, run directly on that database | 0 | no step line and no `DONE`, but `COMMITTED`: the write committed unseen, the case the block's post-psql lines now name | written once |

**What the rehearsal caught.** The first full run had no R25. On a fixture with no past
JP(cb) Castelo Branco appointment, stages 1 and 2 passed and wrote, and only stage 3,
after the write, stopped on VACUOUS 21. A comparison set that is empty proves nothing,
and learning that after the write is too late, so R25 now refuses it in stage 1 and in
stage 2 before any write. The unit test caught two post-write checks that tested
`valid_from = valid_until` without the NULL guards; both now use the one NULL-safe form.

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
`PERMITTED_SKIPS` entry.

**The pushed tree is the rehearsed tree.** The last full run of the arms runner
extracted every block from the commit that carries this section, sidecar included.

## Undoing it

Not authored here, and exact if it is ever wanted: the audit row carries every
retired and moved schedule id, every deleted block as a whole row, every ruling (a)
id, every ruling (b) id with its from and to NESA, and every ruling (c) pair with its
NESA. An undo would need its own authoring, rehearsal and ruling.

## What this does NOT do

- **It writes no clinical record and moves no authorship.** `clinical_records` is
  compared by md5 inside stage 2 and again by stage 3.
- **It sends nothing.** A raw status write emits no staff notification and no patient
  message, and the reminder dispatcher sends only for `scheduled` or `confirmed`
  (`REMINDABLE_STATUSES`, `apps/web/lib/reminders/dispatch.ts`), so a reminder already
  queued for a cancelled NESA row is dropped when it wakes.
- **It does not touch JP(cb)'s future Linda-a-Velha appointments.** They stay on
  JP(cb) and are reception's.
- **It does not touch JP(cb)'s Wednesday blocks** other than the one overlapping
  30 September.
- **It does not add a database table** for provenance: the listing and the audit row are it.
