# Apply receipt — migration 0072, appointment_confirm_codes

**NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN**

> First line by rule (`docs/runbook-prod-migrations.md`, "EVERY APPLY BLOCK IS
> UNVALIDATED UNTIL STRATEGY SAYS OTHERWISE"). Strategy replaces it with
> `VALIDATED`; the executor never removes its own.

**Migration:** `0072_appointment_confirm_codes.sql`
**Apply from commit:** `672004add4a0525826ebfe081006147d404beaf3` — the commit
that INTRODUCES the migration, not the branch head. The head also carries this
document, and a commit cannot contain a document that quotes its own sha.
**Ruling:** SR-26, as amended by SR-28 (HMAC, no `expires_at`), SR-29 (one
SECURITY DEFINER door, no table grants) and SR-30 (the response mapping).

---

## 1. What it creates

- `public.appointment_confirm_codes` — `code_hash` (PK, 64-hex CHECK),
  `tenant_id`, `appointment_id` (FK, `ON DELETE CASCADE`), `consumed_at`,
  `created_at`. **No `expires_at`.**
- A **partial** unique index: one LIVE code per appointment, so a retried
  reminder cannot mint a second, while a spent code still permits a fresh one.
- `public.resolve_confirm_code(text)` — `SECURITY DEFINER`, `STABLE`, owned by
  `postgres`, returning exactly `(tenant_id, appointment_id, consumed_at)`.
- **REVOKE** on the table from `PUBLIC`, `anon`, `authenticated`, `patient`.
  **GRANT EXECUTE** on the function to `authenticated` only.

**No route, no page, no template, no other table, no other policy.**

## 2. The one thing to read before approving

**The REVOKE is load-bearing and is not decoration.** Supabase applies
`ALTER DEFAULT PRIVILEGES`, so a table created on production can arrive already
granted to `anon` and `authenticated`, while the same migration on a CI database
built by a single principal arrives with nothing. That drift is already recorded
on this board. Writing "no grants" as an *absence* would be a statement that
holds in CI and not in production, so it is written as a REVOKE instead.

**Post-check V4 is what proves it, and it is the check to read first.**

## 3. What was proved before this block was written

- **Negative arm:** against a 0071 database the suite is RED — `relation
  "appointment_confirm_codes" does not exist`. With 0072 applied, **17/17**.
- **Full DB-gated suite:** 78 files, **1,076 tests, exit 0**.
- `check-security-definer-owner.mjs`: **14 functions, all owned by `postgres`.**
- Repo gates: lint, typecheck, test, build, test:scripts, journal drift — all 0.

**SR-30's indistinguishability assertions are deliberately NOT here.**
`resolve_confirm_code` *must* tell a spent code from an unknown one, because the
route needs `consumed_at` to choose between JP's four messages. The
indistinguishability is created one layer up, by mapping unknown, expired and
consumed onto one generic reply, and it is asserted with the route.

## 4. The apply, as ONE paste

Chained with `&&`, so nothing downstream runs if anything upstream fails.

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
git fetch origin --prune && \
git cat-file -e "672004add4a0525826ebfe081006147d404beaf3^{commit}" && \
git checkout --detach 672004add4a0525826ebfe081006147d404beaf3 && \
git log -1 --oneline && \
git status -sb && \
ls -l /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/migrations/0072_appointment_confirm_codes.sql && \
set -o allexport && \
source /Users/ivan/osteojp-secrets/new-prod.env && \
set +o allexport && \
node -e 'const u=new URL(process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL); const ref=u.username.split(".").pop(); console.log("host:        " + u.hostname); console.log("port:        " + u.port); console.log("project ref: " + ref); if (ref !== "dfotoodqvmjhbdcxyaxf") { console.error("REFUSING: project ref is not production"); process.exit(2); } if (u.port !== "5432") { console.error("REFUSING: port is not the 5432 session pooler"); process.exit(2); } console.log("target verified");' && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 1 && \
pnpm db:migrate && \
pnpm --filter @osteojp/db exec node /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply/packages/db/scripts/check-pending-migrations.mjs 0 && \
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
select count(*) as journal_rows from drizzle.__drizzle_migrations;
select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 3;
select to_regclass('public.appointment_confirm_codes') as table_exists,
       (select count(*) from information_schema.columns
         where table_name = 'appointment_confirm_codes' and column_name = 'expires_at') = 0
         as has_no_expires_at;
select indexname, indexdef like '%WHERE (consumed_at IS NULL)%' as is_partial
  from pg_indexes where indexname = 'appointment_confirm_codes_one_live_per_appointment';
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'appointment_confirm_codes'
   and grantee in ('anon', 'authenticated', 'patient', 'PUBLIC');
select relname, relrowsecurity from pg_class
 where relname = 'appointment_confirm_codes';
select p.prosecdef, p.provolatile, r.rolname as owner,
       array_to_string(p.proargnames, ',') as args
  from pg_proc p join pg_roles r on r.oid = p.proowner
 where p.proname = 'resolve_confirm_code';
select grantee, privilege_type
  from information_schema.role_routine_grants
 where routine_name = 'resolve_confirm_code'
 order by grantee;
SQL
```

## 5. What each post-check proves, in order

| | expected |
|---|---|
| **V1** journal rows | **71 → 72**, newest tag `0072_appointment_confirm_codes` |
| **V2** `table_exists` / `has_no_expires_at` | not null / **`t`** |
| **V3** `is_partial` | **`t`** |
| **V4** grants on the table | **ZERO ROWS** |
| **V5** `relrowsecurity` | **`t`** |
| **V6** function | `prosecdef` `t`, `provolatile` `s`, owner `postgres`, args `p_code_hash,tenant_id,appointment_id,consumed_at` |
| **V7** EXECUTE grants | `authenticated` present; **`anon` and `patient` absent** |

**V4 is the one to read first, and it must return zero rows.** Any row means a
Supabase default privilege survived and the table is reachable by a role SR-29
says must not reach it. **V1 alone proves nothing** — it records that a file was
applied, not that the objects have the shape they were approved with.

## 5b. TWO THINGS V7 CAUGHT, AND THE SECOND IS NOT ABOUT THIS MIGRATION

**V7 is in this receipt because running it caught a real hole in the first draft
of 0072.** Supabase's `ALTER DEFAULT PRIVILEGES` had granted `anon` EXECUTE on
`resolve_confirm_code`, and `REVOKE ... FROM PUBLIC` does not touch a privilege
held by a NAMED role. The function was callable as
`/rest/v1/rpc/resolve_confirm_code` by an unauthenticated request — enumerating
codes **without passing the application's rate limiter**, which is the one
control this design leans on. The migration now revokes from `anon` and
`patient` explicitly. It was found by executing the post-check, not by reading
the SQL.

**AND A SEPARATE FINDING, WHICH IS NOT ABOUT THIS MIGRATION AND SHOULD NOT
DELAY IT.** While proving the revoke, calling *any* function the `anon` role
lacks EXECUTE on **segfaults the backend** on `supabase/postgres:17.6.1.106`
(PostgreSQL 17.6, aarch64): `server process was terminated by signal 11`, the
database enters recovery, every connection drops.

It is **not** this function. A bare
`CREATE FUNCTION f(text) RETURNS text LANGUAGE sql` reproduces it identically,
while the same call as `authenticated` returns a clean *permission denied for
function*, and as `anon` **with** the grant returns normally. It is the `anon`
role on that image.

**Why it is worth telling Supabase, and why nobody should test it against
production:** if the hosted image behaves the same way, an unauthenticated
PostgREST RPC naming any function `anon` cannot execute would crash a backend —
a denial-of-service reachable without credentials. **That is a hypothesis about
production, not a measurement**, because this lane does not touch production and
must not. It needs a support ticket, not an experiment.

The test asserts the GRANT rather than attempting the call, for the same reason:
the attempt would take the test database down and prove nothing the grant does
not already say.

## 6. Stop conditions

- The project ref is not `dfotoodqvmjhbdcxyaxf`, or the port is not `5432`.
- `git log -1` prints a sha other than `672004add4a0525826ebfe081006147d404beaf3`.
- Either `check-pending-migrations.mjs` call exits non-zero.
- **V4 returns ANY row.**
- `has_no_expires_at`, `is_partial` or `relrowsecurity` is `f`, or V6 disagrees
  on any of its four values, or V7 lists `anon` or `patient`.
- The journal does not advance from **71 rows to 72**.

## 7. Rollback

```
DROP FUNCTION public.resolve_confirm_code(text);
DROP TABLE public.appointment_confirm_codes;
```

**Nothing here is destructive.** The table is new and empty, no existing object
is altered, and no data anywhere else in the schema is read, written or deleted.

## 8. After the apply

Paste V1–V7 back. **Only then does the PR merge**, and migration authorship
freezes again per SR-26.

## 9. Teardown. Run this, then close the window.

```
unset DATABASE_URL DATABASE_URL_DIRECT
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git checkout --detach origin/main
git log -1 --oneline
```

> **Note for the teardown:** the prod-apply worktree is currently still detached
> at `e2b3c90c` from the 0071 apply. §9 was not run last time. Harmless, and
> worth closing so the next census reads clean.
