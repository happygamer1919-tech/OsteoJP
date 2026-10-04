-- 0101 POST-CHECK: the optional email on a public booking request.
-- READ ONLY. Every verdict must read OK (19 expected). Run inside the block's own
-- `begin read only`, so the server refuses any write this file could contain.
-- Counts and catalogue facts only: no name, no phone, no address and no id is read.
--
-- EVERY CHANGE 0101 MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      THE COLUMN: public.guest_booking_requests has exactly one column named
--          `email`; it is `text`, NULLABLE, has no default, no stored "missing"
--          value, is not generated and not an identity, is the table's LAST column
--          and carries no column-level grant. CONTROL: the same read finds
--          `locale` as text and nullable, so it is not a blind instrument;
--   2      THE CHECK: one constraint named guest_booking_requests_email_check, a
--          CHECK, validated, whose definition as the server prints it hashes to
--          the pinned md5 (read on Postgres 17.6: NULL, or at most 320 characters
--          and the three-part shape). CONTROL: the locale CHECK is found by the
--          same read;
--   3      THE COMMENT: the column's comment hashes to the md5 of the text in the
--          migration file (scripts/guest-request-email-0101.test.mjs derives it);
--   4      NO ROW WAS REWRITTEN: the table's file node is the pre-check's. A
--          rewrite (a default, a type change) would have given it a new one;
--   5      EVERY OTHER COLUMN IS UNCHANGED: the table has one column more than
--          eighteen, and all but `email` hash to table_columns_md5;
--   6      EVERY OTHER CONSTRAINT AND EVERY INDEX IS UNCHANGED: all constraints but
--          the new CHECK hash to table_constraints_md5, and the indexes to
--          table_indexes_md5;
--   7      WHO READS AND WRITES IT: for `authenticated`, `anon`, `patient` and
--          `service_role`, the column privileges on `email` (SELECT, INSERT,
--          UPDATE, REFERENCES) are exactly those on `phone`; `authenticated` may
--          SELECT and UPDATE it and may not INSERT it; `anon` and `patient` may do
--          nothing with it. CONTROL: the profile is printed, and it is not empty;
--   8      row level security is still ON and not forced, with the same two
--          policies, each TO `authenticated` alone: the new column is behind them;
--   9      every policy in the database hashes to policies_md5;
--   10     every function in `public` hashes to functions_md5, and the SECURITY
--          DEFINER count equals secdef_before: 0101 changes no function;
--   11     every privilege on every relation in `public` hashes to
--          relation_acl_md5: 0101 granted and revoked nothing;
--   12     every column privilege in `public` hashes to column_acl_md5;
--   13     every default privilege in the database hashes to default_acl_md5;
--   14     what the app roles may SELECT, INSERT, UPDATE and DELETE on every
--          relation in `public` hashes to dml_profile_md5;
--   15     the table count in `public` is the pre-check's: nothing was created;
--   16     NO BACKFILL: no row holds an email. The count of rows is printed beside
--          it as the profile. The application does not write the column until its
--          own pull request merges, after this apply;
--   17     the journal reads journal_rows_before + 1;
--   18     0101's sha256 is in the journal exactly once, as the newest row.
--
-- NOT A STANDING INVARIANT for 9 to 16: the next migration that grants, adds a
-- policy or a table moves them, and the application will write emails. It is an
-- assertion about this apply.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<n> -v tables_before=<n> -v secdef_before=<n>
--        -v relfilenode_before=<n> -v table_columns_md5=<md5>
--        -v table_constraints_md5=<md5> -v table_indexes_md5=<md5>
--        -v policies_md5=<md5> -v functions_md5=<md5> -v relation_acl_md5=<md5>
--        -v column_acl_md5=<md5> -v default_acl_md5=<md5> -v dml_profile_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0101-guest-request-email.sql -c "rollback"

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
\if :{?relfilenode_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v relfilenode_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?table_columns_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v table_columns_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?table_constraints_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v table_constraints_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?table_indexes_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v table_indexes_md5 is missing. This file refuses to guess.'; END $missing$;
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
\echo '=== 0101 GUEST REQUEST EMAIL POST-CHECK: every verdict must read OK (19 expected) ==='

WITH g AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
   WHERE c.oid = 'public.guest_booking_requests'::regclass
), e AS (
  SELECT a.attnum, format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull, a.atthasdef, a.atthasmissing,
         a.attgenerated::text AS gen, a.attidentity::text AS ident, a.attacl
    FROM pg_attribute a, g
   WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'email'
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
), colpriv AS (
  SELECT col.name AS col, r.rolname, v.verb, has_column_privilege(r.oid, g.oid, col.name, v.verb) AS held
    FROM g
    CROSS JOIN (VALUES ('email'), ('phone')) col(name)
    CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role')) r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) v(verb)
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b')          AS has_0101,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT count(*)::int FROM e)                                                              AS col_email,
    (SELECT coalesce(string_agg(typ || ':notnull ' || attnotnull::text || ':default ' || atthasdef::text
              || ':missing ' || atthasmissing::text || ':generated [' || gen || ']:identity [' || ident || ']:acl '
              || CASE WHEN attacl IS NULL THEN 'none' ELSE 'SOME' END, ' | '), 'no column') FROM e)   AS col_shape,
    (SELECT coalesce(max(attnum), -1) FROM e)                                                  AS col_num,
    (SELECT max(a.attnum) FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped)                          AS last_num,
    (SELECT coalesce(string_agg(format_type(a.atttypid, a.atttypmod) || ':notnull ' || a.attnotnull::text, ' | '), 'no column')
       FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'locale')  AS locale_shape,
    (SELECT coalesce(string_agg(k.contype::text || ':validated ' || k.convalidated::text || ':' || md5(pg_get_constraintdef(k.oid)), ' | '), 'no constraint')
       FROM pg_constraint k, g
      WHERE k.conrelid = g.oid AND k.conname = 'guest_booking_requests_email_check')            AS con_shape,
    (SELECT count(*)::int FROM pg_constraint k, g
      WHERE k.conrelid = g.oid AND k.conname = 'guest_booking_requests_locale_check')           AS con_locale,
    (SELECT coalesce(md5(col_description(g.oid, (SELECT attnum FROM e))), 'no comment') FROM g)   AS comment_md5,
    (SELECT pg_relation_filenode(g.oid)::text FROM g)                                           AS filenode,
    (SELECT count(*)::int FROM pg_attribute a, g
      WHERE a.attrelid = g.oid AND a.attnum > 0 AND NOT a.attisdropped)                          AS n_cols,
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
    (SELECT coalesce(string_agg(rolname || ' ' || verb || ' ' || held::text, ', ' ORDER BY rolname, verb), 'none')
       FROM colpriv WHERE col = 'email')                                                        AS email_profile,
    (SELECT coalesce(string_agg(rolname || ' ' || verb || ' ' || held::text, ', ' ORDER BY rolname, verb), 'none')
       FROM colpriv WHERE col = 'phone')                                                        AS phone_profile,
    (SELECT count(*)::int FROM colpriv WHERE col = 'email' AND rolname = 'authenticated'
        AND ((verb IN ('SELECT', 'UPDATE') AND held) OR (verb = 'INSERT' AND NOT held)))        AS auth_cells,
    (SELECT count(*)::int FROM colpriv WHERE col = 'email' AND rolname IN ('anon', 'patient') AND held) AS open_cells,
    (SELECT g.relrowsecurity FROM g)                                                            AS rls_on,
    (SELECT g.relforcerowsecurity FROM g)                                                       AS rls_forced,
    (SELECT coalesce(string_agg(p.polcmd::text || ':'
              || array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), '+'),
              ',' ORDER BY p.polcmd::text), 'none')
       FROM pg_policy p, g WHERE p.polrelid = g.oid)                                            AS tbl_policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
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
    (SELECT count(*)::int FROM public.guest_booking_requests WHERE email IS NOT NULL)           AS n_with_email
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the column email: text, nullable, no default, no missing value, the last column, no column grant (control: locale)',
       col_email::text || ' column: ' || col_shape || ', position ' || col_num::text || ' of ' || last_num::text || '; control ' || locale_shape,
       '1 column: text:notnull false:default false:missing false:generated []:identity []:acl none, the last position; control text:notnull false',
       CASE WHEN col_email = 1 AND col_shape = 'text:notnull false:default false:missing false:generated []:identity []:acl none'
             AND col_num = last_num AND locale_shape = 'text:notnull false' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. the CHECK guest_booking_requests_email_check: a validated CHECK with the pinned definition (control: the locale CHECK)',
       con_shape || '; control ' || con_locale::text,
       'c:validated true:8fb8b1817bea63cae0a61617d76fed3f; control 1',
       CASE WHEN con_shape = 'c:validated true:8fb8b1817bea63cae0a61617d76fed3f' AND con_locale = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. the column''s comment is the migration''s text', comment_md5, '193eac8a030e2d17698369590db934a9',
       CASE WHEN comment_md5 = '193eac8a030e2d17698369590db934a9' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. no row was rewritten: the table''s file node is the pre-check''s', filenode, :'relfilenode_before',
       CASE WHEN filenode = :'relfilenode_before' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. every other column of the table is unchanged, and there are nineteen',
       n_cols::text || ' columns, ' || tcol_md5, '19 columns, ' || :'table_columns_md5',
       CASE WHEN n_cols = 19 AND tcol_md5 = :'table_columns_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. every other constraint and every index of the table is unchanged',
       tcon_md5 || ', ' || tidx_md5, :'table_constraints_md5' || ', ' || :'table_indexes_md5',
       CASE WHEN tcon_md5 = :'table_constraints_md5' AND tidx_md5 = :'table_indexes_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. email is read and written by exactly the roles that read and write phone: authenticated SELECT and UPDATE, no INSERT; anon and patient nothing',
       email_profile, phone_profile,
       CASE WHEN email_profile = phone_profile AND email_profile <> 'none' AND auth_cells = 3 AND open_cells = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. row level security is on, not forced, with one SELECT and one UPDATE policy, each TO authenticated alone',
       'on ' || rls_on::text || ', forced ' || rls_forced::text || ', policies ' || tbl_policies,
       'on true, forced false, policies r:authenticated,w:authenticated',
       CASE WHEN rls_on AND NOT rls_forced AND tbl_policies = 'r:authenticated,w:authenticated' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. every policy in the database is unchanged', pol_md5, :'policies_md5',
       CASE WHEN pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. every function in public is unchanged, and so is the SECURITY DEFINER count',
       fn_md5 || ', ' || secdef::text, :'functions_md5' || ', ' || :'secdef_before',
       CASE WHEN fn_md5 = :'functions_md5' AND secdef = :secdef_before THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. every privilege on every relation in public is unchanged', rel_md5, :'relation_acl_md5',
       CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. every column privilege in public is unchanged', col_md5, :'column_acl_md5',
       CASE WHEN col_md5 = :'column_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. every default privilege in the database is unchanged', def_md5, :'default_acl_md5',
       CASE WHEN def_md5 = :'default_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. what the app roles may SELECT, INSERT, UPDATE and DELETE in public is unchanged', dml_md5, :'dml_profile_md5',
       CASE WHEN dml_md5 = :'dml_profile_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '15. the table count in public is the pre-check''s', n_tables::text, :'tables_before',
       CASE WHEN n_tables = :tables_before THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '16. no backfill: no row holds an email (the row count is the profile)',
       n_with_email::text || ' with an email, of ' || n_rows::text || ' rows', '0 with an email',
       CASE WHEN n_with_email = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '17. the journal moved by exactly one', journal_rows::text, (:journal_rows_before + 1)::text,
       CASE WHEN journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '18. 0101 is in the journal by hash, once, as the newest row',
       has_0101::text || ', newest ' || CASE WHEN newest_hash = '36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b' THEN 'is 0101' ELSE 'is NOT 0101' END,
       '1, newest is 0101',
       CASE WHEN has_0101 = 1 AND newest_hash = '36a1ed543133fea9b27b2449dcc1de62a50e41c4a29d80987dc8db0b4241cb5b' THEN 'OK' ELSE 'FAIL' END FROM j;
