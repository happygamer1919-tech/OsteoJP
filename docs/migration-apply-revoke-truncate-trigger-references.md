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

### 2a. The measurement this file acts on, and it is not mine

Board card **`SEC-truncate-grant-platform-default`** (PURPLE, #1396, status
`blocked`, `blocked_on: ivan`) measured it on production on 2026-09-17, alongside
the 0089 read-only post-check:

| privilege | held by `authenticated` on |
|---|---|
| TRUNCATE | **30 of the 46** tables in `public` |
| TRIGGER, REFERENCES | **38 of the 46** |

Reproduced on a throwaway database built from `supabase/migrations` with that one
platform default added and nothing else changed, so the figure is not one
reading. Built without it, the same migrations produce zero of all three. The 30
equals the DELETE count, because the migrations that revoke revoke DELETE and
TRUNCATE as a pair.

**THIS FILE IMPLEMENTS THAT CARD'S OPTION 1 AND DOES NOT PRE-EMPT THE RULING.**
The card puts three options to the owner: revoke across `public` plus the
matching `ALTER DEFAULT PRIVILEGES`; revoke only on the tables holding patient
data; or accept the default and record the acceptance. It notes only the first
survives the next `CREATE TABLE`. This migration is the first, written so the
decision has something to approve rather than something to specify. It is
unnumbered and unapplyable precisely because the decision is not mine.

### 2b. ONE CORRECTION TO THAT CARD, and it cuts toward acting

The card says the application "connects as `postgres` over DATABASE_URL and never
as `authenticated`". The first half is right and the second is not, and the
difference matters for the card's own "no exposure is demonstrated" paragraph.

The app connects as the owner and then **drops role for the duration of every
tenant-scoped transaction**: `packages/db/src/client.ts:152` issues
`set local role authenticated` inside `withTenantContext`, which is what every
staff read and write reaches through `runScoped`. The portal does the same to
`patient` at `:196`. So for the whole body of every staff request the session
IS `authenticated` and holds its privileges, TRUNCATE included, on those 30
tables.

What the card gets right, and this file does not overstate it: **no exposure is
demonstrated.** PostgREST issues no TRUNCATE, and no code path in this repository
issues one. The correction is not "there is an incident"; it is that the distance
between the over-grant and a statement that would use it is one line of SQL
inside an already-open transaction, rather than a role switch that never happens.

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

## 5. The premise is already measured, so this arm is a re-check and not a test

The revoke is only meaningful if the privileges are actually there, and
`SEC-truncate-grant-platform-default` establishes that they are: 30 of 46 on
production for TRUNCATE, reproduced from `supabase/migrations` locally. So 4a run
before the migration should return **30**, not 0.

Run it anyway, on a lane, immediately before promoting. Not because the premise
is in doubt, but because the number is the thing 4a is asserting went to zero,
and a before-reading of 0 would mean this database is not the one the card
measured. Read it, then apply, then read it again.

## 6. Out of scope, and named so it is not forgotten

**The `patient` role.** `withPatientContext` (`client.ts:196`) drops to
`patient`, a different principal. It may have inherited the same three from the
same default privileges. This file does not touch it, because the question asked
was about `authenticated` and because the portal's grant surface deserves its own
measurement rather than a guess folded into someone else's migration.
