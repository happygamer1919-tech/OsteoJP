-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. NO PARAMETER. Nothing writes.
-- ===================================================================
-- PACK-03. THIS IS THE ONE THAT BLOCKS #1159, AND IT TAKES NOTHING TO RUN.
--
--   cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
--   git fetch origin && \
--   git checkout origin/pack/PACK-03-pacote-binds-to-one-service && \
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pacote-service-drift.sql
--
-- WHAT IT MEASURES. Appointments that draw a session from a pacote whose base
-- service is NOT the service on the appointment. That is the state the
-- unguarded `updateAppointment` allowed: change Servico on a marcacao that
-- already draws a NESA session, save, and the row keeps its pack_instance_id
-- while the derived balance goes on counting it.
--
-- IT MUST BE RUN BEFORE #1159 MERGES. After the edit guard ships the state is
-- unreachable, and a zero can no longer tell "none happened" from "none can
-- happen". Those are different facts and only one of them can be measured now.
--
-- IT IS SPLIT OUT OF pacote-nesa-diagnosis.sql ON PURPOSE. That one needs a
-- patient identified; this one needs nothing, and making the measurement that
-- blocks a merge wait on identifying one patient was the wrong order.
--
-- PII: ids, timestamps and counts only. No name, no NIF, no phone, no clinical
-- value.

\pset pager off
\pset format aligned

\echo '=== 1. THE COUNT. An empty section 2 is only a measurement with this. ==='
SELECT count(*) FILTER (WHERE a.pack_instance_id IS NOT NULL)                   AS linked_appointments,
       count(*) FILTER (WHERE a.pack_instance_id IS NOT NULL
                          AND a.service_id IS DISTINCT FROM sp.base_service_id) AS drifted,
       count(*) FILTER (WHERE a.pack_instance_id IS NOT NULL
                          AND a.service_id IS NULL)                             AS drifted_no_service
  FROM public.appointments a
  LEFT JOIN public.patient_pack_instances ppi ON ppi.id = a.pack_instance_id
  LEFT JOIN public.service_packs sp           ON sp.id = ppi.pack_id;

\echo ''
\echo '=== 2. EVERY DRIFTED ROW. Empty here plus 0 above means it never happened. ==='
SELECT a.id               AS appointment_id,
       a.tenant_id,
       a.starts_at,
       a.status,
       a.service_id       AS appt_service_id,
       sp.base_service_id AS pack_service_id,
       ppi.id             AS instance_id
  FROM public.appointments a
  JOIN public.patient_pack_instances ppi ON ppi.id = a.pack_instance_id
  JOIN public.service_packs sp           ON sp.id = ppi.pack_id
 WHERE a.service_id IS DISTINCT FROM sp.base_service_id
 ORDER BY a.starts_at DESC;
