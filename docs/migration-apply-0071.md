# Apply receipt — migration 0071, the nullary RLS helper wrap

**VALIDATED - STRATEGY APPROVED - SR-22. APPLIED TO PRODUCTION 2026-09-02.**

> Stamped by STRATEGY on 2026-09-02, replacing the executor's
> `NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN`
> (`docs/runbook-prod-migrations.md`, "EVERY APPLY BLOCK IS UNVALIDATED UNTIL
> STRATEGY SAYS OTHERWISE"). The executor never removes its own line; this
> replacement was instructed.
>
> EVIDENCE STRATEGY ACCEPTED: negative arm RED against the pre-0071 schema
> (2 failed / 13 passed), positive arm 15/15, set equality by ORDERED ID LIST
> plus md5 for five principals on both tables, anti-vacuity checks present, the
> scope guard asserting the three correlated helpers remain unwrapped, and the
> full DB-gated suite at 1,057 tests exit 0 both locally and in CI.

**Migration:** `0071_wrap_nullary_viewer_helper.sql`
**Branch:** `perf/PERF-06-0071-wrap-nullary-helper`
**Apply from commit:** `e2b3c90c6339dcbd04de0d07cb3279a0361812c0` - the commit that
INTRODUCES the migration, NOT the branch head.
**Why that commit and not the branch head:** the head also carries this document,
and a commit cannot contain a document that quotes its own sha. The apply needs a
tree that CONTAINS `0071_wrap_nullary_viewer_helper.sql`; this is the first one
that does, and nothing above it touches the migration.
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

### 4a. The apply, as ONE paste

Every step is chained with `&&`, so nothing downstream runs if anything upstream
fails. That is deliberate: the two incidents this runbook records (0049 and 0058)
both had a human step that was supposed to be noticed and was not.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
git fetch origin --prune && \
git cat-file -e "e2b3c90c6339dcbd04de0d07cb3279a0361812c0^{commit}" && \
git checkout --detach e2b3c90c6339dcbd04de0d07cb3279a0361812c0 && \
git log -1 --oneline && \
git status -sb && \
ls -l /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/migrations/0071_wrap_nullary_viewer_helper.sql && \
set -o allexport && \
source /Users/ivan/osteojp-secrets/new-prod.env && \
set +o allexport && \
node -e 'const u=new URL(process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL); const ref=u.username.split(".").pop(); console.log("host:       " + u.hostname); console.log("port:       " + u.port); console.log("project ref:" + " " + ref); if (ref !== "dfotoodqvmjhbdcxyaxf") { console.error("REFUSING: project ref is not production"); process.exit(2); } if (u.port !== "5432") { console.error("REFUSING: port is not the 5432 session pooler"); process.exit(2); } console.log("target verified"); ' && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 1 && \
pnpm db:migrate && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 0
```

**What each link is for, in order:**

- `git cat-file -e` proves the sha exists before anything checks it out. The rev
  is QUOTED because `^` and `{` are shell metacharacters in zsh.
- `git checkout --detach <SHA>` takes the SHA, **not** the branch. A plain
  `git checkout <branch>` is rejected in this worktree when the branch is checked
  out elsewhere, and the rejection is easy to miss: the tree then stays on `main`,
  `db:migrate` finds nothing pending, and prints success. That is 0049.
- `ls -l` proves the migration file is in the tree that was just checked out.
- `set -o allexport`, **never `set -a`**, and no tilde paths.
- The `node -e` **prints host, port and project ref before anything writes, and
  then REFUSES mechanically** if the ref is not `dfotoodqvmjhbdcxyaxf` or the port
  is not `5432`. It is positive identification, not absence of a warning: an
  unrecognised target exits 2 rather than continuing. It never prints the
  connection string or the password. Port 6543 is the transaction pooler and
  `drizzle-kit migrate` holds a session-level advisory lock it does not support.
- `check-pending-migrations.mjs 1` proves exactly one migration is pending. **The
  `&&` is what makes this binding**: `drizzle-kit migrate` prints
  `migrations applied successfully` when it applies nothing, so its own output is
  never evidence that the schema changed.
- `pnpm db:migrate` is the root script for `drizzle-kit migrate` in
  `packages/db`, which is the runbook's single sanctioned path.
- `check-pending-migrations.mjs 0` proves nothing is left pending.

**Paste the whole output.** If it stops early, paste what you have and stop; the
last line printed says which link refused.

**THE GUARD WAS TESTED IN ALL FOUR ARMS before this block was stamped**, with
fabricated connection strings on a local shell, never against production:

| target | result |
|---|---|
| a different project ref, port 5432 | `REFUSING: project ref is not production`, exit 2 |
| `dfotoodqvmjhbdcxyaxf`, port **6543** | `REFUSING: port is not the 5432 session pooler`, exit 2 |
| `dfotoodqvmjhbdcxyaxf`, port 5432 | `target verified`, exit 0 |
| neither variable set | throws, exit 1 - the chain stops rather than continuing |

The block also parses clean under both `zsh -n` and `bash -n`, which execute
nothing. A paste-ready block that does not parse costs the owner his window.

## 5. Post-checks - the apply is not proven until these are pasted

Run as one paste. `psql` never prints the connection string.

```
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
-- V1. The journal advanced by exactly one, and to this tag. 70 rows before, 71 after.
select count(*) as journal_rows from drizzle.__drizzle_migrations;
select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;

-- V2. THE PROPERTY ITSELF, read from the database rather than inferred from the
--     journal. Both rows must be TRUE.
select polname,
       pg_get_expr(polqual, polrelid) like '%SELECT viewer_has_location_assignment%'
         as nullary_is_wrapped
  from pg_policy
 where polname in ('patients_select', 'appointments_rls')
 order by polname;

-- V3. The WITH CHECK half of appointments_rls too. Must be TRUE.
select pg_get_expr(polwithcheck, polrelid) like '%SELECT viewer_has_location_assignment%'
         as check_half_wrapped
  from pg_policy where polname = 'appointments_rls';

-- V4. THE SCOPE GUARD. The three CORRELATED helpers must still be UNWRAPPED.
--     All three must be FALSE. A TRUE means the migration over-reached and one
--     row's answer is now applied to every row.
select pg_get_expr(polqual, polrelid) like '%SELECT patient_appt_at_viewer_location%' as a,
       pg_get_expr(polqual, polrelid) like '%SELECT location_in_viewer_scope%'        as b,
       pg_get_expr(polqual, polrelid) like '%SELECT patient_appt_treated_by_viewer%'  as c
  from pg_policy where polname = 'patients_select';

-- V5. RLS still ENABLED on both tables and both policies still present.
select relname, relrowsecurity from pg_class
 where relname in ('patients', 'appointments') order by relname;
select tablename, policyname, cmd, roles from pg_policies
 where policyname in ('patients_select', 'appointments_rls')
 order by policyname;
SQL
```

`like` rather than a regex, deliberately: a wrapped call renders as
`( SELECT viewer_has_location_assignment() AS viewer_has_location_assignment)`
and an unwrapped one as a bare `viewer_has_location_assignment()`, so a literal
substring is sufficient and has no escaping semantics to get wrong.

**If `psql` is not installed**, the same SQL pastes into the Supabase SQL editor.
Both are sanctioned reads for the owner by the runbook.

**THE POST-CHECKS WERE RUN IN BOTH DIRECTIONS BEFORE THIS BLOCK WAS STAMPED**, on
a disposable local Postgres carrying these two policies, by applying the actual
`0071_wrap_nullary_viewer_helper.sql` between the two runs:

| | pre-0071 | post-0071 |
|---|---|---|
| V2 `nullary_is_wrapped`, both policies | `f`, `f` | `t`, `t` |
| V3 `check_half_wrapped` | `f` | `t` |
| V4 the three correlated helpers | `f`, `f`, `f` | `f`, `f`, `f` |
| V5 `relrowsecurity`, both tables | `t`, `t` | `t`, `t` |

V4 not moving is the point of V4: the migration wrapped what it was scoped to
wrap and nothing else.

**V2, V3 and V5 prove the apply happened. V4 proves it did nothing else.** A
journal row alone is not evidence: it records that a file was applied, not that
the policy now reads differently.

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

---

## 10. THE RECEIPT. Applied 2026-09-02. No stop condition fired.

| | |
|---|---|
| **Applied from sha** | `e2b3c90c6339dcbd04de0d07cb3279a0361812c0` |
| **Migration blob** | `075cb46fe47d6ea605f410ba6cc5a4eda143817a` |
| **File sha256** | `00abb8c54bde141b3163a22759ec618b97dff434a9c7cc671021ea2d8c99f52f` |
| **Target** | `dfotoodqvmjhbdcxyaxf`, `aws-0-eu-central-1.pooler.supabase.com:5432` |
| **Journal** | 70 rows -> **71**. New row id 71, `when` 1787300600000 |

### 10.1 THE HASH IS THE TIE, AND IT IS BETTER THAN THE SHA

`drizzle.__drizzle_migrations` row 71 records
`hash = 00abb8c54bde141b3163a22759ec618b97dff434a9c7cc671021ea2d8c99f52f`, and
that is **byte-for-byte the sha256 of
`packages/db/migrations/0071_wrap_nullary_viewer_helper.sql` as committed**.

That matters because the pinned sha `e2b3c90c` is **orphaned by the squash
merge** and will not exist on `main`. The hash will. So the thing that ties this
receipt to production is not a commit id that stops resolving, it is the content
of the file itself, recorded independently by production and reproducible from
`main` with one `shasum -a 256`.

### 10.2 Every check, against what was expected

| check | expected | observed |
|---|---|---|
| checkout sha | `e2b3c90c...` | `HEAD is now at e2b3c90c` |
| worktree state | detached | `## HEAD (no branch)` |
| migration file present | yes | 6,273 bytes |
| project ref | `dfotoodqvmjhbdcxyaxf` | matched, `target verified` |
| port | `5432` | `5432` |
| pre-check pending | exactly 1 | `pending: 1`, the 0071 tag |
| post-check pending | exactly 0 | `pending: 0` |
| `journal_rows` | 71 | **71** |
| `nullary_is_wrapped` x2 | `t`, `t` | **`t`, `t`** |
| `check_half_wrapped` | `t` | **`t`** |
| `correlated_{a,b,c}_wrapped` | `f`, `f`, `f` | **`f`, `f`, `f`** |
| `relrowsecurity` x2 | `t`, `t` | **`t`, `t`** |
| policies + roles | `ALL`/`SELECT`, `{authenticated}` | matched |

### 10.3 The two NOTICEs are not findings

`schema "drizzle" already exists, skipping` and
`relation "__drizzle_migrations" already exists, skipping` are drizzle's own
bookkeeping DDL running `IF NOT EXISTS` against a database that has been migrated
seventy times before. They appear on every apply and say nothing about 0071.

### 10.4 What the `f, f, f` row proves, and it is the half that is easy to skip

`correlated_a/b/c_wrapped` all FALSE is not a null result. It is the assertion
that this migration wrapped **only** the nullary helper and left
`patient_appt_at_viewer_location(id)`, `location_in_viewer_scope(location_id)`
and `patient_appt_treated_by_viewer(id)` evaluating per row, where they must stay.
Wrapping one of those would have made the whole page faster still and would have
applied one row's visibility answer to every row. A receipt that only checked the
`t`s would have passed that.

### 10.5 The region, noted because a fabricated fixture said otherwise

The target verification printed `aws-0-eu-central-1`. The four-arm guard test in
§4a used `aws-0-eu-west-2` in its **fabricated** strings; the guard matches on the
project ref and the port and never on the region, so nothing depended on it. Noted
so nobody reads the earlier fixture as a claim about where production lives.
