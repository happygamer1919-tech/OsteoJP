-- ===========================================================================
-- REHEARSAL UUIDS. The values that fill mapping-config.local.json.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan OR A TERMINAL, against the NON-PROD rehearsal project.
--
-- UPDATED 2026-08-26. This header used to say "No terminal may run it (standing
-- rule 1)". CLAUDE.md, *Exemption, ruled 2026-08-26*, changed that for the
-- rehearsal: the August 2026 amostra is vendor-confirmed synthetic test data and
-- a terminal may execute the rehearsal against the NON-PROD project. REHEARSAL.md
-- carries the same ruling.
--
-- THE EXEMPTION IS ABOUT THE DATA, NOT THE TARGET, and this file is about the
-- TARGET. Against PRODUCTION it is still owner-only: standing rules 1 and 2 are
-- unchanged, PROD-RUN.md stays owner-executed, and nothing here authorises a
-- terminal to open a shell that holds production credentials.
--
-- READ ONLY. Five SELECTs. No INSERT, UPDATE, DELETE, no temp table, no
-- function, no transaction left open.
--
-- ---------------------------------------------------------------------------
-- IT READS STAFF NAMES AND EMAILS, AND THAT IS SAFE HERE FOR ONE REASON ONLY
-- ---------------------------------------------------------------------------
-- CLAUDE.md's isolation rule is about PATIENT data. Nothing below touches
-- `patients`, `appointments`, `clinical_records`, `clinical_episodes` or
-- `attachments` - the five tables that carry a person's health information.
--
-- What it does read is the CLINIC's own configuration: its locations, its
-- service catalogue and its staff roster. A therapist's professional name is
-- operational metadata, already ruled safe to print by MIG-03 (the unmapped-key
-- refusal names it), and the mapping cannot be filled without it.
--
-- STILL: THE OUTPUT IS SAFE TO PASTE ONLY FROM THE REHEARSAL PROJECT. Against
-- production this same query returns the real roster, and it has no business
-- being run there - the guard exists precisely so that shell never opens.
--
-- ---------------------------------------------------------------------------
-- HOW TO USE IT
-- ---------------------------------------------------------------------------
-- Run each query, copy the `id` column, and paste into the matching slot of
-- scripts/import/mapping-config.local.json (your filled copy of
-- mapping-config.template.json - the filled file is gitignored and never
-- committed).
--
-- THE VENDOR-SIDE KEYS ARE NOT IN THIS DATABASE and no query can produce them.
-- `"Jp"`, `"Mafalda Toscano"`, `"Tratamento"`, `"1a Avaliacao"` are the strings
-- FISIOZERO stored, matched EXACTLY - spelling and accents included. They come
-- from the delivery, via check-delivery.mjs and the runner's own refusal, which
-- names every unmapped key with a row count. This file supplies the RIGHT-HAND
-- side of each pair; the left-hand side comes from the amostra.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. THE TENANT. Fills `tenantId`.
-- ---------------------------------------------------------------------------
-- RUN THIS FIRST AND KEEP THE ID: every query below is scoped by it, and the
-- adapter builds the attachment storage prefix `<tenantId>/migration/fisiozero/`
-- from it. A wrong tenant here does not fail a foreign key - it writes the whole
-- delivery into the wrong tenant, where RLS then hides every row from the
-- clinic that is supposed to see it.
--
-- EXPECT EXACTLY ONE ROW on a rehearsal project seeded with one clinic. Two
-- rows means the project holds more than one tenant and you must pick
-- deliberately rather than take the first.
select id       as tenant_id,
       name,
       slug,
       status
from   tenants
order  by created_at;


-- ---------------------------------------------------------------------------
-- 1. LOCATIONS. Fills `location.knownLocations`.
-- ---------------------------------------------------------------------------
-- The clinic has EXACTLY TWO: Linda-a-Velha and Castelo Branco (owner
-- correction 2026-08-06; Montemor-o-Novo does not exist).
--
-- BOTH GO IN THE CONFIG even though a run imports into one. `location.kind` is
-- "fixed" and `location.locationKey` names which - two exports, one per clinic,
-- vendor confirmed 2026-08-25 - but the resolver map is built once from the
-- whole `knownLocations` object, and a missing entry throws mid-import.
--
-- REPLACE :tenant_id WITH THE UUID FROM QUERY 0 in every query below.
select id       as location_id,
       name,
       is_active,
       slot_granularity_min
from   locations
where  tenant_id = ':tenant_id'
order  by name;


-- ---------------------------------------------------------------------------
-- 2. STAFF. Fills `practitionerKeyByName`.
-- ---------------------------------------------------------------------------
-- `appointments.practitioner_id` is NOT NULL, so an unmapped `terapeuta` sinks
-- its appointment to to_review. That is the difference from a service, which is
-- nullable and imports without one.
--
-- `is_bookable` AND `is_active` ARE SHOWN RATHER THAN FILTERED ON. A therapist
-- who left the clinic is `is_active = false` today and still has a decade of
-- history in the vendor's diary, and those appointments must import against
-- their real practitioner - filtering them out here is how a whole career's
-- worth of rows would silently route to to_review.
--
-- TWO KEYS IN THE TEMPLATE ARE NOT PEOPLE and no row here will match them:
-- 'Clinica OsteoJP' and 'NESA'. An appointment attributed to a clinic or to a
-- method is not attributable to a practitioner. They ship as
-- PENDING_OWNER_RULING and the runner refuses until they are decided - either
-- they map to a real staff member, or they are removed from the config and
-- their rows go to to_review to be placed by hand.
select u.id        as practitioner_id,
       u.full_name,
       u.job_title,
       r.slug      as role_slug,
       u.is_active,
       u.is_bookable
from   users u
       left join roles r on r.id = u.role_id
where  u.tenant_id = ':tenant_id'
order  by u.is_active desc, u.full_name;


-- ---------------------------------------------------------------------------
-- 3. SERVICES. Fills `serviceKeyByType`.
-- ---------------------------------------------------------------------------
-- `appointments.service_id` IS NULLABLE, so an unmapped `tipo_servico` imports
-- without a service and the runner only warns. Do not invent a mapping to
-- silence that warning: 'Diversos' is a BUCKET, not a service, and mapping it to
-- one asserts something the source never said. It ships as TO_NORMALIZE, which
-- the runner STRIPS and logs rather than passing through - passing it through
-- would throw `unresolved("serviceKey")` mid-import.
--
-- `location_id` IS SHOWN because a service can be scoped to one clinic
-- (null = all locations). Mapping a vendor type onto a service belonging to the
-- OTHER clinic is a mismatch no constraint catches.
select s.id        as service_id,
       s.name,
       l.name      as location_name,
       s.duration_min,
       s.is_active,
       s.internal_only
from   services s
       left join locations l on l.id = s.location_id
where  s.tenant_id = ':tenant_id'
order  by s.is_active desc, s.name;


-- ---------------------------------------------------------------------------
-- 4. THE COUNTERPART CHECK. Not a mapping - a STOP condition.
-- ---------------------------------------------------------------------------
-- The rehearsal target must be EMPTY of Fisiozero rows before the first run,
-- and the same query after cleanup proves the reset worked.
--
-- ALL FOUR NUMBERS MUST BE 0 BEFORE STEP 7's FIRST --apply. A non-zero
-- staging_rows means a previous rehearsal is still in the ledger, and the
-- idempotency step would then be measuring the wrong thing: a second --apply
-- over a half-populated ledger looks identical to a correct no-op.
select (select count(*) from migration_staging_rows
          where tenant_id = ':tenant_id' and source_system = 'fisiozero') as staging_rows,
       (select count(*) from patients
          where tenant_id = ':tenant_id')                                  as patients,
       (select count(*) from appointments
          where tenant_id = ':tenant_id')                                  as appointments,
       (select count(*) from attachments
          where tenant_id = ':tenant_id')                                  as attachments;
