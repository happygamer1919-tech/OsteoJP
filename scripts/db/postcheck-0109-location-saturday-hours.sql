-- 0109 POST-CHECK: a Saturday opening and closing time per clinic
-- (locations.saturday_opens_at and locations.saturday_closes_at, and the CHECK
-- locations_saturday_hours_valid).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- FOURTEEN VERDICTS. Thirteen are OK or FAIL; verdict 7 (every existing row is
-- NULL in both new columns) is OK, VACUOUS or FAIL, and reads VACUOUS exactly
-- when public.locations has no row, because "every row" of no rows proves
-- nothing. The SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no FAIL": 14 OK / 0 VACUOUS / 0 FAIL,
-- and no other. Stage 1 has already stopped on a database with no active
-- clinic, so a VACUOUS here is a STOP, never a pass.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only` (psql -c "begin read only" -f <this file> -c "rollback"), so
-- the server is what refuses a write; verdict 0 reads FAIL if it is run outside
-- one. It prints FAIL rows and exits 0: the block counts the verdicts.
--
-- THE MIGRATION (packages/db/migrations/0109_location_saturday_hours.sql,
-- sha256 ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a)
-- adds two columns and one CHECK to public.locations, comments both columns,
-- and touches nothing else. So:
--   0      the transaction is READ ONLY;
--   1      the session is `postgres`. CONTROL: `authenticated` is NOT a member;
--   2      the session reads locations past its policies (control:
--          authenticated does not), so verdict 7 counts every row;
--   3      saturday_opens_at IS THERE ONCE: time without time zone, nullable,
--          no default, and its comment the migration's, by md5;
--   4      saturday_closes_at, the same, with its own comment;
--   5      THE CHECK IS THERE ONCE in public, on public.locations, a CHECK
--          (contype c), VALIDATED, and its definition, as pg_get_constraintdef
--          renders it, is exactly the migration's;
--   6      THE CHECK'S STORED EXPRESSION, read from the catalogue
--          (pg_get_expr of conbin) and evaluated on six literal pairs, with
--          nothing written: both NULL and 09:00 to 13:00 are admitted; 09:00
--          alone, 13:00 alone, 13:00 to 09:00 and 09:00 to 09:00 are refused.
--          A CHECK refuses a row only when its expression is FALSE (NULL
--          admits), so "refused" here is "IS FALSE". This proves the stored
--          expression without a write. That the server enforces it on the
--          table is proven by the DB-gated suite in CI
--          (packages/db/tests/location-saturday-hours.db.test.ts) and by the
--          rehearsal; no block writes on production to prove it;
--   7      EVERY EXISTING ROW IS NULL IN BOTH NEW COLUMNS, and the row count is
--          the carry locations_rows (VACUOUS when there is no row). The counts
--          are read by a DO block, by name, only once both columns exist, so a
--          database without them prints FAIL here instead of an error;
--   8      THE GRANTS ON THE NEW COLUMNS ARE THOSE ON opens_at: the md5 of what
--          PUBLIC, anon, authenticated, patient, postgres and service_role may
--          do to opens_at (has_column_privilege) is the carry
--          opens_at_grants_md5, and each new column's md5 is the same; and no
--          column of locations carries a column-level grant;
--   9      THE REST OF locations IS UNCHANGED: every column but the two new
--          ones, every constraint but the new one, every trigger, every index
--          and the row level security flags, read exactly as the pre-check read
--          them, give the carry locations_shape_md5;
--   10     EVERY POLICY IS UNCHANGED: the count and the md5 equal the carries;
--   11     EVERY PRIVILEGE ON EVERY RELATION IN public IS UNCHANGED (the md5
--          equals the carry);
--   12     0109 IS IN THE JOURNAL ONCE, BY HASH, AS THE NEWEST ROW, at its
--          journal when 1788503100000. CONTROL: 0108 is found once;
--   13     THE JOURNAL MOVED BY EXACTLY ONE from journal_rows_before.
--
-- THE CARRIES are required: each -v below must be passed, or the file refuses
-- to guess one, before any verdict prints.
--
-- Run (the apply document's stage 2 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before=... (seven carries)
--        -c "begin read only" -f scripts/db/postcheck-0109-location-saturday-hours.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing (the pre-check''s verdict 11 row). This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?relation_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v relation_acl_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?locations_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v locations_rows is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?locations_shape_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v locations_shape_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?opens_at_grants_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v opens_at_grants_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif

SET LOCAL row_security = off;
-- The same search_path as the pre-check, so every expression renders the same way.
SET LOCAL search_path = public;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 12 and 13 instead of ending the file before any other verdict.
DO $journal$
DECLARE
  v_rows   integer;
  v_new    integer;
  v_prev   integer;
  v_hash   text;
  v_when   text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('sathours.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a',
          '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('sathours.journal', 'read', true);
  PERFORM set_config('sathours.journal_rows', v_rows::text, true);
  PERFORM set_config('sathours.has_new', v_new::text, true);
  PERFORM set_config('sathours.has_prev', v_prev::text, true);
  PERFORM set_config('sathours.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('sathours.newest_when', coalesce(v_when, ''), true);
END
$journal$;

-- VERDICT 6: the CHECK's stored expression, evaluated on literal pairs. Nothing
-- is written: each pair is a one-row SELECT whose two columns carry the new
-- columns' names, so the expression pg_get_expr prints reads them.
DO $expr$
DECLARE
  v_expr  text;
  v_ok    boolean;
  v_out   text := '';
  v_pair  record;
BEGIN
  SELECT pg_get_expr(c.conbin, c.conrelid)
    INTO v_expr
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.locations') AND c.conname = 'locations_saturday_hours_valid' AND c.contype = 'c';
  IF v_expr IS NULL THEN
    PERFORM set_config('sathours.expr', 'absent', true);
    RETURN;
  END IF;
  FOR v_pair IN
    SELECT k, o, c
      FROM (VALUES (1, NULL::time, NULL::time), (2, time '09:00', time '13:00'), (3, time '09:00', NULL::time),
                   (4, NULL::time, time '13:00'), (5, time '13:00', time '09:00'), (6, time '09:00', time '09:00')) AS v(k, o, c)
     ORDER BY k
  LOOP
    EXECUTE format('SELECT (%s) IS NOT FALSE FROM (SELECT $1 AS saturday_opens_at, $2 AS saturday_closes_at) AS l', v_expr)
      INTO v_ok
      USING v_pair.o, v_pair.c;
    v_out := v_out || CASE WHEN v_ok THEN 'admitted' ELSE 'refused' END || CASE WHEN v_pair.k < 6 THEN ',' ELSE '' END;
  END LOOP;
  PERFORM set_config('sathours.expr', v_out, true);
END
$expr$;

-- VERDICT 7: the rows, counted by name only once both columns exist.
DO $rows$
DECLARE
  v_rows  integer;
  v_set   integer;
BEGIN
  IF (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid = to_regclass('public.locations') AND NOT a.attisdropped
         AND a.attname IN ('saturday_opens_at', 'saturday_closes_at')) <> 2 THEN
    PERFORM set_config('sathours.rows', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE saturday_opens_at IS NOT NULL OR saturday_closes_at IS NOT NULL))::int
             FROM public.locations'
    INTO v_rows, v_set;
  PERFORM set_config('sathours.rows', 'read', true);
  PERFORM set_config('sathours.rows_n', v_rows::text, true);
  PERFORM set_config('sathours.rows_set', v_set::text, true);
END
$rows$;

\echo ''
\echo '=== 0109 SATURDAY HOURS POST-CHECK: 14 verdicts; verdict 7 may read VACUOUS only when locations has no row, and the block stops on it; the SUMMARY row prints the profile ==='

WITH rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
), grant_roles (r) AS (
  VALUES ('anon'), ('authenticated'), ('patient'), ('postgres'), ('public'), ('service_role')
), grant_privs (p) AS (
  VALUES ('INSERT'), ('REFERENCES'), ('SELECT'), ('UPDATE')
), grant_items AS (
  SELECT a.attname::text AS col, gr.r, gp.p, has_column_privilege(gr.r::name, a.attrelid, a.attnum, gp.p) AS allowed
    FROM pg_attribute a
    CROSS JOIN grant_roles gr
    CROSS JOIN grant_privs gp
   WHERE a.attrelid = 'public.locations'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('opens_at', 'saturday_opens_at', 'saturday_closes_at')
), grants_by_col AS (
  SELECT col, string_agg(r || ':' || p || ':' || allowed::text, ',' ORDER BY r, p) AS g
    FROM grant_items
   GROUP BY col
), shape_items AS (
  SELECT 'col:' || a.attnum::text || ':' || a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':'
         || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || coalesce(a.attacl::text, '-') AS item
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.locations'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('saturday_opens_at', 'saturday_closes_at')
  UNION ALL
  SELECT 'con:' || c.conname::text || ':' || c.contype::text || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
   WHERE c.conrelid = 'public.locations'::regclass AND c.conname <> 'locations_saturday_hours_valid'
  UNION ALL
  SELECT 'trg:' || t.tgname::text || ':' || pg_get_triggerdef(t.oid)
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.locations'::regclass
  UNION ALL
  SELECT 'idx:' || i.indexrelid::regclass::text || ':' || pg_get_indexdef(i.indexrelid)
    FROM pg_index i
   WHERE i.indrelid = 'public.locations'::regclass
  UNION ALL
  SELECT 'rls:' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || c.relkind::text
    FROM pg_class c
   WHERE c.oid = 'public.locations'::regclass
), col_shape AS (
  SELECT a.attname::text AS col,
         format_type(a.atttypid, a.atttypmod) || '/' || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'nullable' END
         || '/' || CASE WHEN a.atthasdef THEN 'a default' ELSE 'no default' END
         || '/' || coalesce(md5(col_description(a.attrelid, a.attnum)), 'no comment') AS shape
    FROM pg_attribute a
   WHERE a.attrelid = 'public.locations'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('saturday_opens_at', 'saturday_closes_at')
), j AS (
  SELECT
    coalesce(current_setting('sathours.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('sathours.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('sathours.has_new', true), '')::int                                   AS has_0109,
    nullif(current_setting('sathours.has_prev', true), '')::int                                  AS has_0108,
    current_setting('sathours.newest_hash', true)                                                AS newest_hash,
    current_setting('sathours.newest_when', true)                                                AS newest_when,
    coalesce(current_setting('sathours.expr', true), 'not read')                                 AS expr_result,
    coalesce(current_setting('sathours.rows', true), 'not read')                                 AS rows_state,
    nullif(current_setting('sathours.rows_n', true), '')::int                                    AS rows_n,
    nullif(current_setting('sathours.rows_set', true), '')::int                                  AS rows_set,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = current_user AND c.oid = 'public.locations'::regclass) AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = 'authenticated' AND c.oid = 'public.locations'::regclass) AS auth_past_rls,
    (SELECT count(*)::int FROM col_shape WHERE col = 'saturday_opens_at')                       AS so_n,
    (SELECT shape FROM col_shape WHERE col = 'saturday_opens_at')                               AS so_shape,
    (SELECT count(*)::int FROM col_shape WHERE col = 'saturday_closes_at')                      AS sc_n,
    (SELECT shape FROM col_shape WHERE col = 'saturday_closes_at')                              AS sc_shape,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname = 'locations_saturday_hours_valid')               AS con_named,
    (SELECT c.contype::text || '/' || CASE WHEN c.convalidated THEN 'validated' ELSE 'NOT VALID' END
            || ' ' || pg_get_constraintdef(c.oid)
       FROM pg_constraint c
      WHERE c.conrelid = 'public.locations'::regclass AND c.conname = 'locations_saturday_hours_valid') AS con_shape,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attacl IS NOT NULL)                                                               AS col_acls,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'opens_at')                                   AS opens_grants_md5,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'saturday_opens_at')                          AS so_grants_md5,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'saturday_closes_at')                         AS sc_grants_md5,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM shape_items)            AS shape_md5,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. this session reads locations past its policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unknown') || '; control ' || coalesce(auth_past_rls::text, 'unknown'), 'true; control false',
         CASE WHEN me_past_rls AND auth_past_rls = false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. saturday_opens_at is there once: time, nullable, no default, and the migration''s comment by md5',
         so_n::text || '; ' || coalesce(so_shape, 'absent'),
         '1; time without time zone/nullable/no default/16b8e2cb90a4143e8a770cae666ee0db',
         CASE WHEN so_n = 1 AND so_shape = 'time without time zone/nullable/no default/16b8e2cb90a4143e8a770cae666ee0db' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. saturday_closes_at is there once: time, nullable, no default, and the migration''s comment by md5',
         sc_n::text || '; ' || coalesce(sc_shape, 'absent'),
         '1; time without time zone/nullable/no default/f88333bab7d166e367ae610e590e0ea3',
         CASE WHEN sc_n = 1 AND sc_shape = 'time without time zone/nullable/no default/f88333bab7d166e367ae610e590e0ea3' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the CHECK locations_saturday_hours_valid is there once, on locations, validated, with the migration''s definition',
         con_named::text || ' named; ' || coalesce(con_shape, 'absent'),
         '1 named; c/validated CHECK ((((saturday_opens_at IS NULL) AND (saturday_closes_at IS NULL)) OR ((saturday_opens_at IS NOT NULL) AND (saturday_closes_at IS NOT NULL) AND (saturday_closes_at > saturday_opens_at))))',
         CASE WHEN con_named = 1
               AND con_shape = 'c/validated CHECK ((((saturday_opens_at IS NULL) AND (saturday_closes_at IS NULL)) OR ((saturday_opens_at IS NOT NULL) AND (saturday_closes_at IS NOT NULL) AND (saturday_closes_at > saturday_opens_at))))'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the stored expression on six pairs: both NULL, 09:00-13:00 admitted; 09:00 alone, 13:00 alone, 13:00-09:00, 09:00-09:00 refused',
         expr_result, 'admitted,admitted,refused,refused,refused,refused',
         CASE WHEN expr_result = 'admitted,admitted,refused,refused,refused,refused' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. every existing row is NULL in both new columns, and the rows are the ones the pre-check counted',
         CASE WHEN rows_state = 'read' THEN rows_set::text || ' set of ' || rows_n::text || ' rows' ELSE 'not counted (' || rows_state || ')' END,
         '0 set of ' || (:'locations_rows')::int::text || ' rows; VACUOUS at 0 rows',
         CASE WHEN rows_state = 'read' AND rows_n = 0 THEN 'VACUOUS'
              WHEN rows_state = 'read' AND rows_n = (:'locations_rows')::int AND rows_set = 0 THEN 'OK'
              ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the grants on both new columns are those on opens_at, opens_at is as before, and no column carries a column ACL',
         coalesce(opens_grants_md5, 'absent') || ' / ' || coalesce(so_grants_md5, 'absent') || ' / ' || coalesce(sc_grants_md5, 'absent')
           || '; ' || col_acls::text || ' with a column ACL',
         :'opens_at_grants_md5' || ' three times; 0 with a column ACL',
         CASE WHEN opens_grants_md5 ~ '^[0-9a-f]{32}$' AND opens_grants_md5 = :'opens_at_grants_md5'
               AND so_grants_md5 = opens_grants_md5 AND sc_grants_md5 = opens_grants_md5 AND col_acls = 0
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. the rest of locations is unchanged: every other column, constraint, trigger and index, and its RLS flags',
         shape_md5, :'locations_shape_md5',
         CASE WHEN shape_md5 ~ '^[0-9a-f]{32}$' AND shape_md5 = :'locations_shape_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. every policy in the database is unchanged (count and md5)',
         policies::text || '; ' || pol_md5, :'policies_before' || '; ' || :'policies_md5',
         CASE WHEN policies::text = :'policies_before' AND pol_md5 ~ '^[0-9a-f]{32}$' AND pol_md5 = :'policies_md5'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. every privilege on every relation in public is unchanged',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' AND rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. 0109 is in the journal once, by hash, as the newest row, at its journal when (control: 0108 once)',
         CASE WHEN journal_state = 'read'
              THEN has_0109::text || ' row, newest ' || CASE WHEN newest_hash = 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a' THEN 'is 0109' ELSE 'is NOT 0109' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_0108::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0109, when 1788503100000; control 1',
         CASE WHEN journal_state = 'read' AND has_0109 = 1 AND has_0108 = 1
                   AND newest_hash = 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a'
                   AND newest_when = '1788503100000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. the journal moved by exactly one',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END,
         (:journal_rows_before + 1)::text,
         CASE WHEN journal_state = 'read' AND journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '14 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
