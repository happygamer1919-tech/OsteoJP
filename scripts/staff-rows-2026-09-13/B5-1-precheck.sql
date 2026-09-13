-- JP-ROW, step 1 of 3: PRE-CHECK. READ ONLY. Paste into the Supabase SQL Editor.
-- Both JP rows side by side. "future_bookings" counts appointments from now on that hold the
-- row's hour in EITHER role (Terapeuta or Terapeuta 2), cancelled and no-show excluded.
-- Step 2 sets is_bookable false on the ONE row whose future_bookings is 0, and refuses if that
-- is not exactly one row.
with jp as (
  select u.*
    from public.users u
   where u.id in ('54d486e0-a9c3-4c82-acac-8b909ce5a2d0', '0c1a0000-0000-4000-8000-000000000001')
      or u.full_name = (select full_name from public.users where id = '54d486e0-a9c3-4c82-acac-8b909ce5a2d0')
)
select jp.id,
       jp.full_name,
       r.slug as role,
       jp.is_active,
       jp.is_bookable,
       (select count(*) from auth.users au where au.id = jp.id) as logins,
       (select count(*) from public.appointments a
         where (a.practitioner_id = jp.id or a.practitioner_2_id = jp.id)
           and a.starts_at >= now()
           and a.status not in ('cancelled', 'no_show')) as future_bookings,
       (select string_agg(l.name || ' ' || x.n, ', ' order by l.name)
          from (select a.location_id, count(*) as n
                  from public.appointments a
                 where (a.practitioner_id = jp.id or a.practitioner_2_id = jp.id)
                   and a.starts_at >= now()
                   and a.status not in ('cancelled', 'no_show')
                 group by a.location_id) x
          join public.locations l on l.id = x.location_id) as future_bookings_by_clinic,
       (select max(a.starts_at)::text from public.appointments a
         where a.practitioner_id = jp.id and a.status not in ('cancelled', 'no_show')) as latest_booking,
       (select count(*) from public.availability_templates t
         where t.user_id = jp.id and t.is_active
           and (t.valid_until is null or t.valid_until >= current_date)) as active_hours_rows,
       (select string_agg(l.name, ', ' order by l.name)
          from public.staff_locations sl join public.locations l on l.id = sl.location_id
         where sl.user_id = jp.id) as clinics,
       (select count(*) from public.audit_log al
         where al.action = 'staff.profile_update'
           and al.metadata->>'card' = 'JP-ROW-not-taking-patients-set-not-bookable') as this_block_already_run
  from jp
  left join public.roles r on r.id = jp.role_id
 order by jp.id;
