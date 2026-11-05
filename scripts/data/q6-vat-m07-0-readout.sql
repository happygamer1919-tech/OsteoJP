-- ============================================================================
-- Q6, STAGE 0: THE READ-OUT. READ ONLY. FOR BUILDING THE LIST, ON AN EARLIER
-- DAY. IT WRITES NOTHING TO PRODUCTION.
--
-- Strategy's Q6-D (2026-11-05): "the accountant confirms type by type. The op
-- must accept a per-type list (exempt with code, or a stated rate), not one
-- value for all." Document: docs/data-op-q6-service-types-vat-m07.md, section
-- "THE READ-OUT".
--
-- WHAT IT WRITES OUT, to the file `-v outfile` names (under
-- /Users/ivan/osteojp-handover/, outside the repository) and to nothing else:
-- one CSV line per appointment type of the tenant osteojp, with a header:
--   service_id,name,status,internal_only,vat_rate_now,vat_exemption_code_now
-- status is active or archived; internal_only is yes or no; the two VAT
-- fields are empty where unset, and empty on every row while 0110 is not
-- applied (they are read through to_jsonb, which carries no key for a column
-- that does not exist, so this file runs before and after 0110). A type's name
-- and id are business data, not personal data; nothing about any patient,
-- appointment, price or person is read.
--
-- WHAT IT PRINTS (to the block's transcript, never the names): "Q6READ" lines,
-- counts and facts only, and last "Q6READ PASS rows <n>".
--
-- WHAT IT REFUSES: the slug osteojp naming other than one tenant; no service;
-- more than 60.
--
-- Run (THE READ-OUT block of the document; the block runs it, never a hand):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -v outfile=<the read-out file>
--        -c "begin read only" -c "set local statement_timeout = '60s'"
--        -f scripts/data/q6-vat-m07-0-readout.sql -c "rollback"
-- ============================================================================

\if :{?outfile}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v outfile is missing. The block names the file under the handover folder; this file refuses to guess.';
  END $missing$;
\endif

SELECT 'Q6READ read_only ' || current_setting('transaction_read_only');

SELECT 'Q6READ tenant_slug_osteojp ' || count(*) FROM public.tenants WHERE slug = 'osteojp';

SELECT 'Q6READ columns_of_0110 ' || count(*)
  FROM information_schema.columns c
 WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name IN ('vat_rate', 'vat_exemption_code');

DO $q6read$
DECLARE
  v_tenants int;
  v_n       int;
BEGIN
  SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp';
  IF v_tenants <> 1 THEN
    RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id
   WHERE t.slug = 'osteojp';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Q6STOP: the tenant osteojp has no appointment type';
  END IF;
  IF v_n > 60 THEN
    RAISE EXCEPTION 'Q6STOP: the tenant osteojp has % appointment types, more than the ceiling of 60. Strategy rules', v_n;
  END IF;
END
$q6read$;

WITH t AS (
  SELECT id FROM public.tenants WHERE slug = 'osteojp'
), s AS (
  SELECT sv.is_active, sv.internal_only, to_jsonb(sv) ->> 'vat_rate' AS vat_rate, to_jsonb(sv) ->> 'vat_exemption_code' AS vat_exemption_code
    FROM public.services sv JOIN t ON t.id = sv.tenant_id
)
SELECT line FROM (
  SELECT 1 AS k, 'Q6READ services_total ' || count(*) AS line FROM s
  UNION ALL SELECT 2, 'Q6READ services_active ' || count(*) FILTER (WHERE is_active) FROM s
  UNION ALL SELECT 3, 'Q6READ services_archived ' || count(*) FILTER (WHERE NOT is_active) FROM s
  UNION ALL SELECT 4, 'Q6READ services_internal_only ' || count(*) FILTER (WHERE internal_only) FROM s
  UNION ALL SELECT 5, 'Q6READ vat_both_empty ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s
  UNION ALL SELECT 6, 'Q6READ vat_any_set ' || count(*) FILTER (WHERE vat_rate IS NOT NULL OR vat_exemption_code IS NOT NULL) FROM s
) x
ORDER BY k;

-- THE FILE: every appointment type of the tenant, to the handover folder only.
\o :outfile
COPY (
  SELECT sv.id AS service_id,
         sv.name,
         CASE WHEN sv.is_active THEN 'active' ELSE 'archived' END AS status,
         CASE WHEN sv.internal_only THEN 'yes' ELSE 'no' END AS internal_only,
         to_jsonb(sv) ->> 'vat_rate' AS vat_rate_now,
         to_jsonb(sv) ->> 'vat_exemption_code' AS vat_exemption_code_now
    FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id
   WHERE t.slug = 'osteojp'
   ORDER BY sv.is_active DESC, sv.name, sv.id
) TO STDOUT WITH (FORMAT csv, HEADER true);
\o

SELECT 'Q6READ PASS rows ' || count(*)
  FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id
 WHERE t.slug = 'osteojp';
