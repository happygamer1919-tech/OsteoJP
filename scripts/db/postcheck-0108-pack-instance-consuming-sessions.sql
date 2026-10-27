-- 0108 POST-CHECK: the pack read function (the consuming sessions of one pack
-- instance, for a caller with a staff role who may already see its patient).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- THIRTEEN VERDICTS. Twelve are OK or FAIL; verdict 6 (the function's answers,
-- called on production's own packs) is OK, VACUOUS or FAIL, and reads VACUOUS
-- exactly when there is no pack instance with a consuming visit to call it for.
-- The SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no FAIL": 13 OK / 0 VACUOUS / 0 FAIL
-- when the pre-check's probe_instances is above 0, and 12 OK / 1 VACUOUS /
-- 0 FAIL when it is 0. Stage 2 decides which from that carry, before it runs
-- this file.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only` (psql -c "begin read only" -f <this file> -c "rollback"), so
-- the server is what refuses a write; verdict 0 reads FAIL if it is run outside
-- one. It prints FAIL rows and exits 0: the block counts the verdicts.
--
-- THE MIGRATION (packages/db/migrations/0108_pack_instance_consuming_sessions.sql,
-- sha256 7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb)
-- creates public.pack_instance_consuming_sessions(uuid) and touches nothing
-- else. So:
--   0      the transaction is READ ONLY;
--   1      the session is `postgres`. CONTROL: `authenticated` is NOT a member;
--   2      THE FUNCTION IS THERE ONCE, by name, with exactly the signature and
--          the result the migration gives it:
--          pack_instance_consuming_sessions(p_pack_instance_id uuid) returning
--          TABLE(appointment_id uuid, starts_at timestamp with time zone);
--   3      ITS FLAGS AND ITS BODY: SECURITY DEFINER, STABLE, plpgsql, a set,
--          search_path=public, owned by postgres, and its body's md5 the one
--          read from the migration on the build lane's stack;
--   4      WHO MAY EXECUTE IT, by has_function_privilege, never by grepping
--          an ACL (0079): authenticated yes; anon, patient and service_role
--          no; and no ACL item for PUBLIC and no NULL (built-in default) ACL.
--          CONTROL: postgres, its owner, yes. The ACL itself is printed;
--   5      its comment is the migration's, by md5;
--   6      WHAT IT ANSWERS, on production's own packs, inside this READ ONLY
--          transaction: for each pack instance whose patient is of its own
--          tenant (patients joined on id AND tenant, as the function joins
--          it) and with at least one linked visit of that tenant that is not
--          cancelled (at most 20, by id; the pre-check's probe_instances
--          counts by the same terms), the claims are set, transaction-locally, to the owner of the
--          instance's tenant, and the function must return exactly that
--          instance's consuming visits, in starts_at then id order (compared
--          as one ordered list of ids against a direct read); then to a
--          patient's JWT (the instance's own patient), a therapist with no
--          tie to anyone, the owner of another tenant and no claims at all,
--          and each must return nothing. VACUOUS when there is no such
--          instance: a zero is never a pass. The claims are put back as they
--          were before the file ends. Ids are compared, never printed;
--   7      EVERY OTHER FUNCTION IN public IS UNCHANGED: one function more than
--          functions_before, and the md5 over every function but the new one
--          equals the carry functions_md5;
--   8      THE SECURITY DEFINER COUNT IS secdef_before + 1, every one owned by
--          postgres;
--   9      EVERY POLICY IS UNCHANGED: the count and the md5 equal the carries;
--   10     EVERY PRIVILEGE ON EVERY RELATION IN public IS UNCHANGED (the md5
--          equals the carry);
--   11     0108 IS IN THE JOURNAL ONCE, BY HASH, AS THE NEWEST ROW, at its
--          journal when 1788502900000. CONTROL: 0107 is found once;
--   12     THE JOURNAL MOVED BY EXACTLY ONE from journal_rows_before.
--
-- THE CARRIES are required: each -v below must be passed, or the file refuses
-- to guess one, before any verdict prints.
--
-- Run (the apply document's stage 2 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before=... (eight carries)
--        -c "begin read only" -f scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing (the pre-check''s verdict 12 row). This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?functions_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v functions_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
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
\if :{?probe_instances}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v probe_instances is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif

SET LOCAL row_security = off;
-- The same search_path as the pre-check, so every expression renders the same way.
SET LOCAL search_path = public;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 11 and 12 instead of ending the file before any other verdict.
DO $journal$
DECLARE
  v_rows   integer;
  v_new    integer;
  v_prev   integer;
  v_hash   text;
  v_when   text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('packread.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb',
          '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('packread.journal', 'read', true);
  PERFORM set_config('packread.journal_rows', v_rows::text, true);
  PERFORM set_config('packread.has_new', v_new::text, true);
  PERFORM set_config('packread.has_prev', v_prev::text, true);
  PERFORM set_config('packread.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('packread.newest_when', coalesce(v_when, ''), true);
END
$journal$;

-- VERDICT 6: the function's answers on production's own packs. The claims are
-- set with set_config(..., true), transaction-local and allowed in a READ ONLY
-- transaction, and put back as they were at the end. Nothing is written.
DO $probe$
DECLARE
  v_inst     record;
  v_want     text;
  v_got      text;
  v_rows     integer;
  v_n        integer := 0;
  v_match    integer := 0;
  v_refused  integer := 0;
  v_claim    text := current_setting('request.jwt.claim', true);
  v_claims   text := current_setting('request.jwt.claims', true);
BEGIN
  IF to_regprocedure('public.pack_instance_consuming_sessions(uuid)') IS NULL THEN
    PERFORM set_config('packread.probe', 'absent', true);
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim', '', true);
  FOR v_inst IN
    SELECT i.id, i.tenant_id, i.patient_id
      FROM public.patient_pack_instances i
      JOIN public.patients p
        ON p.id = i.patient_id
       AND p.tenant_id = i.tenant_id
     WHERE EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id AND a.status <> 'cancelled')
     ORDER BY i.id
     LIMIT 20
  LOOP
    v_n := v_n + 1;
    SELECT coalesce(string_agg(a.id::text, ',' ORDER BY a.starts_at, a.id), '')
      INTO v_want
      FROM public.appointments a
     WHERE a.pack_instance_id = v_inst.id AND a.tenant_id = v_inst.tenant_id AND a.status <> 'cancelled';

    PERFORM set_config('request.jwt.claims',
      json_build_object('tenant_id', v_inst.tenant_id, 'user_role', 'owner', 'sub', '00000000-0000-0000-0000-000000000000')::text, true);
    SELECT coalesce(string_agg(f.appointment_id::text, ',' ORDER BY f.ord), '')
      INTO v_got
      FROM public.pack_instance_consuming_sessions(v_inst.id) WITH ORDINALITY AS f(appointment_id, starts_at, ord);
    IF v_got = v_want AND v_want <> '' THEN
      v_match := v_match + 1;
    END IF;

    v_rows := 0;
    PERFORM set_config('request.jwt.claims',
      json_build_object('tenant_id', v_inst.tenant_id, 'patient_id', v_inst.patient_id)::text, true);
    v_rows := v_rows + (SELECT count(*) FROM public.pack_instance_consuming_sessions(v_inst.id));
    PERFORM set_config('request.jwt.claims',
      json_build_object('tenant_id', v_inst.tenant_id, 'user_role', 'therapist', 'sub', '00000000-0000-0000-0000-000000000000')::text, true);
    v_rows := v_rows + (SELECT count(*) FROM public.pack_instance_consuming_sessions(v_inst.id));
    PERFORM set_config('request.jwt.claims',
      json_build_object('tenant_id', '00000000-0000-0000-0000-000000000000', 'user_role', 'owner', 'sub', '00000000-0000-0000-0000-000000000000')::text, true);
    v_rows := v_rows + (SELECT count(*) FROM public.pack_instance_consuming_sessions(v_inst.id));
    PERFORM set_config('request.jwt.claims', '', true);
    v_rows := v_rows + (SELECT count(*) FROM public.pack_instance_consuming_sessions(v_inst.id));
    IF v_rows = 0 THEN
      v_refused := v_refused + 1;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim', coalesce(v_claim, ''), true);
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('packread.probe', 'read', true);
  PERFORM set_config('packread.probe_n', v_n::text, true);
  PERFORM set_config('packread.probe_match', v_match::text, true);
  PERFORM set_config('packread.probe_refused', v_refused::text, true);
END
$probe$;

\echo ''
\echo '=== 0108 PACK READ FUNCTION POST-CHECK: 13 verdicts; verdict 6 may read VACUOUS only when there is no pack to call it for; the SUMMARY row prints the profile ==='

WITH rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), fn AS (
  SELECT p.oid AS foid, p.prosecdef, p.provolatile::text AS volatility, l.lanname, p.proretset, p.proacl,
         coalesce(array_to_string(p.proconfig, ','), '') AS config, pg_get_userbyid(p.proowner) AS owner,
         md5(p.prosrc) AS src_md5,
         'pack_instance_consuming_sessions(' || pg_get_function_identity_arguments(p.oid) || ') returns '
           || pg_get_function_result(p.oid) AS signature
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid = to_regprocedure('public.pack_instance_consuming_sessions(uuid)')
), j AS (
  SELECT
    coalesce(current_setting('packread.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('packread.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('packread.has_new', true), '')::int                                   AS has_0108,
    nullif(current_setting('packread.has_prev', true), '')::int                                  AS has_0107,
    current_setting('packread.newest_hash', true)                                                AS newest_hash,
    current_setting('packread.newest_when', true)                                                AS newest_when,
    coalesce(current_setting('packread.probe', true), 'not read')                                AS probe_state,
    nullif(current_setting('packread.probe_n', true), '')::int                                   AS probe_n,
    nullif(current_setting('packread.probe_match', true), '')::int                               AS probe_match,
    nullif(current_setting('packread.probe_refused', true), '')::int                             AS probe_refused,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pack_instance_consuming_sessions')             AS fn_named,
    (SELECT signature FROM fn)                                                                  AS signature,
    (SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || volatility || '/' || lanname
            || '/' || CASE WHEN proretset THEN 'set' ELSE 'single' END || '/' || config || '/' || owner || ' ' || src_md5
       FROM fn)                                                                                 AS fn_shape,
    (SELECT 'authenticated ' || has_function_privilege('authenticated', foid, 'EXECUTE')::text
            || ', anon ' || has_function_privilege('anon', foid, 'EXECUTE')::text
            || ', patient ' || has_function_privilege('patient', foid, 'EXECUTE')::text
            || ', service_role ' || has_function_privilege('service_role', foid, 'EXECUTE')::text
            || ', PUBLIC items ' || (CASE WHEN proacl IS NULL THEN 'default ACL'
                                         ELSE (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee = 0)::text END)
            || '; control postgres ' || has_function_privilege('postgres', foid, 'EXECUTE')::text
       FROM fn)                                                                                 AS exec_shape,
    (SELECT coalesce(proacl::text, 'NULL') FROM fn)                                             AS acl_text,
    (SELECT md5(obj_description(foid, 'pg_proc')) FROM fn)                                      AS comment_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                               AS n_fn,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname <> 'pack_instance_consuming_sessions')            AS fn_md5_others,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. the function is there once by name, with the signature and the result the migration gives it',
         fn_named::text || ' named; ' || coalesce(signature, 'absent'),
         '1 named; pack_instance_consuming_sessions(p_pack_instance_id uuid) returns TABLE(appointment_id uuid, starts_at timestamp with time zone)',
         CASE WHEN fn_named = 1 AND signature = 'pack_instance_consuming_sessions(p_pack_instance_id uuid) returns TABLE(appointment_id uuid, starts_at timestamp with time zone)'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. SECURITY DEFINER, STABLE, plpgsql, a set, search_path public, owned by postgres, and the migration''s body',
         coalesce(fn_shape, 'absent'),
         'DEFINER/s/plpgsql/set/search_path=public/postgres 1f45d0f0b99392c7de28f6bbea8ae45f',
         CASE WHEN fn_shape = 'DEFINER/s/plpgsql/set/search_path=public/postgres 1f45d0f0b99392c7de28f6bbea8ae45f' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. EXECUTE: authenticated only, no PUBLIC item, no default ACL (control: the owner); the ACL as it reads: ' || coalesce(acl_text, 'absent'),
         coalesce(exec_shape, 'absent'),
         'authenticated true, anon false, patient false, service_role false, PUBLIC items 0; control postgres true',
         CASE WHEN exec_shape = 'authenticated true, anon false, patient false, service_role false, PUBLIC items 0; control postgres true'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. its comment is the migration''s, by md5',
         coalesce(comment_md5, 'absent'), 'd12f10c62abb617964cf7d9621310cf1',
         CASE WHEN comment_md5 = 'd12f10c62abb617964cf7d9621310cf1' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. called on production''s own packs: the owner gets every consuming visit in order; a patient''s JWT, an untied therapist, another tenant and no claims get nothing',
         CASE WHEN probe_state = 'read'
              THEN probe_n::text || ' instances called; ' || probe_match::text || ' answered in full and in order; '
                   || probe_refused::text || ' refused all four others'
              ELSE 'not called (' || probe_state || ')' END,
         'n instances called, n in full and in order, n refused all four (n from 1 to 20); VACUOUS at 0',
         CASE WHEN probe_state = 'read' AND probe_n = 0 THEN 'VACUOUS'
              WHEN probe_state = 'read' AND probe_n BETWEEN 1 AND 20 AND probe_match = probe_n AND probe_refused = probe_n THEN 'OK'
              ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. every other function in public is unchanged, and there is one function more',
         n_fn::text || ' functions; md5 of the others ' || fn_md5_others,
         ((:'functions_before')::int + 1)::text || ' functions; md5 of the others ' || :'functions_md5',
         CASE WHEN n_fn = (:'functions_before')::int + 1 AND fn_md5_others ~ '^[0-9a-f]{32}$' AND fn_md5_others = :'functions_md5'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the SECURITY DEFINER count is one more than before, every one owned by postgres',
         secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres',
         ((:'secdef_before')::int + 1)::text || ', 0 not owned by postgres',
         CASE WHEN secdef = (:'secdef_before')::int + 1 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. every policy in the database is unchanged (count and md5)',
         policies::text || '; ' || pol_md5, :'policies_before' || '; ' || :'policies_md5',
         CASE WHEN policies::text = :'policies_before' AND pol_md5 ~ '^[0-9a-f]{32}$' AND pol_md5 = :'policies_md5'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. every privilege on every relation in public is unchanged',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' AND rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. 0108 is in the journal once, by hash, as the newest row, at its journal when (control: 0107 once)',
         CASE WHEN journal_state = 'read'
              THEN has_0108::text || ' row, newest ' || CASE WHEN newest_hash = '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb' THEN 'is 0108' ELSE 'is NOT 0108' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_0107::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0108, when 1788502900000; control 1',
         CASE WHEN journal_state = 'read' AND has_0108 = 1 AND has_0107 = 1
                   AND newest_hash = '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb'
                   AND newest_when = '1788502900000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. the journal moved by exactly one',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END,
         (:journal_rows_before + 1)::text,
         CASE WHEN journal_state = 'read' AND journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         CASE WHEN (:'probe_instances')::int = 0 THEN '12 OK / 1 VACUOUS / 0 FAIL' ELSE '13 OK / 0 VACUOUS / 0 FAIL' END, 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
