-- ============================================================================
-- 0098 MIGRATION STAGING INDEX: POST-CHECK. READ ONLY. Read the profile row
-- last: 13 OK / 0 VACUOUS / 0 FAIL on a ledger that holds a row with a
-- target, 12 OK / 1 VACUOUS / 0 FAIL on one that holds none. Any FAIL is a
-- STOP.
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0098_migration_staging_imported_entity_idx: ONE btree index,
-- migration_staging_imported_entity_idx, on public.migration_staging_rows
-- (imported_entity_id, entity_type) WHERE imported_entity_id IS NOT NULL, with
-- a COMMENT, and nothing else. Every verdict is a catalogue read, except the
-- ledger profile (12), which is a count. What the index DOES to a plan is the
-- rehearsal's to prove (docs/migration-apply-0098.md), because a plan on
-- production depends on production's statistics and this file pins only what
-- the migration itself fixes.
--
-- THE THREE CARRIES COME FROM THE PRE-CHECK OF THE SAME SITTING (SR-59):
-- journal_rows_before, staging_indexes_before and staging_indexes_md5.
--
-- EXACT, NOT "LOOKS LIKE". The definition is compared whole, as Postgres 17
-- renders it with pg_get_indexdef; the key columns are read from indkey in
-- order; the predicate is compared as pg_get_expr renders it; the comment is
-- compared by md5 to the text in the migration file. Every expected value
-- below was read on the rehearsal database after the apply.
--
-- VERDICTS ARE OK, VACUOUS OR FAIL, and the last row prints the profile.
-- Only the ledger profile (12) can read VACUOUS: the index then holds no
-- entry, which is correct and proves nothing about a probe.
--
-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION. The apply stage wraps it in
-- `-c "begin read only" ... -c "rollback"`, so the server refuses any write,
-- and verdict 0 proves that wrapping happened.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<pre> -v staging_indexes_before=<pre>
--        -v staging_indexes_md5=<pre>
--        -c "begin read only" -f scripts/db/postcheck-0098-staging-imported-entity-idx.sql -c "rollback"
-- ============================================================================

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?staging_indexes_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v staging_indexes_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?staging_indexes_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v staging_indexes_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0098 STAGING INDEX POST-CHECK - read the profile row last (13 OK, or 12 OK and 1 VACUOUS on an empty ledger) ==='

WITH t AS (
  SELECT to_regclass('public.migration_staging_rows') AS tbl
), ix AS (
  SELECT c.oid, c.relname, i.*
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = (SELECT tbl FROM t)
), new_ix AS (
  SELECT * FROM ix WHERE relname = 'migration_staging_imported_entity_idx'
), j AS (
  SELECT
    (SELECT tbl FROM t)                                                              AS tbl,
    /* Every relation of the name in public, and what it is and where it hangs. */
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'migration_staging_imported_entity_idx') AS named,
    (SELECT c.relkind::text || ' on ' || coalesce(tn.nspname || '.' || tc.relname, 'nothing')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_index i ON i.indexrelid = c.oid
       LEFT JOIN pg_class tc ON tc.oid = i.indrelid
       LEFT JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'migration_staging_imported_entity_idx') AS named_as,
    (SELECT am.amname || ', unique ' || x.indisunique::text || ', primary ' || x.indisprimary::text
            || ', exclusion ' || x.indisexclusion::text
       FROM new_ix x JOIN pg_class c ON c.oid = x.indexrelid JOIN pg_am am ON am.oid = c.relam) AS kind,
    (SELECT 'valid ' || indisvalid::text || ', ready ' || indisready::text || ', live ' || indislive::text
       FROM new_ix)                                                                  AS state,
    /* The key columns in index order, by name, and the column counts: no     */
    /* INCLUDE column (indnatts = indnkeyatts) and no expression (indexprs).  */
    (SELECT string_agg(coalesce(a.attname, 'expression'), ', ' ORDER BY k.ord)
            || '; ' || x.indnkeyatts::text || ' key, ' || x.indnatts::text || ' total, '
            || CASE WHEN x.indexprs IS NULL THEN 'no expression' ELSE 'an expression' END
       FROM new_ix x
       CROSS JOIN LATERAL unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
       LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
      GROUP BY x.indnkeyatts, x.indnatts, x.indexprs)                                AS key_shape,
    (SELECT coalesce(pg_get_expr(indpred, indrelid), 'none') FROM new_ix)             AS predicate,
    (SELECT pg_get_indexdef(indexrelid) FROM new_ix)                                 AS def,
    (SELECT md5(obj_description(indexrelid, 'pg_class')) FROM new_ix)                AS comment_md5,
    (SELECT count(*)::int FROM ix
      WHERE (SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = (SELECT tbl FROM t) AND a.attname = 'imported_entity_id'
                AND NOT a.attisdropped) = ANY (ix.indkey::int2[]))                   AS target_keyed,
    (SELECT count(*)::int FROM ix)                                                   AS indexes_now,
    (SELECT md5(string_agg(relname || ':' || pg_get_indexdef(indexrelid) || ':' || indisvalid::text
                           || ':' || indisready::text || ':' || indislive::text, ';' ORDER BY relname))
       FROM ix WHERE relname <> 'migration_staging_imported_entity_idx')             AS others_md5_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                          AS journal_rows_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0')  AS has_0098
), p AS (
  /* The ledger profile: a count, and no value of any row. */
  SELECT (SELECT count(*)::int FROM public.migration_staging_rows
           WHERE imported_entity_id IS NOT NULL)                                      AS with_target
), r AS (
  SELECT v.* FROM j CROSS JOIN p CROSS JOIN LATERAL (VALUES
  (0, '0. this transaction is READ ONLY (the server refuses writes)',
      current_setting('transaction_read_only'), 'on',
      CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END),
  (1, '1. exactly one relation in public has the index''s name, and it is an index on the ledger',
      j.named::text || ', ' || coalesce(j.named_as, 'absent'), '1, i on public.migration_staging_rows',
      CASE WHEN j.named = 1 AND j.named_as = 'i on public.migration_staging_rows' THEN 'OK' ELSE 'FAIL' END),
  (2, '2. it is a btree, and not unique, primary or an exclusion constraint',
      coalesce(j.kind, 'absent'), 'btree, unique false, primary false, exclusion false',
      CASE WHEN j.kind = 'btree, unique false, primary false, exclusion false' THEN 'OK' ELSE 'FAIL' END),
  (3, '3. it is VALID, READY and LIVE (pg_index.indisvalid, indisready, indislive)',
      coalesce(j.state, 'absent'), 'valid true, ready true, live true',
      CASE WHEN j.state = 'valid true, ready true, live true' THEN 'OK' ELSE 'FAIL' END),
  (4, '4. its key is exactly (imported_entity_id, entity_type), in that order, with no INCLUDE and no expression',
      coalesce(j.key_shape, 'absent'), 'imported_entity_id, entity_type; 2 key, 2 total, no expression',
      CASE WHEN j.key_shape = 'imported_entity_id, entity_type; 2 key, 2 total, no expression' THEN 'OK' ELSE 'FAIL' END),
  (5, '5. its predicate is exactly imported_entity_id IS NOT NULL',
      coalesce(j.predicate, 'absent'), '(imported_entity_id IS NOT NULL)',
      CASE WHEN j.predicate = '(imported_entity_id IS NOT NULL)' THEN 'OK' ELSE 'FAIL' END),
  (6, '6. its whole definition, as Postgres renders it',
      coalesce(j.def, 'absent'),
      'CREATE INDEX migration_staging_imported_entity_idx ON public.migration_staging_rows USING btree (imported_entity_id, entity_type) WHERE (imported_entity_id IS NOT NULL)',
      CASE WHEN j.def = 'CREATE INDEX migration_staging_imported_entity_idx ON public.migration_staging_rows USING btree (imported_entity_id, entity_type) WHERE (imported_entity_id IS NOT NULL)'
           THEN 'OK' ELSE 'FAIL' END),
  (7, '7. its COMMENT is the migration file''s text, by md5',
      coalesce(j.comment_md5, 'absent'), '5212f3ec29a6efafa4f3ea0ab388d5b4',
      CASE WHEN j.comment_md5 = '5212f3ec29a6efafa4f3ea0ab388d5b4' THEN 'OK' ELSE 'FAIL' END),
  (8, '8. it is the only index on the table that keys imported_entity_id',
      j.target_keyed::text, '1',
      CASE WHEN j.target_keyed = 1 THEN 'OK' ELSE 'FAIL' END),
  (9, '9. the table carries exactly one index more than before',
      j.indexes_now::text, (:'staging_indexes_before'::int + 1)::text,
      CASE WHEN j.indexes_now = :'staging_indexes_before'::int + 1 THEN 'OK' ELSE 'FAIL' END),
  (10, '10. every OTHER index on the table is byte-identical (one md5 over name, definition and state)',
      coalesce(j.others_md5_now, 'absent'), :'staging_indexes_md5',
      CASE WHEN j.others_md5_now = :'staging_indexes_md5' THEN 'OK' ELSE 'FAIL' END),
  (11, '11. 0098 is in the journal by hash, and the journal moved by exactly one',
      j.has_0098::text || ' by hash, journal ' || j.journal_rows_now::text,
      '1 by hash, journal ' || (:'journal_rows_before'::int + 1)::text,
      CASE WHEN j.has_0098 = 1 AND j.journal_rows_now = :'journal_rows_before'::int + 1 THEN 'OK' ELSE 'FAIL' END),
  (12, '12. PROFILE: ledger rows the index holds (imported_entity_id set)',
      p.with_target::text, '> 0 is OK; 0 is VACUOUS',
      CASE WHEN p.with_target > 0 THEN 'OK' ELSE 'VACUOUS' END)
  ) AS v(n, "check", observed, expected, verdict)
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')    || ' FAIL',
         '13 OK, or 12 OK and 1 VACUOUS; never a FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

\echo ''
\echo '=== FOR THE RECORD: the indexes on migration_staging_rows as the catalogue now describes them ==='

SELECT c.relname AS index, i.indisvalid AS valid, i.indisready AS ready, pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = to_regclass('public.migration_staging_rows')
 ORDER BY 1;
