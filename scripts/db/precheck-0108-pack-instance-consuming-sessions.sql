-- 0108 PRE-CHECK: the pack read function (the consuming sessions of one pack
-- instance, for a caller with a staff role who may already see its patient).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- EVERY VERDICT IS OK OR FAIL (none can read VACUOUS), and the SUMMARY row prints
-- the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no FAIL". Thirteen verdicts, every one
-- OK or FAIL: 13 OK / 0 VACUOUS / 0 FAIL, and no other. Six CARRY rows feed the
-- post-check (with verdict 12's row, journal_rows_before), and the INFO rows
-- print a profile and are never counted.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only` (psql -c "begin read only" -f <this file> -c "rollback"), so
-- the server is what refuses a write; verdict 0 reads FAIL if it is run outside
-- one. It prints FAIL rows and exits 0: the block counts the verdicts and stops
-- on any FAIL, on any VACUOUS and on an OK count that is not 13.
--
-- WHAT THE MIGRATION DOES (packages/db/migrations/0108_pack_instance_consuming_sessions.sql,
-- sha256 7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb): the
-- two SET LOCAL lines; one CREATE FUNCTION,
-- public.pack_instance_consuming_sessions(uuid), SECURITY DEFINER, STABLE,
-- plpgsql, search_path public; its owner pin; EXECUTE revoked from PUBLIC,
-- anon, authenticated, patient and service_role and granted to authenticated;
-- its comment. No table, policy, row or other function is touched.
--
-- THE JOURNAL VERDICTS, 10 TO 12, pin 0107 (sha256
-- 56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a, journal
-- when 1788502800000) as production's newest row, 0108 as absent, and 105 rows
-- (0000 to 0107; the numbering has gaps). The journal is read by a DO block, by
-- name, so on a database with no drizzle journal verdicts 10 to 12 read FAIL
-- with "no journal table" and every other verdict still prints. No journal is
-- never a pass.
--
-- SO THIS FILE PROVES THE STARTING POINT EXACTLY:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      the session is `postgres`, the owner the function will have.
--          CONTROL: `authenticated` is NOT a member of it;
--   2      THE SESSION READS patient_pack_instances, patients AND appointments
--          PAST THEIR POLICIES: it has BYPASSRLS, or is a superuser, or owns
--          each table while row level security is not FORCED on it. The carry
--          probe_instances and the INFO profile rest on that; the transaction
--          also sets row_security = off, so a session the policies do bind
--          ERRORs on its first read instead of reading a filtered zero.
--          CONTROL: the same test reads false for `authenticated`;
--   3      THE FUNCTION IS NOT THERE: no function named
--          pack_instance_consuming_sessions in public, with any arguments.
--          The migration's CREATE FUNCTION (not OR REPLACE) would fail on one.
--          CONTROL: public.jwt_role() resolves by the same read;
--   4      THE POLICY THE FUNCTION'S PATIENT TERM RESTATES IS AS 0096 LEFT IT:
--          patients_select, FOR SELECT, PERMISSIVE, TO authenticated, its USING
--          pinned by md5 (rendered with search_path public). A different
--          policy on production means the function would state terms the
--          policy no longer has: STOP;
--   5      EVERY FUNCTION THE NEW BODY CALLS EXISTS AS THE MIGRATIONS LEFT IT:
--          jwt_tenant_id(), jwt_role(), viewer_has_location_assignment(),
--          viewer_visible_patient_ids(), viewer_treated_patient_ids() and
--          viewer_care_team_patient_ids_at_my_clinics(), each with its SECURITY
--          DEFINER flag, volatility, search_path, owner, EXECUTE for
--          `authenticated` and body md5; and auth.uid() exists. CONTROL: a
--          planted name resolves to nothing;
--   6      THE ELEVEN COLUMNS THE BODY READS EXIST: patient_pack_instances.id,
--          tenant_id, patient_id; patients.id, tenant_id, created_by;
--          appointments.id, tenant_id, starts_at, status, pack_instance_id;
--          appointments.id is uuid and starts_at is timestamp with time zone
--          (the two output columns); and the label 'cancelled' of the type of
--          appointments.status. CONTROL: a planted column is absent;
--   7      the five roles the migration names exist (postgres, authenticated,
--          anon, patient, service_role), and the language plpgsql is there;
--   8      THE SERVER IS POSTGRES 17, the version on which every pinned
--          rendering here and in the post-check was read (17.6, the build
--          lane's local stack). CONTROL: server_version_num parses;
--   9      THE SECURITY DEFINER FUNCTIONS IN public ARE 36, AND EVERY ONE IS
--          OWNED BY postgres: production's count after 0107. The migration
--          adds the 37th;
--   10     0108 IS ABSENT FROM THE JOURNAL, BY HASH. CONTROL: the same count over
--          the same rows finds 0107 once, so a zero here is never the count of
--          an empty or unreadable journal;
--   11     0107 IS THE NEWEST ROW (the highest id), by hash, at its journal when
--          1788502800000;
--   12     journal_rows_before: exactly 105. Its row is named for the carry, so
--          the post-check's journal verdict reads the number this sitting read;
--   CARRY  policies_before and policies_md5: every policy in the database, a
--          count and one md5. The migration creates and drops none;
--   CARRY  functions_before and functions_md5: every function in `public`
--          (signature, SECURITY DEFINER, volatility, owner, settings, body md5,
--          ACL), a count and one md5. The post-check wants one more function,
--          and every other one unchanged;
--   CARRY  secdef_before: the SECURITY DEFINER functions in `public`;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5. A NULL relacl reads as acldefault() of the relation's own object
--          type;
--   CARRY  probe_instances: how many pack instances the post-check's behaviour
--          verdict will call the function for: those whose patient is of the
--          instance's own tenant (patients joined on id AND tenant, as the
--          function joins it) and with at least one linked visit of that tenant
--          that is not cancelled, at most 20. The post-check selects them by the
--          same terms. Zero makes that verdict VACUOUS, and stage 2 then
--          requires that profile;
--   INFO   the server version;
--   INFO   the packs as they are, counts only: instances; instances whose
--          patient is of another tenant; instances with a consuming visit;
--          linked visits that consume; linked visits cancelled;
--   INFO   idle_in_transaction_session_timeout, as this session reads it.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without a table, a role or
-- a column named in the profile, the statement is an error and psql exits 3
-- before any verdict prints.
--
-- Run (the apply document's stage 1 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin read only" -f scripts/db/precheck-0108-pack-instance-consuming-sessions.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

-- Verdict 2's control against a filtered zero: a session that row level
-- security binds ERRORs on its first read of an RLS table here.
SET LOCAL row_security = off;
-- Every expression below is rendered with THIS search_path, whatever the
-- session's own is: functions and types of `public` print bare, auth.uid()
-- prints qualified. The pinned texts were read the same way.
SET LOCAL search_path = public;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 10 to 12 instead of ending the file before any other verdict.
-- set_config(..., true) is transaction-local and is allowed in a READ ONLY
-- transaction.
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

\echo ''
\echo '=== 0108 PACK READ FUNCTION PRE-CHECK: every verdict must read OK (13 expected); the SUMMARY row prints the profile ==='

WITH rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), fn_wanted (sig) AS (
  VALUES ('public.jwt_tenant_id()'), ('public.jwt_role()'), ('public.viewer_has_location_assignment()'),
         ('public.viewer_visible_patient_ids()'), ('public.viewer_treated_patient_ids()'),
         ('public.viewer_care_team_patient_ids_at_my_clinics()')
), fn_shape AS (
  SELECT w.sig,
         CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
           || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
           || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
           || ' ' || md5(p.prosrc) AS shape
    FROM fn_wanted w
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(w.sig)
), cols_wanted (rel, col) AS (
  VALUES ('patient_pack_instances', 'id'), ('patient_pack_instances', 'tenant_id'), ('patient_pack_instances', 'patient_id'),
         ('patients', 'id'), ('patients', 'tenant_id'), ('patients', 'created_by'),
         ('appointments', 'id'), ('appointments', 'tenant_id'), ('appointments', 'starts_at'),
         ('appointments', 'status'), ('appointments', 'pack_instance_id')
), past AS (
  SELECT t.rel,
         (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
            FROM pg_roles r, pg_class c WHERE r.rolname = current_user AND c.oid = ('public.' || t.rel)::regclass) AS me,
         (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
            FROM pg_roles r, pg_class c WHERE r.rolname = 'authenticated' AND c.oid = ('public.' || t.rel)::regclass) AS auth
    FROM (VALUES ('patient_pack_instances'), ('patients'), ('appointments')) AS t(rel)
), packs AS (
  SELECT i.id,
         EXISTS (SELECT 1 FROM public.patients p
                  WHERE p.id = i.patient_id AND p.tenant_id = i.tenant_id) AS own_patient,
         (SELECT count(*) FROM public.appointments a
           WHERE a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id AND a.status <> 'cancelled') AS consuming,
         (SELECT count(*) FROM public.appointments a
           WHERE a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id AND a.status = 'cancelled')  AS cancelled
    FROM public.patient_pack_instances i
), j AS (
  SELECT
    coalesce(current_setting('packread.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('packread.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('packread.has_new', true), '')::int                                   AS has_0108,
    nullif(current_setting('packread.has_prev', true), '')::int                                  AS has_0107,
    current_setting('packread.newest_hash', true)                                                AS newest_hash,
    current_setting('packread.newest_when', true)                                                AS newest_when,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me,
    (SELECT count(*)::int FROM past WHERE coalesce(me, false))                                   AS me_past_rls,
    (SELECT count(*)::int FROM past WHERE auth IS DISTINCT FROM false)                           AS auth_past_rls,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pack_instance_consuming_sessions')             AS fn_named,
    (to_regprocedure('public.jwt_role()') IS NOT NULL)                                          AS fn_control,
    (SELECT p.polcmd::text || '/' || p.polpermissive::text || '/'
            || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
            || ' ' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
       FROM pg_policy p
      WHERE p.polrelid = 'public.patients'::regclass AND p.polname = 'patients_select')         AS patients_select,
    (SELECT string_agg(sig || ' ' || coalesce(shape, 'absent'), ' ; ' ORDER BY sig) FROM fn_shape) AS helper_shapes,
    (to_regprocedure('auth.uid()') IS NOT NULL)                                                 AS uid_ok,
    (to_regprocedure('public.no_such_function_packread()') IS NULL)                             AS planted_fn_absent,
    (SELECT count(*)::int FROM cols_wanted w
      WHERE EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = ('public.' || w.rel)::regclass AND a.attname = w.col AND NOT a.attisdropped)) AS cols_found,
    (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
      WHERE a.attrelid = 'public.appointments'::regclass AND a.attname = 'id' AND NOT a.attisdropped)   AS id_type,
    (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
      WHERE a.attrelid = 'public.appointments'::regclass AND a.attname = 'starts_at' AND NOT a.attisdropped) AS starts_type,
    (SELECT count(*)::int FROM pg_attribute a JOIN pg_enum e ON e.enumtypid = a.atttypid
      WHERE a.attrelid = 'public.appointments'::regclass AND a.attname = 'status' AND e.enumlabel = 'cancelled') AS cancelled_label,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.appointments'::regclass AND a.attname = 'no_such_column_packread') AS planted_col,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))        AS roles_named,
    (SELECT count(*)::int FROM pg_language WHERE lanname = 'plpgsql')                           AS plpgsql_here,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                               AS n_fn,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')  AS fn_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT count(*)::int FROM rel_items)                                                       AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT least(20, count(*))::int FROM packs WHERE consuming > 0 AND own_patient)            AS probe_instances,
    (SELECT 'instances ' || count(*)
            || '; patient of another tenant ' || count(*) FILTER (WHERE NOT own_patient)
            || '; with a consuming visit ' || count(*) FILTER (WHERE consuming > 0)
            || '; linked visits consuming ' || coalesce(sum(consuming), 0)
            || ', cancelled ' || coalesce(sum(cancelled), 0)
       FROM packs)                                                                             AS packs_profile,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. this session reads patient_pack_instances, patients and appointments past their policies (control: authenticated does not)',
         me_past_rls::text || ' of 3; control ' || auth_past_rls::text || ' of 3', '3 of 3; control 0 of 3',
         CASE WHEN me_past_rls = 3 AND auth_past_rls = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. no function named pack_instance_consuming_sessions is in public, with any arguments (control: jwt_role() resolves)',
         fn_named::text || ' named; control ' || fn_control::text, '0 named; control true',
         CASE WHEN fn_named = 0 AND fn_control THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. patients_select, whose terms the function restates, is as 0096 left it',
         coalesce(patients_select, 'absent'),
         'r/true/authenticated de612f10145303302884747fa10b6c66',
         CASE WHEN patients_select = 'r/true/authenticated de612f10145303302884747fa10b6c66' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. every function the new body calls is as the migrations left it, and auth.uid() exists (control: a planted name)',
         coalesce(helper_shapes, 'absent') || ' ; auth.uid() ' || uid_ok::text || '; control ' || planted_fn_absent::text,
         'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
           || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b ; '
           || 'public.viewer_care_team_patient_ids_at_my_clinics() DEFINER/s/search_path=public/postgres/exec 9539ec380f391d56af0d89c7998156db ; '
           || 'public.viewer_has_location_assignment() DEFINER/s/search_path=public/postgres/exec 1be591ed8c0f3891ee50c74dcc5a7cd1 ; '
           || 'public.viewer_treated_patient_ids() DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa ; '
           || 'public.viewer_visible_patient_ids() DEFINER/s/search_path=public/postgres/exec 43c507597983287caf8253ac68c01c3a'
           || ' ; auth.uid() true; control true',
         CASE WHEN helper_shapes =
                   'public.jwt_role() INVOKER/s//postgres/exec 9c6cc33575ca09119a9453a311c730a8 ; '
                || 'public.jwt_tenant_id() DEFINER/s/search_path=""/postgres/exec 1b33f5cc21935543ecd4802e403e2f4b ; '
                || 'public.viewer_care_team_patient_ids_at_my_clinics() DEFINER/s/search_path=public/postgres/exec 9539ec380f391d56af0d89c7998156db ; '
                || 'public.viewer_has_location_assignment() DEFINER/s/search_path=public/postgres/exec 1be591ed8c0f3891ee50c74dcc5a7cd1 ; '
                || 'public.viewer_treated_patient_ids() DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa ; '
                || 'public.viewer_visible_patient_ids() DEFINER/s/search_path=public/postgres/exec 43c507597983287caf8253ac68c01c3a'
               AND uid_ok AND planted_fn_absent THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the eleven columns the body reads exist, the two output columns have their types, and the label cancelled exists (control: a planted column is absent)',
         cols_found::text || ' of 11 columns, id ' || coalesce(id_type, 'absent') || ', starts_at ' || coalesce(starts_type, 'absent')
           || ', cancelled label ' || cancelled_label::text || '; control ' || planted_col::text,
         '11 of 11 columns, id uuid, starts_at timestamp with time zone, cancelled label 1; control 0',
         CASE WHEN cols_found = 11 AND id_type = 'uuid' AND starts_type = 'timestamp with time zone'
               AND cancelled_label = 1 AND planted_col = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the five roles the migration names exist, and plpgsql is installed',
         roles_named::text || ' roles, plpgsql ' || plpgsql_here::text, '5 roles, plpgsql 1',
         CASE WHEN roles_named = 5 AND plpgsql_here = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the server is Postgres 17, where every pinned rendering was read (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. the SECURITY DEFINER functions in public are 36, every one owned by postgres',
         secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres', '36, 0 not owned by postgres',
         CASE WHEN secdef = 36 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. 0108 is absent from the journal, by hash (control: the same count finds 0107 once)',
         CASE WHEN journal_state = 'read' THEN has_0108::text || '; control ' || has_0107::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_0108 = 0 AND has_0107 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. 0107 is the newest row of the journal, by hash, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN 'newest ' || CASE WHEN newest_hash = '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a' THEN 'is 0107' ELSE 'is NOT 0107' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         'newest is 0107, when 1788502800000',
         CASE WHEN journal_state = 'read' AND newest_hash = '56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a'
                   AND newest_when = '1788502800000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '105 (verdict 12)',
         CASE WHEN journal_state = 'read' AND journal_rows = 105 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'policies_md5', pol_md5, '32 hex characters',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'functions_before', n_fn::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 23, 'functions_md5', fn_md5, '32 hex characters, over ' || n_fn::text || ' functions in public',
         CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 24, 'secdef_before', secdef::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 25, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 26, 'probe_instances', probe_instances::text, 'a count, 0 to 20', 'CARRY' FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO the packs as they are (counts; no row is touched)', packs_profile, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '13 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
