# Apply receipt — migration 0074, the write doors and the therapist set

**VALIDATED - STRATEGY APPROVED - SR-35 - safe to run**

> Stamped by STRATEGY on 2026-09-02, replacing the executor's
> `NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN`
> (`docs/runbook-prod-migrations.md`). The executor never removes its own line;
> this replacement was instructed.
>
> EVIDENCE STRATEGY ACCEPTED: both arms on both parts - part A 15 red against a
> 0073 schema, part B 5 red with ALL SIX md5 equalities still green - the
> packages/db suite at 81 files / 1,132 tests exit 0, and part C dropped on a
> live measurement rather than on judgement, carded for 0075 with the audit.

**Migration:** `0074_confirm_writers_and_therapist_set.sql`
**Apply from commit:** `d357d0d009109b9ffee703eae6507e112e36fc3c` — the commit
that INTRODUCES the migration, not the branch head, which also carries this
document.
**Ruling:** SR-35, parts (a) and (b). **Part (c) is not in this migration** — see
§8.
**File sha256:** `d6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3`
— what `drizzle.__drizzle_migrations.hash` must read for id 74. Comparing it is
the only post-check that proves the file APPLIED is the file APPROVED.

---

## 1. What it changes

**Part A — three SECURITY DEFINER write doors** for `appointment_confirm_codes`,
each `VOLATILE`, owned by `postgres`, `EXECUTE` to `authenticated` only, with
explicit `REVOKE` from `PUBLIC`, `anon` and `patient`:

- `issue_confirm_code(text, uuid, uuid) -> boolean`
- `withdraw_confirm_code(text, uuid) -> boolean`
- `consume_confirm_code(text, uuid, timestamptz) -> boolean`

**Part B — `viewer_treated_patient_ids() -> uuid[]`**, nullary, `STABLE`,
`SECURITY DEFINER`, owner `postgres`, same grant profile; and the **therapist
branch** of `patients_select` becomes a membership test against it.

**No table, no column, no index, no data.** `appointments_rls`,
`patients_update`, `patients_delete` and the admin/reception branch 0073 wrote
are all untouched, and the post-checks prove it rather than assert it.

## 2. The one thing to read before approving

**Part A exists so the table can stay revoked from every application role.** The
alternative was a `GRANT INSERT/UPDATE/DELETE` to `authenticated`, which would
let **any** authenticated session write **any** row in **any** tenant. Each door
instead takes the tenant as an argument and proves the appointment belongs to it
in the same statement — the check RLS would have made if the app role could
reach the table at all.

**V5 is the post-check that proves it**, and it is the one to read first.

## 3. What was proved before this block was written

- **Both arms, both parts.** Against a 0073 schema: part A **15 red** (every
  door absent); part B **5 red** — the helper, its grants, its null-safety, the
  policy shape and the timing assertion — while **all six md5 equalities stayed
  GREEN**. That is why the second half is proven at all: the old and new
  predicates select the same rows by construction, so visibility alone can never
  catch a revert.
- **`packages/db`:** 81 files, **1,132 tests, exit 0**.
- **`apps/web` DB-gated:** 105 exit 0 — part A's integration proof, since
  `confirm-redeem.db.test.ts` now drives the three doors end to end.
- **`check-security-definer-owner.mjs`:** 20 functions, all owned by `postgres`.
- Repo gates: lint, typecheck, test, test:scripts, build — all 0.

## 4. The apply, as ONE paste

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
git fetch origin --prune && \
git cat-file -e "d357d0d009109b9ffee703eae6507e112e36fc3c^{commit}" && \
git checkout --detach d357d0d009109b9ffee703eae6507e112e36fc3c && \
git log -1 --oneline && \
git status -sb && \
shasum -a 256 /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/migrations/0074_confirm_writers_and_therapist_set.sql && \
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
   and p.proname in ('issue_confirm_code','withdraw_confirm_code','consume_confirm_code','viewer_treated_patient_ids')
 order by p.proname;
select p.proname,
       coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
       aclexplode(p.proacl) a
 where n.nspname = 'public'
   and p.proname in ('issue_confirm_code','withdraw_confirm_code','consume_confirm_code','viewer_treated_patient_ids')
   and a.privilege_type = 'EXECUTE'
 order by 1, 2;
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'appointment_confirm_codes'
   and grantee in ('anon','authenticated','patient','PUBLIC');
select polname,
       pg_get_expr(polqual, polrelid) ~ 'SELECT viewer_treated_patient_ids' as therapist_set,
       pg_get_expr(polqual, polrelid) ~ 'SELECT viewer_visible_patient_ids' as reception_set,
       pg_get_expr(polqual, polrelid) like '%patient_appt_treated_by_viewer%' as still_correlated,
       pg_get_expr(polqual, polrelid) like '%patient_appt_at_viewer_location%' as still_correlated_appt
  from pg_policy
 where polname in ('patients_select','patients_update','patients_delete','appointments_rls')
 order by polname;
SQL
```

## 5. What each post-check proves, in order

| | expected |
|---|---|
| **V1** owner check | **20** SECURITY DEFINER functions, all owned by `postgres` |
| **V2** journal rows | **73 → 74** |
| **V3** newest hashes | id **74** = `d6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3`; id 73 = `50a05c84…` (0073, unchanged) |
| **V4** the four functions | `issue_confirm_code` 3 args `v` `t` `postgres`; `withdraw_confirm_code` 2 args `v` `t` `postgres`; `consume_confirm_code` 3 args `v` `t` `postgres`; `viewer_treated_patient_ids` **0 args** `s` `t` `postgres` |
| **V5** EXECUTE grants | `authenticated` on all four; **`anon`, `patient` and `PUBLIC` ABSENT**. `postgres` and `service_role` present is expected |
| **V6** table grants | **ZERO ROWS**. The doors exist so the REVOKE can stay; a grant here makes them decoration |
| **V7** the four policies | exactly as the table below |

**V7 in full**, because a partially-specified table invites a partial reading:

| polname | therapist_set | reception_set | still_correlated | still_correlated_appt |
|---|---|---|---|---|
| `appointments_rls` | f | f | f | f |
| `patients_delete` | f | f | **t** | **t** |
| `patients_select` | **t** | **t** | **f** | **f** |
| `patients_update` | f | f | **t** | **t** |

**`still_correlated` = f on `patients_select` and t on the write policies is the
whole of part B's scope**, and it is the row to read: the correlated helper was
not dropped, it moved off the read path. A `t` on `patients_select` means part B
did not apply; an `f` on either write policy means it took work it was not given.

**V6 is what makes part A worth having.** Any row means a table grant survived
and the narrow doors are decoration.

## 6. Stop conditions

- The project ref is not `dfotoodqvmjhbdcxyaxf`, or the port is not `5432`.
- `git log -1` prints a sha other than `d357d0d0…`.
- Either `check-pending-migrations.mjs` call exits non-zero.
- The journal does not advance **73 → 74**, or id 74's hash is not `d6b9fc00…`.
- **V5 lists `anon`, `patient` or `PUBLIC` for any of the four.**
- **V6 returns ANY row.**
- Any V4 value disagrees, `viewer_treated_patient_ids` is not **0 args**, or any
  V7 cell disagrees in either direction.
- The owner check reports anything other than 20 / all `postgres`.

## 7. Rollback

Restores 0073's `patients_select`, then removes what 0074 added. The policy must
stop referencing the function before the function is dropped.

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
          OR id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.patient_appt_treated_by_viewer(id)
      )
    )
  );
DROP FUNCTION public.viewer_treated_patient_ids();
DROP FUNCTION public.consume_confirm_code(text, uuid, timestamptz);
DROP FUNCTION public.withdraw_confirm_code(text, uuid);
DROP FUNCTION public.issue_confirm_code(text, uuid, uuid);
```

**Nothing here is destructive.** No row is read, written or deleted; four
functions are created and one policy is replaced by an equivalent one.

**One consequence of rolling back part A**, stated so it is not discovered
later: with the doors gone, the application cannot write
`appointment_confirm_codes` at all, so the 24h confirm link stops minting codes.
The reminder still sends, without the line.

## 8. Why part (c) is not here

SR-35 named three parts and said any part that cannot be proven is dropped and
carded, never fudged. **Part (c) can be proven. It was dropped because a
measurement says it cannot move the surfaces the owner is waiting on.**

A mechanical audit of the **live** schema, using the backward-looking detector
PERF-05's own correction requires, finds **20 policies / 23 predicate sites**
carrying an unwrapped call to one of the four `public.*` nullary helpers, or
**25 / 30** counting `auth.uid()`. The card's "21" sits between the two because
the helper set was never written down; **0075 must say which set it fixes.**

The affected tables are `action_token_consumptions`, `consultations`,
`guest_booking_requests`, `patient_audit_log`, `patient_followup_contacts`,
`patient_followup_postponements`, `patient_terms_acceptances`,
`staff_notifications`, `quick_notes`, and the `patients` **write** policies.

The five pages the owner reported as slow read `appointments`, `patients`,
`invoices`, `users`, `services`, `locations` and `packs`. **The intersection is
empty** — grepping both route trees and both lib modules for every affected
table returns zero hits. Part (c) is therefore carded for 0075 with that live
list, which is more than it had before.

## 9. After the apply

Paste V1–V7 back. **Only then does the PR merge**, and migration authorship
freezes again per SR-26.

## 10. Teardown. Run this, then close the window.

```
unset DATABASE_URL DATABASE_URL_DIRECT
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach origin/main
git log -1 --oneline
```
