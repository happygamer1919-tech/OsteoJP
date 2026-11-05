-- 0111 POST-CHECK: Sistemas / SubSistemas.
-- READ ONLY. It writes nothing and cannot. Catalogue facts and counts only.
-- 2026-11-05: the missing-variable guards came after every rehearsal; no rehearsal has
-- run these final bytes. The C3 chain rehearsal runs them.
--
-- AN EARLIER VERSION RAN ON THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12
-- LISBON), where it read 25 OK / 0 VACUOUS / 0 FAIL. Never run on production. Authored 2026-11-03 from 0109's and
-- 0106's post-checks. It becomes scripts/db/postcheck-0111-sistemas-subsistemas.sql
-- in the apply document set; its sha256 is pinned only after a rehearsal ran it.
-- CONFIRMED BY THE INDEPENDENT REHEARSAL OF 2026-11-03 (BLUE, 14:55 TO 15:12 LISBON):
-- verdict 7's three CHECK definitions and verdict 8's index definition (of the
-- old bytes), first pinned without a database, are exactly what the server
-- printed; verdict 10's
-- five policy-expression md5s were read there (0106's way) and are written in
-- below; this post-check (before the guards) read 25 OK there. A later difference is a fix to this
-- file, never a loosened verdict.
-- 2026-11-05: the migration's bytes changed for Q12 (accent-blind unique
-- names); verdict 8's index definition for the new bytes and verdict 13's
-- table comment are read on the re-rehearsal of the final bytes, owed before
-- READY; until then verdict 8 holds a pending pin and block C refuses.
--
-- The caller asserts the PROFILE: 25 OK / 0 VACUOUS / 0 FAIL, and no other.
-- Verdict 15 reads VACUOUS when patients holds no row; the block stops on it.
--
--   0   the transaction is READ ONLY;
--   1   the session is postgres. CONTROL: authenticated is not a member of it;
--   2   the session reads patients past its policies. CONTROL: authenticated does not;
--   3   health_systems exists once in public: an ordinary table owned by
--       postgres, RLS on and not forced. CONTROL: patients is found;
--   4   its six columns, in order, with type, NOT NULL and default;
--   5   its six constraints by name and type, every one validated;
--   6   the three foreign keys, their columns, targets, ON DELETE and ON
--       UPDATE actions and MATCH type (two on health_systems, one on patients);
--   7   the three CHECK definitions as pg_get_constraintdef prints them;
--   8   its three indexes, unique and valid, and the normalized-name index's
--       definition as pg_get_indexdef prints it;
--   9   its three policies: names, commands, permissive, TO authenticated
--       alone, which of USING and WITH CHECK each has; none for DELETE or ALL;
--   10  the five policy expressions by md5, as read on the rehearsal;
--   11  its whole grantee list: the owner with the eight table privileges,
--       authenticated with INSERT and SELECT, and column UPDATE on active and
--       name to authenticated; nobody else; no grant option;
--   12  health_systems is empty;
--   13  the two new patients columns (uuid and text, nullable, no default) and
--       the three comments (the table's and the two columns'), exactly;
--   14  the two new patients constraints, once each, validated;
--   15  every patients row NULL in both new columns, and as many rows as the
--       pre-check counted (VACUOUS at 0 rows);
--   16  the two new columns hold exactly nif's privileges, and nif's equal the carry;
--   17  the rest of patients is as before: patients_shape_md5;
--   18  no patients row was rewritten: pg_relation_filenode is the carry;
--   19  tenants and users are as before, but for the new keys' own triggers;
--   20  the table count in public is the pre-check's plus one;
--   21  every policy but the three new ones is unchanged, and the count is the
--       pre-check's plus three;
--   22  every privilege on every relation in public but health_systems and its
--       three indexes is unchanged;
--   23  0111 is in the journal once, by hash, as the newest row, at its when
--       1788503300000. CONTROL: 0110 is found once;
--   24  the journal moved by exactly one.
--
-- Run (stage 2 runs exactly this, with its ten carries):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -v journal_rows_before=<n> -v policies_before=<n> -v policies_md5=<md5>
--        -v relation_acl_md5=<md5> -v tables_before=<n> -v patients_rows=<n>
--        -v patients_shape_md5=<md5> -v nif_grants_md5=<md5> -v patients_filenode=<n>
--        -v tenants_users_shape_md5=<md5>
--        -c "begin read only" -f scripts/db/postcheck-0111-sistemas-subsistemas.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing (the pre-check''s verdict 13 row). This file refuses to guess.'; END $missing$;
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
\if :{?tables_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v tables_before is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?patients_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v patients_rows is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?patients_shape_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v patients_shape_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?nif_grants_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v nif_grants_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?patients_filenode}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v patients_filenode is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif
\if :{?tenants_users_shape_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v tenants_users_shape_md5 is missing (the pre-check''s CARRY row). This file refuses to guess.'; END $missing$;
\endif

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
    PERFORM set_config('apply0111.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING 'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f',
          'e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e';
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('apply0111.journal', 'read', true);
  PERFORM set_config('apply0111.journal_rows', v_rows::text, true);
  PERFORM set_config('apply0111.has_new', v_new::text, true);
  PERFORM set_config('apply0111.has_prev', v_prev::text, true);
  PERFORM set_config('apply0111.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('apply0111.newest_when', coalesce(v_when, ''), true);
END
$journal$;

\echo ''
\echo '=== 0111 SISTEMAS POST-CHECK: every verdict must read OK (25 expected); the SUMMARY row prints the profile ==='

WITH hs AS (
  SELECT to_regclass('public.health_systems') AS oid
), hs_rels AS (
  SELECT oid FROM hs WHERE oid IS NOT NULL
  UNION ALL
  SELECT i.indexrelid FROM pg_index i, hs WHERE i.indrelid = hs.oid
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public' AND c.oid NOT IN (SELECT oid FROM hs_rels)
), grant_roles (r) AS (
  VALUES ('anon'), ('authenticated'), ('patient'), ('postgres'), ('public'), ('service_role')
), grant_privs (p) AS (
  VALUES ('INSERT'), ('REFERENCES'), ('SELECT'), ('UPDATE')
), grants_by_col AS (
  SELECT x.col, string_agg(gr.r || ':' || gp.p || ':' || has_column_privilege(gr.r::name, 'public.patients'::regclass, x.col, gp.p)::text, ',' ORDER BY gr.r, gp.p) AS g
    FROM (VALUES ('nif'), ('health_system_id'), ('health_system_number')) x(col)
    CROSS JOIN grant_roles gr CROSS JOIN grant_privs gp
   GROUP BY x.col
), expected_comments (kind, col, txt) AS (
  VALUES
  ('table', '-', 'Sistemas / SubSistemas: the clinic''s own list of health systems and '
  'subsystems, each a single free-text name (Fisiozero''s panel, owner request '
  '2026-11-02). One name per tenant after normalizing case, whitespace and '
  'accents. '
  'Deactivated, never deleted. Read by every staff role of the tenant; written '
  'by owner and admin. A label only: no price, discount or invoice reads it.'),
  ('column', 'health_system_id', 'Sistema/SubSistema (Fisiozero''s ficha dropdown, owner request 2026-11-02). '
  'NULL is "Seleccione", none chosen. Of the patient''s own tenant, by the '
  'composite key patients_health_system_fkey. A label only: no price, discount '
  'or invoice reads it. Independent of health_insurance_numbers (0051).'),
  ('column', 'health_system_number', 'N. da Entidade / Subsistema, free text shown below the Sistema/SubSistema '
  'dropdown. NULL when not given. Independent of health_system_id and of '
  'health_insurance_numbers (0051).')
), expected_checks (conname, def) AS (
  VALUES
  ('health_systems_name_length', 'CHECK ((char_length(name) <= 120))'),
  ('health_systems_name_not_blank', 'CHECK ((name ~ ''[^[:space:]]''::text))'),
  ('patients_health_system_number_check', 'CHECK (((health_system_number IS NULL) OR ((health_system_number ~ ''[^[:space:]]''::text) AND (char_length(health_system_number) <= 64))))')
), shape_items AS (
  SELECT 'col:' || a.attnum::text || ':' || a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':'
         || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ':' || coalesce(a.attacl::text, '-') AS item
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.patients'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('health_system_id', 'health_system_number')
  UNION ALL
  SELECT 'con:' || c.conname::text || ':' || c.contype::text || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
   WHERE c.conrelid = 'public.patients'::regclass
     AND c.conname NOT IN ('patients_health_system_number_check', 'patients_health_system_fkey')
  UNION ALL
  SELECT 'trg:' || t.tgname::text || ':' || pg_get_triggerdef(t.oid)
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.patients'::regclass
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.oid = t.tgconstraint AND k.conname = 'patients_health_system_fkey')
  UNION ALL
  SELECT 'idx:' || i.indexrelid::regclass::text || ':' || pg_get_indexdef(i.indexrelid)
    FROM pg_index i
   WHERE i.indrelid = 'public.patients'::regclass
  UNION ALL
  SELECT 'rls:' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || c.relkind::text
    FROM pg_class c
   WHERE c.oid = 'public.patients'::regclass
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
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.oid = t.tgconstraint AND k.conrelid = to_regclass('public.health_systems'))
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
         k.conrelid::regclass::text AS rel, k.conname::text AS conname
    FROM pg_constraint k, hs
   WHERE k.contype = 'f' AND (k.conrelid = hs.oid OR (k.conrelid = 'public.patients'::regclass AND k.conname = 'patients_health_system_fkey'))
), j AS (
  SELECT
    coalesce(current_setting('apply0111.journal', true), 'not read')                             AS journal_state,
    nullif(current_setting('apply0111.journal_rows', true), '')::int                              AS journal_rows,
    nullif(current_setting('apply0111.has_new', true), '')::int                                   AS has_new,
    nullif(current_setting('apply0111.has_prev', true), '')::int                                  AS has_prev,
    current_setting('apply0111.newest_hash', true)                                                AS newest_hash,
    current_setting('apply0111.newest_when', true)                                                AS newest_when,
    current_user::text                                                                           AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                         AS auth_in_me,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = current_user AND c.oid = 'public.patients'::regclass) AS me_past_rls,
    (SELECT (r.rolbypassrls OR r.rolsuper OR (c.relowner = r.oid AND NOT c.relforcerowsecurity))
       FROM pg_roles r, pg_class c WHERE r.rolname = 'authenticated' AND c.oid = 'public.patients'::regclass) AS auth_past_rls,
    (SELECT coalesce(string_agg(c.relkind::text || ':' || pg_get_userbyid(c.relowner) || ':rls ' || c.relrowsecurity::text
              || ':forced ' || c.relforcerowsecurity::text, ', '), 'absent')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'health_systems')                                AS hs_profile,
    (to_regclass('public.patients') IS NOT NULL)                                                 AS rel_control,
    (SELECT coalesce(string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) || ' '
              || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'),
              '; ' ORDER BY a.attnum), 'none')
       FROM pg_attribute a
       JOIN hs ON a.attrelid = hs.oid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped)                                                  AS hs_cols,
    (SELECT coalesce(string_agg(c.conname::text || ':' || c.contype::text || ':' || c.convalidated::text, ', ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN hs ON c.conrelid = hs.oid)                                       AS hs_cons,
    (SELECT coalesce(string_agg(item, '; ' ORDER BY rel, conname), 'none') FROM fk_items)         AS fk_profile,
    (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname IN (SELECT conname FROM expected_checks)
        AND pg_get_constraintdef(c.oid) = (SELECT e.def FROM expected_checks e WHERE e.conname = c.conname)) AS checks_def_ok,
    (SELECT coalesce(string_agg(c.conname::text || ' = ' || pg_get_constraintdef(c.oid), ' ; ' ORDER BY c.conname), 'none')
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname IN (SELECT conname FROM expected_checks)
        AND pg_get_constraintdef(c.oid) IS DISTINCT FROM (SELECT e.def FROM expected_checks e WHERE e.conname = c.conname)) AS checks_def_diff,
    (SELECT coalesce(string_agg(i.indexrelid::regclass::text || ':' || i.indisunique::text || ':' || i.indisvalid::text, ', '
              ORDER BY i.indexrelid::regclass::text), 'none')
       FROM pg_index i JOIN hs ON i.indrelid = hs.oid)                                            AS hs_idx,
    (SELECT coalesce(pg_get_indexdef(to_regclass('public.health_systems_tenant_name_key')), 'absent')) AS name_idx_def,
    (SELECT coalesce(string_agg(p.polname::text || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || CASE WHEN p.polqual IS NULL THEN '-' ELSE 'q' END
              || ':' || CASE WHEN p.polwithcheck IS NULL THEN '-' ELSE 'c' END, ', ' ORDER BY p.polname), 'none')
       FROM pg_policy p JOIN hs ON p.polrelid = hs.oid)                                           AS hs_pols,
    (SELECT coalesce(string_agg(p.polname::text || ' ' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ' ' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'), '; ' ORDER BY p.polname), 'none')
       FROM pg_policy p JOIN hs ON p.polrelid = hs.oid)                                           AS hs_pol_md5s,
    (SELECT coalesce(string_agg(x.who || ' [' || x.privs || ']' || CASE WHEN x.grantable THEN ' WITH GRANT' ELSE '' END, '; ' ORDER BY x.who), 'none')
       FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS who,
                    string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privs,
                    bool_or(a.is_grantable) AS grantable
               FROM pg_class c JOIN hs ON c.oid = hs.oid
               CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
              GROUP BY 1) x)                                                                     AS hs_acl,
    (SELECT coalesce(string_agg(att.attname::text || ':' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
              || ':' || a.privilege_type || ':' || a.is_grantable::text, ', ' ORDER BY att.attname, a.grantee, a.privilege_type), 'none')
       FROM pg_attribute att JOIN hs ON att.attrelid = hs.oid
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE att.attacl IS NOT NULL)                                                               AS hs_col_acl,
    (SELECT count(*)::int FROM public.health_systems)                                             AS hs_rows,
    (SELECT coalesce(string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) || ' '
              || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'),
              '; ' ORDER BY a.attnum), 'none')
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.patients'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname IN ('health_system_id', 'health_system_number'))                           AS pat_cols,
    (SELECT count(*)::int FROM expected_comments e
      WHERE (e.kind = 'table' AND obj_description(to_regclass('public.health_systems'), 'pg_class') = e.txt)
         OR (e.kind = 'column' AND col_description('public.patients'::regclass,
               (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.patients'::regclass
                  AND a.attname = e.col AND NOT a.attisdropped)::int) = e.txt))                  AS comments_ok,
    (SELECT coalesce(string_agg(c.conname::text || ':' || c.contype::text || ':' || c.convalidated::text, ', ' ORDER BY c.conname), 'none')
       FROM pg_constraint c
      WHERE c.conrelid = 'public.patients'::regclass
        AND c.conname IN ('patients_health_system_number_check', 'patients_health_system_fkey'))  AS pat_cons,
    (SELECT count(*)::int FROM public.patients)                                                   AS pat_rows,
    (SELECT count(*)::int FROM public.patients
      WHERE health_system_id IS NOT NULL OR health_system_number IS NOT NULL)                     AS pat_set,
    (SELECT count(DISTINCT g)::int FROM grants_by_col)                                            AS distinct_grants,
    (SELECT count(*)::int FROM grants_by_col)                                                     AS grant_cols,
    (SELECT md5(g) FROM grants_by_col WHERE col = 'nif')                                          AS nif_grants_md5,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM shape_items)              AS shape_md5,
    pg_relation_filenode('public.patients'::regclass)::bigint                                     AS filenode,
    (SELECT md5(coalesce(string_agg(item, ';' ORDER BY item), '')) FROM tu_items)                 AS tu_md5,
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
      WHERE c.oid IS DISTINCT FROM (SELECT oid FROM hs))                                         AS pol_md5,
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
  UNION ALL SELECT 2, '2. this session reads patients past its policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unknown') || '; control ' || coalesce(auth_past_rls::text, 'unknown'), 'true; control false',
         CASE WHEN me_past_rls AND auth_past_rls = false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. health_systems exists once in public: an ordinary table owned by postgres, RLS on, not forced (control: patients is found)',
         hs_profile || '; control ' || rel_control::text, 'r:postgres:rls true:forced false; control true',
         CASE WHEN hs_profile = 'r:postgres:rls true:forced false' AND rel_control THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. health_systems has its six columns, in order, with type, NOT NULL and default',
         hs_cols,
         'id uuid NOT NULL gen_random_uuid(); tenant_id uuid NOT NULL -; name text NOT NULL -; active boolean NOT NULL true; created_at timestamp with time zone NOT NULL now(); created_by uuid NULL -',
         CASE WHEN hs_cols = 'id uuid NOT NULL gen_random_uuid(); tenant_id uuid NOT NULL -; name text NOT NULL -; active boolean NOT NULL true; created_at timestamp with time zone NOT NULL now(); created_by uuid NULL -' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. health_systems has its six constraints, by name and type, every one validated',
         hs_cons,
         'health_systems_created_by_fkey:f:true, health_systems_id_tenant_key:u:true, health_systems_name_length:c:true, health_systems_name_not_blank:c:true, health_systems_pkey:p:true, health_systems_tenant_id_fkey:f:true',
         CASE WHEN hs_cons = 'health_systems_created_by_fkey:f:true, health_systems_id_tenant_key:u:true, health_systems_name_length:c:true, health_systems_name_not_blank:c:true, health_systems_pkey:p:true, health_systems_tenant_id_fkey:f:true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. the three foreign keys: columns, target, ON DELETE (a no action, n set null), ON UPDATE, MATCH (s simple)',
         fk_profile,
         'health_systems.health_systems_created_by_fkey (created_by) -> users (id) del n upd a match s; health_systems.health_systems_tenant_id_fkey (tenant_id) -> tenants (id) del a upd a match s; patients.patients_health_system_fkey (health_system_id,tenant_id) -> health_systems (id,tenant_id) del a upd a match s',
         CASE WHEN fk_profile = 'health_systems.health_systems_created_by_fkey (created_by) -> users (id) del n upd a match s; health_systems.health_systems_tenant_id_fkey (tenant_id) -> tenants (id) del a upd a match s; patients.patients_health_system_fkey (health_system_id,tenant_id) -> health_systems (id,tenant_id) del a upd a match s' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the three CHECK definitions, as the server prints them (confirmed on the rehearsal; any difference is printed)',
         checks_def_ok::text || ' of 3 match; differing: ' || checks_def_diff, '3 of 3 match; differing: none',
         CASE WHEN checks_def_ok = 3 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. health_systems has three indexes, unique and valid, and the normalized-name index reads as pinned (the Q12 definition read 2026-11-05 on a local apply of the final bytes, md5 8c26eb6e1d6cc43efa25050cc20d0031)',
         hs_idx || '; ' || name_idx_def,
         'health_systems_id_tenant_key:true:true, health_systems_pkey:true:true, health_systems_tenant_name_key:true:true; CREATE UNIQUE INDEX health_systems_tenant_name_key ON public.health_systems USING btree (tenant_id, translate(lower(btrim(regexp_replace(name, ''[[:space:]]+''::text, '' ''::text, ''g''::text))), ''áàâãäéèêëẽíìîïĩóòôõöúùûüũçñÁÀÂÃÄÉÈÊËẼÍÌÎÏĨÓÒÔÕÖÚÙÛÜŨÇÑ''::text, ''aaaaaeeeeeiiiiiooooouuuuucnaaaaaeeeeeiiiiiooooouuuuucn''::text))',
         CASE WHEN hs_idx = 'health_systems_id_tenant_key:true:true, health_systems_pkey:true:true, health_systems_tenant_name_key:true:true'
                   AND name_idx_def = 'CREATE UNIQUE INDEX health_systems_tenant_name_key ON public.health_systems USING btree (tenant_id, translate(lower(btrim(regexp_replace(name, ''[[:space:]]+''::text, '' ''::text, ''g''::text))), ''áàâãäéèêëẽíìîïĩóòôõöúùûüũçñÁÀÂÃÄÉÈÊËẼÍÌÎÏĨÓÒÔÕÖÚÙÛÜŨÇÑ''::text, ''aaaaaeeeeeiiiiiooooouuuuucnaaaaaeeeeeiiiiiooooouuuuucn''::text))' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. its three policies (a INSERT, r SELECT, w UPDATE), permissive, TO authenticated alone, USING (q) and WITH CHECK (c) as written; none for DELETE or ALL',
         hs_pols,
         'health_systems_manager_insert:a:true:authenticated:-:c, health_systems_manager_update:w:true:authenticated:q:c, health_systems_staff_select:r:true:authenticated:q:-',
         CASE WHEN hs_pols = 'health_systems_manager_insert:a:true:authenticated:-:c, health_systems_manager_update:w:true:authenticated:q:c, health_systems_staff_select:r:true:authenticated:q:-' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. the five policy expressions, by md5 of what the server prints (read on the rehearsal of 2026-11-03)',
         hs_pol_md5s,
         'health_systems_manager_insert - ea4aed2533ce3479e163b3f011073a3a; health_systems_manager_update 279e0dc4cfb08bc0c417e5159d78d6f9 279e0dc4cfb08bc0c417e5159d78d6f9; health_systems_staff_select 991888d347baf196859fa6009b0c4757 -',
         CASE WHEN hs_pol_md5s = 'health_systems_manager_insert - ea4aed2533ce3479e163b3f011073a3a; health_systems_manager_update 279e0dc4cfb08bc0c417e5159d78d6f9 279e0dc4cfb08bc0c417e5159d78d6f9; health_systems_staff_select 991888d347baf196859fa6009b0c4757 -' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. the whole grantee list of health_systems and its column grants: nobody but the owner and authenticated, no grant option',
         hs_acl || ' / columns: ' || hs_col_acl,
         'authenticated [INSERT,SELECT]; postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE] / columns: active:authenticated:UPDATE:false, name:authenticated:UPDATE:false',
         CASE WHEN hs_acl = 'authenticated [INSERT,SELECT]; postgres [DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE]'
                   AND hs_col_acl = 'active:authenticated:UPDATE:false, name:authenticated:UPDATE:false' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. health_systems is empty: the migration writes no row',
         hs_rows::text, '0',
         CASE WHEN hs_rows = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. the two new patients columns (nullable, no default) and the three comments, exactly',
         pat_cols || '; comments ' || comments_ok::text || ' of 3',
         'health_system_id uuid NULL -; health_system_number text NULL -; comments 3 of 3',
         CASE WHEN pat_cols = 'health_system_id uuid NULL -; health_system_number text NULL -' AND comments_ok = 3 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. the two new patients constraints, once each, validated',
         pat_cons, 'patients_health_system_fkey:f:true, patients_health_system_number_check:c:true',
         CASE WHEN pat_cons = 'patients_health_system_fkey:f:true, patients_health_system_number_check:c:true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 15, '15. every patients row is NULL in both new columns, and as many rows as the pre-check counted (VACUOUS at 0 rows)',
         pat_set::text || ' set of ' || pat_rows::text || ' rows', '0 set of ' || :'patients_rows' || ' rows',
         CASE WHEN pat_rows = 0 THEN 'VACUOUS'
              WHEN pat_set = 0 AND pat_rows = :patients_rows THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 16, '16. the two new columns hold exactly nif''s privileges, and nif''s equal the carry',
         distinct_grants::text || ' distinct of ' || grant_cols::text || ' columns; nif ' || coalesce(nif_grants_md5, 'absent'),
         '1 distinct of 3 columns; nif ' || :'nif_grants_md5',
         CASE WHEN distinct_grants = 1 AND grant_cols = 3 AND nif_grants_md5 = :'nif_grants_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 17, '17. the rest of patients (every other column, constraint, trigger but the new key''s, index, RLS flags) is as before',
         shape_md5, :'patients_shape_md5',
         CASE WHEN shape_md5 = :'patients_shape_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 18, '18. no patients row was rewritten: the relation file is the one the pre-check read',
         filenode::text, :'patients_filenode',
         CASE WHEN filenode = :patients_filenode THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 19, '19. tenants and users are as before, but for the new keys'' own triggers',
         tu_md5, :'tenants_users_shape_md5',
         CASE WHEN tu_md5 = :'tenants_users_shape_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 20, '20. the table count in public is the pre-check''s plus one',
         n_tables::text, (:tables_before + 1)::text,
         CASE WHEN n_tables = :tables_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 21, '21. every policy but the three new ones is unchanged, and the count is the pre-check''s plus three',
         policies::text || ' ' || pol_md5, (:policies_before + 3)::text || ' ' || :'policies_md5',
         CASE WHEN policies = :policies_before + 3 AND pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 22, '22. every privilege on every relation in public but health_systems and its indexes is unchanged',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 23, '23. 0111 is in the journal once, by hash, as the newest row, at its journal when (control: 0110 is found once)',
         CASE WHEN journal_state = 'read'
              THEN has_new::text || ' row, newest ' || CASE WHEN newest_hash = 'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f' THEN 'is 0111' ELSE 'is NOT 0111' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none') || '; control ' || has_prev::text
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0111, when 1788503300000; control 1',
         CASE WHEN journal_state = 'read' AND has_new = 1 AND has_prev = 1
                   AND newest_hash = 'e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f'
                   AND newest_when = '1788503300000' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 24, '24. the journal moved by exactly one: its rows are the pre-check''s plus one',
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
         '25 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
