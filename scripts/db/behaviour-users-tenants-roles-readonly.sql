-- 0094 USERS/TENANTS/ROLES BEHAVIOUR CHECK. READ ONLY.
--
-- 0094 replaces the FOR ALL policy on each of users, tenants and roles with a
-- tenant SELECT and role-gated writes. This file proves what a real staff
-- member's session may READ and may WRITE on the three tables, on the database
-- it is run against, by impersonation (flat claims tenant_id, user_role, sub,
-- then SET LOCAL ROLE authenticated), inside one READ ONLY REPEATABLE READ
-- transaction.
--
-- ===========================================================================
-- HOW A READ ONLY FILE MEASURES WRITES
-- ===========================================================================
-- It cannot run an UPDATE, not even a rolled-back one. It reads, from
-- pg_policy, the expression Postgres itself applies to a command for
-- `authenticated` (every PERMISSIVE policy OR'ed, every RESTRICTIVE one AND'ed,
-- FOR ALL included; an INSERT uses WITH CHECK, or USING where a FOR ALL
-- policy has none), and evaluates it with THE ACTOR'S CLAIMS set, OUTSIDE row
-- level security, over every row of the table, every tenant's included. An
-- UPDATE with no WHERE clause (W8 and W9) is filtered by its own policy alone,
-- so the rows the expression admits are the rows that command could touch.
-- Read under the SELECT policy instead, a write policy without its tenant
-- predicate would count the same as one with it. The evaluation runs with
-- row_security off, so a connection that does not bypass row level security
-- STOPs with an error rather than reading a filtered count. The same set is
-- then computed a SECOND way, outside row level security, from the app's
-- own rule (packages/auth/permissions.ts: users:manage and settings:manage
-- are owner and admin; only an owner may touch or make an owner; W7 never
-- deletes an owner), and the two must be the SAME ROWS: an md5 over the
-- ordered ids, not a count.
--
-- AN UPDATE IS MEASURED ON BOTH SIDES. USING, the old row, over the existing
-- rows (arms 4, 7 and 8). WITH CHECK, the new row (every PERMISSIVE check
-- OR'ed, USING where a policy has no WITH CHECK): on tenants and roles over
-- the existing rows as candidates (arms 7 and 8), and on users over CANDIDATE
-- NEW ROWS (arm 12): every staff row of every tenant, given every tenant's id
-- as tenant_id and every role of every tenant, or none, as role_id. That is
-- where "only an owner may make an owner" and "a row's role is one of its own
-- tenant's" live, and no existing row carries the roles those rules refuse,
-- so the candidates are built rather than read.
--
-- A TENANT THAT DOES NOT EXIST (arm 13). Arms 4 to 7 and 12 meet another
-- tenant's rows only where another tenant exists. With one tenant in the
-- database they still test the role gates, but no row they read can tell a
-- write policy that has its tenant predicate from one that lost it. Arm 13
-- tests that predicate on any database: it evaluates every write expression
-- above over PHANTOM rows, every row of the table with its tenant key (users
-- and roles: tenant_id; tenants: id) replaced by an id no tenant has (the nil
-- uuid; a database where a tenant has it STOPs), and requires that none is
-- admitted. Only an owner or admin claim reaches the manager policies, so
-- only an owner or admin actor exercises their tenant predicate, in arm 13 as
-- in arms 4 to 7.
--
-- WHAT IT CANNOT MEASURE, stated so a green run is not read as covering it:
-- the column guard trigger IN ACTION (which columns a non-manager may change on
-- their own row). Arm 9 proves its SHAPE (present, enabled, firing on every
-- UPDATE, body pinned); the behaviour is proven only by the rehearsal's write
-- arms on a throwaway. So arm 12 admits a therapist's or receptionist's own
-- row with another of their tenant's non-owner roles, as the self arm's WITH
-- CHECK does; the guard is what keeps their role as it is. Arm 12's
-- candidates vary tenant_id and role_id only, the columns the policies read.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- An arm with a vacuous branch tests FAIL first, then VACUOUS, then OK, so a
-- zero comparand never prints OK and never hides a FAIL. The caller asserts the
-- exact profile it expects, and says why. The profiles below are for a
-- database with 0094 applied; the apply document states what it expects on
-- one without it. For a reception or therapist actor in a tenant with more
-- than one staff row:
--   12 OK / 2 VACUOUS / 0 FAIL with one tenant in the database, and
--   14 OK / 0 VACUOUS / 0 FAIL with two or more.
-- With one tenant, arms 3 and 10 are VACUOUS (no other tenant's row to hide,
-- and no other tenant's role to name), and arms 4 to 7 and 12 test the role
-- gates only: arm 13 is the arm that tests each write's tenant predicate
-- there. An admin actor in a tenant with an owner role reads the same. An
-- owner reads the same with two or more tenants; with one, arm 12 is VACUOUS
-- as well (an owner may give any of its tenant's roles, so no candidate of
-- its own tenant is refused): 11 OK / 3 VACUOUS / 0 FAIL. For an owner, arm
-- 5 is also VACUOUS when every staff row of the tenant is an owner's.
--
-- THE ARMS
--   0   the transaction is READ ONLY and REPEATABLE READ.
--   1   the session IS the named actor: auth.uid(), jwt_tenant_id() and
--       jwt_role() answer for the claims this file set. A mismatch STOPs.
--   2   READS UNCHANGED: the actor reads every row of its own tenant in users
--       and roles, and its own tenants row, exactly as many as exist.
--   3   the actor reads no users, roles or tenants row of another tenant.
--       VACUOUS when no other tenant has a row.
--   4   users UPDATE USING: the rows the actor's UPDATE policies admit are
--       exactly its own row, plus, for owner or admin, every row of its
--       tenant whose role is its tenant's and is not owner (owner: owner rows
--       too).
--   5   users DELETE: exactly, for owner or admin, the tenant's rows that are
--       not owner rows; for anyone else, none. VACUOUS when the rule is empty
--       for a manager, or the tenant has one staff row.
--   6   users INSERT: the tenant's existing rows, taken as candidate new rows,
--       that the INSERT check admits are exactly those an owner or admin may
--       create (owner rows for an owner only); for anyone else, none.
--       VACUOUS on the same terms as 5.
--   7   tenants: UPDATE admits the actor's own tenant row for owner or admin
--       and nothing for anyone else, on both sides (U is USING, UC is WITH
--       CHECK); INSERT and DELETE admit nothing.
--   8   roles: INSERT, UPDATE (both sides) and DELETE admit nothing, for
--       every role.
--   9   the column guard is there: users_self_service_columns, BEFORE UPDATE
--       FOR EACH ROW on users, of every column (no UPDATE OF list) and with no
--       WHEN clause, enabled, its function's body pinned by md5
--       (9b0fc7485410808653b45cd55626ff39 on Postgres 17).
--   10  no staff row IN ANY TENANT names a role of another tenant: every staff
--       row's role is one of its own tenant's. Counted over every tenant's
--       rows, as the connecting role. VACUOUS when no staff row could name a
--       role of another tenant (one tenant: there is none to name).
--   11  LOGIN STILL RESOLVES: the token hook, called for the actor, returns
--       the actor's tenant and role slug.
--   12  users UPDATE WITH CHECK: of the candidate new rows (above), exactly
--       those the app's rule allows: tenant_id is the actor's tenant; the row
--       is the actor's own, or any row for owner or admin; role_id is none or
--       a role of the actor's tenant, and not owner unless the actor is an
--       owner. VACUOUS when the rule refuses no candidate of the actor's own
--       tenant.
--   13  NO WRITE CROSSES THE TENANT, on any database: of the phantom rows
--       (above), every write expression on users, tenants and roles, each
--       UPDATE on both sides, admits none. It needs no second tenant, and it
--       names the expression that admitted a row, if one did.
--
-- IT PRINTS THE ACTOR LINE, THEN COUNTS AND VERDICTS, AND NOTHING ELSE. No
-- name and no contact detail; ids appear only inside md5 digests.
--
-- THE ACTOR LINE, printed once before anything is checked, names the staff user
-- this run acts as by its id and role slug, and says how it was chosen:
--     ACTOR id <uuid> | role <slug> | chosen passed in with -v actor_id
-- The id is there so whoever reads the transcript can tell, by comparing ids,
-- whether the run acted as a particular account. It is a staff id, never a name.
--
-- THE ACTOR IS PASSED, NOT CHOSEN: -v actor_id=<an active staff user>. It is
-- verified (active, not a shared resource, holds a role) and its id re-read from
-- the table, so an upper-case uuid cannot trip the identity check. Run it once
-- as a reception or therapist user (the narrowing) and, if wanted, once as an
-- admin (the owner tier).

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?actor_id}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: pass the actor with -v actor_id=<an active staff user>. Nothing was checked.';
  END $stop$;
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo ''
\echo '=== 0094 USERS/TENANTS/ROLES BEHAVIOUR CHECK. READ ONLY. 14 arms, profile printed last ==='

SELECT (SELECT u.id::text FROM public.users u JOIN public.roles r ON r.id = u.role_id
         WHERE u.id = :'actor_id'::uuid AND u.is_active AND NOT u.is_shared_resource) AS actor_checked \gset
\if :{?actor_checked}
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the actor is not an active, non-resource staff user with a role. Nothing was checked.';
  END $stop$;
\endif
\set actor_id :actor_checked

SELECT u.tenant_id::text AS actor_tenant, r.slug AS actor_role
  FROM public.users u JOIN public.roles r ON r.id = u.role_id
 WHERE u.id = :'actor_id'::uuid \gset

/* THE ACTOR LINE. The id is the normalised one above and the role is the slug
 * just read, which is also the role the claims below carry. */
\set actor_source 'passed in with -v actor_id'
\echo 'ACTOR id' :actor_id '| role' :actor_role '| chosen' :actor_source

/* ARM 13'S PHANTOM TENANT: an id no tenant has. A database where a tenant has
 * it cannot furnish the arm, so the run STOPs. */
\set phantom_tenant 00000000-0000-0000-0000-000000000000
SELECT (NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = :'phantom_tenant'::uuid))::text AS phantom_is_free \gset
\if :phantom_is_free
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: a tenant has the id arm 13 uses for a tenant that does not exist. Nothing was checked.';
  END $stop$;
\endif

/* ---------------------------------------------------------------------------
 * THE EFFECTIVE EXPRESSIONS, read from the catalogue: for each table and
 * command, every PERMISSIVE policy that applies to authenticated (or PUBLIC)
 * OR'ed, AND every RESTRICTIVE one. No policy at all reads `false`, which is
 * what row level security does with a command nobody is permitted. UPDATE is
 * read twice: its USING (use_check false) and its WITH CHECK (use_check true).
 * ------------------------------------------------------------------------- */
WITH p AS (
  SELECT c.relname AS tbl, pol.polcmd::text AS cmd, pol.polpermissive AS perm,
         pg_get_expr(pol.polqual, pol.polrelid) AS q,
         pg_get_expr(coalesce(pol.polwithcheck, pol.polqual), pol.polrelid) AS wc
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles')
     AND (0::oid = ANY (pol.polroles) OR 'authenticated'::regrole::oid = ANY (pol.polroles))
), k(tbl, cmd, use_check) AS (
  VALUES ('users', 'w', false), ('users', 'w', true), ('users', 'd', false), ('users', 'a', true),
         ('tenants', 'w', false), ('tenants', 'w', true), ('tenants', 'd', false), ('tenants', 'a', true),
         ('roles', 'w', false), ('roles', 'w', true), ('roles', 'd', false), ('roles', 'a', true)
), e AS (
  SELECT k.tbl, k.cmd, k.use_check,
         '(' || coalesce((SELECT string_agg('(' || x.expr || ')', ' OR ' ORDER BY x.expr)
                            FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                                    FROM p WHERE p.tbl = k.tbl AND p.cmd IN (k.cmd, '*')) x
                           WHERE x.perm AND x.expr IS NOT NULL), 'false')
      || ') AND (' ||
         coalesce((SELECT string_agg('(' || x.expr || ')', ' AND ' ORDER BY x.expr)
                     FROM (SELECT CASE WHEN k.use_check THEN p.wc ELSE p.q END AS expr, p.perm
                             FROM p WHERE p.tbl = k.tbl AND p.cmd IN (k.cmd, '*')) x
                    WHERE NOT x.perm AND x.expr IS NOT NULL), 'true')
      || ')' AS expr
    FROM k
)
SELECT max(expr) FILTER (WHERE tbl = 'users'   AND cmd = 'w' AND NOT use_check) AS e_users_upd,
       max(expr) FILTER (WHERE tbl = 'users'   AND cmd = 'w' AND use_check)     AS e_users_upd_chk,
       max(expr) FILTER (WHERE tbl = 'users'   AND cmd = 'd') AS e_users_del,
       max(expr) FILTER (WHERE tbl = 'users'   AND cmd = 'a') AS e_users_ins,
       max(expr) FILTER (WHERE tbl = 'tenants' AND cmd = 'w' AND NOT use_check) AS e_tenants_upd,
       max(expr) FILTER (WHERE tbl = 'tenants' AND cmd = 'w' AND use_check)     AS e_tenants_upd_chk,
       max(expr) FILTER (WHERE tbl = 'tenants' AND cmd = 'd') AS e_tenants_del,
       max(expr) FILTER (WHERE tbl = 'tenants' AND cmd = 'a') AS e_tenants_ins,
       max(expr) FILTER (WHERE tbl = 'roles'   AND cmd = 'w' AND NOT use_check) AS e_roles_upd,
       max(expr) FILTER (WHERE tbl = 'roles'   AND cmd = 'w' AND use_check)     AS e_roles_upd_chk,
       max(expr) FILTER (WHERE tbl = 'roles'   AND cmd = 'd') AS e_roles_del,
       max(expr) FILTER (WHERE tbl = 'roles'   AND cmd = 'a') AS e_roles_ins
  FROM e \gset

/* ---------------------------------------------------------------------------
 * THE COMPARANDS, outside row level security, written from the app's rule and
 * not from the policies: a LEFT JOIN to the row's role, where the policies use
 * an IN list. MGR is the actor holding users:manage and settings:manage.
 * ------------------------------------------------------------------------- */
SELECT (:'actor_role' IN ('owner', 'admin'))::text AS mgr \gset

SELECT (SELECT count(*)::int FROM public.users WHERE tenant_id = :'actor_tenant'::uuid)            AS own_users,
       (SELECT count(*)::int FROM public.roles WHERE tenant_id = :'actor_tenant'::uuid)            AS own_roles,
       (SELECT count(*)::int FROM public.users WHERE tenant_id <> :'actor_tenant'::uuid)
       + (SELECT count(*)::int FROM public.roles WHERE tenant_id <> :'actor_tenant'::uuid)
       + (SELECT count(*)::int FROM public.tenants WHERE id <> :'actor_tenant'::uuid)              AS other_rows,
       (SELECT count(*)::int FROM public.users u JOIN public.roles r ON r.id = u.role_id
         WHERE r.tenant_id <> u.tenant_id)                                                         AS foreign_role_rows,
       (EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.tenant_id <> u.tenant_id))::text
                                                                                                   AS foreign_role_possible \gset

SELECT count(*)::int AS r_upd_n, coalesce(md5(string_agg(u.id::text, ',' ORDER BY u.id)), 'none') AS r_upd_md5
  FROM public.users u LEFT JOIN public.roles r ON r.id = u.role_id
 WHERE u.tenant_id = :'actor_tenant'::uuid
   AND (u.id = :'actor_id'::uuid
        OR (:'mgr' = 'true'
            AND (u.role_id IS NULL OR r.tenant_id = u.tenant_id)
            AND (r.slug IS DISTINCT FROM 'owner' OR :'actor_role' = 'owner'))) \gset

SELECT count(*)::int AS r_del_n, coalesce(md5(string_agg(u.id::text, ',' ORDER BY u.id)), 'none') AS r_del_md5
  FROM public.users u LEFT JOIN public.roles r ON r.id = u.role_id
 WHERE u.tenant_id = :'actor_tenant'::uuid
   AND :'mgr' = 'true'
   AND (u.role_id IS NULL OR r.tenant_id = u.tenant_id)
   AND r.slug IS DISTINCT FROM 'owner' \gset

SELECT count(*)::int AS r_ins_n, coalesce(md5(string_agg(u.id::text, ',' ORDER BY u.id)), 'none') AS r_ins_md5
  FROM public.users u LEFT JOIN public.roles r ON r.id = u.role_id
 WHERE u.tenant_id = :'actor_tenant'::uuid
   AND :'mgr' = 'true'
   AND (u.role_id IS NULL OR r.tenant_id = u.tenant_id)
   AND (r.slug IS DISTINCT FROM 'owner' OR :'actor_role' = 'owner') \gset

/* ARM 12'S COMPARAND. A candidate is (staff row, tenant, role or none), named
 * by cand_key, built the same way on both sides. own_cands counts the
 * candidates of the actor's own tenant, all_cands every candidate. */
SELECT count(*)::int AS r_chk_n, coalesce(md5(string_agg(cand_key, ',' ORDER BY cand_key)), 'none') AS r_chk_md5
  FROM (SELECT u.id::text || '/' || t.id::text || '/' || coalesce(ro.id::text, 'none') AS cand_key
          FROM public.users u
         CROSS JOIN public.tenants t
         CROSS JOIN (SELECT id, tenant_id, slug::text AS slug FROM public.roles
                     UNION ALL SELECT NULL::uuid, NULL::uuid, NULL::text) ro
         WHERE t.id = :'actor_tenant'::uuid
           AND (u.id = :'actor_id'::uuid OR :'mgr' = 'true')
           AND (ro.id IS NULL
                OR (ro.tenant_id = t.id AND (ro.slug <> 'owner' OR :'actor_role' = 'owner')))) x \gset

SELECT (SELECT count(*)::int FROM public.users) * ((SELECT count(*)::int FROM public.roles) + 1)     AS own_cands,
       (SELECT count(*)::int FROM public.users) * ((SELECT count(*)::int FROM public.roles) + 1)
       * (SELECT count(*)::int FROM public.tenants)                                              AS all_cands \gset

/* THE GUARD'S SHAPE, a catalogue read. tgtype 19 is ROW + BEFORE + UPDATE; an
 * UPDATE OF column list (tgattr) or a WHEN clause (tgqual) would narrow when it
 * fires without moving tgtype, so both are pinned empty. */
SELECT (EXISTS (
          SELECT 1 FROM pg_trigger tg JOIN pg_proc f ON f.oid = tg.tgfoid
           WHERE tg.tgrelid = 'public.users'::regclass AND tg.tgname = 'users_self_service_columns'
             AND NOT tg.tgisinternal AND tg.tgenabled = 'O' AND tg.tgtype = 19
             AND tg.tgattr::text = '' AND tg.tgqual IS NULL
             AND NOT f.prosecdef AND md5(f.prosrc) = '9b0fc7485410808653b45cd55626ff39'))::text AS guard_ok \gset

/* LOGIN: the token hook for the actor, called as this connection's own role
 * (the hook is SECURITY DEFINER, owned by postgres, so it reads as its owner
 * whoever calls it). Only the tenant and the role slug are compared. */
SELECT coalesce((public.custom_access_token_hook(json_build_object('user_id', :'actor_id', 'claims', '{}'::json)::jsonb)
                 -> 'claims' ->> 'tenant_id') = :'actor_tenant'
            AND (public.custom_access_token_hook(json_build_object('user_id', :'actor_id', 'claims', '{}'::json)::jsonb)
                 -> 'claims' ->> 'user_role') = :'actor_role', false)::text AS hook_ok \gset

/* THE CLAIMS, FLAT, SET BEFORE THE ROLE CHANGE. */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'actor_tenant', 'user_role', :'actor_role', 'sub', :'actor_id')::text,
       true) IS NOT NULL AS claims_set \gset

/* THE IDENTITY CHECK, BEFORE ANYTHING IS READ AS THE ACTOR. auth.uid() and
 * auth.jwt() prefer session-level request.jwt.claim.sub / request.jwt.claim
 * GUCs over the blob set above, so a pooler leftover could make the helpers
 * answer for someone else. */
SELECT (coalesce((SELECT auth.uid()) = :'actor_id'::uuid, false)
        AND coalesce((SELECT public.jwt_tenant_id())::text = :'actor_tenant', false)
        AND coalesce((SELECT public.jwt_role()) = :'actor_role', false))::text AS identity_matches \gset
\if :identity_matches
\else
  DO $stop$ BEGIN
    RAISE EXCEPTION 'STOP: the session is not the identity this file set: auth.uid(), jwt_tenant_id() or jwt_role() answers for someone else. Nothing was checked. Reconnect.';
  END $stop$;
\endif

SET LOCAL ROLE authenticated;

SELECT (SELECT count(*)::int FROM public.users WHERE tenant_id = :'actor_tenant'::uuid)            AS own_users_read,
       (SELECT count(*)::int FROM public.roles WHERE tenant_id = :'actor_tenant'::uuid)            AS own_roles_read,
       (SELECT count(*)::int FROM public.tenants WHERE id = :'actor_tenant'::uuid)                 AS own_tenant_read,
       (SELECT count(*)::int FROM public.users WHERE tenant_id <> :'actor_tenant'::uuid)
       + (SELECT count(*)::int FROM public.roles WHERE tenant_id <> :'actor_tenant'::uuid)
       + (SELECT count(*)::int FROM public.tenants WHERE id <> :'actor_tenant'::uuid)              AS other_read \gset

RESET ROLE;

/* WHAT EACH COMMAND ADMITS, WITH THE ACTOR'S CLAIMS, OUTSIDE ROW LEVEL
 * SECURITY, over every tenant's rows (the header says why). The claims set
 * above still stand; only the role is back. row_security is off, so these
 * reads error, and the run STOPs, if this connection is subject to row level
 * security. The expressions are interpolated as text; they are the
 * catalogue's own rendering, read above. */
SET LOCAL row_security = off;
SELECT count(*)::int AS a_upd_n, coalesce(md5(string_agg(id::text, ',' ORDER BY id)), 'none') AS a_upd_md5
  FROM public.users WHERE :e_users_upd \gset
SELECT count(*)::int AS a_del_n, coalesce(md5(string_agg(id::text, ',' ORDER BY id)), 'none') AS a_del_md5
  FROM public.users WHERE :e_users_del \gset
SELECT count(*)::int AS a_ins_n, coalesce(md5(string_agg(id::text, ',' ORDER BY id)), 'none') AS a_ins_md5
  FROM public.users WHERE :e_users_ins \gset
SELECT (SELECT count(*)::int FROM public.tenants WHERE :e_tenants_upd)     AS a_t_upd,
       (SELECT count(*)::int FROM public.tenants WHERE :e_tenants_upd_chk) AS a_t_upd_chk,
       (SELECT count(*)::int FROM public.tenants WHERE :e_tenants_ins)     AS a_t_ins,
       (SELECT count(*)::int FROM public.tenants WHERE :e_tenants_del)     AS a_t_del,
       (SELECT count(*)::int FROM public.roles WHERE :e_roles_upd)         AS a_r_upd,
       (SELECT count(*)::int FROM public.roles WHERE :e_roles_upd_chk)     AS a_r_upd_chk,
       (SELECT count(*)::int FROM public.roles WHERE :e_roles_ins)         AS a_r_ins,
       (SELECT count(*)::int FROM public.roles WHERE :e_roles_del)         AS a_r_del \gset
/* Arm 12: the users UPDATE WITH CHECK over the candidate new rows. Each is a
 * staff row with tenant_id and role_id replaced (jsonb_populate_record keeps
 * every other column of the row), in a derived table named users, so the
 * catalogue's rendering of the expression reads it unchanged. */
SELECT count(*)::int AS a_chk_n, coalesce(md5(string_agg(cand_key, ',' ORDER BY cand_key)), 'none') AS a_chk_md5
  FROM (SELECT nr.*, u.id::text || '/' || t.id::text || '/' || coalesce(ro.id::text, 'none') AS cand_key
          FROM public.users u
         CROSS JOIN public.tenants t
         CROSS JOIN (SELECT id FROM public.roles UNION ALL SELECT NULL::uuid) ro
         CROSS JOIN LATERAL jsonb_populate_record(u, jsonb_build_object('tenant_id', t.id, 'role_id', ro.id)) nr) AS users
 WHERE :e_users_upd_chk \gset
/* Arm 13: every write expression over the phantom rows (the header says why).
 * A phantom row is a real row with its tenant key replaced by :phantom_tenant,
 * read in a derived table named after its table, as arm 12's candidates are. */
WITH ph_users AS (SELECT nr.* FROM public.users x
                   CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('tenant_id', :'phantom_tenant')) nr),
     ph_tenants AS (SELECT nr.* FROM public.tenants x
                     CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('id', :'phantom_tenant')) nr),
     ph_roles AS (SELECT nr.* FROM public.roles x
                   CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('tenant_id', :'phantom_tenant')) nr),
     ph(what, n) AS (VALUES
       ('users U',    (SELECT count(*)::int FROM ph_users AS users WHERE :e_users_upd)),
       ('users UC',   (SELECT count(*)::int FROM ph_users AS users WHERE :e_users_upd_chk)),
       ('users I',    (SELECT count(*)::int FROM ph_users AS users WHERE :e_users_ins)),
       ('users D',    (SELECT count(*)::int FROM ph_users AS users WHERE :e_users_del)),
       ('tenants U',  (SELECT count(*)::int FROM ph_tenants AS tenants WHERE :e_tenants_upd)),
       ('tenants UC', (SELECT count(*)::int FROM ph_tenants AS tenants WHERE :e_tenants_upd_chk)),
       ('tenants I',  (SELECT count(*)::int FROM ph_tenants AS tenants WHERE :e_tenants_ins)),
       ('tenants D',  (SELECT count(*)::int FROM ph_tenants AS tenants WHERE :e_tenants_del)),
       ('roles U',    (SELECT count(*)::int FROM ph_roles AS roles WHERE :e_roles_upd)),
       ('roles UC',   (SELECT count(*)::int FROM ph_roles AS roles WHERE :e_roles_upd_chk)),
       ('roles I',    (SELECT count(*)::int FROM ph_roles AS roles WHERE :e_roles_ins)),
       ('roles D',    (SELECT count(*)::int FROM ph_roles AS roles WHERE :e_roles_del)))
SELECT (SELECT count(*)::int FROM ph_users) + (SELECT count(*)::int FROM ph_tenants)
       + (SELECT count(*)::int FROM ph_roles)                                                     AS ph_rows,
       sum(n)::int                                                                                AS ph_admitted,
       coalesce(string_agg(what || '=' || n, ' ' ORDER BY what) FILTER (WHERE n > 0), 'none')     AS ph_which
  FROM ph \gset

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, '1. the session IS the named actor (uid, tenant and role all answer for the claims set)',
      CASE WHEN :'identity_matches' = 'true' THEN 'the named actor' ELSE 'SOMEBODY ELSE' END,
      'the named actor',
      CASE WHEN :'identity_matches' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (2, '2. reads unchanged: every users and roles row of the tenant, and the tenant row',
      'users ' || :'own_users_read' || ' of ' || :'own_users' || ', roles ' || :'own_roles_read' || ' of ' || :'own_roles'
      || ', tenant ' || :'own_tenant_read',
      'all of them, tenant 1',
      CASE WHEN :own_users_read = :own_users AND :own_roles_read = :own_roles AND :own_tenant_read = 1
            AND :own_users > 0 AND :own_roles > 0 THEN 'OK' ELSE 'FAIL' END),
  (3, '3. reads no users, roles or tenants row of another tenant',
      :'other_read' || ' read of ' || :'other_rows' || ' that exist',
      '0 read',
      CASE WHEN :other_read <> 0 THEN 'FAIL'
           WHEN :other_rows = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (4, '4. users UPDATE admits exactly the rule''s rows (own row; owner or admin: the tenant''s rows the tier allows)',
      :'a_upd_n' || ' rows, ' || CASE WHEN :'a_upd_md5' = :'r_upd_md5' THEN 'the same rows' ELSE 'DIFFERENT rows' END,
      :'r_upd_n' || ' rows, the same rows',
      CASE WHEN :'a_upd_md5' = :'r_upd_md5' AND :a_upd_n = :r_upd_n AND :r_upd_n > 0 THEN 'OK' ELSE 'FAIL' END),
  (5, '5. users DELETE admits exactly the rule''s rows (owner or admin: never an owner row; anyone else: none)',
      :'a_del_n' || ' rows, ' || CASE WHEN :'a_del_md5' = :'r_del_md5' THEN 'the same rows' ELSE 'DIFFERENT rows' END,
      :'r_del_n' || ' rows, the same rows',
      CASE WHEN :'a_del_md5' <> :'r_del_md5' OR :a_del_n <> :r_del_n THEN 'FAIL'
           WHEN :own_users < 2 OR (:'mgr' = 'true' AND :r_del_n = 0) THEN 'VACUOUS' ELSE 'OK' END),
  (6, '6. users INSERT check admits exactly the rule''s rows as candidates (owner or admin; owner rows for an owner only)',
      :'a_ins_n' || ' rows, ' || CASE WHEN :'a_ins_md5' = :'r_ins_md5' THEN 'the same rows' ELSE 'DIFFERENT rows' END,
      :'r_ins_n' || ' rows, the same rows',
      CASE WHEN :'a_ins_md5' <> :'r_ins_md5' OR :a_ins_n <> :r_ins_n THEN 'FAIL'
           WHEN :own_users < 2 OR (:'mgr' = 'true' AND :r_ins_n = 0) THEN 'VACUOUS' ELSE 'OK' END),
  (7, '7. tenants: UPDATE (USING and WITH CHECK) admits the own row for owner or admin only; INSERT and DELETE admit nothing',
      'U=' || :'a_t_upd' || ' UC=' || :'a_t_upd_chk' || ' I=' || :'a_t_ins' || ' D=' || :'a_t_del',
      'U=' || CASE WHEN :'mgr' = 'true' THEN '1' ELSE '0' END
      || ' UC=' || CASE WHEN :'mgr' = 'true' THEN '1' ELSE '0' END || ' I=0 D=0',
      CASE WHEN :a_t_upd = CASE WHEN :'mgr' = 'true' THEN 1 ELSE 0 END
            AND :a_t_upd_chk = CASE WHEN :'mgr' = 'true' THEN 1 ELSE 0 END
            AND :a_t_ins = 0 AND :a_t_del = 0 AND :own_tenant_read = 1 THEN 'OK' ELSE 'FAIL' END),
  (8, '8. roles: INSERT, UPDATE (USING and WITH CHECK) and DELETE admit nothing',
      'U=' || :'a_r_upd' || ' UC=' || :'a_r_upd_chk' || ' I=' || :'a_r_ins' || ' D=' || :'a_r_del',
      'U=0 UC=0 I=0 D=0',
      CASE WHEN :a_r_upd = 0 AND :a_r_upd_chk = 0 AND :a_r_ins = 0 AND :a_r_del = 0
            AND :own_roles_read > 0 THEN 'OK' ELSE 'FAIL' END),
  (9, '9. the column guard trigger is on users, BEFORE UPDATE FOR EACH ROW, every column, no WHEN, enabled, SECURITY INVOKER, body pinned',
      :'guard_ok', 'true',
      CASE WHEN :'guard_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (10, '10. no staff row in any tenant names a role of another tenant',
      :'foreign_role_rows', '0',
      CASE WHEN :foreign_role_rows <> 0 THEN 'FAIL'
           WHEN :'foreign_role_possible' = 'false' THEN 'VACUOUS' ELSE 'OK' END),
  (11, '11. login still resolves: the token hook returns the actor''s tenant and role',
      :'hook_ok', 'true',
      CASE WHEN :'hook_ok' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (12, '12. users UPDATE WITH CHECK admits exactly the rule''s candidate new rows (own tenant; own row, or any for owner or admin; a role of the own tenant, owner for an owner only)',
      :'a_chk_n' || ' of ' || :'all_cands' || ' candidates, '
      || CASE WHEN :'a_chk_md5' = :'r_chk_md5' THEN 'the same rows' ELSE 'DIFFERENT rows' END,
      :'r_chk_n' || ' candidates, the same rows',
      CASE WHEN :'a_chk_md5' <> :'r_chk_md5' OR :a_chk_n <> :r_chk_n OR :r_chk_n = 0 THEN 'FAIL'
           WHEN :r_chk_n = :own_cands THEN 'VACUOUS' ELSE 'OK' END),
  (13, '13. no write on users, tenants or roles admits a row of another tenant: phantom rows, each given a tenant id no tenant has, are all refused',
      :'ph_admitted' || ' of ' || :'ph_rows' || ' phantom rows admitted'
      || CASE WHEN :'ph_which' = 'none' THEN '' ELSE ' (' || :'ph_which' || ')' END,
      '0 of ' || :'ph_rows' || ' admitted',
      CASE WHEN :ph_admitted = 0 AND :ph_rows > 0 THEN 'OK' ELSE 'FAIL' END)
)
SELECT n, "check", observed, expected, verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY. the verdict profile this run printed',
       (SELECT count(*) FROM r WHERE verdict = 'OK')      || ' OK / ' ||
       (SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
       (SELECT count(*) FROM r WHERE verdict = 'FAIL')    || ' FAIL',
       (SELECT count(*) FROM r) || ' arms', 'SUMMARY'
ORDER BY 1;

ROLLBACK;
