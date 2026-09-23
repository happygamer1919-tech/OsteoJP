-- 0093 RGPD-01 BEHAVIOUR CHECK. READ ONLY. Run BEFORE and AFTER 0093 is applied.
--
-- 0093 creates public.patient_rgpd_acceptances: append-only, tenant-scoped,
-- with recorded_by pinned to the acting user. This file proves what a real staff
-- member's session can and cannot do with it, on the database it is run against,
-- by impersonation (flat claims tenant_id, user_role, sub, then SET LOCAL ROLE
-- authenticated), inside one READ ONLY REPEATABLE READ transaction.
--
-- ===========================================================================
-- THE VERDICT CONTRACT. THREE VALUES, AND A PROFILE.
-- ===========================================================================
-- Every arm prints OK, VACUOUS or FAIL, and the last row prints
--     N OK / M VACUOUS / K FAIL
-- An arm with a vacuous branch tests FAIL first, then VACUOUS, then OK, so a
-- zero comparand never prints OK and never hides a FAIL. The caller asserts the
-- exact profile it expects, and says why:
--   BEFORE the apply the table does not exist, so every table arm FAILS:
--       2 OK / 0 VACUOUS / 5 FAIL, failing on R2 R3 R4 R5 R6.
--   AFTER the apply on production the table ships EMPTY and production holds
--   one tenant, so R2 and R3 have zero comparands and read VACUOUS:
--       5 OK / 2 VACUOUS / 0 FAIL.
--   With rows present (the rehearsal loads them) all seven read OK.
--
-- WHAT A READ ONLY CHECK CANNOT MEASURE, stated so a green run is not read as
-- covering it: an INSERT, and therefore the recorded_by pin in action. No
-- production write is allowed, not even a rolled-back one. The pin is proven
-- here as a SHAPE (R5 reads the INSERT policy's WITH CHECK), again as a shape by
-- packages/db/tests/patient-rgpd-acceptances.db.test.ts in CI's DB-gated job
-- (which runs now that 0093 is a numbered migration CI applies), and IN ACTION
-- only by the rehearsal in docs/migration-apply-0093.md, which inserts on a
-- throwaway.
--
-- THE ARMS
--   0   the transaction is READ ONLY and REPEATABLE READ.
--   R1  the session IS the named actor: auth.uid(), jwt_tenant_id() and
--       jwt_role() answer for the claims this file set. A mismatch also STOPs
--       before anything else is read.
--   R2  the actor reads EXACTLY their tenant's consent rows: the count under RLS
--       equals the count outside RLS. VACUOUS when the tenant has none.
--   R3  the actor reads NO row of another tenant. VACUOUS when no other tenant
--       has a row.
--   R4  APPEND-ONLY, at the privilege layer: authenticated holds no UPDATE,
--       DELETE or TRUNCATE on the table (Supabase's default privileges would
--       grant all three; the migration's REVOKE takes them back).
--   R5  the positive control for R4: authenticated holds SELECT and INSERT, and
--       the INSERT policy's WITH CHECK pins recorded_by to auth.uid().
--   R6  the portal patient role holds no privilege on the table.
--
-- IT PRINTS COUNTS AND VERDICTS AND NOTHING ELSE. No name, no patient id.
--
-- THE ACTOR IS PASSED, NOT CHOSEN: -v actor_id=<an active staff user>. It is
-- verified (active, not a shared resource, holds a role) and its id re-read from
-- the table, so an upper-case uuid cannot trip the identity check.

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
\echo '=== 0093 RGPD-01 BEHAVIOUR CHECK. READ ONLY. 7 arms, profile printed last ==='

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

SELECT to_regclass('public.patient_rgpd_acceptances') IS NOT NULL AS tbl_present \gset

/* THE COMPARANDS, outside RLS. Only when the table exists: before 0093 there is
 * nothing to count, and the table arms below read FAIL, not an ERROR. */
\if :tbl_present
SELECT count(*) FILTER (WHERE tenant_id = :'actor_tenant'::uuid)::int  AS own_total,
       count(*) FILTER (WHERE tenant_id <> :'actor_tenant'::uuid)::int AS other_total
  FROM public.patient_rgpd_acceptances \gset
SELECT has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'UPDATE')::text   AS a_upd,
       has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'DELETE')::text   AS a_del,
       has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'TRUNCATE')::text AS a_trunc,
       has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'SELECT')::text   AS a_sel,
       has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'INSERT')::text   AS a_ins,
       (has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'SELECT')
        OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'INSERT')
        OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'UPDATE')
        OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'DELETE'))::text   AS patient_any,
       coalesce((SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%recorded_by = %auth.uid()%'
                   FROM pg_policy pol WHERE pol.polname = 'patient_rgpd_acceptances_tenant_insert'), false)::text AS pin_present \gset
\else
\set own_total -1
\set other_total -1
\set a_upd unknown
\set a_del unknown
\set a_trunc unknown
\set a_sel unknown
\set a_ins unknown
\set patient_any unknown
\set pin_present unknown
\endif

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
\if :tbl_present
SELECT count(*) FILTER (WHERE tenant_id = :'actor_tenant'::uuid)::int  AS own_read,
       count(*) FILTER (WHERE tenant_id <> :'actor_tenant'::uuid)::int AS other_read
  FROM public.patient_rgpd_acceptances \gset
\else
\set own_read -1
\set other_read -1
\endif
RESET ROLE;

WITH r(n, "check", observed, expected, verdict) AS (VALUES
  (0, '0. this transaction is READ ONLY and REPEATABLE READ',
      current_setting('transaction_read_only') || ' / ' || current_setting('transaction_isolation'),
      'on / repeatable read',
      CASE WHEN current_setting('transaction_read_only') = 'on'
            AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END),
  (1, 'R1. the session IS the named actor (uid, tenant and role all answer for the claims set)',
      CASE WHEN :'identity_matches' = 'true' THEN 'the named actor' ELSE 'SOMEBODY ELSE' END,
      'the named actor',
      CASE WHEN :'identity_matches' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (2, 'R2. the actor reads exactly their tenant''s consent rows',
      CASE WHEN :own_total < 0 THEN 'the table is absent' ELSE :'own_read' || ' read of ' || :'own_total' END,
      'all of them',
      CASE WHEN :own_total < 0 THEN 'FAIL'
           WHEN :own_read <> :own_total THEN 'FAIL'
           WHEN :own_total = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (3, 'R3. the actor reads no row of another tenant',
      CASE WHEN :other_total < 0 THEN 'the table is absent' ELSE :'other_read' || ' read of ' || :'other_total' || ' that exist' END,
      '0 read',
      CASE WHEN :other_total < 0 THEN 'FAIL'
           WHEN :other_read <> 0 THEN 'FAIL'
           WHEN :other_total = 0 THEN 'VACUOUS' ELSE 'OK' END),
  (4, 'R4. APPEND-ONLY: authenticated holds no UPDATE, DELETE or TRUNCATE',
      'U=' || :'a_upd' || ' D=' || :'a_del' || ' T=' || :'a_trunc',
      'U=false D=false T=false',
      CASE WHEN :'a_upd' = 'false' AND :'a_del' = 'false' AND :'a_trunc' = 'false' THEN 'OK' ELSE 'FAIL' END),
  (5, 'R5. CONTROL for R4: authenticated holds SELECT and INSERT, and the INSERT pins recorded_by = auth.uid()',
      'S=' || :'a_sel' || ' I=' || :'a_ins' || ' pin=' || :'pin_present',
      'S=true I=true pin=true',
      CASE WHEN :'a_sel' = 'true' AND :'a_ins' = 'true' AND :'pin_present' = 'true' THEN 'OK' ELSE 'FAIL' END),
  (6, 'R6. the portal patient role holds no privilege on the table',
      :'patient_any', 'false',
      CASE WHEN :'patient_any' = 'false' THEN 'OK' ELSE 'FAIL' END)
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
