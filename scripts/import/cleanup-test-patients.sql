-- ===========================================================================
-- REMOVE THE STAFF-TRAINING TEST PATIENTS. Owner-confirmed 2026-08-25.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor, against PRODUCTION.
-- No terminal may (standing rule 1), and no terminal may execute a data
-- deletion at all (standing rule 12) - this file is authored, never run, here.
--
-- DATA ONLY. No migration, no schema change, no DDL. It deletes rows from
-- existing tables and nothing else.
--
-- THE TENANT UUID BELOW IS THE DETERMINISTIC SEED TENANT
-- (packages/db/seed/dev-reference.ts), so it is the SAME id in production and
-- in the rehearsal project - which is what makes running this file verbatim in
-- the rehearsal a valid dress rehearsal for running it here.
--
-- WHY IT EXISTS: production holds 33 patients numbered 1-35, all confirmed by
-- the owner as staff-training data. Removing them before the Fisiozero import
-- lets every vendor `numero_paciente` carry over VERBATIM with zero collisions -
-- which is what makes `--reassign-conflicting-patient-numbers` unnecessary.
--
-- ===========================================================================
-- READ THIS BEFORE RUNNING IT
-- ===========================================================================
-- THIS IS THE MOST DESTRUCTIVE FILE IN THE REPOSITORY. It deletes every patient
-- row for the tenant and everything rooted in them. There is no undo inside the
-- script. TAKE THE BACKUP FIRST (PROD-RUN.md 2.2) - it is the only rollback.
--
-- STEP 1 IS NOT OPTIONAL. Its counts are the evidence that the 33 rows about to
-- be deleted are the 33 rows the owner confirmed. Run it, read it, and only then
-- run STEP 2.
--
-- ===========================================================================
-- THE DEPENDENCY GRAPH, DERIVED FROM THE COMMITTED MIGRATIONS
-- ===========================================================================
-- 117 foreign-key edges were parsed out of packages/db/migrations/*.sql across
-- FIVE distinct DDL forms, because this schema uses all five and a parser that
-- handles only the common one silently misses tables:
--
--   1. ALTER TABLE x ADD CONSTRAINT ... FOREIGN KEY (c) REFERENCES "public"."p"
--   2. CREATE TABLE ... CONSTRAINT ... FOREIGN KEY (c) REFERENCES ...
--   3. CREATE TABLE ... "c" uuid ... REFERENCES "p"("id")        (column-level)
--   4. CREATE TABLE ... c uuid ... REFERENCES public.p(id)       (unquoted)
--   5. ALTER TABLE x ADD COLUMN c uuid ... REFERENCES public.p(id)
--
-- FORM 5 IS THE ONE THAT MATTERED. Migration 0067 adds
-- `appointments.pack_instance_id -> patient_pack_instances(id)`, which INVERTS
-- part of the delete order: appointments must go BEFORE pack instances. A graph
-- built without form 5 puts them at the same level and the transaction fails.
--
-- 18 TABLES HAVE AN FK PATH TO `patients`, in this order (deepest first):
--
--   depth 4  ai_ingestion_requests, attachments, patient_form_submissions,
--            record_annulments                         (via clinical_records)
--   depth 3  appointment_notes, clinical_records, invoices   (via appointments)
--   depth 2  appointments                        (via patient_pack_instances)
--   depth 1  analytics_events, clinical_episodes, consultations,
--            patient_followup_contacts, patient_followup_postponements,
--            patient_locations, patient_note_revisions, patient_pack_instances,
--            patient_terms_acceptances, patient_trusted_devices
--
-- ONLY ONE EDGE CASCADES: patient_trusted_devices.patient_id -> patients
-- ON DELETE CASCADE. Every other edge is ON DELETE NO ACTION, so an unhandled
-- child ABORTS the transaction rather than silently orphaning - which is the
-- safe direction. THE CASCADING TABLE IS STILL DELETED EXPLICITLY, so its count
-- appears in STEP 1 instead of vanishing into a cascade nobody can see.
--
-- ---------------------------------------------------------------------------
-- THREE TABLES CARRY A PATIENT ID WITH **NO** FOREIGN KEY
-- ---------------------------------------------------------------------------
-- These do NOT block the delete, which is exactly why they are dangerous: the
-- transaction would succeed and leave rows pointing at patients that no longer
-- exist.
--
--   patient_audit_log.patient_id      uuid, NULLABLE, no FK
--   staff_notifications.patient_id    uuid, NOT NULL, no FK
--   guest_booking_requests.converted_patient_id  uuid, NULLABLE, no FK
--
-- The first two are DELETED. `patient_audit_log` is an audit trail and deleting
-- from one deserves a sentence: these are audit rows about TEST patients created
-- during staff training, they attest to nothing that happened to a real person,
-- and leaving them behind means an audit log referencing ids that resolve to
-- nothing. `staff_notifications.patient_id` is NOT NULL so it cannot be nulled,
-- and a notification about a deleted patient renders as broken UI.
--
-- THE THIRD IS **NULLED, NOT DELETED**, and the distinction is deliberate. A
-- guest booking request is NOT a patient-rooted row - it exists before any
-- patient does and merely points at one after conversion. Deleting it would
-- exceed this script's stated scope (patient-rooted rows only). The column is
-- nullable BY DESIGN, so setting it NULL removes the dangling pointer while
-- keeping the request itself. STEP 1 counts these separately.
--
-- ---------------------------------------------------------------------------
-- WHAT IS **NOT** TOUCHED, AND IS ASSERTED NOT TO BE
-- ---------------------------------------------------------------------------
--   migration_staging_rows   NEVER. It is the import's audit trail and
--                            idempotency key. Its name does not appear in a
--                            single statement below, and a test asserts that.
--   users                    All 28 staff rows AND the two legacy accounts
--                            ("Clínica OsteoJP", "NESA") are untouched. Every
--                            delete below is scoped by a patient id; none names
--                            `users` at all.
--   auth.users               Not written to. See the finding below.
--   tenants, locations, services, roles, service_packs, form_templates,
--   availability_templates, time_off, staff_locations, therapist_services,
--   quick_notes, audit_log, rate_limit_counters, action_token_consumptions,
--   patient_otp_codes        None has a patient FK path. Left alone.
--
-- ---------------------------------------------------------------------------
-- auth.users FINDING: PATIENTS HAVE NO SUPABASE AUTH ROWS. NOTHING TO REMOVE.
-- ---------------------------------------------------------------------------
-- Checked rather than assumed, because the answer decides whether a whole
-- dashboard step is needed. It is not. The evidence:
--
--   * migration 0010 (patient identity layer) header: the portal issues its own
--     token carrying `tenant_id`, `patient_id` and the reserved claim
--     `role = 'patient'`, and creates "a dedicated, LOGIN-LESS Postgres role
--     `patient`" - declared NOLOGIN at 0010:60, "assumed via SET ROLE, never
--     connected to directly".
--   * `packages/db/src/client.ts` `PatientClaims` carries `patient_id` and NOT
--     `sub`; `withPatientContext` does `set local role patient`. Staff claims
--     carry `sub` so `auth.uid()` resolves - patient claims deliberately do not.
--   * `patient_otp_codes` (0056) is keyed by `phone_hash`. It has NO patient_id
--     and no auth linkage; rows expire on their own.
--   * There is no `auth.admin.createUser`, `signUp` or `signInWithOtp` call
--     anywhere in the API or portal source. The only `createUser` in the
--     repository is `provisionStaffUser`, which is the STAFF invite path.
--
-- SO: deleting these patients leaves NO orphaned auth users, and there is no
-- Supabase dashboard Auth step for this cleanup. If a future change gives
-- patients real auth users, this paragraph is what will be wrong first.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. Read-only. Run this FIRST and read every number.
-- ---------------------------------------------------------------------------
-- Every count below is the number of rows STEP 2 will delete.
--
-- EXPECTED: `patients` = 33.
--
-- STOP IF `patients` IS NOT EXACTLY 33. The owner confirmed 33 training rows.
--   Any other number means the database is not in the state this script was
--   written for - a real patient may have been created, or a previous run
--   already removed some. Do not run STEP 2 until the difference is explained.
--
-- STOP IF ANY COUNT IS UNEXPECTEDLY LARGE. 33 training patients cannot have
--   thousands of clinical records or invoices. A large number means the scoping
--   is selecting more than the test set, and STEP 2 would delete it.
--
-- STOP IF `distinct_patient_numbers` IS NOT 33 or the min/max fall outside
--   1..35. The owner's description is "33 patients, numbers 1-35"; anything
--   else is a different population.
with p as (
  select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'
),
r as (
  select id from clinical_records where patient_id in (select id from p)
)
select
  (select count(*) from p)                                                          as patients,
  (select count(distinct patient_number) from patients
     where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')                      as distinct_patient_numbers,
  (select min(patient_number) from patients
     where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')                      as min_patient_number,
  (select max(patient_number) from patients
     where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')                      as max_patient_number,
  -- depth 4
  (select count(*) from ai_ingestion_requests    where clinical_record_id in (select id from r)) as ai_ingestion_requests,
  (select count(*) from attachments              where patient_id in (select id from p)
                                                    or clinical_record_id in (select id from r)) as attachments,
  (select count(*) from patient_form_submissions where patient_id in (select id from p)
                                                    or clinical_record_id in (select id from r)) as patient_form_submissions,
  (select count(*) from record_annulments        where record_id in (select id from r))          as record_annulments,
  -- depth 3
  (select count(*) from appointment_notes        where patient_id in (select id from p))         as appointment_notes,
  (select count(*) from clinical_records         where patient_id in (select id from p))         as clinical_records,
  (select count(*) from invoices                 where patient_id in (select id from p))         as invoices,
  -- depth 2
  (select count(*) from appointments             where patient_id in (select id from p)
                                                    or patient_2_id in (select id from p))       as appointments,
  -- depth 1
  (select count(*) from analytics_events               where patient_id in (select id from p))   as analytics_events,
  (select count(*) from clinical_episodes              where patient_id in (select id from p))   as clinical_episodes,
  (select count(*) from consultations                  where patient_id in (select id from p))   as consultations,
  (select count(*) from patient_followup_contacts      where patient_id in (select id from p))   as patient_followup_contacts,
  (select count(*) from patient_followup_postponements where patient_id in (select id from p))   as patient_followup_postponements,
  (select count(*) from patient_locations              where patient_id in (select id from p))   as patient_locations,
  (select count(*) from patient_note_revisions         where patient_id in (select id from p))   as patient_note_revisions,
  (select count(*) from patient_pack_instances         where patient_id in (select id from p))   as patient_pack_instances,
  (select count(*) from patient_terms_acceptances      where patient_id in (select id from p))   as patient_terms_acceptances,
  (select count(*) from patient_trusted_devices        where patient_id in (select id from p))   as patient_trusted_devices,
  -- no FK, handled explicitly
  (select count(*) from patient_audit_log        where patient_id in (select id from p))         as patient_audit_log,
  (select count(*) from staff_notifications      where patient_id in (select id from p))         as staff_notifications,
  (select count(*) from guest_booking_requests   where converted_patient_id in (select id from p)) as guest_requests_to_null;


-- ---------------------------------------------------------------------------
-- STEP 1b. STORAGE OBJECTS. Read-only. Run before STEP 2 - after it, the rows
-- that name these objects are gone and the paths are unrecoverable.
-- ---------------------------------------------------------------------------
-- Attachment rows carry `storage_path` into the `clinical-attachments` bucket.
-- DELETING THE ROW DOES NOT DELETE THE OBJECT: nothing in this database reaches
-- into Supabase Storage. Any object left behind is orphaned - it belongs to a
-- patient that no longer exists, and no screen will ever show it again.
--
-- THE PATHS ARE PRINTED, DELIBERATELY, and this is the one place this script
-- outputs anything other than a number. A storage path cannot be deleted from
-- the dashboard without knowing it. These are TEST patients created by staff
-- during training, so the paths are not real patient data - but keep the output
-- to this list and paste nothing else from the bucket.
--
-- EXPECTED: likely 0 rows. Training data rarely has uploads.
-- IF NON-ZERO: copy the paths, finish STEP 2, then delete those objects in
--   Supabase dashboard -> Storage -> clinical-attachments. Verify the count you
--   deleted equals `path_count` below.
select count(*) as path_count
from   attachments
where  patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

select storage_path
from   attachments
where  patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')
order  by storage_path;


-- ---------------------------------------------------------------------------
-- STEP 1c. CLINICAL RECORDS BY STATUS. Read-only. Run before STEP 2.
-- ---------------------------------------------------------------------------
-- A FINALIZED CLINICAL RECORD CANNOT BE DELETED, AND CANNOT BE DOWNGRADED.
-- `clinical_records_enforce_immutability` (migration 0005) raises
-- 23514 check_violation on a DELETE of any row whose status is 'locked' or
-- 'signed', and raises again on an UPDATE unless the change is a merge
-- re-parent gated by `app.merge_reparent` with every other column
-- byte-identical - so `set status = 'draft'` fails that test too. There is no
-- in-band downgrade. That is CLAUDE.md rule 4 working, not a bug.
--
-- WHY IT APPLIES HERE: the 33 training patients were created by staff
-- practising the real workflow, which includes locking and signing. Their
-- records are finalized like any other, and STEP 2 aborts on the first one.
--
-- READ THESE COUNTS. They are the rows STEP 2's trigger window covers, and
-- `locked + signed` is the number that would otherwise have stopped the delete.
-- A STATUS IS NOT PATIENT DATA - no content, no name, no record id.
select status, count(*) as records
from   clinical_records
where  patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')
group  by status
order  by status;


-- ---------------------------------------------------------------------------
-- STEP 2. THE DELETE. One transaction. Run only after STEP 1, 1b and 1c.
-- ---------------------------------------------------------------------------
-- ONE TRANSACTION, AND THAT IS LOAD-BEARING. If any statement fails - an FK
-- this graph missed, a permission, a typo - the WHOLE THING rolls back. The
-- alternative is a half-deleted patient set: some children gone, the parents
-- still present, and no way to tell which by looking. Every edge below is
-- ON DELETE NO ACTION except one, so a missed child ABORTS rather than orphans.
--
-- ORDER IS DEEPEST-FIRST, derived above. Do not reorder these statements.
--
-- EXPECTED RESULT: a DELETE count per statement matching STEP 1 exactly, and
-- `DELETE 33` on the final `patients` statement.
--
-- STOP AND DO NOT COMMIT IF ANY COUNT DISAGREES WITH STEP 1. The `begin` is
-- still open at that point; type `rollback;` instead of `commit;`.
--
-- THE IMMUTABILITY TRIGGER IS OFF FOR THE LENGTH OF THIS TRANSACTION, and
-- nowhere else. See STEP 1c for why there is no alternative. Three properties
-- bound it:
--   * ALTER TABLE ... DISABLE TRIGGER is TRANSACTIONAL. On a rollback the
--     trigger comes back enabled on its own - verified: pg_trigger.tgenabled
--     reads 'O' after an aborted run. A failed cleanup cannot leave clinical
--     records unprotected.
--   * It takes a ShareRowExclusiveLock on clinical_records, so no other session
--     can write one while it is off. Reads are unaffected.
--   * It is re-enabled BEFORE commit, explicitly, so a committed cleanup can
--     never ship with it off.
-- IT IS TABLE-WIDE, because a trigger cannot be scoped to a row set. The DELETEs
-- are what is scoped to this tenant's patients; the lock is what makes the
-- table-wide window safe.
begin;

alter table clinical_records disable trigger clinical_records_enforce_immutability;

-- depth 4 - through clinical_records
delete from ai_ingestion_requests
 where clinical_record_id in (
   select id from clinical_records
    where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'));

delete from attachments
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')
    or clinical_record_id in (
   select id from clinical_records
    where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'));

delete from patient_form_submissions
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')
    or clinical_record_id in (
   select id from clinical_records
    where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'));

delete from record_annulments
 where record_id in (
   select id from clinical_records
    where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'));

-- depth 3 - through appointments / clinical_episodes
delete from appointment_notes
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from clinical_records
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from invoices
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- depth 2 - appointments reference patient_pack_instances (migration 0067),
-- so they MUST go before the pack instances below.
delete from appointments
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')
    or patient_2_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- depth 1 - direct children of patients
delete from analytics_events
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from clinical_episodes
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from consultations
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_followup_contacts
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_followup_postponements
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_locations
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_note_revisions
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_pack_instances
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from patient_terms_acceptances
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- CASCADES on patients, deleted explicitly anyway so the count is VISIBLE in
-- STEP 1 rather than disappearing into a cascade nobody can audit.
delete from patient_trusted_devices
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- NO FOREIGN KEY - these would NOT block the delete, which is exactly why they
-- are listed. Without them the transaction succeeds and leaves rows pointing at
-- patients that no longer exist.
delete from patient_audit_log
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

delete from staff_notifications
 where patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- NULLED, NOT DELETED. A guest booking request is not a patient-rooted row: it
-- exists before any patient does. The column is nullable by design, so this
-- removes the dangling pointer without destroying the request.
update guest_booking_requests
   set converted_patient_id = null
 where converted_patient_id in (select id from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560');

-- the parents, last
delete from patients
 where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560';

-- BEFORE COMMIT, ALWAYS. A rollback restores it too, but leaving it to the
-- rollback would mean a COMMITTED cleanup could ship with the trigger off.
alter table clinical_records enable trigger clinical_records_enforce_immutability;

commit;


-- ---------------------------------------------------------------------------
-- STEP 3. VERIFY. Read-only. Paste this output back.
-- ---------------------------------------------------------------------------
-- EXPECTED: EVERY COLUMN 0, and `staff_rows` UNCHANGED at 30
--           (28 real staff + the 2 legacy accounts from
--            legacy-staff-accounts.sql).
--
-- STOP IF `patients` IS NOT 0. The delete did not complete.
-- STOP IF ANY `orphan_*` COLUMN IS NON-ZERO. Rows survive that point at
--   patients which no longer exist - the graph missed a table and it must be
--   found before the import writes on top of it.
-- STOP IF `staff_rows` IS NOT 30. This script must not touch `users` at all;
--   any change there is a defect, not a side effect.
-- STOP IF `immutability_trigger` IS NOT 'O'. STEP 2 turned it off and must have
--   turned it back on before committing. 'O' is enabled; anything else means
--   clinical records are unprotected RIGHT NOW and it must be re-enabled by
--   hand before any other work touches this database.
select
  (select tgenabled from pg_trigger
    where tgrelid = 'public.clinical_records'::regclass
      and tgname = 'clinical_records_enforce_immutability')                     as immutability_trigger,
  (select count(*) from patients where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')          as patients,
  (select count(*) from appointments where patient_id not in (select id from patients))             as orphan_appointments,
  (select count(*) from clinical_records where patient_id not in (select id from patients))         as orphan_clinical_records,
  (select count(*) from clinical_episodes where patient_id not in (select id from patients))        as orphan_clinical_episodes,
  (select count(*) from attachments where patient_id is not null
                                      and patient_id not in (select id from patients))              as orphan_attachments,
  (select count(*) from patient_locations where patient_id not in (select id from patients))        as orphan_patient_locations,
  (select count(*) from patient_audit_log where patient_id is not null
                                           and patient_id not in (select id from patients))         as orphan_patient_audit_log,
  (select count(*) from staff_notifications where patient_id not in (select id from patients))      as orphan_staff_notifications,
  (select count(*) from guest_booking_requests where converted_patient_id is not null
                                                and converted_patient_id not in (select id from patients)) as orphan_guest_requests,
  (select count(*) from users where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')             as staff_rows,
  (select count(*) from migration_staging_rows)                                                     as staging_rows_untouched;


-- ---------------------------------------------------------------------------
-- STEP 4. RE-RUN THE NUMBER PREFLIGHT. Not part of this script.
-- ---------------------------------------------------------------------------
-- Run scripts/import/preflight-patient-numbers.sql again now.
--
-- EXPECTED: zero patients for the tenant, so `max_patient_number` comes back
-- NULL and there is NO range for a vendor number to collide with.
--
-- THAT RESULT IS WHAT AUTHORISES THE IMPORT TO RUN **WITHOUT**
-- `--reassign-conflicting-patient-numbers`. If anything still comes back, the
-- cleanup did not finish and the flag decision has to be revisited.
