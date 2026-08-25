-- ===========================================================================
-- LEGACY STAFF ACCOUNTS. Owner ruling A, 2026-08-25.
-- ===========================================================================
--
-- Creates the two historical-only staff rows the Fisiozero import needs as
-- practitioner targets: "Clínica OsteoJP" and "NESA". Neither is a person and
-- neither may ever log in.
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor. No terminal may (standing
-- rule 1), which is why this is a committed .sql file rather than a script.
--
-- DATA ONLY. No migration, no schema change, no DDL. It inserts two rows into
-- an existing table and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SQL AND NOT A CLICK PATH. VERIFIED, NOT ASSUMED.
-- ---------------------------------------------------------------------------
-- The admin UI has EXACTLY ONE staff-creation path, `inviteStaff`
-- (apps/web/lib/admin/staff.ts:154), and it calls `provisionStaffUser`
-- (apps/web/lib/auth/provision.ts:46), which calls
-- `admin.auth.admin.createUser({ email, password, email_confirm: true })`
-- at provision.ts:72 BEFORE inserting the `users` row.
--
-- So every account the UI can create HAS A LOGIN AND A PASSWORD. There is no
-- "add staff without access" option to click, and `activateStaffLogin` is the
-- opposite operation - it gives a login to a row that already exists.
--
-- A UI-created account would therefore be a real, password-holding credential
-- for a clinic and a treatment method. That is the thing owner ruling A says
-- must not exist, so the UI cannot deliver it and this file does.
--
-- ---------------------------------------------------------------------------
-- WHY A ROW WITH NO LOGIN IS EVEN POSSIBLE. ALSO VERIFIED.
-- ---------------------------------------------------------------------------
-- `public.users` has EXACTLY TWO foreign keys, both in 0000_empty_runaways.sql:
--     users_tenant_id_tenants_id_fk  -> public.tenants(id)
--     users_role_id_roles_id_fk      -> public.roles(id)
-- There is NO foreign key from `users.id` to `auth.users.id`.
--
-- THE COMMENT IN MIGRATION 0018 SAYING THERE IS ONE IS WRONG. 0018_quick_notes.sql
-- line 15 reads "users.id is 1:1 with auth.users.id (enforced by FK)". No such
-- constraint was ever created. The 1:1 is a CONVENTION the application upholds
-- by always minting both together - not something the database enforces.
--
-- That is what makes these two rows possible, and it is worth stating plainly
-- rather than relying on: if a future migration ADDS that FK, this file stops
-- working and these two accounts become un-creatable.
--
-- NO auth.users ROW MEANS NO CREDENTIAL EXISTS. Supabase Auth is the only login
-- path; it authenticates against auth.users. A row that is absent there cannot
-- sign in, cannot reset a password, and cannot be phished. This is stronger
-- than any flag, because it is the absence of a thing rather than a check that
-- something might skip.
--
-- ---------------------------------------------------------------------------
-- THE FLAGS, AND WHAT EACH ONE ACTUALLY EXCLUDES
-- ---------------------------------------------------------------------------
--   role_id   = NULL   Every role-keyed query INNER JOINs roles
--                      (e.g. notification fan-out, apps/api/lib/notifications/
--                      centre.ts:60). A NULL role_id drops the row from all of
--                      them, with no flag to forget to set.
--
--   is_bookable = false  THE ONE THAT MATTERS FOR SCHEDULING.
--                      apps/web/lib/scheduling/therapist-bookable.ts is the
--                      single predicate: `return row.isBookable`. The Terapeuta
--                      dropdown AND the agenda's therapist filter both read the
--                      same list (data.ts:311, filterBookableTherapists), so
--                      false removes them from both. Nobody can book a NEW
--                      appointment against a clinic or a method.
--
--   is_active = false   Removes them from the agenda reference query entirely
--                      (data.ts:277 filters is_active) and from the staff
--                      notification fan-out. It is also simply true: these are
--                      historical records, not working accounts.
--
--   must_set_password = false  Default. Nothing to set; there is no credential.
--
-- DISPONIBILIDADE NEEDS NO FLAG. Availability is rows in
-- `availability_templates` keyed by user_id. These accounts get none, so they
-- have no availability - not "empty availability", but no participation in the
-- system at all.
--
-- ---------------------------------------------------------------------------
-- THE IMPORTED APPOINTMENTS STILL RENDER. THIS IS THE PART THAT WOULD BITE.
-- ---------------------------------------------------------------------------
-- is_active = false does NOT hide their history. The agenda's appointment query
-- joins `innerJoin(users, eq(users.id, appointments.practitionerId))`
-- (apps/web/lib/scheduling/data.ts:180) WITH NO is_active PREDICATE, so a
-- decade of imported rows renders normally with the practitioner's name.
--
-- The one thing lost is the ability to FILTER the agenda down to these two
-- practitioners, because the filter list is the bookable list. Their
-- appointments appear under "Todos os terapeutas". That is the intended trade:
-- the rows are history, not a working diary.
--
-- ---------------------------------------------------------------------------
-- WHY THESE EMAIL ADDRESSES
-- ---------------------------------------------------------------------------
-- `users.email` is NOT NULL with a unique index on (tenant_id, email), so a
-- value is required. `.invalid` is RESERVED BY RFC 2606 and is guaranteed never
-- to resolve, anywhere, ever. If any future code path tries to mail these
-- accounts, delivery fails at DNS rather than reaching a real inbox that
-- happens to exist. A plausible-looking address like clinica@osteojp.pt could
-- one day BE a real mailbox.
--
-- ---------------------------------------------------------------------------
-- THE UUIDS ARE LITERAL AND FIXED, NOT gen_random_uuid()
-- ---------------------------------------------------------------------------
-- They go into scripts/import/mapping-config.local.json as the
-- practitionerKeyByName values for "Clínica OsteoJP" and "NESA". Generating
-- them would mean reading them back and hand-copying two uuids under time
-- pressure, and a mistyped one is a foreign-key failure MID-IMPORT. Fixed
-- values also make this file re-runnable and the whole step verifiable.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. Read-only. Run this FIRST and read the numbers.
-- ---------------------------------------------------------------------------
-- Substitute :tenant_id with the uuid from rehearsal-uuids.sql query 0
-- (or, on production, the live tenant).
--
-- EXPECTED, on a target that has never had this run:
--   already_present        0     <- the two rows do not exist yet
--   email_collisions       0     <- neither address is taken
--   uuid_collisions        0     <- neither literal id is in use
--   name_collisions        0     <- no existing staff carries these names
--
-- STOP IF already_present IS 2. The accounts exist; skip to STEP 3 and verify.
-- STOP IF already_present IS 1. A half-applied run. Do NOT run STEP 2 - decide
--   which row is missing and insert only that one, or the ON CONFLICT below
--   will make it look like it worked.
-- STOP IF ANY collision count IS NON-ZERO. Something else already owns that
--   address, id or name, and STEP 2 would either fail or silently do nothing.
select
  (select count(*) from users
     where tenant_id = ':tenant_id'
       and id in ('0c1a0000-0000-4000-8000-000000000001',
                  '0c1a0000-0000-4000-8000-000000000002'))            as already_present,
  (select count(*) from users
     where tenant_id = ':tenant_id'
       and email in ('clinica-osteojp@osteojp.invalid',
                     'nesa@osteojp.invalid'))                          as email_collisions,
  (select count(*) from users
     where id in ('0c1a0000-0000-4000-8000-000000000001',
                  '0c1a0000-0000-4000-8000-000000000002'))             as uuid_collisions,
  (select count(*) from users
     where tenant_id = ':tenant_id'
       and full_name in ('Clínica OsteoJP', 'NESA'))                   as name_collisions,
  (select count(*) from users where tenant_id = ':tenant_id')          as staff_rows_before;


-- ---------------------------------------------------------------------------
-- STEP 2. THE INSERT. Run only after STEP 1's numbers are as expected.
-- ---------------------------------------------------------------------------
-- Two rows. No DDL. No update to any existing row.
--
-- ON CONFLICT DO NOTHING makes it safely re-runnable, which is why STEP 1's
-- `already_present` matters: with the conflict clause a second run reports
-- "INSERT 0 0" rather than failing, and that is indistinguishable from a run
-- that did nothing because something was wrong. STEP 1 is what tells them apart.
--
-- EXPECTED RESULT: `INSERT 0 2`.
-- STOP ON ANYTHING ELSE. `INSERT 0 0` means both already existed (re-run STEP 1);
-- `INSERT 0 1` means one did.
begin;

insert into users (id, tenant_id, role_id, email, full_name, is_active, is_bookable, must_set_password)
values
  ('0c1a0000-0000-4000-8000-000000000001', ':tenant_id', null,
   'clinica-osteojp@osteojp.invalid', 'Clínica OsteoJP', false, false, false),
  ('0c1a0000-0000-4000-8000-000000000002', ':tenant_id', null,
   'nesa@osteojp.invalid',            'NESA',            false, false, false)
on conflict (id) do nothing;

commit;


-- ---------------------------------------------------------------------------
-- STEP 3. VERIFY. Read-only. Paste this output back.
-- ---------------------------------------------------------------------------
-- EXPECTED: EXACTLY 2 ROWS, and every flag column as written below.
--
--   full_name        | role_id | is_active | is_bookable | has_auth_user
--   -----------------+---------+-----------+-------------+--------------
--   Clínica OsteoJP  | (null)  | f         | f           | f
--   NESA             | (null)  | f         | f           | f
--
-- STOP IF `has_auth_user` IS TRUE FOR EITHER ROW. A credential exists for an
--   account that must never have one. Do not proceed with the import; the
--   account has to be understood before it is used.
-- STOP IF FEWER THAN 2 ROWS COME BACK. STEP 2 did not do what it reported.
-- STOP IF is_bookable IS TRUE. The account would appear in the Terapeuta
--   dropdown and reception could book a live appointment against a method.
select u.full_name,
       u.role_id,
       u.is_active,
       u.is_bookable,
       exists (select 1 from auth.users a where a.id = u.id) as has_auth_user,
       u.id                                                  as practitioner_uuid
from   users u
where  u.tenant_id = ':tenant_id'
  and  u.id in ('0c1a0000-0000-4000-8000-000000000001',
                '0c1a0000-0000-4000-8000-000000000002')
order  by u.full_name;


-- ---------------------------------------------------------------------------
-- STEP 4. WIRE THEM INTO THE MAPPING CONFIG. Not SQL - do this by hand.
-- ---------------------------------------------------------------------------
-- In scripts/import/mapping-config.local.json, replace the two
-- PENDING_OWNER_RULING markers with the uuids above:
--
--   "practitionerKeyByName": {
--     ...
--     "Clínica OsteoJP": "0c1a0000-0000-4000-8000-000000000001",
--     "NESA":            "0c1a0000-0000-4000-8000-000000000002"
--   }
--
-- THE KEYS ARE THE VENDOR'S STRINGS AND ARE MATCHED EXACTLY, accents included.
-- "Clínica OsteoJP" carries an í. A config with "Clinica OsteoJP" leaves the
-- vendor key unmapped, and the runner then REFUSES the whole run and names it -
-- which is the correct outcome, but the fix is the accent, not the mapping.
--
-- UNTIL THIS STEP IS DONE THE RUNNER REFUSES TO START: PENDING_OWNER_RULING is
-- a placeholder, and findPlaceholders (scripts/import/run-import.mjs) hard-fails
-- on it before anything is staged.
