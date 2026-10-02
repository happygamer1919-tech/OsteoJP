# 0100: apply the MAINTAIN revoke from `authenticated`

**NOT READY. Seven things happen first, in order; a sitting inside clinic hours needs three more (steps 6 to 8), all of them before the merge (see "NOT READY" below). Two of the seven are done: the guard pair (#1508, #1509) is on main and merged into this branch (step 1), and 0100 is promoted on it (step 3), both on 2026-10-02. Step 2's fill is made (#1510 merged, `SHAGATE` holds main's gate file sha256); its R8 round is in "Review history".**

**Status: PROMOTED. NOT APPLIED.** One migration,
`packages/db/migrations/0100_revoke_maintain.sql`, which the promotion of 2026-10-02 renamed,
byte for byte, from the pending file
`packages/db/migrations-pending/NEXT-AFTER-0099_revoke_maintain.sql`. It is applied
from `origin/main` at the PR's merge commit, after the PR has merged, as 0099 was. It is
the catalog-only pilot of the SET LOCAL gate (S-1001-A R2). Five blocks, each pasted whole,
on its own and in order: THE EARLIER PRE-CHECK SITTING (READ ONLY, in its own sitting BEFORE
the PR merges, from the PR's head commit, and needed only for a sitting inside clinic hours),
then, in the apply sitting, from the merge commit, stage 0 (the
promotion, the files, the clock and the head it runs from), stage 1 (the HEAD CHECK, the
pre-check, the clock and the clinics, and the apply), stage 2 (the post-check) and the
closing journal read. One rule governs every halt, in these words here and in GREEN's
dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0100 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number
changed and no other change.** This document has no stage 3 (see "No behaviour check, and
why"), so where the rule names stages 2 and 3, read stage 2 and the closing read. The rule
governs THE EARLIER PRE-CHECK SITTING too.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN but step 7

1. **DONE 2026-10-02.** #1508 and #1509 are on main (`13796026`), merged into this branch at
   `72802013`; the guard, the reader and the module there are the three NEW bytes pinned
   below. As first written:
   **The guard pair merges: #1508 (the tests, a GATE-CHANGE, branch
   `sec/INC-guard-tests-GATE-CHANGE`) and #1509 (the code, branch `sec/INC-guard-parse-host-db`).** It changes `scripts/assert-production-target.mjs` and
   `packages/db/scripts/read-applied-migrations.mjs`, and adds `scripts/production-target.mjs`,
   which both now import. This document pins the NEW bytes (see "The guard and the reader
   change before 0100 applies"). Until the pair is on main, stage 0 STOPs on those pins and
   nothing reaches production.
2. **FILLED 2026-10-02: #1510 merged at 21:06:04 Lisbon (`c2db7a1f`), this branch merged main
   at `4c906fa1`, and `SHAGATE` in stages 0 and 1 now holds `e150a805...`, the sha256 of
   `scripts/migration-timeouts.test.mjs` on main, read from `origin/main` and from this branch.
   Its R8 round on the changed bytes is in "Review history". As first written:**
   **#1510 merges (branch `db/LOCK-TIMEOUT-verified-migrate`, the SET LOCAL gate,
   `scripts/migration-timeouts.test.mjs`), and SOLO fills `SHAGATE`** with that file's sha256
   as main then holds it, in every block that carries it. That is an amendment, and under
   strategy's R8 ("a document amended for an owner override gets one R4 round on the changed
   bytes before the READY line") it gets its own R4 round on the changed bytes before any
   READY line. Until then `SHAGATE` is a placeholder that can never match a sha256, so R9's
   proof 1 fails closed and only a closed-hours sitting can pass.
3. **DONE 2026-10-02, in the commit on top of `72802013`:** `origin/main` merged in at
   `72802013`; the rename, bytes `80f85018…` unchanged; journal `idx 97`, `when`
   1788502100000 (0099's plus 100000); the mirror; check-journal 98 of 98; the README row
   Promoted. As first written:
   **SOLO promotes 0100 on this branch, `db/0100-maintain-revoke`:** merge `origin/main` in (no
   rebase); `git mv` the pending file to `packages/db/migrations/0100_revoke_maintain.sql` (a
   rename, not one byte changed: sha256
   `80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106` before and after); append
   its journal entry to `packages/db/migrations/meta/_journal.json` at **`idx 97`**, tag
   `0100_revoke_maintain`, **`when` 1788502100000** (0099's 1788502000000 plus 100000; a `when`
   equal or lower makes drizzle skip the file in silence, which is why
   `scripts/check-journal.mjs` refuses one); run `node scripts/sync-supabase-migrations.mjs` for
   the mirror; run `node scripts/check-journal.mjs` (**98 files, 98 entries**); move the README
   row into the Promoted table. The pre-check and the post-check pin the body's sha256 as a
   literal, and a rename does not move it, so neither needs an edit.
4. **The rehearsal agent runs this document's five blocks and GREEN's two, whole, from the
   promoted head,** under the lead's standing rule, verbatim in its prompt (see "Rehearsal").
5. **CI is green on the promoted head,** the required checks and `db-tests` (which applies 0100
   with every other migration on a real Supabase stack), and the SET LOCAL gate reads the
   promoted file in scope and passing.
6. **ONLY FOR A SITTING INSIDE CLINIC HOURS: R9 is recorded in `CLAUDE.md` on main before any
   dispatch on the daytime path,** the earlier pre-check's (step 7) and a daytime apply's
   (step 10). GREEN reads `CLAUDE.md`, which still says "Sittings only while the clinics are
   closed." (the owner's ruling of 2026-09-27), and would rightly stop a daytime sitting on it.
   SOLO's B4 docs PR carries R9 into it, and it opens after #1509; this document does not edit
   `CLAUDE.md`. **A JUDGMENT, NOT A RULING:** the earlier pre-check's dispatch counts as a
   daytime dispatch here, because it exists only for a daytime apply and GREEN would read the
   closed-hours sentence against it; the lead may rule it out of the requirement.
7. **ONLY FOR A SITTING INSIDE CLINIC HOURS, BEFORE THE MERGE: GREEN runs THE EARLIER PRE-CHECK
   SITTING from a PINNED COMMIT of this PR's branch,** on its own dispatch, in a sitting of its
   own, the way the two read-only measurement dispatches ran: the dispatch names PR #1520's
   recorded head by its full sha and records it in `/tmp/0100-earlier-head.sha`; the block
   halts unless that sha is PR #1520's head on GitHub, checks it out with
   `git checkout --detach`, and compares every file it runs by sha256 before it runs any.
   `git merge-base --is-ancestor` is not required: the commit is not on main yet. GREEN reports
   the `PRECHECK_EARLIER=<sha256>` line the block prints.
8. **ONLY FOR A SITTING INSIDE CLINIC HOURS, BEFORE THE MERGE: SOLO records that sha256 in this
   document, ON THE BRANCH,** as `PRECHECK_EARLIER` in every block that carries it. That is an
   amendment, and under R8 it gets its own R4 round on the changed bytes, and CI green on the
   amended head, before the owner merges. The document on main is then final, and the apply
   sitting runs from the merge commit exactly as a closed-hours sitting does. A closed-hours
   sitting needs none of steps 6 to 8.
9. **The owner merges the PR**, and freezes merges to main from that merge until GREEN's report
   is in (SOLO disarms every armed PR first).
10. **SOLO fills GREEN's dispatch for the apply sitting:** the merge commit's sha, this
    document's sha256, and a run window. A window inside clinic hours is allowed only under R9,
    after steps 6 to 8, and this document's blocks decide it by machine; the dispatch's own
    CLOCK CHECK must carry the same rule, not the closed-hours-only rule of earlier dispatches,
    or it will STOP a daytime sitting first.

| Fact | Value |
|---|---|
| Card | 0100, MAINTAIN off `authenticated`, carded on the board on 2026-10-01 (#1512) and measured first (#1513) |
| Ruling | S-1001-A R1: "MAINTAIN on authenticated: REVOKE, tables in public plus the matching default privileges, same shape as 0099." R2: "Numbering: this is 0100 (catalog-only pilot of the SET LOCAL gate). SAT-01 becomes 0101, the episode-policy item 0102." R3: "Measurement before build." S-1002-A R9 (daytime applies, below). The lead's ruling (b) of 2026-10-01: every migration from 0100 starts with the two SET LOCAL lines |
| Migration | `packages/db/migrations-pending/NEXT-AFTER-0099_revoke_maintain.sql` until the promotion, then `packages/db/migrations/0100_revoke_maintain.sql`. sha256 `80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106` in both places |
| Journal | `idx 97`, tag `0100_revoke_maintain`, `when` 1788502100000 (0099's 1788502000000 plus 100000). Stage 0 asserts both `when` values and the order. Production's journal goes 97 to 98 |
| Mirror | `supabase/migrations/0100_revoke_maintain.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs with `node` directly after asserting its sha256 |
| Must follow | `0099`, the TRUNCATE, TRIGGER, REFERENCES revoke (#1397), applied 2026-10-01 21:15 Lisbon, body sha256 `fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b`. Stage 0 finds it at `idx 96` by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | **The apply sitting** (stages 0 to 2 and the closing read): `origin/main`, when it IS the PR's merge commit. Stage 0 records the sha `origin/main` resolves to in `/tmp/0100-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK). **THE EARLIER PRE-CHECK SITTING** (a daytime sitting only, NOT READY step 7): BEFORE the merge, from PR #1520's head, by the full sha its own dispatch names and records in `/tmp/0100-earlier-head.sha`. The block halts unless `git ls-remote origin refs/pull/1520/head` reads that same sha, checks it out detached, and compares every file it runs by sha256 first. It does not run `git merge-base --is-ancestor`: the commit is not on main yet |
| This document | `docs/migration-apply-0100.md`, pinned by `docs/migration-apply-0100.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own and checks it by machine |
| Pre-check | `scripts/db/precheck-0100-maintain-revoke.sql`, READ ONLY, 13 verdicts each with its control, 8 carries, 3 INFO rows, `-v prev_hash` and `-v prev_when` required, sha256 `d68ca1a2f791cd9f15b8f5466ae068b6cf0cfd23ab1af6f03891854100264d33` |
| Post-check | `scripts/db/postcheck-0100-maintain-revoke.sql`, READ ONLY, 12 verdicts, nine carries in, sha256 `3a77cca47927845fa7cc6e3c665597882a35492809cfed2b3633a759e42c846f` |
| Behaviour check | none, on purpose: see "No behaviour check, and why" |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261` (unchanged since 0099); `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module both of the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. The last three are the guard pair's NEW bytes, read from `origin/sec/INC-guard-parse-host-db` on 2026-10-02; every block that runs one compares it, and the module, first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`. It imports nothing but `node:` builtins |
| The R9 pins | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs` on main (FILLED 2026-10-02 with `e150a805...` after #1510 merged, step 2); `PRECHECK_EARLIER`, the sha256 of the earlier pre-check's recorded output (a PLACEHOLDER until that sitting runs before the merge and SOLO records it on the branch, steps 7 and 8). Each placeholder carries letters a sha256 never has, so it can never match, and the daytime arm fails closed |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts` (0094 to 0099 did not pin them either). Their tree is fixed instead, by commit. **The apply sitting's:** GREEN's BEFORE YOU START requires `origin/main` to BE the PR's merge commit, and the HEAD CHECK halts on any other head before the apply. **THE EARLIER PRE-CHECK SITTING's:** the full sha its dispatch names, which the block checks against PR #1520's head on GitHub before the checkout. That sitting loads no `node_modules`: it runs psql, the guard, and the guard's module, and the guard imports only that module, which imports nothing |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0100-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stage 2 and the closing read refuse at or after its end. Stage 0 removes the record |
| What it changes | Two `SET LOCAL` lines (`lock_timeout` 5s, `statement_timeout` 60s, for this transaction only). On every ordinary and partitioned table in `public`: `REVOKE MAINTAIN ... FROM authenticated`. Then `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM authenticated`, for the role that runs it (`postgres`), so the next `CREATE TABLE` does not re-grant it |
| What it never touches | every policy, every function (so the SECURITY DEFINER count stays where it is: **no GATE-CHANGE**), every column, every row, every table's definition, `SELECT`, `INSERT`, `UPDATE` and `DELETE` for every role, and every privilege of every other role. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own
sha256, so the digest lives in `docs/migration-apply-0100.sha256` and every block checks it
with `shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same
head as the document, so a main that moved to a new document and a new sidecar together
would pass that check. **GREEN's dispatch closes that by machine,** as it did for 0099: it
pins this document's sha256 on its own and checks it against the `origin/main` it resolves.
From stage 0 on, the HEAD CHECK halts on any moved main before the apply. The earlier
pre-check's dispatch does the same against the PR head it names, whose document is the one
before `PRECHECK_EARLIER` is filled.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted into
zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number).
Narration is `echo`. Every time a block prints is read from the machine's clock.

**The migration's own header names no number of its own,** only 0099's, as the migration it
follows, so the rename leaves nothing stale in it.

## 1. What it does

Four statements, each ended by `--> statement-breakpoint`.

| # | Statement | Effect |
|---|---|---|
| 1 | `SET LOCAL lock_timeout = '5s';` | a lock this transaction cannot take in 5 seconds fails it, and nothing is applied |
| 2 | `SET LOCAL statement_timeout = '60s';` | no statement in this transaction runs longer than 60 seconds |
| 3 | a `DO` loop over every ordinary and partitioned table in `public` | `REVOKE MAINTAIN ON TABLE ... FROM authenticated` |
| 4 | `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM authenticated` | the next `CREATE TABLE` by `postgres` does not re-grant MAINTAIN |

No policy, function, column, table definition or row is touched. No backfill. No data change.

**It takes no lock on any table, measured.** On the build lane's throwaway (Postgres 17.6),
the whole file ran under `psql -1` to completion, in under a second, while another session
held `ACCESS EXCLUSIVE` on two of the tables it revokes on, and again while another session
held an open `INSERT` on one; the applying session held no lock on either table. A GRANT or
REVOKE rewrites the catalogue row, not the table. So neither SET LOCAL bound should ever
fire here; they are present because the rule applies from this number on, and this file is
its pilot.

**The SET LOCAL lines hold for the whole apply.** drizzle-kit runs the pending set in ONE
transaction, so a `SET LOCAL` at the top of the file holds until that transaction's COMMIT,
through the pooler. Measured on the throwaway under `psql -1`: `lock_timeout` read `5s` and
`statement_timeout` read `1min` after the body ran. Run outside a transaction block (each
file under the Supabase CLI in CI), each `SET LOCAL` prints the WARNING
`SET LOCAL can only be used in transaction blocks` and the file still exits 0.

## 2. Why

`authenticated` is not a theoretical role in this product. Every tenant-scoped staff read
and write runs as it: `packages/db/src/client.ts:152` issues `set local role authenticated`
inside `withTenantContext`, and that role drop is what makes RLS apply at all. So a
privilege held by `authenticated` is a privilege held by the application on every request.

MAINTAIN is Postgres 17's eighth table privilege. It lets a role run `VACUUM`, `ANALYZE`,
`CLUSTER`, `REINDEX` and `REFRESH MATERIALIZED VIEW` on the relation, and `LOCK TABLE` in any
mode. It reaches `authenticated` the way TRUNCATE, TRIGGER and REFERENCES did: Supabase's
`ALTER DEFAULT PRIVILEGES` grants ALL on new tables to `authenticated`, and on Postgres 17 ALL
includes MAINTAIN. 0099 took the other three off and left MAINTAIN on purpose ("MAINTAIN
stays", `docs/migration-apply-0099.md`, out of scope), because the card it implemented named
three privileges and the question of a fourth was the owner's. The lead's ruling S-1001-A R1
answers it: revoke, tables in `public` plus the matching default privileges, same shape as
0099.

### 2a. The measurement this acts on (S-1001-A R3, "measurement before build")

GREEN ran `scripts/db/measure-0100-maintain.sql` (#1513) on production on 2026-10-02, inside a
READ ONLY transaction that rolled back (transcript:
`/Users/ivan/osteojp-handover/measure-0100-output-20261002.txt`):

- **48 relations in `public`, every one an ordinary table:** 0 partitioned, 0 views,
  0 materialized views, 0 foreign tables.
- **`authenticated` holds MAINTAIN on 41 of the 48,** and the GRANTED count (the ACL names it)
  equals the EFFECTIVE count (`has_table_privilege`, which also counts PUBLIC and role
  membership): 41 and 41. So its own grant is the only path, and the REVOKE removes all of it.
  The pre-check asserts that shape (verdict 8) rather than the number.
- **`anon` and PUBLIC hold nothing** on any table in `public`.
- **The `public` TABLES default of `postgres` grants `authenticated`
  `DELETE,INSERT,MAINTAIN,SELECT,UPDATE`,** which is 0099's end state. After 0100 it reads
  `DELETE,INSERT,SELECT,UPDATE`.
- **The defaults of `supabase_admin` grant `authenticated` all eight, and are out of reach,**
  as 0099's document records: `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` changes only the
  running role's default, and `postgres` is not a member of `supabase_admin`. They reach only a
  table `supabase_admin` creates in `public`; pre-check verdict 5 shows every table there is
  `postgres`'s.

## 3. What breaks: nothing, and here is the evidence rather than the claim

- **No code runs a MAINTAIN command as `authenticated`.** No code in `apps/` or `packages/`
  runs `VACUUM`, `ANALYZE`, `CLUSTER`, `REINDEX`, `REFRESH MATERIALIZED VIEW` or `LOCK TABLE`.
  In `scripts/`, the two `LOCK TABLE` statements belong to a data op (`scripts/data/dur-01-2-write.sql`)
  run as the table owner, and the `ANALYZE` statements belong to local perf seeders, run as the
  owner before they drop role. The schema has no materialized view. Autovacuum needs no grant.
- **SELECT, INSERT, UPDATE and DELETE never read MAINTAIN.** Each is checked against its own
  privilege bit. Measured on the throwaway (W1 below): after the revoke, an `authenticated`
  session inserted a row and a child row through its foreign key, read, updated (the BEFORE
  UPDATE trigger fired) and deleted, exactly as before.
- **What `authenticated` loses, said precisely.** `VACUUM` and `ANALYZE` now skip the table
  with a WARNING; `REINDEX` and `CLUSTER` are refused. `LOCK TABLE` is subtler: Postgres 17
  grants any lock mode to a role holding MAINTAIN, UPDATE, DELETE or TRUNCATE, so
  `authenticated` keeps a strong lock on every table where it still holds UPDATE or DELETE,
  and loses it only where it holds neither. Measured (W6, W7 below). **This corrects one line
  of 0099's document,** which called `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` "the reachable
  consequence" of MAINTAIN: on a table where `authenticated` can UPDATE or DELETE, that lock
  never depended on MAINTAIN.
- **What the app roles may SELECT, INSERT, UPDATE and DELETE does not move,** proven in the
  sitting by the catalogue: post-check 7, one md5 over every such privilege of `authenticated`,
  `patient`, `anon` and `service_role` on every relation in `public`, and post-check 5, every
  other privilege on every relation.

## No behaviour check, and why

0099's document ran a behaviour check (`scripts/db/behaviour-0099-grants-readonly.sql`) BEFORE
and AFTER the apply, asking the executor whether each role could SELECT, INSERT, UPDATE and
DELETE each table. **0100 has none, for three reasons:**

1. **MAINTAIN is not one of the bits those four statements check.** The executor's permission
   check for SELECT, INSERT, UPDATE and DELETE reads exactly those four privilege bits. A
   REVOKE of MAINTAIN cannot change its answer, and the post-check proves the four bits
   unchanged for four roles on every relation (verdict 7) and every other privilege unchanged
   (verdict 5).
2. **The 0099 file cannot be reused unchanged.** Its arm 6, with `-v phase=before`, requires
   `authenticated` to hold TRUNCATE, TRIGGER and REFERENCES on at least one table each. 0099
   made all three zero on production on 2026-10-01 (the measurement of 2026-10-02 reads 0, 0, 0
   of 48), so the BEFORE run would read FAIL and stage 1 would halt before the apply. Reusing
   it would mean editing it, which is a new file with nothing new to measure.
3. **A daytime sitting should be short.** The check runs several hundred `EXPLAIN`s as two
   roles; it would prove nothing the catalogue does not already prove for this change.

**The MAINTAIN refusals themselves cannot be shown READ ONLY on production** (`VACUUM` cannot
run inside a transaction, and a READ ONLY transaction refuses strong locks first), so they are
proven IN ACTION by the build lane's throwaway (W2 to W7 below) and by the rehearsal.

## R9: a sitting inside clinic hours (PROPOSED for R4)

S-1002-A R9, the strategy's words: "DAYTIME APPLIES, owner ruled B, from 0100: a clinic-hours
sitting is allowed only when all three hold, each proven in the apply document: (1) the SET
LOCAL gate is on main; (2) the migration is catalog-only or touches no table reception writes;
(3) the read-only pre-check ran on production in an earlier sitting, output recorded. Else
closed hours. Propose the stage 0 arm in 0100's document; R4 covers it."

**This is the proposed arm. It runs in stage 0 and again in stage 1, right before the apply.**

- **CLOSED HOURS PASS AS TODAY.** Closed means the Lisbon clock, read by machine with
  `TZ=Europe/Lisbon`, is before 08:00 or from 21:00, AND (stage 1, which can read the
  database) no active clinic is open by its own `public.locations` row, read exactly as 0097's
  stage 1 reads it. Both clinics were ruled to 08:00 to 21:00 (AGENDA-2100); the hours are
  data, so the rows are read too.
- **INSIDE CLINIC HOURS, THE BLOCK PASSES ONLY IF ALL THREE ARE PROVEN BY MACHINE, ELSE IT
  STOPS WITH NOTHING APPLIED.** Each proof prints `yes` or `no` in every sitting, closed hours
  included, so a reader sees where the document stands:
  1. **The SET LOCAL gate is on main.** `scripts/migration-timeouts.test.mjs` exists at the
     recorded `origin/main` sha and its sha256 equals `SHAGATE`. #1510 merged on 2026-10-02 and
     `SHAGATE` holds `e150a805...`, the file's sha256 on main (NOT READY step 2, an amendment with
     its own R8 round). A gate file that differs, or is missing, fails this proof.
  2. **The migration is catalog-only. `SHA0100` alone proves the file is the reviewed file:**
     every block of the apply sitting asserts, BEFORE the arm runs, that the migration on disk
     is the pinned, reviewed bytes (sha256 `80f85018...6106`), and `verified-migrate.mjs` checks
     the same sha256 again (`--sha256`) before it applies. **The arm's `node -e` check proves the
     file is catalog-only: its tokens are the reviewed tokens, so no statement can be added.** It
     refuses the file if it holds any byte outside printable ASCII (0x20 to 0x7E), TAB or LF,
     which covers a CR, a NUL and any non-ASCII byte. Otherwise it collapses every run of spaces,
     TABs and LFs to one space, trims the ends, and requires the result to EQUAL the reviewed
     text the program carries: the whole 0100 file, its comments included, normalized the same
     way, with its apostrophes written `\x27` so the block's single quotes survive. It prints
     one line: the verdict and, on a refusal, the bad byte and its offset, or the first offset at
     which the normalized file differs. It strips no comment, keeps no word list and counts no
     `EXECUTE`: an added comment, statement, word or dollar quote simply makes the text unequal.
     **What it does not prove is identity, because whitespace is not always insignificant
     here.** An LF ends a `--` comment, and the file's only `--` comments are its four
     `--> statement-breakpoint` markers, which drizzle splits on as that exact text. So a variant
     that changes only the kind of whitespace passes this check: a TAB or a second space inside a
     marker, with the LFs after it turned into spaces, leaves drizzle one marker short and puts
     the next statement inside the `--` comment, and an LF inside a marker leaves
     `statement-breakpoint` as code. Such a variant drops a reviewed statement or fails to parse;
     it can never add one, because its tokens are the reviewed tokens. `SHA0100` refuses every
     such variant, and both arms assert `SHA0100` before this check;
     `scripts/maintain-revoke-0100.test.mjs` pins four (R4 round 4's A to D), each passing this
     check and hashing to something other than `SHA0100`. The post-check would also see the loop
     or the default privilege dropped (verdicts 1 and 2); a dropped `SET LOCAL` line changes
     nothing it reads. **Whitespace inside the literals.** The code has seven: `'5s'`, `'60s'`,
     `'public'`, `'r'`, `'p'`, the string the loop EXECUTEs, and the `DO` body itself, since
     `$$ ... $$` is a string literal; the last two hold whitespace, and the body holds LFs. The
     normalization collapses a run of whitespace to one space and never removes one, so inside
     the EXECUTEd string a collapsed run is still whitespace to the SQL `EXECUTE` runs. In the
     `DO` body that holds too, for this file: an LF there could matter only by ending a `--`
     comment, and the body has none, or by joining two string literals separated only by
     whitespace, and it has no such pair. A space added where there was none, as in `'5 s'`, is
     a difference, and is refused. `scripts/maintain-revoke-0100.test.mjs` carries every plant
     file R4 rounds 1 to 3 left (six, five and twelve) and refuses each. **A JUDGMENT, NOT A RULING (SOLO's, after R4
     round 3):** this exact compare replaced the earlier versions' comment stripping and word
     list, the last of them a hand-written SQL scanner, because each review round found another
     place where they read SQL differently from PostgreSQL, and the rounds did not converge.
     **It is not a template:** a later migration that relies on R9 (2) needs its own proof,
     written and reviewed with it.
  3. **The read-only pre-check ran on production in an EARLIER sitting, output recorded.**
     THE EARLIER PRE-CHECK SITTING (below) runs the pinned pre-check against production BEFORE
     the merge, from PR #1520's head, in a sitting of its own, and keeps its transcript at
     `/tmp/0100-precheck-earlier.out`. SOLO records that file's sha256 here as
     `PRECHECK_EARLIER`, on the branch, before the merge (a placeholder until then; NOT READY
     steps 7 and 8). The arm requires the file to exist; to hash to `PRECHECK_EARLIER`; to open
     with the line naming the pinned pre-check; to carry the target guard's verdict line
     `target verified: production, session pooler.`; to carry exactly 13 `OK` verdict rows, no
     `FAIL` row, and the block's summary line
     `earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL`; to be older than this sitting's
     start record (`/tmp/0100-sitting.start`, which stage 0 writes first); and to be more than
     30 minutes old. **A JUDGMENT, NOT A RULING:** the 30-minute floor and the
     older-than-this-sitting's-start test are SOLO's reading of R9's "an earlier sitting"; they
     guard against a pre-check run moments before, or inside, the apply sitting being passed off
     as an earlier one, and the lead may set another value.
- **A machine restart deletes `/tmp`,** and macOS also clears old files from it. If the earlier
  transcript is gone or changed, proof 3 reads `no` and the arm fails closed. Before the merge,
  the cure is a new earlier sitting and a new `PRECHECK_EARLIER` in the same amendment. After the
  merge the document on main is final: the sitting waits for closed hours, or a new amendment
  goes through its own PR and R4 round. Never a copy from elsewhere.
- **No date is written into any arm.** R9 replaces the date-locked owner override arms of
  0097 to 0099; this document has none.
- **The arm implements ONLY R9 (2)'s catalog-only option, by SOLO's choice.** 0100 is
  catalog-only by construction (section 1), and it takes no table lock (measured). R9's other
  option, "touches no table reception writes", has no machine proof in this arm: a later
  migration that relies on it needs its own machine proof, in its own document, before a
  daytime arm may pass on it. A sitting that writes rows, or locks a table reception writes, is
  not what this arm opens.

## Merged before the apply, and why that is safe here

**The PR carries no app code.** It carries the migration, this document and its sidecar, the
two check files, a script test and the pending README. Nothing in the app uses MAINTAIN, so the
app behaves the same before and after the apply, and a merged main that production has not
caught up with yet is a state the app already lives in.

**Between the merge and the apply, main is ahead of production by exactly one migration,** and
the pre-check says so: it passes only while 0100 is absent from the journal and 0099 is its
newest row. The daily `prod-drift-check` would report 0100 as pending if the sitting halted
before the apply; that report is correct, and it is informational.

**Exactly one `packages/db/migrations/0100_*.sql` may exist; if anything else is ever found
under `0100_`, STOP.** The number is the apply authorisation (`CLAUDE.md`, the binding table
under "SOLO's record"; S-1001-A R2 put 0100 on this item).

## The guard and the reader change before 0100 applies

**The guard pair (#1508 the tests, branch `sec/INC-guard-tests-GATE-CHANGE`; #1509 the code, branch `sec/INC-guard-parse-host-db`) merges first.**
It is the fix for `INC-rehearsal-subagent-passed-the-reader-guard`: the target guard and the
journal reader both run `checkProductionTarget()` from a new module,
`scripts/production-target.mjs`, which compares the PARSED host, port, database name and ref to
production and refuses `PGOPTIONS`, `PGHOSTADDR`, `PGSERVICE` and `PGSERVICEFILE`. This document
pins the NEW bytes, each read with `git show origin/sec/INC-guard-parse-host-db:<path> | shasum -a 256`
on 2026-10-02:

| File | sha256 on the guard branch | sha256 on main today |
|---|---|---|
| `scripts/assert-production-target.mjs` | `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96` | `bcc43dfb...` (0099's pin) |
| `packages/db/scripts/read-applied-migrations.mjs` | `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387` | `867e2823...` (0099's pin) |
| `scripts/production-target.mjs` | `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c` | absent |

**The right-hand column is main before the pair merged.** Main at `13796026` (2026-10-02) holds
exactly the middle column's three sha256, re-read at the promotion.

**Until the pair is on main, stage 0 STOPs on those pins,** and so does THE EARLIER PRE-CHECK
SITTING, which runs from this PR's head and so needs the pair merged into the branch as well
(NOT READY step 3 merges `origin/main` in): the guard module is not on disk, or the guard or
the reader is not the approved file.
That is the safe direction: nothing reaches production on the old guard. If the pair changes
again before it merges (a review fix), these three pins, this document's sha256, its sidecar
and GREEN's dispatch move together. `verified-migrate.mjs` and `check-journal.mjs` are the same
bytes on main and on both branches, and keep their pins.

**Every block that runs the guard compares the guard and its module first; the closing read
compares the reader and the module first.** The new guard prints `host:`, `port:` and `ref:`
and then `target verified: production, session pooler.`; it exits 2 on any refusal.

## The HEAD CHECK, and running from main

No block of the apply sitting reads a branch, and there is no separate HEAD CHECK to paste:
the machine runs it inside every block. THE EARLIER PRE-CHECK SITTING reads one ref,
`refs/pull/1520/head`, and only to prove that the commit its dispatch names is still the PR's
head before it checks that commit out.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean,
  removes the previous sha, run window and start records, writes this sitting's start record,
  fetches, resolves `origin/main`, checks that sha out detached and verifies HEAD is it,
  verifies the sidecar, the promotion, the journal, 0099's bytes and every pin, runs R9's
  clock arm, and only then records the sha in `/tmp/0100-main.sha`.
- **The run window is checked by machine in every block from stage 1 on,** from the record
  GREEN's CLOCK CHECK writes after stage 0.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve `origin/main`
  again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql. It then checks out the RECORDED sha and asserts
  every file it runs by sha256.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied
  marker `/tmp/0100-applied.ok` exists, and `verified-migrate.mjs` refuses an already-applied
  migration regardless (exit 3).
- **Stage 2 and the closing read are READ ONLY** and run from the recorded sha whatever main
  has done since: each prints whether main moved, with both shas, and never stops on it, and
  each verifies the worktree HEAD is the recorded sha.
- **A moved main before the apply ends the sitting.** Nothing is applied, both shas go in the
  report, and whether and when to start again is the lead's call.

## THE EARLIER PRE-CHECK SITTING. READ ONLY, any hour, BEFORE the merge, and only for a daytime sitting

Run in a sitting of its own, on its own dispatch, BEFORE the PR merges (NOT READY step 7), from
a PINNED COMMIT of this PR's branch: PR #1520's recorded head, which the dispatch names by its
full sha and records in `/tmp/0100-earlier-head.sha` before this block is pasted. The block
halts unless that sha is PR #1520's head on GitHub now, checks it out detached, and compares
every file it runs by sha256 before it runs any. It does not require the commit to be on main:
it is not, yet. It writes nothing: the pre-check opens its own READ ONLY transaction and rolls
it back. Its transcript stays at `/tmp/0100-precheck-earlier.out` on the apply machine,
untouched, until the apply sitting reads it.

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0100.sha256
MIG=packages/db/migrations/0100_revoke_maintain.sql
SHA0100=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPREV=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPRE=d68ca1a2f791cd9f15b8f5466ae068b6cf0cfd23ab1af6f03891854100264d33
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- 0100 EARLIER PRE-CHECK SITTING: READ ONLY, nothing is applied in this sitting, and it runs BEFORE the merge, from PR #1520's head"
test ! -f /tmp/0100-applied.ok || { echo "STOP: /tmp/0100-applied.ok exists, so 0100 has been applied on this machine, and an earlier pre-check now proves nothing. Nothing was run"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0100-precheck-earlier.new
test -f /tmp/0100-earlier-head.sha || { echo "STOP: the dispatch recorded no PR head in /tmp/0100-earlier-head.sha. Nothing was run"; exit 1; }
PRHEAD=$(cat /tmp/0100-earlier-head.sha)
echo "${PRHEAD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the recorded PR head is not a full 40-character sha [${PRHEAD}]. Nothing was run"; exit 1; }
git fetch origin --prune
PRNOW=$(git ls-remote origin refs/pull/1520/head | cut -f1)
echo "PR #1520's head, as the dispatch names it: ${PRHEAD}"
echo "PR #1520's head on GitHub now:             ${PRNOW}"
[ "${PRNOW}" = "${PRHEAD}" ] || { echo "STOP: PR #1520's head on GitHub is not the commit the dispatch names, so the branch moved or the dispatch is stale. Nothing was run"; exit 1; }
[ "$(git cat-file -t ${PRHEAD})" = commit ] || { echo "STOP: ${PRHEAD} does not resolve to a commit after the fetch. Nothing was run"; exit 1; }
git checkout -q --detach ${PRHEAD}
[ "$(git rev-parse HEAD)" = "${PRHEAD}" ] || { echo "STOP: the worktree is not on the PR head after the checkout. Nothing was run"; exit 1; }
echo "the earlier pre-check runs from PR #1520's head ${PRHEAD}, before the merge"
test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at the PR head"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0100 is not promoted at the PR head (NOT READY step 3). Nothing was run"; exit 1; }
test -f scripts/db/precheck-0100-maintain-revoke.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: scripts/production-target.mjs is not on disk at the PR head, so the guard pair (#1508, #1509) is not merged into the branch. Nothing was run"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0100}" ] || { echo "STOP: 0100 at the PR head is not the approved body. Nothing was run"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0100-maintain-revoke.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Until the guard pair is on main and merged into the branch this is expected, and nothing was run"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T99=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[96];process.stdout.write(p&&p.idx===96&&p.tag==='0099_revoke_truncate_trigger_references'?p.tag:'none')")
W99=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[96];process.stdout.write(p&&p.idx===96&&p.tag==='0099_revoke_truncate_trigger_references'?String(p.when):'none')")
echo "${W99}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0099's journal when did not parse from the journal at the PR head. Nothing was run"; exit 1; }
test -f packages/db/migrations/${T99}.sql || { echo "STOP: the file of journal idx 96 is not on disk. Nothing was run"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T99}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0099 on disk is not the file this document pins. Nothing was run"; exit 1; }
echo "0099: packages/db/migrations/${T99}.sql, sha256 ${SHAPREV}, journal when ${W99}"

echo "--- the transcript R9's proof 3 reads: the pinned pre-check's name, the head, the guard's verdict, the pre-check whole and its summary"
echo "earlier pre-check ${SHAPRE}" > /tmp/0100-precheck-earlier.new
echo "from PR #1520's head ${PRHEAD}, before the merge, Lisbon $(TZ=Europe/Lisbon date '+%Y-%m-%d %H:%M')" >> /tmp/0100-precheck-earlier.new

echo "--- the production target, asserted by the guard, not by the prompt. Its output goes into the transcript"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs 2>&1 | tee -a /tmp/0100-precheck-earlier.new
grep -qxF 'target verified: production, session pooler.' /tmp/0100-precheck-earlier.new || { echo "STOP: the guard's verdict line is not in the transcript. Nothing is recorded"; exit 1; }

echo "--- the pre-check. READ ONLY"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W99} -f scripts/db/precheck-0100-maintain-revoke.sql 2>&1 | tee -a /tmp/0100-precheck-earlier.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-precheck-earlier.new && { echo "STOP: a pre-check verdict read FAIL. Nothing is recorded"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-precheck-earlier.new || true)
[ "${OKS}" = 13 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 13. Nothing is recorded"; exit 1; }
echo "earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL" | tee -a /tmp/0100-precheck-earlier.new
mv /tmp/0100-precheck-earlier.new /tmp/0100-precheck-earlier.out
PE=$(shasum -a 256 /tmp/0100-precheck-earlier.out | cut -d' ' -f1)
echo "PRECHECK_EARLIER=${PE}"
echo "0100 EARLIER PRE-CHECK RECORDED: 13/13 OK, READ ONLY, nothing written. Report this whole output. The transcript stays at /tmp/0100-precheck-earlier.out, untouched, until the apply sitting."
)
```

**EXPECT:** `--- 0100 EARLIER PRE-CHECK SITTING ...`; the two `PR #1520's head` lines, the same
sha twice; `the earlier pre-check runs from PR #1520's head <sha>, before the merge`;
`docs/migration-apply-0100.md: OK`; `0099: packages/db/migrations/0099_revoke_truncate_trigger_references.sql, sha256 fbc5e545..., journal when 1788502000000`;
the guard's `host:`, `port:`, `ref:` lines and `target verified: production, session pooler.`;
the pre-check's 13 OK verdicts, its carries and its three INFO rows (report them as printed;
on 2026-10-02's numbers verdict 7 reads `41 of 48; control 48 of 48`); then
`earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL`, `PRECHECK_EARLIER=<64 hex>` and the
last line `0100 EARLIER PRE-CHECK RECORDED: ...`. Exit 0. The transcript holds the guard's
output, the pre-check's and the summary line, after its two header lines. SOLO records the
printed sha256 as `PRECHECK_EARLIER` in stages 0 and 1, on the branch, before the merge: an
amendment with its own R4 round (NOT READY step 8). A FAIL, a count other than 13 or a missing
guard verdict leaves nothing recorded: the `.new` file is never moved.

## STAGE 0: the promotion, the files, the clock and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0100.sha256
MIG=packages/db/migrations/0100_revoke_maintain.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0099_revoke_maintain.sql
SHA0100=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPREV=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPRE=d68ca1a2f791cd9f15b8f5466ae068b6cf0cfd23ab1af6f03891854100264d33
SHAPOST=3a77cca47927845fa7cc6e3c665597882a35492809cfed2b3633a759e42c846f
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6
PRECHECK_EARLIER=PLACEHOLDER-UNTIL-THE-EARLIER-SITTING

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0100-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0100 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0100-main.sha /tmp/0100-window.ok /tmp/0100-sitting.start
touch /tmp/0100-sitting.start
echo "this sitting's start record: /tmp/0100-sitting.start, written at Lisbon $(TZ=Europe/Lisbon date '+%Y-%m-%d %H:%M')"
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}
echo "--- THE HEAD CHECK: the worktree must be on the origin/main this stage records"
[ "$(git rev-parse HEAD)" = "${MAIN}" ] || { echo "STOP: the worktree is not on origin/main after the checkout"; exit 1; }
echo "origin/main and HEAD: ${MAIN}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0100 is not on disk at origin/main, so the PR has not merged"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N100=$(find packages/db/migrations -maxdepth 1 -name '0100_*.sql' | wc -l | tr -d ' ')
[ "${N100}" = 1 ] || { echo "STOP: ${N100} files claim migration number 0100, not 1"; exit 1; }
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 1 ] || { echo "STOP: ${N99} files claim migration number 0099, not 1"; exit 1; }
test -f scripts/db/precheck-0100-maintain-revoke.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0100-maintain-revoke.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: scripts/production-target.mjs is not on disk, so the guard pair (#1508, #1509) has not merged. Nothing was applied"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0100}" ] || { echo "STOP: 0100 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0100-maintain-revoke.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0100-maintain-revoke.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. Until the guard pair is on main this is expected, and nothing was applied"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file. Until the guard pair is on main this is expected, and nothing was applied"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===98&&e.idx===97&&e.tag==='0100_revoke_maintain'&&e.when===1788502100000&&p.idx===96&&p.tag==='0099_revoke_truncate_trigger_references'&&p.when===1788502000000?0:1)" || { echo "STOP: the newest journal entry is not idx 97, tag 0100_revoke_maintain, when 1788502100000, of 98, after idx 96 tagged 0099_revoke_truncate_trigger_references at when 1788502000000"; exit 1; }
test -f packages/db/migrations/0099_revoke_truncate_trigger_references.sql || { echo "STOP: the file of journal idx 96 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0099_revoke_truncate_trigger_references.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0099 on disk is not the file this document pins"; exit 1; }
echo "0099 on disk: 0099_revoke_truncate_trigger_references.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0100-check-journal.out
grep -qF '98 .sql files match 98 journal entries' /tmp/0100-check-journal.out || { echo "STOP: check-journal did not reconcile 98 files with 98 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): closed hours pass; inside clinic hours, only all three proofs pass"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qxE '[0-9]{4}' || { echo "STOP: the Lisbon clock did not read as HHMM. Nothing was applied"; exit 1; }
if awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon ${LT}: ${CLOCK} by the clock (closed is before 08:00 or from 21:00)"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
if node -e 'const b=require("fs").readFileSync(process.argv[1]);const C="/* ====================================================================== */ /* Take MAINTAIN off `authenticated`, and stop new tables from being born */ /* holding it. */ /* ====================================================================== */ /* WHAT THIS IS ABOUT. Every tenant-scoped staff read and write runs as */ /* `authenticated`: withTenantContext issues `set local role */ /* authenticated` (packages/db/src/client.ts), which is what makes RLS */ /* apply at all. So a privilege `authenticated` holds is a privilege the */ /* application holds on every request. */ /* */ /* MAINTAIN is the eighth table privilege, new in Postgres 17. It lets a */ /* role run VACUUM, ANALYZE, CLUSTER, REINDEX and REFRESH MATERIALIZED */ /* VIEW on the relation, and LOCK TABLE in any mode. Supabase\x27s ALTER */ /* DEFAULT PRIVILEGES grants ALL on new tables to `authenticated`, and on */ /* Postgres 17 ALL includes MAINTAIN. The migration before this one took */ /* TRUNCATE, TRIGGER and REFERENCES off `authenticated` by the same two */ /* statements and left MAINTAIN on purpose, because the card it acted on */ /* named three privileges. The lead\x27s ruling S-1001-A R1 takes MAINTAIN */ /* off too: \x22MAINTAIN on authenticated: REVOKE, tables in public plus the */ /* matching default privileges, same shape as 0099.\x22 */ /* */ /* ====================================================================== */ /* 1. THE MEASUREMENT THIS ACTS ON (S-1001-A R3, \x22measurement before */ /* build\x22), production, 2026-10-02, READ ONLY */ /* ====================================================================== */ /* scripts/db/measure-0100-maintain.sql, run inside a READ ONLY */ /* transaction and rolled back: */ /* - 48 relations in `public`, every one an ordinary table: 0 */ /* partitioned, 0 views, 0 materialized views, 0 foreign tables; */ /* - `authenticated` holds MAINTAIN on 41 of the 48, GRANTED and */ /* EFFECTIVE alike (41 by the ACL, 41 by has_table_privilege), so no */ /* PUBLIC grant and no role membership hands it MAINTAIN: removing its */ /* own grant removes all of it; */ /* - `anon` and PUBLIC hold nothing on any table in `public`; */ /* - the default privileges of `postgres` for TABLES in `public` grant */ /* `authenticated` DELETE, INSERT, MAINTAIN, SELECT, UPDATE. So the */ /* next CREATE TABLE by `postgres` re-grants MAINTAIN unless the */ /* default changes too; */ /* - the defaults of `supabase_admin` grant `authenticated` all eight. */ /* They are out of reach: ALTER DEFAULT PRIVILEGES without FOR ROLE */ /* changes the running role\x27s default only, and `postgres` is not a */ /* member of `supabase_admin`. They reach only a table */ /* `supabase_admin` creates in `public`, and every table there is */ /* `postgres`\x27s. */ /* */ /* ====================================================================== */ /* 2. NOTHING NEEDS IT */ /* ====================================================================== */ /* No code in apps/ or packages/ runs VACUUM, ANALYZE, CLUSTER, REINDEX, */ /* REFRESH MATERIALIZED VIEW or LOCK TABLE. The two LOCK TABLE statements */ /* in scripts/ belong to a data op the owner\x27s session runs as the table */ /* owner, and the ANALYZE statements belong to local perf seeders run the */ /* same way. Autovacuum needs no grant. The schema has no materialized */ /* view. */ /* */ /* WHAT THE REVOKE DOES AND DOES NOT TAKE AWAY, said precisely. Postgres */ /* 17 lets LOCK TABLE take any mode from a role holding MAINTAIN, UPDATE, */ /* DELETE or TRUNCATE. So `authenticated` keeps a strong LOCK on every */ /* table where it still holds UPDATE or DELETE, and loses it only where it */ /* holds neither. What it loses everywhere is VACUUM, ANALYZE, CLUSTER, */ /* REINDEX and REFRESH MATERIALIZED VIEW. SELECT, INSERT, UPDATE and */ /* DELETE read their own privilege bits and never MAINTAIN, so no read and */ /* no write the application makes can change. */ /* */ /* ====================================================================== */ /* 3. THE TWO SET LOCAL LINES FIRST */ /* ====================================================================== */ /* The lead\x27s ruling (b) of 2026-10-01: every migration from 0100 starts */ /* with exactly these two lines, values accepted by strategy (R10), and */ /* scripts/migration-timeouts.test.mjs refuses a file without them. A */ /* migration that cannot take a lock in 5 seconds fails and rolls back */ /* with nothing applied, instead of queueing behind a long transaction */ /* while every query on that table queues behind it. This file takes no */ /* table lock (a GRANT or REVOKE rewrites the catalogue row, not the */ /* table), so neither bound should ever fire; they are there because the */ /* rule is the rule from this number on. */ /* */ /* ====================================================================== */ /* 4. WHY A LOOP AND NOT A LIST */ /* ====================================================================== */ /* The same reason as the migration before it: the end state is a property */ /* of EVERY table in `public`, present and future. The loop fixes today\x27s */ /* tables; section 5\x27s ALTER DEFAULT PRIVILEGES keeps it true for */ /* tomorrow\x27s. A table where `authenticated` holds no MAINTAIN is left as */ /* it is: revoking a privilege nobody holds changes no privilege. */ SET LOCAL lock_timeout = \x275s\x27;--> statement-breakpoint SET LOCAL statement_timeout = \x2760s\x27;--> statement-breakpoint DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.oid::regclass AS tbl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \x27public\x27 AND c.relkind IN (\x27r\x27, \x27p\x27) /* ordinary + partitioned tables */ LOOP EXECUTE format( \x27REVOKE MAINTAIN ON TABLE %s FROM authenticated\x27, r.tbl ); END LOOP; END $$;--> statement-breakpoint /* ====================================================================== */ /* 5. THE DEFAULT, SO THE NEXT CREATE TABLE DOES NOT RE-GRANT IT */ /* ====================================================================== */ /* REVOKE of exactly MAINTAIN, not REVOKE ALL: `authenticated` still */ /* receives SELECT, INSERT, UPDATE and DELETE on a new table from this */ /* default, and every migration that narrows those does it per table. */ /* Revoking ALL by default would silently change what every future */ /* migration has to restate. */ ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM authenticated;--> statement-breakpoint /* ====================================================================== */ /* 6. WHAT THIS DOES NOT DO */ /* ====================================================================== */ /* It is catalogue-only. It writes no row, creates, alters or drops no */ /* table, policy or function, and touches no column. It removes one */ /* privilege no code path uses from one role. Every other privilege of */ /* every role, every policy, every function and the SECURITY DEFINER count */ /* are unchanged, and the apply document\x27s post-check proves each. There */ /* is no data change and no backfill. */";const fine=(c)=>c===9||c===10||(c>=32&&c<=126);let at=-1;for(let i=0;i<b.length;i++){if(fine(b[i])===false){at=i;break}}let why="",ok=false;if(at>=0){why="a byte outside printable ASCII, TAB and LF, 0x"+b[at].toString(16).padStart(2,"0")+" at offset "+at}else{const t=b.toString("latin1").replace(/[ \t\n]+/g," ").trim();if(t===C){ok=true;why="equal to the reviewed text, whitespace aside"}else{let k=0;while(k<t.length&&k<C.length&&t[k]===C[k])k++;why="differs from the reviewed text at normalized offset "+k+" ("+t.length+" characters against "+C.length+")"}}console.log("catalog-only: "+why+": "+(ok?"CATALOG-ONLY":"NOT PROVEN"));process.exit(ok?0:1)' "${MIG}"; then D2=yes; fi
D3=no
if echo "${PRECHECK_EARLIER}" | grep -qxE '[0-9a-f]{64}' && test -f /tmp/0100-precheck-earlier.out && [ "$(shasum -a 256 /tmp/0100-precheck-earlier.out | cut -d' ' -f1)" = "${PRECHECK_EARLIER}" ] && [ "$(head -1 /tmp/0100-precheck-earlier.out)" = "earlier pre-check ${SHAPRE}" ] && grep -qxF 'target verified: production, session pooler.' /tmp/0100-precheck-earlier.out && [ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 13 ] && [ "$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 0 ] && grep -qxF 'earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL' /tmp/0100-precheck-earlier.out && [ /tmp/0100-precheck-earlier.out -ot /tmp/0100-sitting.start ] && [ -n "$(find /tmp/0100-precheck-earlier.out -mmin +30)" ]; then D3=yes; fi
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${MAIN} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only: ${D2}"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting, its transcript recorded and older than this sitting: ${D3}"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the clock. The proofs are printed, not required"; elif [ "${D1}${D2}${D3}" = yesyesyes ]; then echo "R9 DAYTIME: Lisbon ${LT} is inside clinic hours, and all three proofs hold"; else echo "STOP: Lisbon ${LT} is inside clinic hours (08:00 to 21:00), and R9's three proofs do not all hold (gate ${D1}, catalog-only ${D2}, earlier pre-check ${D3}). A sitting inside clinic hours needs all three; this one waits for closed hours. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0100-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/0100-main.sha"
echo "0100 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `this sitting's start record: ...`; `--- THE HEAD CHECK ...` and `origin/main and
HEAD: <sha>`; the sidecar line `docs/migration-apply-0100.md: OK`; then
`newest journal entry: idx 97, when 1788502100000, tag 0100_revoke_maintain, of 98; before it idx 96, when 1788502000000, tag 0099_revoke_truncate_trigger_references`;
then `0099 on disk: 0099_revoke_truncate_trigger_references.sql, sha256 fbc5e545...`; then
check-journal's line `... 98 .sql files match 98 journal entries in order ...`; then the
clock: `Lisbon <HHMM>: closed by the clock ...` or `open`, the `catalog-only:` line ending
`CATALOG-ONLY`, the three proof lines (proof 1 `yes` while main's gate file hashes to
`SHAGATE`, proof 2 `yes`, proof 3 `no` until `PRECHECK_EARLIER` is filled), and either `R9: closed hours by the clock ...` or, inside clinic hours, `R9
DAYTIME: ...` only when all three read `yes` (otherwise the STOP); then `running from
origin/main <sha>, recorded in /tmp/0100-main.sha`; then
`0100 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database. The sha it
prints is the one every later stage runs from.

**Proof 3's two time tests in this block, `-ot /tmp/0100-sitting.start` and `-mmin +30`, are A
JUDGMENT, NOT A RULING:** SOLO's reading of R9's "an earlier sitting", which guards against a
pre-check run moments before, or inside, this sitting being passed off as an earlier one; the
lead may set another value (see R9, proof 3).

**Until the guard pair is on main, this stage ends at** `STOP: scripts/production-target.mjs is
not on disk, so the guard pair (#1508, #1509) has not merged. Nothing was applied`. That is the
safe direction, and the halt rule governs it.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -eo pipefail
MIG=packages/db/migrations/0100_revoke_maintain.sql
SHA0100=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPREV=fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b
SHAPRE=d68ca1a2f791cd9f15b8f5466ae068b6cf0cfd23ab1af6f03891854100264d33
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6
PRECHECK_EARLIER=PLACEHOLDER-UNTIL-THE-EARLIER-SITTING

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0100-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0100 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0100-precheck.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0100-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
test -f /tmp/0100-sitting.start || { echo "STOP: stage 0 wrote no start record in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0100-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0100.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0100 is not on disk"; exit 1; }
test -f scripts/db/precheck-0100-maintain-revoke.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N100=$(find packages/db/migrations -maxdepth 1 -name '0100_*.sql' | wc -l | tr -d ' ')
[ "${N100}" = 1 ] || { echo "STOP: ${N100} files claim migration number 0100, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0100}" ] || { echo "STOP: 0100 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0100-maintain-revoke.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T99=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[96];process.stdout.write(p&&p.idx===96&&p.tag==='0099_revoke_truncate_trigger_references'?p.tag:'none')")
W99=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[96];process.stdout.write(p&&p.idx===96&&p.tag==='0099_revoke_truncate_trigger_references'?String(p.when):'none')")
echo "${W99}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0099's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T99}.sql || { echo "STOP: the file of journal idx 96 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T99}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0099 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0099: packages/db/migrations/${T99}.sql, sha256 ${SHAPREV}, journal when ${W99}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0100-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0100-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0100-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0100-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0100-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W99} -f scripts/db/precheck-0100-maintain-revoke.sql 2>&1 | tee /tmp/0100-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-precheck.new || true)
[ "${OKS}" = 13 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 13. Nothing was applied"; exit 1; }

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- THE CLOCK AND THE CLINICS (R9), again, right before the apply: closed hours pass; inside clinic hours, only all three proofs pass"
LT=$(TZ=Europe/Lisbon date +%H%M)
echo "${LT}" | grep -qxE '[0-9]{4}' || { echo "STOP: the Lisbon clock did not read as HHMM. Nothing was applied"; exit 1; }
if awk -v t="${LT}" 'BEGIN { if ((t + 0) < 800 || (t + 0) >= 2100) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon ${LT}: ${CLOCK} by the clock (closed is before 08:00 or from 21:00)"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (now() at time zone 'Europe/Lisbon')::time >= opens_at and (now() at time zone 'Europe/Lisbon')::time < closes_at) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1)
echo "active clinics open now by their own hours: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=closed; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=open; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "clinics by their own rows: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
if node -e 'const b=require("fs").readFileSync(process.argv[1]);const C="/* ====================================================================== */ /* Take MAINTAIN off `authenticated`, and stop new tables from being born */ /* holding it. */ /* ====================================================================== */ /* WHAT THIS IS ABOUT. Every tenant-scoped staff read and write runs as */ /* `authenticated`: withTenantContext issues `set local role */ /* authenticated` (packages/db/src/client.ts), which is what makes RLS */ /* apply at all. So a privilege `authenticated` holds is a privilege the */ /* application holds on every request. */ /* */ /* MAINTAIN is the eighth table privilege, new in Postgres 17. It lets a */ /* role run VACUUM, ANALYZE, CLUSTER, REINDEX and REFRESH MATERIALIZED */ /* VIEW on the relation, and LOCK TABLE in any mode. Supabase\x27s ALTER */ /* DEFAULT PRIVILEGES grants ALL on new tables to `authenticated`, and on */ /* Postgres 17 ALL includes MAINTAIN. The migration before this one took */ /* TRUNCATE, TRIGGER and REFERENCES off `authenticated` by the same two */ /* statements and left MAINTAIN on purpose, because the card it acted on */ /* named three privileges. The lead\x27s ruling S-1001-A R1 takes MAINTAIN */ /* off too: \x22MAINTAIN on authenticated: REVOKE, tables in public plus the */ /* matching default privileges, same shape as 0099.\x22 */ /* */ /* ====================================================================== */ /* 1. THE MEASUREMENT THIS ACTS ON (S-1001-A R3, \x22measurement before */ /* build\x22), production, 2026-10-02, READ ONLY */ /* ====================================================================== */ /* scripts/db/measure-0100-maintain.sql, run inside a READ ONLY */ /* transaction and rolled back: */ /* - 48 relations in `public`, every one an ordinary table: 0 */ /* partitioned, 0 views, 0 materialized views, 0 foreign tables; */ /* - `authenticated` holds MAINTAIN on 41 of the 48, GRANTED and */ /* EFFECTIVE alike (41 by the ACL, 41 by has_table_privilege), so no */ /* PUBLIC grant and no role membership hands it MAINTAIN: removing its */ /* own grant removes all of it; */ /* - `anon` and PUBLIC hold nothing on any table in `public`; */ /* - the default privileges of `postgres` for TABLES in `public` grant */ /* `authenticated` DELETE, INSERT, MAINTAIN, SELECT, UPDATE. So the */ /* next CREATE TABLE by `postgres` re-grants MAINTAIN unless the */ /* default changes too; */ /* - the defaults of `supabase_admin` grant `authenticated` all eight. */ /* They are out of reach: ALTER DEFAULT PRIVILEGES without FOR ROLE */ /* changes the running role\x27s default only, and `postgres` is not a */ /* member of `supabase_admin`. They reach only a table */ /* `supabase_admin` creates in `public`, and every table there is */ /* `postgres`\x27s. */ /* */ /* ====================================================================== */ /* 2. NOTHING NEEDS IT */ /* ====================================================================== */ /* No code in apps/ or packages/ runs VACUUM, ANALYZE, CLUSTER, REINDEX, */ /* REFRESH MATERIALIZED VIEW or LOCK TABLE. The two LOCK TABLE statements */ /* in scripts/ belong to a data op the owner\x27s session runs as the table */ /* owner, and the ANALYZE statements belong to local perf seeders run the */ /* same way. Autovacuum needs no grant. The schema has no materialized */ /* view. */ /* */ /* WHAT THE REVOKE DOES AND DOES NOT TAKE AWAY, said precisely. Postgres */ /* 17 lets LOCK TABLE take any mode from a role holding MAINTAIN, UPDATE, */ /* DELETE or TRUNCATE. So `authenticated` keeps a strong LOCK on every */ /* table where it still holds UPDATE or DELETE, and loses it only where it */ /* holds neither. What it loses everywhere is VACUUM, ANALYZE, CLUSTER, */ /* REINDEX and REFRESH MATERIALIZED VIEW. SELECT, INSERT, UPDATE and */ /* DELETE read their own privilege bits and never MAINTAIN, so no read and */ /* no write the application makes can change. */ /* */ /* ====================================================================== */ /* 3. THE TWO SET LOCAL LINES FIRST */ /* ====================================================================== */ /* The lead\x27s ruling (b) of 2026-10-01: every migration from 0100 starts */ /* with exactly these two lines, values accepted by strategy (R10), and */ /* scripts/migration-timeouts.test.mjs refuses a file without them. A */ /* migration that cannot take a lock in 5 seconds fails and rolls back */ /* with nothing applied, instead of queueing behind a long transaction */ /* while every query on that table queues behind it. This file takes no */ /* table lock (a GRANT or REVOKE rewrites the catalogue row, not the */ /* table), so neither bound should ever fire; they are there because the */ /* rule is the rule from this number on. */ /* */ /* ====================================================================== */ /* 4. WHY A LOOP AND NOT A LIST */ /* ====================================================================== */ /* The same reason as the migration before it: the end state is a property */ /* of EVERY table in `public`, present and future. The loop fixes today\x27s */ /* tables; section 5\x27s ALTER DEFAULT PRIVILEGES keeps it true for */ /* tomorrow\x27s. A table where `authenticated` holds no MAINTAIN is left as */ /* it is: revoking a privilege nobody holds changes no privilege. */ SET LOCAL lock_timeout = \x275s\x27;--> statement-breakpoint SET LOCAL statement_timeout = \x2760s\x27;--> statement-breakpoint DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.oid::regclass AS tbl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \x27public\x27 AND c.relkind IN (\x27r\x27, \x27p\x27) /* ordinary + partitioned tables */ LOOP EXECUTE format( \x27REVOKE MAINTAIN ON TABLE %s FROM authenticated\x27, r.tbl ); END LOOP; END $$;--> statement-breakpoint /* ====================================================================== */ /* 5. THE DEFAULT, SO THE NEXT CREATE TABLE DOES NOT RE-GRANT IT */ /* ====================================================================== */ /* REVOKE of exactly MAINTAIN, not REVOKE ALL: `authenticated` still */ /* receives SELECT, INSERT, UPDATE and DELETE on a new table from this */ /* default, and every migration that narrows those does it per table. */ /* Revoking ALL by default would silently change what every future */ /* migration has to restate. */ ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM authenticated;--> statement-breakpoint /* ====================================================================== */ /* 6. WHAT THIS DOES NOT DO */ /* ====================================================================== */ /* It is catalogue-only. It writes no row, creates, alters or drops no */ /* table, policy or function, and touches no column. It removes one */ /* privilege no code path uses from one role. Every other privilege of */ /* every role, every policy, every function and the SECURITY DEFINER count */ /* are unchanged, and the apply document\x27s post-check proves each. There */ /* is no data change and no backfill. */";const fine=(c)=>c===9||c===10||(c>=32&&c<=126);let at=-1;for(let i=0;i<b.length;i++){if(fine(b[i])===false){at=i;break}}let why="",ok=false;if(at>=0){why="a byte outside printable ASCII, TAB and LF, 0x"+b[at].toString(16).padStart(2,"0")+" at offset "+at}else{const t=b.toString("latin1").replace(/[ \t\n]+/g," ").trim();if(t===C){ok=true;why="equal to the reviewed text, whitespace aside"}else{let k=0;while(k<t.length&&k<C.length&&t[k]===C[k])k++;why="differs from the reviewed text at normalized offset "+k+" ("+t.length+" characters against "+C.length+")"}}console.log("catalog-only: "+why+": "+(ok?"CATALOG-ONLY":"NOT PROVEN"));process.exit(ok?0:1)' "${MIG}"; then D2=yes; fi
D3=no
if echo "${PRECHECK_EARLIER}" | grep -qxE '[0-9a-f]{64}' && test -f /tmp/0100-precheck-earlier.out && [ "$(shasum -a 256 /tmp/0100-precheck-earlier.out | cut -d' ' -f1)" = "${PRECHECK_EARLIER}" ] && [ "$(head -1 /tmp/0100-precheck-earlier.out)" = "earlier pre-check ${SHAPRE}" ] && grep -qxF 'target verified: production, session pooler.' /tmp/0100-precheck-earlier.out && [ "$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 13 ] && [ "$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 0 ] && grep -qxF 'earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL' /tmp/0100-precheck-earlier.out && [ /tmp/0100-precheck-earlier.out -ot /tmp/0100-sitting.start ] && [ -n "$(find /tmp/0100-precheck-earlier.out -mmin +30)" ]; then D3=yes; fi
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only: ${D2}"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting, its transcript recorded and older than this sitting: ${D3}"
if [ "${CLOCK}${CLINICS}" = closedclosed ]; then echo "R9: closed hours, by the clock and by every active clinic's own row. The proofs are printed, not required"; elif [ "${D1}${D2}${D3}" = yesyesyes ]; then echo "R9 DAYTIME: Lisbon ${LT}, clock ${CLOCK}, clinics ${CLINICS}: inside clinic hours, and all three proofs hold"; else echo "STOP: Lisbon ${LT}, clock ${CLOCK}, clinics ${CLINICS}: inside clinic hours, and R9's three proofs do not all hold (gate ${D1}, catalog-only ${D2}, earlier pre-check ${D3}). A sitting inside clinic hours needs all three; this one waits for closed hours. Nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0100-postcheck.out /tmp/0100-stage2.ok /tmp/0100-journal-after.out /tmp/0100-apply.out /tmp/0100-applied.ok
mv /tmp/0100-precheck.new /tmp/0100-precheck.out

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0100-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0100_revoke_maintain --sha256 ${SHA0100} --expect-pending 1 2>&1 | tee /tmp/0100-apply.out
touch /tmp/0100-applied.ok
echo "0100 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now: <sha>`, the
  same sha twice** (the block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0100.md: OK`;
- **`0099: packages/db/migrations/0099_revoke_truncate_trigger_references.sql, sha256 fbc5e545..., journal when 1788502000000`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it, then the target guard's `host:`, `port:`, `ref:` and
  `target verified: production, session pooler.`;
- **the pre-check prints `13` OK verdicts and no FAIL,** `journal_rows_before` 97, verdict 2
  naming 0099 as the newest row at 1788502000000, and its carries and INFO rows (report them as
  printed: `maintain_before` is the count the apply takes to zero; on 2026-10-02 it was 41 of
  48);
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`;**
- **the clock and the clinics:** `Lisbon <HHMM>: closed|open by the clock ...`,
  `active clinics open now by their own hours: <k> of <n>` with `n` at least 1,
  `clinics by their own rows: closed|open`, the `catalog-only:` line, the three proof lines,
  then `R9: closed hours, ...` or, inside clinic hours and only with all three proofs `yes`,
  `R9 DAYTIME: ...`; otherwise the STOP, with nothing applied. Proof 3's two time tests here,
  `-ot /tmp/0100-sitting.start` and `-mmin +30`, are **A JUDGMENT, NOT A RULING**, the same
  lines as stage 0's: SOLO's reading of R9's "an earlier sitting", which guards against a
  pre-check run moments before, or inside, this sitting being passed off as an earlier one; the
  lead may set another value;
- **verified-migrate, teed whole to `/tmp/0100-apply.out`:**
  `file       0100_revoke_maintain.sql present, sha256 matches`,
  `journal    97 row(s) applied, last when=1788502000000`,
  `pending    1  [0100_revoke_maintain]` (exactly one), the drizzle-kit banner with its stdout,
  stderr and exit, then `journal    97 -> 98  (delta 1)`,
  `0100_revoke_maintain present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0100 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the
  journal from the database rather than trusting these lines.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment variable;
**3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing from
`_journal.json`, an already-applied migration or a pending count that is not 1, and AFTER
drizzle has run on a journal that moved by the wrong amount or moved without the approved
sha256; **4** if drizzle itself failed or on any thrown error; **5** if drizzle reports
success and the journal did not move. Exit 3 can therefore follow a committed apply too.
The `tee` keeps that exit: the block runs with `pipefail`, so the stage exits with
verified-migrate's own code.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits 4 on
ANY thrown error, including its own journal read AFTER drizzle has committed. drizzle applies
the file's statements and the journal row in ONE transaction, so the migration is either
wholly applied or not at all. **If stage 1 ended non-zero after the `--- drizzle-kit migrate ---`
banner had printed, the halt rule governs: GREEN pastes nothing else, not stage 1 again and not
the journal read, and reports the exit code and the whole output** (`/tmp/0100-apply.out` holds
it). The read that answers whether 0100 is applied is
`packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs only on the owner's or
the lead's word.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle never
ran** (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in a clone whose `node_modules` does not
match its lockfile). The block then prints `journal    97 -> 97  (delta 0)`: nothing was
applied. The halt rule governs it all the same.

**A fired bound is a clean failure.** If `lock_timeout` or `statement_timeout` fired, drizzle's
transaction rolled back: the journal reads `97 -> 97 (delta 0)` and nothing was applied. It is
still a halt, and the lead rules on it.

**drizzle-kit prints two NOTICE objects between its banner and its success line,**
`42P06 schema "drizzle" already exists, skipping` and `42P07 relation "__drizzle_migrations"
already exists, skipping` (measured in 0099's rehearsal). They are not a halt.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was applied,**
the HEAD CHECK's, the run window's, the pre-check's and the clock's included, and the previous
sitting's transcripts are untouched: the failed run's output stays in the `.new` file.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0100=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPOST=3a77cca47927845fa7cc6e3c665597882a35492809cfed2b3633a759e42c846f
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0100-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0100-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0100-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout"; exit 1; }
shasum -a 256 -c docs/migration-apply-0100.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0100_revoke_maintain.sql || { echo "STOP: 0100 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0100-maintain-revoke.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0100_revoke_maintain.sql | cut -d' ' -f1)" = "${SHA0100}" ] || { echo "STOP: 0100 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0100-maintain-revoke.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0100-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0100-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0100-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0100-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0100-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0100-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0100-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
S=$(carry secdef_functions_before)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
XM=$(carry dml_profile_md5)
MB=$(carry maintain_before)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${S}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${XM}" ] && [ -n "${MB}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "${J} ${T} ${S} ${MB}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+ [0-9]+' || { echo "STOP: a count carry is not a number"; exit 1; }
echo "${PM} ${FM} ${RM} ${CM} ${DM} ${XM}" | grep -qxE '[0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: an md5 carry is not 32 hex characters"; exit 1; }
echo "carries from this run: journal_before=${J} tables_before=${T} secdef_before=${S} policies=${PM} functions=${FM} relation_acl=${RM} column_acl=${CM} default_acl=${DM} dml_profile=${XM}; authenticated held MAINTAIN on ${MB}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0100-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v secdef_before="${S}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v dml_profile_md5="${XM}" -c "begin read only" -f scripts/db/postcheck-0100-maintain-revoke.sql -c "rollback" 2>&1 | tee /tmp/0100-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-postcheck.out || true)
[ "${OKS}" = 12 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 12. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0100 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0100}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0100 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0100 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0100-stage2.ok
echo "0100 POST-CHECK PASSED. 13/13 pre-check OK, 12/12 post-check OK, journal ${J} to ${JA}; authenticated MAINTAIN ${MB} to 0 of ${T} tables. Paste the closing journal read now."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `checking from the recorded sha <sha>` and whether main
moved; `docs/migration-apply-0100.md: OK`; the run window line with now before the end (the
block halts otherwise, and the write stands); the carry line reads `journal_before=97`; the
target guard; the post-check prints `12` OK verdicts and no FAIL, then its FOR THE RECORD table
(the `public` TABLES default of `postgres`: `authenticated` holding
`DELETE,INSERT,SELECT,UPDATE`, MAINTAIN gone); the journal reads `97` before and `98` after,
with 0100's sha256 in it exactly once; the last line reads exactly
`0100 POST-CHECK PASSED. 13/13 pre-check OK, 12/12 post-check OK, journal 97 to 98; authenticated MAINTAIN <n> to 0 of <N> tables. Paste the closing journal read now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 2 exited 0 with its last line
`0100 POST-CHECK PASSED. ...`.

```
(
set -eo pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0100-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0100-main.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0100-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0100-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0100-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0100-stage2.ok -newer /tmp/0100-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0100-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0100-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0100-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0100-journal-after.out
grep -qx 'journal rows on production: 98' /tmp/0100-journal-after.out || { echo "STOP: the journal read after the apply does not say 98"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0100_revoke_maintain[.]sql$' /tmp/0100-journal-after.out || { echo "STOP: the journal read does not list 0100 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0100-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0100-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 98, 0100 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and whether main moved; the run window line with now
before its end; the reader's and its module's sha256 line; then the read printed IN FULL
through `tee`: `journal rows on production: 98`, every migration file on the recorded sha
listed `APPLIED`, 0100 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 98, 0100 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted.

## What every verdict must read

**Pre-check, 13 verdicts, all `OK`, each with its control:** 0 the transaction is READ ONLY;
1 0100 absent by hash (control: the same count finds 0099 once); 2 0099 present by hash once,
the newest row, at its journal `when`; `journal_rows_before` **97**; 4 the session is
`postgres` (control: `authenticated` is no member of `postgres`); 5 every ordinary and
partitioned table in `public` is owned by the session role (control: there is one); 6 every
MAINTAIN grant to `authenticated` names the session role as grantor (control: one exists);
7 THE PREMISE, `authenticated` holds MAINTAIN on at least one table (control: the owner holds it
on every table); 8 `authenticated` holds MAINTAIN only by its own grant: the effective count
equals the own-grant count, no table grants it to PUBLIC or to a role `authenticated` inherits
from, and `authenticated` is no member of `pg_maintain` (control: `pg_maintain` exists);
9 the session role's `public` TABLES default grants `authenticated` MAINTAIN (control:
planted); 10 no GLOBAL default of the session role grants it (control: planted); 11 the five
roles exist; `secdef_functions_before`, every one owned by `postgres`. Then 8 CARRY rows
(`tables_before`, `maintain_before`, `policies_md5`, `functions_md5`, `relation_acl_md5`,
`column_acl_md5`, `default_acl_md5`, `dml_profile_md5`; with `journal_rows_before` and
`secdef_functions_before`, the 10 carries stage 2 reads) and 3 INFO rows: the other creator
roles whose `public` TABLES default grants `authenticated` MAINTAIN (on a Supabase project,
`supabase_admin`), views and materialised views on which `authenticated` holds MAINTAIN
(outside the loop; production has none), and TRUNCATE, TRIGGER, REFERENCES held by
`authenticated` (0099's end state, expected `0, 0, 0`).

**Post-check, 12 verdicts, all `OK`:** 0 READ ONLY; 1 `authenticated` holds MAINTAIN on 0 of N
tables by `has_table_privilege` (so a PUBLIC, inherited or `pg_maintain` path would count), N
the pre-check's N (control: the owner holds it on N of N); 2 the default no longer grants it,
and the entry still exists (control: planted); 3 no GLOBAL default grants it; 4 every other
default privilege unchanged (md5); 5 every other relation privilege in `public` unchanged (md5);
6 every column privilege unchanged (md5); 7 every SELECT, INSERT, UPDATE and DELETE of
`authenticated`, `patient`, `anon` and `service_role` on every relation in `public` unchanged
(md5); 8 every policy unchanged (md5); 9 every function in `public` unchanged (md5) and the
SECURITY DEFINER count equal; 10 the journal `+ 1`; 11 0100 by hash once, the newest row.

**The post-check is not a standing invariant for 4 to 10:** the next migration that grants,
creates a function or adds a policy moves them. It is an assertion about this apply.

**No carry's name is a substring of another's or of any other row's `check` column,** because
stage 2's `carry()` matches column 1 with `index()`; `scripts/maintain-revoke-0100.test.mjs`
asserts it.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 98, 0100 by hash | stage 2, and the closing journal read | the database |
| no table in `public` grants `authenticated` MAINTAIN, by any path | post-check 1, with its control | the catalogue |
| the next `CREATE TABLE` does not re-grant it | post-check 2 and 3; IN ACTION by the build lane's W8 | the default ACL |
| nothing else moved | post-check 4 to 9 | the catalogue, by md5 |
| the app roles still read and write what they do today | post-check 7 (catalogue); IN ACTION by the build lane's W1 and CI's `db-tests` on the promoted head | catalogue and writes |
| a VACUUM, ANALYZE, REINDEX, CLUSTER, or a strong LOCK where it holds no UPDATE or DELETE, by `authenticated` is refused | **NOT DISCHARGED ON PRODUCTION** (a READ ONLY transaction cannot show them). The build lane's W2 to W7, and the rehearsal | the executor, on a throwaway |
| R9, if the sitting is inside clinic hours | stage 0's and stage 1's clock arms, by machine | the apply machine |

## Rehearsal

**NOT YET REHEARSED.** What stands so far is the build lane's synthetic smoke run, below. It is
not the rehearsal: it proves the check files, the migration body and the mechanisms on a
database with the Supabase platform default privileges, not on the OsteoJP schema, and it ran
no block of this document.

### The build lane's synthetic smoke run, 2026-10-02

**Where.** Container `solo-m0100-build` (`supabase/postgres:17.6.1.106`, Postgres 17.6), on
127.0.0.1 only, started and removed by the build lane. A database cloned from the image's
`postgres` database, which carries Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
TO postgres, anon, authenticated, service_role` for `postgres` and for `supabase_admin`. Then, as
`postgres`: 0021's `REVOKE ALL ON TABLES FROM anon` default and 0099's default revoke, so
`postgres`'s `public` TABLES default granted `authenticated` exactly what production's does
(`DELETE,INSERT,MAINTAIN,SELECT,UPDATE`); six tables in `public` (one with RLS, a policy and a
BEFORE UPDATE trigger; one with a foreign key to it; one narrowed by `REVOKE ALL` then
`GRANT SELECT`, so `authenticated` holds no MAINTAIN there, the shape of production's seven;
one with UPDATE and DELETE revoked from `authenticated`; a partitioned table and its
partition), a view, a SECURITY DEFINER function, a role `patient` with `SELECT` and a
column-level `UPDATE (note)`, and a drizzle journal of 97 rows whose newest is 0099's real
sha256 at `when` 1788502000000. The migration was applied with `psql -1` from the pending file
(these exact bytes, sha256 `80f85018...6106`) and its journal row written by hand:
verified-migrate did not run.

**The happy path, with these exact check files:**

| Run | Result |
|---|---|
| pre-check, unapplied | **13 OK / 0 FAIL**; premise 5 of 6, control 6 of 6; verdict 8 `effective 5, own grant 5, effective without own grant 0, through PUBLIC or an inherited role 0, member of pg_maintain false; control 1`; default `authenticated` `DELETE,INSERT,MAINTAIN,SELECT,UPDATE`; INFO `supabase_admin`, 1 view, `0, 0, 0 of 6` |
| the 0100 body, `psql -1` | exit 0 |
| post-check, with the pre-check's carries | **12 OK / 0 FAIL**; `0 of 6; control 6 of 6`; the default now `DELETE,INSERT,SELECT,UPDATE` for `authenticated` |

**Every control broken on purpose, each on its own copy:**

| Arm | Result |
|---|---|
| N1 the pre-check on an APPLIED database | FAIL on 1, 2, `journal_rows_before`, 6, 7, 9 (a second apply is refused before it starts) |
| N2 the post-check on an UNAPPLIED database | FAIL on 1, 2, 10, 11 |
| N3 the loop only, no `ALTER DEFAULT PRIVILEGES` | FAIL on 2 only: the half that is easy to skip is caught alone |
| N4 the `ALTER DEFAULT PRIVILEGES` only, no loop | FAIL on 1 only |
| N5 applied, then `patient` loses SELECT on one table and `authenticated` UPDATE on another | FAIL on 5 and 7 |
| N6 PUBLIC granted MAINTAIN on one table before the apply | pre-check FAIL on 8 only; applied anyway, post-check FAIL on 1: the path verdict 8 exists for |
| N7 `authenticated` made a member of `pg_maintain` | pre-check FAIL on 8 only |
| N8 a GLOBAL default of `postgres` granting `authenticated` MAINTAIN | pre-check FAIL on 10 only |
| N9 a table in `public` owned by another role, which granted `authenticated` MAINTAIN on it | pre-check FAIL on 5 and 6 |
| N10 the premise false (MAINTAIN already gone from the tables and the default) | pre-check FAIL on 6, 7, 9 |
| N11 a journal row after 0099 | pre-check FAIL on 2 and `journal_rows_before` |
| N12 a missing `-v`: the pre-check without `prev_hash`, the post-check without a carry | each STOPs with psql exit 3 before any verdict |

**In action, as `authenticated`, before and after 0100:**

| Arm | Before 0100 | After 0100 |
|---|---|---|
| W1 INSERT a row and a child row through its foreign key, read, UPDATE (the BEFORE UPDATE trigger fired: `touched=1`), DELETE, rolled back | all succeed | **all succeed** |
| W2 `VACUUM` a table | ran | **`WARNING: permission denied to vacuum "syn_a", skipping it`** |
| W3 `ANALYZE` a table | ran | **`WARNING: permission denied to analyze "syn_a", skipping it`** |
| W4 `REINDEX TABLE` | ran | **`permission denied for table syn_a`** |
| W5 `CLUSTER ... USING` its primary key | ran | **`permission denied for table syn_a`** |
| W6 `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` on a table where it holds SELECT and INSERT only | succeeded (by MAINTAIN) | **`permission denied for table syn_d`** |
| W7 the same lock on a table where it holds UPDATE and DELETE | succeeded | **still succeeds**: Postgres 17 grants any lock mode on UPDATE or DELETE |
| W8 the next `CREATE TABLE` by `postgres` | SELECT, INSERT, UPDATE, DELETE, MAINTAIN true; TRUNCATE, REFERENCES, TRIGGER false | **MAINTAIN false**; the rest unchanged |

**No lock, and the bounds in place:**

| Arm | Result |
|---|---|
| L1 another session holds `ACCESS EXCLUSIVE` on two tables the loop revokes on, for 20 s | the body under `psql -1` exit 0 in under a second; inside it `lock_timeout` read `5s` and `statement_timeout` `1min`; the applying session held no lock on either table; the other session still held its lock |
| L1b another session holds an open `INSERT` on one table and `ACCESS EXCLUSIVE` on another | exit 0 in under a second |
| L2 the body outside a transaction block, as each file runs under the Supabase CLI in CI | exit 0, with the two `SET LOCAL can only be used in transaction blocks` WARNINGs |
| the SET LOCAL gate, `scripts/migration-timeouts.test.mjs` from #1510, run on a copy of this branch's migration folders | 13 of 13 pass, the pending file in scope with no problem; and again with the file renamed to `0100_revoke_maintain.sql` in `packages/db/migrations` |
| R9 proof 2's `node -e` check, first version | `CATALOG-ONLY` on the real file; `NOT PROVEN` (exit 1) on planted copies carrying a DELETE, a CREATE TABLE, an ALTER TABLE, a GRANT, a COPY, a loop that TRUNCATEs, or no lock_timeout line; a comment naming DELETE, TRUNCATE and CREATE TABLE stays `CATALOG-ONLY`. R4 round 1 then planted a `LOCK TABLE`, a `GRANT ALL ... TO anon`, an `ALTER POLICY ... USING (true)`, a `REVOKE SELECT ... FROM authenticated` and a `PERFORM pg_sleep(3600)` inside the loop: each exited 0 |
| R9 proof 2's `node -e` check, second version (the R4 round 1 fix, at `ded05f71`) | `CATALOG-ONLY` on the real file; `NOT PROVEN` (exit 1) on each of R4 round 1's five plants, on each forbidden word alone inside the loop, and on one plant per condition of its verdict but the DO-loop count (a fifth statement, a second `EXECUTE`, an `EXECUTE` of another string, a `LOCK` in the loop). As controls, a comment naming every forbidden word inside the loop, and a comment naming DELETE, TRUNCATE and CREATE TABLE outside it, stayed `CATALOG-ONLY`. R4 round 2 then found it passed a lowercase second `execute` (twice) and a `DELETE` hidden after a string holding `/*` or `--`; SOLO found it passed a `$$` inside a `--` comment that ends the `DO` body early |
| R9 proof 2's `node -e` check, third version (the R4 round 2 fix, at `daa1e31f`) | `CATALOG-ONLY` on the real file and on nine controls: a `--` comment and a `/* */` comment, each holding an apostrophe, all 22 forbidden words and EXECUTE, outside the loop and inside it; a nested comment holding the same; a doubled quote inside a string and inside an identifier; a typed literal `date'2026-10-02'`; an identifier holding `$`. `NOT PROVEN` (exit 1) on everything the second version refused; on R4 round 2's four plants and `EXECUTE 'SELECT 1'`; on the `$$`-in-a-comment plant (two loops); on a second `DO` loop; and on one plant per scanner refusal, each refused by the scanner alone with every other condition reading as on the real file (another dollar-quote tag, an `E'` string, a `U&'` string, a `U&"` identifier, and an unterminated string, identifier, comment and dollar quote). The DO-loop count had no plant of its own. The round 2 fix said none could exist because a second loop, or none, breaks the four-statement shape; that was wrong for none, since a literal `DOLOOP;` statement in place of the loop keeps the shape. R4 round 3 then found the scanner passed a `--` comment ended by a CR (PostgreSQL ends one there) and a dollar tag opened right after a digit (`1$q$`), and that its word list held no REASSIGN OWNED, SECURITY LABEL, LOAD, NOTIFY or IMPORT FOREIGN SCHEMA and no function call in an expression |
| R9 proof 2's `node -e` check, fourth version: an exact compare (the R4 round 3 fix, the version in the blocks above) | `CATALOG-ONLY` on the real file; on the real file with extra spaces, TABs and blank lines where whitespace already ran between tokens; and on the real file with a run widened inside the EXECUTEd string. `NOT PROVEN` (exit 1), each reported as a difference from the reviewed text, on 32 earlier plants: the first version's eight (a DELETE, a CREATE TABLE, an ALTER TABLE, an UPDATE, a GRANT, a COPY, a loop that TRUNCATEs, no lock_timeout line), R4 round 1's six files (the five loop plants and `WHERE true` in place of the schema filter), round 2's four with `EXECUTE 'SELECT 1'`, the `$$`-in-a-comment plant, a second `DO` loop, two comments the earlier versions let through, round 3's eight that hold no CR, and round 3's `DOLOOP;` plant (the `DO` loop replaced by a literal `DOLOOP` statement). `NOT PROVEN`, each reported as byte 0x0d at its offset, on round 3's three CR plants. One plant per byte class, each reported with its byte and offset: a CR and a NUL in the code, and a non-ASCII byte (`\u00e9`) in a comment. And three differences, each reported at the normalized offset expected: `'5s'` changed to `'4s'`, a space added inside it (`'5 s'`), and the whitespace removed between `SET` and `LOCAL`. **Its documented limit, pinned:** `CATALOG-ONLY` on R4 round 4's four whitespace-kind variants of the statement-breakpoint markers (A to D: a TAB inside marker 1, 2 or 3 with the LFs after it made spaces, and an LF inside marker 1), each of which hashes to something other than `SHA0100`, which is what refuses them (see R9, proof 2). `scripts/maintain-revoke-0100.test.mjs` runs all of it on every CI run |

**The R9 arm, run in zsh as the blocks are,** extracted verbatim from stage 0 and stage 1 with
`set -eo pipefail`, and three substitutions for the test only: the `/tmp/0100-` paths moved to a
scratch folder (never the apply machine's `/tmp` records), the clock command replaced by a fixed
`HHMM`, and stage 1's clinic read replaced by a fixed string. No database was read. **Re-run on
2026-10-02 on the arm as revised in the R4 round 3 fix** (`r9-arm.mjs` below): 165 cases, 71 in
stage 0 and 94 in stage 1, every one as this table says. A valid earlier transcript is now one
that opens with the pinned pre-check's line and carries the guard's verdict line, 13 `OK` rows,
no `FAIL` row and the summary line, as THE EARLIER PRE-CHECK SITTING writes it.

| Case | Result |
|---|---|
| stage 0 with the placeholders of that run at 0759, 2100, 2230 | exit 0, `R9: closed hours by the clock ...` |
| stage 0 with the placeholders of that run at 0800, 1200, 2059 | **STOP**, exit 1: proof 1 `no`, proof 2 `yes`, proof 3 `no` |
| stage 0 at 1200, `SHAGATE` the real gate file's sha256, a valid earlier transcript two hours old | exit 0, `R9 DAYTIME: ...` |
| stage 0 at 1200, one proof broken at a time: the earlier pin a placeholder; a wrong gate sha256; a wrong earlier sha256; a transcript seconds old; a transcript newer than the start record; a transcript naming another pre-check | **STOP** on each |
| stage 0 and stage 1 at 1200, the earlier transcript hashing to `PRECHECK_EARLIER` but without the guard's verdict line; without the summary line; with 12 `OK` rows; with 14; with one `FAIL` row | **STOP** on each, proof 3 `no` |
| stage 0 and stage 1 at 1200, all else valid, the migration one of `r9-arm.mjs`'s 39 plants: the first version's seven and three comments, R4 round 1's five, round 2's four with `EXECUTE 'SELECT 1'`, the `$$`-in-a-comment plant and a second `DO` loop, round 3's eleven, one per byte class (a CR, a NUL, a non-ASCII byte), `'5s'` changed to `'4s'`, `'5 s'`, and the whitespace removed between `SET` and `LOCAL` | **STOP** on each, proof 2 `no` (78 runs) |
| stage 0 and stage 1 at 1200, all else valid, the migration with extra spaces, TABs and blank lines between tokens, or with a run widened inside the EXECUTEd string | exit 0, `R9 DAYTIME: ...`, proof 2 `yes` (4 runs) |
| stage 1 at 2230 with the clinics `0 of 2` | exit 0, closed by the clock and by every clinic's row |
| stage 1 at 2230 with `1 of 2`, at 0700 with `2 of 2`, at 1200 with `0 of 2` | **STOP** on each (a clinic open by its row, or the clock inside 08:00 to 21:00) |
| stage 1 with the clinics `0 of 0`, empty, `3 of 2`, `01 of 2` | **STOP** on each, on every day |

| File, in the build lane's scratchpad (not committed) | sha256 |
|---|---|
| `fixture-0100.sql`, the synthetic tables and journal | `db9ce237d1f303f43868ad6c5c16f8a9f19ab97b2a0ac22347e5754c9f072cf1` |
| `lib.sh`, the clone, pre, apply and post helpers | `c443f7dceb8dbc73903ef7184eb737efb7c489e065b5179e7b1580602e61d2b1` |
| `arms.sh`, N1 to N12 | `9eb345022e304ac087f625694fb8be2fb5455167183fddfecc3844244c314daa` |
| `in-action.sql`, W1 to W8 | `f977b04c18566dc6bd26846834d82c21518a7af6bc07291a64fcabfe27474057` |
| `locks.sh`, L1, L1b and L2 | `b50117b4e691ec680004c6a144624ddf2d83afbd31bd338fdb40b1ce0b48673a` |
| `plants.sh`, R9 proof 2 read out of stage 0 and run on the real file and the planted copies | `faf511e6fe0748a782556b9b91739a2d125c9ab45bfcbc2b536e06f82697718c` |
| `r9-arm.sh`, the R9 arm cases above | `1272de452a72c16543708ec3c8595b5fb4139735ec6c400daf6e39f306aafc0e` |
| `r9-arm.mjs`, the re-run of the R9 arm cases above on the revised arm, in SOLO's fix-round scratchpad (not committed); its "real gate file" is `scripts/migration-timeouts.test.mjs` as #1510's branch holds it at `a9395757`, sha256 `e65b7ae0251e2c8350c99fb4d082c8efa19c82074877f76d13513deb1703bf51` | `54a7cca951bfb59926ea060047fb741d653d84175633c1033f4fceffb292e98d` |

### What the rehearsal agent owes before the dispatch is issued

Run under the lead's standing rule, verbatim in its prompt: "A script's own REFUSE or STOP line
is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a
script to get past a guard. A block that cannot run on the throwaway is recorded as NOT
REHEARSED and the document says so."

1. **A throwaway at production's position:** a local Supabase stack (the full `auth` schema,
   from GoTrue's own migrations), the promoted head's `supabase/migrations` minus 0100, so 97
   migrations, `0000` to `0099`, and a drizzle journal of 97 rows built from `_journal.json`,
   the newest 0099 (`fbc5e545...`, `when` 1788502000000); **with the Supabase platform default
   privileges in place,** so `authenticated` holds MAINTAIN on the tables. Read the premise
   before any block and record it: on 0099's rehearsal of 2026-10-01 the same position read
   MAINTAIN 41 of 48. The CLI's own stack may not apply the platform defaults (0099's
   document, NOT READY step 6, on CLI v2.106.0 and later); if MAINTAIN reads 0, the premise
   is not met and the run is not a rehearsal of this document.
2. **At least one active `public.locations` row,** with `opens_at` and `closes_at` (production's
   are 08:00 and 21:00), or stage 1's clinic read STOPs, correctly, on `0 of 0`.
3. **This document's five blocks and GREEN's two, extracted verbatim from the promoted head,**
   with `verified-migrate.mjs` reaching drizzle through pnpm, every halt run for real, and each
   allowed substitution named in the prompt, never "the way earlier rehearsals did". The list
   is the lead's to rule; 0099's named five (the apply worktree's `cd`, the `/tmp/0100-` paths,
   the production env source, the target guard line, the dispatch's merge sha).
   - **The new target guard refuses any host but the production pooler.** Every block that runs
     it halts on the throwaway at that line unless the prompt lists its substitution; whatever
     the lead rules, the real guard runs once first and its refusal is recorded.
   - **The journal reader's two reads, the dispatch's BEFORE YOU START read and this
     document's closing read, will be NOT REHEARSED:** the reader now runs the same parsed-host
     check and refuses any target that is not production, and under the lead's rule it is never
     passed. The same reader runs both reads on production in the sitting.
   - **The R9 arm runs on the real clock.** Inside clinic hours, with `PRECHECK_EARLIER` still a
     placeholder (proof 3 `no`; proof 1 reads `yes` since `SHAGATE` was filled), stages 0 and 1 STOP, which is the arm proven in the safe direction; in closed hours they pass by
     the clock. Either is a valid record. The agent never sets `TZ` or the clock to choose.
   - **THE EARLIER PRE-CHECK SITTING runs once, from the PR's head as its block requires** (the
     head it reads from `/tmp/0100-earlier-head.sha` is the one the prompt names), at least 30
     minutes before stage 0, and its `PRECHECK_EARLIER` line is recorded but never filled into
     the rehearsal's copy of this document: filling it is an amendment. **The 30 minutes are A
     JUDGMENT, NOT A RULING,** the same floor as proof 3's: it guards against a pre-check run
     moments before stage 0 being passed off as an earlier sitting, and the lead may set
     another value.
4. **The packages/db suite on the applied throwaway, or CI's `db-tests` on the promoted head,**
   which applies 0100 on a real Supabase stack.
5. **In action on the applied throwaway, as `authenticated`, in rolled-back transactions where a
   transaction is possible:** W1, W2, W3, W6 and W8 above, on OsteoJP tables.

## What this does NOT do, and what is out of scope

- **It changes no read and no write the app makes.** Post-check 5 and 7 prove every other
  privilege and every SELECT, INSERT, UPDATE and DELETE unchanged.
- **Views and materialised views are outside the loop.** The loop covers relkind `r` and `p`.
  Production has neither (2026-10-02). The default privilege (the second half) covers views and
  materialised views created from now on, because `ON TABLES` includes them. The pre-check
  prints the count as an INFO row.
- **`supabase_admin`'s default is not touched,** and cannot be (section 2a).
- **The `patient` role.** `withPatientContext` (`client.ts:196`) drops to `patient`, a
  different principal. The measurement of 2026-10-02 read it holding MAINTAIN on 0 of 48. This
  migration does not touch it; post-check 5 and 7 prove its privileges unchanged.
- **`service_role` keeps MAINTAIN** (47 of 48 on 2026-10-02). It is the platform's
  administrative role, bypasses RLS by design, and is not what the app drops to.
- **LOCK TABLE stays reachable for `authenticated` where it can UPDATE or DELETE.** That is
  Postgres 17's rule, not a grant this migration could revoke (section 3).

## The op carries no DELETE and no TRUNCATE statement

Measured on the migration's code with its comments removed: **0 statements begin with DELETE,
0 begin with TRUNCATE**, and the words DELETE, TRUNCATE, INSERT, UPDATE, COPY, MERGE, CREATE and
DROP do not appear in its code at all (`scripts/maintain-revoke-0100.test.mjs` requires it, and
R9's proof 2 accepts nothing but the reviewed text, whitespace aside). Its four statements are two
`SET LOCAL` lines, a `DO` loop whose one
`EXECUTE` is `REVOKE MAINTAIN ON TABLE %s FROM authenticated`, and one
`ALTER DEFAULT PRIVILEGES` line. The check files write nothing: the pre-check opens its own
READ ONLY transaction and ends in ROLLBACK, and the post-check runs inside the block's
`begin read only`.

## Review history

The R4 rounds this document has had, one row each. Each "fixed in" sha is a local commit on
`db/0100-maintain-revoke`.

- R4 round 1 (0b25ce28): NOT PASS, 3 MAJOR, 4 MINOR; fixed in ded05f71, with the mutation sweep's
  test-file gaps.
- R4 round 2 (ded05f71): NOT PASS, 1 MAJOR, 1 MINOR; fixed in daa1e31f.
- R4 round 3 (daa1e31f): NOT PASS, 1 MAJOR, 3 MINOR; fixed in 4b1754d7, where proof 2 became an
  exact compare.
- R4 round 4 (4b1754d7): 0 BLOCKER, 0 MAJOR, 3 MINOR; fixed after the round in 43fcbab2, prose and test only, no apply-block byte changed; not re-reviewed, under the review-loop cap.
- R8 round 1 on the SHAGATE fill (53a0f23a, NOT READY step 2): NOT PASS, 0 BLOCKER, 1 MAJOR, 4
  MINOR. The two `SHAGATE=` lines, the pin value, the arm's behaviour, the sidecar and the suites
  were confirmed correct. The MAJOR was stage 0's EXPECT still predicting proof 1 `no`; the
  MINORs were this row missing, two "today's placeholders" phrasings, test 12 passing on a
  missing gate file or a reverted placeholder, and a stale test header. All fixed in the next
  commit, prose and test only, no apply-block byte changed; R8 round 2 reviews that delta.
