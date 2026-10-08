# 0103: apply the revoke of anon's SEQUENCES default in public

**NOT READY. Nothing in this document may be pasted yet.** Open, in order: the rehearsal (the section "Rehearsal" reads `REHEARSAL: PENDING`); the one mutation sweep of the two check files; R4, at most three rounds; the pull request, which is not opened (`PR-NUMBER-PENDING`); CI on the head that merges; the owner's two clicks; and GREEN's dispatch, which carries the three values this document cannot hold: the merge commit's sha (`MERGE-SHA-PENDING`), this document's sha256 and the run window. Until the pull request is merged every block below STOPs at its first file check, because this document is not on `origin/main`. **The sitting is closed hours only, by the weekday table** (see "R9").

**Status: AUTHORED. NOT REHEARSED. NOT APPLIED.** One migration,
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
2. **OPEN: the rehearsal,** by the rehearsal agent, under the lead's standing rule, verbatim in
   its prompt (see "What the rehearsal agent owes"). It includes strategy's gate G7, the lock read.
   Its record goes under "Rehearsal", which today reads `REHEARSAL: PENDING`.
3. **OPEN: the one mutation sweep** of the pre-check's and the post-check's predicates, mechanical,
   with the survivors listed (the owner's ruling of 2026-09-27). Its table goes under "Review
   history".
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
| `REHEARSAL: PENDING` | this document, "Rehearsal" | when the rehearsal has run | the rehearsal agent's record, committed by SOLO with the sidecar |
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
   table. It takes no lock on any table: read on the local stack by the build agent from a second
   session, and by the document agent statement by statement (see "G7"). **The rehearsal's own G7
   read is still owed,** and strategy's gate says what follows if it reads otherwise: "it is closed
   hours only and says so in its READY line". This document is closed hours only either way.
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

## G7: the locks (the build lane's two reads, 2026-10-08; the rehearsal's read is PENDING)

Strategy's gate G7: "G7 CHECK: the 0103 rehearsal. EXPECT: lock read shows no auth table and no
table reception writes. Otherwise it is closed hours only and says so in its READY line."

**G7's verdict belongs to the rehearsal and is not given here.** What follows are two readings on
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
| G7: no `auth` table and no table reception writes is locked | **NOT DISCHARGED ON PRODUCTION, AND NOT YET BY THE REHEARSAL:** two readings on the build lane's stack | a throwaway |
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

REHEARSAL: PENDING

**No block of this document has run against a database.** Whole, the four blocks have run only in
the fault-injection harness, on stubs. The rehearsal agent's record replaces the line above; until
it does, this document is NOT REHEARSED, every block of it. What follows is what the build lane
measured, and none of it is the rehearsal.

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

**What the harness is not.** Its psql is a stub that prints a fixture. It proves that a block halts
and what it hands each program; it proves nothing about what the two check files print on a
database. That is the build lane's run, the document agent's run and the rehearsal.

### NOT REHEARSED, said one by one

Everything, until the rehearsal's record replaces `REHEARSAL: PENDING`. In particular:

- **Stages 0, 1, 2, the closing read and the dispatch's two blocks, as whole blocks.**
- **`verified-migrate.mjs` reaching drizzle-kit with this file:** the journal 100 to 101, the row's
  sha256, the two timeouts taking effect inside drizzle's transaction.
- **The official G7 lock read,** from a second session on the rehearsal database.
- **The target guard passing, and both journal-reader reads:** each refuses any target but
  production, so their pass is first seen in the sitting, as for 0100 and 0101.
- **A clock STOP on a real clock.**
- **`supabase db reset` applying the 0103 mirror** (CI's path): proven so far by psql outside a
  transaction on a scratch database. CI's `db-tests` on the pull request's head is the real proof.
- **The DB-gated suites on a database with 0103 applied.** No test reads `pg_default_acl` or uses a
  sequence in `public` (searched), but that is a search, not a run.
- **Production's platform configuration, and production's sequences in `public`.**

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

**None yet.** R4 has not run on this document (NOT READY step 4), and the mutation sweep has not
run (step 3). When each does, its verdict and its table go here. **The document agent ran no
mutation sweep:** the script test's red arms are hand-written controls, one per rule, and are not a
sweep.

**How the four blocks were derived, so a reviewer can check it by machine.** Each is 0101's reviewed
block of the same stage (`docs/migration-apply-0101.md` on main) with the number, the file names,
the pins and the journal numbers changed, and with these changes and no other: line 2 without `-e`;
no pending-file lines in stage 0 (there never was a pending file); the pre-check's VACUOUS count and
its report line in stage 1; R9's proof 2 (`D2=yes` and its line), stage 0's clock banner and the
two clock STOPs' reason;
the twelve carries, the `anon_default_before` check, the profile line and its three counts in stage
2; a flat sentence on the post-check's own psql STOP; and each stage's last line.
