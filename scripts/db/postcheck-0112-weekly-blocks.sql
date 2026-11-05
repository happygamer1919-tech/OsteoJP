-- 0112 POST-CHECK: the weekly block table, therapist_weekly_blocks.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only.
--
-- RUN ON THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON),
-- where it read 20 OK / 0 VACUOUS / 0 FAIL. Never run on production. Authored 2026-11-03 from 0109's and
-- 0106's post-checks. It becomes scripts/db/postcheck-0112-weekly-blocks.sql in
-- the apply document set; its sha256 is pinned only after a rehearsal ran it.
-- CONFIRMED BY THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON):
-- verdict 6's three definitions, first pinned without a database, are exactly
-- what the server printed; verdict 9's three policy-expression md5s were read
-- there (0106's way) and are written in below; this post-check read 20 OK
-- there. A later difference is a fix to this file, never a loosened verdict.
--
-- The caller asserts the PROFILE: 20 OK / 0 VACUOUS / 0 FAIL, and no other.
--
--   0   the transaction is READ ONLY;
--   1   the session is postgres. CONTROL: authenticated is not a member of it;
--   2   the table exists once in public: ordinary, owned by postgres, RLS on and
--       not forced. CONTROL: time_off is found;
--   3   its eight columns, in order, with type, NOT NULL and default;
--   4   its seven constraints by name and type, every one validated;
--   5   the three foreign keys: columns, targets, ON DELETE (tenant NO ACTION,
--       user_id CASCADE, created_by SET NULL), ON UPDATE, MATCH;
--   6   the two CHECK definitions and the unique key's, as the server prints them;
--   7   its two indexes, unique and valid;
--   8   its three policies (r SELECT, a INSERT, d DELETE), permissive, TO
--       authenticated alone, which of USING and WITH CHECK each has; none for
--       UPDATE or ALL;
--   9   the three policy expressions by md5, as read on the rehearsal;
--   10  its whole grantee list: the owner with the eight table privileges and
--       authenticated with DELETE, INSERT and SELECT; nobody else; no column
--       grant; no grant option;
--   11  no trigger on it but the foreign keys' own;
--   12  it is empty;
--   13  its comment is the migration's text, exactly;
--   14  the table count in public is the pre-check's plus one;
--   15  every policy but the three new ones is unchanged, and the count is the
--       pre-check's plus three;
--   16  every privilege on every relation in public but the new table and its
--       two indexes is unchanged;
--   17  tenants and users are as before, but for the new keys' own triggers;
--   18  0112 is in the journal once, by hash, as the newest row, at its when
--       1788503400000. CONTROL: 0111 is found once;
--   19  the journal moved by exactly one.
--
-- Run (stage 2 runs exactly this, with its six carries):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -v journal_rows_before=<n> -v policies_before=<n> -v policies_md5=<md5>
--        -v relation_acl_md5=<md5> -v tables_before=<n> -v tenants_users_shape_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0112-weekly-blocks.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

SET LOCAL row_security = off;
SET LOCAL search_path = public;

DO $journal$
DECLARE
  v_rows integer;
  v_new  integer;
  v_prev integer;
  v_hash text;
  v_when text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('apply0112.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING '7f35aeb49ec02aafc70fc3391be97661f598f94eaa86c2d2bfe857b95116e350',
          'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('apply0112.journal', 'read', true);
  PERFORM set_config('apply0112.journal_rows', v_rows::text, true);
  PERFORM set_config('apply0112.has_new', v_new::text, true);
  PERFORM set_config('apply0112.has_prev', v_prev::text, true);
  PERFORM set_config('apply0112.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('apply0112.newest_when', coalesce(v_when, ''), true);
END
$journal$;

\echo ''
\echo '=== 0112 WEEKLY BLOCKS POST-CHECK: every verdict must read OK (20 expected); the SUMMARY row prints the profile ==='

WITH wb AS (
  SELECT to_regclass('public.therapist_weekly_blocks') AS oid
), wb_rels AS (
  SELECT oid FROM wb WHERE oid IS NOT NULL
  UNION ALL
  SELECT i.indexrelid FROM pg_index i, wb WHERE i.indrelid = wb.oid
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public' AND c.oid NOT IN (SELECT oid FROM wb_rels)
), expected_defs (conname, def) AS (
  VALUES
  ('therapist_weekly_blocks_dedupe_uq', 'UNIQUE (tenant_id, user_id, weekday, start_time, end_time)'),
  ('therapist_weekly_blocks_start_before_end', 'CHECK ((start_time < end_time))'),
  ('therapist_weekly_blocks_weekday_range', 'CHECK (((weekday >= 0) AND (weekday <= 6)))')
), tu_items AS (
  SELECT 'col:' || a.attrelid::regclass::text || ':' || a.attnum::text || ':' || a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':'
         || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || coalesce(a.attacl::text, '-') AS item
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid IN ('public.tenants'::regclass, 'public.users'::regclass) AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'con:' || c.conrelid::regclass::text || ':' || c.conname::text || ':' || c.contype::text || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
   WHERE c.conrelid IN ('public.tenants'::regclass, 'public.users'::regclass)
  UNION ALL
  SELECT 'trg:' || t.tgrelid::regclass::text || ':' || t.tgname::text || ':' || pg_get_triggerdef(t.oid)
    FROM pg_trigger t
   WHERE t.tgrelid IN ('public.tenants'::regclass, 'public.users'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.oid = t.tgconstraint AND k.conrelid = to_regclass('public.therapist_weekly_blocks'))
  UNION ALL
  SELECT 'idx:' || i.indexrelid::regclass::text || ':' || pg_get_indexdef(i.indexrelid)
    FROM pg_index i
   WHERE i.indrelid IN ('public.tenants'::regclass, 'public.users'::regclass)
  UNION ALL
  SELECT 'rls:' || c.oid::regclass::text || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || c.relkind::text
    FROM pg_class c
   WHERE c.oid IN ('public.tenants'::regclass, 'public.users'::regclass)
), fk_items AS (
  SELECT k.conrelid::regclass::text || '.' || k.conname::text || ' ('
         || array_to_string(array(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(num, ord)
                                    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.num ORDER BY u.ord), ',')
         || ') -> ' || k.confrelid::regclass::text || ' ('
         || array_to_string(array(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(num, ord)
                                    JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.num ORDER BY u.ord), ',')
         || ') del ' || k.confdeltype::text || ' upd ' || k.confupdtype::text || ' match ' || k.confmatchtype::text AS item,
         k.conname::text AS conname
    FROM pg_constraint k JOIN wb ON k.conrelid = wb.oid
   WHERE k.contype = 'f'
), j AS (
  SELECT
    coalesce(current_setting('apply0112.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('apply0112.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('apply0112.has_new', true), '')::int                                   AS has_new,
    nullif(current_setting('apply0112.has_prev', true), '')::int                                  AS has_prev,
    current_setting('apply0112.newest_hash', true)                                                AS newest_hash,
    current_setting('apply0112.newest_when', true)                                                AS newest_when,
    current_user::text                                                                           AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                         AS auth_in_me,
    (SELECT coalesce(string_agg(c.relkind::text || ':' || pg_get_userbyid(c.relowner) || ':rls ' || c.relrowsecurity::text
              || ':forced ' || c.relforcerowsecurity::text, ', '), 'absent')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'therapist_weekly_blocks')                       AS wb_profile,
    (to_regclass('public.time_off') IS NOT NULL)                                                 AS rel_control,
    (SELECT coalesce(string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) || ' '
              || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'),
              '; ' ORDER BY a.attnum), 'none')
       FROM pg_attribute a
       JOIN wb ON a.attrelid = wb.oid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped)                                                  AS wb_cols,
    (SELECT coalesce(string_agg(c.conname::text || ':' || c.contype::text || ':' || c.convalidated::text, ', ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN wb ON c.conrelid = wb.oid)                                       AS wb_cons,
    (SELECT coalesce(string_agg(item, '; ' ORDER BY conname), 'none') FROM fk_items)              AS fk_profile,
    (SELECT count(*)::int FROM pg_constraint c JOIN wb ON c.conrelid = wb.oid
      WHERE c.conname IN (SELECT conname FROM expected_defs)
        AND pg_get_constraintdef(c.oid) = (SELECT e.def FROM expected_defs e WHERE e.conname = c.conname)) AS defs_ok,
    (SELECT coalesce(string_agg(c.conname::text || ' = ' || pg_get_constraintdef(c.oid), ' ; ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN wb ON c.conrelid = wb.oid
      WHERE c.conname IN (SELECT conname FROM expected_defs)
        AND pg_get_constraintdef(c.oid) IS DISTINCT FROM (SELECT e.def FROM expected_defs e WHERE e.conname = c.conname)) AS defs_diff,
    (SELECT coalesce(string_agg(i.indexrelid::regclass::text || ':' || i.indisunique::text || ':' || i.indisvalid::text, ', '
              ORDER BY i.indexrelid::regclass::text), 'none')
       FROM pg_index i JOIN wb ON i.indrelid = wb.oid)                                            AS wb_idx,
    (SELECT coalesce(string_agg(p.polname::text || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || CASE WHEN p.polqual IS NULL THEN '-' ELSE 'q' END
              || ':' || CASE WHEN p.polwithcheck IS NULL THEN '-' ELSE 'c' END, ', ' ORDER BY p.polname), 'none')
       FROM pg_policy p JOIN wb ON p.polrelid = wb.oid)                                           AS wb_pols,
    (SELECT coalesce(string_agg(p.polname::text || ' ' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ' ' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'), '; ' ORDER BY p.polname), 'none')
       FROM pg_policy p JOIN wb ON p.polrelid = wb.oid)                                           AS wb_pol_md5s,
    (SELECT coalesce(string_agg(x.who || ' [' || x.privs || ']' || CASE WHEN x.grantable THEN ' WITH GRANT' ELSE '' END, '; ' ORDER BY x.who), 'none')
       FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS who,
                    string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privs,
                    bool_or(a.is_grantable) AS grantable
               FROM pg_class c JOIN wb ON c.oid = wb.oid
               CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
              GROUP BY 1) x)                                                                     AS wb_acl,
    (SELECT count(*)::int FROM pg_attribute att JOIN wb ON att.attrelid = wb.oid
      WHERE att.attnum > 0 AND att.attacl IS NOT NULL)                                            AS wb_col_acls,
    (SELECT count(*)::int FROM pg_trigger t JOIN wb ON t.tgrelid = wb.oid WHERE NOT t.tgisinternal) AS wb_user_triggers,
    (SELECT count(*)::int FROM public.therapist_weekly_blocks)                                    AS wb_rows,
    (obj_description((SELECT oid FROM wb), 'pg_class')
       = 'Bloqueios de repeticao semanal (Fisiozero''s "Modo REPETICAO SEMANAL", owner '
  'request 2026-11-02): a therapist is blocked every <weekday> (0 = Sunday .. '
  '6 = Saturday) from <start_time> to <end_time>, Lisbon wall clock, with no end '
  'date, until the row is deleted. Read wherever time_off is read for '
  'availability, with the same "Guardar mesmo assim" override on the staff side. '
  'No update path. Written by owner, admin and reception of the tenant, and by a '
  'therapist for their own rules.')                                                              AS comment_ok,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                     AS n_tables,
    (SELECT count(*)::int FROM pg_policy)                                                         AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid IS DISTINCT FROM (SELECT oid FROM wb))                                         AS pol_md5,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                           AS rel_md5,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM tu_items)                 AS tu_md5
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only') AS observed, 'on' AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. therapist_weekly_blocks exists once in public: ordinary, owned by postgres, RLS on, not forced (control: time_off is found)',
         wb_profile || '; control ' || rel_control::text, 'r:postgres:rls true:forced false; control true',
         CASE WHEN wb_profile = 'r:postgres:rls true:forced false' AND rel_control THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. its eight columns, in order, with type, NOT NULL and default',
         wb_cols,
         'id uuid NOT NULL gen_random_uuid(); tenant_id uuid NOT NULL -; user_id uuid NOT NULL -; weekday smallint NOT NULL -; start_time time without time zone NOT NULL -; end_time time without time zone NOT NULL -; created_at timestamp with time zone NOT NULL now(); created_by uuid NULL -',
         CASE WHEN wb_cols = 'id uuid NOT NULL gen_random_uuid(); tenant_id uuid NOT NULL -; user_id uuid NOT NULL -; weekday smallint NOT NULL -; start_time time without time zone NOT NULL -; end_time time without time zone NOT NULL -; created_at timestamp with time zone NOT NULL now(); created_by uuid NULL -' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. its seven constraints, by name and type, every one validated',
         wb_cons,
         'therapist_weekly_blocks_created_by_fkey:f:true, therapist_weekly_blocks_dedupe_uq:u:true, therapist_weekly_blocks_pkey:p:true, therapist_weekly_blocks_start_before_end:c:true, therapist_weekly_blocks_tenant_id_fkey:f:true, therapist_weekly_blocks_user_id_fkey:f:true, therapist_weekly_blocks_weekday_range:c:true',
         CASE WHEN wb_cons = 'therapist_weekly_blocks_created_by_fkey:f:true, therapist_weekly_blocks_dedupe_uq:u:true, therapist_weekly_blocks_pkey:p:true, therapist_weekly_blocks_start_before_end:c:true, therapist_weekly_blocks_tenant_id_fkey:f:true, therapist_weekly_blocks_user_id_fkey:f:true, therapist_weekly_blocks_weekday_range:c:true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the three foreign keys: columns, target, ON DELETE (a no action, c cascade, n set null), ON UPDATE, MATCH (s simple)',
         fk_profile,
         'therapist_weekly_blocks.therapist_weekly_blocks_created_by_fkey (created_by) -> users (id) del n upd a match s; therapist_weekly_blocks.therapist_weekly_blocks_tenant_id_fkey (tenant_id) -> tenants (id) del a upd a match s; therapist_weekly_blocks.therapist_weekly_blocks_user_id_fkey (user_id) -> users (id) del c upd a match s',
         CASE WHEN fk_profile = 'therapist_weekly_blocks.therapist_weekly_blocks_created_by_fkey (created_by) -> users (id) del n upd a match s; therapist_weekly_blocks.therapist_weekly_blocks_tenant_id_fkey (tenant_id) -> tenants (id) del a upd a match s; therapist_weekly_blocks.therapist_weekly_blocks_user_id_fkey (user_id) -> users (id) del c upd a match s' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the two CHECK definitions and the unique key, as the server prints them (confirmed on the rehearsal; any difference is printed)',
         defs_ok::text || ' of 3 match; differing: ' || defs_diff, '3 of 3 match; differing: none',
         CASE WHEN defs_ok = 3 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. its two indexes, unique and valid',
         wb_idx, 'therapist_weekly_blocks_dedupe_uq:true:true, therapist_weekly_blocks_pkey:true:true',
         CASE WHEN wb_idx = 'therapist_weekly_blocks_dedupe_uq:true:true, therapist_weekly_blocks_pkey:true:true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. its three policies (d DELETE, a INSERT, r SELECT), permissive, TO authenticated alone, USING (q) and WITH CHECK (c) as written; none for UPDATE or ALL',
         wb_pols,
         'therapist_weekly_blocks_staff_delete:d:true:authenticated:q:-, therapist_weekly_blocks_staff_insert:a:true:authenticated:-:c, therapist_weekly_blocks_staff_select:r:true:authenticated:q:-',
         CASE WHEN wb_pols = 'therapist_weekly_blocks_staff_delete:d:true:authenticated:q:-, therapist_weekly_blocks_staff_insert:a:true:authenticated:-:c, therapist_weekly_blocks_staff_select:r:true:authenticated:q:-' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. the three policy expressions, by md5 of what the server prints (read on the rehearsal of 2026-11-03)',
         wb_pol_md5s,
         'therapist_weekly_blocks_staff_delete bdf8e301033421f221de0c196ee93555 -; therapist_weekly_blocks_staff_insert - a55bb1fb9f6af0efbdb25fc79f564bdd; therapist_weekly_blocks_staff_select 991888d347baf196859fa6009b0c4757 -',
         CASE WHEN wb_pol_md5s = 'therapist_weekly_blocks_staff_delete bdf8e301033421f221de0c196ee93555 -; therapist_weekly_blocks_staff_insert - a55bb1fb9f6af0efbdb25fc79f564bdd; therapist_weekly_blocks_staff_select 991888d347baf196859fa6009b0c4757 -' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. its whole grantee list: the owner with all eight, authenticated with DELETE, INSERT and SELECT, nobody else, no column grant, no grant option',
         wb_acl || '; column ACLs ' || wb_col_acls::text,
         'authenticated [DELETE,INSERT,SELECT]; postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]; column ACLs 0',
         CASE WHEN wb_acl = 'authenticated [DELETE,INSERT,SELECT]; postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]' AND wb_col_acls = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. no trigger on the table but the foreign keys'' own', wb_user_triggers::text, '0',
         CASE WHEN wb_user_triggers = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. the table is empty: the migration writes no row', wb_rows::text, '0',
         CASE WHEN wb_rows = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. its comment is the migration''s text, exactly', coalesce(comment_ok::text, 'no comment'), 'true',
         CASE WHEN comment_ok THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. the table count in public is the pre-check''s plus one',
         n_tables::text, (:tables_before + 1)::text,
         CASE WHEN n_tables = :tables_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 15, '15. every policy but the three new ones is unchanged, and the count is the pre-check''s plus three',
         policies::text || ' ' || pol_md5, (:policies_before + 3)::text || ' ' || :'policies_md5',
         CASE WHEN policies = :policies_before + 3 AND pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 16, '16. every privilege on every relation in public but the new table and its indexes is unchanged',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 17, '17. tenants and users are as before, but for the new keys'' own triggers',
         tu_md5, :'tenants_users_shape_md5',
         CASE WHEN tu_md5 = :'tenants_users_shape_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 18, '18. 0112 is in the journal once, by hash, as the newest row, at its journal when (control: 0111 is found once)',
         CASE WHEN journal_state = 'read'
              THEN has_new::text || ' row, newest ' || CASE WHEN newest_hash = '7f35aeb49ec02aafc70fc3391be97661f598f94eaa86c2d2bfe857b95116e350' THEN 'is 0112' ELSE 'is NOT 0112' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_prev::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0112, when 1788503400000; control 1',
         CASE WHEN journal_state = 'read' AND has_new = 1 AND has_prev = 1
                   AND newest_hash = '7f35aeb49ec02aafc70fc3391be97661f598f94eaa86c2d2bfe857b95116e350'
                   AND newest_when = '1788503400000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 19, '19. the journal moved by exactly one: its rows are the pre-check''s plus one',
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
         '20 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
