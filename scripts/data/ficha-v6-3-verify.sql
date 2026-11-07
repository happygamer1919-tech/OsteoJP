-- ============================================================================
-- FICHA-V6, STAGE 3 of 3: THE VERIFY. READ ONLY. Verdicts OK or FAIL.
--
-- Card FICHA-V6-01 (docs/data-op-ficha-v6.md). It writes nothing. It runs after
-- stage 2 exits 0 with the line "FICHA-V6 WRITTEN. Paste stage 3 now.", and
-- otherwise only on the owner's or the lead's word, never on the runner's (the
-- halt rule of the document).
--
-- NO NUMBER IS TYPED BUT THE CONSTANTS. Stage 2 wrote one audit row per row it
-- inserted, naming it, with the baseline it took under its lock; this file
-- reads them back and recomputes each against the database. The constants are
-- the md5 of schema::text the repo's version 5 and version 6 read, and the
-- version 6 file's x-order and title as literals; the unit test holds each
-- equal to the file and to the document.
--
-- NO VERDICT HERE MAY READ VACUOUS. Stage 2 refuses an empty write set (R01),
-- so every verdict always has rows to read, and a verdict whose subject is
-- empty FAILs. Each verdict carries a control that can fail: the md5 compare
-- must tell version 5 from version 6, the x-order compare must tell the two
-- orders apart, the picker rule with the version 6 rows left out must read
-- version 5, and the baseline md5 with one row left out must differ.
--
-- STAGE 3 MOVES WITH THE CLINIC. A later template row, or any edit to a
-- form_templates row, FAILs verdict 9 (and a later version FAILs verdict 8).
-- It runs straight after stage 2; read a later FAIL against the audit rows'
-- time before calling it a defect of the op.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/ficha-v6-3-verify.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
SET client_encoding = 'UTF8';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== FICHA-V6, STAGE 3. READ ONLY. Every verdict must read OK ==='

WITH k AS (
  SELECT 'osteopathy'::text AS c_key,
         5 AS c_from,
         6 AS c_to,
         'b109e3af926fd6f51bbf485a173d2145'::text AS c_v5_md5,
         '752bf47bf11d46a49f74e94761ecea83'::text AS c_v6_md5,
         'staff.ficha_v6.install_template'::text AS c_action,
         $fv6x$
[
  "episode_date",
  "weight_kg",
  "height_cm",
  "red_flags",
  "health_problems",
  "consultation_reason",
  "relief_aggravation",
  "clinical_history",
  "systems_review",
  "bodychart",
  "mobilidade",
  "mobilidade_observacoes",
  "special_tests",
  "diagnostico",
  "tratamento",
  "treatment_plan",
  "treatment_objectives",
  "observations"
]
$fv6x$::jsonb AS c_order,
         $fv6t$
{
  "pt": "Ficha Clínica",
  "en": "Clinical Record"
}
$fv6t$::jsonb AS c_title
),
al AS (
  SELECT a.id, a.tenant_id, a.entity_type, a.entity_id, a.metadata AS m, a.created_at
    FROM public.audit_log a CROSS JOIN k
   WHERE a.action = k.c_action
),
v6 AS (
  SELECT f.* FROM public.form_templates f CROSS JOIN k WHERE f.key = k.c_key AND f.version = k.c_to
),
v5 AS (
  SELECT f.* FROM public.form_templates f CROSS JOIN k WHERE f.key = k.c_key AND f.version = k.c_from
),
-- Every row stage 2 did not insert: the rows its baseline covered.
rest AS (
  SELECT f.* FROM public.form_templates f WHERE f.id NOT IN (SELECT al.entity_id FROM al WHERE al.entity_id IS NOT NULL)
),
-- The picker of apps/web/lib/clinical/records.ts: per tenant, the active rows of
-- the key, highest version.
pick AS (
  SELECT DISTINCT ON (f.tenant_id) f.tenant_id, f.id, f.version
    FROM public.form_templates f CROSS JOIN k
   WHERE f.key = k.c_key AND f.is_active
   ORDER BY f.tenant_id, f.version DESC
),
-- The same rule with the version 6 rows left out: its control.
pick_without AS (
  SELECT DISTINCT ON (f.tenant_id) f.tenant_id, f.id, f.version
    FROM public.form_templates f CROSS JOIN k
   WHERE f.key = k.c_key AND f.is_active AND f.version <> k.c_to
   ORDER BY f.tenant_id, f.version DESC
),
v AS (
  SELECT
    (SELECT count(*) FROM al)::int AS n_al,
    (SELECT count(DISTINCT al.tenant_id) FROM al)::int AS n_al_tenants,
    (SELECT count(*) FROM al WHERE al.entity_type = 'form_template' AND al.entity_id IS NOT NULL)::int AS n_al_named,
    (SELECT count(*) FROM al WHERE (al.m ->> 'inserted_total') = (SELECT count(*) FROM al)::text)::int AS n_al_total_ok,
    (SELECT count(*) FROM al JOIN v6 ON v6.id = al.entity_id AND v6.tenant_id = al.tenant_id)::int AS n_al_v6,
    (SELECT count(*) FROM v6)::int AS n_v6,
    (SELECT count(*) FROM v6 WHERE v6.id NOT IN (SELECT al.entity_id FROM al WHERE al.entity_id IS NOT NULL))::int AS n_v6_stray,
    (SELECT count(DISTINCT v5.tenant_id) FROM v5)::int AS n_v5_tenants,
    (SELECT count(*) FROM (SELECT DISTINCT v5.tenant_id FROM v5) t
      WHERE (SELECT count(*) FROM v6 WHERE v6.tenant_id = t.tenant_id) <> 1)::int AS n_v5_tenants_without_one_v6,
    (SELECT count(*) FROM v6 CROSS JOIN k WHERE md5(v6.schema::text) = k.c_v6_md5)::int AS n_v6_md5_ok,
    (SELECT count(*) FROM v5)::int AS n_v5,
    (SELECT count(*) FROM v5 CROSS JOIN k WHERE md5(v5.schema::text) = k.c_v5_md5)::int AS n_v5_md5_ok,
    (SELECT k.c_v5_md5 <> k.c_v6_md5 FROM k) AS md5s_differ,
    (SELECT count(*) FROM v6 CROSS JOIN k WHERE (v6.schema -> 'x-order') = k.c_order)::int AS n_v6_order_ok,
    (SELECT count(*) FROM v5 CROSS JOIN k WHERE (v5.schema -> 'x-order') = k.c_order)::int AS n_v5_order_same,
    (SELECT count(*) FROM v6 CROSS JOIN k WHERE v6.title = k.c_title AND v6.is_active)::int AS n_v6_title_active,
    (SELECT count(*) FROM v6 JOIN pick p ON p.tenant_id = v6.tenant_id AND p.id = v6.id)::int AS n_pick_v6,
    (SELECT count(*) FROM v6 CROSS JOIN k JOIN pick_without p ON p.tenant_id = v6.tenant_id AND p.version = k.c_from)::int AS n_pick_without_v5,
    (SELECT count(*) FROM rest)::int AS rest_n_now,
    (SELECT md5(coalesce(string_agg((r.*)::text, E'\n' ORDER BY r.id), '')) FROM rest r) AS rest_now,
    (SELECT md5(coalesce(string_agg((r.*)::text, E'\n' ORDER BY r.id), '')) FROM rest r
      WHERE r.id <> (SELECT r2.id FROM rest r2 ORDER BY r2.id LIMIT 1)) AS rest_less_one,
    (SELECT count(DISTINCT al.m -> 'baseline') FROM al)::int AS n_baselines,
    (SELECT (al.m -> 'baseline' ->> 'rows')::int FROM al ORDER BY al.id LIMIT 1) AS rest_n_then,
    (SELECT al.m -> 'baseline' ->> 'md5' FROM al ORDER BY al.id LIMIT 1) AS rest_then,
    (SELECT count(*) FROM al JOIN v6 ON v6.id = al.entity_id
      WHERE v6.created_at = al.created_at AND v6.updated_at = v6.created_at)::int AS n_same_txn
),
r AS (
  SELECT 1 AS n, 'one audit row per tenant written, each naming a form_template row and the same total' AS "check",
         v.n_al::text || ' rows / ' || v.n_al_tenants::text || ' tenants / ' || v.n_al_named::text || ' naming / '
           || v.n_al_total_ok::text || ' with the total' AS observed,
         'at least 1, all four equal' AS expected,
         CASE WHEN v.n_al = 0 OR v.n_al_tenants <> v.n_al OR v.n_al_named <> v.n_al OR v.n_al_total_ok <> v.n_al
              THEN 'FAIL' ELSE 'OK' END AS verdict
    FROM v
  UNION ALL SELECT 2, 'each audit row names an osteopathy version 6 row of its own tenant',
         v.n_al_v6::text || ' / control ' || v.n_al::text, 'equal, above 0',
         CASE WHEN v.n_al = 0 OR v.n_al_v6 <> v.n_al THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 3, 'every tenant holding an osteopathy version 5 now holds exactly one version 6',
         v.n_v5_tenants_without_one_v6::text || ' without / control ' || v.n_v5_tenants::text || ' tenants with a version 5',
         '0 without / control above 0',
         CASE WHEN v.n_v5_tenants = 0 OR v.n_v5_tenants_without_one_v6 <> 0 THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 4, 'every osteopathy version 6 row is one this op wrote',
         v.n_v6_stray::text || ' not named / control ' || v.n_v6::text || ' version 6 rows',
         '0 not named / control equal to the audit rows',
         CASE WHEN v.n_v6 = 0 OR v.n_v6_stray <> 0 OR v.n_v6 <> v.n_al THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 5, 'each version 6 schema reads the expected md5; control: each version 5 reads the version 5 md5, and the two md5s differ',
         v.n_v6_md5_ok::text || ' of ' || v.n_v6::text || ' / control ' || v.n_v5_md5_ok::text || ' of ' || v.n_v5::text
           || CASE WHEN v.md5s_differ THEN ' / md5s differ' ELSE ' / md5s EQUAL' END,
         'all of each, above 0 / md5s differ',
         CASE WHEN v.n_v6 = 0 OR v.n_v6_md5_ok <> v.n_v6 OR v.n_v5 = 0 OR v.n_v5_md5_ok <> v.n_v5 OR v.md5s_differ IS NOT TRUE
              THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 6, 'each version 6 x-order equals the file x-order; control: no version 5 x-order equals it',
         v.n_v6_order_ok::text || ' of ' || v.n_v6::text || ' / control ' || v.n_v5_order_same::text || ' of ' || v.n_v5::text,
         'all, above 0 / control 0 of above 0',
         CASE WHEN v.n_v6 = 0 OR v.n_v6_order_ok <> v.n_v6 OR v.n_v5 = 0 OR v.n_v5_order_same <> 0 THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 7, 'each version 6 row carries the file title and is active',
         v.n_v6_title_active::text || ' of ' || v.n_v6::text, 'all, above 0',
         CASE WHEN v.n_v6 = 0 OR v.n_v6_title_active <> v.n_v6 THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 8, 'new fichas pick version 6 in every tenant that has one; control: the same rule without version 6 picks version 5',
         v.n_pick_v6::text || ' of ' || v.n_v6::text || ' / control ' || v.n_pick_without_v5::text || ' of ' || v.n_v6::text,
         'all, above 0 / control all',
         CASE WHEN v.n_v6 = 0 OR v.n_pick_v6 <> v.n_v6 OR v.n_pick_without_v5 <> v.n_v6 THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 9, 'every row stage 2 did not insert is unchanged: count and md5 equal its baseline; control: the same md5 less one row differs',
         v.rest_n_now::text || ' ' || left(coalesce(v.rest_now, 'none'), 8) || ' / control '
           || CASE WHEN v.rest_less_one IS DISTINCT FROM v.rest_then THEN 'differs' ELSE 'EQUAL' END
           || ' / baselines ' || v.n_baselines::text,
         coalesce(v.rest_n_then::text, 'none') || ' ' || left(coalesce(v.rest_then, 'none'), 8) || ' / control differs / baselines 1',
         CASE WHEN v.n_baselines <> 1 OR v.rest_then IS NULL OR v.rest_n_now = 0
                OR v.rest_now IS DISTINCT FROM v.rest_then OR v.rest_n_now IS DISTINCT FROM v.rest_n_then
                OR v.rest_less_one IS NOT DISTINCT FROM v.rest_then THEN 'FAIL' ELSE 'OK' END FROM v
  UNION ALL SELECT 10, 'each version 6 row was made in the op''s own transaction and not touched since (created_at equals its audit row''s, updated_at equals created_at)',
         v.n_same_txn::text || ' of ' || v.n_al::text, 'all, above 0',
         CASE WHEN v.n_al = 0 OR v.n_same_txn <> v.n_al THEN 'FAIL' ELSE 'OK' END FROM v
)
SELECT r.n, r."check", r.observed, r.expected, r.verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY',
       count(*) FILTER (WHERE r.verdict = 'OK')::text || ' OK / '
         || count(*) FILTER (WHERE r.verdict = 'VACUOUS')::text || ' VACUOUS / '
         || count(*) FILTER (WHERE r.verdict = 'FAIL')::text || ' FAIL',
       count(*)::text || ' verdicts', 'SUMMARY'
  FROM r
 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- THE ROWS WRITTEN, as they stand now. Ids and md5s only.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== THE ROWS STAGE 2 WROTE, as they stand now ==='
SELECT al.tenant_id::text AS tenant_id, al.entity_id::text AS form_template_id, f.version, f.is_active,
       md5(f.schema::text) AS schema_md5
  FROM public.audit_log al
  LEFT JOIN public.form_templates f ON f.id = al.entity_id
 WHERE al.action = 'staff.ficha_v6.install_template'
 ORDER BY al.tenant_id;

ROLLBACK;

\echo ''
\echo '=== FICHA-V6 STAGE 3 COMPLETE. Nothing was written. ==='
