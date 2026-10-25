-- 0107 PRE-CHECK: the record_annulments INSERT policy (an annulment is written by
-- the owner, or by a therapist who authored the registo or treats or created its
-- patient, in their own name, for a signed registo of their tenant).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name, no reason and no clinical text of anyone is printed.
--
-- EVERY VERDICT IS OK OR FAIL (none can read VACUOUS), and the SUMMARY row prints
-- the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no FAIL". Fourteen verdicts, every one
-- OK or FAIL: 14 OK / 0 VACUOUS / 0 FAIL, and no other. Seven CARRY rows feed
-- the post-check (with verdict 13's row, journal_rows_before), and the INFO rows
-- print a profile and are never counted.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only` (psql -c "begin read only" -f <this file> -c "rollback"), so
-- the server is what refuses a write; verdict 0 reads FAIL if it is run outside
-- one. It prints FAIL rows and exits 0: the block counts the verdicts and stops
-- on any FAIL, on any VACUOUS and on an OK count that is not 14.
--
-- WHAT THE MIGRATION DOES (packages/db/migrations/0107_record_annulments_insert_policy.sql,
-- promoted from packages/db/migrations-pending with no byte changed, sha256
-- 56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a): the two
-- SET LOCAL lines, and one ALTER POLICY that replaces the WITH CHECK of
-- record_annulments_tenant_insert. No policy is created or dropped, no grant
-- moves, no function, no column, no row.
--
-- THE JOURNAL VERDICTS, 11 TO 13, added at the promotion (2026-10-25), pin 0106
-- (sha256 2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9,
-- journal when 1788502700000) as production's newest row, 0107 as absent, and
-- 104 rows (0000 to 0106; the numbering has gaps). The journal is read by a DO
-- block, by name, so on a database with no drizzle journal verdicts 11 to 13 read
-- FAIL with "no journal table" and every other verdict still prints. No journal
-- is never a pass.
--
-- SO THIS FILE PROVES THE STARTING POINT OF THE TABLE EXACTLY:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      the session is `postgres`, the owner of the table and of its policies.
--          CONTROL: `authenticated` is NOT a member of it;
--   2      THE SESSION READS THIS TABLE PAST ITS POLICIES: it has BYPASSRLS, or is
--          a superuser, or owns the table while row level security is not FORCED
--          on it. Every count below rests on that; the transaction also sets
--          row_security = off, so a session the policies do bind ERRORs on its
--          first read instead of reading a filtered zero. CONTROL: the same test
--          reads false for `authenticated`;
--   3      THE TABLE: owned by `postgres`, row level security ENABLED and not
--          FORCED, and no trigger on it. CONTROL: the same trigger read finds
--          clinical_records_enforce_immutability on clinical_records;
--   4      THE POLICY THE MIGRATION ALTERS IS THERE EXACTLY AS 0035 LEFT IT:
--          record_annulments_tenant_insert, FOR INSERT, PERMISSIVE, TO
--          authenticated, no USING, and its WITH CHECK compared BY EXACT TEXT to
--          Postgres 17's rendering of 0035's expression. A different expression
--          on production means the ALTER would replace something this file was
--          not written against: STOP;
--   5      the OTHER policy is as 0035 left it (record_annulments_tenant_select,
--          FOR SELECT, TO authenticated, its USING by exact text), and the table
--          carries exactly two policies, none RESTRICTIVE;
--   6      THE POLICY THE NEW EXPRESSION READS REGISTOS THROUGH IS AS 0096 LEFT
--          IT: clinical_records_select, FOR SELECT, PERMISSIVE, TO authenticated,
--          its USING pinned by md5. The new expression's EXISTS runs as the
--          caller, so what the owner and a therapist read of clinical_records
--          is part of what it admits;
--   7      THE PRIVILEGES ON THE TABLE: `authenticated` holds exactly DELETE,
--          INSERT, SELECT, UPDATE; `anon` and `patient` nothing; no column of the
--          table carries a column-level grant. The migration moves none.
--          CONTROL: the same read finds that `postgres`, the owner, holds all
--          eight;
--   8      EVERY FUNCTION THE NEW EXPRESSION CALLS EXISTS AS THE MIGRATIONS LEFT
--          IT: jwt_tenant_id(), jwt_role() and
--          clinical_therapist_sees_patient(uuid), each with its SECURITY DEFINER
--          flag, volatility, search_path, owner, EXECUTE for `authenticated` and
--          body md5; and auth.uid() exists and `authenticated` may execute it.
--          CONTROL: a planted name resolves to nothing;
--   9      the columns and the status the new expression and the profile name
--          exist: record_annulments.annulled_by_user_id, record_id and tenant_id;
--          clinical_records.practitioner_id, patient_id, status and tenant_id;
--          patients.created_by; appointments.patient_id, patient_2_id,
--          practitioner_id and practitioner_2_id; and the label 'signed' of
--          record_status. CONTROL: a planted column is absent;
--   10     THE SERVER IS POSTGRES 17, the version on which every pinned rendering
--          here and in the post-check was read (17.6, the build lane's local
--          stack), and the four roles the checks name exist. CONTROL:
--          server_version_num parses;
--   11     0107 IS ABSENT FROM THE JOURNAL, BY HASH. CONTROL: the same count over
--          the same rows finds 0106 once, so a zero here is never the count of
--          an empty or unreadable journal;
--   12     0106 IS THE NEWEST ROW (the highest id), by hash, at its journal when
--          1788502700000;
--   13     journal_rows_before: exactly 104. Its row is named for the carry, so
--          the post-check's journal verdict reads the number this sitting read;
--   CARRY  policies_before: every policy in the database. The migration creates
--          and drops none, so the post-check wants the same number;
--   CARRY  other_policies_md5: one md5 over every policy in the database EXCEPT
--          record_annulments_tenant_insert;
--   CARRY  functions_md5: every function in `public` (signature, SECURITY
--          DEFINER, volatility, owner, settings, body md5, ACL), one md5;
--   CARRY  secdef_before: the SECURITY DEFINER functions in `public`. The
--          migration creates none;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5. A NULL relacl reads as acldefault() of the relation's own object
--          type;
--   CARRY  annulments_rows and annulments_md5: the row count of the table and one
--          md5 over every row of it. The migration writes no row, so the
--          post-check wants both unchanged. The md5 is printed; no row is;
--   INFO   the server version;
--   INFO   the number of annulments the table holds today. Before the promotion
--          this was verdict 11, VACUOUS on an empty table; it decides nothing
--          about the migration, which governs new rows only, so it is a profile
--          and never a verdict;
--   INFO   THE ROWS THE TABLE HOLDS TODAY, BY THE COLUMNS THE NEW EXPRESSION
--          READS, counts only. NO ROW IS TOUCHED, and every row stays readable as
--          before: a policy for INSERT decides new rows only. Each row is read
--          with the registo and the roles AS THEY ARE NOW (the role a member of
--          staff held on the day is not recorded):
--            - rows with annulled_by_user_id NULL;
--            - rows by the registo's status now: signed, draft, locked;
--            - rows by tenant: the registo's tenant equal to the row's, or not;
--            - rows by annuller role now: owner, therapist author, therapist of
--              the patient (created them, or has an appointment with them, and
--              is not the author), therapist other, admin, reception, other,
--              none;
--            - rows for which all four terms hold;
--            - registos that carry more than one annulment;
--   INFO   idle_in_transaction_session_timeout, as this session reads it;
--   INFO   supautils.policy_grants, read ONCE with current_setting(name, true):
--          each role it names, the COUNT of tables named for that role, and
--          whether auth.users is among them. Those are the tables an ALTER POLICY
--          run by that role locks ACCESS EXCLUSIVE until the COMMIT (measured on
--          a local stack on 2026-10-12). It can never fail this file.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without the table, the
-- roles or a column named in the profile, the statement is an error and psql
-- exits 3 before any verdict prints.
--
-- Run (the apply document's stage 1 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin read only" -f scripts/db/precheck-0107-annulment-insert-policy.sql -c "rollback"

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

-- ONE READ of the platform's policy_grants setting, for the sitting. It decides
-- nothing. set_config(..., true) is transaction-local and is allowed in a READ
-- ONLY transaction.
DO $grants$
DECLARE
  v    text;
  doc  jsonb;
  info text;
BEGIN
  BEGIN
    v := current_setting('supautils.policy_grants', true);
    IF v IS NULL OR btrim(v) = '' THEN
      info := 'not set';
    ELSE
      doc := v::jsonb;
      IF jsonb_typeof(doc) <> 'object' THEN
        info := 'set, JSON but not an object';
      ELSE
        SELECT coalesce(string_agg(e.key || ': ' || CASE WHEN jsonb_typeof(e.value) = 'array' THEN jsonb_array_length(e.value)::text || ' tables' ELSE 'not a list' END
                                   || ', auth.users ' || CASE WHEN jsonb_typeof(e.value) = 'array' AND e.value @> '["auth.users"]'::jsonb THEN 'yes' ELSE 'no' END,
                                   '; ' ORDER BY e.key), 'set, names no role')
          INTO info
          FROM jsonb_each(doc) e;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    info := 'could not be read as JSON or at all (SQLSTATE ' || SQLSTATE || ')';
  END;
  PERFORM set_config('annulpol.policy_grants_info', info, true);
END
$grants$;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 11 to 13 instead of ending the file before any other verdict.
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
\echo '=== 0107 ANNULMENT INSERT POLICY PRE-CHECK: every verdict must read OK (14 expected); the SUMMARY row prints the profile ==='

WITH pol AS (
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
), cols_wanted (rel, col) AS (
  VALUES ('record_annulments', 'annulled_by_user_id'), ('record_annulments', 'record_id'), ('record_annulments', 'tenant_id'),
         ('clinical_records', 'practitioner_id'), ('clinical_records', 'patient_id'), ('clinical_records', 'status'),
         ('clinical_records', 'tenant_id'), ('patients', 'created_by'),
         ('appointments', 'patient_id'), ('appointments', 'patient_2_id'),
         ('appointments', 'practitioner_id'), ('appointments', 'practitioner_2_id')
), read AS (
  -- Each annulment by the columns the new expression reads, with the registo and
  -- the annuller's role AS THEY ARE NOW.
  SELECT a.id,
         a.annulled_by_user_id IS NULL                                   AS names_nobody,
         c.status::text                                                  AS registo_status,
         c.tenant_id IS DISTINCT FROM a.tenant_id                        AS other_tenant,
         ro.slug                                                         AS annuller_role,
         coalesce(c.practitioner_id = a.annulled_by_user_id, false)      AS by_author,
         t.of_patient,
         (a.annulled_by_user_id IS NOT NULL
          AND c.tenant_id = a.tenant_id
          AND c.status = 'signed'
          AND (coalesce(ro.slug = 'owner', false)
               OR (coalesce(ro.slug = 'therapist', false)
                   AND (coalesce(c.practitioner_id = a.annulled_by_user_id, false) OR t.of_patient)))) AS meets
    FROM public.record_annulments a
    JOIN public.clinical_records c ON c.id = a.record_id
    LEFT JOIN public.users u ON u.id = a.annulled_by_user_id
    LEFT JOIN public.roles ro ON ro.id = u.role_id AND ro.tenant_id = u.tenant_id
    -- The annuller created the registo's patient, or has an appointment with
    -- them as first or second practitioner, AS IT IS NOW and in the row's tenant:
    -- the two reads of clinical_therapist_sees_patient (0045), for this annuller.
    CROSS JOIN LATERAL (
      SELECT (EXISTS (SELECT 1 FROM public.patients p
                       WHERE p.id = c.patient_id AND p.tenant_id = a.tenant_id AND p.created_by = a.annulled_by_user_id)
              OR EXISTS (SELECT 1 FROM public.appointments ap
                          WHERE (ap.patient_id = c.patient_id OR ap.patient_2_id = c.patient_id)
                            AND ap.tenant_id = a.tenant_id
                            AND (ap.practitioner_id = a.annulled_by_user_id OR ap.practitioner_2_id = a.annulled_by_user_id))) AS of_patient
    ) t
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
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' USING ' || coalesce(qual, '-') || ' CHECK ' || coalesce(chk, '-')
       FROM pol WHERE polname = 'record_annulments_tenant_insert')                              AS insert_pol,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' USING ' || coalesce(qual, '-') || ' CHECK ' || coalesce(chk, '-')
       FROM pol WHERE polname = 'record_annulments_tenant_select')                              AS select_pol,
    (SELECT count(*)::int FROM pol)                                                             AS table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                                        AS restrictive_pols,
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
    (SELECT count(*)::int FROM cols_wanted w
      WHERE EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = ('public.' || w.rel)::regclass AND a.attname = w.col AND NOT a.attisdropped)) AS cols_found,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.record_annulments'::regclass AND a.attname = 'no_such_column_annulpol') AS planted_col,
    (SELECT count(*)::int FROM pg_enum e
      WHERE e.enumtypid = 'public.record_status'::regtype AND e.enumlabel = 'signed')           AS signed_label,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
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
    (SELECT count(*)::int FROM rel_items)                                                       AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT count(*)::int FROM public.record_annulments)                                        AS annulments_rows,
    (SELECT md5(coalesce(string_agg(md5((a.*)::text), '' ORDER BY a.id), ''))
       FROM public.record_annulments a)                                                         AS annulments_md5,
    (SELECT 'rows ' || count(*)
            || '; annulled_by_user_id NULL ' || count(*) FILTER (WHERE names_nobody)
            || '; registo status now: signed ' || count(*) FILTER (WHERE registo_status = 'signed')
            || ', draft ' || count(*) FILTER (WHERE registo_status = 'draft')
            || ', locked ' || count(*) FILTER (WHERE registo_status = 'locked')
            || '; registo tenant: same ' || count(*) FILTER (WHERE NOT other_tenant)
            || ', other ' || count(*) FILTER (WHERE other_tenant)
            || '; annuller role now: owner ' || count(*) FILTER (WHERE annuller_role = 'owner')
            || ', therapist author ' || count(*) FILTER (WHERE annuller_role = 'therapist' AND by_author)
            || ', therapist of the patient ' || count(*) FILTER (WHERE annuller_role = 'therapist' AND NOT by_author AND of_patient)
            || ', therapist other ' || count(*) FILTER (WHERE annuller_role = 'therapist' AND NOT by_author AND NOT of_patient)
            || ', admin ' || count(*) FILTER (WHERE annuller_role = 'admin')
            || ', reception ' || count(*) FILTER (WHERE annuller_role = 'reception')
            || ', other ' || count(*) FILTER (WHERE annuller_role NOT IN ('owner', 'therapist', 'admin', 'reception'))
            || ', none ' || count(*) FILTER (WHERE NOT names_nobody AND annuller_role IS NULL)
            || '; all four terms hold ' || count(*) FILTER (WHERE meets)
       FROM read)                                                                              AS rows_profile,
    (SELECT count(*)::int FROM (SELECT 1 FROM public.record_annulments GROUP BY tenant_id, record_id HAVING count(*) > 1) d) AS twice,
    coalesce(current_setting('annulpol.policy_grants_info', true), 'the read did not run')      AS policy_grants_info,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx
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
  UNION ALL SELECT 4, '4. the INSERT policy the migration alters is exactly as 0035 left it, by exact text',
         coalesce(insert_pol, 'absent'),
         'a/true/authenticated USING - CHECK (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id))',
         CASE WHEN insert_pol = 'a/true/authenticated USING - CHECK (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id))'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the SELECT policy is exactly as 0035 left it; two policies on the table, none RESTRICTIVE',
         coalesce(select_pol, 'absent') || '; ' || table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive',
         'r/true/authenticated USING (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id)) CHECK -; 2 policies, 0 restrictive',
         CASE WHEN select_pol = 'r/true/authenticated USING (tenant_id = ( SELECT jwt_tenant_id() AS jwt_tenant_id)) CHECK -'
               AND table_pols = 2 AND restrictive_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. clinical_records_select, which the new expression reads registos through, is as 0096 left it',
         coalesce(registo_select, 'absent'),
         'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342',
         CASE WHEN registo_select = 'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. privileges on the table: authenticated DELETE,INSERT,SELECT,UPDATE; anon none; patient none; no column grant (control: the owner holds all eight)',
         'authenticated ' || auth_privs || '; anon ' || anon_privs || '; patient ' || patient_privs || '; '
           || column_grants::text || ' column grants; control ' || owner_privs::text,
         'authenticated DELETE,INSERT,SELECT,UPDATE; anon none; patient none; 0 column grants; control 8',
         CASE WHEN auth_privs = 'DELETE,INSERT,SELECT,UPDATE' AND anon_privs = 'none' AND patient_privs = 'none'
               AND column_grants = 0 AND owner_privs = 8 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. every function the new expression calls is as the migrations left it, and auth.uid() is executable (control: a planted name)',
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
  UNION ALL SELECT 9, '9. the twelve columns and the status the new expression and the profile name exist (control: a planted column is absent)',
         cols_found::text || ' of 12 columns, signed label ' || signed_label::text || '; control ' || planted_col::text,
         '12 of 12 columns, signed label 1; control 0',
         CASE WHEN cols_found = 12 AND signed_label = 1 AND planted_col = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. the server is Postgres 17, where every pinned rendering was read, and the four roles exist (control: the number parses)',
         server_num::text || ', ' || roles_named::text || ' roles', '170000 to 179999, 4 roles',
         CASE WHEN server_num BETWEEN 170000 AND 179999 AND roles_named = 4 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. 0107 is absent from the journal, by hash (control: the same count finds 0106 once)',
         CASE WHEN journal_state = 'read' THEN has_0107::text || '; control ' || has_0106::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_0107 = 0 AND has_0106 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. 0106 is the newest row of the journal, by hash, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN 'newest ' || CASE WHEN newest_hash = '2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9' THEN 'is 0106' ELSE 'is NOT 0106' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         'newest is 0106, when 1788502700000',
         CASE WHEN journal_state = 'read' AND newest_hash = '2f309b8a8b9427ece251d3e7eefc1db6d90ee4f89ea417a1fa5a46af7892a3d9'
                   AND newest_when = '1788502700000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '104 (verdict 13)',
         CASE WHEN journal_state = 'read' AND journal_rows = 104 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'other_policies_md5', other_pol_md5, '32 hex characters',
         CASE WHEN other_pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'functions_md5', fn_md5, '32 hex characters, over ' || n_fn::text || ' functions in public',
         CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'secdef_before', secdef::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 24, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 25, 'annulments_rows', annulments_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 26, 'annulments_md5', annulments_md5, '32 hex characters, over ' || annulments_rows::text || ' rows',
         CASE WHEN annulments_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 45, 'INFO annulments the table holds today (count)', annulments_rows::text, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO existing annulments by annuller role, registo status and tenant, as they are now (counts; no row is touched)',
         coalesce(rows_profile, 'none'), 'a profile', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO registos that carry more than one annulment (count)', twice::text, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 43, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 44, 'INFO supautils.policy_grants, per role: tables named, and whether auth.users is one', policy_grants_info, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '14 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: the policies on record_annulments as the catalogue describes them ==='
SELECT p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p
 WHERE p.polrelid = 'public.record_annulments'::regclass
 ORDER BY 1;
