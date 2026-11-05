-- ============================================================================
-- Q6, STAGE 1 of 3: THE PRE-CHECK. READ ONLY. COUNTS ONLY.
--
-- Strategy's Q6 (2026-11-04) and its rulings of 2026-11-05: the existing
-- appointment types take the VAT values the accountant confirms TYPE BY TYPE
-- (Q6-D), from a per-type list supplied at run time and never committed.
-- Document: docs/data-op-q6-service-types-vat-m07.md, which is the authority
-- for every decision this file carries out.
--
-- THE LIST arrives on psql's standard input (the block runs psql with
-- `< <the private snapshot of the list>`, whose sha256 the block has already
-- checked against the dispatch) and is loaded by `\copy ... FROM pstdin` into
-- the temporary table q6_list_raw, one raw line per row, numbered in file
-- order. The block opens the transaction, creates that table ON COMMIT DROP,
-- and only then sets the transaction READ ONLY (a temporary table cannot be
-- created once it is read only, and rows can be copied into one), so every
-- statement of this file runs read only. The rollback at the end drops the
-- table with its rows. Nothing of production is written.
--
-- WHAT IT READS, and it prints nothing else: one line per fact, each
-- "Q6PRE <name> <value>", where the value is a count, a column type, the word
-- on or off, or (on the PASS line only) the md5 of the target set's ids. No
-- service name, no id, no price, no line of the list is printed.
--
-- WHAT IT REFUSES (a RAISE, so psql exits 3 under ON_ERROR_STOP=1 and the
-- block STOPs): the slug osteojp naming other than one tenant; 0110 not
-- applied; an audit row of this op already in the tenant; no target row; more
-- target rows than the ceiling of 60; and every refusal of the list (the DO
-- block $q6list$, byte-identical in THE WRITE).
--
-- THE TARGET SET is every services row of the tenant osteojp whose vat_rate
-- IS NULL AND vat_exemption_code IS NULL, active or archived, internal-only
-- or not (Q6-A and Q6-B, ruled yes on 2026-11-05). Every target row must be in
-- the list. A listed row with either field set is never written: staff set
-- it, and a staff edit wins (SOLO's default, not a ruling). It is counted
-- (list_skipped_staff_set), and so is every such row whose values differ from
-- its list row (list_disagrees_staff_set), which the lead reads before THE
-- WRITE.
--
-- Run (THE PRE-CHECK block of the document; the block runs it, never a hand):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin" -c "create temp table q6_list_raw (n bigint generated always as identity, line text) on commit drop"
--        -c "set transaction read only" -c "set local statement_timeout = '60s'"
--        -f scripts/data/q6-vat-m07-1-precheck.sql -c "rollback" < <the snapshot>
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
-- THE COUNTS OF THE TABLE, for the owner and strategy. Every one is a count
-- of rows of the tenant osteojp, except the last, which counts the other
-- tenants' rows this op never touches.
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
  UNION ALL SELECT 8, 'Q6PRE staff_set_rate_only ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NULL) FROM s
  UNION ALL SELECT 9, 'Q6PRE staff_set_code_only ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NOT NULL) FROM s
  UNION ALL SELECT 10, 'Q6PRE staff_set_both ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL) FROM s
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

-- ----------------------------------------------------------------------------
-- THE LIST, from psql's standard input, then every refusal of the list. The
-- DO block $q6list$ is byte-identical in THE WRITE, where it runs again under
-- the lock before the UPDATE.
-- ----------------------------------------------------------------------------
\copy q6_list_raw (line) FROM pstdin

DO $q6list$
DECLARE
  c_codes   constant text[] := ARRAY['M01', 'M02', 'M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M19', 'M20', 'M21', 'M25', 'M26', 'M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M99'];
  v_tenants int;
  v_tenant  uuid;
  v_def     text;
  v_header  text;
  v_rows    int;
  v_n       int;
BEGIN
  SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp';
  IF v_tenants <> 1 THEN
    RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants;
  END IF;
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp';

  -- THE 33 CODES are the application's list (packages/db/src/service-type-fields.ts,
  -- VAT_EXEMPTION_CODES) and the CHECK of 0110 names the same 33. This file's
  -- copy is held against the database's own CHECK: the same count, and every
  -- code of this copy inside it.
  SELECT pg_get_constraintdef(k.oid) INTO v_def
    FROM pg_catalog.pg_constraint k
   WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c'
     AND k.conname = 'services_vat_exemption_code_allowed';
  SELECT count(*) INTO v_n FROM regexp_matches(coalesce(v_def, ''), '''M[0-9]{2}''', 'g') m;
  IF v_n <> cardinality(c_codes) THEN
    RAISE EXCEPTION 'Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ', v_n, cardinality(c_codes);
  END IF;
  SELECT count(*) INTO v_n FROM unnest(c_codes) c WHERE position('''' || c || '''' IN coalesce(v_def, '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ', v_n;
  END IF;

  -- THE SHAPE OF THE LIST.
  SELECT r.line INTO v_header FROM q6_list_raw r WHERE r.n = 1;
  IF v_header IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code' THEN
    RAISE EXCEPTION 'Q6STOP: the first line of the list is not the header service_id,vat_rate,vat_exemption_code';
  END IF;
  SELECT count(*) INTO v_rows FROM q6_list_raw r WHERE r.n > 1;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Q6STOP: the list holds no row under its header';
  END IF;
  IF v_rows > 60 THEN
    RAISE EXCEPTION 'Q6STOP: the list holds % rows, more than the ceiling of 60', v_rows;
  END IF;
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},[0-9]+,[A-Z0-9]*$');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas', v_n;
  END IF;

  -- THE VALUES OF EACH ROW (B10: a code is valid at 0% only).
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1 AND split_part(r.line, ',', 2) NOT IN ('0', '6', '13', '23');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1 AND split_part(r.line, ',', 2) = '0' AND split_part(r.line, ',', 3) = '';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1 AND split_part(r.line, ',', 2) <> '0' AND split_part(r.line, ',', 3) <> '';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1 AND split_part(r.line, ',', 3) <> '' AND NOT (split_part(r.line, ',', 3) = ANY (c_codes));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes', v_n;
  END IF;

  -- THE KEYS.
  SELECT count(*) - count(DISTINCT split_part(r.line, ',', 1)) INTO v_n FROM q6_list_raw r WHERE r.n > 1;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: the list repeats a service id: % rows more than distinct ids', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM q6_list_raw r
   WHERE r.n > 1
     AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = split_part(r.line, ',', 1)::uuid AND s.tenant_id = v_tenant);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % service ids of the list are not appointment types of the tenant osteojp', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.services s
   WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL
     AND NOT EXISTS (SELECT 1 FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1) = s.id::text);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed', v_n;
  END IF;
END
$q6list$;

-- THE COUNTS OF THE LIST, read after $q6list$ passed, so every cast holds.
WITH t AS (
  SELECT id FROM public.tenants WHERE slug = 'osteojp'
), l AS (
  SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code
    FROM q6_list_raw r WHERE r.n > 1
), j AS (
  SELECT l.vat_rate, l.vat_exemption_code, (sv.vat_rate IS NULL AND sv.vat_exemption_code IS NULL) AS target,
         (sv.vat_rate IS DISTINCT FROM l.vat_rate OR sv.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code) AS differs
    FROM l JOIN public.services sv ON sv.id = l.id JOIN t ON t.id = sv.tenant_id
)
SELECT line FROM (
  SELECT 1 AS k, 'Q6PRE list_rows ' || count(*) AS line FROM j
  UNION ALL SELECT 2, 'Q6PRE list_to_write ' || count(*) FILTER (WHERE target) FROM j
  UNION ALL SELECT 3, 'Q6PRE list_skipped_staff_set ' || count(*) FILTER (WHERE NOT target) FROM j
  UNION ALL SELECT 4, 'Q6PRE list_disagrees_staff_set ' || count(*) FILTER (WHERE NOT target AND differs) FROM j
  UNION ALL SELECT 5, 'Q6PRE write_rate_0_with_code ' || count(*) FILTER (WHERE target AND vat_rate = 0) FROM j
  UNION ALL SELECT 6, 'Q6PRE write_rate_6 ' || count(*) FILTER (WHERE target AND vat_rate = 6) FROM j
  UNION ALL SELECT 7, 'Q6PRE write_rate_13 ' || count(*) FILTER (WHERE target AND vat_rate = 13) FROM j
  UNION ALL SELECT 8, 'Q6PRE write_rate_23 ' || count(*) FILTER (WHERE target AND vat_rate = 23) FROM j
  UNION ALL SELECT 9, 'Q6PRE write_code_m07 ' || count(*) FILTER (WHERE target AND vat_exemption_code = 'M07') FROM j
  UNION ALL SELECT 10, 'Q6PRE write_code_other ' || count(*) FILTER (WHERE target AND vat_exemption_code <> 'M07') FROM j
) x
ORDER BY k;

-- THE CARRY: the count and the md5 of the target set's ids, sorted, and the md5
-- of the list's lines as loaded, in file order. THE WRITE receives all three
-- from this sitting's transcript and refuses on any difference before its
-- UPDATE.
SELECT 'Q6PRE PASS target ' || count(*) || ' ids_md5 ' || md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), ''))
       || ' list_md5 ' || (SELECT md5(coalesce(string_agg(r.line, E'\n' ORDER BY r.n), '')) FROM q6_list_raw r)
  FROM public.services s JOIN public.tenants t ON t.id = s.tenant_id
 WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL;
