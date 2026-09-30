# 0098: apply the staging index, the importer ledger looked up by its target row

**Status: NOT APPLIED, and not ready until the seven steps below are done.** GREEN's
dispatch is not issued before them, and its BEFORE YOU START checks their result by
machine. One migration, today the
pending file `packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql`,
applied from `origin/main` at the merge commit of PR #1469 once it is promoted to
`packages/db/migrations/0098_migration_staging_imported_entity_idx.sql` on that branch and the
PR has merged. Four blocks, each pasted whole, on its own and in order: stage 0 (the
promotion, the files and the head it runs from), stage 1 (the HEAD CHECK, the pre-check
and the apply), stage 2 (the post-check) and the closing journal read. GREEN's dispatch
adds its own BEFORE YOU START first and its CLOCK CHECK between stage 0 and stage 1.

**THE NOT READY STEPS. Nothing below runs until each is done, in this order, and none of
them is GREEN's.** Each is written out under "The promotion, and the NOT READY steps":

1. `0096` (CARE-02a, #1471) is applied by GREEN from its held head, the SECURITY DEFINER
   count GATE-CHANGE #1500 (26 to 27) is merged by the owner, `main` is merged into #1471,
   and #1471 is merged: production journal 94, and `0096` on `main` at journal idx 93,
   `when` 1788501700000.
2. `0097` (the registo write policies, #1475) is applied by GREEN from its held head, its
   own count GATE-CHANGE (27 to 28) is merged, `main` is merged into #1475, and #1475 is
   merged: production journal 95, and `0097` on `main` at journal idx 94, its `when` above
   `0096`'s.
3. SOLO merges `origin/main` into this branch and PROMOTES `0098` on it: the rename, the
   journal entry at **idx 95** with a `when` **strictly greater than `0097`'s** on `main`,
   the supabase mirror, the README's Promoted row, and `node scripts/check-journal.mjs`
   reading `96 .sql files match 96 journal entries`. SOLO re-reads every pin of this
   document against the promoted head; the ones that can move are named in that section.
4. A separate rehearsal agent (the owner's ruling of 2026-09-27, "build/rehearse/document
   as separate agents") runs the four blocks and GREEN's dispatch on a throwaway at
   production's position and records the result under "Rehearsed on 2026-09-30"; that
   changes this document's sha256 and no block, and the sidecar and the dispatch are
   refilled with it. The document lane's own smoke run of the same blocks is recorded
   there already and is not that rehearsal.
5. The PR reads every required check green on the promoted head, from the checks API.
6. The owner takes the label `held-for-apply` off #1469 and merges it, and freezes merges
   to `main` from that merge until GREEN's report is in.
7. SOLO fills the merge commit's sha into GREEN's dispatch
   (`/Users/ivan/osteojp-handover/green-dispatch-0098.txt`, the line `MERGED='NOT-FILLED'`
   and the EXPECT line that repeats it) and deletes the dispatch's NOT READY header.

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stage 2 (READ ONLY) runs only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0098 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/data-op-staff-10-v2.md`, word for word, with four
substitutions and no other change,** because the write here is stage 1 and there is no
stage 3: "After stage 2 has committed" reads "After stage 1 has committed", "stage 3 (READ
ONLY) runs" reads "stage 2 (READ ONLY) runs", "from stage 2 to stage 3" reads "from stage 1
to stage 2", and the onward line is this document's own.

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on
the owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies
migrations"). The lane that wrote this document never runs it.

| Fact | Value |
|---|---|
| Card | `MIG-0097-staging-index` on the board; the card id keeps the number it was opened under. The owner's words are "the staging index": he numbered it `0097` on 2026-09-24, ruled it "authored now", held, on 2026-09-27, and it was renumbered `0098` on 2026-09-30 |
| Ruling | The owner and the lead, 2026-09-30, the fifth renumbering: "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file order from now; the lead rules apply order only in number order or after a renumber." The number is the apply authorisation |
| Ruling for this sitting | The owner, 2026-09-30 at 13:13 Lisbon: the four applies `0096` to `0099` run today, one by one, "despite the current clinic schedule, we are doing it now". `0098` changes no SECURITY DEFINER function, so it follows `0094`'s and `0095`'s order: promoted on its branch after `0097` is applied and merged, the owner takes `held-for-apply` off #1469 and merges it FIRST, and GREEN applies it FROM `origin/main` at that merge commit while the owner freezes merges to main. The run window is GREEN's dispatch's to name, never this document's |
| Migration, as it stands | `packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql`, sha256 `198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0` |
| Migration, once promoted | `packages/db/migrations/0098_migration_staging_imported_entity_idx.sql`, **bytes unchanged**, so the same sha256. Stage 0 proves the promotion; it never performs it |
| Number and journal | **`0098`**, journal **idx 95**, tag `0098_migration_staging_imported_entity_idx`, `when` set at the promotion and **strictly greater than `0097`'s** (drizzle skips, in silence, a migration whose `when` is not above the newest applied one). Stage 0 checks the rule on the journal it runs from; the `when` itself is not pinned, so the promotion changes no byte of this document |
| Must follow | `0097`, `packages/db/migrations/0097_clinical_records_write_matrix.sql` once promoted, sha256 `076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318` (#1475, journal idx 94), which follows `0096`, `packages/db/migrations/0096_care02a_care_team_reads.sql`, sha256 `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45` (#1471, journal idx 93, `when` 1788501700000). Production's journal was 93 rows (`0000` to `0095`) on the morning of 2026-09-30; `0096` makes it 94 and `0097` 95. The pre-check requires both in the production journal by these sha256s and `0097`'s row the newest |
| Mirror | `supabase/migrations/0098_migration_staging_imported_entity_idx.sql`, written at the promotion by `node scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs with `node` directly after asserting its sha256 |
| PR | #1469, branch `db/0097-staging-imported-entity-index` (the name keeps the number it was opened under), labelled `held-for-apply` until the owner takes it off and merges |
| Runs from | `origin/main`, after #1469 has merged. Stage 0 records the sha `origin/main` resolves to in `/tmp/0098-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK, below) |
| This document | `docs/migration-apply-0098.md`, pinned by `docs/migration-apply-0098.sha256` and asserted by stages 0, 1 and 2; GREEN's dispatch pins its sha256 on its own and checks it by machine twice: on the main BEFORE YOU START resolves, and at the sha stage 0 recorded, in the CLOCK CHECK before stage 1 |
| Pre-check | `scripts/db/precheck-0098-staging-imported-entity-idx.sql`, READ ONLY, 20 verdicts (13 numbered, 7 carries), a control on every verdict that asserts an absence, sha256 `01a95c9712e2f587675f304a9dd41bdec5e828f02f8649373d3f3e8a8bea6f54` |
| Post-check | `scripts/db/postcheck-0098-staging-imported-entity-idx.sql`, READ ONLY, 17 verdicts, seven carries in, sha256 `a9e5bb4ceedea3237f4d1c5128f166de16295208d011028180a2934683a4038f` |
| Behaviour check | **None, by design.** `0098` changes no policy, grant or function, so no row a role may or may not read moves, and there is nothing to A/B. What the index does to a plan was proven on the rehearsal (the plan section below), not on production, because a plan depends on production's statistics |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1`. All three byte-identical to `origin/main` at `f884be4d` (read 2026-09-30), all pinned in every block that runs them |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59`, byte-identical to `origin/main` at `f884be4d`. It imports nothing but `node:` builtins, so its pin covers everything it runs |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts`, which drizzle-kit loads through `verified-migrate.mjs`. Their tree is fixed instead: GREEN's BEFORE YOU START requires `origin/main` to BE #1469's merge commit, not merely to contain it, and the CLOCK CHECK and the HEAD CHECK halt on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0098-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stage 2 and the closing read refuse at or after its end. Stage 0 removes the record, so only a CLOCK CHECK pasted after stage 0 can write it |
| What it creates | ONE btree index, `migration_staging_imported_entity_idx`, on `public.migration_staging_rows (imported_entity_id, entity_type)`, partial `WHERE imported_entity_id IS NOT NULL`, and a COMMENT on it saying why |
| What it never touches | every table, column, policy, grant, function and row. **The SECURITY DEFINER count does not move** (28 after `0097`; `0098` adds, drops and alters no function, so no count GATE-CHANGE goes with it). The post-check proves each: the other indexes, every policy, every function and every ACL in public by one md5 each, and the SECURITY DEFINER count, against this sitting's carries |
| The lock | a plain `CREATE INDEX` inside drizzle's one transaction: a **SHARE** lock on `public.migration_staging_rows` from the build until the apply commits. Reads go on; INSERT, UPDATE and DELETE on the ledger wait. Measured on the rehearsal: under 0.3 s for a 1,000,000 row ledger (below, "The lock, and how long it is held") |
| Shape test | `scripts/migration-0098-staging-index.test.mjs`, in `pnpm test:scripts`: the migration is one CREATE INDEX and one COMMENT, never CONCURRENTLY; every part of both checks' verdict queries is the reviewed text; every sha256 a block of this document sets is the real sha256 of its file; stage 0 compares every file any later stage runs; and the sidecar is this document's sha256 |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its
own sha256, so the digest lives in `docs/migration-apply-0098.sha256` and stages 0, 1 and
2 check it with `shasum -a 256 -c` before they trust a pin written here. The sidecar sits
on the same head as the document, so a main that moved to a new document and a new
sidecar together would pass that check. **The sidecar alone does not close that, and
the HEAD CHECK alone does not either:** the HEAD CHECK compares `origin/main` with the
sha stage 0 recorded, so it cannot see a main that moved BEFORE stage 0 fetched. GREEN's
dispatch closes it by machine. It pins this document's sha256 on its own; its BEFORE
YOU START checks that pin against the `origin/main` it resolves and records that head;
and its CLOCK CHECK, pasted between stage 0 and stage 1, halts before the apply unless
stage 0 recorded that same head and the document at the recorded sha still hashes to
the pin. From stage 0 on, the HEAD CHECK halts on any moved main before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced,
there are no backslash continuations and no `!` except `test !`. The blocks are pasted
into zsh (`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its
number). Narration is `echo`.

**The promoted file's own header will still read "RULED NUMBER 0097. NO NUMBER IN THIS
FILE NAME YET, BY CONSTRUCTION"**, it names `0096` (the conflict check's patient name, as
the queue of 2026-09-27 read) as what it follows and `0094`, `0095` and `0096` as the
ones before it, and the index COMMENT it installs begins `0097.`, so production's
catalogue will carry `0097.` in that comment after the apply. All of that is stale, and it
is left stale on purpose: neither the renumbering nor the promotion touches one byte of the
file, which is the only reason the sha256 above can pin anything. Read the header as a
record of when the file was authored, and `packages/db/migrations-pending/README.md` and
the table in `CLAUDE.md` for where it sits now.

## The promotion, and the NOT READY steps

**Steps 1 and 2 are other sittings,** each with its own document and dispatch. This
section starts where they end: `0096` and `0097` applied, their count GATE-CHANGEs
merged, #1471 and #1475 merged, and `main` carrying
`packages/db/migrations/0096_care02a_care_team_reads.sql` at idx 93 and
`packages/db/migrations/0097_clinical_records_write_matrix.sql` at idx 94.

**Step 3, the promotion, by SOLO, in this branch's worktree, never on `main`:**

1. `git fetch origin` and `git merge --no-edit origin/main` (no rebase; the pending README
   resolves by union);
2. `git mv packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql packages/db/migrations/0098_migration_staging_imported_entity_idx.sql`,
   and nothing else touches the file: `shasum -a 256` must still read the sha256 above;
3. append ONE entry to `packages/db/migrations/meta/_journal.json`:
   `idx` **95**, `version` `"7"`, tag `0098_migration_staging_imported_entity_idx`,
   `breakpoints` true, and `when` **strictly greater than the `when` of idx 94
   (`0097_clinical_records_write_matrix`) on `main`**. The series so far steps by 100000
   (`0093` 1788501400000 to `0096` 1788501700000), so the promotion writes `0097`'s `when`
   plus 100000; the rule stage 0 checks is only "strictly greater";
4. `node scripts/sync-supabase-migrations.mjs`, which writes
   `supabase/migrations/0098_migration_staging_imported_entity_idx.sql`;
5. `packages/db/migrations-pending/README.md`: the row leaves "What is here now" and a row
   joins the Promoted table;
6. the gates: `node scripts/check-journal.mjs` reads `96 .sql files match 96 journal
   entries in order`; `pnpm test:scripts` (the shape test reads the migration at its
   promoted path by itself); `pnpm --filter @osteojp/db test`; and the gate assertion;
7. **re-read every pin against the promoted head.** `0098`, the two checks and this
   document do not move at the promotion. Three can move before it, and each moves this
   document, its sidecar and the dispatch together:
   - `0097`'s file on `main` must hash to `076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318`,
     and `0096`'s to `fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45`,
     the bytes production applied. The pre-check carries both as literals, so if either
     changed in its own review before its apply, the pre-check is refilled and every
     `SHAPRE` here with it;
   - `verified-migrate.mjs`: the lead ruled on 2026-09-30 that one Tier B PR adds
     `PGOPTIONS "-c lock_timeout=10s -c statement_timeout=300s"` to its drizzle spawn
     after `0096` and `0097` are applied, "with its new sha256 pinned in later documents
     only" (the board card `LOCK-TIMEOUT-verified-migrate`). This is such a document. If
     that PR has merged before the promotion, every `SHAVM` here, the facts table and the
     dispatch are refilled with its sha256; if it has not, nothing changes and the build
     runs with no timeout, as `0094` and `0095` did;
   - the target guard, the migration reader and check-journal, the same way, if any of
     them has changed on `main`.

**Step 4, the rehearsal by a separate agent,** at the sha256 the sidecar pins, on a
throwaway at 95 journal rows with the promotion simulated, as the smoke run below was
set up; it records its run in this document, the sidecar is regenerated and the
dispatch's document sha256 refilled.

**Step 5:** every required check green on the promoted head, read from the checks API.

**Step 6, the owner's two clicks:** `held-for-apply` off #1469, then the merge. He holds
the merge freeze from that merge until GREEN's report is in; SOLO disarms every PR armed
for auto-merge before it.

**Step 7:** SOLO writes the merge commit's sha into the dispatch in the two places it
reads `NOT-FILLED` and deletes the dispatch's NOT READY paragraph. Until then its BEFORE
YOU START stops on the unfilled sha, before any read.

## Merged before the apply, by ruling, and why that is safe here

`0098` carries no app code and nothing reads the index by name: the planner picks it.
#1469 changes the migration, its mirror and journal entry, the pending README, the two
check files, the shape test, this document and its sidecar. So a merged `main` that
production has not caught up with yet is a state the app already runs in: every reader
of the ledger reads the same rows with or without the index.

**Between the merge and the apply, `main` is ahead of production by exactly one
migration,** and the pre-check says so: it passes only while `0098` is absent from the
journal. The daily `prod-drift-check` (07:00 UTC) would report `0098` as pending if the
sitting halted before the apply; that report is correct, and it is informational.

**Exactly one `packages/db/migrations/0098_*.sql` may exist; if anything else is ever
found under `0098_`, STOP.** The number is the apply authorisation: `0096` CARE-02a,
`0097` the registo write policies, **`0098` the staging index**, `0099` the grants
revoke, `0100` onward SAT-01. `0099` is not promoted until `0098` is applied and merged,
so the journal on the recorded sha ends at `0098` and `verified-migrate.mjs` finds
exactly one pending migration. Stage 0 stops on a `0099_*.sql`.

## What is new here, because 0098 is not shaped like 0094

`0094` changed policies, so it had RLS behaviour to A/B. **`0098` CREATES ONE INDEX**,
and nothing a role can read changes. So the pre-check proves the starting point exactly
and the post-check proves the end point exactly, and each proves that nothing else moved:

- **the pre-check** proves the index ABSENT, by name (3: `CREATE INDEX IF NOT EXISTS`
  matches a NAME against every relation in the schema and would skip in silence) and by
  column (4: an index keying `imported_entity_id` under another name would not stop IF NOT
  EXISTS, and the apply would build a duplicate); proves `0014`'s four indexes exactly as
  they are (5 to 8); proves the queue (9 to 11: `0098` absent by hash, `0096` and `0097`
  each present once by the sha256 production applied, and `0097`'s row the newest); and
  reports the ledger (12);
- **the post-check** proves the new index exactly (1 to 8: one relation of the name, a
  plain btree, valid, ready and live, the key in order, the predicate, the whole
  definition, the comment by md5, the only index keying the column), the arithmetic (9:
  one index more; 11: `0098` by hash, the newest row, the journal up by exactly one), and
  that nothing else moved (10: every other index on the table; 12: every policy in the
  database; 13: every function in public; 14: every relation, column and function ACL in
  public; 15: the SECURITY DEFINER count, every one owned by `postgres`).

**A zero is never a pass on its own, so every verdict that asserts an absence carries a
control:** the SAME count, run on a subject that must be present, and the verdict FAILs
unless the control reads what it must. Pre-check 3 counts relations named
`migration_staging_tenant_status_idx` the same way (control 1); 4 counts the indexes
keying `tenant_id` the same way (control 3); 9 counts `0097`'s hash the same way (control
1). A count that could see nothing would read 0 there and FAIL on its control. Every
carry names what it was taken over (4 indexes, N policies, N functions, N relations with
an ACL) and FAILs on an empty set, and each "unchanged" verdict of the post-check FAILs on
an empty set too. **Every verdict of both files was driven to FAIL on the rehearsal**
(the tables under "Rehearsed on 2026-09-30").

There are **seven** carries: `journal_rows_before`, `staging_indexes_before`,
`staging_indexes_md5`, `policies_md5`, `functions_md5`, `grants_md5` and
`secdef_functions_before` (passed to the post-check as `-v secdef_before`). Stage 2's
`carry()` matches the `check` column EXACTLY, trimmed, so no name can match another.

**Two profiles are correct, and which one production prints is not known here.** The
only verdict that can read VACUOUS is the ledger profile: pre-check 12 and post-check 16
count the ledger rows the index holds (`imported_entity_id` set). With at least one such
row the pre-check reads `20 OK / 0 VACUOUS / 0 FAIL` and the post-check
`17 OK / 0 VACUOUS / 0 FAIL`; on a ledger with none, `19 OK / 1 VACUOUS / 0 FAIL` and
`16 OK / 1 VACUOUS / 0 FAIL`, the VACUOUS on exactly that row. **Stage 1 accepts either
pre-check profile and nothing else; stage 2 accepts only the post-check profile that
follows from the pre-check this sitting printed.** A VACUOUS ledger says the index was
built over nothing, which is correct and proves nothing about a probe; it greens no other
verdict, because every other verdict reads the catalogue or the journal.

## The lock, and how long it is held

**Not CONCURRENTLY, and that is forced.** drizzle's pg migrator runs every pending
migration inside ONE transaction (drizzle-orm 0.45.2, `pg-core/dialect.js`, `migrate()`:
the loop over migrations sits inside `session.transaction`), and `CREATE INDEX
CONCURRENTLY` refuses to run inside a transaction block, so it would fail the apply. The
plain form it is, as `0068` and `0091` did (the migration file, section 6).

**The lock is SHARE on `public.migration_staging_rows`,** taken by the `CREATE INDEX` and
held until drizzle commits, which is right after the COMMENT and the journal row. SHARE
admits every SELECT (the page that runs `importerSourcedRecordSql` included) and makes
every INSERT, UPDATE and DELETE on the ledger wait. The only writer of the ledger is the
importer (`packages/db/src/migration/staging.ts`), which the owner runs by hand and which
does not run during a sitting; no app route writes it. Measured on the rehearsal, with the
build held open in one session: `pg_locks` read `ShareLock | granted`, a `count(*)` on the
ledger from a second session returned in 33 ms, and an UPDATE of one ledger row from that
session waited and was cancelled by `lock_timeout = 2s` (`canceling statement due to lock
timeout`, after 2001.774 ms), inside a transaction that was then rolled back.

**How long, at production's size.** No production read was made for this document. The
pre-check reads the ledger's size at the sitting: verdict 12 prints `<N> of <M> ledger
rows`, and M is what the build reads; stage 1 echoes it as `the build reads <M> ledger
rows`. On the rehearsal (Postgres 17.6, `maintenance_work_mem` 64 MB,
`max_parallel_maintenance_workers` 2, a synthetic ledger with 90 percent of its rows
carrying a target), the `CREATE INDEX` alone, three runs each, inside a rolled back
transaction:

| Ledger rows (M) | Build, three runs | The whole drizzle apply, wall time |
|---|---|---|
| 20,000 | 12.0, 7.3, 6.4 ms | not timed |
| 200,000 | 58.0, 37.5, 32.0 ms | 0.36 s |
| 1,000,000 | 264.6, 209.7, 182.2 ms | 0.51 s |

So the build scales with M at about 0.2 to 0.3 s per million rows on that machine. The
production compute is not that machine and its cache may be cold, so read the rehearsal
as the order of magnitude and allow ten times it: **at M ledger rows, expect the SHARE lock
to be held for under M / 1,000,000 × 3 seconds**, a few seconds at most for the sizes the
delivery was described as (8,000 to 10,000 patients plus a decade of appointments, the
board cards `MIG-08-batch-import-writes` and `MIG-09-batch-staging-writes`). That is far inside the 300 s `statement_timeout` the lock timeout
change will add, and the 10 s `lock_timeout` it adds would only bite if another session
held a lock on the ledger at the moment of the build, in which case the apply fails whole
and nothing is written (drizzle's one transaction).

## The HEAD CHECK, and running from main

The migration runs from `origin/main`, after #1469 has merged, and the owner freezes
merges to main for the sitting. No block reads a branch, and there is no separate HEAD
CHECK to paste: the machine runs it inside the blocks.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is
  clean, removes the previous sha and run window records, fetches, resolves
  `origin/main`, checks that sha out detached, verifies the sidecar, the promotion, the
  journal and every pin (check-journal's before it runs it), and only then records the
  sha in `/tmp/0098-main.sha` and prints `running from origin/main <sha>`.
- **The run window is checked by machine in every block from stage 1 on,** from the
  record GREEN's CLOCK CHECK writes after stage 0. Stage 1 refuses to start before the
  window opens or after the last minute it may start, and checks again after the
  pre-check, just before the apply; stage 2 and the closing read refuse at or after the
  window's end. A missing record, or one written for another sha, is a `STOP:` in each.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve
  `origin/main` again, print both, and HALT on any difference with
  `STOP: main moved since stage 0, the merge freeze was broken.` It runs before the
  environment is loaded and before psql, so a halt there has touched no database and
  applied nothing. It then checks out the RECORDED sha, never a fresh `origin/main`, and
  asserts every file it runs by sha256 before it runs any.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the
  applied marker `/tmp/0098-applied.ok` exists, and `verified-migrate.mjs` refuses an
  already applied migration regardless (exit 3).
- **Stage 2 is READ ONLY** and runs from the recorded sha whatever main has done since:
  it prints whether main moved, with both shas, and never stops on it. Every file it runs
  is asserted by sha256 at that sha.
- **A moved main before the apply ends the sitting.** Nothing is applied, both shas go
  in the report, and whether and when to start again is the lead's call.
- **If `/tmp/0098-main.sha` is gone,** stages 1 and 2 stop, and the lead rules.

## STAGE 0: the promotion, the files and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0098.sha256
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql
MIRROR=supabase/migrations/0098_migration_staging_imported_entity_idx.sql
PREV=packages/db/migrations/0097_clinical_records_write_matrix.sql
SHA0098=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPREV=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPRE=01a95c9712e2f587675f304a9dd41bdec5e828f02f8649373d3f3e8a8bea6f54
SHAPOST=a9e5bb4ceedea3237f4d1c5128f166de16295208d011028180a2934683a4038f
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0098-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0098 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0098-main.sha /tmp/0098-window.ok
git fetch origin --prune
MAIN=$(git rev-parse origin/main)
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN}

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0098 is not on disk at origin/main, so #1469 has not merged promoted"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
test -f ${MIRROR} || { echo "STOP: the supabase mirror of 0098 is not on disk"; exit 1; }
test -f ${PREV} || { echo "STOP: 0097 is not on disk at origin/main under its promoted name, so #1475 has not merged"; exit 1; }
for N in 0096 0097 0098; do
C=$(find packages/db/migrations -maxdepth 1 -name "${N}_*.sql" | wc -l | tr -d ' ')
[ "${C}" = 1 ] || { echo "STOP: ${C} files claim migration number ${N}, not 1"; exit 1; }
done
N99=$(find packages/db/migrations -maxdepth 1 -name '0099_*.sql' | wc -l | tr -d ' ')
[ "${N99}" = 0 ] || { echo "STOP: ${N99} files claim migration number 0099, and 0099 is not promoted until 0098 is applied and merged"; exit 1; }
test -f scripts/db/precheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 ${PREV} | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0097 on disk is not the file the pre-check expects production to have applied"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const n=j.entries.length;const e=j.entries[n-1];const p=j.entries[n-2];const q=j.entries[n-3];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+n+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag+'; before that idx '+q.idx+', when '+q.when+', tag '+q.tag);process.exit(n===96&&e.idx===95&&e.tag==='0098_migration_staging_imported_entity_idx'&&p.idx===94&&p.tag==='0097_clinical_records_write_matrix'&&q.idx===93&&q.when===1788501700000&&q.tag==='0096_care02a_care_team_reads'&&p.when>q.when&&e.when>p.when?0:1)" || { echo "STOP: the journal does not end idx 93 0096 (when 1788501700000), idx 94 0097, idx 95 0098, of 96, each when above the one before it"; exit 1; }
node scripts/check-journal.mjs 2>&1 | tee /tmp/0098-check-journal.out
grep -qF '96 .sql files match 96 journal entries' /tmp/0098-check-journal.out || { echo "STOP: check-journal did not reconcile 96 files with 96 journal entries"; exit 1; }

echo "${MAIN}" > /tmp/0098-main.sha
echo "running from origin/main ${MAIN}, recorded in /tmp/0098-main.sha"
echo "0098 PROMOTION, NUMBER AND FILES VERIFIED"
)
```

**EXPECT: the sidecar line `docs/migration-apply-0098.md: OK`, then
`newest journal entry: idx 95, when <0098's>, tag 0098_migration_staging_imported_entity_idx, of 96; before it idx 94, when <0097's>, tag 0097_clinical_records_write_matrix; before that idx 93, when 1788501700000, tag 0096_care02a_care_team_reads`,
with `0098`'s `when` above `0097`'s and `0097`'s above 1788501700000 (the block halts
otherwise), then check-journal's line
`... 96 .sql files match 96 journal entries in order ... the supabase mirror matches by CONTENT.`,
then `running from origin/main <sha>, recorded in /tmp/0098-main.sha`, then
`0098 PROMOTION, NUMBER AND FILES VERIFIED`. Exit 0.** It reads no database and prints no
count of anything in it. The sha it prints is the one every later stage runs from, and it
compares every file any later stage runs, so a pin that is wrong stops the sitting here,
before any connection.

## STAGE 1: the HEAD CHECK, the pre-check, the apply

```
(
set -eo pipefail
SHA0098=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPREV=076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318
SHAPRE=01a95c9712e2f587675f304a9dd41bdec5e828f02f8649373d3f3e8a8bea6f54
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql
PREV=packages/db/migrations/0097_clinical_records_write_matrix.sql

cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
[ -z "$(find /tmp/0098-applied.ok -mmin -720 2>/dev/null)" ] || { echo "STOP: stage 1 has ALREADY APPLIED 0098 in this sitting. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0098-precheck.new
STRAY=$(git status --short)
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0098-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0098-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0098.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f ${PREV} || { echo "STOP: 0097 is not on disk"; exit 1; }
test -f scripts/db/precheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
N98=$(find packages/db/migrations -maxdepth 1 -name '0098_*.sql' | wc -l | tr -d ' ')
[ "${N98}" = 1 ] || { echo "STOP: ${N98} files claim migration number 0098, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 ${PREV} | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0097 on disk is not the file the pre-check expects production to have applied"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0098-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0098-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0098-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0098-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0098-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/precheck-0098-staging-imported-entity-idx.sql 2>&1 | tee /tmp/0098-precheck.new
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-precheck.new && { echo "STOP: a pre-check verdict read FAIL. Nothing was applied and no earlier transcript was touched"; exit 1; }
PRE=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-precheck.new | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-precheck.new | sed -E 's/^[[:space:]]*([0-9]+)\..*/\1/' | tr '\n' ' ' || true)
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-precheck.new || true)
if [ "${PRE}" = "20 OK / 0 VACUOUS / 0 FAIL" ] && [ -z "${VACSET}" ] && [ "${OKS}" = 20 ]; then echo "the pre-check reads ${PRE}: the ledger holds rows with a target"; elif [ "${PRE}" = "19 OK / 1 VACUOUS / 0 FAIL" ] && [ "${VACSET}" = "12 " ] && [ "${OKS}" = 19 ]; then echo "the pre-check reads ${PRE}: the ledger holds no row with a target, VACUOUS on 12 only"; else echo "STOP: the pre-check must read 20 OK / 0 VACUOUS / 0 FAIL, or 19 OK / 1 VACUOUS / 0 FAIL with only verdict 12 VACUOUS. It read [${PRE}], ${OKS} OK lines, VACUOUS on [${VACSET}]. Nothing was applied"; exit 1; fi
LEDGER=$(grep -E '^[[:space:]]*12\. PROFILE' /tmp/0098-precheck.new | sed -E 's/.* of ([0-9]+) ledger rows,.*/\1/' || true)
echo "the build reads ${LEDGER} ledger rows and holds a SHARE lock on public.migration_staging_rows until the apply commits: reads go on, writes wait"

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- only now, with a passing pre-check in hand, does the previous sitting's state go"
rm -f /tmp/0098-postcheck.out /tmp/0098-stage2.ok /tmp/0098-journal-after.out /tmp/0098-apply.out /tmp/0098-applied.ok
mv /tmp/0098-precheck.new /tmp/0098-precheck.out

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0098-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0098_migration_staging_imported_entity_idx --sha256 ${SHA0098} --expect-pending 1 2>&1 | tee /tmp/0098-apply.out
touch /tmp/0098-applied.ok
echo "0098 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now: <sha>`,
  the same sha twice** (the block halts otherwise), then `docs/migration-apply-0098.md: OK`;
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it (the block halts otherwise), then the target guard;
- **the pre-check prints no FAIL and one of the two profiles:** `20 OK / 0 VACUOUS /
  0 FAIL` with 20 OK lines, or `19 OK / 1 VACUOUS / 0 FAIL` with 19 OK lines and verdict
  12 the VACUOUS one. The block names which. Its seven carries print as rows:
  `journal_rows_before` **95**, `staging_indexes_before` **4**, and the five others as
  production reads them; report them as printed;
- **`the build reads <M> ledger rows and holds a SHARE lock ...`,** M the size the
  duration scales with (the lock section above);
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`,** now no later
  than that minute (the block halts otherwise);
- **verified-migrate, teed whole to `/tmp/0098-apply.out`:**
  `file       0098_migration_staging_imported_entity_idx.sql present, sha256 matches`,
  `journal    95 row(s) applied, last when=<0097's>`,
  `pending    1  [0098_migration_staging_imported_entity_idx]` (exactly one), the
  drizzle-kit banner with its stdout, stderr and exit, then
  `journal    95 -> 96  (delta 1)`,
  `0098_migration_staging_imported_entity_idx present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0098 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the
  journal from the database rather than trusting these lines.

`verified-migrate.mjs` exits **2** on a bad invocation or a missing environment
variable; **3** BEFORE drizzle runs on a missing file, a wrong sha256, a tag missing
from `_journal.json`, an already applied migration or a pending count that is not 1,
and AFTER drizzle has run on a journal that moved by the wrong amount or moved without
the approved sha256; **4** if drizzle itself failed or on any thrown error; **5** if
drizzle reports success and the journal did not move. Exit 3 can therefore follow a
committed apply too.

**Exit 4 does not always mean nothing was applied.** `verified-migrate.mjs` also exits
4 on ANY thrown error, including its own journal read AFTER drizzle has committed.
drizzle applies the file's statements and the journal row in ONE transaction, so the
migration is either wholly applied or not at all. **If stage 1 ended non-zero after the
`--- drizzle-kit migrate ---` banner had printed, the halt rule governs: GREEN pastes
nothing else, not stage 1 again and not the journal read, and reports the exit code and
the whole output** (`/tmp/0098-apply.out` holds it). The read that answers whether 0098 is
applied is `packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs only
on the owner's or the lead's word. No marker exists after such a halt, so stage 2 refuses
until the lead rules.

**An exit 4 whose captured drizzle output is a pnpm error, not drizzle's, means drizzle
never ran.** `verified-migrate.mjs` reaches drizzle through `pnpm --filter @osteojp/db exec`,
and pnpm checks the installed dependencies first; in a clone whose `node_modules` does
not match its lockfile it tries to reinstall and, with no terminal, aborts
(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The block then prints
`journal    95 -> 95  (delta 0)`: nothing was applied. The halt rule governs it all the
same.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was
applied,** the HEAD CHECK's and the run window's included, and the previous sitting's
transcripts are untouched: the failed run's output stays in the `.new` file.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0098=198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0
SHAPOST=a9e5bb4ceedea3237f4d1c5128f166de16295208d011028180a2934683a4038f
SHAGUARD=bcc43dfb7b66eeea36bd074bb545d808c3f4524850349914cdfff2d2b3fa3093
MIG=packages/db/migrations/0098_migration_staging_imported_entity_idx.sql

rm -f /tmp/0098-stage2.ok
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0098-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0098-main.sha)
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune
NOW=$(git rev-parse origin/main)
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC}
shasum -a 256 -c docs/migration-apply-0098.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0098 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0098}" ] || { echo "STOP: 0098 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0098-staging-imported-entity-idx.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0098-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0098-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0098-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0098-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0098-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0098-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" '{x=$1; gsub(/^[ \t]+|[ \t]+$/,"",x)} x==k {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print v; exit}' /tmp/0098-precheck.out; }
J=$(carry journal_rows_before)
I=$(carry staging_indexes_before)
M=$(carry staging_indexes_md5)
POL=$(carry policies_md5)
FN=$(carry functions_md5)
GR=$(carry grants_md5)
SD=$(carry secdef_functions_before)
[ "${J}" = 95 ] && [ "${I}" = 4 ] || { echo "STOP: the carries did not parse out of the transcript as journal 95 and 4 indexes. Read: [${J}] [${I}]"; exit 1; }
echo "${M} ${POL} ${FN} ${GR}" | grep -qxE '[0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32} [0-9a-f]{32}' || { echo "STOP: an md5 carry did not parse out of the transcript. Read: [${M}] [${POL}] [${FN}] [${GR}]"; exit 1; }
echo "${SD}" | grep -qxE '[1-9][0-9]*' || { echo "STOP: the SECURITY DEFINER carry did not parse out of the transcript. Read: [${SD}]"; exit 1; }
PRE=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-precheck.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
if [ "${PRE}" = "20 OK / 0 VACUOUS / 0 FAIL" ]; then WANT="17 OK / 0 VACUOUS / 0 FAIL"; WANTVAC=""; WANTOK=17; elif [ "${PRE}" = "19 OK / 1 VACUOUS / 0 FAIL" ]; then WANT="16 OK / 1 VACUOUS / 0 FAIL"; WANTVAC="16 "; WANTOK=16; else echo "STOP: the pre-check transcript's profile [${PRE}] is not one stage 1 accepts"; exit 1; fi
echo "carries from this run: journal_before=${J} staging_indexes_before=${I} staging_indexes_md5=${M} policies_md5=${POL} functions_md5=${FN} grants_md5=${GR} secdef_before=${SD}; pre-check ${PRE}, so the post-check must read ${WANT}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0098-postcheck.out
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v staging_indexes_before="${I}" -v staging_indexes_md5="${M}" -v policies_md5="${POL}" -v functions_md5="${FN}" -v grants_md5="${GR}" -v secdef_before="${SD}" -c "begin read only" -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql -c "rollback" 2>&1 | tee /tmp/0098-postcheck.out
grep -qE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0098-postcheck.out && { echo "STOP: a post-check verdict read FAIL"; exit 1; }
POST=$(grep -E '^[[:space:]]*SUMMARY\.' /tmp/0098-postcheck.out | sed -E 's/.*\| *([0-9]+ OK \/ [0-9]+ VACUOUS \/ [0-9]+ FAIL) *\|.*/\1/' || true)
[ "${POST}" = "${WANT}" ] || { echo "STOP: the post-check must read ${WANT}, following the pre-check's ${PRE}. It read [${POST}]"; exit 1; }
VACSET=$(grep -E '\|[[:space:]]*VACUOUS[[:space:]]*$' /tmp/0098-postcheck.out | sed -E 's/^[[:space:]]*([0-9]+)\..*/\1/' | tr '\n' ' ' || true)
[ "${VACSET}" = "${WANTVAC}" ] || { echo "STOP: the post-check's VACUOUS rows are [${VACSET}], not [${WANTVAC}]"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0098-postcheck.out || true)
[ "${OKS}" = "${WANTOK}" ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not ${WANTOK}. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0098 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations")
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0098}'")
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0098 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0098 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;"

echo "${REC}" > /tmp/0098-stage2.ok
echo "0098 POST-CHECK PASSED. pre-check ${PRE}, post-check ${POST}, journal ${J} to ${JA}. Paste the closing read now."
)
```

**EXPECT:** `checking from the recorded sha <sha>` and whether main moved;
`docs/migration-apply-0098.md: OK`; `run window, Lisbon YYYYMMDDHHMM: everything ends
before <t>; now <t>`, with now before the end (the block halts otherwise, and the write
stands); the carry line reads `journal_before=95 staging_indexes_before=4` and the five
others as stage 1 printed them; the post-check prints no FAIL and the profile that
follows from stage 1's, then its FOR THE RECORD table (the five indexes on the ledger,
the new one first); the journal reads `95` before and `96` after, with 0098's sha256 in it
**exactly once**; the last line reads exactly one of

- `0098 POST-CHECK PASSED. pre-check 20 OK / 0 VACUOUS / 0 FAIL, post-check 17 OK / 0 VACUOUS / 0 FAIL, journal 95 to 96. Paste the closing read now.`
- `0098 POST-CHECK PASSED. pre-check 19 OK / 1 VACUOUS / 0 FAIL, post-check 16 OK / 1 VACUOUS / 0 FAIL, journal 95 to 96. Paste the closing read now.`

A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

**If stage 2 STOPs, production is already applied.** Never re-run stage 1 and never edit
a pin. One STOP there is the data moving, not a fault: `the post-check must read
<profile>, following the pre-check's <profile>. It read [<profile>]`, with no FAIL above
it, means the ledger gained its first row with a target, or lost its last one, between
stage 1 and stage 2 (the importer does not run during a sitting, so this is not
expected). That line already prints both profiles. Report it and every other stage 2
STOP to the owner with `/tmp/0098-precheck.out` and `/tmp/0098-postcheck.out`; the
post-check is READ ONLY and can be issued again on the owner's word.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 2 exited 0 with its last line
`0098 POST-CHECK PASSED. ...`. Before the read runs it checks by machine that the
worktree is on the sha stage 0 recorded, that stage 1 applied, that the last paste of
stage 2 passed on that sha after the apply, that the Lisbon clock is before the end of the
run window recorded for that sha, and that the reader is the pinned file. A check that
fails prints a `STOP:` line and exits 1, and the read does not run.

```
(
set -eo pipefail
SHAREADER=867e2823130b1ec1a9f7790522968924ecd872452c48322884c3e22efb5704d1
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
test -f /tmp/0098-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0098-main.sha)
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
test -f /tmp/0098-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0098-stage2.ok || { echo "STOP: stage 2 left no pass mark, so its last paste did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0098-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0098-stage2.ok -newer /tmp/0098-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0098-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0098-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0098-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M')
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
echo "reader: $(shasum -a 256 ${READER} | cut -d' ' -f1) (at the recorded sha ${REC})"
[ "$(shasum -a 256 ${READER} | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0098-journal-after.out
grep -qx 'journal rows on production: 96' /tmp/0098-journal-after.out || { echo "STOP: the journal read after the apply does not say 96"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0098_migration_staging_imported_entity_idx[.]sql$' /tmp/0098-journal-after.out || { echo "STOP: the journal read does not list 0098 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0098-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0098-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 96, 0098 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** the run window line with now before its end, the reader's sha256 line, then
the read printed IN FULL through `tee`: `journal rows on production: 96`, every
migration file on the recorded sha listed `APPLIED`, 0098 last, `pending on this ref: 0`,
`journal rows with no matching file on this ref: 0`, and the last line, exactly,
`CLOSING READ: the journal reads 96, 0098 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted: the halt rule says no journal read runs
after a halt, and the block stops on its own when stage 2's pass mark is missing.

## What every verdict must read

**Pre-check, 20 verdict rows and a SUMMARY row:**

0. the transaction is READ ONLY;
1. `public.migration_staging_rows` exists, an ordinary table;
2. its two key columns read exactly `imported_entity_id pg_catalog.uuid NULL,
   entity_type public.migration_entity_type NOT NULL`;
3. no relation named `migration_staging_imported_entity_idx` exists in `public`:
   `0, control 1`, the control being the same count finding
   `migration_staging_tenant_status_idx` once;
4. no index on the table keys `imported_entity_id`, under any name: `0, control 3`, the
   control being the same count finding the three indexes that key `tenant_id`;
5. to 8. the four indexes `0014` made (`migration_staging_rows_pkey`,
   `migration_staging_tenant_source_uq`, `migration_staging_tenant_batch_idx`,
   `migration_staging_tenant_status_idx`), each exactly as Postgres renders `0014`'s
   definition and each valid, ready and live;
9. `0098` is absent from the journal by hash: `0, control 1`, the control being the same
   count finding `0097`'s hash once;
10. THE QUEUE: `0096 1, 0097 1`, each by the sha256 production applied;
11. the newest journal row (by `created_at`, then `id`) is `0097`'s;
12. PROFILE: `<N> of <M> ledger rows, <K> of them clinical_record`. OK when N is at least
    one, VACUOUS when it is none;
- carries: `journal_rows_before` **95** (production's 93 on the morning of 2026-09-30,
  plus `0096` and `0097`); `staging_indexes_before` **4**; `staging_indexes_md5` (the
  rehearsal read `096b491fe3c4aba4b875df4e365cc036`, and with verdicts 5 to 8 OK and the
  count 4 production's value can be no other, because the md5 is over exactly those four
  names, definitions and flags, ordered by name); `policies_md5`, `functions_md5`,
  `grants_md5`, each over a set its expected column counts and FAILs when that set is
  empty; `secdef_functions_before`, every one owned by `postgres` (28 on the rehearsal, 26
  on main plus `0096`'s one and `0097`'s one). Each is whatever production reads, and
  stage 2 carries it.

**Post-check, 17 verdict rows and a SUMMARY row:**

0. the transaction is READ ONLY;
1. exactly one relation in `public` has the index's name, and it is an index on
   `public.migration_staging_rows`;
2. it is a btree, and not unique, primary or an exclusion constraint;
3. it is VALID, READY and LIVE (`pg_index.indisvalid`, `indisready`, `indislive`);
4. its key is exactly `imported_entity_id, entity_type`, in that order, 2 key columns,
   2 in all (no INCLUDE), no expression;
5. its predicate is exactly `(imported_entity_id IS NOT NULL)`;
6. its whole definition is exactly `CREATE INDEX migration_staging_imported_entity_idx
   ON public.migration_staging_rows USING btree (imported_entity_id, entity_type) WHERE
   (imported_entity_id IS NOT NULL)`;
7. its COMMENT is the migration file's text, by md5 (`5212f3ec29a6efafa4f3ea0ab388d5b4`);
8. it is the only index on the table that keys `imported_entity_id`;
9. the table carries `staging_indexes_before` **+ 1** indexes (5);
10. every OTHER index on the table still hashes, as one value, to `staging_indexes_md5`,
    over as many indexes as before;
11. `0098` is in the journal by hash, once, its row is the newest, and the journal reads
    `journal_rows_before` **+ 1** (96);
12. every policy in the database still hashes to `policies_md5`;
13. every function in public still hashes to `functions_md5`;
14. every relation, column and function ACL in public still hashes to `grants_md5`;
15. the SECURITY DEFINER count in public equals `secdef_before`, every one owned by
    `postgres`;
16. PROFILE, the ledger rows the index holds: OK when there is at least one, VACUOUS
    when there is none. It counts what pre-check 12 counts, and stage 2 requires the two
    verdicts to agree (both OK or both VACUOUS).

**The post-check is not a standing invariant for 9 to 15:** the next migration that adds
an index, a policy, a function or a grant moves them. It is an assertion about this
apply, against this sitting's carries. **Verdict 16 moves with the data, and so does
pre-check 12:** an import run after the sitting adds rows, and the post-check issued
again later would then read OK where the sitting read VACUOUS; that is the data moving,
not a regression.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 96, 0098 by hash, the newest row | stage 2 (post-check 11 and the SR-51 lines), and the closing journal read | the database |
| 0098 is applied only after 0096 and 0097 | stage 0 (both numbered files, `0097`'s by sha256, the journal idx 93, 94 and 95 in `when` order), pre-check 9 to 11 and `journal_rows_before` 95, and `--expect-pending 1` | the branch and the journal |
| exactly one index, the named columns in order, partial, valid and ready | post-check 1 to 8 | the catalogue |
| nothing else changed: other indexes, policies, functions, grants, the SECURITY DEFINER count | post-check 9, 10 and 12 to 15, against this sitting's carries | the catalogue |
| a second apply is a no-op | **the rehearsal only** (applied twice, the index fingerprint identical). drizzle never runs a hash it holds again, so production cannot show it | the migration file |
| the ledger probe of `importerSourcedRecordSql` switches from a Seq Scan to an Index Scan | **the rehearsal only** (the plan, below, under RLS and without it) | the planner |

## Rehearsed on 2026-09-30: the check files, a control arm for every verdict, and the lock

**Where it ran.** A throwaway container started for this rehearsal, `r98-reh`, on
127.0.0.1:55598 (`public.ecr.aws/supabase/postgres:17.6.1.165`, Postgres 17.6), never
production and never another lane's container. `r98_base` was built from every migration
on this branch after `origin/main` at `f884be4d` was merged in (93 files, journal idx 0 to
92), then `0096` from #1471's held head `33332d95` (sha256 `fbf8cad1...`, `when`
1788501700000) and `0097` from #1475's pending file at `7af3b808` (sha256 `076481bf...`,
`when` 1788501800000, synthetic because `0097` is not promoted yet): **95 journal rows**,
production's position once `0097` is applied. Each file was run with `psql -1` and its
journal row written in the same transaction, as drizzle does (hash the file's sha256,
`created_at` the `when`). The image's `auth` schema has no `auth.jwt()`, which `0001`
calls, so the rehearsal template was given the standard Supabase `auth.jwt()` and
`auth.uid()` first; nothing in `0098` or its checks reads either. **The apply of `0098` in
every arm was `drizzle-kit migrate`** from a copy of the migrations with `0098` renamed
into place, bytes unchanged, journal idx 95, `when` 1788501900000: pending 1, journal 95
to 96. Every arm ran on its own copy of the base, dropped afterwards.

**The happy paths:**

| Arm | Pre-check | Apply | Post-check |
|---|---|---|---|
| H1, empty ledger | `19 OK / 1 VACUOUS / 0 FAIL`, VACUOUS on 12 | exit 0, journal 96 | `16 OK / 1 VACUOUS / 0 FAIL`, VACUOUS on 16 |
| H2, 20,000 synthetic ledger rows, 18,000 with a target | `20 OK / 0 VACUOUS / 0 FAIL`; carries 95, 4, `096b491fe3c4aba4b875df4e365cc036`, policies over 100, functions over 253, ACLs over 48 relations, SECURITY DEFINER 28 | exit 0, journal 96 | `17 OK / 0 VACUOUS / 0 FAIL`; 5 indexes, comment md5 `5212f3ec29a6efafa4f3ea0ab388d5b4`, 16 reads 18000 |

**Every pre-check verdict driven to FAIL, each on a fresh copy of the base (the 20,000
row ledger unless named), the change made before the pre-check:**

| Verdict | What was changed | The pre-check read |
|---|---|---|
| 0 | the file run with `BEGIN;` in place of `BEGIN READ ONLY;` (a copy) | FAIL on 0 only |
| 1 and 12 | the table renamed | psql exit 3, `relation does not exist`, no verdict printed: a missing subject is a STOP |
| 2 | `imported_entity_id` made NOT NULL (empty ledger) | FAIL on 2, VACUOUS on 12 |
| 3 | a table named `migration_staging_imported_entity_idx` created | FAIL on 3 only |
| 3, its control | `migration_staging_tenant_status_idx` renamed | FAIL on 3 (control 0) and 8 |
| 4 | another index on `(imported_entity_id)` | FAIL on 4 and `staging_indexes_before` |
| 4, its control | an extra index on `(tenant_id)` | FAIL on 4 (control 4) and `staging_indexes_before` |
| 5 | the primary key's `indisvalid` set false | FAIL on 5 only |
| 6 | the idempotency key renamed | FAIL on 6 only |
| 7 | the batch index's `indisready` set false | FAIL on 7 only |
| 8 | the status index's `indislive` set false | FAIL on 8 only |
| 9 | `0098`'s hash already in the journal | FAIL on 9, 11 and `journal_rows_before` |
| 9, its control | `0097`'s journal hash replaced | FAIL on 9 (control 0), 10 and 11 |
| 10 | `0096`'s journal hash replaced | FAIL on 10 only |
| 11 | a later row in the journal | FAIL on 11 and `journal_rows_before` |
| `journal_rows_before` | an older extra row in the journal | FAIL on `journal_rows_before` only |
| `staging_indexes_before`, `staging_indexes_md5` | every index on the table dropped | FAIL on 3, 4, 5 to 8, `staging_indexes_before` and `staging_indexes_md5` |
| `policies_md5` | every policy dropped | FAIL on `policies_md5` only |
| `functions_md5` | every function in public dropped (with `pg_trgm` and `btree_gist`, which keep theirs in public) | FAIL on `functions_md5` and `secdef_functions_before` |
| `grants_md5` | every ACL of a relation in public cleared | FAIL on `grants_md5` only |
| `secdef_functions_before` | one SECURITY DEFINER function given another owner | FAIL on `secdef_functions_before` only |
| all | the pre-check on the APPLIED database | FAIL on 3, 4, 9, 11, `journal_rows_before` and `staging_indexes_before`: a second apply is refused before it starts |

**Every post-check verdict driven to FAIL, each on a fresh copy of the 20,000 row base,
after the pre-check and the apply, the change made between the apply and the post-check:**

| Verdict | What was changed | The post-check read |
|---|---|---|
| 0 | run inside `begin` in place of `begin read only` | FAIL on 0 only |
| a carry | `journal_rows_before` not passed | psql exit 3 before any verdict |
| 1 | the index renamed and a table of its name created | FAIL on 1 to 7, 10 and 14 |
| 2 | the index rebuilt UNIQUE | FAIL on 2, 6 and 7 |
| 3 | its `indisvalid` set false | FAIL on 3 only |
| 4 | rebuilt as `(entity_type, imported_entity_id)` | FAIL on 4, 6 and 7 |
| 5 | rebuilt without the predicate | FAIL on 5, 6 and 7 |
| 7 | its comment edited | FAIL on 7 only |
| 8 | a second index on `(imported_entity_id)` | FAIL on 8, 9 and 10 |
| 9 | `staging_indexes_before` passed as 5 | FAIL on 9 and 10 |
| 10 | another index renamed | FAIL on 10 only |
| 11 | `journal_rows_before` passed as 94 | FAIL on 11 only |
| 11 | a newer journal row added | FAIL on 11 only |
| 12 | a policy added | FAIL on 12 only |
| 13 | a function added | FAIL on 13 and 14 (a new function's ACL) |
| 14 | a grant added | FAIL on 14 only |
| 15 | `secdef_before` passed as 27 | FAIL on 15 only |
| 15 | one SECURITY DEFINER function given another owner | FAIL on 13, 14 and 15 |
| 16 | H1 and H2 above: VACUOUS on an empty ledger, OK on a seeded one | as above |
| all | the post-check on the UNAPPLIED database, with its own pre-check's carries | FAIL on 1 to 11 |

**Idempotence.** The migration file run a second time on an applied copy: NOTICE
`relation "migration_staging_imported_entity_idx" already exists, skipping`, then
`CREATE INDEX` and `COMMENT`; the index state (one md5 over every index's name,
definition, oid and comment, and the count) read `6c65a8cb4a469656a3f8cddf39395067 5`
before and after.

**The lock and the timings** are in "The lock, and how long it is held", above. A
synthetic ledger of 20,000, 200,000 and 1,000,000 rows (6.9 MB, 68 MB and 336 MB with
its indexes) was seeded into three copies; the new index measured 7 MB at 200,000 rows and
35 MB at 1,000,000.

**The blocks, a smoke run by the document lane, 2026-09-30, 13:48 to 13:55 Lisbon. It is
not the rehearsal the owner's ruling of 2026-09-27 ("build/rehearse/document as separate
agents") asks for;** that is NOT READY step 4. The four blocks were extracted verbatim from
this document as committed, and BEFORE YOU START and the CLOCK CHECK from GREEN's dispatch
with `MERGED` filled, and run under `zsh -f` with stdin closed, in a clone of a local bare
origin whose `main` was ONE commit: this branch's tree with the promotion simulated
(`0096` from #1471's held head and `0097` from #1475's pending file at the bytes above,
`0098` renamed with its bytes unchanged, journal idx 93, 94 and 95 at `when` 1788501700000,
1788501800000 and 1788501900000, the supabase mirror synced; check-journal read `96 .sql
files match 96 journal entries in order`). Six text substitutions, counted per block, and
nothing else: `/tmp/` to a scratch directory; the `cd` line to the clone; the environment
line to an `export` of the throwaway's URL; the target guard to an `echo`; the reader's
invocation to a copy of the reader without its production ref check (the pinned reader's
sha256 was still compared first); `MERGED` filled. The harness refused to run any block
that still named the secrets directory, the apply worktree or the production ref after
substitution. `node_modules` was linked from this worktree and excluded, so the clone read
clean, and `pnpm_config_verify_deps_before_run=false` was set in the environment, not in a
block. The apply was the real `verified-migrate.mjs` through `drizzle-kit migrate`, and git
was real.

| Substitution | BEFORE YOU START | stage 0 | CLOCK CHECK | stage 1 | stage 2 | closing read |
|---|---|---|---|---|---|---|
| `/tmp/` | 5 | 7 | 9 | 25 | 18 | 15 |
| `cd` | 1 | 1 | 1 | 1 | 1 | 1 |
| environment | 0 | 0 | 0 | 1 | 1 | 0 |
| target guard | 0 | 0 | 0 | 1 | 1 | 0 |
| reader | 1 | 0 | 0 | 0 | 0 | 1 |
| `MERGED` | 1 | 0 | 0 | 0 | 0 | 0 |

| Run | Exit | What it printed |
|---|---|---|
| the chain on a copy of the 20,000 row base | 0 each | BEFORE YOU START `journal reads 95`; stage 0 `newest journal entry: idx 95, when 1788501900000, ... before it idx 94, when 1788501800000, ... before that idx 93, when 1788501700000, ...`, check-journal 96 of 96; the CLOCK CHECK recorded `202609301300 202609302059 202609302130`; stage 1 `20 OK / 0 VACUOUS / 0 FAIL`, `the build reads 20000 ledger rows ...`, `pending 1`, `journal 95 -> 96 (delta 1)`, `0098 APPLIED. Paste stage 2 now.`; stage 2 `0098 POST-CHECK PASSED. pre-check 20 OK / 0 VACUOUS / 0 FAIL, post-check 17 OK / 0 VACUOUS / 0 FAIL, journal 95 to 96. Paste the closing read now.`; the closing read `CLOSING READ: the journal reads 96, 0098 is APPLIED, and nothing is pending on the recorded sha.` |
| the chain on a copy of the empty ledger base | 0 each | stage 1 `19 OK / 1 VACUOUS / 0 FAIL`, `VACUOUS on 12 only`, `the build reads 0 ledger rows ...`; stage 2 `... pre-check 19 OK / 1 VACUOUS / 0 FAIL, post-check 16 OK / 1 VACUOUS / 0 FAIL, journal 95 to 96 ...`; the closing read as above |
| stage 0, then stage 1, pasted again after the apply | 1 and 1 | `STOP: stage 1 has ALREADY APPLIED 0098 in this sitting. ...`; journal 96, nothing applied again |
| BEFORE YOU START with `MERGED` unfilled | 1 | `STOP: MERGED is not a filled-in sha, so this dispatch is NOT READY. The journal read has not run` |
| a commit pushed to the origin's `main` between the CLOCK CHECK and stage 1 | 1 | `STOP: main moved since stage 0, the merge freeze was broken. ...`, both shas printed, before the environment line; journal 95, nothing applied |
| BEFORE YOU START after that push | 1 | `STOP: origin/main is not the merge commit of PR 1469 itself ...` |

**What the smoke run does not show.** The target guard never ran, and the reader ran
without its production ref check. The promotion was simulated with synthetic `when`s for
`0097` and `0098`; the real ones are what stage 0 checks at the sitting. The clock was the
real Lisbon clock, inside the day window; the window's edges were not exercised here.

The blocks written on 2026-09-27 under `docs/migration-apply-0097.md`, which applied from
the held branch, were rehearsed then and are superseded by these.

## The plan, rehearsed on 2026-09-27 (A5), and why it still stands

The migration's bytes have not changed since (sha256 `198054ab...`), and neither has the
ledger table, its four indexes or its one policy: `0096` and `0097` touch neither. So the
plan measured then is the plan of these bytes. It ran on a copy of a base built from `main`
at `e674100b` plus that day's pending `0094`, `0095` and `0096` (94 journal rows), seeded
with 20,000 ledger rows (18,001 with a target, 4,001 of them `clinical_record`), EXPLAIN
ANALYZE of `importerSourcedRecordSql` (`apps/web/lib/clinical/record-origin.ts:62-81`),
`importer_sourced = t` on every run:

- **Under RLS** (`authenticated`, owner claims):
  - before: `Seq Scan on migration_staging_rows ledger (cost=0.00..685.00 rows=4000)
    (actual rows=4001)`, `Filter: ((tenant_id = (InitPlan 12).col1) AND (entity_type =
    'clinical_record'::migration_entity_type))`, `Rows Removed by Filter: 15999`, inside a
    `Hash Semi Join`, total `Result (cost=377.76..)`;
  - after: `Index Scan using migration_staging_imported_entity_idx on
    migration_staging_rows ledger (cost=0.29..8.31 rows=1)`, `Index Cond:
    (imported_entity_id = chain_1.id)`, `Filter: ((tenant_id = ...) AND (entity_type =
    'clinical_record'...))`, inside a `Nested Loop`, total `Result (cost=75.85..)`.
- **As `postgres`, bypassing RLS:**
  - before: `Seq Scan ... (cost=0.00..635.00 rows=4001)`, `Rows Removed by Filter:
    15999`, total cost 337.06;
  - after: `Index Only Scan using migration_staging_imported_entity_idx`, `Index Cond:
    ((imported_entity_id = chain_1.id) AND (entity_type = 'clinical_record'...))`,
    `Heap Fetches: 1`, total cost 60.13.

Under RLS `entity_type` stays a filter and `imported_entity_id` is the index condition,
which is why the key leads with `imported_entity_id` (the migration file, section 4).

## What this does NOT do

- **It edits no reader.** The planner picks the index; `record-origin.ts` and the
  scripts that probe the ledger stay as they are.
- **It is not mirrored in `packages/db/src/schema.ts`**, like `0068`'s
  `appointments_patient_2_idx` and `0091`'s `patient_care_team` indexes. `drizzle-kit
  generate` diffs `schema.ts` against its own snapshots, not the database, so it never
  emits a DROP for an index it never knew.
- **It changes no table, column, policy, grant, function or row,** and no SECURITY
  DEFINER function: the file is one CREATE INDEX and one COMMENT and nothing else, which
  `scripts/migration-0098-staging-index.test.mjs` pins, and post-check 9, 10 and 12 to
  15 prove it on production.
- **It holds no DELETE and no TRUNCATE statement**, and neither does either check file:
  a case insensitive grep of the migration and both checks for `DELETE` and `TRUNCATE`
  finds 0 lines. It holds no `REVOKE TRUNCATE` either; that is a privilege change, not a
  TRUNCATE statement, and it is `0099`'s. The only removals in this document are the
  blocks' `rm -f` of their own `/tmp/0098-*` records, and the only `DELETE` named is the
  one a SHARE lock makes wait.
- **It does not prove the plan on production.** A plan depends on production's
  statistics and ledger; the rehearsal proves the switch on 20,000 rows, and no verdict
  in this sitting asserts a plan.
