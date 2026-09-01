# Apply receipt — migration 0071, the nullary RLS helper wrap

**NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN**

> That line is the first line of this document by rule (`docs/runbook-prod-migrations.md`,
> "EVERY APPLY BLOCK IS UNVALIDATED UNTIL STRATEGY SAYS OTHERWISE"). Strategy
> replaces it with `VALIDATED` before this reaches Ivan. The executor never
> removes its own.

**Migration:** `0071_wrap_nullary_viewer_helper.sql`
**Branch:** `perf/PERF-06-0071-wrap-nullary-helper`
**Expected HEAD sha:** `e2b3c90c6339dcbd04de0d07cb3279a0361812c0`
**PR:** #1101
**Ruling:** SR-22 — released, named and bounded to two policies.

---

## 1. What this migration does

Wraps `public.viewer_has_location_assignment()` in `(select ...)` inside
`patients_select` and `appointments_rls`. **One token in each of two policies.
Nothing else.**

No table, no column, no index, no grant, no function body, no other policy.

## 2. Why it is safe, and why the calls beside it are not

`viewer_has_location_assignment()` takes **no arguments**. Wrapping a call in
`(select ...)` makes Postgres evaluate it once per statement instead of once per
row; for a nullary `STABLE` function that is semantically identical, because it
has no per-row input and its answer cannot vary by row.

The three helpers beside it — `patient_appt_at_viewer_location(id)`,
`location_in_viewer_scope(location_id)`, `patient_appt_treated_by_viewer(id)` —
take **the row's own column**. Wrapping one would freeze a single row's answer and
apply it to every row: a security defect dressed as an optimisation. They are
untouched, and `rls-nullary-wrap.db.test.ts` asserts they stay unwrapped.

## 3. What was proved before this block was written

- **Negative arm.** Against the pre-0071 schema the suite is RED (2 failed / 13
  passed); with 0071 applied it is 15/15.
- **Set equality, not counts.** For five principals, on both `patients` and
  `appointments`, the ORDERED id list under the shipped policy is compared against
  the pre-0071 UNWRAPPED predicate evaluated inline on the owner connection — a
  real A/B in one database — plus md5 of each list.
- **Anti-vacuity.** The lists must be non-empty and must differ between roles, so
  an all-empty database cannot satisfy the file.
- **The whole DB-gated suite:** 77 files, 1,057 tests, exit 0, against a local
  Supabase stack with all 71 migrations applied by `supabase db reset`.

## 4. The apply

### 4a. Pre-flight. Its own paste, BEFORE any credential is sourced.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git cat-file -e e2b3c90c6339dcbd04de0d07cb3279a0361812c0^{commit} && echo "sha exists"
git checkout --detach e2b3c90c6339dcbd04de0d07cb3279a0361812c0
git log -1 --oneline
git status -sb
ls -l packages/db/migrations/0071_wrap_nullary_viewer_helper.sql
```

**Paste that output before going on.** `git log -1` must print
`e2b3c90c6339dcbd04de0d07cb3279a0361812c0`, and the `ls` must find the file. If either is wrong, STOP:
every line below would run against a tree that does not contain this migration,
which is exactly how 0049 produced a silent no-op.

**`git checkout --detach <SHA>` takes the SHA, not the branch.** A plain
`git checkout <branch>` is rejected in that worktree when the branch is checked
out elsewhere, and the rejection is easy to miss — the tree then stays on `main`,
`db:migrate` finds nothing pending, and prints success.

### 4b. The apply.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport

# TARGET REF VERIFICATION, BEFORE ANYTHING WRITES. Prints the host and the
# project ref only — never the connection string, never the password.
node -e 'const u=new URL(process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL); console.log("host:", u.hostname); console.log("port:", u.port); console.log("project ref:", u.username.split(".").pop());'

# MANDATORY PRE-CHECK. Exactly one migration must be pending.
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1

pnpm db:migrate

# MANDATORY POST-CHECK. Nothing may be pending afterwards.
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
```

**`set -o allexport`, never `set -a`.** No tilde paths.

**The target ref must read `dfotoodqvmjhbdcxyaxf` and the port must be `5432`.**
Port 6543 is the transaction pooler and `drizzle-kit migrate` holds a
session-level advisory lock it does not support. **If the ref is anything else,
STOP and report before running another line.**

**STOP IF `check-pending-migrations.mjs 1` FAILS AND DO NOT RUN `db:migrate`.**
`drizzle-kit migrate` prints `migrations applied successfully` when it applies
nothing, so its output is not evidence that the schema changed. That has cost
two applies already (0049 and 0058).

## 5. Post-checks — the apply is not proven until these are pasted

```sql
-- V1. The journal advanced by exactly one, and to this tag. 70 rows before, 71 after.
select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;
select count(*) as journal_rows from drizzle.__drizzle_migrations;

-- V2. THE PROPERTY ITSELF, read from the database rather than inferred from the
--     journal. Both must be TRUE.
select polname,
       pg_get_expr(polqual, polrelid) ~* 'SELECT\s+viewer_has_location_assignment'
         as nullary_is_wrapped
  from pg_policy
 where polname in ('patients_select', 'appointments_rls')
 order by polname;

-- V3. The WITH CHECK half of appointments_rls too. Must be TRUE.
select pg_get_expr(polwithcheck, polrelid) ~* 'SELECT\s+viewer_has_location_assignment'
         as check_half_wrapped
  from pg_policy where polname = 'appointments_rls';

-- V4. THE SCOPE GUARD. The three CORRELATED helpers must still be UNWRAPPED.
--     All three must be FALSE. A TRUE here means the migration over-reached and
--     one row's answer is now being applied to every row.
select pg_get_expr(polqual, polrelid) ~* 'SELECT\s+patient_appt_at_viewer_location' as a,
       pg_get_expr(polqual, polrelid) ~* 'SELECT\s+location_in_viewer_scope'        as b,
       pg_get_expr(polqual, polrelid) ~* 'SELECT\s+patient_appt_treated_by_viewer'  as c
  from pg_policy where polname = 'patients_select';

-- V5. RLS is still ENABLED on both tables, and the policies still exist with the
--     same commands. Two rows, both relrowsecurity = true.
select relname, relrowsecurity from pg_class
 where relname in ('patients', 'appointments');
select tablename, policyname, cmd, roles from pg_policies
 where policyname in ('patients_select', 'appointments_rls')
 order by policyname;
```

**V2, V3 and V5 are the proof the apply happened. V4 is the proof it did not do
anything else.** A journal row alone is not evidence: it says a file was recorded,
not that the policy in the database now reads differently.

## 6. Stop conditions

- **The project ref is not `dfotoodqvmjhbdcxyaxf`, or the port is not 5432.**
- **`git log -1` prints a sha other than `e2b3c90c6339dcbd04de0d07cb3279a0361812c0`,** or `git cat-file`
  errors. The checkout did not take.
- **`check-pending-migrations.mjs 1` exits non-zero.** Do not run `db:migrate`.
- **`check-pending-migrations.mjs 0` exits non-zero after the apply.** Something
  is still pending, which means more than this migration is in the tree.
- **Any of V2, V3 is FALSE**, or **any of V4 is TRUE**, or **either
  `relrowsecurity` is false.**
- The journal does not advance from **70 rows to 71**.

## 7. Rollback

Restoring the previous definition is one `DROP POLICY` + `CREATE POLICY` per
policy, with the bodies of `0047` and `0049` verbatim. **Nothing about this
migration is destructive:** no data is written, read or deleted, and no object is
dropped except the two policies it immediately recreates.

**The window between the DROP and the CREATE is inside one transaction**, because
drizzle wraps each migration file, so there is no instant at which either table is
readable without a policy.

## 8. After the apply

Paste the V1–V5 output back. **Only then does #1101 merge**, and migration
authorship freezes again on that merge per SR-22.

## 9. Teardown. Run this, then close the window.

```
unset DATABASE_URL DATABASE_URL_DIRECT
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach origin/main
git log -1 --oneline
```
