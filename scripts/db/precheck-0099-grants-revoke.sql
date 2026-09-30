-- 0099 PRE-CHECK: the TRUNCATE, TRIGGER, REFERENCES revoke from `authenticated`.
-- READ ONLY. Every verdict must read OK (15 expected); three INFO rows print a
-- profile and are never counted.
--
-- WHAT 0099 DOES (packages/db/migrations-pending/NEXT-AFTER-0098_revoke_truncate_trigger_references.sql,
-- sha256 fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b, promoted
-- to packages/db/migrations/0099_revoke_truncate_trigger_references.sql with no byte
-- changed): a DO loop runs REVOKE TRUNCATE, TRIGGER, REFERENCES ... FROM authenticated
-- on every ordinary and partitioned table in `public`, then
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE the same three ON TABLES FROM
-- authenticated, for the role that runs it (no FOR ROLE clause). Nothing else.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0099 is absent from the journal, by hash. CONTROL: the same count over
--          0098's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0098 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0098's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the promoted journal; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 96 (0000 to 0098; the numbering has gaps);
--   4      the session is `postgres`, the role 0099's ALTER DEFAULT PRIVILEGES acts
--          for (it names no FOR ROLE), and it is a member of `authenticated` and
--          `patient`, so the behaviour check can act as each. CONTROL: the same
--          membership test reads `authenticated` as NOT a member of the session's
--          role (if it were, it would hold every owner privilege through it, and
--          no REVOKE on a table could take TRUNCATE away);
--   5      every ordinary and partitioned table in `public` is owned by the
--          session's role: the REVOKE is run by the owner, so it removes every
--          grant the owner made, and the next table is created by the role whose
--          default 0099 changes. CONTROL: at least one such table exists;
--   6      every TRUNCATE, TRIGGER and REFERENCES grant to `authenticated` on
--          those tables names the session's role as grantor (a REVOKE removes only
--          the grants its runner made). CONTROL: at least one such grant exists
--          (verdict 7's premise), so the count is not over nothing;
--   7      THE PREMISE, TRUNCATE: `authenticated` holds TRUNCATE on n of N tables,
--          n > 0 (the card read 30 of 46 on 2026-09-17). A zero means this is not
--          the database the card measured, and 0099 would change nothing: FAIL.
--          CONTROL: the same has_table_privilege call reads the owner holding
--          TRUNCATE on N of N;
--   8      the same for TRIGGER (the card: 38 of 46), with its control;
--   9      the same for REFERENCES (the card: 38 of 46), with its control;
--   10     no COLUMN-level REFERENCES grant to `authenticated` exists in `public`:
--          a table-level REVOKE REFERENCES also drops the column-level ones, so a
--          non-zero here is a collateral loss 0099 would cause. CONTROL: the same
--          aclexplode predicate counts 1 on a planted aclitem
--          `{authenticated=x/postgres}`;
--   11     THE PREMISE OF THE SECOND HALF: the default ACL entry of the session's
--          role for TABLES in `public` exists and grants `authenticated` all three.
--          CONTROL: the same parse reads all three on a planted
--          `{authenticated=arwdDxtm/postgres}`;
--   12     no GLOBAL default ACL (no IN SCHEMA) of the session's role grants
--          `authenticated` any of the three: a per-schema REVOKE cannot remove a
--          global grant, so 0099's second half would do nothing against one.
--          CONTROL: the planted aclitem of verdict 11 reads all three;
--   13     the three roles the file names exist (`authenticated`, `patient`,
--          `postgres`), and `anon` and `service_role` too, which the DML profile reads;
--   14     secdef_functions_before: the SECURITY DEFINER count in `public`, every
--          one owned by `postgres`. 0099 changes no function, so the post-check
--          wants the same number;
--   CARRY  tables_before (N), truncate_before, trigger_before, references_before;
--   CARRY  policies_md5: every policy in the database, one md5;
--   CARRY  functions_md5: every function in `public` (signature, SECURITY DEFINER,
--          volatility, owner, settings, body md5, ACL), one md5;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5, WITHOUT the items 0099 removes (grantee `authenticated`, an
--          ordinary or partitioned table, TRUNCATE, TRIGGER or REFERENCES). A NULL
--          relacl reads as acldefault(), which is what a REVOKE materialises;
--   CARRY  column_acl_md5: every column privilege in `public`, one md5;
--   CARRY  default_acl_md5: every default privilege in the database, one md5,
--          WITHOUT the three items of `authenticated` in the session role's
--          `public` TABLES entry;
--   CARRY  dml_profile_md5: for `authenticated`, `patient`, `anon` and
--          `service_role`, on every relation in `public`, has_table_privilege for
--          SELECT, INSERT, UPDATE and DELETE, one md5. What the app roles may read
--          and write; the post-check wants it unchanged;
--   INFO   the other creator roles whose `public` TABLES default grants
--          `authenticated` any of the three (on a Supabase project,
--          `supabase_admin`): 0099 cannot change another role's default, and
--          verdict 5 shows no table here was created by one;
--   INFO   MAINTAIN: Postgres 17's eighth table privilege, inside ALL, held by
--          `authenticated` on n of N. 0099 as built (option 1) does not revoke it;
--   INFO   views and materialised views in `public` on which `authenticated`
--          holds TRIGGER: the loop covers relkind r and p only.
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0098's sha256> -v prev_when=<0098's journal when>
--        -f scripts/db/precheck-0099-grants-revoke.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0098 as promoted). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0098''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

\echo ''
\echo '=== 0099 GRANTS REVOKE PRE-CHECK: every verdict must read OK (15 expected) ==='

WITH t AS (
  SELECT c.oid, c.relowner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))) a
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
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations WHERE hash = :'prev_hash')          AS has_0098,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)       AS newest_when,
    current_user::text                                                                         AS me,
    pg_has_role(current_user, 'authenticated', 'MEMBER')                                       AS me_auth,
    pg_has_role(current_user, 'patient', 'MEMBER')                                             AS me_patient,
    pg_has_role('authenticated', current_user, 'MEMBER')                                       AS auth_in_me,
    (SELECT count(*)::int FROM t)                                                              AS n_tables,
    (SELECT count(*)::int FROM t WHERE t.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS not_mine,
    (SELECT count(*)::int FROM t CROSS JOIN LATERAL aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
      WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))                         AS three_grants,
    (SELECT count(*)::int FROM t CROSS JOIN LATERAL aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = t.oid), acldefault('r', t.relowner))) a
      WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        AND a.grantor <> (SELECT oid FROM pg_roles WHERE rolname = current_user))              AS three_other_grantor,
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
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))                  AS dml_md5,
    (SELECT coalesce(string_agg(DISTINCT pg_get_userbyid(defaclrole), ',' ORDER BY pg_get_userbyid(defaclrole)), 'none')
       FROM def_items
      WHERE defaclrole <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND defaclnamespace = 'public'::regnamespace AND objtype = 'r'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))                           AS other_creators,
    (SELECT count(*)::int FROM rel_items
      WHERE kind IN ('r', 'p') AND privilege_type = 'MAINTAIN'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS auth_maintain,
    (SELECT count(*)::int FROM rel_items
      WHERE kind IN ('v', 'm') AND privilege_type = 'TRIGGER'
        AND grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))              AS view_trigger
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. 0099 is absent from the journal, by hash (control: the same count finds 0098 once)',
       has_0099::text || '; control ' || has_0098::text, '0; control 1',
       CASE WHEN has_0099 = 0 AND has_0098 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. 0098 is present by hash, once, as the newest row, at its journal when',
       has_0098::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0098' ELSE 'is NOT 0098' END
         || ', when ' || coalesce(newest_when, 'none'),
       '1 row, newest is 0098, when ' || :'prev_when',
       CASE WHEN has_0098 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '96',
       CASE WHEN journal_rows = 96 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the session is postgres, a member of authenticated and patient (control: authenticated is no member of it)',
       me || ', authenticated ' || me_auth::text || ', patient ' || me_patient::text || '; control ' || auth_in_me::text,
       'postgres, authenticated true, patient true; control false',
       CASE WHEN me = 'postgres' AND me_auth AND me_patient AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. every ordinary and partitioned table in public is owned by the session role (control: there is one)',
       not_mine::text || ' not owned, of ' || n_tables::text, '0 not owned, of more than 0',
       CASE WHEN not_mine = 0 AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. every grant of the three to authenticated names the session role as grantor (control: one exists)',
       three_other_grantor::text || ' with another grantor, of ' || three_grants::text, '0, of more than 0',
       CASE WHEN three_other_grantor = 0 AND three_grants > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. PREMISE: authenticated holds TRUNCATE on some tables (control: the owner holds it on every one)',
       auth_truncate::text || ' of ' || n_tables::text || '; control ' || own_truncate::text || ' of ' || n_tables::text,
       'more than 0; control all',
       CASE WHEN auth_truncate > 0 AND own_truncate = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. PREMISE: authenticated holds TRIGGER on some tables (control: the owner holds it on every one)',
       auth_trigger::text || ' of ' || n_tables::text || '; control ' || own_trigger::text || ' of ' || n_tables::text,
       'more than 0; control all',
       CASE WHEN auth_trigger > 0 AND own_trigger = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. PREMISE: authenticated holds REFERENCES on some tables (control: the owner holds it on every one)',
       auth_references::text || ' of ' || n_tables::text || '; control ' || own_references::text || ' of ' || n_tables::text,
       'more than 0; control all',
       CASE WHEN auth_references > 0 AND own_references = n_tables AND n_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. no column-level REFERENCES grant to authenticated in public (control: a planted one counts 1)',
       col_refs::text || '; control ' || col_refs_control::text, '0; control 1',
       CASE WHEN col_refs = 0 AND col_refs_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. PREMISE: the session role''s public TABLES default grants authenticated all three (control: planted)',
       def_entry::text || ' entry, authenticated ' || def_auth_privs || '; control ' || planted_three::text,
       '1 entry, holding REFERENCES, TRIGGER and TRUNCATE; control 3',
       CASE WHEN def_entry = 1 AND def_three = 3 AND planted_three = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. no GLOBAL default of the session role grants authenticated any of the three (control: planted)',
       global_three::text || '; control ' || planted_three::text, '0; control 3',
       CASE WHEN global_three = 0 AND planted_three = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. the five roles the checks name exist', roles_named::text, '5',
       CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'more than 0, every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'truncate_before', auth_truncate::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'trigger_before', auth_trigger::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'references_before', auth_references::text, 'a count', 'CARRY' FROM j
UNION ALL SELECT 'policies_md5', pol_md5, '32 hex characters', CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', fn_md5, '32 hex characters', CASE WHEN fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'relation_acl_md5', rel_md5, '32 hex characters', CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'column_acl_md5', col_md5, '32 hex characters', CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'default_acl_md5', def_md5, '32 hex characters', CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'dml_profile_md5', dml_md5, '32 hex characters', CASE WHEN dml_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'INFO other creator roles whose public TABLES default grants authenticated the three', other_creators, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO MAINTAIN held by authenticated (not revoked by option 1 as built)', auth_maintain::text || ' of ' || n_tables::text, 'a profile', 'INFO' FROM j
UNION ALL SELECT 'INFO views and materialised views on which authenticated holds TRIGGER (outside the loop)', view_trigger::text, 'a profile', 'INFO' FROM j;

ROLLBACK;
