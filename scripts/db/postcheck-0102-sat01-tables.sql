-- 0102 POST-CHECK: SAT-01's tables, doors and policies, as applied.
-- READ ONLY: the stage 2 block runs it inside `begin read only` and ends with `rollback`.
-- Every verdict must read OK (27 expected).
--
-- THE CARRIES, ten, each passed with -v from stage 1's pre-check transcript (SR-59), and
-- each REQUIRED: journal_rows_before, tables_before, secdef_before, policies_md5,
-- functions_md5, relation_acl_md5, column_acl_md5, default_acl_md5, patient_update_columns,
-- triggers_md5.
--
-- THE MEASURED PINS. Four kinds of literal below were read from the build lane's throwaway
-- (Postgres 17.6) after 0102 was applied there, and pre-check verdict 12 requires the
-- server to be Postgres 17:
--   * the two policies' USING texts, as md5(pg_get_expr(polqual)): what RLS will enforce,
--     byte for byte as the server prints it back;
--   * each table's constraints, as a count and one md5 of every pg_get_constraintdef;
--   * the nine function bodies, as md5(prosrc). prosrc is the body exactly as the
--     migration writes it between its $fn$ quotes, so these are also derivable from the
--     file, and scripts/sat01-tables-0102.test.mjs derives them and requires them equal;
--   * each table's columns, and the foreign keys with their delete rules, as literal text;
--   * the ten foreign keys, each by its NAME and its pg_get_constraintdef, as literal text.
--     Eight of them (to tenants, appointments, patients and users) are added at the end of
--     the migration by three ALTER TABLE statements, one per new table, each adding every
--     foreign key of its table, not written in CREATE TABLE, so that no lock on an existing
--     table is taken early. The names are the ones the inline form gives
--     (<table>_<column>_fkey), and the per-table constraint md5 of verdict 3 is the SAME
--     literal that was read when they were inline: the two forms leave one catalogue.
--
-- THE VERDICTS:
--   0      READ ONLY;
--   1      the three tables exist, owned by postgres, RLS enabled and not forced; the codes
--          table has no policy, the other two exactly one each. CONTROL: appointments reads
--          RLS enabled by the same test;
--   2      the columns of each table, in order, with types, NOT NULL and defaults;
--   3      the constraints of each table (count and md5), and the ten foreign keys, each by
--          its NAME and definition, each validated and not deferrable, with their delete rules
--          (sends and codes cascade from the appointment and the send; answers cascade from
--          nothing: O6 (a));
--   4      the nine indexes, by name (three primary keys, three unique keys, three lookups);
--   5      the two policies: PERMISSIVE, FOR SELECT, TO authenticated, no WITH CHECK, and the
--          USING text pinned. CONTROL: the same md5 reads differently for the two policies;
--   6      the nine functions: signatures, SECURITY DEFINER on eight and not on the helper,
--          owner postgres, search_path=public, volatility, body md5, and language plpgsql for
--          all nine (a SQL-language body is planned at CREATE and locks the tables it reads);
--   7      EXECUTE, by has_function_privilege, never by grepping an ACL (0079): the six doors
--          to authenticated alone; the helper, the purge and the trigger function to no
--          application role; anon, patient and service_role to none of the nine; no PUBLIC item
--          in any ACL; no NULL ACL. CONTROL: postgres executes all nine;
--   8      table privileges, by has_table_privilege, every privilege for authenticated, anon
--          and patient, and PUBLIC by ACL: authenticated SELECT on sends and answers and
--          nothing else; nothing on codes; nothing for anon, patient or PUBLIC. CONTROL: the
--          owner holds every privilege on all three;
--   9      patients.survey_enabled: boolean, NOT NULL, default true, stored as a missing
--          value in the catalogue (the table was not rewritten), and every row reads true.
--          CONTROL: the table holds rows (pre-check verdict 14);
--   10     the patient role's UPDATE columns are the carried list plus survey_enabled, and
--          still no table-level UPDATE;
--   11-15  NOTHING ELSE MOVED, one md5 each against the carry: every policy outside the new
--          tables; every function in `public` outside the nine new names; every relation
--          privilege in `public` outside the new relations; every column privilege outside
--          patients.survey_enabled; every default privilege (0102 changes none);
--   16     tables_before + 3, secdef_before + 8;
--   17     the three tables are EMPTY: the migration seeded nothing. CONTROL: patients holds
--          rows;
--   18     IN ACTION, as anon: a SELECT on each of the three tables is refused with 42501.
--          CONTROL: verdict 20's authenticated reads raise nothing;
--   19     IN ACTION, as patient: the same, 3 of 3. CONTROL: patient reads public.patients
--          without an error;
--   20     IN ACTION, as authenticated with no claims: codes refused with 42501; sends and
--          answers read without an error, and zero rows;
--   21     the doors run: as authenticated, resolve_survey_code on a hash nobody holds returns
--          zero rows, and survey_send_state with no claims returns not_allowed. Each call is
--          made only after has_function_privilege says authenticated may make it;
--   22     journal_rows_before + 1;
--   23     0102 present by hash once, the newest row;
--   24     R34, THE AUDIT TRIGGER: exactly one trigger named patients_survey_switch_audit, on
--          patients, AFTER UPDATE (of any column), FOR EACH ROW, enabled, with the WHEN that
--          compares the old and the new value, calling public.patients_survey_switch_audit().
--          CONTROL: the same read finds patients_assign_patient_number as BEFORE INSERT;
--   25     R34, THE SAME PRINCIPALS: the column privileges on patients.survey_enabled equal
--          those on reminder_sms_enabled AND on reminder_email_enabled, cell by cell, for
--          authenticated, anon, patient and service_role, over SELECT, INSERT, UPDATE and
--          REFERENCES; with authenticated and patient holding UPDATE and anon holding none. The
--          row gate is the two UPDATE policies of pre-check verdict 15, which verdict 11 proves
--          unchanged. CONTROL: the same compare reads `id` as different (patient cannot set it);
--   26     every trigger in `public` outside the new one is unchanged (md5 against the carry).
--
-- WHAT IT CANNOT SHOW READ ONLY: that the trigger FIRES. A READ ONLY transaction cannot
-- UPDATE a patient. That is the DB-gated suite's, each principal in turn.
--
-- WHAT IT CANNOT SHOW READ ONLY ON PRODUCTION: any staff read of an answer. The tables are
-- empty at the apply and a READ ONLY transaction cannot seed one, so every staff arm would be
-- VACUOUS. The per-role behaviour check is packages/db/tests/sat01-survey-rls.db.test.ts, run
-- on the throwaway at production's position and by CI's db-tests from the promotion on.

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
\if :{?patient_update_columns}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v patient_update_columns is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?triggers_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v triggers_md5 is missing. This file refuses to guess.'; END $missing$;
\endif

\echo ''
\echo '=== 0102 SAT-01 TABLES POST-CHECK: every verdict must read OK (27 expected) ==='

-- THE PROBES IN ACTION. Each runs as one role inside a sub-block, so a refusal rolls back
-- only that sub-block, and records what it saw in a transaction-local setting the verdicts
-- read. set_config and SET ROLE are both allowed in a READ ONLY transaction.
DO $probe$
DECLARE
  t   text;
  out text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['appointment_survey_sends', 'appointment_survey_codes', 'appointment_survey_responses'] LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
      RESET ROLE;
      out := out || t || '=read;';
    EXCEPTION
      WHEN insufficient_privilege THEN out := out || t || '=denied;';
      WHEN OTHERS THEN out := out || t || '=error ' || SQLSTATE || ';';
    END;
  END LOOP;
  PERFORM set_config('sat01.probe_anon', out, true);
END
$probe$;

DO $probe$
DECLARE
  t   text;
  out text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['appointment_survey_sends', 'appointment_survey_codes', 'appointment_survey_responses', 'patients'] LOOP
    BEGIN
      SET LOCAL ROLE patient;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
      RESET ROLE;
      out := out || t || '=read;';
    EXCEPTION
      WHEN insufficient_privilege THEN out := out || t || '=denied;';
      WHEN OTHERS THEN out := out || t || '=error ' || SQLSTATE || ';';
    END;
  END LOOP;
  PERFORM set_config('sat01.probe_patient', out, true);
END
$probe$;

DO $probe$
DECLARE
  t   text;
  n   bigint;
  out text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['appointment_survey_sends', 'appointment_survey_codes', 'appointment_survey_responses'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RESET ROLE;
      out := out || t || '=read ' || n || ';';
    EXCEPTION
      WHEN insufficient_privilege THEN out := out || t || '=denied;';
      WHEN OTHERS THEN out := out || t || '=error ' || SQLSTATE || ';';
    END;
  END LOOP;
  PERFORM set_config('sat01.probe_authenticated', out, true);
END
$probe$;

DO $probe$
DECLARE
  n     text := 'not called';
  state text := 'not called';
BEGIN
  IF has_function_privilege('authenticated', 'public.resolve_survey_code(text)', 'EXECUTE') THEN
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT count(*)::text INTO n FROM public.resolve_survey_code(repeat('0', 64));
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN n := 'error ' || SQLSTATE;
    END;
  END IF;
  IF has_function_privilege('authenticated', 'public.survey_send_state(uuid, uuid)', 'EXECUTE') THEN
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT s.state INTO state FROM public.survey_send_state(NULL::uuid, NULL::uuid) s;
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN state := 'error ' || SQLSTATE;
    END;
  END IF;
  PERFORM set_config('sat01.probe_doors', 'resolve rows ' || n || '; state ' || coalesce(state, 'null'), true);
END
$probe$;

WITH new_tables (tbl) AS (
  VALUES ('appointment_survey_sends'), ('appointment_survey_codes'), ('appointment_survey_responses')
), new_fns (sig, secdef, vol, body_md5, door) AS (
  VALUES
    ('survey_manual_verdict(uuid,uuid,text)', false, 's', 'fd8944c687ba4f0978d655b84784964d', false),
    ('issue_survey_automatic(text,uuid,uuid,text)', true, 'v', '94b35f2df996ec4bd53907c8322c5fc0', true),
    ('issue_survey_manual(text,uuid,uuid,text)', true, 'v', '1aee92f2e2fd9f04ad3b9bf1a3595b81', true),
    ('survey_send_state(uuid,uuid)', true, 's', '5d69820189212f665cc94b3e9c769112', true),
    ('resolve_survey_code(text)', true, 's', 'bd2474515fd4f11744dd6df947746a11', true),
    ('submit_survey_response(text,uuid,integer,integer,text,boolean,text)', true, 'v', '6888a2e0708cb2ccb8d647b2571e11b6', true),
    ('opt_out_survey(text,uuid)', true, 'v', 'd3057b75932e6ec029c5cab7ca86b6ad', true),
    ('purge_expired_survey_comments(uuid)', true, 'v', 'b81040b756393e4309c711971efe5ae4', false),
    ('patients_survey_switch_audit()', true, 'v', '5fbb3d8969e45d3aa24016b4a700f18d', false)
), fn_rows AS (
  SELECT f.sig, f.secdef, f.vol, f.body_md5, f.door, p.oid AS foid, p.prosecdef, p.provolatile::text AS provolatile,
         pg_get_userbyid(p.proowner) AS owner, array_to_string(p.proconfig, ',') AS config, md5(p.prosrc) AS src_md5, p.proacl,
         (SELECT l.lanname::text FROM pg_language l WHERE l.oid = p.prolang) AS lang
    FROM new_fns f
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.' || f.sig)
), exec_matrix AS (
  SELECT f.sig, r.rolname,
         has_function_privilege(r.oid, f.foid, 'EXECUTE') AS can,
         (r.rolname = 'authenticated' AND f.door) AS want
    FROM fn_rows f
    CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role')) r
   WHERE f.foid IS NOT NULL
), priv_matrix AS (
  SELECT t.tbl, r.rolname, v.priv,
         has_table_privilege(r.oid, ('public.' || t.tbl)::regclass, v.priv) AS can,
         (r.rolname = 'authenticated' AND v.priv = 'SELECT' AND t.tbl <> 'appointment_survey_codes') AS want
    FROM new_tables t
    CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'patient')) r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(priv)
   WHERE to_regclass('public.' || t.tbl) IS NOT NULL
), col_matrix AS (
  SELECT r.rolname, v.priv,
         has_column_privilege(r.oid, 'public.patients'::regclass, 'survey_enabled', v.priv)         AS survey,
         has_column_privilege(r.oid, 'public.patients'::regclass, 'reminder_sms_enabled', v.priv)   AS sms,
         has_column_privilege(r.oid, 'public.patients'::regclass, 'reminder_email_enabled', v.priv) AS email,
         has_column_privilege(r.oid, 'public.patients'::regclass, 'id', v.priv)                     AS id_col
    FROM (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role')) r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) v(priv)
), rel_items AS (
  SELECT c.oid::regclass::text AS rel, c.relkind::text AS kind, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE n.nspname = 'public' AND c.relname NOT LIKE 'appointment\_survey\_%'
), def_items AS (
  SELECT d.defaclrole, d.defaclnamespace, d.defaclobjtype::text AS objtype, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                   AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1')          AS has_0102,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)                   AS newest_hash,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables) AND c.relkind = 'r'
        AND pg_get_userbyid(c.relowner) = 'postgres' AND c.relrowsecurity AND NOT c.relforcerowsecurity) AS tables_ok,
    (SELECT string_agg(c.relname || '=' || (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid), ',' ORDER BY c.relname)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables))                 AS policy_counts,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointments'::regclass)           AS control_rls,
    (SELECT string_agg(c.relname || ' ' || (
              SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':'
                                || CASE WHEN a.attnotnull THEN 'nn' ELSE 'n' END
                                || coalesce(':' || pg_get_expr(d.adbin, d.adrelid), ''), ',' ORDER BY a.attnum)
                FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), ' / ' ORDER BY c.relname)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables))                 AS columns_seen,
    (SELECT string_agg(c.relname || ' ' || (SELECT count(*) FROM pg_constraint con WHERE con.conrelid = c.oid) || ' '
              || (SELECT md5(string_agg(con.contype::text || ':' || pg_get_constraintdef(con.oid), ';'
                                        ORDER BY con.contype::text, pg_get_constraintdef(con.oid)))
                    FROM pg_constraint con WHERE con.conrelid = c.oid), ' / ' ORDER BY c.relname)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables))                 AS constraints_seen,
    (SELECT string_agg(c.relname || '.' || (SELECT string_agg(attname, ',') FROM pg_attribute WHERE attrelid = con.conrelid AND attnum = ANY (con.conkey))
                       || '>' || con.confrelid::regclass::text || ':' || con.confdeltype::text, ','
                       ORDER BY c.relname, (SELECT string_agg(attname, ',') FROM pg_attribute WHERE attrelid = con.conrelid AND attnum = ANY (con.conkey)))
       FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables) AND con.contype = 'f') AS fks_seen,
    (SELECT string_agg(con.conname || ' ' || pg_get_constraintdef(con.oid), '; ' ORDER BY con.conname)
       FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables) AND con.contype = 'f') AS fk_defs_seen,
    (SELECT count(*)::int FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables) AND con.contype = 'f'
        AND con.convalidated AND NOT con.condeferrable)                                          AS fks_valid,
    (SELECT string_agg(i.indexrelid::regclass::text, ',' ORDER BY i.indexrelid::regclass::text)
       FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables))                 AS indexes_seen,
    (SELECT string_agg(c.relname || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':'
                       || array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') || ':'
                       || md5(pg_get_expr(p.polqual, p.polrelid)) || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
                       ',' ORDER BY c.relname)
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM new_tables))                 AS policies_seen,
    (SELECT count(*)::int FROM fn_rows
      WHERE foid IS NOT NULL AND prosecdef = secdef AND provolatile = vol AND owner = 'postgres'
        AND config = 'search_path=public' AND src_md5 = body_md5 AND lang = 'plpgsql')          AS fns_ok,
    (SELECT coalesce(string_agg(sig, ',' ORDER BY sig), 'none') FROM fn_rows
      WHERE NOT (foid IS NOT NULL AND prosecdef = secdef AND provolatile = vol AND owner = 'postgres'
                 AND config = 'search_path=public' AND src_md5 = body_md5 AND lang = 'plpgsql')) AS fns_bad,
    (SELECT count(*)::int FROM exec_matrix WHERE can <> want)                                   AS exec_wrong,
    (SELECT count(*)::int FROM exec_matrix)                                                     AS exec_cells,
    (SELECT count(*)::int FROM fn_rows WHERE proacl IS NULL
        OR EXISTS (SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee = 0))                     AS exec_public,
    (SELECT count(*)::int FROM fn_rows WHERE foid IS NOT NULL
        AND has_function_privilege('postgres', foid, 'EXECUTE'))                                AS exec_owner,
    (SELECT count(*)::int FROM priv_matrix WHERE can <> want)                                   AS priv_wrong,
    (SELECT count(*)::int FROM priv_matrix)                                                     AS priv_cells,
    (SELECT count(*)::int FROM new_tables t
       JOIN pg_class c ON c.oid = to_regclass('public.' || t.tbl)
      WHERE EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee = 0)) AS priv_public,
    (SELECT count(*)::int FROM new_tables t
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(priv)
      WHERE to_regclass('public.' || t.tbl) IS NOT NULL
        AND has_table_privilege('postgres', ('public.' || t.tbl)::regclass, v.priv))           AS priv_owner,
    (SELECT format_type(a.atttypid, a.atttypmod) || ':' || CASE WHEN a.attnotnull THEN 'nn' ELSE 'n' END || ':'
            || coalesce(pg_get_expr(d.adbin, d.adrelid), 'no default') || ':' || a.atthasmissing::text
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.patients'::regclass AND a.attname = 'survey_enabled' AND NOT a.attisdropped) AS column_seen,
    (SELECT count(*)::int FROM public.patients)                                                 AS patients_rows,
    (SELECT count(*)::int FROM public.patients WHERE survey_enabled IS DISTINCT FROM true)      AS patients_not_true,
    (SELECT coalesce(string_agg(attname, ',' ORDER BY attname), 'none')
       FROM pg_attribute
      WHERE attrelid = 'public.patients'::regclass AND attnum > 0 AND NOT attisdropped
        AND has_column_privilege('patient', 'public.patients'::regclass, attnum, 'UPDATE'))     AS patient_cols,
    (SELECT string_agg(x, ',' ORDER BY x)
       FROM unnest(string_to_array(:'patient_update_columns', ',') || 'survey_enabled'::text) x) AS patient_cols_want,
    has_table_privilege('patient', 'public.patients', 'UPDATE')                                 AS patient_table_update,
    (SELECT md5(coalesce(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname), ''))
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT (n.nspname = 'public' AND c.relname LIKE 'appointment\_survey\_%'))             AS pol_md5,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname NOT IN ('survey_manual_verdict', 'issue_survey_automatic', 'issue_survey_manual', 'survey_send_state',
                              'resolve_survey_code', 'submit_survey_response', 'opt_out_survey', 'purge_expired_survey_comments',
                              'patients_survey_switch_audit'))                                  AS fn_md5,
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
      WHERE n.nspname = 'public' AND att.attacl IS NOT NULL
        AND c.relname NOT LIKE 'appointment\_survey\_%'
        AND NOT (c.relname = 'patients' AND att.attname = 'survey_enabled'))                    AS col_md5,
    (SELECT md5(coalesce(string_agg(
              pg_get_userbyid(defaclrole) || ':'
              || CASE WHEN defaclnamespace = 0 THEN 'GLOBAL' ELSE defaclnamespace::regnamespace::text END || ':'
              || objtype || ':' || pg_get_userbyid(grantor) || ':'
              || CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END || ':'
              || privilege_type || ':' || is_grantable::text,
              ';' ORDER BY pg_get_userbyid(defaclrole), defaclnamespace, objtype, grantee, privilege_type), ''))
       FROM def_items)                                                                         AS def_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')                                           AS n_tables,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT (SELECT count(*) FROM public.appointment_survey_sends) + (SELECT count(*) FROM public.appointment_survey_codes)
            + (SELECT count(*) FROM public.appointment_survey_responses))::int                 AS new_rows,
    (SELECT coalesce(string_agg(c.relname || ':' || t.tgtype::text || ':' || t.tgenabled::text || ':' || coalesce(t.tgattr::text, '') || ':'
                                || t.tgfoid::regprocedure::text || ':'
                                || CASE WHEN pg_get_triggerdef(t.oid) LIKE '% FOR EACH ROW WHEN ((old.survey\_enabled IS DISTINCT FROM new.survey\_enabled)) EXECUTE FUNCTION %'
                                        THEN 'when the value changed' ELSE 'another WHEN, or none' END, ',' ORDER BY c.relname), 'none')
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'patients_survey_switch_audit' AND NOT t.tgisinternal)                   AS audit_trigger,
    (SELECT coalesce(string_agg(t.tgtype::text, ',' ORDER BY t.tgtype), 'none') FROM pg_trigger t
      WHERE t.tgrelid = 'public.patients'::regclass AND t.tgname = 'patients_assign_patient_number') AS trigger_control,
    (SELECT count(*)::int FROM col_matrix WHERE survey IS DISTINCT FROM sms OR survey IS DISTINCT FROM email) AS col_differs,
    (SELECT count(*)::int FROM col_matrix)                                                      AS col_cells,
    (SELECT coalesce(string_agg(rolname || ' ' || priv, ',' ORDER BY rolname, priv), 'none') FROM col_matrix
      WHERE survey AND rolname IN ('authenticated', 'anon', 'patient'))                         AS col_profile,
    (SELECT count(*)::int FROM col_matrix WHERE id_col IS DISTINCT FROM sms)                    AS col_control,
    (SELECT md5(coalesce(string_agg(
              c.oid::regclass::text || '.' || t.tgname || ':' || t.tgtype::text || ':' || t.tgenabled::text || ':'
              || t.tgfoid::regprocedure::text || ':' || coalesce(t.tgattr::text, '') || ':'
              || coalesce(md5(pg_get_triggerdef(t.oid)), '-'),
              ';' ORDER BY c.oid::regclass::text, t.tgname), ''))
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname <> 'patients_survey_switch_audit') AS trg_md5,
    current_setting('sat01.probe_anon', true)                                                   AS probe_anon,
    current_setting('sat01.probe_patient', true)                                                AS probe_patient,
    current_setting('sat01.probe_authenticated', true)                                          AS probe_authenticated,
    current_setting('sat01.probe_doors', true)                                                  AS probe_doors
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the three tables: owned by postgres, RLS on and not forced; policies codes 0, answers 1, sends 1 (control: appointments has RLS)',
       tables_ok::text || ' of 3; ' || coalesce(policy_counts, 'none') || '; control ' || coalesce(control_rls::text, 'none'),
       '3 of 3; appointment_survey_codes=0,appointment_survey_responses=1,appointment_survey_sends=1; control true',
       CASE WHEN tables_ok = 3 AND policy_counts = 'appointment_survey_codes=0,appointment_survey_responses=1,appointment_survey_sends=1'
             AND control_rls THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. the columns of the three tables, in order, with types, NOT NULL and defaults',
       coalesce(md5(columns_seen), 'none'), 'the literal in this file',
       CASE WHEN columns_seen =
         'appointment_survey_codes code_hash:text:nn,tenant_id:uuid:nn,send_id:uuid:nn'
         || ' / appointment_survey_responses id:uuid:nn:gen_random_uuid(),tenant_id:uuid:nn,send_id:uuid:nn,appointment_id:uuid:nn,'
         || 'patient_id:uuid:nn,location_id:uuid:nn,practitioner_id:uuid:nn,practitioner_2_id:uuid:n,nps:smallint:nn,'
         || 'rating:smallint:nn,comment:text:n,comment_purged_at:timestamp with time zone:n,contact_consent:boolean:nn,'
         || 'consent_version:text:nn,channel:text:nn,sent_at:timestamp with time zone:nn,submitted_at:timestamp with time zone:nn:now()'
         || ' / appointment_survey_sends id:uuid:nn:gen_random_uuid(),tenant_id:uuid:nn,appointment_id:uuid:nn,patient_id:uuid:nn,'
         || 'location_id:uuid:nn,channel:text:nn,origin:text:nn,sent_by:uuid:n,sent_at:timestamp with time zone:nn:now(),'
         || 'consumed_at:timestamp with time zone:n,outcome:text:n'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. the constraints of each table (count, md5) and the ten foreign keys, each by NAME and definition, validated, with its delete rule',
       coalesce(constraints_seen, 'none') || ' | fks ' || coalesce(md5(fks_seen), 'none') || ' | by name ' || coalesce(md5(fk_defs_seen), 'none') || ' | validated ' || fks_valid::text,
       'the literals in this file; validated 10',
       CASE WHEN constraints_seen = 'appointment_survey_codes 5 b6cb26b5a45eaf8d4884ad3eda6b1335'
                                    || ' / appointment_survey_responses 14 e2bc43feb420ebf7c21aed613d711bbb'
                                    || ' / appointment_survey_sends 10 1f14d0db546b0b0a5366be9ba736f554'
             AND fks_seen = 'appointment_survey_codes.send_id>appointment_survey_sends:c,appointment_survey_codes.tenant_id>tenants:a,'
                            || 'appointment_survey_responses.appointment_id>appointments:a,appointment_survey_responses.patient_id>patients:a,'
                            || 'appointment_survey_responses.send_id>appointment_survey_sends:a,appointment_survey_responses.tenant_id>tenants:a,'
                            || 'appointment_survey_sends.appointment_id>appointments:c,appointment_survey_sends.patient_id>patients:a,'
                            || 'appointment_survey_sends.sent_by>users:a,appointment_survey_sends.tenant_id>tenants:a'
             AND fks_valid = 10
             AND fk_defs_seen = 'appointment_survey_codes_send_id_fkey FOREIGN KEY (send_id) REFERENCES appointment_survey_sends(id) ON DELETE CASCADE; '
                            || 'appointment_survey_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id); '
                            || 'appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id); '
                            || 'appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id); '
                            || 'appointment_survey_responses_send_id_fkey FOREIGN KEY (send_id) REFERENCES appointment_survey_sends(id); '
                            || 'appointment_survey_responses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id); '
                            || 'appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE; '
                            || 'appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id); '
                            || 'appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id); '
                            || 'appointment_survey_sends_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the nine indexes, by name',
       coalesce(indexes_seen, 'none'), 'three pkeys, three unique keys, three lookups',
       CASE WHEN indexes_seen = 'appointment_survey_codes_pkey,appointment_survey_codes_send_id_key,'
                                || 'appointment_survey_responses_appointment_id_key,appointment_survey_responses_pkey,'
                                || 'appointment_survey_responses_send_id_key,appointment_survey_responses_tenant_submitted_idx,'
                                || 'appointment_survey_sends_appointment_idx,appointment_survey_sends_patient_sent_idx,appointment_survey_sends_pkey'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the two policies: SELECT, PERMISSIVE, TO authenticated, no WITH CHECK, USING pinned (control: the two texts differ)',
       coalesce(policies_seen, 'none'), 'the literals in this file',
       CASE WHEN policies_seen = 'appointment_survey_responses:r:true:authenticated:b4105c9d605f79b99901c2e0c52e361b:-,'
                                 || 'appointment_survey_sends:r:true:authenticated:8383259e1cfa78fa7fed99fcd195e1bf:-'
             AND 'b4105c9d605f79b99901c2e0c52e361b' <> '8383259e1cfa78fa7fed99fcd195e1bf'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the nine functions: signature, SECURITY DEFINER (eight), owner postgres, search_path=public, volatility, body md5, language plpgsql',
       fns_ok::text || ' of 9; not as pinned: ' || fns_bad, '9 of 9; not as pinned: none',
       CASE WHEN fns_ok = 9 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. EXECUTE: the six doors to authenticated only; helper, purge and trigger function to no app role; no PUBLIC, no NULL ACL (control: postgres runs all)',
       exec_wrong::text || ' wrong of ' || exec_cells::text || ' cells, ' || exec_public::text || ' PUBLIC or NULL; control ' || exec_owner::text,
       '0 wrong of 36 cells, 0 PUBLIC or NULL; control 9',
       CASE WHEN exec_wrong = 0 AND exec_cells = 36 AND exec_public = 0 AND exec_owner = 9 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. table privileges: authenticated SELECT on sends and answers only; anon, patient, PUBLIC nothing (control: the owner holds all)',
       priv_wrong::text || ' wrong of ' || priv_cells::text || ' cells, ' || priv_public::text || ' PUBLIC; control ' || priv_owner::text,
       '0 wrong of 72 cells, 0 PUBLIC; control 24',
       CASE WHEN priv_wrong = 0 AND priv_cells = 72 AND priv_public = 0 AND priv_owner = 24 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. patients.survey_enabled: boolean NOT NULL default true, a catalogue default (no rewrite), every row true (control: rows exist)',
       coalesce(column_seen, 'none') || '; ' || patients_not_true::text || ' rows not true, of ' || patients_rows::text,
       'boolean:nn:true:true; 0 rows not true, of more than 0',
       CASE WHEN column_seen = 'boolean:nn:true:true' AND patients_not_true = 0 AND patients_rows > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. the patient role updates the carried columns plus survey_enabled, and still no table UPDATE',
       patient_cols || '; table ' || patient_table_update::text, patient_cols_want || '; table false',
       CASE WHEN patient_cols = patient_cols_want AND NOT patient_table_update THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. every policy outside the new tables is unchanged (md5)', pol_md5, :'policies_md5',
       CASE WHEN pol_md5 = :'policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. every function in public outside the nine new names is unchanged (md5)', fn_md5, :'functions_md5',
       CASE WHEN fn_md5 = :'functions_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. every relation privilege in public outside the new relations is unchanged (md5)', rel_md5, :'relation_acl_md5',
       CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. every column privilege outside patients.survey_enabled is unchanged (md5)', col_md5, :'column_acl_md5',
       CASE WHEN col_md5 = :'column_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '15. every default privilege is unchanged (md5)', def_md5, :'default_acl_md5',
       CASE WHEN def_md5 = :'default_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '16. tables plus 3 and SECURITY DEFINER functions plus 8, every one owned by postgres',
       n_tables::text || ' tables, ' || secdef::text || ' secdef, ' || secdef_not_postgres::text || ' not postgres',
       (:'tables_before'::int + 3)::text || ' tables, ' || (:'secdef_before'::int + 8)::text || ' secdef, 0 not postgres',
       CASE WHEN n_tables = :'tables_before'::int + 3 AND secdef = :'secdef_before'::int + 8 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '17. the three new tables are empty: nothing was seeded (control: patients holds rows)',
       new_rows::text || '; control ' || patients_rows::text, '0; control more than 0',
       CASE WHEN new_rows = 0 AND patients_rows > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '18. IN ACTION, anon: a SELECT on each new table is refused (42501)',
       coalesce(probe_anon, 'not run'),
       'appointment_survey_sends=denied;appointment_survey_codes=denied;appointment_survey_responses=denied;',
       CASE WHEN probe_anon = 'appointment_survey_sends=denied;appointment_survey_codes=denied;appointment_survey_responses=denied;'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '19. IN ACTION, patient: the same, 3 of 3 (control: patient reads public.patients without an error)',
       coalesce(probe_patient, 'not run'),
       'appointment_survey_sends=denied;appointment_survey_codes=denied;appointment_survey_responses=denied;patients=read;',
       CASE WHEN probe_patient = 'appointment_survey_sends=denied;appointment_survey_codes=denied;appointment_survey_responses=denied;patients=read;'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '20. IN ACTION, authenticated with no claims: codes refused; sends and answers read, zero rows',
       coalesce(probe_authenticated, 'not run'),
       'appointment_survey_sends=read 0;appointment_survey_codes=denied;appointment_survey_responses=read 0;',
       CASE WHEN probe_authenticated = 'appointment_survey_sends=read 0;appointment_survey_codes=denied;appointment_survey_responses=read 0;'
       THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '21. the doors run as authenticated: resolve on an unknown hash, zero rows; the state with no claims, not_allowed',
       coalesce(probe_doors, 'not run'), 'resolve rows 0; state not_allowed',
       CASE WHEN probe_doors = 'resolve rows 0; state not_allowed' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '22. the journal grew by exactly one', journal_rows::text, (:'journal_rows_before'::int + 1)::text,
       CASE WHEN journal_rows = :'journal_rows_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '23. 0102 is present by hash, once, as the newest row',
       has_0102::text || ' row, newest ' || CASE WHEN newest_hash = 'db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1' THEN 'is 0102' ELSE 'is NOT 0102' END,
       '1 row, newest is 0102',
       CASE WHEN has_0102 = 1 AND newest_hash = 'db12b967d4f67bfbfeaff5447cf5fa41ae74e007112a26f97b345e9e3fb7d9c1' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '24. R34: the audit trigger on patients: AFTER UPDATE, per row, enabled, any column, WHEN the value changed (control: the number trigger is BEFORE INSERT)',
       audit_trigger || '; control ' || trigger_control,
       'patients:17:O::patients_survey_switch_audit():when the value changed; control 7',
       CASE WHEN audit_trigger = 'patients:17:O::patients_survey_switch_audit():when the value changed' AND trigger_control = '7' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '25. R34: survey_enabled has the column privileges of both reminder switches, cell by cell (control: id differs)',
       col_differs::text || ' cells differ of ' || col_cells::text || '; ' || col_profile || '; control ' || col_control::text,
       '0 cells differ of 16; authenticated UPDATE and patient UPDATE among them, anon nothing; control more than 0',
       CASE WHEN col_differs = 0 AND col_cells = 16
             AND position('authenticated UPDATE' in col_profile) > 0 AND position('patient UPDATE' in col_profile) > 0
             AND position('anon ' in col_profile) = 0
             AND col_control > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '26. every trigger in public outside the new one is unchanged (md5)', trg_md5, :'triggers_md5',
       CASE WHEN trg_md5 = :'triggers_md5' THEN 'OK' ELSE 'FAIL' END FROM j;
