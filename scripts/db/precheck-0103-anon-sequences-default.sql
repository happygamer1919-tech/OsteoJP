-- 0103 PRE-CHECK: anon's SEQUENCES default in `public`.
-- READ ONLY. Catalogue facts and counts only: no row of any table of people is read.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no VACUOUS". Ten verdicts. On a database
-- that carries the platform's default it reads 10 OK / 0 VACUOUS / 0 FAIL. On a
-- database that never carried it (a throwaway built without the platform's
-- default privileges, where `postgres` has no such entry) verdicts 5 and 6 read
-- VACUOUS, never OK: 8 OK / 2 VACUOUS / 0 FAIL. Where the entry is there and
-- `anon` is not in it (0103 already applied) verdict 5 alone reads VACUOUS, and
-- verdicts 1, 2 and journal_rows_before FAIL. Ten CARRY rows feed the post-check,
-- and four INFO rows print a profile and are never counted.
--
-- WHAT 0103 DOES (packages/db/migrations/0103_revoke_anon_sequences_default.sql,
-- sha256 8283a7996ddf76266d60edec2e8b44f32ebac513237038ff7f8c413774643f59): two
-- SET LOCAL lines (lock_timeout 5s, statement_timeout 60s), then ONE statement,
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON
-- SEQUENCES FROM anon. Nothing else: no table, sequence, policy, function or row.
--
-- THE MEASUREMENT IT ACTS ON (production, 2026-10-02, READ ONLY,
-- scripts/db/measure-0100-maintain.sql): the `public` SEQUENCES default of
-- `postgres` grants `anon`, `authenticated`, `postgres` and `service_role` each
-- SELECT, UPDATE, USAGE; the default of `supabase_admin` grants the same; no
-- GLOBAL default exists. The sequences in `public` were not counted then; no
-- migration creates one. This file pins the SHAPE of the default (verdict 5) and
-- prints the count (CARRY sequences_before and the third INFO row).
--
-- A ZERO IS NEVER A PASS ON ITS OWN. Each verdict that asserts an absence carries
-- a control, and the two verdicts whose subject can be empty say VACUOUS then:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0103 is absent from the journal, by hash. CONTROL: the same count over
--          0102's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0102 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0102's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the journal file; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 100 (0000 to 0102; the numbering has gaps);
--   4      the session is `postgres`, the role 0103 names in FOR ROLE (a role may
--          change its own default). CONTROL: `anon` is NOT a member of `postgres`
--          (a member would hold the owner's privileges on every sequence
--          `postgres` creates, and no default could take them away);
--   5      THE PREMISE: the default of `postgres` for SEQUENCES in `public` grants
--          `anon` exactly SELECT, UPDATE, USAGE, none of them grantable. OK is
--          exactly that. VACUOUS when `anon` holds nothing in it, entry or no
--          entry: there is nothing to revoke, and this is not the database that
--          was measured. FAIL when `anon` holds anything else there.
--          CONTROL: the same parse reads SELECT,UPDATE,USAGE on a planted
--          `{anon=rwU/postgres}`; a control that reads otherwise is a FAIL;
--   6      ITS OWN GRANT IS THE ONLY PATH: that entry grants PUBLIC nothing, and
--          `anon` inherits from no other role the entry names. Either would hand
--          `anon` the privileges on the next sequence after the revoke. VACUOUS
--          when the entry names no other role (the membership test ran over
--          nothing). CONTROL: the count of other grantees, printed;
--   7      no GLOBAL default (no IN SCHEMA) of `postgres` grants `anon`, PUBLIC or
--          a role `anon` inherits from any sequence privilege: a per-schema REVOKE
--          cannot remove a global grant. CONTROL: the planted item of verdict 5;
--   8      the five roles the checks name exist (`anon`, `authenticated`,
--          `patient`, `postgres`, `service_role`);
--   9      secdef_functions_before: the SECURITY DEFINER count in `public`, every
--          one owned by `postgres`. 0103 changes no function, so the post-check
--          wants the same number and no count GATE-CHANGE follows the apply;
--   CARRY  tables_before: ordinary and partitioned tables in `public`;
--   CARRY  sequences_before: sequences in `public` (expected 0);
--   CARRY  anon_default_before: what verdict 5 read for `anon`, or `none`. The
--          post-check reads VACUOUS, not OK, where this says `none`;
--   CARRY  sequence_acl_md5: every privilege on every sequence in `public`, one
--          md5. A NULL relacl reads as acldefault() of a sequence, code 's'
--          (owner=rwU); the capital letter is FOREIGN SERVER;
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public`, one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`,
--          sequences included, one md5, nothing left out: 0103 touches no object
--          that exists;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5,
--          WITHOUT the items of `anon` in the one entry 0103 changes;
--   CARRY  dml_profile_md5: for `authenticated`, `patient`, `anon` and
--          `service_role`, on every relation in `public`, has_table_privilege for
--          SELECT, INSERT, UPDATE and DELETE, one md5;
--   INFO   the server version;
--   INFO   the OTHER creator roles whose `public` SEQUENCES default grants `anon`
--          a privilege (on a Supabase project, `supabase_admin`): 0103 cannot
--          change another role's default, and that one is left as it is;
--   INFO   the sequences in `public` on which `anon` holds USAGE, SELECT or
--          UPDATE by any path: 0103 changes the default and no object that exists;
--   INFO   what `authenticated` and `service_role` hold in the same entry: 0103
--          leaves both.
-- Then, FOR THE RECORD, every SEQUENCES default for `public` or with no schema, as
-- it stands.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without the role `anon` or
-- `postgres`, the schema `public` or the journal table, the statement is an error
-- and psql exits 3 before any verdict prints.
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0102's sha256> -v prev_when=<0102's journal when>
--        -f scripts/db/precheck-0103-anon-sequences-default.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0102 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0102''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

\echo ''
\echo '=== 0103 ANON SEQUENCES DEFAULT PRE-CHECK: read the SUMMARY row last (10 OK / 0 VACUOUS / 0 FAIL where the default is in place) ==='

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
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0102,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role('anon', 'postgres', 'MEMBER')                                                  AS anon_in_pg,
    (SELECT count(*)::int FROM pg_default_acl d, ids
      WHERE d.defaclrole = ids.pg AND d.defaclnamespace = 'public'::regnamespace
        AND d.defaclobjtype = 'S')                                                             AS def_entry,
    (SELECT coalesce(string_agg(e.privilege_type, ',' ORDER BY e.privilege_type), 'none')
       FROM ent e, ids WHERE e.grantee = ids.an)                                               AS ent_anon_privs,
    (SELECT count(*)::int FROM ent e, ids WHERE e.grantee = ids.an)                            AS ent_anon_items,
    (SELECT count(*)::int FROM ent e, ids WHERE e.grantee = ids.an AND e.is_grantable)         AS ent_anon_grantable,
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
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'patient', 'postgres', 'service_role'))        AS roles_named,
    current_setting('server_version')                                                           AS pg_version,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::int FROM seqs)                                                            AS n_seqs,
    (SELECT count(*)::int FROM seqs s
      WHERE has_sequence_privilege('anon', s.oid, 'USAGE') OR has_sequence_privilege('anon', s.oid, 'SELECT')
         OR has_sequence_privilege('anon', s.oid, 'UPDATE'))                                    AS seqs_anon,
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
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))                  AS dml_md5,
    (SELECT coalesce(string_agg(DISTINCT pg_get_userbyid(d.defaclrole), ',' ORDER BY pg_get_userbyid(d.defaclrole)), 'none')
       FROM def_items d, ids
      WHERE d.defaclrole <> ids.pg AND d.defaclnamespace = 'public'::regnamespace
        AND d.objtype = 'S' AND d.grantee = ids.an)                                             AS other_creators,
    (SELECT coalesce(string_agg(e.privilege_type, ',' ORDER BY e.privilege_type), 'none') FROM ent e
      WHERE e.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))             AS ent_auth_privs,
    (SELECT coalesce(string_agg(e.privilege_type, ',' ORDER BY e.privilege_type), 'none') FROM ent e
      WHERE e.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'service_role'))              AS ent_service_privs
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. 0103 is absent from the journal, by hash (control: the same count finds 0102 once)',
         has_0103::text || '; control ' || has_0102::text, '0; control 1',
         CASE WHEN has_0103 = 0 AND has_0102 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. 0102 is present by hash, once, as the newest row, at its journal when',
         has_0102::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0102' ELSE 'is NOT 0102' END
           || ', when ' || coalesce(newest_when, 'none'),
         '1 row, newest is 0102, when ' || :'prev_when',
         CASE WHEN has_0102 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, 'journal_rows_before', journal_rows::text, '100',
         CASE WHEN journal_rows = 100 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. the session is postgres, the role 0103 names (control: anon is no member of it)',
         me || '; control ' || anon_in_pg::text,
         'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT anon_in_pg THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. PREMISE: the public SEQUENCES default of postgres grants anon exactly SELECT, UPDATE, USAGE (control: planted)',
         def_entry::text || ' entry, anon ' || ent_anon_privs || ', grantable ' || ent_anon_grantable::text
           || '; control ' || planted_privs,
         '1 entry, anon SELECT,UPDATE,USAGE, grantable 0; control SELECT,UPDATE,USAGE (anon none reads VACUOUS)',
         CASE WHEN planted_privs <> 'SELECT,UPDATE,USAGE' THEN 'FAIL'
              WHEN ent_anon_items > 0 AND NOT (ent_anon_privs = 'SELECT,UPDATE,USAGE' AND ent_anon_grantable = 0) THEN 'FAIL'
              WHEN ent_anon_items = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 6, '6. anon reaches that default by its own grant only: no PUBLIC item, and anon inherits from no other grantee (control: other grantees exist)',
         'PUBLIC items ' || ent_public_items::text || ', grantees anon inherits from ' || ent_inherited::text
           || '; control ' || ent_other_grantees::text || ' other grantees',
         'PUBLIC items 0, grantees anon inherits from 0; control more than 0 (0 other grantees reads VACUOUS)',
         CASE WHEN ent_public_items > 0 OR ent_inherited > 0 THEN 'FAIL'
              WHEN ent_other_grantees = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j
  UNION ALL SELECT 7, '7. no GLOBAL default of postgres grants anon, PUBLIC or a role anon inherits from a sequence privilege (control: planted)',
         glob_items::text || '; control ' || planted_privs, '0; control SELECT,UPDATE,USAGE',
         CASE WHEN glob_items = 0 AND planted_privs = 'SELECT,UPDATE,USAGE' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the five roles the checks name exist', roles_named::text, '5',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, 'secdef_functions_before', secdef::text, 'more than 0, every one owned by postgres',
         CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'sequences_before', n_seqs::text, 'a count (expected 0: no migration creates a sequence)', 'CARRY' FROM j
  UNION ALL SELECT 22, 'anon_default_before', ent_anon_privs, 'SELECT,UPDATE,USAGE, or none',
         CASE WHEN ent_anon_privs ~ '^(none|[A-Z]+(,[A-Z]+)*)$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'sequence_acl_md5', seq_md5, '32 hex characters, over ' || n_seqs::text || ' sequences',
         CASE WHEN seq_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 24, 'policies_md5', pol_md5, '32 hex characters, over ' || n_pol::text || ' policies',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 25, 'functions_md5', fn_md5, '32 hex characters, over ' || n_fn::text || ' functions in public',
         CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 26, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 27, 'column_acl_md5', col_md5, '32 hex characters, over ' || n_col_items::text || ' column privileges',
         CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 28, 'default_acl_md5', def_md5, '32 hex characters, over ' || n_def_items::text || ' default privileges',
         CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 29, 'dml_profile_md5', dml_md5, '32 hex characters, over ' || n_dml::text || ' role and relation pairs',
         CASE WHEN dml_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'INFO the server version', pg_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO other creator roles whose public SEQUENCES default grants anon a privilege (0103 leaves them)', other_creators, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO sequences in public on which anon holds USAGE, SELECT or UPDATE by any path (0103 touches no object that exists)',
         seqs_anon::text || ' of ' || n_seqs::text, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 43, 'INFO what authenticated and service_role hold in the same default (0103 leaves both)',
         'authenticated ' || ent_auth_privs || '; service_role ' || ent_service_privs, 'a profile', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '10 OK / 0 VACUOUS / 0 FAIL where the default is in place; 8 OK / 2 VACUOUS / 0 FAIL where postgres has no such default', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: every SEQUENCES default for public, or with no schema, as it stands ==='
SELECT pg_get_userbyid(d.defaclrole) AS creator,
       CASE WHEN d.defaclnamespace = 0 THEN 'GLOBAL' ELSE d.defaclnamespace::regnamespace::text END AS schema,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
  FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclobjtype = 'S' AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;

ROLLBACK;
