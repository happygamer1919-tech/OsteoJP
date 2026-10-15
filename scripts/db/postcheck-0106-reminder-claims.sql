-- 0106 POST-CHECK: the reminder sweep's two tables. The number is strategy's
-- ruling of 2026-10-13; the migration is still PENDING. READ ONLY. Every verdict
-- must read OK (24 expected). A verdict reads OK, FAIL or, for 22 and 23 only,
-- VACUOUS: a read that found nothing to compare (a table or the role missing) is
-- VACUOUS, never OK, and VACUOUS is a STOP like FAIL. Run inside the block's own
-- `begin read only`, so the server refuses any write this file could contain.
-- Catalogue facts and two row counts only.
--
-- EVERY CHANGE THE MIGRATION MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED
-- UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      BOTH TABLES EXIST in `public`, each an ordinary table owned by
--          `postgres`. CONTROL: the same read finds reminder_dispatches;
--   2      reminder_claims HAS ITS SEVENTEEN COLUMNS, in order, each with its
--          type, its NOT NULL, its default or its generation expression, as
--          one pinned md5;
--   3      reminder_sweep_passes HAS ITS ELEVEN COLUMNS, the same way;
--   4      EVERY CONSTRAINT OF reminder_claims, by name, type and the definition
--          the server prints, validated, as one pinned md5 (21 of them: the
--          primary key, the six-column unique key a release's foreign key
--          points at, the three foreign keys and sixteen CHECKs, two of them
--          the attempt number's, strategy Q-5);
--   5      EVERY CONSTRAINT OF reminder_sweep_passes, the same way (8 of them);
--   6      THE FOREIGN KEYS, READ ON THEIR OWN because they are what decides a
--          delete: reminder_claims to appointments ON DELETE CASCADE, to tenants
--          NO ACTION, to itself (the release's claim) ON DELETE CASCADE;
--          reminder_sweep_passes to tenants NO ACTION. Verdict 4's md5 pins the
--          six columns of the release's key;
--   7      THE INDEXES of both tables, as the server prints them, as one pinned
--          md5 (6 on reminder_claims, 2 on reminder_sweep_passes), and every one
--          valid. The sixth is reminder_claims_claim_attempt_key, one claim per
--          attempt (strategy Q-5), partial on kind = 'claim';
--   8      ROW LEVEL SECURITY is ON and not forced on both;
--   9      THE POLICIES: each table has exactly one SELECT and one INSERT policy,
--          permissive, TO `authenticated` alone, and NO policy for UPDATE,
--          DELETE or ALL; the four expressions hash to the pinned md5s. The
--          INSERT policy of reminder_claims is the one with the sub-select on
--          appointments (strategy W-6), so its md5 differs from the heartbeat's;
--   10     WHAT `authenticated` HOLDS on each table is exactly SELECT and
--          INSERT, of the eight table privileges;
--   11     `anon`, `patient`, `service_role` AND PUBLIC HOLD NOTHING on either
--          table (strategy W-5 for service_role). CONTROL: the owner holds
--          DELETE, so the reading is not of an empty ACL;
--   12     NO COLUMN of either table carries a column-level grant;
--   13     NO TRIGGER on either table that is not a foreign key's own: append
--          only is by grants and policies, and an appointment's delete must
--          still cascade;
--   14     BOTH TABLES ARE EMPTY: the migration writes no row;
--   15     the table count in `public` is the pre-check's plus two;
--   16     the sequence count in `public` is the pre-check's: none was created;
--   17     every function in `public` hashes to functions_md5, and the SECURITY
--          DEFINER count equals secdef_before: no function was created;
--   18     every policy in the database BUT THE FOUR NEW ONES hashes to
--          policies_md5;
--   19     every privilege on every relation in `public` BUT THE TWO NEW TABLES
--          AND THEIR SEVEN INDEXES hashes to relation_acl_md5 (an index is a
--          relation too, and the pre-check's md5 counts every one), and every
--          column privilege to column_acl_md5;
--   20     every default privilege in the database hashes to default_acl_md5,
--          and every trigger in `public` to triggers_md5.
--   21     THE WHOLE GRANTEE LIST OF EACH TABLE, every entry of its ACL: the
--          owner with the eight table privileges, `authenticated` with SELECT
--          and INSERT, and NOBODY ELSE, with no grant option anywhere. Verdicts
--          10 and 11 ask named roles; this one asks the list, so a role nobody
--          named cannot pass unseen.
--   22     SERVICE_ROLE, READ DIRECTLY, PER PRIVILEGE, ON BOTH TABLES (strategy
--          Q-4, 2026-10-14, for W-5). Production runs no seed, so the
--          migration's own REVOKE is the only thing that makes this true there:
--          has_table_privilege('service_role', table, p) for SELECT, INSERT,
--          UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. This
--          file is Postgres 17 only (pre-check verdict 6 requires 17, and
--          verdicts 10, 11 and 21 ask MAINTAIN unconditionally, so an older
--          server errors before this verdict runs). Every cell must read
--          false. VACUOUS, not OK, unless both tables and the role exist and
--          the cells were read;
--   23     SERVICE_ROLE HOLDS NO COLUMN PRIVILEGE ON ANY COLUMN of either table:
--          has_column_privilege for SELECT, INSERT, UPDATE and REFERENCES on
--          each of the 28 columns, and has_any_column_privilege per table.
--          VACUOUS, not OK, unless both tables, the role and the columns were
--          found.
--
-- NOT IN THIS DRAFT, ON PURPOSE: the journal verdicts (the journal moved by one,
-- the migration is the newest row by hash). See the pre-check's header.
--
-- NOT A STANDING INVARIANT for 15 to 20: the next migration moves them. It is an
-- assertion about this apply.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v tables_before=<n> -v sequences_before=<n> -v secdef_before=<n>
--        -v policies_md5=<md5> -v functions_md5=<md5> -v relation_acl_md5=<md5>
--        -v column_acl_md5=<md5> -v default_acl_md5=<md5> -v triggers_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0106-reminder-claims.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

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
\if :{?triggers_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v triggers_md5 is missing. This file refuses to guess.'; END $missing$;
\endif

\echo ''
\echo '=== 0106 REMINDER CLAIMS POST-CHECK: every verdict must read OK (24 expected); VACUOUS is a STOP ==='

WITH t AS (
  SELECT c.oid, c.relname, c.relkind::text AS kind, pg_get_userbyid(c.relowner) AS owner,
         c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('reminder_claims', 'reminder_sweep_passes')
), cols AS (
  SELECT t.relname, count(*)::int AS n,
         md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':'
               || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':'
               || a.attgenerated::text || ':' || a.attidentity::text, ';' ORDER BY a.attnum)) AS h
    FROM t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   GROUP BY t.relname
), cons AS (
  SELECT t.relname, count(*)::int AS n, bool_and(k.convalidated) AS all_valid,
         md5(string_agg(k.conname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid), ';' ORDER BY k.conname)) AS h
    FROM t JOIN pg_constraint k ON k.conrelid = t.oid
   GROUP BY t.relname
), fks AS (
  SELECT coalesce(string_agg(t.relname || '.' || k.conname || ' -> ' || k.confrelid::regclass::text
           || ' del ' || k.confdeltype::text || ' upd ' || k.confupdtype::text, '; ' ORDER BY t.relname, k.conname), 'none') AS profile
    FROM t JOIN pg_constraint k ON k.conrelid = t.oid AND k.contype = 'f'
), idx AS (
  SELECT count(*)::int AS n, bool_and(i.indisvalid AND i.indisready) AS all_valid,
         md5(string_agg(pg_get_indexdef(i.indexrelid), ';' ORDER BY i.indexrelid::regclass::text)) AS h,
         count(*) FILTER (WHERE t.relname = 'reminder_claims')::int AS n_claims,
         count(*) FILTER (WHERE t.relname = 'reminder_sweep_passes')::int AS n_passes
    FROM t JOIN pg_index i ON i.indrelid = t.oid
), pols AS (
  SELECT coalesce(string_agg(t.relname || ':' || p.polname || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':'
           || array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), '+') || ':'
           || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-') || ':'
           || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'), '; ' ORDER BY t.relname, p.polname), 'none') AS profile
    FROM t JOIN pg_policy p ON p.polrelid = t.oid
), privs AS (
  SELECT t.relname, r.rolname, v.verb, has_table_privilege(r.oid, t.oid, v.verb) AS held
    FROM t
    CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role')) r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(verb)
), acl AS (
  SELECT t.relname, a.grantee, a.privilege_type, a.is_grantable
    FROM t JOIN pg_class c ON c.oid = t.oid
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
     AND c.oid NOT IN (SELECT oid FROM t)
     AND c.oid NOT IN (SELECT i.indexrelid FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM t))
), def_items AS (
  SELECT d.defaclrole, d.defaclnamespace, d.defaclobjtype::text AS objtype, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), sr_role AS (
  -- Strategy Q-4: service_role by name. Empty when the role does not exist,
  -- and then 22 and 23 read VACUOUS, never OK.
  SELECT oid FROM pg_roles WHERE rolname = 'service_role'
), sr_verbs AS (
  -- MAINTAIN is a table privilege from Postgres 17 on. The version test is a
  -- belt only: this file is 17 only, and verdicts 10, 11 and 21 ask MAINTAIN
  -- unconditionally, so an older server errors before it reaches this line.
  SELECT v FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) x(v)
  UNION ALL
  SELECT 'MAINTAIN' WHERE current_setting('server_version_num')::int >= 170000
), sr_cells AS (
  SELECT t.relname, s.v AS verb, has_table_privilege(r.oid, t.oid, s.v) AS held
    FROM t CROSS JOIN sr_role r CROSS JOIN sr_verbs s
), sr_cols AS (
  SELECT t.relname, a.attname, v.v AS verb, has_column_privilege(r.oid, t.oid, a.attnum, v.v) AS held
    FROM t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN sr_role r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) v(v)
), sr_any AS (
  SELECT t.relname, has_any_column_privilege(r.oid, t.oid, 'SELECT, INSERT, UPDATE, REFERENCES') AS held
    FROM t CROSS JOIN sr_role r
), j AS (
  SELECT
    (SELECT count(*)::int FROM t)                                                                 AS sr_tables,
    EXISTS (SELECT 1 FROM sr_role)                                                                AS sr_role_exists,
    (SELECT count(*)::int FROM sr_verbs)                                                          AS sr_verbs_n,
    (SELECT count(*)::int FROM sr_cells)                                                          AS sr_cells_n,
    (SELECT count(*)::int FROM sr_cells WHERE held)                                               AS sr_cells_held,
    (SELECT coalesce(string_agg(relname || ' ' || verb, ', ' ORDER BY relname, verb), 'none') FROM sr_cells WHERE held) AS sr_cells_which,
    (SELECT count(*)::int FROM sr_cols)                                                           AS sr_col_cells_n,
    (SELECT count(DISTINCT relname || '.' || attname)::int FROM sr_cols)                          AS sr_cols_n,
    (SELECT count(*)::int FROM sr_cols WHERE held)                                                AS sr_col_cells_held,
    (SELECT count(*)::int FROM sr_any)                                                            AS sr_any_n,
    (SELECT count(*)::int FROM sr_any WHERE held)                                                 AS sr_any_held,
    (SELECT coalesce(string_agg(relname || ':' || kind || ':' || owner, ', ' ORDER BY relname), 'none') FROM t) AS tables_profile,
    (to_regclass('public.reminder_dispatches') IS NOT NULL)                                      AS control_table,
    (SELECT coalesce(string_agg(relname || ' ' || n::text || ' ' || h, ', ' ORDER BY relname), 'none') FROM cols) AS cols_profile,
    (SELECT coalesce(string_agg(relname || ' ' || n::text || ' ' || all_valid::text || ' ' || h, ', ' ORDER BY relname), 'none') FROM cons) AS cons_profile,
    (SELECT profile FROM fks)                                                                    AS fk_profile,
    (SELECT n_claims::text || '+' || n_passes::text || ' ' || all_valid::text || ' ' || h FROM idx) AS idx_profile,
    (SELECT coalesce(string_agg(relname || ' on ' || relrowsecurity::text || ' forced ' || relforcerowsecurity::text, ', ' ORDER BY relname), 'none') FROM t) AS rls_profile,
    (SELECT profile FROM pols)                                                                   AS pol_profile,
    (SELECT coalesce(string_agg(relname || ' ' || verbs, '; ' ORDER BY relname), 'none')
       FROM (SELECT relname, string_agg(verb, ',' ORDER BY verb) AS verbs FROM privs
              WHERE rolname = 'authenticated' AND held GROUP BY relname) x)                       AS auth_profile,
    (SELECT count(*)::int FROM privs WHERE rolname IN ('anon', 'patient', 'service_role') AND held) AS open_cells,
    (SELECT count(*)::int FROM acl WHERE grantee = 0)                                             AS public_items,
    (SELECT count(*)::int FROM acl WHERE grantee <> 0 AND pg_get_userbyid(grantee) = 'postgres' AND privilege_type = 'DELETE') AS owner_delete,
    (SELECT coalesce(string_agg(relname || ' ' || grantee || ' [' || verbs || ']', '; ' ORDER BY relname, grantee), 'nothing')
       FROM (SELECT relname, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee)::text END AS grantee,
                    string_agg(privilege_type || CASE WHEN is_grantable THEN '*' ELSE '' END, ',' ORDER BY privilege_type) AS verbs
               FROM acl GROUP BY 1, 2) x)                                                         AS whole_acl,
    (SELECT count(*)::int FROM t JOIN pg_attribute a ON a.attrelid = t.oid WHERE a.attacl IS NOT NULL) AS col_grants,
    (SELECT count(*)::int FROM t JOIN pg_trigger g ON g.tgrelid = t.oid WHERE NOT g.tgisinternal)  AS user_triggers,
    (SELECT count(*)::int FROM public.reminder_claims)                                            AS n_claims_rows,
    (SELECT count(*)::int FROM public.reminder_sweep_passes)                                      AS n_passes_rows,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S')                                            AS n_sequences,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (n.nspname = 'public' AND c.relname IN ('reminder_claims', 'reminder_sweep_passes'))) AS pol_md5,
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
              c.oid::regclass::text || ':' || g.tgname || ':' || g.tgenabled::text || ':' || md5(pg_get_triggerdef(g.oid)),
              ';' ORDER BY c.oid::regclass::text, g.tgname), ''))
       FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT g.tgisinternal)                                        AS trg_md5
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. both tables exist, ordinary tables owned by postgres (control: the ledger is found)',
       tables_profile || '; control ' || control_table::text,
       'reminder_claims:r:postgres, reminder_sweep_passes:r:postgres; control true',
       CASE WHEN tables_profile = 'reminder_claims:r:postgres, reminder_sweep_passes:r:postgres' AND control_table THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. reminder_claims has its seventeen columns, as pinned',
       split_part(cols_profile, ', ', 1), 'reminder_claims 17 aecad6420ed26fd0fdf427fbf9b91a06',
       CASE WHEN split_part(cols_profile, ', ', 1) = 'reminder_claims 17 aecad6420ed26fd0fdf427fbf9b91a06' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. reminder_sweep_passes has its eleven columns, as pinned',
       split_part(cols_profile, ', ', 2), 'reminder_sweep_passes 11 fb762f711b1c3cb456b4b9c88233e981',
       CASE WHEN split_part(cols_profile, ', ', 2) = 'reminder_sweep_passes 11 fb762f711b1c3cb456b4b9c88233e981' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. every constraint of reminder_claims, validated, as pinned (21)',
       split_part(cons_profile, ', ', 1), 'reminder_claims 21 true 28e039177325c7244c9128ffcaab1e49',
       CASE WHEN split_part(cons_profile, ', ', 1) = 'reminder_claims 21 true 28e039177325c7244c9128ffcaab1e49' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. every constraint of reminder_sweep_passes, validated, as pinned (8)',
       split_part(cons_profile, ', ', 2), 'reminder_sweep_passes 8 true b987b4f5f6685eac17e3eb2f46fc07de',
       CASE WHEN split_part(cons_profile, ', ', 2) = 'reminder_sweep_passes 8 true b987b4f5f6685eac17e3eb2f46fc07de' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the foreign keys and what a delete does (c is CASCADE, a is NO ACTION)',
       fk_profile,
       'reminder_claims.reminder_claims_appointment_id_fkey -> appointments del c upd a; reminder_claims.reminder_claims_claim_fkey -> reminder_claims del c upd a; reminder_claims.reminder_claims_tenant_id_fkey -> tenants del a upd a; reminder_sweep_passes.reminder_sweep_passes_tenant_id_fkey -> tenants del a upd a',
       CASE WHEN fk_profile = 'reminder_claims.reminder_claims_appointment_id_fkey -> appointments del c upd a; reminder_claims.reminder_claims_claim_fkey -> reminder_claims del c upd a; reminder_claims.reminder_claims_tenant_id_fkey -> tenants del a upd a; reminder_sweep_passes.reminder_sweep_passes_tenant_id_fkey -> tenants del a upd a' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the indexes of both tables, every one valid, as pinned (6 and 2)',
       idx_profile, '6+2 true 6d18e758ddc81deff66f0be58db7d3b7',
       CASE WHEN idx_profile = '6+2 true 6d18e758ddc81deff66f0be58db7d3b7' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. row level security is on and not forced, on both',
       rls_profile, 'reminder_claims on true forced false, reminder_sweep_passes on true forced false',
       CASE WHEN rls_profile = 'reminder_claims on true forced false, reminder_sweep_passes on true forced false' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. the policies: one INSERT (a) and one SELECT (r) per table, permissive, TO authenticated alone, none for UPDATE, DELETE or ALL, expressions as pinned',
       pol_profile,
       'reminder_claims:reminder_claims_job_insert:a:true:authenticated:-:3db6b5cccdd94267bf0633f2323ec17a; reminder_claims:reminder_claims_staff_select:r:true:authenticated:1bd97827756803e4680c3e6625a09158:-; reminder_sweep_passes:reminder_sweep_passes_job_insert:a:true:authenticated:-:a7f621c501e9b0ae1646fd93a1100d35; reminder_sweep_passes:reminder_sweep_passes_staff_select:r:true:authenticated:1bd97827756803e4680c3e6625a09158:-',
       CASE WHEN pol_profile = 'reminder_claims:reminder_claims_job_insert:a:true:authenticated:-:3db6b5cccdd94267bf0633f2323ec17a; reminder_claims:reminder_claims_staff_select:r:true:authenticated:1bd97827756803e4680c3e6625a09158:-; reminder_sweep_passes:reminder_sweep_passes_job_insert:a:true:authenticated:-:a7f621c501e9b0ae1646fd93a1100d35; reminder_sweep_passes:reminder_sweep_passes_staff_select:r:true:authenticated:1bd97827756803e4680c3e6625a09158:-' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. authenticated holds exactly SELECT and INSERT on each table, of the eight table privileges',
       auth_profile, 'reminder_claims INSERT,SELECT; reminder_sweep_passes INSERT,SELECT',
       CASE WHEN auth_profile = 'reminder_claims INSERT,SELECT; reminder_sweep_passes INSERT,SELECT' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. anon, patient, service_role and PUBLIC hold nothing on either table (control: the owner holds DELETE on both)',
       open_cells::text || ' cells, ' || public_items::text || ' PUBLIC items; control ' || owner_delete::text,
       '0 cells, 0 PUBLIC items; control 2',
       CASE WHEN open_cells = 0 AND public_items = 0 AND owner_delete = 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. no column of either table carries a column-level grant', col_grants::text, '0',
       CASE WHEN col_grants = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. no trigger on either table but the foreign keys'' own', user_triggers::text, '0',
       CASE WHEN user_triggers = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. both tables are empty: the migration writes no row',
       n_claims_rows::text || ', ' || n_passes_rows::text, '0, 0',
       CASE WHEN n_claims_rows = 0 AND n_passes_rows = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '15. the table count in public is the pre-check''s plus two', n_tables::text, (:tables_before + 2)::text,
       CASE WHEN n_tables = :tables_before + 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '16. the sequence count in public is the pre-check''s: none was created', n_sequences::text, :'sequences_before',
       CASE WHEN n_sequences = :sequences_before THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '17. every function in public is unchanged, and so is the SECURITY DEFINER count',
       fn_md5 || ', ' || secdef::text, :'functions_md5' || ', ' || :'secdef_before',
       CASE WHEN fn_md5 = :'functions_md5' AND secdef = :secdef_before THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '18. every policy in the database but the four new ones is unchanged', pol_md5, :'policies_md5',
       CASE WHEN pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '19. every privilege on every other relation in public (the new tables and their indexes left out), and every column privilege, is unchanged',
       rel_md5 || ', ' || col_md5, :'relation_acl_md5' || ', ' || :'column_acl_md5',
       CASE WHEN rel_md5 = :'relation_acl_md5' AND col_md5 = :'column_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '20. every default privilege in the database and every trigger in public is unchanged',
       def_md5 || ', ' || trg_md5, :'default_acl_md5' || ', ' || :'triggers_md5',
       CASE WHEN def_md5 = :'default_acl_md5' AND trg_md5 = :'triggers_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '21. the WHOLE grantee list of each table: the owner with all eight, authenticated with SELECT and INSERT, nobody else, no grant option',
       whole_acl,
       'reminder_claims authenticated [INSERT,SELECT]; reminder_claims postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]; reminder_sweep_passes authenticated [INSERT,SELECT]; reminder_sweep_passes postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]',
       CASE WHEN whole_acl = 'reminder_claims authenticated [INSERT,SELECT]; reminder_claims postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]; reminder_sweep_passes authenticated [INSERT,SELECT]; reminder_sweep_passes postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '22. service_role, read directly per privilege on both tables, holds none of them (Q-4; MAINTAIN asked only on a server that has it; VACUOUS unless both tables and the role exist)',
       sr_cells_held::text || ' of ' || sr_cells_n::text || ' held (' || sr_cells_which || ')'
         || '; MAINTAIN asked ' || (sr_verbs_n = 8)::text
         || '; tables ' || sr_tables::text || ', role ' || sr_role_exists::text,
       '0 of ' || (2 * sr_verbs_n)::text || ' held (none); MAINTAIN asked '
         || (current_setting('server_version_num')::int >= 170000)::text || '; tables 2, role true',
       CASE WHEN sr_tables <> 2 OR NOT sr_role_exists OR sr_cells_n = 0 THEN 'VACUOUS'
            WHEN sr_cells_held = 0 AND sr_cells_n = 2 * sr_verbs_n THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '23. service_role holds no column privilege on any column of either table (SELECT, INSERT, UPDATE, REFERENCES per column; any column per table; VACUOUS unless both tables, the role and the columns exist)',
       sr_col_cells_held::text || ' of ' || sr_col_cells_n::text || ' column cells held, ' || sr_any_held::text || ' of '
         || sr_any_n::text || ' tables with any; ' || sr_cols_n::text || ' columns; tables ' || sr_tables::text
         || ', role ' || sr_role_exists::text,
       '0 of 112 column cells held, 0 of 2 tables with any; 28 columns; tables 2, role true',
       CASE WHEN sr_tables <> 2 OR NOT sr_role_exists OR sr_cols_n = 0 THEN 'VACUOUS'
            WHEN sr_col_cells_held = 0 AND sr_any_held = 0 AND sr_any_n = 2 AND sr_cols_n = 28 AND sr_col_cells_n = 112 THEN 'OK'
            ELSE 'FAIL' END FROM j;
