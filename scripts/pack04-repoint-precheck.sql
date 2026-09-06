-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production, BEFORE the apply. Nothing writes.
-- ===================================================================
-- PACK-04 (a). The owner's ruling of 2026-09-05: "Repoint that pacote to the
-- live NESA (270fb115)."
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pack04-repoint-precheck.sql
--
-- ===================================================================
-- ONE CORRECTION TO THE INSTRUCTION, AND IT CHANGES WHAT THE WRITE MEANS
-- ===================================================================
-- The dispatch calls this "a production data write on one row" and describes it
-- as repointing "Teste OsteoJP's pacote instance". It IS one row - but not one
-- patient's row.
--
-- `base_service_id` lives on `service_packs`, the pacote CATALOGUE row, not on
-- `patient_pack_instances`. The instance has no such column. So the UPDATE
-- touches one `service_packs` row and thereby repoints the binding for EVERY
-- patient instance of that pacote at once.
--
-- If Teste OsteoJP is the only holder, the two readings coincide and the write
-- is exactly what the ruling intends. If he is not, this write moves other
-- people's paid sessions too, and that is a fact the owner has to see BEFORE he
-- runs the apply rather than discover afterwards. Section 3 is that count and
-- it is the reason this file exists as a separate step.
--
-- ===================================================================
-- THE SECOND THING TO LOOK AT: LOCATION
-- ===================================================================
-- 7e3359a7 was "Tratamento NESA", the LINDA-A-VELHA NESA (attested read
-- 2026-07-21, docs/recon/W10-04b-catalog-delta.md). 270fb115 is "NESA", which
-- that same read records as the CASTELO BRANCO row. The owner attested on
-- 2026-08-02 that NESA is now offered at BOTH locations, which is what makes
-- the ruling coherent - but section 5 prints the live NESA's price rows so that
-- is confirmed on the day rather than remembered.
--
-- PII: prints patient_number and full_name, deliberately, because the ruling
-- asks for the patient to be named. No NIF, no phone, no clinical value.

\pset pager off
\pset format aligned

\echo '=== 1. THE PACOTE INSTANCE THE CARD IDENTIFIED (e0f84a75) ==='
SELECT ppi.id            AS instance_id,
       p.patient_number,
       p.full_name,
       ppi.sessions_total,
       ppi.legacy_consumed,
       ppi.status,
       sp.id             AS pack_id,
       sp.name           AS pack_name,
       sp.base_service_id
  FROM public.patient_pack_instances ppi
  JOIN public.patients p       ON p.id = ppi.patient_id
  JOIN public.service_packs sp ON sp.id = ppi.pack_id
 WHERE ppi.id = 'e0f84a75-0000-0000-0000-000000000000'::uuid
    OR ppi.id::text LIKE 'e0f84a75%';

\echo ''
\echo '=== 2. THE TWO SERVICES, SIDE BY SIDE. Expect FROM archived, TO live. ==='
SELECT sv.id, sv.name, sv.is_active, sv.duration_min, sv.created_at,
       (SELECT count(*) FROM public.appointments a WHERE a.service_id = sv.id) AS appointments
  FROM public.services sv
 WHERE sv.id IN ('7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid,
                 '270fb115-154a-4c4e-a2f7-f4976c71cfbd'::uuid)
 ORDER BY sv.is_active;

\echo ''
\echo '=== 3. THE BLAST RADIUS. Every holder of the pacote this write repoints. ==='
\echo '--- ONE row here means the ruling and the statement mean the same thing.'
\echo '--- More than one means this write moves other patients sessions too.'
SELECT sp.id     AS pack_id,
       sp.name   AS pack_name,
       l.name    AS pack_location,
       p.patient_number,
       p.full_name,
       ppi.id    AS instance_id,
       ppi.sessions_total,
       ppi.legacy_consumed,
       ppi.sessions_total - ppi.legacy_consumed - count(a.id) FILTER (
         WHERE a.status IN ('scheduled','confirmed','completed','no_show')
       )         AS sessions_available
  FROM public.service_packs sp
  JOIN public.patient_pack_instances ppi ON ppi.pack_id = sp.id
  JOIN public.patients p                 ON p.id = ppi.patient_id
  LEFT JOIN public.locations l           ON l.id = sp.location_id
  LEFT JOIN public.appointments a        ON a.pack_instance_id = ppi.id
 WHERE sp.base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid
 GROUP BY sp.id, sp.name, l.name, p.patient_number, p.full_name,
          ppi.id, ppi.sessions_total, ppi.legacy_consumed
 ORDER BY p.patient_number;

\echo ''
\echo '=== 4. WHAT THE REPOINT REPAIRS. Appointments that become linkable. ==='
\echo '--- Appointments of the holders carrying the LIVE NESA today. These are'
\echo '--- the ones that answer service_mismatch now and stop after the write.'
SELECT a.id, a.starts_at, a.status, a.service_id, a.pack_instance_id
  FROM public.appointments a
 WHERE a.service_id = '270fb115-154a-4c4e-a2f7-f4976c71cfbd'::uuid
   AND a.patient_id IN (
        SELECT ppi.patient_id
          FROM public.patient_pack_instances ppi
          JOIN public.service_packs sp ON sp.id = ppi.pack_id
         WHERE sp.base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid)
 ORDER BY a.starts_at DESC
 LIMIT 50;

\echo ''
\echo '=== 5. IS THE LIVE NESA OFFERED WHERE THE PACOTE IS SOLD? ==='
SELECT l.name AS location, slp.price_cents, slp.is_active
  FROM public.service_location_prices slp
  JOIN public.locations l ON l.id = slp.location_id
 WHERE slp.service_id = '270fb115-154a-4c4e-a2f7-f4976c71cfbd'::uuid
 ORDER BY l.name;

\echo ''
\echo '=== 6. THE PIN. The apply refuses unless this reads exactly 1. ==='
SELECT count(*) AS rows_the_apply_will_touch
  FROM public.service_packs
 WHERE base_service_id = '7e3359a7-219c-44c7-a84d-0dc38373b1b0'::uuid;
