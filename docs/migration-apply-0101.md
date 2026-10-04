# 0101: apply the optional email on a public booking request

**NOT READY: 0101 is PENDING, not promoted, not reviewed and not rehearsed.** It stays `packages/db/migrations-pending/NEXT-AFTER-0100_guest_request_email.sql` until the promotion, and every block below STOPs at its first file check, because the promoted file is not on `origin/main`. Open, in order: the GATE-CHANGE the promotion forces (NOT READY step 1), the promotion (step 2), R4 (step 3), the whole-block rehearsal (step 4), CI on the promoted head (step 5), the merge (step 6) and GREEN's dispatch (step 7). **The sitting is closed hours only, by the weekday table** (see "R9").

**Status: AUTHORED. PENDING. NOT PROMOTED. NOT APPLIED.** One migration, the pending file above,
sha256 `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b`, to be promoted to
`packages/db/migrations/0101_guest_request_email.sql` by a rename that changes no byte. It adds one
nullable column, `email`, with one CHECK, to `public.guest_booking_requests` (strategy's ruling R40,
dispatch S-1004-A; numbered `0101` by R41). Four blocks, each pasted whole, on its own and in
order: stage 0 (the promotion, the files, the clock and the head it runs from), stage 1 (the HEAD
CHECK, the pre-check, the clock and the clinics, and the apply), stage 2 (the post-check) and the
closing journal read. One rule governs every halt, in these words here and in GREEN's dispatch:

THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any
STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and
nothing continues to the next block. After stage 1 has committed, a post-commit STOP
still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the
owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0
with the line "0101 APPLIED. Paste stage 2 now." No block, and no dispatch
step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:
no closing read and no journal read. Whether and when a halted sitting starts again
is the lead's call, never the runner's.

**That is the halt rule of `docs/migration-apply-0094.md`, word for word, with the number
changed and no other change.** This document has no stage 3 (see "No behaviour check on
production, and why"), so where the rule names stages 2 and 3, read stage 2 and the closing read.

**In a Claude session `set -e` does not stop a pasted block, so every halt in these blocks is
explicit, and that is proven by fault injection.** GREEN's Bash tool runs a block as
`... && eval '<block>' < /dev/null && pwd -P >| <file>`; with the eval on the left of `&&`,
zsh ignores errexit inside it, the block's `( ... )` subshell included (found by R4 on 0100's
dispatch, 2026-10-02). So each command a later step relies on carries its own
`|| { echo "STOP: ..."; exit 1; }`, and `scripts/guest-request-email-0101.test.mjs` runs every
block in that exact shape with each external call made to fail in turn (see "The fault-injection
harness"). `set -eo pipefail` stays at the top of each block: pipefail is what gives a `... | tee`
pipeline the exit of the program before the tee, and `-e` is real when a block runs as a script.
Strategy's standing rule (S-1004-A): "Explicit halts in every block, never set -e. No gate edit
inside a sitting."

**Authored by SOLO. Run by GREEN,** a fresh session launched with the apply settings, on the
owner's dispatch naming this migration by filename (`CLAUDE.md`, "Who applies migrations"). The
lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **The GATE-CHANGE the promotion forces merges first, as its own pull request, by the owner
   on green** (see "THE ORDER OF PULL REQUESTS"). It changes one gate file,
   `scripts/maintain-revoke-0100.test.mjs`, and the manifest. Without it the promotion commit
   reddens that test on every branch.
2. **SOLO promotes 0101 on its branch, `db/0101-guest-request-email`,** and opens the held PR
   with the `held-for-apply` label: merge `origin/main` in (no rebase); `git mv` the pending file
   to `packages/db/migrations/0101_guest_request_email.sql` (a rename: sha256 `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b` before
   and after); append its journal entry at **`idx 98`**, tag `0101_guest_request_email`,
   **`when` 1788502200000** (0100's 1788502100000 plus 100000; a `when` equal or lower makes
   drizzle skip the file in silence, which is why `scripts/check-journal.mjs` refuses one); run
   `node scripts/sync-supabase-migrations.mjs` for the mirror; run `node scripts/check-journal.mjs`
   (**99 files, 99 entries**); move the README row into the Promoted table; amend this document's
   banner and status, with its sidecar. The pre-check and the post-check pin the body's sha256 as
   a literal, and a rename does not move it, so neither needs an edit; nor does the script test,
   which finds the file in either place.
3. **R4** on the promoted PR's diff and the card acceptance, at most three rounds (the review-loop
   cap). NOT DONE.
4. **The rehearsal agent runs this document's four blocks and GREEN's two, whole, from the
   promoted head,** under the lead's standing rule, verbatim in its prompt (see "Rehearsal").
   NOT DONE.
5. **CI is green on the promoted head,** the required checks and `db-tests`, which then applies
   0101 with every other migration and runs `packages/db/tests/guest-request-email.db.test.ts`
   for real; and the SET LOCAL gate reads the promoted file in scope and passing.
6. **The owner takes `held-for-apply` off and merges the PR**, and freezes merges to main from
   that merge until GREEN's report is in (SOLO disarms every armed PR first).
7. **SOLO fills GREEN's dispatch:** the merge commit's sha, this document's sha256, and a run
   window **while both clinics are closed by the weekday table** (R9 below). The dispatch's own
   CLOCK CHECK writes `/tmp/0101-window.ok`.

| Fact | Value |
|---|---|
| Card | the public form's optional email (R40), database half. No card number yet: the board card is its own PR (SR-44) |
| Ruling | Strategy's dispatch S-1004-A (2026-10-04). R40: "Add an optional email field to the public form, label "Email (opcional)", hint "Para receber a confirmação da marcação"." R41: "0101 = public-form email column (owner's top priority, small). SAT-01 becomes 0102." G4: "0101 lock read on the throwaway, statement by statement. EXPECT: no auth table locked. Anything else, halt." S-1002-A R9 and R10 |
| Migration | `packages/db/migrations-pending/NEXT-AFTER-0100_guest_request_email.sql` until the promotion, then `packages/db/migrations/0101_guest_request_email.sql`. sha256 `36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b` in both places |
| Journal | `idx 98`, tag `0101_guest_request_email`, `when` 1788502200000. Stage 0 asserts it and 0100's entry before it. Production's journal goes 98 to 99 |
| Mirror | `supabase/migrations/0101_guest_request_email.sql`, written by `scripts/sync-supabase-migrations.mjs` and checked by content by `scripts/check-journal.mjs`, which stage 0 runs |
| Must follow | `0100`, the MAINTAIN revoke (#1520), applied 2026-10-03, body sha256 `80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106`, journal `idx 97`, `when` 1788502100000. Stage 0 finds it by its journal tag and asserts its bytes; the pre-check finds it by hash as production's newest row |
| Runs from | `origin/main`, when it IS the PR's merge commit. Stage 0 records the sha `origin/main` resolves to in `/tmp/0101-main.sha`; every later stage checks out that recorded sha, never a fresh `origin/main`, and stage 1 HALTS if `origin/main` has moved since (the HEAD CHECK) |
| The apply worktree | `/Users/ivan/Projects/GitHub/osteojp-prod-apply` (the repositories moved on 2026-10-04; earlier documents name the old place) |
| This document | `docs/migration-apply-0101.md`, pinned by `docs/migration-apply-0101.sha256` and asserted by every block; GREEN's dispatch pins its sha256 on its own and checks it by machine |
| Pre-check | `scripts/db/precheck-0101-guest-request-email.sql`, READ ONLY, 13 verdicts each with its control, 11 CARRY rows, 3 INFO rows, `-v prev_hash` and `-v prev_when` required, sha256 `afd23d345ecadc1ca32005b9f5c2005e2664573eeaebec2f91a50810e9994be0` |
| Post-check | `scripts/db/postcheck-0101-guest-request-email.sql`, READ ONLY, 19 verdicts, thirteen carries in, sha256 `9970e0e9155c2b36730ddb2130319bbe25468f7bf8446e114e71e375a4d5f702` |
| Behaviour check | `packages/db/tests/guest-request-email.db.test.ts`, the DB-gated suite: 9 arms, every role as an assigned principal under real RLS. Run on the build lane's stack (below) and by CI's `db-tests` from the promotion on; not on production (see "No behaviour check on production, and why") |
| The programs that run with production credentials | `packages/db/scripts/verified-migrate.mjs`, sha256 `ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261`; `scripts/assert-production-target.mjs`, sha256 `6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96`; `packages/db/scripts/read-applied-migrations.mjs` (the closing read), sha256 `825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387`; and the module both of the last two import, `scripts/production-target.mjs`, sha256 `e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c`. All four read from `origin/main` at `f6192d42` on 2026-10-04, the same bytes 0100's document pins; every block that runs one compares it, and the module, first |
| The program that runs without credentials | `scripts/check-journal.mjs`, run by stage 0 only, sha256 `7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59` |
| The R9 pin | `SHAGATE`, the sha256 of `scripts/migration-timeouts.test.mjs` on main: `e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6` (#1510). It feeds R9 proof 1, which is printed in every sitting and decides nothing here |
| Not pinned, and why | what the pinned programs load in turn: drizzle-kit and the rest of `node_modules`, and `packages/db/drizzle.config.ts` (0094 to 0100 did not pin them either). Their tree is fixed instead, by commit: GREEN's BEFORE YOU START requires `origin/main` to BE the PR's merge commit, and the HEAD CHECK halts on any other head before the apply |
| Run window | named by GREEN's dispatch, never here: its CLOCK CHECK records it in `/tmp/0101-window.ok` with the sha stage 0 recorded, as three Lisbon times `YYYYMMDDHHMM` (opens, the last minute stage 1 may start, ends). Stage 1 refuses to start outside it and checks again just before the apply; stage 2 and the closing read refuse at or after its end. Stage 0 removes the record. **No date is written in this document or in any op file** |
| What it changes | The two `SET LOCAL` lines. One column, `guest_booking_requests.email` (`text`, nullable, no default), with the CHECK `guest_booking_requests_email_check`, and the column's comment |
| What it never touches | every row (no backfill, no rewrite: measured, see "Rehearsal"), every policy, every function (so the SECURITY DEFINER count stays where it is: **no count GATE-CHANGE after the apply**), every relation privilege, every column privilege, every default privilege, every other column, constraint and index of the table. The post-check proves each |

**THIS DOCUMENT PINS ITSELF, and the sidecar is why.** A document cannot contain its own sha256, so
the digest lives in `docs/migration-apply-0101.sha256` and every block checks it with
`shasum -a 256 -c` before it trusts a pin written here. The sidecar sits on the same head as the
document, so a main that moved to a new document and a new sidecar together would pass that check.
**GREEN's dispatch closes that by machine:** it pins this document's sha256 on its own and checks
it against the `origin/main` it resolves. From stage 0 on, the HEAD CHECK halts on any moved main
before the apply.

**There is no `#` line inside any block,** every parameter a colon follows is braced, there are no
backslash continuations and no `!` except `test !`. The blocks are pasted into zsh
(`scripts/owner-blocks-survive-zsh.test.mjs` reads this document by its number). Narration is
`echo`. Every halt is an explicit `STOP:` line followed by a non-zero exit, never `set -e`.

**The migration's own header names no number of its own,** only 0100's, as the migration it
follows, so the rename leaves nothing stale in it.

## 1. What it does

Four statements, each ended by `--> statement-breakpoint`.

| # | Statement | Effect |
|---|---|---|
| 1 | `SET LOCAL lock_timeout = '5s';` | a lock this transaction cannot take in 5 seconds fails it, and nothing is applied |
| 2 | `SET LOCAL statement_timeout = '60s';` | no statement in this transaction runs longer than 60 seconds |
| 3 | `ALTER TABLE public.guest_booking_requests ADD COLUMN email text CONSTRAINT guest_booking_requests_email_check CHECK (email IS NULL OR (char_length(email) <= 320 AND email ~ '^[^@ \t\n\r\f\v]+@[^@ \t\n\r\f\v]+\.[^@ \t\n\r\f\v]+$'))` | one nullable column with no default, so no row is rewritten and every existing row reads NULL; the CHECK is validated by one scan of the table |
| 4 | `COMMENT ON COLUMN public.guest_booking_requests.email IS '...'` | the column's comment |

No GRANT, no REVOKE, no policy, no function, no index, no row. It is the shape of 0081's
`locale` column on the same table, plus the two SET LOCAL lines.

**The CHECK, and why it is no stricter than the application.** The application's own rule for an
email is in `apps/web/lib/patients/validation.ts`: trimmed, at most 320 characters, and matching
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. The CHECK is a backstop behind that rule, never a second validator,
so it must admit every value the application admits:

- **Length:** at most 320, counted by `char_length` (code points). The application counts UTF-16
  units, which is never fewer, so a value the application admits is never longer here.
- **Shape:** the same three parts, something `@` something `.` something, where "something" holds
  no `@` and none of the six ASCII whitespace characters (space, tab, line feed, carriage return,
  form feed, vertical tab). The application's `\s` forbids those six and the Unicode spaces; the
  CHECK forbids the six only, so it is the looser of the two, on purpose.
- **Why not `[[:space:]]`.** Measured on the build lane's stacks (Postgres 17.6, ICU locale
  provider, `en_US.UTF-8`): `[[:space:]]` matches U+0085, which the application's `\s` does not. A
  CHECK written with that class would refuse a value the application admits. The DB-gated suite
  reads the application's rule out of its source file and requires the CHECK to admit every value
  that rule admits, U+0085 included.
- **NULL is admitted and the empty string is not:** the application stores "no email" as NULL.

## 2. Who reads and writes the column, and why the migration grants nothing

- **The table's privileges are table-level, and they are 0065's.** `authenticated` holds SELECT
  and UPDATE: reception's queue and the convert. It holds no INSERT, by 0063's design: the public
  form's insert runs on the owning role's connection (`getDbAdmin`, `packages/db/src/client.ts`),
  after the route's own rate limits and validation. `anon` and `patient` hold nothing.
- **A table-level privilege covers every column, one added later included,** and no column of this
  table carries a column-level grant (pre-check verdict 7). So the new column is read and written
  by exactly the roles that read and write `phone`, and the migration holds no GRANT and no
  REVOKE. Post-check verdict 7 compares the two columns' privileges cell by cell.
- **Row level security is unchanged.** RLS is on; the two policies of 0063 (staff SELECT and staff
  UPDATE, each on the tenant of the JWT, each TO `authenticated`) decide which rows a caller sees,
  and a column added to a row is behind the same policies. **No policy is created, changed or
  dropped:** a `CREATE POLICY` would take the platform locks SAT-01's measurement found (R39),
  and none is needed.
- **Staff of another tenant cannot read it,** measured as an assigned principal (the DB-gated
  suite): they read no row of the other tenant, beside reading their own tenant's row.

## 3. What breaks: nothing, and here is the evidence rather than the claim

- **No code reads or writes the column yet.** The application half is a second pull request
  (`portal/GUEST-EMAIL-optional-field`), merged only after 0101 is on production.
- **THE DRIZZLE SCHEMA COLUMN IS NOT ON THIS BRANCH, ON PURPOSE.** drizzle's `insert` names
  every column of the table it was given, with `default` for the ones the caller left out. The
  public form's write is `tx.insert(guestBookingRequests).values(...)`
  (`apps/api/lib/guest-intake/write.ts`). So a `schema.ts` that declares `email` makes that INSERT
  name `"email"`, and on a database without the column it fails with 42703 and the public form
  answers 503. This PR merges BEFORE the apply (as 0099 and 0100 did), so the schema column
  travels with the application pull request, which lands only after the apply. Measured on the
  build lane: see "Rehearsal", row "the schema column before the database column".
- **Every existing reader names its columns.** Reception's queue selects named columns, the
  convert selects named columns, and the retention job never reads this table's contact columns.
  Measured: the whole `packages/db` DB-gated suite on a database with 0101 applied, 1425 of 1425 passed, none skipped.
- **No gate count moves.** No function is created, so the SECURITY DEFINER count and the 0079 ACL
  test's lists stay as they are.

## No behaviour check on production, and why

The pre-check and the post-check assert catalogue facts and counts. The behaviour (the CHECK fired
for real, staff of another tenant reading nothing) needs rows of two tenants and a refused
INSERT, and a READ ONLY transaction can seed neither. It is proven where it can be measured: the
DB-gated suite on a lane stack, and CI's `db-tests` from the promotion on. The post-check's
catalogue verdicts (2, 7 and 8) pin what that behaviour rests on: the constraint's definition, the
column's privileges beside `phone`'s, RLS on with the same two policies.

## 4. R9: the sitting is closed hours only, by the weekday table

S-1002-A R9, strategy's words: "DAYTIME APPLIES, owner ruled B, from 0100: a clinic-hours sitting
is allowed only when all three hold, each proven in the apply document: (1) the SET LOCAL gate is on
main; (2) the migration is catalog-only or touches no table reception writes; (3) the read-only
pre-check ran on production in an earlier sitting, output recorded. Else closed hours."

**Said plainly: R9's daytime conditions do not hold for 0101, and this document runs in closed
hours whatever they read.**

1. **Condition 1 holds:** the SET LOCAL gate is on main (`SHAGATE`), and the file's first two
   statements are the two lines.
2. **Condition 2 does not hold, by SOLO's reading.** The change rewrites no row, but it is not
   catalog-only in 0100's sense (0100 took no table lock): `ALTER TABLE` takes ACCESS EXCLUSIVE
   on `public.guest_booking_requests` until the COMMIT and validates the CHECK by a scan of the
   table under that lock. And it is a table reception writes: every convert and every dismiss is
   an UPDATE of it, and the public form inserts into it at any hour.
3. **Condition 3 does not hold:** this document has no earlier pre-check sitting.

**The clinic hours, from 0101 on, are a weekday table in Lisbon time, and the table lives in this
document** because production holds one `opens_at` and `closes_at` pair per location and no
weekday dimension:

| Lisbon weekday | Clinic hours | Closed, so a sitting may run |
|---|---|---|
| Monday to Friday | 08:00 to 21:00 | before 08:00 and from 21:00 |
| Saturday | 08:00 to 13:00 | before 08:00 and from 13:00 |
| Sunday | closed | all day |

**The arm, in stage 0 and again in stage 1 right before the apply:**

- It reads the Lisbon weekday and time in ONE `date` call (`TZ=Europe/Lisbon date +%u%H%M`, the
  ISO weekday 1 to 7 and then HHMM), refuses a reading that is not five such digits, and decides
  `closed` or `open` by the table. A boundary minute belongs to the hour it starts: Friday 20:59 is
  open and Friday 21:00 is closed; Saturday 12:59 is open and Saturday 13:00 is closed; Sunday
  15:00 is closed; Monday 07:59 is closed. `scripts/guest-request-email-0101.test.mjs` runs both
  stages whole at each of those six minutes, and at every boundary of every weekday.
- **Stage 1 also reads the clinics' own rows, READ ONLY, and uses them to check the table, not
  the clock.** A row cannot say "Saturday afternoon is closed", so it cannot decide the hour. What
  it can say is that the table is stale: stage 1 counts the active clinics whose own `opens_at` is
  before 08:00 or whose `closes_at` is after 21:00, the table's widest row, and STOPs unless that
  count is 0 of at least one active clinic. **A JUDGMENT, NOT A RULING** (see "JUDGMENTS").
- It prints R9's three proofs: proof 1 computed as 0100 computes it, proofs 2 and 3 fixed `no`.
  No arm here can turn either to `yes`.
- Inside clinic hours the block STOPs with nothing applied, whatever proof 1 reads. **There is no
  owner-override arm and no date in any arm.** An override would be a new amendment with its own
  R4 round (R8).

## G4: the locks, statement by statement (measured, 2026-10-04)

Strategy's gate G4: "0101 lock read on the throwaway, statement by statement. EXPECT: no auth
table locked. Anything else, halt."

**How.** The pending file's four statements, run one at a time inside ONE transaction that was
ROLLED BACK, with node and the `postgres` package (never psql), reading this backend's rows of
`pg_locks` after every statement. Run twice: on the throwaway at 127.0.0.1:54522 (a lane stack at
an older position: MAINTAIN still granted, 26 SECURITY DEFINER functions, no drizzle journal), and
on the build lane's own stack at 127.0.0.1:54622 at main's position (0000 to 0100). Both are
`supabase/postgres` 17.6. The two runs read the same locks.

| # | Statement | Locks on relations that existed before, new at this statement |
|---|---|---|
| 1 | `SET LOCAL lock_timeout = '5s'` | none |
| 2 | `SET LOCAL statement_timeout = '60s'` | none |
| 3 | `ALTER TABLE ... ADD COLUMN email ... CHECK (...)` | **ACCESS EXCLUSIVE on `public.guest_booking_requests`**; ROW EXCLUSIVE on the sequence `graphql.seq_schema_version` |
| 4 | `COMMENT ON COLUMN ...` | SHARE UPDATE EXCLUSIVE on `public.guest_booking_requests` |

- **No `auth`, `storage` or `realtime` relation was locked, at any statement: 0 of 0.** The
  verdict of G4 is PASS.
- **One relation outside `public` was locked, and it is said here rather than left out:** the
  sequence `graphql.seq_schema_version`, ROW EXCLUSIVE, from statement 3. It is the platform's
  GraphQL extension counting a schema change on every DDL statement (a `nextval`). ROW EXCLUSIVE
  on a sequence does not block another `nextval`, a read or a write of any table.
- **ACCESS EXCLUSIVE was taken on exactly one table, `public.guest_booking_requests`,** from
  statement 3 until the end of the transaction: 6.7 ms on the stack at main's position and 10.5 ms
  on the throwaway, from the first statement to the last lock read. On production it is held until
  drizzle's single COMMIT. While it is held, a public form submission and reception's queue wait.
- **Besides those:** ACCESS SHARE on `pg_catalog` relations, the transaction's own `virtualxid`
  and `transactionid`, and ROW EXCLUSIVE on `pg_catalog.pg_description` (the comment).
- **A held lock is a clean failure, measured:** with another session holding an open read on the
  table, the ALTER TABLE waited 5.0 seconds and failed `55P03 canceling statement due to lock
  timeout`; the table's columns were identical before and after.
- **Not measured on production.** Its platform configuration was not read. If a production
  setting made an ALTER TABLE lock a platform table, the 5 second bound would turn a wait into a
  clean failure, and the sitting is in closed hours.

## THE ORDER OF PULL REQUESTS

Strategy's ruling R35, as this lane holds it: no gate edit inside a sitting; each gate edit is its
own GATE-CHANGE pull request, merged by the owner on green; the ones a promotion needs merge
before the promotion; a post-apply count edit merges after GREEN reports.

| Order | Pull request | What it carries | Who merges |
|---|---|---|---|
| 1 | **GATE-CHANGE, before the promotion** | `scripts/maintain-revoke-0100.test.mjs`: its harness builds the fake apply tree's journal AS OF 0100 (the live journal cut after 0100's entry) instead of copying the live journal; and `.github/gate-manifest.json`, regenerated. Nothing else | the owner, on green |
| 2 | this branch, `db/0101-guest-request-email`, promoted, `held-for-apply` | the migration, this document and its sidecar, the two check files, the DB-gated suite, the script test, the pending README. No gate file is edited: the script test is a NEW file, which the freeze allows | the owner (label off, then merge), after R4, the rehearsal and CI |
| 3 | the sitting | GREEN applies from the merge commit. No pull request, and no gate edit | - |
| 4 | **no post-apply GATE-CHANGE** | 0101 creates no function, so the SECURITY DEFINER count (28) and the 0079 ACL lists do not move | - |
| 5 | `portal/GUEST-EMAIL-optional-field` | the application half: the form's field, the route, the schema column, the convert, the queue. After GREEN's report | SOLO, R4 PASS plus green (Tier B) |

**Why step 1 is forced, measured on 2026-10-04.** 0100's script test copies the LIVE
`packages/db/migrations/meta/_journal.json` into its fake apply tree, and 0100's stage 0 requires
the newest journal entry to be `idx 97, tag 0100_revoke_maintain, of 98`. The promotion appends
`idx 98`. On a scratch copy of the promoted tree, `pnpm test:scripts` read 1347 of 1351 passed and
4 failed, all four in `scripts/maintain-revoke-0100.test.mjs` ("the positive control did not reach
its last line ... STOP: the newest journal entry is not idx 97"). With the six-line edit of row 1
applied to that scratch copy, the file read 28 of 28. The file is in the manifest, so the edit is a
GATE-CHANGE; it passes on today's main too, where cutting after 0100 changes nothing.

**This document's own script test does not repeat that.** Its harness builds the journal it needs
(the live entries up to 0100, then 0101's), so a later promotion does not redden it.

**No other gate file moves, and three were checked on purpose.**
`.github/scripts/assert-rls-executed.mjs` holds a list of permitted skips for a DB-gated suite
whose migration is still pending; this branch needs no entry there, because its suite registers
only the arm that applies and skips nothing. `packages/db/scripts/check-security-definer-owner.mjs`
keeps its count: 0101 creates no function. And `scripts/gate-manifest.mjs` freezes a script test
only once a GATE-CHANGE regenerates the manifest, so the new `scripts/guest-request-email-0101.test.mjs`
is added by row 2 as an ordinary file; any edit to it after the next manifest regeneration is a
GATE-CHANGE of its own.

## Merged before the apply, and why that is safe here

**The PR carries no app code,** and in particular no `schema.ts` change (section 3). It carries the
migration, this document and its sidecar, the two check files, the DB-gated suite, a script test and
the pending README. Nothing in the application reads or writes the column, so the application
behaves the same before and after the apply, and a merged main that production has not caught up
with yet is a state the application already lives in.

**Between the merge and the apply, main is ahead of production by exactly one migration,** and the
pre-check says so: it passes only while 0101 is absent from the journal and 0100 is its newest row.
The daily `prod-drift-check` would report 0101 as pending if the sitting halted before the apply;
that report is correct, and it is informational.

**Exactly one `packages/db/migrations/0101_*.sql` may exist; if anything else is ever found under
`0101_`, STOP.** The number is the apply authorisation (S-1004-A R41 put this item on 0101; the
`CLAUDE.md` table still reads "0101 onward SAT-01" until the docs PR that records R41).

## The HEAD CHECK, and running from main

No block reads a branch, and there is no separate HEAD CHECK to paste: the machine runs it inside
every block.

- **Stage 0** refuses once stage 1 has applied, checks that the apply worktree is clean, removes the
  previous sha and run-window records, fetches, resolves `origin/main`, checks that sha out detached
  and verifies HEAD is it, verifies the sidecar, the promotion, the journal, 0100's bytes and every
  pin, runs the clock arm, and only then records the sha in `/tmp/0101-main.sha`.
- **The run window is checked by machine in every block from stage 1 on,** from the record GREEN's
  CLOCK CHECK writes after stage 0.
- **Stage 1 begins with the HEAD CHECK:** read the recorded sha, fetch, resolve `origin/main` again,
  print both, and HALT on any difference with `STOP: main moved since stage 0, the merge freeze was
  broken.` It runs before the environment is loaded and before psql. It then checks out the RECORDED
  sha and asserts every file it runs by sha256.
- **After stage 1 has applied: NEVER run stage 0 or 1 again.** Each refuses once the applied marker
  `/tmp/0101-applied.ok` exists (younger than 12 hours), and `verified-migrate.mjs` refuses an
  already-applied migration regardless (exit 3).
- **Stage 2 and the closing read are READ ONLY** and run from the recorded sha whatever main has
  done since: each prints whether main moved, with both shas, and never stops on it. **A fetch that
  fails is a STOP in every block, these two included,** because whether main moved is then not known.

## STAGE 0: the promotion, the files, the clock and the recorded head

```
(
set -eo pipefail
DOCPIN=docs/migration-apply-0101.sha256
MIG=packages/db/migrations/0101_guest_request_email.sql
PEND=packages/db/migrations-pending/NEXT-AFTER-0100_guest_request_email.sql
SHA0101=36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b
SHAPREV=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPRE=afd23d345ecadc1ca32005b9f5c2005e2664573eeaebec2f91a50810e9994be0
SHAPOST=9970e0e9155c2b36730ddb2130319bbe25468f7bf8446e114e71e375a4d5f702
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHACJ=7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0101-applied.ok || { AGE=$(find /tmp/0101-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0101 in this sitting, or the age of /tmp/0101-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }
rm -f /tmp/0101-main.sha /tmp/0101-window.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so origin/main may be stale. Nothing was applied"; exit 1; }
MAIN=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${MAIN})" = commit ] || { echo "STOP: origin/main does not resolve to a commit"; exit 1; }
git checkout -q --detach ${MAIN} || { echo "STOP: the checkout of origin/main failed. Nothing was applied"; exit 1; }
echo "--- THE HEAD CHECK: the worktree must be on the origin/main this stage records"
[ "$(git rev-parse HEAD)" = "${MAIN}" ] || { echo "STOP: the worktree is not on origin/main after the checkout"; exit 1; }
echo "origin/main and HEAD: ${MAIN}"

test -f ${DOCPIN} || { echo "STOP: the document pin is not on disk at origin/main"; exit 1; }
shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0101 is not on disk at origin/main, so the PR has not merged"; exit 1; }
test ! -f ${PEND} || { echo "STOP: the pending copy still exists, so the rename did not happen"; exit 1; }
N101=$(find packages/db/migrations -maxdepth 1 -name '0101_*.sql' | wc -l | tr -d ' ')
[ "${N101}" = 1 ] || { echo "STOP: ${N101} files claim migration number 0101, not 1"; exit 1; }
N100=$(find packages/db/migrations -maxdepth 1 -name '0100_*.sql' | wc -l | tr -d ' ')
[ "${N100}" = 1 ] || { echo "STOP: ${N100} files claim migration number 0100, not 1"; exit 1; }
test -f scripts/db/precheck-0101-guest-request-email.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f scripts/db/postcheck-0101-guest-request-email.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
test -f packages/db/scripts/read-applied-migrations.mjs || { echo "STOP: the migration reader is not on disk"; exit 1; }
test -f scripts/check-journal.mjs || { echo "STOP: check-journal is not on disk"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0101}" ] || { echo "STOP: 0101 on disk is not the approved body"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0101-guest-request-email.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0101-guest-request-email.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/read-applied-migrations.mjs | cut -d' ' -f1)" = "${SHAREADER}" ] || { echo "STOP: the migration reader on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/check-journal.mjs | cut -d' ' -f1)" = "${SHACJ}" ] || { echo "STOP: check-journal on disk is not the approved file"; exit 1; }

node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const e=j.entries[j.entries.length-1];const p=j.entries[j.entries.length-2];console.log('newest journal entry: idx '+e.idx+', when '+e.when+', tag '+e.tag+', of '+j.entries.length+'; before it idx '+p.idx+', when '+p.when+', tag '+p.tag);process.exit(j.entries.length===99&&e.idx===98&&e.tag==='0101_guest_request_email'&&e.when===1788502200000&&p.idx===97&&p.tag==='0100_revoke_maintain'&&p.when===1788502100000?0:1)" || { echo "STOP: the newest journal entry is not idx 98, tag 0101_guest_request_email, when 1788502200000, of 99, after idx 97 tagged 0100_revoke_maintain at when 1788502100000"; exit 1; }
test -f packages/db/migrations/0100_revoke_maintain.sql || { echo "STOP: the file of journal idx 97 is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0100_revoke_maintain.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0100 on disk is not the file this document pins"; exit 1; }
echo "0100 on disk: 0100_revoke_maintain.sql, sha256 ${SHAPREV}"
node scripts/check-journal.mjs 2>&1 | tee /tmp/0101-check-journal.out || { echo "STOP: check-journal failed (its lines are above), or its output could not be written. Nothing was applied"; exit 1; }
grep -qF '99 .sql files match 99 journal entries' /tmp/0101-check-journal.out || { echo "STOP: check-journal did not reconcile 99 files with 99 journal entries"; exit 1; }

echo "--- THE CLOCK (R9): 0101 alters a table reception writes, so only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DT=$(TZ=Europe/Lisbon date +%u%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7) and HHMM. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM): ${CLOCK} by the weekday table"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${MAIN} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (its ALTER TABLE takes ACCESS EXCLUSIVE on guest_booking_requests, which reception updates and the public form inserts into)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the weekday table. 0101 runs in closed hours only"; else echo "STOP: Lisbon ${DT} is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed). 0101 takes ACCESS EXCLUSIVE on guest_booking_requests, a table reception writes, so the sitting waits for closed hours. Nothing was applied"; exit 1; fi

echo "${MAIN}" > /tmp/0101-main.sha || { echo "STOP: the sha could not be recorded in /tmp/0101-main.sha. Nothing was applied"; exit 1; }
echo "running from origin/main ${MAIN}, recorded in /tmp/0101-main.sha"
echo "0101 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED"
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and `origin/main and HEAD: <sha>`; the sidecar line
`docs/migration-apply-0101.md: OK`; then
`newest journal entry: idx 98, when 1788502200000, tag 0101_guest_request_email, of 99; before it idx 97, when 1788502100000, tag 0100_revoke_maintain`;
then `0100 on disk: 0100_revoke_maintain.sql, sha256 80f85018...`; then check-journal's line
`... 99 .sql files match 99 journal entries in order ...`; then the clock:
`Lisbon weekday and time <DHHMM> (...): closed by the weekday table`, the three proof lines (proof 1
`yes` while main's gate file hashes to `SHAGATE`, proofs 2 and 3 `no, by construction`), and
`R9: closed hours by the weekday table. 0101 runs in closed hours only`; then
`running from origin/main <sha>, recorded in /tmp/0101-main.sha`; then
`0101 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED`. Exit 0. It reads no database. The sha it prints is
the one every later stage runs from.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass. Any other ending is a `STOP:`
line and exit 1, with nothing applied: a failed fetch, `git status`, checkout or check-journal each
print their own `STOP:`, and `/tmp/0101-main.sha` is written only after every check has passed, so
a STOP leaves no new record of the sha. Inside clinic hours the clock's STOP is the arm working. A
proof 1 line that cannot be computed reads `no`, and decides nothing.

**Until the PR is merged, this stage ends at its first file check,**
`STOP: the document pin is not on disk at origin/main` (or, were the document on main without the
promotion, `STOP: 0101 is not on disk at origin/main, so the PR has not merged`). That is the safe
direction, and the halt rule governs it.

## STAGE 1: the HEAD CHECK, the pre-check, the clock and the clinics, the apply

```
(
set -eo pipefail
MIG=packages/db/migrations/0101_guest_request_email.sql
SHA0101=36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b
SHAPREV=80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106
SHAPRE=afd23d345ecadc1ca32005b9f5c2005e2664573eeaebec2f91a50810e9994be0
SHAVM=ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
SHAGATE=e150a805983e476ea74bfae609d31c57c184b24e09c2f828eddb9df5a09fcef6

cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. Nothing was applied"; exit 1; }
test ! -f /tmp/0101-applied.ok || { AGE=$(find /tmp/0101-applied.ok -mmin -720) && [ -z "${AGE}" ]; } || { echo "STOP: stage 1 has ALREADY APPLIED 0101 in this sitting, or the age of /tmp/0101-applied.ok could not be read. The sitting stops here. Never run stage 0 or 1 again. GREEN reports this whole output, and stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
rm -f /tmp/0101-precheck.new || { echo "STOP: the old /tmp/0101-precheck.new could not be removed. Nothing was applied"; exit 1; }
STRAY=$(git status --short) || { echo "STOP: git status failed in the apply worktree. Nothing was applied"; exit 1; }
[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }

echo "--- THE HEAD CHECK: origin/main must still be the sha stage 0 recorded."
test -f /tmp/0101-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The sitting stops"; exit 1; }
REC=$(cat /tmp/0101-main.sha) || { echo "STOP: stage 0's record /tmp/0101-main.sha could not be read. Nothing was applied"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. Nothing was applied"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. Nothing was applied"; exit 1; }
echo "recorded by stage 0: ${REC}"
echo "origin/main now:     ${NOW}"
[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken. The sitting halts and nothing is applied. Report both shas above"; exit 1; }
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. Nothing was applied"; exit 1; }
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout. Nothing was applied"; exit 1; }
shasum -a 256 -c docs/migration-apply-0101.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f ${MIG} || { echo "STOP: 0101 is not on disk"; exit 1; }
test -f scripts/db/precheck-0101-guest-request-email.sql || { echo "STOP: the pre-check is not on disk"; exit 1; }
test -f packages/db/scripts/verified-migrate.mjs || { echo "STOP: verified-migrate is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
N101=$(find packages/db/migrations -maxdepth 1 -name '0101_*.sql' | wc -l | tr -d ' ')
[ "${N101}" = 1 ] || { echo "STOP: ${N101} files claim migration number 0101, not 1"; exit 1; }
[ "$(shasum -a 256 ${MIG} | cut -d' ' -f1)" = "${SHA0101}" ] || { echo "STOP: 0101 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/precheck-0101-guest-request-email.sql | cut -d' ' -f1)" = "${SHAPRE}" ] || { echo "STOP: the pre-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 packages/db/scripts/verified-migrate.mjs | cut -d' ' -f1)" = "${SHAVM}" ] || { echo "STOP: verified-migrate on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }
T100=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[97];process.stdout.write(p&&p.idx===97&&p.tag==='0100_revoke_maintain'?p.tag:'none')") || { echo "STOP: node could not read journal idx 97's tag at the recorded sha. Nothing was applied"; exit 1; }
W100=$(node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/migrations/meta/_journal.json','utf8'));const p=j.entries[97];process.stdout.write(p&&p.idx===97&&p.tag==='0100_revoke_maintain'?String(p.when):'none')") || { echo "STOP: node could not read journal idx 97's when at the recorded sha. Nothing was applied"; exit 1; }
echo "${W100}" | grep -qxE '[0-9]{13}' || { echo "STOP: 0100's journal when did not parse from the journal at the recorded sha. Nothing was applied"; exit 1; }
test -f packages/db/migrations/${T100}.sql || { echo "STOP: the file of journal idx 97 is not on disk. Nothing was applied"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/${T100}.sql | cut -d' ' -f1)" = "${SHAPREV}" ] || { echo "STOP: 0100 on disk is not the file this document pins. Nothing was applied"; exit 1; }
echo "0100: packages/db/migrations/${T100}.sql, sha256 ${SHAPREV}, journal when ${W100}"

echo "--- THE RUN WINDOW: GREEN's dispatch names it and its CLOCK CHECK recorded it. Stage 1 starts inside it or not at all"
test -f /tmp/0101-window.ok || { echo "STOP: the dispatch's CLOCK CHECK recorded no run window after this sitting's stage 0. Nothing was applied"; exit 1; }
WREC=$(cut -d' ' -f1 /tmp/0101-window.ok)
WOPEN=$(cut -d' ' -f2 /tmp/0101-window.ok)
WSTART=$(cut -d' ' -f3 /tmp/0101-window.ok)
WEND=$(cut -d' ' -f4 /tmp/0101-window.ok)
[ "${WREC}" = "${REC}" ] || { echo "STOP: the run window was recorded for ${WREC}, not for the sha stage 0 recorded. Nothing was applied"; exit 1; }
echo "${WOPEN} ${WSTART} ${WEND}" | grep -qxE '[0-9]{12} [0-9]{12} [0-9]{12}' || { echo "STOP: the recorded run window did not parse. Nothing was applied"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M') || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: opens ${WOPEN}, stage 1 starts by ${WSTART}, everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -ge "${WOPEN}" ] || { echo "STOP: Lisbon ${NOWL} is before the run window opens at ${WOPEN}. Nothing was applied"; exit 1; }
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART}, the last minute the run window lets stage 1 start. Nothing was applied"; exit 1; }
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. Nothing was applied"; exit 1; }
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is not before ${WEND}, the run window's end, so the recorded window is not this sitting's. Nothing was applied"; exit 1; }

echo "--- the production target, asserted by the guard, not by the prompt"
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. Nothing was applied"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). Nothing was applied"; exit 1; }

echo "--- the pre-check. READ ONLY. Its transcript IS the carry, so it is kept"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v prev_hash=${SHAPREV} -v prev_when=${W100} -f scripts/db/precheck-0101-guest-request-email.sql 2>&1 | tee /tmp/0101-precheck.new || { echo "STOP: the pre-check did not complete (psql's lines are above), or its transcript could not be written. Nothing was applied"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0101-precheck.new || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the pre-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. Nothing was applied and no earlier transcript was touched"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0101-precheck.new || true)
[ "${OKS}" = 13 ] || { echo "STOP: the pre-check printed ${OKS} OK verdicts, not 13. Nothing was applied"; exit 1; }

NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M') || { echo "STOP: the Lisbon clock could not be read again before the apply. Nothing was applied"; exit 1; }
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM before the apply. Nothing was applied"; exit 1; }
echo "run window, again before the apply: now ${NOWL}, stage 1 starts by ${WSTART}"
[ "${NOWL}" -le "${WSTART}" ] || { echo "STOP: Lisbon ${NOWL} is past ${WSTART} after the pre-check, so the apply does not start. Nothing was applied"; exit 1; }

echo "--- THE CLOCK AND THE CLINICS (R9), again, right before the apply: only closed hours pass. The weekday table, Lisbon time: Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed"
DT=$(TZ=Europe/Lisbon date +%u%H%M) || { echo "STOP: the Lisbon clock could not be read. Nothing was applied"; exit 1; }
echo "${DT}" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo "STOP: the Lisbon clock did not read as a weekday (1 to 7) and HHMM. Nothing was applied"; exit 1; }
if awk -v s="${DT}" 'BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed; else CLOCK=open; fi
echo "Lisbon weekday and time ${DT} (the first digit is the weekday, 1 Monday to 7 Sunday, then HHMM): ${CLOCK} by the weekday table"
CL=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) filter (where is_active and (opens_at < time '08:00' or closes_at > time '21:00')) || ' of ' || count(*) filter (where is_active) from public.locations" | tail -1) || { echo "STOP: the clinics' own hours could not be read (psql's lines are above). Nothing was applied"; exit 1; }
echo "active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: ${CL}"
if awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] == "0" && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/) exit 0; exit 1 }'; then CLINICS=inside; elif awk -v s="${CL}" 'BEGIN { n = split(s, a, " "); if (n == 3 && a[1] ~ /^[1-9][0-9]*$/ && a[2] == "of" && a[3] ~ /^[1-9][0-9]*$/ && (a[1] + 0) <= (a[3] + 0)) exit 0; exit 1 }'; then CLINICS=outside; else echo "STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic [${CL}]. Nothing was applied"; exit 1; fi
echo "the clinics' own rows against the weekday table: ${CLINICS}"
D1=no
if echo "${SHAGATE}" | grep -qxE '[0-9a-f]{64}' && test -f scripts/migration-timeouts.test.mjs && [ "$(shasum -a 256 scripts/migration-timeouts.test.mjs | cut -d' ' -f1)" = "${SHAGATE}" ]; then D1=yes; fi
D2=no
D3=no
echo "R9 proof 1, the SET LOCAL gate is on main (scripts/migration-timeouts.test.mjs at ${REC} hashes to SHAGATE): ${D1}"
echo "R9 proof 2, the migration is catalog-only or touches no table reception writes: ${D2}, by construction (its ALTER TABLE takes ACCESS EXCLUSIVE on guest_booking_requests, which reception updates and the public form inserts into)"
echo "R9 proof 3, the read-only pre-check ran on production in an earlier sitting: ${D3}, by construction (this document has no earlier pre-check sitting)"
if [ "${CLOCK}${CLINICS}" = closedinside ]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it. 0101 runs in closed hours only"; else echo "STOP: Lisbon ${DT}, clock ${CLOCK}, clinics ${CLINICS}. Either it is inside clinic hours by the weekday table (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00, Sunday closed), or a clinic's own row reaches outside 08:00 to 21:00 and the table in this document is stale. 0101 takes ACCESS EXCLUSIVE on guest_booking_requests, a table reception writes, so nothing was applied"; exit 1; fi

echo "--- only now, with a passing pre-check and the clock decided, does the previous sitting's state go"
rm -f /tmp/0101-postcheck.out /tmp/0101-stage2.ok /tmp/0101-journal-after.out /tmp/0101-apply.out /tmp/0101-applied.ok || { echo "STOP: the previous sitting's records could not be removed. Nothing was applied"; exit 1; }
mv /tmp/0101-precheck.new /tmp/0101-precheck.out || { echo "STOP: the pre-check transcript could not be moved to /tmp/0101-precheck.out. Nothing was applied"; exit 1; }

echo "--- the apply. It is the only writing command in this document. Its full output is teed to /tmp/0101-apply.out"
node packages/db/scripts/verified-migrate.mjs --tag 0101_guest_request_email --sha256 ${SHA0101} --expect-pending 1 2>&1 | tee /tmp/0101-apply.out || { RC=$?; echo "STOP: the apply exited ${RC}: verified-migrate's own code if tee succeeded, tee's code if tee failed (pipefail returns the rightmost failure). Do not read this as nothing applied: exit 3 or 4 can follow a committed apply. No applied marker was written. Paste nothing else, not stage 1 again and not the journal read; report this whole output (/tmp/0101-apply.out holds it). Whether 0101 is applied is read only on the owner's or the lead's word"; exit ${RC}; }
touch /tmp/0101-applied.ok || { echo "STOP: verified-migrate exited 0, so 0101 IS APPLIED and the write stands, but /tmp/0101-applied.ok could not be written, so stage 2 would refuse. Paste nothing else; stage 2 (READ ONLY) runs only on the owner's or the lead's word"; exit 1; }
echo "0101 APPLIED. Paste stage 2 now."
)
```

**EXPECT, and these are what stage 1 is read for:**

- **`--- THE HEAD CHECK`, then `recorded by stage 0: <sha>` and `origin/main now:     <sha>`, the
  same sha twice** (the block halts otherwise, before the environment is loaded), then
  `docs/migration-apply-0101.md: OK`;
- **`0100: packages/db/migrations/0100_revoke_maintain.sql, sha256 80f85018..., journal when 1788502100000`;**
- **`run window, Lisbon YYYYMMDDHHMM: opens <t>, stage 1 starts by <t>, everything ends before <t>; now <t>`,**
  with now inside it, then the target guard's `host:`, `port:`, `ref:` and
  `target verified: production, session pooler.`;
- **the pre-check prints `13` OK verdicts and no FAIL,** `journal_rows_before` 98, verdict 2 naming
  0100 as the newest row at 1788502100000, verdict 6 `authenticated SELECT,UPDATE`, verdict 12 the
  eighteen column names, its eleven CARRY rows and three INFO rows (report them as printed: the
  row count and the count of other sessions holding a lock on the table are profiles);
- **`run window, again before the apply: now <t>, stage 1 starts by <t>`;**
- **the clock and the clinics:** `Lisbon weekday and time <DHHMM> (...): closed by the weekday table`,
  `active clinics whose own hours reach outside 08:00 to 21:00, the table's widest row: 0 of <n>`
  with `n` at least 1, `the clinics' own rows against the weekday table: inside`, the three proof
  lines, then `R9: closed hours by the weekday table, and every active clinic's own hours lie inside
  it. ...`; otherwise the STOP, with nothing applied;
- **verified-migrate, teed whole to `/tmp/0101-apply.out`:**
  `file       0101_guest_request_email.sql present, sha256 matches`,
  `journal    98 row(s) applied, last when=1788502100000`,
  `pending    1  [0101_guest_request_email]` (exactly one), the drizzle-kit banner with its
  stdout, stderr and exit, then `journal    98 -> 99  (delta 1)`,
  `0101_guest_request_email present by sha256: yes`,
  `OK: the journal moved by exactly the pending count and carries the approved sha256.`;
- **the last line, exactly, `0101 APPLIED. Paste stage 2 now.`** Stage 2 re-reads the journal from
  the database rather than trusting these lines.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only onward path to
stage 2. Any other ending is a `STOP:` line and a non-zero exit. A refusing target guard prints
`STOP: the target guard refused or failed (its lines are above). Nothing was applied` before psql runs
the pre-check and before verified-migrate. A failed apply prints `STOP: the apply exited <code>: ...`,
exits with that same code and writes no `/tmp/0101-applied.ok`, so stage 2 refuses. A failed `touch`
of that marker after an exit-0 apply prints `STOP: verified-migrate exited 0, so 0101 IS APPLIED and
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
whether 0101 is applied is `packages/db/scripts/read-applied-migrations.mjs`, READ ONLY, and it runs
only on the owner's or the lead's word.

**A fired bound is a clean failure, measured on the build lane's stack:** with another session
holding an open read on the table, the ALTER TABLE failed after 5.0 seconds with `canceling statement
due to lock timeout`, and the table's columns were unchanged. On production it would read
`journal    98 -> 98  (delta 0)`. It is still a halt, and the lead rules on it.

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
set -eo pipefail
SHA0101=36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b
SHAPOST=9970e0e9155c2b36730ddb2130319bbe25468f7bf8446e114e71e375a4d5f702
SHAGUARD=6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c

rm -f /tmp/0101-stage2.ok || { echo "STOP: the old stage 2 pass mark could not be removed. The write of stage 1 stands; stage 2 did not run"; exit 1; }
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. The write of stage 1 stands; stage 2 did not run"; exit 1; }
echo "--- THE HEAD CHECK: stage 2 runs from the recorded sha, and reports whether main moved"
test -f /tmp/0101-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting, and stage 2 runs only from the recorded sha. The lead rules"; exit 1; }
REC=$(cat /tmp/0101-main.sha) || { echo "STOP: stage 0's record /tmp/0101-main.sha could not be read. The write of stage 1 stands; stage 2 did not run"; exit 1; }
[ "$(git cat-file -t ${REC})" = commit ] || { echo "STOP: the recorded sha ${REC} does not resolve to a commit"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. The write of stage 1 stands; stage 2 did not run"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. The write of stage 1 stands; stage 2 did not run"; exit 1; }
echo "checking from the recorded sha ${REC}"
echo "origin/main now: ${NOW}"
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. Stage 2 still runs from the recorded sha. Report both"; fi
git checkout -q --detach ${REC} || { echo "STOP: the checkout of the recorded sha failed. The write of stage 1 stands; stage 2 did not run"; exit 1; }
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the worktree is not on the recorded sha after the checkout"; exit 1; }
shasum -a 256 -c docs/migration-apply-0101.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }
test -f packages/db/migrations/0101_guest_request_email.sql || { echo "STOP: 0101 is not on disk"; exit 1; }
test -f scripts/db/postcheck-0101-guest-request-email.sql || { echo "STOP: the post-check is not on disk"; exit 1; }
test -f scripts/assert-production-target.mjs || { echo "STOP: the target guard is not on disk"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the guard's module is not on disk"; exit 1; }
[ "$(shasum -a 256 packages/db/migrations/0101_guest_request_email.sql | cut -d' ' -f1)" = "${SHA0101}" ] || { echo "STOP: 0101 on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/db/postcheck-0101-guest-request-email.sql | cut -d' ' -f1)" = "${SHAPOST}" ] || { echo "STOP: the post-check on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/assert-production-target.mjs | cut -d' ' -f1)" = "${SHAGUARD}" ] || { echo "STOP: the target guard on disk is not the approved file"; exit 1; }
[ "$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)" = "${SHAPTM}" ] || { echo "STOP: the guard's module on disk is not the approved file"; exit 1; }

echo "--- stage 1 must have APPLIED, in this sitting, not merely run"
[ -n "$(find /tmp/0101-applied.ok -mmin -60 2>/dev/null)" ] || { echo "STOP: stage 1 did not complete an apply in this sitting, or completed it over an hour ago"; exit 1; }

echo "--- THE RUN WINDOW: nothing runs at or after its end"
test -f /tmp/0101-window.ok || { echo "STOP: no run window is recorded for this sitting. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0101-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0101-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M') || { echo "STOP: the Lisbon clock could not be read. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The write stands; stage 2 runs only on the owner's or the lead's word"; exit 1; }

echo "--- SR-59: the carries come out of THIS SITTING's pre-check transcript"
test -f /tmp/0101-precheck.out || { echo "STOP: stage 1's pre-check transcript is missing"; exit 1; }
[ -n "$(find /tmp/0101-precheck.out -mmin -60)" ] || { echo "STOP: stage 1's transcript is over an hour old; it is not this sitting's"; exit 1; }
carry() { awk -F'|' -v k="$1" 'index($1,k)>0 {gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' /tmp/0101-precheck.out; }
J=$(carry journal_rows_before)
T=$(carry tables_before)
S=$(carry secdef_functions_before)
RF=$(carry relfilenode_before)
TC=$(carry table_columns_md5)
TK=$(carry table_constraints_md5)
TI=$(carry table_indexes_md5)
PM=$(carry policies_md5)
FM=$(carry functions_md5)
RM=$(carry relation_acl_md5)
CM=$(carry column_acl_md5)
DM=$(carry default_acl_md5)
DP=$(carry dml_profile_md5)
[ -n "${J}" ] && [ -n "${T}" ] && [ -n "${S}" ] && [ -n "${RF}" ] && [ -n "${TC}" ] && [ -n "${TK}" ] && [ -n "${TI}" ] && [ -n "${PM}" ] && [ -n "${FM}" ] && [ -n "${RM}" ] && [ -n "${CM}" ] && [ -n "${DM}" ] && [ -n "${DP}" ] || { echo "STOP: a carry did not parse out of the transcript"; exit 1; }
echo "${J} ${T} ${S} ${RF}" | grep -qxE '[0-9]+ [0-9]+ [0-9]+ [0-9]+' || { echo "STOP: a count carry is not a number"; exit 1; }
echo "${TC} ${TK} ${TI} ${PM} ${FM} ${RM} ${CM} ${DM} ${DP}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){8}' || { echo "STOP: an md5 carry is not 32 hex characters"; exit 1; }
echo "carries from this run: journal_before=${J} tables_before=${T} secdef_before=${S} relfilenode_before=${RF} table_columns=${TC} table_constraints=${TK} table_indexes=${TI} policies=${PM} functions=${FM} relation_acl=${RM} column_acl=${CM} default_acl=${DM} dml_profile=${DP}"

set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport || { echo "STOP: the production environment file could not be loaded. The write of stage 1 stands; the post-check did not run"; exit 1; }
node scripts/assert-production-target.mjs || { echo "STOP: the target guard refused or failed (its lines are above). The write of stage 1 stands; the post-check did not run"; exit 1; }

echo "--- the post-check, inside one READ ONLY transaction, so the server is what refuses a write"
rm -f /tmp/0101-postcheck.out || { echo "STOP: the old post-check transcript could not be removed. The write of stage 1 stands; the post-check did not run"; exit 1; }
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before="${J}" -v tables_before="${T}" -v secdef_before="${S}" -v relfilenode_before="${RF}" -v table_columns_md5="${TC}" -v table_constraints_md5="${TK}" -v table_indexes_md5="${TI}" -v policies_md5="${PM}" -v functions_md5="${FM}" -v relation_acl_md5="${RM}" -v column_acl_md5="${CM}" -v default_acl_md5="${DM}" -v dml_profile_md5="${DP}" -c "begin read only" -f scripts/db/postcheck-0101-guest-request-email.sql -c "rollback" 2>&1 | tee /tmp/0101-postcheck.out || { echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. The write of stage 1 stands; stage 2 did not pass"; exit 1; }
FAILS=$(grep -cE '\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0101-postcheck.out || true)
[ "${FAILS}" = 0 ] || { echo "STOP: the post-check printed [${FAILS}] FAIL verdicts, or its transcript could not be read. The write of stage 1 stands; stage 2 did not pass"; exit 1; }
OKS=$(grep -cE '\|[[:space:]]*OK[[:space:]]*$' /tmp/0101-postcheck.out || true)
[ "${OKS}" = 19 ] || { echo "STOP: the post-check printed ${OKS} OK verdicts, not 19. A verdict that is missing prints no FAIL"; exit 1; }

echo "--- SR-51: the journal grew by exactly one, and the row is 0101 by hash"
JA=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations") || { echo "STOP: the journal count could not be read (psql's lines are above). The write of stage 1 stands; stage 2 did not pass"; exit 1; }
JA=$(echo "${JA}" | tail -1)
[ "${JA}" = "$((J + 1))" ] || { echo "STOP: the journal reads ${JA} rows, not ${J} plus one"; exit 1; }
HN=$(psql "${DATABASE_URL_DIRECT}" -X -At -v ON_ERROR_STOP=1 -c "begin read only" -c "select count(*) from drizzle.__drizzle_migrations where hash = '${SHA0101}'") || { echo "STOP: the journal could not be read by hash (psql's lines are above). The write of stage 1 stands; stage 2 did not pass"; exit 1; }
HN=$(echo "${HN}" | tail -1)
[ "${HN}" = 1 ] || { echo "STOP: the sha256 of 0101 is in the journal ${HN} times, not once"; exit 1; }
echo "journal rows before=${J} after=${JA}, 0101 present by hash"

echo "--- the journal read: the last three rows, as applied"
psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;" || { echo "STOP: the last three journal rows could not be read (psql's lines are above). The write of stage 1 stands; stage 2 did not pass"; exit 1; }

echo "${REC}" > /tmp/0101-stage2.ok || { echo "STOP: the pass mark /tmp/0101-stage2.ok could not be written. The write of stage 1 stands; the closing read would refuse"; exit 1; }
echo "0101 POST-CHECK PASSED. 13/13 pre-check OK, 19/19 post-check OK, journal ${J} to ${JA}; guest_booking_requests has its email column, tables ${T} and SECURITY DEFINER functions ${S} unchanged. Paste the closing journal read now."
)
```

**EXPECT:** `--- THE HEAD CHECK ...`, `checking from the recorded sha <sha>` and whether main moved;
`docs/migration-apply-0101.md: OK`; the run window line with now before the end; the carry line
reads `journal_before=98`; the target guard; the post-check prints `19` OK verdicts and no FAIL
(verdict 1 the column's shape, `position 19 of 19`; verdict 2 the pinned definition; verdict 4 the
same file node as the carry; verdict 7 the two profiles side by side; verdict 16
`0 with an email, of <the row count> rows`); the journal reads `98` before and `99` after, with
0101's sha256 in it exactly once; the last line reads exactly
`0101 POST-CHECK PASSED. 13/13 pre-check OK, 19/19 post-check OK, journal 98 to 99; guest_booking_requests has its email column, tables <T> and SECURITY DEFINER functions <S> unchanged. Paste the closing journal read now.`
A missing carry makes the post-check itself STOP with psql exit 3 before any verdict.

**WHAT THE EXIT MEANS.** Exit 0 with that last line is the only pass, and the only path to the
closing read. Any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands.
`/tmp/0101-stage2.ok` is written last, so after any STOP the closing read refuses.

## THE CLOSING JOURNAL READ. READ ONLY

Paste this on its own, and **only** after stage 2 exited 0 with its last line
`0101 POST-CHECK PASSED. ...`.

```
(
set -eo pipefail
SHAREADER=825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387
SHAPTM=e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c
READER=packages/db/scripts/read-applied-migrations.mjs
cd /Users/ivan/Projects/GitHub/osteojp-prod-apply || { echo "STOP: the apply worktree is not there. The journal read has not run"; exit 1; }
echo "--- THE HEAD CHECK: the read runs from the recorded sha, and reports whether main moved"
test -f /tmp/0101-main.sha || { echo "STOP: stage 0 recorded no sha in this sitting. The journal read has not run"; exit 1; }
REC=$(cat /tmp/0101-main.sha) || { echo "STOP: stage 0's record /tmp/0101-main.sha could not be read. The journal read has not run"; exit 1; }
[ "$(git rev-parse HEAD)" = "${REC}" ] || { echo "STOP: the apply worktree is not on the sha stage 0 recorded. The journal read has not run"; exit 1; }
git fetch origin --prune || { echo "STOP: git fetch failed, so whether main moved is not known. The journal read has not run"; exit 1; }
NOW=$(git rev-parse origin/main) || { echo "STOP: origin/main could not be read. The journal read has not run"; exit 1; }
if [ "${NOW}" = "${REC}" ]; then echo "main has not moved since stage 0: ${REC}"; else echo "MAIN MOVED since stage 0: recorded ${REC}, origin/main now ${NOW}. The read still runs from the recorded sha. Report both"; fi
test -f /tmp/0101-applied.ok || { echo "STOP: stage 1 left no applied marker. The journal read has not run"; exit 1; }
test -f /tmp/0101-stage2.ok || { echo "STOP: stage 2 left no pass mark, so it did not pass. The journal read has not run"; exit 1; }
[ "$(cat /tmp/0101-stage2.ok)" = "${REC}" ] || { echo "STOP: stage 2's pass mark does not name the sha stage 0 recorded. The journal read has not run"; exit 1; }
[ -n "$(find /tmp/0101-stage2.ok -newer /tmp/0101-applied.ok)" ] || { echo "STOP: stage 2's pass mark is older than the apply. The journal read has not run"; exit 1; }
test -f /tmp/0101-window.ok || { echo "STOP: no run window is recorded for this sitting. The journal read has not run"; exit 1; }
[ "$(cut -d' ' -f1 /tmp/0101-window.ok)" = "${REC}" ] || { echo "STOP: the run window was recorded for another sha. The journal read has not run"; exit 1; }
WEND=$(cut -d' ' -f4 /tmp/0101-window.ok)
echo "${WEND}" | grep -qxE '[0-9]{12}' || { echo "STOP: the recorded run window did not parse. The journal read has not run"; exit 1; }
NOWL=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M') || { echo "STOP: the Lisbon clock could not be read. The journal read has not run"; exit 1; }
echo "${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. The journal read has not run"; exit 1; }
echo "run window, Lisbon YYYYMMDDHHMM: everything ends before ${WEND}; now ${NOWL}"
[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is at or past ${WEND}, the end of the run window. The journal read has not run"; exit 1; }
test -f scripts/production-target.mjs || { echo "STOP: the reader's target module is not on disk at the recorded sha. The journal read has not run"; exit 1; }
RW=$(shasum -a 256 ${READER} | cut -d' ' -f1)
MW=$(shasum -a 256 scripts/production-target.mjs | cut -d' ' -f1)
echo "reader: ${RW}, its target module: ${MW} (at the recorded sha ${REC})"
[ "${RW}" = "${SHAREADER}" ] || { echo "STOP: the migration reader at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
[ "${MW}" = "${SHAPTM}" ] || { echo "STOP: the reader's target module at the recorded sha is not the pinned file. The journal read has not run"; exit 1; }
node --env-file=/Users/ivan/osteojp-secrets/new-prod.env ${READER} 2>&1 | tee /tmp/0101-journal-after.out || { echo "STOP: the journal read failed or its target check refused (its lines are above), or its output could not be written. The journal read did not pass"; exit 1; }
grep -qx 'journal rows on production: 99' /tmp/0101-journal-after.out || { echo "STOP: the journal read after the apply does not say 99"; exit 1; }
grep -qE '^[[:space:]]*APPLIED[[:space:]]+0101_guest_request_email[.]sql$' /tmp/0101-journal-after.out || { echo "STOP: the journal read does not list 0101 as APPLIED"; exit 1; }
grep -qx 'pending on this ref: 0' /tmp/0101-journal-after.out || { echo "STOP: the journal read finds a migration pending on the recorded sha"; exit 1; }
grep -qx 'journal rows with no matching file on this ref: 0' /tmp/0101-journal-after.out || { echo "STOP: the journal holds a row with no matching file on the recorded sha"; exit 1; }
echo "CLOSING READ: the journal reads 99, 0101 is APPLIED, and nothing is pending on the recorded sha."
)
```

**EXPECT:** `--- THE HEAD CHECK ...` and whether main moved; the run window line with now before its
end; the reader's and its module's sha256 line; then the read printed IN FULL through `tee`:
`journal rows on production: 99`, every migration file on the recorded sha listed `APPLIED`, 0101
last, `pending on this ref: 0`, `journal rows with no matching file on this ref: 0`, and the last
line, exactly,
`CLOSING READ: the journal reads 99, 0101 is APPLIED, and nothing is pending on the recorded sha.`
After any halt at any stage it is not pasted. **WHAT THE EXIT MEANS:** exit 0 with that last line is
the only pass; any other ending is a `STOP:` line and exit 1, and the write of stage 1 stands.

## What every verdict must read

**Pre-check, 13 verdicts, all `OK`, each with its control:** 0 the transaction is READ ONLY; 1 0101
absent by hash (control: the same count finds 0100 once); 2 0100 present by hash once, the newest
row, at its journal `when`; `journal_rows_before` **98**; 4 the session is `postgres` and owns the
table (control: `authenticated` is no member of it); 5 nothing 0101 creates exists yet: no column
`email`, no constraint `guest_booking_requests_email_check` (control: `locale` and its CHECK are
found by the same probes); 6 `authenticated` holds exactly SELECT and UPDATE on the table, and
`anon`, `patient` and PUBLIC nothing (control: the owner holds INSERT); 7 no column of the table
carries a column-level grant (control: one exists elsewhere in `public`); 8 RLS on, not forced, one
SELECT and one UPDATE policy, each TO `authenticated` alone; 9 the five roles exist; 10 the server
is Postgres 17, where the post-check's constraint text was read; `secdef_functions_before`, every
one owned by `postgres`; 12 the table's columns are the eighteen of 0063 and 0081, in order. Then 11
CARRY rows (`tables_before`, `relfilenode_before`, `table_columns_md5`, `table_constraints_md5`,
`table_indexes_md5`, `policies_md5`, `functions_md5`, `relation_acl_md5`, `column_acl_md5`,
`default_acl_md5`, `dml_profile_md5`; with `journal_rows_before` and `secdef_functions_before`, the
thirteen carries stage 2 reads) and 3 INFO rows: the server version; the row count; how many other
sessions hold or await a lock on the table.

**Post-check, 19 verdicts, all `OK`:** 0 READ ONLY; 1 the column: one, `text`, nullable, no default,
no stored missing value, not generated, not an identity, the last column, no column grant (control:
`locale`); 2 the CHECK by name: a validated CHECK whose printed definition hashes to
`8fb8b1817bea63cae0a61617d76fed3f` (control: the locale CHECK); 3 the comment hashes to the
migration's text; 4 the table's file node is the carry: no row was rewritten; 5 nineteen columns,
all but `email` hashing to the carry; 6 every other constraint and every index unchanged; 7 the
column privileges on `email` equal those on `phone` for `authenticated`, `anon`, `patient` and
`service_role`, with `authenticated` SELECT and UPDATE and no INSERT, and `anon` and `patient`
nothing; 8 RLS on, not forced, the same two policies; 9 to 14 everything else unchanged, by md5
against the carries: policies, functions and the SECURITY DEFINER count, relation privileges, column
privileges, default privileges, the app roles' SELECT, INSERT, UPDATE and DELETE profile; 15 the
table count; 16 no row holds an email, with the row count as the profile; 17 the journal `+ 1`; 18
0101 by hash once, the newest row.

**The post-check is not a standing invariant for 9 to 16:** the next migration that grants, creates
a table or adds a policy moves them, and the application will write emails. It is an assertion about
this apply.

**No carry's name is a substring of another's or of any other row's `check` column,** because stage
2's `carry()` matches column 1 with `index()`; `scripts/guest-request-email-0101.test.mjs` asserts it.

### Which acceptance check this sitting discharges, and which it does not

| Acceptance check | Discharged by | Layer |
|---|---|---|
| production journal reads 99, 0101 by hash | stage 2, and the closing journal read | the database |
| the column and its CHECK are the reviewed ones; nothing was rewritten | post-check 1 to 6 | the catalogue |
| the column is read and written by exactly the roles that read and write `phone`; RLS and its two policies unchanged | post-check 7 and 8 | the catalogue |
| nothing else moved | post-check 9 to 15 | the catalogue, by md5 |
| no backfill | post-check 16 | a count |
| the CHECK refuses an over-long or malformed value and admits NULL; staff of another tenant read nothing; the form's writer stores it | **NOT DISCHARGED ON PRODUCTION** (a READ ONLY transaction can seed no row and fire no CHECK). The DB-gated suite, on a lane stack and in CI's `db-tests` from the promotion | the executor, on a throwaway |
| G4: no `auth`, `storage` or `realtime` table is locked | **NOT DISCHARGED ON PRODUCTION**: measured on two local stacks | a throwaway |
| the sitting is in closed hours | stage 0's and stage 1's clock arms, by machine | the apply machine |

## Rehearsal

**NOT YET REHEARSED.** What stands is the build lane's run below. It is not the rehearsal: it ran the
check files' SQL, the migration body and the suite on a local Supabase stack at production's
position, and it ran no block of this document against a database, because 0101 is not promoted and
every block STOPs at its first file check.

### The build lane's run, 2026-10-04

**Where.** The lane stack `blue` (project `OsteoJP-blue`, 127.0.0.1:54622), started by
`node scripts/lane-stack.mjs up --lane blue` from this branch's `supabase/migrations` (0000 to 0100)
and stopped by the build lane afterwards. `supabase/postgres` 17.6, ICU locale provider. Its
position matched production's after 0100: `authenticated` held `SELECT` and `UPDATE` on the table,
48 tables, 28 SECURITY DEFINER functions. A drizzle journal of 98 rows was built from
`_journal.json` with each file's sha256, the newest 0100's `80f85018...` at `when` 1788502100000.
200 synthetic guest requests were added (no real name or number). 0101 was applied with node and the
`postgres` package from the pending file (these bytes), in ONE transaction, one statement per
`--> statement-breakpoint` chunk as drizzle sends them, and its journal row was written by hand.
**psql did not run, and verified-migrate did not run.** The check files' SQL ran through a node
runner that substitutes the `-v` values and drops psql's own backslash lines.

| Run | Result |
|---|---|
| pre-check, unapplied | **13 OK / 0 FAIL**; journal 98; tables 48; secdef 28; rows 200; other lock holders 0 |
| the 0101 body, one transaction | 9.8 ms with its journal row; `lock_timeout` read `5s` and `statement_timeout` `1min` inside it |
| no row changed | one md5 over every row's `id`, `xmin` and `ctid`, identical before and after (200 rows): no row was written or moved; and the file node was 20543 before and after |
| post-check, with the pre-check's carries | **19 OK / 0 FAIL**; `position 19 of 19`; journal 99; `0 with an email, of 200 rows` |
| the DB-gated suite `guest-request-email.db.test.ts` | **9 of 9 passed** on the applied stack. On an unapplied stack only the "not applied" arm is registered, and it passed, 1 of 1: nothing is skipped on either side, because `.github/scripts/assert-rls-executed.mjs` reddens the required check for any DB-gated test that did not run |
| the whole `packages/db` suite on the applied stack | 99 files, 1425 of 1425 passed, none skipped |
| the SET LOCAL gate, `scripts/migration-timeouts.test.mjs`, on this branch | 13 of 13 pass, the pending file in scope with no problem |
| G4, the locks, statement by statement | as listed under "G4": ACCESS EXCLUSIVE on the one table; no `auth`, `storage` or `realtime` relation |
| L1: another session holds an open read on the table | the ALTER TABLE failed after 5.0 s, `55P03 canceling statement due to lock timeout`; the columns unchanged |
| the schema column before the database column | with `email` declared in `schema.ts`, drizzle's INSERT for the public form's row names `"email"` with `default`; on a stack without 0101 it fails `42703`. So the schema column travels with the application PR |
| the promotion, on a scratch copy | check-journal 99 of 99; `pnpm test:scripts` 4 failures, all in `scripts/maintain-revoke-0100.test.mjs` (see "THE ORDER OF PULL REQUESTS") |

**Every control broken on purpose, each in its own rolled-back transaction** (so verdict 0 reads
FAIL in every arm, the transaction being writable):

| Arm | Result |
|---|---|
| U0 the pre-check, nothing planted | FAIL on 0 only (the control of the arms below) |
| U1 a column named `email` already exists | FAIL on 0, 5, 12 |
| U2 a constraint with the new CHECK's name already exists | FAIL on 0, 5 |
| U3 `authenticated` granted INSERT on the table | FAIL on 0, 6 |
| U4 `anon` granted SELECT on the table | FAIL on 0, 6 |
| U5 PUBLIC granted SELECT on the table | FAIL on 0, 6 |
| U6 a column-level grant on the table (`phone` to `patient`) | FAIL on 0, 7 |
| U7 row level security FORCED | FAIL on 0, 8 |
| U8 row level security OFF | FAIL on 0, 8 |
| U9 a third policy on the table | FAIL on 0, 8 |
| U10 the locale CHECK dropped (verdict 5's control) | FAIL on 0, 5 |
| U11 a column dropped | FAIL on 0, 12 |
| U12 a journal row after 0100 | FAIL on 0, 2, `journal_rows_before` |
| U13 0101 already in the journal | FAIL on 0, 1, 2, `journal_rows_before` |
| U14 `authenticated` loses UPDATE on the table | FAIL on 0, 6 |
| U15 every column-level grant in `public` revoked (verdict 7's control) | FAIL on 0, 7 |
| U16 a SECURITY DEFINER function not owned by `postgres` | COULD NOT BE PLANTED (`42501 permission denied for schema public`): that half of `secdef_functions_before` was not broken on purpose |
| N1 the pre-check on the APPLIED database | FAIL on 1, 2, `journal_rows_before`, 5, 12 (a second apply is refused before it starts) |
| N12 the pre-check without `prev_hash` | STOP, before any verdict |
| P0 the post-check, nothing planted | FAIL on 0 only |
| P1 the column given a default | FAIL on 0, 1 |
| P2 the CHECK replaced by a looser one of the same name | FAIL on 0, 2 |
| P3 the CHECK left NOT VALID | FAIL on 0, 2 |
| P4 the comment changed | FAIL on 0, 3 |
| P5 the table given a new file node (TRUNCATE, as a rewrite would) | FAIL on 0, 4 |
| P6 the column granted to `patient` at column level | FAIL on 0, 1, 7, 12 |
| P7 `authenticated` granted INSERT on the table | FAIL on 0, 7, 11, 14 |
| P8 a third policy on the table | FAIL on 0, 8, 9 |
| P9 row level security OFF | FAIL on 0, 8 |
| P10 one row given an email | FAIL on 0, 16 |
| P11 0101's journal row missing | FAIL on 0, 17, 18 |
| P12 a column added after `email` | FAIL on 0, 1, 5 |
| P13 an index added on `email` | FAIL on 0, 6, 11 |
| P14 an unrelated function's settings changed | FAIL on 0, 10 |
| P15 a default privilege added | FAIL on 0, 13 |
| P16 a table created | FAIL on 0, 11, 14, 15 |
| P17 the locale CHECK dropped | FAIL on 0, 2, 6 |
| P18 the column made `varchar(320)` | FAIL on 0, 1, 2, 4 |
| P19 an unrelated policy added | FAIL on 0, 9 |
| P20 an unrelated column granted to `patient` | FAIL on 0, 12 |
| P21 `authenticated` loses UPDATE on the table | FAIL on 0, 7, 11, 14 |
| P22 a journal row added after 0101 | FAIL on 0, 17, 18 |
| P23 the column made NOT NULL on an emptied table | FAIL on 0, 1, 4 |

**The mutation sweep** (one, mechanical; the sidecar's byte pin left out, because a byte pin kills
every mutant and proves nothing): see "Review history".

The scratch files of this run (the journal fixture, the node runner, the arm runner and the sweep)
are in the build lane's scratchpad and not committed.

### NOT REHEARSED, said one by one

- **Every block of this document against a database.** 0101 is not promoted, so each block STOPs
  at its first file check. The blocks ran whole only in the fault-injection harness, on stubs.
- **psql.** No psql ran on the build lane. The check files' SQL ran through a node runner, so
  psql's own behaviour is not rehearsed: `-v` substitution, `\if :{?name}`, `ON_ERROR_STOP`, the
  aligned output the blocks' `grep` and `carry()` read. In particular the post-check's
  missing-carry STOP was not exercised: the runner sends the file as one query, and the server
  refuses the unsubstituted `:name` at parse, before the `DO` block can raise. The constructs are
  0100's, which was rehearsed under psql.
- **`verified-migrate.mjs` and drizzle-kit.** The body was applied by node in one transaction.
- **The target guard and the journal reader.** Both refuse any target but production, so on a
  throwaway every block that runs one halts at that line unless the lead rules a substitution.
- **Production's platform configuration.** G4 was measured on two local stacks; production's
  `supautils` settings and locks were not read.
- **CI's `db-tests` on the promoted head,** which applies 0101 from the mirror (each file outside
  a transaction block, so the two SET LOCAL lines print their 25P01 WARNING, as 0100's do).
- **GREEN's two dispatch blocks** (BEFORE YOU START and the CLOCK CHECK): drafted, not run.

### The fault-injection harness (not a rehearsal)

**Why.** In a Claude session `set -e` stops no pasted block (see the paragraph after THE HALT RULE).
Every block halts by explicit guards, and `scripts/guest-request-email-0101.test.mjs` proves it on
every CI run.

**How.** As 0100's harness: each block, extracted verbatim, runs as
`true && eval '<block>' < /dev/null && echo TOOL-CHAIN-CONTINUED`. Every external command it calls
(git, psql, node, pnpm, shasum, tee, mv, rm, touch, cat, find, date, grep, cut, awk, head, tail, wc,
tr) is a stub on PATH: git, psql and the node programs never run for real (`node -e` does, on local
files), and the block's `cd`, its `/tmp/0101-` paths and its env file are moved into a scratch folder
first, so nothing touches a real host, the secrets folder or a database. The fake apply tree is
built from what the branch holds: the migration at its promoted path (the same bytes), 0100's real
file, and a journal of the live entries up to 0100 with 0101's entry after them. The positive
control runs each block with every stub succeeding and requires its last line. Then each call is
made to fail in turn, and the block must (a) exit non-zero with the tool chain stopped, (b) print
none of its pass lines, (c) write none of its records after the failing point, and print a `STOP:`
line. Extra faults: the apply worktree missing, the env file missing, a record path that is a
directory, verified-migrate exiting 2, 4 and 5 as well as 3, and every clock read and every field
of the window record exiting 0 with EMPTY output.

**THE WEEKDAY TABLE** runs stage 0 and stage 1 whole at the six minutes the ruling names (Friday
20:59 open, Friday 21:00 closed, Saturday 12:59 open, Saturday 13:00 closed, Sunday 15:00 closed,
Monday 07:59 closed) and at one green arm (Tuesday 22:30): at each open minute the block STOPs
with nothing recorded and nothing applied, and at each closed minute it reaches its last line. It
also runs the arm's own `awk` program at every boundary of every weekday against a table written
in the test. **THE CLINICS' ROWS** runs stage 1 with one clinic's row reaching outside 08:00 to
21:00, and with no active clinic: each STOPs after the pre-check and before verified-migrate.
**THE WINDOW FEED** runs stage 1 whole on eleven run-window records and clocks (nine refusals and edges, and the two edges that pass), and goes red with the
two window-end lines removed. A held applied marker younger than 12 hours stops stages 0 and 1
before any git call.

| Block | Faults | Halt | Allowed to continue, and why |
|---|---|---|---|
| stage 0, closed hours | 46 | 43 | 3 R9 proof 1 calls, which read `no` and decide nothing |
| stage 1, closed hours | 68 | 65 | 3 R9 proof 1 calls, as in stage 0 |
| stage 2 | 55 | 55 | none |
| the closing journal read | 26 | 26 | none |

195 faults, run on 2026-10-04 under zsh in GREEN's exact shape and under bash with errexit forced
off; every one held. **CI runs the bash arm only:** zsh is not on the ubuntu runner, and the
repository's convention for that (`scripts/apply-lane/apply-lane-settings.test.mjs`) is followed, so
on the GitHub runner alone the zsh arm is a reported skip, and anywhere else a missing zsh fails the
test.

### What the rehearsal agent owes before the dispatch is issued

Run under the lead's standing rule, verbatim in its prompt: "A script's own REFUSE or STOP line is a
halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to
get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the
document says so."

1. **A throwaway at production's position:** a local Supabase stack, the promoted head's
   `supabase/migrations` minus 0101, so `0000` to `0100`, and a drizzle journal of 98 rows built from
   `_journal.json`, the newest 0100 (`80f85018...`, `when` 1788502100000). Read the premise before
   any block and record it (pre-check verdicts 6, 7 and 12).
2. **At least one active `public.locations` row** whose hours lie inside 08:00 to 21:00, or stage
   1's clinic read STOPs, correctly; and guest requests in the table, so the CHECK's validation
   scans something.
3. **This document's four blocks and GREEN's two, extracted verbatim from the promoted head,** under
   psql, with `verified-migrate.mjs` reaching drizzle through pnpm, every halt run for real, and each
   allowed substitution named in the prompt, never "the way earlier rehearsals did". The target
   guard refuses any host but the production pooler, so every block that runs it halts on the
   throwaway at that line unless the lead rules a substitution; the journal reader's reads are NOT
   REHEARSED for the same reason. **The clock arm runs on the real clock:** inside clinic hours
   stages 0 and 1 STOP, which is the arm proven in the safe direction; in closed hours they pass. The
   agent never sets `TZ` or the clock to choose.
4. **CI's `db-tests` on the promoted head,** which applies 0101 on a real Supabase stack and runs
   the DB-gated suite.

## JUDGMENTS, NOT RULINGS, in the migration and this document

Each is SOLO's where the rulings leave a choice; R4 and the lead may change any of them.

1. **The CHECK forbids the six ASCII whitespace characters, not `[[:space:]]`** (section 1): the
   looser test is the only one that is provably no stricter than the application under an ICU
   locale.
2. **The length bound is the application's 320,** not the 254 of the mail standards: the bound has
   to admit what the application admits.
3. **No GRANT** (section 2). The alternative, an explicit column-level grant, would make this the
   table's first column-level ACL and would change what `column_acl_md5` reads for no gain.
4. **Stage 1 reads the clinics' rows to check the weekday table, never to decide the hour**
   (section 4). The 0100 arm required "no active clinic open now by its own row"; with a weekday
   table that rule would refuse every Saturday afternoon and every Sunday, because a row has no
   weekday. The lead may rule another use of the rows.
5. **R9 proofs 2 and 3 are fixed `no` lines,** as in SAT-01's draft: a computed "no" could be
   flipped by an edit that removes the searched text, and a fixed line cannot.
6. **The schema column is not on this branch** (section 3), though the dispatch for this build
   listed it here. Moving it is what keeps "merged before the apply" safe.
7. **One GATE-CHANGE before the promotion** (the order table), rather than promoting with a red
   0100 test.
8. **The run window keeps strategy's start windows as 0100's dispatch transcribed them.** The
   weekday table makes Saturday from 13:00 closed, and stages 0 and 1 pass then; whether a sitting
   may START on a Saturday afternoon is the dispatch's question, and its draft says so.

## What this does NOT do, and what is out of scope

- **It shows no field and sends nothing.** The form's field, the route, the convert, the queue and
  the confirmation itself are application pull requests, after 0101 is on production.
- **It changes no existing row,** no policy, no function, no privilege and no default privilege.
- **It gives no role anything it did not hold on the table's other columns.**
- **It does not record R41 in `CLAUDE.md`,** whose table still names SAT-01 at `0101`. That is a
  docs PR of its own.

## The op carries no DELETE and no TRUNCATE statement

Measured on the migration's code with its comments removed: **0 statements begin with DELETE, 0
begin with TRUNCATE,** and the words DELETE, TRUNCATE, DROP, INSERT, UPDATE, GRANT, REVOKE, POLICY,
COPY and MERGE do not appear in its code at all (`scripts/guest-request-email-0101.test.mjs`
requires it). The check files write nothing: the pre-check opens its own READ ONLY transaction and
ends in ROLLBACK, and the post-check runs inside the block's `begin read only`.

## Review history

**R4 has not run** (NOT READY step 3).

**The mutation sweep, 2026-10-04, one pass, mechanical.** Every mutant was run against the tests that should catch it, and the sidecar's byte pin was
regenerated for every document mutant, so it killed none of them.

| Part | Mutants | Killed | Survived |
|---|---|---|---|
| A. the CHECK's predicates, each planted on the lane stack, against the DB-gated suite | 38 | 37 | 1, equivalent |
| B1. an explicit halt stripped from a block line, one at a time, against the static rules | 158 | 158 | 0 |
| B1b. a STOP arm of an `if` loses its `exit 1` | 3 | 3 | 0 |
| B2. the clock program, changed in the document AND in the test's own pin together, against the program's table test | 23 | 22 | 1, equivalent |
| B2b. the clock program changed in stage 1 only, against the static arm rule | 6 | 6 | 0 |
| B3. a comparator or a count in a block (the run window, the verdict counts, the marker ages, the journal) | 22 | 22 | 0 |
| B4. a rule of the script test loosened, against its own controls | 30, then 6 | 29, then 6 | 0 after the fix below |
| C. every verdict predicate of the pre-check (27 conjuncts) and the post-check (32), negated one at a time on the healthy database | 59 | 57 turned their verdict to FAIL | 2: verdict 0 of each file, see below |

- **A, the one survivor is equivalent:** the `email IS NULL OR` arm dropped. A CHECK passes when its
  expression is NULL, so the constraint admits NULL with or without the arm. The arm stays because it
  says so in words, as the `locale` CHECK on the same table does.
- **B2, the one survivor is equivalent:** the weekday row widened from Monday to Friday to Monday to
  Saturday. The Saturday row after it still decides Saturday, and the two together read the same
  hours as before.
- **B4 found a real gap, and it was fixed in this sweep:** removing the static rule that a `test`,
  a `[ ... ]`, a `shasum -c` or a `grep -q` line must carry its own halt was caught by no control.
  Eight planted lines were added to the test, and the rule's six parts were then removed one at a
  time: 6 of 6 killed. Those guards matter because the harness cannot make a shell builtin fail, so
  the static rule is the only thing that sees a halt missing from one.
- **Two findings from the sweep changed the tests before it was counted:** the DB-gated suite's
  refusal list was rebuilt as every forbidden character in every part of an address (21 cells),
  because hand-picked examples left most cells of the CHECK's three character classes unread; and
  THE WINDOW FEED gained the two edges that pass (now at the opening minute, now at the last start
  minute).
- **C, verdict 0:** the sweep ran each file in a writable transaction that it rolled back, where
  verdict 0 (READ ONLY) reads FAIL, so negating it turned it to OK. It moved; it is counted apart
  because it moved the other way. In the READ ONLY runs it read OK.
- **Not swept:** the two blocks of GREEN's dispatch (a draft, outside the repository), and the
  application pull request, which has its own tests.
