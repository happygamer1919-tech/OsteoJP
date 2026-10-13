# 0106: apply the reminder sweep's two tables

**THE NUMBER IS `0106`, BY STRATEGY'S RULING OF 2026-10-13 (W-8: "the sweep table is 0106").** The
migration file still carries its pending name,
`packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql`, and the journal is not
touched, because `0104` and `0105` are not on `main` yet and apply order equals file order. What
remains to do when `0105` is on `main` is listed below, one step at a time.

**NOT READY, AND NOT A SITTING DOCUMENT YET.** It has no blocks for GREEN: no stage 0, no stage 1,
no stage 2, no closing journal read, no halt rule, no fault-injection test, and no sha256 sidecar.
Every one of them pins a predecessor's hash or a journal position that does not exist until
`0105` is applied. What this document does carry: what the migration does, strategy's rulings
with the proof of each, the design, the locks as measured, the order of pull requests a sitting
needs, what each verdict of the two check files must read, the proof per role, the two
rehearsals' records, the rollback that was run, what was NOT rehearsed, and the open questions.

**Status: AUTHORED, REVISED FOR STRATEGY'S RULINGS OF 2026-10-13, REHEARSED TWICE ON A THROWAWAY
WITH LIMITS. NOT PROMOTED. THIS REVISION IS NOT REVIEWED. NOT APPLIED ANYWHERE BUT A THROWAWAY,
AND TAKEN OFF IT AGAIN.** One migration, sha256
`23f70c17478a394e9d4dd6faed28a13bdc6299a927c51e6e4eb2a0a97e2197e5`, 23 statements. It lives in
`migrations-pending`, where nothing can apply it. The first draft was sha256 `a78b2c9d...`; its
reviewer passed it with five minor findings, and the section "Review history" says what became
of each.

**Authored by SOLO. If it is ever run, it is run by GREEN,** a fresh session launched with the
apply settings, on the owner's dispatch naming the migration by filename (`CLAUDE.md`, "Who
applies migrations"). The lane that wrote this document never runs it.

## NOT READY: what must happen first, in this order, and none of it by GREEN

1. **`0104` and `0105` are applied to production and merged.** Apply order equals file order
   (2026-09-30), and one migration is in flight at a time. This file follows `0105`.
2. **A fresh reviewer passes this revision** (R4, Tier C). The first draft has a PASS; the bytes
   changed since, and they are bytes that run against production.
3. **The GATE-CHANGE the promotion forces merges first,** as its own pull request, merged by the
   owner on green (see "The order of pull requests").
4. **The promotion** (the next section).
5. **This document gets its blocks, its sidecar and its fault-injection test,** the two check
   files get their journal verdicts, and a rehearsal agent runs all of it on a throwaway under
   the lead's rule of 2026-09-30.
6. **The pull request merges, and GREEN applies from `main`** (strategy W-9: "merge first, apply
   from main"). Before the apply, the search in "No code on `main` reads either table" is run
   again on the commit the sitting runs from.
7. **The sweep's three steps, already moved onto the tables on a local branch, merge only after
   the apply.** Code that queries a table production does not have fails at run time.

## What remains to do when `0105` is on `main`

The number is ruled, so none of this is a decision. It is the promotion, and it changes no byte
of the migration.

1. Merge `main` into the branch (merge, never rebase).
2. Rename `packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` to
   `packages/db/migrations/0106_reminder_claims.sql`. Its sha256 stays
   `23f70c17...2197e5`; the file's own header still says "PENDING", stale on purpose.
3. Add its entry to `packages/db/migrations/meta/_journal.json`: the next `idx` after `0105`'s,
   tag `0106_reminder_claims`, a `when` above `0105`'s.
4. Mirror it into `supabase/migrations` (`scripts/sync-supabase-migrations.mjs`).
5. Move the row of `packages/db/migrations-pending/README.md` to its "Promoted" table.
6. `scripts/import/cleanup-test-patients.sql` gains its delete from `reminder_claims`, ahead of
   the delete from `appointments` (its test's GATE-CHANGE merged first, step 3 above).
7. The pre-check and the post-check gain their journal verdicts (the migration absent by hash
   before, the newest row after, the journal moved by one), and the pre-check's header names the
   promoted path.
8. This document gets its blocks, its sha256 sidecar and its fault-injection test
   (`scripts/*.test.mjs`), and is rehearsed whole on a throwaway at production's position.
9. `packages/db/tests/reminder-claims-rls.db.test.ts` needs no edit: from the promotion commit on
   it throws, instead of skipping, on a database without the tables.
10. Run `pnpm test:scripts` and `node scripts/check-journal.mjs` on the promoted tree.

Not part of the promotion and not GREEN's: the skip guard's GATE-CHANGE (after the merge), and
the sweep's own pull requests (after the apply).

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
ALL` on each from `PUBLIC`, `anon`, `authenticated`, `patient` and `service_role`; a `GRANT
SELECT, INSERT` on each to `authenticated`; two `ALTER TABLE` statements that add the three
foreign keys to `appointments` and `tenants`; and four `CREATE POLICY` statements, last. The
INSERT policy of `reminder_claims` reads `public.appointments` in a sub-select.

## 2. Strategy's rulings of 2026-10-13, and the proof of each

Every command below ran on the throwaway of the second rehearsal (see "Rehearsal"). "The suite"
is `pnpm exec vitest run tests/reminder-claims-rls.db.test.ts` in `packages/db`, 52 tests, each
access arm as the real principal in a transaction that is rolled back.

| Ruling | In the file | Proof, and its result line |
|---|---|---|
| **W-1** the writer is the userless `authenticated` session, as `0102`. Gate: a logged-in owner, admin, reception and therapist are each refused INSERT on both tables | The two INSERT policies ask for the tenant, the role `owner` or `admin`, and `auth.uid()` null | The suite, four arms "a (owner, admin, reception, therapist) with a user is REFUSED an insert on both tables": each inserts a claim, a release and a heartbeat and reads `row-level security` three times. `Tests 52 passed (52)`. Mutants: without "no user", 2 red on each table; with reception and therapist admitted, 1 red on each table |
| **W-2** the heartbeat keeps its own table | `reminder_sweep_passes` | Post-check verdict 1: `reminder_claims:r:postgres, reminder_sweep_passes:r:postgres; control true`, OK |
| **W-3** cascade with the appointment | `reminder_claims_appointment_id_fkey ... ON DELETE CASCADE` | Post-check verdict 6 (`-> appointments del c`), OK. The suite: an owner's hard delete of an appointment takes its four rows and keeps the heartbeats |
| **W-4** RLS enabled, not forced | `ENABLE ROW LEVEL SECURITY`, no `FORCE` | Post-check verdict 8: `reminder_claims on true forced false, reminder_sweep_passes on true forced false`, OK |
| **W-5** `service_role` revoked by name on both tables. Gates: the job's write path still succeeds; PUBLIC holds nothing | `service_role` is in both `REVOKE ALL` lists | See "W-5" below. Post-check verdict 11 `0 cells, 0 PUBLIC items; control 2` and verdict 21 (the whole grantee list), both OK. The suite: `service_role` is refused 10 statements with `permission denied`, and the job writes through the real tenant context and the real Drizzle tables. Mutants: `service_role` left out of either REVOKE, 4 red each |
| **W-6** the INSERT policy proves the appointment is of the row's tenant | An `EXISTS` sub-select on `appointments` in `reminder_claims_job_insert` | See "W-6" below. The suite, five arms. Mutant: the `EXISTS` dropped, 3 red |
| **W-7** no duplicate refusal while in shadow | No unique key over shadow rows or heartbeats | The suite: two heartbeats of one tenant for one pass id are accepted. **Carded, not built: a duplicate refusal must exist before the sweep's send mode is armed** |
| **W-8** the number is `0106` | The file keeps its pending name until `0105` is on `main` | This document, the two check files and the README row |
| **W-9** merge first, apply from `main`. Gate: a search of `main` proves no code reads either table before the apply | Nothing to build | See "No code on `main` reads either table": 0 lines for the table names; 3 lines for the Drizzle name, all one test's local helper of the same name |
| **W-10** keep all rows until the ledger's retention is ruled; a 90 day purge of shadow rows and heartbeats as a card; a claim is never purged by age alone | No purge, no retention, and after W-5 no role but the owner can delete | Post-check verdict 21. **Carded, not built** |
| **W-11** confirmed as built: `send` in the mode list, one release per claim, `due_at` and `early` stored | Unchanged | Post-check verdicts 4 and 5 (the constraints, pinned), OK |

## 3. The design, in brief

**The shape.**

`reminder_claims` (16 columns):

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
| `claim_kind` | release | written by the database, never by the application: `claim` on a release, NULL on every other row |
| `minutes_after_mark` | shadow | minutes between `due_at` and the pass; may be negative |
| `saved_after_mark` | shadow | the visit was saved after `due_at` |
| `pass_id` | any | the scheduler's id for the pass, when there is one |
| `created_at` | all | when the row was written |

`reminder_sweep_passes` (11 columns): `id`, `tenant_id`, `pass_id`, `mode` (`shadow` or `send`),
`pass_at` (the pass's own clock), `look_ahead_before` (the last pass of the day only),
`due_count`, `recorded_count`, `over_ceiling`, `excluded_count` (visits left out because they
never had a reminder), `created_at`.

**What the rulings settled.** Two tables (W-2). The writer is the session with a tenant and no
user (W-1). The rows of an appointment go with it (W-3). RLS enabled, not forced (W-4).
`service_role` holds nothing (W-5). `send` is in the mode list, one release per claim, and
`due_at` and `early` are stored (W-11).

**Still the lane's judgments, none of them questioned so far.**

1. **The shadow row is a kind of `reminder_claims`, not a third table.** It has the claim's key
   (appointment, offset, channel, start), and the sweep's "have I taken this reminder" read asks
   for its own shadow rows and its own claims together.
2. **The INSERT policies also ask for the role `owner` or `admin`,** the ledger's own narrowing
   (`0075`). The job is `admin`. A session with no user and the role `reception` or `therapist`
   is refused on both tables (tested); nothing makes one.
3. **Readers are `owner`, `admin` and `reception`, not `therapist`:** the ledger's readers, and
   the roles that hold `reminders:log_read` in the application.
4. **Append only is by grants and by policies, not by a trigger.** A trigger that refuses every
   DELETE would refuse the appointment's cascade too.
5. **`offset_id` is free text,** because the offsets live in the application.

**A release names a claim of the same reminder, and the table now proves it.** The first draft
tied a release to a row of the same tenant and the same appointment and nothing more; its
reviewer showed a release naming another release, with another offset and channel, accepted.
The key now has six columns: the release's tenant, appointment, offset, channel, `claim_kind`
and `claim_id` must be the tenant, appointment, offset, channel, kind and id of one existing
row. `claim_kind` is a generated column that reads `claim` on a release, so the row named is of
kind `claim`. Cost: one more column, written by the database, and a wider unique key. It was
cheap and it is proven (the suite refuses a release with another offset, another channel, and a
release that names a shadow row or another release; three mutants, each killed). The code on
the local sweep branch already writes a release with its claim's offset and channel
(`releaseReminderClaim`), so nothing there changes; it never sends `claim_kind`.

**What is NOT enforced by the table, said plainly.**

- **That at most one claim of a reminder is live.** The dispatcher's advisory lock does that.
- **That a claim's appointment is of its tenant, FOR A WRITER THAT BYPASSES ROW LEVEL
  SECURITY.** W-6 puts the test in the INSERT policy, so it binds every session the application
  can make. The table's owner is not bound by a policy, and no key ties the two columns:
  `appointments` has no unique key over `(tenant_id, id)` for a foreign key to point at, and
  this file changes no existing table. After W-5 the owner is the only such writer.

## W-5: `service_role` holds nothing

The platform's default privileges hand `service_role` every table privilege at `CREATE TABLE`,
and it bypasses row level security, so the first draft left it able to rewrite or remove any
row (its reviewer changed a row as `service_role` to show it). The file now revokes it by name.
These are the first tables in the schema where it holds nothing.

**Gate 1, the reminder job's write path still succeeds after the revoke.** The job never runs
as `service_role`: `withReminderTenantContext` calls `withTenantContext`, which sets the role
`authenticated` (`apps/web/lib/reminders/context.ts:25-33`, `packages/db/src/client.ts:146-158`).
The suite's arm "THE JOB'S WRITE PATH STILL SUCCEEDS" calls that same `withTenantContext` with
the job's claims, reads inside the transaction that `service_role` holds no privilege on either
table, and then inserts a claim, a release, a shadow row and a heartbeat through the Drizzle
tables `reminderClaims` and `reminderSweepPasses`. Result: passed, in `Tests 52 passed (52)`.

**Gate 2, PUBLIC holds no privilege on either table.** Post-check verdict 11: `0 cells, 0 PUBLIC
items; control 2`. Verdict 21 reads every entry of both ACLs: `reminder_claims authenticated
[INSERT,SELECT]; reminder_claims postgres [all eight]; reminder_sweep_passes authenticated
[INSERT,SELECT]; reminder_sweep_passes postgres [all eight]`, and nobody else. The suite has
the same two reads.

**The whole grantee list is pinned, not a list of named roles.** A role nobody named that the
defaults hand a grant to would have passed the first draft's post-check. Two things close it:
the pre-check's verdict 9 reads the default privileges BEFORE the apply and fails if they name
a role the migration does not revoke, and the post-check's verdict 21 pins the list after.
Both were shown a real failure on the throwaway, in transactions that were rolled back: with a
default grant to another role, verdict 9 read `supabase_auth_admin; control true`, FAIL; with a
grant to `service_role` on one table and to another role on the other, verdicts 11 and 21 read
FAIL.

**THE SEED WOULD HAVE HANDED IT BACK, ON EVERY LOCAL AND CI DATABASE.** `supabase/seed.sql`
grants `service_role` SELECT, INSERT, UPDATE and DELETE on ALL tables in `public`, and it runs
after every migration on each `supabase db reset`. Production runs no seed. So after the
promotion, CI and every lane would have read a state production does not have, and the suite
that proves the revoke would have been red there. Measured on the throwaway: with `main`'s
seed run after the migration, `service_role` held `DELETE,INSERT,SELECT,UPDATE` on
`reminder_claims` and the suite read `Tests 4 failed | 48 passed (52)`; with this branch's
seed, 0 privileges and `Tests 52 passed (52)`. The seed now ends with a guarded block that
revokes `service_role` on the two tables where they exist, and does nothing where they do not.
`supabase/seed.sql` is not a gate file.

**What this costs.** Nothing reads or writes the tables as `service_role` today (no code reads
them at all). A later job that wants to purge old rows cannot run as `service_role`: it needs
a function of its own or an owner-run statement. That is the purge card's to decide (W-10).

## W-6: a claim's appointment is of the row's tenant

The first draft held the row's tenant to the session's and the appointment to an existing one,
and nothing tied the two: the job of one tenant could write a row with its own tenant that named
another tenant's appointment, and an id that did not exist was refused by the foreign key, so
the insert answered whether an appointment id existed anywhere. The INSERT policy of
`reminder_claims` now also asks:

```sql
EXISTS (
  SELECT 1
    FROM public.appointments a
   WHERE a.id = reminder_claims.appointment_id
     AND a.tenant_id = reminder_claims.tenant_id
)
```

**Proven both ways, as the real principal** (the suite, as `authenticated` with the job's
claims):

| Arm | Result |
|---|---|
| The job inserts a claim, a release and a shadow row for its own tenant's appointment, a cancelled appointment included | accepted |
| The job inserts a row with its own tenant that names another tenant's appointment, of each kind | `row-level security`, three times |
| The job inserts a row that names an appointment id that does not exist | the same error text as for another tenant's appointment: the insert no longer says whether an id exists |
| The other tenant's job claims its own appointment, and then this tenant's | accepted, then `row-level security` |

**What it rests on: the sub-select runs under the row level security of `appointments`, as the
job's session.** A policy's sub-select runs as the caller. The job's session (a tenant, the role
`admin`, no user) reads every appointment of its tenant through the admin arm of
`appointments_rls` (`0086`): with no user it has no location assignment, so no location
narrowing applies. Proven: the suite's arm "the job's session SEES the appointments it must
claim" reads, as the job, the three appointments of its tenant (two scheduled, one cancelled)
and not the other tenant's; and the other tenant's job reads its own one. The pre-check's
verdict 8 reads, before any apply, that `authenticated` holds SELECT on `appointments` and may
execute every function a policy on `appointments` that applies to it depends on (read from
`pg_depend`, not from a list): `true; 0 refused of at least 3; control true`. With one of those
functions revoked in a rolled-back transaction it read `1 refused`, FAIL.

**What it costs.**

- **A coupling.** A later migration that narrows what an admin session with no user reads in
  `appointments` narrows what the job can claim, without touching this table. The job's claim
  fails open (the reminder still goes, the claim is not recorded and an error is logged), so
  nothing a patient receives changes, but the claim store goes quiet. The suite's "SEES" arm is
  the tripwire: it goes red in CI on the pull request that makes such a change.
- **Time.** One lookup in `appointments` for each row inserted into `reminder_claims`. Measured
  on the throwaway as the job, with `EXPLAIN (ANALYZE)`: with 20,000 appointments in the tenant
  and the statistics fresh, an index scan on `appointments_pkey`, `Execution Time: 0.309 ms`
  for the whole insert (planning 0.397 ms). The first insert of a cold session on a table of two
  rows read 4.2 ms, of which 2 ms was the first call of the location helper. A heartbeat insert,
  which has no sub-select, read 0.37 ms. At about one claim per reminder this is nothing.
- **Not measured on production's data,** and never under load.

**The `a.tenant_id` test repeats what the `appointments` policies already hold, on purpose.**
Under those policies the job cannot see another tenant's appointment at all, so with the test
removed the suite still passes (the one surviving mutant, see "Mutation sweeps"). It is the
part that does not depend on another table's policies. Shown on its own on the throwaway: with
row level security on `appointments` switched off inside one rolled-back transaction, the job
of tenant A sees tenant B's appointment (control: 1 row), and its row naming it is still
`REFUSED: new row violates row-level security policy for table "reminder_claims"`; with the
test removed from the policy, the same row is `ACCEPTED`. That probe is not a standing test,
because switching a policy off takes a lock on `appointments` that a shared test database
cannot afford.

**The heartbeat is unchanged.** It names no appointment.

## No code on `main` reads either table (W-9)

Run on 2026-10-13 against `origin/main` at `5d4e8091` (the commit that has `0103`).

The tables' SQL names, the whole tree:

```
$ git grep -n -I -i -E 'reminder_claims|reminder_sweep_passes|reminder_claim|sweep_passes' origin/main -- .
$ echo $?
1
```

No line. The control, the ledger, with the same command shape:

```
$ git grep -I -i -E 'reminder_dispatches|reminderDispatches' origin/main -- . | wc -l
219
```

The Drizzle names the application would import:

```
$ git grep -n -I -E 'reminderClaims|reminderSweepPasses' origin/main -- .
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:89:const reminderClaims = (tenantId: string): string =>
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:236:    const rows = await asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
origin/main:packages/db/tests/reschedule-requests-rls.db.test.ts:247:      asRole(sql, "authenticated", reminderClaims(A.tenant), (tx) =>
```

Three lines, one file, and not the table: a local function of that test that builds the
reminder job's JWT claims as a string. It imports nothing from the schema under that name.

**At the sitting the tables' own pull request is on `main`, so the search leaves its files
out.** On this branch the names appear in nine files: this document, the pending migration, the
pending README, `packages/db/src/schema.ts` (the declaration), the suite, the two check files,
`supabase/seed.sql`, and the unrelated test above. The promotion adds the numbered migration,
its mirror, the journal and the cleanup script. The form to run on the commit the sitting runs
from, and what it must print:

```
$ git grep -n -I -E 'reminder_claims|reminder_sweep_passes|reminderClaims|reminderSweepPasses' origin/main -- \
    apps packages scripts supabase \
    ':!packages/db/migrations' ':!packages/db/migrations-pending' ':!supabase/migrations' \
    ':!packages/db/src/schema.ts' ':!packages/db/tests/reminder-claims-rls.db.test.ts' \
    ':!scripts/db/precheck-0106-reminder-claims.sql' ':!scripts/db/postcheck-0106-reminder-claims.sql' \
    ':!supabase/seed.sql' ':!scripts/import/cleanup-test-patients.sql' ':!scripts/import/cleanup-test-patients.test.mjs'
```

Exactly the three lines of `reschedule-requests-rls.db.test.ts` above, and nothing else. Run
against this branch's head it prints exactly those three. Any other line is a reader that
merged before the apply, and is a STOP for the sitting. `git grep -E` has no `\s` and no `\b`;
the pattern uses neither.

## 4. Closed hours only

This file creates four policies. Strategy's standing rule (S-1004-A): "any migration that
creates a policy is closed-hours only, never eligible for R9." The weekday table of 2026-10-03
applies: open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon time.
Strategy's calendar of 2026-10-13: one migration in flight, each on a closed night after the
previous one's clean report and merge; this one is aimed at Monday 2026-10-19 or Tuesday
2026-10-20.

## The locks, measured on the throwaway (2026-10-13, PostgreSQL 17.6)

Read from `pg_locks` for the applying session, at the end of the file, inside a transaction that
was then rolled back. Measured again for this revision; the strongest lock on each table is
unchanged from the first draft.

| Part of the file | Locks on relations that existed before |
|---|---|
| Statements 1 to 17 (the `SET LOCAL` lines, both tables, the indexes, the comments, RLS, the revokes and grants) | **none, in any mode** (measured on the first draft; these statements name no existing table in this revision either) |
| Statements 18 and 19 (the foreign keys) | SHARE ROW EXCLUSIVE on `public.appointments` and `public.tenants`: writes to them wait, reads do not |
| Statements 20 to 23 (the policies) | ACCESS EXCLUSIVE on 23 platform tables: 16 in `auth` (`users`, `sessions`, `refresh_tokens`, `identities` and the rest), 5 in `storage`, 2 in `realtime`. The claims INSERT policy also takes ACCESS SHARE on `public.appointments`, weaker than the lock statement 18 already holds |

All are held until the COMMIT. `lock_timeout` read `5s`, `statement_timeout` `1min` and
`idle_in_transaction_session_timeout` `15s` inside the transaction. Both new tables are empty,
so each foreign key is validated at once. **Production's `supautils.policy_grants` setting has
not been read,** so the list of platform tables there is not established; `0102` took the same
kind of lock in its sitting.

**The rollback takes a stronger lock than the apply:** ACCESS EXCLUSIVE on `public.appointments`
and `public.tenants` (dropping a foreign key removes its triggers from the table it points at),
so reads of both wait while it runs. Measured on the first draft's throwaway.

## The order of pull requests

Strategy ruled the kind (W-9): the pull request merges first, and GREEN applies from `main`, as
`0100` and `0101` did. Nothing on `main` reads the tables before the apply, and the migration
creates no function, so no required check counts anything it changes.

Measured on the first draft, 2026-10-13, by promoting in place (the file moved to
`packages/db/migrations/0106_reminder_claims.sql`, a journal entry added, the mirror synced),
running `pnpm test:scripts`, and undoing all of it: `check-journal` reconciled its files with
its entries, and **1 script test failed**, the cleanup test below. Not measured again for this
revision: the revision changes no table name and no foreign key to an existing table.

| # | Pull request | Kind | When |
|---|---|---|---|
| 1 | The cleanup test learns `reminder_claims` | GATE-CHANGE, the owner merges | before the promotion |
| 2 | The promotion, with `scripts/import/cleanup-test-patients.sql` gaining its delete, this document with its blocks, the check files, the suite, the schema entry and the seed's guarded revoke | Tier C, `held-for-apply` until the owner takes the label off and merges | after 1, and after `0105` is on `main` |
| 3 | GREEN applies from `main` | the sitting | after 2 has merged |
| 4 | The skip guard lists the suite | GATE-CHANGE, the owner merges | after 2 has merged |
| 5 | The sweep's steps, on the tables | Tier B | after the apply |

**The gate files a GATE-CHANGE must touch, with the lines as they stand on `main` at
`5d4e8091`.** None is edited on this branch.

- **`scripts/import/cleanup-test-patients.test.mjs`** (pull request 1):
  - line 47, inside `DELETE_ORDER` (it opens at line 30): add `"reminder_claims",` on a new line
    before `"appointments",`;
  - line 244, `const AHEAD_OF_MIGRATION = new Set([]);`: becomes
    `new Set(["reminder_claims"])` while the table's migration is not numbered, and is emptied
    again by the next GATE-CHANGE after the promotion;
  - line 314, `assert.ok(reached.size >= 24, ...)`: the floor becomes 25, in both places on
    that line;
  - the ordered pairs that end at line 351: add `["reminder_claims", "appointments"]`.
  Why: its test "every table with an FK path to patients is covered" fails on the promoted
  tree with `reminder_claims has an FK path to patients but the script never deletes from it`.
  `reminder_sweep_passes` points at `tenants` only and is not on that path.
- **`.github/scripts/assert-rls-executed.mjs`** (pull request 4): after line 295, the list's last
  entry (`{ file: "survey-page.db.test.ts", hard: true },`), add
  `{ file: "reminder-claims-rls.db.test.ts", hard: true },` with its comment. Until then the
  suite runs on CI but its absence would not be red.
- **`.github/gate-manifest.json`**, in each of the two GATE-CHANGE pull requests: line 82 (the
  hash of the cleanup test) and line 28 (the hash of the skip guard), regenerated by
  `scripts/gate-manifest.mjs`, never by hand.

- **An observation, not part of this change.** The ledger, `reminder_dispatches`, also points
  at `appointments`, and the cleanup has never listed it: its `REFERENCES` clause sits on its
  own line in `0075`, a form the test's reader does not match. Its delete cascades, so the
  cleanup has not failed for it. Whether the cleanup should count those rows is the lead's.
- **No count GATE-CHANGE.** The migration creates no function. The SECURITY DEFINER count read
  36 before and 36 after.
- **A fault-injection test for this document's blocks** will be a new `scripts/*.test.mjs`
  file. Adding one trips no gate; it is frozen at the next GATE-CHANGE after it lands.

## What every verdict must read

**The pre-check, `scripts/db/precheck-0106-reminder-claims.sql`: 10 verdicts OK, 9 CARRY rows, 3
INFO rows.** READ ONLY. It proves the session is `postgres`; that none of the nine relation
names the migration creates is taken; that `appointments` and `tenants` exist with a primary key
on `id`; that the three helpers the policies call exist AND that `authenticated` may execute
each; that the four roles exist; that the server is Postgres 17; that every SECURITY DEFINER
function is owned by `postgres`; that `authenticated` reads `appointments` and may execute every
function its policies there depend on (verdict 8, for W-6); and that the default privileges hand
a new table to no role the migration does not revoke by name (verdict 9, for W-5). It carries
nine values for the post-check.

**The post-check, `scripts/db/postcheck-0106-reminder-claims.sql`: 22 verdicts OK.** READ ONLY.
It proves both tables exist and are owned by `postgres`; the columns, the constraints, the
foreign keys with their delete actions, and the indexes, each against a pinned value; RLS on
and not forced; exactly one SELECT and one INSERT policy per table, to `authenticated` alone,
with pinned expressions (the claims INSERT policy's is the one with the sub-select);
`authenticated` holding exactly SELECT and INSERT of the eight table privileges; `anon`,
`patient`, `service_role` and `PUBLIC` holding nothing; **the whole grantee list of each table
(verdict 21)**; no column grant and no trigger; both tables empty; and that nothing else moved:
the table count is the pre-check's plus two, and the sequences, the functions, the SECURITY
DEFINER count, every other policy, every other privilege, the default privileges and the
triggers are the pre-check's.

**Not in either file yet:** the journal verdicts (the migration absent by hash before, the
newest row after, the journal moved by one). They pin a predecessor that is not on `main`.

## The proof per role

`packages/db/tests/reminder-claims-rls.db.test.ts`, 52 tests, DB-gated. Every arm about access
runs as the real principal, in a transaction that is rolled back, and is shown both ways.

| Who | Allowed, shown to succeed | Refused, shown to fail |
|---|---|---|
| The reminder job (`authenticated`, a tenant, `admin`, no user) | inserts a claim with RETURNING and reads it back; inserts a release, a shadow row and a heartbeat; reads its tenant's rows; reads its tenant's appointments | a row naming another tenant (`row-level security`); a row with its own tenant naming another tenant's appointment, or one that does not exist (`row-level security`); any insert with no tenant in the session; any insert with the role `reception` or `therapist`, on both tables; every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: owner, admin, reception (with a user) | read the tenant's claims and heartbeats | every insert, on both tables (`row-level security`); every UPDATE, DELETE and TRUNCATE (`permission denied`) |
| Staff: therapist | nothing | reads zero rows; inserts, updates, deletes refused as above |
| Another tenant's admin | reads its own rows | sees none of this tenant's |
| `service_role` | nothing (control: it still reads the ledger) | every read, insert, update, delete and truncate on both tables (`permission denied`) |
| A patient session | nothing | read and insert (`permission denied`) |
| `anon` | nothing | read and insert (`permission denied`) |

Also proven: with UPDATE and DELETE granted to `authenticated` for the length of one rolled-back
transaction, the job and the tenant's owner still reach zero rows, while the same sessions see
three (the policies refuse apart from the grants); an owner's hard delete of an appointment
takes that appointment's claim, release and shadow rows with it and leaves the heartbeats; a
tenant with a heartbeat cannot be deleted from under it; each CHECK, each foreign key and the
one-release-per-claim index, by the constraint's own name; and a value written into
`claim_kind` is refused.

**The suite on a database without the tables: 52 skipped, exit 0.** Until the promotion that is
its answer on CI. From the promotion commit on it throws instead of skipping, and it throws on
a database that holds one table of the two.

## Mutation sweeps

**The second sweep, 2026-10-13, once, over the clauses this revision added.** Each rule was
weakened in a copy of the file, the tables dropped, the copy applied and the suite run; the
real file was applied again at the end and read 52 passed.

| # | Weakened | Tests that went red | Killed by |
|---|---|---|---|
| 1 | W-5: `service_role` left out of the REVOKE on `reminder_claims` | 4 | "service_role is REFUSED every read, insert, update, delete and truncate", "THE JOB'S WRITE PATH STILL SUCCEEDS", the two catalogue arms |
| 2 | W-5: `service_role` left out of the REVOKE on `reminder_sweep_passes` | 4 | the same four |
| 3 | W-6: the tenant tie (the whole `EXISTS`) dropped | 3 | "REFUSED a row with its OWN tenant that names ANOTHER tenant's appointment", "REFUSED an appointment that does not exist by the SAME error", "the other tenant's job ... REFUSED this tenant's" |
| 4 | W-6: the `EXISTS` kept, its `a.tenant_id` test dropped | **0, SURVIVED IN THE SUITE** | the one-off probe in "W-6" above: with this mutant the row is `ACCEPTED`, with the real file `REFUSED`. Under the `appointments` policies the two are the same, so no standing test can tell them apart |
| 5 | W-1: the claims INSERT policy also admits `reception` and `therapist` | 1 | "REFUSED when a session with no user carries the role reception or therapist" |
| 6 | W-1: the heartbeat INSERT policy also admits them | 1 | the same arm (this is the mutant that survived the first draft's review; the arm now inserts into both tables) |
| 7 | W-1: the claims INSERT policy without "no user" | 2 | "a owner with a user is REFUSED", "a admin with a user is REFUSED" |
| 8 | W-1: the heartbeat INSERT policy without "no user" | 2 | the same two |
| 9 | the release key without the offset | 1 | "REFUSES a release whose offset or channel is not its claim's" |
| 10 | the release key without the channel | 1 | the same arm |
| 11 | the release key without the kind | 1 | "REFUSES a release that names a SHADOW row or ANOTHER RELEASE" |

Ten of eleven killed by a test; the eleventh is equivalent inside the suite and is told apart
by the probe.

**The first sweep, on the first draft** (nine rules: the claims INSERT policy without "no
user"; UPDATE and DELETE granted on `reminder_claims`; the claims SELECT policy without the
role list; the heartbeat SELECT policy without the tenant; SELECT on the heartbeats granted to
`anon`; the appointment foreign key without CASCADE; the heartbeat INSERT policy without the
tenant; the one-release-per-claim index dropped; TRUNCATE granted on the heartbeats): nine of
nine went red. Not run again.

## Rehearsal

Neither is a sitting rehearsal: there are no blocks to rehearse. What ran each time is the
migration itself, the two check files, the suite and the rollback.

### The second rehearsal, 2026-10-13, on this revision's bytes

**The throwaway.** A local Supabase stack of its own, project id `t0106`, in a scratch folder
outside the repository, never lane blue, purple or amber. Supabase CLI 2.100.0, PostgreSQL 17.6.
Ports, each checked free first: database 56102, API 56101, shadow 56100. Started without
realtime, imgproxy, edge-runtime, logflare, vector, studio, postgres-meta, supavisor and
mailpit. Built by `supabase start` from this branch's `supabase/migrations` after `main` was
merged in, which is `origin/main`'s at `5d4e8091`: 101 migrations, `0000` to `0103`, then this
branch's `supabase/seed.sql` (its guarded block ran with the tables absent and did nothing).

**The run, from 18:08 Lisbon (WEST).**

| Step | Command (connection flags left out) | Result |
|---|---|---|
| The pre-check | `psql -c "begin read only" -f scripts/db/precheck-0106-reminder-claims.sql -c "rollback"` | exit 0; 10 OK, 0 FAIL, 9 CARRY, 3 INFO |
| Locks, the whole file | the file in a rolled-back transaction, then `pg_locks` | exit 0; the table above; 0 of the two tables left after the rollback |
| The apply | `psql -1 -f packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql` | exit 0; 3 SET, 2 CREATE TABLE, 4 CREATE INDEX, 2 COMMENT, 4 ALTER TABLE, 2 REVOKE, 2 GRANT, 4 CREATE POLICY |
| The apply, a second time | the same command | **a clear refusal, not a no-op:** exit 3, `ERROR:  relation "reminder_claims" already exists`, at the first CREATE TABLE; the transaction rolled back |
| The post-check | the same form, with the nine carries of the pre-check | exit 0; 22 OK, 0 FAIL |
| The suite | `pnpm exec vitest run tests/reminder-claims-rls.db.test.ts` in `packages/db`, `DATABASE_URL` at the throwaway | exit 0; 1 file, 52 passed |
| The cost and the tenant test on its own | the two probes of "W-6", each in a rolled-back transaction | exit 0; the figures and the two lines quoted there |
| The whole `packages/db` suite, first run | `pnpm exec vitest run` in `packages/db`, the same way | **exit 1: 102 of 103 files, 1613 of 1614 tests.** One test of `tests/migration-batch-import.test.ts` timed out at 20 s, with the machine's load average at 22 (other lanes were running) |
| That file alone | `pnpm exec vitest run tests/migration-batch-import.test.ts` | exit 0; 4 passed, 1.9 s |
| The whole `packages/db` suite, second run | as the first | exit 0; 103 files, 1614 passed, none skipped |
| The seed after the migration, `main`'s | `psql -f` of `origin/main`'s `supabase/seed.sql`, then the suite | `service_role` holds `DELETE,INSERT,SELECT,UPDATE`; the suite exit 1, 4 failed, 48 passed |
| The seed after the migration, this branch's | `psql -f supabase/seed.sql`, then the suite | 0 privileges; the suite exit 0, 52 passed |
| The mutation sweep | "Mutation sweeps" above | 10 of 11 red; the real file again, 52 passed |
| The checks shown a real failure | "W-5" and "W-6" above, in rolled-back transactions | post-check verdicts 11 and 21 FAIL; pre-check verdicts 8 and 9 FAIL |
| The rollback | the block below, with one heartbeat row in the table | exit 0; 2 DROP TABLE, committed |
| The pre-check again | as the first | exit 0; 10 OK; **the nine carries are identical to the ones read before the apply** |
| The suite on the rolled-back database | as above | exit 0; 52 skipped |
| The whole `packages/db` suite on the rolled-back database | as above | exit 0; 102 files passed and 1 skipped; 1562 passed, 52 skipped. This is what CI reads until the promotion |

So no existing `packages/db` suite needs the new tables named in it. The timed-out test is in a
file that never touches these tables, passed alone and passed in the second whole run; it is
recorded as it happened, not explained away.

**The seed's guarded block was run through the Supabase CLI only with the tables absent** (at
`supabase start`). With the tables present it was run with `psql -f`, not through the CLI.

### The first rehearsal, 2026-10-13, on the first draft (sha256 `a78b2c9d...`)

On a throwaway of the same kind, project id `r0106`, at `main`'s position of that morning
(`0102`): pre-check 8 OK; apply exit 0; second apply exit 3, the same clear refusal; post-check
21 OK; the suite 41 passed; the whole `packages/db` suite 103 files, 1601 passed; the rollback
exit 0 with rows in the tables and with them empty; the nine carries identical before the apply
and after the rollback. Its reviewer repeated the apply, the second apply, both checks, the
suite and the rollback on a throwaway of its own.

**What that rehearsal found.** The very first draft of the file (sha256 `ca451e27...`) had one
more clause in each INSERT policy: that `public.jwt_patient_id()` is null, copied from `0102`'s
doors. `authenticated` holds no EXECUTE on that function (only `patient` does), and a policy
runs as the caller. On the throwaway the job's first insert ended the server process (signal
11; the local image is known to do that where a healthy server answers `permission denied for
function`), and the stack recovered by itself. Either way no insert by the job could have
succeeded. The clause was removed: it was redundant, because the policies are TO
`authenticated` and a patient session's role is `patient`, which holds nothing on either table.
The pre-check has read since then, before any apply, that `authenticated` may execute each
helper the policies call. The catalogue could not see that defect; the suite that inserts as
the job did. **The same class of risk is why verdict 8 exists for W-6:** the new sub-select
makes the job's insert depend on the functions the `appointments` policies call.

### The rollback, as run

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
  Supabase CLI each file runs in its own implicit transaction; that path ran the 101 migrations
  under this one and not this one.
- **On top of `0104` and `0105`.** The throwaway was at `main`'s position, `0103`. The other
  two are not on `main` and were not under it. If either changes a policy of `appointments` or
  a function those policies call, verdict 8 and the suite's "SEES" arm must be read again on
  top of it. Carries that hash the whole catalogue will differ at that position, as they are
  meant to.
- **The promotion's commit,** for this revision. It was simulated on the first draft and
  undone. The cleanup script's new delete, the README's promoted row and the journal's real
  `when` are not written.
- **The seed's guarded block through `supabase db reset` with the tables present.** That
  happens for the first time on CI at the promotion.
- **Production's values.** Not read by this lane, ever: the default privileges (verdict 9 reads
  them at the sitting, before the apply), the helpers' grants, the `supautils.policy_grants`
  list, the row counts behind the two locks, and what an admin session with no user reads in
  production's `appointments`.
- **The locks under load.** Measured with no other session. No lock wait, no deadlock.
- **The application on these tables, on this revision's bytes.** The sweep's local branch was
  built and tested on the first draft's tables. It never sends `claim_kind`, and its release
  carries its claim's offset and channel, so the lane expects no change; its DB-gated suites
  were not run again.
- **The DB-gated suites of `apps/web`** were not run on the applied throwaway; no application
  file changed.

## What this does NOT do, and what is out of scope

- It does not move the sweep's code onto the tables.
- It does not send, and cannot.
- It builds no late rule, no purge, no retention and no watch.
- It builds no duplicate refusal for shadow rows or heartbeats (W-7: carded, due before the
  sweep's send mode is armed).
- It does not change `audit_log`, the ledger, `appointments`, or any existing policy, function
  or grant.

## The op carries no DELETE and no TRUNCATE statement

The migration has none. The rollback block above drops two tables this file created.

## Open questions

Strategy's rulings of 2026-10-13 closed the nine questions of the first draft. What is open now:

1. **A release tied to its claim's kind, offset and channel, by a generated column (strategy,
   to confirm).** Built, because the brief asked for it if cheap and provable, and it was both.
   It adds a sixteenth column that only the database writes. (a) As built. (b) Offset and
   channel only, no generated column: a release could then name a shadow row or another
   release, and the reader would go on checking the kind itself. Recommend (a).
2. **The seed's guarded revoke (the lead, to confirm).** Without it the suite that proves W-5
   is red on CI and on every lane from the promotion on. (a) As built: a guarded block at the
   end of `supabase/seed.sql`. (b) Narrow the seed's blanket grant to leave the two tables out.
   (c) Drop the blanket grant and grant `service_role` table by table in a migration, which the
   seed's own comment names as the durable path; a larger change with its own sitting.
   Recommend (a) now.
3. **Should `0104` or `0105` touch `appointments`' policies** (strategy knows their content;
   this document does not quote it): if so, the rehearsal on top of them reads verdict 8 and
   the "SEES" arm first.

## Review history

**The first draft (sha256 `a78b2c9d...`): one fresh reviewer, PASS, no blocker and no major,
five minor findings.** What became of each in this revision:

| Finding | Now |
|---|---|
| A surviving mutant: the heartbeat INSERT policy without its role list passed the suite, because the arm for a userless `reception` or `therapist` inserted into `reminder_claims` only | The arm inserts into both tables. Mutant 6 of the second sweep is that mutant: 1 red |
| The post-check did not pin the whole grantee list of the two tables | Verdict 21, and the pre-check's verdict 9 before the apply. Both shown a real failure |
| A release was tied to its claim by tenant and appointment only | The six-column key and `claim_kind`. Three mutants, each killed |
| `service_role` kept UPDATE, DELETE and TRUNCATE and bypasses RLS | Ruled W-5 and revoked |
| The job of one tenant could name another tenant's appointment, and the insert said whether an id exists | Ruled W-6 and closed |
| Stale wording (the file and this document called ruled points judgments, and the number provisional) | Rewritten here, in the file's header, in the schema's comment and in the README row |

**This revision: no reviewer has read it.** The changed bytes run against production, so the
review-loop rule of 2026-09-27 asks for a round on them before a sitting.
