# Apply receipt — migration 0073, the visible-patient set

**VALIDATED BY OWNER OVERRIDE - NO STRATEGY REVIEW WAS DONE - SAFE TO RUN**

> **STAMPED ON THE OWNER'S EXPLICIT AUTHORISATION, 2026-09-02**, in his own
> words: *"owner override, run 0073 unstamped, I authorize you to make this
> apply as an exception"*. Recorded as **SR-34**. The executor's
> `NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN` line stood here until
> that authorisation arrived and is quoted rather than deleted, because a
> waived review and a passed review must never read the same afterwards.
>
> **WHAT THIS LINE DOES NOT SAY.** It does not say strategy reviewed this block.
> Strategy never saw it. It says the owner, who owns the process §4.9 describes,
> waived the review for this ONE block and accepted what the waiver costs: the
> review that catches a defective BLOCK is not the review that reads the
> MIGRATION, and three blocks have been defective while their migrations were
> fine - 0049 (a worktree path taken from prose), 0058 (no pre-check, so a
> backwards timestamp produced success over a no-op) and 0060 (could not prove a
> no-op migration had run at all).
>
> **WHAT WAS PUT IN THE REVIEW'S PLACE**, so the waiver is not a blank space:
> every SQL statement in §4 was executed verbatim against a local database
> carrying 0073 and returned exactly the §5 table, cell for cell; the pre-flight
> ref/port guard is 0072's, unchanged, and refuses on anything but
> `dfotoodqvmjhbdcxyaxf` at `:5432`; the apply-from sha is pinned and
> `git cat-file -e` proves it exists before the checkout; the migration file's
> sha256 is pinned so the journal row proves file IDENTITY and not merely that
> something ran; and CI on #1111 is green on every check, with the DB-gated job
> having run this migration's own 20-test suite against a real seeded database.
>
> **The apply itself stays owner-executed.** Standing rules 1, 2 and 3 are not
> waived by this and were not asked to be: no terminal points a command at
> production, and no production credential enters a terminal's context.

**Migration:** `0073_viewer_visible_patient_set.sql`
**Apply from commit:** `b101971eb83c158b9ac20170bd1374ee4a97ffc2` — the commit
that INTRODUCES the migration, not the branch head. The head also carries this
document, and a commit cannot contain a document that quotes its own sha.
**PR:** #1111. **Ruling:** SR-33.
**File sha256:** `50a05c84108ea7cd4d0aa939b09332fcd59a748b83790bfc683c746906d842e4`
— this is what `drizzle.__drizzle_migrations.hash` must read for id 73 after the
apply, and comparing it is the only post-check that proves the file APPLIED is
the file APPROVED.

---

## 1. What it changes

- **`public.viewer_location_ids() -> uuid[]`** — new. Nullary, `STABLE`,
  `SECURITY DEFINER`, owner `postgres`. The viewer's own locations, from
  `auth.uid()` + `jwt_tenant_id()` + `staff_locations`. Empty array, never NULL.
- **`public.viewer_visible_patient_ids() -> uuid[]`** — new. Same properties.
  The patients those locations reach: either appointment participant, or
  `primary_location_id`. Empty array, never NULL.
- **`patients_select`** — the **admin/reception branch only**. Two correlated
  calls become one membership test:

  ```
  -  OR patient_appt_at_viewer_location(id)
  -  OR (primary_location_id IS NOT NULL AND location_in_viewer_scope(primary_location_id))
  +  OR id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
  ```

- **REVOKE** on both functions from `PUBLIC`, `anon`, `patient`. **GRANT
  EXECUTE** to `authenticated` only.
- Two `ALTER FUNCTION ... OWNER TO postgres` pins, in this migration, per 0060.

**No table, no column, no index, no data. No other policy.** `appointments_rls`,
`patients_update` and `patients_delete` are not touched, and the post-checks
prove it rather than assert it.

## 2. The one thing to read before approving

**This is a READ policy on the busiest table in the schema, and the defensible
claim is not "it is faster" but "it selects the same rows".** It does, and by
ordered-id md5 rather than by count, for six principals including an unassigned
admin and a cross-tenant one. The equivalence is also checkable by eye:
`viewer_visible_patient_ids()` is the union of exactly the three arms the old
branch tested one row at a time — `patient_id`, `patient_2_id`,
`primary_location_id` — over the same tenant and the same `staff_locations`
rows.

**The `NOT viewer_has_location_assignment()` arm is UNCHANGED.** The no-lockout
case (an admin with no assignment sees the whole tenant) is decided before the
set is ever consulted, and V5 proves the arm is still there.

## 3. What was proved before this block was written

- **Negative arm, run BOTH ways.** Against a 0072 schema (`0073` held out of the
  mirror, `supabase db reset`): **9 red — and all six visibility tests GREEN**,
  which is the point, because the two predicates select the same rows. Against
  0073 with the policy alone reverted: **exactly 2 red**, the policy-shape
  assertion and the timing assertion. A revert is caught by the timing arm or by
  nothing.
- **`packages/db` DB-gated suite:** 79 files, **1,100 tests, exit 0**.
- **`apps/web` DB-gated:** 95 exit 0, including the **PERF-07 BYPASSRLS pin** on
  `patientLocationScope` — 5/5, still holding.
- **`apps/api` DB-gated:** 43 exit 0, with the workflow's own
  `PATIENT_SESSION_SECRET` fixture.
- **`check-security-definer-owner.mjs`:** 16 functions, all owned by `postgres`.
- Repo gates: lint, typecheck, test, test:scripts, build, journal drift — all 0.
- **Measured independently of the PERF-08 shim**, one local connection, no
  pooler, 8,400 patients / 42,000 appointments, A and B in ONE transaction:
  list 358.7 → 66.2 ms, search 232.3 → 74.7 ms, ordered-id md5 identical
  (`d9f1598a3cc0d9bbe68d249ec1223b2e`, 7,330 rows both sides).

## 4. The apply, as ONE paste

Chained with `&&`, so nothing downstream runs if anything upstream fails.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
git fetch origin --prune && \
git cat-file -e "b101971eb83c158b9ac20170bd1374ee4a97ffc2^{commit}" && \
git checkout --detach b101971eb83c158b9ac20170bd1374ee4a97ffc2 && \
git log -1 --oneline && \
git status -sb && \
shasum -a 256 /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/migrations/0073_viewer_visible_patient_set.sql && \
set -o allexport && \
source /Users/ivan/osteojp-secrets/new-prod.env && \
set +o allexport && \
node -e 'const u=new URL(process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL); const ref=u.username.split(".").pop(); console.log("host:        " + u.hostname); console.log("port:        " + u.port); console.log("project ref: " + ref); if (ref !== "dfotoodqvmjhbdcxyaxf") { console.error("REFUSING: project ref is not production"); process.exit(2); } if (u.port !== "5432") { console.error("REFUSING: port is not the 5432 session pooler"); process.exit(2); } console.log("target verified");' && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 1 && \
pnpm db:migrate && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 0 && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-security-definer-owner.mjs && \
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
select count(*) as journal_rows from drizzle.__drizzle_migrations;
select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;
select p.proname, p.pronargs, p.provolatile, p.prosecdef, r.rolname as owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r     on r.oid = p.proowner
 where n.nspname = 'public'
   and p.proname in ('viewer_location_ids', 'viewer_visible_patient_ids')
 order by p.proname;
select p.proname,
       coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee,
       a.privilege_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
       aclexplode(p.proacl) a
 where n.nspname = 'public'
   and p.proname in ('viewer_location_ids', 'viewer_visible_patient_ids')
 order by 1, 2;
select polname,
       pg_get_expr(polqual, polrelid) ~ 'SELECT viewer_visible_patient_ids' as tests_the_set,
       pg_get_expr(polqual, polrelid) like '%patient_appt_at_viewer_location%' as still_correlated_appt,
       pg_get_expr(polqual, polrelid) like '%location_in_viewer_scope%'        as still_correlated_loc,
       pg_get_expr(polqual, polrelid) ~ 'SELECT viewer_has_location_assignment' as nullary_still_wrapped
  from pg_policy
 where polname in ('patients_select', 'patients_update', 'patients_delete', 'appointments_rls')
 order by polname;
select count(*) as patients_select_policies from pg_policy where polname = 'patients_select';
SQL
```

## 5. What each post-check proves, in order

Numbered in the order the block prints them.

| | expected |
|---|---|
| **V1** owner check | **16 SECURITY DEFINER functions, all owned by `postgres`** |
| **V2** journal rows | **72 → 73** |
| **V3** newest hashes | id **73** = `50a05c84108ea7cd4d0aa939b09332fcd59a748b83790bfc683c746906d842e4`, id 72 = `8ad1aec833777965c84042ee0c34ec8238a94e2b06ab87feda1fdd9787c4373e` (0072, unchanged) |
| **V4** both functions | `pronargs` **0**, `provolatile` **`s`**, `prosecdef` **`t`**, owner **`postgres`** — for BOTH |
| **V5** EXECUTE grants | `authenticated` present on both; **`anon`, `patient` and `PUBLIC` ABSENT**. `postgres` and `service_role` present is expected and fine |
| **V6** the four policies | every cell, exactly as below |
| **V7** policy count | exactly **1** `patients_select` |

**V6 in full**, because a partially-specified table invites a partial reading:

| polname | tests_the_set | still_correlated_appt | still_correlated_loc | nullary_still_wrapped |
|---|---|---|---|---|
| `appointments_rls` | f | f | **t** | **t** |
| `patients_delete` | f | **t** | **t** | f |
| `patients_select` | **t** | f | f | **t** |
| `patients_update` | f | **t** | **t** | f |

The two `f`s in the `nullary_still_wrapped` column are CORRECT and are not this
migration's business: `patients_update` and `patients_delete` carry the
UNWRAPPED nullary call that PERF-05 counts among the remaining 21, which SR-27
releases as one batch for 0074. A `t` there would mean 0073 took work it was not
given.

**V3 is the one to read first, and it is not V2.** V2 records that *a* file was
applied; only the hash proves it was *this* file. **V6 is the one that proves
the scope**: the same query that shows the two correlated calls GONE from
`patients_select` shows them STILL PRESENT on the write path and in
`appointments_rls`, so "nothing else moved" is a reading rather than a promise.

**V4 exists because 0072's own post-check caught this.** Supabase's
`ALTER DEFAULT PRIVILEGES` grants EXECUTE on every new function to `anon`, and
`REVOKE ... FROM PUBLIC` does not touch a privilege held by a NAMED role. A
function that answers "which patients may this viewer see" must not be callable
by an unauthenticated PostgREST request.

## 6. Stop conditions

- The project ref is not `dfotoodqvmjhbdcxyaxf`, or the port is not `5432`.
- `git log -1` prints a sha other than `b101971eb83c158b9ac20170bd1374ee4a97ffc2`.
- Either `check-pending-migrations.mjs` call exits non-zero.
- The journal does not advance from **72 rows to 73**, or id 73's hash is not
  `50a05c84…`.
- **V5 lists `anon`, `patient` or `PUBLIC` for either function.**
- Any V4 value disagrees for either function.
- **Any V6 cell disagrees** — in either direction. A `t` where an `f` is
  expected is scope creep; an `f` where a `t` is expected is a policy that lost
  a branch.
- `check-security-definer-owner.mjs` reports anything other than 16 / all
  `postgres`.

## 7. Rollback

Restores 0071's `patients_select` exactly, then removes the two functions. Safe
in either order only as written: the policy must stop referencing the function
before the function is dropped.

```
DROP POLICY "patients_select" ON public.patients;
CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR public.patient_appt_at_viewer_location(id)
          OR (primary_location_id IS NOT NULL AND public.location_in_viewer_scope(primary_location_id))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.patient_appt_treated_by_viewer(id)
      )
    )
  );
DROP FUNCTION public.viewer_visible_patient_ids();
DROP FUNCTION public.viewer_location_ids();
```

**Nothing here is destructive.** No row is read, written or deleted; two
functions are created and one policy is replaced by an equivalent one. The
rollback restores the previous predicate byte for byte.

## 8. After the apply

Paste V1–V7 back. **Only then does #1111 merge**, and migration authorship
freezes again per SR-26.

**The acceptance evidence is NOT the post-check.** The card closes on reception's
own `/patients` on the deployed app — the screen whose 10-20 second waits opened
PERF-08. The post-checks prove the schema; the sitting proves the clinic.

**Expect one thing to get slower**, and it is on the card as a known trade:
opening a SINGLE patient goes 13 → 38 ms at 10 concurrent, because a one-row
read now pays the fixed cost of computing the set.

## 9. Teardown. Run this, then close the window.

```
unset DATABASE_URL DATABASE_URL_DIRECT
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach origin/main
git log -1 --oneline
```

> The 0072 teardown was run: the prod-apply worktree is detached at `c937192c`
> as of this drafting, not left on the 0072 branch head. Keeping §9 in the habit
> is what makes the next census read clean.
