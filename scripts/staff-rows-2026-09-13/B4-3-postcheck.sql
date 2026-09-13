-- NESA-LV-ROW, step 3 of 3: POST-CHECK. READ ONLY. Every row must read found = needs.
with t as (select 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'::uuid as id)
select '1. logins (auth.users rows)' as fact,
       (select count(*) from auth.users au, t where au.id = t.id)::text as found, '0' as needs
union all
select '2. sign-in identities', (select count(*) from auth.identities ai, t where ai.user_id = t.id)::text, '0'
union all
select '3. open sessions', (select count(*) from auth.sessions s, t where s.user_id = t.id)::text, '0'
union all
select '4. staff row still exists', (select count(*) from public.users u, t where u.id = t.id)::text, '1'
union all
select '5. staff row still named NESA',
       coalesce((select u.full_name from public.users u, t where u.id = t.id), '(none)'), 'NESA'
union all
select '6. audit rows for this removal',
       (select count(*) from public.audit_log al, t
         where al.action = 'staff.remove_login' and al.entity_id = t.id)::text, '1';
