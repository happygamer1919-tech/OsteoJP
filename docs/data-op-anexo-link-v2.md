# ANEXO LINK v2: the imported documents an episode row named against one registo are linked to it

**Status: NOT RUN. HELD.** A DATA operation, not a migration: no schema change, no journal
entry. Four blocks, each pasted whole, on its own and in order: stage 0 (the files and the
head it runs from), stage 1 (read), stage 2 (write) and stage 3 (verify). Any `STOP:` line,
any REFUSE, any `FAIL` verdict, any `ERROR` and any non-zero exit halts the sitting:

A refusal or a STOP stops the sitting, and nothing continues to the next block.

Whether and when a halted sitting starts again is the lead's call, never the runner's.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the
owner's dispatch naming the three files below by filename (`CLAUDE.md`, "Who applies
migrations"). The authoring lane runs these blocks against a throwaway database and against
nothing else; the section "Rehearsal" says what has run on these exact bytes.

| Fact | Value |
|---|---|
| Card | `INC-imported-fichas-sem-anexos-originals-are-patient-level`, ruling (a) |
| Replaces | the original op, `docs/data-op-anexo-link.md` and its three files, which carry a SUPERSEDED banner, stay on main byte-identical and must not be run. They never ran |
| Ruling, owner, 2026-09-13, paraphrased | (a) a document that a Fisiozero episode row named against ONE specific registo is linked to that registo, pinned and counted, rehearsed first; nothing else is guessed. With it, a linked imported original shows on the ficha's Anexos AND stays on the patient's Documentos tab (the app half, built and merged in #1310) |
| Order | **After DUR-01**, by the owner's order. Not coupled in SQL: the section "The order with DUR-01" says why there is no data dependency to couple |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001`. The op links in the tenant that owns this row, and no other |
| Castelo Branco | `de000002-0000-0000-0000-000000000002`. R01 refuses unless it sits in the same tenant |
| Runs from | `origin/main`, after this op's PR has merged. The owner freezes merges to main for the sitting. Stage 0 records the sha `origin/main` resolves to in `/tmp/anexo2-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stages 1 and 2 HALT if `origin/main` has moved since (the HEAD CHECK, below) |
| Stage 1 | `scripts/data/anexo-link-v2-1-read.sql`, READ ONLY, 12 refusal lines, sha256 `1a118525854fcd951b5c03eb8cabae235e182d6287747e1251cb2de31853dfa0` |
| Stage 2 | `scripts/data/anexo-link-v2-2-write.sql`, ONE DO block in ONE transaction, sha256 `926bcdc499b30021be75fa5b610b3ee34eabb16e7d80befff6ae461d8447e63a` |
| Stage 3 | `scripts/data/anexo-link-v2-3-verify.sql`, READ ONLY, 12 verdicts and a SUMMARY row, sha256 `80b6ab24d899bfe02f5578f5a3ae31a3533ad752efb851ed3e8fe99469f4cb89` |
| Target guard | `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`, the only other program a block runs; it imports nothing |
| This document | `docs/data-op-anexo-link-v2.md`, pinned by `docs/data-op-anexo-link-v2.sha256` and asserted by every stage; GREEN's dispatch names its sha256 as well |
| What stage 1 writes | **nothing.** One READ ONLY, REPEATABLE READ transaction |
| What stage 2 writes | `attachments.clinical_record_id` on exactly the link set, each row only while it is still unlinked and not soft deleted, and ONE `audit_log` row, action `attachment.anexo_link_v2.backfill`. **No stage file holds a DELETE, DROP or TRUNCATE statement** |
| What no stage touches | every other column of a linked document (`patient_id`, `storage_path`, `file_name`, the soft-delete columns), every other attachment in every tenant, `clinical_records` (every row, the target registos included), `clinical_episodes`, `migration_staging_rows`, and `consultations`, whose `audio_object_key` is the schema's other column that points into storage. Stage 2 compares each by md5 inside its own transaction; Storage objects themselves are never read or written, and R12 refuses any trigger that could reach them |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256, so the digest lives in `docs/data-op-anexo-link-v2.sha256` and every stage checks it
with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same head
as the document, so a main that moved to a new document and a new sidecar together would pass
that check: GREEN's dispatch names this document's sha256 as well, and the HEAD CHECK halts on
any moved main.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there
are no backslash continuations and no `!` except `test !`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document, and
`scripts/anexo-link-v2-data-op.test.mjs` holds the other three rules).

## What it fixes, in one paragraph

The Fisiozero import uploaded every original file. Its dedupe rule ("documentos.csv is the
richest source, it wins on a filename already seen", `packages/db/src/migration/sources/fisiozero.ts`)
then dropped each registo-linked entry and re-added the file with a patient and no registo,
so every imported ficha reads "Sem anexos" by construction and the originals sit on the
patient's Documentos tab. Where an episode row named a file against ONE specific registo, the
link is deterministic: the registo's staging row (`migration_staging_rows`, entity
`clinical_record`, status `imported`, its `imported_entity_id`) holds the `FICHEIRO` cell, and
the importer named the Storage object `<tenant>/migration/fisiozero/<file>`. This op restores
exactly those links. For every other document the link would be a guess, and nothing here
guesses.

## The order with DUR-01

The owner's order runs this op **after DUR-01**. This document states the order; no stage
checks it, because there is no data dependency to check. DUR-01 writes
`appointments.ends_at` and `appointments.updated_at` on the importer's one-minute future
bookings and one `audit_log` row of its own action. This op reads no appointment, and reads
`audit_log` only for its own two actions (the original op's and this one's). Its sets come
from `migration_staging_rows`, `attachments` and `clinical_records`, none of which DUR-01
writes, and its md5 families cover none of DUR-01's rows. So DUR-01 having run, or not, changes
nothing this op reads, and no stage refuses on it. A coupling in SQL would make this op refuse
over a state it cannot see a reason to care about.

## What changed from the original op, and why

The ruled scope is unchanged: the link set is still every live, unlinked document of the
tenant named in an imported registo's `FICHEIRO` cell, linked to that registo, with a document
named by two registos, a patient mismatch and a registo that is not locked each refusing the
whole sitting, as the original document ruled. What changed are defects in the original FILES,
each found by reading them against that ruling and the app, none of them run on production:

- **A soft-deleted document would have been linked.** The original stage 2 had no
  `deleted_at` test. Staff removal (SR-62 PU-4) now leaves it alone, listed (question Q1).
- **A cell naming one file twice would have stopped the sitting.** The original stage 2
  counted the pair twice, updated the row once, and its ROW_COUNT check raised. The pairs are
  DISTINCT here, and the fixture carries that shape.
- **The trim was not the importer's.** The original split used `btrim` with no second
  argument, which strips the ASCII space only; the importer trims with JavaScript's `trim`
  (`splitDeliveryFileNames`). A name ending in a tab or a no-break space resolved to a path
  the importer never wrote, so the document was reported missing and never linked. R11 now
  proves the read on a synthetic cell, and the unit test holds the character set equal to
  JavaScript's over the whole Basic Multilingual Plane.
- **Nothing but clinical_records was compared.** The original stage 2 read the count and
  `max(updated_at)` of `clinical_records` and nothing else. Every table in the "no stage
  touches" row above is now compared by md5 inside the transaction, and every column of a
  linked document but the one written.
- **The blocks took a fresh `origin/main` at each stage,** with no HEAD CHECK and no pin on
  the document. They now follow STAFF-10 v2's protocol.
- **The document said four refusals and five lines printed.** The original section 2 printed
  three refusals and two reports under a heading saying four; here every line of section 4 is
  a refusal, with its control, and every report is a class in section 2.

## The owner questions, and the default this op is built to

Paraphrased, no counts. Each default is what the files do today; a different ruling changes
the files, their pins and the rehearsal.

| # | Question | Default built |
|---|---|---|
| Q1 | A named document that staff have soft deleted: link it too? | **No.** It is left unlinked and soft deleted, listed by id in stage 1 section 2d and in the audit row (`excluded.soft_deleted`), and stage 3 verdict 10 proves it unchanged. Not a refusal: the rest of the link set still runs. The original files would have linked it; the Anexos read hides a soft-deleted row either way (SR-62 PU-4), so a link would only write a row staff removed |
| D1 | Added: which tenant? | The tenant that owns the Linda-a-Velha row, and R01 refuses unless the Castelo Branco row sits in it. The original files took whatever tenant the candidates were in and refused more than one; here another tenant's named documents are class `other_tenant`, listed, never linked, and compared by md5 |
| D2 | Added: a named file that resolves to two document rows? | Refuses (R05): which row the cell names would be a guess |
| D3 | Added: a staging row whose registo is not there? | Class `no_registo`, listed, never linked. The original files dropped it silently in an inner join |
| D4 | Added: a registo in another tenant than its staging row? | Refuses (R08) |
| D5 | Added: what if there is nothing to link? | Refuses (R09), so every stage 3 verdict but two always compares something, and no audit row is written for a no-op, as the original stage 2 already refused |
| D6 | Added: what if a table stage 2 writes carries a trigger the system did not create? | Refuses (R12), and stage 2's P4 reads the catalog again and stops too. Main has none on `attachments` or `audit_log`; production has run ahead of main before |
| D7 | Added: the original write has already run | Refuses (R02) |
| D8 | Added: stage 2 isolation | REPEATABLE READ, so every comparison inside it reads one snapshot, and a staff edit of a row it writes, committed mid-transaction, aborts it rather than racing it |
| D9 | Added: which source systems? | Every one, as the original files read it: the scope is the staging row's entity, status and registo, not its `source_system`. Stage 1 section 1 prints the named files per source, so a source other than `fisiozero` is visible before the write |
| D10 | Added: must the link set's registos be imported ones? | They are by construction: the only way into the link set is an imported staging row's `imported_entity_id`. R07 refuses any that is not locked, which every imported registo is |

## The HEAD CHECK, and running from main

The op runs from `origin/main`, after its PR has merged, and the owner freezes merges to main
for the sitting. No block reads a branch, and there is no separate HEAD CHECK to paste: the
machine runs it inside the blocks, and halts on it.

- **Stage 0** refuses once stage 2 has written, checks that the apply worktree is clean,
  fetches, resolves `origin/main`, checks that sha out detached, verifies the sidecar and every
  pin, and only then records the sha in `/tmp/anexo2-main.sha` and prints
  `running from origin/main <sha>`.
- **Stages 1 and 2 begin with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and written
  nothing. Each then checks out the RECORDED sha, never a fresh `origin/main`, and asserts its
  own file and the target guard by sha256 before it runs either.
- **Stage 1 marks its pass with the recorded sha,** and stage 2 refuses unless that mark names
  the sha it is about to run from.
- **After stage 2 has written: NEVER run stage 0, 1 or 2 again.** Each refuses once the
  written marker exists, and R03 refuses in the database regardless. **Stage 3 is READ ONLY**
  and runs from the recorded sha whatever main has done since: it prints whether main moved,
  with both shas, and never stops on it.
- **A moved main before the write ends the sitting.** Nothing is written, both shas go in the
  report, and whether and when to start again is the lead's call.
- **If `/tmp/anexo2-main.sha` is gone,** stages 1 to 3 stop, and the lead rules.

## STAGE 0: the files, the pins and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/data-op-anexo-link-v2.sha256
SHA1=1a118525854fcd951b5c03eb8cabae235e182d6287747e1251cb2de31853dfa0
SHA2=926bcdc499b30021be75fa5b610b3ee34eabb16e7d80befff6ae461d8447e63a
SHA3=80b6ab24d899bfe02f5578f5a3ae31a3533ad752efb851ed3e8fe99469f4cb89
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only when the owner or the lead says so"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/anexo2-main.sha /tmp/anexo2-stage1.out /tmp/anexo2-stage1.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/anexo-link-v2-1-read.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/data/anexo-link-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/anexo-link-v2-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-1-read.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
echo "${MAIN}" > /tmp/anexo2-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/anexo2-main.sha"
echo "ANEXO LINK V2 FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/data-op-anexo-link-v2.md: OK`, then
`running from origin/main <sha>, recorded in /tmp/anexo2-main.sha`, then
`ANEXO LINK V2 FILES VERIFIED`.** It reads no database. The sha it prints is the one every
later stage runs from.

## STAGE 1: the read

```
(
set -eo pipefail
SHA1=1a118525854fcd951b5c03eb8cabae235e182d6287747e1251cb2de31853dfa0
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only when the owner or the lead says so"; exit 1; }
rm -f /tmp/anexo2-stage1.out /tmp/anexo2-stage1.ok
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/anexo2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/anexo2-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-anexo-link-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/anexo-link-v2-1-read.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-1-read.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-v2-1-read.sql 2>&1 | tee /tmp/anexo2-stage1.out
grep -q 'ANEXO LINK V2 STAGE 1 COMPLETE' /tmp/anexo2-stage1.out || { echo "STOP: stage 1 did not print its COMPLETE line"; exit 1; }
RN=$(grep -cE '^[[:space:]]*R[0-9]{2}[[:space:]]*\|' /tmp/anexo2-stage1.out || true)
[ "${RN}" = 12 ] || { echo "STOP: stage 1 printed ${RN} refusal lines, not 12"; exit 1; }
REF=$(grep -E '^[[:space:]]*R[0-9]{2}[[:space:]]*\|.*\|[[:space:]]*REFUSE[[:space:]]*$' /tmp/anexo2-stage1.out | sed -E 's/^[[:space:]]*(R[0-9]{2}).*/\1/' | tr '\n' ' ' || true)
[ -z "${REF}" ] || { echo "STOP: stage 1 printed REFUSE on ${REF}. The sitting stops here, and stage 2 would refuse on the same lines. Report them"; exit 1; }
grep -q 'partition holds' /tmp/anexo2-stage1.out || { echo "STOP: stage 1 did not print partition holds"; exit 1; }
echo "${REC}" > /tmp/anexo2-stage1.ok
echo "STAGE 1 READ, NO REFUSAL. Read sections 1, 2, 2b, 2c, 2d, 4 and 4b before stage 2."
)
```

**Read the output before pasting stage 2.** The HEAD CHECK prints both shas, and they are
equal or the block has already halted. Section 4 prints 12 refusals, `R01` to `R12`; the
block has already stopped if any reads REFUSE. A refusal that reads `VACUOUS` read an empty
population: that is not a refusal, and the sections above it say which population it was.
Section 2b must read `partition holds`, and the block checks it. Section 4b must be empty.
Section 2 is the link set and every class the op leaves alone; section 2d names each pair it
leaves alone by id. Section 3 holds the two carries stage 2 consumes; nobody types them, stage
2 parses them out of the transcript this block wrote.

## STAGE 2: the write

```
(
set -eo pipefail
SHA2=926bcdc499b30021be75fa5b610b3ee34eabb16e7d80befff6ae461d8447e63a
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
NAMES=(
anexo_v2_count
anexo_v2_digest
)

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only when the owner or the lead says so"; exit 1; }
[ -n "$(find /tmp/anexo2-stage1.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not pass in this sitting, or passed over an hour ago. The sitting stops"; exit 1; }
test -f /tmp/anexo2-stage1.out || { echo "STOP: stage 1 left no transcript. The sitting stops"; exit 1; }
[ -n "$(find /tmp/anexo2-stage1.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded, and stage 1 must have passed on it."
test -f /tmp/anexo2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/anexo2-main.sha)
[ "$(cat /tmp/anexo2-stage1.ok)" = "${REC}" ] || { echo "STOP: stage 1 did not pass on the recorded sha ${REC}. The sitting stops"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is written. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-anexo-link-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/anexo-link-v2-2-write.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-2-write.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/anexo2-stage1.out; }
ARGS=()
for C in "${NAMES[@]}"; do V=$(carry ${C}); [ -n "${V}" ] || { echo "STOP: carry ${C} did not parse out of stage 1's transcript"; exit 1; }; ARGS+=(-v "${C}=${V}"); done
echo "carries from this sitting: ${#NAMES[@]} names"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/anexo2-stage2.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/anexo-link-v2-2-write.sql 2>&1 | tee /tmp/anexo2-stage2.out
touch /tmp/anexo2-written.ok
grep -q 'ANEXO LINK V2 STAGE 2 DONE' /tmp/anexo2-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its DONE line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only when the owner or the lead says so"; exit 1; }
grep -q 'ANEXO LINK V2 STAGE 2 COMMITTED' /tmp/anexo2-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its COMMITTED line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only when the owner or the lead says so"; exit 1; }
echo "ANEXO LINK V2 WRITTEN. Paste stage 3 now."
)
```

**The whole file is one transaction.** Every refusal is raised before the first write; every
assertion after the write raises too, and a raise inside the DO block rolls back everything
the block did. So a `STOP:` raised in the database (psql exit 3) always means **nothing was
written**, and so does every `STOP:` the block prints before psql runs, the HEAD CHECK's
included. **psql exit 0 means the COMMIT ran and the write stands:** the block touches the
written marker at once, before it reads the transcript, and the two `STOP:` lines it can print
after that point say so in their own words. Either one stops the sitting like every other
`STOP:`: GREEN reports the whole output, never runs stage 0, 1 or 2 again, and stage 3, READ
ONLY, runs only when the owner or the lead says so. The file pins
`client_min_messages = notice`, so a quieter role or database default cannot hide the step
lines. The NOTICE lines name each step: `P1` the sets, `P2` each refusal with its control,
`P3` the carries, `P4` the triggers the system did not create (none, or it stops), `P5` the
baselines and the md5 family profile, `W1` the write with its row count, `A` the exact deltas
and every md5 family unchanged, and `ANEXO LINK V2 STAGE 2 DONE`, then `COMMITTED` after the
COMMIT.

**Only exit 0 with the `DONE` and `COMMITTED` lines goes on to stage 3,** and the block then
prints `ANEXO LINK V2 WRITTEN. Paste stage 3 now.` **Every other exit stops the sitting, with
nothing else pasted.** psql exit 3 is every in-database STOP, and nothing was written; an
undefined carry fails before the block, on the `set_config` statement, also with exit 3. A
`STOP:` the block prints exits 1: before psql nothing was written, and after it (the two lines
above) the write stands. Any other exit (psql exits 2 on a lost connection, possibly during the
COMMIT) leaves open whether the write stands. In every case GREEN reports the exit code and the
whole output, and stage 3, READ ONLY, runs only when the owner or the lead says so; its verdict
1 answers whether the write stands. R03 refuses a second write regardless.

## STAGE 3: the verify. READ ONLY, re-issuable

```
(
set -eo pipefail
SHA3=80b6ab24d899bfe02f5578f5a3ae31a3533ad752efb851ed3e8fe99469f4cb89
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/anexo2-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/anexo2-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "verifying from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 3 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/data-op-anexo-link-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f scripts/data/anexo-link-v2-3-verify.sql || { echo "STOP: stage 3 is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-v2-3-verify.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: stage 3 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/anexo2-stage3.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-v2-3-verify.sql 2>&1 | tee /tmp/anexo2-stage3.out
grep -q 'ANEXO LINK V2 STAGE 3 COMPLETE' /tmp/anexo2-stage3.out || { echo "STOP: stage 3 did not print its COMPLETE line"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|' /tmp/anexo2-stage3.out || { echo "STOP: stage 3 printed no SUMMARY row"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/anexo2-stage3.out && { echo "STOP: a stage 3 verdict read FAIL"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/anexo2-stage3.out || true)
[ "${NV}" = 12 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 12"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/anexo2-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '10|11' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|' /tmp/anexo2-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "ANEXO LINK V2 VERIFIED: ${PROFILE}."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, no FAIL, 12 verdicts,
a SUMMARY row, and VACUOUS only on 10 and 11**, which the block enforces: 10 when no named
document was left alone, 11 when no target registo has an episode. **Never VACUOUS: 1 to 9 and
12.** Each of those compares the link set, which R09 refuses to write empty, so each FAILs on
an empty comparand instead. The block prints the profile; the profile moves with the data,
so no exact profile is asserted for production. After the SUMMARY, stage 3 prints the link set
as it stands, counts only.

## What every refusal and every verdict means

**Stage 1 section 4 and stage 2 P2, the same 12 lines.** `n` must be 0. `control` is the
population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | a clinic row is missing, or the two clinic rows are in different tenants. Its control is the clinic rows found |
| R02 | the original ANEXO LINK write has already run (`attachment.anexo_link.backfill`) |
| R03 | this v2 write has already run (`attachment.anexo_link_v2.backfill`) |
| R04 | a document in the link set is named by more than one registo. Its control is the link set's documents |
| R05 | a named file resolves to more than one document row in the link set (D2) |
| R06 | a document in the link set belongs to another patient than its registo, or to none (NULL-safe) |
| R07 | a target registo is not locked. The app refuses adding an attachment to a registo that is not a draft (`confirmAttachment` returns `finalized`), and every imported registo is locked: this backfill does in the database what that screen refuses, deliberately, for imported history only, so it must not also sweep up a draft somebody is still editing |
| R08 | a target registo sits in another tenant than its staging row (D4) |
| R09 | the link set is empty (D5). Its control is every named pair of the tenant |
| R10 | a named pair is UNCLASSIFIED, or sits in other than exactly one class. Section 2b is the partition line |
| R11 | the file-name read misreads a synthetic cell. The SAME split and trim that read every real `FICHEIRO` cell must cut `a.pdf ,<no-break space>b.pdf;<tab>c.pdf<ideographic space>;; <line end>` into exactly `a.pdf`, `b.pdf` and `c.pdf`; a split on one separator, or `btrim`'s default, misreads it. Its control is the names read from that cell |
| R12 | a table stage 2 writes (`attachments`, `audit_log`) carries a trigger the system did not create (D6). Its control is every trigger on those tables, the constraint triggers of each foreign key included. Section 4b lists what it found |

**The classes (stage 1 section 2).** One row per (registo, named file, document the file
resolves to in the staging row's tenant, or none), DISTINCT. Each class is its own predicate,
mutually exclusive by construction, and R10 proves every pair sets exactly one:

- `other_tenant`: the staging row is not in the op's tenant (D1). Never linked;
- `no_registo`: the registo the staging row names is not there (D3). Never linked;
- `no_document`: the named file has no document row. Nothing to link;
- `already_linked`: the document already carries that registo. Nothing to do;
- `linked_elsewhere`: the document carries another registo. Left alone;
- `soft_deleted`: staff removed the document (Q1). Left alone;
- `link`: a live, unlinked document of the tenant, named against a registo that exists. The
  link set, and the only class written.

**The carries.** The link set's size (`anexo_v2_count`) and an md5 over its ordered
`attachment:registo` pairs (`anexo_v2_digest`). The block that computes them, between
`ANEXO LINK V2 SETS BEGIN` and `SETS END`, is byte-identical in stage 1 and stage 2, so a
recomputed carry can only differ when the database moved. A count cannot tell the same set
from one with a member swapped; the digest can.

**The md5 families stage 2 compares inside its transaction,** each recorded in the audit row
with its row count: `w_fixed` (every column of a linked document but `clinical_record_id`),
`att_rest` (every other attachment, every tenant), `excl` (the named documents left alone),
`cr_all` and `cr_t` (every clinical record, and the target registos), `ep_all` and `ep_t`
(every episode, and the target registos' episodes), `stg` (every staging row) and `cons`
(every consultation). `w_fixed`, `cr_t`, `cr_all` and `stg` STOP the op when empty, because
R09 guarantees them rows; the others print VACUOUS when empty and still compare, since even an
empty table's md5 changes on the one write it could suffer, a new row.

**Stage 3's 12 verdicts, each with a control that can FAIL it:**

1. exactly one v2 audit row, with the audit rows of its tenant read as the control;
2. the original ANEXO LINK write never ran, with the v2 row read as the control;
3. every recorded document carries the registo stage 2 recorded for it;
4. the digest recomputes from the rows as they stand, and the same digest less one pair differs (FAIL if it does not: the digest could not see a pair go);
5. every other column of a linked document is unchanged by md5: its patient, its Storage path, its name, its soft-delete columns;
6. every linked document belongs to its registo's patient, with the linked documents read as the control;
7. every target registo is still locked, with the target registos read as the control;
8. the target registos are unchanged by md5: no clinical record was written, with the target registos read as the control;
9. every imported original that carries a registo is one the op recorded linking or one that carried it before the op, found without the audit row's link list, with those read now as the control;
10. the named documents the op left alone are unchanged by md5, with those read now as the control (VACUOUS when there were none);
11. the target registos' episodes are unchanged by md5, with those read now as the control (VACUOUS when they have none);
12. every linked document still shows on its patient's Documentos tab: it has a patient and its path is under the tenant's imported prefix, the rule `documentosRowSql` reads (`apps/web/lib/patients/documents.ts`, #1310).

**Stage 3 is re-issuable, and its answers move with the clinic.** A later staff edit can
change 5, 6, 10, 11 and 12 honestly: a linked document soft deleted from Documentos FAILs 5,
and a signed registo FAILs 7 and 8. Read a later FAIL against the audit row's time before
calling it a defect of the op.

## Rehearsal

REHEARSAL-PLACEHOLDER

## Undoing it

Not authored here, and exact if it is ever wanted: the audit row carries every linked pair,
so an undo sets `clinical_record_id` back to NULL on exactly those ids, and only where it still
names the recorded registo. It would need its own authoring, rehearsal and ruling. Nothing
here deletes a row, so there is nothing else to restore.

## What this does NOT do

- **It writes no clinical record and moves no authorship.** `clinical_records` is compared by
  md5 inside stage 2, every row, and the target registos again by stage 3. No statement names
  that table in a write, so the immutability trigger cannot fire.
- **It moves nothing off Documentos.** A link sets `clinical_record_id` and never clears
  `patient_id`, and the Documentos read keeps every imported original, linked or not
  (verdict 12).
- **It touches no Storage object** and no other column pointing into storage.
- **It guesses nothing.** A document named by two registos, a file with two document rows, a
  patient mismatch, a registo that is not locked or one in another tenant each refuse the whole
  sitting.
- **It sends nothing** and writes no staff notification.
- **No stage file holds a DELETE, DROP or TRUNCATE statement.**
