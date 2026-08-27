-- ===========================================================================
-- BACKFILL patient_locations FROM appointments. The two-clinic repair.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor, against PRODUCTION, AFTER
-- both clinics have imported and reconciled. No terminal may (standing rule 1).
--
-- DATA ONLY. No migration, no schema change, no DDL. It inserts rows into one
-- existing table and nothing else. It DELETES NOTHING and UPDATES NOTHING.
--
-- RUN IT ONLY IF BLOCK 13 REPORTED SHARED id_paciente. If
-- `scripts/import/cross-delivery.mjs` printed `shared id_paciente  0`, no
-- person appears in both deliveries, every patient got their location link at
-- import time, and this file has nothing to do. Running it anyway is harmless
-- (STEP 1 prints 0 and STEP 2 inserts 0) but it is not a step to invent.
--
-- THE TENANT UUID BELOW IS THE DETERMINISTIC SEED TENANT
-- (packages/db/seed/dev-reference.ts), so it is the SAME id in production and
-- in the rehearsal project - which is what makes running this file verbatim in
-- the rehearsal a valid dress rehearsal for running it here.
--
-- ===========================================================================
-- WHY IT EXISTS: THE IMPORT CANNOT DO IT, AND THAT IS NOT A BUG
-- ===========================================================================
-- The staging ledger's unique key is
-- (tenant_id, source_system, entity_type, source_id) and the patient source id
-- IS the vendor's `id_paciente` (packages/db/src/migration/sources/fisiozero.ts).
-- The batch id is deliberately NOT in that key - PROD-RUN.md 4.1 - because both
-- clinics are one migration into one ledger.
--
-- So for a person seen at BOTH clinics:
--
--   Linda-a-Velha imports first. The patient row is INSERTED and, in the same
--     statement group, `patient_locations` gets its linda-a-velha link
--     (packages/db/src/migration/upsert.ts, insertChunk case "patient").
--
--   Castelo Branco imports second. That person's staging row resolves to the
--     SAME ledger key, is found already `imported`, and is SKIPPED. Skipping is
--     CORRECT - it is what stops the run duplicating the patient - and the
--     `patient_locations` insert lives inside the branch that was skipped.
--
--   Their Castelo Branco APPOINTMENTS still import: the appointment source id
--     is sha256(id_paciente|inicio|terapeuta), which differs per appointment, so
--     those rows are new and are written with location_id = castelo-branco.
--
-- The result is a patient with appointments at a clinic they are not a member
-- of. Nothing errors. `appointments.location_id` is NOT NULL and correct; the
-- agenda renders; the reconciliation balances.
--
-- WHAT IT COSTS, AND IT IS NOT COSMETIC: PL-09 scopes who may READ a patient by
-- `patient_locations`. Castelo Branco's reception and therapists cannot see a
-- patient whose only link is to Linda-a-Velha - a patient they have appointments
-- with, in their own diary, at their own clinic. That is discovered by a
-- receptionist on Monday, not by any count on Sunday night.
--
-- ===========================================================================
-- EVERY COLUMN OF patient_locations, AND WHAT THIS FILE PUTS IN IT
-- ===========================================================================
-- Read off the committed DDL (supabase/migrations/0005_patient_merge_multi-
-- location.sql lines 5-11) and the Drizzle source (packages/db/src/schema.ts,
-- `patientLocations`). The table has FIVE columns, FOUR of them NOT NULL:
--
--   id           uuid  NOT NULL  PRIMARY KEY DEFAULT gen_random_uuid()
--                      -> NOT supplied. Left to the column default, which is
--                         where every other row in this table gets its id.
--                         Supplying one would mean generating uuids by hand for
--                         a row nothing references by id.
--   tenant_id    uuid  NOT NULL  no default, FK -> tenants(id) ON DELETE CASCADE
--                      -> SUPPLIED: the literal tenant uuid below. Not copied
--                         from `appointments.tenant_id`, so the value cannot be
--                         inherited from a row the WHERE clause failed to scope.
--   patient_id   uuid  NOT NULL  no default, FK -> patients(id)
--                      -> SUPPLIED: appointments.patient_id.
--   location_id  uuid  NOT NULL  no default, FK -> locations(id)
--                      -> SUPPLIED: appointments.location_id.
--   created_at   timestamptz NOT NULL DEFAULT now()
--                      -> NOT supplied. Left to the column default, so these
--                         rows carry the time of the backfill rather than a
--                         back-dated time nobody can source.
--
-- There is no `is_primary`, no `created_by` and no soft-delete column on this
-- table. If one is ever added NOT NULL without a default, this file stops
-- working loudly (a NOT NULL violation), which is the safe direction.
--
-- ===========================================================================
-- WHAT IS DELIBERATELY *NOT* FILTERED
-- ===========================================================================
-- APPOINTMENT STATUS IS NOT CONSULTED. A cancelled appointment is still
-- evidence that this person is on that clinic's books, and owner ruling B
-- (2026-08-25) imports every past-dated `marcada` AS `cancelled` - which for a
-- decade of history is most of the delivery. Filtering on status would drop
-- exactly the rows this import produces most of.
--
-- `patients.primary_location_id` IS NOT TOUCHED. It is a different question
-- (which clinic is this patient's home) with a different answer, it is
-- NULLABLE, and the LAUNCH backlog carries its backfill separately. This file
-- writes membership, not primacy.
--
-- ===========================================================================
-- WHAT *IS* FILTERED, AND WHY
-- ===========================================================================
-- SOFT-DELETED AND MERGED-AWAY PATIENTS ARE EXCLUDED. `patients.deleted_at` is
-- a soft delete and `patients.merged_into_id` points a losing record at its
-- survivor; writing a fresh membership row for either resurrects a link the
-- clinic already retired. STEP 1 prints how many rows that exclusion removed,
-- so it is a number you read rather than a filter you take on trust.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. Read-only. Run this FIRST and read every number.
-- ---------------------------------------------------------------------------
-- `rows_to_insert` is exactly what STEP 2 will report as `INSERT 0 <n>`.
--
-- EXPECTED IMMEDIATELY AFTER A CLEAN TWO-CLINIC IMPORT: `rows_to_insert` equals
-- the `shared id_paciente` count block 13 printed, give or take the people who
-- share an id but only have appointments at one of the two clinics.
--
-- EXPECTED ON A ONE-CLINIC IMPORT, OR ON A RE-RUN: 0.

select
  (select count(*) from (
     select distinct a.patient_id, a.location_id
     from   appointments a
     join   patients p
       on   p.id = a.patient_id
      and   p.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
     where  a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
       and  p.deleted_at is null
       and  p.merged_into_id is null
       and  not exists (
              select 1
              from   patient_locations pl
              where  pl.tenant_id  = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
                and  pl.patient_id = a.patient_id
                and  pl.location_id = a.location_id)
   ) s)                                                            as rows_to_insert,

  -- How many distinct PEOPLE those rows belong to. One person missing links to
  -- two clinics counts once here and twice above.
  (select count(distinct a.patient_id) from appointments a
     join patients p on p.id = a.patient_id
      and p.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
    where a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
      and p.deleted_at is null
      and p.merged_into_id is null
      and not exists (select 1 from patient_locations pl
                       where pl.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
                         and pl.patient_id = a.patient_id
                         and pl.location_id = a.location_id))       as patients_affected,

  -- The exclusion, shown rather than assumed. Non-zero is not a stop; it is a
  -- number to have seen.
  (select count(*) from (
     select distinct a.patient_id, a.location_id
     from   appointments a
     join   patients p
       on   p.id = a.patient_id
      and   p.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
     where  a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
       and  (p.deleted_at is not null or p.merged_into_id is not null)
       and  not exists (
              select 1
              from   patient_locations pl
              where  pl.tenant_id  = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
                and  pl.patient_id = a.patient_id
                and  pl.location_id = a.location_id)
   ) s)                                                  as excluded_deleted_or_merged,

  -- Context: what the table holds now, and how many locations the tenant has.
  (select count(*) from patient_locations
    where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')       as patient_locations_now,
  (select count(*) from locations
    where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')       as locations_in_tenant;

-- ---------------------------------------------------------------------------
-- STEP 2. THE INSERT. Run only after STEP 1, and only if it printed non-zero.
-- ---------------------------------------------------------------------------
-- ONE STATEMENT, so it is atomic without an explicit transaction. That is
-- deliberate: an unclosed `begin` left in the SQL editor is its own hazard, and
-- there is nothing here to roll back a second statement against.
--
-- `on conflict do nothing` WITHOUT A TARGET, so it absorbs EVERY unique
-- constraint on the table rather than the one named today - the
-- (tenant_id, patient_id, location_id) index and the primary key both. That
-- makes the file re-runnable: a second run inserts 0 and errors on nothing.
--
-- EXPECTED: `INSERT 0 <n>` where <n> is STEP 1's `rows_to_insert`, exactly.
--
-- STOP IF <n> IS LARGER THAN STEP 1's `rows_to_insert`. Rows were created
-- between the two statements, which on a frozen platform means the freeze did
-- not hold.

insert into patient_locations (tenant_id, patient_id, location_id)
select distinct
       '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'::uuid,
       a.patient_id,
       a.location_id
from   appointments a
join   patients p
  on   p.id = a.patient_id
 and   p.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
where  a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
  and  p.deleted_at is null
  and  p.merged_into_id is null
  and  not exists (
         select 1
         from   patient_locations pl
         where  pl.tenant_id  = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
           and  pl.patient_id = a.patient_id
           and  pl.location_id = a.location_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- STEP 3. VERIFY. Read-only. Run after STEP 2.
-- ---------------------------------------------------------------------------
-- EXPECTED: `rows_still_missing` = 0. Every patient with an appointment at a
-- location now has a membership row for it.
--
-- STOP IF `rows_still_missing` IS NON-ZERO. STEP 2 reported an insert but the
-- gap did not close, which means rows are being excluded by something other
-- than the two filters above.
--
-- `patients_at_both_clinics` is the number worth writing down: it is how many
-- people the clinic now knows are shared, and it is the first time that fact
-- exists anywhere in the database.

select
  (select count(*) from (
     select distinct a.patient_id, a.location_id
     from   appointments a
     join   patients p
       on   p.id = a.patient_id
      and   p.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
     where  a.tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
       and  p.deleted_at is null
       and  p.merged_into_id is null
       and  not exists (
              select 1
              from   patient_locations pl
              where  pl.tenant_id  = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
                and  pl.patient_id = a.patient_id
                and  pl.location_id = a.location_id)
   ) s)                                                          as rows_still_missing,

  (select count(*) from patient_locations
    where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')     as patient_locations_now,

  (select count(*) from (
     select patient_id
     from   patient_locations
     where  tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
     group  by patient_id
     having count(distinct location_id) > 1
   ) m)                                                           as patients_at_both_clinics;
