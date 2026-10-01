-- 0099 POST-CHECK: the TRUNCATE, TRIGGER, REFERENCES revoke from `authenticated`.
-- READ ONLY. Every verdict must read OK (15 expected). Run inside the block's own
-- `begin read only`, so the server refuses any write this file could contain.
--
-- EVERY CHANGE 0099 MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      `authenticated` holds TRUNCATE on 0 of the N ordinary and partitioned
--          tables in `public`. CONTROL: the same has_table_privilege call reads the
--          owner holding TRUNCATE on N of N, so the zero is not a blind instrument;
--          and N is the pre-check's N (no table was created or dropped);
--   2      the same for TRIGGER, with its control;
--   3      the same for REFERENCES, with its control;
--   4      no COLUMN-level REFERENCES grant to `authenticated` exists in `public`.
--          CONTROL: a planted `{authenticated=x/postgres}` counts 1;
--   5      THE SECOND HALF: the session role's default for TABLES in `public` still
--          exists and grants `authenticated` none of the three, so the next
--          CREATE TABLE does not re-grant them. CONTROL: the same parse reads all
--          three on a planted `{authenticated=arwdDxtm/postgres}`;
--   6      no GLOBAL default of the session role grants `authenticated` any of the
--          three (a per-schema REVOKE cannot touch one). CONTROL: the planted item;
--   7      every OTHER default privilege in the database, `authenticated`'s other
--          privileges in that same entry included, hashes to the pre-check's
--          default_acl_md5;
--   8      every OTHER privilege on every relation in `public` hashes to the
--          pre-check's relation_acl_md5: 0099 removed the three from
--          `authenticated` on the tables and nothing else from anyone. A NULL
--          relacl reads exactly as the pre-check reads it: acldefault() of the
--          relation's own object type, code 's' for a sequence;
--   9      every column privilege in `public` hashes to column_acl_md5 (the
--          REVOKE dropped no column grant);
--   10     WHAT THE APP ROLES MAY READ AND WRITE IS UNCHANGED: has_table_privilege
--          for SELECT, INSERT, UPDATE and DELETE, for `authenticated`, `patient`,
--          `anon` and `service_role`, on every relation in `public`, hashes to
--          dml_profile_md5;
--   11     every policy in the database hashes to policies_md5;
--   12     every function in `public` hashes to functions_md5, and the SECURITY
--          DEFINER count equals secdef_before: 0099 changes no function;
--   13     the journal reads journal_rows_before + 1;
--   14     0099's sha256 is in the journal exactly once, as the newest row.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<n> -v tables_before=<n> -v secdef_before=<n>
--        -v policies_md5=<md5> -v functions_md5=<md5> -v relation_acl_md5=<md5>
--        -v column_acl_md5=<md5> -v default_acl_md5=<md5> -v dml_profile_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0099-grants-revoke.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?tables_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v tables_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v secdef_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?functions_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v functions_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?relation_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v relation_acl_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?column_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v column_acl_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?default_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v default_acl_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?dml_profile_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v dml_profile_md5 is missing. This file refuses to guess.'; END $missing$;
\endif

\echo ''
\echo '=== 0099 GRANTS REVOKE POST-CHECK: every verdict must read OK (15 expected) ==='

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
    FROM aclexplode(array['authenticated=arwdDxtm/postgres']::aclitem[]) a
), plantedx AS (
  SELECT a.grantee, a.privilege_type
    FROM aclexplode(array['authenticated=x/postgres']::aclitem[]) a
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b')          AS has_0099,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT count(*)::int FROM t)                                                              AS n_tables,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'TRUNCATE'))   AS auth_truncate,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'TRIGGER'))    AS auth_trigger,
    (SELECT count(*)::int FROM t WHERE has_table_privilege('authenticated', t.oid, 'REFERENCES')) AS auth_references,
    (SELECT count(*)::int FROM t WHERE has_table_privilege(t.relowner, t.oid, 'TRUNCATE'))        AS own_truncate,
    (SELECT count(*)::int FROM t WHERE has_table_privilege(t.relowner, t.oid, 'TRIGGER'))         AS own_trigger,
    (SELECT count(*)::int FROM t WHERE has_table_privilege(t.relowner, t.oid, 'REFERENCES'))      AS own_references,
    (SELECT count(*)::int FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL
        AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND a.privilege_type = 'REFERENCES')                                                   AS col_refs,
    (SELECT count(*)::int FROM plantedx
      WHERE grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type = 'REFERENCES')                                                     AS col_refs_control,
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
        AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))                           AS def_three,
    (SELECT count(*)::int FROM planted
      WHERE grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))                           AS planted_three,
    (SELECT count(*)::int FROM def_items
      WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 0 AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))                           AS global_three,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
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
                 AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')))                 AS rel_md5,
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
                 AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')))                 AS def_md5,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || ':' || r.rolname || ':' || v.verb || ':'
              || has_table_privilege(r.oid, c.oid, v.verb)::text,
              ';' ORDER BY c.oid::regclass::text, r.rolname, v.verb), ''))
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN (SELECT oid, rolname FROM pg_roles
                    WHERE rolname IN ('authenticated', 'patient', 'anon', 'service_role')) r
       CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) v(verb)
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))                  AS dml_md5
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. authenticated holds TRUNCATE on no table (control: the owner holds it on every one)',
       auth_truncate::text || ' of ' || n_tables::text || '; control ' || own_truncate::text || ' of ' || n_tables::text,
       '0 of ' || :'tables_before' || '; control ' || :'tables_before' || ' of ' || :'tables_before',
       CASE WHEN auth_truncate = 0 AND n_tables = :tables_before AND own_truncate = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. authenticated holds TRIGGER on no table (control: the owner holds it on every one)',
       auth_trigger::text || ' of ' || n_tables::text || '; control ' || own_trigger::text || ' of ' || n_tables::text,
       '0 of ' || :'tables_before' || '; control ' || :'tables_before' || ' of ' || :'tables_before',
       CASE WHEN auth_trigger = 0 AND n_tables = :tables_before AND own_trigger = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. authenticated holds REFERENCES on no table (control: the owner holds it on every one)',
       auth_references::text || ' of ' || n_tables::text || '; control ' || own_references::text || ' of ' || n_tables::text,
       '0 of ' || :'tables_before' || '; control ' || :'tables_before' || ' of ' || :'tables_before',
       CASE WHEN auth_references = 0 AND n_tables = :tables_before AND own_references = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. no column-level REFERENCES grant to authenticated in public (control: a planted one counts 1)',
       col_refs::text || '; control ' || col_refs_control::text, '0; control 1',
       CASE WHEN col_refs = 0 AND col_refs_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the session role''s public TABLES default grants authenticated none of the three (control: planted)',
       def_entry::text || ' entry, authenticated ' || def_auth_privs || '; control ' || planted_three::text,
       '1 entry, holding none of REFERENCES, TRIGGER, TRUNCATE; control 3',
       CASE WHEN def_entry = 1 AND def_three = 0 AND planted_three = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. no GLOBAL default of the session role grants authenticated any of the three (control: planted)',
       global_three::text || '; control ' || planted_three::text, '0; control 3',
       CASE WHEN global_three = 0 AND planted_three = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. every other default privilege in the database is unchanged', def_md5, :'default_acl_md5',
       CASE WHEN def_md5 = :'default_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. every other privilege on every relation in public is unchanged', rel_md5, :'relation_acl_md5',
       CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. every column privilege in public is unchanged', col_md5, :'column_acl_md5',
       CASE WHEN col_md5 = :'column_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. what the app roles may SELECT, INSERT, UPDATE and DELETE in public is unchanged', dml_md5, :'dml_profile_md5',
       CASE WHEN dml_md5 = :'dml_profile_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. every policy in the database is unchanged', pol_md5, :'policies_md5',
       CASE WHEN pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. every function in public is unchanged, and so is the SECURITY DEFINER count',
       fn_md5 || ', ' || secdef::text, :'functions_md5' || ', ' || :'secdef_before',
       CASE WHEN fn_md5 = :'functions_md5' AND secdef = :secdef_before THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. the journal moved by exactly one', journal_rows::text, (:journal_rows_before + 1)::text,
       CASE WHEN journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. 0099 is in the journal by hash, once, as the newest row',
       has_0099::text || ', newest ' || CASE WHEN newest_hash = 'fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b' THEN 'is 0099' ELSE 'is NOT 0099' END,
       '1, newest is 0099',
       CASE WHEN has_0099 = 1 AND newest_hash = 'fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b' THEN 'OK' ELSE 'FAIL' END FROM j;

\echo ''
\echo '=== FOR THE RECORD: the session role''s public TABLES default, as it now stands ==='
SELECT pg_get_userbyid(d.defaclrole) AS creator, d.defaclnamespace::regnamespace::text AS schema,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
  FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'r'
 GROUP BY 1, 2, 3
 ORDER BY 3;
