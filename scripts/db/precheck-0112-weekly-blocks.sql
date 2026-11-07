-- 0112 PRE-CHECK: the weekly block table, therapist_weekly_blocks.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- RUN ON THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON),
-- where it read 10 OK / 0 VACUOUS / 0 FAIL. Never run on production. Authored 2026-11-03 from 0109's and
-- 0106's pre-checks for the 0112 apply document. It becomes
-- scripts/db/precheck-0112-weekly-blocks.sql in the apply document set; its
-- sha256 is pinned only after a rehearsal ran it.
--
-- The caller asserts the PROFILE: 10 OK / 0 VACUOUS / 0 FAIL, and no other.
-- Five CARRY rows feed the post-check (with verdict 9's row, journal_rows_before).
--
-- WHAT THE MIGRATION DOES (packages/db/migrations/0112_weekly_blocks.sql, sha256
-- 7f35aeb49ec02aafc70fc3391be97661f598f94eaa86c2d2bfe857b95116e350): three SET
-- LOCAL lines; CREATE TABLE public.therapist_weekly_blocks with its CHECKs and
-- unique key and comment; RLS on; REVOKE ALL from PUBLIC, anon, authenticated,
-- patient and service_role, then SELECT, INSERT and DELETE to authenticated;
-- foreign keys to tenants (NO ACTION) and users (CASCADE on user_id, SET NULL on
-- created_by); three policies last. It alters no existing table but by the
-- three foreign keys' own triggers. No function, no sequence, no row.
--
--   0   the transaction is READ ONLY;
--   1   the session is postgres. CONTROL: authenticated is not a member of it;
--   2   no relation therapist_weekly_blocks and no relation
--       therapist_weekly_blocks_dedupe_uq in public. CONTROL: time_off is found;
--   3   no constraint of the seven new names in public and no policy of the
--       three new names. CONTROL: users has its primary key, once;
--   4   the four functions the migration calls exist: public.jwt_tenant_id(),
--       public.jwt_role(), auth.uid(), gen_random_uuid();
--   5   the five roles exist;
--   6   the server is Postgres 17;
--   7   0112 is absent from the journal, by hash. CONTROL: 0111 is found once;
--   8   0111 is the newest row, by hash, at its journal when 1788503300000;
--   9   journal_rows_before: exactly 109;
--   CARRY policies_before, policies_md5, relation_acl_md5, tables_before;
--   CARRY tenants_users_shape_md5: tenants and users as they stand (columns,
--         constraints, triggers, indexes, RLS flags). The post-check reads them
--         without the triggers the new foreign keys add, and wants the same md5;
--   INFO  the server version; the locks other sessions hold on tenants and
--         users now; idle_in_transaction_session_timeout.
--
-- Run (stage 1 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin read only" -f scripts/db/precheck-0112-weekly-blocks.sql -c "rollback"

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
\echo '=== 0112 WEEKLY BLOCKS PRE-CHECK: every verdict must read OK (10 expected); the SUMMARY row prints the profile ==='

WITH rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public'
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
    (CASE WHEN to_regclass('public.therapist_weekly_blocks') IS NULL THEN 0 ELSE 1 END
     + CASE WHEN to_regclass('public.therapist_weekly_blocks_dedupe_uq') IS NULL THEN 0 ELSE 1 END) AS new_rels,
    (to_regclass('public.time_off') IS NOT NULL)                                                 AS rel_control,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname IN ('therapist_weekly_blocks_pkey', 'therapist_weekly_blocks_weekday_range',
                          'therapist_weekly_blocks_start_before_end', 'therapist_weekly_blocks_dedupe_uq',
                          'therapist_weekly_blocks_tenant_id_fkey', 'therapist_weekly_blocks_user_id_fkey',
                          'therapist_weekly_blocks_created_by_fkey'))                               AS con_named,
    (SELECT count(*)::int FROM pg_policy p
      WHERE p.polname IN ('therapist_weekly_blocks_staff_select', 'therapist_weekly_blocks_staff_insert',
                          'therapist_weekly_blocks_staff_delete'))                                  AS pol_named,
    (SELECT count(*)::int FROM pg_constraint c
      WHERE c.conrelid = 'public.users'::regclass AND c.contype = 'p')                             AS con_control,
    ((CASE WHEN to_regprocedure('public.jwt_tenant_id()') IS NULL THEN 0 ELSE 1 END)
     + (CASE WHEN to_regprocedure('public.jwt_role()') IS NULL THEN 0 ELSE 1 END)
     + (CASE WHEN to_regprocedure('auth.uid()') IS NULL THEN 0 ELSE 1 END)
     + (CASE WHEN to_regprocedure('gen_random_uuid()') IS NULL THEN 0 ELSE 1 END))                AS helpers,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))          AS roles_named,
    current_setting('server_version_num')::int                                                    AS server_num,
    current_setting('server_version')                                                             AS server_version,
    (SELECT count(*)::int FROM pg_policy)                                                         AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT count(*)::int FROM rel_items)                                                         AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                           AS rel_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                     AS n_tables,
    (SELECT count(*)::int FROM tu_items)                                                          AS n_tu_items,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM tu_items)                 AS tu_md5,
    (SELECT count(*)::int FROM pg_locks l
      WHERE l.relation IN ('public.tenants'::regclass, 'public.users'::regclass) AND l.pid <> pg_backend_pid()) AS other_locks_tu,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')        AS idle_in_tx
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only') AS observed, 'on' AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. no relation therapist_weekly_blocks and no relation therapist_weekly_blocks_dedupe_uq in public (control: time_off is found)',
         new_rels::text || ' of 2; control ' || rel_control::text, '0 of 2; control true',
         CASE WHEN new_rels = 0 AND rel_control THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. no constraint of the seven new names and no policy of the three new names (control: users has one primary key)',
         con_named::text || ' constraints, ' || pol_named::text || ' policies; control ' || con_control::text,
         '0 constraints, 0 policies; control 1',
         CASE WHEN con_named = 0 AND pol_named = 0 AND con_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. the four functions the migration calls exist (jwt_tenant_id, jwt_role, auth.uid, gen_random_uuid)',
         helpers::text || ' of 4', '4 of 4',
         CASE WHEN helpers = 4 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the five roles the grant fingerprint names exist',
         roles_named::text || ' roles', '5 roles',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the server is Postgres 17 (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. 0112 is absent from the journal, by hash (control: the same count finds 0111 once)',
         CASE WHEN journal_state = 'read' THEN has_new::text || '; control ' || has_prev::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_new = 0 AND has_prev = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. 0111 is the newest row of the journal, by hash, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN 'newest ' || CASE WHEN newest_hash = 'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f' THEN 'is 0111' ELSE 'is NOT 0111' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         'newest is 0111, when 1788503300000',
         CASE WHEN journal_state = 'read' AND newest_hash = 'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f'
                   AND newest_when = '1788503300000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '109 (verdict 9)',
         CASE WHEN journal_state = 'read' AND journal_rows = 109 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'policies_md5', pol_md5, '32 hex characters',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 24, 'tenants_users_shape_md5', tu_md5, '32 hex characters, over ' || n_tu_items::text || ' items',
         CASE WHEN tu_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO locks other sessions hold on tenants and users now', other_locks_tu::text, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '10 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
