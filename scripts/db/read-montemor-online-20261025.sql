-- MN-READ, 2026-10-25: IS MONTEMOR BOOKABLE ONLINE NOW, AND WHICH VISITS DOES IT
-- ALREADY HOLD. Strategy's R10 of 2026-10-25: Montemor's opening moved to
-- November 2026, so it must show no online booking slots before its opening
-- date; existing Montemor visits are listed (counts and dates by source) and
-- never cancelled or moved. This read decides whether a hold is needed.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside
-- `begin read only` ... `rollback`, so the server refuses any write. Verdict 0
-- reads the transaction's own setting.
--
-- WHAT IT PRINTS: ONE result set (so the Supabase SQL editor, which shows only
-- the last result, shows all of it), ordered by `n`, columns
-- n | check | observed | expected | verdict. Verdicts are OK, VACUOUS or FAIL;
-- rows that only inform read INFO and are never counted. It prints location ids
-- (a clinic, not a person), counts, Lisbon dates, appointment `origin` and
-- `status` values. No patient id, no staff id, no name of a person, no phone,
-- no email, no address, no note.
--
-- THE CLINICS are found by name, because production has no code column:
-- Montemor `name ILIKE '%montemor%'` or a bracketed `(MN)`; Linda-a-Velha
-- `ILIKE '%linda%'` or `(LV)`; Castelo Branco `ILIKE '%castelo%'` or `(CB)`.
-- Archived rows count: a second Montemor row, active or not, is a FAIL.
--
-- WHAT "BOOKABLE ONLINE" MEANS HERE, read from the code on origin/main at
-- e7a14d77 and copied predicate by predicate (a change to that code changes
-- this read's meaning; the dates are the ones this file was written against):
--   listed     the logged-in portal's catalogue and its write guard, and the
--              public form's catalogue and submit check, all list a clinic when
--              `locations.is_active` AND locationHasBookableTherapist()
--              (apps/api/lib/booking/location-bookable.ts): an active
--              availability_templates row at the clinic, held by an active,
--              bookable user who is not a shared resource. NO DATE in it.
--   staffed    the logged-in catalogue offers a service at a clinic only when a
--              user of that kind has an active template there valid TODAY in
--              Lisbon AND a therapist_services row for that service, and the
--              service is active, not internal_only, patient_bookable, with a
--              location_id that is null or the clinic
--              (apps/api/lib/appointments/store.ts getCatalog).
--   slot days  days from today to today + 14 (the portal's horizon,
--              apps/api/lib/appointments/booking.ts) on which such a user has an
--              active template at the clinic for that weekday, valid that day,
--              and is mapped to such a service (store.ts listOpenSlots). An
--              upper bound: the slot query then removes starts taken by
--              appointments, time off, the midday closure and the closing hour.
--   guest      the public form lists a service at a clinic when the clinic is
--              listed and an active service_location_prices row exists there for
--              an active, non-internal, patient-bookable service whose
--              location_id is null or the clinic
--              (apps/api/app/api/v1/booking/guest/catalog/route.ts). The public
--              form shows no slots: reception answers its requests.
--   PORTAL ONLINE = listed AND staffed > 0 AND slot days > 0.
--
-- EVERY VERDICT CARRIES A CONTROL, so a zero is never a pass by default:
--   0  the transaction is READ ONLY;
--   1  exactly one Montemor row exists. CONTROL: exactly one Linda-a-Velha row
--      and exactly one Castelo Branco row match their own patterns;
--   2  THE MEASURE WORKS: Linda-a-Velha and Castelo Branco are each PORTAL
--      ONLINE by the same predicates. If either is not, the read cannot tell a
--      Montemor that is not bookable from a measure that finds nothing, and
--      verdict 2 reads VACUOUS.
-- Then INFO rows: Montemor's figures and the line MN_ONLINE, the same figures
-- for the two controls, Montemor's schedule rows (counts and dates), and its
-- appointments by Lisbon date, origin and status.
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -f scripts/db/read-montemor-online-20261025.sql -c "rollback"
with
today as (
  select (now() at time zone 'Europe/Lisbon')::date as d
),
clinic as (
  select 'MN' as code, l.* from public.locations l
   where l.name ilike '%montemor%' or l.name ~* '\(MN\)'
  union all
  select 'LV', l.* from public.locations l
   where l.name ilike '%linda%' or l.name ~* '\(LV\)'
  union all
  select 'CB', l.* from public.locations l
   where l.name ilike '%castelo%' or l.name ~* '\(CB\)'
),
counts as (
  select count(*) filter (where code = 'MN') as mn,
         count(*) filter (where code = 'LV') as lv,
         count(*) filter (where code = 'CB') as cb
    from clinic
),
one as (
  -- Only a clinic matched exactly once is measured.
  select c.* from clinic c
   where (select count(*) from clinic x where x.code = c.code) = 1
),
fig as (
  select o.code, o.id, o.tenant_id, o.is_active,
    (select count(*)
       from public.availability_templates av
       join public.users u on u.id = av.user_id and u.tenant_id = av.tenant_id
      where av.tenant_id = o.tenant_id and av.location_id = o.id
        and av.is_active = true and u.is_active = true
        and u.is_bookable = true and u.is_shared_resource = false) as fragment_rows,
    (select count(distinct s.id)
       from public.services s
      where s.tenant_id = o.tenant_id and s.is_active = true
        and s.internal_only = false and s.patient_bookable = true
        and (s.location_id is null or s.location_id = o.id)
        and exists (
          select 1 from public.users u
           where u.tenant_id = o.tenant_id and u.is_active = true
             and u.is_bookable = true and u.is_shared_resource = false
             and exists (
               select 1 from public.availability_templates av, today t
                where av.tenant_id = o.tenant_id and av.user_id = u.id
                  and av.location_id = o.id and av.is_active = true
                  and (av.valid_from  is null or av.valid_from  <= t.d)
                  and (av.valid_until is null or av.valid_until >= t.d))
             and exists (
               select 1 from public.therapist_services ts
                where ts.tenant_id = o.tenant_id
                  and ts.therapist_user_id = u.id and ts.service_id = s.id))) as staffed_today,
    (select count(distinct g.day)
       from today t
       cross join lateral generate_series(t.d, t.d + 14, interval '1 day') as g(day)
      where exists (
        select 1
          from public.availability_templates av
          join public.users u on u.id = av.user_id and u.tenant_id = av.tenant_id
         where av.tenant_id = o.tenant_id and av.location_id = o.id
           and av.is_active = true and u.is_active = true
           and u.is_bookable = true and u.is_shared_resource = false
           and av.weekday = extract(dow from g.day)::int
           and (av.valid_from  is null or av.valid_from  <= g.day::date)
           and (av.valid_until is null or av.valid_until >= g.day::date)
           and exists (
             select 1 from public.therapist_services ts
             join public.services s on s.id = ts.service_id and s.tenant_id = ts.tenant_id
              where ts.tenant_id = o.tenant_id and ts.therapist_user_id = u.id
                and s.is_active = true and s.internal_only = false
                and s.patient_bookable = true
                and (s.location_id is null or s.location_id = o.id)))) as slot_days,
    (select count(distinct s.id)
       from public.services s
       join public.service_location_prices p
         on p.service_id = s.id and p.tenant_id = s.tenant_id
      where s.tenant_id = o.tenant_id and p.location_id = o.id and p.is_active = true
        and s.is_active = true and s.internal_only = false and s.patient_bookable = true
        and (s.location_id is null or s.location_id = o.id)) as guest_priced
  from one o
),
f as (
  select fig.*,
         (fig.is_active and fig.fragment_rows > 0) as listed,
         (fig.is_active and fig.fragment_rows > 0
          and fig.staffed_today > 0 and fig.slot_days > 0) as portal_online
    from fig
),
mn as (select * from f where code = 'MN'),
ctl as (
  select count(*) filter (where portal_online) as online,
         count(*) as measured
    from f where code in ('LV', 'CB')
),
appts as (
  select (a.starts_at at time zone 'Europe/Lisbon')::date as day,
         a.origin, a.status::text as status, count(*) as n
    from public.appointments a
    join mn on mn.id = a.location_id and mn.tenant_id = a.tenant_id
   group by 1, 2, 3
),
tpl as (
  select count(*) filter (where av.is_active)     as active_rows,
         count(*) filter (where not av.is_active) as inactive_rows,
         count(distinct av.user_id)               as holders,
         min(av.valid_from)                        as first_from,
         max(av.valid_until)                       as last_until,
         count(*) filter (where av.is_active and av.valid_from > (select d from today)) as active_not_started
    from public.availability_templates av
    join mn on mn.id = av.location_id and mn.tenant_id = av.tenant_id
)
select n, "check", observed, expected, verdict from (
  select 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1,
         '1. exactly one Montemor row, active or archived (control: exactly one Linda-a-Velha and one Castelo Branco row)',
         mn::text || '; control ' || lv::text || ', ' || cb::text,
         '1; control 1, 1',
         case when mn = 1 and lv = 1 and cb = 1 then 'OK' else 'FAIL' end
    from counts
  union all
  select 2,
         '2. the measure works: Linda-a-Velha and Castelo Branco are each PORTAL ONLINE by the same predicates',
         online::text || ' of ' || measured::text,
         '2 of 2',
         case when measured = 2 and online = 2 then 'OK'
              when measured = 2 then 'VACUOUS' else 'FAIL' end
    from ctl
  union all
  select 10 + case code when 'MN' then 0 when 'LV' then 1 else 2 end,
         code || ': location id, is_active, listed, staffed services today, slot days in the next 14, guest priced services',
         id::text || ' | is_active=' || is_active::text || ' | listed=' || listed::text
           || ' | staffed_today=' || staffed_today::text || ' | slot_days_next_14=' || slot_days::text
           || ' | guest_priced=' || guest_priced::text,
         case when code = 'MN' then 'information' else 'control: listed, staffed > 0, slot days > 0' end,
         'INFO'
    from f
  union all
  select 20,
         'MN_ONLINE',
         'portal_listed=' || listed::text || ' portal_staffed_services_today=' || staffed_today::text
           || ' portal_slot_days_next_14=' || slot_days::text || ' portal_online=' || portal_online::text
           || ' guest_listed=' || listed::text || ' guest_priced_services=' || guest_priced::text,
         'a hold is needed if portal_online=true (slots) or guest_listed=true (requests)',
         'INFO'
    from mn
  union all
  select 21,
         'MN schedule rows: active, inactive, distinct holders, earliest valid_from, latest valid_until, active rows not started yet',
         active_rows::text || ', ' || inactive_rows::text || ', ' || holders::text || ', '
           || coalesce(first_from::text, 'none') || ', ' || coalesce(last_until::text, 'none') || ', '
           || active_not_started::text,
         'information', 'INFO'
    from tpl
  union all
  select 30,
         'MN appointments in total, earliest and latest Lisbon date',
         coalesce(sum(n), 0)::text || ', ' || coalesce(min(day)::text, 'none') || ', ' || coalesce(max(day)::text, 'none'),
         'information', 'INFO'
    from appts
  union all
  select 31, 'MN appointments by origin: ' || origin, sum(n)::text, 'information', 'INFO'
    from appts group by origin
  union all
  select 32, 'MN appointments by status: ' || status, sum(n)::text, 'information', 'INFO'
    from appts group by status
  union all
  select 40, 'MN appointments on ' || day::text || ', origin ' || origin || ', status ' || status,
         n::text, 'information', 'INFO'
    from appts
) r
order by n, "check";
