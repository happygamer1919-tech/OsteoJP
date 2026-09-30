-- ============================================================================
-- 0097 (the clinical_records write policies follow the permission matrix):
-- POST-CHECK. READ ONLY. Every verdict must read OK (15 expected).
--
-- Renumbered by the fifth renumbering, owner and lead, 2026-09-30: this file
-- was postcheck-0099-registo-writes.sql. The migration's bytes did not change,
-- so every pin below is the one it carried before; only the numbers in the
-- text moved. The function's own COMMENT, which the migration writes into the
-- catalogue, still opens with "0099": the file is never edited for a rename.
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0097_clinical_records_write_matrix: THREE write policies of clinical_records
-- were ALTERED in place, ONE function was CREATED, and nothing else moved.
-- Every verdict here is a catalogue read. The behaviour is proven elsewhere:
-- scripts/db/behaviour-registo-writes-readonly.sql on the database this was
-- applied to, and the in-action arms of the rehearsal (writes, which no READ
-- ONLY check can make).
--
-- THE FIVE CARRIES COME FROM THE PRE-CHECK OF THE SAME SITTING (SR-59).
--
-- EXACT, NOT "LOOKS LIKE". Every policy expression is compared by md5 to the
-- text Postgres 17 renders for it, as 0093's, 0094's and 0096's post-checks
-- do; the expected values were read on the rehearsal database after the
-- apply. A LIKE would pass `... OR true`; this does not.
--
-- THE THREE NEW EXPRESSIONS, as the migration writes them
-- (packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql,
-- section 7), rendered by Postgres 17 as:
--   clinical_records_insert   b29103acdd113bb10d23b45556707fb2  (WITH CHECK)
--   clinical_records_update   1170825c999f154fc35dab5217ba9548  (USING)
--                             b29103acdd113bb10d23b45556707fb2  (WITH CHECK)
--   clinical_records_delete   1170825c999f154fc35dab5217ba9548  (USING)
-- Two texts, each rendered twice. UPDATE's USING and DELETE's USING: the
-- owner arm, or a therapist who is the registo's author. INSERT's and
-- UPDATE's WITH CHECK: the owner arm, or a therapist who is the author of
-- the new row, for a patient they treat or created.
-- THE NEW FUNCTION, public.claim_ai_draft_authorship(uuid):
--   one argument, RETURNS boolean, LANGUAGE plpgsql, SECURITY DEFINER,
--   VOLATILE, search_path=public, owned by postgres, body (prosrc) md5
--   b8095495c969750b89e2988ce4cd669d; EXECUTE for authenticated, and for
--   neither anon, service_role, patient nor PUBLIC.
--
-- "NO OTHER FUNCTION CHANGED" IS MEASURED WITHOUT THE NEW ONE, as 0096's
-- post-check measures it: the pre-check's functions_md5 and grants_md5 were
-- read before the function existed; this file recomputes both over the same
-- rows, leaving out the one function 0097 creates. With the new function
-- present exactly once (verdict 11), that is also the proof that the SECURITY
-- DEFINER count in public moved by exactly one.
--
-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION. The apply stage wraps it in
-- `-c "begin read only" ... -c "rollback"`, so the server refuses any write.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<pre> -v other_policies_md5=<pre>
--        -v functions_md5=<pre> -v grants_md5=<pre> -v journal_rows_before=<pre>
--        -c "begin read only" -f scripts/db/postcheck-0097-registo-writes.sql -c "rollback"
-- ============================================================================

\if :{?policies_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v policies_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?functions_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v functions_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?grants_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v grants_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0097 REGISTO WRITE MATRIX POST-CHECK - every verdict must read OK (15 expected) ==='

WITH pol AS (
  SELECT c.relname, p.polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'clinical_records'
), nf AS (
  -- THE NEW FUNCTION, every row by that name in public (verdict 11 requires one).
  SELECT p.oid, p.pronargs, format_type(p.prorettype, NULL) AS rettype, l.lanname,
         p.prosecdef, p.provolatile::text AS volatile, coalesce(array_to_string(p.proconfig, ','), '') AS config,
         pg_get_userbyid(p.proowner) AS owner, md5(p.prosrc) AS body_md5, p.proacl IS NOT NULL AS acl_present,
         p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'claim_ai_draft_authorship'
), t AS (
  SELECT
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_insert')                              AS new_insert,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_update')                              AS new_update,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'clinical_records_delete')                              AS new_delete,
    (SELECT md5(string_agg(relname || '.' || polname || ':' || cmd || ':' || permissive::text || ':' || to_roles
                           || ':' || qual_md5 || ':' || check_md5, ';' ORDER BY relname, polname))
       FROM pol WHERE polname NOT IN ('clinical_records_insert', 'clinical_records_update',
                                      'clinical_records_delete'))                       AS two_md5,
    (SELECT count(*)::int FROM pol)                                                    AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                               AS restrictive_pols,
    (SELECT string_agg(tg.tgname || ' type=' || tg.tgtype::text || ' enabled=' || tg.tgenabled::text
                       || ' cols=' || CASE WHEN tg.tgattr::text = '' THEN 'all' ELSE tg.tgattr::text END
                       || ' when=' || CASE WHEN tg.tgqual IS NULL THEN 'none' ELSE 'SET' END
                       || ' fn=' || f.proname || ' ' || md5(f.prosrc), ' ; ' ORDER BY tg.tgname)
       FROM pg_trigger tg JOIN pg_proc f ON f.oid = tg.tgfoid
      WHERE tg.tgrelid = 'public.clinical_records'::regclass AND NOT tg.tgisinternal)  AS triggers,
    (SELECT string_agg(CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
                       || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
                       || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
                       || ' ' || md5(p.prosrc), ' ; ')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'clinical_therapist_sees_patient')    AS sees_shape,
    (SELECT count(*)::int FROM nf)                                                     AS nf_n,
    (SELECT 'sig=' || signature || ' returns=' || rettype || ' lang=' || lanname
            || ' secdef=' || prosecdef::text || ' volatile=' || volatile || ' config=' || config
            || ' owner=' || owner || ' body=' || body_md5 FROM nf LIMIT 1)             AS nf_shape,
    (SELECT 'authenticated=' || has_function_privilege('authenticated', oid, 'EXECUTE')::text
            || ' anon=' || has_function_privilege('anon', oid, 'EXECUTE')::text
            || ' service_role=' || has_function_privilege('service_role', oid, 'EXECUTE')::text
            || ' patient=' || has_function_privilege('patient', oid, 'EXECUTE')::text
            || ' acl_present=' || acl_present::text
            || ' public_execute=' || (SELECT count(*) FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = nf.oid)) a
                                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')::text
       FROM nf LIMIT 1)                                                                 AS nf_exec,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clinical_records' AND c.relrowsecurity) AS rls_on,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies_now,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname))
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (n.nspname = 'public' AND c.relname = 'clinical_records'
                 AND p.polname IN ('clinical_records_insert', 'clinical_records_update',
                                   'clinical_records_delete')))                         AS other_md5_now,
    -- The pre-check's functions md5, over every function EXCEPT the new one.
    (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                           || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':'
                           || coalesce(array_to_string(p.proconfig, ','), ''),
                           ';' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname <> 'claim_ai_draft_authorship')          AS functions_md5_now,
    -- The pre-check's grants md5, with the new function's ACL left out.
    (SELECT md5(
              coalesce((SELECT string_agg(c.relname || ':' || coalesce(c.relacl::text, 'default'), ';' ORDER BY c.relname)
                          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')), '')
              || '|' ||
              coalesce((SELECT string_agg(c.relname || '.' || a.attname || ':' || a.attacl::text, ';' ORDER BY c.relname, a.attname)
                          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND a.attacl IS NOT NULL AND NOT a.attisdropped), '')
              || '|' ||
              coalesce((SELECT string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'default'), ';'
                                          ORDER BY p.oid::regprocedure::text)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public'
                           AND p.proname <> 'claim_ai_draft_authorship'), '')))          AS grants_md5_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318')  AS has_0097,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1) AS newest_hash,
    (SELECT count(*)::int FROM pg_policies
      WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%claim_ai_draft_authorship%') AS naming_pols
)
SELECT '1. clinical_records_insert: FOR INSERT, PERMISSIVE, TO authenticated, WITH CHECK exactly 0097''s expression (owner; or a therapist, in their own name, for a patient they treat or created)' AS check,
       coalesce(new_insert, 'absent')                                 AS observed,
       'a/true/authenticated - b29103acdd113bb10d23b45556707fb2'      AS expected,
       CASE WHEN new_insert = 'a/true/authenticated - b29103acdd113bb10d23b45556707fb2' THEN 'OK' ELSE 'FAIL' END AS verdict FROM t
UNION ALL SELECT '2. clinical_records_update: FOR UPDATE, PERMISSIVE, TO authenticated, USING (owner; or the author) and WITH CHECK (owner; or the author, for a patient they treat or created) exactly 0097''s expressions',
       coalesce(new_update, 'absent'),
       'w/true/authenticated 1170825c999f154fc35dab5217ba9548 b29103acdd113bb10d23b45556707fb2',
       CASE WHEN new_update = 'w/true/authenticated 1170825c999f154fc35dab5217ba9548 b29103acdd113bb10d23b45556707fb2'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '3. clinical_records_delete: FOR DELETE, PERMISSIVE, TO authenticated, USING exactly 0097''s expression (owner; or the author)',
       coalesce(new_delete, 'absent'),
       'd/true/authenticated 1170825c999f154fc35dab5217ba9548 -',
       CASE WHEN new_delete = 'd/true/authenticated 1170825c999f154fc35dab5217ba9548 -' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '4. the two read policies on clinical_records are unchanged (the pre-check''s arm 4), five policies in all, none RESTRICTIVE',
       table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive, ' || coalesce(two_md5, 'absent'),
       '5 policies, 0 restrictive, ae6ad9a7c3ee236acebd22c1c952afe4',
       CASE WHEN table_pols = 5 AND restrictive_pols = 0 AND two_md5 = 'ae6ad9a7c3ee236acebd22c1c952afe4'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '5. the immutability trigger is untouched (the pre-check''s arm 5)',
       coalesce(triggers, 'none'),
       'clinical_records_enforce_immutability type=27 enabled=O cols=all when=none fn=enforce_clinical_record_immutability f0691f60a12af6eeb561ce369c18f0d5',
       CASE WHEN triggers = 'clinical_records_enforce_immutability type=27 enabled=O cols=all when=none fn=enforce_clinical_record_immutability f0691f60a12af6eeb561ce369c18f0d5'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '6. clinical_therapist_sees_patient is untouched (the pre-check''s arm 6)',
       coalesce(sees_shape, 'absent'),
       'DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186',
       CASE WHEN sees_shape = 'DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '7. the POLICY COUNT in the database did not move', policies_now::text, :'policies_before',
       CASE WHEN policies_now = :'policies_before'::int THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '8. every OTHER policy in the database is byte-identical (one md5 over all of them)',
       coalesce(other_md5_now, 'absent'), :'other_policies_md5',
       CASE WHEN other_md5_now = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '9. no function in public other than the new one changed',
       coalesce(functions_md5_now, 'absent'), :'functions_md5',
       CASE WHEN functions_md5_now = :'functions_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '10. no table, column or function grant in public changed, the new function''s own ACL aside',
       coalesce(grants_md5_now, 'absent'), :'grants_md5',
       CASE WHEN grants_md5_now = :'grants_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '11. the claim function exists ONCE: (uuid), boolean, plpgsql, SECURITY DEFINER, VOLATILE, search_path=public, owned by postgres, with 0097''s body',
       nf_n::text || ' found, ' || coalesce(nf_shape, 'absent'),
       '1 found, sig=claim_ai_draft_authorship(uuid) returns=boolean lang=plpgsql secdef=true volatile=v config=search_path=public owner=postgres body=b8095495c969750b89e2988ce4cd669d',
       CASE WHEN nf_n = 1
             AND nf_shape = 'sig=claim_ai_draft_authorship(uuid) returns=boolean lang=plpgsql secdef=true volatile=v config=search_path=public owner=postgres body=b8095495c969750b89e2988ce4cd669d'
            THEN 'OK' ELSE 'FAIL' END FROM t
-- THE POSITIVE CONTROL for the four refusals sits in the same row: a function
-- nobody may execute would satisfy the refusals and take the review claim down
-- with it. PUBLIC is read off the ACL (SR-52: it is not a role name
-- has_function_privilege accepts, and a NULL ACL means PUBLIC holds EXECUTE by
-- default).
UNION ALL SELECT '12. EXECUTE on the claim function: authenticated only (anon, service_role, patient and PUBLIC hold none)',
       coalesce(nf_exec, 'absent'),
       'authenticated=true anon=false service_role=false patient=false acl_present=true public_execute=0',
       CASE WHEN nf_exec = 'authenticated=true anon=false service_role=false patient=false acl_present=true public_execute=0'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '13. row level security is still ENABLED on clinical_records', rls_on::text, '1',
       CASE WHEN rls_on = 1 THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '14. 0097 is in the journal by hash, it is the newest row, and the journal moved by exactly one',
       has_0097::text || ' by hash, newest ' || CASE WHEN newest_hash = '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318'
                                                     THEN 'is 0097' ELSE 'is NOT 0097' END
       || ', journal ' || journal_rows_now::text,
       '1 by hash, newest is 0097, journal ' || (:'journal_rows_before'::int + 1)::text,
       CASE WHEN has_0097 = 1
             AND newest_hash = '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318'
             AND journal_rows_now = :'journal_rows_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '15. no policy in the database names the claim function (it is called by the app''s claim, never by a policy)',
       naming_pols::text, '0',
       CASE WHEN naming_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM t;

\echo ''
\echo '=== FOR THE RECORD: the policies on clinical_records as the catalogue now describes them ==='

SELECT c.relname, p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'clinical_records'
 ORDER BY 1, 2;
