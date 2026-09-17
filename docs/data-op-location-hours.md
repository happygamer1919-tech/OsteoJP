# Clinic hours: both clinics move to 09:00-21:00

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no
journal entry, no `drizzle-kit`. Three stages. Any `STOP:` line, any `FAIL`
verdict or any `ERROR` halts the sitting.

**Authored by BLUE. Run by GREEN, or by the owner.** Every byte below has been
run against a throwaway database and against nothing else.

| Fact | Value |
|---|---|
| Card | `AGENDA-2100` |
| Ruling | Owner, Q-HOURS = a, 2026-09-17: **both** clinics, **every open day including Saturday**, `opens_at` 09:00 and `closes_at` 21:00, last booking start 20:00. Unchanged: which days each clinic is open, CB's 13:00-14:00 midday closure, LV's closure as it is today |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001` |
| Castelo Branco | `de000002-0000-0000-0000-000000000002` |
| Stage 1 | `scripts/data/location-hours-1-precheck.sql`, sha256 `3ff807edbeb45f104f0066478f6ebdfa6228832a49db43528d07d0492c708fc2` |
| Stage 2 | `scripts/data/location-hours-2-set.sql`, sha256 `ef98e54c833e4e26c022265f74fd1316ee2122fd6a7f67e8ad1c0debea1fff3a` |
| Stage 3 | `scripts/data/location-hours-3-postcheck.sql`, sha256 `b6512a225f7d0f7c1ca6058e15f6d7e3ee603dd0103f1bc4cc339b42e64b5e31` |
| What stage 2 writes | `locations.opens_at` and `closes_at` on exactly **2** rows, plus one `audit_log` row per clinic (`location.hours_set`) carrying each clinic's before values |
| What it never touches | midday closures, which days a clinic is open, `is_active`, any appointment, and any location that is not one of the two clinics |

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

- **The agenda runs to 21:00**, with 20:00-21:00 as the last row, at both
  clinics and under "Todas as localizações". The grid has followed `closes_at`
  since 0085; nothing in the code caps it.
- **20:00 becomes the last bookable start**, and 20:15 is refused, on every path
  that creates or moves an appointment. That rule ships in the code PR and is
  live before this document runs: with today's 08:00-20:00 hours it makes 19:00
  the last start.
- **The portal stops offering slots before 09:00** and after 20:00.
- **Existing appointments outside the new hours are NOT touched.** They stay,
  they render, they report. Stage 1 counts them so the number is seen before the
  change rather than discovered by reception; stage 3 counts them again.
- **CB keeps its 13:00-14:00 closure**, on every open day including Saturday.
  13:00-14:00 sits inside 09:00-21:00, so `locations_midday_inside_hours` holds.

## STAGE 1: the pre-check, whose output stage 2 is given

```
(
set -eo pipefail
SHA1=3ff807edbeb45f104f0066478f6ebdfa6228832a49db43528d07d0492c708fc2

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/location-hours-precheck.out

STRAY=$(git status --short)
[ -z "$STRAY" ] || { echo "STOP: the apply worktree is not clean"; echo "$STRAY"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f scripts/data/location-hours-1-precheck.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-1-precheck.sql | cut -d' ' -f1)" = "$SHA1" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/location-hours-1-precheck.sql 2>&1 | tee /tmp/location-hours-precheck.out
)
```

**Read section 1 of that output.** It prints each clinic's `opens_at` and
`closes_at`. Those four values are what stage 2 is given, and stage 2 refuses if
the database has moved since.

## STAGE 2: the write, then the post-check

Substitute the four values from THIS sitting's stage 1. They are `08:00` and
`20:00` for both clinics unless somebody has changed them.

```
(
set -eo pipefail
SHA2=ef98e54c833e4e26c022265f74fd1316ee2122fd6a7f67e8ad1c0debea1fff3a
SHA3=b6512a225f7d0f7c1ca6058e15f6d7e3ee603dd0103f1bc4cc339b42e64b5e31
LV_OPENS=08:00
LV_CLOSES=20:00
CB_OPENS=08:00
CB_CLOSES=20:00

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/location-hours-postcheck.out

[ -n "$(find /tmp/location-hours-precheck.out -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not run in this sitting"; exit 1; }

git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}

test -f scripts/data/location-hours-2-set.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/location-hours-3-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-2-set.sql | cut -d' ' -f1)" = "$SHA2" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/location-hours-3-postcheck.sql | cut -d' ' -f1)" = "$SHA3" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -v lv_opens_before=$LV_OPENS -v lv_closes_before=$LV_CLOSES -v cb_opens_before=$CB_OPENS -v cb_closes_before=$CB_CLOSES -f scripts/data/location-hours-2-set.sql

psql "$DATABASE_URL_DIRECT" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/location-hours-3-postcheck.sql 2>&1 | tee /tmp/location-hours-postcheck.out
grep -qE '\| FAIL' /tmp/location-hours-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\| OK' /tmp/location-hours-postcheck.out || true)
[ "$OKS" = 9 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 9"; exit 1; }
echo "CLINIC HOURS COMPLETE"
)
```

## After it runs: the agenda takes up to a minute

`fetchAgendaReferenceData` is an `unstable_cache` entry with a 60-second
revalidate, and nothing invalidates its tag when a clinic's hours change -
because there is no hours editor, so SQL is the only writer and SQL cannot
revalidate a Next.js tag. The 21:00 grid therefore appears within a minute of
the write, not instantly. That is real product behaviour, recorded here so it is
not read as a failed apply.

## Rehearsed, in full, on a throwaway database

Supabase local stack on `127.0.0.1:54622`, with a fixture carrying the
**production location ids** and production's shape - both clinics 08:00-20:00,
CB closed 13:00-14:00, LV with no closure, a third clinic that must not be
touched, and three future appointments including one at 08:30 and one at 20:30.

| Arm | Expected | Result |
|---|---|---|
| stage 2 with NO carries | refuses, and exits NON-ZERO | `STOP: -v lv_opens_before is missing`, exit 3 |
| stage 1 | prints the carries and the counts | LV and CB both `08:00`-`20:00`; no per-weekday hours table; 4 constraints listed; LV 1 future appointment before 09:00, CB 1 at or after 20:00 |
| stage 2 with WRONG carries | refuses | `STOP: Linda-a-Velha opens at 08:00, but the carry says 09:00`, exit 3 |
| stage 2 with the right carries | sets 2 clinics | `CLINIC HOURS DONE: 2 clinics set to 09:00-21:00`, exit 0 |
| stage 2 again | refuses | `STOP: Linda-a-Velha opens at 09:00, but the carry says 08:00`, exit 3 |
| stage 3 | 9 OK | **9 OK, 0 FAIL** |
| the third clinic | untouched | Montemor-o-Novo still 08:00-20:00 |
| CB's closure | untouched | still 13:00-14:00 |

### What the rehearsal caught

**`\quit 1` does not set an exit code.** psql answered
`warning: \quit: extra argument "1" ignored` and exited **0**, so a stage runner
under `set -e` would have carried straight on into the write with no carry at
all - the guard reporting a refusal it had not made. The four carry guards now
raise instead, which exits 3 like every other stop in these files.

**A fixture keyed on its own tenant is not a reset.** The location ids are
global, a previous dispatch's fixture already held them, and the first rehearsal
silently ran its arms against that other fixture's clinics - reporting a
post-check FAIL that had nothing to do with the code. The fixture now clears
whatever holds those ids, whoever wrote it.

## Undoing it

Not authored here, and it is exact if it is ever wanted: each `location.hours_set`
audit row carries that clinic's `opens_at_before` and `closes_at_before`. An undo
restores exactly those two values on exactly those two rows. It would need its
own authoring, its own rehearsal and its own ruling.
