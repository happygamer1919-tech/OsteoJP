-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. Nothing here writes.
-- ===================================================================
-- PACK-03. He selected NESA on the marcacao and the notice still refused, which
-- the predicates say cannot happen.
--
--   cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
--   git fetch origin && \
--   git checkout origin/pack/PACK-03-pacote-binds-to-one-service && \
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v patient_number=6837 \
--        -f scripts/pacote-nesa-diagnosis.sql
--
-- ===================================================================
-- IT TAKES THE PATIENT NUMBER OFF HIS SCREEN. THE FIRST DRAFT ASKED FOR A
-- UUID, WHICH THE PRODUCT NEVER DISPLAYS AND NEVER WILL.
-- ===================================================================
-- His screen reads "No 6837". Pass that. A plain integer also removes the
-- quoting trap the uuid version carried, where the value had to arrive already
-- wrapped in single quotes inside the -v argument.
--
-- WHY THE NUMBER AND NOT THE PHONE. `patients.patient_number` is an integer
-- under UNIQUE (tenant_id, patient_number) - one row per tenant, by
-- construction, and it is the identifier the interface prints. `patients.phone`
-- is varchar(32) stored exactly as it was typed; migration 0062 exists BECAUSE
-- the stored form varies enough that a literal match misses real patients, so a
-- phone lookup would need normalising and could still match more than one row.
-- The number is the key the product and the database agree on.
--
-- SECTION 0 IS A GUARD, NOT A COURTESY. If the number does not resolve to
-- exactly one patient, every later section returns nothing - and "no rows"
-- would read as "no pacotes", which is the opposite of the truth. Section 0
-- says which it is before anything else runs.
--
-- WHAT IT SEPARATES. After PACK-03 the notice keeps a pacote only when
-- `pack.baseServiceId === form.serviceId`, an EXACT uuid comparison. Two things
-- make that fail while both sides read "NESA" on screen:
--   (A) TWO services named NESA - the Select holds one id, the pacote was sold
--       against the other, and nothing on either screen shows an id.
--   (B) The pacote's base_service_id points at a DIFFERENT service from the one
--       its NAME implies. The pacote name is free text; base_service_id is the
--       fact.
--
-- PII: service names, pacote names, ids, counts. No patient name, no NIF, no
-- phone, no clinical value.

\pset pager off
\pset format aligned

\echo '=== 0. GUARD: the number must resolve to exactly one patient ==='
SELECT :patient_number                              AS asked_for,
       count(*)::text                               AS patients_matching,
       coalesce(string_agg(p.id::text, ' '), 'none') AS resolved_uuid,
       CASE WHEN count(*) = 1 THEN 'OK'
            WHEN count(*) = 0 THEN 'FAIL - no such patient number; sections below will be empty'
            ELSE 'FAIL - ambiguous across tenants; sections below mix patients'
       END                                          AS verdict
  FROM public.patients p
 WHERE p.patient_number = :patient_number;

\echo ''
\echo '=== 1. THE WHOLE SERVICE CATALOG. NOT a name search. ==='
\echo 'The first draft of this section filtered on name ILIKE %nesa% and MISSED'
\echo 'the answer: the pacote was bound to a service ARCHIVED by renaming it to'
\echo '"-", so a search for the name it used to have could not find it. A script'
\echo 'that looks for a row by the value that moved is a script that cannot see'
\echo 'the thing that moved. Every row, with what points at it.'
SELECT s.id,
       quote_literal(s.name) AS name_literal,
       s.is_active,
       (SELECT count(*) FROM public.service_packs sp WHERE sp.base_service_id = s.id) AS packs_bound,
       (SELECT count(*) FROM public.appointments a WHERE a.service_id = s.id)         AS appointments
  FROM public.services s
 ORDER BY appointments DESC, s.name;

\echo ''
\echo '=== 1b. ARCHIVED SERVICES THAT STILL CARRY REFERENCES ==='
\echo 'A service is archived by renaming it and clearing is_active; the pacote'
\echo 'and appointment rows pointing at it survive that, and nothing warns.'
SELECT s.id, quote_literal(s.name) AS name_literal,
       (SELECT count(*) FROM public.service_packs sp WHERE sp.base_service_id = s.id) AS packs_bound,
       (SELECT count(*) FROM public.appointments a WHERE a.service_id = s.id)         AS appointments
  FROM public.services s
 WHERE s.is_active = false
 ORDER BY packs_bound DESC, appointments DESC;

\echo ''
\echo '=== 2. HIS PACOTES, and what each one is REALLY for ==='
\echo 'pack_name is free text; base_service_name is the fact. A mismatch IS (B).'
SELECT ppi.id            AS instance_id,
       sp.name           AS pack_name,
       sv.name           AS base_service_name,
       sp.base_service_id,
       ppi.sessions_total,
       greatest(0, ppi.sessions_total - ppi.legacy_consumed
                   - (SELECT count(*) FROM public.appointments a
                       WHERE a.pack_instance_id = ppi.id
                         AND a.status <> 'cancelled'))  AS sessions_available
  FROM public.patients p
  JOIN public.patient_pack_instances ppi ON ppi.patient_id = p.id
  JOIN public.service_packs sp           ON sp.id = ppi.pack_id
  JOIN public.services      sv           ON sv.id = sp.base_service_id
 WHERE p.patient_number = :patient_number
 ORDER BY ppi.purchased_at DESC;

\echo ''
\echo '=== 3. HIS RECENT MARCACOES, with the service_id being compared ==='
SELECT a.id           AS appointment_id,
       a.starts_at,
       a.status,
       sv.name        AS service_name,
       a.service_id,
       a.pack_instance_id
  FROM public.patients p
  JOIN public.appointments a ON a.patient_id = p.id
  LEFT JOIN public.services sv ON sv.id = a.service_id
 WHERE p.patient_number = :patient_number
 ORDER BY a.starts_at DESC
 LIMIT 10;

\echo ''
\echo '=== 4. THE COMPARISON, COMPUTED RATHER THAN EYEBALLED ==='
\echo '`offered` is exactly what offerablePacks() answers after PACK-03.'
SELECT a.starts_at,
       sva.name AS appt_service,
       sp.name  AS pack_name,
       svp.name AS pack_base_service,
       CASE
         WHEN a.service_id IS NULL              THEN 'offered - no service chosen'
         WHEN a.service_id = sp.base_service_id THEN 'offered'
         ELSE                                        'hidden - different service'
       END      AS offered
  FROM public.patients p
  JOIN public.appointments a             ON a.patient_id = p.id
  JOIN public.patient_pack_instances ppi ON ppi.patient_id = p.id
  JOIN public.service_packs sp           ON sp.id = ppi.pack_id
  JOIN public.services      svp          ON svp.id = sp.base_service_id
  LEFT JOIN public.services sva          ON sva.id = a.service_id
 WHERE p.patient_number = :patient_number
 ORDER BY a.starts_at DESC, sp.name
 LIMIT 40;
