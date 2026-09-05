-- ===================================================================
-- 0079 POST-CHECK. READ-ONLY. Run AFTER `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v expected_before=76 -f scripts/0079-postcheck.sql
--
-- `expected_before` is the journal row count the PRE-CHECK printed.
--
-- IT ASKS `has_function_privilege`, NOT "is there a service_role= ACLITEM".
-- That difference is the whole reason 0079 exists in the shape it does. The
-- first draft revoked service_role BY NAME on all twenty and a catalogue read
-- looking for a `service_role=` grantee reported all twenty clean; eleven of
-- them still carried `=X/postgres`, which is PUBLIC, and every role is a member
-- of PUBLIC. The named check could not see the grant because the grant is not
-- made to a name. has_function_privilege answers the question that is actually
-- being asked - CAN this role execute this function - and cannot be fooled by
-- which side of the ACL the privilege arrived on.
--
-- THE PAGER IS OFF IN THIS FILE, not only on the command line. See the head of
-- scripts/0075-precheck.sql: a check whose result cannot be copied out of the
-- terminal is a check nobody ran.
--
-- 0078 AND 0075 ARE RE-ASSERTED UNCHANGED, so a migration that rewrote history
-- beneath itself cannot pass a forward-looking check alone.

\pset pager off
\pset format aligned
\pset title '0079 POST-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'POST-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT =
        'That is the journal drizzle-kit migrate writes. A database lacking it has '
        'never been migrated by drizzle-kit. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal = before + 1'       AS check,
       count(*)::text               AS observed,
       (:expected_before + 1)::text AS expected,
       CASE WHEN count(*) = :expected_before + 1 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
-- IDENTITY IS THE FILE HASH, NEVER `id`. `id` is a SERIAL - the count of
-- migrations applied - and it stopped matching the tag at the 0076/0077 gap.
-- On production there are 76 rows before this apply and 77 after, while the tag
-- is 0079. An assertion of "max id = 79" would fail on a CORRECT apply, and the
-- first draft of this file contained exactly that. Rehearsing against a journal
-- seeded to production's real position is what caught it.
SELECT '0079 is applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0078 UNCHANGED BENEATH IT, so a migration that rewrote history cannot pass a
-- purely forward-looking check.
SELECT '0078 still applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '68334d6a822088f2ecb591a4f9ece426fe48c0cb7c1a1128057074ca79a71864')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '68334d6a822088f2ecb591a4f9ece426fe48c0cb7c1a1128057074ca79a71864')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT '0075 still applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE ROWS THAT DECIDE. Effective privilege, per role, over the whole
-- SECURITY DEFINER set - not a list of twenty names this file could
-- get out of step with.
-- ==================================================================
SELECT 'service_role can execute NONE',
       count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE'))::text,
       '0',
       CASE WHEN count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) = 0
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef

UNION ALL
SELECT 'anon can execute NONE',
       count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))::text,
       '0',
       CASE WHEN count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) = 0
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef

UNION ALL
-- THE OTHER DIRECTION. A migration that revoked from everybody would pass both
-- rows above and take the clinic's own application down with it.
SELECT 'authenticated keeps the rest',
       count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text,
       '18',
       CASE WHEN count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 18
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   -- The two exceptions: 0002 revokes the hook from authenticated by name, and
   -- assign_patient_number is a TRIGGER function that needs no EXECUTE at all.
   AND p.proname NOT IN ('custom_access_token_hook', 'assign_patient_number', 'jwt_patient_id')

UNION ALL
SELECT 'auth admin keeps the token hook',
       has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')::text,
       'true',
       CASE WHEN has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook'

UNION ALL
SELECT 'patient keeps the portal three',
       count(*) FILTER (WHERE has_function_privilege('patient', p.oid, 'EXECUTE'))::text,
       '3',
       CASE WHEN count(*) FILTER (WHERE has_function_privilege('patient', p.oid, 'EXECUTE')) = 3
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('jwt_tenant_id', 'jwt_patient_id', 'is_unconfirmed_pedido')

UNION ALL
-- NO FUNCTION MAY HAVE A NULL ACL. A null proacl is the built-in default, under
-- which PUBLIC has EXECUTE and nothing was ever revoked - the dangerous state
-- read-security-definer-acls.sql names, and the one a REVOKE cannot produce but
-- a later CREATE FUNCTION can.
SELECT 'no SECURITY DEFINER has a null acl',
       count(*) FILTER (WHERE p.proacl IS NULL)::text,
       '0',
       CASE WHEN count(*) FILTER (WHERE p.proacl IS NULL) = 0 THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef

UNION ALL
SELECT '0078 policy unchanged',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='appointments'
                            AND policyname='appointments_rls'
                            AND qual LIKE '%viewer_location_ids%')
            THEN 'present' ELSE 'MISSING' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='appointments'
                            AND policyname='appointments_rls'
                            AND qual LIKE '%viewer_location_ids%')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT '0075 reminder_dispatch_tenant intact',
       CASE WHEN to_regprocedure('public.reminder_dispatch_tenant(text)') IS NOT NULL
            THEN 'present' ELSE 'MISSING' END,
       'present',
       CASE WHEN to_regprocedure('public.reminder_dispatch_tenant(text)') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END;
