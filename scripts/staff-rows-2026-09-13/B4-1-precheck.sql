-- NESA-LV-ROW, step 1 of 3: PRE-CHECK. READ ONLY. Paste into the Supabase SQL Editor.
-- Staff row bdc466d7-f81f-4f8c-aa2e-b85194d73e1a (NESA, Linda-a-Velha). Writes nothing.
-- Every row prints the value found and the value step 2 needs. Step 2 refuses on its own
-- if any "needs" is not met, so this is for reading, not for gating.
with t as (select 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'::uuid as id)
select '1. staff row exists' as fact,
       (select count(*) from public.users u, t where u.id = t.id)::text as found,
       '1' as needs
union all
select '2. staff row name',
       coalesce((select u.full_name from public.users u, t where u.id = t.id), '(none)'),
       'NESA'
union all
select '3. flagged as the shared machine',
       coalesce((select u.is_shared_resource::text from public.users u, t where u.id = t.id), '(none)'),
       'false (the CB machine row is 0c1a...0002, not this one)'
union all
select '4. is_active (kept as is)',
       coalesce((select u.is_active::text from public.users u, t where u.id = t.id), '(none)'),
       'any'
union all
select '5. is_bookable (kept as is)',
       coalesce((select u.is_bookable::text from public.users u, t where u.id = t.id), '(none)'),
       'any'
union all
select '6. logins (auth.users rows)',
       (select count(*) from auth.users au, t where au.id = t.id)::text,
       '1'
union all
select '7. sign-in identities',
       (select count(*) from auth.identities ai, t where ai.user_id = t.id)::text,
       'any (removed with the login)'
union all
select '8. open sessions',
       (select count(*) from auth.sessions s, t where s.user_id = t.id)::text,
       'any (removed with the login)'
union all
select '9. last sign-in',
       coalesce((select au.last_sign_in_at::text from auth.users au, t where au.id = t.id), '(never)'),
       'any'
union all
select '10. clinics (staff_locations, kept)',
       coalesce((select string_agg(l.name, ', ' order by l.name)
                   from public.staff_locations sl join public.locations l on l.id = sl.location_id, t
                  where sl.user_id = t.id), '(none)'),
       'any'
union all
select '11. appointments as Terapeuta (kept)',
       (select count(*) from public.appointments a, t where a.practitioner_id = t.id)::text,
       'any'
union all
select '12. tables that point at a login (auth.users foreign keys)',
       (select string_agg(n.nspname || '.' || c2.relname || ' (on delete ' || c.confdeltype::text || ')', ', ' order by 1)
          from pg_constraint c
          join pg_class c2 on c2.oid = c.conrelid
          join pg_namespace n on n.oid = c2.relnamespace
         where c.contype = 'f' and c.confrelid = 'auth.users'::regclass),
       'every one "on delete c" (cascade)'
union all
select '13. this block already run (audit rows)',
       (select count(*) from public.audit_log al, t
         where al.action = 'staff.remove_login' and al.entity_id = t.id)::text,
       '0';
