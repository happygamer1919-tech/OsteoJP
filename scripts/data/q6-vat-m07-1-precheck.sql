-- ============================================================================
-- Q6, STAGE 1 of 3: THE PRE-CHECK. READ ONLY. COUNTS ONLY.
--
-- Strategy's Q6 (owner-delegated, 2026-11-04): the existing appointment types
-- take Fisiozero's VAT values, 0% and the exemption code M07. Document:
-- docs/data-op-q6-service-types-vat-m07.md, which is the authority for every
-- decision this file carries out.
--
-- WHAT IT READS, and it prints nothing else: one line per fact, each
-- "Q6PRE <name> <value>", where the value is a count, a column type, the word
-- on or off, or (on the PASS line only) the md5 of the target set's ids. No
-- service name, no id, no price, no other column is printed.
--
-- WHAT IT REFUSES (a RAISE, so psql exits 3 under ON_ERROR_STOP=1 and the
-- block STOPs): the slug osteojp naming other than one tenant; 0110 not
-- applied (the two columns absent, or of another type, or their two CHECK
-- constraints absent); an audit row of this op already in the tenant (it ran
-- before, or was undone; the lead rules); no target row (nothing to write);
-- more target rows than the ceiling of 60.
--
-- THE TARGET SET is every services row of the tenant osteojp whose vat_rate
-- IS NULL AND vat_exemption_code IS NULL, active or archived (decision D2 of
-- the document; asked of strategy as Q6-A). A row with one of the two set is
-- never in it: staff set it after 0110, and this op leaves it alone.
--
-- Run (THE PRE-CHECK block of the document; the block runs it, never a hand):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '60s'"
--        -f scripts/data/q6-vat-m07-1-precheck.sql -c "rollback"
-- ============================================================================

SELECT 'Q6PRE read_only ' || current_setting('transaction_read_only');

SELECT 'Q6PRE tenant_slug_osteojp ' || count(*) FROM public.tenants WHERE slug = 'osteojp';

SELECT 'Q6PRE column_vat_rate ' || coalesce(
  (SELECT c.data_type FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_rate'),
  'absent');

SELECT 'Q6PRE column_vat_exemption_code ' || coalesce(
  (SELECT c.data_type FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_exemption_code'),
  'absent');

SELECT 'Q6PRE constraint_vat_rate ' || count(*)
  FROM pg_catalog.pg_constraint k
 WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c'
   AND k.conname = 'services_vat_rate_allowed';

SELECT 'Q6PRE constraint_vat_exemption_code ' || count(*)
  FROM pg_catalog.pg_constraint k
 WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c'
   AND k.conname = 'services_vat_exemption_code_allowed';

-- ----------------------------------------------------------------------------
-- THE PRECONDITIONS. Before any statement names the new columns, so a missing
-- 0110 is a refusal that says so, not a bare "column does not exist".
-- ----------------------------------------------------------------------------
DO $q6pre1$
DECLARE
  v_tenants int;
  v_cols    int;
  v_cons    int;
BEGIN
  SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp';
  IF v_tenants <> 1 THEN
    RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants;
  END IF;

  SELECT count(*) INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'services'
     AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint')
       OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'));
  IF v_cols <> 2 THEN
    RAISE EXCEPTION 'Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied', v_cols;
  END IF;

  SELECT count(*) INTO v_cons
    FROM pg_catalog.pg_constraint k
   WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c'
     AND k.conname IN ('services_vat_rate_allowed', 'services_vat_exemption_code_allowed');
  IF v_cons <> 2 THEN
    RAISE EXCEPTION 'Q6STOP: services carries % of the 2 CHECK constraints of 0110: 0110 is not applied as reviewed', v_cons;
  END IF;
END
$q6pre1$;

-- ----------------------------------------------------------------------------
-- THE COUNTS, for the owner and strategy. Every one is a count of rows of the
-- tenant osteojp, except the last, which counts the other tenants' rows this
-- op never touches.
-- ----------------------------------------------------------------------------
WITH t AS (
  SELECT id FROM public.tenants WHERE slug = 'osteojp'
), s AS (
  SELECT sv.is_active, sv.internal_only, sv.vat_rate, sv.vat_exemption_code
    FROM public.services sv JOIN t ON t.id = sv.tenant_id
), a AS (
  SELECT al.action
    FROM public.audit_log al JOIN t ON t.id = al.tenant_id
   WHERE al.action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')
)
SELECT line FROM (
  SELECT 1 AS k, 'Q6PRE services_total ' || count(*) AS line FROM s
  UNION ALL SELECT 2, 'Q6PRE services_active ' || count(*) FILTER (WHERE is_active) FROM s
  UNION ALL SELECT 3, 'Q6PRE services_archived ' || count(*) FILTER (WHERE NOT is_active) FROM s
  UNION ALL SELECT 4, 'Q6PRE target_total ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s
  UNION ALL SELECT 5, 'Q6PRE target_active ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND is_active) FROM s
  UNION ALL SELECT 6, 'Q6PRE target_archived ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND NOT is_active) FROM s
  UNION ALL SELECT 7, 'Q6PRE target_internal_only ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND internal_only) FROM s
  UNION ALL SELECT 8, 'Q6PRE partial_left_alone ' || count(*) FILTER (WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s
  UNION ALL SELECT 9, 'Q6PRE already_0_m07 ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s
  UNION ALL SELECT 10, 'Q6PRE other_values_left_alone ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s
  UNION ALL SELECT 11, 'Q6PRE audit_rows_q6 ' || count(*) FILTER (WHERE action = 'service.vat_default_q6') FROM a
  UNION ALL SELECT 12, 'Q6PRE audit_rows_q6_undone ' || count(*) FILTER (WHERE action = 'service.vat_default_q6_undone') FROM a
  UNION ALL SELECT 13, 'Q6PRE other_tenants_services_untouched ' || count(*)
              FROM public.services sv WHERE sv.tenant_id NOT IN (SELECT id FROM t)
) x
ORDER BY k;

-- ----------------------------------------------------------------------------
-- THE REFUSALS THAT NEED THE NEW COLUMNS.
-- ----------------------------------------------------------------------------
DO $q6pre2$
DECLARE
  v_tenant uuid;
  v_audit  int;
  v_target int;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp';

  SELECT count(*) INTO v_audit
    FROM public.audit_log
   WHERE tenant_id = v_tenant
     AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone');
  IF v_audit <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules', v_audit;
  END IF;

  SELECT count(*) INTO v_target
    FROM public.services
   WHERE tenant_id = v_tenant AND vat_rate IS NULL AND vat_exemption_code IS NULL;
  IF v_target = 0 THEN
    RAISE EXCEPTION 'Q6STOP: no service of the tenant has both VAT fields empty: there is nothing to write';
  END IF;
  IF v_target > 60 THEN
    RAISE EXCEPTION 'Q6STOP: % target rows, more than the ceiling of 60 the document names. Strategy rules', v_target;
  END IF;
END
$q6pre2$;

-- THE CARRY: the count and the md5 of the target set's ids, sorted. THE WRITE
-- receives both from this sitting's transcript and refuses on any difference.
SELECT 'Q6PRE PASS target ' || count(*) || ' ids_md5 ' || md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), ''))
  FROM public.services s JOIN public.tenants t ON t.id = s.tenant_id
 WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL;
