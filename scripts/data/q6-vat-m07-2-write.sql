-- ============================================================================
-- Q6, STAGE 2 of 3: THE WRITE. ONE TRANSACTION.
--
-- Strategy's Q6 (2026-11-04) and its rulings of 2026-11-05: the existing
-- appointment types take the VAT values the accountant confirms TYPE BY TYPE
-- (Q6-D), from a per-type list supplied at run time and never committed.
-- Document: docs/data-op-q6-service-types-vat-m07.md.
--
-- WRITES, and nothing else:
--   * public.services.vat_rate and public.services.vat_exemption_code, set to
--     the rate and the code (or no code) the list names for that service, on
--     every row of the tenant osteojp (by slug) whose two fields are BOTH
--     NULL, active or archived, internal-only or not. A row with either field
--     set is never touched, listed or not: staff set it, and a staff edit
--     wins.
--   * one public.audit_log row per written service, action
--     'service.vat_default_q6', entity_type 'service', entity_id the service,
--     actor NULL (a data op has no actor), metadata slugs and the before and
--     after of the two fields.
--
-- THE LIST arrives on psql's standard input (the block runs psql with
-- `< <the private snapshot of the list>`, whose sha256 the block has checked
-- against the carry of THE PRE-CHECK) and is loaded by `\copy ... FROM pstdin` into a temporary
-- table dropped at the COMMIT. The DO block $q6list$ is byte-identical to the
-- one in THE PRE-CHECK and runs again here, under the lock, before the UPDATE.
--
-- IT REFUSES WITHOUT THIS SITTING'S PRE-CHECK (SR-59). `-v expect` is the
-- target count, `-v target_md5` the md5 of the target ids and `-v list_md5`
-- the md5 of the list's lines as THE PRE-CHECK loaded them, all three printed
-- by THE PRE-CHECK in the same sitting, and `-v disagree` the count of listed
-- types staff set with other values, which THE PRE-CHECK held equal to the
-- dispatch's DISAGREEOK. Under the lock, the set is counted and hashed again,
-- the loaded lines are hashed again and the disagreements are counted again,
-- and any difference is a STOP before the UPDATE.
--
-- THE EXPECTED COUNT IS CHECKED BEFORE COMMIT: the target set under the lock,
-- the UPDATE's own row count, the audit rows' row count and the written rows
-- that equal their list row, each against `expect`, or the transaction aborts
-- and nothing is written. Two md5 controls prove nothing else moved: every
-- services row outside the written set (every tenant), whole, and the written
-- rows with the two VAT fields left out, each hashed before and after.
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
--        -v expect=<n> -v target_md5=<md5> -v list_md5=<md5> -v disagree=<n> -v idsfile=<the ids file>
--        -f scripts/data/q6-vat-m07-2-write.sql < <the snapshot>
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
\if :{?list_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v list_md5 is missing. THE PRE-CHECK prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?disagree}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'Q6STOP: -v disagree is missing. THE PRE-CHECK carries it; this file refuses to guess.';
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
SELECT 'Q6WRITE carries ' || length(set_config('q6.expect', :'expect', true)) || ' ' || length(set_config('q6.target_md5', :'target_md5', true)) || ' ' || length(set_config('q6.list_md5', :'list_md5', true)) || ' ' || length(set_config('q6.disagree', :'disagree', true));

-- SHARE ROW EXCLUSIVE: reads of services go on (every booking reads it), and
-- no other write to services can land between the count and the COMMIT. A
-- write already in flight holds a lock; this waits 5 seconds and STOPs.
LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE q6_list_raw (n bigint GENERATED ALWAYS AS IDENTITY, line text) ON COMMIT DROP;
\copy q6_list_raw (line) FROM pstdin

CREATE TEMP TABLE q6_written (id uuid PRIMARY KEY, vat_rate smallint NOT NULL, vat_exemption_code text) ON COMMIT DROP;

-- ----------------------------------------------------------------------------
-- EVERY REFUSAL OF THE LIST, under the lock. Byte-identical to THE PRE-CHECK's.
-- ----------------------------------------------------------------------------
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

DO $q6write$
DECLARE
  c_action   constant text := 'service.vat_default_q6';
  s_expect   text := current_setting('q6.expect');
  s_md5      text := current_setting('q6.target_md5');
  s_list     text := current_setting('q6.list_md5');
  s_dis      text := current_setting('q6.disagree');
  v_list     text;
  v_dis      int;
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
  IF s_list !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Q6STOP: -v list_md5 must be 32 lower-case hex characters';
  END IF;
  IF s_dis !~ '^(0|[1-9][0-9]?)$' THEN
    RAISE EXCEPTION 'Q6STOP: -v disagree must be a whole number from 0 to 99; received %', s_dis;
  END IF;

  -- THE LIST LOADED NOW IS THE LIST THE PRE-CHECK LOADED, line for line.
  SELECT md5(coalesce(string_agg(r.line, E'\n' ORDER BY r.n), '')) INTO v_list FROM q6_list_raw r;
  IF v_list <> s_list THEN
    RAISE EXCEPTION 'Q6STOP: the list loaded now is not the list THE PRE-CHECK loaded. Paste THE PRE-CHECK again';
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

  -- THE LISTED TYPES STAFF SET WITH OTHER VALUES, counted again under the lock:
  -- the count THE PRE-CHECK held equal to the dispatch's DISAGREEOK, or a STOP.
  SELECT count(*) INTO v_dis
    FROM public.services s
    JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = s.id
   WHERE s.tenant_id = v_tenant AND NOT (s.vat_rate IS NULL AND s.vat_exemption_code IS NULL)
     AND (s.vat_rate IS DISTINCT FROM l.vat_rate OR s.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code);
  IF v_dis <> s_dis::int THEN
    RAISE EXCEPTION 'Q6STOP: % listed types staff set now differ from the list, and THE PRE-CHECK carried %: the table moved. The lead rules', v_dis, s_dis;
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

  -- THE WRITE. One statement: each target row takes its own list row's rate
  -- and code. The target predicate and nothing wider; a listed row whose
  -- fields staff already set is not matched, and so is never overwritten.
  WITH u AS (
    UPDATE public.services s
       SET vat_rate = l.vat_rate, vat_exemption_code = l.vat_exemption_code
      FROM (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l
     WHERE s.id = l.id AND s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL
    RETURNING s.id, s.vat_rate, s.vat_exemption_code
  )
  INSERT INTO q6_written (id, vat_rate, vat_exemption_code) SELECT u.id, u.vat_rate, u.vat_exemption_code FROM u;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: the UPDATE wrote % rows, expected exactly %', v_upd, v_expect;
  END IF;

  -- THE AUDIT. One row per written service, the shape the app's service
  -- actions write (entity_type service, entity_id the service), metadata
  -- slugs, numbers, codes and nulls only (the audit metadata contract: no
  -- whitespace, 64 characters at most).
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  SELECT v_tenant, NULL, c_action, 'service', w.id,
         jsonb_build_object(
           'card', 'Q6',
           'source', 'psql_data_op',
           'ruling', 'strategy-q6-2026-11-05',
           'vat_rate_before', NULL,
           'vat_exemption_code_before', NULL,
           'vat_rate_after', w.vat_rate,
           'vat_exemption_code_after', w.vat_exemption_code)
    FROM q6_written w;
  GET DIAGNOSTICS v_aud = ROW_COUNT;
  IF v_aud <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: wrote % audit rows, expected exactly %', v_aud, v_expect;
  END IF;

  -- THE CHECKS AFTER THE WRITE, STILL BEFORE COMMIT. Each written row equals
  -- its own list row, field by field.
  SELECT count(*) INTO v_ok
    FROM public.services s
    JOIN q6_written w ON w.id = s.id
    JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = s.id
   WHERE s.tenant_id = v_tenant AND s.vat_rate = l.vat_rate AND s.vat_exemption_code IS NOT DISTINCT FROM l.vat_exemption_code;
  IF v_ok <> v_expect THEN
    RAISE EXCEPTION 'Q6STOP: % written rows equal their list row, expected exactly %', v_ok, v_expect;
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
