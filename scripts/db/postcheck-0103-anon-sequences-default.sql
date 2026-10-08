-- 0103 POST-CHECK: anon's SEQUENCES default in `public`.
-- READ ONLY. Run inside the block's own `begin read only`, so the server refuses
-- any write this file could contain. Catalogue facts and counts only.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no VACUOUS". Fourteen verdicts. Every one
-- tests FAIL first, then VACUOUS, then OK: a zero comparand may not print OK, and
-- it may never hide a failure. After a correct apply on a database that carried
-- the default and holds no sequence in `public` (what is expected of production)
-- it reads 13 OK / 1 VACUOUS / 0 FAIL: verdict 5 is VACUOUS, because "no existing
-- sequence moved" says nothing where none exists. With at least one sequence
-- there it reads 14 OK / 0 VACUOUS / 0 FAIL. On a database that never carried the
-- default, verdicts 1 and 2 read VACUOUS as well, never OK: 11 OK / 3 VACUOUS /
-- 0 FAIL.
--
-- EVERY CHANGE 0103 MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      THE CHANGE: the default of `postgres` for SEQUENCES in `public` grants
--          `anon` nothing. FAIL while `anon` holds any privilege there (so it is
--          FAIL on the state before the apply). VACUOUS, never OK, when the
--          pre-check's anon_default_before reads `none`: nothing was there to
--          revoke, so the zero proves no revoke. OK only when the pre-check read
--          SELECT,UPDATE,USAGE and this read finds none. CONTROL: the same parse
--          reads SELECT,UPDATE,USAGE on a planted `{anon=rwU/postgres}`;
--   2      NO OTHER PATH: that entry grants PUBLIC nothing, and `anon` inherits
--          from no role the entry still names, so the next sequence `postgres`
--          creates in `public` hands `anon` nothing. VACUOUS when the entry names
--          no other role (the membership test ran over nothing). CONTROL: the
--          count of grantees left, printed;
--   3      no GLOBAL default of `postgres` grants `anon`, PUBLIC or a role `anon`
--          inherits from any sequence privilege (a per-schema REVOKE cannot touch
--          one). CONTROL: the planted item;
--   4      every OTHER default privilege in the database hashes to the pre-check's
--          default_acl_md5: what `postgres`, `authenticated` and `service_role`
--          hold in that same entry, and every default of every other role
--          (`supabase_admin`'s included, which still grants `anon` and is out of
--          reach). VACUOUS over an empty set;
--   5      NO EXISTING SEQUENCE MOVED: `public` holds sequences_before sequences,
--          and every privilege on every one hashes to sequence_acl_md5. VACUOUS
--          when there is none;
--   6      every privilege on every relation in `public`, sequences included,
--          hashes to relation_acl_md5. A NULL relacl reads exactly as the
--          pre-check reads it: acldefault() of the relation's own object type,
--          code 's' for a sequence. VACUOUS over an empty set;
--   7      every column privilege in `public` hashes to column_acl_md5. VACUOUS
--          over an empty set;
--   8      WHAT THE APP ROLES MAY READ AND WRITE IS UNCHANGED: has_table_privilege
--          for SELECT, INSERT, UPDATE and DELETE, for `authenticated`, `patient`,
--          `anon` and `service_role`, on every relation in `public`, hashes to
--          dml_profile_md5. VACUOUS over an empty set;
--   9      every policy in the database hashes to policies_md5. VACUOUS over an
--          empty set;
--   10     every function in `public` hashes to functions_md5, and the SECURITY
--          DEFINER count equals secdef_before: 0103 changes no function. VACUOUS
--          over an empty set;
--   11     the table count in `public` is the pre-check's: nothing was created.
--          VACUOUS at zero;
--   12     the journal reads journal_rows_before + 1;
--   13     0103's sha256 is in the journal exactly once, as the newest row.
-- Then, FOR THE RECORD, every SEQUENCES default for `public` or with no schema, as
-- it now stands: what is left, and for whom.
--
-- NOT A STANDING INVARIANT for 4 to 11: the next migration that grants, creates a
-- sequence, a function or a table, or adds a policy moves them. It is an assertion
-- about this apply.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<n> -v tables_before=<n> -v sequences_before=<n>
--        -v secdef_before=<n> -v anon_default_before=<list or none>
--        -v sequence_acl_md5=<md5> -v policies_md5=<md5> -v functions_md5=<md5>
--        -v relation_acl_md5=<md5> -v column_acl_md5=<md5> -v default_acl_md5=<md5>
--        -v dml_profile_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0103-anon-sequences-default.sql -c "rollback"

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
\if :{?sequences_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v sequences_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v secdef_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?anon_default_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v anon_default_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?sequence_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v sequence_acl_md5 is missing. This file refuses to guess.'; END $missing$;
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
\echo '=== 0103 ANON SEQUENCES DEFAULT POST-CHECK: read the SUMMARY row last (13 OK / 1 VACUOUS / 0 FAIL where public holds no sequence) ==='

WITH ids AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname = 'postgres') AS pg,
         (SELECT oid FROM pg_roles WHERE rolname = 'anon')     AS an
), seqs AS (
  SELECT c.oid
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S'
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
), ent AS (
  SELECT d.grantor, d.grantee, d.privilege_type, d.is_grantable
    FROM def_items d, ids
   WHERE d.defaclrole = ids.pg AND d.defaclnamespace = 'public'::regnamespace AND d.objtype = 'S'
), planted AS (
  SELECT a.grantee, a.privilege_type
    FROM aclexplode(array['anon=rwU/postgres']::aclitem[]) a
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59')          AS has_0103,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT count(*)::int FROM pg_default_acl d, ids
      WHERE d.defaclrole = ids.pg AND d.defaclnamespace = 'public'::regnamespace
        AND d.defaclobjtype = 'S')                                                             AS def_entry,
    (SELECT coalesce(string_agg(e.privilege_type, ',' ORDER BY e.privilege_type), 'none')
       FROM ent e, ids WHERE e.grantee = ids.an)                                               AS ent_anon_privs,
    (SELECT count(*)::int FROM ent e, ids WHERE e.grantee = ids.an)                            AS ent_anon_items,
    (SELECT coalesce(string_agg(p.privilege_type, ',' ORDER BY p.privilege_type), 'none')
       FROM planted p, ids WHERE p.grantee = ids.an)                                           AS planted_privs,
    (SELECT count(*)::int FROM ent e WHERE e.grantee = 0)                                      AS ent_public_items,
    (SELECT count(DISTINCT e.grantee)::int FROM ent e, ids
      WHERE e.grantee <> 0 AND e.grantee <> ids.an)                                            AS ent_other_grantees,
    (SELECT count(DISTINCT e.grantee)::int FROM ent e, ids
      WHERE e.grantee <> 0 AND e.grantee <> ids.an
        AND pg_has_role(ids.an, e.grantee, 'USAGE'))                                           AS ent_inherited,
    (SELECT count(*)::int FROM def_items d, ids
      WHERE d.defaclrole = ids.pg AND d.defaclnamespace = 0 AND d.objtype = 'S'
        AND (d.grantee = 0 OR d.grantee = ids.an OR pg_has_role(ids.an, d.grantee, 'USAGE')))   AS glob_items,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::int FROM seqs)                                                            AS n_seqs,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items WHERE kind = 'S')                                                         AS seq_md5,
    (SELECT count(*)::int FROM pg_policy)                                                       AS n_pol,
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
    (SELECT count(*)::int FROM rel_items)                                                       AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT count(*)::int FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS n_col_items,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || att.attname || ':' || pg_get_userbyid(a.grantor) || ':'
              || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':'
              || a.privilege_type || ':' || a.is_grantable::text,
              ';' ORDER BY c.oid::regclass::text, att.attname, a.grantee, a.privilege_type), ''))
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL)                                   AS col_md5,
    (SELECT count(*)::int FROM def_items d, ids
      WHERE NOT (d.defaclrole = ids.pg AND d.defaclnamespace = 'public'::regnamespace
                 AND d.objtype = 'S' AND d.grantee = ids.an))                                   AS n_def_items,
    (SELECT md5(coalesce(string_agg(
              pg_get_userbyid(d.defaclrole) || ':'
              || CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE d.defaclnamespace::regnamespace::text END || ':'
              || d.objtype || ':' || pg_get_userbyid(d.grantor) || ':'
              || CASE WHEN d.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(d.grantee) END || ':'
              || d.privilege_type || ':' || d.is_grantable::text,
              ';' ORDER BY pg_get_userbyid(d.defaclrole), d.defaclnamespace, d.objtype, d.grantee, d.privilege_type), ''))
       FROM def_items d, ids
      WHERE NOT (d.defaclrole = ids.pg AND d.defaclnamespace = 'public'::regnamespace
                 AND d.objtype = 'S' AND d.grantee = ids.an))                                   AS def_md5,
    (SELECT count(*)::int FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN (SELECT oid FROM pg_roles
                    WHERE rolname IN ('authenticated', 'patient', 'anon', 'service_role')) r
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))                  AS n_dml,
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
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the public SEQUENCES default of postgres grants anon nothing (control: planted; before: the pre-check''s reading)',
         def_entry::text || ' entry, anon ' || ent_anon_privs || '; control ' || planted_privs || '; before ' || :'anon_default_before',
         'anon none; control SELECT,UPDATE,USAGE; before SELECT,UPDATE,USAGE (before none reads VACUOUS)',
         CASE WHEN planted_privs <> 'SELECT,UPDATE,USAGE' THEN 'FAIL'
              WHEN ent_anon_items > 0 THEN 'FAIL'
              WHEN :'anon_default_before' = 'none' THEN 'VACUOUS'
              WHEN :'anon_default_before' = 'SELECT,UPDATE,USAGE' THEN 'OK'
              ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. anon reaches that default by no other path: no PUBLIC item, and anon inherits from no grantee left in it (control: grantees are left)',
         'PUBLIC items ' || ent_public_items::text || ', grantees anon inherits from ' || ent_inherited::text
           || '; control ' || ent_other_grantees::text || ' other grantees',
         'PUBLIC items 0, grantees anon inherits from 0; control more than 0 (0 other grantees reads VACUOUS)',
         CASE WHEN ent_public_items > 0 OR ent_inherited > 0 THEN 'FAIL'
              WHEN ent_other_grantees = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 3, '3. no GLOBAL default of postgres grants anon, PUBLIC or a role anon inherits from a sequence privilege (control: planted)',
         glob_items::text || '; control ' || planted_privs, '0; control SELECT,UPDATE,USAGE',
         CASE WHEN glob_items = 0 AND planted_privs = 'SELECT,UPDATE,USAGE' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. every other default privilege in the database is unchanged',
         def_md5 || ', over ' || n_def_items::text || ' default privileges', :'default_acl_md5' || ' (over 0 reads VACUOUS)',
         CASE WHEN def_md5 <> :'default_acl_md5' THEN 'FAIL'
              WHEN n_def_items = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 5, '5. no existing sequence in public moved: the same count, and every privilege on every one unchanged',
         n_seqs::text || ' sequences, ' || seq_md5, :'sequences_before' || ' sequences, ' || :'sequence_acl_md5' || ' (0 sequences reads VACUOUS)',
         CASE WHEN n_seqs <> :sequences_before OR seq_md5 <> :'sequence_acl_md5' THEN 'FAIL'
              WHEN n_seqs = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 6, '6. every privilege on every relation in public is unchanged',
         rel_md5 || ', over ' || n_rel_items::text || ' privileges', :'relation_acl_md5' || ' (over 0 reads VACUOUS)',
         CASE WHEN rel_md5 <> :'relation_acl_md5' THEN 'FAIL'
              WHEN n_rel_items = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 7, '7. every column privilege in public is unchanged',
         col_md5 || ', over ' || n_col_items::text || ' column privileges', :'column_acl_md5' || ' (over 0 reads VACUOUS)',
         CASE WHEN col_md5 <> :'column_acl_md5' THEN 'FAIL'
              WHEN n_col_items = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 8, '8. what the app roles may SELECT, INSERT, UPDATE and DELETE in public is unchanged',
         dml_md5 || ', over ' || n_dml::text || ' role and relation pairs', :'dml_profile_md5' || ' (over 0 reads VACUOUS)',
         CASE WHEN dml_md5 <> :'dml_profile_md5' THEN 'FAIL'
              WHEN n_dml = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 9, '9. every policy in the database is unchanged',
         pol_md5 || ', over ' || n_pol::text || ' policies', :'policies_md5' || ' (over 0 reads VACUOUS)',
         CASE WHEN pol_md5 <> :'policies_md5' THEN 'FAIL'
              WHEN n_pol = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 10, '10. every function in public is unchanged, and so is the SECURITY DEFINER count',
         fn_md5 || ', ' || secdef::text || ', over ' || n_fn::text || ' functions', :'functions_md5' || ', ' || :'secdef_before' || ' (over 0 reads VACUOUS)',
         CASE WHEN fn_md5 <> :'functions_md5' OR secdef <> :secdef_before THEN 'FAIL'
              WHEN n_fn = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 11, '11. the table count in public is the pre-check''s', n_tables::text, :'tables_before' || ' (0 reads VACUOUS)',
         CASE WHEN n_tables <> :tables_before THEN 'FAIL'
              WHEN n_tables = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 12, '12. the journal moved by exactly one', journal_rows::text, (:journal_rows_before + 1)::text,
         CASE WHEN journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. 0103 is in the journal by hash, once, as the newest row',
         has_0103::text || ', newest ' || CASE WHEN newest_hash = '8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59' THEN 'is 0103' ELSE 'is NOT 0103' END,
         '1, newest is 0103',
         CASE WHEN has_0103 = 1 AND newest_hash = '8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59' THEN 'OK' ELSE 'FAIL' END FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '13 OK / 1 VACUOUS / 0 FAIL where public holds no sequence; 14 OK / 0 VACUOUS / 0 FAIL where it holds one', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: every SEQUENCES default for public, or with no schema, as it now stands ==='
SELECT pg_get_userbyid(d.defaclrole) AS creator,
       CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE d.defaclnamespace::regnamespace::text END AS schema,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
  FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclobjtype = 'S' AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
