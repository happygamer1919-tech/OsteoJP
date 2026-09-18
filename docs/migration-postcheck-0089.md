# 0089 read-only post-check: what a catalogue read can still prove after the fact

**Status: READ ONLY. Nothing in this document writes, and nothing runs on merge.**
It is run by hand, once, by the terminal that has production access. Any `STOP:`
line, any `FAIL` verdict, or any `ERROR` halts the sitting.

| Fact | Value |
|---|---|
| Script | `scripts/db/postcheck-0089-readonly.sql`, sha256 `c2d08efd96953d9147ea9cb4ae0a51b60906efbdd9ea5d1e0577dea865d9a103` |
| Pin | `origin/main` — this document and the script merge to main BEFORE either is run |
| Migration it verifies | `0089_attachments_soft_delete`, sha256 `ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced`, journal idx 86 |
| Verdicts | exactly **27**, every one must read `OK` |
| Writes | none. `BEGIN READ ONLY` … `ROLLBACK`; zero INSERT, UPDATE, DELETE, CREATE, ALTER |
| Card | `SR62-PU4-documentos-soft-delete` |

## Why this document exists

`docs/migration-apply-0089.md` stage 1 ran on production on 2026-09-16 and 0089
**is applied** — journal 86 → 87 at head `edd4148e93d80663973526d3001d63008360a9ae`,
with the approved sha256. **Stage 2 never ran.** Its arms block builds a patient,
a staff user and two documents and soft-deletes one, inside a transaction it rolls
back; the safety classifier reads those INSERTs and UPDATEs as a production write
and refuses the block. Stage 1's marker window then expired at 13:00 UTC, and
stage 1 cannot re-run — it asserts that 0089 is *absent*, which is no longer true.

So 0089 is applied and unverified. This file closes the half of stage 2 that never
needed a write, and says plainly which half it cannot close.

## Why it pins `origin/main` and not the branch

0089's apply document pins its own branch, because PR #1338 is held until the
apply succeeds and `origin/main` therefore could not contain the migration at the
moment either stage ran. **The opposite is true here.** This script is not held
behind anything: its PR carries only these two files, merges on its own checks, and
is run afterwards. At the moment the block below runs, `origin/main` is exactly
where the script lives.

That ordering is load-bearing rather than incidental. Run the block before the PR
merges and the sha256 assertion halts on `STOP: the read-only post-check is not on
disk` — the safe direction, and the reason the assertion is there.

## The command

Pasted into an interactive zsh, which is stricter than a script: no `!` anywhere,
no backslash continuations, and every parameter braced — `${NAME}:`, never
`$NAME:`, which zsh reads as a modifier. That last rule is the one that stopped
the 0085 sitting, and `scripts/owner-blocks-survive-zsh.test.mjs` enforces it on
this document.

A `#` comment line is **not** on that list, and the measurement is recorded in
that guard so it does not get re-proposed: `interactive_comments` is set in this
owner's shell by `~/.oh-my-zsh/lib/misc.zsh`, so a `#` line is a comment and never
a command. Banning them would redden 59 lines across seven merged apply documents,
every one inside a block that has already been pasted and run.

```
(
set -eo pipefail
SHARO=c2d08efd96953d9147ea9cb4ae0a51b60906efbdd9ea5d1e0577dea865d9a103

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
rm -f /tmp/0089-readonly.out

echo "--- the pin, and the tree holds nothing but the checkout"
git fetch origin --prune
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
PIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${PIN})" = commit ] || { echo "STOP: ${PIN} does not resolve to a commit"; exit 1; }
git checkout -q --detach ${PIN}
echo "running from ${PIN}"

echo "--- the script is the approved file, by sha256"
test -f scripts/db/postcheck-0089-readonly.sql || { echo "STOP: the read-only post-check is not on disk"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0089-readonly.sql | cut -d' ' -f1)" = "${SHARO}" ] || { echo "STOP: the read-only post-check on disk is not the approved file"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the read-only post-check"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/postcheck-0089-readonly.sql 2>&1 | tee /tmp/0089-readonly.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0089-readonly.out && { echo "STOP: a verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0089-readonly.out || true)
[ "${OKS}" = 27 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 27"; exit 1; }

echo "0089 READ-ONLY POST-CHECK PASSED. 27/27 OK."
)
```

## The pinned numbers, and where they come from

Stage 2 took three **carries** — numbers stage 1 measured on production minutes
earlier. Stage 1 cannot run again, so they are pinned here as literals. Their
source is the recorded stage 1 transcript supplied in the dispatch (**G3**),
measured on production 2026-09-16 before the apply:

| Carry | G3 value | What this file expects after 0089 |
|---|---|---|
| `journal_rows_before` | 86 | journal is **87** |
| `attachments_policies_before` | 2 | still **2** — 0089 is an ALTER, not a CREATE |
| `secdef_functions_before` | 24 | still **24** — none added |
| attachments | 1181 | **at least 1181** — a floor, not an equality |
| attachments patient-level | 1181 | **at least 1181** — a floor, not an equality |

**A pinned literal is weaker than a carry measured in the same sitting, and that is
stated rather than hidden.** What makes the policy-count pin safe is that
`ALTER POLICY` cannot change the count: it is a property of the schema, not of the
apply. The journal pin is the one that would matter if G3 were wrong, and verdicts
2 and 3 hold it up independently — they identify 0089 by its own sha256 and `when`,
not by a count.

## What the first production run found, and what it changed

The check ran on production on 2026-09-17 and came back **24 OK / 3 FAIL**, with
the transaction confirmed read-only and `ROLLBACK` reached, and zero psql errors.
**All three failures were defects in this file, not in the database.** Nothing was
wrong with 0089, and nothing was wrong with production.

| Verdict | Production read | It had expected |
|---|---|---|
| 21 table grants | `authenticated=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE patient=SELECT` | `authenticated=DELETE,INSERT,SELECT,UPDATE patient=SELECT` |
| 24 attachments | 1185 | `= 1181` |
| 25 patient-level | 1185 | `= 1181` |

**Verdict 21 was measuring the rehearsal, not the migration.** A Supabase project
carries `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES`, so every
table arrives holding all seven privileges and an explicit `GRANT` is invisible
against them. The rehearsal databases were built with a plain `CREATE DATABASE`,
which inherits no default privileges at all, so they showed only the four
`0003_grants.sql` grants — and the literal recorded that. The tell was that
`patients` carries the identical string, and that across the 46 public tables
`authenticated` holds TRUNCATE on 30 and TRIGGER/REFERENCES on 38: a per-table
grant decision does not distribute like that, a platform default does.

This was confirmed rather than reasoned about. Rebuilding the same throwaway with
that one `ALTER DEFAULT PRIVILEGES` added, and nothing else changed, reproduces
production's string exactly on `attachments` and on `patients`, and reproduces the
spread — TRUNCATE on 30 tables, TRIGGER and REFERENCES on 38 of 46. So verdict 21
now asserts only what 0089 governs: `patient` reads and only reads, `anon` is
absent, `authenticated` holds at least the four this repository grants, and its
full set is compared against `patients` **read in the same query** rather than
against a literal that encodes which platform built the database.

**Verdicts 24 and 25 were asking the wrong question.** Four documents were
uploaded after G3's 12:00 UTC read, the newest at 16:42 UTC. A clinic that keeps
working is not a regression. 0089 writes no data, so what has to be true is that
nothing was **lost** — so both are now floors. A floor fails on a deletion and on
a row moved off patient level, and passes on growth. What a floor cannot see is a
delete followed by an equal number of inserts; G3 recorded counts and no row
identities, so there is no id-level assertion available to make, and that limit is
stated here rather than papered over.

**The TRUNCATE spread is a separate finding and is not fixed here.** `authenticated`
holding TRUNCATE on 30 tables is a platform default nobody chose, and TRUNCATE
ignores RLS. It is carded on the portal board and left to the owner; this file
only stopped asserting a number that hid it.

## V1 — every stage 2 assertion, and whether a catalogue read settles it

| Stage 2 assertion | Catalogue-readable | Here as |
|---|---|---|
| 1. journal grew by exactly one | yes (carry pinned) | 1 |
| 2. 0089 sha256 is present | yes | 2 |
| 3. newest journal `when` is 0089's | yes | 3 |
| 4. three columns exist, all nullable | yes | 6 |
| 5. CHECK by md5 and length | yes | 9 |
| 6. FK by md5 | yes | 11 |
| 7. portal policy by md5 and length | yes | 13 |
| 8. `attachments_tenant_isolation` untouched | yes | 15 |
| 9. policy count UNCHANGED | yes (carry pinned) | 16 |
| 10. no SECURITY DEFINER function added | yes (carry pinned) | 18 |
| 11. `delete_reason` comment by md5 | yes | 23 |
| 12. nothing the arms created survived the rollback | **no — needs a write** | — |
| A1. owning patient reads their live document | **no — needs a write** | — |
| A2. after the soft delete that patient reads NOTHING | **no — needs a write** | — |
| A3. that patient's other live document is unaffected | **no — needs a write** | — |
| A4. staff still read the soft-deleted row | **no — needs a write** | — |
| A5. CHECK refuses a delete with no actor and no reason | **no — needs a write** | — |
| A6. CHECK refuses a whitespace-only reason | **no — needs a write** | — |
| A7. a different patient never saw it | **no — needs a write** | — |
| A8. FK refuses an actor who is not a user | **no — needs a write** | — |

Eleven of stage 2's twelve verdicts are catalogue-readable. Verdict 12 is not: it
counts what the arms inserted, so without them it asserts nothing. All eight arms
need writes by construction — they exist to measure a READ consequence of an
UPDATE, and there is no UPDATE to have a consequence.

This file adds sixteen assertions stage 2 did not make, because a catalogue read is
cheap and the arms were carrying the whole burden: column data types and the
absence of a DEFAULT (7, 8), the constraint kinds and their targets (10, 12), the
policy's PERMISSIVE/SELECT shape (14), RLS still enabled (17), SECURITY DEFINER
ownership and pinned `search_path` (19, 20), the table and column grant end-state
(21, 22), 0088 and 0087 still applied by hash (4, 5), the row counts (24, 25), and
that nothing has been soft-deleted yet (26).

## What stays UNPROVEN on production until the first real soft delete through the UI

The read-only check proves the migration's **shape**. It cannot prove its
**behaviour**. Specifically, none of this is established:

1. **That a soft-deleted document actually disappears from the patient portal.**
   This is the migration's entire purpose. The rewritten policy is pinned by md5,
   so the *text* is right — but text is not a measurement of what the planner does
   with it for a real `patient` session.
2. **That the owning patient can still read their other, live documents** — i.e.
   that the new conjunct narrows and does not over-narrow.
3. **That staff still read the soft-deleted row**, which is what makes the trail
   readable later.
4. **That a different patient still cannot see it** (selfscope preserved).
5. **That the CHECK refuses an incomplete deletion** — no actor, or a
   whitespace-only reason — for a real writer rather than in its definition text.
6. **That the FK refuses an actor who is not a user.**

Items 5 and 6 are constraint definitions pinned by md5, so the risk there is low;
items 1 to 4 are RLS, where a correct-looking expression and a correct outcome are
genuinely different claims. **The first real soft delete through the Documentos tab
is what closes them**, and PR #1338 is what ships that tab.

## Rehearsed

Against throwaway databases built for this, on a Supabase Postgres 17.6 image,
from `supabase/migrations` — at **0089**, and at **0088** with 0089 held out. Each
was given production's row shape: the drizzle journal seeded to 86 rows (87 at
0089), each row carrying its real file sha256 and its real `when`; and 1181
attachments, all patient-level, matching G3.

**The repin added a fourth database, and it is the one that matters.** `pc0089d` is
built by the same script from the same migrations with exactly one line added —
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon,
authenticated, service_role`, which is what a Supabase project carries and a bare
`CREATE DATABASE` does not. That one line is the whole difference between the
first rehearsal and production, and it is why verdict 21 passed a rehearsal it
should have failed.

| Run | Result |
|---|---|
| Repinned check at **0089, with platform default privileges** (`pc0089d`) | **27 OK / 0 FAIL**, psql exit 0 |
| Repinned check at **0089, without them** (`pc0089`) | **27 OK / 0 FAIL**, psql exit 0 |
| Repinned check at **0088** (negative control) | **14 OK / 13 FAIL**, zero psql errors |
| CONTROL: one attachment moved off patient level (`patient_id → NULL`) | **26 OK / 1 FAIL** — verdict **25** fails at 1180, verdict 24 still OK |
| CONTROL: additionally one row deleted | **25 OK / 2 FAIL** — verdicts **24 and 25** both fail |
| The original stage 2 block, byte for byte, at **0089** | **12 OK / 0 FAIL**, `ARMS A1 A2 A3 A4 A5 A6 A7 A8 OK` (first sitting) |

**That the repinned verdict 21 reads OK on both database shapes is the point**, and
it is not a weaker assertion for it: on `pc0089d` it compares the full seven-privilege
production string against `patients`, on `pc0089` it compares the four-privilege one,
and on 0088 the row still fails where it should. The assertion no longer encodes
which platform built the database, while the four-privilege floor keeps it from
passing on a table stripped bare.

**The two controls are what stop the floors from being vacuous.** A floor that only
ever grows would be indistinguishable from an assertion nobody can fail; moving a
single row off patient level turns verdict 25 red while leaving 24 green, which is
the discrimination the pinned totals could not make — at `= 1181` both rows failed
together on growth and neither could say whether anything had been lost.

The negative control names each missing item rather than failing once: the journal
rows and 0089's hash and `when` (1, 2, 3), the three columns and their types
(6, 7), the CHECK and its kind (9, 10), the FK and its target (11, 12), the
rewritten policy (13), the patient's column grants (22), the column comment (23),
and the soft-delete emptiness row (26).

**Two things the rehearsal caught, before this was marked ready.**

- `pg_constraint.contype` is `"char"`, and `contype || ' on '` raises
  `operator is not unique` — which **aborted the whole transaction at verdict 10**,
  so the file printed 10 verdicts and reported `OK=10 / FAIL=0`. A green-looking
  run that had silently stopped two thirds of the way through. Every such
  expression is now cast to `text`.
- Verdict 26 named `deleted_at` directly, which does not parse on a database
  without the column — so the **negative control aborted instead of reading FAIL**.
  It now resolves the column through `to_jsonb(a) ->> 'deleted_at'`, which parses
  on both, and the row reads FAIL at 0088 as it should.

**Two declared environment differences.** The throwaway databases were built from
`supabase/migrations` on a plain Supabase Postgres image, which carries no GoTrue,
so `auth.jwt()` and `auth.uid()` were created as shims reading
`request.jwt.claims` — the same contract the real ones honour, and the mechanism
the arms use. And the fixture is one tenant with one patient, where production has
many; every assertion in this file is a catalogue read or a global count, so
neither difference reaches a verdict.

**One verdict passes vacuously in the negative control, and it is named rather than
counted as discrimination:** verdict 8 (no column DEFAULT) reads OK at 0088 because
the three columns do not exist, so none of them carries a default. It is a real
assertion at 0089 and a vacuous one at 0088.

## Order

0089 is applied. This check is run after its PR merges. **PR #1338 stays held until
it passes** — and passing it still leaves the six behavioural claims above open
until the first soft delete through the UI.
