# 0106 (PROVISIONAL NUMBER): apply the reminder sweep's two tables

**A DRAFT FOR STRATEGY. THE NUMBER `0106` IS PROVISIONAL.** After `0105` a number is given when a
migration is authored (`CLAUDE.md`, the paragraph of 2026-10-12), and this one is not fixed until
strategy confirms it. If another item takes `0106` first, this document, the two check files and
the README row are renamed, and nothing else changes.

**NOT READY, AND NOT A SITTING DOCUMENT YET.** It has no blocks for GREEN: no stage 0, no stage 1,
no stage 2, no closing journal read, no halt rule, no fault-injection test, and no sha256 sidecar.
Those are written when the number is fixed and the design below is ruled, because every one of
them pins a number, a predecessor's hash or a journal position that does not exist today. What
this draft does carry: what the migration does, the design and its reasons, the locks as
measured, the order of pull requests a sitting would need, what each verdict of the two check
files must read, the proof per role, the rehearsal's record, the rollback that was run, what was
NOT rehearsed, and the questions.

**Status: AUTHORED AS A DRAFT. REHEARSED ON A THROWAWAY ON 2026-10-13, WITH LIMITS. NOT PROMOTED.
NOT REVIEWED. NOT APPLIED ANYWHERE BUT THAT THROWAWAY, AND TAKEN OFF IT AGAIN.** One migration,
`packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql`, sha256
`a78b2c9dc92d9184b2977cb588f657751d94387e216185ecc206d202bfa50cf2`, 23 statements. It lives in
`migrations-pending`, where nothing can apply it.

**Authored by SOLO. If it is ever run, it is run by GREEN,** a fresh session launched with the
apply settings, on the owner's dispatch naming the migration by filename (`CLAUDE.md`, "Who
applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **Strategy rules on the design** (the questions at the end), and confirms the number.
2. **`0103`, `0104` and `0105` are applied to production and merged.** Apply order equals file
   order (2026-09-30), and one migration is in flight at a time. This file follows `0105`.
3. **A fresh reviewer passes the migration** (R4, Tier C). None has read it.
4. **The GATE-CHANGE the promotion forces merges first,** as its own pull request, merged by the
   owner on green (see "The order of pull requests").
5. **The promotion:** the file is renamed to `packages/db/migrations/0106_reminder_claims.sql`
   with no byte changed, its journal entry is added, it is mirrored into `supabase/migrations`,
   and the ordinary edits the promotion forces are made in the same commit.
6. **This document gets its blocks, its sidecar and its fault-injection test,** the two check
   files get their journal verdicts, and a rehearsal agent runs all of it on a throwaway under
   the lead's rule of 2026-09-30.
7. **The sweep's three pull requests are moved onto the tables** (a later agent's work, on
   branches that are local today). They can merge only after the tables exist in production.

## 1. What it does

It creates two tables and nothing else. No function, no sequence, no trigger, no row, and no
change to any existing table, policy, function or grant.

- **`public.reminder_claims`**: the reminder sweep's claim store. Three kinds of row, each about
  one reminder of one appointment (appointment, offset, channel):
  - `claim`: a sender took this reminder for this start time. Its `id` is the claim id.
  - `release`: the sender of a claim gave it up. It names the claim in `claim_id`.
  - `shadow`: the sweep, while switched off, would have handed this reminder over in this pass.
- **`public.reminder_sweep_passes`**: the heartbeat. One row per tenant per pass of the sweep,
  with the counts of that pass.

The 23 statements, in order: three `SET LOCAL` lines (lock wait 5 s, statement 60 s, idle in
transaction 15 s); `CREATE TABLE reminder_claims`; three indexes; its comment; `CREATE TABLE
reminder_sweep_passes`; one index; its comment; `ENABLE ROW LEVEL SECURITY` on both; a `REVOKE
ALL` on each from `PUBLIC`, `anon`, `authenticated` and `patient`; a `GRANT SELECT, INSERT` on
each to `authenticated`; two `ALTER TABLE` statements that add the three foreign keys to
`appointments` and `tenants`; and four `CREATE POLICY` statements, last.

## 2. The rulings, and what each became in the file

| Ruling (brief of 2026-10-13, after strategy's S-1 of 2026-10-12) | In the file |
|---|---|
| No `audit_log` for claims; a dedicated table, Tier C | Two tables. The file moves nothing out of `audit_log`: no claim, release, shadow row or heartbeat was ever written in production, because the pull requests that would write them never merged |
| Writers: only the reminder job's own database principal, in the tenant context it already uses | The two INSERT policies admit a session of role `authenticated` with the tenant, the role `owner` or `admin`, and NO user (`auth.uid()` is null). That is what `withReminderTenantContext` makes (`apps/web/lib/reminders/context.ts:25-33`). See section 3 for why this is a judgment |
| A staff session may read rows of its own tenant | The two SELECT policies: the tenant, and the role `owner`, `admin` or `reception` |
| A staff session may never insert, update or delete | A session that names its user fails the INSERT policy. Nobody holds UPDATE or DELETE |
| `anon` gets nothing; nothing new to `PUBLIC` | `REVOKE ALL` by name; no grant to either |
| Append only: a release is a new row | `kind = 'release'` with `claim_id`. No UPDATE or DELETE grant, no UPDATE or DELETE policy |
| `tenant_id` NOT NULL, RLS in the sibling's way | Both tables. RLS is enabled and not forced, as on `reminder_dispatches` and every other table (see question 6) |
| New sequences must not be born open to `anon` | The file creates no sequence: both keys are `gen_random_uuid()` |
| Owner answer 7b: a held reminder is tried again while the visit is ahead; only `sent` blocks | The table stores no outcome and has no unique key over the claims of one reminder. A second claim for the same reminder and start is accepted (tested) |
| Owner answer 8a: a late reminder may still go; the table carries only what that needs | `due_at` (when the reminder was due) and `created_at` (when it was taken). No late rule |
| The sweep ships switched off | Nothing here sends. `mode` on a heartbeat is `shadow` today |

## 3. The design, in brief

**The shape.**

`reminder_claims` (15 columns):

| Column | Carried by | Meaning |
|---|---|---|
| `id` | all | the row; for a claim, the claim id |
| `tenant_id` | all | NOT NULL |
| `appointment_id` | all | NOT NULL; the rows go with the appointment's hard delete |
| `kind` | all | `claim`, `release` or `shadow` |
| `offset_id` | all | `48h`, `24h`; text, not a closed list |
| `channel` | all | `sms` or `email` |
| `starts_at` | claim, shadow | the start the reminder was for |
| `due_at` | claim, shadow | the start minus the offset. Always on a shadow row; NULL on a claim for an offset the application did not know |
| `taker` | claim | `run` (the sleeping job) or `sweep` |
| `early` | claim | taken more than the early margin before `due_at`; NULL exactly when `due_at` is |
| `claim_id` | release | the claim it gives up; one release per claim |
| `minutes_after_mark` | shadow | minutes between `due_at` and the pass; may be negative |
| `saved_after_mark` | shadow | the visit was saved after `due_at` |
| `pass_id` | any | the scheduler's id for the pass, when there is one |
| `created_at` | all | when the row was written |

`reminder_sweep_passes` (11 columns): `id`, `tenant_id`, `pass_id`, `mode` (`shadow` or `send`),
`pass_at` (the pass's own clock), `look_ahead_before` (the last pass of the day only),
`due_count`, `recorded_count`, `over_ceiling`, `excluded_count` (visits left out because they
never had a reminder), `created_at`.

That covers everything the three local branches store in `audit_log` today
(`reminder-claim.ts`, `sweep.ts` on `reminders/SWEEP-03-shadow-sweep`, head `40ff6ddc`): the
claim's appointment, start, offset, channel, taker, early flag and id; the release's claim id;
the shadow row's minutes late and saved-after-mark; the heartbeat's counts, over-ceiling flag and
excluded count, its pass id, its clock and its look-ahead instant.

**JUDGMENTS, NOT RULINGS.** Each is a question at the end where it could go another way.

1. **Two tables, not one.** A claim, a release and a shadow row are each about one reminder of
   one appointment and go when the appointment goes. A heartbeat is about one pass of one tenant:
   it names no appointment and must outlive every appointment the pass looked at, because "the
   newest heartbeat is too old" is the alarm. In one table the appointment would be nullable and
   its cascade right for three kinds of row and wrong for the fourth.
2. **The shadow row is a kind of `reminder_claims`, not a third table.** It has the claim's key
   (appointment, offset, channel, start), and the sweep's "have I taken this reminder" read asks
   for its own shadow rows and its own claims together.
3. **Who "the reminder job's own database principal" is.** The job has no database role of its
   own. It runs as `authenticated` with claims it sets itself: a tenant, the role `admin`, and
   no user. A staff session always names its user. So the INSERT policies test for "no user".
   `0102` uses the same test for the automatic survey send, with the reasoning that only the
   application's own connection can make such a session: a token Supabase Auth signs always
   names its user, the anon key's role is `anon`, and the service key's is `service_role`.
   A database role of its own is the other reading (question 1).
4. **The INSERT policies also ask for the role `owner` or `admin`,** the ledger's own narrowing
   (`0075`). The job is `admin`. A session with no user and the role `reception` or `therapist`
   is refused (tested); nothing makes one.
5. **Readers are `owner`, `admin` and `reception`, not `therapist`:** the ledger's readers, and
   the roles that hold `reminders:log_read` in the application.
6. **Append only is by grants and by policies, not by a trigger.** A trigger that refuses every
   DELETE would refuse the appointment's cascade too.
7. **`service_role` is left as the platform default makes it** (every table privilege), as
   `0075` and `0102` left it. It bypasses RLS and the application never drops to it. Who may
   purge old rows is question 3, and this is where a purge would run.
8. **`due_at` and `early` are stored, not derived at read time,** so a row says what was true
   under the rule of the day it was written (the ledger's reason for storing `segments`).
9. **One release per claim, by a unique index.** A second release of the same claim is refused.
   The release code catches and logs a failed write today, so a duplicate costs a log line.
10. **No unique key over claims, and none over shadow rows or heartbeats.** For claims this is
    answer 7b. For shadow rows and heartbeats, a uniqueness the sweep's own lock already gives
    would turn a re-run pass into a rolled-back pass (question 5).
11. **A release names a row of the same tenant and the same appointment** (a three-column
    foreign key to the table's own `(tenant_id, appointment_id, id)`). It does not prove the
    row named is of kind `claim`; the reader asks for that.
12. **`send` is in the heartbeat's `mode` list although nothing writes it,** so that turning
    the sweep on does not need a migration sitting for one word.
13. **`offset_id` is free text,** because the offsets live in the application.

**What is NOT enforced by the table, said plainly.**

- That a claim's `tenant_id` is the tenant of the appointment it names. The INSERT policy holds
  the row's tenant to the session's, and the foreign key holds the appointment to an existing
  one, but nothing ties the two. The ledger (`0075`) has the same gap. The job takes both ids
  from the same appointment row it has just read as that tenant.
- That at most one claim of a reminder is live. The dispatcher's advisory lock does that.

## 4. Closed hours only

This file creates four policies. Strategy's standing rule (S-1004-A): "any migration that
creates a policy is closed-hours only, never eligible for R9." The weekday table of 2026-10-03
applies: open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon time.

## The locks, measured on the throwaway (2026-10-13, PostgreSQL 17.6)

Read from `pg_locks` for the applying session, at the end of the file, inside a transaction that
was then rolled back.

| Part of the file | Locks on relations that existed before |
|---|---|
| Statements 1 to 17 (the `SET LOCAL` lines, both tables, the indexes, the comments, RLS, the revokes and grants) | **none, in any mode** |
| Statements 18 and 19 (the foreign keys) | SHARE ROW EXCLUSIVE on `public.appointments` and `public.tenants`: writes to them wait, reads do not |
| Statements 20 to 23 (the policies) | ACCESS EXCLUSIVE on 23 platform tables: 16 in `auth` (`users`, `sessions`, `refresh_tokens`, `identities` and the rest), 5 in `storage`, 2 in `realtime` |

All are held until the COMMIT. `lock_timeout` read `5s`, `statement_timeout` `1min` and
`idle_in_transaction_session_timeout` `15s` inside the transaction. Both new tables are empty,
so each foreign key is validated at once. **Production's `supautils.policy_grants` setting has
not been read,** so the list of platform tables there is not established; `0102` took the same
kind of lock in its sitting.

**The rollback takes a stronger lock than the apply:** ACCESS EXCLUSIVE on `public.appointments`
and `public.tenants` (dropping a foreign key removes its triggers from the table it points at),
so reads of both wait while it runs. Measured on the same throwaway.

## The order of pull requests

Measured on 2026-10-13 by promoting in place (the file moved to
`packages/db/migrations/0106_reminder_claims.sql`, a journal entry added, the mirror synced),
running `pnpm test:scripts`, and undoing all of it: `check-journal` reconciled 101 files with 101
entries, and **1 of 1521 script tests failed.**

| # | Pull request | Kind | When |
|---|---|---|---|
| 1 | The cleanup test learns `reminder_claims`: `scripts/import/cleanup-test-patients.test.mjs` | GATE-CHANGE, the owner merges | before the promotion |
| 2 | The held pull request: the promotion, with `scripts/import/cleanup-test-patients.sql` gaining its delete, this document with its blocks, the check files, the suite | Tier C, `held-for-apply` | after 1 |
| 3 | The skip guard lists the suite: `.github/scripts/assert-rls-executed.mjs` | GATE-CHANGE, the owner merges | after 2 has merged |
| 4 | The sweep's pull requests, moved onto the tables | Tier B | after the apply |

- **Why 1.** The failing test is "every table with an FK path to patients is covered":
  `reminder_claims has an FK path to patients but the script never deletes from it`. The table
  points at `appointments`, and `appointments` points at `patients`. The GATE-CHANGE adds
  `reminder_claims` to `DELETE_ORDER` (before `appointments`) and to `AHEAD_OF_MIGRATION`, and
  raises the floor from 24 to 25. `reminder_sweep_passes` points at `tenants` only and is not
  on that path.
- **An observation, not part of this change.** The ledger, `reminder_dispatches`, also points
  at `appointments`, and the cleanup has never listed it: its `REFERENCES` clause sits on its
  own line in `0075`, a form the test's reader does not match. Its delete cascades, so the
  cleanup has not failed for it. Whether the cleanup should count those rows is the lead's.
- **No count GATE-CHANGE.** The migration creates no function. The SECURITY DEFINER count read
  36 before and 36 after, and `check-security-definer-owner.mjs` passed on the applied
  throwaway.
- **Which commit a sitting would run from: merged first, or the held head.** Nothing on `main`
  reads the tables before the apply, and no required check counts anything this file changes,
  so it is of the kind `0100` and `0101` were (merge, then GREEN applies from `main`). The
  suite `packages/db/tests/reminder-claims-rls.db.test.ts` runs for real on CI from the
  promotion on, because CI builds its database from the numbered migrations. That is the
  lane's reading; the choice is the lead's.
- **A fault-injection test for this document's blocks** will be a new `scripts/*.test.mjs`
  file. Adding one trips no gate; it is frozen at the next GATE-CHANGE after it lands.

## What every verdict must read

**The pre-check, `scripts/db/precheck-0106-reminder-claims.sql`: 8 verdicts OK, 9 CARRY rows, 3
INFO rows.** READ ONLY. It proves the session is `postgres`; that none of the nine relation
names the migration creates is taken; that `appointments` and `tenants` exist with a primary key
on `id`; that the three helpers the policies call exist AND that `authenticated` may execute
each; that the four roles exist; that the server is Postgres 17; and that every SECURITY DEFINER
function is owned by `postgres`. It carries nine values for the post-check.

**The post-check, `scripts/db/postcheck-0106-reminder-claims.sql`: 21 verdicts OK, 1 INFO row.**
READ ONLY. It proves both tables exist and are owned by `postgres`; the columns, the
constraints, the foreign keys with their delete actions, and the indexes, each against a pinned
value; RLS on and not forced; exactly one SELECT and one INSERT policy per table, to
`authenticated` alone, with pinned expressions; `authenticated` holding exactly SELECT and
INSERT of the eight table privileges; `anon`, `patient` and `PUBLIC` holding nothing; no column
grant and no trigger; both tables empty; and that nothing else moved: the table count is the
pre-check's plus two, and the sequences, the functions, the SECURITY DEFINER count, every other
policy, every other privilege, the default privileges and the triggers are the pre-check's.

**Not in either file yet:** the journal verdicts (the migration absent by hash before, the
newest row after, the journal moved by one). They pin a number and a predecessor that are not
fixed.

## The proof per role

`packages/db/tests/reminder-claims-rls.db.test.ts`, 41 tests, DB-gated. Every arm about access
runs as the real principal, in a transaction that is rolled back, and is shown both ways.

| Who | Allowed, shown to succeed | Refused, shown to fail |
|---|---|---|
| The reminder job (`authenticated`, a tenant, `admin`, no user) | inserts a claim with RETURNING and reads it back; inserts a release, a shadow row and a heartbeat; reads its tenant's rows | a row naming another tenant (`row-level security`); any insert with no tenant in the session; any insert with the role `reception` or `therapist`; every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: owner, admin, reception (with a user) | read the tenant's claims and heartbeats | every insert, on both tables (`row-level security`); every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: therapist | nothing | reads zero rows; inserts, updates, deletes refused as above |
| Another tenant's admin | reads its own rows | sees none of this tenant's |
| A patient session | nothing | read and insert (`permission denied`) |
| `anon` | nothing | read and insert (`permission denied`) |

Also proven: with UPDATE and DELETE granted to `authenticated` for the length of one rolled-back
transaction, the job and the tenant's owner still reach zero rows, while the same sessions see
three (the policies refuse apart from the grants); an owner's hard delete of an appointment
takes that appointment's claim, release and shadow rows with it and leaves the heartbeats; a
tenant with a heartbeat cannot be deleted from under it; and each CHECK, each foreign key and
the one-release-per-claim index, by the constraint's own name.

**One mutation sweep, 2026-10-13, on the applied throwaway.** Nine rules were weakened one at a
time and the suite run after each; the tables were dropped and re-applied between runs.

| Weakened | Tests that went red |
|---|---|
| the claims INSERT policy without "no user" | 2 |
| UPDATE and DELETE granted on `reminder_claims` | 7 |
| the claims SELECT policy without the role list | 1 |
| the heartbeat SELECT policy without the tenant | 3 |
| SELECT on the heartbeats granted to `anon` | 2 |
| the appointment foreign key without CASCADE | 2 |
| the heartbeat INSERT policy without the tenant | 2 |
| the one-release-per-claim index dropped | 1 |
| TRUNCATE granted on the heartbeats | 6 |

No mutant survived.

**The suite on a database without the tables: 41 skipped, exit 0.** Until the promotion that is
its answer on CI. From the promotion commit on it throws instead of skipping, and it throws on
a database that holds one table of the two.

## Rehearsal

**The rehearsal, 2026-10-13, by the build lane.** Not a sitting rehearsal: there are no blocks
to rehearse. What ran is the migration itself, the two check files, the suite and the rollback.

**The throwaway.** A local Supabase stack of its own, project id `r0106`, in a scratch folder
outside the repository, never lane blue, purple or amber. Supabase CLI 2.100.0, PostgreSQL 17.6.
Ports, each checked free first: database 56102, API 56101, shadow 56100. Started without
realtime, imgproxy, edge-runtime, logflare, vector, studio, postgres-meta, supavisor and
mailpit; with the database, auth, storage, the REST layer and the gateway. Built by `supabase
start` from this branch's `supabase/migrations`, which is `main`'s: 100 migrations, `0000` to
`0102`, then `supabase/seed.sql`. Torn down after the last run: no `r0106` container or volume
left.

**The premise, read before anything** (as `postgres`): 51 tables and no sequence in `public`;
`postgres` and `service_role` bypass RLS, `authenticated`, `anon` and `patient` do not;
`postgres`'s default for a new table in `public` hands `authenticated` DELETE, INSERT, SELECT
and UPDATE, `service_role` all eight, and `anon` nothing; the ledger has RLS on and not forced.

**The final run, 14:05:04 to 14:05:33 Lisbon (WEST), on the bytes this document pins.**

| Step | Command (connection flags left out) | Result |
|---|---|---|
| The pre-check | `psql -c "begin read only" -f scripts/db/precheck-0106-reminder-claims.sql -c "rollback"` | exit 0; 8 OK, 0 FAIL, 9 CARRY, 3 INFO |
| Locks, statements 1 to 17 | the file's first 17 statements in a rolled-back transaction, then `pg_locks` | 0 locks on relations that existed before |
| Locks, the whole file | the file in a rolled-back transaction, then `pg_locks` | exit 0; the table above; 0 of the two tables left after the rollback |
| The apply | `psql -1 -f packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` | exit 0; 3 SET, 2 CREATE TABLE, 4 CREATE INDEX, 2 COMMENT, 4 ALTER TABLE, 2 REVOKE, 2 GRANT, 4 CREATE POLICY |
| The apply, a second time | the same command | **a clear refusal, not a no-op:** exit 3, `ERROR:  relation "reminder_claims" already exists`, at the first CREATE TABLE; the transaction rolled back and the post-check after it read 21 OK |
| The post-check | the same form, with the nine carries of the pre-check | exit 0; 21 OK, 0 FAIL, 1 INFO |
| The suite | `pnpm exec vitest run tests/reminder-claims-rls.db.test.ts` in `packages/db`, `DATABASE_URL` at the throwaway | exit 0; 1 file, 41 passed |
| The whole `packages/db` suite | `pnpm exec vitest run` in `packages/db`, the same way | exit 0; 103 files, 1601 passed, none skipped |
| The rollback | the block below | exit 0; 2 DROP TABLE, committed |
| The pre-check again | as the first | exit 0; 8 OK; **the nine carries are identical to the ones read before the apply** |
| The suite on the rolled-back database | as above | exit 0; 41 skipped |

So no existing `packages/db` suite needs the new tables named in it: the 103 files passed
unchanged with the tables present.

**The post-check is not blind.** Run on the database without the tables it stopped with exit 3
(`relation "public.reminder_claims" does not exist`). Run with no carry it stopped with exit 3
(`STOP: -v tables_before is missing. This file refuses to guess.`). And it caught a real change:
see the next paragraph.

**What the rehearsal found, and what changed because of it.** The first draft of the file
(sha256 `ca451e27...`) had one more clause in each INSERT policy: that
`public.jwt_patient_id()` is null, copied from `0102`'s doors. `authenticated` holds no EXECUTE
on that function (only `patient` does), and a policy runs as the caller. On the throwaway the
job's first insert ended the server process (signal 11; the local image is known to do that
where a healthy server answers `permission denied for function`), and the stack recovered by
itself. Either way no insert by the job could have succeeded. The clause is removed: it was
redundant, because the policies are TO `authenticated` and a patient session's role is
`patient`, which holds nothing on either table. The pre-check now reads, before any apply, that
`authenticated` may execute each helper the policies call, with `jwt_patient_id()` as the
control that reads "not executable". The post-check, still carrying the first draft's pinned
expression, then read **20 OK, 1 FAIL** on the re-applied tables (verdict 9, the policies), and
was re-pinned to the new expression. The first draft's own apply, second apply, pre-check and
post-check had passed (8 OK and 21 OK): the catalogue could not see the defect, and the suite
that inserts as the job did.

**The rollback, as run** (with rows in the tables: 4 claim rows and 2 heartbeat rows, left by
the run that crashed; and with the tables empty, in the final run and between the mutation
runs; exit 0 each time):

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DROP TABLE public.reminder_sweep_passes;
DROP TABLE public.reminder_claims;
COMMIT;
```

It removes the tables with their indexes, constraints and policies, and **every row in them.**
After the sweep has run in production a rollback destroys the claims, which the dispatcher
reads to decide whether a reminder was already taken, so from then on it is an owner decision
and not a routine step. It takes ACCESS EXCLUSIVE on `appointments` and `tenants` while it runs.
It does not touch the journal: a sitting document would have to say what happens to the
journal row, and this draft does not.

### NOT REHEARSED, said one by one

- **Any block.** There is none: no stage, no clock or clinic check, no HEAD CHECK, no target
  guard, no halt.
- **The real applier.** The file was applied with `psql -1`, one transaction. `drizzle-kit
  migrate` through `verified-migrate.mjs` was not run, and neither journal reader. Under the
  Supabase CLI each file runs in its own implicit transaction; that path ran the 100 migrations
  under this one and not this one.
- **On top of `0103`, `0104` and `0105`.** The throwaway was at `main`'s position, `0102`.
  `0103` changes the default privileges for sequences and this file creates none, so the lane
  expects no interaction; the other two are not on `main` and were not under it. Carries that
  hash the whole catalogue will differ on that position, as they are meant to.
- **The promotion's commit.** It was simulated for `pnpm test:scripts` and `check-journal` and
  undone. The cleanup script's new delete, the README's promoted row and the journal's real
  `when` are not written.
- **Production's values.** Not read by this lane, ever: the default privileges, the helpers'
  grants, the `supautils.policy_grants` list, the row counts behind the two locks.
- **The locks under load.** Measured with no other session. No lock wait, no deadlock.
- **The application on these tables.** Nothing queries them. The sweep's branches still write
  `audit_log`.
- **The DB-gated suites of `apps/web`** were not run on the applied throwaway; no application
  file changed.

## What this does NOT do, and what is out of scope

- It does not move the sweep's code onto the tables, and does not touch the three local
  branches.
- It does not send, and cannot.
- It builds no late rule, no purge, no retention and no watch.
- It does not change `audit_log`, the ledger, or any existing policy, function or grant.

## The op carries no DELETE and no TRUNCATE statement

The migration has none. The rollback block above drops two tables this file created.

## Questions for strategy and the owner

1. **Who is the reminder job's principal (strategy).** (a) As built: `authenticated` with a
   tenant and no user, the test `0102` already uses. (b) A database role of its own that the
   job switches to: it needs grants on every table the job reads, a change to
   `withReminderTenantContext`, and its own migration. (c) SECURITY DEFINER doors: four
   functions, a count GATE-CHANGE, and an apply from the held head. Recommend (a).
2. **Do heartbeats belong in the same table (strategy).** (a) Two tables, as built. (b) One,
   with a nullable appointment. Recommend (a), for the reasons in section 3.
3. **How long rows are kept, and who may purge them (owner).** A claim is operational, not a
   legal record. Nothing is purged today, and the ledger has no retention either (`0075`,
   ruling 3: carded, not decided). Volumes at this clinic's size: about 86 shadow rows a day
   while in shadow, about one claim per reminder sent, and 60 heartbeats a day per clinic.
   (a) Keep everything until the ledger's retention is ruled, then one rule for both. (b) Keep
   claims as long as their appointment, purge heartbeats and shadow rows after 90 days, by a
   scheduled job that runs as the table's owner. (c) Purge everything after 90 days. Recommend
   (a) now and (b) as the card: a claim younger than its appointment is still read by the
   dispatcher, so claims must never be purged by age alone. No application role can purge as
   built; a purge needs its own function or an owner-run statement.
4. **What happens to rows when an appointment or a patient is hard deleted or merged
   (strategy).** As built, and as the ledger does it: the rows of an appointment go with its
   hard delete (CASCADE), and a hard delete of the appointment is not refused because of them.
   A patient cannot be hard deleted while an appointment exists (`appointments` is a blocking
   class in `apps/web/lib/patients/hard-delete-preflight.ts:46-59`), so the patient guard needs
   no new class. A merge re-points appointments and these tables carry no patient column, so
   `merge_patients` needs no change. (a) As built. (b) NO ACTION: an appointment with a claim
   could not be hard deleted until a purge. Recommend (a).
5. **Should the table itself refuse a second shadow row for one reminder and start, or a
   second heartbeat for one tenant and pass (strategy).** (a) No, as built: the sweep's lock
   does it, and a refused row would roll back the tenant's whole pass. (b) Yes, a unique index
   on each. Recommend (a) while in shadow; ask again when the sweep sends.
6. **"Enabled and forced" (strategy).** The brief says RLS "enabled and forced the way the
   sibling does it". The sibling, and every table in the schema, is enabled and NOT forced, and
   the file follows the sibling. On the throwaway `postgres` bypasses RLS, so FORCE would change
   nothing for the owner there. (a) Enabled, as built. (b) Also FORCE, the first table in the
   schema to have it. Recommend (a).
7. **Should `service_role` keep its platform default on these tables (strategy).** (a) Yes, as
   `0075` and `0102`. (b) Revoke it by name, so nothing but the owner can rewrite a row.
   Recommend (a) until question 3 says who purges.
8. **The number (strategy).** `0106` provisionally. Confirm, or say which item takes it.
9. **Should the claims INSERT policy also prove the appointment belongs to the row's tenant
   (strategy).** (a) No, as built and as the ledger. (b) Yes, by a sub-select in the policy; it
   ties the policy to whatever the `appointments` policy lets the job read. Recommend (a).

## Review history

None. No reviewer has read the migration, the check files, the suite or this document.
