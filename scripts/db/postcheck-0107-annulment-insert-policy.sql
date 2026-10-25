-- 0107 POST-CHECK: the record_annulments INSERT policy (an annulment is written by the
-- owner, or by a therapist who authored the registo or treats or created its
-- patient, in their own name, for a signed registo of their tenant).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only.
--
-- EVERY VERDICT IS OK OR FAIL, and the SUMMARY row prints the profile:
--     N OK / K FAIL
-- Nineteen verdicts, 0 to 18: 19 OK / 0 FAIL. Nothing here has a zero comparand that could
-- read as a pass: every verdict compares a text, a shape or a value the
-- pre-check printed, and the two row verdicts compare a count AND an md5.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only`, so the server is what refuses a write; verdict 0 reads FAIL
-- if it is run outside one. It prints FAIL rows and exits 0: the block counts the
-- verdicts and stops on any FAIL and on an OK count that is not 19.
--
-- THE MIGRATION (packages/db/migrations/0107_record_annulments_insert_policy.sql,
-- sha256 56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a,
-- journal when 1788502800000) is the two SET LOCAL lines and one ALTER POLICY.
-- So this file proves that the one expression is the ruled one, by exact text,
-- that nothing else moved, and that the journal holds it:
--   0      the transaction is READ ONLY;
--   1      the session is `postgres`. CONTROL: `authenticated` is no member of it;
--   2      the session reads this table past its policies. CONTROL: `authenticated`
--          does not;
--   3      the table is owned by `postgres`, row level security ENABLED and not
--          FORCED, no trigger. CONTROL: clinical_records has its trigger;
--   4      THE INSERT POLICY IS THE RULED ONE, BY EXACT TEXT: the same name, FOR
--          INSERT, PERMISSIVE, TO authenticated, no USING, and its WITH CHECK
--          equal, character for character, to Postgres 17's rendering of the
--          migration's expression;
--   5      the SELECT policy is exactly as 0035 left it; two policies on the
--          table, none RESTRICTIVE, none for UPDATE or DELETE;
--   6      clinical_records_select, which the expression reads registos through,
--          is as 0096 left it;
--   7      the privileges on the table are what they were: `authenticated`
--          DELETE, INSERT, SELECT, UPDATE; `anon` and `patient` nothing; no column
--          grant. CONTROL: the owner holds all eight;
--   8      the functions the expression calls are as the migrations left them
--          (jwt_tenant_id(), jwt_role() and clinical_therapist_sees_patient(uuid),
--          each by its flags, owner, EXECUTE for `authenticated` and body md5),
--          and auth.uid() is executable. CONTROL: a planted name;
--   9      the server is Postgres 17 and the four roles exist;
--   10-16  EVERY CARRY OF THE PRE-CHECK IS UNCHANGED: the number of policies in
--          the database, the md5 over every OTHER policy, the md5 over every
--          function in `public`, the SECURITY DEFINER count, the md5 over every
--          relation privilege in `public`, and the table's row count and row md5.
--          Each is passed in with -v from the pre-check's transcript; this file
--          refuses to guess one;
--   17     0107 IS IN THE JOURNAL ONCE, BY HASH, AS THE NEWEST ROW (the highest
--          id), at its journal when 1788502800000. CONTROL: the same count finds
--          0106's hash once. The journal is read by a DO block, by name: a
--          database without one reads FAIL here and every other verdict prints;
--   18     THE JOURNAL MOVED BY EXACTLY ONE: its rows are journal_rows_before
--          plus one.
--
-- A FAIL IN 15 OR 16 THAT IS NOT THE MIGRATION'S. The migration writes no row.
-- A row added between the pre-check and this read (an annulment made by staff
-- while the sitting ran) moves both: the block then says the state is UNKNOWN,
-- and the lead reads the other verdicts.
--
-- WHAT IT DOES NOT PROVE. Who the policy admits and refuses is behaviour, and a
-- READ ONLY transaction cannot attempt an INSERT. The DB-gated suites hold those
-- arms, as assigned principals: packages/db/tests/record-annulments-insert-policy.db.test.ts
-- and apps/web/lib/clinical/annul-record.db.test.ts.
--
-- Run (every -v is a CARRY row of the pre-check, same sitting; the apply
-- document's stage 2 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -v journal_rows_before=<n>
--        -v policies_before=<n> -v other_policies_md5=<md5> -v functions_md5=<md5>
--        -v secdef_before=<n> -v relation_acl_md5=<md5>
--        -v annulments_rows=<n> -v annulments_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0107-annulment-insert-policy.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing (the pre-check''s verdict 13 row). This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?functions_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v functions_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v secdef_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?relation_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v relation_acl_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?annulments_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v annulments_rows is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?annulments_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v annulments_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif

SET LOCAL row_security = off;
-- The same search_path as the pre-check, so every expression renders the same way.
SET LOCAL search_path = public;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 17 and 18 instead of ending the file before any other verdict.
DO $journal$
DECLARE
  v_rows   integer;
  v_new    integer;
  v_prev   integer;
  v_hash   text;
  v_when   text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('annulpol.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a',
          '2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('annulpol.journal', 'read', true);
  PERFORM set_config('annulpol.journal_rows', v_rows::text, true);
  PERFORM set_config('annulpol.has_new', v_new::text, true);
  PERFORM set_config('annulpol.has_prev', v_prev::text, true);
  PERFORM set_config('annulpol.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('annulpol.newest_when', coalesce(v_when, ''), true);
END
$journal$;

\echo ''
\echo '=== 0107 ANNULMENT INSERT POLICY POST-CHECK: every verdict must read OK (19 expected); the SUMMARY row prints the profile ==='

WITH ruled (chk) AS (
  -- Postgres 17's rendering of the migration's WITH CHECK, read on the build
  -- lane's local stack (17.6) with search_path = public. The line breaks are the
  -- renderer's.
  SELECT $ruled$((tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id)) AND (annulled_by_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clinical_records r
  WHERE ((r.id = record_annulments.record_id) AND (r.tenant_id = record_annulments.tenant_id) AND (r.status = 'signed'::record_status) AND ((( SELECT jwt_role() AS jwt_role) = 'owner'::text) OR ((( SELECT jwt_role() AS jwt_role) = 'therapist'::text) AND ((r.practitioner_id = ( SELECT auth.uid() AS uid)) OR clinical_therapist_sees_patient(r.patient_id))))))))$ruled$::text
), pol AS (
  SELECT p.polname::text AS polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         pg_get_expr(p.polqual, p.polrelid)      AS qual,
         pg_get_expr(p.polwithcheck, p.polrelid) AS chk
    FROM pg_policy p
   WHERE p.polrelid = 'public.record_annulments'::regclass
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), verbs (verb) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
), fn_wanted (sig) AS (
  VALUES ('public.jwt_tenant_id()'), ('public.jwt_role()'), ('public.clinical_therapist_sees_patient(uuid)')
), fn_shape AS (
  SELECT w.sig,
         CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
           || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
           || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
           || ' ' || md5(p.prosrc) AS shape
    FROM fn_wanted w
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(w.sig)
), j AS (
  SELECT
    coalesce(current_setting('annulpol.journal', true), 'not read')                            AS journal_state,
    nullif(current_setting('annulpol.journal_rows', true), '')::int                             AS journal_rows,
    nullif(current_setting('annulpol.has_new', true), '')::int                                  AS has_0107,
    nullif(current_setting('annulpol.has_prev', true), '')::int                                 AS has_0106,
    current_setting('annulpol.newest_hash', true)                                               AS newest_hash,
    current_setting('annulpol.newest_when', true)                                               AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper
             OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c
      WHERE r.rolname = current_user AND c.oid = 'public.record_annulments'::regclass)          AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper
             OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c
      WHERE r.rolname = 'authenticated' AND c.oid = 'public.record_annulments'::regclass)       AS auth_past_rls,
    (SELECT pg_get_userbyid(c.relowner) || ' rls=' || c.relrowsecurity::text || ' forced=' || c.relforcerowsecurity::text
       FROM pg_class c WHERE c.oid = 'public.record_annulments'::regclass)                      AS table_shape,
    (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgrelid = 'public.record_annulments'::regclass AND NOT t.tgisinternal)           AS table_triggers,
    (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgrelid = 'public.clinical_records'::regclass AND NOT t.tgisinternal
        AND t.tgname = 'clinical_records_enforce_immutability')                                 AS trigger_control,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' USING ' || coalesce(qual, '-')
       FROM pol WHERE polname = 'record_annulments_tenant_insert')                              AS insert_shape,
    (SELECT chk FROM pol WHERE polname = 'record_annulments_tenant_insert')                     AS insert_chk,
    (SELECT chk FROM ruled)                                                                     AS ruled_chk,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' USING ' || coalesce(qual, '-') || ' CHECK ' || coalesce(chk, '-')
       FROM pol WHERE polname = 'record_annulments_tenant_select')                              AS select_pol,
    (SELECT count(*)::int FROM pol)                                                             AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                                        AS restrictive_pols,
    (SELECT count(*)::int FROM pol WHERE cmd NOT IN ('a', 'r'))                                 AS write_pols,
    (SELECT p.polcmd::text || '/' || p.polpermissive::text || '/'
            || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
            || ' ' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
       FROM pg_policy p
      WHERE p.polrelid = 'public.clinical_records'::regclass AND p.polname = 'clinical_records_select') AS registo_select,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('authenticated', 'public.record_annulments', v.verb))           AS auth_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('anon', 'public.record_annulments', v.verb))                    AS anon_privs,
    (SELECT coalesce(string_agg(v.verb, ',' ORDER BY v.verb), 'none') FROM verbs v
      WHERE has_table_privilege('patient', 'public.record_annulments', v.verb))                 AS patient_privs,
    (SELECT count(*)::int FROM verbs v
      WHERE has_table_privilege('postgres', 'public.record_annulments', v.verb))                AS owner_privs,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.record_annulments'::regclass AND a.attacl IS NOT NULL AND NOT a.attisdropped) AS column_grants,
    (SELECT string_agg(sig || ' ' || coalesce(shape, 'absent'), ' ; ' ORDER BY sig) FROM fn_shape) AS helper_shapes,
    (to_regprocedure('auth.uid()') IS NOT NULL
      AND coalesce(has_function_privilege('authenticated', to_regprocedure('auth.uid()'), 'EXECUTE'), false)) AS uid_ok,
    (to_regprocedure('public.no_such_function_annulpol()') IS NULL)                             AS planted_fn_absent,
    current_setting('server_version_num')::int                                                  AS server_num,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'service_role'))                   AS roles_named,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (p.polrelid = 'public.record_annulments'::regclass
                 AND p.polname = 'record_annulments_tenant_insert'))                            AS other_pol_md5,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')  AS fn_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT count(*)::int FROM public.record_annulments)                                        AS annulments_rows,
    (SELECT md5(coalesce(string_agg(md5((a.*)::text), '' ORDER BY a.id), ''))
       FROM public.record_annulments a)                                                         AS annulments_md5
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. this session reads record_annulments past its policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unreadable') || '; control ' || coalesce(auth_past_rls::text, 'unreadable'),
         'true; control false',
         CASE WHEN coalesce(me_past_rls, false) AND auth_past_rls IS NOT DISTINCT FROM false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. the table is owned by postgres, row level security ENABLED and not FORCED, no trigger (control: clinical_records has its trigger)',
         coalesce(table_shape, 'absent') || ', ' || table_triggers::text || ' triggers; control ' || trigger_control::text,
         'postgres rls=true forced=false, 0 triggers; control 1',
         CASE WHEN table_shape = 'postgres rls=true forced=false' AND table_triggers = 0 AND trigger_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. the INSERT policy is the ruled one: same name, FOR INSERT, PERMISSIVE, TO authenticated, no USING, WITH CHECK by exact text',
         coalesce(insert_shape, 'absent') || ' CHECK ' || coalesce(insert_chk, '-'),
         'a/true/authenticated USING - CHECK ' || ruled_chk,
         CASE WHEN insert_shape = 'a/true/authenticated USING -' AND insert_chk IS NOT NULL AND insert_chk = ruled_chk
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the SELECT policy is exactly as 0035 left it; two policies on the table, none RESTRICTIVE, none for UPDATE or DELETE',
         coalesce(select_pol, 'absent') || '; ' || table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive, '
           || write_pols::text || ' for another command',
         'r/true/authenticated USING (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id)) CHECK -; 2 policies, 0 restrictive, 0 for another command',
         CASE WHEN select_pol = 'r/true/authenticated USING (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id)) CHECK -'
               AND table_pols = 2 AND restrictive_pols = 0 AND write_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. clinical_records_select, which the expression reads registos through, is as 0096 left it',
         coalesce(registo_select, 'absent'),
         'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342',
         CASE WHEN registo_select = 'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. privileges on the table: authenticated DELETE,INSERT,SELECT,UPDATE; anon none; patient none; no column grant (control: the owner holds all eight)',
         'authenticated ' || auth_privs || '; anon ' || anon_privs || '; patient ' || patient_privs || '; '
           || column_grants::text || ' column grants; control ' || owner_privs::text,
         'authenticated DELETE,INSERT,SELECT,UPDATE; anon none; patient none; 0 column grants; control 8',
         CASE WHEN auth_privs = 'DELETE,INSERT,SELECT,UPDATE' AND anon_privs = 'none' AND patient_privs = 'none'
               AND column_grants = 0 AND owner_privs = 8 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. every function the expression calls is as the migrations left it, and auth.uid() is executable (control: a planted name)',
         coalesce(helper_shapes, 'absent') || ' ; auth.uid() ' || uid_ok::text || '; control ' || planted_fn_absent::text,
         'public.clinical_therapist_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; '
           || 'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
           || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b'
           || ' ; auth.uid() true; control true',
         CASE WHEN helper_shapes =
                   'public.clinical_therapist_sees_patient(uuid) DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; '
           || 'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
                || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b'
               AND uid_ok AND planted_fn_absent THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. the server is Postgres 17, where every pinned rendering was read, and the four roles exist',
         server_num::text || ', ' || roles_named::text || ' roles', '170000 to 179999, 4 roles',
         CASE WHEN server_num BETWEEN 170000 AND 179999 AND roles_named = 4 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. policies in the database: the number the pre-check carried (none created, none dropped)',
         policies::text, :'policies_before',
         CASE WHEN policies::text = :'policies_before' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. every OTHER policy in the database: the md5 the pre-check carried',
         other_pol_md5, :'other_policies_md5',
         CASE WHEN other_pol_md5 ~ '^[0-9a-f]{32}$' AND other_pol_md5 = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. every function in public: the md5 the pre-check carried',
         fn_md5, :'functions_md5',
         CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' AND fn_md5 = :'functions_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. SECURITY DEFINER functions in public: the number the pre-check carried',
         secdef::text, :'secdef_before',
         CASE WHEN secdef::text = :'secdef_before' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. every relation privilege in public: the md5 the pre-check carried',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' AND rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 15, '15. the table''s rows: the count the pre-check carried',
         annulments_rows::text, :'annulments_rows',
         CASE WHEN annulments_rows::text = :'annulments_rows' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 16, '16. the table''s rows: the md5 the pre-check carried (no row written, changed or removed)',
         annulments_md5, :'annulments_md5',
         CASE WHEN annulments_md5 ~ '^[0-9a-f]{32}$' AND annulments_md5 = :'annulments_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 17, '17. 0107 is in the journal once, by hash, as the newest row, at its journal when (control: the same count finds 0106 once)',
         CASE WHEN journal_state = 'read'
              THEN has_0107::text || ' row, newest ' || CASE WHEN newest_hash = '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a' THEN 'is 0107' ELSE 'is NOT 0107' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_0106::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0107, when 1788502800000; control 1',
         CASE WHEN journal_state = 'read' AND has_0107 = 1 AND has_0106 = 1
                   AND newest_hash = '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a'
                   AND newest_when = '1788502800000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 18, '18. the journal moved by exactly one: its rows are the pre-check''s plus one',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END,
         (:journal_rows_before + 1)::text,
         CASE WHEN journal_state = 'read' AND journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text   || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text || ' FAIL',
         '19 OK / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: the policies on record_annulments as the catalogue describes them ==='
SELECT p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p
 WHERE p.polrelid = 'public.record_annulments'::regclass
 ORDER BY 1;
