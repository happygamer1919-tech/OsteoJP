-- 0098 MIGRATION STAGING INDEX: PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- For docs/migration-apply-0098.md, which pins this file's sha256. The
-- migration is packages/db/migrations-pending/
-- NEXT-AFTER-0097_migration_staging_imported_entity_idx.sql until it is
-- promoted to 0098 by a rename, after 0097 is applied and merged. It is
-- applied from origin/main at the merge commit of its PR, after 0096 and
-- 0097, in that order. It was ruled 0098 on 2026-09-30 (the fifth
-- renumbering; it was 0097), and the migration's own header and COMMENT
-- still say 0097, because a rename changes no byte.
--
-- THE SHAPE is 0093's and 0094's: check | observed | expected | verdict,
-- verdict LAST so a stage can match it anchored to the end of the line. The
-- seven carries are rows whose `check` column IS the carry's name, and the
-- stage that reads them matches that column exactly.
--
-- EVERY VERDICT IS OK, VACUOUS OR FAIL, and the last row prints the profile,
--     N OK / M VACUOUS / K FAIL      (verdict SUMMARY)
-- The caller asserts the PROFILE, never "no VACUOUS". Only the ledger profile
-- (12) can read VACUOUS: 20 OK / 0 VACUOUS / 0 FAIL on a ledger that holds a
-- row with a target, 19 OK / 1 VACUOUS / 0 FAIL on one that holds none. Any
-- FAIL stops the sitting before the apply.
--
-- A ZERO IS NEVER A PASS ON ITS OWN. Every verdict that asserts an absence
-- runs the SAME count on a subject that must be present, and FAILs unless
-- that control reads what it must: a count that cannot see anything would
-- otherwise read 0 and pass. Every carry names what it was taken over, and
-- FAILs on an empty set.
--
-- A MISSING SUBJECT IS A STOP, NEVER A QUIET OK. The ledger profile (12)
-- names the table, so without it psql halts on "relation does not exist"
-- (exit 3 under ON_ERROR_STOP) before any verdict prints. The catalogue rows
-- look the table up with to_regclass and FAIL on its NULL as well.
--
-- 0098 CREATES ONE INDEX AND COMMENTS ON IT. This file proves the starting
-- point:
--   0      the transaction is READ ONLY;
--   1      public.migration_staging_rows exists, an ordinary table;
--   2      the two columns the index keys exist with the types it was written
--          against: imported_entity_id pg_catalog.uuid, nullable; entity_type
--          public.migration_entity_type, NOT NULL (0014_migration_staging.sql);
--   3      no relation of the index's name exists in public. CREATE INDEX IF
--          NOT EXISTS matches a NAME against every relation in the schema, so
--          a table or view of that name would make the apply skip in silence.
--          CONTROL: the same count finds exactly one relation named
--          migration_staging_tenant_status_idx;
--   4      no index on the table keys imported_entity_id under ANY name. IF
--          NOT EXISTS cannot see one of those, and would build a duplicate.
--          CONTROL: the same count finds exactly three indexes keying
--          tenant_id (0014's idempotency key, batch and status indexes);
--   5-8    the four indexes 0014 made are there, each exactly as Postgres 17
--          renders 0014's definition, and each valid, ready and live;
--   9      0098 is absent from the journal, BY HASH. A promotion changes no
--          byte, so the pending file's sha256 is the hash the journal will
--          carry. CONTROL: the same count finds 0097's hash exactly once;
--   10     THE QUEUE: 0096 (CARE-02a) and 0097 (the registo write policies)
--          are each in the journal exactly once, by the sha256 of the file
--          production applied;
--   11     the newest journal row (by created_at, then id) is 0097's, so no
--          later migration has been applied and 0098's journal `when`, set
--          above 0097's at the promotion, is above every applied one;
--   12     PROFILE: the ledger rows the index will hold (imported_entity_id
--          set), and the ledger's whole row count, which is what the build
--          reads and what its duration scales with. OK when at least one row
--          has a target, VACUOUS when none does. Counts only; no ledger value
--          is read out;
--   CARRY  journal_rows_before = 95: production's journal was 93 after 0095,
--          and 0096 and 0097 each add one;
--   CARRY  staging_indexes_before = 4. The post-check wants it + 1;
--   CARRY  staging_indexes_md5: one md5 over every index on the table (name,
--          definition, valid, ready, live). The post-check recomputes it over
--          every index except 0098's;
--   CARRY  policies_md5: one md5 over every policy in the database (table,
--          name, command, permissive, roles, both expressions by md5);
--   CARRY  functions_md5: one md5 over every function in public (signature,
--          body md5, SECURITY DEFINER, volatility, owner, settings);
--   CARRY  grants_md5: one md5 over every relation, column and function ACL
--          in public. An index has no ACL of its own, so 0098 moves none;
--   CARRY  secdef_functions_before: the SECURITY DEFINER functions in public,
--          every one owned by postgres. 0098 adds none and changes none.
--
-- WHAT IT PINS. 0096's and 0097's sha256 are the bytes their own documents
-- pin and production applied (0096 at fbf8cad1, 0097 at 076481bf). If either
-- file changes before its own apply, this file is refilled and re-pinned; the
-- apply document says so. The ledger's size is reported, never pinned.
--
-- Run (the file opens and rolls back its own READ ONLY transaction):
--   psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 \
--        -f scripts/db/precheck-0098-staging-imported-entity-idx.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== 0098 STAGING INDEX PRE-CHECK - read the profile row last (20 OK, or 19 OK and 1 VACUOUS on an empty ledger) ==='

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
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'migration_staging_tenant_status_idx') AS name_control,
    (SELECT count(*)::int FROM pg_index i
      WHERE i.indrelid = (SELECT tbl FROM t)
        AND (SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = (SELECT tbl FROM t) AND a.attname = 'imported_entity_id'
                AND NOT a.attisdropped) = ANY (i.indkey::int2[]))                    AS target_keyed,
    (SELECT count(*)::int FROM pg_index i
      WHERE i.indrelid = (SELECT tbl FROM t)
        AND (SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = (SELECT tbl FROM t) AND a.attname = 'tenant_id'
                AND NOT a.attisdropped) = ANY (i.indkey::int2[]))                    AS keyed_control,
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
      WHERE hash = '198054aba52cc6a31804559e2bfe1612ed6c3ea53d33cbcfc9599df39fd135b0')  AS has_0098,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45')  AS has_0096,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318')  AS has_0097,
    (SELECT CASE m.hash WHEN '076481bf1599975e3b1bc25b4f9363901c2c7269df32ec2ef781cb19ba1dc318' THEN '0097'
                        WHEN 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45' THEN '0096'
                        ELSE 'another, hash ' || m.hash END
       FROM drizzle.__drizzle_migrations m ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS newest,
    (SELECT count(*)::int FROM pg_policy)                                             AS policies,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname))
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace)                                 AS policies_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                     AS functions,
    (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                           || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':'
                           || coalesce(array_to_string(p.proconfig, ','), ''),
                           ';' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                     AS functions_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') AND c.relacl IS NOT NULL) AS grants,
    (SELECT md5(
              coalesce((SELECT string_agg(c.relname || ':' || coalesce(c.relacl::text, 'default'), ';' ORDER BY c.relname)
                          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')), '')
              || '|' ||
              coalesce((SELECT string_agg(c.relname || '.' || a.attname || ':' || a.attacl::text, ';' ORDER BY c.relname, a.attname)
                          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND a.attacl IS NOT NULL AND NOT a.attisdropped), '')
              || '|' ||
              coalesce((SELECT string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'default'), ';'
                                          ORDER BY p.oid::regprocedure::text)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public'), '')))                           AS grants_md5,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                     AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                                AS secdef_not_postgres
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
  (3, '3. no relation named migration_staging_imported_entity_idx exists in public; control: the same count finds migration_staging_tenant_status_idx once',
      CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.name_taken::text || ', control ' || j.name_control::text END,
      '0, control 1',
      CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN j.name_taken = 0 AND j.name_control = 1 THEN 'OK' ELSE 'FAIL' END),
  (4, '4. no index on the table keys imported_entity_id, under any name; control: the same count finds three indexes keying tenant_id',
      CASE WHEN j.target_attnum IS NULL THEN 'column absent' ELSE j.target_keyed::text || ', control ' || j.keyed_control::text END,
      '0, control 3',
      CASE WHEN j.target_attnum IS NULL THEN 'FAIL' WHEN j.target_keyed = 0 AND j.keyed_control = 3 THEN 'OK' ELSE 'FAIL' END),
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
  (9, '9. 0098 is absent from the journal, by hash; control: the same count finds 0097 once',
      j.has_0098::text || ', control ' || j.has_0097::text, '0, control 1',
      CASE WHEN j.has_0098 = 0 AND j.has_0097 = 1 THEN 'OK' ELSE 'FAIL' END),
  (10, '10. THE QUEUE: 0096 and 0097 are each in the journal once, by the sha256 production applied',
      '0096 ' || j.has_0096::text || ', 0097 ' || j.has_0097::text, '0096 1, 0097 1',
      CASE WHEN j.has_0096 = 1 AND j.has_0097 = 1 THEN 'OK' ELSE 'FAIL' END),
  (11, '11. the newest journal row is 0097''s, by hash',
      coalesce(j.newest, 'the journal is empty'), '0097',
      CASE WHEN j.newest = '0097' THEN 'OK' ELSE 'FAIL' END),
  (12, '12. PROFILE: ledger rows the index will hold (imported_entity_id set), of the rows the build reads',
      CASE WHEN j.tbl IS NULL THEN 'table absent'
           ELSE p.with_target::text || ' of ' || p.ledger_rows::text || ' ledger rows, '
                || p.with_target_records::text || ' of them clinical_record' END,
      '> 0 is OK; 0 is VACUOUS',
      CASE WHEN j.tbl IS NULL THEN 'FAIL' WHEN p.with_target > 0 THEN 'OK' ELSE 'VACUOUS' END),
  (13, 'journal_rows_before', j.journal_rows::text, '95',
      CASE WHEN j.journal_rows = 95 THEN 'OK' ELSE 'FAIL' END),
  (14, 'staging_indexes_before', CASE WHEN j.tbl IS NULL THEN 'table absent' ELSE j.indexes::text END, '4',
      CASE WHEN j.tbl IS NOT NULL AND j.indexes = 4 THEN 'OK' ELSE 'FAIL' END),
  (15, 'staging_indexes_md5', coalesce(j.indexes_md5, 'absent'), '32 hex characters, over ' || j.indexes::text || ' indexes',
      CASE WHEN j.indexes > 0 AND j.indexes_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END),
  (16, 'policies_md5', coalesce(j.policies_md5, 'absent'), '32 hex characters, over ' || j.policies::text || ' policies',
      CASE WHEN j.policies > 0 AND j.policies_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END),
  (17, 'functions_md5', coalesce(j.functions_md5, 'absent'), '32 hex characters, over ' || j.functions::text || ' functions in public',
      CASE WHEN j.functions > 0 AND j.functions_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END),
  (18, 'grants_md5', coalesce(j.grants_md5, 'absent'), '32 hex characters, over ' || j.grants::text || ' relations with an ACL in public',
      CASE WHEN j.grants > 0 AND j.grants_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END),
  (19, 'secdef_functions_before', j.secdef::text, 'at least 1, every one owned by postgres; ' || j.secdef_not_postgres::text || ' not',
      CASE WHEN j.secdef > 0 AND j.secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END)
  ) AS v(n, "check", observed, expected, verdict)
), s AS (
  SELECT n, "check", observed, expected, verdict FROM r
  UNION ALL
  SELECT 99, 'SUMMARY. the verdict profile this run printed',
         (SELECT count(*) FROM r WHERE verdict = 'OK')      || ' OK / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'VACUOUS') || ' VACUOUS / ' ||
         (SELECT count(*) FROM r WHERE verdict = 'FAIL')    || ' FAIL',
         '20 OK, or 19 OK and 1 VACUOUS; never a FAIL', 'SUMMARY'
)
SELECT "check", observed, expected, verdict FROM s ORDER BY n;

ROLLBACK;
