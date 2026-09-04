-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. Nothing here writes.
-- ===================================================================
-- PACK-03 item 4. BLUE may not connect to production (standing rule 1), so this
-- is authored here and run by Ivan, who pastes the output back.
--
-- HOW TO RUN IT, with the variable names that exist in his environment:
--
--   cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
--   git fetch origin && git checkout origin/pack/PACK-03-pacote-binds-to-one-service
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 \
--        -v patient_id="'<the patient uuid>'" \
--        -f scripts/pacote-nesa-diagnosis.sql
--
-- The quotes INSIDE the -v value are deliberate: psql substitutes the text
-- verbatim, so the uuid has to arrive already quoted.
--
-- ===================================================================
-- WHAT IT IS FOR. He selected NESA on the marcação and the notice still
-- refused, which the predicates say cannot happen.
-- ===================================================================
-- After PACK-03, `offerablePacks` keeps a pacote only when
-- `pack.baseServiceId === form.serviceId` — an EXACT uuid comparison. Two
-- things make that fail while both sides read "NESA" on screen:
--
--   (A) TWO services named NESA. The Serviço select holds one id, the pacote
--       was sold against the other, and the two ids never match. Nothing on
--       either screen shows an id, so they look identical.
--   (B) The pacote's base_service_id points at a DIFFERENT service from the one
--       its NAME implies - "Pacote NESA 10" sold against Fisioterapia. The
--       pacote name is free text; base_service_id is the fact.
--
-- Sections 1 to 4 separate those two. They are reported as facts, not verdicts:
-- which one it is decides what gets built next, and that is not this script's
-- call to make.
--
-- PII: this prints service names, pacote names, ids and counts. No patient
-- name, no NIF, no phone, no clinical value. Section 5 prints ids only.

\pset format aligned

\echo '=== 1. EVERY service whose name looks like NESA ==================='
\echo 'More than one row here IS cause (A), and the ids are what differ.'
SELECT s.id,
       s.tenant_id,
       s.name,
       s.is_active,
       s.duration_min,
       (SELECT count(*) FROM public.service_packs sp WHERE sp.base_service_id = s.id) AS packs_bound_to_it
  FROM public.services s
 WHERE s.name ILIKE '%nesa%'
 ORDER BY s.tenant_id, s.name, s.id;

\echo ''
\echo '=== 2. THIS PATIENT''S PACOTES, and what each one is REALLY for ==='
\echo 'base_service_id is the fact; pack_name is free text. A mismatch between'
\echo 'the two columns on the right IS cause (B).'
SELECT ppi.id                AS instance_id,
       sp.id                 AS pack_id,
       sp.name               AS pack_name,
       sp.base_service_id,
       sv.name               AS base_service_name,
       sp.is_active          AS pack_is_active,
       ppi.sessions_total,
       ppi.legacy_consumed,
       (SELECT count(*)
          FROM public.appointments a
         WHERE a.pack_instance_id = ppi.id
           AND a.status <> 'cancelled')                       AS linked_not_cancelled,
       greatest(0, ppi.sessions_total - ppi.legacy_consumed
                   - (SELECT count(*)
                        FROM public.appointments a
                       WHERE a.pack_instance_id = ppi.id
                         AND a.status <> 'cancelled'))        AS sessions_available,
       ppi.purchased_at
  FROM public.patient_pack_instances ppi
  JOIN public.service_packs sp ON sp.id = ppi.pack_id
  JOIN public.services      sv ON sv.id = sp.base_service_id
 WHERE ppi.patient_id = :patient_id
 ORDER BY ppi.purchased_at DESC;

\echo ''
\echo '=== 3. THE APPOINTMENT HE TRIED TO LINK ==========================='
\echo 'service_id here is the LEFT side of the comparison. Compare it, as a'
\echo 'uuid, with base_service_id in section 2. Equal or not equal is the'
\echo 'whole answer.'
SELECT a.id                  AS appointment_id,
       a.starts_at,
       a.status,
       a.service_id,
       sv.name               AS service_name,
       a.pack_instance_id,
       a.location_id
  FROM public.appointments a
  LEFT JOIN public.services sv ON sv.id = a.service_id
 WHERE a.patient_id = :patient_id
 ORDER BY a.starts_at DESC
 LIMIT 10;

\echo ''
\echo '=== 4. THE COMPARISON, COMPUTED RATHER THAN EYEBALLED ============='
\echo 'One row per (recent appointment x this patient''s pacotes). `offered`'
\echo 'is exactly what offerablePacks() will answer after PACK-03 ships.'
SELECT a.id                                   AS appointment_id,
       a.starts_at,
       sva.name                               AS appointment_service,
       sp.name                                AS pack_name,
       svp.name                               AS pack_base_service,
       (a.service_id = sp.base_service_id)    AS ids_match,
       CASE
         WHEN a.service_id IS NULL                 THEN 'offered (no service chosen yet)'
         WHEN a.service_id = sp.base_service_id    THEN 'offered'
         ELSE                                           'hidden - different service'
       END                                    AS offered
  FROM public.appointments a
  CROSS JOIN LATERAL (
    SELECT ppi.pack_id FROM public.patient_pack_instances ppi
     WHERE ppi.patient_id = a.patient_id
  ) inst
  JOIN public.service_packs sp  ON sp.id = inst.pack_id
  JOIN public.services      svp ON svp.id = sp.base_service_id
  LEFT JOIN public.services sva ON sva.id = a.service_id
 WHERE a.patient_id = :patient_id
 ORDER BY a.starts_at DESC, sp.name
 LIMIT 40;

\echo ''
\echo '=== 5. TENANT-WIDE: linked appointments whose service DRIFTED ====='
\echo 'The only place a human decision could be owed. Each row is an'
\echo 'appointment drawing a session from a pacote for a DIFFERENT service -'
\echo 'the state the unguarded updateAppointment allowed. IDS ONLY, no names.'
\echo ''
\echo 'MEASURE THIS BEFORE THE FIX MERGES. Once updateAppointment refuses'
\echo 'pack_service_locked the state becomes unreachable, and a count taken'
\echo 'afterwards can no longer tell "none happened" from "none can happen".'
SELECT a.id                AS appointment_id,
       a.tenant_id,
       a.starts_at,
       a.status,
       a.service_id        AS appointment_service_id,
       sp.base_service_id  AS pack_base_service_id,
       ppi.id              AS instance_id
  FROM public.appointments a
  JOIN public.patient_pack_instances ppi ON ppi.id = a.pack_instance_id
  JOIN public.service_packs sp           ON sp.id = ppi.pack_id
 WHERE a.pack_instance_id IS NOT NULL
   AND a.service_id IS DISTINCT FROM sp.base_service_id
 ORDER BY a.starts_at DESC;

\echo ''
\echo '=== 5b. THE COUNT, so an empty section 5 is a MEASUREMENT ========='
\echo 'Zero rows above and a failed query look the same in a paste. This says'
\echo 'which it was.'
SELECT count(*) FILTER (WHERE a.pack_instance_id IS NOT NULL)                    AS linked_appointments_total,
       count(*) FILTER (WHERE a.pack_instance_id IS NOT NULL
                          AND a.service_id IS DISTINCT FROM sp.base_service_id)  AS drifted
  FROM public.appointments a
  LEFT JOIN public.patient_pack_instances ppi ON ppi.id = a.pack_instance_id
  LEFT JOIN public.service_packs sp           ON sp.id = ppi.pack_id;
