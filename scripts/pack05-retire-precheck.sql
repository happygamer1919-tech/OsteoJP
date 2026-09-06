-- ===================================================================
-- READ-ONLY. Run BEFORE the apply. Nothing writes.
-- ===================================================================
-- PACK-05. OWNER RULING 2026-09-06: RETIRE BOTH PRODUCTS.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pack05-retire-precheck.sql
--
-- ===================================================================
-- THE ONE ROW THAT DECIDES, AND IT IS SECTION 2
-- ===================================================================
-- `patient_instances` must be 0 for BOTH. The ruling is explicit: if either row
-- shows a patient instance, DO NOT WRITE - money has moved, and the decision
-- stops being the owner's and becomes JP's. The apply refuses on the same
-- condition, so this is the warning and that is the lock; neither is trusted
-- alone.
--
-- WHY DEACTIVATE RATHER THAN DELETE OR REPOINT. Deactivating is REVERSIBLE and
-- carries no commercial judgement. `service_packs.is_active = true` is the exact
-- filter the create path uses to offer a pacote as a bookable type
-- (apps/web/lib/scheduling/data.ts:378, "ACTIVE packs as bookable types"), so
-- clearing it makes the product unsellable and changes nothing else. Repointing
-- the base service is the other half and it needs JP's knowledge of what the
-- clinic actually offers in their place; it stays a separate, later step.
--
-- PII: none. No patient name, number, phone, NIF or clinical value is selected -
-- only a COUNT of instances.

\pset pager off
\pset format aligned

\echo '=== 1. THE TWO PRODUCTS, AND THE ARCHIVED SERVICES THEY SIT ON ==='
\echo '--- Expect 2 rows, both pack_active = t, both base_active = f, both name -'
SELECT sp.id            AS pack_id,
       sp.name          AS pack_name,
       sp.is_active     AS pack_active,
       sp.session_count,
       sp.price_cents,
       coalesce(l.name, '(all locations)') AS pack_location,
       sv.id            AS base_service_id,
       sv.name          AS base_service_name,
       sv.is_active     AS base_active
  FROM public.service_packs sp
  JOIN public.services sv      ON sv.id = sp.base_service_id
  LEFT JOIN public.locations l ON l.id = sp.location_id
 WHERE sp.id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                 'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
 ORDER BY sp.name;

\echo ''
\echo '=== 2. THE STOP CONDITION. patient_instances MUST be 0 for BOTH. ==='
\echo '--- ANY non-zero here and the write does not happen. Money has moved and'
\echo '--- the decision is JPs, not the owners.'
SELECT sp.id                  AS pack_id,
       sp.name                AS pack_name,
       count(ppi.id)          AS patient_instances,
       count(ppi.id) FILTER (WHERE ppi.status IS NOT NULL) AS instances_any_status
  FROM public.service_packs sp
  LEFT JOIN public.patient_pack_instances ppi ON ppi.pack_id = sp.id
 WHERE sp.id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                 'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
 GROUP BY sp.id, sp.name
 ORDER BY sp.name;

\echo ''
\echo '=== 3. THE PIN. The apply refuses unless this reads exactly 2. ==='
SELECT count(*) AS rows_the_apply_will_touch
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE sp.id IN ('be8ec147-56f5-4c3f-a642-ebfb31e915f4'::uuid,
                 'e291d05f-899f-40d3-89af-c8537c4afdad'::uuid)
   AND sp.is_active
   AND NOT sv.is_active;

\echo ''
\echo '=== 4. NOTHING ELSE IS SOLD ON AN ARCHIVED SERVICE ==='
\echo '--- After the write this must be the same 2 rows, then 0 active ones.'
SELECT sp.id, sp.name, sp.is_active AS pack_active, sv.name AS base_service_name
  FROM public.service_packs sp
  JOIN public.services sv ON sv.id = sp.base_service_id
 WHERE NOT sv.is_active
 ORDER BY sp.name;
