-- 0105 POST-CHECK: a registo and the episode it is filed in name one patient, in one tenant.
-- READ ONLY. It writes nothing and cannot. Counts and catalogue facts only: no
-- name, no title, no clinical text and no id of anyone is printed.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the SUMMARY row prints the profile:
--     N OK / M VACUOUS / K FAIL
-- Nineteen verdicts, 0 to 18. Every one tests FAIL first, then VACUOUS, then OK.
-- On a database that holds registos filed in episodes it reads
-- 19 OK / 0 VACUOUS / 0 FAIL. Where no registo names an episode, verdict 16 reads
-- VACUOUS, never OK: 18 OK / 1 VACUOUS / 0 FAIL.
--
-- EVERY CHANGE 0105 MAKES IS ASSERTED, AND EVERYTHING ELSE IS ASSERTED UNCHANGED:
--   0      the transaction is READ ONLY;
--   1      THE INDEX: one relation named clinical_episodes_id_patient_tenant_uq,
--          an index of clinical_episodes that is UNIQUE, valid, ready, live and
--          immediate, not the primary key, with no predicate and no expression,
--          and whose definition the server prints as pinned: btree on (id,
--          patient_id, tenant_id), in that order. CONTROL: the same read finds
--          the primary key's index;
--   2      THE KEY: one constraint named
--          clinical_records_episode_patient_tenant_fk, on clinical_records: a
--          foreign key, VALIDATED, DEFERRABLE and not initially deferred, MATCH
--          SIMPLE, NO ACTION on update and on delete, resting on the index of
--          verdict 1, and whose definition the server prints as pinned: the three
--          columns in order on both sides. CONTROL: the same read prints the key
--          of 0000, which is not deferrable;
--   3      EVERY OTHER CONSTRAINT of the two tables is as the pre-check read it
--          (other_constraints_md5), the key of 0000 among them;
--   4      EVERY OTHER INDEX of the two tables is as the pre-check read it
--          (other_indexes_md5), and the two tables carry ten indexes: the nine,
--          and the new one;
--   5      THE FUNCTION: public.merge_patients(uuid, uuid, uuid) has the body this
--          file pins by md5 (the one in the migration file), is still SECURITY
--          DEFINER with search_path empty, owned by `postgres`, returns jsonb and
--          takes 0005's three parameters; EXECUTE is held by `authenticated` and
--          not by `anon`, `patient`, `service_role` or PUBLIC; and its ACL hashes
--          to merge_acl_md5: CREATE OR REPLACE kept it;
--   6      THE BODY IS 0005's PLUS THE SEVEN LINES, read from the catalogue: it
--          names each SET CONSTRAINTS statement exactly once, DEFERRED before the
--          UPDATE of clinical_episodes and IMMEDIATE after the UPDATE of
--          clinical_records; and with the seven added lines taken out, the body
--          hashes to the md5 the pre-check pinned for 0005's;
--   7      the SECURITY DEFINER count equals secdef_before, every one owned by
--          `postgres`: 0105 adds none;
--   8      every OTHER function in `public` hashes to other_functions_md5;
--   9      every policy in the database hashes to policies_md5, and there are
--          policies_before of them: 0105 creates, alters and drops none;
--   10     every privilege on every relation in `public` but the new index
--          hashes to relation_acl_md5: 0105 granted and revoked nothing. The
--          pre-check leaves the same name out; an index is a relation, and a new
--          one arrives with its owner's own privileges;
--   11     every column privilege in `public` hashes to column_acl_md5;
--   12     every default privilege in the database hashes to default_acl_md5;
--   13     every trigger in `public` hashes to triggers_md5, and clinical_records
--          still carries exactly its immutability trigger, its function's body
--          pinned;
--   14     the table count in `public` is tables_before: nothing was created but
--          an index;
--   15     NO ROW WAS WRITTEN AND NO TABLE WAS REWRITTEN: the row count and the
--          md5 over every row of each of the two tables are the pre-check's, and
--          so is each table's file node;
--   16     THE ROWS FIT THE KEY, read again by the pre-check's own query: no
--          registo names an episode of another patient or tenant, or one that is
--          not there, and the key's own count agrees. CONTROL: the registos that
--          name an episode are registos_in_an_episode, as before. VACUOUS when
--          none does;
--   17     the journal reads journal_rows_before + 1;
--   18     0105's sha256 is in the journal exactly once, as the newest row.
--          The journal is read by a DO block: on a database with no drizzle
--          journal, verdicts 17 and 18 read FAIL with "no journal table";
--   INFO   the server version;
--   INFO   the size of the new index, in bytes.
--
-- THE BEHAVIOUR IS NOT PROVEN HERE. A READ ONLY transaction cannot show a
-- statement being refused. That the key refuses a registo in another patient's
-- episode, that an episode holding registos does not change patient alone, and
-- that a merge moves an episode with its draft, locked and signed registos, is
-- proven by the DB-gated suites on a rehearsal database.
--
-- NOT A STANDING INVARIANT for 3, 4 and 7 to 15: the next migration that adds a
-- function, a policy, a grant or a table moves them, and the application writes
-- registos. It is an assertion about this apply.
--
-- The carries come from THIS sitting's pre-check transcript; the block passes
-- each one with -v. A missing one STOPs (psql exit 3) before any verdict.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<n> -v secdef_before=<n> -v tables_before=<n>
--        -v registos_rows=<n> -v registos_md5=<md5> -v episodes_rows=<n>
--        -v episodes_md5=<md5> -v registos_in_an_episode=<n>
--        -v registos_filenode=<n> -v episodes_filenode=<n>
--        -v other_constraints_md5=<md5> -v other_indexes_md5=<md5>
--        -v other_functions_md5=<md5> -v merge_acl_md5=<md5>
--        -v policies_before=<n> -v policies_md5=<md5> -v relation_acl_md5=<md5>
--        -v column_acl_md5=<md5> -v default_acl_md5=<md5> -v triggers_md5=<md5>
--        -f scripts/db/postcheck-0105-registo-episode-key.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v secdef_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?tables_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v tables_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?registos_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v registos_rows is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?registos_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v registos_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?episodes_rows}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v episodes_rows is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?episodes_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v episodes_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?registos_in_an_episode}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v registos_in_an_episode is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?registos_filenode}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v registos_filenode is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?episodes_filenode}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v episodes_filenode is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?other_constraints_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v other_constraints_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?other_indexes_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v other_indexes_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?other_functions_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v other_functions_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?merge_acl_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v merge_acl_md5 is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_before}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_before is missing. This file refuses to guess.'; END $missing$;
\endif
\if :{?policies_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v policies_md5 is missing. This file refuses to guess.'; END $missing$;
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
\if :{?triggers_md5}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v triggers_md5 is missing. This file refuses to guess.'; END $missing$;
\endif

BEGIN READ ONLY;
-- A session that does not bypass row level security ERRORs on its first read
-- of an RLS table here, instead of reading a filtered zero.
SET LOCAL row_security = off;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 17 and 18 instead of ending the file before any other verdict. The
-- carried count travels in through a setting and is compared here, where a
-- value that is not a number is a FAIL and not a cast error.
SELECT set_config('rk0105.journal_before', :'journal_rows_before', true) IS NOT NULL AS journal_before_passed \gset
DO $journal$
DECLARE
  v_before text := current_setting('rk0105.journal_before');
  v_rows   integer;
  v_new    integer;
  v_hash   text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('rk0105.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int, (count(*) FILTER (WHERE hash = $1))::int FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new
    USING '980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441';
  EXECUTE 'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1' INTO v_hash;
  PERFORM set_config('rk0105.journal', 'read', true);
  PERFORM set_config('rk0105.journal_rows', v_rows::text, true);
  PERFORM set_config('rk0105.has_new', v_new::text, true);
  PERFORM set_config('rk0105.newest_is_new',
                     (coalesce(v_hash, '') = '980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441')::text, true);
  PERFORM set_config('rk0105.journal_moved_by_one',
                     CASE WHEN v_before ~ '^[0-9]+$' THEN (v_rows = v_before::int + 1)::text ELSE 'the carry is not a number' END, true);
END
$journal$;

\echo ''
\echo '=== 0105 REGISTO EPISODE KEY POST-CHECK: read the SUMMARY row last (19 OK / 0 VACUOUS / 0 FAIL where registos are filed in episodes) ==='

WITH tabs AS (
  SELECT c.oid, c.relname::text AS relname
    FROM pg_class c
   WHERE c.oid IN ('public.clinical_records'::regclass, 'public.clinical_episodes'::regclass)
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
), mp AS (
  SELECT p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proowner, p.proacl, p.prorettype
    FROM pg_proc p
   WHERE p.oid = 'public.merge_patients(uuid, uuid, uuid)'::regprocedure
), added AS (
  -- The seven lines 0105 adds to 0005's body, as the migration file writes them.
  SELECT E'  -- The episodes and their registos change patient in two statements. The\n'
      || E'  -- key that ties a registo to its episode''s patient is checked once, after\n'
      || E'  -- both, at SET CONSTRAINTS ... IMMEDIATE below.\n'
      || E'  SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk DEFERRED;\n'
      || E'\n'                                                                               AS before_the_updates,
         E'  -- Checked here: every registo that moved names the patient its episode names.\n'
      || E'  SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk IMMEDIATE;\n' AS after_the_updates,
         'SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk DEFERRED;'       AS stmt_deferred,
         'SET CONSTRAINTS public.clinical_records_episode_patient_tenant_fk IMMEDIATE;'      AS stmt_immediate
), body AS (
  SELECT mp.prosrc,
         (length(mp.prosrc) - length(replace(mp.prosrc, a.stmt_deferred, ''))) / length(a.stmt_deferred)   AS n_deferred,
         (length(mp.prosrc) - length(replace(mp.prosrc, a.stmt_immediate, ''))) / length(a.stmt_immediate) AS n_immediate,
         (length(mp.prosrc) - length(replace(mp.prosrc, 'SET CONSTRAINTS', ''))) / length('SET CONSTRAINTS') AS n_set_constraints,
         strpos(mp.prosrc, a.stmt_deferred)                                  AS at_deferred,
         strpos(mp.prosrc, 'UPDATE public.clinical_episodes SET patient_id') AS at_episodes,
         strpos(mp.prosrc, 'UPDATE public.clinical_records  SET patient_id') AS at_registos,
         strpos(mp.prosrc, a.stmt_immediate)                                 AS at_immediate,
         md5(replace(replace(mp.prosrc, a.before_the_updates, ''), a.after_the_updates, '')) AS md5_without_the_added_lines
    FROM mp, added a
), fit AS (
  -- Verdict 16. The pre-check's verdict 6, the same query.
  SELECT count(*)::bigint                                                                  AS registos_total,
         count(*) FILTER (WHERE r.episode_id IS NOT NULL)                                  AS with_episode,
         count(e.id)                                                                       AS joined,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.patient_id IS DISTINCT FROM r.patient_id) AS other_patient,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.tenant_id IS DISTINCT FROM r.tenant_id)   AS other_tenant,
         count(*) FILTER (WHERE r.episode_id IS NOT NULL AND e.id IS NULL)                 AS episode_missing,
         count(*) FILTER (WHERE x.misfit)                                                  AS any_of_three,
         count(*) FILTER (WHERE r.episode_id IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM public.clinical_episodes k
                                             WHERE k.id = r.episode_id
                                               AND k.patient_id = r.patient_id
                                               AND k.tenant_id = r.tenant_id))             AS key_would_refuse
    FROM public.clinical_records r
    LEFT JOIN public.clinical_episodes e ON e.id = r.episode_id
    CROSS JOIN LATERAL (SELECT (r.episode_id IS NOT NULL
                                AND (e.id IS NULL
                                     OR e.patient_id IS DISTINCT FROM r.patient_id
                                     OR e.tenant_id IS DISTINCT FROM r.tenant_id)) AS misfit) x
), j AS (
  SELECT
    coalesce(current_setting('rk0105.journal', true), 'not read')                              AS journal_state,
    current_setting('rk0105.journal_rows', true)                                                AS journal_rows,
    current_setting('rk0105.has_new', true)                                                     AS has_0105,
    current_setting('rk0105.newest_is_new', true)                                               AS newest_is_0105,
    current_setting('rk0105.journal_moved_by_one', true)                                        AS journal_moved_by_one,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clinical_episodes_id_patient_tenant_uq')      AS index_named,
    (SELECT i.indrelid::regclass::text || ' unique ' || i.indisunique::text || ' valid ' || i.indisvalid::text
            || ' ready ' || i.indisready::text || ' live ' || i.indislive::text || ' immediate ' || i.indimmediate::text
            || ' primary ' || i.indisprimary::text || ' predicate ' || (i.indpred IS NOT NULL)::text
            || ' expression ' || (i.indexprs IS NOT NULL)::text || ' ; ' || pg_get_indexdef(i.indexrelid)
       FROM pg_index i
      WHERE i.indexrelid = to_regclass('public.clinical_episodes_id_patient_tenant_uq'))        AS index_shape,
    (SELECT i.indisunique::text || '/' || i.indisvalid::text FROM pg_index i
      WHERE i.indexrelid = 'public.clinical_episodes_pkey'::regclass)                           AS index_control,
    (SELECT count(*)::int FROM pg_constraint k
      WHERE k.conname = 'clinical_records_episode_patient_tenant_fk')                           AS key_named,
    (SELECT k.conrelid::regclass::text || ' ' || k.contype::text || ' validated ' || k.convalidated::text
            || ' deferrable ' || k.condeferrable::text || ' deferred ' || k.condeferred::text
            || ' match ' || k.confmatchtype::text || ' update ' || k.confupdtype::text || ' delete ' || k.confdeltype::text
            || ' index ' || k.conindid::regclass::text || ' ; ' || pg_get_constraintdef(k.oid)
       FROM pg_constraint k
      WHERE k.conrelid = 'public.clinical_records'::regclass
        AND k.conname = 'clinical_records_episode_patient_tenant_fk')                           AS key_shape,
    (SELECT k.contype::text || '/' || k.convalidated::text || '/' || k.condeferrable::text || ' ' || pg_get_constraintdef(k.oid)
       FROM pg_constraint k
      WHERE k.conrelid = 'public.clinical_records'::regclass
        AND k.conname = 'clinical_records_episode_id_clinical_episodes_id_fk')                  AS old_key,
    (SELECT md5(coalesce(string_agg(
              k.conrelid::regclass::text || '.' || k.conname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid)
              || ':' || k.convalidated::text || ':' || k.condeferrable::text || ':' || k.condeferred::text,
              ';' ORDER BY k.conrelid::regclass::text, k.conname), ''))
       FROM pg_constraint k
      WHERE k.conrelid IN (SELECT oid FROM tabs)
        AND k.conname <> 'clinical_records_episode_patient_tenant_fk')                          AS other_con_md5,
    (SELECT md5(coalesce(string_agg(pg_get_indexdef(i.indexrelid) || ':' || i.indisvalid::text || ':' || i.indisunique::text,
                                    ';' ORDER BY i.indexrelid::regclass::text), ''))
       FROM pg_index i
      WHERE i.indrelid IN (SELECT oid FROM tabs)
        AND i.indexrelid::regclass::text <> 'clinical_episodes_id_patient_tenant_uq')           AS other_idx_md5,
    (SELECT count(*)::int FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM tabs))           AS all_indexes,
    (SELECT md5(mp.prosrc) || ' ' || CASE WHEN mp.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || ' '
            || coalesce(array_to_string(mp.proconfig, ','), '-') || ' owner ' || pg_get_userbyid(mp.proowner)
            || ' returns ' || format_type(mp.prorettype, NULL)
            || ' (' || pg_get_function_arguments(mp.oid) || ')'
       FROM mp)                                                                                 AS merge_shape,
    (SELECT 'authenticated ' || has_function_privilege('authenticated', mp.oid, 'EXECUTE')::text
            || ', anon ' || has_function_privilege('anon', mp.oid, 'EXECUTE')::text
            || ', patient ' || has_function_privilege('patient', mp.oid, 'EXECUTE')::text
            || ', service_role ' || has_function_privilege('service_role', mp.oid, 'EXECUTE')::text
            || ', PUBLIC items ' || (SELECT count(*) FROM aclexplode(coalesce(mp.proacl, acldefault('f', mp.proowner))) a WHERE a.grantee = 0)::text
       FROM mp)                                                                                 AS merge_execute,
    (SELECT md5(coalesce(mp.proacl::text, '-')) FROM mp)                                        AS merge_acl_md5,
    (SELECT 'DEFERRED ' || b.n_deferred || ', IMMEDIATE ' || b.n_immediate || ', SET CONSTRAINTS in all ' || b.n_set_constraints
            || '; order ' || CASE WHEN b.at_deferred > 0 AND b.at_deferred < b.at_episodes AND b.at_episodes < b.at_registos
                                       AND b.at_registos < b.at_immediate THEN 'deferred, episodes, registos, immediate' ELSE 'NOT as written' END
            || '; without the added lines ' || b.md5_without_the_added_lines
       FROM body b)                                                                             AS body_shape,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    (SELECT md5(coalesce(string_agg(
              p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':'
              || pg_get_userbyid(p.proowner) || ':' || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '-'),
              ';' ORDER BY p.oid::regprocedure::text), ''))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.oid <> (SELECT oid FROM mp))                             AS other_fn_md5,
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
       FROM rel_items
      WHERE rel <> 'clinical_episodes_id_patient_tenant_uq')                                   AS rel_md5,
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
              c.oid::regclass::text || '.' || t.tgname || ':' || t.tgtype::text || ':' || t.tgenabled::text || ':'
              || t.tgfoid::regprocedure::text || ':' || coalesce(t.tgattr::text, '') || ':'
              || coalesce(md5(pg_get_triggerdef(t.oid)), '-'),
              ';' ORDER BY c.oid::regclass::text, t.tgname), ''))
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal)                                        AS trg_md5,
    (SELECT coalesce(string_agg(t.tgname || ' type ' || t.tgtype::text || ' enabled ' || t.tgenabled::text || ' '
                                || t.tgfoid::regprocedure::text || ' ' || md5(p.prosrc), ' ; ' ORDER BY t.tgname), 'none')
       FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.clinical_records'::regclass AND NOT t.tgisinternal)             AS registo_triggers,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::bigint FROM public.clinical_records)                                      AS registos_rows,
    (SELECT md5(coalesce(string_agg(md5((r.*)::text), '' ORDER BY r.id), '')) FROM public.clinical_records r)   AS registos_md5,
    (SELECT count(*)::bigint FROM public.clinical_episodes)                                     AS episodes_rows,
    (SELECT md5(coalesce(string_agg(md5((e.*)::text), '' ORDER BY e.id), '')) FROM public.clinical_episodes e)  AS episodes_md5,
    pg_relation_filenode('public.clinical_records'::regclass)::text                             AS registos_filenode,
    pg_relation_filenode('public.clinical_episodes'::regclass)::text                            AS episodes_filenode,
    current_setting('server_version')                                                           AS server_version,
    coalesce(pg_relation_size(to_regclass('public.clinical_episodes_id_patient_tenant_uq'))::text, 'absent') AS new_index_bytes
), r AS (
  SELECT 0 AS n, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. THE INDEX: unique, valid, ready, live, immediate, on (id, patient_id, tenant_id) of clinical_episodes (control: the primary key''s index)',
         index_named::text || ' named; ' || coalesce(index_shape, 'absent') || '; control ' || coalesce(index_control, 'absent'),
         '1 named; clinical_episodes unique true valid true ready true live true immediate true primary false predicate false expression false ; CREATE UNIQUE INDEX clinical_episodes_id_patient_tenant_uq ON public.clinical_episodes USING btree (id, patient_id, tenant_id); control true/true',
         CASE WHEN index_named = 1
               AND index_shape = 'clinical_episodes unique true valid true ready true live true immediate true primary false predicate false expression false ; CREATE UNIQUE INDEX clinical_episodes_id_patient_tenant_uq ON public.clinical_episodes USING btree (id, patient_id, tenant_id)'
               AND index_control = 'true/true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. THE KEY: a validated foreign key, deferrable and immediate, MATCH SIMPLE, NO ACTION, on the three columns, resting on the new index (control: the key of 0000 is not deferrable)',
         key_named::text || ' named; ' || coalesce(key_shape, 'absent') || '; control ' || coalesce(old_key, 'absent'),
         '1 named; clinical_records f validated true deferrable true deferred false match s update a delete a index clinical_episodes_id_patient_tenant_uq ; FOREIGN KEY (episode_id, patient_id, tenant_id) REFERENCES clinical_episodes(id, patient_id, tenant_id) DEFERRABLE; control f/true/false FOREIGN KEY (episode_id) REFERENCES clinical_episodes(id)',
         CASE WHEN key_named = 1
               AND key_shape = 'clinical_records f validated true deferrable true deferred false match s update a delete a index clinical_episodes_id_patient_tenant_uq ; FOREIGN KEY (episode_id, patient_id, tenant_id) REFERENCES clinical_episodes(id, patient_id, tenant_id) DEFERRABLE'
               AND old_key = 'f/true/false FOREIGN KEY (episode_id) REFERENCES clinical_episodes(id)' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. every other constraint of the two tables is as the pre-check read it',
         other_con_md5, :'other_constraints_md5',
         CASE WHEN other_con_md5 = :'other_constraints_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. every other index of the two tables is as the pre-check read it, and there are ten in all',
         other_idx_md5 || '; ' || all_indexes::text || ' in all', :'other_indexes_md5' || '; 10 in all',
         CASE WHEN other_idx_md5 = :'other_indexes_md5' AND all_indexes = 10 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. THE FUNCTION: the pinned body, SECURITY DEFINER, search_path empty, owned by postgres, EXECUTE for authenticated alone, its ACL as before',
         coalesce(merge_shape, 'absent') || ' ; ' || coalesce(merge_execute, 'absent') || ' ; ACL ' || coalesce(merge_acl_md5, 'absent'),
         '990864a7748a7242079e59744fdddde3 DEFINER search_path="" owner postgres returns jsonb (p_source_id uuid, p_target_id uuid, p_actor_id uuid DEFAULT NULL::uuid) ; authenticated true, anon false, patient false, service_role false, PUBLIC items 0 ; ACL ' || :'merge_acl_md5',
         CASE WHEN merge_shape = '990864a7748a7242079e59744fdddde3 DEFINER search_path="" owner postgres returns jsonb (p_source_id uuid, p_target_id uuid, p_actor_id uuid DEFAULT NULL::uuid)'
               AND merge_execute = 'authenticated true, anon false, patient false, service_role false, PUBLIC items 0'
               AND merge_acl_md5 = :'merge_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. THE BODY IS 0005''s PLUS THE SEVEN LINES: each SET CONSTRAINTS once, around the two UPDATEs, and without the added lines it hashes to 0005''s',
         coalesce(body_shape, 'absent'),
         'DEFERRED 1, IMMEDIATE 1, SET CONSTRAINTS in all 3; order deferred, episodes, registos, immediate; without the added lines 3dbbba9c644eac9c20ee123faefff8f7',
         CASE WHEN body_shape = 'DEFERRED 1, IMMEDIATE 1, SET CONSTRAINTS in all 3; order deferred, episodes, registos, immediate; without the added lines 3dbbba9c644eac9c20ee123faefff8f7'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. the SECURITY DEFINER count is the pre-check''s, every one owned by postgres',
         secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres', :'secdef_before' || ', 0 not owned by postgres',
         CASE WHEN secdef::text = :'secdef_before' AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, '8. every other function in public is as the pre-check read it',
         other_fn_md5, :'other_functions_md5',
         CASE WHEN other_fn_md5 = :'other_functions_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, '9. every policy in the database is as the pre-check read it, and as many',
         pol_md5 || ', ' || policies::text, :'policies_md5' || ', ' || :'policies_before',
         CASE WHEN pol_md5 = :'policies_md5' AND policies::text = :'policies_before' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, '10. every privilege on every relation in public, the new index apart, is as the pre-check read it',
         rel_md5, :'relation_acl_md5',
         CASE WHEN rel_md5 = :'relation_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, '11. every column privilege in public is as the pre-check read it',
         col_md5, :'column_acl_md5',
         CASE WHEN col_md5 = :'column_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, '12. every default privilege in the database is as the pre-check read it',
         def_md5, :'default_acl_md5',
         CASE WHEN def_md5 = :'default_acl_md5' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, '13. every trigger in public is as the pre-check read it, and clinical_records carries exactly its immutability trigger',
         trg_md5 || ' ; ' || registo_triggers,
         :'triggers_md5' || ' ; clinical_records_enforce_immutability type 27 enabled O enforce_clinical_record_immutability() f0691f60a12af6eeb561ce369c18f0d5',
         CASE WHEN trg_md5 = :'triggers_md5'
               AND registo_triggers = 'clinical_records_enforce_immutability type 27 enabled O enforce_clinical_record_immutability() f0691f60a12af6eeb561ce369c18f0d5'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, '14. the table count in public is the pre-check''s', n_tables::text, :'tables_before',
         CASE WHEN n_tables::text = :'tables_before' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 15, '15. NO ROW WAS WRITTEN AND NO TABLE WAS REWRITTEN: rows, row md5 and file node of both tables are the pre-check''s',
         'registos ' || registos_rows || ' ' || registos_md5 || ' node ' || registos_filenode
           || '; episodes ' || episodes_rows || ' ' || episodes_md5 || ' node ' || episodes_filenode,
         'registos ' || :'registos_rows' || ' ' || :'registos_md5' || ' node ' || :'registos_filenode'
           || '; episodes ' || :'episodes_rows' || ' ' || :'episodes_md5' || ' node ' || :'episodes_filenode',
         CASE WHEN registos_rows::text = :'registos_rows' AND registos_md5 = :'registos_md5' AND registos_filenode = :'registos_filenode'
               AND episodes_rows::text = :'episodes_rows' AND episodes_md5 = :'episodes_md5' AND episodes_filenode = :'episodes_filenode'
              THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 16, '16. THE ROWS FIT THE KEY: no registo names an episode of another patient or tenant, or one that is not there (control: registos that name an episode, as the pre-check counted them)',
         'registos ' || f.registos_total || ', naming an episode ' || f.with_episode || ', joined ' || f.joined
           || '; another patient ' || f.other_patient || ', another tenant ' || f.other_tenant || ', episode not there ' || f.episode_missing
           || '; the key would refuse ' || f.key_would_refuse || ' (the three together ' || f.any_of_three || ')',
         'naming an episode ' || :'registos_in_an_episode' || ', joined equal to it; another patient 0, another tenant 0, episode not there 0; the key would refuse 0 (the three together 0). Naming an episode 0 reads VACUOUS',
         CASE WHEN f.other_patient <> 0 OR f.other_tenant <> 0 OR f.episode_missing <> 0 OR f.key_would_refuse <> 0
                OR f.any_of_three <> 0 OR f.joined <> f.with_episode OR f.with_episode::text <> :'registos_in_an_episode' THEN 'FAIL'
              WHEN f.with_episode = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j, fit f
  UNION ALL SELECT 17, '17. the journal reads journal_rows_before + 1',
         CASE WHEN journal_state = 'read' THEN journal_rows || ' rows, one more than the carry: ' || journal_moved_by_one
              ELSE 'no journal table (' || journal_state || ')' END,
         'one more than ' || :'journal_rows_before',
         CASE WHEN journal_state = 'read' AND journal_moved_by_one = 'true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 18, '18. 0105''s sha256 is in the journal exactly once, as the newest row',
         CASE WHEN journal_state = 'read' THEN has_0105 || ' row, newest is 0105: ' || newest_is_0105
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0105: true',
         CASE WHEN journal_state = 'read' AND has_0105 = '1' AND newest_is_0105 = 'true' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 60, 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 61, 'INFO the size of the new index, in bytes', new_index_bytes, 'a profile', 'INFO' FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '19 OK / 0 VACUOUS / 0 FAIL; or 18 OK / 1 VACUOUS / 0 FAIL where no registo names an episode', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

ROLLBACK;
