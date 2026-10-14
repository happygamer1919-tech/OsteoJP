-- 0105 PRE-CHECK: a registo and the episode it is filed in name one patient, in one tenant.
-- READ ONLY. It writes nothing and cannot. Counts and catalogue facts only: no
-- name, no title, no clinical text and no id of anyone is printed.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, AND THE SUMMARY ROW PRINTS THE PROFILE
--     N OK / M VACUOUS / K FAIL
-- Eighteen verdicts, 0 to 17. Every one tests FAIL first, then VACUOUS, then OK: a
-- zero comparand may not print OK, and it may never hide a failure. A CARRY row
-- that could not be read prints FAIL and is counted. THIS FILE ENDS WITH AN ERROR
-- (psql exit 3) ON ANY PROFILE BUT  18 OK / 0 VACUOUS / 0 FAIL , and, with its own
-- sentence, on any count of registos the key would refuse that is not 0. So a
-- FAIL, a VACUOUS (verdict 6: no registo names an episode; verdict 17: the table
-- holds no episode) and a row that does not fit the key each stop the sitting
-- with nothing applied.
-- Twenty CARRY rows follow (verdict 3 prints a carried number too, the journal
-- rows): nineteen of them and verdict 3 feed the post-check, and the twentieth
-- is the count the stage 1 block reads on its own. The INFO rows
-- print a profile and are never counted: C1 to C3 among them, ruled into this
-- file by strategy (dispatch S-1008-B) as counts for the record. 0105 touches
-- none of those three tables, so they are not this file's STOP.
--
-- WHAT 0105 DOES (packages/db/migrations/0105_clinical_records_episode_key.sql,
-- sha256 980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441, promoted from
-- packages/db/migrations-pending with no byte changed): three SET LOCAL lines; CREATE UNIQUE INDEX
-- clinical_episodes_id_patient_tenant_uq on clinical_episodes (id, patient_id,
-- tenant_id); the foreign key clinical_records_episode_patient_tenant_fk from
-- clinical_records (episode_id, patient_id, tenant_id) to those three columns,
-- DEFERRABLE INITIALLY IMMEDIATE, added NOT VALID and validated by the next
-- statement; and CREATE OR REPLACE of public.merge_patients, 0005's body with
-- two SET CONSTRAINTS statements added. No policy, no grant, no new function,
-- no column, no row.
--
-- SO THIS FILE PROVES THE STARTING POINT EXACTLY:
--   0      the transaction is READ ONLY (the server refuses writes);
--   1      0105 is absent from the journal, by hash. CONTROL: the same count over
--          0104's hash reads 1 (verdict 2's subject), so the count can find a row;
--   2      0104 is present by hash ONCE, it is the NEWEST row by id, and its
--          created_at is 0104's journal when (-v prev_hash, -v prev_when, both
--          passed in by the block from the promoted journal; this file refuses to
--          guess either);
--   3      journal_rows_before: exactly 102 (0000 to 0104; the numbering has gaps).
--          The journal is read by a DO block, so on a database with no drizzle
--          journal verdicts 1 to 3 read FAIL with "no journal table" and every
--          other verdict still prints. No journal is never a pass;
--   4      the session is `postgres`, the owner of both tables. An ALTER TABLE and
--          a CREATE INDEX are the owner's. CONTROL: `authenticated` is NOT a member
--          of it;
--   5      THE SESSION READS BOTH TABLES PAST THEIR POLICIES: it has BYPASSRLS, or
--          is a superuser, or owns the table while row level security is not
--          FORCED on it. Every count below rests on that; the transaction also
--          sets row_security = off, so a session that does not bypass it ERRORs
--          on its first read instead of reading a filtered zero. CONTROL: the same
--          test reads false for `authenticated`;
--   6      THE ROWS FIT THE KEY. One pass over every registo, joined to its
--          episode: registos, registos that name an episode, the ones the join
--          found, and how many of those name ANOTHER PATIENT than their episode,
--          ANOTHER TENANT, or an episode that IS NOT THERE. All three must read 0.
--          The same rows are also counted the way the key itself asks (no episode
--          with the registo's own three values), and the two counts must agree.
--          VACUOUS when no registo names an episode: a zero over nothing is not a
--          pass. ANYTHING BUT ZERO IS A STOP, and the repair is its own ruled
--          operation (strategy, dispatch S-1008-B): the INFO row beside it says
--          how many of such rows are draft, locked and signed;
--   7      THE FIVE KEY COLUMNS ARE uuid AND NOT NULL: clinical_episodes.id,
--          .patient_id and .tenant_id, and clinical_records.patient_id and
--          .tenant_id. So the only NULL a registo can carry into the key is
--          episode_id, which means "no episode". CONTROL: the same read finds
--          clinical_records.episode_id uuid and NULLABLE;
--   8      NOTHING 0105 CREATES EXISTS YET: no relation in `public` is named
--          clinical_episodes_id_patient_tenant_uq and no constraint is named
--          clinical_records_episode_patient_tenant_fk. CONTROL: the same two
--          probes find clinical_episodes_pkey and the key of 0000;
--   9      THE KEY OF 0000 IS AS 0000 LEFT IT: a validated foreign key, not
--          deferrable, whose definition the server prints as pinned. 0105 leaves
--          it, and the post-check reads it again;
--   10     THE TRIGGERS: clinical_records carries exactly one,
--          clinical_records_enforce_immutability, enabled, BEFORE UPDATE OR
--          DELETE FOR EACH ROW, and its function's body hashes to the pinned md5
--          (0005's). clinical_episodes carries none;
--   11     THE NINE INDEXES of the two tables are there and valid (0000 and 0004),
--          and none of them is on the three columns of the new one;
--   12     merge_patients IS THE FUNCTION 0105 REPLACES: its body hashes to the
--          pinned md5 of 0005's, it is SECURITY DEFINER with search_path empty,
--          owned by `postgres`, returns jsonb, takes 0005's three parameters, and
--          EXECUTE is held by `authenticated` and not by `anon`, `patient`,
--          `service_role` or PUBLIC. CONTROL: a planted name resolves to nothing;
--   13     secdef_functions_before: 36 SECURITY DEFINER functions in `public`,
--          every one owned by `postgres`. 0105 adds none, so the post-check wants
--          the same number and no count GATE-CHANGE follows the apply;
--   14     THE SERVER IS POSTGRES 17, the version on which every pinned definition
--          here and in the post-check was read (17.6, the build lane's local
--          stack). CONTROL: server_version_num parses;
--   15     the five roles the checks name exist (`postgres`, `authenticated`,
--          `anon`, `patient`, `service_role`);
--   16     WHO MAY RUN merge_patients, ITEM BY ITEM: its ACL holds exactly the
--          owner's own EXECUTE and one EXECUTE for `authenticated`, each granted
--          by `postgres`, and nothing else. CREATE OR REPLACE keeps the ACL, so
--          whoever may run the function today may run the body that defers the
--          new key; verdict 12 asks four roles by name, and this verdict reads
--          every item, so a grantee or a grantor nobody named is found BEFORE the
--          apply. CONTROL: the list is not empty;
--   17     THE INDEX CAN BE BUILT AND NO ROW SLIPS PAST THE KEY, COUNTED FROM THE
--          ROWS: no two episodes share (id, patient_id, tenant_id); no episode
--          holds a NULL in one of the three; no registo holds a NULL patient_id
--          or tenant_id (MATCH SIMPLE would leave such a registo unchecked).
--          CONTROL: as many distinct ids as episodes. VACUOUS when the table
--          holds no episode;
--   INFO   C1. appointment_notes rows that name an episode, and how many of
--          them name another patient or another tenant than the episode does;
--   INFO   C2. attachments rows that name a registo, and how many of them name
--          another patient or another tenant than the registo does;
--   INFO   C3. Registos that supersede another registo, and how many of them
--          name another patient or another tenant than the one they supersede;
--   CARRY  secdef_before; tables_before (journal_rows_before is verdict 3's row);
--   CARRY  registos_rows, registos_md5, episodes_rows, episodes_md5: the row count
--          of each table and one md5 over every row of it. 0105 writes no row, so
--          the post-check wants all four unchanged. The md5 is printed; no row is;
--   CARRY  registos_in_an_episode: verdict 6's control, which the post-check's
--          own read must find again;
--   CARRY  registos_filenode, episodes_filenode: each table's file node. A table
--          REWRITE changes it, so the post-check proves no table was rewritten;
--   CARRY  other_constraints_md5: every constraint of the two tables but the new
--          key (name, type, definition, validated, deferrable), one md5;
--   CARRY  other_indexes_md5: every index of the two tables but the new one;
--   CARRY  other_functions_md5: every function in `public` but merge_patients
--          (signature, SECURITY DEFINER, volatility, owner, settings, body md5,
--          ACL), one md5;
--   CARRY  merge_acl_md5: the ACL of merge_patients. CREATE OR REPLACE keeps it;
--   CARRY  policies_before and policies_md5: every policy in the database;
--   CARRY  relation_acl_md5, column_acl_md5, default_acl_md5: every privilege on
--          every relation and column in `public`, and every default privilege,
--          one md5 each: 0105 grants and revokes nothing. One relation is left
--          out of the first, by name, here and in the post-check: the new index.
--          An index is a relation, and a new one arrives with its owner's own
--          privileges; verdict 8 proves no relation has that name yet;
--   CARRY  triggers_md5: every trigger in `public` that is not an internal one;
--   CARRY  registos_the_key_would_refuse: the greater of verdict 6's two counts.
--          0, or this file ends with its own STOP naming the number, and the
--          stage 1 block reads the same row out of the transcript and stops too;
--   INFO   the server version;
--   INFO   THE SIZE OF THE WORK: rows and bytes of the two tables (the heap, and
--          the total with TOAST and indexes). The index is built over the
--          episodes and the validation reads the registos, under the locks;
--   INFO   of the registos that do not fit the key (verdict 6): how many are
--          draft, locked and signed. A locked or signed registo is not changed by
--          an UPDATE (clinical_records_enforce_immutability);
--   INFO   how many OTHER sessions hold or await a lock on either table now, and
--          the age of the oldest transaction among them (the apply waits at most
--          5 seconds for each lock, then fails clean);
--   INFO   idle_in_transaction_session_timeout, as this session reads it;
--   INFO   the clock, Lisbon time.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET VERDICT: without either table, the
-- roles or the function's signature, the statement is an error and psql exits 3
-- before any verdict prints.
--
-- Run (the stage 1 block builds both values itself):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0104's sha256> -v prev_when=<0104's journal when>
--        -f scripts/db/precheck-0105-registo-episode-key.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0104 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0104''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;
-- Verdict 5's control against a filtered zero: a session that does not bypass
-- row level security ERRORs on its first read of an RLS table here.
SET LOCAL row_security = off;

-- THE JOURNAL, read by name so that a database without one prints a FAIL in
-- verdicts 1 to 3 instead of ending the file before any other verdict.
-- set_config(..., true) is transaction-local and is allowed in a READ ONLY
-- transaction. psql does not substitute a variable inside a dollar-quoted body,
-- so the two values travel in through settings.
SELECT set_config('rk0105.prev_hash', :'prev_hash', true) IS NOT NULL AS prev_hash_passed,
       set_config('rk0105.prev_when', :'prev_when', true) IS NOT NULL AS prev_when_passed \gset
DO $journal$
DECLARE
  v_rows   integer;
  v_new    integer;
  v_prev   integer;
  v_hash   text;
  v_when   text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    PERFORM set_config('rk0105.journal', 'absent', true);
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*)::int,
                  (count(*) FILTER (WHERE hash = $1))::int,
                  (count(*) FILTER (WHERE hash = $2))::int
             FROM drizzle.__drizzle_migrations'
    INTO v_rows, v_new, v_prev
    USING '980c6f24006a2b4fe16b3e963c1482613c5ecab1e65b8287e0a6a8ea9f7eb441', current_setting('rk0105.prev_hash');
  EXECUTE 'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1'
    INTO v_hash, v_when;
  PERFORM set_config('rk0105.journal', 'read', true);
  PERFORM set_config('rk0105.journal_rows', v_rows::text, true);
  PERFORM set_config('rk0105.has_new', v_new::text, true);
  PERFORM set_config('rk0105.has_prev', v_prev::text, true);
  PERFORM set_config('rk0105.newest_hash', coalesce(v_hash, ''), true);
  PERFORM set_config('rk0105.newest_when', coalesce(v_when, ''), true);
END
$journal$;

\echo ''
\echo '=== 0105 REGISTO EPISODE KEY PRE-CHECK: read the SUMMARY row last (18 OK / 0 VACUOUS / 0 FAIL, or this file ends with an error) ==='

WITH tabs AS (
  SELECT c.oid, c.relname::text AS relname, c.relowner, c.relforcerowsecurity
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
), mp_items AS (
  -- Verdict 16. Every item of the function's ACL, as the server explodes it.
  SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ' ' || a.privilege_type
         || ' by ' || pg_get_userbyid(a.grantor) || CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END AS item
    FROM mp CROSS JOIN LATERAL aclexplode(coalesce(mp.proacl, acldefault('f', mp.proowner))) a
), dat AS (
  -- Verdict 17. Counted from the rows, not from the catalogue.
  SELECT (SELECT count(*) FROM public.clinical_episodes)                                    AS episodes_total,
         (SELECT count(DISTINCT e.id) FROM public.clinical_episodes e)                      AS episode_ids,
         (SELECT count(*) FROM (SELECT 1 FROM public.clinical_episodes e
                                 GROUP BY e.id, e.patient_id, e.tenant_id HAVING count(*) > 1) d) AS duplicate_triples,
         (SELECT count(*) FROM public.clinical_episodes e
           WHERE e.id IS NULL OR e.patient_id IS NULL OR e.tenant_id IS NULL)               AS episode_nulls,
         (SELECT count(*) FROM public.clinical_records r
           WHERE r.patient_id IS NULL OR r.tenant_id IS NULL)                               AS registo_nulls
), fit AS (
  -- Verdict 6. One pass: every registo, with the episode it names if it names one.
  SELECT count(*)::bigint                                                                  AS registos_total,
         count(*) FILTER (WHERE r.episode_id IS NOT NULL)                                  AS with_episode,
         count(e.id)                                                                       AS joined,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.patient_id IS DISTINCT FROM r.patient_id) AS other_patient,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.tenant_id IS DISTINCT FROM r.tenant_id)   AS other_tenant,
         count(*) FILTER (WHERE r.episode_id IS NOT NULL AND e.id IS NULL)                 AS episode_missing,
         count(*) FILTER (WHERE x.misfit)                                                  AS any_of_three,
         count(*) FILTER (WHERE x.misfit AND r.status = 'draft')                           AS misfit_draft,
         count(*) FILTER (WHERE x.misfit AND r.status = 'locked')                          AS misfit_locked,
         count(*) FILTER (WHERE x.misfit AND r.status = 'signed')                          AS misfit_signed,
         -- The key's own question (MATCH SIMPLE): a registo that names an episode,
         -- and no episode carries its three values.
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
), c1 AS (
  SELECT count(*) FILTER (WHERE n.episode_id IS NOT NULL)                                  AS linked,
         count(e.id)                                                                       AS joined,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.patient_id IS DISTINCT FROM n.patient_id) AS other_patient,
         count(*) FILTER (WHERE e.id IS NOT NULL AND e.tenant_id IS DISTINCT FROM n.tenant_id)   AS other_tenant
    FROM public.appointment_notes n
    LEFT JOIN public.clinical_episodes e ON e.id = n.episode_id
), c2 AS (
  SELECT count(*) FILTER (WHERE a.clinical_record_id IS NOT NULL)                          AS linked,
         count(r.id)                                                                       AS joined,
         count(*) FILTER (WHERE r.id IS NOT NULL AND a.patient_id IS NULL)                 AS no_patient,
         count(*) FILTER (WHERE r.id IS NOT NULL AND a.patient_id IS NOT NULL
                            AND r.patient_id IS DISTINCT FROM a.patient_id)                AS other_patient,
         count(*) FILTER (WHERE r.id IS NOT NULL AND r.tenant_id IS DISTINCT FROM a.tenant_id)   AS other_tenant
    FROM public.attachments a
    LEFT JOIN public.clinical_records r ON r.id = a.clinical_record_id
), c3 AS (
  SELECT count(*) FILTER (WHERE s.supersedes_id IS NOT NULL)                               AS linked,
         count(o.id)                                                                       AS joined,
         count(*) FILTER (WHERE o.id IS NOT NULL AND o.patient_id IS DISTINCT FROM s.patient_id) AS other_patient,
         count(*) FILTER (WHERE o.id IS NOT NULL AND o.tenant_id IS DISTINCT FROM s.tenant_id)   AS other_tenant
    FROM public.clinical_records s
    LEFT JOIN public.clinical_records o ON o.id = s.supersedes_id
), j AS (
  SELECT
    coalesce(current_setting('rk0105.journal', true), 'not read')                              AS journal_state,
    nullif(current_setting('rk0105.journal_rows', true), '')::int                               AS journal_rows,
    nullif(current_setting('rk0105.has_new', true), '')::int                                    AS has_0105,
    nullif(current_setting('rk0105.has_prev', true), '')::int                                   AS has_0104,
    current_setting('rk0105.newest_hash', true)                                                 AS newest_hash,
    current_setting('rk0105.newest_when', true)                                                 AS newest_when,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me,
    (SELECT string_agg(t.relname || ' ' || pg_get_userbyid(t.relowner), ', ' ORDER BY t.relname) FROM tabs t) AS tbl_owners,
    (SELECT bool_and(r.rolbypassrls OR r.rolsuper OR (t.relowner = r.oid AND NOT t.relforcerowsecurity))
       FROM pg_roles r, tabs t WHERE r.rolname = current_user)                                  AS me_past_rls,
    (SELECT bool_or(r.rolbypassrls OR r.rolsuper OR (t.relowner = r.oid AND NOT t.relforcerowsecurity))
       FROM pg_roles r, tabs t WHERE r.rolname = 'authenticated')                               AS auth_past_rls,
    (SELECT coalesce(string_agg(c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                                || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULLABLE' END,
                                ', ' ORDER BY c.relname, a.attname), 'none')
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      WHERE a.attnum > 0 AND NOT a.attisdropped
        AND ((c.oid = 'public.clinical_episodes'::regclass AND a.attname IN ('id', 'patient_id', 'tenant_id'))
          OR (c.oid = 'public.clinical_records'::regclass AND a.attname IN ('patient_id', 'tenant_id'))))  AS key_columns,
    (SELECT format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULLABLE' END
       FROM pg_attribute a
      WHERE a.attrelid = 'public.clinical_records'::regclass AND a.attname = 'episode_id'
        AND a.attnum > 0 AND NOT a.attisdropped)                                                AS episode_id_column,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clinical_episodes_id_patient_tenant_uq')      AS new_index_taken,
    (SELECT count(*)::int FROM pg_constraint k
      WHERE k.conname = 'clinical_records_episode_patient_tenant_fk')                           AS new_key_taken,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clinical_episodes_pkey')                      AS index_probe_control,
    (SELECT count(*)::int FROM pg_constraint k
      WHERE k.conname = 'clinical_records_episode_id_clinical_episodes_id_fk')                  AS key_probe_control,
    (SELECT k.contype::text || '/' || k.convalidated::text || '/' || k.condeferrable::text || ' ' || pg_get_constraintdef(k.oid)
       FROM pg_constraint k
      WHERE k.conrelid = 'public.clinical_records'::regclass
        AND k.conname = 'clinical_records_episode_id_clinical_episodes_id_fk')                  AS old_key,
    (SELECT coalesce(string_agg(t.tgname || ' type ' || t.tgtype::text || ' enabled ' || t.tgenabled::text || ' '
                                || t.tgfoid::regprocedure::text || ' ' || md5(p.prosrc), ' ; ' ORDER BY t.tgname), 'none')
       FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.clinical_records'::regclass AND NOT t.tgisinternal)             AS registo_triggers,
    (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgrelid = 'public.clinical_episodes'::regclass AND NOT t.tgisinternal)            AS episode_triggers,
    (SELECT coalesce(string_agg(i.indexrelid::regclass::text, ',' ORDER BY i.indexrelid::regclass::text), 'none')
       FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM tabs) AND i.indisvalid AND i.indisready AND i.indislive) AS valid_indexes,
    (SELECT count(*)::int FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM tabs))           AS all_indexes,
    (SELECT count(*)::int FROM pg_index i
      WHERE i.indrelid = 'public.clinical_episodes'::regclass
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
               FROM unnest(i.indkey::int2[]) k(attnum)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
            = ARRAY['id', 'patient_id', 'tenant_id'])                                           AS three_column_indexes,
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
    (to_regprocedure('public.no_such_function_0105()') IS NULL)                                 AS planted_fn_absent,
    (SELECT coalesce(string_agg(i.item, ', ' ORDER BY i.item), 'none') FROM mp_items i)         AS merge_acl_items,
    (SELECT count(*)::int FROM mp_items)                                                        AS merge_acl_n,
    (SELECT md5(coalesce(mp.proacl::text, '-')) FROM mp)                                        AS merge_acl_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                               AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres')  AS secdef_not_postgres,
    current_setting('server_version_num')::int                                                  AS server_num,
    current_setting('server_version')                                                           AS server_version,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('postgres', 'authenticated', 'anon', 'patient', 'service_role'))        AS roles_named,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                    AS n_tables,
    (SELECT count(*)::bigint FROM public.clinical_records)                                      AS registos_rows,
    (SELECT md5(coalesce(string_agg(md5((r.*)::text), '' ORDER BY r.id), '')) FROM public.clinical_records r)   AS registos_md5,
    (SELECT count(*)::bigint FROM public.clinical_episodes)                                     AS episodes_rows,
    (SELECT md5(coalesce(string_agg(md5((e.*)::text), '' ORDER BY e.id), '')) FROM public.clinical_episodes e)  AS episodes_md5,
    pg_relation_filenode('public.clinical_records'::regclass)::text                             AS registos_filenode,
    pg_relation_filenode('public.clinical_episodes'::regclass)::text                            AS episodes_filenode,
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
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.oid <> (SELECT oid FROM mp))                             AS n_other_fn,
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
    (SELECT 'clinical_episodes ' || (SELECT count(*) FROM public.clinical_episodes) || ' rows, heap '
            || pg_relation_size('public.clinical_episodes'::regclass) || ' bytes, total '
            || pg_total_relation_size('public.clinical_episodes'::regclass) || ' bytes; clinical_records '
            || (SELECT count(*) FROM public.clinical_records) || ' rows, heap '
            || pg_relation_size('public.clinical_records'::regclass) || ' bytes, total '
            || pg_total_relation_size('public.clinical_records'::regclass) || ' bytes')         AS size_profile,
    (SELECT count(DISTINCT l.pid)::int FROM pg_locks l
      WHERE l.locktype = 'relation' AND l.relation IN (SELECT oid FROM tabs)
        AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND l.pid <> pg_backend_pid())                                                         AS other_lockers,
    (SELECT coalesce(max(extract(epoch FROM (now() - a.xact_start)))::int::text, 'none')
       FROM pg_stat_activity a
      WHERE a.pid IN (SELECT l.pid FROM pg_locks l
                       WHERE l.locktype = 'relation' AND l.relation IN (SELECT oid FROM tabs)
                         AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
                         AND l.pid <> pg_backend_pid()))                                       AS oldest_locker_seconds,
    coalesce(current_setting('idle_in_transaction_session_timeout', true), 'not readable')      AS idle_in_tx,
    to_char(now() AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')                         AS lisbon_clock
), r AS (
  SELECT 0 AS n, 'A' AS grp, '0. this transaction is READ ONLY (the server refuses writes)' AS "check",
         current_setting('transaction_read_only')                      AS observed,
         'on'                                                          AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, 'A', '1. 0105 is absent from the journal, by hash (control: the same count finds 0104 once)',
         CASE WHEN journal_state = 'read' THEN has_0105::text || '; control ' || has_0104::text ELSE 'no journal table (' || journal_state || ')' END,
         '0; control 1',
         CASE WHEN journal_state = 'read' AND has_0105 = 0 AND has_0104 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, 'A', '2. 0104 is present by hash, once, as the newest row, at its journal when',
         CASE WHEN journal_state = 'read'
              THEN has_0104::text || ' row, newest ' || CASE WHEN newest_hash = :'prev_hash' THEN 'is 0104' ELSE 'is NOT 0104' END
                   || ', when ' || coalesce(nullif(newest_when, ''), 'none')
              ELSE 'no journal table (' || journal_state || ')' END,
         '1 row, newest is 0104, when ' || :'prev_when',
         CASE WHEN journal_state = 'read' AND has_0104 = 1 AND newest_hash = :'prev_hash' AND newest_when = :'prev_when' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, 'A', 'journal_rows_before',
         CASE WHEN journal_state = 'read' THEN journal_rows::text ELSE 'no journal table (' || journal_state || ')' END, '102',
         CASE WHEN journal_state = 'read' AND journal_rows = 102 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, 'A', '4. the session is postgres and owns both tables (control: authenticated is no member of it)',
         me || '; ' || coalesce(tbl_owners, 'absent') || '; control ' || auth_in_me::text,
         'postgres; clinical_episodes postgres, clinical_records postgres; control false',
         CASE WHEN me = 'postgres' AND tbl_owners = 'clinical_episodes postgres, clinical_records postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, 'A', '5. this session reads both tables past their policies (control: authenticated does not)',
         coalesce(me_past_rls::text, 'unreadable') || '; control ' || coalesce(auth_past_rls::text, 'unreadable'),
         'true; control false',
         CASE WHEN coalesce(me_past_rls, false) AND auth_past_rls IS NOT DISTINCT FROM false THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, 'A', '6. THE ROWS FIT THE KEY: no registo names an episode of another patient or tenant, or one that is not there (control: registos that name an episode, all found by the join; the key''s own count agrees)',
         'registos ' || f.registos_total || ', naming an episode ' || f.with_episode || ', joined ' || f.joined
           || '; another patient ' || f.other_patient || ', another tenant ' || f.other_tenant || ', episode not there ' || f.episode_missing
           || '; the key would refuse ' || f.key_would_refuse || ' (the three together ' || f.any_of_three || ')',
         'naming an episode more than 0, joined equal to it; another patient 0, another tenant 0, episode not there 0; the key would refuse 0 (the three together 0). Naming an episode 0 reads VACUOUS',
         CASE WHEN f.other_patient <> 0 OR f.other_tenant <> 0 OR f.episode_missing <> 0 OR f.key_would_refuse <> 0
                OR f.any_of_three <> 0 OR f.joined <> f.with_episode OR f.with_episode > f.registos_total THEN 'FAIL'
              WHEN f.with_episode = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j, fit f
  UNION ALL SELECT 7, 'A', '7. the five key columns are uuid and NOT NULL (control: clinical_records.episode_id is uuid and NULLABLE)',
         key_columns || '; control ' || coalesce(episode_id_column, 'absent'),
         'clinical_episodes.id uuid NOT NULL, clinical_episodes.patient_id uuid NOT NULL, clinical_episodes.tenant_id uuid NOT NULL, clinical_records.patient_id uuid NOT NULL, clinical_records.tenant_id uuid NOT NULL; control uuid NULLABLE',
         CASE WHEN key_columns = 'clinical_episodes.id uuid NOT NULL, clinical_episodes.patient_id uuid NOT NULL, clinical_episodes.tenant_id uuid NOT NULL, clinical_records.patient_id uuid NOT NULL, clinical_records.tenant_id uuid NOT NULL'
               AND episode_id_column = 'uuid NULLABLE' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 8, 'A', '8. nothing 0105 creates exists yet: no relation with the index''s name, no constraint with the key''s (control: the probes find the primary key and the key of 0000)',
         new_index_taken::text || ', ' || new_key_taken::text || '; control ' || index_probe_control::text || ', ' || key_probe_control::text,
         '0, 0; control 1, 1',
         CASE WHEN new_index_taken = 0 AND new_key_taken = 0 AND index_probe_control = 1 AND key_probe_control = 1 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 9, 'A', '9. the key of 0000 is as 0000 left it: a foreign key, validated, not deferrable',
         coalesce(old_key, 'absent'),
         'f/true/false FOREIGN KEY (episode_id) REFERENCES clinical_episodes(id)',
         CASE WHEN old_key = 'f/true/false FOREIGN KEY (episode_id) REFERENCES clinical_episodes(id)' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 10, 'A', '10. clinical_records carries exactly its immutability trigger, enabled, its function''s body pinned; clinical_episodes carries none',
         registo_triggers || '; clinical_episodes ' || episode_triggers::text,
         'clinical_records_enforce_immutability type 27 enabled O enforce_clinical_record_immutability() f0691f60a12af6eeb561ce369c18f0d5; clinical_episodes 0',
         CASE WHEN registo_triggers = 'clinical_records_enforce_immutability type 27 enabled O enforce_clinical_record_immutability() f0691f60a12af6eeb561ce369c18f0d5'
               AND episode_triggers = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 11, 'A', '11. the nine indexes of the two tables are there and valid, and none is on the new index''s three columns',
         valid_indexes || '; ' || all_indexes::text || ' in all; on the three columns ' || three_column_indexes::text,
         'clinical_episodes_patient_idx,clinical_episodes_pkey,clinical_episodes_tenant_idx,clinical_records_ai_review_idx,clinical_records_episode_idx,clinical_records_patient_idx,clinical_records_pkey,clinical_records_supersedes_idx,clinical_records_tenant_idx; 9 in all; on the three columns 0',
         CASE WHEN valid_indexes = 'clinical_episodes_patient_idx,clinical_episodes_pkey,clinical_episodes_tenant_idx,clinical_records_ai_review_idx,clinical_records_episode_idx,clinical_records_patient_idx,clinical_records_pkey,clinical_records_supersedes_idx,clinical_records_tenant_idx'
               AND all_indexes = 9 AND three_column_indexes = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 12, 'A', '12. merge_patients is the function 0105 replaces: 0005''s body, SECURITY DEFINER, search_path empty, owned by postgres, EXECUTE for authenticated alone (control: a planted name)',
         coalesce(merge_shape, 'absent') || ' ; ' || coalesce(merge_execute, 'absent') || '; control ' || planted_fn_absent::text,
         '3dbbba9c644eac9c20ee123faefff8f7 DEFINER search_path="" owner postgres returns jsonb (p_source_id uuid, p_target_id uuid, p_actor_id uuid DEFAULT NULL::uuid) ; authenticated true, anon false, patient false, service_role false, PUBLIC items 0; control true',
         CASE WHEN merge_shape = '3dbbba9c644eac9c20ee123faefff8f7 DEFINER search_path="" owner postgres returns jsonb (p_source_id uuid, p_target_id uuid, p_actor_id uuid DEFAULT NULL::uuid)'
               AND merge_execute = 'authenticated true, anon false, patient false, service_role false, PUBLIC items 0'
               AND planted_fn_absent THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 13, 'A', 'secdef_functions_before', secdef::text || ', ' || secdef_not_postgres::text || ' not owned by postgres',
         '36, 0 not owned by postgres',
         CASE WHEN secdef = 36 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 14, 'A', '14. the server is Postgres 17, where every pinned definition was read (control: the number parses)',
         server_num::text, '170000 to 179999',
         CASE WHEN server_num BETWEEN 170000 AND 179999 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 15, 'A', '15. the five roles the checks name exist', roles_named::text, '5',
         CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 16, 'A', '16. merge_patients may be run by its owner and by authenticated alone, each by a grant postgres made: its ACL, item by item (control: the list is not empty)',
         merge_acl_items || '; ' || merge_acl_n::text || ' items',
         'authenticated EXECUTE by postgres, postgres EXECUTE by postgres; 2 items',
         CASE WHEN merge_acl_items = 'authenticated EXECUTE by postgres, postgres EXECUTE by postgres' AND merge_acl_n = 2 THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 17, 'A', '17. THE INDEX CAN BE BUILT AND NO ROW SLIPS PAST THE KEY: no two episodes share the three values, and no key column holds a NULL, counted from the rows (control: as many distinct ids as episodes)',
         'episodes ' || d.episodes_total || ', distinct ids ' || d.episode_ids || '; sharing the three values ' || d.duplicate_triples
           || '; episodes with a NULL among the three ' || d.episode_nulls || '; registos with a NULL patient or tenant ' || d.registo_nulls,
         'episodes more than 0, distinct ids equal to it; sharing the three values 0; episodes with a NULL among the three 0; registos with a NULL patient or tenant 0. Episodes 0 reads VACUOUS',
         CASE WHEN d.duplicate_triples <> 0 OR d.episode_nulls <> 0 OR d.registo_nulls <> 0 OR d.episode_ids <> d.episodes_total THEN 'FAIL'
              WHEN d.episodes_total = 0 THEN 'VACUOUS'
              ELSE 'OK' END FROM j, dat d
  UNION ALL SELECT 31, 'C', 'secdef_before', secdef::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 32, 'C', 'tables_before', n_tables::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 33, 'C', 'registos_rows', registos_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 34, 'C', 'registos_md5', registos_md5, '32 hex characters, over ' || registos_rows::text || ' rows',
         CASE WHEN registos_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 35, 'C', 'episodes_rows', episodes_rows::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 36, 'C', 'episodes_md5', episodes_md5, '32 hex characters, over ' || episodes_rows::text || ' rows',
         CASE WHEN episodes_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 37, 'C', 'registos_in_an_episode', f.with_episode::text, 'a count', 'CARRY' FROM fit f
  UNION ALL SELECT 38, 'C', 'registos_filenode', registos_filenode, 'a number',
         CASE WHEN registos_filenode ~ '^[0-9]+$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 39, 'C', 'episodes_filenode', episodes_filenode, 'a number',
         CASE WHEN episodes_filenode ~ '^[0-9]+$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 40, 'C', 'other_constraints_md5', other_con_md5, '32 hex characters',
         CASE WHEN other_con_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 41, 'C', 'other_indexes_md5', other_idx_md5, '32 hex characters',
         CASE WHEN other_idx_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 42, 'C', 'other_functions_md5', other_fn_md5, '32 hex characters, over ' || n_other_fn::text || ' functions in public',
         CASE WHEN other_fn_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 43, 'C', 'merge_acl_md5', coalesce(merge_acl_md5, 'absent'), '32 hex characters',
         CASE WHEN merge_acl_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 44, 'C', 'policies_before', policies::text, 'a count', 'CARRY' FROM j
  UNION ALL SELECT 45, 'C', 'policies_md5', pol_md5, '32 hex characters',
         CASE WHEN pol_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 46, 'C', 'relation_acl_md5', rel_md5, '32 hex characters',
         CASE WHEN rel_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 47, 'C', 'column_acl_md5', col_md5, '32 hex characters',
         CASE WHEN col_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 48, 'C', 'default_acl_md5', def_md5, '32 hex characters',
         CASE WHEN def_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 49, 'C', 'triggers_md5', trg_md5, '32 hex characters',
         CASE WHEN trg_md5 ~ '^[0-9a-f]{32}$' THEN 'CARRY' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 50, 'C', 'registos_the_key_would_refuse', set_config('rk0105.misfit', greatest(f.any_of_three, f.key_would_refuse)::text, true),
         '0 (any other number stops the sitting: verdict 6, this file''s own STOP, and the stage 1 block)', 'CARRY' FROM fit f
  UNION ALL SELECT 60, 'I', 'INFO the server version', server_version, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 61, 'I', 'INFO the size of the work: rows and bytes of the two tables', size_profile, 'a profile', 'INFO' FROM j
  UNION ALL SELECT 62, 'I', 'INFO of the registos that do not fit the key (verdict 6): by status',
         'draft ' || f.misfit_draft || ', locked ' || f.misfit_locked || ', signed ' || f.misfit_signed, 'a profile', 'INFO' FROM fit f
  UNION ALL SELECT 63, 'I', 'INFO other sessions holding or awaiting a lock on either table now, and the age in seconds of the oldest transaction among them',
         other_lockers::text || ' sessions, oldest ' || oldest_locker_seconds, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 64, 'I', 'INFO idle_in_transaction_session_timeout (0 is no limit)', idle_in_tx, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 65, 'I', 'INFO the clock, Lisbon time', lisbon_clock, 'a profile, never a verdict', 'INFO' FROM j
  UNION ALL SELECT 66, 'I', 'INFO C1, a count for the record: appointment_notes rows that name an episode, and those naming another patient or tenant than it',
         'naming an episode ' || c.linked || ', joined ' || c.joined || '; another patient ' || c.other_patient || ', another tenant ' || c.other_tenant,
         'a count, never a verdict: 0105 does not touch this table', 'INFO' FROM c1 c
  UNION ALL SELECT 67, 'I', 'INFO C2, a count for the record: attachments rows that name a registo, and those naming another patient or tenant than it',
         'naming a registo ' || c.linked || ', joined ' || c.joined || ', of those naming no patient ' || c.no_patient
           || '; another patient ' || c.other_patient || ', another tenant ' || c.other_tenant,
         'a count, never a verdict: 0105 does not touch this table', 'INFO' FROM c2 c
  UNION ALL SELECT 68, 'I', 'INFO C3, a count for the record: registos that supersede another, and those naming another patient or tenant than it',
         'superseding ' || c.linked || ', joined ' || c.joined || '; another patient ' || c.other_patient || ', another tenant ' || c.other_tenant,
         'a count, never a verdict: 0105 adds no key on this column', 'INFO' FROM c3 c
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         set_config('rk0105.profile',
         (SELECT count(*) FROM r WHERE grp = 'A' AND verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE grp = 'A' AND verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE grp IN ('A', 'C') AND verdict = 'FAIL')::text || ' FAIL', true),
         '18 OK / 0 VACUOUS / 0 FAIL, and nothing else: a VACUOUS (6: no registo names an episode; 17: the table holds no episode) or a FAIL ends this file with an error', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

-- A REGISTO THE KEY WOULD REFUSE IS AN ERROR WITH ITS OWN SENTENCE. The CARRY row
-- stored the count it printed (set_config, transaction-local, allowed in a READ
-- ONLY transaction). Any value but 0 raises, and psql exits 3.
SELECT coalesce(current_setting('rk0105.misfit', true), '') = '0' AS rk0105_none_misfit \gset
\if :rk0105_none_misfit
\else
  DO $misfit$ BEGIN
    RAISE EXCEPTION 'STOP: the 0105 pre-check counted [%] registos that name an episode of another patient or tenant, or an episode that is not there, and the sitting stops on any number but 0. The migration would fail on them at its VALIDATE statement with nothing applied, and it repairs no row: a repair is its own ruled operation. This file wrote nothing, and the block that ran it applies nothing after this STOP. The number goes to SOLO.', coalesce(nullif(current_setting('rk0105.misfit', true), ''), 'no count');
  END $misfit$;
\endif

-- ANY OTHER PROFILE IS AN ERROR. The SUMMARY row stored the profile it printed.
-- Anything but exactly "18 OK / 0 VACUOUS / 0 FAIL" raises, and psql exits 3.
SELECT coalesce(current_setting('rk0105.profile', true), '') = '18 OK / 0 VACUOUS / 0 FAIL' AS rk0105_profile_ok \gset
\if :rk0105_profile_ok
\else
  DO $fail$ BEGIN
    RAISE EXCEPTION 'STOP: the 0105 pre-check printed a FAIL or a VACUOUS verdict, or its profile could not be read back [%]; it must read 18 OK / 0 VACUOUS / 0 FAIL. Read the rows above.', coalesce(current_setting('rk0105.profile', true), 'no profile');
  END $fail$;
\endif

ROLLBACK;
