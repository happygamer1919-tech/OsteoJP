-- ============================================================================
-- FICHA-V6, STAGE 1 of 3: THE MEASUREMENT. IT WRITES NOTHING.
--
-- Card FICHA-V6-01 (docs/data-op-ficha-v6.md). Strategy's ruling, its words:
-- "one-row INSERT per tenant, ON CONFLICT DO NOTHING, its own document,
-- rehearsal and sha256". Production needs one new form_templates row per
-- tenant: osteopathy version 6, which is the repo's osteopathy version 5 with
-- its x-order changed and nothing else.
--
-- WHAT THIS STAGE PRINTS, per tenant: the osteopathy versions it holds,
-- whether its version 5 is active, the md5 of its version 5 schema and whether
-- that md5 is the repo version 5's, and what stage 2 does with the tenant. Then
-- one md5 over every form_templates row (the baseline stage 2 must find again
-- under its lock), the carries stage 2 is handed, and the refusals.
--
-- THE PREMISE IS CHECKED BY AN EXACT CANONICAL COMPARE, NOT BY A PARSER. The
-- md5 of schema::text, taken by Postgres, against the md5 the repo version 5
-- file reads when the same text is taken by Postgres from a literal (c_v5_md5
-- below; docs/data-op-ficha-v6.md names it and the unit test holds it equal).
-- A tenant whose version 5 differs refuses (R03): version 6 was built as the
-- repo version 5 plus an order change, so a different production version 5
-- means the premise is wrong and strategy rules.
--
-- EVERY SET IS DERIVED FROM THE DATABASE AT RUN TIME, by the block between the
-- BASE BEGIN and BASE END markers, which stage 2 carries byte for byte. No
-- count and no id measured on production appears in this file.
--
-- ONE STATEMENT COMPUTES EVERYTHING. It is packaged into one JSON value held in
-- the psql variable fv6_json by \gset (a client-side variable, not a write),
-- and every section below prints from that value.
--
-- Run (stage 1 of docs/data-op-ficha-v6.md):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/ficha-v6-1-measure.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
SET client_encoding = 'UTF8';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== FICHA-V6, STAGE 1. READ ONLY. ==='

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation,
       to_char(now() AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS lisbon_now_by_the_database,
       extract(isodow FROM (now() AT TIME ZONE 'Europe/Lisbon'))::int AS lisbon_weekday;

WITH
-- >>> FICHA-V6 BASE BEGIN. These lines are byte-identical in stage 1 and stage 2
-- (scripts/ficha-v6-data-op.test.mjs asserts it), so the set stage 1 prints and
-- the set stage 2 writes are computed by the same text.
--
-- THE CONSTANTS. c_v5_md5 and c_v6_md5 are md5(schema::text) of the repo's
-- osteopathy version 5 and version 6 files, each taken by Postgres from a
-- literal of the file's schema; the document and the unit test hold both.
-- dow and hhmm are the database's own Lisbon clock, for R08.
k AS (
  SELECT now() AS t_now,
         extract(isodow FROM (now() AT TIME ZONE 'Europe/Lisbon'))::int AS dow,
         to_char(now() AT TIME ZONE 'Europe/Lisbon', 'HH24MI')::int AS hhmm,
         'osteopathy'::text AS c_key,
         5 AS c_from,
         6 AS c_to,
         'b109e3af926fd6f51bbf485a173d2145'::text AS c_v5_md5,
         '752bf47bf11d46a49f74e94761ecea83'::text AS c_v6_md5,
         'staff.ficha_v6.install_template'::text AS c_action
),
-- EVERY form_templates ROW, every tenant, with the md5 of its schema.
ft AS (
  SELECT f.id, f.tenant_id, f.key, f.version, f.is_active, md5(f.schema::text) AS schema_md5
    FROM public.form_templates f
),
-- EVERY TENANT, with its osteopathy versions and its version 5, if any.
ten AS (
  SELECT t.id AS tenant_id, t.slug,
         (SELECT coalesce(jsonb_agg(f.version ORDER BY f.version), '[]'::jsonb)
            FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key) AS versions,
         (SELECT f.id FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_id,
         (SELECT f.is_active FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_active,
         (SELECT f.schema_md5 FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version = k.c_from) AS v5_md5,
         (SELECT count(*) FROM ft f WHERE f.tenant_id = t.id AND f.key = k.c_key AND f.version >= k.c_to)::int AS at_or_above_v6
    FROM public.tenants t
   CROSS JOIN k
),
-- WHAT STAGE 2 DOES WITH EACH TENANT. The first that applies, in this order.
cls AS (
  SELECT ten.tenant_id, ten.slug, ten.versions, ten.v5_id, ten.v5_active, ten.v5_md5, ten.at_or_above_v6,
         CASE WHEN ten.at_or_above_v6 > 0 THEN 'HOLDS VERSION 6 OR ABOVE (R04)'
              WHEN ten.v5_id IS NULL THEN 'NO OSTEOPATHY VERSION 5: LEFT ALONE'
              WHEN ten.v5_md5 IS DISTINCT FROM k.c_v5_md5 THEN 'VERSION 5 IS NOT THE REPO VERSION 5 (R03)'
              WHEN ten.v5_active IS NOT TRUE THEN 'VERSION 5 IS NOT ACTIVE (R05)'
              ELSE 'INSERT' END AS plan
    FROM ten
   CROSS JOIN k
),
-- THE WRITE SET: one tenant per row stage 2 inserts.
ins AS (
  SELECT c.tenant_id FROM cls c WHERE c.plan = 'INSERT'
),
-- THE BASELINE: every form_templates row, whole, all tenants. Stage 2 finds it
-- again under its lock, and proves after the insert that it did not move.
base AS (
  SELECT count(*)::int AS n,
         md5(coalesce(string_agg((f.*)::text, E'\n' ORDER BY f.id), '')) AS md5
    FROM public.form_templates f
),
-- ---------------------------------------------------------------------------
-- THE REFUSALS. n must be 0. control is the population the predicate read, so
-- a 0 that could not have seen anything prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
ref AS (
  SELECT 'R01' AS code,
         'nothing to write: no tenant holds the repo osteopathy version 5 without a version 6' AS label,
         (CASE WHEN (SELECT count(*) FROM ins) = 0 THEN 1 ELSE 0 END)::int AS n,
         (SELECT count(*) FROM ten)::int AS control
  UNION ALL
  SELECT 'R02', 'FICHA-V6 has already run (its audit action)',
         (SELECT count(*) FROM public.audit_log al CROSS JOIN k WHERE al.action = k.c_action)::int,
         (SELECT count(*) FROM public.audit_log al)::int
  UNION ALL
  SELECT 'R03', 'a tenant holds an osteopathy version 5 whose schema md5 is not the repo version 5: the premise is wrong, strategy rules',
         (SELECT count(*) FROM ten CROSS JOIN k WHERE ten.v5_id IS NOT NULL AND ten.v5_md5 IS DISTINCT FROM k.c_v5_md5)::int,
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL)::int
  UNION ALL
  SELECT 'R04', 'an osteopathy row of version 6 or above already exists',
         (SELECT count(*) FROM ft CROSS JOIN k WHERE ft.key = k.c_key AND ft.version >= k.c_to)::int,
         (SELECT count(*) FROM ft CROSS JOIN k WHERE ft.key = k.c_key)::int
  UNION ALL
  SELECT 'R05', 'a tenant holds an osteopathy version 5 that is not active, so a version 6 would change more than the order',
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL AND ten.v5_active IS NOT TRUE)::int,
         (SELECT count(*) FROM ten WHERE ten.v5_id IS NOT NULL)::int
  UNION ALL
  SELECT 'R06', 'the unique key on (tenant_id, key, version) that ON CONFLICT names is missing',
         (CASE WHEN EXISTS (
                 SELECT 1 FROM pg_catalog.pg_index i
                  WHERE i.indrelid = 'public.form_templates'::regclass
                    AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
                    AND i.indnkeyatts = 3
                    AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                           FROM pg_catalog.pg_attribute a
                          WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey))
                        = ARRAY['key', 'tenant_id', 'version'])
               THEN 0 ELSE 1 END)::int,
         (SELECT count(*) FROM pg_catalog.pg_index i WHERE i.indrelid = 'public.form_templates'::regclass)::int
  UNION ALL
  -- A trigger the system did not create would run code the write whitelist does
  -- not name, inside the committed transaction. The control is every trigger on
  -- the two tables, the foreign-key constraint triggers included.
  SELECT 'R07', 'a trigger the system did not create sits on form_templates or audit_log',
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.form_templates'::regclass, 'public.audit_log'::regclass)
             AND NOT t.tgisinternal)::int,
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.form_templates'::regclass, 'public.audit_log'::regclass))::int
  UNION ALL
  -- The clinics' weekday table, read on the database's own clock: open Monday to
  -- Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon time; closed
  -- Sunday. The control is the Lisbon weekday times 10000 plus HHMM.
  SELECT 'R08', 'the clinics are open now by the database Lisbon clock (Monday to Friday 08:00 to 21:00, Saturday 08:00 to 13:00)',
         (CASE WHEN k.dow BETWEEN 1 AND 5 AND k.hhmm >= 800 AND k.hhmm < 2100 THEN 1
               WHEN k.dow = 6 AND k.hhmm >= 800 AND k.hhmm < 1300 THEN 1
               ELSE 0 END)::int,
         (k.dow * 10000 + k.hhmm)::int
    FROM k
),
-- THE CARRIES. Four names, none inside another. Stage 2 is handed each one and
-- refuses if any reads differently under its lock.
car AS (
  SELECT 1 AS ord, 'fv6_count'::text AS carry, (SELECT count(*) FROM ins)::text AS value
  UNION ALL
  SELECT 2, 'fv6_tenants', (SELECT md5(coalesce(string_agg(i.tenant_id::text, ',' ORDER BY i.tenant_id), '')) FROM ins i)
  UNION ALL
  SELECT 3, 'fv6_rows', (SELECT b.n::text FROM base b)
  UNION ALL
  SELECT 4, 'fv6_baseline', (SELECT b.md5 FROM base b)
)
-- <<< FICHA-V6 BASE END.
SELECT jsonb_build_object(
  'tenants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'tenant_id', c.tenant_id, 'slug', c.slug, 'versions', c.versions,
                  'v5_active', c.v5_active, 'v5_schema_md5', c.v5_md5,
                  'v5_is_repo_v5', CASE WHEN c.v5_id IS NULL THEN 'no version 5'
                                        WHEN c.v5_md5 = k.c_v5_md5 THEN 'yes' ELSE 'NO' END,
                  'plan', c.plan) ORDER BY c.tenant_id), '[]'::jsonb)
                FROM cls c CROSS JOIN k),
  'repo', (SELECT jsonb_build_object('key', k.c_key, 'from', k.c_from, 'to', k.c_to,
                                     'v5_md5', k.c_v5_md5, 'v6_md5', k.c_v6_md5) FROM k),
  'baseline', (SELECT jsonb_build_object('rows', b.n, 'md5', b.md5) FROM base b),
  'carries', (SELECT jsonb_agg(jsonb_build_object('ord', c.ord, 'carry', c.carry, 'value', c.value) ORDER BY c.ord) FROM car c),
  'refusals', (SELECT jsonb_agg(jsonb_build_object(
                  'code', r.code, 'label', r.label, 'n', r.n, 'control', r.control,
                  'verdict', CASE WHEN r.n > 0 THEN 'REFUSE' WHEN r.control = 0 THEN 'VACUOUS' ELSE 'OK' END)
                  ORDER BY r.code) FROM ref r),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'on_table', t.tgrelid::regclass::text, 'trigger', t.tgname,
                  'enabled', t.tgenabled::text, 'function', t.tgfoid::regproc::text)
                  ORDER BY t.tgrelid::regclass::text, t.tgname), '[]'::jsonb)
                 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid IN ('public.form_templates'::regclass, 'public.audit_log'::regclass)
                  AND NOT t.tgisinternal)
) AS fv6_json
\gset

-- ---------------------------------------------------------------------------
-- 1. EVERY TENANT.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. EVERY TENANT: its osteopathy versions, its version 5 against the repo version 5, and what stage 2 does with it ==='
SELECT e ->> 'tenant_id' AS tenant_id, e ->> 'slug' AS slug, e -> 'versions' AS osteopathy_versions,
       e ->> 'v5_active' AS v5_active, e ->> 'v5_schema_md5' AS v5_schema_md5,
       e ->> 'v5_is_repo_v5' AS v5_is_repo_v5, e ->> 'plan' AS plan
  FROM jsonb_array_elements(:'fv6_json'::jsonb -> 'tenants') e;
\echo '    INSERT is the only plan stage 2 writes. A tenant with no osteopathy version 5 is left alone.'

-- ---------------------------------------------------------------------------
-- 2. THE REPO.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. THE REPO: the md5 of schema::text each version must read ==='
SELECT :'fv6_json'::jsonb -> 'repo' ->> 'key' AS template_key,
       :'fv6_json'::jsonb -> 'repo' ->> 'v5_md5' AS repo_v5_schema_md5,
       :'fv6_json'::jsonb -> 'repo' ->> 'v6_md5' AS repo_v6_schema_md5;

-- ---------------------------------------------------------------------------
-- 3. THE BASELINE.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. THE BASELINE: every form_templates row, every tenant, whole: its count and one md5 ==='
SELECT (:'fv6_json'::jsonb -> 'baseline' ->> 'rows')::int AS form_templates_rows,
       :'fv6_json'::jsonb -> 'baseline' ->> 'md5' AS form_templates_md5;
\echo '    Stage 2 finds both again under its lock before the insert, and again over every row it did not insert after it.'

-- ---------------------------------------------------------------------------
-- 4. THE CARRIES.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. THE CARRIES. Stage 2 is given these and refuses if any has moved ==='
SELECT e ->> 'carry' AS carry, e ->> 'value' AS value
  FROM jsonb_array_elements(:'fv6_json'::jsonb -> 'carries') e
 ORDER BY (e ->> 'ord')::int;

-- ---------------------------------------------------------------------------
-- 5. THE REFUSALS.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. THE REFUSALS. Any REFUSE stops the sitting here; stage 2 refuses on the same lines ==='
SELECT e ->> 'code' AS code, e ->> 'label' AS refuses_when, (e ->> 'n')::int AS n,
       (e ->> 'control')::int AS control, e ->> 'verdict' AS verdict
  FROM jsonb_array_elements(:'fv6_json'::jsonb -> 'refusals') e
 ORDER BY e ->> 'code';
\echo ''
\echo '=== 5b. WHAT ELSE WOULD RUN ON THE WRITE: every trigger the system did not create on form_templates or audit_log. R07 refuses any ==='
SELECT e ->> 'on_table' AS on_table, e ->> 'trigger' AS trigger_name, e ->> 'enabled' AS enabled,
       e ->> 'function' AS runs_function
  FROM jsonb_array_elements(:'fv6_json'::jsonb -> 'triggers') e;
\echo '    An empty listing is the expected answer.'

ROLLBACK;

\echo ''
\echo '=== FICHA-V6 STAGE 1 COMPLETE. Nothing was written. ==='
