-- 0102 PRE-CHECK: SAT-01's tables, doors and policies.
-- READ ONLY. Every verdict must read OK (16 expected); INFO rows print a profile
-- and are never counted; CARRY rows are what stage 2 hands the post-check.
--
-- WHAT 0102 DOES (packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_survey.sql,
-- sha256 db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1, to be promoted to
-- packages/db/migrations/0102_sat01_satisfaction_survey.sql with no byte changed): the three SET
-- LOCAL lines; patients.survey_enabled (boolean NOT NULL DEFAULT true) and the patient role's
-- column UPDATE on it; three tables (appointment_survey_sends, appointment_survey_codes,
-- appointment_survey_responses) with RLS and explicit grants; nine functions, eight of them
-- SECURITY DEFINER; one trigger on patients (the survey switch's audit row, R34); and, as its
-- LAST TWO statements, two SELECT policies (R39). It changes no existing row.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0102 is absent from the journal, by hash. CONTROL: the same count over 0101's hash
--          reads 1 (verdict 2's subject), so the count can find a row;
--   2      0101 is present by hash ONCE, it is the NEWEST row by id, and its created_at is
--          0101's journal when (-v prev_hash, -v prev_when, both passed in by the block from
--          the promoted journal; this file refuses to guess either);
--   3      journal_rows_before: exactly 99 (0000 to 0101; the numbering has gaps);
--   4      the session is `postgres`, the role whose default privileges 0102's tables and
--          functions are born under. CONTROL: `authenticated` is NOT a member of it;
--   5      NOTHING 0102 CREATES EXISTS YET: no relation named appointment_survey_%, no column
--          patients.survey_enabled, none of the nine function names in any schema, no policy
--          named appointment_survey_%, no trigger named patients_survey_switch_audit. A
--          half-applied 0102 reads FAIL. The post-check's
--          "everything else unchanged" md5s exclude exactly these names, so this verdict is
--          what makes the exclusion exclude nothing that exists today. CONTROL: the same probes
--          find appointment_confirm_codes (0072) and resolve_confirm_code;
--   6      EVERY COLUMN 0102 READS OR REFERENCES EXISTS WITH THE TYPE IT ASSUMES, and the
--          appointment_status enum has 'completed'. CONTROL: a planted column reads missing;
--   7      EVERY FUNCTION 0102 CALLS EXISTS: jwt_tenant_id(), jwt_role(), jwt_patient_id(),
--          viewer_location_ids() and viewer_treated_patient_ids() (both returning uuid[],
--          SECURITY DEFINER, owned by postgres), auth.uid(), hashtextextended(text, bigint),
--          pg_advisory_xact_lock(bigint).
--          CONTROL: a planted name resolves to nothing;
--   8      THE TABLE DEFAULT, the premise of 0102's REVOKE ALL: the session role's `public`
--          TABLES default names no grantee outside {postgres, authenticated, service_role,
--          anon, patient}, so the REVOKE list (PUBLIC, anon, authenticated, patient) misses
--          nobody but the owner and service_role; and it grants `authenticated` something, so the
--          REVOKE is load-bearing (production after 0101: DELETE, INSERT, SELECT, UPDATE). No
--          GLOBAL TABLES default of the session role names another grantee either. CONTROL: the
--          same test reads a planted foreign grantee as one;
--   9      THE FUNCTION DEFAULT, the same for 0102's REVOKE ALL ON FUNCTION: the session role's
--          `public` and GLOBAL FUNCTIONS defaults name no grantee outside {postgres, anon,
--          authenticated, service_role}, every one of which 0102 revokes by name (with PUBLIC).
--          CONTROL: the planted foreign grantee;
--   10     THE PATIENT ROLE'S PATIENTS UPDATE IS THE EIGHT COLUMNS of 0019, 0020 and 0082, and
--          no table-level UPDATE. 0102 adds survey_enabled to them; the post-check wants this
--          list plus that one. CONTROL: the same column test reads `id` as not updatable;
--   11     the five roles the checks name exist (`postgres`, `authenticated`, `anon`,
--          `patient`, `service_role`);
--   12     THE SERVER IS POSTGRES 17, the version on which the post-check's two policy-text md5
--          pins were read (17.6, the build lane's throwaway). CONTROL: server_version_num parses;
--   13     secdef_functions_before: the SECURITY DEFINER count in `public`, every one owned by
--          `postgres`. 0102 adds eight; the post-check wants this number plus 8;
--   14     the patients table holds rows (CONTROL for post-check verdict 9, which reads every
--          row's survey_enabled and must not pass on an empty table);
--   15     THE PREMISE OF R34 ("the same staff roles that edit reminder preferences, same clinic
--          scope"): the two reminder switches are guarded by a TABLE-level UPDATE for
--          `authenticated` (which will cover a column added later), by no column-level grant to
--          `authenticated` on either, and by exactly two UPDATE policies on patients,
--          patients_update TO authenticated and patients_patient_update_selfscope TO patient,
--          each with a USING and a WITH CHECK. 0102 changes none of them, so the survey switch
--          is set by exactly the principals who set the reminder switches. `anon` holds no UPDATE
--          on either. CONTROL: the same policy read finds patients_select as a SELECT policy;
--   CARRY  tables_before: the ordinary tables in `public` (the post-check wants it plus 3);
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public` (signature, SECURITY DEFINER,
--          volatility, owner, settings, body md5, ACL), one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one md5. A NULL
--          relacl reads as acldefault() of the relation's own object type: code 's' for a
--          sequence (owner=rwU), 'r' for every other relation. relkind spells a sequence with the
--          capital letter, but acldefault's capital code is FOREIGN SERVER, so the two differ;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5;
--   CARRY  patient_update_columns: verdict 10's list, sorted, comma-separated;
--   CARRY  triggers_md5: every trigger in `public` that is not an internal one (table, name,
--          timing and events, enabled state, function, WHEN), one md5;
--   INFO   the server version; patients, appointments, and appointments with status completed
--          (counts only); the default privileges `service_role` takes on a new table and a
--          new function (0102 leaves service_role's table privileges as the platform makes
--          them, and revokes its EXECUTE); the text md5 of the two UPDATE policies of verdict 15
--          (a profile for the record: what "same clinic scope" is on this database);
--   INFO   idle_in_transaction_session_timeout, the setting's name and its value as this
--          session reads it (0 is no limit), and nothing else. It is the DATABASE'S OWN value,
--          for the record: 0102's third SET LOCAL sets the setting to 15s inside the apply's own
--          transaction, whatever this row prints (strategy's ruling of 2026-10-06, Q5 of
--          S-1006-A; the apply document's "G6"), and that is what ends an applier that stalls
--          BETWEEN two statements while holding locks. Read with
--          current_setting(name, true), so it can never fail this file, and never a verdict;
--   INFO   R39, FOR THE SITTING, NEVER A VERDICT: the platform setting supautils.policy_grants,
--          read ONCE with current_setting(name, true): each role it names, the COUNT of tables
--          named for that role, and whether auth.users is among them (yes or no). Those are the
--          tables a CREATE POLICY run by that role locks ACCESS EXCLUSIVE until the COMMIT
--          (measured on a local stack; the apply document's "G6"). It can never fail this file:
--          the read sits in its own sub-block, and a setting that is absent, empty, not JSON, not
--          an object, or not readable prints what it is instead.
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0101's sha256> -v prev_when=<0101's journal when>
--        -f scripts/db/precheck-0102-sat01-tables.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0101 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0101''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

-- R39: ONE READ of the platform's policy_grants setting, for the sitting. It decides nothing.
-- set_config(..., true) is transaction-local and is allowed in a READ ONLY transaction.
DO $r39$
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
  PERFORM set_config('sat01.policy_grants_info', info, true);
END
$r39$;

\echo ''
\echo '=== 0102 SAT-01 TABLES PRE-CHECK: every verdict must read OK (16 expected) ==='

WITH rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), def_items AS (
  SELECT d.defaclrole, d.defaclnamespace, d.defaclobjtype::text AS objtype, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), planted AS (
  SELECT a.grantee
    FROM aclexplode(array['pg_monitor=r/postgres']::aclitem[]) a
), wanted_cols (tbl, col, typ) AS (
  VALUES
    ('appointments', 'id', 'uuid'), ('appointments', 'tenant_id', 'uuid'), ('appointments', 'patient_id', 'uuid'),
    ('appointments', 'practitioner_id', 'uuid'), ('appointments', 'practitioner_2_id', 'uuid'),
    ('appointments', 'location_id', 'uuid'), ('appointments', 'status', 'appointment_status'),
    ('appointments', 'ends_at', 'timestamp with time zone'),
    ('patients', 'id', 'uuid'), ('patients', 'tenant_id', 'uuid'), ('patients', 'email', 'text'),
    ('patients', 'phone', 'character varying(32)'), ('patients', 'reminder_email_enabled', 'boolean'),
    ('patients', 'reminder_sms_enabled', 'boolean'), ('patients', 'deleted_at', 'timestamp with time zone'),
    ('users', 'id', 'uuid'), ('users', 'tenant_id', 'uuid'), ('tenants', 'id', 'uuid'),
    ('audit_log', 'tenant_id', 'uuid'), ('audit_log', 'actor_user_id', 'uuid'), ('audit_log', 'action', 'text'),
    ('audit_log', 'entity_type', 'text'), ('audit_log', 'entity_id', 'uuid'), ('audit_log', 'metadata', 'jsonb'),
    ('staff_locations', 'user_id', 'uuid'), ('staff_locations', 'location_id', 'uuid')
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1')          AS has_0102,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0101,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'appointment\_survey\_%')                  AS new_rels,
    (SELECT count(*)::int FROM pg_attribute
      WHERE attrelid = 'public.patients'::regclass AND attname = 'survey_enabled' AND NOT attisdropped) AS new_col,
    (SELECT count(*)::int FROM pg_proc
      WHERE proname IN ('survey_manual_verdict', 'issue_survey_automatic', 'issue_survey_manual', 'survey_send_state',
                        'resolve_survey_code', 'submit_survey_response', 'opt_out_survey', 'purge_expired_survey_comments',
                        'patients_survey_switch_audit'))                                        AS new_fns,
    (SELECT count(*)::int FROM pg_policy WHERE polname LIKE 'appointment\_survey\_%')          AS new_pols,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'patients_survey_switch_audit')        AS new_trgs,
    (to_regclass('public.appointment_confirm_codes') IS NOT NULL
      AND to_regprocedure('public.resolve_confirm_code(text)') IS NOT NULL)                    AS probe_control,
    (SELECT count(*)::int FROM wanted_cols w
       JOIN pg_attribute a ON a.attrelid = ('public.' || w.tbl)::regclass AND a.attname = w.col AND NOT a.attisdropped
      WHERE format_type(a.atttypid, a.atttypmod) = w.typ)                                       AS cols_found,
    (SELECT count(*)::int FROM wanted_cols)                                                     AS cols_wanted,
    (SELECT count(*)::int FROM pg_enum e WHERE e.enumtypid = 'public.appointment_status'::regtype
      AND e.enumlabel = 'completed')                                                            AS completed_label,
    (SELECT count(*)::int FROM pg_attribute
      WHERE attrelid = 'public.appointments'::regclass AND attname = 'no_such_column_0102' AND NOT attisdropped) AS planted_col,
    (SELECT count(*)::int FROM (VALUES
       ('public.jwt_tenant_id()'), ('public.jwt_role()'), ('public.jwt_patient_id()'), ('public.viewer_location_ids()'),
       ('public.viewer_treated_patient_ids()'), ('auth.uid()'), ('pg_catalog.hashtextextended(text,bigint)'),
       ('pg_catalog.pg_advisory_xact_lock(bigint)')) v(sig)
      WHERE to_regprocedure(v.sig) IS NOT NULL)                                                 AS helpers_found,
    (SELECT count(*)::int FROM pg_proc p
      WHERE p.oid IN (to_regprocedure('public.viewer_location_ids()'), to_regprocedure('public.viewer_treated_patient_ids()'))
        AND p.prosecdef AND p.prorettype = 'uuid[]'::regtype AND pg_get_userbyid(p.proowner) = 'postgres') AS viewer_helpers_ok,
    (to_regprocedure('public.no_such_function_0102()') IS NULL)                                 AS planted_fn_absent,
    (SELECT count(*)::int FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace IN (0, 'public'::regnamespace) AND objtype = 'r'
        AND grantee NOT IN (SELECT oid FROM pg_roles
                             WHERE rolname IN ('postgres', 'authenticated', 'service_role', 'anon', 'patient'))) AS table_def_other,
    (SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), 'none') FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS table_def_auth,
    (SELECT count(*)::int FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace IN (0, 'public'::regnamespace) AND objtype = 'f'
        AND grantee NOT IN (SELECT oid FROM pg_roles
                             WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role'))) AS fn_def_other,
    (SELECT coalesce(string_agg(DISTINCT CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END, ','
                                ORDER BY CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END), 'none')
       FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'f')                        AS fn_def_grantees,
    (SELECT count(*)::int FROM planted
      WHERE grantee NOT IN (SELECT oid FROM pg_roles
                             WHERE rolname IN ('postgres', 'authenticated', 'service_role', 'anon', 'patient'))) AS planted_other,
    (SELECT coalesce(string_agg(attname, ',' ORDER BY attname), 'none')
       FROM pg_attribute
      WHERE attrelid = 'public.patients'::regclass AND attnum > 0 AND NOT attisdropped
        AND has_column_privilege('patient', 'public.patients'::regclass, attnum, 'UPDATE'))     AS patient_cols,
    has_table_privilege('patient', 'public.patients', 'UPDATE')                                 AS patient_table_update,
    has_column_privilege('patient', 'public.patients', 'id', 'UPDATE')                          AS patient_id_update,
    has_table_privilege('authenticated', 'public.patients', 'UPDATE')                           AS auth_table_update,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.patients'::regclass AND a.attname IN ('reminder_sms_enabled', 'reminder_email_enabled')
        AND a.attacl IS NOT NULL
        AND EXISTS (SELECT 1 FROM aclexplode(a.attacl) x
                     WHERE x.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))) AS auth_reminder_col_grants,
    (has_column_privilege('anon', 'public.patients', 'reminder_sms_enabled', 'UPDATE')
      OR has_column_privilege('anon', 'public.patients', 'reminder_email_enabled', 'UPDATE'))  AS anon_reminder_update,
    (SELECT coalesce(string_agg(p.polname || ':' || array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',')
                                || ':' || CASE WHEN p.polqual IS NULL THEN 'no using' ELSE 'using' END
                                || ':' || CASE WHEN p.polwithcheck IS NULL THEN 'no check' ELSE 'check' END, ',' ORDER BY p.polname), 'none')
       FROM pg_policy p WHERE p.polrelid = 'public.patients'::regclass AND p.polcmd IN ('w', '*'))  AS update_policies,
    (SELECT coalesce(string_agg(p.polname || ' ' || md5(pg_get_expr(p.polqual, p.polrelid)) || ' ' || md5(pg_get_expr(p.polwithcheck, p.polrelid)),
                                ', ' ORDER BY p.polname), 'none')
       FROM pg_policy p WHERE p.polrelid = 'public.patients'::regclass AND p.polcmd IN ('w', '*'))  AS update_policies_md5,
    (SELECT count(*)::int FROM pg_policy p
      WHERE p.polrelid = 'public.patients'::regclass AND p.polname = 'patients_select' AND p.polcmd = 'r') AS select_policy_control,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || t.tgname || ':' || t.tgtype::text || ':' || t.tgenabled::text || ':'
              || t.tgfoid::regprocedure::text || ':' || coalesce(t.tgattr::text, '') || ':'
              || coalesce(md5(pg_get_triggerdef(t.oid)), '-'),
              ';' ORDER BY c.oid::regclass::text, t.tgname), ''))
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal)                                        AS trg_md5,
    coalesce(current_setting('sat01.policy_grants_info', true), 'the read did not run')         AS policy_grants_info,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))        AS roles_named,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT count(*)::int FROM public.patients)                                                 AS patients_rows,
    (SELECT count(*)::int FROM public.appointments)                                             AS appointments_rows,
    (SELECT count(*)::int FROM public.appointments WHERE status = 'completed')                  AS completed_rows,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')                                           AS n_tables,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')  AS fn_md5,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || att.attname || ':' || pg_get_userbyid(a.grantor) || ':'
              || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':'
              || a.privilege_type || ':' || a.is_grantable::text,
              ';' ORDER BY c.oid::regclass::text, att.attname, a.grantee, a.privilege_type), ''))
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS col_md5,
    (SELECT md5(coalesce(string_agg(
              pg_get_userbyid(defaclrole) || ':'
              || CASE WHEN defaclnamespace = 0 THEN 'GLOBAL' ELSE defaclnamespace::regnamespace::text END || ':'
              || objtype || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY pg_get_userbyid(defaclrole), defaclnamespace, objtype, grantee, privilege_type), ''))
       FROM def_items)                                                                         AS def_md5,
    (SELECT coalesce(string_agg(objtype || ' ' || privilege_type, ',' ORDER BY objtype, privilege_type), 'none') FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'service_role'))               AS def_service_role
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. 0102 is absent from the journal, by hash (control: the same count finds 0101 once)',
       has_0102::text || '; control ' || has_0101::text, '0; control 1',
       CASE WHEN has_0102 = 0 AND has_0101 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. 0101 is present by hash, once, as the newest row, at its journal when',
       has_0101::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0101' ELSE 'is NOT 0101' END
         || ', when ' || coalesce(newest_when, 'none'),
       '1 row, newest is 0101, when ' || :'prev_when',
       CASE WHEN has_0101 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '99',
       CASE WHEN journal_rows = 99 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the session is postgres (control: authenticated is no member of it)',
       me || '; control ' || auth_in_me::text, 'postgres; control false',
       CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. nothing 0102 creates exists yet: relations, column, functions, policies, trigger (control: 0072''s table and door found)',
       new_rels::text || ' relations, ' || new_col::text || ' column, ' || new_fns::text || ' functions, '
         || new_pols::text || ' policies, ' || new_trgs::text || ' triggers; control ' || probe_control::text,
       '0, 0, 0, 0, 0; control true',
       CASE WHEN new_rels = 0 AND new_col = 0 AND new_fns = 0 AND new_pols = 0 AND new_trgs = 0 AND probe_control THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. every column 0102 reads exists with its type, and appointment_status has completed (control: a planted column is missing)',
       cols_found::text || ' of ' || cols_wanted::text || ', completed ' || completed_label::text || '; control ' || planted_col::text,
       cols_wanted::text || ' of ' || cols_wanted::text || ', completed 1; control 0',
       CASE WHEN cols_found = cols_wanted AND cols_wanted = 26 AND completed_label = 1 AND planted_col = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. every function 0102 calls exists; the two viewer helpers are SECURITY DEFINER uuid[] owned by postgres (control: a planted name)',
       helpers_found::text || ' of 8, viewer helpers ' || viewer_helpers_ok::text || ' of 2; control ' || planted_fn_absent::text,
       '8 of 8, viewer helpers 2 of 2; control true',
       CASE WHEN helpers_found = 8 AND viewer_helpers_ok = 2 AND planted_fn_absent THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. the TABLES default names no grantee 0102''s REVOKE misses, and grants authenticated something (control: planted)',
       table_def_other::text || ' other grantees, authenticated ' || table_def_auth || '; control ' || planted_other::text,
       '0 other grantees, authenticated not none; control 1',
       CASE WHEN table_def_other = 0 AND table_def_auth <> 'none' AND planted_other = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. the FUNCTIONS default names no grantee 0102''s REVOKE misses (control: planted)',
       fn_def_other::text || ' other grantees, public default to ' || fn_def_grantees || '; control ' || planted_other::text,
       '0 other grantees; control 1',
       CASE WHEN fn_def_other = 0 AND planted_other = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. the patient role updates exactly the eight patients columns, no table UPDATE (control: id is not updatable)',
       patient_cols || '; table ' || patient_table_update::text || '; control ' || patient_id_update::text,
       'address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at; table false; control false',
       CASE WHEN patient_cols = 'address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at'
             AND NOT patient_table_update AND NOT patient_id_update THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. the five roles the checks name exist', roles_named::text, '5',
       CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. the server is Postgres 17, where the post-check''s policy pins were read (control: the number parses)',
       server_num::text, '170000 to 179999',
       CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'more than 0, every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. the patients table holds rows (control for the post-check''s every-row read)',
       patients_rows::text, 'more than 0',
       CASE WHEN patients_rows > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '15. PREMISE (R34): the reminder switches are guarded by authenticated''s table UPDATE and the two UPDATE policies (control: patients_select)',
       'table UPDATE ' || auth_table_update::text || ', ' || auth_reminder_col_grants::text || ' column grants, anon ' || anon_reminder_update::text
         || '; ' || update_policies || '; control ' || select_policy_control::text,
       'table UPDATE true, 0 column grants, anon false; patients_patient_update_selfscope:patient:using:check,patients_update:authenticated:using:check; control 1',
       CASE WHEN auth_table_update AND auth_reminder_col_grants = 0 AND NOT anon_reminder_update
             AND update_policies = 'patients_patient_update_selfscope:patient:using:check,patients_update:authenticated:using:check'
             AND select_policy_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'policies_md5', pol_md5, '32 hex characters', CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', fn_md5, '32 hex characters', CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'relation_acl_md5', rel_md5, '32 hex characters', CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'column_acl_md5', col_md5, '32 hex characters', CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'default_acl_md5', def_md5, '32 hex characters', CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'patient_update_columns', patient_cols, 'a list', 'CARRY' FROM j
UNION ALL SELECT 'triggers_md5', trg_md5, '32 hex characters', CASE WHEN trg_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO patients, appointments, completed appointments (counts)',
       patients_rows::text || ', ' || appointments_rows::text || ', ' || completed_rows::text, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO what the public defaults give service_role (r: tables, f: functions)', def_service_role, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO the text md5 (USING, WITH CHECK) of the UPDATE policies on patients', update_policies_md5, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
UNION ALL SELECT 'INFO R39: supautils.policy_grants, per role: tables named, and whether auth.users is one', policy_grants_info, 'a profile, never a verdict', 'INFO' FROM j;

ROLLBACK;
