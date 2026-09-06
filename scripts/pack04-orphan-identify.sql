-- ===================================================================
-- READ-ONLY. Run by the OWNER, on production. NO PARAMETER. Nothing writes.
-- ===================================================================
-- PACK-04 (b). The owner's ruling of 2026-09-05 says to repoint the other two
-- orphaned pacotes "if you can identify them", and NOT to guess. This script is
-- what turns that into a decidable question instead of a hunch.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/pack04-orphan-identify.sql
--
-- WHAT IS ALREADY KNOWN FROM THE REPO, so this run only has to fill the gaps.
-- The 2026-07-21 attested catalog reconciliation (docs/recon/W10-04b-catalog-
-- delta.md, docs/design/QUESTIONS.md Q-W10-04b-0/-1, DECISIONS.md) names two of
-- the three services that are `-` today, by id:
--
--   7e3359a7  was "Tratamento NESA"        - the LV NESA, active, offered LV 5000
--   a3c1ced1  was "Tratamento Terapeutico" - offered LV 5500, base of the active
--                                            LV pack "Pacote 10 - Tratamento
--                                            Terapeutico" (45000). It was
--                                            deliberately flipped is_active=true
--                                            on 2026-07-21 under AUTORIZO
--                                            CATALOGO plan v1 BECAUSE LV could
--                                            not book it otherwise.
--   d75f251d  appears NOWHERE in this repo except the PACK-04 card. Unrecorded.
--
-- So two of the three were live catalog rows that a documented owner ruling had
-- deliberately activated, and something later renamed them to `-` and cleared
-- is_active. Section 3 is the only part that can say what should replace them.
--
-- SECTION 3 IS THE ONE THAT DECIDES, and it is deliberately empirical rather
-- than name-based. #1170 was a script that searched services BY NAME when the
-- name was the value that had moved; every one of these rows is named `-`, so
-- matching on the name is guaranteed to find nothing. Instead it asks what
-- service the patients WHO HOLD EACH PACOTE are actually being booked for. A
-- pacote whose holders all attend one live service has an obvious equivalent; a
-- pacote whose holders attend three does not, and must be left alone.
--
-- ===================================================================
-- SR-54. WHAT SECTION 3 CANNOT SEPARATE. Learned from this script's
-- FIRST PRODUCTION RUN, 2026-09-06, and binding on every later one.
-- ===================================================================
-- Section 3 ranks candidates by how many appointments the pacote's HOLDERS
-- attend. On production it returned THREE candidates for 7e3359a7, not one:
--
--     NESA (270fb115)              2 appointments
--     Osteopatia / Posturologia    1
--     Fisioterapia                 1
--
-- By the rule three lines above, that is NOT an identification and the pacote is
-- left alone. THE REPOINT WAS AUTHORISED ANYWAY, and the reason is outside this
-- script and outside the data it reads: the only holder is the OWNER'S OWN TEST
-- ACCOUNT, and the Osteopatia and Fisioterapia rows are the owner and the lane
-- clicking through the defect on 02/09 and 04/09 while diagnosing it. The signal
-- was diluted by our own testing, and nothing in the database says so.
--
-- SO THE RULE IS UNCHANGED FOR A REAL PATIENT, which is the whole reason it is
-- written here rather than only on a card: AN IDENTIFICATION HEURISTIC THAT
-- RANKS CANDIDATES BY ATTENDANCE CANNOT DISTINGUISH A PATIENT'S REAL TREATMENT
-- FROM AN OPERATOR'S DIAGNOSTIC CLICKS. On a real patient's pacote, two or more
-- candidates means ASK JP. It never means take the leader, and it never means
-- assume the extra rows were testing - the account being a test account is a
-- fact only a human holds, stated in the authorisation, never inferred here.
--
-- ===================================================================
-- AND WHAT SECTION 3 COULD NEVER HAVE ANSWERED FOR THE OTHER TWO
-- ===================================================================
-- The same run showed a3c1ced1 and d75f251d each carry ONE pacote and ZERO
-- patient instances. Section 3 asks what the HOLDERS attend, so with no holder
-- it has no input and returns NOTHING for either. THAT IS A PROPERTY OF THE
-- QUESTION, NOT A FAILURE OF THE SCRIPT, and it was true before the run as well:
-- this file could never have identified those two. An empty section 3 for a
-- holderless pacote is the CORRECT answer, and a reader who reads it as a broken
-- query will go looking for a bug that is not there.
--
-- It also settles what those two are. A pacote with no patient instance is a
-- catalogue row nobody has bought: no patient's money is stranded in either, so
-- retiring them or repointing them is CATALOGUE HYGIENE for JP at his leisure,
-- not a stranded-sessions decision and not a money decision.
--
-- PII: this one DOES print patient_number and full_name, unlike the other
-- scripts in this directory, because the ruling asks for the patient to be named
-- for each pacote - these may be real patients rather than the test account, and
-- "someone's paid sessions" is not a decision to take against a uuid. No NIF, no
-- phone, no clinical value.

\pset pager off
\pset format aligned

\echo '=== 1. EVERY ARCHIVED SERVICE THAT CARRIES A PACOTE ==='
\echo '--- The population. If this is not 3 rows, the card is stale, stop and say so.'
SELECT sv.id            AS service_id,
       sv.name          AS service_name,
       sv.is_active,
       sv.duration_min,
       sv.created_at,
       count(DISTINCT sp.id)  AS packs_bound,
       count(DISTINCT ppi.id) AS patient_instances,
       count(DISTINCT a.id)   AS appointments_on_this_service
  FROM public.services sv
  JOIN public.service_packs sp ON sp.base_service_id = sv.id
  LEFT JOIN public.patient_pack_instances ppi ON ppi.pack_id = sp.id
  LEFT JOIN public.appointments a ON a.service_id = sv.id
 WHERE sv.is_active = false
 GROUP BY sv.id, sv.name, sv.is_active, sv.duration_min, sv.created_at
 ORDER BY sv.created_at;

\echo ''
\echo '=== 2. THE PACOTES, THE PATIENTS AND THE BALANCES ==='
\echo '--- One row per patient instance. THIS is what a wrong repoint would move.'
SELECT sv.id                AS archived_service_id,
       sp.id                AS pack_id,
       sp.name              AS pack_name,
       sp.is_active         AS pack_active,
       l.name               AS pack_location,
       sp.price_cents,
       ppi.id               AS instance_id,
       p.patient_number,
       p.full_name,
       ppi.sessions_total,
       ppi.legacy_consumed,
       -- THE REAL FORMULA, from packages/db/src/pack-balance.ts:
       --   available = sessions_total - legacy_consumed - linked appointments
       -- The first draft of this script omitted `legacy_consumed`, which is the
       -- exact error that module's header warns about: every pacote bought
       -- before 0067 has ZERO linked appointments, so leaving the term out
       -- reads them as untouched and RESTORES every session already used. On a
       -- script whose output decides whether to move someone's paid sessions,
       -- that overstatement is the dangerous direction.
       ppi.sessions_total - ppi.legacy_consumed - count(a.id) FILTER (
         WHERE a.status IN ('scheduled','confirmed','completed','no_show')
       )                    AS sessions_available,
       count(a.id) FILTER (
         WHERE a.status IN ('scheduled','confirmed','completed','no_show')
       )                    AS linked_appointments
  FROM public.services sv
  JOIN public.service_packs sp            ON sp.base_service_id = sv.id
  JOIN public.patient_pack_instances ppi  ON ppi.pack_id = sp.id
  JOIN public.patients p                  ON p.id = ppi.patient_id
  LEFT JOIN public.locations l            ON l.id = sp.location_id
  LEFT JOIN public.appointments a         ON a.pack_instance_id = ppi.id
 WHERE sv.is_active = false
 GROUP BY sv.id, sp.id, sp.name, sp.is_active, l.name, sp.price_cents,
          ppi.id, p.patient_number, p.full_name, ppi.sessions_total, ppi.legacy_consumed
 ORDER BY sv.id, p.patient_number;

\echo ''
\echo '=== 3. THE IDENTIFICATION. What do the HOLDERS actually attend? ==='
\echo '--- Read one archived service at a time. ONE live service with a large'
\echo '--- share is an identification. Two or more is NOT, and that pacote is'
\echo '--- left alone per the ruling.'
\echo '--- TWO OR MORE IS NOT AN IDENTIFICATION - ask JP; never take the leader'
\echo '--- (SR-54). And a pacote with NO holder returns NOTHING here, which is'
\echo '--- the correct answer to the question and not a failure of the query.'
SELECT sv.id          AS archived_service_id,
       sp.name        AS pack_name,
       live.id        AS candidate_live_service_id,
       live.name      AS candidate_live_service_name,
       live.is_active AS candidate_is_active,
       count(*)       AS appointments_by_holders,
       count(DISTINCT ppi.patient_id) AS distinct_holders
  FROM public.services sv
  JOIN public.service_packs sp           ON sp.base_service_id = sv.id
  JOIN public.patient_pack_instances ppi ON ppi.pack_id = sp.id
  JOIN public.appointments a             ON a.patient_id = ppi.patient_id
  JOIN public.services live              ON live.id = a.service_id
 WHERE sv.is_active = false
   AND live.id <> sv.id
 GROUP BY sv.id, sp.name, live.id, live.name, live.is_active
 ORDER BY sv.id, count(*) DESC;

\echo ''
\echo '=== 4. WHERE EACH CANDIDATE IS ACTUALLY OFFERED ==='
\echo '--- A pacote is location-scoped; repointing it at a service not priced at'
\echo '--- that location moves the sessions somewhere the clinic does not sell.'
SELECT sv.id       AS service_id,
       sv.name     AS service_name,
       sv.is_active,
       l.name      AS location,
       slp.price_cents,
       slp.is_active AS price_active
  FROM public.services sv
  LEFT JOIN public.service_location_prices slp ON slp.service_id = sv.id
  LEFT JOIN public.locations l                 ON l.id = slp.location_id
 WHERE sv.is_active = true
 ORDER BY sv.name, l.name;
