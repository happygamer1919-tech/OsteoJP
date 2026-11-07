-- 0109 PRE-CHECK: a Saturday opening and closing time per clinic
-- (locations.saturday_opens_at and locations.saturday_closes_at, and the CHECK
-- locations_saturday_hours_valid).
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- EVERY VERDICT IS OK OR FAIL (none can read VACUOUS), and the SUMMARY row prints
-- the profile:
--     N OK / M VACUOUS / K FAIL
-- The caller asserts the PROFILE, never "no FAIL". Twelve verdicts, every one
-- OK or FAIL: 12 OK / 0 VACUOUS / 0 FAIL, and no other. Six CARRY rows feed the
-- post-check (with verdict 11's row, journal_rows_before), and the INFO rows
-- print a profile and are never counted.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only` (psql -c "begin read only" -f <this file> -c "rollback"), so
-- the server is what refuses a write; verdict 0 reads FAIL if it is run outside
-- one. It prints FAIL rows and exits 0: the block counts the verdicts and stops
-- on any FAIL, on any VACUOUS and on an OK count that is not 12.
--
-- WHAT THE MIGRATION DOES (packages/db/migrations/0109_location_saturday_hours.sql,
-- sha256 ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a): the
-- two SET LOCAL lines; one ALTER TABLE public.locations adding two nullable
-- `time` columns with no default and the CHECK locations_saturday_hours_valid;
-- a comment on each column. No grant, no policy, no function, no row.
--
-- THE JOURNAL VERDICTS, 9 TO 11, pin 0108 (sha256
-- 7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb, journal
-- when 1788502900000) as production's newest row, 0109 as absent, and 106 rows
-- (0000 to 0108; the numbering has gaps). The journal is read by a DO block, by
-- name, so on a database with no drizzle journal verdicts 9 to 11 read FAIL
-- with "no journal table" and every other verdict still prints. No journal is
-- never a pass.
--
-- SO THIS FILE PROVES THE STARTING POINT EXACTLY:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      the session is `postgres`, the role that will own the change.
--          CONTROL: `authenticated` is NOT a member of it;
--   2      THE SESSION READS locations PAST ITS POLICIES: it has BYPASSRLS, or
--          is a superuser, or owns the table while row level security is not
--          FORCED on it. The carry locations_rows rests on that; the
--          transaction also sets row_security = off, so a session the policies
--          do bind ERRORs on its first read instead of reading a filtered zero.
--          CONTROL: the same test reads false for `authenticated`;
--   3      NEITHER NEW COLUMN IS THERE: no column saturday_opens_at and no
--          column saturday_closes_at on public.locations. The migration's ADD
--          COLUMN (not IF NOT EXISTS) would fail on one. CONTROL: opens_at is
--          found by the same read;
--   4      THE CHECK IS NOT THERE: no constraint named
--          locations_saturday_hours_valid anywhere in public. CONTROL:
--          locations_open_before_close (0085) is found once by the same read;
--   5      NO COLUMN OF locations CARRIES A COLUMN-LEVEL GRANT, the premise of
--          the migration's section 2: every privilege on the table is
--          table-level, so the new columns get exactly what opens_at has.
--          CONTROL: authenticated may SELECT opens_at, so a table-level grant
--          does reach the columns;
--   6      opens_at AND closes_at ARE time without time zone, the type the new
--          pair takes and the app reads the same way;
--   7      the five roles the grant fingerprint names exist (postgres,
--          authenticated, anon, patient, service_role);
--   8      THE SERVER IS POSTGRES 17, the version on which every rendering the
--          post-check pins was read. CONTROL: server_version_num parses;
--   9      0109 IS ABSENT FROM THE JOURNAL, BY HASH. CONTROL: the same count over
--          the same rows finds 0108 once, so a zero here is never the count of
--          an empty or unreadable journal;
--   10     0108 IS THE NEWEST ROW (the highest id), by hash, at its journal when
--          1788502900000;
--   11     journal_rows_before: exactly 106. Its row is named for the carry, so
--          the post-check's journal verdict reads the number this sitting read;
--   CARRY  policies_before and policies_md5: every policy in the database, a
--          count and one md5. The migration creates and drops none;
--   CARRY  relation_acl_md5: every privilege on every relation in `public`, one
--          md5. A NULL relacl reads as acldefault() of the relation's own object
--          type;
--   CARRY  locations_rows: how many rows public.locations holds. The post-check
--          wants the same number, every one NULL in both new columns;
--   CARRY  locations_shape_md5: the rest of public.locations as it stands, one
--          md5: every column (number, name, type, NOT NULL, default, column
--          ACL) but the two new names, every constraint but the new one (name,
--          type, definition), every trigger, every index, and the row level
--          security flags. The post-check reads the same items the same way and
--          wants the same md5: nothing but the two columns and the CHECK moved;
--   CARRY  opens_at_grants_md5: what each of PUBLIC, anon, authenticated,
--          patient, postgres and service_role may do to opens_at (SELECT,
--          INSERT, UPDATE, REFERENCES, by has_column_privilege), one md5. The
--          post-check wants opens_at unchanged and each new column equal to it;
--   INFO   the server version;
--   INFO   the clinics as they are, counts only: rows, active rows, active rows
--          whose weekday hours are set;
--   INFO   the opens_at grants, as the string the md5 is taken over;
--   INFO   the locks other sessions hold on public.locations right now (the
--          ALTER TABLE waits behind every one of them, up to lock_timeout);
--   INFO   idle_in_transaction_session_timeout, as this session reads it.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without the table, a role
-- or a column named in the profile, the statement is an error and psql exits 3
-- before any verdict prints.
--
-- Run (the apply document's stage 1 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin read only" -f scripts/db/precheck-0109-location-saturday-hours.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

-- Verdict 2's control against a filtered zero: a session that row level
-- security binds ERRORs on its first read of an RLS table here.
SET LOCAL row_security = off;
-- Every expression below is rendered with THIS search_path, whatever the
-- session's own is. The post-check renders the same way.
SET LOCAL search_path = public;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 9 to 11 instead of ending the file before any other verdict.
-- set_config(..., true) is transaction-local and is allowed in a READ ONLY
-- transaction.
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

\echo ''
\echo '=== 0109 SATURDAY HOURS PRE-CHECK: every verdict must read OK (12 expected); the SUMMARY row prints the profile ==='

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
), j AS (
  SELECT
    coalesce(current_setting('sathours.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('sathours.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('sathours.has_new', true), '')::int                                   AS has_0109,
    nullif(current_setting('sathours.has_prev', true), '')::int                                  AS has_0108,
    current_setting('sathours.newest_hash', true)                                                AS newest_hash,
    current_setting('sathours.newest_when', true)                                                AS newest_when,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = current_user AND c.oid = 'public.locations'::regclass) AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = 'authenticated' AND c.oid = 'public.locations'::regclass) AS auth_past_rls,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND NOT a.attisdropped
        AND a.attname IN ('saturday_opens_at', 'saturday_closes_at'))                            AS new_cols,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND NOT a.attisdropped AND a.attname = 'opens_at') AS opens_control,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname = 'locations_saturday_hours_valid')               AS con_named,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname = 'locations_open_before_close'
        AND c.conrelid = 'public.locations'::regclass)                                          AS con_control,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attacl IS NOT NULL)                                                               AS col_acls,
    has_column_privilege('authenticated', 'public.locations'::regclass, 'opens_at', 'SELECT')    AS auth_reads_opens,
    (SELECT string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attname)
       FROM pg_attribute a
      WHERE a.attrelid = 'public.locations'::regclass AND NOT a.attisdropped
        AND a.attname IN ('opens_at', 'closes_at'))                                             AS hour_types,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))        AS roles_named,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
    (SELECT count(*)::int FROM pg_policy)                                                       AS policies,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace) AS pol_md5,
    (SELECT count(*)::int FROM rel_items)                                                       AS n_rel_items,
    (SELECT md5(coalesce(string_agg(
              rel || ':' || kind || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY rel, grantee, privilege_type, grantor), ''))
       FROM rel_items)                                                                         AS rel_md5,
    (SELECT count(*)::int FROM public.locations)                                                AS loc_rows,
    (SELECT 'rows ' || count(*) || '; active ' || count(*) FILTER (WHERE is_active)
            || '; active with weekday hours set ' || count(*) FILTER (WHERE is_active AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
       FROM public.locations)                                                                   AS loc_profile,
    (SELECT count(*)::int FROM shape_items)                                                     AS n_shape_items,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM shape_items)            AS shape_md5,
    (SELECT g FROM grants_by_col WHERE col = 'opens_at')                                        AS opens_grants,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'opens_at')                                   AS opens_grants_md5,
    (SELECT count(*)::int FROM pg_locks l
      WHERE l.relation = 'public.locations'::regclass AND l.pid <> pg_backend_pid())            AS other_locks,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx
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
  UNION ALL SELECT 3, '3. neither saturday_opens_at nor saturday_closes_at is on locations (control: opens_at is found)',
         new_cols::text || ' of 2; control ' || opens_control::text, '0 of 2; control 1',
         CASE WHEN new_cols = 0 AND opens_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. no constraint named locations_saturday_hours_valid is in public (control: locations_open_before_close is found once)',
         con_named::text || ' named; control ' || con_control::text, '0 named; control 1',
         CASE WHEN con_named = 0 AND con_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. no column of locations carries a column-level grant (control: authenticated may SELECT opens_at)',
         col_acls::text || ' with a column ACL; control ' || auth_reads_opens::text, '0 with a column ACL; control true',
         CASE WHEN col_acls = 0 AND auth_reads_opens THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. opens_at and closes_at are time without time zone, the type the new pair takes',
         coalesce(hour_types, 'absent'), 'closes_at time without time zone, opens_at time without time zone',
         CASE WHEN hour_types = 'closes_at time without time zone, opens_at time without time zone' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the five roles the grant fingerprint names exist',
         roles_named::text || ' roles', '5 roles',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. the server is Postgres 17, where every pinned rendering was read (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. 0109 is absent from the journal, by hash (control: the same count finds 0108 once)',
         CASE WHEN journal_state = 'read' THEN has_0109::text || '; control ' || has_0108::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_0109 = 0 AND has_0108 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. 0108 is the newest row of the journal, by hash, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN 'newest ' || CASE WHEN newest_hash = '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb' THEN 'is 0108' ELSE 'is NOT 0108' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         'newest is 0108, when 1788502900000',
         CASE WHEN journal_state = 'read' AND newest_hash = '7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb'
                   AND newest_when = '1788502900000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '106 (verdict 11)',
         CASE WHEN journal_state = 'read' AND journal_rows = 106 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'policies_md5', pol_md5, '32 hex characters',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'locations_rows', loc_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 24, 'locations_shape_md5', shape_md5, '32 hex characters, over ' || n_shape_items::text || ' items',
         CASE WHEN shape_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 25, 'opens_at_grants_md5', coalesce(opens_grants_md5, 'absent'), '32 hex characters',
         CASE WHEN opens_grants_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO the clinics as they are (counts; no row is touched)', loc_profile, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO the opens_at grants, role:privilege:allowed', coalesce(opens_grants, 'absent'), 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 43, 'INFO locks other sessions hold on locations now', other_locks::text, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 44, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '12 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
