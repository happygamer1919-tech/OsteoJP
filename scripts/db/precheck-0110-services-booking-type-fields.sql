-- 0110 PRE-CHECK: the appointment-type columns on services (color, vat_rate,
-- vat_exemption_code, follow_up_days, sms_reminders) and their four CHECKs.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only: no
-- name and no row of anyone is printed.
--
-- RUN ON THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON),
-- where it read 11 OK / 0 VACUOUS / 0 FAIL. Never run on production. Authored 2026-11-03 from 0109's pre-check,
-- for the 0110 apply document. It becomes
-- scripts/db/precheck-0110-services-booking-type-fields.sql in the apply
-- document set, and its sha256 is pinned there only after a rehearsal ran it.
--
-- EVERY VERDICT IS OK OR FAIL (none can read VACUOUS), and the SUMMARY row prints
-- the profile. The caller asserts the PROFILE: 11 OK / 0 VACUOUS / 0 FAIL, and no
-- other. Seven CARRY rows feed the post-check (with verdict 10's row,
-- journal_rows_before), and the INFO rows are never counted.
--
-- THE FILE CONTROLS NO TRANSACTION OF ITS OWN. It runs inside its block's own
-- `begin read only`; verdict 0 reads FAIL outside one. It prints FAIL rows and
-- exits 0: the block counts the verdicts.
--
-- WHAT THE MIGRATION DOES (packages/db/migrations/0110_services_booking_type_fields.sql,
-- sha256 e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e): the
-- two SET LOCAL lines; one ALTER TABLE public.services adding four nullable
-- columns with no default, one boolean NOT NULL DEFAULT true, and four named
-- CHECKs; a comment on each column. No grant, no policy, no function, no row.
--
--   0   the transaction is READ ONLY;
--   1   the session is postgres. CONTROL: authenticated is not a member of it;
--   2   the session reads services past its policies (BYPASSRLS, superuser, or
--       owner while RLS is not forced). CONTROL: authenticated does not;
--   3   none of the five new columns is on services. CONTROL: price_cents is;
--   4   no constraint of the four new names is in public. CONTROL:
--       services_tenant_id_tenants_id_fk (0000) is found once;
--   5   no column of services carries a column-level grant, the migration's
--       section 2 premise. CONTROL: authenticated may SELECT name;
--   6   the five roles the grant fingerprint names exist;
--   7   the server is Postgres 17;
--   8   0110 is absent from the journal, by hash. CONTROL: 0109 is found once;
--   9   0109 is the newest row, by hash, at its journal when 1788503100000;
--   10  journal_rows_before: exactly 107;
--   CARRY policies_before, policies_md5, relation_acl_md5 (as 0109's);
--   CARRY services_rows; services_shape_md5 (every column but the five new
--         names, every constraint but the four new names, every trigger, every
--         index, the RLS flags); name_grants_md5 (what PUBLIC, anon,
--         authenticated, patient, postgres and service_role may do to name);
--         services_filenode (pg_relation_filenode: the post-check wants the
--         same number, the proof that no row was rewritten);
--   INFO  the server version; services counts; the name grants as a string;
--         the locks other sessions hold on services now;
--         idle_in_transaction_session_timeout.
--
-- Run (stage 1 runs exactly this, inside its own transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin read only" -f scripts/db/precheck-0110-services-booking-type-fields.sql -c "rollback"

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
    PERFORM set_config('apply0110.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING 'e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e',
          'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('apply0110.journal', 'read', true);
  PERFORM set_config('apply0110.journal_rows', v_rows::text, true);
  PERFORM set_config('apply0110.has_new', v_new::text, true);
  PERFORM set_config('apply0110.has_prev', v_prev::text, true);
  PERFORM set_config('apply0110.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('apply0110.newest_when', coalesce(v_when, ''), true);
END
$journal$;

\echo ''
\echo '=== 0110 SERVICES TYPE FIELDS PRE-CHECK: every verdict must read OK (11 expected); the SUMMARY row prints the profile ==='

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
), name_grants AS (
  SELECT string_agg(gr.r || ':' || gp.p || ':' || has_column_privilege(gr.r::name, 'public.services'::regclass, 'name', gp.p)::text, ',' ORDER BY gr.r, gp.p) AS g
    FROM grant_roles gr CROSS JOIN grant_privs gp
), shape_items AS (
  SELECT 'col:' || a.attnum::text || ':' || a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':'
         || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || coalesce(a.attacl::text, '-') AS item
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.services'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('color', 'vat_rate', 'vat_exemption_code', 'follow_up_days', 'sms_reminders')
  UNION ALL
  SELECT 'con:' || c.conname::text || ':' || c.contype::text || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
   WHERE c.conrelid = 'public.services'::regclass
     AND c.conname NOT IN ('services_color_hex', 'services_vat_rate_allowed', 'services_vat_exemption_code_allowed', 'services_follow_up_days_allowed')
  UNION ALL
  SELECT 'trg:' || t.tgname::text || ':' || pg_get_triggerdef(t.oid)
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.services'::regclass
  UNION ALL
  SELECT 'idx:' || i.indexrelid::regclass::text || ':' || pg_get_indexdef(i.indexrelid)
    FROM pg_index i
   WHERE i.indrelid = 'public.services'::regclass
  UNION ALL
  SELECT 'rls:' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || c.relkind::text
    FROM pg_class c
   WHERE c.oid = 'public.services'::regclass
), j AS (
  SELECT
    coalesce(current_setting('apply0110.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('apply0110.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('apply0110.has_new', true), '')::int                                   AS has_new,
    nullif(current_setting('apply0110.has_prev', true), '')::int                                  AS has_prev,
    current_setting('apply0110.newest_hash', true)                                                AS newest_hash,
    current_setting('apply0110.newest_when', true)                                                AS newest_when,
    current_user::text                                                                           AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                         AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = current_user AND c.oid = 'public.services'::regclass) AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = 'authenticated' AND c.oid = 'public.services'::regclass) AS auth_past_rls,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.services'::regclass AND NOT a.attisdropped
        AND a.attname IN ('color', 'vat_rate', 'vat_exemption_code', 'follow_up_days', 'sms_reminders')) AS new_cols,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.services'::regclass AND NOT a.attisdropped AND a.attname = 'price_cents') AS col_control,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname IN ('services_color_hex', 'services_vat_rate_allowed', 'services_vat_exemption_code_allowed', 'services_follow_up_days_allowed')) AS con_named,
    (SELECT count(*)::int FROM pg_constraint c
      WHERE c.conrelid = 'public.services'::regclass AND c.conname = 'services_tenant_id_tenants_id_fk') AS con_control,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.services'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attacl IS NOT NULL)                                                                 AS col_acls,
    has_column_privilege('authenticated', 'public.services'::regclass, 'name', 'SELECT')          AS auth_reads_name,
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
    (SELECT count(*)::int FROM public.services)                                                   AS svc_rows,
    (SELECT 'rows ' || count(*) || '; active ' || count(*) FILTER (WHERE is_active)
       FROM public.services)                                                                     AS svc_profile,
    (SELECT count(*)::int FROM shape_items)                                                       AS n_shape_items,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM shape_items)              AS shape_md5,
    (SELECT g FROM name_grants)                                                                   AS name_grants,
    (SELECT md5(g) FROM name_grants)                                                              AS name_grants_md5,
    pg_relation_filenode('public.services'::regclass)::bigint                                     AS filenode,
    (SELECT count(*)::int FROM pg_locks l
      WHERE l.relation = 'public.services'::regclass AND l.pid <> pg_backend_pid())               AS other_locks,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')        AS idle_in_tx
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only') AS observed, 'on' AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. the session is postgres (control: authenticated is no member of it)',
         me || '; control ' || auth_in_me::text, 'postgres; control false',
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. this session reads services past its policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unknown') || '; control ' || coalesce(auth_past_rls::text, 'unknown'), 'true; control false',
         CASE WHEN me_past_rls AND auth_past_rls = false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. none of the five new columns is on services (control: price_cents is found)',
         new_cols::text || ' of 5; control ' || col_control::text, '0 of 5; control 1',
         CASE WHEN new_cols = 0 AND col_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. no constraint of the four new names is in public (control: services_tenant_id_tenants_id_fk is found once)',
         con_named::text || ' named; control ' || con_control::text, '0 named; control 1',
         CASE WHEN con_named = 0 AND con_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. no column of services carries a column-level grant (control: authenticated may SELECT name)',
         col_acls::text || ' with a column ACL; control ' || auth_reads_name::text, '0 with a column ACL; control true',
         CASE WHEN col_acls = 0 AND auth_reads_name THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the five roles the grant fingerprint names exist',
         roles_named::text || ' roles', '5 roles',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the server is Postgres 17 (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. 0110 is absent from the journal, by hash (control: the same count finds 0109 once)',
         CASE WHEN journal_state = 'read' THEN has_new::text || '; control ' || has_prev::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_new = 0 AND has_prev = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. 0109 is the newest row of the journal, by hash, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN 'newest ' || CASE WHEN newest_hash = 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a' THEN 'is 0109' ELSE 'is NOT 0109' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         'newest is 0109, when 1788503100000',
         CASE WHEN journal_state = 'read' AND newest_hash = 'ddce91be80ec3b6e9bf9f1fc7efac5fd23ffaaa04139b24f801c29712568291a'
                   AND newest_when = '1788503100000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '107 (verdict 10)',
         CASE WHEN journal_state = 'read' AND journal_rows = 107 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 21, 'policies_md5', pol_md5, '32 hex characters',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, 'relation_acl_md5', rel_md5, '32 hex characters, over ' || n_rel_items::text || ' privileges',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, 'services_rows', svc_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 24, 'services_shape_md5', shape_md5, '32 hex characters, over ' || n_shape_items::text || ' items',
         CASE WHEN shape_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 25, 'name_grants_md5', coalesce(name_grants_md5, 'absent'), '32 hex characters',
         CASE WHEN name_grants_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 26, 'services_filenode', filenode::text, 'a number', 'CARRY' FROM j
  UNION ALL SELECT 40, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 41, 'INFO services as they are (counts; no row is touched)', svc_profile, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 42, 'INFO the name grants, role:privilege:allowed', coalesce(name_grants, 'absent'), 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 43, 'INFO locks other sessions hold on services now', other_locks::text, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 44, 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '11 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
