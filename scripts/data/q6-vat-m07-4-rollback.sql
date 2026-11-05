-- ============================================================================
-- Q6, THE ROLLBACK. ONE TRANSACTION. RUN ONLY ON THE LEAD'S WORD.
--
-- Document: docs/data-op-q6-service-types-vat-m07.md, section "Rollback".
--
-- Puts vat_rate and vat_exemption_code back to the BEFORE values that THE
-- WRITE's own audit row records for each service (both NULL, by the target
-- set's definition), on the services THE WRITE recorded, and on no other row.
-- It is KEYED ON THE RECORDED IDS (`-v ids`, from the file THE WRITE wrote
-- under the operator's home), never on a broad WHERE: a services row that
-- this op did not write (staff set it, before or after) is not in the file and
-- is never touched. It does not read the per-type list: each row's after and
-- before values are in its audit row.
--
-- IT REFUSES, before any write, when:
--   * the ids are not a list of `expect` distinct lower-case uuids;
--   * the tenant does not hold exactly one 'service.vat_default_q6' audit row
--     per recorded id, and no other (the file and the audit trail disagree);
--   * any of those audit rows does not record two empty before values;
--   * any recorded id is not a services row of the tenant osteojp that still
--     reads the after values its audit row records (staff changed it since
--     THE WRITE; the lead rules, and this file never overwrites a staff
--     change);
--   * any recorded service carries a later service.* audit row of another
--     action, or an updated_at later than THE WRITE's audit row (a staff
--     re-save with the same values);
--   * an undo audit row already exists (it ran before).
-- The expected count is checked before COMMIT: the UPDATE's row count and the
-- undo audit rows' row count must each equal `expect`. One audit row per
-- service, action 'service.vat_default_q6_undone'. An md5 of every other
-- services row, before and after, proves nothing else moved.
--
-- Run (THE ROLLBACK block of the document, on the lead's word only):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -v ids=<the recorded ids, comma separated> -v expect=<n>
--        -f scripts/data/q6-vat-m07-4-rollback.sql
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

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT 'Q6UNDO carries ' || length(set_config('q6.ids', :'ids', true)) || ' ' || length(set_config('q6.expect', :'expect', true));

LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;

DO $q6undo$
DECLARE
  c_action   constant text := 'service.vat_default_q6_undone';
  s_ids      text := current_setting('q6.ids');
  s_expect   text := current_setting('q6.expect');
  v_ids      uuid[];
  v_expect   int;
  v_tenants  int;
  v_tenant   uuid;
  v_n        int;
  v_other_b  text;
  v_other_a  text;
  v_upd      int;
  v_aud      int;
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
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = c_action;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % undo audit rows already exist: the rollback ran before', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6';
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the tenant holds % audit rows of THE WRITE, but % ids are recorded: the file and the trail disagree. The lead rules', v_n, v_expect;
  END IF;
  SELECT count(DISTINCT al.entity_id) INTO v_n
    FROM public.audit_log al
   WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'
     AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids);
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % of the % recorded ids have an audit row of THE WRITE: the file and the trail disagree. The lead rules', v_n, v_expect;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.audit_log mine
   WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids)
     AND mine.metadata -> 'vat_rate_before' = 'null'::jsonb AND mine.metadata -> 'vat_exemption_code_before' = 'null'::jsonb;
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % of the % audit rows of THE WRITE record two empty before values. Nothing is written; the lead rules', v_n, v_expect;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.services s
    JOIN public.audit_log mine
      ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id
     AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6'
   WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant
     AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint
     AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after');
  IF v_n <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % of the % recorded services still read the values THE WRITE recorded: staff changed the others since THE WRITE. Nothing is written; the lead rules', v_n, v_expect;
  END IF;

  -- A STAFF RE-SAVE WITH THE SAME VALUES LEAVES THEM IN PLACE, so "still the
  -- recorded values" does not prove a row untouched. Two signals, either refuses the whole rollback:
  -- any service.* audit row on a recorded service, other than THE WRITE's
  -- own, written from 10 minutes before THE WRITE's audit row on (the margin
  -- covers a staff transaction that began before THE WRITE and waited for
  -- its lock, whose audit row carries its own earlier start time); and a
  -- recorded row whose updated_at is later than THE WRITE's audit row (THE
  -- WRITE does not set updated_at; the app sets it on every edit).
  SELECT count(*) INTO v_n
    FROM public.audit_log later
    JOIN public.audit_log mine
      ON mine.tenant_id = later.tenant_id AND mine.entity_id = later.entity_id
     AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6'
   WHERE later.tenant_id = v_tenant AND later.entity_type = 'service' AND later.entity_id = ANY (v_ids)
     AND later.action LIKE 'service.%' AND later.action <> 'service.vat_default_q6'
     AND later.created_at > mine.created_at - interval '10 minutes';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % service audit rows of another action sit on the recorded services from 10 minutes before THE WRITE on: staff may have re-saved them. Nothing is written; the lead rules', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.services s
    JOIN public.audit_log mine
      ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id
     AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6'
   WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.updated_at > mine.created_at;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Q6STOP: % recorded services were updated after THE WRITE: staff may have re-saved them. Nothing is written; the lead rules', v_n;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), ''))
    INTO v_other_b
    FROM public.services s
   WHERE NOT (s.id = ANY (v_ids));

  UPDATE public.services s
     SET vat_rate = (mine.metadata ->> 'vat_rate_before')::smallint, vat_exemption_code = (mine.metadata ->> 'vat_exemption_code_before')
    FROM public.audit_log mine
   WHERE mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' AND s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after');
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the UPDATE reset % rows, expected exactly %', v_upd, v_expect;
  END IF;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  SELECT v_tenant, NULL, c_action, 'service', mine.entity_id,
         jsonb_build_object(
           'card', 'Q6',
           'source', 'psql_data_op',
           'ruling', 'lead-word-rollback',
           'vat_rate_before', mine.metadata -> 'vat_rate_after',
           'vat_exemption_code_before', mine.metadata -> 'vat_exemption_code_after',
           'vat_rate_after', mine.metadata -> 'vat_rate_before',
           'vat_exemption_code_after', mine.metadata -> 'vat_exemption_code_before')
    FROM public.audit_log mine
   WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids);
  GET DIAGNOSTICS v_aud = ROW_COUNT;
  IF v_aud <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: wrote % undo audit rows, expected exactly %', v_aud, v_expect;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), ''))
    INTO v_other_a
    FROM public.services s
   WHERE NOT (s.id = ANY (v_ids));
  IF v_other_a IS DISTINCT FROM v_other_b THEN
    RAISE EXCEPTION 'Q6STOP: a services row outside the recorded ids changed, and none may';
  END IF;
END
$q6undo$;

COMMIT;

SELECT 'Q6UNDO COMMITTED ' || count(*)
  FROM public.audit_log al JOIN public.tenants t ON t.id = al.tenant_id
 WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6_undone';
