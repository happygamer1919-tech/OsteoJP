-- 0110 POST-CHECK: the appointment-type columns on services.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only.
--
-- RUN ON THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON),
-- where it read 15 OK / 0 VACUOUS / 0 FAIL. Never run on production. Authored 2026-11-03 from 0109's
-- post-check. It becomes scripts/db/postcheck-0110-services-booking-type-fields.sql
-- in the apply document set; its sha256 is pinned only after a rehearsal ran it.
-- VERDICT 6's FOUR DEFINITIONS were first pinned without a database and are
-- CONFIRMED by the independent rehearsal of 2026-11-03 (BLUE, 14:55 to 15:12 Lisbon): the server printed them exactly, and
-- this post-check read 15 OK there. A later difference is a fix to this file,
-- never a loosened verdict.
--
-- The caller asserts the PROFILE: 15 OK / 0 VACUOUS / 0 FAIL, and no other.
-- Verdict 7 reads VACUOUS when services holds no row; the block stops on it.
--
--   0   the transaction is READ ONLY;
--   1   the session is postgres. CONTROL: authenticated is not a member of it;
--   2   the session reads services past its policies. CONTROL: authenticated
--       does not;
--   3   THE FIVE COLUMNS, in column order, each with its type, NOT NULL and
--       default: color text, vat_rate smallint, vat_exemption_code text,
--       follow_up_days smallint (each nullable, no default) and sms_reminders
--       boolean NOT NULL DEFAULT true;
--   4   EACH COLUMN'S COMMENT is the migration's text, exactly (5 of 5);
--   5   THE FOUR CHECKs, each once on services, contype c, validated;
--   6   THE FOUR CHECK DEFINITIONS as pg_get_constraintdef prints them;
--   7   EVERY EXISTING ROW: as many as the pre-check counted, none with any of
--       the four nullable columns set, every one with sms_reminders true
--       (VACUOUS at 0 rows);
--   8   THE GRANTS: each new column's privileges, for PUBLIC, anon,
--       authenticated, patient, postgres and service_role, equal name's; name's
--       equal the carry; no column of services carries a column ACL;
--   9   THE REST OF services is as before: services_shape_md5;
--   10  NO ROW WAS REWRITTEN: pg_relation_filenode is the carry services_filenode;
--   11  every policy in the database is unchanged (count and md5);
--   12  every privilege on every relation in public is unchanged;
--   13  0110 is in the journal once, by hash, as the newest row, at its when
--       1788503200000. CONTROL: 0109 is found once;
--   14  the journal moved by exactly one.
--
-- Run (stage 2 runs exactly this, with its eight carries):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -v journal_rows_before=<n> -v policies_before=<n> -v policies_md5=<md5>
--        -v relation_acl_md5=<md5> -v services_rows=<n> -v services_shape_md5=<md5>
--        -v name_grants_md5=<md5> -v services_filenode=<n>
--        -c "begin read only" -f scripts/db/postcheck-0110-services-booking-type-fields.sql -c "rollback"

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
\echo '=== 0110 SERVICES TYPE FIELDS POST-CHECK: every verdict must read OK (15 expected); the SUMMARY row prints the profile ==='

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
), new_cols (col, pos) AS (
  VALUES ('color', 1), ('vat_rate', 2), ('vat_exemption_code', 3), ('follow_up_days', 4), ('sms_reminders', 5)
), grants_by_col AS (
  SELECT x.col, string_agg(gr.r || ':' || gp.p || ':' || has_column_privilege(gr.r::name, 'public.services'::regclass, x.col, gp.p)::text, ',' ORDER BY gr.r, gp.p) AS g
    FROM (SELECT col FROM new_cols UNION ALL SELECT 'name') x
    CROSS JOIN grant_roles gr CROSS JOIN grant_privs gp
   GROUP BY x.col
), expected_comments (col, txt) AS (
  VALUES
  ('color', 'Tipos de Marcacao. The colour of this appointment type, #RRGGBB in capitals '
  '(services_color_hex). NULL means none chosen. Stored only: whether the agenda '
  'paints it instead of the therapist colour is a separate product decision.'),
  ('vat_rate', 'Tipos de Marcacao. The VAT percentage of this appointment type: 0, 6, 13 or 23 '
  '(services_vat_rate_allowed). NULL means not set on the type. Read by no invoice '
  'path yet.'),
  ('vat_exemption_code', 'Tipos de Marcacao. The AT VAT exemption reason code (Motivo IVA), M01 to M99 '
  '(services_vat_exemption_code_allowed). NULL means none chosen. Read by no '
  'invoice path yet.'),
  ('follow_up_days', 'Tipos de Marcacao. The follow-up rule: NULL is none (FollowUP: nenhum), 2 is '
  'a follow-up two days after the appointment (services_follow_up_days_allowed). '
  'Stored only: nothing creates a follow-up from it yet.'),
  ('sms_reminders', 'The SMS tag. Whether it stops only the SMS or every reminder is not ruled yet.')
), expected_checks (conname, def) AS (
  VALUES
  ('services_color_hex', 'CHECK (((color IS NULL) OR (color ~ ''^#[0-9A-F]{6}$''::text)))'),
  ('services_follow_up_days_allowed', 'CHECK (((follow_up_days IS NULL) OR (follow_up_days = 2)))'),
  ('services_vat_exemption_code_allowed', 'CHECK (((vat_exemption_code IS NULL) OR (vat_exemption_code = ANY (ARRAY['
      || '''M01''::text, ''M02''::text, ''M04''::text, ''M05''::text, ''M06''::text, ''M07''::text, ''M09''::text, ''M10''::text, ''M11''::text, ''M12''::text, '
      || '''M13''::text, ''M14''::text, ''M15''::text, ''M16''::text, ''M19''::text, ''M20''::text, ''M21''::text, ''M25''::text, ''M26''::text, ''M30''::text, '
      || '''M31''::text, ''M32''::text, ''M33''::text, ''M34''::text, ''M35''::text, ''M40''::text, ''M41''::text, ''M42''::text, ''M43''::text, ''M44''::text, '
      || '''M45''::text, ''M46''::text, ''M99''::text]))))'),
  ('services_vat_rate_allowed', 'CHECK (((vat_rate IS NULL) OR (vat_rate = ANY (ARRAY[0, 6, 13, 23]))))')
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
    (SELECT coalesce(string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) || ' '
              || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'),
              '; ' ORDER BY a.attnum), 'none')
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.services'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname IN (SELECT col FROM new_cols))                                              AS cols_profile,
    (SELECT count(*)::int FROM expected_comments e
      WHERE col_description('public.services'::regclass,
              (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.services'::regclass
                 AND a.attname = e.col AND NOT a.attisdropped)::int) = e.txt)                    AS comments_ok,
    (SELECT coalesce(string_agg(c.conname::text || ':' || c.contype::text || ':' || c.convalidated::text, ', ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname IN (SELECT conname FROM expected_checks))           AS checks_profile,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid = 'public.services'::regclass
        AND c.conname IN (SELECT conname FROM expected_checks)
        AND pg_get_constraintdef(c.oid) = (SELECT e.def FROM expected_checks e WHERE e.conname = c.conname)) AS checks_def_ok,
    (SELECT coalesce(string_agg(c.conname::text || ' = ' || pg_get_constraintdef(c.oid), ' ; ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname IN (SELECT conname FROM expected_checks)
        AND pg_get_constraintdef(c.oid) IS DISTINCT FROM (SELECT e.def FROM expected_checks e WHERE e.conname = c.conname)) AS checks_def_diff,
    (SELECT count(*)::int FROM public.services)                                                   AS svc_rows,
    (SELECT count(*)::int FROM public.services
      WHERE color IS NOT NULL OR vat_rate IS NOT NULL OR vat_exemption_code IS NOT NULL OR follow_up_days IS NOT NULL) AS rows_set,
    (SELECT count(*)::int FROM public.services WHERE sms_reminders IS NOT TRUE)                   AS rows_not_true,
    (SELECT count(DISTINCT g)::int FROM grants_by_col)                                            AS distinct_grants,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'name')                                         AS name_grants_md5,
    (SELECT count(*)::int FROM grants_by_col)                                                     AS grant_cols,
    (SELECT count(*)::int FROM pg_attribute a
      WHERE a.attrelid = 'public.services'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attacl IS NOT NULL)                                                                 AS col_acls,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM shape_items)              AS shape_md5,
    pg_relation_filenode('public.services'::regclass)::bigint                                     AS filenode,
    (SELECT count(*)::int FROM pg_policy)                                                         AS policies,
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
       FROM rel_items)                                                                           AS rel_md5
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
  UNION ALL SELECT 3, '3. the five new columns, in column order, with type, NOT NULL and default',
         cols_profile,
         'color text NULL -; vat_rate smallint NULL -; vat_exemption_code text NULL -; follow_up_days smallint NULL -; sms_reminders boolean NOT NULL true',
         CASE WHEN cols_profile = 'color text NULL -; vat_rate smallint NULL -; vat_exemption_code text NULL -; follow_up_days smallint NULL -; sms_reminders boolean NOT NULL true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. each new column''s comment is the migration''s text, exactly',
         comments_ok::text || ' of 5', '5 of 5',
         CASE WHEN comments_ok = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. the four CHECKs, each once in public, contype c, validated',
         checks_profile,
         'services_color_hex:c:true, services_follow_up_days_allowed:c:true, services_vat_exemption_code_allowed:c:true, services_vat_rate_allowed:c:true',
         CASE WHEN checks_profile = 'services_color_hex:c:true, services_follow_up_days_allowed:c:true, services_vat_exemption_code_allowed:c:true, services_vat_rate_allowed:c:true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the four CHECK definitions, as the server prints them (confirmed on the rehearsal; any difference is printed)',
         checks_def_ok::text || ' of 4 match; differing: ' || checks_def_diff, '4 of 4 match; differing: none',
         CASE WHEN checks_def_ok = 4 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. every existing row: the pre-check''s count, none of the four nullable columns set, sms_reminders true on all (VACUOUS at 0 rows)',
         rows_set::text || ' set, ' || rows_not_true::text || ' not true, of ' || svc_rows::text || ' rows',
         '0 set, 0 not true, of ' || :'services_rows' || ' rows',
         CASE WHEN svc_rows = 0 THEN 'VACUOUS'
              WHEN rows_set = 0 AND rows_not_true = 0 AND svc_rows = :services_rows THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. each new column''s privileges equal name''s, name''s equal the carry, and no column of services carries a column ACL',
         distinct_grants::text || ' distinct of ' || grant_cols::text || ' columns; name ' || coalesce(name_grants_md5, 'absent') || '; ' || col_acls::text || ' with a column ACL',
         '1 distinct of 6 columns; name ' || :'name_grants_md5' || '; 0 with a column ACL',
         CASE WHEN distinct_grants = 1 AND grant_cols = 6 AND name_grants_md5 = :'name_grants_md5' AND col_acls = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. the rest of services (every other column, constraint, trigger, index and its RLS flags) is as before',
         shape_md5, :'services_shape_md5',
         CASE WHEN shape_md5 = :'services_shape_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. no row was rewritten: the relation file is the one the pre-check read',
         filenode::text, :'services_filenode',
         CASE WHEN filenode = :services_filenode THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. every policy in the database is unchanged (count and md5)',
         policies::text || ' ' || pol_md5, :'policies_before' || ' ' || :'policies_md5',
         CASE WHEN policies = :policies_before AND pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. every privilege on every relation in public is unchanged',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. 0110 is in the journal once, by hash, as the newest row, at its journal when (control: 0109 is found once)',
         CASE WHEN journal_state = 'read'
              THEN has_new::text || ' row, newest ' || CASE WHEN newest_hash = 'e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e' THEN 'is 0110' ELSE 'is NOT 0110' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_prev::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0110, when 1788503200000; control 1',
         CASE WHEN journal_state = 'read' AND has_new = 1 AND has_prev = 1
                   AND newest_hash = 'e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e'
                   AND newest_when = '1788503200000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. the journal moved by exactly one: its rows are the pre-check''s plus one',
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
         '15 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
