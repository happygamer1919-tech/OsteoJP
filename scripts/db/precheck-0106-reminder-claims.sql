-- 0106 (PROVISIONAL NUMBER) PRE-CHECK: the reminder sweep's two tables.
-- A DRAFT, like the migration it reads for. READ ONLY. Every verdict must read OK
-- (8 expected); nine CARRY rows feed the post-check, and three INFO rows print a
-- profile and are never counted. Catalogue facts only: no row of any table is read.
--
-- WHAT THE MIGRATION DOES
-- (packages/db/migrations-pending/NEXT-AFTER-0105_reminder_claims.sql, sha256
-- a78b2c9dc92d9184b2977cb588f657751d94387e216185ecc206d202bfa50cf2,
-- to be promoted with no byte changed): three SET LOCAL lines, then two CREATE TABLE
-- (public.reminder_claims, public.reminder_sweep_passes), four indexes, two table
-- comments, ENABLE ROW LEVEL SECURITY on both, a REVOKE ALL and a GRANT SELECT,
-- INSERT on each, three foreign keys to appointments and tenants in two ALTER
-- TABLE statements, and four CREATE POLICY statements, last. No function, no
-- sequence, no trigger, no row.
--
-- NOT IN THIS DRAFT, ON PURPOSE: the journal verdicts (the migration absent by
-- hash, its predecessor the newest row, the row count). They pin a number, a
-- predecessor's hash and a journal position, and none of the three is fixed
-- while the number is provisional. They are added when the file is promoted.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      the session is `postgres`, which will own both tables. CONTROL:
--          `authenticated` is no member of the session's role;
--   2      NOTHING THE MIGRATION CREATES EXISTS YET: no relation named
--          reminder_claims or reminder_sweep_passes or one of its five index
--          and key names, in `public`. CONTROL: the same probe finds
--          reminder_dispatches and its three indexes;
--   3      THE TWO TABLES THE FOREIGN KEYS NAME EXIST, are owned by `postgres`,
--          and each has a primary key on `id` alone;
--   4      THE THREE HELPERS THE POLICIES CALL EXIST, by signature, AND
--          `authenticated` MAY EXECUTE EACH: public.jwt_tenant_id(),
--          public.jwt_role() and auth.uid(). A policy runs as the caller, so a
--          helper the caller may not execute refuses every statement the policy
--          covers. CONTROLS: a signature that does not exist reads as absent,
--          and public.jwt_patient_id(), which the policies deliberately do NOT
--          call, reads as not executable by `authenticated`;
--   5      the four roles the gates name exist: authenticated, anon, patient,
--          service_role;
--   6      the server is Postgres 17, where the post-check's pinned definitions
--          were read (pg_get_constraintdef and pg_get_expr print by version);
--   7      the SECURITY DEFINER count in `public`, every one owned by
--          `postgres`. The migration creates no function, so the post-check
--          wants the same number: no count GATE-CHANGE follows this apply;
--   CARRY  tables_before: ordinary and partitioned tables in `public`;
--   CARRY  sequences_before: sequences in `public`. The migration creates none,
--          and the post-check proves it by reading the count again;
--   CARRY  secdef_before: the SECURITY DEFINER count;
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public`, one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5;
--   CARRY  triggers_md5: every trigger that is not internal, on every table in
--          `public`, one md5;
--   INFO   the server version;
--   INFO   what `postgres` hands out by default on a new table in `public`, by
--          role. The migration revokes by name whatever this is, so it is a
--          profile and not a premise;
--   INFO   how many rows appointments and tenants hold. The foreign keys are
--          validated against the NEW tables, which are empty, so these counts
--          cost nothing; they are the size of what waits behind the two locks.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -f scripts/db/precheck-0106-reminder-claims.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\echo ''
\echo '=== 0106 (PROVISIONAL) REMINDER CLAIMS PRE-CHECK: every verdict must read OK (8 expected) ==='

WITH names(n) AS (
  VALUES ('reminder_claims'), ('reminder_sweep_passes'),
         ('reminder_claims_pkey'), ('reminder_claims_tenant_appointment_id_key'),
         ('reminder_claims_tenant_time_idx'), ('reminder_claims_mark_idx'),
         ('reminder_claims_release_claim_key'),
         ('reminder_sweep_passes_pkey'), ('reminder_sweep_passes_tenant_time_idx')
), control_names(n) AS (
  VALUES ('reminder_dispatches'), ('reminder_dispatches_tenant_time_idx'),
         ('reminder_dispatches_appointment_idx'), ('reminder_dispatches_provider_message_id_key')
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), def_items AS (
  SELECT d.defaclrole, d.defaclnamespace, d.defaclobjtype::text AS objtype, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), j AS (
  SELECT
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                         AS auth_in_me,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT n FROM names))                        AS names_taken,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT n FROM control_names))                AS control_found,
    (SELECT coalesce(string_agg(c.relname || ':' || pg_get_userbyid(c.relowner) || ':'
              || coalesce((SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
                            WHERE k.conrelid = c.oid AND k.contype = 'p'), 'no primary key'),
              ', ' ORDER BY c.relname), 'none')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN ('appointments', 'tenants')) AS parents,
    (SELECT count(*)::int FROM (VALUES ('public.jwt_tenant_id()'), ('public.jwt_role()'), ('auth.uid()')) f(sig)
      WHERE to_regprocedure(f.sig) IS NOT NULL
        AND has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE'))            AS helpers_found,
    (to_regprocedure('public.jwt_tenant_id(integer)') IS NULL)                                   AS helper_control_absent,
    (to_regprocedure('public.jwt_patient_id()') IS NOT NULL
      AND NOT has_function_privilege('authenticated', 'public.jwt_patient_id()', 'EXECUTE'))     AS helper_control_refused,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role'))                    AS roles_named,
    current_setting('server_version_num')::int / 10000                                          AS pg_major,
    current_setting('server_version')                                                           AS pg_version,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S')                                            AS n_sequences,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres') AS secdef_not_postgres,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
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
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || ':' || t.tgname || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)),
              ';' ORDER BY c.oid::regclass::text, t.tgname), ''))
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal)                                        AS trg_md5,
    (SELECT coalesce(string_agg(grantee || ' ' || privs, '; ' ORDER BY grantee), 'nothing')
       FROM (SELECT CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee,
                    string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
               FROM def_items
              WHERE pg_get_userbyid(defaclrole) = 'postgres' AND objtype = 'r'
                AND defaclnamespace = 'public'::regnamespace
              GROUP BY 1) x)                                                                    AS table_default,
    (SELECT c.reltuples::bigint::text FROM pg_class c WHERE c.oid = 'public.appointments'::regclass) AS appts_estimate,
    (SELECT c.reltuples::bigint::text FROM pg_class c WHERE c.oid = 'public.tenants'::regclass)      AS tenants_estimate
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the session is postgres, which will own both tables (control: authenticated is no member of it)',
       me || '; control ' || auth_in_me::text, 'postgres; control false',
       CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. nothing the migration creates exists yet: none of its nine relation names is taken (control: the ledger and its three indexes are found)',
       names_taken::text || '; control ' || control_found::text, '0; control 4',
       CASE WHEN names_taken = 0 AND control_found = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. appointments and tenants exist, owned by postgres, each with a primary key on id alone',
       parents, 'appointments:postgres:PRIMARY KEY (id), tenants:postgres:PRIMARY KEY (id)',
       CASE WHEN parents = 'appointments:postgres:PRIMARY KEY (id), tenants:postgres:PRIMARY KEY (id)' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the three helpers the policies call exist and authenticated may execute each (controls: an unknown signature reads absent; jwt_patient_id reads not executable)',
       helpers_found::text || '; controls ' || helper_control_absent::text || ', ' || helper_control_refused::text, '3; controls true, true',
       CASE WHEN helpers_found = 3 AND helper_control_absent AND helper_control_refused THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the four roles the gates name exist', roles_named::text, '4',
       CASE WHEN roles_named = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the server is Postgres 17, where the post-check''s pinned definitions were read', pg_major::text, '17',
       CASE WHEN pg_major = 17 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the SECURITY DEFINER functions in public are all owned by postgres (the migration creates none)',
       secdef::text || ' functions, ' || secdef_not_postgres::text || ' not owned by postgres',
       'more than 0 functions, 0 not owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'sequences_before', n_sequences::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'secdef_before', secdef::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'policies_md5', pol_md5, '32 hex characters', CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', fn_md5, '32 hex characters', CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'relation_acl_md5', rel_md5, '32 hex characters', CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'column_acl_md5', col_md5, '32 hex characters', CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'default_acl_md5', def_md5, '32 hex characters', CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'triggers_md5', trg_md5, '32 hex characters', CASE WHEN trg_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'INFO the server version', pg_version, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO what postgres hands out by default on a new table in public', table_default, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO planner estimates of the rows behind the two locks: appointments, tenants',
       appts_estimate || ', ' || tenants_estimate, 'a profile', 'INFO' FROM j;
