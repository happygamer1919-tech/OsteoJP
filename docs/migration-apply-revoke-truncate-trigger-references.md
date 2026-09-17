# Apply doc - revoke TRUNCATE, TRIGGER, REFERENCES from `authenticated`

**Status: DRAFT. NOT NUMBERED. NOT VALIDATED. DO NOT RUN.**

The migration lives at
`packages/db/migrations-pending/NEXT-AFTER-0089_revoke_truncate_trigger_references.sql`
and carries no number, so `drizzle-kit migrate` cannot see it by construction.

**It is deliberately last in the queue.** Two pending migrations are ahead of it
and both are about delivering a feature, while this one only removes privileges
nobody uses:

1. CARE-01's care-team migration (PR #1374),
2. NESA-NAMES (PR #1390),
3. this one.

Promoting it out of that order buys nothing and delays two features.

---

## 1. What it does

Two statements.

| # | Statement | Effect |
|---|---|---|
| 1 | `DO` loop over every table in `public` | `REVOKE TRUNCATE, TRIGGER, REFERENCES ... FROM authenticated` |
| 2 | `ALTER DEFAULT PRIVILEGES IN SCHEMA public` | stops the next `CREATE TABLE` re-granting those three |

No policy, function, column or row is touched. No backfill. No data change.

## 2. Why

`authenticated` is not a theoretical role in this product. Every tenant-scoped
staff read and write runs as it: `packages/db/src/client.ts:152` issues
`set local role authenticated` inside `withTenantContext`, and that role drop is
what makes RLS apply at all, because the connecting role is the owner and has
BYPASSRLS. So a privilege held by `authenticated` is a privilege held by the
application on every request.

It holds three it has never used. They were never granted by this repository.
They come from Supabase's `ALTER DEFAULT PRIVILEGES`, which grants ALL on new
tables to `authenticated`, and ALL includes these three.
`0021_grants_hardening.sql:57` closed exactly this door for `anon`
(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon`) and
has no counterpart for `authenticated`. `0080_reschedule_requests.sql:204-215`
records the same mechanism biting once already, on DELETE.

## 3. What breaks: nothing, and here is the evidence rather than the claim

- **TRUNCATE is not used anywhere.** The token does not appear as SQL in
  `apps/`, `packages/`, `scripts/` or `supabase/`. Every `truncate` in the tree
  is a Tailwind class on a `<span>` or prose in a comment. Deletion here is
  DELETE under RLS, a cascade, or a soft delete.
- **TRIGGER and REFERENCES are DDL privileges.** All DDL in this product is in
  migrations, which run as the owner. The application creates no trigger and no
  constraint at runtime.
- **No column-level grants exist.** This matters because a table-level REVOKE
  also drops column-level grants, which would be a silent read regression. There
  are no `GRANT <verb> (col, ...) TO authenticated` statements in any migration,
  so there is nothing for the REVOKE to take away by that route.
- **PostgREST is not a data path.** The supabase-js clients built with the anon
  key (`apps/{web,api,portal,admin}/lib/supabase/server.ts`) and the service key
  (`apps/api/lib/supabase/admin.ts:9`, `apps/admin/lib/supabase/admin.ts:10`)
  make zero `.from(` calls in live code. They exist for sessions, not for rows.

## 4. The post-check

Read-only. Expect `0` on both rows.

```sql
-- 4a. No table in public still grants any of the three to authenticated.
SELECT count(*) AS still_granted
  FROM information_schema.role_table_grants
 WHERE grantee = 'authenticated'
   AND table_schema = 'public'
   AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');

-- 4b. And the default privileges will not re-grant them on the next table.
SELECT count(*) AS default_still_grants
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
 WHERE n.nspname = 'public'
   AND d.defaclobjtype = 'r'
   AND array_to_string(d.defaclacl, ',') ~ 'authenticated=[^,]*[tDx]';
```

**4b is the half that is easy to skip and is the whole point.** Without the
`ALTER DEFAULT PRIVILEGES`, 4a returns 0 today and a non-zero number after the
next `CREATE TABLE`, and nothing would say so.

## 5. A sanity arm worth running first, on a lane and not on production

The revoke is only meaningful if the privileges are actually there. Before
promoting, run 4a alone against a database built from `supabase/migrations`. A
result of 0 before the migration would mean the premise is wrong on that
database and the file should be re-derived rather than applied.

## 6. Out of scope, and named so it is not forgotten

**The `patient` role.** `withPatientContext` (`client.ts:196`) drops to
`patient`, a different principal. It may have inherited the same three from the
same default privileges. This file does not touch it, because the question asked
was about `authenticated` and because the portal's grant surface deserves its own
measurement rather than a guess folded into someone else's migration.
