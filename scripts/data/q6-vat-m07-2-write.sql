-- ============================================================================
-- Q6, STAGE 2 of 3: THE WRITE. ONE TRANSACTION.
--
-- Strategy's Q6 (owner-delegated, 2026-11-04): the existing appointment types
-- take Fisiozero's VAT values, 0% and the exemption code M07. Document:
-- docs/data-op-q6-service-types-vat-m07.md.
--
-- WRITES, and nothing else:
--   * public.services.vat_rate := 0 and public.services.vat_exemption_code :=
--     'M07', on every row of the tenant osteojp (by slug) whose two fields are
--     BOTH NULL, active or archived. A row with either field set is never
--     touched: staff set it after 0110.
--   * one public.audit_log row per written service, action
--     'service.vat_default_q6', entity_type 'service', entity_id the service,
--     actor NULL (a data op has no actor), metadata slugs only.
--
-- IT REFUSES WITHOUT THIS SITTING'S PRE-CHECK (SR-59). `-v expect` is the
-- target count and `-v target_md5` the md5 of the target ids that THE
-- PRE-CHECK printed in the same sitting. Under the lock, the set is counted
-- and hashed again, and any difference is a STOP before the UPDATE.
--
-- THE EXPECTED COUNT IS CHECKED BEFORE COMMIT, three times: the target set
-- under the lock, the UPDATE's own row count, and the audit rows' row count.
-- Each must equal `expect`, or the transaction aborts and nothing is written.
-- Two md5 controls prove nothing else moved: every services row outside the
-- written set (every tenant), whole, and the written rows with the two VAT
-- fields left out, each hashed before and after the UPDATE.
--
-- THE IDS ARE RECORDED BEFORE COMMIT. `\o :idsfile` writes the written ids,
-- one per line, to the file under the operator's home that THE ROLLBACK keys
-- on. They go to that file only, never to the screen.
--
-- Any line containing "Q6STOP:" means the transaction aborted and nothing was
-- written. Success is the line "Q6WRITE COMMITTED <n>" after the COMMIT.
--
-- Run (THE WRITE block of the document; the block runs it, never a hand):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -v expect=<n> -v target_md5=<md5> -v idsfile=<the ids file>
--        -f scripts/data/q6-vat-m07-2-write.sql
-- ============================================================================

\if :{?expect}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v expect is missing. THE PRE-CHECK prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?target_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v target_md5 is missing. THE PRE-CHECK prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?idsfile}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v idsfile is missing. The rollback keys on that file; this file refuses to write without it.';
  END $missing$;
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- psql interpolates :'var' in an ordinary statement and NOT inside a dollar
-- quote, so the carries travel through set_config, local to this transaction.
SELECT 'Q6WRITE carries ' || length(set_config('q6.expect', :'expect', true)) || ' ' || length(set_config('q6.target_md5', :'target_md5', true));

-- SHARE ROW EXCLUSIVE: reads of services go on (every booking reads it), and
-- no other write to services can land between the count and the COMMIT. A
-- write already in flight holds a lock; this waits 5 seconds and STOPs.
LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE q6_written (id uuid PRIMARY KEY) ON COMMIT DROP;

DO $q6write$
DECLARE
  c_rate     constant smallint := 0;
  c_code     constant text := 'M07';
  c_action   constant text := 'service.vat_default_q6';
  s_expect   text := current_setting('q6.expect');
  s_md5      text := current_setting('q6.target_md5');
  v_expect   int;
  v_tenants  int;
  v_tenant   uuid;
  v_cols     int;
  v_prior    int;
  v_target   int;
  v_md5      text;
  v_other_b  text;
  v_other_a  text;
  v_rest_b   text;
  v_rest_a   text;
  v_upd      int;
  v_aud      int;
  v_ok       int;
  v_left     int;
BEGIN
  -- THE CARRIES ARE VALIDATED, NOT TRUSTED.
  IF s_expect !~ '^[1-9][0-9]?$' THEN
    RAISE EXCEPTION 'Q6STOP: -v expect must be a whole number from 1 to 60; received %', s_expect;
  END IF;
  v_expect := s_expect::int;
  IF v_expect > 60 THEN
    RAISE EXCEPTION 'Q6STOP: -v expect % is above the ceiling of 60', v_expect;
  END IF;
  IF s_md5 !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Q6STOP: -v target_md5 must be 32 lower-case hex characters';
  END IF;

  -- THE PRECONDITIONS, again, under the lock.
  SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp';
  IF v_tenants <> 1 THEN
    RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants;
  END IF;
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp';

  SELECT count(*) INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'services'
     AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint')
       OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'));
  IF v_cols <> 2 THEN
    RAISE EXCEPTION 'Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied', v_cols;
  END IF;

  SELECT count(*) INTO v_prior
    FROM public.audit_log
   WHERE tenant_id = v_tenant
     AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone');
  IF v_prior <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules', v_prior;
  END IF;

  -- THE TARGET SET, UNDER THE LOCK, AGAINST THE PRE-CHECK'S CARRIES.
  SELECT count(*), md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), ''))
    INTO v_target, v_md5
    FROM public.services s
   WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL;
  IF v_target <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % target rows now, but THE PRE-CHECK counted %: the table moved. Paste THE PRE-CHECK again', v_target, v_expect;
  END IF;
  IF v_md5 <> s_md5 THEN
    RAISE EXCEPTION 'Q6STOP: the target set is not the one THE PRE-CHECK read (same count, other rows). Paste THE PRE-CHECK again';
  END IF;

  -- THE BASELINES. Every row outside the target set, every tenant, whole; and
  -- the target rows with the two VAT fields left out.
  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), ''))
    INTO v_other_b
    FROM public.services s
   WHERE NOT (s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL);
  SELECT md5(coalesce(string_agg((to_jsonb(s) - 'vat_rate' - 'vat_exemption_code')::text, '|' ORDER BY s.id), ''))
    INTO v_rest_b
    FROM public.services s
   WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL;

  -- THE WRITE. One statement, the target predicate and nothing wider.
  WITH u AS (
    UPDATE public.services s
       SET vat_rate = c_rate, vat_exemption_code = c_code
     WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL
    RETURNING s.id
  )
  INSERT INTO q6_written (id) SELECT u.id FROM u;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the UPDATE wrote % rows, expected exactly %', v_upd, v_expect;
  END IF;

  -- THE AUDIT. One row per written service, the shape the app's service
  -- actions write (entity_type service, entity_id the service), metadata
  -- slugs only (the audit metadata contract: no whitespace, 64 characters at
  -- most).
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  SELECT v_tenant, NULL, c_action, 'service', w.id,
         jsonb_build_object(
           'card', 'Q6',
           'source', 'psql_data_op',
           'ruling', 'strategy-q6-2026-11-04',
           'vat_rate_before', NULL,
           'vat_exemption_code_before', NULL,
           'vat_rate_after', c_rate,
           'vat_exemption_code_after', c_code)
    FROM q6_written w;
  GET DIAGNOSTICS v_aud = ROW_COUNT;
  IF v_aud <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: wrote % audit rows, expected exactly %', v_aud, v_expect;
  END IF;

  -- THE CHECKS AFTER THE WRITE, STILL BEFORE COMMIT.
  SELECT count(*) INTO v_ok
    FROM public.services s JOIN q6_written w ON w.id = s.id
   WHERE s.tenant_id = v_tenant AND s.vat_rate = c_rate AND s.vat_exemption_code = c_code;
  IF v_ok <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % written rows read 0 and M07, expected exactly %', v_ok, v_expect;
  END IF;

  SELECT count(*) INTO v_left
    FROM public.services s
   WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % rows of the tenant still have both VAT fields empty after the write', v_left;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), ''))
    INTO v_other_a
    FROM public.services s
   WHERE s.id NOT IN (SELECT w.id FROM q6_written w);
  IF v_other_a IS DISTINCT FROM v_other_b THEN
    RAISE EXCEPTION 'Q6STOP: a services row outside the written set changed, and none may';
  END IF;

  SELECT md5(coalesce(string_agg((to_jsonb(s) - 'vat_rate' - 'vat_exemption_code')::text, '|' ORDER BY s.id), ''))
    INTO v_rest_a
    FROM public.services s JOIN q6_written w ON w.id = s.id;
  IF v_rest_a IS DISTINCT FROM v_rest_b THEN
    RAISE EXCEPTION 'Q6STOP: a column other than the two VAT fields changed on a written row, and none may';
  END IF;
END
$q6write$;

-- THE RECORD, BEFORE COMMIT: the written ids to the operator's file, one per
-- line, and to nothing else.
\o :idsfile
SELECT w.id FROM q6_written w ORDER BY w.id;
\o

SELECT 'Q6WRITE ready_to_commit ' || count(*) FROM q6_written;

COMMIT;

-- Read after the COMMIT, in the same session: what is durable.
SELECT 'Q6WRITE COMMITTED ' || count(*)
  FROM public.audit_log al JOIN public.tenants t ON t.id = al.tenant_id
 WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6';
