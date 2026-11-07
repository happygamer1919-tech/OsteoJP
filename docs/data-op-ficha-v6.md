# FICHA-V6: one data op that installs osteopathy version 6 in every tenant

**Status: NOT RUN. NOT REHEARSED.** A DATA operation, not a migration: no schema
change, no journal entry. Four blocks, each pasted whole, on its own and in order:
stage 0 (the files and the head it runs from), stage 1 (measure), stage 2 (write)
and stage 3 (verify). One rule governs every halt, in these words here and in
GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 2 has committed, a post-commit STOP
still stops the sitting: the write stands, and stage 3 (READ ONLY) runs only on the
owner's or the lead's word. The only onward path from stage 2 to stage 3 is exit 0
with the line "FICHA-V6 WRITTEN. Paste stage 3 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit.
Whether and when a halted sitting starts again is the lead's call, never the runner's.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings,
on the owner's dispatch naming the three stage files below by filename (`CLAUDE.md`,
"Who applies migrations"). The authoring lane never runs these blocks against
production. A separate session rehearses them on a throwaway database; the section
"Rehearsed on a throwaway database" says what has run on these exact bytes, and
today that is nothing.

| Fact | Value |
|---|---|
| Card | `FICHA-V6-01`, the production install of FICHA-ORDER-01's osteopathy version 6 (#1741). On the ruled Tier C list by strategy's ruling below |
| Runs from | `origin/main`, after #1741 and this op's PR have merged. The owner freezes merges to main for the sitting. Stage 0 records the sha `origin/main` resolves to in `/tmp/fv6-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stages 1 and 2 HALT if `origin/main` has moved since (the HEAD CHECK, below) |
| Stage 1 | `scripts/data/ficha-v6-1-measure.sql`, READ ONLY, sha256 `2b4e1c2757be0e57a13b45d52661ffbc1c73223dca2a49f170352a5f1a7019ff` |
| Stage 2 | `scripts/data/ficha-v6-2-write.sql`, ONE DO block in ONE transaction, sha256 `6a78f43a41d00ff793829868359ee813855a08e98c972cf6553ae5a8a370b547` |
| Stage 3 | `scripts/data/ficha-v6-3-verify.sql`, READ ONLY, 10 verdicts and a SUMMARY row, sha256 `03afec0392e8f61b98a561987cf81242540fec0182f6808d031448109bf60eb7` |
| The version 6 file | `packages/db/seed/form-templates/osteopathy-v6.json`, sha256 `483f88276bad335f4ced1ab7f3d99f7d9d87b05abc1584baad579c49f9e5796c`. Stage 2 embeds its `schema` and `title` members as jsonb literals, stage 3 its `x-order` and `title`; stage 0 checks the file is on main at this sha256. No block runs, reads or imports anything else from that folder |
| Expected md5, repo version 5 | `b109e3af926fd6f51bbf485a173d2145`: md5(schema::text) of `osteopathy-v5.json`'s `schema`, taken by Postgres 17 (UTF8) from a literal of it |
| Expected md5, repo version 6 | `752bf47bf11d46a49f74e94761ecea83`: md5(schema::text) of `osteopathy-v6.json`'s `schema`, taken the same way |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`, and the one module it imports, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`: the only program a block runs besides psql and the shell's own tools |
| This document | `docs/data-op-ficha-v6.md`, pinned by `docs/data-op-ficha-v6.sha256` and asserted by every stage; GREEN's dispatch names its sha256 as well |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | ONE `form_templates` row per tenant stage 1 classifies INSERT: key `osteopathy`, version 6, `is_active` true, the embedded title and schema, `ON CONFLICT (tenant_id, key, version) DO NOTHING`; and ONE `audit_log` row per row inserted, in that row's tenant, action `staff.ficha_v6.install_template`, entity type `form_template`, entity id the new row |
| What no stage touches | every `form_templates` row that exists before the write (stage 2 compares their count and one md5 over the whole rows before and after, inside its own transaction, and records the baseline in each audit row; stage 3 compares it again), and every other table: no clinical record, no ficha, no episode |
| The unit test | `scripts/ficha-v6-data-op.test.mjs`, in `pnpm test:scripts`, which CI runs. It needs no database |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/data-op-ficha-v6.sha256` and every stage
checks it with `shasum -a 256 -c` before it trusts a pin written here. The sidecar
sits on the same head as the document, so a main that moved to a new document and a
new sidecar together would pass that check: GREEN's dispatch names this document's
sha256 and compares it by machine before the sitting's first read, and the HEAD
CHECK halts on any moved main.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations, no `!` and no `set -e`. The blocks are pasted
into zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document, and
`scripts/ficha-v6-data-op.test.mjs` holds the other rules).

**No block carries `set -e`, and every halt is explicit.** GREEN's Bash tool runs a
block as `... && eval '<block>' ...`, where zsh ignores errexit. Each command a later
step relies on carries its own `|| { echo "STOP: ..."; exit 1; }`, and the unit test
runs every block in that shape, in bash and in zsh, with every external program a
stub and each external call made to fail in turn: each one stops the block with a
STOP line, before its last line and before any record it writes later. The second
line of each block is `set -o pipefail`.

## The ruling

Strategy, 2026-11-06 19:00 Toronto, its words: "FICHA-ORDER-01 v6: YES, on the Tier C
list as proposed: one-row INSERT per tenant, ON CONFLICT DO NOTHING, its own
document, rehearsal and sha256. GREEN runs it on a closed-hours night with no other
sitting, AFTER the switch and its clean first-send read. Earliest Thu 11-12; if the
switch slips, strategy re-rules. Never run the seed loader against production."

## What it does, in one paragraph

FICHA-ORDER-01 (#1741) adds osteopathy version 6: the same eighteen fields,
definitions, labels, required list and AI flags as version 5, with only the
`x-order` changed so the ficha reads in the order of the clinic's previous system.
New fichas use the highest active osteopathy version of the tenant
(`apps/web/lib/clinical/records.ts`, `listActiveTemplates` and
`getFichaMedicaTemplate`, through `resolveCurrentTemplates`), so the change reaches
the clinic only when production holds a version 6 row. This op inserts that row,
one per tenant, and nothing else. Records already written pin their template by id
and keep rendering the version they were written against (`CLAUDE.md` rule 5).

## Why not the seed loader

`packages/db/seed/form-templates.ts` upserts EVERY file in its folder into one
tenant and rewrites any existing row whose title or schema differs from its file
(`upsertOne`, the `update` branch). Run against production it could rewrite a
version a clinical record already pins. The ruling forbids it, so this op never
runs, reads or imports it: the stage files name no part of it (the unit test holds
that), and stage 2 carries the one row it inserts as a literal.

## When it runs: what GREEN's dispatch must hold before stage 0

- **After the reminder switch and its clean first-send read**, by the ruling. If the
  switch slips, strategy re-rules, and this document is not used until it does.
- **On a closed-hours night with no other sitting.** Stages 0, 1 and 2 each stop
  unless the machine's Lisbon clock reads closed by the weekday table (Monday to
  Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), with
  `TZ=Europe/Lisbon` on the clock read and a STOP unless the zone reads WET or
  WEST. Stages 1 and 2 also refuse (R08) unless the DATABASE's own Lisbon clock
  reads closed by the same table, so a wrong machine clock cannot open the window.
  No file carries a date: the dispatch names the night, and the blocks read the
  clock.
- **The merge freeze.** No merge to `main` from before stage 0 until GREEN reports.
  The HEAD CHECK is the machine's fail-safe behind it.
- **#1741 and this op's PR have merged** (stage 0 finds the version 6 file and every
  stage file on `origin/main` at their pinned sha256, or stops).

## The defaults this op is built to

Each default is what the files do today. A different ruling changes the files, their
pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | Which tenants get a row? | Every tenant that holds an osteopathy version 5 whose schema md5 is the repo version 5's, that is active, and that holds no osteopathy version 6 or above (plan `INSERT`) |
| Q2 | A tenant with no osteopathy version 5? | Left alone, printed in section 1 as `NO OSTEOPATHY VERSION 5: LEFT ALONE`. The premise (version 6 is version 5 plus an order) says nothing about it |
| Q3 | A tenant whose production version 5 differs from the repo's? | **R03 refuses the whole op**, in stage 1 and in stage 2. Version 6 was built as the repo version 5 plus an order change, so a differing production version 5 means the premise is wrong and strategy rules. The compare is exact and canonical: md5 of `schema::text` taken by Postgres on both sides, never a parser |
| Q4 | An osteopathy version 6 (or above) already exists anywhere? | **R04 refuses.** Something other than this op wrote it, and strategy rules. `ON CONFLICT DO NOTHING` stays in the INSERT as the ruling asks, and stage 2's count check would refuse a skipped row too |
| Q5 | A version 5 that is not active? | **R05 refuses.** An active version 6 there would change which template new fichas use, not only the order |
| Q6 | How many audit rows? | **ADDED DEFAULT: one per row inserted, each in that row's own tenant, naming it.** The precedent writes one audit row for one tenant; `audit_log.tenant_id` is required and each tenant reads only its own audit rows, so a write in several tenants gets one row in each. Each carries ids, counts and md5s only: the clock, the carries, the total inserted, and the baseline |
| Q7 | The title? | The version 6 file's `title`, `{"pt": "Ficha Clínica", "en": "Clinical Record"}` |
| Q8 | `is_active`? | `true`, written explicitly. Version 5 stays active and untouched; the picker takes the highest version |
| Q9 | The lock? | `form_templates` SHARE ROW EXCLUSIVE, under a five second `lock_timeout`, before the first read. Reads go on (the app only reads this table at run time); any other writer waits, and a writer already holding a lock stops stage 2 cleanly |
| Q10 | An empty write set? | **R01 refuses**: an empty write is a STOP, not a finished state, so every stage 3 verdict always reads something |
| Q11 | Stage 1 and stage 2 on different Lisbon days? | Allowed: a closed-hours night crosses midnight. Stage 2 requires stage 1's mark from this sitting and under an hour old, and re-reads every carry under its lock |
| Q12 | An undo? | Documented in "Undoing it", never run, and never to be run without its own ruling |

## The HEAD CHECK, and running from main

The op runs from `origin/main`, after its PR has merged, and the owner freezes merges
to main for the sitting. No block reads a branch, and there is no separate HEAD CHECK
to paste: the machine runs it inside the blocks, and halts on it.

- **Stage 0** refuses once stage 2 has written, checks the clock and that the apply
  worktree is clean, fetches, resolves `origin/main`, checks that sha out detached,
  verifies the sidecar and every pin, and only then records the sha in
  `/tmp/fv6-main.sha` and prints `running from origin/main <sha>`.
- **Stages 1 and 2 begin with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and
  written nothing. Each then checks out the RECORDED sha and asserts its own file and
  the target guard by sha256 before it runs either.
- **Stage 1 marks its pass with the recorded sha,** and stage 2 refuses unless that
  mark names the sha it is about to run from and is under an hour old.
- **After stage 2 has written: NEVER run stage 0, 1 or 2 again.** Each refuses while
  the written marker `/tmp/fv6-written.ok` exists, whatever its age, and R02, R04 and
  P0 refuse in the database regardless. **Stage 3 is READ ONLY** and runs from the
  recorded sha whatever main has done since: it prints whether main moved, with both
  shas, and never stops on it.
- **A moved main before the write ends the sitting.** Nothing is written, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/fv6-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the files, the pins and the recorded head

```
(
set -o pipefail
DOCPIN=docs/data-op-ficha-v6.sha256
SHA1=2b4e1c2757be0e57a13b45d52661ffbc1c73223dca2a49f170352a5f1a7019ff
SHA2=6a78f43a41d00ff793829868359ee813855a08e98c972cf6553ae5a8a370b547
SHA3=03afec0392e8f61b98a561987cf81242540fec0182f6808d031448109bf60eb7
SHAJSON=483f88276bad335f4ced1ab7f3d99f7d9d87b05abc1584baad579c49f9e5796c
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
F1=scripts/data/ficha-v6-1-measure.sql
F2=scripts/data/ficha-v6-2-write.sql
F3=scripts/data/ficha-v6-3-verify.sql
FJSON=packages/db/seed/form-templates/osteopathy-v6.json
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read and nothing was written"; exit 1; }
if [ -e /tmp/fv6-written.ok ]; then echo "STOP: stage 2 has ALREADY WRITTEN. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; fi
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read and nothing was written"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was read and nothing was written"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be cut out of the clock. Nothing was read and nothing was written"; exit 1; }
LT=$(echo "${NOW}" | cut -c9-12) || { echo "STOP: the Lisbon time could not be cut out of the clock. Nothing was read and nothing was written"; exit 1; }
echo "${DOW} ${LT}" | grep -qxE '[1-7] [0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not read as a weekday and HHMM [${DOW} ${LT}]. Nothing was read and nothing was written"; exit 1; }
if awk -v d="${DOW}" -v t="${LT}" 'BEGIN { d += 0; t += 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOW}, weekday ${DOW} (1 is Monday, 7 is Sunday), ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOW} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was read and nothing was written"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read and nothing was written"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read and nothing was written"; echo "${STRAY}"; exit 1; }
rm -f /tmp/fv6-main.sha /tmp/fv6-stage1.out /tmp/fv6-stage1.ok || { echo "STOP: the previous sitting's records could not be cleared. Nothing was read and nothing was written"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so origin/main may be stale. Nothing was read and nothing was written"; exit 1; }
MAIN=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read and nothing was written"; exit 1; }
echo "${MAIN}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAIN}]. Nothing was read and nothing was written"; exit 1; }
git checkout -q --detach "${MAIN}" || { echo "STOP: the checkout of origin/main failed. Nothing was read and nothing was written"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read and nothing was written"; exit 1; }
[ "${HD}" = "${MAIN}" ] || { echo "STOP: the apply worktree is not on origin/main after the checkout. Nothing was read and nothing was written"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one, or its sidecar is not on disk. Nothing was read and nothing was written"; exit 1; }
S1=$(shasum -a 256 ${F1} | cut -d' ' -f1) || { echo "STOP: stage 1 could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${S1}" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
S2=$(shasum -a 256 ${F2} | cut -d' ' -f1) || { echo "STOP: stage 2 could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${S2}" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
S3=$(shasum -a 256 ${F3} | cut -d' ' -f1) || { echo "STOP: stage 3 could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${S3}" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
SJ=$(shasum -a 256 ${FJSON} | cut -d' ' -f1) || { echo "STOP: the version 6 file could not be hashed, or is not on main: #1741 has not merged. Nothing was read and nothing was written"; exit 1; }
[ "${SJ}" = "${SHAJSON}" ] || { echo "STOP: the version 6 file on main is not the one the stage files embed. Nothing was read and nothing was written"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
echo "${MAIN}" > /tmp/fv6-main.sha || { echo "STOP: the sha could not be recorded. Nothing was read and nothing was written"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/fv6-main.sha"
echo "FICHA-V6 FILES VERIFIED"
)
```

**EXPECT: `Lisbon now: ... closed by the weekday table ...`, the sidecar line
`docs/data-op-ficha-v6.md: OK`, then `running from origin/main <sha>, recorded in
/tmp/fv6-main.sha`, then `FICHA-V6 FILES VERIFIED`.** It reads no database. The sha
it prints is the one every later stage runs from.

## STAGE 1: the measurement

```
(
set -o pipefail
DOCPIN=docs/data-op-ficha-v6.sha256
SHA1=2b4e1c2757be0e57a13b45d52661ffbc1c73223dca2a49f170352a5f1a7019ff
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
F1=scripts/data/ficha-v6-1-measure.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read and nothing was written"; exit 1; }
if [ -e /tmp/fv6-written.ok ]; then echo "STOP: stage 2 has ALREADY WRITTEN. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; fi
rm -f /tmp/fv6-stage1.out /tmp/fv6-stage1.ok || { echo "STOP: stage 1's old records could not be cleared. Nothing was read and nothing was written"; exit 1; }
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was read and nothing was written"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was read and nothing was written"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be cut out of the clock. Nothing was read and nothing was written"; exit 1; }
LT=$(echo "${NOW}" | cut -c9-12) || { echo "STOP: the Lisbon time could not be cut out of the clock. Nothing was read and nothing was written"; exit 1; }
echo "${DOW} ${LT}" | grep -qxE '[1-7] [0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not read as a weekday and HHMM [${DOW} ${LT}]. Nothing was read and nothing was written"; exit 1; }
if awk -v d="${DOW}" -v t="${LT}" 'BEGIN { d += 0; t += 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOW}, weekday ${DOW} (1 is Monday, 7 is Sunday), ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOW} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was read and nothing was written"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read and nothing was written"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read and nothing was written"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/fv6-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops. Nothing was read and nothing was written"; exit 1; }
REC=$(cat /tmp/fv6-main.sha) || { echo "STOP: the recorded sha could not be read. Nothing was read and nothing was written"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded sha did not read as a full 40-character sha [${REC}]. Nothing was read and nothing was written"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was read and nothing was written"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read and nothing was written"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${MNOW}"
[ "${MNOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach "${REC}" || { echo "STOP: the checkout of the recorded sha failed. Nothing was read and nothing was written"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read and nothing was written"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the recorded sha after the checkout. Nothing was read and nothing was written"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one, or its sidecar is not on disk. Nothing was read and nothing was written"; exit 1; }
S1=$(shasum -a 256 ${F1} | cut -d' ' -f1) || { echo "STOP: stage 1 could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${S1}" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed, or is not on disk. Nothing was read and nothing was written"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read and nothing was written"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read and nothing was written"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/fv6-target-1.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read and nothing was written"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/fv6-target-1.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read and nothing was written"; exit 1; }

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f ${F1} 2>&1 | tee /tmp/fv6-stage1.out || { echo "STOP: stage 1 failed in the database, or its transcript could not be kept; its lines are above. Stage 1 is READ ONLY: nothing was written"; exit 1; }
grep -qF 'FICHA-V6 STAGE 1 COMPLETE' /tmp/fv6-stage1.out || { echo "STOP: stage 1 did not print its COMPLETE line. Nothing was written"; exit 1; }
RN=$(grep -cE '^[[:space:]]*R[0-9]{2}[[:space:]]*[|]' /tmp/fv6-stage1.out) || { echo "STOP: stage 1 printed no refusal line, or its transcript could not be read. Nothing was written"; exit 1; }
[ "${RN}" = 8 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 8. Nothing was written"; exit 1; }
NREF=$(grep -cE '^[[:space:]]*R[0-9]{2}[[:space:]]*[|].*[|][[:space:]]*REFUSE[[:space:]]*$' /tmp/fv6-stage1.out)
[ "${NREF}" = 0 ] || { echo "STOP: stage 1 printed REFUSE on ${NREF} line(s), or its transcript could not be read. The sitting stops here, and stage 2 would refuse on the same lines. Report section 5. Nothing was written"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/fv6-stage1.out; }
CN=$(carry fv6_count) || { echo "STOP: the count to write could not be read out of stage 1's transcript. Nothing was written"; exit 1; }
echo "${CN}" | grep -qxE '[1-9][0-9]{0,3}' || { echo "STOP: the count to write did not read as a whole number above 0 [${CN}]. Nothing was written"; exit 1; }
echo "${REC}" > /tmp/fv6-stage1.ok || { echo "STOP: stage 1's pass could not be recorded. Nothing was written"; exit 1; }
echo "STAGE 1 READ, NO REFUSAL. ${CN} tenant row(s) to write. Read sections 1, 3 and 5 before stage 2."
)
```

**Read the output before pasting stage 2.** The HEAD CHECK prints both shas, and they
are equal or the block has already halted. Section 1 lists every tenant: its
osteopathy versions, whether its version 5 is active, its version 5 schema md5 and
whether that is the repo version 5's (`yes`), and its plan; only `INSERT` is written.
Section 3 prints the baseline. Section 5 prints eight refusals, `R01` to `R08`; the
block has already stopped if any reads REFUSE. A refusal that reads `VACUOUS` read an
empty population: that is not a refusal, and section 1 says which population it was.
Section 5b must be empty.

## STAGE 2: the write

**Paste it in closed hours, within the hour of stage 1.**

```
(
set -o pipefail
DOCPIN=docs/data-op-ficha-v6.sha256
SHA2=6a78f43a41d00ff793829868359ee813855a08e98c972cf6553ae5a8a370b547
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
F2=scripts/data/ficha-v6-2-write.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs
NAMES=(
fv6_count
fv6_tenants
fv6_rows
fv6_baseline
)

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was written"; exit 1; }
if [ -e /tmp/fv6-written.ok ]; then echo "STOP: stage 2 has ALREADY WRITTEN. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; fi
test -f /tmp/fv6-stage1.ok || { echo "STOP: stage 1 did not pass in this sitting. The sitting stops. Nothing was written"; exit 1; }
FRESH=$(find /tmp/fv6-stage1.ok -mmin -60) || { echo "STOP: the age of stage 1's pass could not be read. Nothing was written"; exit 1; }
[ -n "${FRESH}" ] || { echo "STOP: stage 1 passed over an hour ago. The sitting stops. Nothing was written"; exit 1; }
test -f /tmp/fv6-stage1.out || { echo "STOP: stage 1 left no transcript. The sitting stops. Nothing was written"; exit 1; }
FRESHO=$(find /tmp/fv6-stage1.out -mmin -60) || { echo "STOP: the age of stage 1's transcript could not be read. Nothing was written"; exit 1; }
[ -n "${FRESHO}" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. Nothing was written"; exit 1; }
NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was written"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9]{12} [1-7] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOW}]. Nothing was written"; exit 1; }
DOW=$(echo "${NOW}" | cut -c14) || { echo "STOP: the Lisbon weekday could not be cut out of the clock. Nothing was written"; exit 1; }
LT=$(echo "${NOW}" | cut -c9-12) || { echo "STOP: the Lisbon time could not be cut out of the clock. Nothing was written"; exit 1; }
echo "${DOW} ${LT}" | grep -qxE '[1-7] [0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not read as a weekday and HHMM [${DOW} ${LT}]. Nothing was written"; exit 1; }
if awk -v d="${DOW}" -v t="${LT}" 'BEGIN { d += 0; t += 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon now:    ${NOW}, weekday ${DOW} (1 is Monday, 7 is Sunday), ${CLOCK} by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed)"
[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOW} is inside clinic hours by the weekday table. This operation runs in closed hours only. Nothing was written"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was written"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was written"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded, and stage 1 must have passed on it."
test -f /tmp/fv6-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops. Nothing was written"; exit 1; }
REC=$(cat /tmp/fv6-main.sha) || { echo "STOP: the recorded sha could not be read. Nothing was written"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded sha did not read as a full 40-character sha [${REC}]. Nothing was written"; exit 1; }
PASS=$(cat /tmp/fv6-stage1.ok) || { echo "STOP: stage 1's pass could not be read. Nothing was written"; exit 1; }
[ "${PASS}" = "${REC}" ] || { echo "STOP: stage 1 did not pass on the recorded sha ${REC}. The sitting stops. Nothing was written"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed, so whether main moved is not known. Nothing was written"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was written"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${MNOW}"
[ "${MNOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach "${REC}" || { echo "STOP: the checkout of the recorded sha failed. Nothing was written"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was written"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the recorded sha after the checkout. Nothing was written"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one, or its sidecar is not on disk. Nothing was written"; exit 1; }
S2=$(shasum -a 256 ${F2} | cut -d' ' -f1) || { echo "STOP: stage 2 could not be hashed, or is not on disk. Nothing was written"; exit 1; }
[ "${S2}" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file. Nothing was written"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed, or is not on disk. Nothing was written"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was written"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed, or is not on disk. Nothing was written"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was written"; exit 1; }

carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/fv6-stage1.out; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}) || { echo "STOP: carry ${C} could not be read out of stage 1's transcript. Nothing was written"; exit 1; }; [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript. Nothing was written"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was written"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/fv6-target-2.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was written"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/fv6-target-2.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was written"; exit 1; }

rm -f /tmp/fv6-stage2.out || { echo "STOP: the old stage 2 transcript could not be cleared. Nothing was written"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f ${F2} 2>&1 | tee /tmp/fv6-stage2.out || { echo "STOP: stage 2 exited non-zero; its lines are above. A STOP raised in the database (psql exit 3) rolled the whole transaction back and NOTHING WAS WRITTEN. Any other failure, a lost connection or tee failing after psql, leaves open whether the write stands. The sitting stops here. Never run stage 0, 1 or 2 again without the lead's word; stage 3 (READ ONLY) runs only on the owner's or the lead's word, and its verdicts answer whether the write stands"; exit 1; }
touch /tmp/fv6-written.ok || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but the written marker could not be made. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
grep -qF 'FICHA-V6 STAGE 2 DONE' /tmp/fv6-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its DONE line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
grep -qF 'FICHA-V6 STAGE 2 COMMITTED' /tmp/fv6-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its COMMITTED line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "FICHA-V6 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the write;
every assertion after it raises too, and a raise inside the DO block rolls back
everything the block did. So a `STOP:` raised in the database (psql exit 3) always
means **nothing was written**, and so does every `STOP:` the block prints before
psql runs, the HEAD CHECK's included. **psql exit 0 means the COMMIT ran and the
write stands:** the block touches the written marker at once, before it reads the
transcript, and the three `STOP:` lines it can print after that point say so in their
own words. The file pins `client_min_messages = notice`, so a quieter role or
database default cannot hide the step lines. The NOTICE lines name each step: `L1`
the lock, `P0` the re-run refusal, `P1` the sets, `P2` each refusal with its control,
`P3` the four carries against stage 1 (the baseline among them), `P4` the embedded
schema against the expected version 6 md5 and against each tenant's production
version 5 without its `x-order`, `W1` the insert with its row count, `A1` each
inserted row read back, `A2` every other row against the baseline, `A3` the picker
reading version 6, then `FICHA-V6 STAGE 2 DONE`, and `COMMITTED` after the COMMIT.

**Only exit 0 with the `DONE` and `COMMITTED` lines goes on to stage 3,** and the
block then prints `FICHA-V6 WRITTEN. Paste stage 3 now.` **Every other exit stops the
sitting, with nothing else pasted.** psql exit 3 is every in-database STOP, a lock not
granted within `lock_timeout` included, and nothing was written; an undefined carry
fails before the block, on the `set_config` statement, also with exit 3. Any other
exit (psql exits 2 on a lost connection, possibly during the COMMIT) leaves open
whether the write stands. In every case GREEN reports the exit code and the whole
output, and stage 3, READ ONLY, runs only on the owner's or the lead's word; its
verdicts answer whether the write stands. R02, R04 and P0 refuse a second write
regardless.

## STAGE 3: the verify. READ ONLY

```
(
set -o pipefail
DOCPIN=docs/data-op-ficha-v6.sha256
SHA3=03afec0392e8f61b98a561987cf81242540fec0182f6808d031448109bf60eb7
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
F3=scripts/data/ficha-v6-3-verify.sql
GUARD=scripts/assert-production-target.mjs
PTM=scripts/production-target.mjs

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was read"; exit 1; }
test -f /tmp/fv6-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules. Nothing was read"; exit 1; }
REC=$(cat /tmp/fv6-main.sha) || { echo "STOP: the recorded sha could not be read. Nothing was read"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded sha did not read as a full 40-character sha [${REC}]. Nothing was read"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was read"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean. Do not clean it. Nothing was read"; echo "${STRAY}"; exit 1; }
git fetch origin --prune || { echo "STOP: the fetch failed. Nothing was read"; exit 1; }
MNOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was read"; exit 1; }
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${MNOW}"
if [ "${MNOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${MNOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach "${REC}" || { echo "STOP: the checkout of the recorded sha failed. Nothing was read"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read after the checkout. Nothing was read"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the recorded sha after the checkout. Nothing was read"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one, or its sidecar is not on disk. Nothing was read"; exit 1; }
S3=$(shasum -a 256 ${F3} | cut -d' ' -f1) || { echo "STOP: stage 3 could not be hashed, or is not on disk. Nothing was read"; exit 1; }
[ "${S3}" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file. Nothing was read"; exit 1; }
SG=$(shasum -a 256 ${GUARD} | cut -d' ' -f1) || { echo "STOP: the target guard could not be hashed, or is not on disk. Nothing was read"; exit 1; }
[ "${SG}" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Nothing was read"; exit 1; }
SM=$(shasum -a 256 ${PTM} | cut -d' ' -f1) || { echo "STOP: the guard's module could not be hashed, or is not on disk. Nothing was read"; exit 1; }
[ "${SM}" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. Nothing was read"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport || { echo "STOP: the production environment did not load. Nothing was read"; exit 1; }
node ${GUARD} 2>&1 | tee /tmp/fv6-target-3.out || { echo "STOP: the target guard refused, or its output could not be kept; its lines are above. Nothing was read"; exit 1; }
grep -qxF 'target verified: production, session pooler.' /tmp/fv6-target-3.out || { echo "STOP: the target guard did not print the line target verified: production, session pooler. Nothing was read"; exit 1; }

rm -f /tmp/fv6-stage3.out || { echo "STOP: the old stage 3 transcript could not be cleared. Nothing was read"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f ${F3} 2>&1 | tee /tmp/fv6-stage3.out || { echo "STOP: stage 3 failed in the database, or its transcript could not be kept; its lines are above. Stage 3 is READ ONLY"; exit 1; }
grep -qF 'FICHA-V6 STAGE 3 COMPLETE' /tmp/fv6-stage3.out || { echo "STOP: stage 3 did not print its COMPLETE line"; exit 1; }
NS=$(grep -cE '^[[:space:]]*99[[:space:]]*[|]' /tmp/fv6-stage3.out) || { echo "STOP: stage 3 printed no SUMMARY row"; exit 1; }
[ "${NS}" = 1 ] || { echo "STOP: stage 3 printed ${NS} SUMMARY rows, not 1"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*[|].*[|][[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/fv6-stage3.out) || { echo "STOP: stage 3 printed no verdict, or its transcript could not be read"; exit 1; }
[ "${NV}" = 10 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 10"; exit 1; }
NF=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*[|].*[|][[:space:]]*FAIL[[:space:]]*$' /tmp/fv6-stage3.out)
[ "${NF}" = 0 ] || { echo "STOP: ${NF} stage 3 verdict(s) read FAIL, or the transcript could not be read"; exit 1; }
NVAC=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*[|].*[|][[:space:]]*VACUOUS[[:space:]]*$' /tmp/fv6-stage3.out)
[ "${NVAC}" = 0 ] || { echo "STOP: ${NVAC} stage 3 verdict(s) read VACUOUS, which this op never allows, or the transcript could not be read"; exit 1; }
NOK=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*[|].*[|][[:space:]]*OK[[:space:]]*$' /tmp/fv6-stage3.out) || { echo "STOP: stage 3 printed no OK verdict"; exit 1; }
[ "${NOK}" = 10 ] || { echo "STOP: stage 3 printed ${NOK} OK verdicts, not 10"; exit 1; }
echo "FICHA-V6 VERIFIED: 10 OK / 0 VACUOUS / 0 FAIL."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, ten verdicts
all OK, the SUMMARY row `10 OK / 0 VACUOUS / 0 FAIL`, the rows stage 2 wrote (one per
tenant, version 6, active, schema md5 `752bf47bf11d46a49f74e94761ecea83`), then
`FICHA-V6 VERIFIED: 10 OK / 0 VACUOUS / 0 FAIL.`** The block enforces all of it.

## What every refusal and verdict means

**Stage 1 section 5 and stage 2 P2, the same eight lines.** `n` must be 0. `control`
is the population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | nothing to write: no tenant holds the repo osteopathy version 5 without a version 6. Its control is every tenant |
| R02 | this op has already run (its audit action). Stage 2's P0 refuses the same before it reads the sets. Its control is every audit row |
| R03 | a tenant holds an osteopathy version 5 whose md5 of `schema::text` is not `b109e3af926fd6f51bbf485a173d2145`, the repo version 5's: the premise is wrong and strategy rules. Its control is the tenants holding a version 5 |
| R04 | an osteopathy row of version 6 or above already exists, in any tenant. Its control is every osteopathy row |
| R05 | a tenant holds an osteopathy version 5 that is not active. Its control is the tenants holding a version 5 |
| R06 | the unique key on `(tenant_id, key, version)` that `ON CONFLICT` names is missing. Its control is every index on `form_templates` |
| R07 | a trigger the system did not create sits on `form_templates` or `audit_log`. Its control is every trigger on the two, the foreign-key triggers included. Section 5b lists what it found |
| R08 | the clinics are open now by the DATABASE's Lisbon clock and the weekday table. Its control is the Lisbon weekday times 10000 plus HHMM |

**The carries.** Four names, none a substring of another: the count of tenants to
write (`fv6_count`), an md5 over their ids (`fv6_tenants`), the count of every
`form_templates` row (`fv6_rows`) and one md5 over every one of those rows, whole
(`fv6_baseline`). The block that computes them, between `FICHA-V6 BASE BEGIN` and
`BASE END`, is byte-identical in stage 1 and stage 2, so a recomputed carry can only
differ when the database moved. Stage 2 recomputes all four under its lock (P3), and
after the insert compares every row it did not insert with the baseline (A2).

**Stage 3's ten verdicts,** each with a control that can fail; none may read VACUOUS:

1. one audit row per tenant written, each naming a `form_template` row and the same
   total (0 audit rows FAILs);
2. each audit row names an osteopathy version 6 row of its own tenant;
3. every tenant holding an osteopathy version 5 now holds exactly one version 6
   (control: the tenants holding a version 5, above 0);
4. every osteopathy version 6 row is one this op wrote;
5. each version 6 schema reads `752bf47bf11d46a49f74e94761ecea83`; control: each
   version 5 reads `b109e3af926fd6f51bbf485a173d2145`, and the two md5s differ;
6. each version 6 `x-order` equals the file's; control: no version 5 `x-order`
   equals it, so the compare can tell the two orders apart;
7. each version 6 row carries the file's title and is active;
8. new fichas pick version 6 in every tenant that has one (the picker of
   `records.ts`: the active rows of the key, highest version); control: the same
   rule with version 6 left out picks version 5;
9. every row stage 2 did not insert is unchanged: count and md5 equal the baseline
   in the audit rows (all of which carry the same one); control: the same md5 with
   one row left out differs from it;
10. each version 6 row was made in the op's own transaction and not touched since:
    its `created_at` equals its audit row's, and its `updated_at` its `created_at`.

**Stage 3 moves with the clinic.** A later template row or any edit to a
`form_templates` row FAILs verdict 9, and a later osteopathy version FAILs 8. It runs
straight after stage 2; read a later FAIL against the audit rows' time before calling
it a defect of the op.

## Undoing it

**Documented, never run, and never to be run without its own ruling.** Each audit
row names the row it wrote. The undo deletes only those rows, only while no clinical
record pins one, in one transaction, with its row count read:

```sql
BEGIN;
DELETE FROM public.form_templates f
 USING public.audit_log al
 WHERE al.action = 'staff.ficha_v6.install_template'
   AND f.id = al.entity_id
   AND NOT EXISTS (SELECT 1 FROM public.clinical_records cr WHERE cr.form_template_id = f.id);
ROLLBACK;
```

It is written with `ROLLBACK` on purpose: a real undo is its own data op, authored
and rehearsed with its own count check and its own audit row, on its own ruling. Once
a ficha pins a version 6 row, that row is immutable (`CLAUDE.md` rule 5) and the
undo leaves it, which is what it must do.

## Rehearsed on a throwaway database

**NOT REHEARSED.** Nothing in this document has run on any database. This section is
filled by the rehearsal session, a session that did not write these files, on these
exact bytes. Until it is filled, this document is not READY.

## What this does NOT do

- **It runs no loader.** Nothing in a block or a stage file runs, reads or imports
  the seed loader; stage 2 inserts one literal row per tenant.
- **It updates nothing and deletes nothing.** Every existing `form_templates` row,
  version 5 included, is compared by md5 before and after, inside the transaction,
  and again by stage 3.
- **It touches no record.** Records pin their template by id; a ficha written
  against version 5 keeps rendering version 5.
- **It sends nothing** and touches no other table.
- **It does not choose for strategy.** A production version 5 that differs from the
  repo's, a version 6 already present, or a version 5 that is not active, each
  refuses and goes back to strategy.
