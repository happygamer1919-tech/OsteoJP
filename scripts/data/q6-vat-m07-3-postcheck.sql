-- ============================================================================
-- Q6, STAGE 3 of 3: THE POST-CHECK. READ ONLY. COUNTS ONLY.
--
-- Document: docs/data-op-q6-service-types-vat-m07.md.
--
-- It reads the ids THE WRITE recorded (`-v ids`, comma separated, from the
-- file under the operator's home; never printed) and proves, against
-- production as it stands after the COMMIT:
--   * every recorded id is a services row of the tenant osteojp, and reads
--     vat_rate 0 and vat_exemption_code M07;
--   * the tenant holds exactly one 'service.vat_default_q6' audit row per
--     recorded id, and no other row of that action;
--   * no 'service.vat_default_q6_undone' row exists.
-- Any failure is a RAISE (psql exits 3, the block STOPs). Then it prints
-- counts for the owner, and last the line "Q6POST PASS written <n>".
--
-- A service created after THE WRITE starts with both fields empty (0110's
-- columns have no default), so target_left_now is printed for information and
-- is never a verdict.
--
-- Run (THE POST-CHECK block of the document):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -v ids=<the recorded ids, comma separated> -v expect=<n>
--        -c "begin read only" -c "set local statement_timeout = '60s'"
--        -f scripts/data/q6-vat-m07-3-postcheck.sql -c "rollback"
-- ============================================================================

\if :{?ids}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v ids is missing. THE WRITE recorded them in its file; this file refuses to guess.';
  END $missing$;
\endif
\if :{?expect}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v expect is missing.';
  END $missing$;
\endif

SELECT 'Q6POST read_only ' || current_setting('transaction_read_only');

SELECT 'Q6POST carries ' || length(set_config('q6.ids', :'ids', true)) || ' ' || length(set_config('q6.expect', :'expect', true));

DO $q6post$
DECLARE
  s_ids     text := current_setting('q6.ids');
  s_expect  text := current_setting('q6.expect');
  v_ids     uuid[];
  v_expect  int;
  v_tenants int;
  v_tenant  uuid;
  v_n       int;
BEGIN
  IF s_expect !~ '^[1-9][0-9]?$' THEN
    RAISE EXCEPTION 'Q6STOP: -v expect must be a whole number from 1 to 60; received %', s_expect;
  END IF;
  v_expect := s_expect::int;
  IF s_ids !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' THEN
    RAISE EXCEPTION 'Q6STOP: -v ids is not a comma separated list of lower-case uuids';
  END IF;
  v_ids := string_to_array(s_ids, ',')::uuid[];
  IF cardinality(v_ids) <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % ids recorded, expected %', cardinality(v_ids), v_expect;
  END IF;
  SELECT count(DISTINCT x) INTO v_n FROM unnest(v_ids) x;
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the recorded ids hold a duplicate (% distinct of %)', v_n, v_expect;
  END IF;

  SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp';
  IF v_tenants <> 1 THEN
    RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants;
  END IF;
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp';

  SELECT count(*) INTO v_n
    FROM public.services s
   WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07';
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % of the % recorded services read 0 and M07 in the tenant', v_n, v_expect;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6';
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the tenant holds % audit rows of this op, expected exactly %', v_n, v_expect;
  END IF;

  SELECT count(DISTINCT al.entity_id) INTO v_n
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'
     AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids);
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % of the % recorded services have their audit row', v_n, v_expect;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6_undone';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % undo audit rows exist: the op was rolled back', v_n;
  END IF;
END
$q6post$;

WITH t AS (
  SELECT id FROM public.tenants WHERE slug = 'osteojp'
), s AS (
  SELECT sv.is_active, sv.vat_rate, sv.vat_exemption_code
    FROM public.services sv JOIN t ON t.id = sv.tenant_id
)
SELECT line FROM (
  SELECT 1 AS k, 'Q6POST services_total ' || count(*) AS line FROM s
  UNION ALL SELECT 2, 'Q6POST at_0_m07_total ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s
  UNION ALL SELECT 3, 'Q6POST at_0_m07_active ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND is_active) FROM s
  UNION ALL SELECT 4, 'Q6POST at_0_m07_archived ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND NOT is_active) FROM s
  UNION ALL SELECT 5, 'Q6POST target_left_now ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s
  UNION ALL SELECT 6, 'Q6POST partial_left_alone ' || count(*) FILTER (WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s
  UNION ALL SELECT 7, 'Q6POST other_values_left_alone ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s
) x
ORDER BY k;

SELECT 'Q6POST PASS written ' || cardinality(string_to_array(current_setting('q6.ids'), ','));
