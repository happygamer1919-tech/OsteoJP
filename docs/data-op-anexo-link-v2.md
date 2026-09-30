# ANEXO LINK v2: the imported documents an episode row named against one registo are linked to it

**Status: stage 1 READ on production on 2026-09-29, READ ONLY, from the held head. Stage 2 NOT
RUN. HELD for its write sitting** (the section "The write sitting: the pinned carries, the run
window and the apply transcript"). A DATA operation, not a migration: no schema change, no journal
entry. Four blocks, each pasted whole, on its own and in order: stage 0 (the files and the
head it runs from), stage 1 (read), stage 2 (write) and stage 3 (verify). One rule governs
every halt, in STAFF-10 v2's words, here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 2 has committed, a post-commit STOP
still stops the sitting: the write stands, and stage 3 (READ ONLY) runs only on the
owner's or the lead's word. The only onward path from stage 2 to stage 3 is exit 0
with the line "ANEXO LINK V2 WRITTEN. Paste stage 3 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the
owner's dispatch naming the three files below by filename (`CLAUDE.md`, "Who applies
migrations"). The authoring lane runs these blocks against a throwaway database and against
nothing else; the section "Rehearsal" says what has run on these exact bytes.

| Fact | Value |
|---|---|
| Card | `INC-imported-fichas-sem-anexos-originals-are-patient-level`, ruling (a) |
| Tier | A production data op on the ruled Tier C list since the owner's ruling of 2026-09-27, option (a) (`CLAUDE.md`, the owner rulings of 2026-09-27, where it is B14): it rewrites production rows outside STAFF-10. Authored, rehearsed on the throwaway and held unarmed; nothing runs until the owner's dispatch names these files (Q2 below) |
| Replaces | the original op, `docs/data-op-anexo-link.md` and its three files, which carry a SUPERSEDED banner, stay on main byte-identical and must not be run. They never ran |
| Ruling, owner, 2026-09-13, paraphrased | (a) a document that a Fisiozero episode row named against ONE specific registo is linked to that registo, pinned and counted, rehearsed first; nothing else is guessed. With it, a linked imported original shows on the ficha's Anexos AND stays on the patient's Documentos tab (the app half, built and merged in #1310) |
| Order | **After DUR-01**, by the owner's order. Not coupled in SQL: the section "The order with DUR-01" says why there is no data dependency to couple |
| Linda-a-Velha | `de000002-0000-0000-0000-000000000001`. The op links in the tenant that owns this row, and no other |
| Castelo Branco | `de000002-0000-0000-0000-000000000002`. R01 refuses unless it sits in the same tenant |
| Runs from | `origin/main`, after this op's PR has merged. The owner freezes merges to main for the sitting. Stage 0 records the sha `origin/main` resolves to in `/tmp/anexo2-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stages 1 and 2 HALT if `origin/main` has moved since (the HEAD CHECK, below) |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/anexo2-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it; stage 2 refuses before it opens or at or after its end; stage 3 refuses at or after its end. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can write it |
| Stage 2's carries | PINNED in the stage 2 block: `anexo_v2_count` 220 and `anexo_v2_digest` `9f36e315c698b99cf95775d48698405d`, the carries of the stage 1 read on production on 2026-09-29 at 01:24 Lisbon, transcript sha256 `cf3306e3fc1d29c39241ca85a3e073a3ebececf342d6965f5a6cc97b5e4c6c35`, the read the owner ruled on. Stage 2 stops unless this sitting's stage 1 prints the same two values, and hands psql the pinned ones |
| Stage 1 | `scripts/data/anexo-link-v2-1-read.sql`, READ ONLY, 12 refusal lines, sha256 `e2ece4302398ea12e9508c391d1f46a07faa7f0cdf94609c693c405afef360dd` |
| Stage 2 | `scripts/data/anexo-link-v2-2-write.sql`, ONE DO block in ONE transaction, sha256 `926d792af095e2034e783415c7f4af318bf3c3b32668c82c3f9ae406472cd3d5` |
| Stage 3 | `scripts/data/anexo-link-v2-3-verify.sql`, READ ONLY, 12 verdicts and a SUMMARY row, sha256 `28fd91982f183d505b482a38e103fbf73e3dec681c13197b83f72ce7571f4e29` |
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
bookings and one `audit_log` row of its own action. This op reads no appointment, and every
refusal and verdict it takes from `audit_log` is keyed on its own two actions (the original
op's and this one's), never on DUR-01's. Two controls count every audit row of the op's
tenant, whatever its action, so a read that could not see that tenant's audit rows prints
VACUOUS rather than OK: the controls of R02 and R03 (stages 1 and 2). Stage 3 needs no such
count: verdict 1 asserts exactly one v2 audit row, so a read blind to `audit_log` reads 0 and
FAILs it. Once DUR-01 has run, DUR-01's audit row is one of the rows those controls count. A
refusal's control only decides whether its line reads VACUOUS or OK, so that row can move
R02's or R03's line from VACUOUS to OK and never to REFUSE; nothing reads DUR-01's action,
id or metadata. The op's sets come from `migration_staging_rows`, `attachments` and
`clinical_records`, none of which DUR-01 writes, and its md5 families cover none of DUR-01's
rows. So DUR-01 having run, or not, changes no refusal and no verdict, and no stage refuses on
it. A coupling in SQL would make this op refuse over a state it cannot see a reason to care
about. The unit test holds every `audit_log` read of every stage to exactly this: keyed on the
op's two actions, or one of those two controls.

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
| Q2 | May GREEN run it at all? The owner ruled the scope on 2026-09-13, before the tiers, and the op is on no ruled Tier C list | **Held.** Nothing runs until the owner rules it onto the Tier C list and his dispatch names these three files and this document's sha256, after DUR-01. Recommended first sitting: stage 0 and stage 1 alone, READ ONLY, so section 2 shows the link set and every class it leaves alone before anyone rules on stage 2. **Ruled since, paraphrased:** onto the Tier C list on 2026-09-27; stage 0 and stage 1 ran alone, READ ONLY, on 2026-09-29, after DUR-01 (written on 2026-09-27, #1445); and on that read, on 2026-09-29, the owner ruled the whole link set linked with nothing excluded, stages 2 and 3 to run in the window GREEN's dispatch names (the section on the write sitting) |
| Q3 | A document named against a registo that exists, and also by a staging row whose registo is not there: link it to the one that exists, or refuse the sitting? | **Linked**, as the original files would have: their inner join dropped the staging row whose registo is gone, so R04 counts only registos that exist. Stage 1 section 2d lists that no_registo pair with `linked_by_another_pair` true, so it shows before stage 2, and the document is then compared as a linked one (`w_fixed`, verdict 5), not as one left alone. A ruling to refuse would count those pairs in R04 |
| D1 | Added: which tenant? | The tenant that owns the Linda-a-Velha row, and R01 refuses unless the Castelo Branco row sits in it. The original files took whatever tenant the candidates were in and refused more than one; here another tenant's named documents are class `other_tenant`, listed, never linked, and compared by md5 |
| D2 | Added: a named file to link that resolves to more than one live document row? | Refuses (R05), whether the other row is unlinked, already on that registo or on another: which row the cell names would be a guess, and a link would show the file twice on one registo or put it on two. A soft-deleted row at the same path does not count: Q1 leaves it alone, and the live row is linked |
| D3 | Added: a staging row whose registo is not there? | Class `no_registo`, listed, and the pair is never written. A document its file names is left alone like every named document outside the link set, recorded in the audit row and compared by md5 (verdict 10), unless another pair names it against a registo that exists: that pair links it, and section 2d marks the no_registo pair `linked_by_another_pair` (Q3). The original files dropped the row silently in an inner join |
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
- **A stage 3 re-issued after the run window's end** stops on the window like any other paste:
  it needs a dispatch whose CLOCK CHECK records a new window for the recorded sha.
- **The run window is checked by machine in every block from stage 1 on,** from the record
  GREEN's CLOCK CHECK writes after stage 0 (`/tmp/anexo2-window.ok`: the recorded sha, then
  the window's opening minute, the last minute stage 1 may start and its end). Stage 1
  refuses to start before the window opens or after its last start minute; stage 2 refuses
  before it opens or at or after its end, before the environment is loaded and before psql;
  stage 3 refuses at or after its end. A missing record, or one written for another sha, is a
  `STOP:` in each. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can
  write it.
- **Stage 2's carries are pinned in its block,** and this sitting's stage 1 must print the
  same two values or stage 2 stops before psql (the section on the write sitting, next).

## The write sitting: the pinned carries, the run window and the apply transcript

**What the owner ruled on.** Stage 1 ran on production on 2026-09-29 at 01:24 Lisbon, READ
ONLY, from this op's held head `e00c7716` (a read-only dispatch of its own, before this PR
merged). Every refusal read `n` 0 and OK, section 2b read `partition holds`, section 2d
listed no pair the op leaves alone, and sections 4b and 5 were empty. Its carries: the link
set's count `anexo_v2_count` 220 and its digest `anexo_v2_digest`
`9f36e315c698b99cf95775d48698405d`. The transcript it wrote, `/tmp/anexo2-stage1.out` on the
apply machine, has sha256 `cf3306e3fc1d29c39241ca85a3e073a3ebececf342d6965f5a6cc97b5e4c6c35`.
On that read the owner ruled on 2026-09-29, paraphrased: link the whole link set it shows,
with nothing excluded.

- **Stage 2 is handed those two values, pinned in its block** as `PINCOUNT` and `PINDIGEST`,
  never read back from a file a sitting can rewrite; the block echoes where they come from,
  with that transcript's sha256. The write sitting still runs stage 0 and stage 1 first, and
  stage 2 still refuses unless stage 1 passed in this sitting, within the hour, on the
  recorded sha. It then parses this sitting's two carries out of stage 1's transcript and
  STOPS, before the environment is loaded and before psql, unless each equals its pin: then
  production moved since the read the owner ruled on, and nothing is written. psql is handed
  the pinned values, and P3 recomputes both inside the transaction and refuses on any
  difference, so a change between this sitting's stage 1 and the write stops it too.
- **The run window.** GREEN's dispatch names it; this document carries no date. The
  dispatch's CLOCK CHECK, pasted after stage 0, records it for the recorded sha, and stages
  1, 2 and 3 each check it by machine (the section on the HEAD CHECK, above).
- **The apply transcript.** The apply is stage 2's psql run. Its whole output is teed to
  `/tmp/anexo2-stage2.out`, which the block reads for its DONE and COMMITTED lines, and to
  `/tmp/anexo2-apply.out`, the file every write sitting's apply output lands in. GREEN
  pastes both raw, never reformatted.
- **Stage 3 marks its pass** in `/tmp/anexo2-stage3.ok` with the recorded sha, only after
  every one of its checks has passed, having removed the mark first, so a stage 3 that halts
  leaves none. The dispatch's closing journal read requires it.
- **No DELETE, DROP or TRUNCATE.** No stage file holds one, and no block runs one.
- **The unit test holds these changes.** Two tests are new: the pinned carries (assigned once,
  named the same in the facts row, in this section and in the block's echo with the
  transcript's sha256, compared before psql, and run under bash on written stage 1
  transcripts, equal, moved and missing), and the run window (stage 0 removes the record, and
  each of stages 1 to 3 runs its window lines under bash with a stand-in clock, inside, at each
  edge, on another sha, with no record and with one that does not parse). The carries test now
  holds psql's arguments to the pinned values, the transcript test holds the apply transcript
  and stage 3's pass mark, and the psql pin holds both tee files. A sweep of 14 seeded wrong
  copies of this document (each check above dropped, loosened or pointed elsewhere) turned a
  test red on every one.
- **The rehearsal of these blocks** at production's position (the journal at 93, and the
  stage 1 result of 2026-09-29 seeded) is its own run, by a lane that did not write them. It is
  recorded on #1458, not here, so this document's sha256 does not move with it.

## STAGE 0: the files, the pins and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/data-op-anexo-link-v2.sha256
SHA1=e2ece4302398ea12e9508c391d1f46a07faa7f0cdf94609c693c405afef360dd
SHA2=926d792af095e2034e783415c7f4af318bf3c3b32668c82c3f9ae406472cd3d5
SHA3=28fd91982f183d505b482a38e103fbf73e3dec681c13197b83f72ce7571f4e29
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/anexo2-main.sha /tmp/anexo2-window.ok /tmp/anexo2-stage1.out /tmp/anexo2-stage1.ok
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
later stage runs from. It removes any earlier run window record: GREEN's CLOCK CHECK, pasted
after it, writes the one stages 1 to 3 read.

## STAGE 1: the read

```
(
set -eo pipefail
SHA1=e2ece4302398ea12e9508c391d1f46a07faa7f0cdf94609c693c405afef360dd
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
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

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/anexo2-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was read"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/anexo2-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/anexo2-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/anexo2-window.ok)
WEND=$(cut -d' ' -f4 /tmp/anexo2-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was read"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was read"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was read"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was read"; exit 1; }

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
equal or the block has already halted. The run window line prints the three recorded times
and now, and the block has already halted if now is before the window opens or past its last
start minute. Section 4 prints 12 refusals, `R01` to `R12`; the
block has already stopped if any reads REFUSE. A refusal that reads `VACUOUS` read an empty
population: that is not a refusal, and the sections above it say which population it was.
Section 2b must read `partition holds`, and the block checks it. Section 4b must be empty.
Section 2 is the link set and every class the op leaves alone; section 2d names each pair it
leaves alone by id, and marks one whose document another pair links (Q3). Section 3 holds the
two carries stage 2 consumes; nobody types them, stage 2 parses them out of the transcript this
block wrote, and stops before psql unless each equals the value pinned in its block (the
section on the write sitting).

## STAGE 2: the write

```
(
set -eo pipefail
SHA2=926d792af095e2034e783415c7f4af318bf3c3b32668c82c3f9ae406472cd3d5
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
PINCOUNT=220
PINDIGEST=9f36e315c698b99cf95775d48698405d

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/anexo2-written.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 2 has ALREADY WRITTEN in this sitting. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
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

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Nothing is written outside it"
test -f /tmp/anexo2-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was written"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/anexo2-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/anexo2-window.ok)
WEND=$(cut -d' ' -f4 /tmp/anexo2-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was written"; exit 1; }
echo "${WOPEN} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was written"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was written"; exit 1; }
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. Nothing was written"; exit 1; }

echo "--- THE PINNED CARRIES: the stage 1 read on production of 2026-09-29 01:24 Lisbon, from the held head e00c7716, transcript /tmp/anexo2-stage1.out as that sitting wrote it, sha256 cf3306e3fc1d29c39241ca85a3e073a3ebececf342d6965f5a6cc97b5e4c6c35, the read the owner ruled on"
echo "pinned:                 anexo_v2_count ${PINCOUNT}, anexo_v2_digest ${PINDIGEST}"
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/anexo2-stage1.out; }
C1=$(carry anexo_v2_count)
C2=$(carry anexo_v2_digest)
echo "this sitting's stage 1: anexo_v2_count ${C1}, anexo_v2_digest ${C2}"
[ -n "${C1}" ] || { echo "STOP: carry anexo_v2_count did not parse out of stage 1's transcript. Nothing was written"; exit 1; }
[ -n "${C2}" ] || { echo "STOP: carry anexo_v2_digest did not parse out of stage 1's transcript. Nothing was written"; exit 1; }
[ "${C1}" = "${PINCOUNT}" ] || { echo "STOP: carry anexo_v2_count reads ${C1} in this sitting's stage 1 and the pin is ${PINCOUNT}. Production moved since the read the owner ruled on. Nothing was written; the sitting stops here"; exit 1; }
[ "${C2}" = "${PINDIGEST}" ] || { echo "STOP: carry anexo_v2_digest reads ${C2} in this sitting's stage 1 and the pin is ${PINDIGEST}. Production moved since the read the owner ruled on. Nothing was written; the sitting stops here"; exit 1; }
ARGS=(-v "anexo_v2_count=${PINCOUNT}" -v "anexo_v2_digest=${PINDIGEST}")
echo "carries: this sitting's stage 1 printed the pinned values, and psql is handed the pinned values"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/anexo2-stage2.out /tmp/anexo2-apply.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off "${ARGS[@]}" -f scripts/data/anexo-link-v2-2-write.sql 2>&1 | tee /tmp/anexo2-stage2.out /tmp/anexo2-apply.out
touch /tmp/anexo2-written.ok
grep -q 'ANEXO LINK V2 STAGE 2 DONE' /tmp/anexo2-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its DONE line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
grep -q 'ANEXO LINK V2 STAGE 2 COMMITTED' /tmp/anexo2-stage2.out || { echo "STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its COMMITTED line is missing. The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and stage 3 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
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
ONLY, runs only on the owner's or the lead's word. The file pins `client_min_messages = notice`,
so a quieter role or database default cannot hide the step lines. The NOTICE lines name each step: `P1` the sets, `P2` each refusal with its control,
`P3` the carries, `P4` the triggers the system did not create (none, or it stops), `P5` the
baselines and the md5 family profile, `W1` the write with its row count, `A` the exact deltas
and every md5 family unchanged, and `ANEXO LINK V2 STAGE 2 DONE`, then `COMMITTED` after the
COMMIT.

**Only exit 0 with the `DONE` and `COMMITTED` lines goes on to stage 3,** and the block then
prints `ANEXO LINK V2 WRITTEN. Paste stage 3 now.` **Every other exit stops the sitting, with
nothing else pasted.** psql exit 3 is every in-database STOP, and nothing was written; an
undefined carry fails before the block, on the `set_config` statement, also with exit 3. A
`STOP:` the block prints exits 1: before psql nothing was written (the HEAD CHECK's, the run
window's and a carry that moved from its pin among them), and after it (the two lines above)
the write stands. Any other exit (psql exits 2 on a lost connection, possibly during the
COMMIT) leaves open whether the write stands. In every case GREEN reports the exit code and the
whole output, and stage 3, READ ONLY, runs only on the owner's or the lead's word; its
verdict 1 answers whether the write stands. R03 refuses a second write regardless.

## STAGE 3: the verify. READ ONLY, re-issuable

```
(
set -eo pipefail
SHA3=28fd91982f183d505b482a38e103fbf73e3dec681c13197b83f72ce7571f4e29
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/anexo2-stage3.ok
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

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/anexo2-window.ok || { echo "STOP: no run window is recorded for this sitting. Stage 3 read nothing, and runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/anexo2-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. Stage 3 read nothing, and runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/anexo2-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. Stage 3 read nothing, and runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. Stage 3 read nothing, and runs only on the owner's or the lead's word"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

rm -f /tmp/anexo2-stage3.out
psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-v2-3-verify.sql 2>&1 | tee /tmp/anexo2-stage3.out
grep -q 'ANEXO LINK V2 STAGE 3 COMPLETE' /tmp/anexo2-stage3.out || { echo "STOP: stage 3 did not print its COMPLETE line"; exit 1; }
grep -qE '^[[:space:]]*99[[:space:]]*\|[[:space:]]*SUMMARY[[:space:]]*\|' /tmp/anexo2-stage3.out || { echo "STOP: stage 3 printed no SUMMARY row"; exit 1; }
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/anexo2-stage3.out && { echo "STOP: a stage 3 verdict read FAIL"; exit 1; }
NV=$(grep -cE '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*(OK|VACUOUS|FAIL)[[:space:]]*$' /tmp/anexo2-stage3.out || true)
[ "${NV}" = 12 ] || { echo "STOP: stage 3 printed ${NV} verdicts, not 12"; exit 1; }
BAD=$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|.*\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/anexo2-stage3.out | sed -E 's/^[[:space:]]*([0-9]+)[[:space:]]*\|.*/\1/' | grep -vxE '10|11' | tr '\n' ' ' || true)
[ -z "${BAD}" ] || { echo "STOP: VACUOUS on ${BAD}, which the op never allows to be vacuous"; exit 1; }
PROFILE=$(grep -E '^[[:space:]]*99[[:space:]]*\|[[:space:]]*SUMMARY[[:space:]]*\|' /tmp/anexo2-stage3.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
echo "${REC}" > /tmp/anexo2-stage3.ok
echo "ANEXO LINK V2 VERIFIED: ${PROFILE}."
)
```

**EXPECT: `verifying from the recorded sha <sha>`, whether main moved, the run window line
with now before its end, no FAIL, 12 verdicts, a SUMMARY row, and VACUOUS only on 10 and
11**, which the block enforces: 10 when no named
document was left alone, 11 when no target registo has an episode. **Never VACUOUS: 1 to 9 and
12.** Each of those compares the link set, which R09 refuses to write empty, so each FAILs on
an empty comparand instead. The block prints the profile; the profile moves with the data,
so no exact profile is asserted for production. After the SUMMARY, stage 3 prints the link set
as it stands, counts only. Only when every check has passed does the block write its pass
mark, the recorded sha, to `/tmp/anexo2-stage3.ok`, which it removed first; the dispatch's
closing journal read requires that mark.

## What every refusal and every verdict means

**Stage 1 section 4 and stage 2 P2, the same 12 lines.** `n` must be 0. `control` is the
population the predicate read, so a 0 that saw nothing prints VACUOUS:

| Code | Refuses when |
|---|---|
| R01 | a clinic row is missing, or the two clinic rows are in different tenants. Its control is the clinic rows found |
| R02 | the original ANEXO LINK write has already run (`attachment.anexo_link.backfill`) |
| R03 | this v2 write has already run (`attachment.anexo_link_v2.backfill`) |
| R04 | a document in the link set is named by more than one registo. Its control is the link set's documents |
| R05 | a named file the link set would link resolves to more than one live document row of the tenant, linked or not (D2); a soft-deleted row at that path does not count. Its control is the paths the link set would link |
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
- `no_registo`: the registo the staging row names is not there (D3). The pair is never written;
  its document can be, by another pair (Q3);
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
`att_rest` (every other attachment, every tenant), `excl` (the named documents left alone: every
named document outside the link set, whatever its class),
`cr_all` and `cr_t` (every clinical record, and the target registos), `ep_all` and `ep_t`
(every episode, and the target registos' episodes), `stg` (every staging row) and `cons`
(every consultation). `w_fixed`, `cr_t`, `cr_all` and `stg` STOP the op when empty, because
R09 guarantees them rows; the others print VACUOUS when empty and still compare, since even an
empty table's md5 changes on the one write it could suffer, a new row.

**Stage 3's 12 verdicts, each able to FAIL:**

1. exactly one v2 audit row. It needs no control: a read blind to `audit_log` reads 0 and FAILs it, and a count of the tenant's audit rows beside it would always include that row;
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

**Stage 3 is re-issuable, and its answers move with the clinic and with the schema.** A later
staff edit can change 5, 6, 10, 11 and 12 honestly: a linked document soft deleted from
Documentos FAILs 5. A later patient merge (`merge_patients`, which writes its own
`patient.merge` audit row) re-points every registo, episode and document of the merged patient
to the surviving patient: when that patient owns a target registo it FAILs 5 and 8, and 11 when
that registo has an episode; when it owns a named document the op left alone it FAILs 10; and it
leaves 6 holding. It is the one update the immutability trigger lets through on a locked
registo. A later migration can FAIL 8, 10 and 11 with no row written at all: their md5s are over
whole rows, so a column added to, dropped from or retyped in `clinical_records`, `attachments`
or `clinical_episodes` moves them. **Verdict 7 never moves honestly, and 8 moves only with a
merge or a migration.** Every target registo is locked (R07), and
`enforce_clinical_record_immutability` (`0001_rls.sql`, relaxed in `0005` for a merge's
`patient_id` alone) refuses every other update of a locked row, a signature included. So a FAIL
on 7, or on 8 with neither a `patient.merge` row for that registo's patient nor a migration that
changed the columns of `clinical_records` since the op, is never a staff edit: the trigger was
bypassed, or the audit row stage 3 reads is not the one stage 2 wrote. Report it as an integrity
breach. Read any other later FAIL against the audit row's time before calling it a defect of the
op.

## Rehearsal

**Every block and every stage file below ran, as committed, at the review round 7 commit
`5c522388`,** on the local throwaway container only. Nothing here has touched production. The
stage files are byte-identical since. The blocks changed on 2026-09-29 for the write sitting
(the run window in stages 1 to 3, the pinned carries and the apply transcript in stage 2, the
pass mark in stage 3, the window record removed by stage 0): the section on the write sitting
says what changed and where the rehearsal of the changed blocks is recorded. The tables below
are the rehearsal at `5c522388`, and the substitution counts are that commit's. The kit
lives in the authoring lane's scratchpad, `b14-rehearsal/` (not committed, as for 0090 to 0093
and STAFF-10 v2), and one runner reproduces every table below.

**Where it ran.** The throwaway container `supabase_db_OsteoJP-solo-rehearsal` (PostgreSQL
17.6, `127.0.0.1:55522`), never an existing database. `b14_base` was built for this op from
main's drizzle migrations, applied in journal order, with the `auth` schema copied schema-only
from the image's own `postgres` database; `b14_fixture` is `b14_base` plus the fixture. Every
arm runs on its own NEW database, `CREATE DATABASE <run> TEMPLATE b14_fixture` (the stage 3
arms on a copy of the written happy-path database), and the runner drops every database it
created, and no other.

| Fingerprint | Value |
|---|---|
| main's migration files: entries, and md5 over the sha256 of every file in journal order | `91 139cb96adcdf063d9c6a8613f77503a8`, the files `b14_base` was built from, equal to the clone of the commit under test (MATCH) |
| public tables / policies | 48 / 95, equal to the STAFF-10 v2 rehearsal's schema copy, column for column |

**The fixture is synthetic.** No real patient data; the two clinic ids are production's (already
on main), every other id starts `a0e1`. Two tenants: the op's (it owns both clinic rows) and
another. It carries every shape the op meets: a registo naming one file (link); a registo whose
cell names three files with a comma, a semicolon, a no-break space and a tab, one name with an
inner space (link, all three); a cell naming one file twice (one link); a document already on its
registo (already_linked); a document on another registo of the same patient (linked_elsewhere);
a soft-deleted document (soft_deleted); a named file with no document row (no_document); a staging
row whose registo is not there (no_registo); a staging row that never became a registo, an empty
cell and an attachment ledger row (none read as cells); the other tenant's named document
(other_tenant); an imported original no cell names; a staff upload on a registo and a staff
patient document; a staff draft registo; a consultation recording key; and one unrelated audit
row. Each refusal adds its own shape by an arm, so the other arms keep theirs.

| File, in the authoring lane's scratchpad | sha256 |
|---|---|
| `b14-rehearsal/build-base.zsh` | `973273163578626d2410752243a4968127de40cfdf0b6229ac77f0b3f72dd99f` |
| `b14-rehearsal/fixture.sql` | `15b83bd9990f5d289317cdf88dfd17199cd3072963c6d6381fc591897649d591` |
| `b14-rehearsal/arms/*.sql`, one mutation per arm, concatenated in name order | `19456b31651c0d05aa380eb58e43824e254a89fcf0414a345a696b99ea5ff673` |
| `b14-rehearsal/run-anexo2-arms.zsh`, the runner | `71c045df6e668aaafbb1b605dbfdebbe679c44a1495628af2a4ac90d7e337aba` |
| `b14-rehearsal/extract-stage.mjs`, the STAFF-10 v2 kit's extractor, unchanged but its header | `241840aed7091688976a019c4eab6cc687ce291e0ca8c9a6e573b2512cbcce7c` |
| `b14-rehearsal/prove-red.mjs`, the seeded wrong copies of the unit test | `2dde4c28c4e57107aad6b51be2622017ee56bee76986348d51201fef59d59c38` |
| `b14-rehearsal/smuggle.mjs`, the review round 6 copies of stage 2 | `8a1d781334c737090c4a78f51b4e32188046018c7bad0a2cc3706ba93c68eee5` |

**How it ran.** Each block was extracted from this document at the commit under test (cloned
from a local bare origin whose `main` is that commit; the clone's origin is asserted to be it
before any block runs) and run under `zsh -f`; the happy path ran as an interactive paste,
`zsh -f -i < block`. Exactly four substitutions, each counted per block: `/tmp/` to a scratch
directory, the `cd` line to the clone, the env line to `export DATABASE_URL_DIRECT=${ANEXO2_DBURL}`
(each arm sets it to its own database), and the target guard's invocation to an `echo`. The
extractor refuses a block that still names production.

| Substitution | stage 0 | stage 1 | stage 2 | stage 3 |
|---|---|---|---|---|
| `/tmp/` | 6 | 11 | 13 | 10 |
| `cd` | 1 | 1 | 1 | 1 |
| env | 0 | 1 | 1 | 1 |
| guard | 0 | 1 | 1 | 1 |

**The happy path, pasted interactively:**

| Arm | Exit | What it printed |
|---|---|---|
| stage 0 | 0 | the sidecar `OK`, `running from origin/main <the commit under test>`, `ANEXO LINK V2 FILES VERIFIED` |
| stage 1 | 0 | every refusal OK, none VACUOUS; `partition holds`; classes link, already_linked, linked_elsewhere, soft_deleted, no_document, no_registo and other_tenant each present; the count carry `5` and its digest |
| stage 2 | 0 | P3 both carries match; P4 no trigger the system did not create; P5 every md5 family OK, none empty; W1 linked the link set exactly; A the deltas exact and every family unchanged; `DONE`, `COMMITTED` |
| stage 3 | 0 | `12 OK / 0 VACUOUS / 0 FAIL` |
| database after | | the five link pairs carry their registos; every other attachment row unchanged by md5; `clinical_records` unchanged by md5; the soft-deleted document still unlinked and deleted; the other tenant's document still unlinked; one v2 audit row, whose undo record is the five link pairs with their count and the three registos, and which lists every left-alone document by class, the soft-deleted one under `soft_deleted`, the classes holding exactly the ids verdict 10 reads, the no_registo class's document among them |
| stage 0, then 1, then 2 again | 1, 1, 1 | `STOP: stage 2 has ALREADY WRITTEN in this sitting` |
| stage 1 with the markers removed | 1 | REFUSE on R03 and R09 (its consequence: nothing is left to link) |
| stage 2 with its mark forced | 3 | `STOP: R03 refuses`; still one audit row, the database unchanged by md5, no written marker |
| stage 3 after main moved | 0 | `MAIN MOVED since stage 0` with both shas, `12 OK / 0 VACUOUS / 0 FAIL` |

**Every refusal, run for real.** For each arm: a new database, one mutation, stage 1 (must exit 1
with REFUSE on the code), then the stage 1 mark forced so stage 2's SQL is reached (must exit 3,
`STOP: <code> refuses`), then the database compared with its state after the mutation by one md5
over attachments, audit rows, clinical records, episodes, staging rows and consultations, and
the written marker checked absent. The last row is the shape R05 must let through, run as a
sitting: stage 1 and stage 2 exit 0.

| Code | Mutation | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|---|
| R01 | the Castelo Branco row moved to the other tenant | 1 | R01 | 3, STOP R01 | unchanged; no written marker |
| R02 | the original op's audit row | 1 | R02 | 3, STOP R02 | unchanged; no written marker |
| R03 | a v2 audit row | 1 | R03 | 3, STOP R03 | unchanged; no written marker |
| R04 | a second locked registo of patient 1 whose cell names exame-1.pdf too | 1 | R04 | 3, STOP R04 | unchanged; no written marker |
| R05 | a second live, unlinked document row at exame-1.pdf's path | 1 | R05 | 3, STOP R05 | unchanged; no written marker |
| R05 | a second live row at exame-1.pdf's path, already on the registo that names it, so a link would show the file twice there | 1 | R05 | 3, STOP R05 | unchanged; no written marker |
| R05 | a second live row at exame-1.pdf's path, on another registo of the same patient, so a link would put the file on two registos | 1 | R05 | 3, STOP R05 | unchanged; no written marker |
| R06 | exame-1.pdf belongs to patient 2, its registo to patient 1 | 1 | R06 | 3, STOP R06 | unchanged; no written marker |
| R06 | exame-1.pdf has no patient at all | 1 | R06 | 3, STOP R06 | unchanged; no written marker |
| R07 | a DRAFT registo of patient 1 whose staging row names a file with a live document | 1 | R07 | 3, STOP R07 | unchanged; no written marker |
| R08 | a staging row of this tenant names the OTHER tenant's registo; the document carries that registo's patient, so R06 stays quiet | 1 | R08 | 3, STOP R08 | unchanged; no written marker |
| R09 | every link done by hand already, so the link set is empty | 1 | R09 | 3, STOP R09 | unchanged; no written marker |
| R12 | a no-op AFTER UPDATE trigger the system did not create, on attachments | 1 | R12 | 3, STOP R12 | unchanged; no written marker |
| R12 | the same, on audit_log | 1 | R12 | 3, STOP R12 | unchanged; no written marker |
| R05 | a second row at exame-1.pdf's path that staff soft deleted, which Q1 leaves alone: not a refusal | 0 | none | 0, `COMMITTED` | the live row linked, the soft-deleted twin still unlinked and deleted |

**The file-name read and the partition, proved on seeded wrong copies.** Each copy differs from
its file by one line, the same line in stage 1 and stage 2, and runs through this document's own
block with only its SQL file and that file's pin swapped (the pin once, the path three times,
both counted), so the block's own checks decide the exit.

| Copy | stage 1 | REFUSE on | stage 2 | database after |
|---|---|---|---|---|
| the soft-deleted class no longer requires a soft delete, so it overlaps the link class | 1 | R10 | 3, STOP R10 | unchanged |
| the no-break space left out of `ws` | 1 | R11 | 3, STOP R11 | unchanged |
| the cell split on a comma only | 1 | R11 | 3, STOP R11 | unchanged |
| the file name trimmed with `btrim`'s default, as the original files did | 1 | R11 | 3, STOP R11 | unchanged |

**The head, the pins, the carries, the clock and the one transaction:**

| Arm | Exit | Halted on, or printed | Database after |
|---|---|---|---|
| stage 0 | 0 | `ANEXO LINK V2 FILES VERIFIED`; the recorded sha is the simulated main | untouched |
| stage 0 on a dirty worktree | 1 | `STOP: the apply worktree is not clean` | untouched |
| stage 0 when main carries a stage file that is not its pin | 1 | `STOP: stage 1 on disk is not the approved file` | untouched; no sha recorded |
| stage 0 when main carries a changed document | 1 | `STOP: this document is not the approved one` | untouched |
| stage 0 when main carries a changed target guard | 1 | `STOP: the target guard on disk is not the approved file` | untouched |
| stage 1 after main moved since stage 0 | 1 | `STOP: main moved since stage 0, the merge freeze was broken` | untouched: no psql ran |
| stage 2 after main moved since stage 1 | 1 | `STOP: main moved since stage 0, the merge freeze was broken` | untouched: no psql ran |
| stage 2 before stage 1 | 1 | `STOP: stage 1 did not pass in this sitting, or passed over an hour ago` | untouched |
| stage 2 with stage 1's mark on another sha | 1 | `STOP: stage 1 did not pass on the recorded sha` | untouched |
| stage 1 with a pinned file edited in the worktree after stage 0 | 1 | `STOP: the apply worktree is not clean` | untouched |
| stage 0 with the written marker present | 1 | `STOP: stage 2 has ALREADY WRITTEN in this sitting` | untouched; the recorded sha survives |
| stage 1 with no recorded sha | 1 | `STOP: stage 0 recorded no sha in this sitting` | untouched |
| stage 3 with no recorded sha | 1 | `STOP: stage 0 recorded no sha in this sitting, and stage 3 runs only from the recorded sha` | untouched |
| stage 2 with the digest altered in stage 1's transcript | 3 | `STOP: carry anexo_v2_digest reads f13e23ec149eace862661dc043528db1 now and stage 1 printed ffffffffffffffffffffffffffffffff` | unchanged |
| stage 2 with stage 1's transcript backdated 61 minutes | 1 | `STOP: stage 1's transcript is over an hour old; it is not this sitting's` | unchanged |
| stage 2 with stage 1's mark removed | 1 | `STOP: stage 1 did not pass in this sitting, or passed over an hour ago` | unchanged |
| the SQL of stage 2 run directly with no carry | 3 | a syntax error on the `set_config` statement, before the block | unchanged |
| stage 2 after a named document was added between stage 1 and stage 2 | 3 | `STOP: carry anexo_v2_count reads 6 now and stage 1 printed 5` | unchanged |
| stage 2 after one document of the set was soft deleted and another added, the count kept | 3 | `STOP: carry anexo_v2_digest reads 6b5bcd0bfbf2e01a07723b2cb2179b88 now and stage 1 printed f13e23ec149eace862661dc043528db1` | unchanged: the digest, not the count, caught it |
| stage 2 with a trap that fails the audit insert, the last step after the write (a `NOT VALID` CHECK on `audit_log`) | 3 | the `W1` notice, then `violates check constraint` | **unchanged**: the write rolled back, no audit row |
| stages 1 and 2 on a database whose default hides NOTICEs | 0 | every step line and `DONE`, because the file pins `client_min_messages` | written once |
| a write inside the READ ONLY transaction stages 1 and 3 use | 1 | `cannot execute UPDATE in a read-only transaction` | unchanged |

**Stage 3 after a real write,** each mutation on its own copy of the written happy-path database:

| Mutation after the write | Exit | FAIL on | Profile |
|---|---|---|---|
| one linked document unlinked by hand | 1 | 3, 4, 6 | `9 OK / 0 VACUOUS / 3 FAIL` |
| a linked document renamed | 1 | 5 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a linked document moved to another patient | 1 | 5, 6 | `10 OK / 0 VACUOUS / 2 FAIL` |
| an imported original the op did not name, linked by hand | 1 | 9 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a document the op left alone, edited | 1 | 10 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a target registo's episode retitled | 1 | 11 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a second v2 audit row | 1 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | `0 OK / 0 VACUOUS / 12 FAIL` |
| the original op's audit row | 1 | 2 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a linked document soft deleted from Documentos | 1 | 5 | `11 OK / 0 VACUOUS / 1 FAIL` |
| patient 1 merged into patient 9 by merge_patients, the one update the immutability trigger lets through on a locked registo | 1 | 5, 8, 11 | `9 OK / 0 VACUOUS / 3 FAIL` |
| the document the op left alone because the registo its staging row names is not there (no_registo), renamed and retyped | 1 | 10 | `11 OK / 0 VACUOUS / 1 FAIL` |
| patient 5, who owns a named document the op left alone (linked_elsewhere) and no target registo, merged into patient 9 by merge_patients, which re-points every document of the merged patient | 1 | 10 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a migration adds a column to clinical_records, and no row is written | 1 | 8 | `11 OK / 0 VACUOUS / 1 FAIL` |
| a migration adds a column to attachments and one to clinical_episodes, and no row is written | 1 | 10, 11 | `10 OK / 0 VACUOUS / 2 FAIL` |
| a target registo signed, which the immutability trigger refuses: its UPDATE exits 3, the database unchanged | 0 | none | `12 OK / 0 VACUOUS / 0 FAIL` |
| none: a fresh copy of the written database | 0 | none | `12 OK / 0 VACUOUS / 0 FAIL` |
| a copy of stage 3 whose less-one digest drops nothing (verdict 4's control made blind) | 1 | 4 | |
| stage 3 read as a role row-level security blinds (`authenticated`, no JWT claims), so it sees no audit row and no document: verdict 1 FAILs, with no control | 1 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | `0 OK / 0 VACUOUS / 12 FAIL` |
| before the op: no named document left alone, no episode on a target registo; stages 1, 2 and 3 all exit 0 | 0 | none; VACUOUS on 10 and 11, which the block allows | `10 OK / 2 VACUOUS / 0 FAIL` |

**Review round 5, run for real.** The shape Q3 asks about, a link set whose count carry reads
99, and the halts the blocks owe to their own `set -eo pipefail`, `-v ON_ERROR_STOP=1` and target
guard. A row that says "a copy" runs this document's own block with that one line taken out:
its exit is the defect the unit test now holds off, not the op's.

| Arm | Exit | What it printed | Database after |
|---|---|---|---|
| Q3: exame-1.pdf also named by a staging row whose registo is not there; stage 1 | 0 | no REFUSE; section 2d lists that no_registo pair with `linked_by_another_pair` true, and every other pair false | untouched |
| Q3, stage 2 | 0 | `COMMITTED` | exame-1.pdf carries the registo that exists; the audit row records it among the linked pairs, not among the left-alone ids |
| Q3, stage 3 | 0 | `12 OK / 0 VACUOUS / 0 FAIL` | |
| a link set whose count carry reads 99: stages 1, 2 and 3 | 0, 0, 0 | the FOR THE RECORD row reads `99 \| 99 \| 0`, and the block's last line is `ANEXO LINK V2 VERIFIED: 12 OK / 0 VACUOUS / 0 FAIL.` | written once |
| the same, a copy of stage 3 whose SUMMARY row is dropped (`HAVING false`) | 1 | `STOP: stage 3 printed no SUMMARY row`, though the FOR THE RECORD row begins with 99 | |
| stage 2 on a database where R03 refuses, as committed | 3 | `STOP: R03 refuses`; no written marker | unchanged |
| the same, a copy of the block without `set -eo pipefail` | 1 | `STOP: R03 refuses`, then `THE WRITE STANDS`; the written marker touched over a write that never ran | unchanged |
| the same, a copy of the block without `-v ON_ERROR_STOP=1` | 1 | `STOP: R03 refuses`, then `COMMITTED` and `THE WRITE STANDS`: psql ran on past the refusal and exited 0; the written marker touched | unchanged |
| stage 1 with its target guard failing, as committed | 1 | nothing after the guard: no psql ran, no stage 1 mark | untouched |
| the same, a copy of the block without `set -eo pipefail` | 0 | `STAGE 1 READ, NO REFUSAL`: it read the database and marked its pass past a failing guard | untouched |

**Review round 6, run for real.** Each check stage 2 makes after the write, made to fire. A copy of
stage 2 carries one write more inside its block, right after W1, and runs through this
document's own stage 2 block with only its file and that file's pin swapped: the checks as
committed stop every one after the `W1` notice, with exit 3, the database unchanged and no
written marker. The review copy is that copy with the one check that stops it made to compare
nothing, as review round 6's seeded copies did: its exit is the defect the unit test's new pins
hold off, not the op's. The digest check has no row: it reads the rows the check before it
reads, each linked document's registo, and that check stops any write that would move the
digest first.

| One write more, after W1 | The checks as committed | The review copy | Its exit | Database after the review copy |
|---|---|---|---|---|
| every consultation's recording key changed | 3, `STOP: consultations changed` | the consultations recomputation replaced by its own baseline | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | the recording key changed, committed with the v2 audit row |
| a staging row the op never reads changed | 3, `STOP: migration_staging_rows changed` | the staging rows recomputation replaced by its own baseline | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | the staging row changed, committed with the v2 audit row |
| the other tenant's episode retitled | 3, `STOP: clinical_episodes changed` | the recomputation over every episode replaced by its own baseline | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | the episode retitled, committed with the v2 audit row |
| the staff draft registo's data changed | 3, `STOP: clinical_records changed` | the recomputation over every registo replaced by its own baseline | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | the draft's data changed, committed with the v2 audit row |
| the staff patient document renamed | 3, `STOP: an attachment outside the link set changed` | the recomputation over every other attachment replaced by its own baseline | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | the staff document renamed, committed with the v2 audit row |
| every document the op leaves alone renamed | 3, `STOP: an attachment outside the link set changed` | the recomputation over the left-alone documents replaced by its own baseline | 3, `STOP: an attachment outside the link set changed`: the recomputation over every other attachment, beside it in the same check, still caught it | unchanged, no written marker |
| every linked document renamed | 3, `STOP: a linked document changed in a column this op does not write` | the `w_fixed` check disarmed with `AND false` | 0, `COMMITTED`, then `ANEXO LINK V2 WRITTEN` | every linked document renamed, committed with the v2 audit row |
| the staff patient document's patient cleared | 3, `STOP: the documents with a patient moved 13 -> 12` | the linked, unlinked and with-patient counts after the write taken from the baselines | 3, `STOP: an attachment outside the link set changed`: a later check, the recomputation over every other attachment, still caught it | unchanged, no written marker |
| an imported original already on its registo unlinked, and one no cell names linked, so every count holds | 3, `STOP: 1 imported original(s) carry a registo that neither this op nor anything before it gave them` | `v_pre` taken over every imported original, linked or not | 3, `STOP: an attachment outside the link set changed`: a later check, the recomputation over every other attachment, still caught it | unchanged, no written marker |

**Review round 7, run for real.** The review's three copies of stage 2, each with one value of
the audit row changed, run through this document's own stage 2 block with only its file and
that file's pin swapped, then stage 3 through its own block. Each commits the link itself
exactly as the op does, with the wrong record beside it: its exit is the defect the unit test's
new pins hold off, not the op's. The file as committed records what the happy path above
checks.

| The review's copy of stage 2 | Stages 1 and 2 | The audit row it committed | Stage 3 | FAIL on | Profile |
|---|---|---|---|---|---|
| `'pairs', v_lnk - 0`: the undo record less its first pair (the review's copy a) | 0, 0, `COMMITTED` | four pairs recorded for the five documents the op linked, so an undo from it would leave the first one on its registo | 1 | 3, 4, 5, 6, 9, 12 | `6 OK / 0 VACUOUS / 6 FAIL` |
| `'excluded', '{}'::jsonb`: no left-alone document by class (the review's copy b) | 0, 0, `COMMITTED` | `excluded` empty, so Q1's `excluded.soft_deleted` names nothing, while `excluded_ids` still lists all five left-alone documents, the soft-deleted one among them | 0 | none | `12 OK / 0 VACUOUS / 0 FAIL` |
| `'linked_count', cardinality(v_regs)`: the registos counted as the linked documents (the review's copy c) | 0, 0, `COMMITTED` | `linked_count` three, beside five pairs recorded | 1 | 3, 5, 6, 12 | `8 OK / 0 VACUOUS / 4 FAIL` |

**The original files, on the same fixture** (never on production), run directly with their own
carries. This is the evidence for the section "What changed from the original op, and why":

| Arm | Exit | What it printed |
|---|---|---|
| original stage 2 on the whole fixture | 3 | `STOP: the candidate set spans 2 tenants; this block links one tenant at a time` |
| original stage 2, one tenant, the cell naming one file twice kept | 3 | `STOP: linked` one row fewer than it counted: the name the cell carries twice was counted twice and updated once |
| original stage 2, that cell cut to one name | 0 | `ANEXO LINK STAGE 2 DONE` |
| after O3 | | the soft-deleted document linked: true; the two names after a no-break space and a tab linked: 0 of 2 |

**The unit test, proved red.** `scripts/anexo-link-v2-data-op.test.mjs` passes on this commit,
and `prove-red.mjs` ran it against 228 seeded wrong copies of the committed tree, each
re-pinned so only its target property is wrong: every copy turned its target test red, and the
green controls (the three forbidden statement words only inside comments, a string and an echo; an
assignment to a guarded or a recorded name only inside a comment and a string; a comment inside
the audit row and a value set further from its key; a heading of this document quoted in its
prose) kept every test green. Every test has at least one copy.

**What the rehearsal caught.** The first full run passed every arm but one check: the R08 arm's
document also belonged to another patient than its registo, so stage 2 stopped on R06, the
lower code, before reaching R08. That was the arm's shape, not the op's; the arm now gives the
document that registo's patient, and stage 2 stops on R08. The seeded wrong copies caught one
pin too loose: the stale-carry test matched `-mmin -600` as `-mmin -60`, so a stage 1 mark ten
hours old would have passed it; the pin now ends at the number. And the whitespace JavaScript's
trim strips had been written into the first commit as literal invisible characters; every one is
an escape inside an E-string now, and no byte this op adds is outside ASCII.

**What review round 1 caught,** each fixed in that round. Two unit
test pins could not fail: P4's slice began at R12's read of the same catalog inside the SETS
block, and three of stage 2's checks after the write (each document's registo, the audit row
written once, its time) had no pin; both now have seeded wrong copies. R05 was narrower than
D2: it counted only the link set, so a second live row already on the registo, or on another,
let the link through; the two new R05 arms above now refuse, and the soft-deleted twin still
links. And two sentences of this document were false: the DUR-01 section said the op reads
`audit_log` only by its own two actions, and three tenant-wide controls read every row; the
re-issuable paragraph said a signed registo FAILs 7 and 8, and the immutability trigger refuses
the signature, as the stage 3 arms above show.

**What review round 2 caught,** each fixed in that round. `excl`, the named documents the op
leaves alone, named four classes and left out `no_registo`: a document named by a registo that
is not there was listed by stage 1 and left alone, but neither recorded in the audit row nor
compared by verdict 10. It is now every named document outside the link set, whatever its class:
the happy path above checks the audit row records that document, and the stage 3 arm that edits
it FAILs 10. Two unit test pins on stage 2's write read only the first SET column, so a second
column on a continuation line passed both; the test now reads the whole SET list. And the
re-issuable paragraph called a FAIL on 8 with no merge an integrity breach, though a migration
moves 8, 10 and 11 with no row written, as the two arms above that add a column show; it now
says so, and that a merge re-pointing a document the op left alone FAILs 10.

**What review round 3 caught,** each fixed in that round; no stage file changed. Four
properties had no pin that could fail: stage 2's one comparison of each carry stage 1 printed
with the one it recomputes (P3); what each stage 3 verdict compares, its CASE and the reads
behind it; the predicates of R01, R08 and R09; and the rule that no byte this op adds is outside
ASCII. The unit test now pins P3 whole, every verdict's CASE and every read it
compares, every refusal's `n` and control, and every byte of the files this op adds. The
review's seeded copies, and their siblings, each stayed green on the commit before and turned
their target test red on that one.

**What review round 4 caught,** each fixed in that round. Two properties
had no pin: the clean-worktree check of stages 0 to 2, and the original document's text below
its banner; nor had four checks the blocks make: stage 3's FAIL halt, stage 1's REFUSE halt,
its `partition holds` check, and the COMPLETE and sidecar checks of stages 1 to 3. The unit test
now runs every block's checks after psql under bash, on transcripts it writes, so a grep for a
word the SQL never prints halts nothing and goes red; it pins the clean-worktree and sidecar
checks in place, and holds the original document, less its banner, to its sha256 on main before
this op. The halt rule was STAFF-10 v2's superseded wording: it is now the rule STAFF-10 v2
states since the owner's ruling of 2026-09-26, word for word but for this op's own onward line,
and every STOP after the write ends on the owner's or the lead's word. And verdict 1's control,
the count of its tenant's audit rows, could never decide it, because the v2 row is one of them;
of the three tenant-wide controls review round 1 named, two remain. Verdict 1 now asserts
exactly one v2 row and nothing else, with a comment the only change to a stage file; the stage 3
arm above that reads as a role row-level security blinds FAILs it, with no control. The
review's seeded copies, and their siblings, each stayed green on the commit before and turned
their target test red on that one.

**What review round 5 caught,** each fixed in that round. Nothing pinned
what makes the blocks halt: the `set -eo pipefail` that opens each block and the
`-v ON_ERROR_STOP=1` on each psql line. The unit test's block checks supplied a
`set -eo pipefail` of their own and never ran psql, so they passed with either line gone; the
round 5 table above shows what each copy does to a sitting. The unit test now runs each block
from its own head, with stand-ins for the target guard and for psql that stop at an ERROR with
exit 3 only under `ON_ERROR_STOP`, and pins both lines, `-X`, and the guard before psql.
Stage 1's REFUSE halt reads a `verdict` in the last column only, and nothing tied that to
section 4's SELECT: the unit test now prints section 4 in the column order the SQL gives, and
stage 3's rows the same way. A document named by a no_registo pair and linked by another pair
was listed under section 2d's promise that no stage changes it: section 2d now marks such a
pair `linked_by_another_pair`, its header states the exception, D3 says so, and Q3 asks the
owner whether it should refuse instead; the default built is the original files' reading, which
links it. And stage 3's SUMMARY check matched any row whose first column read 99, the FOR THE
RECORD row included once the link set holds that many: the check and the profile read now
anchor on the SUMMARY label, and the round 5 arm whose count carry reads 99 shows both. The
seeded copies of the first two findings, and their siblings, stayed green on the commit before
and turned their target test red on that one; that round's unit test, run on the commit before
it, went red on exactly the tests of the last two.

**What review round 6 caught,** each fixed in that round; no stage file
changed. Two properties had no pin that could fail. The unit test pinned only the IF lines of
stage 2's checks after the write, not the reads they compare: a recomputation replaced by its
own baseline, the `w_fixed` check disarmed with `AND false`, the counts after the write taken
from arithmetic on the baselines, the digest taken from the plan instead of the rows as
written, or `v_pre` widened, each kept every IF line and stayed green. The unit test now pins
P5's baselines, `v_pre` among them, and section A's reads and checks whole, holds P5 before the
write and section A after it, refuses any other assignment to a baseline, an after-read,
`v_pre` or the digest, and holds the audit row to record `v_pre` as `prelinked_ids`; the round 6
table above shows each of those checks stopping a write for real, and what the review copy of
it lets through. And nothing pinned the rule that no public byte quotes an owner ruling: the
unit test now holds the facts table's Ruling row, the headers of stages 1 and 2 and the owner
questions to their paraphrased label, refuses a phrase that presents words as the owner's, and
names every double-quoted span of this document's prose and of the stage files' comments as
what it is. The review's seeded copies stayed green on the commit before, and so did their
siblings but two an older pin already caught (the total after the write taken from its baseline,
and the digest read with its own text gone); every one turned its target test red on that one.

**What review round 7 caught,** fixed on the commit that carries this section; no stage file
changed. The audit row is the op's only undo record (the section "Undoing it") and the record
Q1 cites for the left-alone documents by class, and nothing pinned its values: the unit test
asked only that each key stage 3 reads be in stage 2's text, and stage 2 reads none of the
values back before COMMIT. The pairs less one, `excluded` emptied, or the registos counted as
the linked documents each kept every test green; the round 7 table above shows what each
commits, and the one that empties `excluded` reads all OK, because no stage reads it. The unit
test now pins the INSERT whole, every value in it, and the set read behind it (the pairs, the
registos, the left-alone documents by class and by id, and the carries); holds its card to the
document's; and holds every variable the audit row records to one assignment in one DECLARE,
so no later `:=`, `SELECT INTO`, subscript, loop or inner block can change what it writes.
The review's seeded copies, and their siblings, each stayed green on the commit before and turn
their target test red on this one.

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
- **It guesses nothing.** A document named by two registos, a file with two live document
  rows, a patient mismatch, a registo that is not locked or one in another tenant each refuse
  the whole sitting. A document also named against a registo that is not there is linked to
  the one that is, as the original files would have; Q3 asks the owner whether it should refuse.
- **It sends nothing** and writes no staff notification.
- **No stage file holds a DELETE, DROP or TRUNCATE statement.**
