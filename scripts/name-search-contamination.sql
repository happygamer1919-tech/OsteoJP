-- ===========================================================================
-- HOW MANY PATIENTS WERE HIDDEN BY THE SEARCH BUG. READ ONLY.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor, against PRODUCTION.
-- The lane could not: SR-50 is SUSPENDED for this dispatch and no terminal
-- opened a production connection.
--
-- READ ONLY. Every statement is a SELECT. No INSERT, UPDATE, DELETE, no temp
-- table, no transaction left open.
--
-- ---------------------------------------------------------------------------
-- WHAT IT ANSWERS, AND WHY THE NUMBER MATTERS
-- ---------------------------------------------------------------------------
-- Reception reported a patient the platform said did not exist. The record
-- existed; the search could not reach it by first name plus surname. That same
-- report is part of the evidence that the Castelo Branco import lost patients.
--
-- SO THIS SEPARATES THE TWO. A patient in this report was ALWAYS THERE and was
-- unreachable by the query a person actually types. Every one of them is a
-- "missing patient" that was never missing, and subtracting them is what makes
-- the remaining CB import gap a real number instead of an inflated one.
--
-- ---------------------------------------------------------------------------
-- THE TWO POPULATIONS, AND THEY ARE DIFFERENT FAILURES
-- ---------------------------------------------------------------------------
-- The old predicate was `full_name ILIKE '%' || <whole typed string> || '%'`.
-- It fails in two independent ways:
--
--   A. TOKEN ORDER. Typing "Antonio Galhofo" for "António Armando Ribeiro
--      Galhofo" looks for that pair ADJACENT and IN ORDER. Any name with three
--      or more tokens is unreachable by first-plus-surname. A two-token name is
--      not affected, because first-plus-last IS the whole name.
--
--   B. ACCENTS. `ILIKE` is case-insensitive and NOT accent-insensitive. A name
--      carrying any accented character is unreachable by a query typed without
--      accents, whatever its token count - and Portuguese keyboards make that
--      the common typing, not the rare one.
--
-- THEY OVERLAP HEAVILY and the report gives both plus the union, because
-- "how many were hidden" is the union and "why" is the split.
--
-- ---------------------------------------------------------------------------
-- PER LOCATION MEANS MEMBERSHIP, NOT A PARTITION
-- ---------------------------------------------------------------------------
-- A patient linked to both clinics is counted at BOTH, so the location rows do
-- not sum to the total. The total is printed on its own line as DISTINCT
-- patients. A patient with NO `patient_locations` row appears only in the
-- total, and is reported separately because PL-09 scopes visibility by that
-- table - such a patient is unreachable for a second, unrelated reason.
-- ===========================================================================

-- NO TENANT IS GUESSED. An earlier draft opened with
--   SELECT id FROM tenants ORDER BY created_at LIMIT 1
-- and, on a database with more than one tenant, silently reported a DIFFERENT
-- clinic's numbers with no sign anything was wrong. Production has one tenant,
-- so the guess would have been right there and wrong everywhere it was tested.
-- Every row below carries its tenant id instead, so reading the wrong one is
-- impossible rather than merely unlikely.
WITH active AS (
  SELECT p.id, p.tenant_id, p.full_name, p.patient_number
    FROM patients p
   WHERE p.deleted_at IS NULL
),
classified AS (
  SELECT a.id,
         a.tenant_id,
         a.full_name,
         a.patient_number,
         -- Tokens on ANY whitespace run, trimmed first, so a trailing space is
         -- not a token. `regexp_split_to_array` on '\s+' over a trimmed string
         -- gives exactly the app's `split(/\s+/).filter(Boolean)`.
         array_length(regexp_split_to_array(btrim(a.full_name), '\s+'), 1) AS tokens,
         -- A: three or more tokens means first-plus-surname was NOT adjacent,
         -- so the old predicate could never match it.
         array_length(regexp_split_to_array(btrim(a.full_name), '\s+'), 1) >= 3 AS hidden_by_order,
         -- B: any character the fold changes. Compared against the SAME map the
         -- application uses, so this cannot drift from the fix.
         lower(a.full_name) <> translate(lower(a.full_name),
               'áàâãäçéèêëíìîïóòôõöúùûüýÿñ', 'aaaaaceeeeiiiiooooouuuuyyn') AS hidden_by_accent
    FROM active a
),
loc AS (
  SELECT l.id, l.tenant_id, l.name FROM locations l
)

-- ---------------------------------------------------------------------------
-- 1. THE HEADLINE, PER LOCATION AND IN TOTAL
-- ---------------------------------------------------------------------------
SELECT 1 AS ord, 'PER LOCATION' AS section,
       l.name || '  [tenant ' || left(l.tenant_id::text, 8) || ']' AS bucket,
       count(DISTINCT c.id)::text AS active_patients,
       count(DISTINCT c.id) FILTER (WHERE c.hidden_by_order)::text  AS hidden_by_order,
       count(DISTINCT c.id) FILTER (WHERE c.hidden_by_accent)::text AS hidden_by_accent,
       count(DISTINCT c.id) FILTER (WHERE c.hidden_by_order OR c.hidden_by_accent)::text AS hidden_either
  FROM loc l
  JOIN patient_locations pl ON pl.location_id = l.id
  JOIN classified c ON c.id = pl.patient_id AND c.tenant_id = l.tenant_id
 GROUP BY l.name, l.tenant_id

UNION ALL
SELECT 2, 'TOTAL', 'tenant ' || left(tenant_id::text, 8) || ' - DISTINCT, not the sum above',
       count(*)::text,
       count(*) FILTER (WHERE hidden_by_order)::text,
       count(*) FILTER (WHERE hidden_by_accent)::text,
       count(*) FILTER (WHERE hidden_by_order OR hidden_by_accent)::text
  FROM classified
 GROUP BY tenant_id

UNION ALL
-- A patient with no location link is invisible to reception for a SECOND and
-- unrelated reason (PL-09 scopes by patient_locations). Counted apart so the
-- two causes are never added together.
SELECT 3, 'NO LOCATION LINK', 'tenant ' || left(c.tenant_id::text, 8) || ' - in no patient_locations row',
       count(*)::text,
       count(*) FILTER (WHERE hidden_by_order)::text,
       count(*) FILTER (WHERE hidden_by_accent)::text,
       count(*) FILTER (WHERE hidden_by_order OR hidden_by_accent)::text
  FROM classified c
 WHERE NOT EXISTS (SELECT 1 FROM patient_locations pl WHERE pl.patient_id = c.id)
 GROUP BY c.tenant_id

UNION ALL
-- ---------------------------------------------------------------------------
-- 2. THE SHAPE OF THE NAMES, so the headline is checkable rather than trusted.
-- ---------------------------------------------------------------------------
SELECT 4, 'TOKEN COUNT', 'tenant ' || left(tenant_id::text, 8) || ' - ' || tokens::text || ' token(s)',
       count(*)::text, '', '', ''
  FROM classified
 GROUP BY tenant_id, tokens

ORDER BY ord, bucket;
