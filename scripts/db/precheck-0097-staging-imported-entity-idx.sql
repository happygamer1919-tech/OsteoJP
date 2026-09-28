-- 0097 MIGRATION STAGING INDEX: PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- For docs/migration-apply-0097.md, which pins this file's sha256. The
-- migration is packages/db/migrations-pending/
-- NEXT-AFTER-0096_migration_staging_imported_entity_idx.sql until it is
-- promoted to 0097 by a rename; it is HELD, and it is applied only after
-- 0094, 0095 and 0096.
--
-- THE SHAPE is 0093's and 0094's: check | observed | expected | verdict,
-- verdict LAST so a stage can match it anchored to the end of the line. The
-- three carries are rows whose `check` column IS the carry's name, and no
-- carry name is a substring of another's or of any other row's `check`.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the last row prints the profile,
--     N OK / M VACUOUS / K FAIL      (verdict SUMMARY)
-- The caller asserts the PROFILE, never "no VACUOUS". Only the ledger profile
-- (10) can read VACUOUS: 14 OK / 0 VACUOUS / 0 FAIL on a ledger that holds a
-- row with a target, 13 OK / 1 VACUOUS / 0 FAIL on one that holds none. Any
-- FAIL stops the sitting before the apply.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET OK. The ledger profile (10)
-- names the table, so without it psql halts on "relation does not exist"
-- (exit 3 under ON_ERROR_STOP) before any verdict prints. The catalogue rows
-- look the table up with to_regclass and FAIL on its NULL as well, so no row
-- can count zero matches of nothing and call that absent.
--
-- 0097 CREATES ONE INDEX AND COMMENTS ON IT. This file proves the starting
-- point, and pins only what the migrations on main and the ruled queue fix:
--   0      the transaction is READ ONLY;
--   1      public.migration_staging_rows exists, an ordinary table;
--   2      the two columns the index keys exist with the types it was written
--          against: imported_entity_id pg_catalog.uuid, nullable; entity_type
--          public.migration_entity_type, NOT NULL (0014_migration_staging.sql).
--          The type is named schema and all, so the row reads the same under
--          any search_path;
--   3      no relation of the index's name exists in public. CREATE INDEX IF
--          NOT EXISTS matches a NAME against every relation in the schema, so
--          a table or view of that name would make the apply skip in silence;
--   4      no index on the table keys imported_entity_id under ANY name. IF
--          NOT EXISTS cannot see one of those, and would build a duplicate;
--   5-8    the four indexes 0014 made are there, each exactly as Postgres 17
--          renders 0014's definition, and each valid, ready and live;
--   9      0097 is absent from the journal, BY HASH. The hash is the sha256 of
--          the pending file as it stands; a promotion changes no byte, so it
--          is the hash the journal will carry;
--   10     PROFILE: the ledger rows the index will hold (imported_entity_id
--          set). OK when there is at least one, VACUOUS when there is none:
--          the index is then built over nothing and no probe can show it
--          working. It is a count and nothing else; no ledger value is read
--          out;
--   CARRY  journal_rows_before = 94: main's journal after 0093 is 91 rows,
--          and 0094, 0095 and 0096 each add one. A different number means the
--          queue is not where 0097 was ruled to follow, and the sitting stops;
--   CARRY  staging_indexes_before = 4. The post-check wants it + 1;
--   CARRY  staging_indexes_md5: one md5 over every index on the table (name,
--          definition, valid, ready, live). The post-check recomputes it over
--          every index except 0097's; nothing else on the table may move.
--
-- IT PINS NOTHING IT CANNOT KNOW. 0094's, 0095's and 0096's bytes can still
-- change in their own reviews and their journal `when`s are set only at their
-- promotions, so no hash or `when` of theirs is read here; the row count above
-- is what the ruled order fixes. The ledger's size is reported, never pinned.
--
-- Run (the file opens and rolls back its own READ ONLY transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 \
--        -f scripts/db/precheck-0097-staging-imported-entity-idx.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== 0097 STAGING INDEX PRE-CHECK - read the profile row last (14 OK, or 13 OK and 1 VACUOUS on an empty ledger) ==='

WITH t AS (
  SELECT to_regclass('public.migration_staging_rows') AS tbl
), ix AS (
  SELECT c.relname, pg_get_indexdef(i.indexrelid) AS def,
         i.indisvalid AND i.indisready AND i.indislive AS usable,
         i.indisvalid, i.indisready, i.indislive
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = (SELECT tbl FROM t)
), j AS (
  SELECT
    (SELECT tbl FROM t)                                                              AS tbl,
    (SELECT c.relkind::text FROM pg_class c WHERE c.oid = (SELECT tbl FROM t))       AS relkind,
    (SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = (SELECT tbl FROM t) AND a.attname = 'imported_entity_id'
        AND NOT a.attisdropped)                                                      AS target_attnum,
    (SELECT string_agg(a.attname || ' ' || tn.nspname || '.' || ty.typname
                       || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULL' END, ', '
                       ORDER BY a.attname DESC)
       FROM pg_attribute a
       JOIN pg_type ty ON ty.oid = a.atttypid
       JOIN pg_namespace tn ON tn.oid = ty.typnamespace
      WHERE a.attrelid = (SELECT tbl FROM t) AND NOT a.attisdropped
        AND a.attname IN ('imported_entity_id', 'entity_type'))                       AS key_columns,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'migration_staging_imported_entity_idx') AS name_taken,
    (SELECT count(*)::int FROM pg_index i
      WHERE i.indrelid = (SELECT tbl FROM t)
        AND (SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = (SELECT tbl FROM t) AND a.attname = 'imported_entity_id'
                AND NOT a.attisdropped) = ANY (i.indkey::int2[]))                    AS target_keyed,
    (SELECT def || CASE WHEN usable THEN '' ELSE ' NOT VALID, READY AND LIVE' END
       FROM ix WHERE relname = 'migration_staging_rows_pkey')                        AS def_pkey,
    (SELECT def || CASE WHEN usable THEN '' ELSE ' NOT VALID, READY AND LIVE' END
       FROM ix WHERE relname = 'migration_staging_tenant_source_uq')                 AS def_source_uq,
    (SELECT def || CASE WHEN usable THEN '' ELSE ' NOT VALID, READY AND LIVE' END
       FROM ix WHERE relname = 'migration_staging_tenant_batch_idx')                 AS def_batch,
    (SELECT def || CASE WHEN usable THEN '' ELSE ' NOT VALID, READY AND LIVE' END
       FROM ix WHERE relname = 'migration_staging_tenant_status_idx')                AS def_status,
    (SELECT count(*)::int FROM ix)                                                   AS indexes,
    (SELECT md5(string_agg(relname || ':' || def || ':' || indisvalid::text || ':'
                           || indisready::text || ':' || indislive::text, ';' ORDER BY relname))
       FROM ix)                                                                      AS indexes_md5,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                          AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0')  AS has_0097
), p AS (
  /* The ledger profile: counts only, and no value of any row. */
  SELECT
    (SELECT count(*)::int FROM public.migration_staging_rows)                         AS ledger_rows,
    (SELECT count(*)::int FROM public.migration_staging_rows
      WHERE imported_entity_id IS NOT NULL)                                           AS with_target,
    (SELECT count(*)::int FROM public.migration_staging_rows
      WHERE imported_entity_id IS NOT NULL
        AND entity_type = 'clinical_record'::public.migration_entity_type)            AS with_target_records
), r AS (
  SELECT v.* FROM j LEFT JOIN p ON true CROSS JOIN LATERAL (VALUES
  (0, '0. this transaction is READ ONLY (the server refuses writes)',
      current_setting('transaction_read_only'), 'on',
      CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END),
  (1, '1. public.migration_staging_rows exists, an ordinary table',
      coalesce(j.tbl::text || ' relkind ' || j.relkind, 'absent'), 'migration_staging_rows relkind r',
      CASE WHEN j.tbl IS NOT NULL AND j.relkind = 'r' THEN 'OK' ELSE 'FAIL' END),
  (2, '2. the two key columns carry the types 0014 gave them',
      coalesce(j.key_columns, 'absent'),
      'imported_entity_id pg_catalog.uuid NULL, entity_type public.migration_entity_type NOT NULL',
      CASE WHEN j.key_columns = 'imported_entity_id pg_catalog.uuid NULL, entity_type public.migration_entity_type NOT NULL'
           THEN 'OK' ELSE 'FAIL' END),
  (3, '3. no relation named migration_staging_imported_entity_idx exists in public',
      CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.name_taken::text END, '0',
      CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN j.name_taken = 0 THEN 'OK' ELSE 'FAIL' END),
  (4, '4. no index on the table keys imported_entity_id, under any name',
      CASE WHEN j.target_attnum IS NULL THEN 'column absent' ELSE j.target_keyed::text END, '0',
      CASE WHEN j.target_attnum IS NULL THEN 'FAIL' WHEN j.target_keyed = 0 THEN 'OK' ELSE 'FAIL' END),
  (5, '5. the primary key is 0014''s, valid, ready and live',
      coalesce(j.def_pkey, 'absent'),
      'CREATE UNIQUE INDEX migration_staging_rows_pkey ON public.migration_staging_rows USING btree (id)',
      CASE WHEN j.def_pkey = 'CREATE UNIQUE INDEX migration_staging_rows_pkey ON public.migration_staging_rows USING btree (id)'
           THEN 'OK' ELSE 'FAIL' END),
  (6, '6. the idempotency key is 0014''s, valid, ready and live',
      coalesce(j.def_source_uq, 'absent'),
      'CREATE UNIQUE INDEX migration_staging_tenant_source_uq ON public.migration_staging_rows USING btree (tenant_id, source_system, entity_type, source_id)',
      CASE WHEN j.def_source_uq = 'CREATE UNIQUE INDEX migration_staging_tenant_source_uq ON public.migration_staging_rows USING btree (tenant_id, source_system, entity_type, source_id)'
           THEN 'OK' ELSE 'FAIL' END),
  (7, '7. the batch index is 0014''s, valid, ready and live',
      coalesce(j.def_batch, 'absent'),
      'CREATE INDEX migration_staging_tenant_batch_idx ON public.migration_staging_rows USING btree (tenant_id, batch_id)',
      CASE WHEN j.def_batch = 'CREATE INDEX migration_staging_tenant_batch_idx ON public.migration_staging_rows USING btree (tenant_id, batch_id)'
           THEN 'OK' ELSE 'FAIL' END),
  (8, '8. the status index is 0014''s, valid, ready and live',
      coalesce(j.def_status, 'absent'),
      'CREATE INDEX migration_staging_tenant_status_idx ON public.migration_staging_rows USING btree (tenant_id, status)',
      CASE WHEN j.def_status = 'CREATE INDEX migration_staging_tenant_status_idx ON public.migration_staging_rows USING btree (tenant_id, status)'
           THEN 'OK' ELSE 'FAIL' END),
  (9, '9. 0097 is absent from the journal, by hash', j.has_0097::text, '0',
      CASE WHEN j.has_0097 = 0 THEN 'OK' ELSE 'FAIL' END),
  (10, '10. PROFILE: ledger rows the index will hold (imported_entity_id set)',
      CASE WHEN j.tbl IS NULL THEN 'table absent'
           ELSE p.with_target::text || ' of ' || p.ledger_rows::text || ' ledger rows, '
                || p.with_target_records::text || ' of them clinical_record' END,
      '> 0 is OK; 0 is VACUOUS',
      CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN p.with_target > 0 THEN 'OK' ELSE 'VACUOUS' END),
  (11, 'journal_rows_before', j.journal_rows::text, '94',
      CASE WHEN j.journal_rows = 94 THEN 'OK' ELSE 'FAIL' END),
  (12, 'staging_indexes_before', CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.indexes::text END, '4',
      CASE WHEN j.tbl IS NOT NULL AND j.indexes = 4 THEN 'OK' ELSE 'FAIL' END),
  (13, 'staging_indexes_md5', coalesce(j.indexes_md5, 'absent'), '32 hex characters',
      CASE WHEN j.indexes_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END)
  ) AS v(n, "check", observed, expected, verdict)
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')    || ' FAIL',
         '14 OK, or 13 OK and 1 VACUOUS; never a FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

ROLLBACK;
