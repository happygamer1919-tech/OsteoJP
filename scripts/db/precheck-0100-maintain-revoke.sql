-- 0100 PRE-CHECK: the MAINTAIN revoke from `authenticated`.
-- READ ONLY. Every verdict must read OK (13 expected); three INFO rows print a
-- profile and are never counted.
--
-- WHAT 0100 DOES (packages/db/migrations-pending/NEXT-AFTER-0099_revoke_maintain.sql,
-- sha256 80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106, to be promoted
-- to packages/db/migrations/0100_revoke_maintain.sql with no byte changed): two
-- SET LOCAL lines (lock_timeout 5s, statement_timeout 60s), then a DO loop runs
-- REVOKE MAINTAIN ... FROM authenticated on every ordinary and partitioned table in
-- `public`, then ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES
-- FROM authenticated, for the role that runs it (no FOR ROLE clause). Nothing else.
--
-- THE MEASUREMENT IT ACTS ON (production, 2026-10-02, scripts/db/measure-0100-maintain.sql):
-- 48 tables in `public` (relkind r; 0 partitioned, 0 views, 0 materialized views);
-- `authenticated` holds MAINTAIN on 41 of 48, granted = effective; `anon` and PUBLIC
-- hold nothing on any table; the `public` TABLES default of `postgres` grants
-- `authenticated` DELETE, INSERT, MAINTAIN, SELECT, UPDATE. This file asserts the
-- SHAPE of that (a premise above zero, granted = effective), never the numbers: the
-- profile prints, and it moves with the data.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0100 is absent from the journal, by hash. CONTROL: the same count over
--          0099's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0099 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0099's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the promoted journal; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 97 (0000 to 0099; the numbering has gaps);
--   4      the session is `postgres`, the role 0100's ALTER DEFAULT PRIVILEGES acts
--          for (it names no FOR ROLE). CONTROL: `authenticated` is NOT a member of
--          the session's role (if it were, it would hold every owner privilege
--          through it, MAINTAIN included, and no REVOKE on a table could take it);
--   5      every ordinary and partitioned table in `public` is owned by the
--          session's role: the REVOKE is run by the owner, so it removes every
--          grant the owner made, and the next table is created by the role whose
--          default 0100 changes. CONTROL: at least one such table exists;
--   6      every MAINTAIN grant to `authenticated` on those tables names the
--          session's role as grantor (a REVOKE removes only the grants its runner
--          made). CONTROL: at least one such grant exists (verdict 7's premise);
--   7      THE PREMISE: `authenticated` holds MAINTAIN on n of N tables, n > 0
--          (production read 41 of 48 on 2026-10-02). A zero means this is not the
--          database that was measured, and 0100 would change nothing: FAIL.
--          CONTROL: the same has_table_privilege call reads the owner holding
--          MAINTAIN on N of N;
--   8      ITS OWN GRANT IS THE ONLY PATH: the tables where `authenticated` holds
--          MAINTAIN effectively (has_table_privilege) are exactly the tables whose
--          ACL grants it to `authenticated` itself; no table grants MAINTAIN to
--          PUBLIC or to any role `authenticated` inherits from; and `authenticated`
--          is no member of `pg_maintain` (Postgres 17's predefined role that holds
--          MAINTAIN on every relation). Any of those would survive the REVOKE, and
--          post-check verdict 1 would read FAIL after a committed apply. CONTROL:
--          `pg_maintain` exists, so the membership test is not over nothing;
--   9      THE PREMISE OF THE SECOND HALF: the default ACL entry of the session's
--          role for TABLES in `public` exists and grants `authenticated` MAINTAIN.
--          CONTROL: the same parse reads MAINTAIN on a planted
--          `{authenticated=arwdm/postgres}`;
--   10     no GLOBAL default ACL (no IN SCHEMA) of the session's role grants
--          `authenticated` MAINTAIN: a per-schema REVOKE cannot remove a global
--          grant, so 0100's second half would do nothing against one. CONTROL: the
--          planted aclitem of verdict 9;
--   11     the five roles the checks name exist (`authenticated`, `postgres`,
--          `patient`, `anon`, `service_role`; the last three for the DML profile);
--   12     secdef_functions_before: the SECURITY DEFINER count in `public`, every
--          one owned by `postgres`. 0100 changes no function, so the post-check
--          wants the same number;
--   CARRY  tables_before (N), maintain_before (n);
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public` (signature, SECURITY DEFINER,
--          volatility, owner, settings, body md5, ACL), one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5, WITHOUT the item 0100 removes (grantee `authenticated`, an
--          ordinary or partitioned table, MAINTAIN). A NULL relacl reads as
--          acldefault() of the relation's own object type, which is what a GRANT
--          or REVOKE materialises: code 's' for a sequence (owner=rwU) and 'r' for
--          every other relation. relkind spells a sequence with the capital
--          letter, but acldefault's capital code is FOREIGN SERVER (owner=U), so
--          the two spellings differ on purpose;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5 (MAINTAIN
--          has no column form, so nothing here may move);
--   CARRY  default_acl_md5: every default privilege in the database, one md5,
--          WITHOUT the MAINTAIN item of `authenticated` in the session role's
--          `public` TABLES entry;
--   CARRY  dml_profile_md5: for `authenticated`, `patient`, `anon` and
--          `service_role`, on every relation in `public`, has_table_privilege for
--          SELECT, INSERT, UPDATE and DELETE, one md5. What the app roles may read
--          and write; the post-check wants it unchanged;
--   INFO   the other creator roles whose `public` TABLES default grants
--          `authenticated` MAINTAIN (on a Supabase project, `supabase_admin`):
--          0100 cannot change another role's default, and verdict 5 shows no table
--          here was created by one;
--   INFO   views and materialised views in `public` on which `authenticated` holds
--          MAINTAIN: the loop covers relkind r and p only (production: none exist);
--   INFO   TRUNCATE, TRIGGER and REFERENCES held by `authenticated` on the tables:
--          0099's end state, printed for the record (production: 0, 0, 0).
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0099's sha256> -v prev_when=<0099's journal when>
--        -f scripts/db/precheck-0100-maintain-revoke.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0099 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0099''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

\echo ''
\echo '=== 0100 MAINTAIN REVOKE PRE-CHECK: every verdict must read OK (13 expected) ==='

WITH t AS (
  SELECT c.oid, c.relowner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
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
), planted AS (
  SELECT a.grantee, a.privilege_type
    FROM aclexplode(array['authenticated=arwdm/postgres']::aclitem[]) a
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106')          AS has_0100,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0099,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT count(*)::int FROM t)                                                              AS n_tables,
    (SELECT count(*)::int FROM t WHERE t.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS not_mine,
    (SELECT count(*)::int FROM t CROSS JOIN LATERAL aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
      WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND a.privilege_type = 'MAINTAIN')                                                     AS maintain_grants,
    (SELECT count(*)::int FROM t CROSS JOIN LATERAL aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
      WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND a.privilege_type = 'MAINTAIN'
        AND a.grantor <> (SELECT oid FROM pg_roles WHERE rolname = current_user))              AS maintain_other_grantor,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'MAINTAIN')) AS auth_maintain,
    (SELECT count(*)::int FROM t WHERE has_table_privilege(t.relowner, t.oid, 'MAINTAIN'))      AS own_maintain,
    (SELECT count(*)::int FROM t
      WHERE has_table_privilege('authenticated', t.oid, 'MAINTAIN')
        AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
                         WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                           AND a.privilege_type = 'MAINTAIN'))                                 AS effective_not_own,
    (SELECT count(*)::int FROM t CROSS JOIN LATERAL aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
      WHERE a.privilege_type = 'MAINTAIN'
        AND (a.grantee = 0
             OR (a.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                 AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname = 'authenticated'), a.grantee, 'USAGE')))) AS other_path,
    (SELECT count(*)::int FROM pg_roles WHERE rolname = 'pg_maintain')                         AS pg_maintain_exists,
    (SELECT coalesce(bool_or(pg_has_role('authenticated', oid, 'USAGE')), false)
       FROM pg_roles WHERE rolname = 'pg_maintain')                                             AS auth_in_pg_maintain,
    (SELECT count(*)::int FROM pg_default_acl d
      WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'r')              AS def_entry,
    (SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), 'none') FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS def_auth_privs,
    (SELECT count(*)::int FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type = 'MAINTAIN')                                                       AS def_maintain,
    (SELECT count(*)::int FROM planted
      WHERE grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type = 'MAINTAIN')                                                       AS planted_maintain,
    (SELECT count(*)::int FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 0 AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type = 'MAINTAIN')                                                       AS global_maintain,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('authenticated', 'patient', 'postgres', 'anon', 'service_role'))        AS roles_named,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
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
       FROM rel_items
      WHERE NOT (grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                 AND kind IN ('r', 'p')
                 AND privilege_type = 'MAINTAIN'))                                             AS rel_md5,
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
       FROM def_items
      WHERE NOT (defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                 AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
                 AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                 AND privilege_type = 'MAINTAIN'))                                             AS def_md5,
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
    (SELECT coalesce(string_agg(DISTINCT pg_get_userbyid(defaclrole), ',' ORDER BY pg_get_userbyid(defaclrole)), 'none')
       FROM def_items
      WHERE defaclrole <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type = 'MAINTAIN')                                                       AS other_creators,
    (SELECT count(*)::int FROM rel_items
      WHERE kind IN ('v', 'm') AND privilege_type = 'MAINTAIN'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS view_maintain,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'TRUNCATE'))   AS auth_truncate,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'TRIGGER'))    AS auth_trigger,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'REFERENCES')) AS auth_references
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. 0100 is absent from the journal, by hash (control: the same count finds 0099 once)',
       has_0100::text || '; control ' || has_0099::text, '0; control 1',
       CASE WHEN has_0100 = 0 AND has_0099 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. 0099 is present by hash, once, as the newest row, at its journal when',
       has_0099::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0099' ELSE 'is NOT 0099' END
         || ', when ' || coalesce(newest_when, 'none'),
       '1 row, newest is 0099, when ' || :'prev_when',
       CASE WHEN has_0099 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '97',
       CASE WHEN journal_rows = 97 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the session is postgres (control: authenticated is no member of it)',
       me || '; control ' || auth_in_me::text,
       'postgres; control false',
       CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. every ordinary and partitioned table in public is owned by the session role (control: there is one)',
       not_mine::text || ' not owned, of ' || n_tables::text, '0 not owned, of more than 0',
       CASE WHEN not_mine = 0 AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. every MAINTAIN grant to authenticated names the session role as grantor (control: one exists)',
       maintain_other_grantor::text || ' with another grantor, of ' || maintain_grants::text, '0, of more than 0',
       CASE WHEN maintain_other_grantor = 0 AND maintain_grants > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. PREMISE: authenticated holds MAINTAIN on some tables (control: the owner holds it on every one)',
       auth_maintain::text || ' of ' || n_tables::text || '; control ' || own_maintain::text || ' of ' || n_tables::text,
       'more than 0; control all',
       CASE WHEN auth_maintain > 0 AND own_maintain = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. authenticated holds MAINTAIN only by its own grant: no PUBLIC, inherited or pg_maintain path (control: pg_maintain exists)',
       'effective ' || auth_maintain::text || ', own grant ' || maintain_grants::text || ', effective without own grant '
         || effective_not_own::text || ', through PUBLIC or an inherited role ' || other_path::text
         || ', member of pg_maintain ' || auth_in_pg_maintain::text || '; control ' || pg_maintain_exists::text,
       'effective = own grant, 0, 0, false; control 1',
       CASE WHEN auth_maintain = maintain_grants AND effective_not_own = 0 AND other_path = 0
             AND NOT auth_in_pg_maintain AND pg_maintain_exists = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. PREMISE: the session role''s public TABLES default grants authenticated MAINTAIN (control: planted)',
       def_entry::text || ' entry, authenticated ' || def_auth_privs || '; control ' || planted_maintain::text,
       '1 entry, holding MAINTAIN; control 1',
       CASE WHEN def_entry = 1 AND def_maintain = 1 AND planted_maintain = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. no GLOBAL default of the session role grants authenticated MAINTAIN (control: planted)',
       global_maintain::text || '; control ' || planted_maintain::text, '0; control 1',
       CASE WHEN global_maintain = 0 AND planted_maintain = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. the five roles the checks name exist', roles_named::text, '5',
       CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'more than 0, every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'maintain_before', auth_maintain::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'policies_md5', pol_md5, '32 hex characters', CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', fn_md5, '32 hex characters', CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'relation_acl_md5', rel_md5, '32 hex characters', CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'column_acl_md5', col_md5, '32 hex characters', CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'default_acl_md5', def_md5, '32 hex characters', CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'dml_profile_md5', dml_md5, '32 hex characters', CASE WHEN dml_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'INFO other creator roles whose public TABLES default grants authenticated MAINTAIN', other_creators, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO views and materialised views on which authenticated holds MAINTAIN (outside the loop)', view_maintain::text, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO TRUNCATE, TRIGGER, REFERENCES held by authenticated on the tables (0099''s end state)',
       auth_truncate::text || ', ' || auth_trigger::text || ', ' || auth_references::text || ' of ' || n_tables::text, 'a profile', 'INFO' FROM j;

ROLLBACK;
