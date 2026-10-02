-- 0099 BEHAVIOUR CHECK: the app roles still read and write what they did.
-- READ ONLY, REPEATABLE READ. Run TWICE in a sitting: with -v phase=before in
-- stage 1, after the pre-check and before the apply, and with -v phase=after in
-- stage 3, where the block passes the BEFORE run's two outcome md5s back in.
--
-- WHAT IT MEASURES, AND WHY THIS WAY. 0099 changes GRANTS, not policies, so no
-- staff actor is needed and none is chosen: a privilege belongs to the ROLE, and
-- the app spends its life as two roles, `authenticated` (withTenantContext,
-- packages/db/src/client.ts:152) and `patient` (withPatientContext, :196). For
-- each of them, on every ordinary and partitioned table in `public`, it asks the
-- EXECUTOR, not the catalogue, whether SELECT, INSERT, UPDATE and DELETE would be
-- allowed: it runs EXPLAIN of each statement as that role. EXPLAIN without
-- ANALYZE plans and never executes, and in a READ ONLY transaction it still runs
-- the executor's own permission check (ExecCheckPermissions, called from
-- InitPlan for EXPLAIN too), so a missing privilege refuses with 42501 exactly
-- as the real statement would, and a held one plans. Nothing is written: the
-- transaction is READ ONLY, and EXPLAIN without ANALYZE runs no row.
--   SELECT  EXPLAIN SELECT FROM <t>
--   INSERT  EXPLAIN INSERT INTO <t> DEFAULT VALUES
--   UPDATE  EXPLAIN UPDATE <t> SET <first column> = DEFAULT WHERE false
--   DELETE  EXPLAIN DELETE FROM <t> WHERE false
-- The catalogue's answer for each pair is what the executor checks for that
-- exact statement: has_any_column_privilege for SELECT and INSERT (neither
-- names a column), has_column_privilege on the named column for UPDATE, and
-- has_table_privilege for DELETE. The claims are '{}' (no tenant, no role), so a
-- policy expression plans without a session behind it.
--
-- TRUNCATE, TRIGGER AND REFERENCES CANNOT BE ASKED THIS WAY, and it says so:
-- TRUNCATE is refused by a READ ONLY transaction before its privilege is read
-- (25006 comes first), and TRIGGER and REFERENCES are DDL. Arm 6 reads them from
-- the catalogue, and the refusal in action is the rehearsal's, never production's.
--
-- ARMS (verdicts OK, VACUOUS, FAIL; a SUMMARY row 99):
--   0  the transaction is READ ONLY and REPEATABLE READ;
--   1  as `authenticated`: every pair the catalogue grants PLANS. FAIL on any
--      granted pair refused or erroring, or on no granted pair at all;
--   2  as `authenticated`: every pair the catalogue does not grant is REFUSED
--      with 42501 (the instrument can say no). VACUOUS when no such pair exists;
--   3  as `patient`: arm 1's rule;
--   4  as `patient`: arm 2's rule;
--   5  phase=after only: both roles' outcome md5s (table, verb, outcome, in one
--      order) equal the BEFORE run's, passed in as -v before_auth_md5 and
--      -v before_patient_md5: no pair changed its answer. phase=before: VACUOUS
--      (there is no earlier run to compare with);
--   6  the catalogue for the three privileges 0099 revokes, `authenticated` on
--      the same tables, with the owner as the control (holding all three on
--      every table): phase=before wants TRUNCATE, TRIGGER and REFERENCES each
--      held on at least one table (the premise); phase=after wants each on none.
-- PROFILE rows (not verdicts): authenticated_exec_md5, patient_exec_md5, and the
-- pair counts, which stage 3 reads back from stage 1's transcript.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v phase=before
--        -f scripts/db/behaviour-0099-grants-readonly.sql
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v phase=after
--        -v before_auth_md5=<md5> -v before_patient_md5=<md5>
--        -f scripts/db/behaviour-0099-grants-readonly.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?phase}
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v phase is missing (before or after). This file refuses to guess.'; END $missing$;
\endif
SELECT (:'phase' IN ('before', 'after')) AS phase_ok \gset
\if :phase_ok
\else
  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v phase must be before or after.'; END $missing$;
\endif
SELECT (:'phase' = 'after') AS is_after \gset
\if :is_after
  \if :{?before_auth_md5}
  \else
    DO $missing$ BEGIN RAISE EXCEPTION 'STOP: phase=after needs -v before_auth_md5 from the BEFORE run. This file refuses to guess.'; END $missing$;
  \endif
  \if :{?before_patient_md5}
  \else
    DO $missing$ BEGIN RAISE EXCEPTION 'STOP: phase=after needs -v before_patient_md5 from the BEFORE run. This file refuses to guess.'; END $missing$;
  \endif
\else
  \set before_auth_md5 none
  \set before_patient_md5 none
\endif

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', '{}', true) AS claims_set \gset

\echo ''
\echo '=== 0099 BEHAVIOUR CHECK (' :phase '): what authenticated and patient may SELECT, INSERT, UPDATE and DELETE, asked of the executor ==='

DO $behaviour$
DECLARE
  r_name  text;
  t       record;
  v       text;
  stmt    text;
  granted boolean;
  outcome text;
  lines   text[];
  n_g_ok int; n_g_refused int; n_g_other int;
  n_d_refused int; n_d_ok int; n_d_other int;
BEGIN
  FOREACH r_name IN ARRAY ARRAY['authenticated', 'patient'] LOOP
    lines := ARRAY[]::text[];
    n_g_ok := 0; n_g_refused := 0; n_g_other := 0;
    n_d_refused := 0; n_d_ok := 0; n_d_other := 0;
    FOR t IN
      SELECT c.oid, c.oid::regclass::text AS rel,
             (SELECT a.attname FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
               ORDER BY a.attnum LIMIT 1) AS col
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY c.oid::regclass::text
    LOOP
      FOREACH v IN ARRAY ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE'] LOOP
        IF v = 'UPDATE' AND t.col IS NULL THEN
          CONTINUE;
        END IF;
        IF v = 'SELECT' THEN
          stmt := format('EXPLAIN (COSTS OFF) SELECT FROM %s', t.rel);
          granted := has_any_column_privilege(r_name, t.oid, 'SELECT');
        ELSIF v = 'INSERT' THEN
          stmt := format('EXPLAIN (COSTS OFF) INSERT INTO %s DEFAULT VALUES', t.rel);
          granted := has_any_column_privilege(r_name, t.oid, 'INSERT');
        ELSIF v = 'UPDATE' THEN
          stmt := format('EXPLAIN (COSTS OFF) UPDATE %s SET %I = DEFAULT WHERE false', t.rel, t.col);
          granted := has_column_privilege(r_name, t.oid, t.col, 'UPDATE');
        ELSE
          stmt := format('EXPLAIN (COSTS OFF) DELETE FROM %s WHERE false', t.rel);
          granted := has_table_privilege(r_name, t.oid, 'DELETE');
        END IF;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', r_name);
          EXECUTE stmt;
          outcome := 'plans';
          EXECUTE 'RESET ROLE';
        EXCEPTION
          WHEN insufficient_privilege THEN outcome := 'refused';
          WHEN OTHERS THEN outcome := 'error ' || SQLSTATE;
        END;
        IF granted AND outcome = 'plans' THEN n_g_ok := n_g_ok + 1;
        ELSIF granted AND outcome = 'refused' THEN n_g_refused := n_g_refused + 1;
        ELSIF granted THEN n_g_other := n_g_other + 1;
        ELSIF outcome = 'refused' THEN n_d_refused := n_d_refused + 1;
        ELSIF outcome = 'plans' THEN n_d_ok := n_d_ok + 1;
        ELSE n_d_other := n_d_other + 1;
        END IF;
        lines := lines || (t.rel || ':' || v || ':' || outcome);
      END LOOP;
    END LOOP;
    PERFORM set_config('b0099.' || r_name || '_md5', md5(array_to_string(lines, ';')), true);
    PERFORM set_config('b0099.' || r_name || '_pairs', array_length(lines, 1)::text, true);
    PERFORM set_config('b0099.' || r_name || '_g', n_g_ok || ' ' || n_g_refused || ' ' || n_g_other, true);
    PERFORM set_config('b0099.' || r_name || '_d', n_d_refused || ' ' || n_d_ok || ' ' || n_d_other, true);
  END LOOP;
END
$behaviour$;

WITH s AS (
  SELECT
    split_part(current_setting('b0099.authenticated_g'), ' ', 1)::int AS a_g_ok,
    split_part(current_setting('b0099.authenticated_g'), ' ', 2)::int AS a_g_refused,
    split_part(current_setting('b0099.authenticated_g'), ' ', 3)::int AS a_g_other,
    split_part(current_setting('b0099.authenticated_d'), ' ', 1)::int AS a_d_refused,
    split_part(current_setting('b0099.authenticated_d'), ' ', 2)::int AS a_d_ok,
    split_part(current_setting('b0099.authenticated_d'), ' ', 3)::int AS a_d_other,
    split_part(current_setting('b0099.patient_g'), ' ', 1)::int AS p_g_ok,
    split_part(current_setting('b0099.patient_g'), ' ', 2)::int AS p_g_refused,
    split_part(current_setting('b0099.patient_g'), ' ', 3)::int AS p_g_other,
    split_part(current_setting('b0099.patient_d'), ' ', 1)::int AS p_d_refused,
    split_part(current_setting('b0099.patient_d'), ' ', 2)::int AS p_d_ok,
    split_part(current_setting('b0099.patient_d'), ' ', 3)::int AS p_d_other,
    current_setting('b0099.authenticated_md5') AS a_md5,
    current_setting('b0099.patient_md5')       AS p_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                  AS n_tables,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND has_table_privilege('authenticated', c.oid, 'TRUNCATE'))   AS a_truncate,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND has_table_privilege('authenticated', c.oid, 'TRIGGER'))    AS a_trigger,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND has_table_privilege('authenticated', c.oid, 'REFERENCES')) AS a_references,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND has_table_privilege(c.relowner, c.oid, 'TRUNCATE') AND has_table_privilege(c.relowner, c.oid, 'TRIGGER')
        AND has_table_privilege(c.relowner, c.oid, 'REFERENCES'))                               AS own_all
), r AS (
  SELECT 0 AS arm, 'the transaction is READ ONLY and REPEATABLE READ' AS "check",
         current_setting('transaction_read_only') || ', ' || current_setting('transaction_isolation') AS observed,
         'on, repeatable read' AS expected,
         CASE WHEN current_setting('transaction_read_only') = 'on'
               AND current_setting('transaction_isolation') = 'repeatable read' THEN 'OK' ELSE 'FAIL' END AS verdict
    FROM s
  UNION ALL
  SELECT 1, 'authenticated: every pair the catalogue grants plans (granted: plans, refused, other)',
         a_g_ok::text || ', ' || a_g_refused::text || ', ' || a_g_other::text, 'more than 0, 0, 0',
         CASE WHEN a_g_ok > 0 AND a_g_refused = 0 AND a_g_other = 0 THEN 'OK' ELSE 'FAIL' END FROM s
  UNION ALL
  SELECT 2, 'authenticated: every pair the catalogue does not grant is refused 42501 (refused, plans, other)',
         a_d_refused::text || ', ' || a_d_ok::text || ', ' || a_d_other::text, 'n, 0, 0',
         CASE WHEN a_d_ok > 0 OR a_d_other > 0 THEN 'FAIL' WHEN a_d_refused = 0 THEN 'VACUOUS' ELSE 'OK' END FROM s
  UNION ALL
  SELECT 3, 'patient: every pair the catalogue grants plans (granted: plans, refused, other)',
         p_g_ok::text || ', ' || p_g_refused::text || ', ' || p_g_other::text, 'more than 0, 0, 0',
         CASE WHEN p_g_ok > 0 AND p_g_refused = 0 AND p_g_other = 0 THEN 'OK' ELSE 'FAIL' END FROM s
  UNION ALL
  SELECT 4, 'patient: every pair the catalogue does not grant is refused 42501 (refused, plans, other)',
         p_d_refused::text || ', ' || p_d_ok::text || ', ' || p_d_other::text, 'n, 0, 0',
         CASE WHEN p_d_ok > 0 OR p_d_other > 0 THEN 'FAIL' WHEN p_d_refused = 0 THEN 'VACUOUS' ELSE 'OK' END FROM s
  UNION ALL
  SELECT 5, 'no pair changed its answer since the BEFORE run (both roles, by md5)',
         CASE WHEN :'phase' = 'before' THEN 'this is the BEFORE run'
              ELSE CASE WHEN a_md5 = :'before_auth_md5' THEN 'authenticated same' ELSE 'authenticated CHANGED' END
                || ', ' || CASE WHEN p_md5 = :'before_patient_md5' THEN 'patient same' ELSE 'patient CHANGED' END END,
         CASE WHEN :'phase' = 'before' THEN 'nothing to compare' ELSE 'authenticated same, patient same' END,
         CASE WHEN :'phase' = 'before' THEN 'VACUOUS'
              WHEN a_md5 = :'before_auth_md5' AND p_md5 = :'before_patient_md5' THEN 'OK' ELSE 'FAIL' END FROM s
  UNION ALL
  SELECT 6, 'authenticated holds TRUNCATE, TRIGGER, REFERENCES on (tables); control: the owner holds all three on every one',
         a_truncate::text || ', ' || a_trigger::text || ', ' || a_references::text || ' of ' || n_tables::text
           || '; control ' || own_all::text || ' of ' || n_tables::text,
         CASE WHEN :'phase' = 'before' THEN 'each more than 0; control all' ELSE '0, 0, 0; control all' END,
         CASE WHEN n_tables = 0 OR own_all <> n_tables THEN 'FAIL'
              WHEN :'phase' = 'before' AND a_truncate > 0 AND a_trigger > 0 AND a_references > 0 THEN 'OK'
              WHEN :'phase' = 'after' AND a_truncate = 0 AND a_trigger = 0 AND a_references = 0 THEN 'OK'
              ELSE 'FAIL' END FROM s
)
SELECT arm, "check", observed, expected, verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY',
       (SELECT count(*) FILTER (WHERE verdict = 'OK') || ' OK / ' || count(*) FILTER (WHERE verdict = 'VACUOUS')
               || ' VACUOUS / ' || count(*) FILTER (WHERE verdict = 'FAIL') || ' FAIL' FROM r),
       '', 'SUMMARY'
ORDER BY 1;

\echo ''
\echo '=== PROFILE (not verdicts): the outcome md5 of each role, which stage 3 compares ==='
SELECT 'authenticated_exec_md5' AS profile, current_setting('b0099.authenticated_md5') AS value
UNION ALL SELECT 'patient_exec_md5', current_setting('b0099.patient_md5')
UNION ALL SELECT 'pairs_per_role', current_setting('b0099.authenticated_pairs') || ' and ' || current_setting('b0099.patient_pairs');

ROLLBACK;
