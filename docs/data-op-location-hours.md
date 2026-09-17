# Clinic hours: both clinics move to 08:00-21:00

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no
journal entry, no `drizzle-kit`. Three stages. Any `STOP:` line, any `FAIL`
verdict or any `ERROR` halts the sitting.

**Authored by BLUE. Run by GREEN, or by the owner.** Every byte below has been
run against a throwaway database and against nothing else.

**THE TARGET HOURS ARE PARAMETERS.** All three stages take `-v target_opens` and
`-v target_closes` and refuse without them. Nothing in these files names a
particular ruling's hours, which is why the owner changing 09:00 to 08:00 needed
no edit to the SQL.

| Fact | Value |
|---|---|
| Card | `AGENDA-2100` |
| Ruling | Owner, 2026-09-17 (B8): **both** clinics, **every open day including Saturday**, `opens_at` **08:00** and `closes_at` **21:00**, last booking start 20:00. Unchanged: which days each clinic is open, CB's 13:00-14:00 midday closure, LV's closure as it is today |
| **Precondition** | **The 09:00 sitting ALREADY RAN (G7).** Production reads 09:00-21:00, so stage 1's carries will print `09:00` and `21:00`, not `08:00` and `20:00`. This sitting moves the OPENING only |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Stage 1 | `scripts/data/location-hours-1-precheck.sql`, sha256 `1dae64566a938c73a0fbc3132ba8ae7a9da92076af348bbf13e02e1bbabf9167` |
| Stage 2 | `scripts/data/location-hours-2-set.sql`, sha256 `88220f2a5834831932ef998bc54028b863818e491bbc3a4fa8370ef6f0aa93b1` |
| Stage 3 | `scripts/data/location-hours-3-postcheck.sql`, sha256 `f2729b0c3de20f8502dc69d11c9ec2983f17d96cb2933b2f133aaa575b03bad7` |
| What stage 2 writes | `locations.opens_at` and `closes_at` on exactly **2** rows, plus one `audit_log` row per clinic (`location.hours_set`) carrying each clinic's before values |
| What it never touches | midday closures, which days a clinic is open, `is_active`, any appointment, and any location that is not one of the two clinics |

## What changed in these three files, and why

Three defects, each of which would have bitten this sitting.

**1. THE HOURS WERE HARD-CODED IN FOURTEEN PLACES.** A constant, four guards and
nine messages all said `09:00-21:00`. Run for a ruling of 08:00-21:00, the write
would have set the old hours and the notices would have said so confidently. They
are now one validated parameter pair, and every guard and message is phrased from
it. Validation is explicit: `HH:MM` as a string BEFORE any cast (`'8:00'::time`
and `'0800'::time` both succeed in Postgres and mean 08:00), opens before closes,
and `closes_at` minus the 60-minute booking lead not before opening - hours only
45 minutes wide would leave a clinic open and unbookable.

**2. IT COULD NOT RUN A SECOND TIME.** Stage 2 refused if ANY
`location.hours_set` audit row existed. That is right for a one-shot op and wrong
the moment hours change twice: with G7's 09:00 sitting already on the record, this
08:00 sitting would have been refused before it read anything. The guard now asks
the only question that means anything - has THIS target already been written -
against the live rows and against the audit trail, so a previous sitting to
different hours is history rather than a blocker. Stage 3 is scoped the same way:
it reads only the audit rows carrying this target, because production will hold
one pair per sitting and an unscoped `audit_rows = 2` would read FAIL on a
correct run.

**3. THE POST-CHECK'S CLOSURE CHECKS COMPARED AGAINST CONSTANTS, AND LV'S WAS
VACUOUS.** LV's read `lv_midday_from IS NOT NULL` against an expected value of
the words "as before": it passed whatever LV's closure was, and would have FAILED
outright if LV had no closure - a state the database allows and which LV is in.
CB's compared against the literals `13:00` and `14:00`, which stops being true
the day the owner moves CB's lunch. Both now compare against `midday_unchanged`
in the write's own audit row, which IS stage 1's observation carried through the
write. "Unchanged" is a comparison now, not an adjective.

**And the audit row said the wrong thing about itself.** `metadata.source` read
`owner_sql_editor` - the Supabase dashboard's SQL editor, a different surface with
a different actor and no `ON_ERROR_STOP`. This is a psql data operation run from
this document, and it now records `psql_data_op`. A slug, never prose: the audit
metadata contract refuses whitespace.

> Note for whoever maintains these guards: `pnpm test:scripts` passes with the
> sha256 values in this table STALE. The "checks quote the real file" guard
> (`scripts/0083-checks-quote-the-real-file.test.mjs`) covers
> `docs/migration-apply-*.md` and not `docs/data-op-*.md`, so the three digests
> above are hand-maintained with nothing checking them. Worth closing.

## Why this is SQL and not a screen

**There is no hours editor.** `apps/web/app/admin/locations` edits a clinic's
name, address, phone and slot granularity, and nothing else:
`updateLocationAction` (`apps/web/app/admin/locations/actions.ts:30`) reads
exactly those four fields from the form. `opens_at` and `closes_at` appear in no
route under `apps/web/app`. So the hours can only be changed by SQL today, and
that is what this document is.

**Hours are ONE PAIR PER LOCATION.** There is no per-weekday hours table
anywhere in the schema, which is why "every open day including Saturday" is
satisfied by one write per clinic rather than seven. Stage 1 asserts this rather
than leaving it to be assumed, because the ruling's wording invites the opposite.

## What changes, and what does not

- **The agenda opens at 08:00 again**, and still runs to 21:00 with 20:00-21:00
  as the last row, at both clinics and under "Todas as localizações". The grid
  has followed `opens_at`/`closes_at` since 0085; nothing in the code caps it.
- **20:00 stays the last bookable start**, and 20:15 is still refused. That half
  of the rule is unchanged by this sitting: only the opening moves.
- **08:00 becomes bookable again.** Since the 09:00 sitting, an 08:00 start has
  been refused as `outside_clinic_hours`; after this it is accepted.
- **The portal offers slots from 08:00 again**, and still nothing after 20:00.
- **Existing appointments outside the hours are NOT touched.** They stay, they
  render, they report. Stage 1 counts them so the number is seen before the
  change rather than discovered by reception; stage 3 counts them again.
  **Reception has reported that an 08:00 LV booking on 16 September is drawn
  BEHIND the 09:00 row and cannot be reached** - that is a grid defect, it is
  PURPLE's P5, and this sitting makes those rows reachable again as a side
  effect rather than as a fix.
- **CB keeps its 13:00-14:00 closure**, on every open day including Saturday.
  13:00-14:00 sits inside 08:00-21:00, so `locations_midday_inside_hours` holds.

## STAGE 1: the pre-check, whose output stage 2 is given

```
(
set -eo pipefail
SHA1=1dae64566a938c73a0fbc3132ba8ae7a9da92076af348bbf13e02e1bbabf9167
TARGET_OPENS=08:00
TARGET_CLOSES=21:00

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/location-hours-precheck.out

STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f scripts/data/location-hours-1-precheck.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-1-precheck.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v target_opens=${TARGET_OPENS} -v target_closes=${TARGET_CLOSES} -f scripts/data/location-hours-1-precheck.sql 2>&1 | tee /tmp/location-hours-precheck.out
)
```

**Read section 1 of that output.** It prints each clinic's `opens_at` and
`closes_at`. Those four values are what stage 2 is given, and stage 2 refuses if
the database has moved since. **Expect `09:00` and `21:00`** - G7's sitting
already ran.

## STAGE 2: the write, then the post-check

Substitute the four values from THIS sitting's stage 1. They are `09:00` and
`21:00` for both clinics unless somebody has changed them since.

```
(
set -eo pipefail
SHA2=88220f2a5834831932ef998bc54028b863818e491bbc3a4fa8370ef6f0aa93b1
SHA3=f2729b0c3de20f8502dc69d11c9ec2983f17d96cb2933b2f133aaa575b03bad7
TARGET_OPENS=08:00
TARGET_CLOSES=21:00
LV_OPENS=09:00
LV_CLOSES=21:00
CB_OPENS=09:00
CB_CLOSES=21:00

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/location-hours-postcheck.out

[ -n "$(find /tmp/location-hours-precheck.out -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not run in this sitting"; exit 1; }

git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}

test -f scripts/data/location-hours-2-set.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/location-hours-3-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-2-set.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-3-postcheck.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v target_opens=${TARGET_OPENS} -v target_closes=${TARGET_CLOSES} -v lv_opens_before=${LV_OPENS} -v lv_closes_before=${LV_CLOSES} -v cb_opens_before=${CB_OPENS} -v cb_closes_before=${CB_CLOSES} -f scripts/data/location-hours-2-set.sql

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v target_opens=${TARGET_OPENS} -v target_closes=${TARGET_CLOSES} -f scripts/data/location-hours-3-postcheck.sql 2>&1 | tee /tmp/location-hours-postcheck.out
grep -qE '\| FAIL' /tmp/location-hours-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\| OK' /tmp/location-hours-postcheck.out || true)
[ "${OKS}" = 10 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 10"; exit 1; }
echo "CLINIC HOURS COMPLETE"
)
```

## After it runs: the agenda takes up to a minute

`fetchAgendaReferenceData` is an `unstable_cache` entry with a 60-second
revalidate, and nothing invalidates its tag when a clinic's hours change -
because there is no hours editor, so SQL is the only writer and SQL cannot
revalidate a Next.js tag. The 08:00 grid therefore appears within a minute of
the write, not instantly. That is real product behaviour, recorded here so it is
not read as a failed apply.

## Rehearsed, in full, on a throwaway database

A dedicated throwaway Supabase stack on `127.0.0.1:55512` at migration 0088,
empty, with a fixture carrying the **production location ids** and
**production's state AFTER G7's sitting**: both clinics 09:00-21:00, CB closed
13:00-14:00, LV with NO closure, a third clinic that must not be touched, and
**G7's two `location.hours_set` audit rows already present**. That last piece is
the point: it is the state the old guard would have refused.

| Arm | Expected | Result |
|---|---|---|
| 1. stage 1 with the target | prints the forecast and the carries | exit 0; last bookable start `20:00` |
| 2. stage 1 without `target_opens` | refuses, non-zero | exit 3 |
| 3. stage 2 without `target_opens` | refuses | exit 3 |
| 4. stage 2 `target_opens=25:00` | refuses, out of range | exit 3 |
| 5. stage 2 `target_opens=8:00` | refuses, not `HH:MM` | exit 3 |
| 6. stage 2 opens not before closes (`21:00`/`08:00`) | refuses | exit 3 |
| 7. stage 2 with no bookable start (`20:30`/`21:00`) | refuses | exit 3 |
| 8. stage 2 with a WRONG carry | refuses | exit 3 |
| 9. stage 2 with the right carries, **G7 rows present** | **writes** | exit 0; exactly **2** rows at 08:00-21:00 |
| 10. stage 3 | every verdict OK | **10 OK, 0 FAIL** |
| 11. stage 2 again at the same target | refuses | exit 3 |
| 12. **negative control:** CB's closure moved between the stages | stage 3 FAILS | **2 FAIL verdicts** (`12:00 vs 13:00`, `13:30 vs 14:00`) |
| 13. **negative control:** LV gains a closure it did not have | stage 3 FAILS | **2 FAIL verdicts** |
| the third clinic | untouched | still 08:00-20:00 |
| CB's closure | untouched | still 13:00-14:00 |
| the audit source | corrected | `psql_data_op`; G7's older pair still reads `owner_sql_editor` |

13 arms, 13 as expected, 0 unexpected.

### What the rehearsal caught, this time and last

**A probe in the rehearsal harness itself was hollow.** The line meant to assert
"exactly 2 rows now read the target" carried a stray `)`, errored, and printed
blank - so the run looked complete while that number was never measured. Stage 3
asserts it independently, which is why the arm was still proven, but the harness
line was re-run on its own to get the number: **2**. A rehearsal script needs the
same negative-control discipline as the thing it rehearses.

**`\quit 1` does not set an exit code** (carried from the first rehearsal). psql
answered `warning: \quit: extra argument "1" ignored` and exited **0**, so a
stage runner under `set -e` would have carried straight on into the write with no
carry at all. Every missing-parameter guard raises instead, which exits 3.

**A fixture keyed on its own tenant is not a reset** (carried). The location ids
are global and a previous dispatch's fixture already held them. The fixture
clears whatever holds those ids, whoever wrote it.

## Undoing it

Not authored here, and it is exact if it is ever wanted: each `location.hours_set`
audit row carries that clinic's `opens_at_before` and `closes_at_before`. An undo
restores exactly those two values on exactly those two rows. It would need its
own authoring, its own rehearsal and its own ruling. Note there are now TWO pairs
of those rows on production - G7's and this sitting's - so an undo has to say
which target it is reversing.
