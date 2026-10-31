-- 0109 CHECK PROBE: the server refuses a half pair and a backwards pair on
-- public.locations, by locations_saturday_hours_valid, and admits the owner's
-- 09:00 to 13:00. EVERY ATTEMPT IS UNDONE, AND THE BLOCK ROLLS THE WHOLE
-- TRANSACTION BACK.
--
-- WHY THIS FILE WRITES, AND WHY NOTHING IT WRITES CAN STAY. The post-check
-- (READ ONLY) proves the CHECK's definition and evaluates its stored expression
-- on literal pairs; neither shows that the server ENFORCES it on the table. Only
-- an attempted write shows that, and a READ ONLY transaction refuses the UPDATE
-- (25006) before the CHECK is ever evaluated. So this file runs in a READ WRITE
-- transaction that its block opens with `begin` and closes with `rollback`:
--   * it holds NO transaction control of its own (no COMMIT, no END, no
--     ROLLBACK, no SAVEPOINT statement);
--   * every attempt is one UPDATE of the two new columns on ONE row (the
--     lowest id), inside its own plpgsql exception block, which is a
--     savepoint: a refused attempt leaves nothing, and an ADMITTED one is
--     undone at once by a RAISE with this file's own SQLSTATE (S0109), caught
--     by the same block, before the next attempt starts;
--   * any other error (a lock it could not take in 5 seconds, a row level
--     security refusal, anything) is not caught: psql stops (ON_ERROR_STOP),
--     its connection ends, and the server rolls the open transaction back;
--   * verdict 7, last, counts in this same transaction that every row is still
--     NULL in both columns, and the block reads it once more, READ ONLY, in a
--     new transaction after the rollback.
-- What it does take: ROW EXCLUSIVE on public.locations (which waits behind no
-- reader and no writer, only behind a SHARE lock or stronger), and, for the one
-- admitted attempt, the probed row's lock until its savepoint unwinds, a matter
-- of microseconds. The migrations give locations no trigger of its own; the
-- foreign-key triggers Postgres keeps on it check key columns only, and these
-- two columns are no key (the pre-check's shape carry names every trigger).
--
-- EIGHT VERDICTS. Seven are OK or FAIL; verdict 1 (a row to probe) is OK,
-- VACUOUS or FAIL, and reads VACUOUS exactly when locations has no row. The
-- SUMMARY row prints the profile; the block requires 8 OK / 0 VACUOUS / 0 FAIL.
--   0      the session is postgres (control: authenticated is no member of it);
--   1      there is a row to probe;
--   2      saturday_opens_at 09:00 with no closing time: refused, by
--          locations_saturday_hours_valid;
--   3      saturday_closes_at 13:00 with no opening time: refused, by it;
--   4      13:00 to 09:00, backwards: refused, by it;
--   5      09:00 to 09:00, closing at opening: refused, by it;
--   6      09:00 to 13:00, the owner's pair: admitted, exactly one row, and
--          undone at its savepoint;
--   7      after the five attempts, in this transaction: every row NULL in both
--          columns, and as many rows as before the attempts.
--
-- Run (the apply document's stage 2 runs exactly this, after the post-check):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1
--        -c "begin" -f scripts/db/probe-0109-location-saturday-hours.sql -c "rollback"

\pset pager off
\timing off
\set ON_ERROR_STOP on

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- A session that row level security binds ERRORs here instead of updating no
-- row, which would read as "admitted" on a missing CHECK and as nothing at all
-- on a present one.
SET LOCAL row_security = off;
SET LOCAL search_path = public;

DO $probe$
DECLARE
  v_id      uuid;
  v_before  integer;
  v_after   integer;
  v_set     integer;
  v_n       integer;
  v_con     text;
  v_msg     text;
  v_out     text := '';
  v_pair    record;
BEGIN
  SELECT l.id INTO v_id FROM public.locations l ORDER BY l.id LIMIT 1;
  SELECT count(*)::int INTO v_before FROM public.locations;
  IF v_id IS NULL THEN
    PERFORM set_config('sathours.probe', 'no row', true);
    RETURN;
  END IF;
  FOR v_pair IN
    SELECT k, o, c
      FROM (VALUES (2, time '09:00', NULL::time), (3, NULL::time, time '13:00'), (4, time '13:00', time '09:00'),
                   (5, time '09:00', time '09:00'), (6, time '09:00', time '13:00')) AS v(k, o, c)
     ORDER BY k
  LOOP
    BEGIN
      UPDATE public.locations
         SET saturday_opens_at = v_pair.o,
             saturday_closes_at = v_pair.c
       WHERE id = v_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE EXCEPTION USING ERRCODE = 'S0109', MESSAGE = v_n::text;
    EXCEPTION
      WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
        PERFORM set_config('sathours.probe_' || v_pair.k::text, 'refused by ' || coalesce(nullif(v_con, ''), 'no constraint name'), true);
      WHEN SQLSTATE 'S0109' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM set_config('sathours.probe_' || v_pair.k::text, 'admitted, ' || v_msg || ' row, undone', true);
    END;
  END LOOP;
  SELECT count(*)::int,
         (count(*) FILTER (WHERE saturday_opens_at IS NOT NULL OR saturday_closes_at IS NOT NULL))::int
    INTO v_after, v_set
    FROM public.locations;
  PERFORM set_config('sathours.probe', 'ran', true);
  PERFORM set_config('sathours.probe_rows', v_set::text || ' set of ' || v_after::text || ' rows; ' || v_before::text || ' before', true);
  PERFORM set_config('sathours.probe_rows_ok', CASE WHEN v_set = 0 AND v_after = v_before AND v_after > 0 THEN 'yes' ELSE 'no' END, true);
END
$probe$;

\echo ''
\echo '=== 0109 CHECK PROBE: 8 verdicts, every attempt undone, the block rolls back; the SUMMARY row prints the profile ==='

WITH j AS (
  SELECT
    coalesce(current_setting('sathours.probe', true), 'not run')                                AS probe_state,
    coalesce(current_setting('sathours.probe_2', true), 'not tried')                             AS p2,
    coalesce(current_setting('sathours.probe_3', true), 'not tried')                             AS p3,
    coalesce(current_setting('sathours.probe_4', true), 'not tried')                             AS p4,
    coalesce(current_setting('sathours.probe_5', true), 'not tried')                             AS p5,
    coalesce(current_setting('sathours.probe_6', true), 'not tried')                             AS p6,
    coalesce(current_setting('sathours.probe_rows', true), 'not counted')                        AS rows_after,
    coalesce(current_setting('sathours.probe_rows_ok', true), 'no')                              AS rows_ok,
    current_user::text                                                                          AS me,
    pg_has_role('authenticated', current_user, 'MEMBER')                                        AS auth_in_me
), r AS (
  SELECT 0 AS n, '0. the session is postgres (control: authenticated is no member of it)' AS "check",
         me || '; control ' || auth_in_me::text                        AS observed,
         'postgres; control false'                                     AS expected,
         CASE WHEN me = 'postgres' AND NOT auth_in_me THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
  UNION ALL SELECT 1, '1. there is a row of locations to probe',
         probe_state, 'ran; VACUOUS when there is no row',
         CASE WHEN probe_state = 'no row' THEN 'VACUOUS' WHEN probe_state = 'ran' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 2, '2. 09:00 with no closing time is refused by the CHECK',
         p2, 'refused by locations_saturday_hours_valid',
         CASE WHEN p2 = 'refused by locations_saturday_hours_valid' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 3, '3. 13:00 with no opening time is refused by the CHECK',
         p3, 'refused by locations_saturday_hours_valid',
         CASE WHEN p3 = 'refused by locations_saturday_hours_valid' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 4, '4. 13:00 to 09:00, backwards, is refused by the CHECK',
         p4, 'refused by locations_saturday_hours_valid',
         CASE WHEN p4 = 'refused by locations_saturday_hours_valid' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 5, '5. 09:00 to 09:00, closing at opening, is refused by the CHECK',
         p5, 'refused by locations_saturday_hours_valid',
         CASE WHEN p5 = 'refused by locations_saturday_hours_valid' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 6, '6. 09:00 to 13:00, the owner''s pair, is admitted on one row and undone at its savepoint',
         p6, 'admitted, 1 row, undone',
         CASE WHEN p6 = 'admitted, 1 row, undone' THEN 'OK' ELSE 'FAIL' END FROM j
  UNION ALL SELECT 7, '7. after the attempts, in this transaction, every row is NULL in both columns and none came or went',
         rows_after, '0 set of n rows; n before, n at least 1',
         CASE WHEN rows_ok = 'yes' THEN 'OK' ELSE 'FAIL' END FROM j
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')::text      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS')::text || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')::text    || ' FAIL',
         '8 OK / 0 VACUOUS / 0 FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;
