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
-- WHY IT EXISTS: production holds a small set of staff-training patients, all
-- confirmed by the owner as test data. Removing them before the Fisiozero
-- import lets every vendor `numero_paciente` carry over VERBATIM with zero
-- collisions - which is what makes `--reassign-conflicting-patient-numbers`
-- unnecessary.
--
-- ---------------------------------------------------------------------------
-- THE COUNT IS NOT WRITTEN IN THIS FILE. YOU SET IT ON THE DAY.
-- ---------------------------------------------------------------------------
-- THIS FILE USED TO SAY 33, AND 33 WENT STALE. On 2026-08-27 production held
-- THIRTY-FIVE, numbered 1 and 3-36, and the newest was created 2026-08-26 - the
-- day before. The clinic is still using the platform, so the number moves, and
-- a hardcoded expectation that is one behind is worse than none: it reads as a
-- verified fact right up to the moment it authorises deleting a row nobody
-- meant to delete.
--
-- SO STEP 2 REFUSES UNLESS YOU TELL IT WHAT TO EXPECT, and there is NO DEFAULT.
-- `app.expected_patients` is a session setting you fill in at the top of STEP 2
-- from what STEP 1 just printed, AFTER confirming with the clinic that none of
-- those rows is a real patient. Unset, STEP 2 raises and nothing is deleted.
-- Set to a number that does not match the live count, STEP 2 raises and nothing
-- is deleted.
--
-- THE REHEARSAL SETS 50 - the dev seed's patient count - and everything else in
-- this file is identical between the two targets. See REHEARSAL.md section 1.1.
--
-- ===========================================================================
-- READ THIS BEFORE RUNNING IT
-- ===========================================================================
-- THIS IS THE MOST DESTRUCTIVE FILE IN THE REPOSITORY. It deletes every patient
-- row for the tenant and everything rooted in them. There is no undo inside the
-- script. TAKE THE BACKUP FIRST (PROD-RUN.md 2.2) - it is the only rollback.
--
-- STEP 1 IS NOT OPTIONAL. Its counts are the evidence that the rows about to be
-- deleted are the rows the owner confirmed, AND they are where the number in
-- STEP 2's `app.expected_patients` comes from. Run it, read it, confirm it with
-- the clinic, and only then run STEP 2.
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
-- `patients` IS THE NUMBER YOU WRITE INTO STEP 2. Read it, confirm with the
-- clinic that not one of those rows is a real patient, then set
-- `app.expected_patients` to exactly this figure. STEP 2 refuses if the two
-- disagree, so a row created between this SELECT and that transaction stops the
-- delete rather than being swept into it.
--
-- ON PRODUCTION 2026-08-27 IT READ 35, numbers 1 and 3-36, newest created
-- 2026-08-26. RECORDED, NOT ASSERTED: the clinic is still using the platform
-- and the number will have moved by Sunday. That is the whole reason this file
-- no longer carries one.
--
-- READ `newest_created_at` AND DO NOT SKIP IT. It is the age of the most recent
--   patient row. If it is TODAY OR YESTERDAY, somebody was creating patients
--   after the last time anyone confirmed this set was all training data - go and
--   ask before you delete it. A count alone cannot tell you that: 35 confirmed
--   rows and 34-confirmed-plus-1-real both read as 35.
--
-- STOP IF ANY COUNT IS UNEXPECTEDLY LARGE. A few dozen training patients cannot
--   have thousands of clinical records or invoices. A large number means the
--   scoping is selecting more than the test set, and STEP 2 would delete it.
--
-- STOP IF `distinct_patient_numbers` IS NOT EQUAL TO `patients`. Two rows share
--   a number, which `patients_tenant_number_uq` should make impossible - so
--   something is wrong with the scoping rather than with the data.
--
-- `min_patient_number` AND `max_patient_number` ARE RECORDED, NOT ASSERTED. The
--   range used to be pinned at 1..35 and that went stale the moment patient 36
--   was created. A span wider than the count simply means numbers were skipped
--   or rows deleted, which is normal.
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
  -- THE AGE OF THE MOST RECENT ROW. A count cannot distinguish 35 confirmed
  -- training rows from 34 confirmed plus one real patient created yesterday;
  -- this can, and it is the cheapest question to ask before an irreversible
  -- delete. On production 2026-08-27 it read 2026-08-26.
  (select max(created_at) from patients
     where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560')                      as newest_created_at,
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
-- WHY IT APPLIES HERE: the training patients were created by staff practising
-- the real workflow, which includes locking and signing. Their records are
-- finalized like any other, and STEP 2 aborts on the first one.
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
-- `DELETE <app.expected_patients>` on the final `patients` statement.
--
-- STOP AND DO NOT COMMIT IF ANY COUNT DISAGREES WITH STEP 1. The `begin` is
-- still open at that point; type `rollback;` instead of `commit;`.
--
-- ---------------------------------------------------------------------------
-- SET `app.expected_patients` ON THE LINE BELOW. THERE IS NO DEFAULT.
-- ---------------------------------------------------------------------------
-- Put in the `patients` figure STEP 1 just printed, after confirming with the
-- clinic that not one of those rows is a real patient.
--
--   production, 2026-08-27:  35   (re-read it on the day; it moves)
--   rehearsal:               50   (the dev seed's patient count)
--
-- THE GUARD RAISES, AND A RAISE INSIDE THIS TRANSACTION IS THE REFUSAL. Nothing
-- after it runs and the `commit` cannot succeed, so the table is untouched. Two
-- ways to be refused and they are different problems:
--
--   'EXPECTED_PATIENTS is not set' - you ran STEP 2 without editing the line.
--     Go back to STEP 1, read the count, confirm it, and put it in.
--
--   'EXPECTED_PATIENTS is N but the tenant holds M' - the live count moved
--     between STEP 1 and now, or you typed the wrong number. DO NOT just change
--     the number to M: a row appeared, and finding out whose it is comes first.
--     This is the case the whole guard exists for.
--
-- `set local` SCOPES IT TO THIS TRANSACTION. It is gone on commit or rollback,
-- so a second run cannot inherit the first run's number.
--
-- TWO TRIGGERS ARE OFF FOR THE LENGTH OF THIS TRANSACTION, and nowhere else.
-- Both are OFF TOGETHER and BACK ON IN REVERSE ORDER before the commit.
--
--   clinical_records_enforce_immutability (0005). A finalized record can be
--     neither deleted nor downgraded - see STEP 1c. Without this the delete
--     aborts on the first `locked` row.
--
--   patient_audit_log_append_only (0054). FOUND ON THE 2026-08-26 REHEARSAL,
--     on live data: this transaction aborted with
--       42501 public.patient_audit_log is append-only; DELETE is refused
--     while `patient_audit_log` held ZERO rows for the tenant. The trigger is
--     `BEFORE UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT`, so it fires
--     on the STATEMENT and never looks at how many rows matched. A count of 0
--     in STEP 1 is therefore no protection at all, and production would have
--     hit the identical abort mid-window on import night.
--
-- Three properties bound the window, and they hold for both:
--   * ALTER TABLE ... DISABLE TRIGGER is TRANSACTIONAL. On a rollback the
--     triggers come back enabled on their own - verified: pg_trigger.tgenabled
--     reads 'O' after an aborted run. A failed cleanup cannot leave clinical
--     records unprotected or the audit trail writable.
--   * It takes a ShareRowExclusiveLock on each table, so no other session can
--     write one while it is off. Reads are unaffected.
--   * Both are re-enabled BEFORE commit, explicitly, so a committed cleanup can
--     never ship with either off.
-- THEY ARE TABLE-WIDE, because a trigger cannot be scoped to a row set. The
-- DELETEs are what is scoped to this tenant's patients; the locks are what make
-- the table-wide window safe.
begin;

-- >>> SET THIS. No default. <<<
set local app.expected_patients = '';

do $$
declare
  raw      text := nullif(btrim(current_setting('app.expected_patients', true)), '');
  expected int;
  actual   int;
begin
  if raw is null then
    raise exception
      'EXPECTED_PATIENTS is not set. Read STEP 1''s `patients` count, confirm '
      'with the clinic that none of those rows is a real patient, and set '
      '`app.expected_patients` at the top of STEP 2. Nothing was deleted.';
  end if;
  expected := raw::int;

  select count(*) into actual
    from patients
   where tenant_id = '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560';

  if actual <> expected then
    raise exception
      'EXPECTED_PATIENTS is % but the tenant holds % patient(s). A row appeared '
      'or disappeared since STEP 1, or the number is a typo. Find out which '
      'before changing it. Nothing was deleted.', expected, actual;
  end if;
end $$;

alter table clinical_records disable trigger clinical_records_enforce_immutability;
alter table patient_audit_log disable trigger patient_audit_log_append_only;

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

-- BEFORE COMMIT, ALWAYS. A rollback restores them too, but leaving it to the
-- rollback would mean a COMMITTED cleanup could ship with a trigger off.
-- REVERSE ORDER of the disables above: last off, first on.
alter table patient_audit_log enable trigger patient_audit_log_append_only;
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
-- STOP IF `audit_append_only_trigger` IS NOT 'O'. Same rule, same window, and
--   BOTH are printed because verifying one of two proves nothing about the
--   other: a cleanup that restored the immutability trigger and not this one
--   leaves patient_audit_log writable and deletable, and no later statement in
--   this file would notice.
select
  (select tgenabled from pg_trigger
    where tgrelid = 'public.clinical_records'::regclass
      and tgname = 'clinical_records_enforce_immutability')                     as immutability_trigger,
  (select tgenabled from pg_trigger
    where tgrelid = 'public.patient_audit_log'::regclass
      and tgname = 'patient_audit_log_append_only')                             as audit_append_only_trigger,
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
