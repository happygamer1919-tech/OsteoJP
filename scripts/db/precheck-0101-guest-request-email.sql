-- 0101 PRE-CHECK: the optional email on a public booking request.
-- READ ONLY. Every verdict must read OK (13 expected); eleven CARRY rows feed the
-- post-check, and three INFO rows print a profile and are never counted. Counts
-- and catalogue facts only: no name, no phone, no address and no id is read.
--
-- WHAT 0101 DOES (packages/db/migrations-pending/NEXT-AFTER-0100_guest_request_email.sql,
-- sha256 36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b, to be promoted
-- to packages/db/migrations/0101_guest_request_email.sql with no byte changed): two
-- SET LOCAL lines (lock_timeout 5s, statement_timeout 60s), then ONE ALTER TABLE on
-- public.guest_booking_requests that adds the nullable column `email text` with no
-- default and the CHECK guest_booking_requests_email_check, then the column's
-- COMMENT. No GRANT, no REVOKE, no policy, no function, no row.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0101 is absent from the journal, by hash. CONTROL: the same count over
--          0100's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0100 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0100's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the promoted journal; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 98 (0000 to 0100; the numbering has gaps);
--   4      the session is `postgres` AND it owns public.guest_booking_requests: an
--          ALTER TABLE is the owner's. CONTROL: `authenticated` is no member of the
--          session's role;
--   5      NOTHING 0101 CREATES EXISTS YET: the table has no column named `email`
--          and no constraint named guest_booking_requests_email_check. CONTROL: the
--          same two probes find the column `locale` and its CHECK, so they are not
--          blind;
--   6      THE PREMISE OF "NO GRANT": the table's privileges are table-level and
--          are 0065's. `authenticated` holds exactly SELECT and UPDATE; `anon`,
--          `patient` and PUBLIC hold nothing. A table-level privilege covers a
--          column added later, so the new column is read and written by exactly
--          the roles that read and write `phone`. CONTROL: the owner holds INSERT,
--          so the reading is not of an empty ACL;
--   7      NO COLUMN OF THE TABLE CARRIES A COLUMN-LEVEL GRANT, so the new column
--          needs none to match its neighbours. CONTROL: a column-level grant
--          exists somewhere in `public` (the patient role's on `patients`), so the
--          probe can see one;
--   8      row level security is ON and not forced, and the table has exactly two
--          policies, one SELECT and one UPDATE, each TO `authenticated` alone
--          (0063). 0101 creates no policy; the new column is behind these two;
--   9      the five roles the checks name exist;
--   10     the server is Postgres 17, where the post-check's pinned constraint
--          text was read (pg_get_constraintdef prints by version);
--   11     secdef_functions_before: the SECURITY DEFINER count in `public`, every
--          one owned by `postgres`. 0101 changes no function, so the post-check
--          wants the same number: no count GATE-CHANGE follows this apply;
--   12     THE TABLE IS THE TABLE 0101 WAS WRITTEN AGAINST: its columns, in
--          order, are the eighteen of 0063 and 0081. A drift here is not an error
--          of the apply, it is a premise that stopped being true: FAIL, and the
--          lead rules;
--   CARRY  tables_before: ordinary and partitioned tables in `public`;
--   CARRY  relfilenode_before: the table's file node. A table REWRITE changes it,
--          so the post-check proves "no row was rewritten" by reading it again;
--   CARRY  table_columns_md5: every column of the table but `email` (position,
--          name, type, NOT NULL, default, generated, identity), one md5;
--   CARRY  table_constraints_md5: every constraint of the table but the new CHECK
--          (name, type, definition, validated), one md5;
--   CARRY  table_indexes_md5: every index of the table (definition), one md5;
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public`, one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5, nothing left out: 0101 grants and revokes nothing. A NULL relacl
--          reads as acldefault() of the relation's own object type: code 's' for a
--          sequence and 'r' for every other relation (the capital letter is
--          FOREIGN SERVER);
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5;
--   CARRY  dml_profile_md5: for `authenticated`, `patient`, `anon` and
--          `service_role`, on every relation in `public`, has_table_privilege for
--          SELECT, INSERT, UPDATE and DELETE, one md5;
--   INFO   the server version;
--   INFO   how many rows the table holds (a count: the CHECK is validated by one
--          scan of them, under the lock);
--   INFO   how many OTHER sessions hold or await a lock on the table now (a count:
--          the apply waits at most 5 seconds for each lock, then fails clean).
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0100's sha256> -v prev_when=<0100's journal when>
--        -f scripts/db/precheck-0101-guest-request-email.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0100 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0100''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

\echo ''
\echo '=== 0101 GUEST REQUEST EMAIL PRE-CHECK: every verdict must read OK (13 expected) ==='

WITH g AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity, c.relacl
    FROM pg_class c
   WHERE c.oid = 'public.guest_booking_requests'::regclass
), g_items AS (
  SELECT a.grantor, a.grantee, a.privilege_type
    FROM g CROSS JOIN LATERAL aclexplode(coalesce(g.relacl, acldefault('r', g.relowner))) a
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
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b')          AS has_0101,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0100,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT pg_get_userbyid(g.relowner) FROM g)                                                AS tbl_owner,
    (SELECT count(*)::int FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'email')   AS col_email,
    (SELECT count(*)::int FROM pg_constraint k, g
      WHERE k.conrelid = g.oid AND k.conname = 'guest_booking_requests_email_check')            AS con_email,
    (SELECT count(*)::int FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'locale')  AS col_locale,
    (SELECT count(*)::int FROM pg_constraint k, g
      WHERE k.conrelid = g.oid AND k.conname = 'guest_booking_requests_locale_check')           AS con_locale,
    (SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), 'none') FROM g_items
      WHERE grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS auth_privs,
    (SELECT count(*)::int FROM g_items
      WHERE grantee = 0
         OR grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'patient')))         AS open_items,
    (SELECT has_table_privilege(g.relowner, g.oid, 'INSERT') FROM g)                            AS owner_insert,
    (SELECT count(*)::int FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL)  AS tbl_col_acl,
    (SELECT count(*)::int FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) AS any_col_acl,
    (SELECT g.relrowsecurity FROM g)                                                            AS rls_on,
    (SELECT g.relforcerowsecurity FROM g)                                                       AS rls_forced,
    (SELECT coalesce(string_agg(p.polcmd::text || ':'
              || array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), '+'),
              ',' ORDER BY p.polcmd::text), 'none')
       FROM pg_policy p, g WHERE p.polrelid = g.oid)                                            AS tbl_policies,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('authenticated', 'patient', 'postgres', 'anon', 'service_role'))        AS roles_named,
    current_setting('server_version_num')::int / 10000                                          AS pg_major,
    current_setting('server_version')                                                           AS pg_version,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT coalesce(string_agg(a.attname, ',' ORDER BY a.attnum), 'none') FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped)                          AS col_names,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT pg_relation_filenode(g.oid)::text FROM g)                                           AS filenode,
    (SELECT md5(coalesce(string_agg(
              a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':'
              || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || a.attgenerated::text || ':' || a.attidentity::text,
              ';' ORDER BY a.attnum), ''))
       FROM g JOIN pg_attribute a ON a.attrelid = g.oid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'email')                        AS tcol_md5,
    (SELECT md5(coalesce(string_agg(
              k.conname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid) || ':' || k.convalidated::text,
              ';' ORDER BY k.conname), ''))
       FROM pg_constraint k, g
      WHERE k.conrelid = g.oid AND k.conname <> 'guest_booking_requests_email_check')           AS tcon_md5,
    (SELECT md5(coalesce(string_agg(pg_get_indexdef(i.indexrelid), ';' ORDER BY i.indexrelid::regclass::text), ''))
       FROM pg_index i, g WHERE i.indrelid = g.oid)                                             AS tidx_md5,
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
              c.oid::regclass::text || ':' || r.rolname || ':' || v.verb || ':'
              || has_table_privilege(r.oid, c.oid, v.verb)::text,
              ';' ORDER BY c.oid::regclass::text, r.rolname, v.verb), ''))
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN (SELECT oid, rolname FROM pg_roles
                    WHERE rolname IN ('authenticated', 'patient', 'anon', 'service_role')) r
       CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) v(verb)
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))                  AS dml_md5,
    (SELECT count(*)::int FROM public.guest_booking_requests)                                  AS n_rows,
    (SELECT count(DISTINCT l.pid)::int FROM pg_locks l, g
      WHERE l.locktype = 'relation' AND l.relation = g.oid AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND l.pid <> pg_backend_pid())                                                         AS other_lockers
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. 0101 is absent from the journal, by hash (control: the same count finds 0100 once)',
       has_0101::text || '; control ' || has_0100::text, '0; control 1',
       CASE WHEN has_0101 = 0 AND has_0100 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. 0100 is present by hash, once, as the newest row, at its journal when',
       has_0100::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0100' ELSE 'is NOT 0100' END
         || ', when ' || coalesce(newest_when, 'none'),
       '1 row, newest is 0100, when ' || :'prev_when',
       CASE WHEN has_0100 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '98',
       CASE WHEN journal_rows = 98 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the session is postgres and owns the table (control: authenticated is no member of it)',
       me || ', owner ' || tbl_owner || '; control ' || auth_in_me::text,
       'postgres, owner postgres; control false',
       CASE WHEN me = 'postgres' AND tbl_owner = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. nothing 0101 creates exists yet: no email column, no email CHECK (control: locale and its CHECK are found)',
       col_email::text || ', ' || con_email::text || '; control ' || col_locale::text || ', ' || con_locale::text,
       '0, 0; control 1, 1',
       CASE WHEN col_email = 0 AND con_email = 0 AND col_locale = 1 AND con_locale = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. PREMISE: authenticated holds exactly SELECT and UPDATE on the table; anon, patient and PUBLIC nothing (control: the owner holds INSERT)',
       'authenticated ' || auth_privs || '; anon, patient, PUBLIC items ' || open_items::text || '; control ' || owner_insert::text,
       'authenticated SELECT,UPDATE; anon, patient, PUBLIC items 0; control true',
       CASE WHEN auth_privs = 'SELECT,UPDATE' AND open_items = 0 AND owner_insert THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. PREMISE: no column of the table carries a column-level grant (control: one exists elsewhere in public)',
       tbl_col_acl::text || '; control ' || any_col_acl::text, '0; control more than 0',
       CASE WHEN tbl_col_acl = 0 AND any_col_acl > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. row level security is on, not forced, with one SELECT and one UPDATE policy, each TO authenticated alone',
       'on ' || rls_on::text || ', forced ' || rls_forced::text || ', policies ' || tbl_policies,
       'on true, forced false, policies r:authenticated,w:authenticated',
       CASE WHEN rls_on AND NOT rls_forced AND tbl_policies = 'r:authenticated,w:authenticated' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. the five roles the checks name exist', roles_named::text, '5',
       CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. the server is Postgres 17, where the post-check''s constraint text was read', pg_major::text, '17',
       CASE WHEN pg_major = 17 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'more than 0, every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. PREMISE: the table has the eighteen columns of 0063 and 0081, in order', col_names,
       'id,tenant_id,full_name,phone,phone_e164,service_id,location_id,practitioner_id,requested_starts_at,requested_ends_at,status,converted_appointment_id,converted_patient_id,source_ip_hash,created_at,handled_at,handled_by,locale',
       CASE WHEN col_names = 'id,tenant_id,full_name,phone,phone_e164,service_id,location_id,practitioner_id,requested_starts_at,requested_ends_at,status,converted_appointment_id,converted_patient_id,source_ip_hash,created_at,handled_at,handled_by,locale' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'relfilenode_before', filenode, 'a number', CASE WHEN filenode ~ '^[0-9]+$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'table_columns_md5', tcol_md5, '32 hex characters', CASE WHEN tcol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'table_constraints_md5', tcon_md5, '32 hex characters', CASE WHEN tcon_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'table_indexes_md5', tidx_md5, '32 hex characters', CASE WHEN tidx_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_md5', pol_md5, '32 hex characters', CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', fn_md5, '32 hex characters', CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'relation_acl_md5', rel_md5, '32 hex characters', CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'column_acl_md5', col_md5, '32 hex characters', CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'default_acl_md5', def_md5, '32 hex characters', CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'dml_profile_md5', dml_md5, '32 hex characters', CASE WHEN dml_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'INFO the server version', pg_version, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO rows in the table, which the CHECK''s validation scans under the lock', n_rows::text, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO other sessions holding or awaiting a lock on the table now', other_lockers::text, 'a profile', 'INFO' FROM j;

ROLLBACK;
