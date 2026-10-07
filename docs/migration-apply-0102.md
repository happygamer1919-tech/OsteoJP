# 0102: apply SAT-01's tables, doors, switch audit and policies

**NOT READY until the dispatch GREEN runs carries the sha of the held head.** Done: its predecessor, `0101` (the public form's email column, #1538), is promoted on `main` (merge commit `a0e96a99`) and, by the lead's dispatch to this lane, was applied to production by GREEN on 2026-10-05, 21:01 to 21:06 Lisbon, production's journal going 98 to 99 (this lane read `main`, not production; NOT READY step 1); the GATE-CHANGE the promotion forced, which the promotion simulation of 2026-10-05 found and named (#1544, merged 2026-10-06 at `129860b3`; step 2); the promotion, on its held branch, 2026-10-06 (step 3; "The promotion's run, 2026-10-06"): 0102 is `packages/db/migrations/0102_sat01_satisfaction_survey.sql`, at journal `idx 99`, the bytes of the pending file it was (`packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_survey.sql`), the same sha256 before and after the rename; and the rehearsal of 2026-10-06 from the promoted head, with its limits (step 5): on a throwaway 0102 applied through `verified-migrate.mjs`, journal 99 to 100, and the two journal-reader reads are NOT REHEARSED, because the reader refused the throwaway, as its guard should (see "Rehearsal"). Open, in order: the one review round on the promoted bytes and on this record (ruling R44 allows one round, under R8; step 4), CI on the held head (step 6) and GREEN's dispatch (step 7). The blocks below read the held head: from a head that does not carry the promotion commit, stage 0 STOPs at its promotion check. **The sitting is closed hours only, by the weekday table** (see "R9"), **and it runs from this pull request's HELD head, before the merge** (see "THE ORDER OF PULL REQUESTS").

**Status: AUTHORED. PROMOTED ON ITS HELD BRANCH. REHEARSED ON 2026-10-06, WITH LIMITS. NOT APPLIED.** One
migration, `packages/db/migrations/0102_sat01_satisfaction_survey.sql`, sha256
`db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`, promoted on 2026-10-06 from the
pending file named above by a rename that changed no byte. It is
SAT-01's database half (strategy S-1002-D; numbered `0102` by S-1004-A R41: "0101 = public-form
email column ... SAT-01 becomes 0102"; spec `docs/design/SPEC-SAT-01-satisfaction-form.md`,
section 6 and the amendment of 2026-10-04). Four blocks, each pasted whole, on its own and in
order: stage 0 (the promotion, the files, the clock and the head it runs from), stage 1 (the HEAD
CHECK, the pre-check, the clock and the clinics, and the apply), stage 2 (the post-check) and the
closing journal read. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0102 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number
changed and no other change.** This document has no stage 3 (its behaviour check runs where it
can measure something; see "The behaviour check per role"), so where the rule names stages 2 and
3, read stage 2 and the closing read.

**In a Claude session `set -e` does not stop a pasted block, so every halt in these blocks is
explicit, and that is proven by fault injection.** GREEN's Bash tool runs a block as
`... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`,
zsh ignores errexit inside it, the block's `( ... )` subshell included (found by R4 on 0100's
dispatch, 2026-10-02). So each command a later step relies on carries its own
`|| { echo "STOP: ..."; exit 1; }`, and `scripts/sat01-tables-0102.test.mjs` runs every block in
that exact shape with each external call made to fail in turn (see "The fault-injection
harness"). `set -eo pipefail` stays at the top of each block: pipefail is what gives a `... | tee`
pipeline the exit of the program before the tee, and `-e` is real when a block runs as a script.
Strategy's standing rule (R30): "Explicit halts in every block, never set -e."

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the
owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The
lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **DONE: `0101` is promoted on `main` and applied to production.** #1538 merged at `a0e96a99`;
   the lead's dispatch reports the apply (GREEN, 2026-10-05, 21:01 to 21:06 Lisbon, production's
   journal 98 to 99). **What this lane read itself, on `main`:** the promoted file
   `packages/db/migrations/0101_guest_request_email.sql` hashes to `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b`, the same value
   this document pinned from the pending body on `origin/db/0101-guest-request-email` at `045214f0`
   (a promotion changes no byte, and the script test now hashes the real file against `SHAPREV`);
   its journal entry is `idx 98`, `when` 1788502200000, the newest of 99; and `node
   scripts/check-journal.mjs` reconciles 99 files with 99 entries. As first written: **`0101` is
   applied to production and merged (#1538).** One Tier C item in checks at a time, and apply order
   equals file order (2026-09-30).
2. **DONE: the GATE-CHANGE the promotion forced merged first, as its own pull request, by the owner
   on green: #1544, merged 2026-10-06 at `129860b3`** (order table, row 1). **Measured on
   2026-10-05 by promoting on a scratch branch** (see "The promotion, simulated"): one frozen script
   test went red at the promotion, `scripts/import/cleanup-test-patients.test.mjs`, because the
   three new tables have a foreign-key path to `patients` and its delete order did not list them.
   Its GATE-CHANGE has the shape of #1436 (RGPD-01): the three tables entered `DELETE_ORDER` and
   `AHEAD_OF_MIGRATION`, and the manifest was regenerated. That edit alone was green on the
   unpromoted tree (26 of 26, read again on this branch on 2026-10-06, before the rename).
3. **DONE, 2026-10-06: SOLO promoted 0102 on its branch, `db/0102-sat01-tables`,** the branch of
   the held pull request #1551 (`held-for-apply`). Each measurement is under "The promotion's run,
   2026-10-06". What was done: `origin/main` was already in the branch (it stood one commit above
   `dbe63d87`, so there was nothing to merge in, and nothing was rebased); `git mv` of the pending
   file to
   `packages/db/migrations/0102_sat01_satisfaction_survey.sql` (a rename: sha256 `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`
   before and after); its journal entry appended at **`idx 99`**, tag
   `0102_sat01_satisfaction_survey`, **`when` 1788502300000** (0101's 1788502200000 plus 100000; a
   `when` equal or lower makes drizzle skip the file in silence, which is why
   `scripts/check-journal.mjs` refuses one); `node scripts/sync-supabase-migrations.mjs` for
   the mirror; `node scripts/check-journal.mjs` (**100 files, 100 entries**, as the simulation
   read); the README row moved into the Promoted table; **and three ordinary edits the
   frozen tests force at the promotion, none of them a gate file:**
   `purge_expired_survey_comments` and `patients_survey_switch_audit` added to the list of functions
   `authenticated` may not execute in `packages/db/tests/security-definer-execute-acl.db.test.ts`;
   the three deletes added to `scripts/import/cleanup-test-patients.sql` (answers, then codes, then
   sends, all before `appointments`, because an answer blocks its appointment's delete); and
   the three tables declared in `packages/db/src/schema.ts` (the cleanup test refuses a table the
   script deletes from that `schema.ts` does not name; #1399 did the same for RGPD-01). This
   document's banner and status were amended, with its sidecar.
   The pre-check and the post-check pin the body's sha256 as a literal, and a rename does not move
   it, so neither was edited; nor was the script test, which finds the file in either place.
   **From that commit the PR reads red on the SECURITY DEFINER count, in two required checks, by
   construction, until step 4 of the order table.**
4. **R4** on the promoted PR's diff and the card acceptance, at most three rounds (the review-loop
   cap). NOT DONE.
5. **DONE on 2026-10-06, WITH ITS LIMITS** (see "Rehearsal"; it ran before step 4, which is still
   open). From the promoted head `68fcd861`, on a throwaway at production's position: stage 0, the
   dispatch's CLOCK CHECK, stage 1 and stage 2 ran whole to their last lines, exit 0, and 0102
   applied through `verified-migrate.mjs`, journal 99 to 100. The dispatch's BEFORE YOU START and
   the closing read ran whole as far as the journal reader, which refused the throwaway, as its
   guard should: both of its reads are NOT REHEARSED, and the CLOCK CHECK's input came from a
   fragment of BEFORE YOU START. In stages 1 and 2 the target guard's line was substituted, so the
   guard program itself did not run. As first written: **The rehearsal agent runs this document's
   four blocks and GREEN's two, whole, from the promoted head,** under the lead's standing rule,
   verbatim in its prompt.
6. **CI on the promoted head:** every required check green except the two that read the count,
   which read `expected exactly 28 ... found 36` and nothing else. The DB-gated job stops at that
   step and runs no suite, so `packages/db/tests/sat01-survey-rls.db.test.ts` does NOT run in CI
   before the apply: the behaviour check stands on the build lane's run and the rehearsal until
   step 5 of the order table.
7. **SOLO fills GREEN's dispatch:** the held head's sha, this document's sha256, and a run window
   **while both clinics are closed by the weekday table** (R9 below). The dispatch's own CLOCK
   CHECK writes `/tmp/0102-window.ok`. SOLO pushes nothing to the branch from that moment until
   GREEN's report is in.

| Fact | Value |
|---|---|
| Card | SAT-01, the satisfaction form (`SAT-01-satisfaction-form`) |
| Ruling | Strategy's dispatch S-1002-D: S3 to S12 and the build order. S-1004-A (2026-10-04): R41 (the number), R39 (the policies last, the `supautils.policy_grants` read, closed hours only), G6 (the lock re-measurement), R29 (the weekday table), R30 (explicit halts), R32 (O9), R33 (O10), R34 (O11), R35 (O12). S-1002-A R9 and R10 |
| Migration | `packages/db/migrations/0102_sat01_satisfaction_survey.sql`, promoted on 2026-10-06 by a rename; until then it was `packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_survey.sql`. sha256 `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1` in both places |
| Journal | `idx 99`, tag `0102_sat01_satisfaction_survey`, `when` 1788502300000. Stage 0 asserts it and 0101's entry before it. Production's journal goes 99 to 100 |
| Mirror | `supabase/migrations/0102_sat01_satisfaction_survey.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0101`, the optional email on a public booking request (#1538), **promoted on `main` and applied to production on 2026-10-05**: `packages/db/migrations/0101_guest_request_email.sql`, sha256 `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b`, journal `idx 98`, `when` 1788502200000, the newest of main's 99 entries. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row, at that `when`, and reads `journal_rows_before` 99 |
| Runs from | **the pull request's HELD head, `origin/db/0102-sat01-tables`, never a merge commit on main.** Stage 0 records the sha that branch resolves to in `/tmp/0102-head.sha`; every later stage checks out that recorded sha, never a fresh read of the branch, and stage 1 HALTS if the branch has moved since (the HEAD CHECK). The `held-for-apply` label keeps the branch from being merged or auto-updated during the sitting |
| The apply worktree | `/Users/ivan/Projects/GitHub/osteojp-prod-apply` (the repositories moved on 2026-10-04; earlier documents name the old place) |
| This document | `docs/migration-apply-0102.md`, pinned by `docs/migration-apply-0102.sha256` and asserted by every block, the closing read included; GREEN's dispatch pins its sha256 on its own and checks it by machine |
| Pre-check | `scripts/db/precheck-0102-sat01-tables.sql`, READ ONLY, 16 verdicts each with its control, 8 CARRY rows, 6 INFO rows (one of them R39's read of `supautils.policy_grants`, one `idle_in_transaction_session_timeout`), `-v prev_hash` and `-v prev_when` required, sha256 `ab4217aa5a39eaec4b694b27a8435e49ad063347d34329ea70ec096fbbe55cc4` |
| Post-check | `scripts/db/postcheck-0102-sat01-tables.sql`, READ ONLY, 27 verdicts, ten carries in, sha256 `f8fd3dd7fdef6572e8c0137fa36f0384473a392dac680a2241435aa80460f7d0` |
| Behaviour check | `packages/db/tests/sat01-survey-rls.db.test.ts`, the DB-gated suite: 111 tests on the applied side, every role as an assigned principal under real RLS. Run on the build lane's stack (below), and by CI's `db-tests` once the count GATE-CHANGE is on main; not on production, where the tables are empty at the apply (see "The behaviour check per role") |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module both of the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. All four read again from `origin/main` at `a0e96a99` on 2026-10-05, after 0101's merge: the same bytes 0100's and 0101's documents pin, and the bytes 0101's sitting ran on production; every block that runs one compares it, and the module, first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs` on main: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6` (#1510). It feeds R9 proof 1, which is printed in every sitting and decides nothing here |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts` (0094 to 0101 did not pin them either). Their tree is fixed instead, by commit: GREEN's BEFORE YOU START requires the held branch to resolve to the sha the dispatch names, and the HEAD CHECK halts on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0102-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stage 2 and the closing read refuse at or after its end. Stage 0 removes the record. **No date is written in this document or in any op file** |
| What it changes | In this order: the three `SET LOCAL` lines; three new tables with RLS, explicit grants and three lookup indexes; nine new functions, eight of them SECURITY DEFINER, each of the eight with its owner pin and the private helper with none; then, as late as it can stand, `patients.survey_enabled` (boolean NOT NULL DEFAULT true), `GRANT UPDATE (survey_enabled) ON patients TO patient` and one trigger on `patients` (R34's audit row); and, as its last two statements, two SELECT policies (R39) |
| What it never touches | every existing row (no backfill, no UPDATE, no DELETE: measured, see "Rehearsal"), every existing policy, function, trigger, relation privilege, column privilege but the one it adds, and every default privilege. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so
the digest lives in `docs/migration-apply-0102.sha256` and every block checks it with
`shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same head as the
document, so a branch that moved to a new document and a new sidecar together would pass that
check. **GREEN's dispatch closes that by machine:** it pins this document's sha256 on its own and
checks it against the held head it resolves. From stage 0 on, the HEAD CHECK halts on any moved
head before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no
backslash continuations and no `!` except `test !`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number). Narration is
`echo`. Every halt is an explicit `STOP:` line followed by a non-zero exit, never `set -e`.

**The migration's own header names no number of its own,** only 0101's, as the migration it
follows. **Since the promotion two things in pinned bytes are stale, and are left so on purpose:**
the header still opens "PENDING" and says the file "carries no number of its own", and the
pre-check's header still names the pending path. A promotion changes no byte, and each file's
sha256 is what every pin points at (this document said until 2026-10-06 that the rename leaves
nothing stale in the header; the word "PENDING" is).

## 1. What it does

Seventy statements, each ended by `--> statement-breakpoint` (seventy-four until the re-pin of
2026-10-06: one `SET LOCAL` more, and the eight foreign keys in three statements where they took
eight; "Review history"). **The order is the lock order:** the first sixty-one lock no table that
existed before; every such lock is taken in the last nine, `patients` first, then `appointments`,
`tenants`, `users`, then the platform's tables with the policies, last.

| # | Statements | Effect |
|---|---|---|
| 1, 2 | `SET LOCAL lock_timeout = '5s';` `SET LOCAL statement_timeout = '60s';` | a WAIT for a lock that lasts 5 seconds fails the transaction, and nothing is applied; no statement runs longer than 60 seconds. Neither bounds how long a lock, once taken, is HELD |
| **3** | **`SET LOCAL idle_in_transaction_session_timeout = '15s';`** | strategy's ruling of 2026-10-06 (Q5 of S-1006-A). A session that sits idle inside the transaction for 15 seconds, between two statements, is ended by the server: the transaction is rolled back, nothing is applied and every lock is released (measured, "G6"). The gate (`scripts/migration-timeouts.test.mjs`) allows this line and does not yet require it; this file's own script test requires it, third, at this value |
| 4 to 12 | `CREATE TABLE` `appointment_survey_sends`, `appointment_survey_codes`, `appointment_survey_responses`; three indexes; three comments | one row per send (S5), the code a link carries (an HMAC only), one answer per send and per appointment. **Created WITHOUT their eight foreign keys to `tenants`, `appointments`, `patients` and `users`, so they lock no table that existed before**; the two foreign keys to `appointment_survey_sends` itself are inline |
| 13 to 20 | `ENABLE ROW LEVEL SECURITY` on all three; `REVOKE ALL ... FROM PUBLIC, anon, authenticated, patient` on all three; `GRANT SELECT` to `authenticated` on sends and answers | no application role writes any of them; the codes table is unreadable. **From here to statement 69 the two readable tables have RLS on and no policy, which admits no application role**: the safe side, inside one transaction nobody else sees |
| 21 to 57 | eight functions: each `CREATE FUNCTION`, then, FOR THE SEVEN THAT ARE SECURITY DEFINER, `ALTER FUNCTION ... OWNER TO postgres`, then `REVOKE ALL ... FROM PUBLIC, anon, authenticated, patient, service_role`, the grant listed below, and a comment. **The private helper has no owner pin** (see "The review of 2026-10-05", finding 1) | the doors. **All plpgsql, the read door included** (a SQL-language body is planned at `CREATE` and takes ACCESS SHARE on every table it reads). They lock no existing table |
| 58 to 61 | `CREATE FUNCTION public.patients_survey_switch_audit()` (a trigger function, SECURITY DEFINER), its owner pin, its `REVOKE ALL`, its comment | R34's audit row, the function half. Still no lock on `patients` |
| **62 to 65** | **`ALTER TABLE public.patients ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true`**, its comment, `GRANT UPDATE (survey_enabled) ON public.patients TO patient`, `CREATE TRIGGER patients_survey_switch_audit AFTER UPDATE ON public.patients FOR EACH ROW WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled)` | the patient's survey switch (S8), on for every patient (a constant default is stored once in the catalogue, so no row is rewritten), and R34's trigger. **Statement 62 takes ACCESS EXCLUSIVE on `patients`, the first lock on an existing table: from here to the COMMIT every READ of `patients` waits too** |
| **66 to 68** | **the eight foreign keys in three statements, one `ALTER TABLE` per new table with comma-separated `ADD CONSTRAINT <table>_<column>_fkey FOREIGN KEY ...` clauses:** the sends (66: to `appointments`, `tenants`, `users`, `patients`, in that order), the codes (67: to `tenants`), the answers (68: to `appointments`, `tenants`, `patients`) | the same constraints, names and delete rules an inline `REFERENCES` gives, and the ones the eight separate statements gave until the re-pin of 2026-10-06. **66 takes SHARE ROW EXCLUSIVE on `appointments`, then `tenants`, then `users`, inside the one statement and in the order of its clauses (measured, "G6"): writes to them wait from there to the COMMIT. 67 and 68 take no new lock.** The tables are empty: nothing is scanned |
| **69, 70** | **`CREATE POLICY` `appointment_survey_sends_select`, `appointment_survey_responses_select`, both `AS PERMISSIVE FOR SELECT TO authenticated`** | S7 for answers, S4's roles for sends. **The last two statements, by R39: nothing follows them.** Statement 69 takes ACCESS EXCLUSIVE on the platform's auth, storage and realtime tables |

| Function | SECURITY DEFINER | EXECUTE | What it does |
|---|---|---|---|
| `survey_manual_verdict(uuid, uuid, text)` | no (runs as its caller); **no owner pin** | nobody | the manual send's verdict, shared by the state and the manual door |
| `issue_survey_automatic(text, uuid, uuid, text)` returns text | yes | `authenticated` | the 24-hour job's send (S3): `issued`, `cooldown`, `not_eligible`, `not_allowed`. **Only the server's own session** (a tenant, no user, no patient claim) |
| `issue_survey_manual(text, uuid, uuid, text)` returns (result, appointment_id) | yes | `authenticated` | the button (S4, S5): `issued`, or `not_allowed`, or one of the five reasons `no_appointment`, `opted_out`, `no_channel`, `open_link`, `answered`. The staff member's own session |
| `survey_send_state(uuid, uuid)` returns (state, reason, appointment_id) | yes | `authenticated` | the button's state: `ready`, `disabled` with the reason, `not_allowed` |
| `resolve_survey_code(text)` returns (tenant_id, appointment_id, visit_ends_at) | yes | `authenticated` | the guest page's read; writes nothing. **Only the server's own session**; any other reads no row |
| `submit_survey_response(text, uuid, integer, integer, text, boolean, text)` returns boolean | yes | `authenticated` | the guest page's answer, single use: the only write path into the answers. **Only the server's own session**; any other gets false |
| `opt_out_survey(text, uuid)` returns boolean | yes | `authenticated` | the guest page's opt-out (S8). **Only the server's own session**; any other gets false |
| `purge_expired_survey_comments(uuid)` returns integer | yes | nobody | retention (S12): an UPDATE that nulls comments older than 24 months; scores kept |
| `patients_survey_switch_audit()` returns trigger | yes | nobody | R34: writes the switch's audit row. A trigger function: fired by the trigger, never called |

The SECURITY DEFINER count in `public` moves from 28 to 36 (eight), which is the post-apply
GATE-CHANGE of the order table.

## 2. The rulings of S-1004-A, and what each changed here

- **R41, the number.** SAT-01 is `0102`; the pending file is named for what it follows, `0101`.
  Journal entry 100 on production (0101 is 99). Every file of the draft was renamed with history
  kept.
- **R39, the policies last.** "Move the two CREATE POLICY statements to the end of the SAT-01 file.
  Add one read of supautils.policy_grants to its production pre-check. Standing: any migration that
  creates a policy is closed-hours only, never eligible for R9." Done: statements 69 and 70; the
  pre-check's INFO row; and section 4 below. Measured: see "G6".
- **R32 (O9), the fifth disabled reason:** "the last concluded visit already has an answer." The
  verdict is computed in the migration (`survey_manual_verdict`), and the draft was already
  authored to it as reason `answered`; the file's comments now cite the ruling, and the suite
  gained an arm that pins what "last" means (an older answered visit beside a newer unanswered
  one is `ready`). No predicate changed.
- **R33 (O10), the send flag's three states** (off, canary, on; the allow-list held in
  configuration). **Nothing in the schema.** The flag and the allow-list are application
  configuration, the shape of `BOOK_CONFIRM_MODE` and `BOOK_CONFIRM_CANARY_PATIENT_IDS`; no table,
  column, function or grant here reads or stores either. The check the ruling names (a canary send
  to a non-listed patient is refused and logged) belongs to the application pull request.
- **R34 (O11), who sets the switch, and the audit row.** "Settable by the patient and by the same
  staff roles that edit reminder preferences, same clinic scope, with an audit row per change, in
  RLS." See section 3.
- **R35 (O12), the order.** See "THE ORDER OF PULL REQUESTS".
- **R29, R30:** the weekday table and the explicit halts, in every block (section 4 and the
  blocks).

## 3. The table and RLS design, in brief

- **Sends** (`appointment_survey_sends`): tenant, appointment (cascades with it), patient, a COPY of
  the appointment's clinic (`location_id`), channel (`email` or `sms`), origin (`automatic` or
  `manual`), `sent_by` (the staff member, NULL for automatic; a CHECK ties it to the origin),
  `sent_at`, `consumed_at` and `outcome` (`answered` or `opted_out`; a CHECK ties them). No
  `expires_at`: a link lives 14 days from `sent_at`, read where it is decided (0072, SR-28).
  Indexes: `(tenant_id, patient_id, sent_at DESC)` for the 60-day rule and the valid-link check;
  `(appointment_id)` for the appointment delete's cascade.
- **Codes** (`appointment_survey_codes`): `code_hash` (64 hex, the HMAC), tenant, `send_id` (unique,
  cascades with the send). RLS on, no policy, no grant: nobody reads it.
- **Answers** (`appointment_survey_responses`): tenant, `send_id` (unique, no cascade),
  `appointment_id` (unique, no cascade: O6 (a), and one answer per visit by R32), patient, COPIES
  of the appointment's clinic and both practitioners, `nps` 0 to 10, `rating` 1 to 5, `comment`
  NULL or 1 to 1000 characters, `comment_purged_at` (a CHECK keeps a purged answer's comment NULL),
  `contact_consent`, `consent_version` (not blank, at most 64 characters), channel and `sent_at`
  copied from the send, `submitted_at`. Index `(tenant_id, submitted_at DESC)`.
- **Answers, who reads (S7), one PERMISSIVE SELECT policy:** the tenant of the JWT, AND one of: the
  owner; admin or reception with the answer's clinic in `viewer_location_ids()`; a therapist who is
  `practitioner_id` or `practitioner_2_id` of the answer AND whose clinics include its clinic. No
  other therapist. No assignment, no rows (the 0047 "no assignment means every clinic" branch is not
  copied). `patient` and `anon` hold no grant.
- **Sends, who reads (S4's roles, the spec's reading):** the tenant, AND the owner; or admin or
  reception at the send's clinic; or a therapist for a patient in `viewer_treated_patient_ids()`. A
  send says that an answer exists, never what it says.
- **Writes:** no application role holds INSERT, UPDATE or DELETE on any of the three, and there is no
  write policy. The doors are the only writers, each `SECURITY DEFINER` with `search_path = public`,
  owned by `postgres`. **The guest page writes only through `submit_survey_response`, and only with
  a live single-use code.**
- **WHICH SESSION MAY CALL WHICH DOOR (the review's MAJOR finding).** Every door is granted to
  `authenticated`, so the test is the session's claims. **The server's own session** carries a
  tenant and NO user and no patient claim: it is what the application makes on its own database
  connection (`withReminderTenantContext`, `apps/web/lib/reminders/context.ts:25`), which is the
  session the public confirm page uses today (`apps/web/lib/reminders/confirm-code-store.ts:138`,
  under the all-zero tenant for the one read that precedes a tenant) and the session the public
  survey page will use. Nobody else can make one: a JWT that Supabase Auth signs always names its
  user, the anon key's role is `anon` and the service key's is `service_role`, and neither role
  holds EXECUTE on any door. **The read, the answer, the opt-out and the automatic send answer
  only that session.** A session that carries a user, any staff member's included, or a patient
  claim, gets what an unknown code gets: no row, false, false, `not_allowed`.
  - **So the forgery the review ran no longer works.** A staff member can still call
    `issue_survey_manual` directly with a hash of their own choosing and get `issued`. That hash
    is not redeemable by them (their session is refused by all three page doors), and not by
    anybody through the page, which reaches the doors only with HMAC(secret, the code in the
    link), a secret no staff member holds.
  - **WHAT A STAFF MEMBER CAN STILL DO, AND IT MATTERS:** mark a send as issued without a message
    leaving, by calling the manual door outside the application. The row carries their name
    (`sent_by`, and a `survey.sent` audit row), and it has two effects on a patient S4 already
    lets them send to: no automatic survey for that patient for 60 days (S3 counts any send), and
    the button disabled for 14 days by an open link. The database cannot tell that call from the
    application's own, because both carry the staff member's JWT. **Owed application work, in the
    spec's amendment:** the manual send records the hand-over to the provider in the dispatch
    ledger in the same request, and the status line and the list show a send as sent only when
    that record says so; a manual send with no hand-over is shown as such and can be reported.
- **A code is 64 lower-case hex characters, tested first by every door that takes one.** Anything
  else gets the answer a wrong code gets (`not_allowed` from the two issue doors, false from the
  answer and the opt-out, no row from the read), never the 23514 the codes table's CHECK would
  raise: the shape of a guess tells nothing.
- **THE FOREIGN KEYS, AND WHAT A DELETE DOES (decided; the review's finding 3).** Ten foreign
  keys. The eight to tables that existed before are added by three `ALTER TABLE` statements, one
  per new table, at statements 66 to 68, not written in `CREATE TABLE`, under the names and with
  the definitions the inline form gives
  ("G6" says why, and post-check verdict 3 reads each by name).

  | From | To | On delete | So |
  |---|---|---|---|
  | a send | its appointment | CASCADE | an appointment's hard delete takes its unanswered sends |
  | a code | its send | CASCADE | and their codes |
  | an answer | its appointment | NO ACTION | an appointment with an answer cannot be hard-deleted (O6 (a)) |
  | an answer | its send | NO ACTION | nor can its send go from under it |
  | a send, an answer | **the patient** | **NO ACTION** | **a patient cannot be deleted while a send or an answer names them** |

  **Why NO ACTION to the patient, and not CASCADE.** The application hard-deletes only a patient
  nothing refers to (`hardDeletePatient`, `apps/web/lib/patients/actions.ts:494`: any appointment,
  note, invoice or document is `has_references`), and a patient with a send always has the
  appointment it was sent for. A cascade would make the survey the one piece of a patient's
  history that deleting something else erases without a word, and on a merged-away patient it
  would erase answers the surviving patient should keep. With NO ACTION no answer outlives its
  patient and none disappears as a side effect. **If strategy rules that a hard delete must take
  the answers with it, that is a one-statement migration later** (drop and re-add two foreign
  keys); the reverse, getting erased answers back, is not possible. A JUDGMENT, NOT A RULING (20).
  - **`merge_patients` (0005) does not know these tables,** and this migration does not change
    it. After a merge the sends and answers stay on the merged-away patient: its live link stops
    resolving (the read requires a patient that is not soft-deleted), the surviving patient's
    60-day count starts at zero, so a second automatic survey can go out for the same visit, and
    the merged-away patient cannot be hard-deleted (23503 from the database, which the
    application's guard does not expect). Measured, in one arm of the suite that records the gap.
    **Owed application work, in the spec's amendment:** the merge re-points sends and answers, or
    refuses while they exist; the hard delete counts the two tables and answers `has_references`.
- **No DELETE path:** none of the nine functions deletes. Retention (S12) is an UPDATE. The one
  DELETE that reaches these tables is an existing one: an appointment's hard delete cascades to its
  sends and their codes, and is refused while an answer exists (O6 (a)).

**THE SURVEY SWITCH (R34): the same principals as the reminder switches, by construction.**

- **How the two reminder switches are protected today, read from the migrations and measured:**
  `authenticated` holds a TABLE-level UPDATE on `patients` (no column-level grant on either
  switch), and the row gate is the policy `patients_update`
  (`packages/db/migrations/0047_patients_location_rls.sql:244`): the tenant of the JWT, AND the
  row's creator, or the owner, or admin or reception within their clinic scope (no clinic
  assignment at all, or a visit of the patient at one of their clinics, or the patient's primary
  clinic in their scope), or a therapist who treats the patient. The `patient` role holds a
  COLUMN-level UPDATE on both (`packages/db/migrations/0019_patient_reminder_prefs.sql:35`,
  re-stated in `0082_patient_locale_grant.sql:94`) and the row gate
  `patients_patient_update_selfscope` (`0019_patient_reminder_prefs.sql:45`): their own row only.
  The application's permission for the staff path is `patients:write`
  (`apps/web/lib/patients/actions.ts:280`), held by all four staff roles
  (`packages/auth/permissions.ts`); the clinic scope is the policy's, not the application's.
- **So the switch is one more column behind the same two gates.** A table-level UPDATE covers a
  column added later, and the migration adds `survey_enabled` to the patient role's column list.
  No policy is created or changed for it and no grant is widened. Pre-check verdict 15 asserts the
  premise on production before the apply; post-check verdict 25 compares the column privileges of
  `survey_enabled` with those of both reminder switches, cell by cell.
- **The audit row is a trigger,** `patients_survey_switch_audit`, AFTER UPDATE on `patients`, per
  row, only WHEN the value changed. A trigger because the write is a plain UPDATE on three paths
  (the portal's as `patient`, staff's as `authenticated`, the opt-out door's as its owner), and a
  trigger is the one place all three pass. **Its function is SECURITY DEFINER so that the row is
  written whichever role fires it:** the `patient` role holds no INSERT on `audit_log`. This
  migration does not change the audit insert policy. The row holds ids and the new value only: `action` `survey.switch_changed`, `entity_type` `patient`, `entity_id` the
  patient, `actor_user_id` the session's user when it is a staff member of that tenant (else
  NULL), and `metadata` `{"survey_enabled": <new value>, "actor_patient_id": <the session's
  patient claim, or null>}`.
- **The change and its row are one transaction.** The trigger writes the row in the transaction
  of the UPDATE: the two commit together or not at all.
- **What the suite measured** (the matrix is under "The behaviour check per role"): each allowed
  principal sets it, each forbidden one does not, another tenant does not, another clinic's staff
  do not, every one of them reads the same for both reminder switches, and each change leaves
  exactly one audit row.
- **TWO FACTS THE LEAD SHOULD READ, both inherited from the reminder switches and both left as
  they are, because R34 says "the same":** (1) a server-side session that carries a tenant and no
  user (`withReminderTenantContext`, the context in which the SMS STOP reply sets
  `reminder_sms_enabled` today) can set the survey switch too: 0047 reads it as an admin with no
  clinic assignment. Its audit row carries no actor. (2) The staff application does not show the
  reminder switches on the patient file today; "the staff roles that edit reminder preferences"
  is therefore read as the roles the DATABASE admits, which is where R34 puts the rule ("in RLS").
  Narrowing either would need a policy of the switch's own, which is not "the same".

## 4. R9 and R39: the sitting is closed hours only, by the weekday table

S-1002-A R9, strategy's words: "DAYTIME APPLIES, owner ruled B, from 0100: a clinic-hours sitting
is allowed only when all three hold, each proven in the apply document: (1) the SET LOCAL gate is on
main; (2) the migration is catalog-only or touches no table reception writes; (3) the read-only
pre-check ran on production in an earlier sitting, output recorded. Else closed hours."

**THE STANDING RULE OF R39, in strategy's words: "any migration that creates a policy is
closed-hours only, never eligible for R9."** 0102 creates two. So this document carries no
daytime arm and never will, whatever a later reading of R9's three conditions says: a `CREATE
POLICY` run by `postgres` on Supabase takes ACCESS EXCLUSIVE on the platform's auth, storage and
realtime tables (measured, "G6"), and logins and token refreshes wait on them. A migration that
creates a policy is never "catalog-only" in R9's sense.

**And R9's own conditions do not hold either:**

1. **Condition 1 holds:** the SET LOCAL gate is on main (`SHAGATE`), and the file's first two
   statements are the gate's two lines. (A third `SET LOCAL` follows them since 2026-10-06, which
   the gate allows and does not yet require; see "G6".)
2. **Condition 2 does not hold.** `ALTER TABLE public.patients ADD COLUMN` takes ACCESS EXCLUSIVE on
   `patients`, which reception writes on every new patient and every edit; the foreign keys take
   SHARE ROW EXCLUSIVE on `appointments`, `patients`, `tenants` and `users`; `CREATE TRIGGER` takes
   SHARE ROW EXCLUSIVE on `patients`; and the two policies take the platform locks.
3. **Condition 3 does not hold:** this document has no earlier pre-check sitting.

**The clinic hours are a weekday table in Lisbon time (R29), and the table lives in this
document** because production holds one `opens_at` and `closes_at` pair per location and no
weekday dimension:

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
  (measured with a misspelt zone, `TZ=Europe/Lisbonn date +%Z`: BSD `date` on macOS prints `UTC`,
  GNU `date` on Linux prints `Europe`; neither prints `WET` or `WEST`). In summer UTC is an hour
  behind Lisbon, so Monday 08:30 would read 07:30, "closed". The zone's name in the same call is
  what refuses that, on either system. It then refuses a reading that is not five such digits, and
  decides `closed` or `open` by the table. **Every other clock read in every block (the run
  window's `YYYYMMDDHHMM`) reads the zone the same way and stops the same way.** A boundary minute
  belongs to the hour it starts: Friday 20:59 is open and Friday 21:00 is closed; Saturday 12:59 is
  open and Saturday 13:00 is closed; Sunday 15:00 is closed; Monday 07:59 is closed.
  `scripts/sat01-tables-0102.test.mjs` runs both stages whole at each of those six minutes, and
  the arm's own program at every boundary of every weekday.
- **Stage 1 also reads the clinics' own rows, READ ONLY, and uses them to check the table, not
  the clock.** A row cannot say "Saturday afternoon is closed", so it cannot decide the hour. What
  it can say is that the table is stale: stage 1 counts the active clinics whose own `opens_at` is
  before 08:00 or whose `closes_at` is after 21:00, the table's widest row, and STOPs unless that
  count is 0 of at least one active clinic. **A JUDGMENT, NOT A RULING** (0101's, kept).
- It prints R9's three proofs: proof 1 computed as 0100 computes it, proofs 2 and 3 fixed `no`.
  No arm here can turn either to `yes`.
- Inside clinic hours the block STOPs with nothing applied, whatever proof 1 reads. **There is no
  owner-override arm and no date in any arm.** An override would be a new amendment with its own
  R4 round (R8).

## G6: the locks, statement by statement, in each order this file has had (measured 2026-10-05; this file measured again 2026-10-06, gate G5 of S-1006-A)

Strategy's gate G6: "SAT-01 pg_locks rerun after the re-order. EXPECT: auth locks appear only at
the last two statements."

Strategy's gate G5 of S-1006-A, for the re-pin of 2026-10-06: "pg_locks rerun on the re-pinned 0102.
EXPECT: platform locks only in the final group. A stalled session is released by the new timeout."
**Both halves read PASS below, measured on these bytes.**

**How.** Each file's statements, run one at a time inside ONE transaction that was ROLLED BACK,
with node and the `postgres` package (never psql), reading this backend's relation locks from
`pg_locks` after every statement. Five files: the draft as committed at `83549461` (62 statements;
the policies at 23 and 24, `patients` at 3); the file the first review read, `4474ff84` (67
statements; the policies last, `patients` still at 3); the file the second review read, `1f3312a6`
(66 statements; the `patients` column at 61, the foreign keys still in the first `CREATE TABLE`);
the file the third review read, `ad44adc9` (74 statements; nothing locked before 61, one statement
per foreign key); and this file (70 statements; nothing locked before 62). The draft was read on the
throwaway at 127.0.0.1:54522 as it stood on 2026-10-02, a local Supabase stack BEHIND main (MAINTAIN
still granted, 26 SECURITY DEFINER functions, no journal, no patient rows), which does not matter
for which statement takes which lock. The next three were read on the lane `amber`
(127.0.0.1:54722), built from main's own mirror, 0000 to 0101, `supabase/postgres` 17.6. **This
file was read on 2026-10-06 on the lane `purple` (127.0.0.1:54522): a local Supabase stack at 0101,
`supabase/postgres` 17.6, 48 tables, 28 SECURITY DEFINER functions, 47 patients and 255
appointments (seed rows, no real name), with the platform's own services connected (PostgREST,
realtime, storage, pg_cron, pg_net) and no other client.** Every number below in a row or a sentence
about "this file" is from that day's runs. Every number about an earlier file is that file's record
and was not measured again.

**THIS FILE: every lock on a relation that existed before, at the statement it first appears. One
row per statement that takes one; a statement not listed takes none.**

| # | Statement | Locks new at this statement, on relations that existed before |
|---|---|---|
| 1, 2, 3 | the three `SET LOCAL` lines | none |
| 4 | `CREATE TABLE public.appointment_survey_sends` (no foreign key to an existing table) | **no table.** ROW EXCLUSIVE on the SEQUENCE `graphql.seq_schema_version`: the platform's GraphQL extension counts a schema change at the first DDL of any transaction. It blocks no read or write of any table, and no statement of this file can avoid it |
| 5 to 61 | two more tables, indexes, comments, RLS, grants, the nine functions (all plpgsql) | **none, in any mode** |
| **62** | **`ALTER TABLE public.patients ADD COLUMN survey_enabled ...`** | **ACCESS EXCLUSIVE on `public.patients`. THE FIRST LOCK ON AN EXISTING TABLE** |
| 63 | `COMMENT ON COLUMN public.patients.survey_enabled` | SHARE UPDATE EXCLUSIVE on `public.patients` (already held more strongly) |
| 64 | `GRANT UPDATE (survey_enabled) ON public.patients TO patient` | none |
| 65 | `CREATE TRIGGER patients_survey_switch_audit ON public.patients` | SHARE ROW EXCLUSIVE on `public.patients` (already held more strongly) |
| **66** | **`ALTER TABLE public.appointment_survey_sends ADD CONSTRAINT appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE, ADD CONSTRAINT appointment_survey_sends_tenant_id_fkey ... REFERENCES public.tenants(id), ADD CONSTRAINT appointment_survey_sends_sent_by_fkey ... REFERENCES public.users(id), ADD CONSTRAINT appointment_survey_sends_patient_id_fkey ... REFERENCES public.patients(id)`** | **SHARE ROW EXCLUSIVE on `public.appointments`, `public.tenants` and `public.users`, taken one after another in that order inside the statement** (the next table shows the order), with ROW SHARE and ACCESS SHARE on each; and ROW SHARE and ACCESS SHARE on `public.patients`, all weaker than what is held, so no wait is possible there. ACCESS SHARE on 28 indexes, which is every index of the four (12, 2, 4 and 10): the validations' own reads |
| 67 | `ALTER TABLE public.appointment_survey_codes ADD CONSTRAINT appointment_survey_codes_tenant_id_fkey ... REFERENCES public.tenants(id)` | none new |
| 68 | `ALTER TABLE public.appointment_survey_responses ADD CONSTRAINT appointment_survey_responses_appointment_id_fkey ..., ADD CONSTRAINT appointment_survey_responses_tenant_id_fkey ..., ADD CONSTRAINT appointment_survey_responses_patient_id_fkey ...` | none new |
| **69** | **`CREATE POLICY appointment_survey_sends_select`** | **ACCESS EXCLUSIVE on 23 platform tables:** `auth.users`, `auth.sessions`, `auth.refresh_tokens`, `auth.identities`, `auth.audit_log_entries`, `auth.flow_state`, `auth.instances`, `auth.mfa_amr_claims`, `auth.mfa_challenges`, `auth.mfa_factors`, `auth.oauth_clients`, `auth.one_time_tokens`, `auth.saml_providers`, `auth.saml_relay_states`, `auth.sso_domains`, `auth.sso_providers`, `realtime.messages`, `realtime.subscription`, `storage.buckets`, `storage.buckets_analytics`, `storage.objects`, `storage.s3_multipart_uploads`, `storage.s3_multipart_uploads_parts` |
| **70** | **`CREATE POLICY appointment_survey_responses_select`** | none new (the 23 are held) |

Inside the transaction the three settings read `lock_timeout` `5s`, `statement_timeout` `1min` and
`idle_in_transaction_session_timeout` `15s`. After the ROLLBACK nothing of 0102 existed.

**The order is confirmed a second way, by making each lock unobtainable in turn.** With another
session holding the lock named, the body failed after 5.0 seconds with `55P03 canceling statement
due to lock timeout`, at the statement shown, and nothing of 0102 existed afterwards (five runs).
**Since the fold, three of the five fail at the same statement, 66, so the statement number no
longer says which lock it was. `pg_locks` does:** a third session read the migration's strong
locks 2.5 seconds into each wait. (An "open WRITE" here is `LOCK TABLE ... IN ROW EXCLUSIVE MODE`
held in an open transaction: the lock a write takes, with no row written.)

| Another session holds | The body fails at | 2.5 s into the wait, the migration holds, and waits for |
|---|---|---|
| an open READ of `patients` | statement 62, after 5.01 s | holds nothing on an existing table; waits for ACCESS EXCLUSIVE on `patients` |
| an open WRITE to `appointments` | statement 66, after 5.00 s | holds `patients`; waits for SHARE ROW EXCLUSIVE on `appointments`; has asked for nothing on `tenants` or `users` yet |
| an open WRITE to `tenants` | statement 66, after 5.00 s | holds `patients` and `appointments`; waits for `tenants`; has asked for nothing on `users` yet |
| an open WRITE to `users` | statement 66, after 5.00 s | holds `patients`, `appointments` and `tenants`; waits for `users` |
| an open READ of `auth.users` | statement 69, after 5.01 s | holds all four; waits for ACCESS EXCLUSIVE on `auth.users` |

**So inside statement 66 Postgres takes the three locks one after another, in the order of the
statement's clauses: `appointments`, then `tenants`, then `users`.** The documented order is kept
in full by the fold, and the file's own comment (its section 7) says so.

**THE WINDOW: from the first lock on an existing table to the COMMIT.**

| | Statements | Round trips from the applier | Measured |
|---|---|---|---|
| the whole transaction | 70 | 73 (BEGIN, 70 statements, the journal row, COMMIT) | 57.0 ms, 34.8 ms and 34.4 ms (three real applies on the lane `purple`, COMMIT included, 0102 taken off again between them; the first of the three was the slowest). The third review's file: 58.9 ms and 60.4 ms for its 77 round trips, on the lane `amber` |
| **from statement 62, sent, to the COMMIT, answered: every lock on an existing table** | **9 of 70** (62 to 70) | **11** (9 statements, the journal row, COMMIT), so 10 moments between two round trips at which the applier holds the locks and the server waits for it | **14.2 ms, 8.8 ms and 8.2 ms** on the same three applies; 15.3 ms in the rolled-back run that also reads `pg_locks` after every statement |
| from statement 69: the platform's tables | 2 of 70 | 4 (69, 70, the journal row, COMMIT) | 3.8 ms, 2.3 ms and 2.2 ms |

**THE COUNTS, in each order this file has had.**

| Order | Statements | First lock of ANY mode on an existing table | Platform locks (`auth`, `storage`, `realtime`) | ACCESS EXCLUSIVE on `patients` (reads AND writes wait) | SHARE ROW EXCLUSIVE on `appointments`, `tenants`, `users` (writes wait) |
|---|---|---|---|---|---|
| the draft, `83549461` | 62 | statement 3 | from 23: **40 of 62** (38.9 ms of 91.6) | from 3: 60 of 62 | from 6: 57 of 62 |
| the first review's file, `4474ff84` | 67 | statement 3 | from 66: 2 of 67 | from 3: **65 of 67** (99.7 ms of 103.1) | from 6: 62 of 67 |
| the second review's file, `1f3312a6` | 66 | statement 3 | from 65: 2 of 66 (2.3 ms of 81.9) | from 61: 6 of 66 (7.5 ms of 81.9) | **from 3: 64 of 66** (79.4 ms of 81.9), with `patients` among them, then upgraded at 61 |
| the third review's file, `ad44adc9` | 74 | statement 61 | from 73: 2 of 74 | from 61: 14 of 74 (13.1 to 19.4 ms) | from 65, 67, 70: 10, 8 and 5 of 74 |
| **this file** | **70** | **statement 62** | from 69: **2 of 70** | from 62: **9 of 70** (8.2 to 14.2 ms) | from 66, all three: **5 of 70** |

- **THE VERDICT OF G6 IS PASS, AND SO IS THE FIRST HALF OF G5, measured again on the re-pinned
  file: `auth`, `storage` and `realtime` locks appear only at the last two statements,** 69 and
  70, and at no earlier one: 0 of 68. (In the third review's file: 73 and 74, 0 of 72.)
- **No statement before 62 takes a lock of any mode on any table that existed before.** The one
  relation touched earlier is the sequence of row 4.
- **What it cost, said plainly:** `patients` is held ACCESS EXCLUSIVE for 9 statements where the
  second review's file held it for 6 (and the third review's for 14, before the fold), because the
  foreign keys stand after the column and not before it. Why that order, and not the other, is the
  next section.
- **The 23 are the tables the platform setting `supautils.policy_grants` names for `postgres`,**
  less one that does not exist on the local stack (`storage.prefixes`): 24 named, 23 locked, none
  locked that the setting does not name. That is why R39's pre-check read prints, per role, the
  count of tables and whether `auth.users` is one. **The setting was not read on production**; the
  pre-check's INFO row is the first read of it there.

**WHAT WAS MOVED, AND WHAT COULD NOT BE (the second review's finding 1).**

- **The eight foreign keys to `tenants`, `appointments`, `patients` and `users` left the three
  `CREATE TABLE` statements.** A `REFERENCES` clause takes SHARE ROW EXCLUSIVE on the table it
  names. They are added by `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` at statements 66 to
  68, three statements, one per new table (eight statements, 65 to 72, until the re-pin of
  2026-10-06). **The names are the ones the inline form gives:**
  `appointment_survey_sends_appointment_id_fkey`, `appointment_survey_sends_tenant_id_fkey`,
  `appointment_survey_sends_sent_by_fkey`, `appointment_survey_sends_patient_id_fkey`,
  `appointment_survey_codes_tenant_id_fkey`, `appointment_survey_responses_appointment_id_fkey`,
  `appointment_survey_responses_tenant_id_fkey`, `appointment_survey_responses_patient_id_fkey`.
  **The definitions are the same too, proved by a pin that did not move:** post-check verdict 3's
  per-table constraint literal (a count and one md5 over every `pg_get_constraintdef`) is the
  literal read when they were inline, `... 5 b6cb26b5...`, `... 14 e2bc43fe...`, `... 10
  1f14d0db...`, and the catalogue still matches it. **It did not move at the fold either:** the
  post-check, run under psql on 2026-10-06 with this file applied, read the same three literals
  (27 OK; "Rehearsal"). Verdict 3 now also reads each of the ten
  foreign keys by NAME and definition, validated and not deferrable. The three tables are empty,
  so validating a foreign key reads no row. The two foreign keys to `appointment_survey_sends`,
  a table of this file, stay inline.
- **The read door, `resolve_survey_code`, is plpgsql now; it was SQL-language.** Measured with the
  foreign keys already moved: its `CREATE FUNCTION` took ACCESS SHARE on `public.patients` and
  `public.appointments` at statement 38 and held it to the COMMIT, because a SQL-language body is
  planned when the function is created. ACCESS SHARE blocks no read and no write, but it was a
  lock on an existing table 23 statements early. The query is the same, character for character,
  inside `BEGIN RETURN QUERY ... END`; every column in it is written with its table's alias, so
  none can be read as an output column. All nine functions are plpgsql, and post-check verdict 6
  and the script test require it. The DB-gated suite's arms for this door pass unchanged, and
  the sweep re-ran every conjunct of the query (below).
- **Nothing else locked an existing table early:** no index, trigger, comment or grant on one
  stands before statement 62 (the script test refuses each). The comment, the grant and the
  trigger on `patients` were already after the column.
- **What cannot be moved:** the sequence of row 4.

**THE ORDER INSIDE THE GROUP: `patients` FIRST, AND WHY (measured both ways).**

The lead's dispatch asked for the foreign keys immediately before the `patients` column. They
stand immediately AFTER it, and that is a deliberate departure, for one measured reason. Two
application-shaped transactions were run against each order on the lane, the migration always
rolled back (on 2026-10-05, on the third review's file, one foreign key per statement; the
right-hand column was run again on this file on 2026-10-06, under the table):

| The application's transaction | Foreign keys first, then the column | **The column first, then the foreign keys (this file)** |
|---|---|---|
| **has READ `patients`, then WRITES `appointments`** (a booking, a status change, a job step: the usual shape) | **ENDED: `40P01 deadlock detected` after 1.0 s.** Its write waits for the migration's SHARE ROW EXCLUSIVE; the migration's ALTER TABLE then waits for its read lock. The migration went on | **untouched.** The migration's ALTER TABLE waits for it while holding no lock on any existing table; its write to `appointments`, and a write to `patients` itself, were done at once; it committed; the migration went on to its last statement |
| has WRITTEN `appointments`, has not yet touched `patients`, then reads `patients` | untouched: the migration waits for it at its first foreign key, holding nothing it needs | **ENDED: `40P01 deadlock detected` after 1.0 s.** It waits for `patients`; the migration's foreign key then waits for its write lock. The migration went on. (When the migration is the one already waiting, the MIGRATION is ended instead: "WHAT WAITS, AND WHAT CAN FAIL", below) |
| holds nothing and arrives during the group | waits | **waits, and is answered when the migration ends:** a read of `patients` after 317 ms in the arm that held the migration open for 300 ms, and a write to `appointments` likewise. Nothing fails |

**The right-hand column, run again on this file** (2026-10-06, the lane `purple`, the migration
rolled back each time; the application's writes are `LOCK TABLE ... IN ROW EXCLUSIVE MODE`, the
lock a write takes, and no row was written). The transaction that had READ `patients` was
untouched: its write to `appointments` and its write to `patients` were answered at once while the
migration waited at statement 62, it committed, and the migration then ran to its last statement
(statement 62 was answered after 0.47 s, the length of the application's transaction). The
transaction that had WRITTEN `appointments` and then read `patients` was ENDED, `40P01 deadlock
detected` after 1.01 s, and the migration went on. Two newcomers that arrived after the last
statement, with the migration held open for 300 ms, waited and were answered after 0.30 s each (a
read of `patients`, a write to `appointments`). The left-hand column, foreign keys first, is not
this file's order and was not run again.

Some transaction can meet the migration in a deadlock under any order, because the group must
take four locks and Postgres takes them one at a time. **The fold did not change that:** inside
statement 66 the three are still taken one after another (measured, above). **With the column first the transaction
that can is the rarer shape** (a write to `appointments`, `tenants` or `users` that comes BEFORE the transaction's first
touch of `patients`), and the strongest lock is requested while nothing else is held, so every
transaction that already reads `patients` is simply waited for. After `patients` the order is
`appointments`, then `tenants`, then `users`: the most-written table first, so the fewest locks
are held while waiting for it. **If strategy prefers the other order, it is a re-ordering of four
statements and a re-pin; nothing else changes.** A JUDGMENT, NOT A RULING (21).

**WHAT WAITS, AND WHAT CAN FAIL, SAID PLAINLY (the reviews' findings 4 and 1).**

- **From statement 62 to the COMMIT, ACCESS EXCLUSIVE on `patients` stops every READ of
  `patients` as well as every write:** the agenda's joins, the patient list and file, the
  reminder and confirmation jobs, the public booking page's patient match, and the patient token
  hook of 0010, which reads `patients` when a portal token is issued or refreshed.
- **From statement 66, SHARE ROW EXCLUSIVE stops writes, not reads,** on `appointments`,
  `tenants` and `users`.
- **A transaction that arrives during the group and holds nothing WAITS and does not fail**
  (measured, the table above).
- **A TRANSACTION THAT ALREADY HOLDS A LOCK CAN MEET THE MIGRATION IN A DEADLOCK, AND POSTGRES
  ENDS ONE OF THE TWO: THE APPLICATION'S TRANSACTION OR THE MIGRATION.** "They do not fail; they
  wait", which this document said, was false for that shape. In this file the shape is: the
  transaction has written `appointments`, `tenants` or `users` before the migration asks for that
  table (inside statement 66, which asks for the three in turn; the write may come after statement
  62 was answered, it need only come before that request), it has not yet touched `patients`, and it touches `patients` (a
  read is enough) before the COMMIT. **Which of the two is ended depends on which began to wait
  first.** Each waiter runs ONE deadlock check, `deadlock_timeout` (1 s on the lane) after it
  begins to wait, and the one whose check finds the cycle ends itself. Measured again on this file
  on 2026-10-06, four runs, the migration rolled back in each (the application held ROW EXCLUSIVE
  on `appointments`; its touch of `patients` was a read):

  | The order of the two waits | Ended | What is seen |
  |---|---|---|
  | the application touches `patients` and waits; the migration then reaches statement 66 and waits, within a second (0.3 s later) | **the APPLICATION's transaction:** `40P01 deadlock detected` after 1.01 s | its own work is rolled back and the application shows an error or retries; the migration goes on (statement 66 was answered 0.71 s after it was sent) |
  | the migration is ALREADY waiting at statement 66 when the application first touches `patients`, within a second (0.3 s later) | **the MIGRATION:** `40P01 deadlock detected`, 1.01 s after statement 66 was sent; nothing is applied; the application's read was answered | a clean failure of the apply |
  | the migration has waited more than a second (its one check is spent), then the application touches `patients` (measured at 1.5 s) | **the APPLICATION's transaction:** `40P01` 1.01 s after its read was sent | the migration's statement 66 was answered after 2.52 s and it went on |
  | the migration has waited 4.5 s when the application touches `patients` | **the MIGRATION:** `55P03 canceling statement due to lock timeout` at 5.01 s; the application's read was answered 0.51 s after it was sent | a clean failure of the apply |

  **When the migration is the one ended, GREEN does not see the word deadlock.** The transcript
  reads as it does for a fired `lock_timeout` (stage 1, "If stage 1 ended non-zero": the apply
  exits 4, drizzle-kit prints `undefined`, the journal reads `99 -> 99`, no applied marker); the
  SQLSTATE is only in the server's log. Nothing is applied, it is a halt, and the lead rules. (A
  deadlock that ends the apply was measured with node on the lane; it was not run through
  `verified-migrate.mjs`, and is still NOT REHEARSED. The program's transcript for a failed
  statement is 0101's rehearsal's and, since 2026-10-06, 0102's own on these bytes, for a lock
  wait that ran out and for a session the server ended while idle: "The rehearsal, 2026-10-06",
  3b and 3a.)
  **The window in which a transaction can enter that shape is the group: 9 statements, 8 to 14
  ms on the lane, longer on production by 10 network round trips (14 statements and 15 round trips
  until the fold).** One statement that does both
  in that order is inside the shape for microseconds: an INSERT into `appointments` takes its
  table lock first and reads `patients` for the foreign key a moment later. **The sitting is in
  closed hours only (section 4), which is what keeps the window empty of bookings; nothing in the
  SQL can.** The background jobs (reminders, the follow-up, the token hook) are not stopped for
  the sitting and are the transactions most likely to be running.
- **`lock_timeout` bounds each WAIT for a lock; `statement_timeout` bounds each STATEMENT. Neither
  bounds how long a lock is HELD, and neither covers the time BETWEEN two statements. The third
  line, `idle_in_transaction_session_timeout` at 15 s, covers that time since 2026-10-06 (below).**

  | | Measured on the lane (nobody else connected) | The server-side waits, added up from the two bounds. **NOT A BOUND ON THE HOLD** |
  |---|---|---|
  | reads and writes of `patients` (statement 62 to the COMMIT) | 8.2 to 14.2 ms | about 80 seconds: up to 5 s queued behind this transaction while it waits for `patients` at 62 (a waiting ACCESS EXCLUSIVE request holds new readers behind it); then held through up to 5 s at each of statement 66's three lock waits (`lock_timeout` bounds each wait, not the statement), and through statement 69, whose 23 lock waits are each bounded at 5 s and together by `statement_timeout` at 60 s |
  | writes to `appointments` (statement 66 to the COMMIT) | not read separately on this file: it is inside the figure above (9.6 to 16.4 ms on the third review's file) | about 75 seconds, the same sum from 66 on |

  **This document called the earlier figure a "computed worst case". It is not one.** It adds up
  only the time the SERVER spends waiting. From statement 62 on there are 10 moments at which the
  server has answered and waits for the applier's next round trip, holding every lock taken so
  far. If the applier stalls there (the apply machine sleeps, its network drops, the pooler holds
  the connection), the locks are held until the server notices the connection is gone, which
  TCP keepalive may take minutes to do, unless the server ends the idle session first. **Since the
  re-pin of 2026-10-06 it does: the file's third statement is `SET LOCAL
  idle_in_transaction_session_timeout = '15s'`,** strategy's ruling (S-1006-A, Q5:
  "idle_in_transaction_session_timeout 15 s: yes, with its gate change"). Until then the migration
  did not set it, and this section put the question to strategy; the proposal is kept below with
  its answer.

  **THE STALLED APPLIER, MEASURED ON THIS FILE (the second half of G5), 2026-10-06, the lane
  `purple`, node and the `postgres` package.** One session opened a transaction and ran this file's
  statements 1 to 62, one round trip each: the three `SET LOCAL` lines among them, and statement
  62, which takes ACCESS EXCLUSIVE on `patients`. Then it sent nothing. A second session sent a
  read of `patients` at that moment. A third polled `pg_stat_activity` and `pg_locks` every 0.25 s,
  and never sat idle in a transaction itself.

  | What was read | Measured |
  |---|---|
  | the stalled session, while it lasted | `idle in transaction`, holding ACCESS EXCLUSIVE on `patients`, at every poll up to 14.95 s |
  | the server ended it | **15.00 s after it went idle:** statement 62 was answered at 13:38:36.770 UTC, and the server's own log reads `13:38:51.769 UTC ... FATAL:  terminating connection due to idle-in-transaction timeout`. The applier's own client saw its connection closed at 15.01 s |
  | its lock in `pg_locks` | **gone:** at the first poll after that (15.21 s) the session was not in `pg_stat_activity` and held no lock on `patients` |
  | the other session's read of `patients` | answered after 15.01 s (47 rows counted): it waited as long as the stall was allowed to last, and no longer |
  | what was left of 0102 | nothing: the server rolled the transaction back (no survey relation, no `survey_enabled` column, no survey function) |

  **The same end was read twice more that day:** under psql 18.6, with the three `SET LOCAL` lines
  and a plain `LOCK TABLE public.patients IN ACCESS EXCLUSIVE MODE` in place of statement 62 (psql
  printed `FATAL:  terminating connection due to idle-in-transaction timeout`, and an observer
  polling every 2 s saw the session at 13.1 s and not at 15.1 s); and in a first run of the harness
  above whose client crashed on the closed socket (the server's log: 15.00 s after the stall began).

  **What it does not show, and what it costs.** `SET LOCAL` holds only inside a transaction: it is
  drizzle's one transaction that carries the third line, as it carries the other two, and this
  measurement did not run the line through drizzle-kit or `verified-migrate.mjs`. **The rehearsal
  of 2026-10-06 did, and read it by its effect:** with stage 1 run whole and the client paused, the
  server ended drizzle-kit's session 15.000 s after it went idle inside the transaction, on a
  database whose own value is `0` ("The rehearsal, 2026-10-06", 3a). A client that stays stalled
  past those 15 s is still NOT REHEARSED. The timer runs
  whenever the session is inside the transaction and idle, so ONE gap between two statements longer
  than 15 seconds (a slow round trip from the apply machine, a pause of drizzle-kit) ends a healthy
  apply: a clean failure and a new sitting, never a half apply. The gaps measured locally are under
  a millisecond; production's are not measured.

  **The earlier measurement, kept as a record** (2026-10-05, the lane `amber`, the third review's
  file, the applier stalled after its statement 61, the value set by hand):

  | `idle_in_transaction_session_timeout` | A read of `patients` by another session |
  |---|---|
  | `0`, the lane's value (no limit) | still waiting after 4.0 s, for as long as the applier stalled |
  | `2s`, set by hand in that one transaction (NOT by the migration) | answered after 2.0 s: the server ended the stalled session and rolled its transaction back; nothing of 0102 existed |

  **What production's own value is, is not known here, and it no longer decides this:** the third
  line sets 15 s inside the apply's transaction whatever the database's value is. The pre-check
  still prints the database's value as an INFO row
  (`INFO idle_in_transaction_session_timeout (0 is no limit)`), a name and a value, never a
  verdict. An apply the server ends this way is a halt like any other: GREEN reports the exit code
  and the output as they stand, and the lead rules. **An apply that does not return is still a
  halt:** GREEN pastes nothing more, reports it as it stands, and the lead rules. The server has
  ended the session and released its locks after 15 s, whatever the client still shows.
- **A wait that runs out is a clean failure, measured** (the five runs above): `55P03` after 5.0
  seconds, and nothing of 0102 existed afterwards.
- **THE FOLD, DONE ON 2026-10-06** (strategy, S-1006-A, Q5: "Fold the eight foreign keys: yes,
  same re-pin"). The eight foreign keys are three statements, one `ALTER TABLE` per new table with
  several `ADD CONSTRAINT` clauses, which makes the group 9 statements and 11 round trips where it
  was 14 and 16. **What it gave up, said plainly:** each lock no longer has its own statement. A
  wait that runs out on `appointments`, `tenants` or `users` now fails at the same statement, 66;
  which of the three it was is in `pg_locks` while it waits and in the server's log, not in the
  statement number. Until the re-pin this was judgment 24 (one statement each).
- **Not measured on production.**

**A QUESTION FOR STRATEGY, ANSWERED ON 2026-10-06: a third bound, `SET LOCAL
idle_in_transaction_session_timeout`.** Strategy's dispatch S-1006-A, Q5, its words:
"idle_in_transaction_session_timeout 15 s: yes, with its gate change. Fold the eight foreign keys:
yes, same re-pin." So this file opens with the third line, at 15 s. **The gate change is not this
branch's:** requiring the line of every migration is an edit to the gate-frozen
`scripts/migration-timeouts.test.mjs` and its own GATE-CHANGE pull request. The proposal is kept
below as the record of what was asked.

| | |
|---|---|
| The proposal | every migration from the next one on opens with a third line, `SET LOCAL idle_in_transaction_session_timeout = '<N>s';`, after the two it has |
| What it buys | a stalled applier releases every lock after N seconds, as a clean failure: the server ends the session, the transaction rolls back, nothing is applied (measured above with N = 2). Today the hold of an applier that stalls between two statements has no server-side bound unless production's own setting gives one |
| What it costs | a slow round trip kills a healthy apply. The timer runs whenever the session is inside the transaction and idle, so N must be well above the slowest gap between two statements: the network round trip from the apply machine, and any pause of drizzle-kit between statements. A kill is a clean failure and a new sitting, never a half apply |
| A value | The proposal's was N = 30 (30 times a slow round trip and still under the 60 s `statement_timeout`). **Strategy ruled 15.** With it the sum above becomes a real bound: about 80 s plus 10 gaps of at most 15 s each in the worst case, and in practice the first stall ends the apply |
| The gate | **MEASURED on `scripts/migration-timeouts.test.mjs` at `SHAGATE`: it needs a GATE-CHANGE only to REQUIRE the line, not to allow it.** Its rule (`timeoutProblems`) requires statements 1 and 2 exactly, refuses a later statement that names `lock_timeout` or `statement_timeout`, and refuses `RESET ALL`, `DISCARD` and transaction control. It reads no other setting. Run here, the gate's own function on a copy of this file with the third line added as statement 3: no problem reported (the control, a third line that names `lock_timeout`: refused). So a third `SET LOCAL idle_in_transaction_session_timeout` passes the frozen gate today; making it mandatory, or pinning its value, is an edit to that gate-frozen file and its own GATE-CHANGE pull request. **Read again on 2026-10-06 with the line really in the file:** `node --test scripts/migration-timeouts.test.mjs` passes, the pending file in scope with no problem, and the gate file is unchanged at `SHAGATE` |
| What it needed in 0102 | one line after statement 2, and the re-pin of 2026-10-06. This file's own script test, which refused the line until it was ruled, now requires it: statement 3, exactly, at 15 s, and named by no later statement |

## THE ORDER OF PULL REQUESTS

Strategy's ruling R35: no gate edit inside a sitting. Each gate edit is its own GATE-CHANGE pull
request, merged by the owner on green: the ones a promotion needs merge before the promotion; a
post-apply count edit merges after the applier reports. The exact order goes into the apply
document. This is it.

**No gate-frozen file is edited on this branch.** `GATE_BASE_REF=main node
scripts/assert-gates-unchanged.mjs` passes on it.

| Order | Pull request | What it carries | Who merges |
|---|---|---|---|
| 0 | **DONE:** 0101's three (its own document): its GATE-CHANGE #1537, its PR #1538 merged at `a0e96a99`, its sitting of 2026-10-05 | 0101 on main and on production | done |
| 1 | **DONE: merged 2026-10-06 as #1544 (`129860b3`).** GATE-CHANGE, before the promotion: the cleanup test learns the three tables (measured, see below; the shape of #1436) | `scripts/import/cleanup-test-patients.test.mjs`: `appointment_survey_responses`, `appointment_survey_codes` and `appointment_survey_sends` enter `DELETE_ORDER`, before `appointments`, and `AHEAD_OF_MIGRATION`; and `.github/gate-manifest.json`, regenerated. Nothing else | the owner, on green |
| 2 | this branch, `db/0102-sat01-tables`, promoted, `held-for-apply`, **NOT merged yet** | the migration, this document and its sidecar, the two check files, the DB-gated suite, the script test, the pending README, the spec amendment, and THREE ordinary edits the frozen tests force: the denied list of `packages/db/tests/security-definer-execute-acl.db.test.ts` gains `purge_expired_survey_comments` and `patients_survey_switch_audit`; `scripts/import/cleanup-test-patients.sql` gains the three deletes; `packages/db/src/schema.ts` declares the three tables. **No gate file.** From this commit the PR is red on the count, in two required checks | nobody yet |
| 3 | **the sitting** | GREEN applies from this PR's HELD head. No pull request, and no gate edit | - |
| 4 | **GATE-CHANGE, after GREEN reports: the SECURITY DEFINER count** | `packages/db/scripts/check-security-definer-owner.mjs`: `EXPECTED_COUNT` **28 to 36**, with its comment block; and `.github/gate-manifest.json`, regenerated. Nothing else | the owner, by hand. Its own run reads the count red the other way round, by construction, as #1500 and #1503 did |
| 4b | **GATE-CHANGE, after GREEN reports: the cleanup test's allowance comes out** (the shape of #1447) | `scripts/import/cleanup-test-patients.test.mjs`: the three names leave `AHEAD_OF_MIGRATION`, and the floor of patient-rooted tables moves 21 to 24; the manifest. R35 says each gate edit is its own pull request, so it is listed apart from row 4; #1447 carried two gate files in one, and the lead may rule the same here. It is green only once the promoted migration is on main, so it merges after row 6 | the owner, on green |
| 5 | `main` merged into this PR (no rebase) | every check runs again, green; CI's `db-tests` applies 0102 and runs the DB-gated suite for the first time | SOLO pushes the merge |
| 6 | this PR merges | - | the owner: `held-for-apply` off, then merge |
| 7 | the application pull requests of the spec's section 10 | templates, job, page, button, list, flag (R33), the staff switch | SOLO, R4 PASS plus green |
| 8 | **GATE-CHANGE, after this PR has merged (row 6): the timeout gate requires the third line** (strategy, S-1006-A, Q5: "yes, with its gate change") | `scripts/migration-timeouts.test.mjs`: every migration from this one on must open with the three `SET LOCAL` lines, the third at 15 s; `.github/gate-manifest.json`, regenerated. **It moves a pinned byte:** this document's blocks and line pin that file's sha256 as `SHAGATE`, and so do `scripts/sat01-tables-0102.test.mjs` and the frozen `scripts/guest-request-email-0101.test.mjs`, so the same pull request carries those re-pins. It lands AFTER the sitting and the merge on purpose: nothing a sitting reads changes under it | the owner, by hand |

**Every gate file this migration forces to change, and where each lands:**

| Gate file | Frozen? | The change | Its pull request | When |
|---|---|---|---|---|
| `packages/db/scripts/check-security-definer-owner.mjs` | yes (manifest) | `EXPECTED_COUNT` 28 to 36: the six doors and the purge of the draft, plus R34's trigger function. Measured on the build lane's stack with 0102 applied: `expected exactly 28 SECURITY DEFINER function(s) in public, found 36` | its own GATE-CHANGE, row 4 | **after the apply**, when GREEN has reported |
| `packages/db/tests/security-definer-execute-acl.db.test.ts` | **no** (not under any glob of the manifest) | the list of SECURITY DEFINER functions `authenticated` may not execute gains two names. Measured: the whole `packages/db` suite on the applied stack fails that one arm and nothing else | none of its own: it rides in the promotion commit, row 2, because it is true only on a database that holds 0102 | at the promotion |
| `.github/scripts/assert-rls-executed.mjs`, the list of permitted skips | yes | **no change.** The draft's suite was `describe.skip` while pending, which that gate reddens; the suite now registers only the arm that applies (0101's shape) and skips nothing on either side, so it needs no entry | - | - |
| `scripts/import/cleanup-test-patients.test.mjs` | yes (manifest) | **MEASURED, 2026-10-05.** It derives every table with a foreign-key path to `patients` from `packages/db/migrations` and requires each in its `DELETE_ORDER`, with a `delete from` in the script and a name in `schema.ts`. The promotion adds three. On the simulated promotion: `appointment_survey_sends has an FK path to patients but the script never deletes from it`. Before: `DELETE_ORDER` and `AHEAD_OF_MIGRATION` gain the three. After: the allowance out, the floor 21 to 24 | two GATE-CHANGEs of its own, rows 1 and 4b | row 1 before the promotion; row 4b after the merge |
| `scripts/import/cleanup-test-patients.sql`, `packages/db/src/schema.ts` | **no** | the three deletes; the three table declarations. Measured on the simulated promotion with row 1's edit in place: without the deletes, `appointment_survey_sends is in DELETE_ORDER but the script has no delete from it`; with them and without `schema.ts`, `appointment_survey_responses is deleted but is not in schema.ts` | none of their own: the promotion commit, row 2 | at the promotion |
| a frozen script test that reads the live journal's newest entry | yes | **no change, measured.** On the simulated promotion `pnpm test:scripts` read 1421 of 1422, and the one failure was the cleanup test above. 0100's test (cut at its own entry by #1537), 0101's (cut at its predecessor's) and this document's own (the same) all passed with `idx 99` appended | - | - |
| `scripts/migration-timeouts.test.mjs`, `scripts/owner-blocks-survive-zsh.test.mjs`, `scripts/check-journal.mjs` | yes | **no change on this branch** (the first of the three is edited later, by row 8's own GATE-CHANGE, to require the third line). The first reads the promoted file in scope and passing (its first two statements are the SET LOCAL lines); the second reads every `docs/migration-apply-*.md` by listing the folder; the third reconciles 100 files with 100 entries | - | - |
| `scripts/sat01-tables-0102.test.mjs` | not yet | a NEW file, which the freeze allows; it is frozen from the next manifest regeneration on, and any edit to it after that is a GATE-CHANGE of its own | row 2 | at the promotion |

**Why the apply comes before the merge, and before the count's GATE-CHANGE.** `EXPECTED_COUNT` is
read by two required checks: the DB-gated job's count step, which runs before every suite, and the
unit run's `packages/db/tests/security-definer-owner.test.ts`, which derives the definer set from
`packages/db/migrations`. **Measured on the simulated promotion, and corrected after the review:**
with the count still 28, `packages/db/tests/security-definer-owner.test.ts` fails 7 of its 28 arms,
and all seven are the count. **With the count set to 36, its post-apply value, it reads 28 of 28:
zero failing arms.** (The file the first review read failed 8 arms at 28, and this document called
all eight "the count". One was not: the private helper carried an owner pin, which the pairing rule
refuses on a function that is not SECURITY DEFINER, and that arm stayed red at 36. Reproduced here
on the reviewed bytes, 1 failed of 28, then fixed in the SQL: see "The review of 2026-10-05".) On a
database with 0102 the count step prints `expected exactly 28 SECURITY DEFINER function(s) in
public, found 36`, and with the count at 36, `OK: all 36 owned by postgres`. A frozen gate cannot ride with a migration, so whichever of the two lands
alone reddens both checks until the other lands. The order is 0096's and 0097's
(`docs/migration-apply-0097.md`, "The SECURITY DEFINER count"), which R35 restates: promote, apply
from the held head, the count's GATE-CHANGE, main into the PR, merge. `main` reads red on the
count from row 4 to row 6, one CI run. The other two orders are refused: this PR first would merge
a migration past a red required check whose job never ran a suite on the promoted head, and the
GATE-CHANGE before the apply would be a gate edit ahead of the write it describes.

**That is why this document's blocks read the HELD head and 0101's read main.** 0101 creates no
function, so its PR could merge green before its apply, and its final document says so in one
paragraph ("Merge first, then the sitting from the merge commit, as with 0100"). **0102's order is
the other one, and it is the one strategy's own line describes:** "Any held-for-apply PR waits for
the owner's label removal after GREEN reports" (S-1004-A, quoted in 0101's document, which could
not follow it because its blocks name `origin/main`). Here the label comes off at row 6, after
GREEN's report and after row 4. **Every block of this document names
`origin/db/0102-sat01-tables` and none names `origin/main`** (a static rule of the script test, and
a whole-block run: see "The HEAD CHECK"). Everything else in the blocks is 0101's, line for line:
the four blocks of 0101's FINAL document on main are byte for byte the four this document's were
made from (compared on 2026-10-05; its round-3 fix, the post-check's own psql STOP saying the state
is UNKNOWN, was already in them).

## Applied from the held head, before the merge, and why that is safe here

**The PR carries no app code.** It carries the migration (promoted, with its journal entry and its
mirror), this document and its sidecar, the two check files, the DB-gated suite, a script test, the
pending README, the spec amendment, and the promotion's three ordinary edits: one test list, the
cleanup script's three deletes, and the three table declarations in `schema.ts` (types; nothing
queries them). Nothing in the application reads the new tables, the new column or the new
functions, so the application behaves the same before and after the apply.

**What can exist from the COMMIT on, before any application code ships (a precision the second
review asked for):**

- **A send row can exist from the COMMIT,** not only once the application sends: a member of staff
  whom S4 lets send to a patient can call `issue_survey_manual` directly with their own session.
  The row carries their name and a `survey.sent` audit row (section 3).
- **An answer cannot exist until the page ships.** The three page doors answer only the server's
  own session, and only the application's server makes one.
- **The switch can be changed from the COMMIT** by anyone the `patients` policies already let
  update the row (staff by a direct call, a patient with a portal session), and each change
  writes its audit row.
- **A send alone breaks nothing reception does today.** It cascades with its appointment's hard
  delete, and it does not stop a soft delete, an edit or a merge. One path of the SETTINGS tier
  changes, and only after a merge: the hard delete of a merged-away patient that still carries a
  send is refused by the database (23503) and the screen shows the generic error, where today it
  deletes. That is the spec's owed item A4, and it needs a direct call and a merge to arise
  before the application ships.

**Between the apply and the merge, production is ahead of main by exactly one migration.** The
daily `prod-drift-check` would report a journal row with no matching file on main in that window;
that report is correct, and it ends at row 6 of the order table. **`schema.ts` in this order:**
the three TABLES are declared in the promotion commit, because the frozen cleanup test requires it
(order table); nothing queries them, and the commit reaches main only at row 6, after the apply.
The `patients.survey_enabled` COLUMN is the one that matters: drizzle's `insert` names every
column of the table it was given, so a `schema.ts` that declares it makes every patient INSERT
name it (0101's lesson, measured there). **The promotion commit does not declare it** (NOT READY
step 3 names the three tables only). A declaration of it is safe on this pull request for the same
reason, the merge follows the apply; it must never reach main before production holds 0102, and
the held label is what guarantees that.

**The trigger is the one thing that acts on an existing table from the apply on.** It fires on an
UPDATE of `patients` only when `survey_enabled` changes, and no application code changes it yet
(a direct call can, above): every existing UPDATE of a patient evaluates one boolean comparison more and
writes nothing more. Measured: the whole `packages/db` suite on the applied stack, 1537 of 1538,
the one failure being the list of row 2.

**Exactly one `packages/db/migrations/0102_*.sql` may exist; if anything else is ever found under
`0102_`, STOP.** The number is the apply authorisation (S-1004-A R41; the `CLAUDE.md` table still
reads "0101 onward SAT-01" and "0102 the episode-policy item" until the docs pull request that
records R41, which is not this one).

## The HEAD CHECK, and running from the held head

No block reads `main`, and there is no separate HEAD CHECK to paste: the machine runs it inside
every block.

- **Two shas are compared only as checked variables.** Every sha a block compares (the recorded
  sha, the held head, the worktree's HEAD, the sha in the run window record, stage 2's pass mark)
  is first read into a variable and refused unless it is 40 hex characters. An inline
  `[ "$(git rev-parse HEAD)" = "${REC}" ]` is true when both sides are empty, which is a record
  that reads empty and a git that fails; no block compares that way. A sha256 that decides
  something (`SHAGATE`) is refused unless it is 64 hex characters.
- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean, removes the
  previous sha and run-window records, fetches, resolves `origin/db/0102-sat01-tables`, checks that
  sha out detached and verifies HEAD is it, verifies the sidecar, the promotion, the journal, 0101's
  bytes and every pin, runs the clock arm, and only then records the sha in `/tmp/0102-head.sha`.
- **The run window is checked by machine in every block from stage 1 on,** from the record GREEN's
  CLOCK CHECK writes after stage 0.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve the held branch
  again, print both, and HALT on any difference with `STOP: the held head moved since stage 0: the
  branch was pushed to or updated during the sitting.` It runs before the environment is loaded and
  before psql. It then checks out the RECORDED sha and asserts every file it runs by sha256.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied marker
  `/tmp/0102-applied.ok` exists (younger than 12 hours), and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stage 2 and the closing read are READ ONLY** and run from the recorded sha whatever the branch
  has done since: each prints whether it moved, with both shas, and never stops on it. **A fetch
  that fails is a STOP in every block, these two included,** because whether the head moved is then
  not known.
- **IF THE HELD HEAD MOVED, OR THE HELD BRANCH IS GONE, block by block** (each run whole in the
  harness, in both shells: "THE HELD HEAD MOVED, OR THE HELD BRANCH IS GONE"):

  | Block | The head moved since stage 0 (a push, an update of the branch) | The branch is gone from origin (merged or deleted) |
  |---|---|---|
  | stage 0 | nothing to compare with: it records whatever head it resolves, and GREEN's dispatch pins the sha it must be | `STOP: the held head, origin/db/0102-sat01-tables, could not be read. Nothing was applied`. No record written |
  | stage 1 | `STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above`, with both shas printed, before the environment is loaded, before psql and before the apply | the same STOP as stage 0, at the same point. Nothing was applied |
  | stage 2 | not a stop: `THE HELD HEAD MOVED since stage 0: recorded <sha>, now <sha>. Stage 2 still runs from the recorded sha. Report both`, and it checks out and runs from the RECORDED sha | `STOP: the held head, origin/db/0102-sat01-tables, could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass ...`. No database read, no pass mark |
  | the closing read | not a stop: the same line, and the read runs from the recorded sha, which the worktree must still be on | the same STOP with the post-commit sentence. The reader does not run |

  A `git fetch` that fails is a STOP in all four, with the same two endings. **Before the apply a
  gone branch is the safe direction. After it, the STOP says what stands, and nothing is lost:**
  the recorded commit is already in the apply worktree's object store, production holds 0102, and
  the lead rules how stage 2 and the closing read are run (they are READ ONLY). **A JUDGMENT, NOT A
  RULING** (17): the blocks do not fall back to `refs/pull/<n>/head` as 0096's and 0097's did. The
  `held-for-apply` label is what keeps the branch there: a labelled PR cannot merge
  (`.github/workflows/held-for-apply-blocks-merge.yml`), and the label comes off only at row 6 of
  the order table, after GREEN's report.

## STAGE 0: the promotion, the files, the clock and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0102.sha256
MIG=packages/db/migrations/0102_sat01_satisfaction_survey.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_survey.sql
SHA0102=db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1
SHAPREV=36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b
SHAPRE=ab4217aa5a39eaec4b694b27a8435e49ad063347d34329ea70ec096fbbe55cc4
SHAPOST=f8fd3dd7fdef6572e8c0137fa36f0384473a392dac680a2241435aa80460f7d0
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0102-applied.ok || { AGE=$(find /tmp/0102-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0102 in this sitting, or the age of /tmp/0102-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0102-head.sha /tmp/0102-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so the held head may be stale. Nothing was applied"; exit 1; }
HELD=$(git rev-parse origin/db/0102-sat01-tables) || { echo "STOP: the held head, origin/db/0102-sat01-tables, could not be read. Nothing was applied"; exit 1; }
echo "${HELD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${HELD}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${HELD})" = commit ] || { echo "STOP: the held head does not resolve to a commit"; exit 1; }
git checkout -q --detach ${HELD} || { echo "STOP: the checkout of the held head failed. Nothing was applied"; exit 1; }
echo "--- THE HEAD CHECK: the worktree must be on the held head this stage records"
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${HELD}" ] || { echo "STOP: the worktree is not on the held head after the checkout. Nothing was applied"; exit 1; }
echo "the held head and HEAD: ${HELD}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at the held head"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0102 is not on disk at the held head, so the promotion is not on it"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N102=$(find packages/db/migrations -maxdepth 1 -name '0102_*.sql' | wc -l | tr -d ' ')
[ "${N102}" = 1 ] || { echo "STOP: ${N102} files claim migration number 0102, not 1"; exit 1; }
N101=$(find packages/db/migrations -maxdepth 1 -name '0101_*.sql' | wc -l | tr -d ' ')
[ "${N101}" = 1 ] || { echo "STOP: ${N101} files claim migration number 0101, not 1"; exit 1; }
test -f scripts/db/precheck-0102-sat01-tables.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0102-sat01-tables.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0102}" ] || { echo "STOP: 0102 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0102-sat01-tables.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0102-sat01-tables.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===100&&e.idx===99&&e.tag==='0102_sat01_satisfaction_survey'&&e.when===1788502300000&&p.idx===98&&p.tag==='0101_guest_request_email'&&p.when===1788502200000?0:1)" || { echo "STOP: the newest journal entry is not idx 99, tag 0102_sat01_satisfaction_survey, when 1788502300000, of 100, after idx 98 tagged 0101_guest_request_email at when 1788502200000"; exit 1; }
test -f packages/db/migrations/0101_guest_request_email.sql || { echo "STOP: the file of journal idx 98 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0101_guest_request_email.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0101 on disk is not the file this document pins"; exit 1; }
echo "0101 on disk: 0101_guest_request_email.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0102-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '100 .sql files match 100 journal entries' /tmp/0102-check-journal.out || { echo "STOP: check-journal did not reconcile 100 files with 100 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0102 locks tables reception writes and creates two policies, so only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DTZ}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied"; exit 1; }
DT=$(echo "${DTZ}" | cut -c1-5)
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM; the clock read ${DTZ}): ${CLOCK} by the weekday table"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${HELD} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it takes ACCESS EXCLUSIVE on patients and SHARE ROW EXCLUSIVE on appointments, which reception writes, and its two CREATE POLICY statements lock the platform's auth tables)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0102 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0102 takes ACCESS EXCLUSIVE on patients, a table reception writes, and a migration that creates a policy is closed hours only (R39), so the sitting waits for closed hours. Nothing was applied"; exit 1; fi

echo "${HELD}" > /tmp/0102-head.sha || { echo "STOP: the sha could not be recorded in /tmp/0102-head.sha. Nothing was applied"; exit 1; }
echo "running from the held head ${HELD}, recorded in /tmp/0102-head.sha"
echo "0102 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and `the held head and HEAD: <sha>`; the sidecar line
`docs/migration-apply-0102.md: OK`; then
`newest journal entry: idx 99, when 1788502300000, tag 0102_sat01_satisfaction_survey, of 100; before it idx 98, when 1788502200000, tag 0101_guest_request_email`;
then `0101 on disk: 0101_guest_request_email.sql, sha256 36a1ed54...`; then check-journal's line
`... 100 .sql files match 100 journal entries in order ...`; then the clock:
`Lisbon weekday and time <DHHMM> (...): closed by the weekday table`, the three proof lines (proof 1
`yes` while the gate file hashes to `SHAGATE`, proofs 2 and 3 `no, by construction`), and
`R9: closed hours by the weekday table. 0102 runs in closed hours only`; then
`running from the held head <sha>, recorded in /tmp/0102-head.sha`; then
`0102 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database. The sha it prints is
the one every later stage runs from.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass. Any other ending is a `STOP:`
line and exit 1, with nothing applied: a failed fetch, `git status`, checkout or check-journal each
print their own `STOP:`, and `/tmp/0102-head.sha` is written only after every check has passed, so
a STOP leaves no new record of the sha. Inside clinic hours the clock's STOP is the arm working. A
proof 1 line that cannot be computed reads `no`, and decides nothing.

**The promotion is on this branch since 2026-10-06. From a held head that does not carry it, this
stage still ends at a file check:** with the document there and no promotion (the head of #1551 as
it stood before the promotion commit),
`STOP: 0102 is not on disk at the held head, so the promotion is not on it`; with no document,
`STOP: the document pin is not on disk at the held head`; and with no such branch on origin,
`STOP: the held head, origin/db/0102-sat01-tables, could not be read`. That is the safe direction,
and the halt rule governs it.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -eo pipefail
MIG=packages/db/migrations/0102_sat01_satisfaction_survey.sql
SHA0102=db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1
SHAPREV=36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b
SHAPRE=ab4217aa5a39eaec4b694b27a8435e49ad063347d34329ea70ec096fbbe55cc4
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0102-applied.ok || { AGE=$(find /tmp/0102-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0102 in this sitting, or the age of /tmp/0102-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0102-precheck.new || { echo "STOP: the old /tmp/0102-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: the held head must still be the sha stage 0 recorded."
test -f /tmp/0102-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0102-head.sha) || { echo "STOP: stage 0's record /tmp/0102-head.sha could not be read. Nothing was applied"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/db/0102-sat01-tables) || { echo "STOP: the held head, origin/db/0102-sat01-tables, could not be read. Nothing was applied"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "the held head now:   ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. Nothing was applied"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. Nothing was applied"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0102.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0102 is not on disk"; exit 1; }
test -f scripts/db/precheck-0102-sat01-tables.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N102=$(find packages/db/migrations -maxdepth 1 -name '0102_*.sql' | wc -l | tr -d ' ')
[ "${N102}" = 1 ] || { echo "STOP: ${N102} files claim migration number 0102, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0102}" ] || { echo "STOP: 0102 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0102-sat01-tables.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T101=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[98];process.stdout.write(p&&p.idx===98&&p.tag==='0101_guest_request_email'?p.tag:'none')") || { echo "STOP: node could not read journal idx 98's tag at the recorded sha. Nothing was applied"; exit 1; }
W101=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[98];process.stdout.write(p&&p.idx===98&&p.tag==='0101_guest_request_email'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 98's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W101}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0101's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T101}.sql || { echo "STOP: the file of journal idx 98 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T101}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0101 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0101: packages/db/migrations/${T101}.sql, sha256 ${SHAPREV}, journal when ${W101}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0102-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0102-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0102-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0102-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0102-window.ok)
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
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W101} -f scripts/db/precheck-0102-sat01-tables.sql 2>&1 | tee /tmp/0102-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0102-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0102-precheck.new || true)
[ "${OKS}" = 16 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 16. Nothing was applied"; exit 1; }

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
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (it takes ACCESS EXCLUSIVE on patients and SHARE ROW EXCLUSIVE on appointments, which reception writes, and its two CREATE POLICY statements lock the platform's auth tables)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0102 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0102 takes ACCESS EXCLUSIVE on patients, a table reception writes, and a migration that creates a policy is closed hours only (R39), so nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0102-postcheck.out /tmp/0102-stage2.ok /tmp/0102-journal-after.out /tmp/0102-apply.out /tmp/0102-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0102-precheck.new /tmp/0102-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0102-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0102-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0102_sat01_satisfaction_survey --sha256 ${SHA0102} --expect-pending 1 2>&1 | tee /tmp/0102-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0102-apply.out holds it). Whether 0102 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0102-applied.ok || { echo "STOP: verified-migrate exited 0, so 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. /tmp/0102-applied.ok could not be written, so stage 2 would refuse; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0102 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `the held head now:   <sha>`, the
  same sha twice** (the block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0102.md: OK`;
- **`0101: packages/db/migrations/0101_guest_request_email.sql, sha256 36a1ed54..., journal when 1788502200000`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it, then the target guard's `host:`, `port:`, `ref:` and
  `target verified: production, session pooler.`;
- **the pre-check prints `16` OK verdicts and no FAIL,** `journal_rows_before` 99, verdict 2 naming
  0101 as the newest row at 1788502200000, verdict 10 the patient role's eight columns, verdict 15
  `table UPDATE true, 0 column grants, anon false; patients_patient_update_selfscope:patient:using:check,patients_update:authenticated:using:check; control 1`,
  its eight CARRY rows and six INFO rows. **Report the INFO rows as printed, and the last two
  above all.** `INFO idle_in_transaction_session_timeout (0 is no limit)`: a name and a value,
  never a verdict. It is the database's own value: the migration's third statement sets 15 s
  inside the apply's transaction whatever this row prints ("G6"), and the sitting goes on whatever
  it prints. And `INFO R39: supautils.policy_grants, per role: tables named, and whether auth.users is one`.
  It is the first read of that setting on production, it is never a verdict, and whatever it prints
  the sitting goes on: `postgres: <n> tables, auth.users yes` means statements 69 and 70 will lock
  `<n>` platform tables (those that exist) until the COMMIT, as measured locally (24 named, 23
  existing and locked);
  `not set` means none was named for any role;
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`;**
- **the clock and the clinics:** `Lisbon weekday and time <DHHMM> (...): closed by the weekday table`,
  `active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: 0 of <n>`
  with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof
  lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside
  it. ...`; otherwise the STOP, with nothing applied;
- **verified-migrate, teed whole to `/tmp/0102-apply.out`:**
  `file       0102_sat01_satisfaction_survey.sql present, sha256 matches`,
  `journal    99 row(s) applied, last when=1788502200000`,
  `pending    1  [0102_sat01_satisfaction_survey]` (exactly one), the drizzle-kit banner with its
  stdout, stderr and exit, then `journal    99 -> 100  (delta 1)`,
  `0102_sat01_satisfaction_survey present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0102 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the journal from
  the database rather than trusting these lines.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only onward path to
stage 2. Any other ending is a `STOP:` line and a non-zero exit. A refusing target guard prints
`STOP: the target guard refused or failed (its lines are above). Nothing was applied` before psql runs
the pre-check and before verified-migrate. A failed apply prints `STOP: the apply exited <code>: ...`,
exits with that same code and writes no `/tmp/0102-applied.ok`, so stage 2 refuses. A failed `touch`
of that marker after an exit-0 apply prints `STOP: verified-migrate exited 0, so 0102 IS APPLIED and
the write stands, ...`.

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
whether 0102 is applied is `packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs
only on the owner's or the lead's word.

**A fired bound is a clean failure, measured for each of the five locks that can be waited for, at
the three statements that ask for them** (62; 66, which asks for three in turn; 69; "G6"): the body
failed after 5.0 seconds with `55P03 canceling statement due to lock timeout`, and nothing of 0102
existed afterwards (node, on the lane). One of them was read again through `verified-migrate.mjs`
in 0102's rehearsal: the wait for `patients` ran out after 5 s, the apply exited 4 and nothing of
0102 existed afterwards ("The rehearsal, 2026-10-06", 3b). It is still a halt, and
the lead rules on it.

**WHEN A BOUND FIRES, GREEN'S TRANSCRIPT DOES NOT NAME IT** (0101's rehearsal, 2026-10-05, under
verified-migrate with a held lock; read again on these bytes in 0102's rehearsal, 2026-10-06, with
stage 1 run whole and another session holding `patients`: "The rehearsal, 2026-10-06", 3b).
drizzle-kit prints `undefined`, and pnpm prints
`[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: drizzle-kit migrate`. The
text `canceling statement due to lock timeout` is only in the server's log. What the transcript
does show is enough to read it: the apply exits 4, the journal reads `99 -> 99  (delta 0)`, there
is no applied marker, and nothing was applied. GREEN reports those lines as printed and names no
cause. **For 0102 the waits can come at three statements, all in the last nine:** 62 (`patients`),
66 (`appointments`, then `tenants`, then `users`) and 69 (the platform's auth tables); measured,
one failure for each of the five locks ("G6"). **A deadlock is the second way an apply can end with
nothing applied,** and reads the same in the transcript, without the word deadlock. Postgres ends
whichever of the two began to wait first within a second: the application's transaction, or the
apply ("G6", four runs). **A stalled apply is the third:** the server ends a session that sits idle
inside the transaction for 15 seconds (statement 3), the transaction is rolled back and nothing is
applied ("G6", measured with node; and 0102's rehearsal, 3a, under drizzle-kit with stage 1 run
whole). There the paused client was resumed about 0.4 s after the server had ended its session, and
the transcript then read exactly as it does for a lock wait that ran out: `undefined`, pnpm's ERR
line, the apply exits 4, the journal reads `99 -> 99  (delta 0)`, no applied marker. **What a client
that STAYS stalled past the server's 15 seconds shows, an apply that does not return, is NOT
REHEARSED;** it is a halt, reported as it stands.

**WHAT A FAILED APPLY PRINTS BESIDE THOSE TWO LINES** (0102's rehearsal, 2026-10-06, both failed
applies; this document quoted only `undefined` and the ERR line). `undefined` is not on a line of
its own. It ends ONE LONG LINE of drizzle-kit's spinner frames, each of them
`[<frame>] applying migrations...` after two terminal escape sequences: 40 frames and 1449 bytes
on that line during the 5 s lock wait, 5 frames with the client paused. Then pnpm prints a line
this document did not mention, the path of the package it ran in, ending in a colon (in the
sitting, the apply worktree's `packages/db`), and only then its ERR line. After them come
`stderr: (nothing)`, `exit:   1`, `--- end drizzle-kit migrate ---`,
`journal    99 -> 99  (delta 0)`, `0102_sat01_satisfaction_survey present by sha256: NO`,
`FAIL: drizzle-kit migrate exited 1.` and the block's own `STOP: the apply exited 4: ...`. The
two NOTICE objects (below) print before the spinner line, as in a clean apply. None of this is a
second error, and GREEN reports all of it as printed.

**AN EMPTY `prev_when` IS A FAIL, NOT A STOP** (0101's rehearsal under psql; read again here with
the node runner on this pre-check: `15 OK, 1 FAIL`, the FAIL on verdict 2). Handed an empty
`prev_when`, the pre-check does not take its missing-value STOP. In the sitting the block refuses
a `W101` that is not thirteen digits before psql runs, so the pre-check never sees one.

**drizzle-kit prints two NOTICE objects between its banner and its success line,**
`42P06 schema "drizzle" already exists, skipping` and `42P07 relation "__drizzle_migrations" already
exists, skipping` (measured in 0099's rehearsal; read again in 0102's, in the clean apply and in
both failed ones). They are not a halt.

**Every `STOP:` this block prints before the `--- the apply` line means nothing was applied,** and
before the `--- only now` line the previous sitting's transcripts are untouched. **After that line,
the apply's STOP says it may have applied, and the marker's STOP says it did;** both are the halt
rule's post-commit case.

## STAGE 2: the post-check, carries from stage 1. READ ONLY

```
(
set -eo pipefail
SHA0102=db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1
SHAPOST=f8fd3dd7fdef6572e8c0137fa36f0384473a392dac680a2241435aa80460f7d0
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0102-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. If stage 1 ended with its line 0102 APPLIED, then 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0102 APPLIED, then 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0102-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago. If stage 1 ended with its line 0102 APPLIED, then 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0102-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0102-head.sha) || { echo "STOP: stage 0's record /tmp/0102-head.sha could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/0102-sat01-tables) || { echo "STOP: the held head, origin/db/0102-sat01-tables, could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "the held head now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0102.sha256 || { echo "STOP: this document is not the approved one. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f packages/db/migrations/0102_sat01_satisfaction_survey.sql || { echo "STOP: 0102 is not on disk. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/db/postcheck-0102-sat01-tables.sql || { echo "STOP: the post-check is not on disk. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0102_sat01_satisfaction_survey.sql | cut -d' ' -f1)" = "${SHA0102}" ] || { echo "STOP: 0102 on disk is not the approved file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0102-sat01-tables.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0102-window.ok || { echo "STOP: no run window is recorded for this sitting. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0102-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0102-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0102-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0102-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0102-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
S=$(carry secdef_functions_before)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
TR=$(carry triggers_md5)
PU=$(carry patient_update_columns)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${S}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${TR}" ] && [ -n "${PU}" ] || { echo "STOP: a carry did not parse out of the transcript. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${J} ${T} ${S}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+' || { echo "STOP: a count carry is not a number. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${PM} ${FM} ${RM} ${CM} ${DM} ${TR}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){5}' || { echo "STOP: an md5 carry is not 32 hex characters. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "${PU}" | grep -qxE '[a-z_]+(,[a-z_]+)*' || { echo "STOP: the patient role's column list did not parse as names. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "carries from this run: journal_before=${J} tables_before=${T} secdef_before=${S} policies=${PM} functions=${FM} relation_acl=${RM} column_acl=${CM} default_acl=${DM} triggers=${TR}; patient updates ${PU}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0102-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v secdef_before="${S}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v patient_update_columns="${PU}" -v triggers_md5="${TR}" -c "begin read only" -f scripts/db/postcheck-0102-sat01-tables.sql -c "rollback" 2>&1 | tee /tmp/0102-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written, so it has confirmed nothing; a table or a column it reads that is not there ends it this way. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0102-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0102-postcheck.out || true)
[ "${OKS}" = 27 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 27. A verdict that is missing prints no FAIL. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0102 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0102}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0102 is in the journal ${HN} times, not once. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0102 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }

echo "${REC}" > /tmp/0102-stage2.ok || { echo "STOP: the pass mark /tmp/0102-stage2.ok could not be written, so the closing read would refuse. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1; stage 2 did not pass, and it and the closing read (READ ONLY) run again only on the owner's or the lead's word"; exit 1; }
echo "0102 POST-CHECK PASSED. 16/16 pre-check OK, 27/27 post-check OK, journal ${J} to ${JA}; tables ${T} to $((T + 3)), SECURITY DEFINER functions ${S} to $((S + 8)). Paste the closing journal read now."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `checking from the recorded sha <sha>` and whether the held
head moved; `docs/migration-apply-0102.md: OK`; the run window line with now before the end; the
carry line reads `journal_before=99`; the target guard; the post-check prints `27` OK verdicts and
no FAIL (verdict 1 the three tables and their policy counts; verdict 6 `9 of 9`; verdict 16 the
tables plus 3 and the SECURITY DEFINER functions plus 8; verdict 24 the audit trigger; verdict 25
`0 cells differ of 16`); the journal reads `99` before and `100` after, with 0102's sha256 in it
exactly once; the last line reads exactly
`0102 POST-CHECK PASSED. 16/16 pre-check OK, 27/27 post-check OK, journal 99 to 100; tables <T> to <T+3>, SECURITY DEFINER functions <S> to <S+8>. Paste the closing journal read now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only path to the
closing read. Any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands.
`/tmp/0102-stage2.ok` is written last, so after any STOP the closing read refuses.

**EVERY STOP OF STAGE 2 AND OF THE CLOSING READ SAYS WHAT STANDS,** because each fires after the
commit and is read by somebody deciding what to do next: `0102 IS APPLIED and the write stands. Run
nothing again, not stage 0 and not stage 1`. The first three STOPs of stage 2 and the first two of
the closing read come before the block has read stage 1's applied marker, so they say it
conditionally (`If stage 1 ended with its line 0102 APPLIED, then ...`); every later one says it
flatly, **with six exceptions, where the block's own read of the database CONTRADICTS the marker,
or did not finish and so confirmed nothing.** A STOP cannot say "the sha256 of 0102 is in the
journal 0 times" and "0102 IS APPLIED" in one breath. On those six the STOP says exactly this and
no more: `Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as
UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules`. They are, in
stage 2: the post-check itself not completing (psql exits non-zero: the post-check reads the three
new tables, the new column and the new functions by name, so on a database WITHOUT them Postgres
refuses the statement, psql exits 3, and this is the STOP that fires, before any verdict can
print; measured by the node runner, which read `42883 function "public.resolve_survey_code(text)"
does not exist`, and read again under psql in 0102's rehearsal, with the post-check run on its own
before the apply: psql exit 3, no verdict, the same message; stage 2 itself was not run against a
database without 0102); a FAIL verdict of the post-check (the block does not know which verdict failed,
and a FAIL of 1, 6, 22 or 23 is such a contradiction); the journal count that is not the
pre-check's plus one; and the count of 0102's sha256 in the journal that is not 1. And in the
closing read: a journal that does not read 100, and a read that does not list 0102 as APPLIED. The
script test requires the flat sentence on every other post-commit STOP, the UNKNOWN sentence on
exactly those six, and never both on one line.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 2 exited 0 with its last line
`0102 POST-CHECK PASSED. ...`.

```
(
set -eo pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. If stage 1 ended with its line 0102 APPLIED, then 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
test -f /tmp/0102-applied.ok || { echo "STOP: stage 1 left no applied marker. If stage 1 ended with its line 0102 APPLIED, then 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read has not run; the lead rules"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether the held head moved"
test -f /tmp/0102-head.sha || { echo "STOP: stage 0 recorded no sha in this sitting. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
REC=$(cat /tmp/0102-head.sha) || { echo "STOP: stage 0's record /tmp/0102-head.sha could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${REC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 0's record did not read as a full 40-character sha [${REC}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
HD=$(git rev-parse HEAD) || { echo "STOP: the worktree's HEAD could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${HD}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the worktree's HEAD did not read as a full 40-character sha [${HD}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${HD}" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
shasum -a 256 -c docs/migration-apply-0102.sha256 || { echo "STOP: this document is not the approved one. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether the held head moved is not known. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOW=$(git rev-parse origin/db/0102-sat01-tables) || { echo "STOP: the held head, origin/db/0102-sat01-tables, could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOW}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the held head did not read as a full 40-character sha [${NOW}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "the held head has not moved since stage 0: ${REC}"; else echo "THE HELD HEAD MOVED since stage 0: recorded ${REC}, now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0102-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
S2=$(cat /tmp/0102-stage2.ok) || { echo "STOP: stage 2's pass mark could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${S2}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: stage 2's pass mark did not read as a full 40-character sha [${S2}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${S2}" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ -n "$(find /tmp/0102-stage2.ok -newer /tmp/0102-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f /tmp/0102-window.ok || { echo "STOP: no run window is recorded for this sitting. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0102-window.ok)
echo "${WREC}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: the sha in the run window record did not read as a full 40-character sha [${WREC}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0102-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z') || { echo "STOP: the Lisbon clock could not be read. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "${NOWZ}" | grep -qxE '[0-9]{12} (WET|WEST)' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${NOWZ}]. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
NOWL=$(echo "${NOWZ}" | cut -c1-12)
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0102-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows on production: 100' /tmp/0102-journal-after.out || { echo "STOP: the journal read after the apply does not say 100. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0102_sat01_satisfaction_survey[.]sql$' /tmp/0102-journal-after.out || { echo "STOP: the journal read does not list 0102 as APPLIED. Stage 1 recorded that it applied 0102, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report; the lead rules"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0102-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0102-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word"; exit 1; }
echo "CLOSING READ: the journal reads 100, 0102 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and whether the held head moved; the run window line with now
before its end; the reader's and its module's sha256 line; then the read printed IN FULL through
`tee`: `journal rows on production: 100`, every migration file on the recorded sha listed
`APPLIED`, 0102 last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`,
and the last line, exactly,
`CLOSING READ: the journal reads 100, 0102 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted. **WHAT THE EXIT MEANS:** exit 0 with that last line is
the only pass; any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands, which
the STOP line itself says. The closing read asserts the sidecar like every other block, and reads
the worktree's HEAD, the recorded sha and stage 2's pass mark into checked variables before it
compares them.

## What every verdict must read

**Pre-check, 16 verdicts, all `OK`, each with its control:** 0 the transaction is READ ONLY; 1 0102
absent by hash (control: the same count finds 0101 once); 2 0101 present by hash once, the newest
row, at its journal `when`; `journal_rows_before` **99**; 4 the session is `postgres` (control:
`authenticated` is no member of it); 5 nothing 0102 creates exists yet: no relation named
`appointment_survey_%`, no `patients.survey_enabled`, none of the nine function names, no policy
named `appointment_survey_%`, no trigger named `patients_survey_switch_audit` (control: 0072's
table and door are found by the same probes); 6 the 26 columns 0102 reads exist with the types it
assumes, and `appointment_status` has `completed` (control: a planted column is missing); 7 the
eight functions it calls exist, `jwt_patient_id()` among them, and the two viewer helpers are
SECURITY DEFINER `uuid[]` owned by `postgres` (control: a planted name resolves to nothing); 8 the
session role's `public` and GLOBAL TABLES defaults name no grantee outside `postgres`,
`authenticated`, `service_role`, `anon`, `patient`, and grant `authenticated` something (control: a
planted foreign grantee); 9 the same for FUNCTIONS, against `postgres`, `anon`, `authenticated`,
`service_role` (control: planted); 10 the patient role updates exactly the eight `patients` columns
of 0019, 0020 and 0082 and holds no table-level UPDATE (control: `id` is not updatable); 11 the five
roles exist; 12 the server is Postgres 17 (where the post-check's policy pins were read);
`secdef_functions_before`, every one owned by `postgres`; 14 the patients table holds rows (the
control for post-check verdict 9); **15 the premise of R34:** `authenticated` holds a table-level
UPDATE on `patients`, no column-level grant on either reminder switch, `anon` holds no UPDATE on
either, and the UPDATE policies on `patients` are exactly `patients_update` TO `authenticated` and
`patients_patient_update_selfscope` TO `patient`, each with a USING and a WITH CHECK (control: the
same read finds `patients_select` as a SELECT policy). Then 8 CARRY rows (`tables_before`,
`policies_md5`, `functions_md5`, `relation_acl_md5`, `column_acl_md5`, `default_acl_md5`,
`patient_update_columns`, `triggers_md5`; with `journal_rows_before` and `secdef_functions_before`,
the ten carries stage 2 reads) and 6 INFO rows: the server version; patients, appointments and
concluded appointments (counts); what the `public` defaults give `service_role`; the text md5 of the
two UPDATE policies (a profile of what "same clinic scope" is on that database: on the build lane
`patients_update` read `507dae2e...` and `11ef3419...`, the patient's `2de7fd62...` twice);
`idle_in_transaction_session_timeout`, the setting's name and its value as the session reads it
(read with `current_setting(name, true)`, so it cannot fail the file; `0` on the build lane);
and R39's read of `supautils.policy_grants`.

**R39's read cannot fail the pre-check, measured on twelve values of the setting:** absent, empty
and blank read `not set`; text that is not JSON reads `could not be read as JSON or at all
(SQLSTATE 22P02)`; an array or a string reads `set, JSON but not an object`; `{}` reads `set, names
no role`; a value that is not a list reads `<role>: not a list, auth.users no`; and a real value
reads, per role, `<n> tables, auth.users yes` or `no` (a table whose name only CONTAINS
`auth.users` reads `no`). The read is made once, in its own sub-block, and recorded in a
transaction-local setting the INFO row prints.

**Post-check, 27 verdicts, all `OK`:** 0 READ ONLY; 1 the three tables, owner `postgres`, RLS on and
not forced, policies codes 0, answers 1, sends 1 (control: `appointments` reads RLS on); 2 every
column of the three, in order, with type, NOT NULL and default, against the literal in the file; 3
each table's constraints (count and one md5) and the ten foreign keys, each by NAME and definition,
validated and not deferrable, with their delete rules; 4 the
nine indexes by name; 5 the two policies, `SELECT`, PERMISSIVE, `TO authenticated`, no WITH CHECK,
the USING text pinned by md5; 6 the nine functions: language plpgsql, signature, SECURITY DEFINER on eight, owner,
`search_path=public`, volatility, body md5; 7 EXECUTE by `has_function_privilege` for
`authenticated`, `anon`, `patient` and `service_role` on all nine (36 cells), no PUBLIC item, no
NULL ACL (control: `postgres` runs all nine); 8 every table privilege for `authenticated`, `anon`
and `patient` on the three (72 cells), no PUBLIC item (control: the owner holds all 24); 9
`patients.survey_enabled` boolean NOT NULL default true, stored as a catalogue default, every row
true (control: rows exist); 10 the patient role's UPDATE columns are the carried eight plus
`survey_enabled`; 11 to 15 everything else unchanged, by md5 against the carries: policies outside
the new tables, functions outside the nine names, relation privileges outside the new relations,
column privileges outside `patients.survey_enabled`, every default privilege; 16 tables plus 3 and
SECURITY DEFINER functions plus 8, all owned by `postgres`; 17 the three tables are empty (control:
patients holds rows); 18 `anon` refused in action on all three (42501); 19 `patient` refused in
action on all three (control: `patient` reads `patients` without an error); 20 `authenticated` with
no claims refused on codes, and reads sends and answers with zero rows; 21 the doors run as
`authenticated`: `resolve_survey_code` on a hash nobody holds returns zero rows,
`survey_send_state` with no claims returns `not_allowed`; 22 the journal `+ 1`; 23 0102 by hash
once, the newest row; **24 R34's trigger:** one, on `patients`, AFTER UPDATE of any column, per
row, enabled, with the WHEN that compares the old and the new value, calling the pinned function
(control: the patient-number trigger reads BEFORE INSERT); **25 R34's principals:** the column
privileges on `survey_enabled` equal those on `reminder_sms_enabled` and on
`reminder_email_enabled`, cell by cell, for `authenticated`, `anon`, `patient` and `service_role`
over SELECT, INSERT, UPDATE and REFERENCES (16 cells), with `authenticated` and `patient` holding
UPDATE and `anon` nothing (control: `id` differs); 26 every other trigger in `public` unchanged, by
md5 against the carry.

**psql's own lines surround both tables, and none of them is a verdict** (0102's rehearsal,
2026-10-06, each file on its own and inside stages 1 and 2; the EXPECT lists of stages 1 and 2 do
not name them). The pre-check prints `Pager usage is off.`, `Timing is off.`, `BEGIN` and `DO`
before its heading and its table, and `(30 rows)` and `ROLLBACK` after them. The post-check prints
`BEGIN`, `Pager usage is off.` and `Timing is off.`, then its heading, `DO` four times and its
table, and `(27 rows)` and `ROLLBACK` after them. Stage 2's journal read prints one more `BEGIN`
before its three rows, and `(3 rows)` after them.

**The post-check is not a standing invariant for 11 to 16 and 26:** the next migration that grants,
creates a function, a trigger or a policy moves them. It is an assertion about this apply.

**No carry's name is a substring of another's or of any other row's `check` column,** because stage
2's `carry()` matches column 1 with `index()`; `scripts/sat01-tables-0102.test.mjs` asserts it.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 100, 0102 by hash | stage 2, and the closing journal read | the database |
| the three tables, columns, constraints, indexes, policies, functions and the trigger are the reviewed ones | post-check 1 to 6 and 24, by literal and md5 | the catalogue |
| no application role writes the tables; codes unreadable; the doors and only the doors executable | post-check 7 and 8 (catalogue), 18 to 20 (in action) | catalogue and executor |
| the patient's switch: every patient on, the portal can set it | post-check 9 and 10 | the catalogue |
| R34: the switch is behind the grants of the two reminder switches, and its audit trigger is in place | pre-check 15 (the premise), post-check 24, 25 and 11 (the two UPDATE policies unchanged) | the catalogue |
| nothing else moved | post-check 11 to 16 and 26 | the catalogue, by md5 |
| the page's three doors and the automatic send answer only the server's own session; a staff session, a patient claim and a malformed code each get what an unknown code gets | **NOT DISCHARGED ON PRODUCTION** (it needs a live code and a session with a user). The DB-gated suite; the catalogue half (the nine bodies by md5, EXECUTE by role) is post-check 6 and 7 | the executor, on a throwaway |
| S7: each role reads exactly its answers; S4's roles read the sends; anon reads nothing; the guest token writes one answer and nothing else; a reused, expired or unknown token gets the same refusal | **NOT DISCHARGED ON PRODUCTION** (the tables are empty, and a READ ONLY transaction cannot seed one). The DB-gated suite, on a lane stack, and in CI's `db-tests` from row 5 of the order table | the executor, on a throwaway |
| R34: each allowed principal sets the switch, each forbidden one does not, and each change leaves exactly one audit row | **NOT DISCHARGED ON PRODUCTION** (a READ ONLY transaction cannot UPDATE a patient, and no arm of a sitting writes one). The DB-gated suite | the executor, on a throwaway |
| G6: the platform locks are held for the last two statements only | **NOT DISCHARGED ON PRODUCTION**: measured on two local stacks. The pre-check's INFO row reads the setting that names the tables | a throwaway |
| the sitting is in closed hours | stage 0's and stage 1's clock arms, by machine | the apply machine |

## The behaviour check per role

**Where it runs, and why not on production.** At the apply the three tables are empty, so a read of
an answer by any staff role reads zero rows on production whatever the policy says: VACUOUS, never
OK. A READ ONLY transaction cannot seed an answer to read, nor set a switch. So the behaviour check
is `packages/db/tests/sat01-survey-rls.db.test.ts`, a DB-gated suite that seeds its own tenant,
runs every role as an assigned principal (`set local role` and the real JWT claims the app's
contexts set) inside transactions that roll back, and removes its fixture. Production's post-check
runs the part that is not vacuous on empty tables: the refusals of `anon`, `patient` and the codes
table, in action (verdicts 18 to 20), and the two read-only doors (verdict 21).

**It registers only the arm that applies, and skips nothing.** On a database with 0102 it registers
the 111 arms below. On a database without it (CI's, until row 5 of the order table) it registers
ONE arm, which says in its title that nothing was measured and asserts the pre-0102 side whole:
none of the sixteen parts exists, beside a control that the same probes find what is there today.
A database with some of the sixteen parts THROWS, and so does a database without 0102 once a
promoted file creates the answers table. Measured both ways: 111 of 111 on the applied stack, and
1 of 1 on the same stack before 0102 was applied.

**It never passes on an empty set.** The matrix first asserts the PREMISE (the owner reads exactly
the tenant's three answers, and the other tenant's answer exists), every role's expectation is an
exact set, and two controls prove it can go red: the S7 policy dropped (the owner reads nothing) and
the S7 policy widened to the tenant (the colleague who did not attend reads all three).

**The fixture** goes through the doors: the 24-hour job's context issues every send, the guest
page's context answers four of them. Clinics A and B of one tenant, a second tenant X; answer 1 is
P1's visit at A attended by t1 with t4 as the second practitioner (a shared NESA visit); answer 2 is
P2's at B by t5; answer 3 is P3's at A by t3, who is assigned to B only; send 4 is P4's at A by t2,
never answered; tenant X has one answer. No real name anywhere.

**Run on the build lane's stack (below), 2026-10-05: 111 of 111 passed.** The matrix as measured:

| Principal (S7) | Answers read | Sends read |
|---|---|---|
| owner | 1, 2, 3 (every clinic of the tenant; none of X) | 1, 2, 3, 4 |
| admin of clinic A | 1, 3 | 1, 3, 4 |
| admin of clinic B | 2 | 2 |
| reception, own clinic (A) | 1, 3 | 1, 3, 4 |
| reception, other clinic (B) | 2 (nothing at A) | 2 |
| therapist OWN (t1, attended P1's visit at A) | 1 | 1 |
| therapist, NESA second practitioner (t4, at A) | 1 | 1 |
| therapist OTHER (t2, same clinic, attended none) | nothing | 4 (the patient t2 treats; no answer exists) |
| the therapist who attended but lost the clinic (t3, assigned to B) | nothing | 3 (a send is not clinic-bound) |
| therapist t5, attended P2's visit at B | 2 | 2 |
| admin with no clinic assignment | nothing | nothing |
| reception with no clinic assignment | nothing | nothing |
| owner of tenant X | X's only | X's only |
| the 24-hour job and the guest page (tenant, no user) | nothing | nothing |
| a role the policy does not name | nothing | (not run) |
| `patient` (P1's own token) | permission denied, 42501, on all three tables | |
| `anon` | permission denied, 42501, on all three tables | |

**THE SURVEY SWITCH (R34), same run, measured as a difference.** Every principal tries three
columns of P1's row: `survey_enabled`, `reminder_sms_enabled` and `reminder_email_enabled`. The
three answers must agree, and must be the answer below. P1 has one visit, at clinic A, attended by
t1 with t4 as the second practitioner; no creator; no primary clinic.

| Principal | Sets the survey switch | Sets both reminder switches | Audit rows `survey.switch_changed` | Actor on the row |
|---|---|---|---|---|
| the patient, for themself (the portal) | yes | yes | exactly 1 | `actor_patient_id` P1; no user |
| the owner | yes | yes | exactly 1 | the owner |
| admin of clinic A | yes | yes | exactly 1 | that admin |
| reception of clinic A | yes | yes | exactly 1 | that receptionist |
| admin with no clinic assignment (0047: every clinic) | yes | yes | exactly 1 | that admin |
| reception with no clinic assignment | yes | yes | exactly 1 | that receptionist |
| therapist t1, who treats P1 | yes | yes | exactly 1 | t1 |
| therapist t4, second practitioner of P1's visit | yes | yes | exactly 1 | t4 |
| a server-side job's context (tenant, no user) | yes | yes | exactly 1 | none (both actors null) |
| admin of clinic B (another clinic's staff) | no | no | 0 | |
| reception of clinic B (another clinic's staff) | no | no | 0 | |
| therapist t2 (same clinic, does not treat P1) | no | no | 0 | |
| therapists t3 and t5 (clinic B) | no | no | 0 | |
| the owner of ANOTHER TENANT, and a therapist of it | no | no | 0 | |
| a session of another tenant naming this tenant's user | no | no | 0 | |
| ANOTHER PATIENT of the same tenant (P2's token) | no | no | 0 | |
| a patient of ANOTHER TENANT, and that tenant's token naming P1 | no | no | 0 | |
| a role the policy does not name; a session with no claims | no | no | 0 | |
| `anon` | permission denied, 42501, by the grant, on all three | | | |

- **The two other arms of 0047 read the same for all three switches:** the row's creator
  (reception of B on a patient it created, seen at A only: yes; admin of B on that patient: no;
  admin of A: yes) and the primary clinic (admin and reception of B on a patient registered at B
  and never seen: yes; admin and reception of A: no; a therapist of B who never treated them: no).
- **One row per change, and none without one:** setting the switch to the value it has, updating
  another column, and setting a reminder switch each write no row; off and then on writes two (one
  says `false`, one says `true`); one statement that changes two patients writes one row each.
- **The row holds ids and the new value only:** `tenant_id`, `actor_user_id`, `action`,
  `entity_type`, `entity_id`, `metadata` with exactly the two keys, and a NULL `ip`.
- **Any path that changes it:** with a second trigger planted that flips the switch when another
  column is updated, an UPDATE that never names `survey_enabled` still leaves the row. That is why
  the trigger is not `UPDATE OF survey_enabled`.
- **The actor is a staff member of the patient's tenant, or nobody:** a session with this tenant's
  owner claims and a user of ANOTHER tenant makes the change (0047 admits the owner role) and the
  row names no actor; the same claims with this tenant's own owner name them.
- **The row is filed under the PATIENT'S tenant, whatever the session says:** on the owning role's
  connection, which bypasses RLS (a data op, a migration), a change made with no claims at all, and
  one made under another tenant's claims, each leave one row under the patient's own tenant with no
  actor.
- **Together or not at all:** with the audit row made impossible (a CHECK planted in the rolled-back
  transaction), the UPDATE of the switch is refused (23514) and the switch stays as it was, while a
  reminder switch, which writes no row, still changes.
- **It can go red:** with the trigger dropped a change leaves no row; with the patient's column
  grant revoked the patient is refused the survey switch by the grant while a reminder switch
  still passes.
- **The opt-out door** leaves its own `survey.opt_out` row (the appointment, the channel) and,
  because the switch moved, exactly one `survey.switch_changed` row for that patient with no actor.
- **EXECUTE on the trigger function is asserted by privilege, never by a call.** On the local
  Supabase image a call to a function the role holds no EXECUTE on takes the backend down instead
  of being refused (the 0079 suite records the same); it happened three times while this suite was
  written, each on the build lane's own stack, and the arm that caused it now reads the catalogue.

**The guest token path, same run:** a live code resolves to one row and opening it writes nothing;
the token writes ONE answer whose send, patient, channel, clinic, both practitioners and send time
come from the send and the visit, consumes its send as `answered`, and writes one audit row
`survey.submitted` holding `{"channel": "sms"}` only; a REUSED code, a code spent by an OPT-OUT, an
EXPIRED code (sent 15 days ago) and an UNKNOWN code each get the same refusal (resolve zero rows,
submit false, opt-out false) and write nothing; a code is refused for a tenant that is not the
session's; a code whose visit is no longer concluded, whose patient is soft-deleted, or whose visit
was answered through another send resolves to nothing; two presses of one code race, the second
waits on the first's row lock and gets false, and one answer exists.

**THE PAGE'S DOORS ANSWER ONLY THE SERVER'S OWN SESSION, same run** (the review's MAJOR finding).

| Session, against a LIVE code issued by the job | The read | The answer | The opt-out | Written |
|---|---|---|---|---|
| the server's own (a tenant, the job's role, no user): the control, in the same transaction | 1 row | true | (true on its own code) | the answer, or the opt-out |
| the owner; an admin; reception; the therapist who attended | no row | false | false | nothing |
| the owner of another tenant | no row | false | false | nothing |
| the job's own role WITH a user; a well-formed user that is nobody's | no row | false | false | nothing |
| a patient claim: the patient the code is for; another patient's | no row | false | false | nothing |
| `anon`, `patient`, `service_role` | no EXECUTE, read from the catalogue and never tried by a call | | | |

- **The forgery, as the review ran it:** a therapist calls the manual door with a hash of their
  own choosing and gets `issued`; with their own session the read shows no row, the answer returns
  false and the opt-out returns false; no answer exists, the send is still open, the patient's
  switch is on, and the only audit row is their own `survey.sent`. The control: the server's own
  session redeems that same code, so what refused was the session.
- **Each door carries its own test.** The answer and the opt-out ask the read door again before
  they write, so its test alone would refuse for them. With the read door's test taken out (rolled
  back), a staff session and a patient claim see the row and are STILL refused by the answer and
  by the opt-out.
- **The automatic door refuses a patient claim** as it refuses a user (`not_allowed`).
- **A code that is not 64 lower-case hex characters** (empty, 63, 65, upper case, one character
  not hex, a trailing space) gets `not_allowed` from both issue doors, no row, false and false
  from the page's doors, raises nothing and writes nothing. The control: a well-formed code nobody
  holds gets the same three answers from the page's doors, and a well-formed code is issued.
- **The consent label:** 65 characters refused by its own CHECK (23514, by the constraint's name),
  64 accepted, blank refused by the other.
- **A delete of a patient:** with the appointment moved to another patient, as a merge moves it,
  the owning role's `DELETE` of a patient who has a send is refused, 23503, by
  `appointment_survey_sends_patient_id_fkey`, and one who has an answer by one of the survey's two
  foreign keys; the control, the same patient with no survey row, is deleted. The six delete rules
  are read from the catalogue.
- **The merge, as a recorded gap:** after `merge_patients` the appointment is the survivor's and
  the send is still the merged-away patient's; its live link no longer resolves; a second automatic
  send for the same visit is `issued` to the survivor; and the merged-away patient's delete is
  refused, 23503. That arm changes when the application's merge is taught the tables.

- **The eight late foreign keys are the ones an inline `REFERENCES` makes** (round 2): the ten
  foreign keys read from the catalogue by name and definition, all validated, none deferrable; and
  all nine functions are plpgsql.
- **A link lives fourteen days from its send, to the minute:** at 13 days 23 hours the code
  resolves and is answered; at 14 days and 1 minute the read shows no row and the answer and the
  opt-out return false.
- **The read ties the code, the appointment and the patient to the SEND's tenant.** No door can
  write rows that disagree; planted by the owning role, a code, an appointment or a patient moved
  to another tenant, each alone, resolves to nothing and is not answered, and resolves again when
  put back.
- **The read's third column is the visit's END,** equal to the appointment's `ends_at` and not its
  `starts_at`.

**The doors, same run:** the automatic door refuses each case on its own fixture (not concluded,
opted out, soft-deleted, no phone for SMS, email switch off, an unknown channel, an unknown
appointment, another tenant's appointment: `not_eligible`; a tenant not the session's, a staff
session: `not_allowed`) and writes nothing; a send 59 days ago blocks it and 61 days does not; a
MANUAL send 30 days ago blocks it too (S3); two automatic runs for one patient, and an automatic and
a manual send for one patient, race with the second seen waiting on the advisory lock, and produce
one send. The manual door and the button's state agree on every fixture: the FIVE reasons
(`no_appointment`, `opted_out`, `no_channel`, `open_link` at 13 days and `ready` at 15, and R32's
`answered`), and `not_allowed` for a soft-deleted patient; they write nothing on a refusal.
**R32's reason reads the LAST concluded visit only:** an older answered visit beside a newer
unanswered one is `ready`; the only visit, answered, is `disabled: answered`, the door returns
`answered` with that visit's id and writes no second send. `no_channel` is per channel; S4's roles
are right for 13 principals; the send attaches to the most recent concluded visit, records
`sent_by` from the session and writes one `survey.sent` audit row with the channel and the origin
only; it is not blocked by the 60-day rule. The CHECKs refuse scores out of range, a
1001-character comment and a blank consent label (23514), and accept the edges. The purge nulls
only comments older than 24 months, keeps the scores, writes one audit row each, touches no other
tenant, refuses a NULL tenant (22004), and no application role holds EXECUTE on it. An appointment
with an unanswered send deletes and takes the send and its code; one with an answer is refused
(23503).

## Rehearsal

**REHEARSED ON 2026-10-06, WITH LIMITS.** From the promoted head `68fcd861`, on a throwaway at
production's position, stage 0, the dispatch's CLOCK CHECK, stage 1 and stage 2 ran whole to their
last lines, and 0102 applied through `verified-migrate.mjs`, journal 99 to 100. **Two reads are
NOT REHEARSED:** the journal reader refused the throwaway, in the dispatch's BEFORE YOU START and
in the closing read, as its guard should, and nothing was substituted to carry either block past
it. In stages 1 and 2 the target guard's line was substituted, so that program did not run
either. The record comes first, as the rehearsal agent reported it. After it stand, as they were
written: what 0101's rehearsal and 0101's sitting on production proved about the machinery 0102
shares with it; the build lane's run of 0102's own SQL and the re-pin's run; the promotion,
simulated; and the promotion's own run of 2026-10-06. None of those is 0102's rehearsal: in none of
them did a block of this document run against a database.

### The rehearsal, 2026-10-06, as the rehearsal agent reported it

**How this record was written.** From the agent's report and from its transcripts, by a documenter
that ran no block. A line quoted below was compared with the transcript that holds it; where the
text says "the report", the agent's report is the only source.

**Where and when.** A throwaway stack named `r0102` at 127.0.0.1:56322, never production, and a
fresh clone on the promoted head `68fcd86199b138fbd60ca52ea5d741bd91ecfb31`, clean. **The clone's
origin was the local repository, not GitHub:** the head is not pushed. The agent's first clock read
was 2026-10-06 21:03:24 WEST, a Tuesday, closed hours, by machine (the report); the transcripts'
own lines run from 21:04:11 to 21:07:40 WEST. Every block ran under `/bin/zsh -f`, in a clean
environment whose two database variables named the throwaway, with psql 18.6 (all three are the
report's), against server 17.6. A block that passed ends its transcript with the runner's own line,
`TOOL-CHAIN-CONTINUED`; no block that stopped does. The report says the harness refused nothing in
the resumed run, which is the run recorded here.

**The position before any block.** The journal held 99 rows, the newest `36a1ed54...` at
1788502200000; `public` held 48 tables and 28 SECURITY DEFINER functions; and nothing of 0102
existed: `0 relations, 0 column, 0 functions, 0 policies, 0 trigger, 0102 hash in journal 0`. The
fixtures were 47 patients, 255 appointments and 2 active clinics (local fixtures, by the report),
and the database's own `idle_in_transaction_session_timeout` read `0`. The report gives the clinics'
hours as 08:00 to 20:00.

**THE SIX BLOCKS.** The word is the report's. WHOLE means every line of the block ran, with the
substitutions listed under SUBSTITUTED LINES below; in stages 1 and 2 one of them is the target
guard's line.

| Block | Word | Exit | Last line |
|---|---|---|---|
| the dispatch's BEFORE YOU START | FRAGMENTS | 1 | `STOP: the journal read failed; its lines are above. Nothing was applied` |
| stage 0 | WHOLE | 0 | `0102 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED` |
| the dispatch's CLOCK CHECK | WHOLE | 0 | `CLOCK: closed hours by the weekday table, inside the run window, on the held head BEFORE YOU START checked, with the approved document. Paste stage 1 now.` |
| stage 1 | WHOLE | 0 | `0102 APPLIED. Paste stage 2 now.` |
| stage 2 | WHOLE | 0 | `0102 POST-CHECK PASSED. 16/16 pre-check OK, 27/27 post-check OK, journal 99 to 100; tables 48 to 51, SECURITY DEFINER functions 28 to 36. Paste the closing journal read now.` |
| the closing read | NOT REHEARSED | 1 | `STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. 0102 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1. The journal read did not pass; it runs again only on the owner's or the lead's word` |

- **BEFORE YOU START ran whole as far as the reader.** Every line through
  `every check passed. The journal read runs now` printed. Then the reader refused, with a line
  that begins `REFUSED: this script reads drizzle.__drizzle_migrations, which only production uses,`
  and goes on to say that the target's ref is not production's, and the block stopped, exit 1.
  **NOT REHEARSED: the read, the grep that requires the journal to read 99, and the block's last
  line.**
- **The fragment.** The block was run once more with three lines of the dispatch draft skipped
  (563, the reader; 564, that grep; 567, the last line), so that line 565 wrote the record the
  CLOCK CHECK reads: exit 0, `held head recorded for the CLOCK CHECK: 68fcd861...`. **The CLOCK
  CHECK's input therefore came from a fragment, not from a BEFORE YOU START that passed.**
- **The CLOCK CHECK recorded**
  `68fcd86199b138fbd60ca52ea5d741bd91ecfb31 202610062100 202610062229 202610070800`: the held
  head, then the window's opening, the last minute stage 1 may start, and its end.
- **Stage 0** read
  `newest journal entry: idx 99, when 1788502300000, tag 0102_sat01_satisfaction_survey, of 100`,
  check-journal's `100 .sql files match 100 journal entries`, the clock at `22104 WEST`,
  `closed by the weekday table`, proof 1 `yes` and proofs 2 and 3 `no, by construction`.
- **Stage 1's clinic read** printed `0 of 2` and `inside`, with the same three proof lines.
- **The closing read ran whole as far as the reader:** the HEAD CHECK,
  `docs/migration-apply-0102.md: OK`, `the held head has not moved since stage 0: 68fcd861...`,
  `run window, Lisbon YYYYMMDDHHMM: everything ends before 202610070800; now 202610062106`, and the
  line with the reader's and its module's sha256. Then the same REFUSED line and the block's STOP,
  exit 1. **NOT REHEARSED: the read, its four greps (the report's count) and the last line.**
- **Not ordered by this document:** after the apply, stage 0 and stage 1 were each pasted again,
  and each stopped at its first check, exit 1, with
  `STOP: stage 1 has ALREADY APPLIED 0102 in this sitting, ...`. The report says no record was
  removed.

**THE VERDICT PROFILES.** A count is never read alone: each run is its four counts and psql's exit.

| Run | OK | FAIL | CARRY | INFO | psql's exit |
|---|---|---|---|---|---|
| the pre-check, on its own, before the apply | 16 | 0 | 8 | 6 | 0 |
| the pre-check, inside stage 1 (three runs: the two failed applies and the clean one) | 16 | 0 | 8 | 6 | 0 (the report; each block went on past it) |
| the post-check, on its own, before the apply | 0 | 0 | 0 | 0 | 3 |
| the post-check, inside stage 2 | 27 | 0 | 0 | 0 | 0 (the report; the block went on past it) |
| the post-check, on its own, after the apply | 27 | 0 | 0 | 0 | 0 |
| the pre-check, on its own, after the apply | 11 | 5 | 8 | 6 | 0 |

- **The pre-check's rows, before the apply:** `journal_rows_before` 99; verdict 2
  `1 row, newest is 0101, when 1788502200000`; verdict 10 the eight columns
  (`address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at`);
  verdict 15 exactly as stage 1's EXPECT prints it.
- **Its last two INFO rows:** `INFO idle_in_transaction_session_timeout (0 is no limit)` read `0`,
  and R39's row read `postgres: 24 tables, auth.users yes`.
- **The post-check before the apply printed no verdict:** psql exit 3 at
  `ERROR:  function "public.resolve_survey_code(text)" does not exist`, as this document says of a
  database without 0102 (arm P34 of "The build lane's run", read there through a node runner).
- **The post-check's rows, after the apply:** verdict 3 `appointment_survey_codes 5 b6cb26b5...`,
  `appointment_survey_responses 14 e2bc43fe...`, `appointment_survey_sends 10 1f14d0db...`; verdict
  6 `9 of 9; not as pinned: none`; verdict 16 `51 tables, 36 secdef, 0 not postgres`; verdict 24
  `patients:17:O::patients_survey_switch_audit():when the value changed; control 7`; verdict 25
  `0 cells differ of 16`. **The post-check run on its own after the apply is row for row stage
  2's:** the 27 verdict rows of the two transcripts are the same bytes.
- **The pre-check after the apply reads FAIL on 1, 2, `journal_rows_before`, 5 and 10,** with psql
  exit 0. That is arm N1 of "The build lane's run", read there through a node runner: what the
  pre-check prints on a database that already holds 0102.

**VERIFIED-MIGRATE'S LINES IN THE CLEAN APPLY,** in the order stage 1 printed them:
`file       0102_sat01_satisfaction_survey.sql present, sha256 matches`;
`journal    99 row(s) applied, last when=1788502200000`;
`pending    1  [0102_sat01_satisfaction_survey]`; the drizzle-kit banner, with both NOTICE objects
(42P06 and 42P07) and `migrations applied successfully!`; `stderr: (nothing)`; `exit:   0`;
`journal    99 -> 100  (delta 1)`; `0102_sat01_satisfaction_survey present by sha256: yes`;
`OK: the journal moved by exactly the pending count and carries the approved sha256.` Stage 2's
last three journal rows read id 100 `db12b967...` at 1788502300000, id 99 `36a1ed54...` at
1788502200000 and id 98 `80f85018...` at 1788502100000.

**HOW LONG IT TOOK.** `verified-migrate.mjs` and drizzle-kit print no timing. In the server's log
the apply's backend logged 69 statements between 20:06:07.447 and 20:06:07.497 UTC, about 50 ms;
the report puts statements 62 to 70 between .486 and .497, about 11 ms. The whole stage 1 block
started at 21:06:06 and ended at 21:06:07 WEST.

**3a, THE THIRD `SET LOCAL` UNDER THE REAL TOOL: REHEARSED, BY ITS EFFECT.** No script was edited,
and stage 1 ran whole. Another session held ACCESS SHARE on `patients`, so drizzle's transaction
waited for it; the agent then paused its own drizzle-kit and pnpm processes (SIGSTOP) and released
the lock (the report).

- The apply's session read `idle in transaction`, holding `AccessExclusiveLock` on `patients`, at
  each of 54 polls, the last 14.87 s after it went idle.
- It went idle at 20:05:35.073 UTC, and the server's log reads
  `2026-10-06 20:05:50.073 UTC [13142] postgres@postgres FATAL:  terminating connection due to idle-in-transaction timeout`.
  That is 15.000 s, on a database whose own value is `0`: the 15 s was the migration's third
  statement.
- At the next poll the session and its lock were gone (the report).
- Once the client was resumed (SIGCONT), the transcript read exactly as it does for a lock wait
  that ran out: `undefined`, pnpm's ERR line, `exit:   1`, `journal    99 -> 99  (delta 0)`,
  `0102_sat01_satisfaction_survey present by sha256: NO`, `FAIL: drizzle-kit migrate exited 1.`,
  then the block's `STOP: the apply exited 4: ...`, and the block exited 4.
- Afterwards: journal 99, 48 tables, 28 functions, nothing of 0102, and no applied marker (the
  report, for the marker).
- **The limit.** The client was resumed about 0.4 s after the server ended the session (the
  report). What a client that STAYS stalled shows, an apply that does not return, is NOT REHEARSED.

**3b, A LOCK WAIT THAT RUNS OUT: REHEARSED, THROUGH STAGE 1 WHOLE.** Another local session held
ACCESS SHARE on `public.patients`.

- The apply's session waited for `AccessExclusiveLock` from 20:05:15.1 UTC, and the server's log
  reads `2026-10-06 20:05:20.123 UTC [13053] postgres@postgres ERROR:  canceling statement due to lock timeout`.
- drizzle-kit's stdout ended in `undefined`, at the end of its long spinner line. Then came pnpm's
  path line, `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: drizzle-kit migrate`,
  `stderr: (nothing)`, `exit:   1`, `journal    99 -> 99  (delta 0)`,
  `0102_sat01_satisfaction_survey present by sha256: NO`, `FAIL: drizzle-kit migrate exited 1.`
  and `STOP: the apply exited 4: verified-migrate's own code if tee succeeded, ...`.
- The block exited 4. Afterwards: journal 99, 48 tables, 28 functions,
  `0 relations, 0 column, 0 functions, 0 policies, 0 trigger`, and no applied marker (the report,
  for the marker).

**3c, THE CHECK FILES UNDER PSQL: REHEARSED.** Both files ran under psql 18.6 with the blocks' own
flags (the report), each on its own before and after the apply, and inside stages 1 and 2. The
results are the profile table above.

**AFTER THE APPLY.**

- **The count check exits 1, by design.** `check-security-definer-owner.mjs` printed 36 rows that
  read `postgres OK`, then `36 SECURITY DEFINER function(s) in public.`, `FAIL: 1 problem(s):` and
  a line that begins
  `  - expected exactly 28 SECURITY DEFINER function(s) in public, found 36`. That is the count
  GATE-CHANGE owed after the apply (order table), not a defect of 0102.
- **`tests/sat01-survey-rls.db.test.ts`:** 111 passed of 111, exit 0.
- **`tests/security-definer-execute-acl.db.test.ts`:** 7 passed of 7, exit 0.

**FOUR THINGS PRINT THAT THE EXPECT LISTS DO NOT MENTION.** None contradicts a line of them.

1. **Fetch lines in BEFORE YOU START.** git's fetch lines print between `run window:` and
   `held head:`. The dispatch's EXPECT for that block does not say so (the report).
2. **A long spinner line on a failed apply, and pnpm's path line before its ERR line.** Written
   again where it is read: stage 1, "WHAT A FAILED APPLY PRINTS BESIDE THOSE TWO LINES".
3. **`banner:        final (its third line begins with the words this dispatch names)` printed on
   a banner that read NOT READY.** The dispatch's check compares the opening of line 3 with the
   words SOLO fills in and nothing else, so it reads any banner that begins with those words as
   final. What makes a banner final is SOLO's fill, not that line.
4. **psql's own lines** (`Pager usage is off.`, `Timing is off.`, `BEGIN`, `DO`, `ROLLBACK`)
   surround both tables. Written again where it is read: "What every verdict must read".

**SUBSTITUTED LINES, ONLY THESE** (the report, and the agent's substitution log). Document lines
are numbered in the bytes that were rehearsed, sha256 `e6943aa5...`; this record moved the lines
below its first edit, and it changed no line inside a block. Dispatch lines are those of the
dispatch draft the agent read, which is not in the repository.

- **The `cd` to the apply worktree became the scratch clone (6 lines):** dispatch 486 and 648;
  document 900, 1009, 1226 and 1362.
- **`/tmp/0102-` became a scratch folder's `0102-`:** 69 lines.
- **The production env file became the agent's own, holding the 127.0.0.1 URL (4 lines):**
  document 1069 and 1288; dispatch 563; document 1399.
- **The target guard's line (2 lines): document 1070 and 1289,**
  `node scripts/assert-production-target.mjs`, replaced by a `node -e` line that passes only on
  host 127.0.0.1, port 56322 and database `postgres`, with each line's own STOP tail kept. It printed
  `host: 127.0.0.1`, `port: 56322` and
  `target verified: the r0102 THROWAWAY at 127.0.0.1:56322, never production.` **So the guard
  program did not run, and neither its pass nor its refusal was read.**
- **The dispatch's four PENDING lines, filled in a scratch copy:** 464, the held head's sha; 465
  and 645, the sha256 of the document as rehearsed; 466, the bold sentence that then opened line 3
  of this document, which this record's edit replaced.
- **Skipped, in the one fragment run only:** dispatch 563, 564 and 567. The substitution log also
  lists skipped lines for other fragment copies of the blocks; the transcripts hold a run of this
  fragment only, and the report names no other.

**TEARDOWN** (the report). The stack was stopped without a backup, exit 0; no container, volume or
network named `r0102` remained, and its two ports were free. The clone was deleted. No
`/tmp/0102-*` path was written. Production, the secrets folder, the apply worktree and the build
lane's worktrees were not touched, and the agent authored no change to the repository.

### What 0101's rehearsal and 0101's sitting proved, which 0102 inherits

0102's blocks are 0101's, with the names, the counts, the carries and the head they read changed,
and they run the same pinned programs (the same sha256, compared again at `a0e96a99`). So what
those programs and those lines did for 0101 is evidence here. Each line says where it comes from.

**FROM 0101'S SITTING ON PRODUCTION, 2026-10-05, 21:01 to 21:06 Lisbon, as the lead's dispatch
reported it to this lane** (this lane read no transcript of it and did not read production):

- **The target guard and the journal reader PASS on production from the apply checkout,**
  `/Users/ivan/Projects/GitHub/osteojp-prod-apply`. Before that sitting neither had passed
  anywhere a lane could see: both refuse every target but production. 0102's stage 1, stage 2 and
  closing read run the same two programs, compared by the same sha256 first.
- **BEFORE YOU START's fetch, checkout and journal read run whole.** For 0102 the ref it resolves
  is the held branch, not `origin/main`: that one line is not proven by 0101's sitting.
- **verified-migrate reaches drizzle-kit and records the hash:** production's journal went 98 to
  99 with 0101's sha256 in the new row. 0102 runs the same program with its own tag and sha256.
- **Production's `supautils.policy_grants` is still unread.** 0101 created no policy and its
  pre-check did not read the setting. 0102's pre-check INFO row is the first read of it there.

**FROM 0101'S REHEARSAL, 2026-10-05** (`docs/migration-apply-0101.md`, "The rehearsal"; a
throwaway, psql 18.6 against server 17.6):

- **psql runs the shared constructs:** `-v` substitution, `\if :{?name}`, `ON_ERROR_STOP`, the
  aligned output that `grep` and `carry()` read, and the missing-carry STOP (psql exit 3, no
  verdict). When this was written 0102's two check FILES had not run under psql. They have
  since: on their own ("The re-pin's run") and inside stages 1 and 2 ("The rehearsal,
  2026-10-06").
- **The timeouts take effect under drizzle's own transaction,** and a fired one reads as stage 1's
  "WHEN A BOUND FIRES" says.
- **Of 0101's six blocks one ran whole; the five others stopped at their own STOP** (the merge
  ref, the target guard, the reader), and nothing was substituted to carry them past. This said
  that 0102's rehearsal would meet the same three walls. It met one, the reader, twice: the held
  ref resolved, because the clone's origin was the local repository, which holds the head; and
  the target guard's line was substituted in stages 1 and 2 ("The rehearsal, 2026-10-06").

### The build lane's run, 2026-10-05

**Everything in this subsection was run on the third review's bytes** (`43a1616a...`, 74
statements, one statement per foreign key, no third `SET LOCAL`), and its statement numbers are
that file's. What was run again on the re-pinned bytes is the next subsection, "The re-pin's run,
2026-10-06", which also lists what was NOT run again.

**Where.** The lane stack `amber` (project `OsteoJP-amber`, 127.0.0.1:54722), started by
`node scripts/lane-stack.mjs up --lane amber` from this branch's `supabase/migrations` after main
was merged in, **0000 to 0101 as main holds them** (0101 arrived the normal way, from the mirror,
with the two 25P01 WARNING lines a SET LOCAL prints outside a transaction block, as 0100 does),
with the e2e seed (45 patients, 255 appointments, 254 concluded; no real name), and stopped by the
build lane afterwards. `supabase/postgres` 17.6. Before 0102 it read 48 tables, 28 SECURITY DEFINER
functions and the `guest_booking_requests.email` column. A drizzle journal of 99 rows was built
from main's `_journal.json` with each file's sha256, the newest 0101's (`36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b`, `when`
1788502200000): the position 0102 will find. 0102 was applied with node and the `postgres` package
from the pending file (the third review's bytes), in ONE transaction, one statement per
`--> statement-breakpoint` chunk as drizzle sends them, and its journal row was written by hand.
**psql did not run, and verified-migrate did not run.** The check files' SQL ran through a node
runner that substitutes the `-v` values and drops psql's own backslash lines. (The first run of
this revision, the same morning, was on the lane `blue` with 0101 applied by node from its pending
bytes; it read the same verdicts. `blue` was in use by another session in the evening.)

| Run | Result |
|---|---|
| pre-check, unapplied (0101 the newest row, by hash, at `when` 1788502200000) | **16 OK / 0 FAIL**, 8 CARRY, 6 INFO; journal 99; secdef 28; tables 48; the patient's eight columns; verdict 15 as printed under stage 1's EXPECT; `INFO idle_in_transaction_session_timeout (0 is no limit)` read `0`; R39's row `postgres: 24 tables, auth.users yes` |
| the 0102 body, one transaction, one round trip per statement | 58.9 ms and 60.4 ms with its journal row and the COMMIT (applied, taken off again for the lock-timeout runs, applied again); `lock_timeout` read `5s` and `statement_timeout` `1min` inside it |
| no row changed | one md5 over every `patients` row's `id`, `xmin` and `ctid`, and the same for `appointments`, identical before and after (45 and 255 rows), and both tables' file nodes unchanged: no row was written or moved. (Read in one rolled-back transaction on the applied stack: 0102 taken off, the rows fingerprinted, 0102 applied, fingerprinted again. The throwaway holds no patient, so a reading there would have been an empty comparand.) |
| post-check, with the pre-check's carries | **27 OK / 0 FAIL**; 51 tables, 36 SECURITY DEFINER functions; `anon` and `patient` denied on all three in action; resolve zero rows; state `not_allowed`; the trigger `patients:17:O::patients_survey_switch_audit():when the value changed`; `0 cells differ of 16` |
| the DB-gated suite `sat01-survey-rls.db.test.ts`, applied side | **111 of 111 passed** |
| the same suite on the same stack BEFORE 0102 was applied (0101 the newest row) | the one "not applied" arm registered, 1 of 1; nothing skipped |
| the whole `packages/db` suite on the applied stack | 100 files, 1537 of 1538 passed (0101's own suite among them, its applied arms); the one failure is the 0079 ACL test's denied list, owed at the promotion (order table, row 2) |
| `check-security-definer-owner.mjs` on the applied stack | `expected exactly 28 ... found 36`: owed after the apply (order table, row 4) |
| the SET LOCAL gate, `scripts/migration-timeouts.test.mjs`, on this branch | passes, the pending file in scope with no problem (run inside `pnpm test:scripts`) |
| G6, the locks, statement by statement | as listed under "G6": PASS, platform locks at 2 of 74 (73 and 74); no lock on any existing table before statement 61 |
| the deadlock arms, both orders, and a transaction that arrives during the group | as listed under "G6": the read-then-write transaction untouched in this order and ended (40P01) in the other; the write-then-read one ended in this order when it waits first, and the MIGRATION ended (40P01, or 55P03 at 5.0 s) when the migration waits first; a newcomer waits and is answered |
| a stalled applier, with and without `idle_in_transaction_session_timeout` | as listed under "G6": a reader waits as long as the applier stalls at `0`, and 2.0 s at `2s` |
| L1: another session holds each lock of the group in turn (five runs, the lane, 0102 taken off first) | the body failed after 5.0 s, `55P03 canceling statement due to lock timeout`, at statements 61, 65, 67, 70 and 73; nothing of 0102 existed afterwards |
| R39's read, twelve values of the setting | as listed under "What every verdict must read": never an error |
| an EMPTY `prev_when` | 15 OK, 1 FAIL, the FAIL on verdict 2: a FAIL, not a STOP (stage 1, "AN EMPTY `prev_when`") |

**Every control broken on purpose, each in its own rolled-back transaction** (so verdict 0 reads
FAIL in every arm, the transaction being writable; the pre-check arms first take 0102 off again
inside the same transaction):

| Arm | Result |
|---|---|
| U0 the pre-check, 0102 taken off and nothing planted | FAIL on 0 only (the control of the arms below) |
| U1 a TABLES default granting a foreign role | FAIL on 0, 8 |
| U2 a FUNCTIONS default granting a foreign role | FAIL on 0, 9 |
| U3 a ninth `patients` column granted to `patient` | FAIL on 0, 10 |
| U4 a column 0102 reads renamed | FAIL on 0, 6 |
| U5 a viewer helper made SECURITY INVOKER | FAIL on 0, 7 |
| U6 a journal row after 0101 | FAIL on 0, 2, `journal_rows_before` |
| U7 the patients table emptied | FAIL on 0, 14 |
| U8 half applied: the column left in place | FAIL on 0, 5 |
| U9 half applied: the trigger function left in place | FAIL on 0, 5 |
| U10 `authenticated` loses its table UPDATE on `patients` | FAIL on 0, 15 |
| U11 a column-level UPDATE on a reminder switch granted to `authenticated` | FAIL on 0, 15 |
| U12 a third UPDATE policy on `patients` | FAIL on 0, 15 |
| U13 `patients_update` widened to PUBLIC | FAIL on 0, 15 |
| U14 `anon` granted UPDATE on a reminder switch | FAIL on 0, 15 |
| U15 `jwt_patient_id()` missing | FAIL on 0, 7 |
| U16 `users.tenant_id` renamed | FAIL on 0, 6 |
| U17 a trigger added to another table | FAIL on 0 only: the pre-check has no verdict on it; the `triggers_md5` carry moves, which is the post-check's business |
| N1 the pre-check on the APPLIED database | FAIL on 1, 2, `journal_rows_before`, 5, 10 (a second apply is refused before it starts) |
| N12 the pre-check without `prev_hash` | STOP, before any verdict |
| P0 the post-check, nothing changed | FAIL on 0 only |
| P1 INSERT granted on sends to `authenticated` | FAIL on 0, 8 |
| P2 the purge granted to `authenticated` | FAIL on 0, 7 |
| P3 the S7 policy widened to the tenant | FAIL on 0, 5 |
| P4 RLS off on the answers | FAIL on 0, 1 |
| P5 an unrelated policy added | FAIL on 0, 11 |
| P6 an unrelated table granted to `anon` | FAIL on 0, 13 |
| P7 the patient's `survey_enabled` grant revoked | FAIL on 0, 10, 25 |
| P8 one patient's switch off | FAIL on 0, 9 |
| P9 a send row seeded | FAIL on 0, 17 |
| P10 `resolve_survey_code` made SECURITY INVOKER | FAIL on 0, 6, 16, 21 |
| P11 an unrelated function's settings changed | FAIL on 0, 12 |
| P12 a default privilege added | FAIL on 0, 15 |
| P13 an unrelated column granted to `patient` | FAIL on 0, 10, 14 |
| P14 0102's journal row missing | FAIL on 0, 22, 23 |
| P15 the codes table granted to `anon` | FAIL on 0, 8, 18 |
| P16 a column added to sends | FAIL on 0, 2 |
| P17 a CHECK dropped | FAIL on 0, 3 |
| F1 to F10, from the sweep: a late foreign key missing (four of them), renamed, without its CASCADE, with a CASCADE it must not have, NOT VALID, DEFERRABLE, to another table | FAIL on 3, each |
| G1, from the sweep: the read door back in SQL-language | FAIL on 6 |
| P18 an index dropped | FAIL on 0, 4 |
| P19 a door's body replaced | FAIL on 0, 6 |
| P20 R34: the audit trigger dropped | FAIL on 0, 24 |
| P21 R34: the audit trigger disabled | FAIL on 0, 24 |
| P22 R34: the trigger narrowed to `UPDATE OF survey_enabled` | FAIL on 0, 24 |
| P23 R34: the trigger without its WHEN | FAIL on 0, 24 |
| P24 R34: the trigger made BEFORE UPDATE | FAIL on 0, 24 |
| P25 R34: the trigger function made SECURITY INVOKER | FAIL on 0, 6, 16 |
| P26 R34: the trigger function's body replaced | FAIL on 0, 6 |
| P27 R34: the trigger function granted to `authenticated` | FAIL on 0, 7 |
| P28 R34: a column-level UPDATE on `survey_enabled` granted to `anon` | FAIL on 0, 25 |
| P29 R34: a column-level UPDATE on a reminder switch granted to `anon` (the profiles differ) | FAIL on 0, 14, 25 |
| P30 R34: `authenticated` loses its table UPDATE on `patients` | FAIL on 0, 13, 25 |
| P31 an unrelated trigger added | FAIL on 0, 26 |
| P32 the patient-number trigger dropped (verdict 24's control) | FAIL on 0, 24, 26 |
| P33 a second trigger of the same name on another table | FAIL on 0, 24 |
| P34 the post-check on a database WITHOUT 0102 | a statement error (`42883 function "public.resolve_survey_code(text)" does not exist`), no verdict printed: a missing subject is a STOP, and stage 2's STOP for it says the state is UNKNOWN |
| N12 the post-check without `triggers_md5` | STOP, before any verdict |

The scratch files of this run (the journal fixture, the node runner, the arm runner, the lock
reader and the sweep) are in the build lane's scratchpad and not committed.

### The re-pin's run, 2026-10-06 (ruling R44; gates G4 and G5 of S-1006-A)

**On these bytes** (`db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`, 70 statements). **Where.** The
lane stack `purple` (project `OsteoJP-purple`, 127.0.0.1:54522), started from another worktree's
mirror and found at 0101: `supabase/postgres` 17.6, 48 tables, 28 SECURITY DEFINER functions, the
`guest_booking_requests.email` column, 47 patients and 255 appointments (254 concluded; seed rows,
no real name), no drizzle journal. A drizzle journal of 99 rows was built from this branch's
`_journal.json` with each file's sha256, the newest 0101's (`36a1ed54...`, `when` 1788502200000),
and removed afterwards. 0102 was applied with node and the `postgres` package from the pending file,
in ONE transaction, one statement per `--> statement-breakpoint` chunk as drizzle sends them, with
its journal row. **The two check files ran under psql 18.6 this time,** with the flags the blocks
give psql (`-X -P pager=off -v ON_ERROR_STOP=1`, the `-v` values, and for the post-check `-c
"begin read only" -f ... -c "rollback"`) and the block's own `carry()` program reading the ten
carries out of the pre-check's transcript. **No block of this document ran, and verified-migrate
did not run.** Only 127.0.0.1 was contacted.

| Run | Result |
|---|---|
| pre-check under psql, unapplied (0101 the newest row, by hash, at `when` 1788502200000) | **16 OK / 0 FAIL**, 8 CARRY, 6 INFO, psql exit 0; journal 99; secdef 28; tables 48; `INFO idle_in_transaction_session_timeout (0 is no limit)` read `0`; R39's row `postgres: 24 tables, auth.users yes` |
| the 0102 body, one transaction, one round trip per statement, its journal row, COMMIT (three real applies, 0102 taken off between them) | 57.0 ms, 34.8 ms and 34.4 ms; `lock_timeout` read `5s`, `statement_timeout` `1min` and `idle_in_transaction_session_timeout` `15s` inside the transaction (read in the rolled-back lock run) |
| no row changed | one md5 over every `patients` row's `id`, `xmin` and `ctid`, and the same for `appointments`, identical before the first apply, after it, after the suite and after the last take-off (47 and 255 rows); `audit_log` held 0 rows before and after |
| post-check under psql, with the pre-check's carries | **27 OK / 0 FAIL**, psql exit 0; 51 tables, 36 SECURITY DEFINER functions; verdict 3's three literals as pinned, `5 b6cb26b5...`, `14 e2bc43fe...`, `10 1f14d0db...`: **the three folded statements leave the catalogue the eight left**; the trigger `patients:17:O::patients_survey_switch_audit():when the value changed`; `0 cells differ of 16` |
| the DB-gated suite `sat01-survey-rls.db.test.ts`, applied side (the file is byte for byte the third review's) | **111 of 111 passed**, exit 0 |
| the same suite after 0102 was taken off (0101 the newest row) | the one "not applied" arm registered, 1 of 1, exit 0; nothing skipped |
| G5, the locks, statement by statement | as listed under "G6": PASS, platform locks at 2 of 70 (69 and 70); no lock on any existing table before statement 62 |
| another session holds each lock of the group in turn (five runs) | the body failed after 5.0 s, `55P03 canceling statement due to lock timeout`, at statement 62, at statement 66 three times (waiting for `appointments`, `tenants` and `users` in turn, read from `pg_locks`) and at statement 69; nothing of 0102 existed afterwards |
| G5, a stalled applier | as listed under "G6": the server ended the session 15.00 s after it went idle, its lock was gone from `pg_locks`, and a waiting read of `patients` was answered after 15.01 s |
| the deadlock arms in this file's order, and a transaction that arrives during the group | as listed under "G6": the read-then-write transaction untouched; the write-then-read one ended (40P01) when it waits first, and the MIGRATION ended (40P01, or 55P03 at 5.01 s) when the migration waits first; a newcomer waits and is answered |
| the pre-check again, under psql, after the last take-off | 16 OK, and every verdict, CARRY and INFO row identical to the first run: the throwaway was left as it was found (but for three dropped-column slots on `patients`, one per apply and take-off, which no check reads) |
| the SET LOCAL gate, `scripts/migration-timeouts.test.mjs`, alone, not edited | exit 0: 13 of 13 passed, the pending file in scope with no problem (three files in scope: 0100, 0101 and this one); the gate file hashes to `SHAGATE`, unchanged |
| this document's script test, `scripts/sat01-tables-0102.test.mjs` | exit 0: 40 of 40 passed, none skipped (macOS, zsh installed): the shape rules and their controls, the pins, and the 221 faults of the harness under bash and under zsh, on the four blocks as they now stand |
| `pnpm test:scripts` | exit 0: 1425 of 1425 passed, none skipped (the gate freeze among them: no gate file moved) |

**NOT RUN AGAIN ON THESE BYTES, said one by one.** Each stands as measured on the third review's
bytes, above and below, and each is named here so that nobody reads it as a measurement of this
file:

- the whole `packages/db` suite on the applied stack, and `check-security-definer-owner.mjs`;
- the control arms of the two check files (U0 to U17, N1, N12, P0 to P34, F1 to F10, G1), R39's
  read on twelve values of the setting, and the empty `prev_when`. The check files changed in
  their pinned sha256 literal and in two comments, and in no predicate. (Two of those arms were
  read on these bytes since, under psql, in the rehearsal of 2026-10-06: N1 and P34. The others
  were not);
- the "foreign keys first" column of the order table in "G6", which is not this file's order;
- the promotion, simulated (next subsection);
- the four mutation sweeps ("Review history"). **No sweep was run over this re-pin.** What a sweep
  would mutate here is the script test's new and changed rules (the third line, the seven `ALTER
  TABLE` statements, the order of the clauses), and each has its own red arm in the test;
- the Linux container run of the script test.

### The promotion, simulated, 2026-10-05

Three times, each on a local scratch branch cut from this branch, never pushed and deleted after
the measurement: `git mv` of the pending file to
`packages/db/migrations/0102_sat01_satisfaction_survey.sql`, the journal entry appended at
`idx 99`, `when` 1788502300000, and `node scripts/sync-supabase-migrations.mjs`. The first run
found what the promotion owes. The second, after the review, added everything it owes and set the
count to its post-apply value, to read the whole tree as it will stand at row 6 of the order table.
The third repeated the second on the third review's bytes, after the second review moved the foreign
keys. **None of the three was repeated on the re-pinned bytes** (see the end of this subsection).

**THE PROMOTION ALONE (what is red at the promotion, and why):**

| Run | Result |
|---|---|
| the migration's sha256 after the rename | `43a1616a78d5b0c940873eda4dd16f1b2392010e7016b39ed53f0f36cd56a5e1`, unchanged |
| `node scripts/check-journal.mjs` | exit 0: 100 files, 100 entries, in order, `when` strictly increasing, the mirror matching by content |
| `pnpm test:scripts` (first run) | **exit 1: 1421 of 1422.** The one failure: `scripts/import/cleanup-test-patients.test.mjs`, "every table with an FK path to patients is covered", `appointment_survey_sends has an FK path to patients but the script never deletes from it`. This document's own script test, 0101's and 0100's passed with the journal one entry longer |
| `packages/db/tests/security-definer-owner.test.ts`, the count at 28 | **7 failed of 28, all seven the count** |
| the same test, the count at 28, on the bytes the first review read | 8 failed of 28: the seven, and the helper's owner pin |
| the cleanup test with row 1's edit on the promoted tree | 24 of 26: the script has no delete from the three, and `schema.ts` does not name them |
| the same, plus the three deletes in the cleanup script | 25 of 26: `appointment_survey_responses is deleted but is not in schema.ts` |
| row 1's edit alone on TODAY's tree (not promoted) | 26 of 26: the GATE-CHANGE is green before the promotion, as #1436 was |

**THE WHOLE ORDER, TO ITS END (the second run): the promotion, the three ordinary edits it owes
(the cleanup script's deletes, the three tables declared in `schema.ts`, the ACL test's two
names), row 1's edit to the cleanup test, and `EXPECTED_COUNT` at 36.**

| Run | Result |
|---|---|
| `packages/db/tests/security-definer-owner.test.ts`, the count at 36 | **28 of 28. ZERO failing arms** |
| the same test, the count at 36, on the bytes the first review read | 1 failed of 28: `0102_sat01_satisfaction_survey.sql: pin of survey_manual_verdict, which is not a SECURITY DEFINER function`. The review's finding, reproduced |
| `pnpm test` (every unit test of every package, the readers of the migrations folder among them) | exit 0: 8 of 8 tasks, no failed test |
| `pnpm typecheck`, `pnpm lint` | exit 0 each (11 of 11 tasks; 4 of 4) |
| `scripts/import/cleanup-test-patients.test.mjs` | 26 of 26 |
| `pnpm test:scripts` | exit 1: 1422 of 1423, and the one failure is "the manifest on disk": the two frozen files this scratch tree edited, `packages/db/scripts/check-security-definer-owner.mjs` and `scripts/import/cleanup-test-patients.test.mjs`, are the two the gate freeze names (`CHANGED`), which is what rows 1, 4 and 4b regenerate the manifest for. No other script test is red |
| a lane built from that tree's own mirror, 0000 to 0102 (`supabase db reset`; six 25P01 WARNING lines, two each for 0100, 0101 and 0102) | built |
| `check-security-definer-owner.mjs` on it | exit 0: `36 SECURITY DEFINER function(s) in public. OK: all 36 owned by postgres` |
| the whole `packages/db` DB-gated suite on it (the second run) | **100 files, 1534 of 1534 passed, none skipped** (this suite's applied arms as they stood at that run, registered because the promoted file is found; the 0079 ACL test with its two names). One fewer registered than the build lane's later 1535: the arm the third sweep added ("each door carries its own test") was written after this run and has run on the build lane only |

**THE THIRD RUN, ON THE THIRD REVIEW'S BYTES (`43a1616a78d5b0c940873eda4dd16f1b2392010e7016b39ed53f0f36cd56a5e1`), after the second review: the same whole order.**

| Run | Result |
|---|---|
| the migration's sha256 after the rename; `check-journal.mjs` | unchanged; exit 0, 100 files and 100 entries, the mirror matching by content |
| `security-definer-owner.test.ts`, the count at 28 | 7 failed of 28, all seven the count (`expected 36 to be 28` and its kin) |
| **the same test, the count at 36** | **28 of 28. ZERO failing arms** |
| **the frozen cleanup test AS IT IS ON MAIN, on the promoted tree** | 24 of 26: `appointment_survey_sends has an FK path to patients but the script never deletes from it`. **It sees the eight late foreign keys:** `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` is one of the five DDL forms its graph reads, so moving them out of `CREATE TABLE` did not hide the three tables from it |
| the cleanup test with row 1's edit, the three deletes and the three tables in `schema.ts` | 26 of 26 |
| `pnpm test:scripts` | exit 1: 1424 of 1425, the one failure "the manifest on disk", naming the two frozen files this scratch tree edited and nothing else |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` | exit 0 each (11 of 11, 4 of 4, 8 of 8 tasks) |
| a lane built from that tree's own mirror, 0000 to 0102 (six 25P01 WARNING lines) | built |
| `check-security-definer-owner.mjs` on it | exit 0: `OK: all 36 owned by postgres` |
| the whole `packages/db` DB-gated suite on it | **100 files, 1538 of 1538 passed** (this suite's 111 applied arms among them; the 0079 ACL test with its two names) |

**What it shows.** With the fix to the SQL, the documented order reaches green: after the apply,
the count's GATE-CHANGE and the merge, no test that reads the migrations for pairing, counting or
naming is red. The promotion commit owes four things beside the rename and the journal, and only
the first is a gate file, so it goes first and alone: the cleanup test's GATE-CHANGE (row 1); the
three deletes in the cleanup script; the three tables in `schema.ts`; and the 0079 ACL test's
list. **What it is not:** the `schema.ts` declarations and the cleanup deletes written on the
scratch tree are the measurement's, not the promotion's reviewed text; `supabase db reset` applies
each mirror file outside a transaction and through no drizzle journal; and CI did not run.

**NOT REPEATED ON THE RE-PINNED BYTES, AND ONE THING THE FOLD CHANGES IN IT (measured in memory,
2026-10-06, with no file moved).** The frozen cleanup test builds its graph of foreign keys from the
migrations' text, and its pattern for `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` reads the
FIRST clause of a statement only. Its own three patterns, run over main's migrations plus this
file: from the third review's bytes they read 10 edges (all ten foreign keys); from the re-pinned
bytes they read 5 (sends to appointments, codes to tenants, answers to appointments, and the two
inline keys to the sends). **The three tables are still reached from `patients`, through
`appointments`: 24 patient-rooted tables with either file, 21 on main alone.** So row 1 of the
order table stands as written and the cleanup test still goes red at the promotion until it learns
the three tables; but the sentence above, "It sees the eight late foreign keys", is true of the
third review's bytes and not of these. The test is a gate file and was not edited. Whether its
graph should read every clause is a question for its own GATE-CHANGE, not for this branch.

### The promotion's run, 2026-10-06

**The real promotion, on the re-pinned bytes** (`db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`,
70 statements), on the branch `db/0102-sat01-tables` at `1bb0a195`, one commit above `origin/main`
(`dbe63d87`, which holds #1544). **It is not the rehearsal: no block of this document ran, psql did
not run and verified-migrate did not run.** What it proves is the promotion itself: the rename, the
journal, the mirror, and the suites that read them.

**Where the database runs were made.** The lane stack `purple` (127.0.0.1:54522), found at 0101:
`supabase/postgres` 17.6, 48 tables, 28 SECURITY DEFINER functions, 47 patients and 255
appointments (seed rows, no real name), no drizzle journal. The promoted file was applied to it
with node and the `postgres` package, in ONE transaction, one statement per
`--> statement-breakpoint` chunk (70 statements, 60.9 ms), with no journal row: CI's database is
built from the mirror and has no drizzle journal either. Only 127.0.0.1 was contacted. **0102 was
taken off the throwaway again afterwards** (the trigger, the column, the three tables and the nine
functions dropped in one transaction), and it then read 48 tables, 28 SECURITY DEFINER functions,
no survey relation, column, function, trigger or policy, and the row counts it had before
(`patients` carries one more dropped-column slot, four where it had three, which no check reads).

| Run | Result |
|---|---|
| 0101's journal entry, read from the journal before the append | `idx 98`, `when` 1788502200000, tag `0101_guest_request_email`, the newest of 99: the values this document pins |
| the migration's sha256 before and after `git mv` | `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`, unchanged |
| `node scripts/sync-supabase-migrations.mjs`, then `node scripts/check-journal.mjs` | `Synced 100 migration(s)`; exit 0: 100 files, 100 entries, in order, `when` strictly increasing, the mirror matching by content |
| the frozen cleanup test (as #1544 left it) on the promoted tree, before the ordinary edits | **exit 1: 24 of 26.** `appointment_survey_sends is in DELETE_ORDER but the script has no delete from it`, and `appointment_survey_codes is deleted but is not in schema.ts` |
| the same, with the three deletes in the cleanup script | **exit 1: 25 of 26.** `appointment_survey_codes is deleted but is not in schema.ts`. **The simulation read `appointment_survey_responses` in that message, and this run reads `appointment_survey_codes`:** the arm names the first table of the test's `DELETE_ORDER` that `schema.ts` lacks, and #1544 lists the codes first where the simulation's scratch edit listed the answers. The same arm, for the same cause |
| the same, with the three tables declared in `schema.ts` | exit 0: 26 of 26 |
| the three new deletes of the cleanup script, on the applied throwaway, each run in a transaction that was rolled back | As written (the script's tenant is not on the lane): 0 rows each, no error. With one send, its code and its answer planted for a seed appointment, and the lane's tenant in place of the script's literal: 1, 1 and 1 row deleted, in the script's order (answers, codes, sends), none left. The control, the sends before the answers: refused, 23503, `appointment_survey_responses_send_id_fkey` |
| `check-security-definer-owner.mjs` on the applied throwaway | **exit 1, BY DESIGN:** `36 SECURITY DEFINER function(s) in public.`, then `expected exactly 28 SECURITY DEFINER function(s) in public, found 36`; each of the 36 is owned by `postgres`. Owed after the apply (order table, row 4) |
| the whole `packages/db` suite on the applied throwaway, BEFORE the ACL list gained its two names | exit 1: 101 files, 1545 of 1553 passed, 8 failed. One is the 0079 ACL test's denied list (it received `patients_survey_switch_audit` and `purge_expired_survey_comments`, which it did not expect); seven are the count arms of `security-definer-owner.test.ts` |
| the same, with the two names in the list | **exit 1, BY DESIGN:** 101 files, 1546 of 1553 passed, 7 failed, **all seven the count**, in `security-definer-owner.test.ts` (21 of its 28 arms pass; the simulation read the same 7 of 28). `sat01-survey-rls.db.test.ts` 111 of 111, the ACL test 7 of 7, none skipped in the three files |
| `node --test scripts/sat01-tables-0102.test.mjs`, the file not edited | exit 0: 40 of 40, none skipped (macOS, zsh installed): it finds the migration at its promoted path, and its fault-injection sweeps pass under bash and under zsh on the four blocks, which the promotion did not touch |
| `node --test scripts/migration-timeouts.test.mjs`, the gate, not edited | exit 0: 13 of 13; three files in scope, this one under its promoted name |
| `pnpm test:scripts` | exit 0: 1425 of 1425, none skipped |
| `GATE_BASE_REF=main node scripts/assert-gates-unchanged.mjs` | exit 0: 98 gate files match their pins. One gate file the manifest does not name yet, which the freeze allows: this document's script test |
| `pnpm typecheck`, `pnpm lint` | exit 0 each: 11 of 11 tasks, and 4 of 4 tasks (no error) |
| `pnpm test` (every unit test of every package, no database) | **exit 1, BY DESIGN:** with turbo told to continue, 7 of 8 tasks pass and `@osteojp/db` fails on the same seven count arms and on nothing else (558 passed, 870 skipped for want of a database). This is the second of the two required checks that read the count |

**What it shows.** The promotion owed exactly what the simulation said it would: the rename, the
journal entry, the mirror, and the three ordinary edits, with no gate file touched. From this
commit two checks read red, both on the count and on nothing else, until the count's GATE-CHANGE
(order table, row 4). **What it does not show:** the seven count arms were not read at 36 on this
tree, because the count is a gate file and was not edited (that they read zero at 36 is the
simulation's measurement, on the third review's bytes); the two check files and the blocks did not
run; and CI did not run.

### NOT REHEARSED, said one by one

After the rehearsal of 2026-10-06 these stay NOT REHEARSED:

- **Both journal-reader reads, and the reader's own target check passing.** The reader refuses any
  target but production, and it refused the throwaway twice ("The rehearsal, 2026-10-06"). So in
  the dispatch's BEFORE YOU START: the read, the grep that requires the journal to read 99, and
  the last line. And in the closing read: the read, its four greps and the last line,
  `CLOSING READ: the journal reads 100, 0102 is APPLIED, and nothing is pending on the recorded sha.`
  Both passed on production in 0101's sitting (above), for 0101.
- **The target guard, `scripts/assert-production-target.mjs`, passing or refusing.** Its line was
  substituted in stages 1 and 2, so the program did not run in the rehearsal, and its `ref:` line
  and `target verified: production, session pooler.` were not printed. It passed on production in
  0101's sitting (above).
- **The CLOCK CHECK on the input a passing BEFORE YOU START writes.** The record it read was
  written by a fragment of BEFORE YOU START, run with the reader, its grep and the last line
  skipped. The CLOCK CHECK itself ran whole.
- **The held head, for real.** No block has resolved `origin/db/0102-sat01-tables` against the
  real remote: the rehearsal's origin was the local repository, and the promoted head is not
  pushed. The branch is on origin since the held pull request, #1551, was opened (read on
  2026-10-06, at the promotion: the branch and `refs/pull/1551/head` both resolved to `1bb0a195`,
  the commit before the promotion commit). In the harness, on stubs, each block resolved it, stage
  1 halted on a moved head, and each block stopped on a branch that was gone.
- **A deadlock that ends the apply, through `verified-migrate.mjs`.** Measured with node on the
  lane ("G6"), and not run in the rehearsal. What GREEN's transcript shows for a statement that
  fails inside drizzle's transaction is now read on these bytes for a lock wait that ran out (3b);
  that a deadlock reads the same is an inference from that, not a run.
- **A client that stays stalled past the server's 15 seconds.** In 3a the paused client was resumed
  about 0.4 s after the server ended its session. What stage 1 prints, and when, if the client does
  not come back (an apply that does not return) was not run.
- **The pass direction of the Saturday and Sunday windows, and any clock STOP, on a real clock.**
  The rehearsal ran on a Tuesday between 21:04 and 21:07 Lisbon, so every clock arm passed on the
  Monday to Friday row, the dispatch's start-window line read `inside strategy's start windows`
  for weekday 2, and no clock STOP fired. No block has passed on a real clock on a Saturday after
  13:00 or on a Sunday. The harness runs those minutes, and each STOP, on stubs.
- **The whole `packages/db` suite on these bytes as drizzle-kit applied them.** The rehearsal ran
  two of its files after the apply (111 of 111, and 7 of 7). The whole suite was last run in "The
  promotion's run", on a throwaway the body had reached through node.
- **Production's own journal row for 0101.** This lane read `main`: the promoted file, its sha256
  and its journal entry. That production's newest row is that hash at that `when` is the lead's
  report of the sitting; pre-check verdict 2 reads it for itself, and FAILs if it is not so.
- **Production's platform configuration.** G6 was measured on two local stacks; production's
  `supautils.policy_grants` was not read. The pre-check's INFO row is its first read. On the
  rehearsal's throwaway that row read `postgres: 24 tables, auth.users yes`.
- **The cleanup script, whole.** The promotion's three ordinary edits are written since 2026-10-06
  (the cleanup script's deletes, the `schema.ts` declarations, the ACL list) and measured in "The
  promotion's run". Of the cleanup script, only its three new deletes ran, on the throwaway, in
  transactions that were rolled back. The script itself is the owner's, for one tenant of another
  database, and was not run. Its STEP 1 preview counts none of the three tables: the promotion
  added the three deletes and nothing else.
- **CI's `db-tests` on the promoted head:** by construction it stops at the count step until row 5.
- **GREEN's dispatch as issued.** Its two blocks were run from a draft, with its four PENDING
  lines filled in a scratch copy. The dispatch is not issued (NOT READY step 7), and the banner
  sentence, the document's sha256 and the head it will name are not the ones the rehearsal filled
  in: this record changed the first two, and its commit moves the head. **So the sitting runs from
  a later head than the rehearsed one.** When this is written the two differ in this document and
  its sidecar only, and in no fenced block ("Review history").

**Off this list since the rehearsal of 2026-10-06,** each with its limit in "The rehearsal,
2026-10-06":

- **Every block of this document against a database, bar the closing read's journal read.**
  Stages 0, 1 and 2 ran whole to their last lines, with the substitutions listed there; until then
  the blocks had run whole only in the fault-injection harness, on stubs.
- **0102's check files under psql, INSIDE THE BLOCKS:** 16 OK and 0 FAIL in stage 1, 27 OK and 0
  FAIL in stage 2 (the whole profiles are in the table there), and the block's own `carry()`
  program fed stage 2 from stage 1's transcript.
- **`verified-migrate.mjs` and drizzle-kit, on 0102's body:** journal 99 to 100, with the file's
  sha256 in row 100.
- **A fired bound that ends the apply, through `verified-migrate.mjs`:** one lock wait, at
  `patients`, through stage 1 whole (3b). The four other locks stand as measured with node ("G6").
- **The third `SET LOCAL` under drizzle-kit, and a stalled apply through `verified-migrate.mjs`:**
  by its effect, with the limit that the client was resumed (3a).
- **The dispatch's CLOCK CHECK, whole,** on a fragment's input.

### The fault-injection harness (not a rehearsal)

**Why.** In a Claude session `set -e` stops no pasted block (see the paragraph after THE HALT RULE).
Every block halts by explicit guards, and `scripts/sat01-tables-0102.test.mjs` proves it on every
CI run.

**How.** As 0101's harness: each block, extracted verbatim, runs as
`true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`. Every external command it calls
(git, psql, node, pnpm, shasum, tee, mv, rm, touch, cat, find, date, grep, cut, awk, head, tail, wc,
tr) is a stub on PATH: git, psql and the node programs never run for real (`node -e` does, on local
files), and the block's `cd`, its `/tmp/0102-` paths and its env file are moved into a scratch folder
first, so nothing touches a real host, the secrets folder or a database. The fake apply tree is
built from what the branch holds: the migration at its promoted path (the same bytes), and a
journal that is **the live journal cut at its predecessor's entry, with this migration's own entry
appended**, so a later promotion (0102's own, then 0103 and on) cannot redden this test. 0101's real file is copied beside it, and the test requires it to hash to `SHAPREV` and its
journal entry to be the one this document pins (`idx 98`, `when` 1788502200000), or it fails. (Until
0101 reached main the harness stood a file in for it; that path is gone.) The positive control runs each
block with every stub succeeding and requires its last line. Then each call is made to fail in
turn, and the block must (a) exit non-zero with the tool chain stopped, (b) print none of its pass
lines, (c) write none of its records after the failing point, and print a `STOP:` line. Extra
faults: the apply worktree missing, the env file missing, a record path that is a directory,
verified-migrate exiting 2, 4 and 5 as well as 3, and every clock read and every field of the
window record exiting 0 with EMPTY output. The stub `date` refuses to answer unless the block
called it with `TZ=Europe/Lisbon`.

**THE STATIC RULES** (no run needed): every block resolves the held branch once and never names `origin/main`; stage 1 hands the pre-check the predecessor's hash and `when` and hands verified-migrate this migration's tag, its sha256 and exactly one pending, and stage 2 reads each of the ten carries from the row of its own name and passes it under its own name (a faked program does not read its arguments, so only the text can show these); `TZ=Europe/Lisbon` and `%Z` on every `date` call, with the
zone check on the next line; the post-commit sentence on every STOP of stage 2 and the closing
read, and the UNKNOWN sentence on exactly the six; two shas compared only as checked variables,
and the sidecar asserted in every block; an explicit halt on every command, test, `[ ... ]`,
`shasum -c` and `grep -q` line; `set -e` nowhere but each block's second line; no `#` line, no `!`
but `test !`, no backslash continuation, and never the apply worktree's old place.

**A ZONE THAT DID NOT LOAD** runs every block whole with a clock that answers `UTC`, `GMT`, `CET`,
`west` or no zone at all: each STOPs at the clock, with nothing recorded and no guard, psql, apply or
reader run after it; and with `WET` each passes as with `WEST`. In stage 1, with only the last of its
three reads answering `UTC`, the block STOPs at the arm, after the pre-check and before the apply.
**THE REAL `date`** is not stubbed in one test: the blocks' own clock lines run against the system's
`date` at ten fixed instants (the six ruled minutes, Monday 08:30 summer time, and three in winter
time), in a process whose own zone is Tokyo; a misspelt zone reads a zone name that is neither
`WET` nor `WEST` and STOPs, and so does a line with no `TZ=` at all. The test asserts that
property, not one system's spelling of the name: it runs under GNU `date` in CI and under BSD
`date` on the apply machine.

**THE WEEKDAY TABLE** runs stage 0 and stage 1 whole at the six minutes the ruling names (Friday
20:59 open, Friday 21:00 closed, Saturday 12:59 open, Saturday 13:00 closed, Sunday 15:00 closed,
Monday 07:59 closed) and at one green arm (Tuesday 22:30): at each open minute the block STOPs
with nothing recorded and nothing applied, and at each closed minute it reaches its last line. It
also runs the arm's own `awk` program at every boundary of every weekday against a table written
in the test. **THE CLINICS' ROWS** runs stage 1 with one clinic's row reaching outside 08:00 to
21:00, and with no active clinic: each STOPs after the pre-check and before verified-migrate.
**A RECORD THAT READS EMPTY OR SHORT** runs stages 1 and 2 and the closing read with the recorded
sha empty, blank, 39 characters and not hex, the pass mark empty and the window's sha short: each
STOPs. **A READ THAT CONTRADICTS THE MARKER** runs stage 2 and the closing read whole against a
faked database that does not hold 0102 (the hash 0 or 2 times, the journal one row short or long,
a FAIL verdict, the post-check's psql exiting non-zero, the reader not listing it): each STOPs
with the UNKNOWN sentence and never says 0102 is applied. **THE WINDOW FEED** runs stage 1 whole
on eleven run-window records and clocks (nine refusals and edges, and the two edges that pass),
and goes red with the window-end line removed. A held applied marker younger than 12 hours stops
stages 0 and 1 before any git call. **THE HELD HEAD MOVED, OR THE HELD BRANCH IS GONE** runs stage 1
with the branch at another sha than stage 0 recorded (it STOPs at the HEAD CHECK, before the
environment, psql and the apply), stage 2 and the closing read the same way (each reports the move
and runs from the recorded sha), and all four with the line that resolves the branch failing (each
STOPs there: stages 0 and 1 with nothing applied, stage 2 and the closing read with the post-commit
sentence, and nothing runs after it).

| Block | Faults | Halt | Allowed to continue, and why |
|---|---|---|---|
| stage 0, closed hours | 50 | 47 | 3 R9 proof 1 calls, which read `no` and decide nothing |
| stage 1, closed hours | 78 | 75 | 3 R9 proof 1 calls, as in stage 0 |
| stage 2 | 59 | 59 | none |
| the closing journal read | 34 | 34 | none |

221 faults, run on 2026-10-05 (Lisbon) under zsh in GREEN's exact shape and under bash with
errexit forced off; every one held. Run again on 2026-10-06 after the re-pin, in which the four
blocks changed in their pinned sha256 lines and in nothing else: every one held. **CI runs the bash arm only:** zsh is not on the ubuntu runner,
and the repository's convention for that (`scripts/apply-lane/apply-lane-settings.test.mjs`) is
followed, so on the GitHub runner alone the zsh arm is a reported skip, and anywhere else a missing
zsh fails the test.

**Linux.** The script test was run whole inside a Linux container (`node:20-bookworm`, Node 20.20.2, GNU coreutils 9.1, the worktree as a read-only bind mount, `GITHUB_ACTIONS=true` as on the runner): 40 tests, 38 passed, 2 skipped (the two zsh arms, by the repository's recorded convention), 0 failed. CI runs Node 22 on ubuntu; the container was Node 20, the one Linux image already on the build machine.

### What the rehearsal agent owes before the dispatch is issued

**Owed when this was written, and run on 2026-10-06 with the limits recorded under "The rehearsal,
2026-10-06".** What was delivered and what was not, item by item:

- **Item 1, delivered as far as the report and the transcripts show.** The position was read
  before any block: 99 journal rows, the newest 0101 at 1788502200000, 48 tables, 28 SECURITY
  DEFINER functions, nothing of 0102. The premise was read by the pre-check run on its own: 16 OK,
  verdicts 8, 9, 10 and 15 among them, and R39's row `postgres: 24 tables, auth.users yes`. How
  the stack was built is not in the report.
- **Item 2, delivered:** 2 active clinics, stage 1's `0 of 2` and `inside`, and 47 patients.
- **Item 3, delivered in part.** Stage 0, stage 1, stage 2 and the dispatch's CLOCK CHECK ran
  whole, under psql, with `verified-migrate.mjs` reaching drizzle-kit through pnpm. **Not
  delivered:** the dispatch's BEFORE YOU START and the closing read past the reader, which refused
  and for which nothing was substituted; and the target guard, whose line was substituted in
  stages 1 and 2 (the report lists that substitution; the prompt that would name it is not among
  this record's sources). The clock arm ran on the real clock, in closed hours, and passed; no
  clock STOP fired.
- **Item 4, delivered in part:** one lock wait that ran out, and the 15 s idle bound, each under
  drizzle's own transaction through stage 1 whole (3b and 3a). The lock table of "G6" and its
  deadlock runs were not read again.

Run under the lead's standing rule, verbatim in its prompt: "A script's own REFUSE or STOP line is a
halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to
get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the
document says so."

1. **A throwaway at production's position:** a local Supabase stack, the promoted head's
   `supabase/migrations` minus 0102, so `0000` to `0101`, and a drizzle journal of 99 rows built from
   `_journal.json`, the newest 0101 (`36a1ed54...`, `when` 1788502200000), with the platform
   default privileges in place. Read the premise before any block and record it (pre-check verdicts
   8, 9, 10 and 15, and R39's INFO row).
2. **At least one active `public.locations` row** whose hours lie inside 08:00 to 21:00, or stage
   1's clinic read STOPs, correctly; and patients in the table, or pre-check verdict 14 FAILs,
   correctly.
3. **This document's four blocks and GREEN's two, extracted verbatim from the promoted head,** under
   psql, with `verified-migrate.mjs` reaching drizzle through pnpm, every halt run for real, and each
   allowed substitution named in the prompt, never "the way earlier rehearsals did". The target
   guard refuses any host but the production pooler, so every block that runs it halts on the
   throwaway at that line unless the lead rules a substitution; the journal reader's reads are NOT
   REHEARSED for the same reason. **The clock arm runs on the real clock:** inside clinic hours
   stages 0 and 1 STOP, which is the arm proven in the safe direction; in closed hours they pass. The
   agent never sets `TZ` or the clock to choose.
4. **The lock read under psql and drizzle's own transaction,** if the lead wants G6 read again
   through the path production will take.

## JUDGMENTS, NOT RULINGS, in the migration and this document

Each is SOLO's where the spec or the rulings leave a choice; R4 and the lead may change any of them.

1. **Copies instead of a helper for S7 (spec 6.5 allows either).** The send carries the visit's
   clinic, and the answer its clinic and both practitioners, copied by the doors at the send and at
   the submit; the policies read only the row and `viewer_location_ids()`. A later correction of the
   visit's clinic or practitioner does not move an existing answer.
2. **Every door that takes a tenant also requires it to equal the session's JWT tenant claim.** The
   app's paths set the claim (withReminderTenantContext, runScoped); `resolve_survey_code` takes no
   tenant, because the page does not know it before the read.
3. **The automatic door refuses a session that carries a user** (`not_allowed`, a fourth return value
   beside the spec's three): a staff session sends through the manual door, which records who sent.
4. **The automatic door also refuses a channel the patient's switch or contact does not permit, and
   an appointment that already has an answer** (`not_eligible`), the same tests the manual door makes.
5. **A soft-deleted patient is `not_allowed` for the manual door and `not_eligible` for the automatic
   one, and their code no longer resolves.**
6. **An admin or reception user asking about a patient with no concluded visit gets
   `no_appointment`,** before the clinic test, because there is no visit whose clinic could be
   tested; it tells them only that.
7. **O6 is authored to (a), and a patient's delete follows the same rule (20):** no cascade from the send or the visit to an answer, so an appointment's
   hard delete is refused while an answer exists. (O9 is no longer a judgment: R32 ruled it.)
8. **A comment that is empty or only whitespace is stored as NULL;** any other comment is stored as
   the patient wrote it.
9. **service_role keeps the table privileges the platform gives it** (as 0072 and 0093 left it), and
   loses EXECUTE on all nine functions (0079's rule).
10. **A private helper, `survey_manual_verdict`, holds the manual verdict** so the state and the door
    cannot disagree. It is not SECURITY DEFINER.
11. **Index `(appointment_id)` on the sends,** beyond the spec's two, for the appointment delete's
    cascade.
12. **R34's audit row is written by a trigger, not by a door.** The ruling allows "a column grant
    plus policy or a SECURITY DEFINER door, whichever matches how the reminder switches are
    protected"; they are protected by grants and policies, so the switch is too, and a trigger is
    what gives a plain UPDATE its audit row. A door would have needed the column taken away from
    `authenticated`'s table-level UPDATE, which only a table-level REVOKE and a re-grant of every
    other column could do.
13. **The trigger is AFTER UPDATE of any column with a WHEN, not `UPDATE OF survey_enabled`,** so a
    change made by another trigger is audited too.
14. **The audit row's actor:** `actor_user_id` only when the session's user is a staff member of the
    patient's tenant (the column references `users`), and `actor_patient_id` in `metadata` for the
    patient's own session. The action is named `survey.switch_changed`.
15. **The opt-out door keeps its own `survey.opt_out` row,** beside the trigger's row: one is the
    page's act on a send, the other is the switch moving. "Exactly one row per change" is read as
    exactly one `survey.switch_changed` row.
16. **The pre-check asserts R34's premise by structure** (the table-level UPDATE, the two UPDATE
    policies by name, role and shape), and prints their text md5 as a profile, never as a verdict:
    whatever their text is on production, the switch is behind the same two, which is what "the
    same" means.
17. **The blocks stop when the held branch is gone from origin,** rather than falling back to
    `refs/pull/<n>/head` as 0096 and 0097 did: the PR number is not known when this is written, and
    the label keeps the branch through the sitting. What each block prints in that case, and when
    the head moved, is the table under "The HEAD CHECK", and a whole-block test runs each cell.
18. **Stage 1 reads the clinics' rows to check the weekday table, never to decide the hour,** and
    **R9 proofs 2 and 3 are fixed `no` lines:** 0101's judgments 4 and 5, kept.
19. **"The server's own session" is read as: no user and no patient claim.** It is the test
    `issue_survey_automatic` already made for the job (no user), with the patient claim added,
    applied to the page's three doors. The tenant claim is not part of it: the read runs before a
    tenant is known, under the all-zero tenant, as the confirm page's does.
20. **The foreign keys to the patient are NO ACTION,** for the reasons in section 3. The other
    answer, CASCADE, is a later one-statement migration if strategy rules it.
21. **Inside the final group the `patients` column stands BEFORE the eight foreign keys,** where
    the lead's dispatch of round 2 asked for the foreign keys "immediately before the `patients`
    column". Measured both ways ("G6"): foreign keys first ends a transaction that has read
    `patients` and then writes; the column first leaves it untouched and ends the rarer one. The
    cost is that `patients` is held ACCESS EXCLUSIVE for 9 statements (14 before the fold of 2026-10-06), not 6. After `patients`:
    `appointments`, `tenants`, `users`. Reversible by re-ordering four statements and a re-pin.
22. **The consent label is bounded at 64 characters.** Today's labels are 22
    (`rgpd-intake-2026-09-11`, `packages/i18n/src/intake-consent.ts`); the bound is room, not a
    format.
23. **The answer and the opt-out keep their own session and shape tests though the read door's
    would do for them.** Two of the third sweep's mutants are equivalent for that reason (the
    shape test in each): the test is there so that each door refuses by itself.
24. **NO LONGER A JUDGMENT: RULED ON 2026-10-06** (strategy, S-1006-A, Q5: "Fold the eight foreign
    keys: yes, same re-pin"). The eight late foreign keys are three statements, one `ALTER TABLE`
    per new table with several clauses, five fewer round trips under the locks. Until then this
    lane's judgment was one statement each, so that each lock had its own statement and its own
    failure point; what the fold gave up is said in "G6". **What is still this lane's judgment
    inside it:** the order of the three statements (the sends, the codes, the answers) and of the
    sends' clauses (`appointments`, `tenants`, `users`, `patients`), approved by the lane lead for
    this re-pin, which keeps the documented lock order (measured, "G6").
25. **The read door was re-typed in plpgsql rather than moved into the final group.** Moving its
    five statements there would have kept it SQL-language at the price of five more round trips
    under ACCESS EXCLUSIVE on `patients`; leaving it would have kept an ACCESS SHARE on `patients`
    and `appointments` from statement 38. The query did not change; 0072's read door, the
    precedent, is SQL-language; whether it locked a table at its `CREATE` was not measured.
26. **NO LONGER A JUDGMENT: RULED ON 2026-10-06** (strategy, S-1006-A, Q5:
    "idle_in_transaction_session_timeout 15 s: yes, with its gate change"). The file's third
    statement sets it to 15 s. The pre-check still reads and reports the database's own value, as
    INFO. The gate change that will require the line is its own pull request ("G6").

## What this does NOT do, and what is out of scope

- **It sends nothing.** No template, job, page, flag or registry entry: those are the application
  pull requests of the spec's section 10, each after 0102 is on production and merged.
- **It holds nothing for R33.** The three-state send flag and its allow-list are configuration.
- **It does not change `merge_patients` or the hard delete.** Both are application work recorded
  in the spec's amendment: until then a merged-away patient keeps its sends and answers.
- **It does not bound how long its locks are held while the applier keeps working,** only each
  wait and each statement. **Since the re-pin of 2026-10-06 it does bound an applier that stalls
  between two statements:** the server ends a session idle in the transaction for 15 seconds, and
  its locks are released ("G6"). And it does not make a deadlock impossible in its last nine
  statements: it makes the commoner shape wait instead, and in the rarer one either side can be the
  one ended ("G6"). Closed hours are what keep the window empty.
- **It cannot tell the application's manual send from a staff member's direct call,** so it cannot
  stop a send being recorded with no message leaving. The application's hand-over record is what
  shows the difference (section 3).
- **It shows no staff switch.** The staff toggle on the patient file is an application pull request;
  the database already admits and audits it.
- **It changes no existing row.** Measured: no `patients` or `appointments` row was written or moved.
- **It changes no existing policy, function, trigger, relation privilege or default privilege,** and
  one column privilege only: the patient role's UPDATE gains `survey_enabled`. Post-check 10 to 15
  and 26.
- **It gives no application role a DELETE,** and no function deletes anything.
- **The patient role reads none of the three tables.** S7 does not list the patient; the patient sees
  their answer only while filling the form.
- **The retention job is not here:** the purge function is, owner-only; the daily job that drives it
  is an application pull request, due before the oldest answer is 24 months old.
- **It does not record R41 in `CLAUDE.md` or on the board.** Both still name SAT-01 at `0101`. The
  board is a pull request of its own (SR-44). `CLAUDE.md` was asked for on this branch by the
  lead's dispatch of 2026-10-05 and was NOT edited: the build agent's own rules let no agent's
  message authorise a change to `CLAUDE.md`, so the text is in the handover for the owner or the
  lead to commit.

## The op carries no DELETE and no TRUNCATE statement

Measured on the migration's code with its comments removed: **0 statements begin with DELETE, 0
begin with TRUNCATE,** and the words DELETE, TRUNCATE, DROP, COPY and MERGE do not appear in its code
at all; INSERT and UPDATE appear only inside the functions' bodies, and in the trigger's `AFTER
UPDATE` (`scripts/sat01-tables-0102.test.mjs` requires it). The check files write nothing: the
pre-check opens its own READ ONLY transaction and ends in ROLLBACK, and the post-check runs inside
the block's `begin read only`.

## Review history

**The rehearsal's record, 2026-10-06: prose and tables only, and no byte of any fenced block.**
This edit recorded the rehearsal of 2026-10-06 and corrected each sentence the rehearsal made
false. **NOT REVIEWED YET: the one round on the promoted bytes and on this record has not run when
this entry is written; its verdict is added below by a record-only edit.** What changed, all of it
in this document:

- the banner (line 3) and the status sentence;
- NOT READY step 5;
- in "G6": the note on a deadlock's transcript, and the paragraph "What it does not show, and what
  it costs";
- in stage 1's prose: "A fired bound is a clean failure", "WHEN A BOUND FIRES", the sentence on the
  two NOTICE objects, and the new paragraph "WHAT A FAILED APPLY PRINTS BESIDE THOSE TWO LINES";
- in stage 2's prose: one clause of "EVERY STOP OF STAGE 2 AND OF THE CLOSING READ SAYS WHAT
  STANDS", on the post-check run against a database without 0102;
- under "What every verdict must read": the new paragraph on psql's own lines;
- the opening of "Rehearsal", and the new subsection "The rehearsal, 2026-10-06, as the rehearsal
  agent reported it";
- two sentences of "What 0101's rehearsal and 0101's sitting proved", and one bullet of the
  re-pin's "NOT RUN AGAIN ON THESE BYTES";
- "NOT REHEARSED, said one by one", rewritten, with what left the list named under it;
- a note at the head of "What the rehearsal agent owes";
- and this entry.

**No fenced block changed, and that was proven with a control.** The fenced blocks were extracted
from this document at `68fcd861` and from this version by one extractor, the script test's own
`blocksOf` (`scripts/sat01-tables-0102.test.mjs`), and again by a second one that reads the fence
lines one by one. Each finds four blocks in both versions, with the same sha256 in the same order:

1. stage 0, `d9405de2d1926ce145ce06d2d753ed6f15ea94a1e1cb07e6f7a56a9104c0b9d9`;
2. stage 1, `faca57c6cd8ba6aadb212db27aa8746fcf81030d74cf68682fe4acfda03ef802`;
3. stage 2, `a0a39f1ac3d3c7ad135af6b14083e5abcf6311a043d17c7ce25a95a752852ffd`;
4. the closing read, `4c30b03f0268a548ed5bb617e0134db7ee8b3d7dc017671279fbb891d16f3c25`.

**The control:** on a scratch copy with one byte altered inside stage 1's block, both extractors
gave that block another sha256 and the other three the same. The rehearsal ran the blocks of the
document whose sha256 was `e6943aa5...`, at `68fcd861`: they are these four. Outside this
document the commit carries its sidecar and nothing else: no SQL, no check file, no script and no
test. **No mutation sweep was run:** nothing a sweep mutates changed. **Left as they were, because
they are not this edit's to change:** NOT READY step 4, which still says "at most three rounds"
where the banner names the one round R44 allows; and the two "NOT REVIEWED YET" sentences just
below, which this edit did not check either way.

**The promotion, 2026-10-06: no block byte, no SQL byte, no check-file byte and no script-test byte
changed in it.** The migration is the pending file renamed
(`db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1` before and after); the two
check files and `scripts/sat01-tables-0102.test.mjs` have the sha256 they had at `1bb0a195`; and
the four fenced blocks of this document are byte for byte those of `1bb0a195`, compared after the
edit. **NOT REVIEWED YET: R4 on the promoted pull request (NOT READY step 4) has not run, and it
is not the build's to run.** What changed in this document, all of it prose and tables: the
banner and the status line; NOT READY steps 2 and 3 (both DONE); the Migration row; the paragraph
on the migration's header (it said the rename leaves nothing stale there, and the header's first
word, "PENDING", is); two paragraphs of "Applied from the held head" (what the pull request
carries, and that `patients.survey_enabled` is not declared in `schema.ts`); the paragraph after
stage 0's WHAT THE EXIT MEANS; the opening of "Rehearsal"; the new subsection "The promotion's
run, 2026-10-06"; three entries of "NOT REHEARSED, said one by one"; and this entry. Outside this
document the commit carries the rename, the journal entry, the mirror, the README row, and the
three ordinary edits (the ACL test's list, the cleanup script's three deletes, the three table
declarations). **No mutation sweep was run over the promotion:** nothing a sweep mutates changed
(no SQL, no predicate, no block line, no rule of the script test). **Left as they were, because
they are not this step's to change:** the sentences under "Applied from the held head" and "What
this does NOT do" that say `CLAUDE.md` does not yet record R41 (on this branch it does); judgment
17's "the PR number is not known when this is written" (it is #1551); and the re-pin entry's "NOT
REVIEWED YET" just below, which the promotion did not check either way.

**The re-pin of 2026-10-06, under strategy's dispatch S-1006-A (R44, and Q5): three changes to the
migration and what follows from them, and nothing else.** The migration's sha256 moved from
`43a1616a...` to `db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1`; the two check
files, this document, its sidecar and the script test were re-pinned. **NOT REVIEWED YET: R44 gives
this diff one review round (R8) before the push. That round has not run, and it is not the build's
to run.** Statement numbers in the entries BELOW this one are those of the file each round read
(74, 66, 67 or 62 statements), not this file's.

1. **The reword.** About the audit insert policy, three passages now say one thing only: this
   migration does not change it. They are the migration's comment on why the trigger function is
   SECURITY DEFINER (its section 6), section 3 of this document, and the spec's amendment. What
   stays in each: the function is SECURITY DEFINER because the `patient` role holds no INSERT on
   `audit_log`. Entry 5 of the review of
   2026-10-05, below, is reworded to match. No SQL statement moved for it.
2. **The third `SET LOCAL`.** Strategy, Q5: "idle_in_transaction_session_timeout 15 s: yes, with
   its gate change." Statement 3 is `SET LOCAL idle_in_transaction_session_timeout = '15s';`, and
   the comment above the three lines gained one sentence. **Measured on this file:** a session that
   stalled holding ACCESS EXCLUSIVE on `patients` was ended by the server 15.00 s after it went
   idle, its lock was gone from `pg_locks`, and a waiting reader was answered ("G6"). The frozen
   gate was run as it stands and passes with the line in the file; it was not edited, and the gate
   change that will REQUIRE the line is a separate pull request. The script test, which refused a
   third bound until one was ruled, now requires this one: third, exactly, and named nowhere later.
3. **The fold.** Strategy, Q5: "Fold the eight foreign keys: yes, same re-pin." The eight `ALTER
   TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements are three, one per new table (the sends,
   the codes, the answers), each adding its table's foreign keys in comma-separated clauses. Every
   constraint name, column, referenced table and delete rule is the text it was. 74 + 1 - 5 = 70
   statements. **Measured on this file:** inside the sends' statement Postgres takes the locks in
   the order of the clauses, `appointments`, `tenants`, `users`, so the documented order is kept
   ("G6"); and the post-check's per-table constraint literals did not move (27 OK under psql).
4. **Comment corrections that follow from the fold and the timeout,** ruled by the lane lead on the
   build's stop, number words and one clause only: the migration's header reads "the last nine
   statements" where it read fourteen; its section 6 reads "Eight statements follow it (...
   section 7's three statements ...)" where it read thirteen and eight foreign keys; and the
   header's sentence that neither bound covers the time between two statements gained one clause
   naming the third setting. Section 7's comment was rewritten to be true of three statements.
5. **One sentence of the migration's section 7 is left as it was, knowingly:** "Postgres ends that
   transaction (40P01), not this one." Entry 1 of the third review, below, says why this document
   governs there. The fold made it neither more nor less true, so it was not this re-pin's to
   change.
6. **What the fold changes for a reader of the migration's text outside this branch, measured and
   not acted on:** the frozen cleanup test reads the first clause of an `ALTER TABLE` only, so its
   graph holds 5 of this file's ten foreign keys where it held 10; the three tables are still
   reached from `patients`, so the order of pull requests stands ("The promotion, simulated").
7. **The four fenced blocks changed in their pinned sha256 lines and in nothing else** (`SHA0102`,
   `SHAPRE`, `SHAPOST`: seven lines over the first three blocks; the closing read is identical),
   compared line by line against `8a56d415`.
8. **Measured again on these bytes, and not measured again:** both lists are under "The re-pin's
   run, 2026-10-06". **No mutation sweep was run over this re-pin;** each rule the script test
   gained or changed has its own red arm there (the third line present, third, at its value, and
   not set again later; the three folded statements exactly; a fold that drops, renames,
   re-points, repeats or reorders a clause, or that is undone).

**The third review, 2026-10-05, of `ad44adc9`, the last under the cap: PASS.** "No BLOCKER, MAJOR
or MINOR defect ... fit to go to a held pull request and a rehearsal." Two wording points were
taken in the commit after it, which changed this document and its sidecar and nothing else: **no
block byte and no SQL byte** (the four blocks, the migration and the two check files have the
sha256 they had at `ad44adc9`).

1. **"It, not the migration, is the one ended" held only when the application's transaction
   begins to wait first.** Corrected in "G6", with the four orders measured: if the migration is
   already waiting at statement 65, 67 or 70, its own deadlock check fires first and the
   MIGRATION is ended, a clean failure that GREEN's transcript does not name. **The migration's
   own comment (its section 7) still says the shorter thing,** "Postgres ends that transaction
   (40P01), not this one": a comment in bytes that passed review, left as it is, and this document
   is the statement that governs.
2. **The write need only precede the migration's request for that table** (statement 65, 67 or
   70), not statement 61's answer. Corrected in the same passage.
3. **The reviewer's optional suggestion, NOTED AND NOT TAKEN:** folding the eight foreign keys
   into three `ALTER TABLE` statements would cut 5 of the 16 round trips under ACCESS EXCLUSIVE on
   `patients`. It changes production bytes and would need a fourth review round. **It is to be
   done only together with a ruled third `SET LOCAL` ("A QUESTION FOR STRATEGY"), in the same
   re-pin,** so that the bytes move once. Judgment 24 stands until then. **Both were ruled on
   2026-10-06 and done in one re-pin (the entry above this review).**

**The second review, 2026-10-05, of `1f3312a6`: the BLOCKER and the MAJOR closed; two MINOR
remained, both about locks, with two notes. All are answered in the commit after it, in the SQL
where the SQL could answer.** The migration's sha256 moved from `371f6874...` to `43a1616a78d5b0c940873eda4dd16f1b2392010e7016b39ed53f0f36cd56a5e1`;
the two check files, this document, its sidecar and the script test were re-pinned. **The four
fenced blocks changed in their pinned sha256 lines and in nothing else** (compared line by line
against `1f3312a6`).

1. **MINOR: "They do not fail; they wait" was false for one shape, and the first re-order had
   moved the victim to the application.** Statement 3 took SHARE ROW EXCLUSIVE on four tables and
   statement 61 then upgraded `patients`: a transaction that read `patients` and then wrote any
   of the four between the two was ended as a deadlock victim. **Fixed in the SQL:** the three
   tables are created without their eight foreign keys to existing tables; the eight are added at
   statements 65 to 72 under the same names and definitions; the read door is plpgsql, because
   as SQL it locked two tables at its `CREATE`; and inside the group `patients` is taken first.
   No lock of any mode on an existing table is taken before statement 61 (was 3). The sentence is
   corrected, and what remains true is said in "G6": a transaction that already holds a lock can
   still be a victim, in a rarer shape, during 14 statements and 13 to 19 ms on the lane.
2. **MINOR: "about 65 seconds" was not a bound.** Corrected in "G6": the figure (now about 80
   seconds) adds up server-side waits only; the gaps between statements are bounded by nothing
   unless `idle_in_transaction_session_timeout` is set. The pre-check prints production's value
   as an INFO row. No third `SET LOCAL` was added; the proposal is put to strategy there, with the
   frozen gate's behaviour measured. The round trips under the locks: 16.
3. **A note, recorded in the spec's owed application work (no SQL):** the application must never
   store or show the survey link to staff; a staff member who edits a patient's email can
   receive a real link (spec 3.6, A7 and A8); and A2 must land before the live-send flag leaves
   `off`. And the precision under "Applied from the held head": a send row can exist from the
   COMMIT by a direct staff call; an answer cannot until the page ships.
4. **A static rule pins what makes the late position safe** (`earlyLockProblems` in the script
   test): before the final group no `REFERENCES` or `FOREIGN KEY` to an existing table, no `ALTER
   TABLE`, `CREATE INDEX`, `CREATE TRIGGER`, `COMMENT` or `LOCK` on one; all nine functions
   plpgsql; the eight foreign keys in their one order after the column. A red arm for each.

**The fourth mutation sweep, 2026-10-05, over what round 2 changed.**

| Part | Mutants | Killed | Survived |
|---|---|---|---|
| A. the changed SQL, each planted on the lane in place of the reviewed object: the eight late foreign keys (missing, renamed, a wrong delete rule, NOT VALID, DEFERRABLE, a wrong table) and the read door in plpgsql (its language, and each conjunct and each output of its one query), against the DB-gated suite | 23 | 23 | 0 |
| the same 23, against the post-check | 23 | 23 (verdict 3 or 6) | 0 |
| B. every new or changed verdict predicate of the two check files, negated on the healthy database (the 25 of the earlier sweeps and 6 new: the foreign keys by name, validated; the language) | 31 | 31 | 0 |
| C. each rule round 2 added to the script test, switched off or narrowed, against its own controls | 31 | 31 | 0 |

- **A found five mutants the DB-gated suite could not see, fixed in this sweep** (the post-check
  saw all five, by the body's md5): a link living 15 days (the one expiry arm aged its send by
  exactly 15); the read not tying the code, the appointment, or the patient to the send's tenant
  (no door can write rows that disagree); and the read returning the visit's start. Three arms
  were added (the fourteen-day boundary, rows moved to another tenant by the owning role, the
  third column's value) and the five were re-run: killed.
- **One of A's kills is the fixture's, not an arm's:** with `answers.patient_id` pointed at
  `users`, the suite's fixture cannot be built, so the run fails and no arm runs. The post-check
  FAILs verdict 3 on it.
- **C found three checks that no control could see, fixed in this sweep:** the test that ties the
  post-check's foreign key pins to the migration made three bare assertions (the literal equals
  the migration's, validation is required, the language is required); a deleted assertion kills
  nothing. They became one rule, `latePinProblems`, with a control for each, and the sweep was
  re-run on 31 mutants: 31 killed.
- **The check files' control arms were re-run on the new SQL:** the 56 arms read the verdicts
  listed under "The build lane's run", unchanged but for the INFO count.
- **Not swept again:** the four blocks (only their pinned sha256 lines changed; the 221 faults
  were re-run on them).

**The review of 2026-10-05, an independent review of `4474ff84`: DEFECTS, one BLOCKER, one MAJOR,
four MINOR. All six are fixed in the commit after it, in the SQL, because nothing was pinned or
applied.** The migration's sha256 moved from `9be1bcab...` to `371f6874...`; the two check files,
this document, its sidecar and the script test were re-pinned. **The four fenced blocks changed in
their pinned sha256 lines and in nothing else** (`SHA0102`, `SHAPRE`, `SHAPOST`: seven lines over
the first three blocks, compared line by line against `4474ff84`; the closing read is identical).

1. **BLOCKER: the documented order could not reach green.** The private helper,
   `survey_manual_verdict`, is not SECURITY DEFINER and carried `ALTER FUNCTION ... OWNER TO
   postgres`. The repository's pairing rule (`packages/db/tests/secdef-from-migrations.ts`,
   `pairingProblems`) calls that an extra pin, so `security-definer-owner.test.ts` would have
   stayed red after the apply and the count's GATE-CHANGE, with production holding bytes that
   could no longer change. **Fixed:** the pin is removed (the function is created by `postgres`,
   so it is owned by `postgres`; post-check verdict 6 reads the owner of all nine). **Proved:**
   "The promotion, simulated", the second run: 28 of 28 at the count's post-apply value, and the
   whole tree green. The script test now refuses any owner pin that is not one of the eight.
2. **MAJOR: a staff member could forge a patient's answer and consent,** by issuing a manual send
   with a hash of their own choosing and redeeming it with their own session. **Fixed:** the
   read, the answer and the opt-out refuse every session that carries a user or a patient claim
   (section 3), and the automatic door refuses a patient claim too. What remains, and is said
   there: a staff member can record a send without a message leaving.
3. **MINOR: `merge_patients` is not taught the new tables.** Not changed here. **Decided and
   tested:** the foreign keys to the patient stay NO ACTION (section 3); the gap is recorded in
   one arm of the suite and as owed application work in the spec.
4. **MINOR: the lock on `patients` was understated.** **Fixed:** the column, its comment, its
   grant and the trigger moved to statements 61 to 64, right before the two policies, so
   `patients` is exclusively locked for 6 of 66 statements instead of 65 of 67; and "G6" now says
   that reads wait too, with the measured hold and the computed worst case.
5. **MINOR: a sentence about INSERT on `audit_log` was misleading.** **Corrected** in the
   migration's comment and in section 3, and reworded again in the re-pin of 2026-10-06 (the first
   entry of this history). Both now say that the trigger function is SECURITY DEFINER because the
   `patient` role holds no INSERT on `audit_log`, and that this migration does not change the audit
   insert policy.
6. **MINOR: the consent label had no length bound, and a malformed code raised 23514.** **Fixed:**
   a CHECK at 64 characters; and every door that takes a code tests its shape first and answers
   as it does for a wrong code.

**The third mutation sweep, 2026-10-05, over what the review's fixes changed.**

| Part | Mutants | Killed | Survived |
|---|---|---|---|
| A. the changed SQL, each planted on the lane in place of the reviewed object, against the DB-gated suite: the session tests of the four doors, the shape tests of the four, the consent bound, the two foreign keys to the patient | 21 | 19 | 2, equivalent |
| A, pairs: the read door's test taken out TOGETHER with the answer door's, or the opt-out's | 5 | 5 | 0 |
| C. each rule the fixes added to the script test, switched off or narrowed, against its own controls | 19 | 19 | 0 |

- **A found four mutants no arm could see, fixed in this sweep:** the answer door and the opt-out
  door each admitting a user, or a patient claim, survived, because both doors ask the read door
  again and its test refused for them. An arm was added that takes the read door's test out and
  requires each of the two to refuse by itself; the four were re-run: killed.
- **A, the two survivors are equivalent:** the shape test taken out of the answer door, and out of
  the opt-out. No code of another shape can exist in the codes table (its own CHECK), so the
  lookup finds nothing and the answer is the same false. The script test's shape rule is what
  holds those two lines.
- **C found one mutant no control could see, fixed in this sweep:** the late-column rule widened to
  admit any statement that names `patients` survived, because the one control planted a comment on
  another table. A control was added that plants an index on `patients` itself between the column
  and the policies; the 19 were re-run: 19 killed.
- **Not swept again:** the check files' predicates (none changed; the 25 negations were re-run on
  the new SQL: 25 of 25) and the four blocks (only their pinned sha256 lines changed; the 221
  faults were re-run on them).

**The revision of 2026-10-05, evening: 0101 is on main and applied. No block byte, no SQL byte
and no check-file byte changed in it.** `origin/main` (`a0e96a99`) was merged in with no conflict. The
migration was still `9be1bcab...` and the two check files were unchanged; the four
fenced blocks are byte for byte the previous commit's (`4b330e2a`), compared after the rebuild.
What changed: this document's banner, NOT READY steps 1 to 3, the Must-follow row, the order
section (row 1 is now measured and named, row 4b is new, the gate table gained the cleanup test),
"Applied from the held head" (`schema.ts`), "The HEAD CHECK" (the table of a moved head and a gone
branch), two paragraphs of stage 1's prose brought from 0101's final document, "Rehearsal" (what
0101's rehearsal and sitting proved, the build lane's run on a lane built from main, the promotion
simulated, the NOT REHEARSED list), and this history. In the script test: 0101's real file is
copied and hashed against `SHAPREV` (the stand-in is gone), the journal is cut at 0101's own
entry, and one whole-block test was added (a moved head, a gone branch). **No mutation sweep was
run over this revision,** because nothing a sweep mutates changed: the sweep below stands for the
SQL, the predicates and the block lines, and the new test's two halves each have their own control
(the head where stage 0 left it; the positive run of each block).

**R4 on the promoted pull request has not run** (NOT READY step 4). **No R4 round has read this
revision:** it applies S-1004-A's rulings to the draft of 2026-10-02 and brings in the three
review rounds' findings of 0101's document by construction (the blocks are 0101's, with the names,
the counts, the carries and the head they read changed; `scripts/sat01-tables-0102.test.mjs` holds
0101's rules).

**The mutation sweep, 2026-10-05, one pass, mechanical, over what this revision changed** (the
SQL the rulings added or ruled, the new and changed verdict predicates, the block lines that differ
from 0101's, and the rules of the script test). The sidecar was regenerated for every document
mutant, so the byte pin killed none of them; no sha256 pin was counted as a kill.

| Part | Mutants | Killed | Survived |
|---|---|---|---|
| A. R34's trigger and its function, the patient's column grant and R32's fifth reason, each planted on the lane stack in place of the reviewed object, against the DB-gated suite | 23 | 22 | 0 after the fix below; 1 could not be observed |
| B. every new or changed verdict predicate of the pre-check (10 conjuncts) and the post-check (15), negated one at a time on the healthy database | 25 | 25 turned their verdict to FAIL | 0 |
| C. a rule of the script test loosened, against its own controls | 31 | 31 | 0 after the fix below |
| D1. an explicit halt stripped from a block line, one at a time, and a STOP arm of an `if` losing its exit, against the static rules | 189 | 189 | 0 |
| D2. the block lines that differ from 0101's (the held head, the journal positions, the verdict counts, the carries, the programs' arguments), against the static rules and then the whole test | 34 | 34 | 0 after the fix below |

- **A found one real gap, fixed in this sweep:** the audit row filed under the SESSION'S tenant
  instead of the patient's survived, because every arm ran in a session of the patient's own
  tenant. An arm on the owning role's connection (no claims; another tenant's claims) was added and
  the mutant re-run: killed. **A, the one that could not be observed:** the trigger function made
  SECURITY INVOKER takes the local backend down when the patient role fires it (the image's known
  crash on a function the role may not execute), so the suite's run of it proves nothing. It is
  caught without a database: the script test's shape rule, and post-check arm P25.
- **A, two arms were added before the count** because the first list of mutants had no test that
  could see them: a change made by another trigger (the `UPDATE OF survey_enabled` mutant), and an
  actor who is a user of another tenant.
- **C found one weak control, fixed in this sweep:** R39's rule reading only the very last
  statement survived, because every control left the second-to-last statement a policy. A control
  with one policy removed was added: killed.
- **D2 found six lines no test read, fixed in this sweep:** the harness fakes psql and
  verified-migrate, and a fake does not read its arguments, so a block that passed the wrong carry
  (`TR` read from another row; `PU` and `TR` swapped), admitted any text as the column list, gave
  verified-migrate 0101's tag or `--expect-pending 2`, or gave the pre-check 0102's own hash as its
  predecessor's, passed every run. A static rule, THE ARGUMENTS, now reads those lines off the text,
  with each of the six as its own red arm; the 34 were re-run: 34 killed, 31 by a static rule and 3
  only by a whole-block run (stage 1 reading 0101's tag at another index, check-journal reconciling
  99, the closing read admitting a pending migration). **The same six lines are untested in 0101's
  script test,** which this harness was taken from; that is 0101's to fix, in its own pull request.
- **Not swept:** the predicates the draft's sweep of 2026-10-02 covered and this revision did not
  touch (the two policies and the eight doors: 60 mutants then, 60 killed; the policies' text is
  unchanged, only their position), GREEN's dispatch (not drafted), and the application.

