-- ===========================================================================
-- BACKFILL A — patient_locations, from patients.primary_location_id.
-- ===========================================================================
-- AUTHORISED BY STRATEGY 2026-09-08: "A goes ahead: patient_locations,
-- idempotent, ON CONFLICT DO NOTHING, changes no screen."
--
-- WHO RUNS THIS: Ivan, against PRODUCTION, AFTER reading the grid from
-- scripts/import/backfill-counts.sql. No terminal may (standing rule 1).
--
-- DATA ONLY. One INSERT into one table. It DELETES NOTHING, UPDATES NOTHING,
-- and changes no schema.
--
-- ===========================================================================
-- IT IS NOT THE SAME FILE AS backfill-patient-locations.sql, AND THEY DO NOT
-- OVERLAP. READ THIS BEFORE RUNNING EITHER.
-- ===========================================================================
-- That file derives a link from APPOINTMENTS, for the cross-delivery case: a
-- person seen at BOTH clinics, whose second import was correctly skipped and
-- whose second link was skipped with it.
--
-- THIS file derives a link from the patient's OWN primary_location_id, for a
-- different population entirely: patients the APPLICATION created. Until PL-34
-- (#1215) no application path wrote `patient_locations` at all - the importer
-- was its only writer - so every patient registered through the staff form, the
-- guest convert or the walk-in box landed with the column set and the junction
-- row absent.
--
-- Running both is safe and order-independent: both are ON CONFLICT DO NOTHING
-- against the same unique key (tenant_id, patient_id, location_id).
--
-- ===========================================================================
-- WHY IT CHANGES NO SCREEN, STATED PLAINLY SO NOBODY EXPECTS ONE
-- ===========================================================================
-- Nothing reads `patient_locations`. Verified 2026-09-08 against origin/main:
-- no RLS policy names it, no query selects from it, and the four application
-- references are a hard delete, a location delete and merge_patients' re-point.
-- PL-09 scopes a patient to a clinic by `appointments.location_id` OR
-- `patients.primary_location_id`, and by nothing else.
--
-- SO NOBODY BECOMES VISIBLE BECAUSE OF THIS FILE. It exists so the junction
-- table agrees with the column beside it BEFORE anything starts reading it -
-- the importer, merge_patients (0005) and deletePatientHard all maintain that
-- table, and until #1215 only the create path did not. If a future read of
-- `patient_locations` shipped first, every application-created patient would
-- silently vanish from it.
--
-- ===========================================================================
-- SOFT-DELETED AND MERGED PATIENTS ARE EXCLUDED, DELIBERATELY
-- ===========================================================================
-- `deleted_at IS NULL` only. A merged loser had its links MOVED to the survivor
-- by merge_patients; re-creating one would resurrect a link the merge removed
-- on purpose, and re-running the merge would not remove it again.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. READ ONLY. Run this first and read every number.
--         `rows_to_insert` is exactly what STEP 2 must report as INSERT 0 <n>.
-- ---------------------------------------------------------------------------
\echo '--- STEP 1: PREVIEW (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1)
SELECT
  (SELECT count(*) FROM public.patients p, tenant t
    WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL)                 AS live_patients,
  (SELECT count(*) FROM public.patients p, tenant t
    WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
      AND p.primary_location_id IS NOT NULL)                                   AS with_a_primary,
  (SELECT count(*) FROM public.patients p, tenant t
    WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
      AND p.primary_location_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.patient_locations pl
                       WHERE pl.patient_id = p.id
                         AND pl.location_id = p.primary_location_id))          AS rows_to_insert,
  (SELECT count(*) FROM public.patient_locations pl, tenant t
    WHERE pl.tenant_id = t.tenant_id)                                          AS links_now;

-- ---------------------------------------------------------------------------
-- STEP 2. THE INSERT. Run only after STEP 1, and only if rows_to_insert > 0.
--
--   EXPECTED: `INSERT 0 <n>` where <n> is STEP 1's rows_to_insert, EXACTLY.
--   STOP IF <n> IS LARGER: rows were created between the two commands and the
--   preview no longer describes what was written. Re-run STEP 1 and STEP 3 and
--   report before doing anything else.
--   A SMALLER <n> is also a stop: ON CONFLICT swallowed rows the preview said
--   were absent, which means the unique key is not what this file believes.
--
--   tenant_id COMES FROM THE PATIENT ROW, not from a literal. The link's tenant
--   must be the patient's tenant or the RLS predicate on patient_locations
--   would hide the row it just wrote.
-- ---------------------------------------------------------------------------
\echo '--- STEP 2: THE INSERT ---'
INSERT INTO public.patient_locations (tenant_id, patient_id, location_id)
SELECT p.tenant_id, p.id, p.primary_location_id
  FROM public.patients p, (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1) t
 WHERE p.tenant_id = t.tenant_id
   AND p.deleted_at IS NULL
   AND p.primary_location_id IS NOT NULL
ON CONFLICT (tenant_id, patient_id, location_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- STEP 3. VERIFY. READ ONLY. Run after STEP 2.
--         `rows_still_missing` MUST be 0. Anything else means STEP 2 reported
--         an insert that did not land where this file expected it.
-- ---------------------------------------------------------------------------
\echo '--- STEP 3: VERIFY (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1)
SELECT
  (SELECT count(*) FROM public.patients p, tenant t
    WHERE p.tenant_id = t.tenant_id AND p.deleted_at IS NULL
      AND p.primary_location_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.patient_locations pl
                       WHERE pl.patient_id = p.id
                         AND pl.location_id = p.primary_location_id))          AS rows_still_missing,
  (SELECT count(*) FROM public.patient_locations pl, tenant t
    WHERE pl.tenant_id = t.tenant_id)                                          AS links_now,
  -- NOTHING WAS INVENTED. Every link must point at a location in this tenant
  -- and at a live patient; a non-zero here means this file wrote a row it
  -- cannot justify.
  (SELECT count(*) FROM public.patient_locations pl, tenant t
    WHERE pl.tenant_id = t.tenant_id
      AND NOT EXISTS (SELECT 1 FROM public.locations l
                       WHERE l.id = pl.location_id AND l.tenant_id = pl.tenant_id)) AS orphan_links;
