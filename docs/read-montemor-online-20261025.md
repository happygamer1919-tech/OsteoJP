# MN-READ, 2026-10-25: is Montemor bookable online now, and which visits does it hold

**READ ONLY. One block. No window, no apply, no write.**
**Status: AUTHORED 2026-10-25; THE SQL REHEARSED ON A THROWAWAY (five cases, below); THE BLOCK PROVEN BY ITS FAULT-INJECTION TEST (`scripts/read-montemor-online-20261025.test.mjs`); THE BLOCK ITSELF NOT REHEARSED (it reads only production, see "NOT REHEARSED").** The block's two value lines read `PENDING` here; GREEN pastes its dispatch's filled copy.

## Why this read exists

Strategy's R10 of 2026-10-25: Montemor's opening moved to November 2026 (date pending from the owner), so Montemor must show no online booking slots before it opens. If it is bookable online today, the narrowest reversible hold ships until the owner gives the date; reception can still book by hand. Existing Montemor visits are listed (counts and dates by source) and are never cancelled or moved. This read answers both questions with ids, counts and dates only.

It is information, not a gate on anything else. It touches nothing the reminder sweep or the sleeping reminder job reads beyond reading it (strategy's R9 forbids changes, not reads).

## What it reads

`scripts/db/read-montemor-online-20261025.sql`, sha256 `90de3139c46fd44e6f3e27edde7a44374de07bd83e06f9cf96f1e876a1e47f24`. One result set, columns `n | check | observed | expected | verdict`:

- **Verdict 0:** the transaction is READ ONLY.
- **Verdict 1:** exactly one Montemor row exists, active or archived. CONTROL: exactly one Linda-a-Velha row and one Castelo Branco row match their own name patterns.
- **Verdict 2:** the measure works. Linda-a-Velha and Castelo Branco are each "portal online" by the same predicates; if either is not, the read cannot tell a Montemor that is not bookable from a measure that finds nothing, and verdict 2 reads VACUOUS.
- **INFO rows** (never counted): each clinic's location id, `is_active`, whether it is listed, services staffed today, slot days, guest-priced services; the line `MN_ONLINE`; Montemor's schedule rows (counts and dates); Montemor's appointments in total, by origin, by status, and by Lisbon date, origin and status.

No patient id, staff id, name, phone, email, address or note is printed. The predicates are copied from the code on `origin/main` at `e7a14d77`; the SQL file's header names each source.

**How to read `MN_ONLINE`:**

| field | meaning |
|---|---|
| `portal_listed` | the logged-in portal and the public form list Montemor (active, and a bookable person has an active schedule row there; no date test, by design) |
| `portal_staffed_services_today` | services the logged-in catalogue offers at Montemor today |
| `portal_slot_days_next_14` | days from today to today + 14 inclusive (the portal's horizon, 15 days) on which a bookable, mapped person has hours at Montemor. An upper bound: appointments, time off, the midday closure and the closing hour remove starts after it |
| `portal_online` | `portal_listed` and both counts above 0: patients can pick a slot at Montemor in the portal |
| `guest_listed` | the public form lists Montemor (same rule as `portal_listed`) |
| `guest_priced_services` | services the public form offers at Montemor (an active price row there). The public form shows no slots; reception answers its requests by telephone |

**A hold is needed if `portal_online=true`** (patients can book slots). `guest_listed=true` with `portal_online=false` means the public form takes requests for Montemor but offers no slot: SOLO reports it and strategy decides whether that also needs holding.

## THE HALT RULE

Any STOP line ends the block: nothing after it is pasted or run again, and GREEN reports the output as printed. A REFUSE line from the target guard, and any harness or classifier refusal, is a STOP. **Nothing in this block writes, so no STOP leaves anything changed.** A VACUOUS or FAIL verdict stops the block after the table has printed: report the table as printed.

## Pins

| What | Pin |
|---|---|
| The read | `scripts/db/read-montemor-online-20261025.sql`, sha256 `90de3139c46fd44e6f3e27edde7a44374de07bd83e06f9cf96f1e876a1e47f24` |
| The target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` (the bytes 0106's document pins) |
| The guard's module | `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` (the same) |
| This document | the dispatch names its sha256 in `DOCSHA`, and the sidecar `docs/read-montemor-online-20261025.sha256` pins it |
| The commit | the dispatch names the merge commit in `MERGED`; the block refuses a sha that is not on `origin/main` |

## When

Any time, while no other GREEN sitting runs. It has no run window, so the clinic-hours table and the repeated-hour rule of 2026-10-25 (no apply window may end inside a repeated hour) do not apply: there is no window to end.

## THE BLOCK

GREEN pastes its dispatch's filled copy, whole and on its own, from `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. This copy STOPs at its first check.

```
(
set -o pipefail
MERGED=PENDING
DOCSHA=PENDING
SHAREAD=90de3139c46fd44e6f3e27edde7a44374de07bd83e06f9cf96f1e876a1e47f24
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READFILE=scripts/db/read-montemor-online-20261025.sql
DOC=docs/read-montemor-online-20261025.md
OUT=/tmp/mn-read-20261025.out
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
shasum -a 256 -c docs/read-montemor-online-20261025.sha256 || { echo "STOP: the sidecar does not pin this document. Nothing was read"; exit 1; }
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
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "select 'read only: ' || current_setting('transaction_read_only') as mn_read_transaction" -f ${READFILE} -c "rollback" 2>&1 | tee ${OUT} || { echo "STOP: the read did not complete (an error, or longer than 120 seconds; psql's lines are above), or its transcript could not be written. Nothing was written: the transaction is read only"; exit 1; }
grep -q 'read only: on' ${OUT} || { echo "STOP: the read did not run inside a transaction that read as READ ONLY (psql's lines are above), so its table is not reported"; exit 1; }
CNT=$(awk -F'|' '{ v = $NF; gsub(/[[:space:]]/, "", v); if (v == "OK") o++; else if (v == "VACUOUS") a++; else if (v == "FAIL") f++ } END { printf "%d %d %d", o, a, f }' ${OUT}) || { echo "STOP: the verdicts could not be counted. Report the table as printed"; exit 1; }
echo "verdicts (OK VACUOUS FAIL): ${CNT}"
[ "${CNT}" = "3 0 0" ] || { echo "STOP: the read's verdicts are not 3 OK / 0 VACUOUS / 0 FAIL. Report the table as printed; its INFO rows are not to be relied on"; exit 1; }
L=$(grep -E '^[[:space:]]*20[[:space:]]*[|][[:space:]]*MN_ONLINE[[:space:]]*[|]' ${OUT}) || { echo "STOP: the read printed no MN_ONLINE row. Report the table as printed"; exit 1; }
echo "MN-READ PASSED: 3 OK / 0 VACUOUS / 0 FAIL. Report the whole table as printed, and this row: ${L}"
)
```

**EXPECT:** `checked out: <MERGED>`; `document:`, then `docs/read-montemor-online-20261025.md: OK`; `read:`, `guard:`, `module:`, each the pinned sha256; the target guard's four lines; psql's `BEGIN`, `SET`, the row `read only: on`, the table (verdicts 0, 1 and 2 OK, then the INFO rows), `ROLLBACK`; `verdicts (OK VACUOUS FAIL): 3 0 0`; then `MN-READ PASSED: ...` with the `MN_ONLINE` row. Exit 0. **REPORT THE WHOLE TABLE AS PRINTED.** It writes nothing to production.

## The owner's fallback: the Supabase SQL editor

If GREEN cannot run, the owner can run the same read by hand. It is read only either way.

1. Supabase dashboard, production project, SQL Editor, New query.
2. Type this first line exactly: `set transaction read only; set local statement_timeout = '120s';`
3. Below it, paste the whole of `scripts/db/read-montemor-online-20261025.sql` (to copy it exactly: `! pbcopy < /Users/ivan/Projects/GitHub/osteojp-solo-clone/scripts/db/read-montemor-online-20261025.sql` once the clone is on main).
4. Run. EXPECT one table. Row 0 must read `on` and `OK`: if it does not, stop and send a screenshot, nothing else. Rows 1 and 2 must read `OK`.
5. Send the whole table (a screenshot is fine: it holds ids, counts and dates only).

The editor runs the text as one transaction, so the first line makes the server refuse any write (checked on a throwaway: an INSERT after that line is refused with `cannot execute INSERT in a read-only transaction`).

## Rehearsal (2026-10-25, a throwaway database on the local stack, synthetic rows)

A throwaway database `mnread_r1` on the local stack (127.0.0.1:54322), the `public` schema copied from the local database with `pg_dump --schema-only`, three synthetic clinics named like production's, two synthetic people, one service, schedule rows every weekday 09:00 to 18:00, two price rows (Linda-a-Velha and Montemor), three synthetic Montemor appointments. The read ran as the block runs it (`begin read only`, 120 seconds, `rollback`). The database was dropped afterwards.

| Case | What changed | Verdicts | `MN_ONLINE` |
|---|---|---|---|
| A | Montemor staffed every day | 3 OK | `portal_listed=true ... staffed_services_today=1 ... slot_days_next_14=15 portal_online=true guest_listed=true guest_priced_services=1`; appointments 3 (2026-10-20 to 2026-11-03), by origin `staff` 2 and `patient_portal` 1 |
| B | Montemor's rows start in 20 days | 3 OK | `portal_listed=true staffed_services_today=0 slot_days_next_14=0 portal_online=false guest_listed=true` (listed with nothing to pick, as the code's header says) |
| C | Montemor's rows switched off | 3 OK | `portal_listed=false ... portal_online=false guest_listed=false` |
| D | Castelo Branco's rows switched off (the control fails) | 2 OK, verdict 2 VACUOUS (`1 of 2`) | printed, and the block would STOP on the profile |
| E | a second, archived "Montemor" row | verdict 1 FAIL (`2; control 1, 1`) | no `MN_ONLINE` row: Montemor is measured only when matched exactly once |

The single-string form of the owner's fallback was run on the same throwaway: verdict 0 read `on`, `OK`.

## NOT REHEARSED

The block itself reads only production: its target guard refuses anything else, and the lead's rule of 2026-09-30 forbids getting past a guard on a throwaway. So the block's production path (the environment file, the guard, the connection) is NOT REHEARSED. What stands in for it: the SQL rehearsed above with exactly the block's psql arguments, and the fault-injection test, which runs the block in GREEN's tool shape in bash and zsh with every external command a stub, fails each call in turn, and proves every halt is explicit and that the block passes only on the profile `3 0 0` with an `MN_ONLINE` row.
