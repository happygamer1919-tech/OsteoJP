# 0103: apply the revoke of anon's SEQUENCES default in public

**NOT READY. Nothing in this document may be pasted yet.** The rehearsal ran on 2026-10-08, with limits (see "Rehearsal"). The one mutation sweep ran on 2026-10-08 and changed no byte of the migration, of a check file or of a block (see "Review history"). Open, in order: R4, at most three rounds; the pull request, which is not opened (`PR-NUMBER-PENDING`); CI on the head that merges; the owner's two clicks; and GREEN's dispatch, which carries the three values this document cannot hold: the merge commit's sha (`MERGE-SHA-PENDING`), this document's sha256 and the run window. Until the pull request is merged every block below STOPs at its first file check, because this document is not on `origin/main`. **The sitting is closed hours only, by the weekday table** (see "R9").

**Status: AUTHORED. REHEARSED WITH LIMITS on 2026-10-08 (no block ran whole to its last line: see
"Rehearsal"). NOT APPLIED.** One migration,
`packages/db/migrations/0103_revoke_anon_sequences_default.sql`, sha256 `8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59`.

**In plain language.** The database has a setting that says what every NEW sequence (a counter)
created in the `public` schema is born with. Today that setting hands `anon`, the role of a
visitor who is not signed in, three rights on every such counter: to read it, to advance it and
to reset it. No such counter exists today, so nobody holds anything yet. This migration takes
`anon` out of that setting, so that a counter created later is not born open to visitors. It
changes one row of the database's catalogue. It touches no table, no row, no existing object and
no other role.

Four blocks, each pasted whole, on its own and in order: stage 0 (the merge, the files, the clock
and the head it runs from), stage 1 (the HEAD CHECK, the read-only pre-check, the clock and the
clinics, and the apply), stage 2 (the read-only post-check) and the closing journal read. One rule
governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0103 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number
changed and no other change.** This document has no stage 3 (see "No behaviour check on
production, and why"), so where the rule names stages 2 and 3, read stage 2 and the closing read.
**A VACUOUS verdict is not a pass and not a FAIL: the blocks count it, and stop on any count the
profile does not name** (see "What every verdict must read").

**No block carries `set -e`, and every halt is explicit, proven by fault injection.** GREEN's
Bash tool runs a block as `... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval
on the left of `&&`, zsh ignores errexit inside it, the block's `( ... )` subshell included (found
by R4 on 0100's dispatch, 2026-10-02). So `set -e` would stop nothing there and could only look
like a halt. Each command a later step relies on carries its own
`|| { echo "STOP: ..."; exit 1; }`, and `scripts/anon-sequences-default-0103.test.mjs` runs every
block in that exact shape, in bash and in zsh, with each external call made to fail in turn (see
"The fault-injection harness"). The second line of each block is `set -o pipefail` and nothing
more: pipefail is what gives a `... | tee` pipeline the exit of the program before the tee.
Strategy's rule, in S-1008-B's words: "Explicit halts, never set -e. No gate edit inside a
sitting." (S-1004-A first gave it: "Explicit halts in every block, never set -e.") **0100, 0101 and 0102 kept `set -eo pipefail` on that line; this document
drops the `-e`. A JUDGMENT, NOT A RULING** (see "JUDGMENTS").

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the
owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The
lane that wrote this document never runs it. Inside SOLO, the migration and its two check files
were written by one agent and this document and its script test by another, as the owner's ruling
of 2026-09-27 asks ("build/rehearse/document as separate agents").

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE on this branch, `db/0103-anon-sequences-default`:** the migration at its number, its
   journal entry (`idx 100`, tag `0103_revoke_anon_sequences_default`, `when` 1788502400000), its
   mirror `supabase/migrations/0103_revoke_anon_sequences_default.sql`, the pre-check, the
   post-check and the pending README's row (commit `5ec08eb0`); then this document, its sidecar and
   its script test (the commit after it). `node scripts/check-journal.mjs` reads 101 files and 101
   entries.
2. **DONE 2026-10-08, WITH LIMITS: the rehearsal,** by the rehearsal agent, under the lead's
   standing rule, verbatim in its prompt (see "What the rehearsal agent owes"). It includes
   strategy's gate G7, the lock read, which read as expected. Its record is under "Rehearsal".
3. **DONE 2026-10-08: the one mutation sweep** of the pre-check's and the post-check's predicates
   and of the blocks' halting predicates, mechanical, with the survivors listed (the owner's ruling
   of 2026-09-27). Its tables are under "Review history". It added tests and changed no byte of
   the migration, of a check file or of a block.
4. **OPEN: R4** on the pull request's diff and the card's acceptance, by a fresh reviewer that
   sees only those: at most three rounds (the review-loop cap).
5. **OPEN: SOLO opens the pull request, held from the moment it opens:** label `held-for-apply`,
   unarmed. Its number replaces `PR-NUMBER-PENDING` in this document, in an amendment that carries
   the sidecar with it.
6. **OPEN: CI is green on the head that merges,** the required checks and `db-tests`, which
   applies 0103 from the mirror with every other migration on a real Supabase stack; and the SET
   LOCAL gate reads the file in scope and passing.
7. **OPEN, THE OWNER: he takes `held-for-apply` off and merges the pull request,** and merges to
   main stop from that merge until GREEN's report is in (SOLO disarms every armed PR first).
8. **OPEN: SOLO fills GREEN's dispatch:** the merge commit's sha, this document's sha256, and a
   run window **while both clinics are closed by the weekday table** (R9 below). The dispatch's own
   CLOCK CHECK writes `/tmp/0103-window.ok` (see "What GREEN's dispatch carries").

### The placeholders, and who fills each

**This document cannot hold the sha of the commit that merges it:** the document is part of that
commit. So the merge sha is never written here. Every block resolves `origin/main` for itself and
records what it found, and the dispatch pins the sha by machine.

| Placeholder | Where it stands | Filled when | By |
|---|---|---|---|
| `PR-NUMBER-PENDING` | this document: the banner, step 5 above, the fact table, the order table | when the pull request is opened | SOLO, as an amendment to this document, with its sidecar |
| `REHEARSAL: PENDING` | it stood in this document, under "Rehearsal", until 2026-10-08 | FILLED 2026-10-08: the rehearsal has run and its record replaced the line | the rehearsal agent's record, committed with the sidecar |
| `MERGE-SHA-PENDING` | GREEN's dispatch only. Named in the banner here so nobody looks for it in a block | after the owner merges | SOLO |
| this document's sha256 | GREEN's dispatch, and `docs/migration-apply-0103.sha256` on the same head | after the LAST amendment of this document | SOLO; it is the first field of the sidecar |
| the run window | GREEN's dispatch only, as three Lisbon times `YYYYMMDDHHMM` | when the dispatch is written | SOLO |

**Every amendment of this document moves its sha256.** The sidecar is regenerated in the same
commit (`shasum -a 256 docs/migration-apply-0103.md > docs/migration-apply-0103.sha256`, from the
repository root), and `scripts/anon-sequences-default-0103.test.mjs` fails until it is. An
amendment that changes a byte inside a block is a production-touching byte: it gets its own R4
round (the review-loop cap, and R8).

| Fact | Value |
|---|---|
| Card | `SEC-anon-sequences-default` on the board (`docs/board/portal-board.json`), carded 2026-10-02 from the read-only 0100 measurement. Its status still reads `todo`: the card's own update is a board PR (SR-44), not this branch |
| Ruling | Strategy's dispatch S-1008-B (2026-10-08), its words: "Numbering: 0103 sequences default." (the sentence goes on to number the items after this one; they are not this document's). "2. 0103 authored, reviewed (cap 3), rehearsed. If READY by 21:00, its GREEN dispatch path goes to the owner for the same night, after the re-arm report. One migration in flight at a time." "G7 CHECK: the 0103 rehearsal. EXPECT: lock read shows no auth table and no table reception writes. Otherwise it is closed hours only and says so in its READY line." "Explicit halts, never set -e. No gate edit inside a sitting." "Merges allowed until 21:00 Lisbon, none from 21:00 until GREEN's report." And S-1002-A R9 and R10 |
| The card's SCOPE sentence | "SCOPE when built: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, with the two SET LOCAL lines (#1510), a pre-check and post-check that prove the default before and after and that no existing sequence's ACL moves." |
| Pull request | `PR-NUMBER-PENDING`, branch `db/0103-anon-sequences-default`, to be opened `held-for-apply`, unarmed |
| Migration | `packages/db/migrations/0103_revoke_anon_sequences_default.sql`, written at its number, never parked in `migrations-pending`. sha256 `8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59` |
| Journal | `idx 100`, tag `0103_revoke_anon_sequences_default`, `when` 1788502400000 (0102's 1788502300000 plus 100000). Stage 0 asserts it and 0102's entry before it. Production's journal goes 100 to 101 |
| Mirror | `supabase/migrations/0103_revoke_anon_sequences_default.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0102`, SAT-01's migration (#1551), applied 2026-10-07 (production journal 99 to 100), body sha256 `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`, journal `idx 99`, `when` 1788502300000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the pull request's merge commit. Stage 0 records the sha `origin/main` resolves to in `/tmp/0103-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK) |
| The apply worktree | `/Users/ivan/Projects/GitHub/osteojp-prod-apply` |
| This document | `docs/migration-apply-0103.md`, pinned by `docs/migration-apply-0103.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own and checks it by machine |
| Pre-check | `scripts/db/precheck-0103-anon-sequences-default.sql`, READ ONLY, 10 verdicts each with its control, 10 CARRY rows, 4 INFO rows and a SUMMARY row, `-v prev_hash` and `-v prev_when` required, sha256 `de205334fff4e2576afc602bfa451606fe528b2b4c36ae0fecbc5cdb82f977f7` |
| Post-check | `scripts/db/postcheck-0103-anon-sequences-default.sql`, READ ONLY, 14 verdicts and a SUMMARY row, twelve carries in, sha256 `22e2ac620b0e80a1e535207fe206a74d9db1d687da215075289b5639acd7cdea` |
| Behaviour check | none on production, on purpose (see "No behaviour check on production, and why"). IN ACTION on the build lane's stack: a sequence created before the revoke and one created after it |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module both of the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. All four read from `origin/main` at `bf0000a1` on 2026-10-08, the same bytes the 0100 and 0101 documents pin; every block that runs one compares it, and the module, first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs` on main: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6` (#1510). It feeds R9 proof 1, which is printed in every sitting and decides nothing here |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts` (0094 to 0102 did not pin them either). Their tree is fixed instead, by commit: GREEN's BEFORE YOU START requires `origin/main` to BE the pull request's merge commit, and the HEAD CHECK halts on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0103-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stage 2 and the closing read refuse at or after its end. Stage 0 removes the record. **No date is written in any block of this document or in any op file** |
| What it changes | The two `SET LOCAL` lines, for this transaction only. Then one row of `pg_default_acl`: in the entry for objects `postgres` creates, in schema `public`, of type SEQUENCE, the three items of `anon` (SELECT, UPDATE, USAGE) are removed |
| What it never touches | every sequence that exists, every table, row, column, policy and function (so the SECURITY DEFINER count stays where it is: **no count GATE-CHANGE after the apply**), every privilege on every existing object, the same default's items for `authenticated`, `service_role` and `postgres`, every other default privilege, and every default of `supabase_admin`. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so
the digest lives in `docs/migration-apply-0103.sha256` and every block checks it with
`shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same head as the
document, so a main that moved to a new document and a new sidecar together would pass that check.
**GREEN's dispatch closes that by machine:** it pins this document's sha256 on its own and checks
it against the `origin/main` it resolves. From stage 0 on, the HEAD CHECK halts on any moved main
before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no
backslash continuations and no `!` except `test !`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number). Narration is
`echo`. Every halt is an explicit `STOP:` line followed by a non-zero exit, never `set -e`.

**The migration's own header names no number of its own,** only 0102's, as the migration it
follows, and 0100's, as the revoke before it. Nothing in it goes stale wherever it stands.

## 1. What it does

Three statements, each ended by `--> statement-breakpoint`
(`packages/db/migrations/0103_revoke_anon_sequences_default.sql`, lines 92, 93 and 95 to 96).

| # | Statement | Effect |
|---|---|---|
| 1 | `SET LOCAL lock_timeout = '5s';` | a lock this transaction cannot take in 5 seconds fails it, and nothing is applied |
| 2 | `SET LOCAL statement_timeout = '60s';` | no statement in this transaction runs longer than 60 seconds |
| 3 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;` | the next sequence `postgres` creates in `public` is no longer born with `anon` holding SELECT, UPDATE and USAGE on it |

**Statement 3 is the card's SCOPE sentence, to the letter,** and
`scripts/anon-sequences-default-0103.test.mjs` requires it to the token: another role, another
schema, no schema, another grantee, one privilege instead of ALL, or another object type each
fail it.

No GRANT, no policy, no function, no table, no sequence, no row. No backfill. No data change.

**Read on a local Supabase stack that carries the platform's default** (lane `green`,
127.0.0.1:54922, Postgres 17.6, migrations 0000 to 0102, 2026-10-08), `pg_default_acl` for schema
`public`, by the build agent (all six rows), and the two SEQUENCES rows again by the document agent:

| Creator | Object type | Before | After 0103 (in a transaction that was rolled back) |
|---|---|---|---|
| `postgres` | SEQUENCES | `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` | `{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` |
| `postgres` | TABLES, FUNCTIONS | unchanged | byte-identical |
| `supabase_admin` | SEQUENCES | `{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}` | byte-identical: it still grants `anon` |
| `supabase_admin` | TABLES, FUNCTIONS | unchanged | byte-identical |

In an ACL, `r` is SELECT, `w` is UPDATE and `U` is USAGE. No default without a schema (a GLOBAL
one) exists before or after. One row of six changed.

**That stack matches production's recorded reading.** GREEN's read-only measurement of 2026-10-02
(`scripts/db/measure-0100-maintain.sql`) found the same on production: `anon` SELECT, UPDATE and
USAGE in the SEQUENCES default of `postgres` and of `supabase_admin`, and no GLOBAL default. That
measurement did NOT count the sequences in `public` (see "What has never been measured on
production").

## 2. Why

`anon` is the platform's role for a request that carries no signed-in user. Supabase's own
`ALTER DEFAULT PRIVILEGES` grants ALL on new sequences in `public` to `anon`, `authenticated` and
`service_role`, and for a sequence ALL is three privileges: USAGE (`nextval` and `currval`), UPDATE
(`nextval` and `setval`) and SELECT (`currval`, and reading the sequence's row). So the next
sequence `postgres` creates in `public` is born with a visitor's role able to advance it and to
reset it, until somebody remembers to revoke that by hand. A default that has to be remembered is
the kind that is forgotten: 0099 and 0100 closed the same shape for `authenticated` on tables.

The read-only measurement made for 0100 found this default as well, and strategy carded it
(S-1002-D P1.6) as Tier C, built after 0102. S-1008-B numbered it 0103.

## 3. What breaks: nothing, and here is the evidence rather than the claim

- **The default covers no object today, on the local stack.** `public` holds 0 sequences on a
  stack built from every migration up to 0102 (the pre-check's CARRY row `sequences_before`, read
  on lane `green` on 2026-10-08: 0). No migration creates one: of the 101 files in
  `packages/db/migrations`, the only one that names `CREATE SEQUENCE`, `nextval`, `bigserial` or
  `AS IDENTITY` is 0103 itself, in its comments (searched 2026-10-08); and
  `packages/db/src/schema.ts` declares no `serial`, no identity column and no sequence.
- **The change reaches only a sequence created LATER, by `postgres`, in `public`.** `ALTER DEFAULT
  PRIVILEGES` changes what the next object is given and no object that exists.
- **No code runs as `anon` through the application's database layer.** `packages/db/src/client.ts`
  drops to exactly two roles, `authenticated` (line 152) and `patient` (line 196), and never to
  `anon`. `anon` is the role of the platform's own API for an unsigned request.
- **A later migration that creates a sequence and wants `anon` to use it must say so,** with its
  own GRANT, reviewed. That is the point of this change, not a side effect of it.
- **Nothing else moves, and the sitting proves it:** post-check 4 to 11, one md5 each over every
  other default privilege, every sequence's privileges, every relation's privileges, every column
  privilege, the app roles' SELECT, INSERT, UPDATE and DELETE profile, every policy and every
  function, against the carries the pre-check printed.
- **No gate count moves.** No function is created, so the SECURITY DEFINER count and the 0079 ACL
  test's lists stay as they are.

### What has never been measured on production

**The number of sequences in `public` on production has never been read by anyone.** The
2026-10-02 measurement did not count them. Zero is inferred from the migrations and read on the
local stack. **The pre-check prints it, before anything is written:** the CARRY row
`sequences_before`, and the INFO row `INFO sequences in public on which anon holds USAGE, SELECT or
UPDATE by any path`, as `<k> of <n>`. **GREEN reports both rows as printed.**

- **If production holds no sequence,** which is what is expected: the post-check's verdict 5 ("no
  existing sequence moved") reads VACUOUS, because it ran over nothing, and the profile stage 2
  requires is 13 OK / 1 VACUOUS / 0 FAIL.
- **If production holds one or more:** 0103 does not touch them, by the card's scope; the
  post-check's verdict 5 then proves by md5 that not one of their privileges moved, and the profile
  stage 2 requires is 14 OK / 0 VACUOUS / 0 FAIL. If `anon` holds a privilege on one of them (the
  INFO row reads other than `0 of <n>`), that is a finding for the lead to rule on, and a new card:
  this migration neither fixes it nor is stopped by it. **A JUDGMENT, NOT A RULING** (see
  "JUDGMENTS").

## 4. What is left after the apply, on purpose

| Left as it is | Why |
|---|---|
| **`supabase_admin`'s default still grants `anon` SELECT, UPDATE and USAGE on new sequences in `public`** | It is out of reach, as the documents of 0099 and 0100 record: a role may change its own defaults, and `postgres` is not a member of `supabase_admin` (the build agent measured `false` on the local stack). It reaches only a sequence `supabase_admin` itself creates in `public`, and every migration runs as `postgres`. The pre-check prints it (the INFO row "other creator roles"), and post-check 4 proves it unchanged. **It is not touched, and no block may touch it** |
| `authenticated` and `service_role` keep the three privileges in the same default of `postgres` | The card names `anon` and nobody else. The pre-check prints what they hold (the fourth INFO row) |
| Every sequence that exists | The card scopes the default. None is expected to exist |
| The FUNCTIONS default, which grants `anon` EXECUTE | Another default. It is documented in 0072, 0073 and 0086, and every function's own REVOKE is how it is handled |
| Defaults in any other schema | The card names `public`. No other schema's default was measured on production |

**After the apply, the two-line answer to "can a visitor touch a new sequence":** not one that a
migration creates (`postgres` creates it, and its default no longer names `anon`); still one that
`supabase_admin` creates in `public`, which no migration does.

## No behaviour check on production, and why

The pre-check and the post-check assert catalogue facts and counts. The behaviour ("the next
sequence gives `anon` nothing") needs a sequence to be created, and a READ ONLY transaction creates
nothing. It is proven where it can be measured, on the local stack that carries the platform's
default, in transactions that were rolled back:

| Probe | `anon` USAGE | `anon` SELECT | `anon` UPDATE | Who |
|---|---|---|---|---|
| a sequence created in `public` BEFORE the revoke | true | true | true | the build agent, 2026-10-08 |
| a sequence created in `public` AFTER the revoke | false | false | false, while `authenticated` and `service_role` kept theirs | the build agent, 2026-10-08 |
| a sequence created after the revoke AND the restoring grant of "Rollback" | true | true | true | the document agent, 2026-10-08 |

On production the same thing is pinned by the catalogue: post-check 1 (the default names `anon`
nowhere), 2 (no PUBLIC item and no inherited path) and 3 (no GLOBAL default) are what a sequence
`postgres` creates in `public` takes `anon`'s privileges from.

## R9: the sitting is closed hours only, by the weekday table

S-1002-A R9, strategy's words: "DAYTIME APPLIES, owner ruled B, from 0100: a clinic-hours sitting
is allowed only when all three hold, each proven in the apply document: (1) the SET LOCAL gate is on
main; (2) the migration is catalog-only or touches no table reception writes; (3) the read-only
pre-check ran on production in an earlier sitting, output recorded. Else closed hours."

**Said plainly: two of R9's three conditions hold and the third does not, so this document runs in
closed hours only. The sitting S-1008-B rules for the night of 2026-10-08 is in closed hours anyway
(a Thursday, from 21:00 Lisbon).**

1. **Condition 1 holds:** the SET LOCAL gate is on main (`SHAGATE`), and the file's first two
   statements are the two lines.
2. **Condition 2 holds: the migration is catalog-only.** Its one statement after the two SET LOCAL
   lines is `ALTER DEFAULT PRIVILEGES`, which changes one row of `pg_default_acl` and names no
   table. It takes no lock on any table outside the catalogue: read on the local stack by the build
   agent from a second session, and by the document agent statement by statement (see "G7").
   **The rehearsal's own G7 read agrees** (see "Rehearsal", "G7: THE LOCK READ"). Strategy's gate
   says what follows if it reads otherwise: "it is closed hours only and says so in its READY
   line". This document is closed hours only either way.
3. **Condition 3 does not hold:** no read-only pre-check has run on production in an earlier
   sitting. The pre-check runs inside stage 1, minutes before the apply, and that is not "an
   earlier sitting". The card's ORDER sentence also names one: "a read-only measurement and a
   read-only pre-check sitting on production before it". Whether stage 1's pre-check discharges
   that sentence is the lead's to rule (see "QUESTIONS THIS DOCUMENT DOES NOT ANSWER").

**So there is no daytime arm in any block, and none can be reached.** The blocks print R9's three
proofs in every sitting (proof 1 computed, proof 2 a fixed `yes`, proof 3 a fixed `no`) and decide
on the clock alone.

**The clinic hours are a weekday table in Lisbon time, and the table lives in this document**
because production holds one `opens_at` and `closes_at` pair per location and no weekday dimension:

| Lisbon weekday | Clinic hours | Closed, so a sitting may run |
|---|---|---|
| Monday to Friday | 08:00 to 21:00 | before 08:00 and from 21:00 |
| Saturday | 08:00 to 13:00 | before 08:00 and from 13:00 |
| Sunday | closed | all day |

**The arm, in stage 0 and again in stage 1 right before the apply:**

- It reads the Lisbon weekday, the time AND THE ZONE in ONE `date` call
  (`TZ=Europe/Lisbon date '+%u%H%M %Z'`: the ISO weekday 1 to 7, HHMM, then the zone's name), and
  STOPs unless the zone reads exactly `WET` or `WEST`. **A zone that cannot be loaded does not
  fail: `date` answers with UTC's clock and exit 0, under a zone name that is not Lisbon's**
  (measured for 0101: BSD `date` on macOS prints `UTC` for a misspelt zone, GNU `date` on Linux
  prints `Europe`; neither prints `WET` or `WEST`). In summer UTC is an hour behind Lisbon, so Monday 08:30 would
  read 07:30, "closed". The zone's name in the same call is what refuses that. It then refuses a
  reading that is not five such digits, and decides `closed` or `open` by the table. **Every other
  clock read in every block (the run window's `YYYYMMDDHHMM`) reads the zone the same way and
  stops the same way.** A boundary minute belongs to the hour it starts: Friday 20:59 is open and
  Friday 21:00 is closed; Saturday 12:59 is open and Saturday 13:00 is closed; Sunday 15:00 is
  closed; Monday 07:59 is closed. The script test runs both stages whole at each of those six
  minutes, and the arm's own program at every boundary of every weekday.
- **Stage 1 also reads the clinics' own rows, READ ONLY, and uses them to check the table, not
  the clock.** It counts the active clinics whose own `opens_at` is before 08:00 or whose
  `closes_at` is after 21:00, the table's widest row, and STOPs unless that count is 0 of at least
  one active clinic. A row cannot say "Saturday afternoon is closed", so it cannot decide the hour;
  it can say that the table in this document is stale.
- Inside clinic hours the block STOPs with nothing applied, whatever the proofs read. **There is
  no owner-override arm and no date in any arm.** An override would be a new amendment with its
  own R4 round (R8).

## G7: the locks (the build lane's two reads, 2026-10-08; the rehearsal's read is under "Rehearsal")

Strategy's gate G7: "G7 CHECK: the 0103 rehearsal. EXPECT: lock read shows no auth table and no
table reception writes. Otherwise it is closed hours only and says so in its READY line."

**G7's verdict belongs to the rehearsal. It is given under "Rehearsal", "G7: THE LOCK READ", and it
is the expected one: no `auth` table and no table reception writes.** What follows are two readings on
the build lane's stack (lane `green`, Postgres 17.6, the platform's default in place), each inside
a transaction that was rolled back. Neither is the rehearsal.

**The build agent's read, from a second session while the transaction was open:** ROW EXCLUSIVE on
the sequence `graphql.seq_schema_version`, and the transaction's own ids. 0 relations in `auth`,
`storage` or `realtime`. 0 relations in `public`.

**The document agent's read, statement by statement, this backend's own rows of `pg_locks`:**

| # | Statement | Locks on relations outside `pg_catalog`, new at this statement |
|---|---|---|
| 1 | `SET LOCAL lock_timeout = '5s'` | none |
| 2 | `SET LOCAL statement_timeout = '60s'` | none |
| 3 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon` | **ROW EXCLUSIVE on the sequence `graphql.seq_schema_version`,** and nothing else |

- **No relation in `auth`, `storage`, `realtime` or `public` was locked at any statement: 0 of 0.**
  So no login table, and no table reception writes.
- **One relation outside `public` was locked, and it is said here rather than left out:** the
  sequence `graphql.seq_schema_version`, ROW EXCLUSIVE, from statement 3. It is the platform's
  GraphQL extension counting a schema change on every DDL statement (a `nextval`). ROW EXCLUSIVE on
  a sequence does not block another `nextval`, a read or a write of any table. 0101 took the same
  lock.
- **Besides that:** the transaction's own `virtualxid` and `transactionid`. After statement 3 no
  `pg_catalog` relation was still locked in a mode stronger than ACCESS SHARE, as read from the
  same session.
- **Inside the transaction `lock_timeout` read `5s` and `statement_timeout` read `1min`,** so the
  two SET LOCAL lines took effect.
- **Not measured on production.** Its platform configuration was not read. If a production setting
  made this statement wait on a lock, the 5 second bound would turn the wait into a clean failure,
  and the sitting is in closed hours.

## THE ORDER OF PULL REQUESTS

Strategy's ruling R35, as this lane holds it: no gate edit inside a sitting; each gate edit is its
own GATE-CHANGE pull request, merged by the owner on green.

| Order | Pull request | What it carries | Who merges |
|---|---|---|---|
| 1 | this branch, `db/0103-anon-sequences-default`, `held-for-apply`: `PR-NUMBER-PENDING` | the migration, its journal entry and its mirror, the two check files, this document and its sidecar, the script test, the pending README. **No gate file is edited:** the script test is a NEW file, which the freeze allows | the owner (label off, then merge), after the rehearsal, the sweep, R4 and CI |
| 2 | the sitting | GREEN applies from the merge commit. No pull request, and no gate edit | - |
| 3 | **no post-apply GATE-CHANGE** | 0103 creates no function, so the SECURITY DEFINER count (36) and the 0079 ACL lists do not move | - |
| 4 | the board card and `CLAUDE.md`'s number table | the card `SEC-anon-sequences-default` still reads `todo`, and the table still reads "after `0102` ... not yet authored". Each is its own PR (a board PR under SR-44, a docs PR), after GREEN's report | SOLO, Tier A |

**NO GATE-CHANGE IS OWED, before or after, measured.** With the migration in place the build agent
read `node scripts/check-journal.mjs` 101 of 101, `pnpm test:scripts` passing whole, and
`GATE_BASE_REF=main node scripts/assert-gates-unchanged.mjs` finding every pin unchanged. With this
document, its sidecar and its script test added, the document agent read the same (see "The
document agent's run"). `scripts/gate-manifest.mjs` freezes a script test only once a GATE-CHANGE
regenerates the manifest, so `scripts/anon-sequences-default-0103.test.mjs` is added here as an
ordinary file; any edit to it after the next manifest regeneration is a GATE-CHANGE of its own.

**Merge first, then the sitting from the merge commit, as with 0100 and 0101** (`CLAUDE.md`,
"Which commit a sitting runs from"). A migration that creates SECURITY DEFINER functions cannot
merge first, because a required check counts those functions on a database built from main; 0103
creates none, so it can. All four blocks name `origin/main`, so none can run from the pull
request's head before the merge without a change to block bytes.

**Two of S-1008-B's rulings, read together** (the document agent's reading, for the lead to
confirm): "Merges allowed until 21:00 Lisbon, none from 21:00 until GREEN's report", and a clock
that passes only from 21:00 on a weekday. So for a sitting the same night the owner's merge lands
BEFORE 21:00 and stage 0 is pasted from 21:00. A pull request not merged by 21:00 is not applied
that night.

## Merged before the apply, and why that is safe here

**The pull request carries no app code.** It carries the migration, its journal entry and its
mirror, this document and its sidecar, the two check files, a script test and the pending README.
Nothing in the application reads a default privilege or uses a sequence in `public`, so the
application behaves the same before and after the apply, and a merged main that production has not
caught up with yet is a state the application already lives in.

**Between the merge and the apply, main is ahead of production by exactly one migration,** and the
pre-check says so: it passes only while 0103 is absent from the journal and 0102 is its newest row.
The daily `prod-drift-check` would report 0103 as pending if the sitting halted before the apply;
that report is correct, and it is informational.

**CI applies 0103 to its own databases from the merge on,** through the mirror, outside a
transaction (the Supabase CLI's shape): each SET LOCAL line prints the 25P01 WARNING a SET LOCAL
prints outside a transaction block, as it does for 0100 and 0101, and the revoke applies. So after
the merge every CI database and every lane stack built from main has `anon` out of that default
while production still has it in, until the sitting. Nothing reads the difference.

**Exactly one `packages/db/migrations/0103_*.sql` may exist; if anything else is ever found under
`0103_`, STOP.** The number is the apply authorisation (S-1008-B put this item on 0103;
`CLAUDE.md`'s table still reads "after `0102`" until the docs PR that records it).

## The HEAD CHECK, and running from main

No block reads a branch, and there is no separate HEAD CHECK to paste: the machine runs it inside
every block.

- **Two shas are compared only as checked variables.** Every sha a block compares (the recorded
  sha, `origin/main`, the worktree's HEAD, the sha in the run window record, stage 2's pass mark)
  is first read into a variable and refused unless it is 40 hex characters. An inline
  `[ "$(git rev-parse HEAD)" = "${REC}" ]` is true when both sides are empty, which is a record
  that reads empty and a git that fails; no block compares that way.
- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean, removes the
  previous sha and run-window records, fetches, resolves `origin/main`, checks that sha out detached
  and verifies HEAD is it, verifies the sidecar, the migration, the journal, 0102's bytes and every
  pin, runs the clock arm, and only then records the sha in `/tmp/0103-main.sha`.
- **The run window is checked by machine in every block from stage 1 on,** from the record GREEN's
  CLOCK CHECK writes after stage 0.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve `origin/main` again,
  print both, and HALT on any difference with `STOP: main moved since stage 0, the merge freeze was
  broken.` It runs before the environment is loaded and before psql. It then checks out the RECORDED
  sha and asserts every file it runs by sha256.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied marker
  `/tmp/0103-applied.ok` exists (younger than 12 hours), and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stage 2 and the closing read are READ ONLY** and run from the recorded sha whatever main has
  done since: each prints whether main moved, with both shas, and never stops on it. **A fetch that
  fails is a STOP in every block, these two included,** because whether main moved is then not known.

**The sitting runs from the MERGE commit, and the rehearsal runs from the branch head.** The two
trees differ by whatever main gained in between. Stage 0 asserts every pin of this document again
from the merge commit, so a pinned file that differs there stops the sitting before anything is
read.

## What GREEN's dispatch carries (it is not in this document, and it is not written yet)

The dispatch is SOLO's, outside the repository, as for 0100 and 0101. It carries two blocks of its
own, pasted around this document's stage 0, and three values:

- **BEFORE YOU START:** `origin/main` IS the merge commit (`MERGE-SHA-PENDING`, pinned by its full
  sha), and this document at that commit hashes to the sha256 the dispatch pins on its own.
- **CLOCK CHECK, after stage 0:** it checks the Lisbon clock against the run window and the weekday
  table, with `TZ=Europe/Lisbon` and the WET or WEST stop, and writes ONE line to
  `/tmp/0103-window.ok`: the sha stage 0 recorded, then three Lisbon times `YYYYMMDDHHMM` separated
  by single spaces (the window opens; the last minute stage 1 may start; the window ends). Stage 1
  reads those four fields and refuses anything else.
- **Its halt rule is THE HALT RULE above, in the same words.**

## STAGE 0: the merge, the files, the clock and the recorded head

```
(
set -o pipefail
DOCPIN=docs/migration-apply-0103.sha256
MIG=packages/db/migrations/0103_revoke_anon_sequences_default.sql
SHA0103=8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59
SHAPREV=db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1
SHAPRE=de205334fff4e2576afc602bfa451606fe528b2b4c36ae0fecbc5cdb82f977f7
SHAPOST=22e2ac620b0e80a1e535207fe206a74d9db1d687da215075289b5639acd7cdea
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0103-applied.ok || { AGE=$(find /tmp/0103-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0103 in this sitting, or the age of /tmp/0103-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0103-main.sha /tmp/0103-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so origin/main may be stale. Nothing was applied"; exit 1; }
MAIN=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
echo "${MAIN}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${MAIN}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN} || { echo "STOP: the checkout of origin/main failed. Nothing was applied"; exit 1; }
echo "--- THE HEAD CHECK: the worktree must be on the origin/main this stage records"
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${MAIN}" ] || { echo "STOP: the worktree is not on origin/main after the checkout. Nothing was applied"; exit 1; }
echo "origin/main and HEAD: ${MAIN}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0103 is not on disk at origin/main, so the PR has not merged"; exit 1; }
N103=$(find packages/db/migrations -maxdepth 1 -name '0103_*.sql' | wc -l | tr -d ' ')
[ "${N103}" = 1 ] || { echo "STOP: ${N103} files claim migration number 0103, not 1"; exit 1; }
N102=$(find packages/db/migrations -maxdepth 1 -name '0102_*.sql' | wc -l | tr -d ' ')
[ "${N102}" = 1 ] || { echo "STOP: ${N102} files claim migration number 0102, not 1"; exit 1; }
test -f scripts/db/precheck-0103-anon-sequences-default.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0103-anon-sequences-default.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0103}" ] || { echo "STOP: 0103 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0103-anon-sequences-default.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0103-anon-sequences-default.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===101&&e.idx===100&&e.tag==='0103_revoke_anon_sequences_default'&&e.when===1788502400000&&p.idx===99&&p.tag==='0102_sat01_satisfaction_survey'&&p.when===1788502300000?0:1)" || { echo "STOP: the newest journal entry is not idx 100, tag 0103_revoke_anon_sequences_default, when 1788502400000, of 101, after idx 99 tagged 0102_sat01_satisfaction_survey at when 1788502300000"; exit 1; }
test -f packages/db/migrations/0102_sat01_satisfaction_survey.sql || { echo "STOP: the file of journal idx 99 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0102_sat01_satisfaction_survey.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0102 on disk is not the file this document pins"; exit 1; }
echo "0102 on disk: 0102_sat01_satisfaction_survey.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0103-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '101 .sql files match 101 journal entries' /tmp/0103-check-journal.out || { echo "STOP: check-journal did not reconcile 101 files with 101 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0103 has no earlier pre-check sitting on production, so only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=yes
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${MAIN} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (its one statement after the two SET LOCAL lines is ALTER DEFAULT PRIVILEGES, which changes one row of pg_default_acl and names no table)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0103 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). R9 proof 3 reads no (no read-only pre-check ran on production in an earlier sitting), so 0103 runs in closed hours only, and the sitting waits. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0103-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0103-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0103-main.sha"
echo "0103 MERGE, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and `origin/main and HEAD: <sha>`; the sidecar line
`docs/migration-apply-0103.md: OK`; then
`newest journal entry: idx 100, when 1788502400000, tag 0103_revoke_anon_sequences_default, of 101; before it idx 99, when 1788502300000, tag 0102_sat01_satisfaction_survey`;
then `0102 on disk: 0102_sat01_satisfaction_survey.sql, sha256 db12b967...`; then check-journal's
line `... 101 .sql files match 101 journal entries in order ...`; then the clock:
`Lisbon weekday and time <DHHMM> (...): closed by the weekday table`, the three proof lines (proof 1
`yes` while main's gate file hashes to `SHAGATE`, proof 2 `yes, by construction`, proof 3
`no, by construction`), and `R9: closed hours by the weekday table. 0103 runs in closed hours only`;
then `running from origin/main <sha>, recorded in /tmp/0103-main.sha`; then
`0103 MERGE, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database. The sha it prints is
the one every later stage runs from.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass. Any other ending is a `STOP:`
line and exit 1, with nothing applied: a failed fetch, `git status`, checkout or check-journal each
print their own `STOP:`, and `/tmp/0103-main.sha` is written only after every check has passed, so
a STOP leaves no new record of the sha. Inside clinic hours the clock's STOP is the arm working. A
proof 1 line that cannot be computed reads `no`, and decides nothing.

**Until the pull request is merged, this stage ends at its first file check,**
`STOP: the document pin is not on disk at origin/main`. That is the safe direction, and the halt
rule governs it.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -o pipefail
MIG=packages/db/migrations/0103_revoke_anon_sequences_default.sql
SHA0103=8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59
SHAPREV=db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1
SHAPRE=de205334fff4e2576afc602bfa451606fe528b2b4c36ae0fecbc5cdb82f977f7
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0103-applied.ok || { AGE=$(find /tmp/0103-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0103 in this sitting, or the age of /tmp/0103-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0103-precheck.new || { echo "STOP: the old /tmp/0103-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0103-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0103-main.sha) || { echo "STOP: stage 0's record /tmp/0103-main.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0103.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0103 is not on disk"; exit 1; }
test -f scripts/db/precheck-0103-anon-sequences-default.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N103=$(find packages/db/migrations -maxdepth 1 -name '0103_*.sql' | wc -l | tr -d ' ')
[ "${N103}" = 1 ] || { echo "STOP: ${N103} files claim migration number 0103, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0103}" ] || { echo "STOP: 0103 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0103-anon-sequences-default.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T102=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[99];process.stdout.write(p&&p.idx===99&&p.tag==='0102_sat01_satisfaction_survey'?p.tag:'none')") || { echo "STOP: node could not read journal idx 99's tag at the recorded sha. Nothing was applied"; exit 1; }
W102=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[99];process.stdout.write(p&&p.idx===99&&p.tag==='0102_sat01_satisfaction_survey'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 99's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W102}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0102's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T102}.sql || { echo "STOP: the file of journal idx 99 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T102}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0102 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0102: packages/db/migrations/${T102}.sql, sha256 ${SHAPREV}, journal when ${W102}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0103-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0103-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0103-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0103-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0103-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. Nothing was applied"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. Nothing was applied"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. Nothing was applied"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is not before ${WEND}, the run window's end, so the recorded window is not this sitting's. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was applied"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was applied"; exit 1; }

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W102} -f scripts/db/precheck-0103-anon-sequences-default.sql 2>&1 | tee /tmp/0103-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0103-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0103-precheck.new || true)
[ "${VACS}" = 0 ] || { echo "STOP: the pre-check printed [${VACS}] VACUOUS verdicts, or its transcript could not be read. A VACUOUS verdict means the default 0103 revokes is not there as it was measured, so this is not the database that was measured. Nothing was applied"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0103-precheck.new || true)
[ "${OKS}" = 10 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 10. Nothing was applied"; exit 1; }
echo "the pre-check profile: ${OKS} OK / ${VACS} VACUOUS / ${FAILS} FAIL. REPORT, AS PRINTED ABOVE, the CARRY row sequences_before and the INFO row that counts the sequences in public on which anon holds a privilege: 0103 changes the default and no sequence that exists, and an existing sequence does not stop this sitting"

NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read again before the apply. Nothing was applied"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST again before the apply, so the Lisbon zone may not have loaded [${NOWZ}]. Nothing was applied"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM again before the apply. Nothing was applied"; exit 1; }
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- THE CLOCK AND THE CLINICS (R9), again, right before the apply: only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (opens_at < time '08:00' or closes_at > time '21:00')) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1) || { echo "STOP: the clinics' own hours could not be read (psql's lines are above). Nothing was applied"; exit 1; }
echo "active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=inside; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=outside; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "the clinics' own rows against the weekday table: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=yes
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (its one statement after the two SET LOCAL lines is ALTER DEFAULT PRIVILEGES, which changes one row of pg_default_acl and names no table)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0103 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. R9 proof 3 reads no (no read-only pre-check ran on production in an earlier sitting), so 0103 runs in closed hours only, and nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0103-postcheck.out /tmp/0103-stage2.ok /tmp/0103-journal-after.out /tmp/0103-apply.out /tmp/0103-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0103-precheck.new /tmp/0103-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0103-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0103-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0103_revoke_anon_sequences_default --sha256 ${SHA0103} --expect-pending 1 2>&1 | tee /tmp/0103-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0103-apply.out holds it). Whether 0103 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0103-applied.ok || { echo "STOP: verified-migrate exited 0, so 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0103-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0103 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the
  same sha twice** (the block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0103.md: OK`;
- **`0102: packages/db/migrations/0102_sat01_satisfaction_survey.sql, sha256 db12b967..., journal when 1788502300000`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it, then the target guard's `host:`, `port:`, `ref:` and
  `target verified: production, session pooler.`;
- **the pre-check prints `10` OK verdicts, no VACUOUS and no FAIL,** and its own SUMMARY row reads
  `10 OK / 0 VACUOUS / 0 FAIL`: `journal_rows_before` 100; verdict 2 naming 0102 as the newest row at
  1788502300000; verdict 5 `1 entry, anon SELECT,UPDATE,USAGE, grantable 0`; then its ten CARRY rows
  and four INFO rows, and after them the table FOR THE RECORD, every SEQUENCES default as it stands;
- **`the pre-check profile: 10 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, ...`. GREEN
  reports the CARRY row `sequences_before` and the INFO row that counts the sequences on which
  `anon` holds a privilege, exactly as printed.** They are the one fact never measured on
  production. Neither stops the sitting;
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`;**
- **the clock and the clinics:** `Lisbon weekday and time <DHHMM> (...): closed by the weekday table`,
  `active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: 0 of <n>`
  with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof
  lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside
  it. ...`; otherwise the STOP, with nothing applied;
- **verified-migrate, teed whole to `/tmp/0103-apply.out`:**
  `file       0103_revoke_anon_sequences_default.sql present, sha256 matches`,
  `journal    100 row(s) applied, last when=1788502300000`,
  `pending    1  [0103_revoke_anon_sequences_default]` (exactly one), the drizzle-kit banner with its
  stdout, stderr and exit, then `journal    100 -> 101  (delta 1)`,
  `0103_revoke_anon_sequences_default present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0103 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the journal from
  the database rather than trusting these lines.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only onward path to
stage 2. Any other ending is a `STOP:` line and a non-zero exit. A refusing target guard prints
`STOP: the target guard refused or failed (its lines are above). Nothing was applied` before psql runs
the pre-check and before verified-migrate. A failed apply prints `STOP: the apply exited <code>: ...`,
exits with that same code and writes no `/tmp/0103-applied.ok`, so stage 2 refuses. A failed `touch`
of that marker after an exit-0 apply prints `STOP: verified-migrate exited 0, so 0103 IS APPLIED and
the write stands, ...`.

**THE PRE-CHECK'S PROFILE IS 10 OK / 0 VACUOUS / 0 FAIL, AND THE BLOCK REQUIRES ALL THREE NUMBERS.**
A VACUOUS there means the default this migration revokes is not in the database as it was measured:
`anon` holds nothing in it (verdict 5), or the entry names nobody else (verdict 6). That is the
profile of a database that never carried the platform's default (8 OK / 2 VACUOUS / 0 FAIL) or of
one where 0103 is already applied. Either way it is not the database that was measured, the block
STOPs with `STOP: the pre-check printed [<n>] VACUOUS verdicts, ...`, and nothing is applied.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable; **3**
BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from `_journal.json`, an
already-applied migration or a pending count that is not 1, and AFTER drizzle has run on a journal
that moved by the wrong amount or moved without the approved sha256; **4** if drizzle itself failed
or on any thrown error; **5** if drizzle reports success and the journal did not move. Exit 3 can
therefore follow a committed apply too. The `tee` keeps that exit: `pipefail` makes the pipeline's
status the code of its rightmost command that failed.

**Exit 4 does not always mean nothing was applied.** drizzle applies the file's statements and the
journal row in ONE transaction, so the migration is either wholly applied or not at all. **If stage 1
ended non-zero after the `--- drizzle-kit migrate ---` banner had printed, the halt rule governs:
GREEN pastes nothing else and reports the exit code and the whole output.** The read that answers
whether 0103 is applied is `packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs
only on the owner's or the lead's word.

**WHEN A BOUND FIRES, GREEN'S TRANSCRIPT DOES NOT NAME IT** (0101's rehearsal, 2026-10-05, with a
held lock). drizzle-kit prints `undefined`, and pnpm prints
`[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: drizzle-kit migrate`. The
text `canceling statement due to lock timeout` is only in the server's log. What the transcript does
show is enough to read it: the apply exits 4, the journal reads 100 to 100, there is no applied
marker, and nothing was applied. GREEN reports those lines as printed and names no cause. **Neither
bound is expected to fire here:** the statement takes no table lock (see "G7").

**drizzle-kit prints two NOTICE objects between its banner and its success line,**
`42P06 schema "drizzle" already exists, skipping` and `42P07 relation "__drizzle_migrations" already
exists, skipping` (measured in 0099's rehearsal). They are not a halt.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was applied,** and
before the `--- only now` line the previous sitting's transcripts are untouched. **After that line,
the apply's STOP says it may have applied, and the marker's STOP says it did;** both are the halt
rule's post-commit case.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -o pipefail
SHA0103=8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59
SHAPOST=22e2ac620b0e80a1e535207fe206a74d9db1d687da215075289b5639acd7cdea
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0103-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0103-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0103-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0103-main.sha) || { echo "STOP: stage 0's record /tmp/0103-main.sha could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0103.sha256 || { echo "STOP: this document is not the approved one. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0103_revoke_anon_sequences_default.sql || { echo "STOP: 0103 is not on disk. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0103-anon-sequences-default.sql || { echo "STOP: the post-check is not on disk. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0103_revoke_anon_sequences_default.sql | cut -d' ' -f1)" = "${SHA0103}" ] || { echo "STOP: 0103 on disk is not the approved file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0103-anon-sequences-default.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0103-window.ok || { echo "STOP: no run window is recorded for this sitting. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0103-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0103-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0103-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0103-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0103-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
SQ=$(carry sequences_before)
S=$(carry secdef_functions_before)
AD=$(carry anon_default_before)
SM=$(carry sequence_acl_md5)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
DP=$(carry dml_profile_md5)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${SQ}" ] && [ -n "${S}" ] && [ -n "${AD}" ] && [ -n "${SM}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${DP}" ] || { echo "STOP: a carry did not parse out of the transcript. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${T} ${SQ} ${S}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+ [0-9]+' || { echo "STOP: a count carry is not a number. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${AD}" = "SELECT,UPDATE,USAGE" ] || { echo "STOP: the carry anon_default_before reads [${AD}], not SELECT,UPDATE,USAGE, which a pre-check of 10 OK cannot have printed, so the transcript is not this sitting's pre-check. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${SM} ${PM} ${FM} ${RM} ${CM} ${DM} ${DP}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){6}' || { echo "STOP: an md5 carry is not 32 hex characters. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_before=${J} tables_before=${T} sequences_before=${SQ} secdef_before=${S} anon_default_before=${AD} sequence_acl=${SM} policies=${PM} functions=${FM} relation_acl=${RM} column_acl=${CM} default_acl=${DM} dml_profile=${DP}"
if [ "${SQ}" = 0 ]; then WOK=13; WVAC=1; else WOK=14; WVAC=0; fi
echo "the post-check profile this sitting must print, chosen by sequences_before=${SQ}: ${WOK} OK / ${WVAC} VACUOUS / 0 FAIL (verdict 5, no existing sequence moved, reads VACUOUS where public holds no sequence, and never OK)"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0103-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v sequences_before="${SQ}" -v secdef_before="${S}" -v anon_default_before="${AD}" -v sequence_acl_md5="${SM}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v dml_profile_md5="${DP}" -c "begin read only" -f scripts/db/postcheck-0103-anon-sequences-default.sql -c "rollback" 2>&1 | tee /tmp/0103-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written, so it has confirmed nothing and contradicted nothing. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0103-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0103-postcheck.out || true)
VACS=$(grep -cE '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0103-postcheck.out || true)
[ "${VACS}" = "${WVAC}" ] || { echo "STOP: the post-check printed [${VACS}] VACUOUS verdicts, not ${WVAC}, the number sequences_before=${SQ} allows. A VACUOUS verdict is not a pass. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${OKS}" = "${WOK}" ] || { echo "STOP: the post-check printed [${OKS}] OK verdicts, not ${WOK}. A verdict that is missing prints no FAIL. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0103 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0103}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0103 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0103 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0103-stage2.ok || { echo "STOP: the pass mark /tmp/0103-stage2.ok could not be written, so the closing read would refuse. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0103 POST-CHECK PASSED. 10/10 pre-check OK, post-check ${OKS} OK / ${VACS} VACUOUS / 0 FAIL, the profile for ${SQ} sequences in public, journal ${J} to ${JA}; anon holds nothing in the public SEQUENCES default of postgres, tables ${T} and SECURITY DEFINER functions ${S} unchanged. Paste the closing journal read now."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `checking from the recorded sha <sha>` and whether main moved;
`docs/migration-apply-0103.md: OK`; the run window line with now before the end; the carry line
reads `journal_before=100` and `anon_default_before=SELECT,UPDATE,USAGE`; then
`the post-check profile this sitting must print, chosen by sequences_before=<n>: ...`; the target
guard; the post-check, whose own SUMMARY row reads the same profile: **`13 OK / 1 VACUOUS / 0 FAIL`
where `sequences_before` was 0, the VACUOUS being verdict 5, and `14 OK / 0 VACUOUS / 0 FAIL` where
it was 1 or more;** verdict 1 reads `1 entry, anon none; control SELECT,UPDATE,USAGE; before
SELECT,UPDATE,USAGE`; then the table FOR THE RECORD, every SEQUENCES default as it now stands, with
no `postgres | public | anon` row and the `supabase_admin | public | anon` row still there; the
journal reads `100` before and `101` after, with 0103's sha256 in it exactly once; the last line
reads exactly
`0103 POST-CHECK PASSED. 10/10 pre-check OK, post-check <13 or 14> OK / <1 or 0> VACUOUS / 0 FAIL, the profile for <n> sequences in public, journal 100 to 101; anon holds nothing in the public SEQUENCES default of postgres, tables <T> and SECURITY DEFINER functions <S> unchanged. Paste the closing journal read now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only path to the
closing read. Any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands.
`/tmp/0103-stage2.ok` is written last, so after any STOP the closing read refuses.

**THE PROFILE, NOT "NO FAIL".** Stage 2 picks the profile from the carried `sequences_before`
BEFORE the post-check runs, prints it, and then requires the post-check's three counts to equal it:
0 FAIL, exactly the VACUOUS count the profile names, exactly the OK count. A VACUOUS where none is
allowed stops the sitting; so does an "all OK" where verdict 5 ran over nothing, because an OK over
an empty set is the result this repository does not accept. Stage 2 also refuses a carry
`anon_default_before` that is not `SELECT,UPDATE,USAGE`: with any other value the post-check's
verdict 1 could not read OK, and a pre-check of 10 OK cannot have printed one.

**EVERY STOP OF STAGE 2 AND OF THE CLOSING READ SAYS WHAT STANDS,** because each fires after the
commit and is read by somebody deciding what to do next: `0103 IS APPLIED and the write stands. Run
nothing again, not stage 0 and not stage 1`. The first three STOPs of stage 2 and the first two of
the closing read come before the block has read stage 1's applied marker, so they say it
conditionally (`If stage 1 ended with its line 0103 APPLIED, then ...`); every later one says it
flatly, **with five exceptions, where the block's own read of the database CONTRADICTS the
marker.** A STOP cannot say "the sha256 of 0103 is in the journal 0 times" and "0103 IS APPLIED" in
one breath. On those five the STOP says exactly this and no more: `Stage 1 recorded that it applied
0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and
not stage 1, and report; the lead rules`. They are, in stage 2, a FAIL verdict of the post-check (a
FAIL of verdict 1, 12 or 13 is such a contradiction, and the block does not know which verdict
failed), the journal count that is not the pre-check's plus one, and the count of 0103's sha256 in
the journal that is not 1; and in the closing read, a journal that does not read 101 and a read
that does not list 0103 as APPLIED. The script test requires the flat sentence on every other
post-commit STOP, the UNKNOWN sentence on exactly those five, and never both on one line.

**The post-check not completing is NOT among the five, and that differs from 0101 on purpose.**
0101's post-check named the column the migration created, so on a database without it the statement
was refused and psql's own STOP was where a contradiction landed. This post-check names nothing
0103 creates: on a database without the revoke it completes and prints FAIL on verdicts 1, 12 and
13 (measured on the before state: 10 OK / 1 VACUOUS / 3 FAIL). A psql run that did not complete
(a lost connection) has read nothing, so it contradicts nothing, and its STOP says the write stands.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 2 exited 0 with its last line
`0103 POST-CHECK PASSED. ...`.

```
(
set -o pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0103-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0103-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0103-main.sha) || { echo "STOP: stage 0's record /tmp/0103-main.sha could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0103.sha256 || { echo "STOP: this document is not the approved one. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: origin/main did not read as a full 40-character sha [${NOW}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0103-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0103-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0103-stage2.ok -newer /tmp/0103-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0103-window.ok || { echo "STOP: no run window is recorded for this sitting. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0103-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0103-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0103-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 101' /tmp/0103-journal-after.out || { echo "STOP: the journal read after the apply does not say 101. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0103_revoke_anon_sequences_default[.]sql$' /tmp/0103-journal-after.out || { echo "STOP: the journal read does not list 0103 as APPLIED. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0103-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0103-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 101, 0103 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and whether main moved; the run window line with now before its
end; the reader's and its module's sha256 line; then the read printed IN FULL through `tee`:
`journal rows on production: 101`, every migration file on the recorded sha listed `APPLIED`, 0103
last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, and the last
line, exactly,
`CLOSING READ: the journal reads 101, 0103 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted. **WHAT THE EXIT MEANS:** exit 0 with that last line is
the only pass; any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands, which
the STOP line itself says. The closing read asserts the sidecar like every other block, and reads
the worktree's HEAD, the recorded sha and stage 2's pass mark into checked variables before it
compares them.

## What every verdict must read

**Every verdict of both files is OK, VACUOUS or FAIL, and each file's last row is a SUMMARY that
prints the profile it just read.** A verdict that can read VACUOUS tests FAIL first, then VACUOUS,
then OK: an empty subject can neither print OK nor hide a failure
(`scripts/db/precheck-0103-anon-sequences-default.sql`, lines 290 to 293 and 298 to 300;
`scripts/db/postcheck-0103-anon-sequences-default.sql`, lines 267 to 320; the script test reads
the order of every such CASE).

**Pre-check, 10 verdicts, all `OK` on production as measured, each with its control:** 0 the
transaction is READ ONLY; 1 0103 absent by hash (control: the same count finds 0102 once); 2 0102
present by hash once, the newest row, at its journal `when`; `journal_rows_before` **100**; 4 the
session is `postgres`, the role 0103 names (control: `anon` is no member of it); 5 THE PREMISE: the
`public` SEQUENCES default of `postgres` grants `anon` exactly SELECT, UPDATE, USAGE, none
grantable (control: the same parse on a planted item; **VACUOUS when `anon` holds nothing there**);
6 `anon` reaches that default by its own grant only: no PUBLIC item, and `anon` inherits from no
other grantee (**VACUOUS when the entry names no other grantee**); 7 no GLOBAL default of `postgres`
grants `anon`, PUBLIC or a role `anon` inherits from a sequence privilege; 8 the five roles exist;
`secdef_functions_before`, every one owned by `postgres`. Then 10 CARRY rows (`tables_before`,
`sequences_before`, `anon_default_before`, `sequence_acl_md5`, `policies_md5`, `functions_md5`,
`relation_acl_md5`, `column_acl_md5`, `default_acl_md5`, `dml_profile_md5`; with
`journal_rows_before` and `secdef_functions_before`, the twelve carries stage 2 reads) and 4 INFO
rows: the server version; the other creator roles whose `public` SEQUENCES default grants `anon` a
privilege (on production, `supabase_admin`); the sequences in `public` on which `anon` holds a
privilege, as `<k> of <n>`; what `authenticated` and `service_role` hold in the same default.

| Where the pre-check runs | Its profile | Stage 1 |
|---|---|---|
| a database that carries the platform's default, 0103 not applied (production as measured; the local stack) | 10 OK / 0 VACUOUS / 0 FAIL | goes on |
| a database that never carried the default | 8 OK / 2 VACUOUS / 0 FAIL with the entry removed on the local stack; 7 OK / 2 VACUOUS / 1 FAIL on a plain `CREATE DATABASE` | STOPs, nothing applied |
| a database where 0103 is already applied | FAIL on 1, 2 and `journal_rows_before`, VACUOUS on 5 | STOPs, nothing applied |

**Post-check, 14 verdicts:** 0 READ ONLY; 1 THE CHANGE: the default grants `anon` nothing (FAIL
while `anon` holds anything there, so it is FAIL on the before state; VACUOUS, never OK, when the
carry `anon_default_before` reads `none`; control: the planted item); 2 no other path: no PUBLIC
item, and `anon` inherits from no grantee left in the entry; 3 no GLOBAL default; 4 every OTHER
default privilege in the database hashes to the carry, `supabase_admin`'s included; 5 no existing
sequence moved: the same count and the same md5 (**VACUOUS when `public` holds none**); 6 every
privilege on every relation in `public`; 7 every column privilege; 8 the app roles' SELECT, INSERT,
UPDATE and DELETE profile; 9 every policy; 10 every function, and the SECURITY DEFINER count; 11
the table count; 12 the journal `+ 1`; 13 0103 by hash once, the newest row.

| Where the post-check runs | Its profile | Stage 2 |
|---|---|---|
| after the apply, `public` holds no sequence (expected of production) | **13 OK / 1 VACUOUS / 0 FAIL**, the VACUOUS being verdict 5 | passes, because `sequences_before` was 0 |
| after the apply, `public` holds one sequence or more | **14 OK / 0 VACUOUS / 0 FAIL** | passes, because `sequences_before` was not 0 |
| the before state (0103 not applied) | 10 OK / 1 VACUOUS / 3 FAIL: verdicts 1, 12 and 13 | STOPs, UNKNOWN |
| a database that never carried the default | 11 OK / 3 VACUOUS / 0 FAIL: no row about the default reads OK | not reached in a sitting: stage 1 has stopped, and stage 2 refuses the carry `none` |

**The post-check is not a standing invariant for 4 to 11:** the next migration that grants, creates
a sequence, a function or a table, or adds a policy moves them. It is an assertion about this
apply.

**No carry's name is a substring of another's or of any other row's `check` column,** because stage
2's `carry()` matches column 1 with `index()`; the script test asserts it.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check (the card's SCOPE sentence) | Discharged by | Layer |
|---|---|---|
| the two SET LOCAL lines | the file's bytes, pinned in every block; the SET LOCAL gate in CI | the file |
| "prove the default before": `anon` SELECT, UPDATE, USAGE | pre-check 5, 6 and 7 | the catalogue |
| "and after": `anon` nothing, by any path | post-check 1, 2 and 3 | the catalogue |
| "no existing sequence's ACL moves" | post-check 5 and 6 (5 reads VACUOUS where there is none: it then proves nothing, and says so) | the catalogue, by md5 |
| nothing else moved | post-check 4 and 7 to 11 | the catalogue, by md5 |
| production journal reads 101, 0103 by hash | post-check 12 and 13, stage 2, and the closing journal read | the database |
| the next sequence gives `anon` nothing | **NOT DISCHARGED ON PRODUCTION** (a READ ONLY transaction creates no sequence). IN ACTION on the local stack | the executor, on a throwaway |
| G7: no `auth` table and no table reception writes is locked | **NOT DISCHARGED ON PRODUCTION.** On a throwaway: the rehearsal's four readings ("Rehearsal", "G7: THE LOCK READ") and two readings on the build lane's stack | a throwaway |
| the sitting is in closed hours | stage 0's and stage 1's clock arms, by machine | the apply machine |

## Rollback

**Said exactly: there is no automatic rollback, the restoring statement is one sentence, and nobody
runs it from this document.**

- **Before the COMMIT there is nothing to undo.** drizzle applies the three statements and the
  journal row in one transaction. If anything fails, the transaction rolls back and the default is
  as it was (`journal    100 -> 100  (delta 0)`).
- **After the COMMIT, the statement that restores the default is the migration's own sentence
  turned round:**
  `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;`
  Measured on the local stack by the document agent on 2026-10-08, in a transaction that was rolled
  back: after 0103 and then this statement the entry read
  `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`,
  byte for byte what it read before 0103, and a sequence created after it gave `anon` USAGE, SELECT
  and UPDATE again.
- **Who runs it: it is a production write, so it is a migration of its own.** It takes the next
  free number by a ruling, starts with the two SET LOCAL lines, is authored by SOLO, held, rehearsed
  and reviewed, and is applied by GREEN on the owner's dispatch, exactly as this one. The journal
  row of 0103 stays: a journal row is never deleted, and the restoring migration is a new row after
  it. **GREEN never runs that statement from this document, in this sitting or any other; SOLO
  never runs it at all; and no block here contains it** (the script test refuses a block that
  does). The one other hand that can run it is the owner's own, pasting it into the Supabase SQL
  Editor, which `CLAUDE.md` keeps as his ("Who applies migrations"); that is his decision and is not
  proposed here.
- **Why a rollback is not expected to be wanted.** The apply changes what a FUTURE sequence is born
  with. No sequence exists on the local stack, no code uses one, and nothing reads the default. No
  failure of the application is expected from this change; the first thing that could notice it is a
  later migration that creates a sequence for `anon` and forgets its own GRANT, and that migration's
  own review and tests are where it shows.
- **What a rollback does not reach.** A sequence created between the apply and a restoring grant
  keeps what it was born with: the restoring statement changes the default again, not that
  sequence.

## OWNER CLICKS, in order

Nothing below is done by SOLO or by GREEN. Each is the owner's, and each waits for the one before.

| # | Click | When | What it starts |
|---|---|---|---|
| 1 | On `PR-NUMBER-PENDING`: take the label `held-for-apply` off | after SOLO's READY line (rehearsal recorded, sweep listed, R4 PASS, CI green on the head) | nothing by itself. SOLO never removes this label (ruling of 2026-09-27) |
| 2 | On `PR-NUMBER-PENDING`: merge | right after click 1, and **before 21:00 Lisbon** for a sitting the same night ("Merges allowed until 21:00 Lisbon, none from 21:00 until GREEN's report") | main is then one migration ahead of production. SOLO has disarmed every armed PR first, and nothing else merges until GREEN's report |
| 3 | Launch GREEN (a fresh session with the apply settings) and hand it SOLO's dispatch, which names `0103_revoke_anon_sequences_default.sql` | in closed hours by the weekday table (on 2026-10-08, a Thursday: from 21:00 Lisbon), inside the dispatch's run window, and after the re-arm report (S-1008-B: "after the re-arm report") | the sitting: BEFORE YOU START, stage 0, CLOCK CHECK, stage 1, stage 2, the closing read |
| 4 | Read GREEN's report | when it arrives | merges resume. If the report carries a STOP: nothing is pasted again, and the lead rules |

**There is no click after the apply for 0103 itself:** no count GATE-CHANGE, no label, no second
merge. The board card's PR and the `CLAUDE.md` docs PR are SOLO's, Tier A.

## Rehearsal

**REHEARSED ON 2026-10-08, 14:33 TO 14:45 LISBON, WITH LIMITS.** No block of this document ran
whole to its last line. Each of the four stopped at its own STOP, where this document predicts
before a merge, and is NOT REHEARSED as a whole block. What a local database can prove was run on
its own, with this document's own lines: the pre-check, the apply through `verified-migrate.mjs`
and drizzle-kit, the post-check, a second apply, and G7. **G7 read as strategy expects: no `auth`
table and no table reception writes is locked.** The record comes first, as the rehearsal agent
reported it. The build lane's run and the document agent's run follow it, and neither is the
rehearsal.

### The rehearsal, 2026-10-08, as the rehearsal agent reported it

**Where and when.** 2026-10-08, 14:33:41 to 14:45:40 Lisbon. Every time below was read by
machine: the start and the end of each run by `TZ=Europe/Lisbon date`, whose zone read `WEST`, and
an instant inside a run from the database's own clock, which reads UTC (Lisbon was UTC plus one
hour). It was a Thursday inside clinic hours, so every clock arm read `open`. Run from this
branch's worktree at head `04ac9821` (`04ac982133cbf3880303a7cc47766b15328ef14d`), with this
document as it stood at that head, before this record was written into it (sha256
`88564a76b613b6e8e2ea40315a51c446bd27e89c310d09969fe9d5dce539fa7e`), and its four blocks taken
out of it by machine. This record changed no byte of any block. Run under the lead's standing
rule, verbatim in its prompt. The agent wrote neither the migration nor this document.

**The database.** Lane `green` (project `OsteoJP-green`, 127.0.0.1:54922), a local Supabase stack
that carries the platform's default privileges. It was found running, in the before state, and
read before anything ran (14:33:41, READ ONLY):

- PostgreSQL 17.6 (aarch64); the session is `postgres`, and `postgres` is no member of
  `supabase_admin` (`false`);
- the mirror `0000` to `0102`, 100 rows in `supabase_migrations.schema_migrations`;
- a drizzle journal of 100 rows, the newest 0102 (`db12b967...`, `when` 1788502300000);
- **0 sequences** in `public`;
- 2 active `public.locations` rows, open 08:00 to 20:00;
- **`pg_default_acl`, the `public` SEQUENCES entry of `postgres`:
  `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`.**
  It names `anon=rwU/postgres`, so the thing 0103 revokes is really there.

Tools: psql client 18.6, node 22.22.3, pnpm 11.1.3, drizzle-kit 0.31.10 with the `postgres` driver
3.4.9, zsh 5.9, bash 3.2.57, Supabase CLI 2.100.0.

**How each run was made.** One runner started `zsh -f` or `bash --noprofile --norc` with an
environment of six names it sets itself and nothing inherited: `PATH`, `HOME`, `LANG`, `TERM`, and
lane `green`'s URL as `DATABASE_URL_DIRECT` and as `DATABASE_URL`. No `PG*` variable was set (read
by name: all nine unset). Each text ran in GREEN's tool shape,
`true && eval '<text>' < /dev/null && echo TOOL-CHAIN-CONTINUED`. The production environment file
was never read, sourced or handed to a program.

**SUBSTITUTIONS, ONLY THESE.**

1. **The `cd` to the apply checkout became this worktree:** one line in each block, and no other
   byte of any block.
2. **The database is lane `green` on 127.0.0.1,** its URL supplied by the runner. The lines that
   load the production environment file did not run and are NOT REHEARSED: stage 1's and stage 2's
   `set -o allexport && . ... && set +o allexport` line, and the closing read's
   `node --env-file=...` line as it is written.
3. **Nothing stood in for `origin/main`, for the target guard, for the journal reader, for the
   dispatch's run window or for the `/tmp/0103-` paths.** `/tmp` held no `0103-` file before the
   first run. The rehearsal wrote six real ones (`0103-check-journal.out`, `0103-precheck.new`,
   `0103-precheck.out`, `0103-postcheck.out`, `0103-apply.out`, `0103-applied.ok`) and removed all
   six at 14:45:32; `/tmp` held none after. `/tmp/0103-main.sha` and `/tmp/0103-window.ok` never
   existed, and nobody wrote either by hand.

**WHOLE BLOCKS: NONE OF FOUR RAN TO ITS LAST LINE.** Each was pasted whole, in order, under zsh
and again under bash (14:33:50 to 14:34:02). Each stopped at its own STOP with exit 1, printed no
`TOOL-CHAIN-CONTINUED` and wrote no record. The two shells printed the same lines.

| Block | Where it stopped, in both shells |
|---|---|
| stage 0 | Its first lines ran for real: the clean worktree check, the fetch, the detached checkout of `origin/main` and the HEAD CHECK, which printed `origin/main and HEAD: 5c619c75ecd7ae60a1f2eae973c512b5838ed8a6`. Then `STOP: the document pin is not on disk at origin/main`, as "STAGE 0" predicts before a merge. The worktree was put back on the branch after each run |
| stage 1 | `STOP: stage 0 recorded no sha in this sitting. The sitting stops` |
| stage 2 | `STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules` |
| the closing read | `STOP: stage 1 left no applied marker. If stage 1 ended with its line 0103 APPLIED, then 0103 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules` |

**PASTED AGAIN AFTER THE APPLY** (14:39:14 to 14:39:15, with the applied marker in place, both
shells, exit 1 each):

| Block | Where it stopped |
|---|---|
| stage 0 and stage 1 | `STOP: stage 1 has ALREADY APPLIED 0103 in this sitting, or the age of /tmp/0103-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word` |
| stage 2 | it passed its applied-marker check, then `STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0103 IS APPLIED and the write stands. ...` |
| the closing read | it passed its applied-marker check, then `STOP: stage 0 recorded no sha in this sitting. 0103 IS APPLIED and the write stands. ...` |

**FRAGMENTS: this document's own lines, run on their own. A pass here is not a pass of a block.**
Each fragment is a run of consecutive lines of one block, taken by line number by machine, each
checked against the text it must start with, between the block's own `(` and `)` and under its
variable lines. Where a line prints the sha it runs from, `MAIN` or `REC` was set to the
worktree's head by hand. Each ran under zsh and under bash, except the lines that write.

| Fragment | Lisbon, exit | Result |
|---|---|---|
| stage 0, from `test -f ${DOCPIN}` to the end of the clock arm | 14:34:50, 1 and 1 | `docs/migration-apply-0103.md: OK`; `newest journal entry: idx 100, when 1788502400000, tag 0103_revoke_anon_sequences_default, of 101; before it idx 99, when 1788502300000, tag 0102_sat01_satisfaction_survey`; `0102 on disk: 0102_sat01_satisfaction_survey.sql, sha256 db12b967...`; check-journal's `101 .sql files match 101 journal entries in order`. Then **the clock arm on the real clock, in the safe direction:** `Lisbon weekday and time 41434 (...; the clock read 41434 WEST): open by the weekday table`, the three proofs (`yes`, `yes, by construction`, `no, by construction`) and `STOP: Lisbon 41434 is inside clinic hours by the weekday table ...`. The three lines after it (the record of the sha and the last line) did not run |
| stage 1, from the marker check to the pins, then THE REAL TARGET GUARD | 14:35:09, 1 and 1 | `docs/migration-apply-0103.md: OK`; `0102: packages/db/migrations/0102_sat01_satisfaction_survey.sql, sha256 db12b967..., journal when 1788502300000`; then the guard: `host: 127.0.0.1`, `port: 54922`, `ref:  postgres`, **`REFUSING: project ref is "postgres", not the production project.`**, and the block's `STOP: the target guard refused or failed (its lines are above). Nothing was applied`. A marker line placed after it did not print. **Stage 1 is NOT REHEARSED past the guard as a block** |
| stage 1, the pre-check line and its three counts | 14:35:20, 0 and 0 | the BEFORE state: **10 OK / 0 VACUOUS / 0 FAIL**, and `the pre-check profile: 10 OK / 0 VACUOUS / 0 FAIL. REPORT, AS PRINTED ABOVE, ...`. The two shells' transcripts are byte-identical |
| stage 1, the clock and the clinics | 14:35:29, 1 and 1 | `Lisbon weekday and time 41435 (...): open by the weekday table`; `active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: 0 of 2`; `the clinics' own rows against the weekday table: inside`; the three proofs; `STOP: Lisbon 41435, clock open, clinics inside. ...` |
| stage 1, the three lines from `--- only now` | 14:35:31, 0 (zsh only) | the old records removed, the transcript moved to `/tmp/0103-precheck.out` |
| stage 2, the sidecar and the pins, the carries, then THE REAL TARGET GUARD | 14:35:36, 1 and 1 | `carries from this run: journal_before=100 tables_before=51 sequences_before=0 secdef_before=36 anon_default_before=SELECT,UPDATE,USAGE ...` with seven md5 values; `the post-check profile this sitting must print, chosen by sequences_before=0: 13 OK / 1 VACUOUS / 0 FAIL (...)`; then the guard's same four lines and the block's STOP. **Stage 2 is NOT REHEARSED past the guard as a block** |
| stage 2, the carries, the post-check line and its counts, ON THE BEFORE STATE | 14:35:36, 1 and 1 | **10 OK / 1 VACUOUS / 3 FAIL: FAIL on verdicts 1, 12 and 13, VACUOUS on 5.** The block's own line then stopped: `STOP: the post-check printed [3] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0103, and this read does not agree. Treat the state as UNKNOWN. ...` |
| stage 1, the four lines from `--- the apply` | 14:38:26, 0 (zsh only) | THE APPLY, below |
| stage 2, the carries, the post-check, SR-51, the journal's last three rows and the last line, ON THE AFTER STATE | 14:39:00, 0 and 0 | **13 OK / 1 VACUOUS / 0 FAIL**, the VACUOUS being verdict 5; `journal rows before=100 after=101, 0103 present by hash`; the last line as this document's EXPECT. Byte-identical transcripts in the two shells |
| the closing read, the sidecar and the reader's pins | 14:39:25, 1 and 1 | `reader: 825b7818..., its target module: e037104d... (at the recorded sha 04ac9821...)`. Then the reader, **run on its own with no environment file named, which is not the block's line:** `` REFUSED: this script reads drizzle.__drizzle_migrations, which only production uses, and the target's ref is not dfotoodqvmjhbdcxyaxf. A local lane is migrated by `supabase db reset` and records in supabase_migrations.schema_migrations instead, so the answer here would be an error rather than a smaller truth. `` **The closing read is NOT REHEARSED from the reader on** |

**THE PRE-CHECK ON THE BEFORE STATE, 10 OK** (14:35:20):

- verdict 0 `on`; verdict 1 `0; control 1`; verdict 2 `1 row, newest is 0102, when 1788502300000`;
  `journal_rows_before` 100; verdict 4 `postgres; control false`;
- **verdict 5 `1 entry, anon SELECT,UPDATE,USAGE, grantable 0; control SELECT,UPDATE,USAGE`;**
- verdict 6 `PUBLIC items 0, grantees anon inherits from 0; control 3 other grantees`; verdict 7
  `0; control SELECT,UPDATE,USAGE`; verdict 8 `5`; `secdef_functions_before` 36;
- CARRY: `tables_before` 51, **`sequences_before` 0**, `anon_default_before` `SELECT,UPDATE,USAGE`,
  and seven md5 values (over 0 sequences, 102 policies, 262 functions, 2475 relation privileges,
  9 column privileges, 333 default privileges, 204 role and relation pairs);
- INFO: `17.6`; `supabase_admin`; **`0 of 0`** sequences on which `anon` holds a privilege;
  `authenticated SELECT,UPDATE,USAGE; service_role SELECT,UPDATE,USAGE`;
- SUMMARY `10 OK / 0 VACUOUS / 0 FAIL`.

**THE APPLY** (14:38:26 to 14:38:30, verified-migrate through pnpm and drizzle-kit, exit 0):
`file       0103_revoke_anon_sequences_default.sql present, sha256 matches`;
`journal    100 row(s) applied, last when=1788502300000`;
`pending    1  [0103_revoke_anon_sequences_default]`; the drizzle-kit banner with the two NOTICEs
(42P06 and 42P07) and its line `migrations applied successfully!`, `stderr: (nothing)`, `exit:   0`;
`journal    100 -> 101  (delta 1)`; `0103_revoke_anon_sequences_default present by sha256: yes`;
`OK: the journal moved by exactly the pending count and carries the approved sha256.`; then the
marker and `0103 APPLIED. Paste stage 2 now.`

**THE POST-CHECK ON THE AFTER STATE, 13 OK / 1 VACUOUS / 0 FAIL** (14:39:00):

- **verdict 1 `1 entry, anon none; control SELECT,UPDATE,USAGE; before SELECT,UPDATE,USAGE`;**
- verdict 2 `PUBLIC items 0, grantees anon inherits from 0; control 3 other grantees`; verdict 3
  `0; control SELECT,UPDATE,USAGE`;
- verdict 4, every other default privilege: `8733030e...` over 333, the pre-check's md5;
- **verdict 5 `0 sequences, d41d8cd9...`: VACUOUS,** because `public` holds none;
- verdicts 6 to 11: every carried md5 unchanged, 36 SECURITY DEFINER functions, 51 tables;
- verdict 12 `101`; verdict 13 `1, newest is 0103`;
- FOR THE RECORD: no `postgres | public | anon` row, and the `supabase_admin | public | anon` row
  still there;
- the last line: `0103 POST-CHECK PASSED. 10/10 pre-check OK, post-check 13 OK / 1 VACUOUS / 0 FAIL, the profile for 0 sequences in public, journal 100 to 101; anon holds nothing in the public SEQUENCES default of postgres, tables 51 and SECURITY DEFINER functions 36 unchanged. Paste the closing journal read now.`

**THE DEFAULT PRIVILEGES, BEFORE AND AFTER** (`pg_default_acl` for schema `public`, all six rows,
read at 14:33:41 and at 14:40:49):

| Creator | Object type | Before | After |
|---|---|---|---|
| `postgres` | SEQUENCES | `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` | `{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` |
| `postgres` | FUNCTIONS | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | the same bytes |
| `postgres` | TABLES | `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}` | the same bytes |
| `supabase_admin` | SEQUENCES | `{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}` | the same bytes: it still grants `anon` |
| `supabase_admin` | FUNCTIONS | `{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}` | the same bytes |
| `supabase_admin` | TABLES | `{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}` | the same bytes |

No default without a schema exists before or after (0 rows). One row of six changed, and
post-check 4 holds every other default privilege in the database to the pre-check's md5.

**G7: THE LOCK READ. No relation in schema `auth` is locked, and no table reception writes is
locked: 0 relations in `auth`, 0 in `public`, 0 in `storage`, 0 in `realtime`, in every reading.**
Each reading was taken from a second session, from `pg_locks` joined to `pg_class` and
`pg_namespace`, while the migration's transaction was open and had not committed.

1. **Held open, the file's statements** (14:37:17). Session 1 ran `BEGIN`, the migration file as
   it is on disk, then waited, then rolled back. Every row the second session read for that
   backend: ROW EXCLUSIVE on the sequence `graphql.seq_schema_version`, and the transaction's own
   `transactionid` and `virtualxid`. Counted: `auth` 0, `public` 0, `storage` 0, `realtime` 0,
   tables in any schema 0, relation locks in all 1; the controls read 23 tables in `auth` and 51 in
   `public`. No backend was waiting on a lock. The second session still read the default with
   `anon` in it, because nothing had committed.
2. **Held open, with the journal row as drizzle writes it** (14:43:29, rolled back). The same,
   plus ROW EXCLUSIVE on the table `drizzle.__drizzle_migrations` and on its sequence
   `drizzle.__drizzle_migrations_id_seq`. As read here, this is everything the apply's transaction
   still holds when it commits.
3. **The real apply, sampled** (14:41:40, the second cycle below). A second session read
   `pg_locks` of every other backend in a loop, 57,295 times in 19.6 seconds (one read every 0.343
   ms on average), while verified-migrate ran drizzle-kit. The backend that ran the migration
   (application `postgres.js`, one transaction) showed its `virtualxid` from `begin`, then from the
   ALTER on ROW EXCLUSIVE on `graphql.seq_schema_version` and its `transactionid`, and no other
   row. No backend was seen waiting for any lock. The journal insert and the COMMIT fell between
   two reads.
4. **The apply made to wait** (14:44:13, the bound below; 146,058 reads, one every 0.219 ms). This
   denser reading also caught what lives only inside a statement: ACCESS SHARE on
   `pg_catalog.pg_extension` during the first statement, and ROW EXCLUSIVE on
   `pg_catalog.pg_default_acl` and its two indexes during the ALTER. None of those four was still
   held while the insert waited five seconds.

**The whole list, every relation and mode seen in any reading:**

| Relation | What it is | Mode | Held |
|---|---|---|---|
| `pg_catalog.pg_extension` | a catalogue table | ACCESS SHARE | inside the first statement only |
| `pg_catalog.pg_default_acl` | the catalogue table whose one row changes | ROW EXCLUSIVE | inside the ALTER only |
| `pg_catalog.pg_default_acl_oid_index`, `pg_catalog.pg_default_acl_role_nsp_obj_index` | its two indexes | ROW EXCLUSIVE | inside the ALTER only |
| `graphql.seq_schema_version` | the platform's sequence that counts schema changes | ROW EXCLUSIVE | from the ALTER to the end of the transaction |
| `drizzle.__drizzle_migrations` | the migration journal, which only the applier writes | ROW EXCLUSIVE | from the journal insert to the COMMIT |
| `drizzle.__drizzle_migrations_id_seq` | the journal's own sequence | ROW EXCLUSIVE | the same |
| the transaction's own `transactionid` and `virtualxid` | not relations | EXCLUSIVE | the transaction |

- **No relation in `auth`. No relation in `public`,** where the application's own 51 tables live,
  reception's among them, nor in `storage` or `realtime`. The one ordinary table in the list is
  the migration journal, in ROW EXCLUSIVE, which blocks no read and no INSERT, UPDATE or DELETE.
- **So G7's EXPECT holds, and G7 does not make this document "closed hours only".** R9 proof 3
  still does (section "R9"), so the document stays closed hours only, for that reason alone.
- **Limits.** A local stack, not production: production's platform configuration was not read.
  Readings 1 and 2 are exact for a lock that lasts to the end of the transaction. Readings 3 and 4
  are samples: a lock taken and released inside one statement, in less than the gap between two
  reads, can be missed, and reading 3 missed the catalogue locks reading 4 caught.
- **Two readings were thrown away, and why.** The first held reading (14:36:56) had the agent's
  own `SELECT` on `pg_default_acl` inside session 1, which added ACCESS SHARE locks of its own on
  `pg_default_acl` and `pg_namespace`; reading 1 is the repeat with nothing in the session but the
  file. The first sampler, during the first apply (14:38:26), joined `pg_stat_activity` inside one
  transaction, where that view is frozen at its first read, so it never saw the migration's
  backend; readings 3 and 4 are the corrected sampler.

**APPLIED A SECOND TIME, AND WHAT HAPPENS.**

- **The apply lines again** (14:39:13, zsh and bash): `journal    101 row(s) applied, last when=1788502400000`,
  `pending    0  [-]`, `PRECONDITION FAILED: 0103_revoke_anon_sequences_default's sha256 is ALREADY in drizzle.__drizzle_migrations.`,
  then the block's `STOP: the apply exited 3: ...`, exit 3. Nothing ran against the database but
  verified-migrate's READ ONLY read. The applied marker kept its time.
- **The whole blocks again:** stage 0 and stage 1 stop on the marker (the table above).
- **The pre-check on the applied state** (14:39:23, both shells): **6 OK / 1 VACUOUS / 3 FAIL,**
  FAIL on 1 (`1; control 1`), 2 (`1 row, newest is NOT 0102, when 1788502400000`) and
  `journal_rows_before` (`101`), VACUOUS on 5 (`1 entry, anon none, grantable 0`). The block's line
  stopped: `STOP: the pre-check printed [3] FAIL verdicts, ... Nothing was applied and no earlier transcript was touched`.
- **The SQL itself, a second time** (14:39:47). The migration file again in one committed
  transaction: psql exit 0, and the entry, the md5 over every row of `pg_default_acl`
  (`51b14b27...`) and the journal count (101) read the same before and after. The mirror file
  outside a transaction, the Supabase CLI's shape: two
  `WARNING:  SET LOCAL can only be used in transaction blocks`, exit 0, the same three readings
  again. A second apply changes nothing.

**THE SECOND CYCLE, WITH A SEQUENCE THAT EXISTS** (14:40:49 to 14:42:16). To get a second before
state on the same lane, the agent ran the restoring statement of "Rollback" and committed it,
removed the lane's own journal row for 0103 (a throwaway's row; on production a journal row is
never deleted), and created one sequence in `public` as `postgres`.

- **The restoring statement, committed:** the entry read
  `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`
  again, byte for byte the first before state.
- **The sequence created BEFORE the revoke** was born with
  `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`:
  `anon` USAGE, SELECT and UPDATE all true.
- **The pre-check: 10 OK / 0 VACUOUS / 0 FAIL,** with `sequences_before` **1** and the INFO row
  **`1 of 1`**.
- **The post-check on that before state: 11 OK / 0 VACUOUS / 3 FAIL** (1, 12 and 13), and the
  block's line stopped on `[3] FAIL verdicts`.
- **The apply** (14:41:30 to 14:41:40, exit 0): `journal    100 -> 101  (delta 1)`,
  `present by sha256: yes`, `0103 APPLIED. Paste stage 2 now.`
- **The post-check: 14 OK / 0 VACUOUS / 0 FAIL** in both shells, byte-identical. Verdict 5 read
  `1 sequences, a28e64c7...`, the pre-check's md5: OK over a real sequence, not over nothing. The
  last line: `0103 POST-CHECK PASSED. 10/10 pre-check OK, post-check 14 OK / 0 VACUOUS / 0 FAIL, the profile for 1 sequences in public, journal 100 to 101; ...`
- **In action, after the apply:**

| Sequence | Its ACL | `anon` USAGE, SELECT, UPDATE | `authenticated`, `service_role` |
|---|---|---|---|
| the one created BEFORE the revoke | `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`, unchanged | true, true, true: 0103 touches no sequence that exists | all three true |
| one created AFTER the revoke (rolled back) | `{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` | **false, false, false** | all three true |

  In the first cycle the same probe, as `anon`: `select nextval(...)` on a sequence created after
  the apply answered `ERROR:  permission denied for sequence rehearsal_0103_probe_after`.

**THE BOUND, FIRED ON PURPOSE** (14:44:12 to 14:44:18, on the before state). A third session held
SHARE on the lane's journal table, so the apply's last statement, the journal insert, had to wait.

- The insert waited from 13:44:13.713 UTC, and the server's log reads
  `2026-10-08 13:44:18.713 UTC [4532] postgres@postgres ERROR:  canceling statement due to lock timeout at character 13`:
  five seconds. **So `SET LOCAL lock_timeout = '5s'` is in force inside drizzle's transaction.**
- GREEN's transcript does not name it, as "WHEN A BOUND FIRES" says: drizzle-kit printed
  `undefined`, pnpm printed
  `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: drizzle-kit migrate`,
  then `exit:   1`, `journal    100 -> 100  (delta 0)`,
  `0103_revoke_anon_sequences_default present by sha256: NO`,
  `FAIL: drizzle-kit migrate exited 1.` and the block's `STOP: the apply exited 4: ...`, exit 4.
  The text `lock timeout` is nowhere in the transcript.
- **Nothing was applied, the ALTER included.** The pre-check right after (14:45:09) read 10 OK /
  0 VACUOUS / 0 FAIL, journal 100, with `anon` still in the default: the ALTER had run inside the
  transaction and went with its rollback. The apply is all or nothing.
- In the held run inside psql that began at 14:36:50, `show lock_timeout` read `5s` and
  `show statement_timeout` read `1min` after the file's statements.

**THE packages/db SUITE ON THE APPLIED LANE** (14:42:38 to 14:43:19, `pnpm exec vitest run` in
`packages/db` with `DATABASE_URL` at lane `green`, 0103 applied, CI's command): 101 files,
**1555 of 1555 passed,** none skipped, vitest exit 0. The apps/web and apps/api DB-gated suites
were not run.

**WHAT WAS OWED, ITEM BY ITEM** (the list below, "What the rehearsal agent owes"):

| # | Owed | Done |
|---|---|---|
| 1 | a database that really carries the default, `pg_default_acl` read first | yes: lane `green`, the entry names `anon=rwU/postgres` |
| 2 | an active clinic inside 08:00 to 21:00 | yes: `0 of 2` outside, `inside` |
| 3 | the four blocks and GREEN's two, verbatim, every halt for real | the four ran whole and stopped at their own STOPs; the lines a local database can run ran as fragments. **GREEN's two blocks are NOT REHEARSED: the dispatch is not written** |
| 4 | the post-check on the before and the after state | yes: 10 OK / 1 VACUOUS / 3 FAIL before; 13 OK / 1 VACUOUS / 0 FAIL after with no sequence; 14 OK / 0 VACUOUS / 0 FAIL after with one |
| 5 | G7 | yes: as expected |
| 6 | a sequence created before and after | yes: the table above |
| 7 | CI's `db-tests` on the pull request's head | not the rehearsal's: there is no pull request yet |

**SEVEN OBSERVATIONS, none of which changed a byte of a block.**

1. **Stage 0's fetch is a real fetch.** It moved `origin/main` from `bf0000a1` to `5c619c75`
   (#1568, two board files; no file this document pins differs between the two) and pruned twelve
   stale remote branches in the shared repository.
2. **drizzle sends four statements, not three.** The file's last breakpoint is followed by its
   closing comment (section 5), which drizzle sent as a statement of its own after the ALTER. The
   server accepted it, and both applies exited 0.
3. **The new journal row's `id` read 129, then 130, not 101.** The id is a serial, and earlier
   rolled-back inserts on this lane had advanced it. The post-check and stage 2 count rows and
   compare the hash, never the id. The id of production's new row is not predicted here.
4. **check-journal's line begins with a check mark** before `Migration journal reconciled: 101 ...`;
   stage 0's `grep -qF` matches inside the line (0100's rehearsal saw the same).
5. **Stage 2's last line reads `the profile for 1 sequences in public`** where there is one. It is
   wording only.
6. **Another default names `anon` on the local stack:** `postgres`'s SEQUENCES default in schema
   `storage` reads `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}`.
   The card names `public`, so 0103 leaves it, and section 4 already lists other schemas as out of
   scope. It is written here for the lead, not decided.
7. **The reader's refusal names the production ref,** so on a refusal `tee` would write it into
   `/tmp/0103-journal-after.out`. On production the reader does not refuse.

**THE DOCUMENT'S TESTS, AFTER THIS RECORD WAS WRITTEN** (from 14:51 Lisbon, each in an environment
with no database URL, and each run again on the bytes that were committed). The sidecar was
regenerated in the same commit.

| Run | Result |
|---|---|
| `node --test scripts/anon-sequences-default-0103.test.mjs` | 38 of 38 passed. Its first run read 37 of 38: the record quoted drizzle-kit's check mark, and the test holds this document to ASCII. The record now says it in words |
| `node --test scripts/owner-blocks-survive-zsh.test.mjs` | 5 of 5 passed |
| `node scripts/check-journal.mjs` | 101 files, 101 entries, the mirror matching by content |
| `pnpm test:scripts`, whole | 1463 of 1463 passed, none skipped, 54 suites |
| `GATE_BASE_REF=main node scripts/assert-gates-unchanged.mjs` | `GATE FREEZE: 99 gate files match their pins, package.json scripts unchanged.` |

**THE LANE AFTERWARDS.** Lane `green` was returned to the before state at 14:43:28 (the restoring
statement, and the lane's journal row for 0103 removed; the planted sequence had been dropped at
14:42:38), read back by the
pre-check at 14:45:09 (10 OK / 0 VACUOUS / 0 FAIL, journal 100, 0 sequences), and stopped at
14:45:40 with `node scripts/lane-stack.mjs down --lane green`. Its data is kept in its docker
volume.

### What the rehearsal agent owes before the dispatch is issued

Run under the lead's standing rule, verbatim in its prompt: "A script's own REFUSE or STOP line is a
halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to
get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the
document says so."

1. **A database of its own that REALLY CARRIES THE DEFAULT.** A throwaway built by plain
   `CREATE DATABASE` carries no Supabase default privileges, so the thing this migration revokes
   does not exist there, and the revoke would be proven on nothing. A local Supabase stack carries
   it. **Read `pg_default_acl` before the apply and record what it read:** the `public` SEQUENCES
   entry of `postgres` must name `anon=rwU/postgres`. Then `supabase/migrations` minus 0103, so
   `0000` to `0102`, and a drizzle journal of 100 rows built from `_journal.json`, the newest 0102
   (`db12b967...`, `when` 1788502300000). Never lane `blue`, `purple` or `amber`.
2. **At least one active `public.locations` row** whose hours lie inside 08:00 to 21:00, or stage
   1's clinic read STOPs, correctly.
3. **This document's four blocks and GREEN's two, extracted verbatim,** under psql, with
   `verified-migrate.mjs` reaching drizzle through pnpm, every halt run for real, and each allowed
   substitution named in the prompt, never "the way earlier rehearsals did". The target guard
   refuses any host but the production pooler, so every block that runs it halts on the throwaway at
   that line unless the lead rules a substitution; the journal reader's reads are NOT REHEARSED for
   the same reason. Before the merge every block also halts on `origin/main`. **The clock arm runs
   on the real clock:** inside clinic hours stages 0 and 1 STOP, which is the arm proven in the safe
   direction; in closed hours they pass. The agent never sets `TZ` or the clock to choose.
4. **The post-check on the BEFORE state and on the AFTER state.** It pins a literal, so it must be
   shown to FAIL before (expected: 10 OK / 1 VACUOUS / 3 FAIL, verdicts 1, 12 and 13) and to pass
   after (13 OK / 1 VACUOUS / 0 FAIL with no sequence; 14 OK / 0 VACUOUS / 0 FAIL with one planted
   before the pre-check). OK, VACUOUS and FAIL are three results, and the record gives the profile.
5. **G7: the locks.** While the migration's transaction is open, before its COMMIT, read
   `pg_locks` joined to `pg_class` from a second session and list every row. EXPECT no `auth` table
   and no table reception writes. Record the list. If it shows either, this document and the READY
   line say "closed hours only" (they already do, by R9 proof 3) and section "R9" is amended.
6. **A sequence created before and after,** in the rehearsal database: `anon` holds the three on
   the first and nothing on the second.
7. **CI's `db-tests` on the pull request's head,** which applies 0103 from the mirror on a real
   Supabase stack.

### The build lane's run, 2026-10-08, as the build agent reported it

**Where.** Lane `green` (127.0.0.1:54922), a local Supabase stack, `supabase/postgres` 17.6,
migrations 0000 to 0102, with a drizzle journal of 100 rows added so the pre-check runs as written.
Every write below ran inside a transaction that was rolled back; the lane was left in the BEFORE
state. **verified-migrate and drizzle-kit did not run. No block of this document ran.**

| Run | Result |
|---|---|
| `pg_default_acl` for `public`, before and after | as the table in section 1: one row of six changed |
| sequences in `public` | 0, so `anon` holds nothing on any |
| a sequence created before the revoke, and one after | `anon` all three true; then all three false, `authenticated` and `service_role` keeping theirs |
| `postgres` a member of `supabase_admin` | false |
| the locks, from a second session | ROW EXCLUSIVE on `graphql.seq_schema_version` and the transaction's own ids; 0 relations in `auth`, `storage`, `realtime` or `public` |
| the pre-check under psql | **10 OK / 0 VACUOUS / 0 FAIL** |
| the post-check on the BEFORE state | **10 OK / 1 VACUOUS / 3 FAIL**: FAIL on 1, 12 and 13 |
| the migration file, its journal row, then the post-check, in one rolled-back transaction | **13 OK / 1 VACUOUS / 0 FAIL**; with one sequence present, 14 OK / 0 VACUOUS / 0 FAIL |
| a database that never carried the default (the entry removed first, in a transaction) | pre-check 8 OK / 2 VACUOUS / 0 FAIL; post-check 11 OK / 3 VACUOUS / 0 FAIL |
| a plain `CREATE DATABASE` with no default privileges and no OsteoJP schema | pre-check 7 OK / 2 VACUOUS / 1 FAIL; post-check 4 OK / 10 VACUOUS / 0 FAIL. No row about the default reads OK in either |
| control arms, each planted alone | 9 pre-check arms and 20 post-check arms each turned the expected verdict to FAIL; a missing `-v` stops with psql exit 3 and no verdict. One could not be planted: `anon` made a member of `postgres` (`permission denied to grant role postgres`), so that half of pre-check 4 was not broken on purpose |
| the mirror file applied outside a transaction on a scratch database (the Supabase CLI's shape) | exit 0, the two 25P01 SET LOCAL warnings, the default revoked; a second apply exit 0 and changed nothing |
| `node scripts/check-journal.mjs`, `--check` of the mirror sync, the SET LOCAL gate | 101 of 101; in sync, 101 files; 13 of 13 with 0103 in scope |
| `pnpm test:scripts`, the gate freeze, `pnpm lint`, `pnpm typecheck`, `pnpm test` | 1425 of 1425 in 54 suites; 99 gate files match their pins; exit 0 each |

**Its controls are hand-picked arms, not the mutation sweep,** which is NOT READY step 3.

### The document agent's run, 2026-10-08

On the same lane, READ ONLY or rolled back, with the psql client 18.6 against server 17.6. **No
whole block ran here either.**

| Run | Result |
|---|---|
| the pre-check file under psql, then stage 1's own three counting lines on its transcript | exit 0; FAIL 0, VACUOUS 0, OK 10; the SUMMARY row `10 OK / 0 VACUOUS / 0 FAIL`; `journal_rows_before` 100, `tables_before` 51, `secdef_functions_before` 36, `sequences_before` 0 |
| stage 2's own `carry()` on that transcript, and three of its four carry checks (the counts, `anon_default_before`, the md5 shapes) | all twelve carries parsed and passed those checks; `anon_default_before` read `SELECT,UPDATE,USAGE` |
| the post-check under psql inside `begin read only`, handed those twelve carries, on the BEFORE state, then stage 2's three counting lines | exit 0; FAIL 3 (verdicts 1, 12, 13), VACUOUS 1 (verdict 5), OK 10 |
| the migration's three statements, one at a time, this backend's `pg_locks` after each, rolled back | as the table under "G7"; `lock_timeout` `5s` and `statement_timeout` `1min` inside it |
| 0103's statement, then the restoring statement of "Rollback", then a new sequence, rolled back | as "Rollback" says; the entry read the same after the ROLLBACK as before |
| `scripts/anon-sequences-default-0103.test.mjs` on macOS | 38 of 38 passed, none skipped; 224 injected faults in each shell, bash with errexit forced off and zsh in GREEN's shape |
| `scripts/owner-blocks-survive-zsh.test.mjs`, which scans this document | 5 of 5 passed |
| `pnpm test:scripts`, whole | exit 0: 1463 of 1463 passed, none failed, none skipped, 54 suites (the 1425 the build agent read, and this test's 38) |
| `GATE_BASE_REF=main node scripts/assert-gates-unchanged.mjs` | exit 0: `GATE FREEZE: 99 gate files match their pins, package.json scripts unchanged.` The one file the manifest does not name is this branch's new script test, which the freeze allows |

### The fault-injection harness (not a rehearsal)

**Why.** In a Claude session `set -e` stops no pasted block. Every block halts by explicit guards,
and `scripts/anon-sequences-default-0103.test.mjs` proves it on every CI run.

**How.** As 0100's, 0101's and 0102's harness: each block, extracted verbatim, runs as
`true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`. Every external command it calls
(git, psql, node, pnpm, shasum, tee, mv, rm, touch, cat, find, date, grep, cut, awk, head, tail, wc,
tr) is a stub on PATH: git, psql and the node programs never run for real (`node -e` does, on local
files), and the block's `cd`, its `/tmp/0103-` paths and its env file are moved into a scratch folder
first, so nothing touches a real host, the secrets folder or a database. The fake apply tree is
built from what the branch holds: the migration, 0102's real file, and a journal of the live entries
up to 0102 with 0103's entry after them (cut and rebuilt, so a later migration does not redden this
test). The positive control runs each block with every stub succeeding and requires its last line.
Then each call is made to fail in turn, and the block must (a) exit non-zero with the tool chain
stopped, (b) print none of its pass lines, (c) write none of its records after the failing point,
and print a `STOP:` line. Extra faults: the apply worktree missing, the env file missing, a record
path that is a directory, verified-migrate exiting 2, 4 and 5 as well as 3, and every clock read and
every field of the window record exiting 0 with EMPTY output. The stub `date` refuses to answer
unless the block called it with `TZ=Europe/Lisbon`.

| Block | Faults | Halt | Allowed to continue, and why |
|---|---|---|---|
| stage 0, closed hours | 50 | 47 | 3 R9 proof 1 calls, which read `no` and decide nothing |
| stage 1, closed hours | 79 | 76 | 3 R9 proof 1 calls, as in stage 0 |
| stage 2 | 61 | 61 | none |
| the closing journal read | 34 | 34 | none |

224 faults, run on 2026-10-08 (Lisbon) under zsh in GREEN's exact shape and under bash with errexit forced off; every one held. **CI runs the bash arm only:** zsh is not on the ubuntu runner, and
the repository's convention for that (`scripts/apply-lane/apply-lane-settings.test.mjs`) is
followed, so on the GitHub runner alone the zsh arm is a reported skip, and anywhere else a missing
zsh fails the test.

**Beyond the sweep, each run whole in both shells:**

- **THE VERDICT PROFILE, stage 1:** a pre-check transcript of 8 OK / 2 VACUOUS (the database that
  never carried the default), one with a FAIL, and one with a verdict missing each STOP before the
  clock arm and before verified-migrate; ten OK passes, with 0 sequences and with 2.
- **THE VERDICT PROFILE, stage 2:** 13 OK / 1 VACUOUS passes only where `sequences_before` was 0,
  and 14 OK only where it was not; the other way round each STOPs, as do two VACUOUS, a missing
  verdict and a FAIL; and a carry `anon_default_before` of `none` STOPs before the guard and before
  psql. With the profile line fixed at "all OK" the expected production result is refused, which is
  the control of why the block asserts a profile.
- **A ZONE THAT DID NOT LOAD:** every block with a clock that answers `UTC`, `GMT`, `CET`, `west`
  or no zone at all STOPs at the clock, with nothing recorded and no guard, psql, apply or reader
  run after it; with `WET` each passes as with `WEST`.
- **THE REAL `date`** is not stubbed in one test: the blocks' own clock lines run against the
  system's `date` at twelve fixed instants (Thursday 2026-10-08 20:59 and 21:00, the six ruled
  minutes, Monday 08:30 summer time, and three in winter time), in a process whose own zone is
  Tokyo; a misspelt zone and a line with no `TZ=` each STOP.
- **THE WEEKDAY TABLE:** stages 0 and 1 whole at the six ruled minutes and one green arm, and the
  arm's own `awk` program at every boundary of every weekday (84 cells). **THE CLINICS' ROWS:**
  stage 1 with one clinic's row outside 08:00 to 21:00, and with no active clinic. **THE WINDOW
  FEED:** stage 1 on eleven run-window records and clocks. **A RECORD THAT READS EMPTY OR SHORT,**
  **A READ THAT CONTRADICTS THE MARKER,** and **THE APPLIED MARKER'S AGE.**

**Added by the mutation sweep on 2026-10-08, each run whole in both shells** (why each is there is
under "Review history"): A PINNED FILE THAT DIFFERS OR IS NOT THERE (every pin of every block);
WHAT STAGES 0 AND 1 FIND ON DISK (a journal wrong in one fact, a second file under a number, a
dirty worktree, a checkout that left HEAD where it was, and no applied marker at all); and BETWEEN
THE STAGES (the window's end in stage 2 and the closing read, a clock that moved on during stage 1,
one read in another zone, a reading that is no weekday, a record that is gone, and what stage 2
and the closing read are handed).

**What the harness is not.** Its psql is a stub that prints a fixture. It proves that a block halts
and what it hands each program; it proves nothing about what the two check files print on a
database. That is the build lane's run, the document agent's run and the rehearsal.

### NOT REHEARSED, said one by one

Each by the lead's rule, and each with its reason. The rehearsal's record above says what did run.

- **All four blocks, as whole blocks.** None ran to its last line: each stopped at its own STOP
  (the tables under "WHOLE BLOCKS" and "PASTED AGAIN AFTER THE APPLY").
- **Every line that needs stage 0's record, `/tmp/0103-main.sha`:** stage 0's last three lines,
  which write it; stage 1's HEAD CHECK and its checkout of the recorded sha; the recorded-sha lines
  of stage 2 and of the closing read; stage 2's pass mark and the closing read's checks of it.
  Reason: before the merge stage 0 stops on `origin/main`, and nobody writes that record by hand.
- **Every line that needs the dispatch's run window, `/tmp/0103-window.ok`,** in stage 1 (both
  window checks), in stage 2 and in the closing read; **and GREEN's two blocks themselves.**
  Reason: the dispatch is not written, and nobody writes its record by hand.
- **The lines that load the production environment file,** in stages 1 and 2, and the closing
  read's `node --env-file=...` line as it is written. Reason: this lane never reads that file.
- **The target guard passing, and stages 1 and 2 past it as blocks.** The real guard ran against
  lane `green` in both and refused: `REFUSING: project ref is "postgres", not the production project.`
  The pre-check, the apply and the post-check ran as fragments, not as the blocks.
- **Both journal-reader reads,** the dispatch's and the closing read's, **and the closing read's
  four checks and its last line.** The reader refused lane `green`, and its pass is first seen in
  the sitting, as for 0100 and 0101.
- **The clock arm PASSING on a real clock.** The rehearsal ran at 14:34 on a Thursday, so stage
  0's and stage 1's arms stopped, which is the safe direction. Closed hours passing is proven in
  the fault-injection harness only.
- **`supabase db reset` applying the 0103 mirror as a first apply** (CI's path). The mirror ran
  under psql outside a transaction on the applied lane, as a second application. CI's `db-tests` on
  the pull request's head is the real proof.
- **The apps/web and apps/api DB-gated suites on a database with 0103 applied.** The packages/db
  suite ran there: 1555 of 1555.
- **Production's platform configuration, and production's sequences in `public`.**
- **The mutation sweep** is not the rehearsal's: NOT READY step 3.

## QUESTIONS THIS DOCUMENT DOES NOT ANSWER

Each is the lead's or the owner's. The document was built on the first option of each, and each is
also listed under "JUDGMENTS" where a block carries the choice.

1. **The card's ORDER sentence names "a read-only measurement and a read-only pre-check sitting on
   production before it".** (a) Stage 1's pre-check, which is READ ONLY and halts before any write
   on any profile but 10 OK / 0 VACUOUS / 0 FAIL, counts as that read, closed hours only: what this
   document does. (b) GREEN runs the pre-check alone in an earlier sitting, before the merge, from
   the pull request's head, on its own dispatch, as 0100's THE EARLIER PRE-CHECK SITTING did. That
   block is NOT in this document; adding it is an amendment with its own R4 round, and it is also
   what R9 proof 3 would need for any daytime sitting.
2. **A sequence found in `public` on production,** with or without `anon` holding a privilege on
   it. (a) The sitting goes on, GREEN reports the two rows, the lead rules afterwards: what this
   document does. (b) Stage 1 STOPs on `sequences_before` other than 0, because the card says "the
   default covers no object": one line added to stage 1, an amendment.
3. **A standing DB-gated test** ("the next sequence in `public` gives `anon` nothing"), so a later
   platform image or migration cannot re-grant it unseen. Not built: 0100, the model, has none, and
   it was not ruled. A Tier A follow-up after the apply, if wanted.

## JUDGMENTS, NOT RULINGS, in this document

Each is SOLO's where the rulings leave a choice; R4 and the lead may change any of them.

1. **No `set -e` in any block; line 2 is `set -o pipefail`.** 0100, 0101 and 0102 kept
   `set -eo pipefail`, reasoning that `-e` is real when a block runs as a script. This document
   reads the standing rule to the letter ("never set -e"): in GREEN's shape `-e` stops nothing, and
   a flag that only looks like a halt is worse than none. Nothing here leans on it: the harness runs
   every block with errexit off. The lead may put the `-e` back; the script test's static rules that
   forbid it would then change with it, and no harness result would.
2. **Stage 2 asserts a profile chosen by `sequences_before`, not "all OK".** On the expected
   production state the correct result holds a VACUOUS (verdict 5). The alternative, demoting
   verdict 5 to an INFO row, would hide "this proved nothing" inside a pass.
3. **Stage 2 refuses a carry `anon_default_before` other than `SELECT,UPDATE,USAGE`.** It is
   implied by stage 1's 10 OK; stating it makes a transcript from another run fail closed.
4. **R9 proof 2 is a fixed `yes` and proof 3 a fixed `no`,** as 0101 fixed both at `no`: a computed
   line could be flipped by an edit that removes the searched text, and a fixed line cannot. Proof
   2's `yes` rests on the statement's kind, which the sha256 pin fixes, not on a lock read.
5. **There is no daytime arm,** though the migration is catalog-only, because proof 3 does not hold
   and no earlier pre-check sitting was ruled (question 1).
6. **An existing sequence does not stop the sitting** (question 2).
7. **A post-check that did not complete says the write stands, not UNKNOWN** (stage 2, "EVERY
   STOP"). 0101's said UNKNOWN for a reason that does not apply here.
8. **Stage 1 reads the clinics' rows to check the weekday table, never to decide the hour,** as in
   0101 (its judgment 4).
9. **The restoring statement is described and not packaged.** No block, no file and no pending
   migration holds it. Writing one in advance would be authoring a production write nobody ruled.

## What this does NOT do, and what is out of scope

- **It revokes nothing from any sequence that exists,** and from no table, function or schema.
- **It does not touch `supabase_admin`'s defaults,** and cannot (section 4).
- **It does not touch `authenticated`, `service_role` or `patient`.**
- **It does not change the FUNCTIONS or the TABLES default.**
- **It does not record S-1008-B in `CLAUDE.md`** or move the board card. Each is its own PR.

## The op carries no DELETE and no TRUNCATE statement

Measured on the migration's code with its comments removed: **0 statements begin with DELETE, 0
begin with TRUNCATE,** and the words DELETE, TRUNCATE, DROP, INSERT, UPDATE, GRANT, POLICY, COPY,
MERGE and CREATE do not appear in its code at all; it holds exactly one REVOKE
(`scripts/anon-sequences-default-0103.test.mjs` requires it). The check files write nothing: the
pre-check opens its own READ ONLY transaction and ends in ROLLBACK, the post-check runs inside the
block's `begin read only`, and neither reads any table of people: every source they read is a
`pg_` catalogue or the drizzle journal.

## Review history

**R4 has not run on this document (NOT READY step 4).** Its verdict goes here when it does.

### The mutation sweep, 2026-10-08: one pass, mechanical

**In plain language.** A script changed every check in the two check files and in the four blocks,
one at a time, 1914 changes in all (a comparison turned round, a number moved by one, a condition
dropped, a whole check line deleted), and each changed copy was run to see whether anything
noticed. **For the two check files nothing was found that lets a wrong database through, and no
byte of them changed.** **For the four blocks 67 changes ran green through every test there was;**
each is now caught by a test added in this sweep. No block changed either: the blocks were right,
and it was the test that could not see some of their lines.

**Who, when, what it touched.** Run by a sweep agent that wrote neither the migration, the check
files nor this document, from 15:28 to 17:34 Lisbon (clock reads, zone `WEST`). The scripts and
their result files are in the sweep's scratchpad and are not committed.

- **No byte of the migration, of either check file or of any block changed,** in the sweep or
  because of it. Every pin in this document, the sha256 of both check files and every reading of
  the rehearsal stand as they were.
- **What changed:** `scripts/anon-sequences-default-0103.test.mjs` (one static rule, three tests,
  four inputs for its stubs, two readings for the clinics' rows; 38 tests became 41) and this
  section, with the sidecar. The test is this branch's own new file and is not yet in the gate
  manifest, so this is no gate edit.
- **No byte pin was allowed to catch a mutant.** For a check-file mutant the document's `SHAPRE`
  or `SHAPOST` lines, the fact table's sha256 and the sidecar were regenerated first; for a block
  mutant the sidecar was. A mutant counts as caught only where a rule that reads the changed thing
  fails, or where a run ends differently.

#### Part C. The two check files: 975 mutants

**Where.** Lane `green` (127.0.0.1:54922), found stopped, in the before state the rehearsal left
(read first: the entry names `anon=rwU/postgres`, the journal holds 100 rows with 0102 the newest,
`public` holds 0 sequences). Only its database container was started (`supabase db start`, no
reset). Every state was planted inside a transaction that was rolled back, and nothing was
committed to the lane; it read the same afterwards. A second, plain database
(`sweep0103_plain`: a journal and nothing else) stood on the same server for the empty-set states.

**How a mutant is read.** The unmutated file ran first on every state (47 for the pre-check, 71
for the post-check; the two tables below). A mutant is CAUGHT BY A READING when, on some state, a
row's last column moves (OK, VACUOUS, FAIL, CARRY) or psql stops, where the unmutated file on the
same state does not. A pre-check mutant that prints another carry is handed on: the unmutated
post-check runs on the after state with those carries, and the mutant is caught if one of its
verdicts moves (112 were caught that way). The states are tried in this order and the first that
catches is counted: the readings the rehearsal recorded; then the build lane's two recorded states
(the entry removed, and a plain database); then the arms this sweep planted.

| | Pre-check | Post-check | Both |
|---|---|---|---|
| Mutants | 514 | 461 | 975 |
| Caught by a reading the rehearsal recorded | 273 | 243 | 516 |
| Not by those: caught by one of the build lane's two recorded states | 11 | 44 | 55 |
| Not by those: caught by an arm this sweep planted | 69 | 83 | 152 |
| **No verdict moves on any state** | **161** | **91** | **252** |
| of those 252: a static rule of the script test fails | 10 | 13 | 23 |
| of those 252: the printed transcript differs on a rehearsed reading | 88 | 54 | 142 |
| of those 252: the printed transcript differs on a planted arm only | 41 | 15 | 56 |
| of those 252: nothing differs anywhere | 22 | 9 | 31 |

- **An existing test or a rehearsed reading catches 597 of the 975.** The script test's static
  rules fail on 178; 155 of those are also caught by a reading.
- **46 of the 723 caught are caught by psql stopping** (the mutant is not valid SQL on that state,
  or the file's own STOP fired). The blocks treat a psql that stops as a halt.
- **The operators,** each applied once at every place it fits: a comparison swapped (`=` and `<>`,
  `>` and `>=`, `<` and `<=`, `~`, `IN`, `IS NOT NULL`); AND and OR exchanged; a predicate negated;
  a condition dropped (TRUE where it stood among ANDs, FALSE among ORs, both for a lone WHEN); a
  string or number literal changed; a verdict's result literal changed; `ORDER BY id DESC` turned
  to ASC; a `\if` guard removed, and made to fire on a value that is there.

**THE 252 ON WHICH NO VERDICT MOVES, by family. None lets a wrong database through, and none led to
a change of either file.**

| Family | Mutants | Why no verdict moves |
|---|---|---|
| Expressions that print and decide nothing | 171 | The pre-check's four INFO rows (36), both SUMMARY rows (18), both FOR THE RECORD tables (40), and a count or a word printed beside a verdict (77: `over N policies` and its fellows, `1 entry`, `anon none`, `is 0102`, `is 0103`). 170 of them change what is printed on some state; no block reads those rows |
| A count the post-check reads only at zero | 25 | The number of default privileges, of role and relation pairs, of column privileges, of functions and of other grantees decides VACUOUS when it is 0 and is otherwise only printed. Each of these turns one non-zero count into another. The mutants that turn an empty set into a non-empty one, or the reverse, are among the caught: the plain database is where 38 post-check mutants are first caught, the small database PL2A 10 |
| The guard on a missing `-v`, removed | 14 | psql still stops with exit 3 and no verdict, because the value is then not substituted and the statement does not parse; only the STOP sentence is lost. The 12 of the post-check fail a static rule, which reads the list of required carries off these guards |
| The shape checks on the pre-check's eight CARRY rows | 16 | `md5()` always prints 32 hex characters, and the privilege list is built by the same statement, so the check cannot fail on any database: 8 dropped checks are equivalent, and the 8 whose FAIL was turned to OK fail a static rule |
| Inputs of a verdict that no database can move | 26 | Listed one by one below |

- **The control of pre-check 4, "`anon` is no member of `postgres`" (3).** It cannot be planted:
  `GRANT postgres TO anon` is refused even to the superuser, `role "postgres" is a member of role
  "anon"`. On a Supabase database this control can never read true. The verdict's other half, the
  session is `postgres`, is caught (arm p07).
- **The planted control `{anon=rwU/postgres}` (10, both files).** It parses a constant, so it reads
  the same on every database of one server version. It would move only on a server that reads an
  ACL item differently.
- **PUBLIC in two counts that are read after FAIL has been decided (6).** Where the entry holds a
  PUBLIC item the CASE has already said FAIL, so what the count of other grantees or of inherited
  grantees does with PUBLIC is never read.
- **Two conditions that repeat what the statement already says (4):** `d.grantee = anon` beside
  `pg_has_role(anon, d.grantee)` (a role has itself), and `attacl IS NOT NULL` before `aclexplode`
  (which returns no row for a NULL).
- **`'postgres'` in the list of five roles (1).** Changed to another role that exists, the count is
  still five; with `postgres` gone the statement stops before any verdict.
- **Pre-check 0 (2).** The file opens its own `BEGIN READ ONLY`, so this verdict cannot read FAIL
  while that line stands, and a static rule holds the line. The post-check's verdict 0 is caught
  (arm q37, a transaction that is not read only).

**Said so that nobody leans on them: the INFO rows, the SUMMARY rows and the FOR THE RECORD tables
are checked by no machine.** Stage 1 and stage 2 count the verdict rows themselves. The row GREEN is
asked to report, the sequences on which `anon` holds a privilege, has 14 mutants, and each prints
another `<k> of <n>` on one of the arms p25, p26u, p26s and p26w; the only reader of that row is
the person who reads GREEN's report.

**Five arms were added after the first pass, for 18 mutants the other states did not catch,** and
only those 18 were run again:

- p37, a stranger's newest row that carries 0102's own `created_at` (1: pre-check 2's `newest is
  0102`);
- p36, `authenticated` holding the default WITH GRANT OPTION (1: the grantable count's filter on
  `anon`);
- p38, exactly one SECURITY DEFINER function left (1: `secdef > 0`);
- q45, not applied and the entry naming `anon` alone (2: post-check 2's VACUOUS);
- PL2 and PL2A, a small database of its own with a sequence that has no ACL of its own (13). **It
  is the first reading in which a NULL `relacl` is actually read:** before it, the rule that a
  sequence's default ACL is read with code `'s'` was held by the static rule alone (6 of the 13).

**THE PRE-CHECK, unmutated, on every state** (lane `green`; each planted inside a transaction and rolled back):

| State | What is planted | The unmutated file reads | Mutants first caught here |
|---|---|---|---|
| B0 (rehearsed) | before the apply, no sequence in public | 10 OK / 0 VACUOUS / 0 FAIL | 248 |
| B1 (rehearsed) | before the apply, one sequence in public | 10 OK / 0 VACUOUS / 0 FAIL | 3 |
| A0 (rehearsed) | 0103 already applied (the pre-check a second time) | 6 OK / 1 VACUOUS / 3 FAIL (1 FAIL, 2 FAIL, journal_rows_before FAIL, 5 VACUOUS) | 22 |
| N (build lane) | the entry removed: a database that never carried the default | 8 OK / 2 VACUOUS / 0 FAIL (5 VACUOUS, 6 VACUOUS) | 3 |
| PLAIN (build lane) | a plain CREATE DATABASE with a journal and nothing else | 7 OK / 2 VACUOUS / 1 FAIL (5 VACUOUS, 6 VACUOUS, secdef_functions_before FAIL) | 8 |
| p01 (planted) | 0102's row deleted from the journal | 7 OK / 0 VACUOUS / 3 FAIL (1 FAIL, 2 FAIL, journal_rows_before FAIL) | 1 |
| p02 (planted) | 0102's hash twice, the second as the newest row | 7 OK / 0 VACUOUS / 3 FAIL (1 FAIL, 2 FAIL, journal_rows_before FAIL) | 2 |
| p03 (planted) | a stranger's row newer than 0102 | 8 OK / 0 VACUOUS / 2 FAIL (2 FAIL, journal_rows_before FAIL) | 0 |
| p04 (planted) | 0102's created_at moved by one | 9 OK / 0 VACUOUS / 1 FAIL (2 FAIL) | 1 |
| p05 (planted) | the oldest journal row deleted (99 rows, 0102 still newest) | 9 OK / 0 VACUOUS / 1 FAIL (journal_rows_before FAIL) | 0 |
| p06 (planted) | 0103's hash present as the OLDEST row | 8 OK / 0 VACUOUS / 2 FAIL (1 FAIL, journal_rows_before FAIL) | 0 |
| p07 (planted) | the session is supabase_admin, not postgres | 9 OK / 0 VACUOUS / 1 FAIL (4 FAIL) | 3 |
| p09 (planted) | the default grants anon SELECT and USAGE only | 9 OK / 0 VACUOUS / 1 FAIL (5 FAIL) | 3 |
| p10 (planted) | the default grants anon the three WITH GRANT OPTION | 9 OK / 0 VACUOUS / 1 FAIL (5 FAIL) | 2 |
| p10b (planted) | the default grants anon USAGE only, WITH GRANT OPTION | 9 OK / 0 VACUOUS / 1 FAIL (5 FAIL) | 1 |
| p11 (planted) | anon already out of the default, no journal row | 9 OK / 1 VACUOUS / 0 FAIL (5 VACUOUS) | 0 |
| p12 (planted) | the entry grants PUBLIC a privilege | 9 OK / 0 VACUOUS / 1 FAIL (6 FAIL) | 5 |
| p13 (planted) | anon inherits from authenticated, a grantee of the entry | 9 OK / 0 VACUOUS / 1 FAIL (6 FAIL) | 3 |
| p14 (planted) | the entry names anon and nobody else | 9 OK / 1 VACUOUS / 0 FAIL (6 VACUOUS) | 2 |
| p15 (planted) | a GLOBAL SEQUENCES default of postgres grants anon | 9 OK / 0 VACUOUS / 1 FAIL (7 FAIL) | 8 |
| p16 (planted) | a GLOBAL SEQUENCES default of postgres grants PUBLIC | 9 OK / 0 VACUOUS / 1 FAIL (7 FAIL) | 3 |
| p17 (planted) | a GLOBAL SEQUENCES default grants patient, and anon inherits from patient | 9 OK / 0 VACUOUS / 1 FAIL (7 FAIL) | 2 |
| p18 (planted) | a GLOBAL TABLES default of postgres grants anon (not a sequence default) | 10 OK / 0 VACUOUS / 0 FAIL | 1 |
| p19 (planted) | a GLOBAL SEQUENCES default of supabase_admin grants anon (another creator) | 10 OK / 0 VACUOUS / 0 FAIL | 1 |
| p21a (planted) | the role patient is missing (renamed) | 9 OK / 0 VACUOUS / 1 FAIL (8 FAIL) | 2 |
| p21b (planted) | the role authenticated is missing (renamed) | 9 OK / 0 VACUOUS / 1 FAIL (8 FAIL) | 1 |
| p21c (planted) | the role service_role is missing (renamed) | 9 OK / 0 VACUOUS / 1 FAIL (8 FAIL) | 0 |
| p21d (planted) | the role anon is missing (renamed): a STOP, not a verdict | psql exit 3, no verdict: `role "anon" does not exist` | 0 |
| p22 (planted) | one SECURITY DEFINER function owned by supabase_admin | 9 OK / 0 VACUOUS / 1 FAIL (secdef_functions_before FAIL) | 2 |
| p23 (planted) | no SECURITY DEFINER function in public at all | 9 OK / 0 VACUOUS / 1 FAIL (secdef_functions_before FAIL) | 0 |
| p25 (planted) | a sequence in public on which anon holds nothing | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p26u (planted) | a sequence on which anon holds USAGE only | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p26s (planted) | a sequence on which anon holds SELECT only | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p26w (planted) | a sequence on which anon holds UPDATE only | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p27 (planted) | -v prev_hash not passed: a STOP | psql exit 3, no verdict: `STOP: -v prev_hash is missing (the sha256 of 0102 as applied). This file refuses to guess.` | 0 |
| p28 (planted) | -v prev_when not passed: a STOP | psql exit 3, no verdict: `STOP: -v prev_when is missing (0102's journal when). This file refuses to guess.` | 0 |
| p31a (planted) | -v prev_hash is another migration's hash | 8 OK / 0 VACUOUS / 2 FAIL (1 FAIL, 2 FAIL) | 0 |
| p31b (planted) | -v prev_when is off by one | 9 OK / 0 VACUOUS / 1 FAIL (2 FAIL) | 0 |
| p32 (planted) | supabase_admin's public SEQUENCES default no longer grants anon | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p33 (planted) | authenticated holds SELECT only in the entry | 10 OK / 0 VACUOUS / 0 FAIL | 0 |
| p34 (planted) | a GLOBAL SEQUENCES default of postgres grants service_role, from which anon inherits nothing | 10 OK / 0 VACUOUS / 0 FAIL | 5 |
| p35 (planted) | a GLOBAL SEQUENCES default names patient ONLY (the owner's own item revoked), and anon inherits from patient | 9 OK / 0 VACUOUS / 1 FAIL (7 FAIL) | 0 |
| p36 (planted) | the default grants authenticated (not anon) WITH GRANT OPTION | 10 OK / 0 VACUOUS / 0 FAIL | 1 |
| p37 (planted) | a stranger's row newer than 0102, carrying 0102's own created_at | 8 OK / 0 VACUOUS / 2 FAIL (2 FAIL, journal_rows_before FAIL) | 1 |
| p38 (planted) | exactly one SECURITY DEFINER function left in public | 10 OK / 0 VACUOUS / 0 FAIL | 1 |
| PL2 (planted) | a small database of its own: one sequence with no ACL of its own (created before the default), one table, one policy, one column grant, one SECURITY DEFINER function, and the default for anon and authenticated | 10 OK / 0 VACUOUS / 0 FAIL | 3 |
| K (planted) | a richer before state: a sequence, a partitioned table, a view, a materialized view, a foreign table, PUBLIC grants, a column grant, a GLOBAL TABLES default | 10 OK / 0 VACUOUS / 0 FAIL | 15 |

**THE POST-CHECK, unmutated, on every state** (lane `green`; each planted inside a transaction and rolled back):

| State | What is planted | The unmutated file reads | Mutants first caught here |
|---|---|---|---|
| B0 (rehearsed) | the before state (0103 not applied) | 10 OK / 1 VACUOUS / 3 FAIL (1 FAIL, 5 VACUOUS, 12 FAIL, 13 FAIL) | 202 |
| A0 (rehearsed) | after the apply, no sequence in public | 13 OK / 1 VACUOUS / 0 FAIL (5 VACUOUS) | 36 |
| B1 (rehearsed) | the before state with one sequence | 11 OK / 0 VACUOUS / 3 FAIL (1 FAIL, 12 FAIL, 13 FAIL) | 5 |
| A1 (rehearsed) | after the apply, one sequence in public | 14 OK / 0 VACUOUS / 0 FAIL | 0 |
| N (build lane) | a database that never carried the default, journal row added | 11 OK / 3 VACUOUS / 0 FAIL (1 VACUOUS, 2 VACUOUS, 5 VACUOUS) | 6 |
| PLAIN (build lane) | a plain database, journal row added | 4 OK / 10 VACUOUS / 0 FAIL (1 VACUOUS, 2 VACUOUS, 4 VACUOUS, 5 VACUOUS, 6 VACUOUS, 7 VACUOUS, 8 VACUOUS, 9 VACUOUS, 10 VACUOUS, 11 VACUOUS) | 38 |
| q01 (planted) | applied, then anon given SELECT back in the default | 12 OK / 1 VACUOUS / 1 FAIL (1 FAIL, 5 VACUOUS) | 1 |
| q02 (planted) | applied; the carry anon_default_before says none | 12 OK / 2 VACUOUS / 0 FAIL (1 VACUOUS, 5 VACUOUS) | 0 |
| q03 (planted) | applied; the carry anon_default_before says SELECT,USAGE | 12 OK / 1 VACUOUS / 1 FAIL (1 FAIL, 5 VACUOUS) | 2 |
| q04 (planted) | applied; the entry grants PUBLIC a privilege | 11 OK / 1 VACUOUS / 2 FAIL (2 FAIL, 4 FAIL, 5 VACUOUS) | 7 |
| q05 (planted) | applied; anon inherits from authenticated, a grantee left in the entry | 11 OK / 1 VACUOUS / 2 FAIL (2 FAIL, 5 VACUOUS, 8 FAIL) | 5 |
| q06 (planted) | applied; the entry emptied of every grantee | 11 OK / 2 VACUOUS / 1 FAIL (2 VACUOUS, 4 FAIL, 5 VACUOUS) | 0 |
| q07 (planted) | applied; a GLOBAL SEQUENCES default of postgres grants anon | 11 OK / 1 VACUOUS / 2 FAIL (3 FAIL, 4 FAIL, 5 VACUOUS) | 8 |
| q08 (planted) | applied; a GLOBAL SEQUENCES default of postgres grants PUBLIC | 11 OK / 1 VACUOUS / 2 FAIL (3 FAIL, 4 FAIL, 5 VACUOUS) | 3 |
| q09 (planted) | applied; a GLOBAL SEQUENCES default grants patient, and anon inherits from patient | 10 OK / 1 VACUOUS / 3 FAIL (3 FAIL, 4 FAIL, 5 VACUOUS, 8 FAIL) | 2 |
| q10 (planted) | applied; a GLOBAL TABLES default of postgres grants anon | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 1 |
| q11 (planted) | applied; a GLOBAL SEQUENCES default of supabase_admin grants anon | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 1 |
| q12 (planted) | applied; the FUNCTIONS default lost anon's EXECUTE | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 0 |
| q13 (planted) | applied; authenticated lost UPDATE in the same entry | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 0 |
| q14 (planted) | applied; supabase_admin's public SEQUENCES default lost anon | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 0 |
| q15 (planted) | applied; the storage schema's SEQUENCES default lost anon | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 0 |
| q16 (planted) | applied; a sequence created after the pre-check | 12 OK / 0 VACUOUS / 2 FAIL (5 FAIL, 6 FAIL) | 3 |
| q17 (planted) | applied; the existing sequence lost anon's UPDATE | 12 OK / 0 VACUOUS / 2 FAIL (5 FAIL, 6 FAIL) | 2 |
| q18 (planted) | applied; the sequence dropped and another created (same count) | 12 OK / 0 VACUOUS / 2 FAIL (5 FAIL, 6 FAIL) | 0 |
| q19 (planted) | applied; the sequence the pre-check counted is gone | 12 OK / 0 VACUOUS / 2 FAIL (5 FAIL, 6 FAIL) | 0 |
| q20 (planted) | applied; anon granted SELECT on a table | 11 OK / 1 VACUOUS / 2 FAIL (5 VACUOUS, 6 FAIL, 8 FAIL) | 0 |
| q21 (planted) | applied; anon granted TRIGGER on a table (no DML verb) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 6 FAIL) | 0 |
| q22 (planted) | applied; a column privilege granted | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 7 FAIL) | 2 |
| q23 (planted) | applied; patient made a member of service_role. `patient` is NOINHERIT, so it gains no privilege and nothing should move | 13 OK / 1 VACUOUS / 0 FAIL (5 VACUOUS) | 0 |
| q24 (planted) | applied; a policy created | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 9 FAIL) | 2 |
| q25 (planted) | applied; one policy's expression changed (same count) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 9 FAIL) | 0 |
| q26 (planted) | applied; a function created | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 10 FAIL) | 3 |
| q27 (planted) | applied; one function made SECURITY INVOKER (same function count) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 10 FAIL) | 0 |
| q28 (planted) | applied; the carry secdef_before is one less | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 10 FAIL) | 1 |
| q29 (planted) | applied; a table created | 10 OK / 1 VACUOUS / 3 FAIL (5 VACUOUS, 6 FAIL, 8 FAIL, 11 FAIL) | 2 |
| q30 (planted) | applied; the carry tables_before is one less | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 11 FAIL) | 0 |
| q31 (planted) | the ALTER ran, the journal row is missing | 11 OK / 1 VACUOUS / 2 FAIL (5 VACUOUS, 12 FAIL, 13 FAIL) | 0 |
| q32 (planted) | applied; a stranger's row newer than 0103 (journal plus two) | 11 OK / 1 VACUOUS / 2 FAIL (5 VACUOUS, 12 FAIL, 13 FAIL) | 2 |
| q33 (planted) | applied; the oldest journal row deleted (the count did not move) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 12 FAIL) | 0 |
| q34 (planted) | applied; 0103's hash twice, the oldest row deleted (count plus one) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 13 FAIL) | 1 |
| q35 (planted) | the ALTER ran; 0103's hash is the OLDEST row, 0102 still newest (count plus one) | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 13 FAIL) | 0 |
| q36a (planted) | applied; the carry journal_rows_before is one less | 12 OK / 1 VACUOUS / 1 FAIL (5 VACUOUS, 12 FAIL) | 0 |
| q36b (planted) | applied; the carry sequences_before says 1 | 13 OK / 0 VACUOUS / 1 FAIL (5 FAIL) | 1 |
| q36m, seven arms | applied; one md5 carry replaced by thirty-two zeros, each of the seven in turn | 1 FAIL each, on the verdict that reads that carry: 5, 9, 10, 6, 7, 4, 8 | 0 |
| q37 (planted) | applied; the transaction is NOT read only | 12 OK / 1 VACUOUS / 1 FAIL (0 FAIL, 5 VACUOUS) | 2 |
| q38, twelve arms | applied; one `-v` carry not passed, each of the twelve in turn | psql exit 3, no verdict: `STOP: -v <name> is missing. This file refuses to guess.` | 0 |
| q40 (planted) | a plain database handed the carries of the real one: FAIL comes before VACUOUS | 5 OK / 2 VACUOUS / 7 FAIL (2 VACUOUS, 4 FAIL, 5 VACUOUS, 6 FAIL, 7 FAIL, 8 FAIL, 9 FAIL, 10 FAIL, 11 FAIL) | 0 |
| q41 (planted) | applied; anon inherits from service_role only | 11 OK / 1 VACUOUS / 2 FAIL (2 FAIL, 5 VACUOUS, 8 FAIL) | 0 |
| q42 (planted) | applied; the entry keeps postgres only | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 0 |
| q43 (planted) | applied; a GLOBAL SEQUENCES default of postgres grants service_role, from which anon inherits nothing | 12 OK / 1 VACUOUS / 1 FAIL (4 FAIL, 5 VACUOUS) | 5 |
| q44 (planted) | applied; a GLOBAL SEQUENCES default names patient ONLY, and anon inherits from patient | 10 OK / 1 VACUOUS / 3 FAIL (3 FAIL, 4 FAIL, 5 VACUOUS, 8 FAIL) | 0 |
| q45 (planted) | NOT applied; the entry names anon and nobody else | 8 OK / 2 VACUOUS / 4 FAIL (1 FAIL, 2 VACUOUS, 4 FAIL, 5 VACUOUS, 12 FAIL, 13 FAIL) | 2 |
| PL2A (planted) | the small database, applied | 14 OK / 0 VACUOUS / 0 FAIL | 10 |
| KA (planted) | the richer state, applied | 14 OK / 0 VACUOUS / 0 FAIL | 15 |

#### Part D. The four blocks: 939 mutants

One mutant changes ONE line of ONE block, or deletes it. Two questions were put to each. Does a
static rule of the script test fail, with the sidecar regenerated first? And, for every mutant but
the halt strips: run WHOLE, in the script test's own harness (its exported functions, under bash),
on the inputs of its whole-block arms, does the block end differently from the unmutated block
(the exit code, the STOP line, the pass line, the records written, the programs run, the lines it
prints about the clock, the clinics and the profile)? There are 95 such inputs over the four
blocks (16 for stage 0, 41 for stage 1, 24 for stage 2, 14 for the closing read): closed hours with
everything in order, the seven ruled minutes, the six zone answers, the applied marker 719 and 780
minutes old, the six clinic readings, the four other pre-check transcripts, the eleven run-window
records, the six other post-check outcomes, the carry `none`, the four database answers, a run
window whose sha is short, the recorded sha empty, blank, short and not hex, an empty pass mark and
the reader's two answers.

| The change | Mutants | A static rule fails | Run whole, it ends differently | Neither |
|---|---|---|---|---|
| the explicit halt stripped from a line | 187 | 187 | not run | 0 |
| the STOP left to print, its `exit` removed | 190 | 190 | not run | 0 |
| a whole check line deleted | 131 | 56 | 37 | 61 |
| a test negated (`test -f`, `-z`, `-n`) | 53 | 4 | 53 | 0 |
| a comparison swapped (`=`, `-ge`, `-le`, `-lt`) | 58 | 52 | 56 | 2 |
| a literal changed (a count, a regex bound, a zone, an age, a field, a journal number) | 171 | 87 | 141 | 5 |
| an operator swapped inside an awk, node or SQL program | 64 | 45 | 47 | 10 |
| one condition of several dropped | 85 | 39 | 40 | 32 |
| **all** | **939** | **660** | **374** | **110** |

- **The 377 halt strips were not run whole on purpose.** The harness cannot make a shell builtin
  fail, so for a `test`, a `[ ... ]` or a `grep -q` the static rule EVERY HALT IS EXPLICIT is the
  arm, with its own red arms; it failed on 377 of 377. The fault sweeps (224 faults in each shell)
  are the run for the lines that call a program.
- **829 of the 939 fail a static rule that was there before the sweep, or end differently on an
  input the test already ran;** 205 of them do both.
- **3 of the 110 are caught by the fault sweeps, which were there too.** All 110 were put through
  the fault sweep of their own block, as the test stood before this sweep (bash). Deleting the
  count of files under a number (507, 509, 619) leaves its `find | wc | tr` calls with no check
  after them, and the fault that makes one of them fail then runs on to the last line. The other
  107 halt on every fault. **So 832 of the 939 were caught before the sweep, and 107 were not.**
- **Checked on a sample:** 16 of the 110, taken across the families below, were also run against
  the WHOLE script test as it stood before the sweep, all 38 tests in both shells. 15 passed 38 of
  38. The 16th, on line 507, failed the two fault sweeps and nothing else, which is what sent all
  110 through the fault sweep.

**THE 110, FAMILY BY FAMILY.** 67 are real gaps: lines a block needs and that no test ran. 3 more
(the count of files) were caught by the fault sweeps alone. Each of those 70 is now caught by an
arm added in this sweep, and each was run again against that arm and failed it. 2 are inside a SQL
statement the harness cannot run and are caught by a reading on lane `green`. 38 change nothing a
block does.

| What was changed | Mutants | Lines | What now catches it |
|---|---|---|---|
| **A pin's compare line deleted:** the migration, the pre-check, the post-check and 0102 in every stage that pins them, and in stage 0 the guard's module and the reader. Nothing required a pin that is assigned to be compared | 11 | 517 to 519, 522, 523, 528, 620, 621, 629, 816, 817 | the static rule `pinComparedProblems`, and A PINNED FILE: each block run whole with one pinned file changed by a byte |
| **Stage 0's journal line:** each of its seven facts dropped, each `&&` turned to `||` | 13 | 526 | WHAT STAGES 0 AND 1 FIND ON DISK: seven journals, each wrong in one fact |
| Stage 1's read of 0102's journal `when`, and the check on it | 4 | 626, 627 | the same test: the entry before the newest with another idx, then with another tag |
| **`test ! -f ... ||` dropped from the applied-marker line.** The line then stops every first sitting, and no arm ran a block with NO marker: every arm planted an old one | 2 | 488, 592 | the same test: stages 0 and 1 with no marker pass |
| the worktree-is-clean check deleted | 2 | 490, 595 | the same test: `git status` prints one changed file |
| the count of files under a number deleted (the 3 the fault sweeps already caught) | 3 | 507, 509, 619 | the same test, which now reads it directly: a second `0103_*.sql`, a second `0102_*.sql` |
| stage 2's read-back of HEAD after its checkout deleted | 1 | 810 | the same test: a checkout that exits 0 and leaves HEAD where it was (stages 0, 1 and 2) |
| a `test -f` of a record deleted (the recorded sha, the run window, the transcript) | 7 | 598, 633, 797, 822, 836, 952, 968 | BETWEEN THE STAGES: each record gone, and the block names the record it misses |
| the second window read of stage 1, after the pre-check, deleted | 1 | 669 | the same test: a clock that has moved past the last start minute by the second read |
| **the window in stage 2 and in the closing read:** its end check deleted or loosened by a minute, its shape check, its sha | 7 | 825, 827, 833, 973, 979 | the same test: now AT the window's end, a minute before it, a 13-digit end, a window for another sha. Stage 1 had its feed; nothing ran these two at the end of the window |
| the age check of stage 1's transcript deleted | 1 | 837 | the same test: a transcript 70 minutes old |
| the carries' not-empty line deleted, and each of its twelve conditions dropped | 13 | 851 | the same test: each of the twelve carry rows missing in turn |
| the closing read's pass-mark age, its `pending` line and its `no matching file` line deleted | 3 | 967, 989, 990 | the same test: a pass mark older than the apply; a later migration pending; a journal row with no file |
| the clinics' reading: a fourth field or another middle word let through | 2 | 680 | THE CLINICS' ROWS: `0 of 2 x` and `0 xx 2` |
| **the clinics' SQL statement:** `is_active` dropped from either count | 2 | 678 | a reading on lane `green` (below); the harness's psql is a stub |

**THE 38 THAT CHANGE NOTHING A BLOCK DOES, and why each is left.**

- **21: a `test -f` deleted where the next line stops on the same missing file** (lines 503, 505,
  510 to 516, 527, 613 to 617, 628, 812 to 815, 980). For 20 of them the new arm A PINNED FILE runs
  the block with that file gone, and the mutant still stops once, before anything runs with
  credentials: the sha256 compare stops in its place. The 21st is the sidecar's own `test -f`
  (503), which the `shasum -c` on the next line covers. The line is kept for its sentence.
- **4: the twelve-digit re-check of `NOWL` deleted** (644, 667, 831, 977). `NOWL` is the first
  twelve characters of a reading the line before has already required to be twelve digits and a
  zone. It can differ only if `cut` fails, and then the numeric compare on the next line fails and
  stops; the fault sweeps fault that `cut`.
- **4: stage 1's read of 0102's tag** (625). It reads the same journal entry under the same
  condition as the `when` read on the next line, whose check stops first; and the tag only names
  the file whose sha256 the block then compares.
- **6: the SECOND awk of the clinics' line** (680), which only chooses between two STOP sentences
  (`clinics outside`, or the reading did not parse). Whatever it answers, the block stops.
- **3: an age moved by one minute** (`-mmin -720` to `-721` at 488 and 592; `-mmin -60` to `-61` at
  837). A boundary of one minute in a rule of twelve hours and of one hour. The arms sit at 719 and
  780 minutes, and at 70; none pins the exact minute, because `find` rounds a part of a minute.
  The gross changes (800 minutes, 3 minutes) are caught.

**Of the 78 that a static rule alone caught** (the block run whole did not differ on any of the 95
inputs):

- **16 are in the clock program.** 10 read a cell of the weekday table wrongly: the sweep ran each
  on the 84 cells of the test's own program arm, which is how that arm sees them once its text pin
  is set aside. 6 are equivalent: the weekday row widened to Saturday, which the Saturday row
  after it still decides (0101's sweep found the same), and the weekday row's lower and upper
  bound dropped, which the format check and the two rows around it cover.
- **7 are in the clinics' SQL statement,** which only a database can read (below).
- **55 are check lines of the kinds a static rule names:** the 40-hex checks, the sha compares and
  the sidecar assertion (20), the clock's zone and format checks and R9 proof 1's conditions (14),
  the guard's and the reader's compares (4), the carry shape checks and the tag in the journal
  `when` read (7), the three counting patterns without their `$` anchor (6), and the applied marker's line in stage 2 and the closing
  read (4). The static rule is their arm, each with a red arm in the test. Several are now run as
  well (a reading that is no weekday, the second clock read in another zone, a carry that is not a
  number, an applied marker over an hour old); the sweep did not run the 55 again against the new
  arms. The counting patterns without their anchor count the same rows on this sweep's real
  transcripts: 10, 0 and 0 on the pre-check before the apply; 13, 1 and 0 on the post-check after.

**THE CLINICS' SQL STATEMENT, on lane `green`** (stage 1, line 678; the two seeded active clinics
and one inactive row, changed inside a transaction that was rolled back). Its nine mutants each
print another reading on at least one of eight states. Three already differ on the rows as seeded,
which is the reading the rehearsal recorded (`0 of 2`): `08:00` moved to `08:01` and `<` turned to
`<=` each read `2 of 2`, and the second count without `is_active` reads `0 of 3`.

| State | The line's own statement reads |
|---|---|
| as seeded: two active clinics 08:00 to 20:00, and one inactive row | `0 of 2` |
| one opens at 07:59 | `1 of 2` |
| one closes at 21:01 | `1 of 2` |
| one is 08:00 to 21:00 exactly | `0 of 2` |
| one is INACTIVE and opens at 06:00 | `0 of 1` |
| one opens at 07:00, the other closes at 22:00 | `2 of 2` |
| one is 07:00 to 22:00 | `1 of 2` |
| both inactive | `0 of 0` |

#### What was added to the script test, and its runs

- **One static rule,** `pinComparedProblems`: every pin a block assigns is compared in that block,
  once, on a line of its own with its own halt (nine pins in stage 0, six in stage 1, four in stage
  2, two in the closing read). Three red arms.
- **A PINNED FILE THAT DIFFERS OR IS NOT THERE:** 42 cases in each shell (every pin of every block,
  the file changed by one byte, then gone). Each block stops once, runs nothing with credentials
  and no check-journal, and writes no record. Its control: stage 1 without its `SHAPRE` compare
  runs a pre-check that is not the approved file through to the apply.
- **WHAT STAGES 0 AND 1 FIND ON DISK:** the seven journals, a second file under a number, a dirty
  worktree, a checkout that left HEAD where it was, the closing read with HEAD elsewhere, and no
  applied marker at all, with the control that shows why that last arm is there.
- **BETWEEN THE STAGES:** the window's end, a clock that moved on, one read in another zone, a
  reading that is no weekday (0 and 8), a record that is gone, and what stage 2 and the closing
  read are handed.
- **Four inputs for the stubs,** all empty unless an arm sets them, so the fault sweeps run as
  before (224 faults in each shell, unchanged): what `git status` prints, a checkout that does not
  move HEAD, one clock read answered in another zone or at a later minute, and two more answers of
  the journal reader.

| Run, after the additions | Result |
|---|---|
| `node --test scripts/anon-sequences-default-0103.test.mjs`, no database URL in the environment | 41 of 41 passed, none skipped |
| `node --test scripts/owner-blocks-survive-zsh.test.mjs` | 5 of 5 passed |
| `node scripts/check-journal.mjs` | 101 files, 101 entries, the mirror matching by content |
| `GATE_BASE_REF=main node scripts/assert-gates-unchanged.mjs` | `GATE FREEZE: 99 gate files match their pins, package.json scripts unchanged.` |
| `pnpm test:scripts`, whole | exit 0: 1466 of 1466 passed, none failed, none skipped, 54 suites (the 1463 read before the sweep, and the three new tests) |

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` were not run: the sweep changed one
script test and this document, and no file of any package. The rows above were read once and then
this table was filled in, which moves the sidecar; the script test and the block scan, the two that
read this document, were run again on the committed bytes with the same result.

#### What the sweep did not do

- **GREEN's two blocks** are not swept: the dispatch is not written.
- **The migration file** was not mutated: the script test's CONTROLS, ONE RULE AT A TIME are its
  arms, and no byte of it may change.
- **The whole-block runs of Part D were under bash only.** The final script test ran in both shells.
- **The words a row or a STOP prints** (the names of the checks, the `expected` column, the STOP
  sentences) were not mutated: they are text, not predicates. The static rules on the STOP
  sentences are the document agent's.
- **Production** was never contacted, and the production environment file was never read.

#### Two things for the lead, found and not decided

1. **The INFO rows, the SUMMARY rows and the FOR THE RECORD tables are read by a person only.**
   (a) Leave it: the blocks count the verdict rows themselves, and that is the authority; what this
   document does. (b) Have stage 1 and stage 2 compare the SUMMARY row with their own three counts:
   a change of block bytes, with its own R4 round and a new sidecar. Recommended: (a).
2. **Pre-check 4's control can never read true on a Supabase database:** `postgres` is a member of
   `anon` there (the refusal quoted in Part C says so), and a membership cannot be circular. The
   control is harmless. Removing it would change the pre-check's bytes, move its pin and call for
   the rehearsal's pre-check readings again. Recommended: leave it.

#### How the four blocks were derived

**So a reviewer can check it by machine.** Each is 0101's reviewed
block of the same stage (`docs/migration-apply-0101.md` on main) with the number, the file names,
the pins and the journal numbers changed, and with these changes and no other: line 2 without `-e`;
no pending-file lines in stage 0 (there never was a pending file); the pre-check's VACUOUS count and
its report line in stage 1; R9's proof 2 (`D2=yes` and its line), stage 0's clock banner and the
two clock STOPs' reason;
the twelve carries, the `anon_default_before` check, the profile line and its three counts in stage
2; a flat sentence on the post-check's own psql STOP; and each stage's last line.
