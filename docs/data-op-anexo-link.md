# Anexo link: the imported documents that name a registo get linked to it

**Status: NOT RUN.** A DATA operation, not a migration: no schema change, no
journal entry, no `drizzle-kit`. Three files, two pasted blocks. Every command is
literal; there is nothing to substitute. Any `STOP:` line, any `FAIL` verdict or
any `ERROR` halts the sitting.

**Authored by PURPLE. Run by GREEN.** Author and applier are different lanes
(SR-63); PURPLE has run every byte below against a throwaway database and against
nothing else.

| Fact | Value |
|---|---|
| Card | `INC-imported-fichas-sem-anexos-originals-are-patient-level`, ruling (a) |
| Stage 1 | `scripts/data/anexo-link-1-preview.sql`, sha256 `e364d6389dd309834f77704809644b928130d6231fe5856342e84e65dd778376` |
| Stage 2 | `scripts/data/anexo-link-2-apply.sql`, sha256 `7209040af768f0466b7881ba51aeb37b04817dd51bd8b11ec6bb2a9ae3953f1a` |
| Post-check | `scripts/data/anexo-link-3-postcheck.sql`, sha256 `fc156c8a8ed2cba75db3e6a01116c31075883dbfae864bab8507d107190109c1` |
| Pin | `origin/main`. All three files merge first, by their own PR |
| What stage 1 writes | **nothing.** It is a read |
| What stage 2 writes | `attachments.clinical_record_id` on exactly N rows, plus ONE `audit_log` row (`attachment.anexo_link.backfill`) carrying every linked id |
| What neither touches | `clinical_records` (P8 proves it), `clinical_episodes`, Storage objects, `attachments.patient_id`, and every document the delivery never named |

## What it fixes, in one paragraph

The Fisiozero import uploaded every original file. The adapter's dedupe rule
("documentos.csv is the richest source, it wins on a filename already seen")
then deleted each registo-linked entry and re-added the file with a PATIENT and
no registo. So every imported ficha reads **Sem anexos** by construction, and the
originals sit on the patient's Documentos tab instead. For the documents an
episode row named against ONE specific registo, the link is deterministic and
this operation restores it. For the rest it is a guess, and nothing here guesses.

## The numbers are MEASURED, and the card's are history

The card records 954 / 883 / 220 from September. **Those appear nowhere in these
three files.** Production has moved since (1,181 attachments, all patient-level,
read 2026-09-17), and a count copied from a card into a production block is the
hazard SR-59 exists for. Stage 1 measures what is actually there and prints it;
stage 2 is handed those values and refuses if they have moved; the post-check
reads them back out of stage 2's own audit row and recomputes them. No number
passes through a human hand at any point.

**The digest is the load-bearing carry, not the count.** A count cannot tell "the
same 220" from "220 of which one is different": a document uploaded between the
two commands keeps the total and changes the membership. The digest is md5 over
the ordered (attachment, registo) pairs, so any substitution halts the sitting.

## Why a link is safe to make in SQL

`attachments` carries **no trigger** (checked across every migration). The
immutability trigger is `BEFORE UPDATE OR DELETE ON public.clinical_records`, and
this operation writes one column on `attachments` and nothing else, so it cannot
fire. That is asserted rather than promised: stage 2 records
`count(*)` and `max(updated_at)` on `clinical_records` before the update and
re-reads both after, inside the same transaction, and HALTS if either moved.

**A declared exception, stated plainly:** the app refuses adding an attachment to
a registo that is not a draft (`confirmAttachment` returns `finalized`), and every
imported registo is locked. This backfill does in the database what that screen
refuses, deliberately, for imported history only. That is exactly why stage 2
refuses a target registo which is NOT locked: a draft is one somebody is still
editing, and it belongs to the screen's rule, not to this one.

## The pin is the CONTENT, not a commit sha

Each block fetches, re-checks out `origin/main` detached, and asserts the sha256
of every file it runs (SR-58). A rebase that leaves these files unchanged
proceeds; one changed byte halts. The three files must be on `origin/main` before
the sitting: they are delivered by their own PR, which merges first (SR-61).

## STAGE 1: the preview. It writes nothing.

```
(
set -eo pipefail
SHA1=e364d6389dd309834f77704809644b928130d6231fe5856342e84e65dd778376

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/anexo-preview.out

STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
echo "running from ${PIN}"
git checkout -q --detach ${PIN}

test -f scripts/data/anexo-link-1-preview.sql || { echo "STOP: stage 1 is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-1-preview.sql | cut -d' ' -f1)" = "${SHA1}" ] || { echo "STOP: stage 1 on disk is not the approved file"; exit 1; }

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-1-preview.sql 2>&1 | tee /tmp/anexo-preview.out
echo "ANEXO PREVIEW DONE. Read section 2 before going on."
)
```

**Read the output before pasting stage 2.** Section 2 lists four refusals: the
first three must read **0** or stage 2 will stop, and the fourth and fifth are
reports, not refusals. Section 1 holds the two carries stage 2 consumes; you do
not type them anywhere, stage 2 parses them out of the transcript this block
wrote.

## STAGE 2: the link, then the post-check

```
(
set -eo pipefail
SHA2=7209040af768f0466b7881ba51aeb37b04817dd51bd8b11ec6bb2a9ae3953f1a
SHA3=fc156c8a8ed2cba75db3e6a01116c31075883dbfae864bab8507d107190109c1

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/anexo-apply.out /tmp/anexo-postcheck.out

test -f /tmp/anexo-preview.out || { echo "STOP: stage 1 left no transcript; re-run stage 1"; exit 1; }
[ -n "$(find /tmp/anexo-preview.out -mmin -60)" ] || { echo "STOP: stage 1 transcript is over an hour old; it is not this sitting's"; exit 1; }

git fetch origin --prune
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}

test -f scripts/data/anexo-link-2-apply.sql || { echo "STOP: stage 2 is not on disk"; exit 1; }
test -f scripts/data/anexo-link-3-postcheck.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-2-apply.sql | cut -d' ' -f1)" = "${SHA2}" ] || { echo "STOP: stage 2 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/data/anexo-link-3-postcheck.sql | cut -d' ' -f1)" = "${SHA3}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }

carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/anexo-preview.out; }
CNT=$(carry anexo_expected_count)
DIG=$(carry anexo_expected_digest)
[ -n "${CNT}" ] && [ -n "${DIG}" ] || { echo "STOP: a carry did not parse out of stage 1's transcript"; exit 1; }
echo "carries from this sitting: count=${CNT} digest=${DIG}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v anexo_expected_count="${CNT}" -v anexo_expected_digest="${DIG}" -f scripts/data/anexo-link-2-apply.sql 2>&1 | tee /tmp/anexo-apply.out
grep -q 'ANEXO LINK STAGE 2 DONE' /tmp/anexo-apply.out || { echo "STOP: stage 2 did not print its DONE line"; exit 1; }

psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-3-postcheck.sql 2>&1 | tee /tmp/anexo-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/anexo-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/anexo-postcheck.out || true)
[ "${OKS}" = 14 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 14"; exit 1; }

echo "ANEXO LINK COMPLETE."
)
```

## What every verdict must read

The post-check prints **14 rows, all `OK`**: the stage 2 audit row is present and
there is exactly one of it (1, 2); the recorded ids match the recorded count and
every one now carries a registo stage 2 named (3, 4, 5); the digest recomputes to
what stage 2 stored (6); the registo count matches (7); no attachment row was
created or deleted (8); unlinked documents fell by exactly the linked count (9);
**the patient-level count is UNCHANGED** (10); no `clinical_records` row was
written (11); every linked document still belongs to its registo's patient (12);
every target registo is still locked (13); and no document is linked twice (14).

Verdicts 9 and 10 look contradictory and are the two halves of the same fact. A
link sets `clinical_record_id` and never clears `patient_id`, so the count of
documents *with a patient* cannot move, while the count of *unlinked* ones must
fall by exactly N.

## Rehearsed

Against a throwaway database built from `supabase/migrations` on a Supabase
Postgres 17 image, with a fixture of production shape: imported `clinical_record`
staging rows naming delivery files, the attachment rows those names resolve to,
a multi-valued `FICHEIRO` cell (the vendor uses both a comma and a semicolon), a
file with no attachment row, and a file already linked.

| Run | Result |
|---|---|
| Stage 1, preview | count **3**, digest `914f1b0f…`; the three refusals all **0**; the two reports **1** and **1** |
| Stage 2, apply | exit 0, **3 documents linked to 3 registos**, P8 `clinical_records untouched` |
| Post-check | **14 OK / 0 FAIL**; final state 4 attachments, 4 with a patient, 4 linked, 0 unlinked |
| **Control: digest mismatch** | exit 3, `STOP: the candidate SET has changed since stage 1`, and **0 rows linked** |
| **Control: unlocked target** | exit 3, `STOP: 1 target registo(s) are not locked` |
| **Control: re-run** | second apply exit 3, `STOP: this block has already run` |

**Found by rehearsing, fixed before this was marked ready:** stage 2 picked its
tenant with `max(tenant_id)`, and Postgres has no `max()` for `uuid`. The block
aborted with `function max(uuid) does not exist` and wrote nothing, which is the
transaction doing its job, but it would have cost a production sitting. It is
`select distinct` now, guarded by the single-tenant check above it.

**One assumption, stated rather than buried.** The card describes three files as
preview / apply / **rollback**; this delivers preview / apply / **post-check**,
because the dispatch asks for stage 2 to take stage 1's digest and counts and for
the post-check's carries to come from the same run. A rollback is a separate file
and is not delivered here; the operation is reversible by setting
`clinical_record_id` back to NULL for exactly the ids in the audit row, which is
why every one of them is recorded.

## Order

The three files merge first, by their own PR. Then stage 1, read its output, then
stage 2. **Nothing runs on merge.**
