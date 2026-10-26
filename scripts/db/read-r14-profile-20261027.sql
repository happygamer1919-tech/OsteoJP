-- R14-PROFILE, 2026-10-27: THE APPOINTMENTS PROFILE (strategy R14 deliverable 2,
-- with R12's counts). Counts, Lisbon dates and months, clinic codes and fixed
-- labels ONLY: no name, no patient id, no appointment id, no staff id, no
-- free text.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside
-- `begin read only` ... `rollback`, so the server refuses any write. Verdict 0
-- reads the transaction's own setting.
--
-- WHAT IT PRINTS: ONE result set (the Supabase SQL editor shows only the last
-- one), ordered by `n` then `check`, columns n | check | observed | expected |
-- verdict. Verdicts are OK, VACUOUS or FAIL; rows that only inform read INFO
-- and are never counted. Every INFO row's `check` starts with the ruling bullet
-- it answers (B1 to B7, B7 being R12) and the count it implements (P1 to P30 of
-- the private code answers of 2026-10-26).
--
-- THE CONVENTION THE TEST ENFORCES (scripts/read-r14-profile-20261027.test.mjs):
--   * every printed row comes from a CTE named r_* (INFO rows) or v_*
--     (verdicts); `out` unions them and reads nothing else;
--   * an r_* or v_* select list names no id column (outside count(...),
--     filter (...) and exists (...)), and NO select list anywhere names a
--     personal column (name, phone, email, NIF, date of birth, notes, address,
--     job title, last_error). Names are matched only in WHERE and GROUP BY, and
--     only counts leave the group;
--   * `raw` (the import ledger's source row) is read only as raw->>'estado' and
--     raw->>'tipo_servico'; `metadata` (audit_log) only through the named keys
--     startsAt, fromStatus, toStatus, from_status, to_status, outcome,
--     allowConflict, clonedFrom. Never `metadata->>'reason'`, never whole;
--   * a printed value from source data is either a count, a Lisbon date or
--     month, a clinic code, or a word from a fixed list (an unknown word prints
--     as `other`).
-- Verdict 6 checks the printed rows themselves: none may carry a uuid
-- fragment, an `@` or a run of nine digits (a phone number or a NIF). The
-- document's block checks the transcript for the same three again.
--
-- DEFINITIONS (from the code answers and docs/data-dictionary-appointments.md):
--   clinic   `appointments.location_id`, printed as a code found by name, as
--            MN-READ does: MN `name ILIKE '%montemor%'` or `(MN)`, LV `%linda%`
--            or `(LV)`, CB `%castelo%` or `(CB)`; any other location is OTHER,
--            and a location two patterns match is AMBIGUOUS (verdict 1 FAILs
--            on either).
--   origin   `imported`: the id is a `migration_staging_rows.imported_entity_id`
--            with source_system 'fisiozero', entity_type 'appointment', status
--            'imported' (the only marker); otherwise `native_portal` when
--            `origin = 'patient_portal'`, else `native_staff`.
--   year, month
--            of `starts_at` (the CURRENT planned start) in Europe/Lisbon.
--   moved    a native row whose current start differs, to the minute, from the
--            `startsAt` of its FIRST `appointment.create` audit row.
--   person rows (staff)
--            `users` rows grouped by the full name with any bracketed text and
--            any trailing clinic code removed, accents folded, case and spaces
--            normalised. The grouping runs inside SQL; only counts leave it.
--            Verdict 5 proves it on the two known splits: the JP rows named in
--            docs/data-op-staff-10-v2.md fall in one group, and every row named
--            like NESA falls in one group.
--   duplicate-looking patients
--            NO RULE IS ON RECORD for the earlier 2,288 figure (searched: the
--            repository, every branch, the handover folder, the memory). Row 50
--            prints SIX candidate rules side by side, each as groups and rows,
--            so the one that reproduces 2,288 (if any) names itself. The rule
--            needs a ruling.
--
-- VERDICTS, each with a control so a zero is never a pass by default:
--   0  the transaction is READ ONLY;
--   1  every location is exactly one of LV, CB, MN; LV and CB exist once each,
--      MN at most once; no OTHER, no AMBIGUOUS. FAIL otherwise;
--   2  the measure has something to measure: imported appointments > 0, native
--      appointments > 0, live patients > 0, and appointments whose service has a
--      default length > 0. VACUOUS otherwise;
--   3  the reschedule measure can see a move: native appointments with a first
--      `appointment.create` row carrying startsAt > 0. VACUOUS otherwise;
--   4  schedule coverage has rows: availability_templates > 0 and time_off > 0.
--      VACUOUS otherwise;
--   5  the person-rows rule finds the known splits (above). VACUOUS otherwise;
--   6  no printed row carries a uuid fragment, an `@` or nine digits in a row.
--      FAIL otherwise.
--
-- Run (the document's block does exactly this, with a 300 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '300s'"
--        -f scripts/db/read-r14-profile-20261027.sql -c "rollback"
with
lisbon as (
  select date_trunc('month', now() at time zone 'Europe/Lisbon')::date as this_month,
         (now() at time zone 'Europe/Lisbon')::date as today
),
loc as (
  select 'MN' as code, l.id from public.locations l
   where l.name ilike '%montemor%' or l.name ~* '\(MN\)'
  union all
  select 'LV', l.id from public.locations l
   where l.name ilike '%linda%' or l.name ~* '\(LV\)'
  union all
  select 'CB', l.id from public.locations l
   where l.name ilike '%castelo%' or l.name ~* '\(CB\)'
  union all
  select 'OTHER', l.id from public.locations l
   where not (l.name ilike '%montemor%' or l.name ~* '\(MN\)'
           or l.name ilike '%linda%' or l.name ~* '\(LV\)'
           or l.name ilike '%castelo%' or l.name ~* '\(CB\)')
),
clinic as (
  select g.id, case when count(*) > 1 then 'AMBIGUOUS' else min(g.code) end as code
    from loc g group by g.id
),
imp as (
  select distinct m.imported_entity_id as id
    from public.migration_staging_rows m
   where m.source_system = 'fisiozero' and m.entity_type = 'appointment'
     and m.status = 'imported' and m.imported_entity_id is not null
),
imp_estado as (
  select m.imported_entity_id as id,
         case when lower(trim(m.raw->>'estado')) in ('realizada', 'falta', 'marcada')
              then lower(trim(m.raw->>'estado')) else 'other' end as estado
    from public.migration_staging_rows m
   where m.source_system = 'fisiozero' and m.entity_type = 'appointment'
     and m.status = 'imported' and m.imported_entity_id is not null
),
ap as (
  select a.id, a.patient_id, a.practitioner_id, a.location_id, a.service_id,
         a.status::text as status, a.confirmation_state::text as cstate,
         a.starts_at, a.ends_at, a.created_at,
         case when i.id is not null then 'imported'
              when a.origin = 'patient_portal' then 'native_portal'
              else 'native_staff' end as oc,
         coalesce(c.code, 'NONE') as clinic,
         extract(year from a.starts_at at time zone 'Europe/Lisbon')::int as yr,
         to_char(a.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM') as mon,
         a.starts_at >= ((select this_month from lisbon) - interval '12 months')::timestamp at time zone 'Europe/Lisbon'
           and a.starts_at < ((select this_month from lisbon) + interval '1 month')::timestamp at time zone 'Europe/Lisbon' as last13,
         round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0)::int as mins,
         case when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) = 1 then '1 minute'
              when a.service_id is null then 'other, no service'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) = s.duration_min then 'service default'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) < s.duration_min then 'other, shorter than the default'
              else 'other, longer than the default' end as dur_bucket,
         case when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) <= 1 then 'a. 1 or less'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) < 15 then 'b. 2-14'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) < 30 then 'c. 15-29'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) = 30 then 'd. 30'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) < 60 then 'e. 31-59'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) = 60 then 'f. 60'
              when round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0) <= 90 then 'g. 61-90'
              else 'h. over 90' end as dur_fine,
         s.duration_min is not null and s.duration_min > 0 as has_default,
         a.patient_2_id is not null as has_p2,
         a.practitioner_2_id is not null as has_pr2,
         a.booking_group_id is not null as has_group,
         coalesce(u.is_shared_resource, false) as pr_shared
    from public.appointments a
    left join imp i on i.id = a.id
    left join clinic c on c.id = a.location_id
    left join public.services s on s.id = a.service_id
    left join public.users u on u.id = a.practitioner_id
),

-- ---------------------------------------------------------------- B2 helpers
fc as (
  -- The FIRST appointment.create row of each appointment, with its planned
  -- start (startsAt) and whether it is a clone ("Marcar novamente").
  select distinct on (al.entity_id) al.entity_id as appt_id,
         case when al.metadata->>'startsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}'
              then (al.metadata->>'startsAt')::timestamptz end as first_start,
         (al.metadata ? 'clonedFrom') as cloned
    from public.audit_log al
   where al.action = 'appointment.create' and al.entity_type = 'appointment'
     and al.entity_id is not null
   order by al.entity_id, al.created_at, al.id
),
rs as (
  select al.entity_id as appt_id, count(*) as n_res
    from public.audit_log al
   where al.action = 'appointment.reschedule' and al.entity_type = 'appointment'
     and al.entity_id is not null
   group by al.entity_id
),
anyaudit as (
  select distinct al.entity_id as appt_id
    from public.audit_log al
   where al.entity_type = 'appointment' and al.entity_id is not null
),
ca as (
  select al.entity_id as appt_id, min(al.created_at) as cancel_at
    from public.audit_log al
   where al.action = 'appointment.cancel' and al.entity_type = 'appointment'
     and al.entity_id is not null
   group by al.entity_id
),
sn as (
  select n.appointment_id as appt_id,
         bool_or(n.kind = 'rescheduled') as res,
         min(n.occurred_at) filter (where n.kind = 'cancelled') as cancel_at
    from public.staff_notifications n
   group by n.appointment_id
),
nat as (
  select ap.id, ap.patient_id, ap.oc, ap.status, ap.starts_at, ap.created_at,
         fc.appt_id is not null as has_create,
         fc.first_start,
         coalesce(fc.cloned, false) as cloned,
         coalesce(rs.n_res, 0) as n_res,
         coalesce(sn.res, false) as sn_res,
         aa.appt_id is not null as has_any_audit,
         coalesce(ca.cancel_at, sn.cancel_at) as cancel_at,
         fc.first_start is not null
           and date_trunc('minute', ap.starts_at) <> date_trunc('minute', fc.first_start) as moved
    from ap
    left join fc on fc.appt_id = ap.id
    left join rs on rs.appt_id = ap.id
    left join sn on sn.appt_id = ap.id
    left join anyaudit aa on aa.appt_id = ap.id
    left join ca on ca.appt_id = ap.id
   where ap.oc <> 'imported'
),

-- ---------------------------------------------------------------- B3 helper
ov as (
  -- A row overlaps when it starts before the latest end of the same
  -- practitioner's earlier rows (cancelled and no_show excluded).
  select ap.yr, ap.oc,
         ap.starts_at < max(ap.ends_at) over (
           partition by ap.practitioner_id order by ap.starts_at, ap.id
           rows between unbounded preceding and 1 preceding) as ovl
    from ap
   where ap.status not in ('cancelled', 'no_show')
),

-- ---------------------------------------------------------------- B4 helpers
months_t as (
  select g.m::date as m
    from lisbon x
    cross join lateral generate_series(
      (select date_trunc('month', min(av.created_at at time zone 'Europe/Lisbon'))
         from public.availability_templates av),
      x.this_month + interval '2 months', interval '1 month') as g(m)
),
tplx as (
  select av.user_id, coalesce(c.code, 'NONE') as code, av.is_active,
         u.is_shared_resource as shared,
         (av.created_at at time zone 'Europe/Lisbon')::date as created_d,
         av.valid_from, av.valid_until,
         extract(epoch from (av.end_time - av.start_time)) / 3600.0 as hours
    from public.availability_templates av
    join public.users u on u.id = av.user_id
    left join clinic c on c.id = av.location_id
),
months_b as (
  select g.m::date as m
    from lisbon x
    cross join lateral generate_series(
      (select date_trunc('month', min(t.starts_at at time zone 'Europe/Lisbon'))
         from public.time_off t),
      x.this_month + interval '2 months', interval '1 month') as g(m)
),
tox as (
  select t.user_id, t.reason::text as reason, u.is_shared_resource as shared,
         t.starts_at, t.ends_at
    from public.time_off t
    join public.users u on u.id = t.user_id
),

-- ---------------------------------------------------------------- B5 helpers
pclin as (
  select pl.patient_id, pl.location_id from public.patient_locations pl
  union
  select a.patient_id, a.location_id from public.appointments a
),
ph as (
  -- Fisiozero placeholder patients (scripts/import/cb-reconciliation.sql
  -- section 11, the same pattern). Matched here; only counts leave.
  select p.id
    from public.patients p
   where p.deleted_at is null
     and (p.full_name ~* 'n[aãáâ]o[[:space:]._-]*marcar'
       or p.full_name ~* '^[[:space:]]*(bloque|bloqu|reserv|indispon)'
       or p.full_name ~* '\m(ferias|f[eé]rias|almo[cç]o|pausa|reuni[aã]o|intervalo|feriado)\M'
       or p.full_name ~* '^[[:space:]]*(teste|test|x+|-+|\.+)[[:space:]]*$'
       or p.full_name ~* '\m(nao|n[aã]o)[[:space:]]+(usar|utilizar|mexer)\M')
),
dup_name_x as (
  -- D1 and D3: live rows sharing a normalised full name. Counts only.
  select count(distinct p.id) as rows_in_group, count(distinct pc.location_id) as clinics
    from public.patients p
    left join pclin pc on pc.patient_id = p.id
   where p.deleted_at is null and p.merged_into_id is null
   group by lower(regexp_replace(trim(translate(p.full_name,
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[[:space:]]+', ' ', 'g'))
  having count(distinct p.id) >= 2
),
dup_name_dob as (
  -- D2 and D4: the same, and the same date of birth (set on every row).
  select count(distinct p.id) as rows_in_group, count(distinct pc.location_id) as clinics
    from public.patients p
    left join pclin pc on pc.patient_id = p.id
   where p.deleted_at is null and p.merged_into_id is null and p.date_of_birth is not null
   group by lower(regexp_replace(trim(translate(p.full_name,
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[[:space:]]+', ' ', 'g')),
            p.date_of_birth
  having count(distinct p.id) >= 2
),
dup_nif as (
  -- D5: live rows sharing a NIF (digits only, set).
  select count(distinct p.id) as rows_in_group, count(distinct pc.location_id) as clinics
    from public.patients p
    left join pclin pc on pc.patient_id = p.id
   where p.deleted_at is null and p.merged_into_id is null
     and regexp_replace(coalesce(p.nif, ''), '[^0-9]', '', 'g') <> ''
   group by regexp_replace(p.nif, '[^0-9]', '', 'g')
  having count(distinct p.id) >= 2
),
dup_phone as (
  -- D6: live rows sharing a mobile number (families share them: context only).
  select count(distinct p.id) as rows_in_group, count(distinct pc.location_id) as clinics
    from public.patients p
    left join pclin pc on pc.patient_id = p.id
   where p.deleted_at is null and p.merged_into_id is null and p.phone_e164 is not null
   group by p.phone_e164
  having count(distinct p.id) >= 2
),
pat_clinics as (
  select p.id,
         (select count(distinct pl.location_id) from public.patient_locations pl
           where pl.patient_id = p.id) as linked_clinics,
         (select count(distinct a.location_id) from public.appointments a
           where a.patient_id = p.id) as appt_clinics,
         p.deleted_at is null and p.merged_into_id is null as live,
         p.merged_into_id is not null as merged,
         p.deleted_at is not null as deleted,
         extract(year from p.created_at at time zone 'Europe/Lisbon')::int as created_yr,
         exists (select 1 from public.migration_staging_rows m
                  where m.source_system = 'fisiozero' and m.entity_type = 'patient'
                    and m.status = 'imported' and m.imported_entity_id = p.id) as imported
    from public.patients p
),
firstv as (
  select distinct on (ap.patient_id) ap.patient_id, ap.yr, ap.clinic, ap.oc
    from ap
   where ap.status = 'completed'
   order by ap.patient_id, ap.starts_at, ap.id
),

-- ---------------------------------------------------------------- B6 helpers
staff_groups as (
  -- One row per person-key. The key is the normalised name; it never leaves
  -- this CTE. Only counts do.
  select count(distinct u.id) as rows_in_group,
         (count(distinct u.id) filter (where u.is_shared_resource)) as shared_rows,
         (count(distinct u.id) filter (where u.is_active)) as active_rows,
         (count(distinct u.id) filter (where u.is_bookable)) as bookable_rows,
         (count(distinct u.id) filter (where u.id in ('54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid,
                                                      '0c1a0000-0000-4000-8000-000000000001'::uuid))) as jp_rows,
         (count(distinct u.id) filter (where u.full_name ilike '%nesa%')) as nesa_rows,
         count(distinct sl.location_id) as clinics
    from public.users u
    left join public.staff_locations sl on sl.user_id = u.id
   group by lower(trim(regexp_replace(regexp_replace(regexp_replace(translate(u.full_name,
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
              '[\(\[][^\)\]]*[\)\]]', ' ', 'g'),
              '[[:space:]]*[-/]?[[:space:]]*\m(cb|lv|mn)\M[[:space:]]*$', '', 'i'),
              '[[:space:]]+', ' ', 'g')))
),
ther as (
  select u.is_active,
         (select count(*) from public.therapist_services ts
           where ts.therapist_user_id = u.id) as mapped,
         (select count(distinct a.service_id) from public.appointments a
           where a.practitioner_id = u.id and a.status = 'completed'
             and a.service_id is not null) as delivered_all,
         (select count(distinct a.service_id) from public.appointments a
           where a.practitioner_id = u.id and a.status = 'completed'
             and a.service_id is not null
             and a.starts_at >= now() - interval '365 days') as delivered_12m
    from public.users u
   where u.is_bookable and not u.is_shared_resource
),

-- ================================================================ VERDICTS
v_0 as (
  select 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as chk,
         current_setting('transaction_read_only') as obs,
         'on' as exp,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
),
v_1 as (
  select 1 as n,
         '1. every location is one of LV, CB, MN by name: LV once, CB once, MN at most once, no OTHER, no AMBIGUOUS' as chk,
         'LV ' || (count(*) filter (where code = 'LV'))::text
           || ', CB ' || (count(*) filter (where code = 'CB'))::text
           || ', MN ' || (count(*) filter (where code = 'MN'))::text
           || ', OTHER ' || (count(*) filter (where code = 'OTHER'))::text
           || ', AMBIGUOUS ' || (count(*) filter (where code = 'AMBIGUOUS'))::text as obs,
         'LV 1, CB 1, MN 0 or 1, OTHER 0, AMBIGUOUS 0' as exp,
         case when (count(*) filter (where code = 'LV')) = 1
               and (count(*) filter (where code = 'CB')) = 1
               and (count(*) filter (where code = 'MN')) <= 1
               and (count(*) filter (where code in ('OTHER', 'AMBIGUOUS'))) = 0
              then 'OK' else 'FAIL' end as verdict
    from clinic
),
v_2_counts as (
  select (count(*) filter (where oc = 'imported')) as imported,
         (count(*) filter (where oc <> 'imported')) as native,
         (count(*) filter (where has_default)) as with_default,
         (select count(*) from public.patients p
           where p.deleted_at is null and p.merged_into_id is null) as patients
    from ap
),
v_2 as (
  select 2 as n,
         '2. there is something to measure: imported appointments, native appointments, live patients, appointments whose service has a default length' as chk,
         imported::text || ', ' || native::text || ', ' || patients::text || ', ' || with_default::text as obs,
         'each > 0' as exp,
         case when imported > 0 and native > 0 and patients > 0 and with_default > 0
              then 'OK' else 'VACUOUS' end as verdict
    from v_2_counts
),
v_3 as (
  select 3 as n,
         '3. the reschedule measure can see a move: native appointments whose first appointment.create row carries startsAt' as chk,
         (count(*) filter (where first_start is not null))::text as obs,
         '> 0' as exp,
         case when (count(*) filter (where first_start is not null)) > 0 then 'OK' else 'VACUOUS' end as verdict
    from nat
),
v_4 as (
  select 4 as n,
         '4. schedule coverage has rows: availability_templates rows, time_off rows' as chk,
         (select count(*) from public.availability_templates)::text || ', '
           || (select count(*) from public.time_off)::text as obs,
         'each > 0' as exp,
         case when (select count(*) from public.availability_templates) > 0
               and (select count(*) from public.time_off) > 0
              then 'OK' else 'VACUOUS' end as verdict
),
v_5 as (
  select 5 as n,
         '5. the person-rows rule finds the known splits: the two JP rows in one group; every NESA row (two or more) in one group' as chk,
         'JP rows grouped together: ' || (coalesce(max(jp_rows), 0) = 2)::text
           || '; NESA rows ' || coalesce(sum(nesa_rows), 0)::text
           || ', largest NESA group ' || coalesce(max(nesa_rows), 0)::text as obs,
         'JP rows grouped together: true; NESA rows = largest NESA group >= 2' as exp,
         case when coalesce(max(jp_rows), 0) = 2
               and coalesce(sum(nesa_rows), 0) >= 2
               and coalesce(max(nesa_rows), 0) = coalesce(sum(nesa_rows), 0)
              then 'OK' else 'VACUOUS' end as verdict
    from staff_groups
),

-- ================================================================ B1
r_10 as (
  select 10 as n,
         'B1/P1 appointments by origin and clinic: ' || oc || ', ' || clinic || ': rows, first and last Lisbon start date' as chk,
         count(*)::text || ', ' || to_char(min(starts_at at time zone 'Europe/Lisbon'), 'YYYY-MM-DD')
           || ', ' || to_char(max(starts_at at time zone 'Europe/Lisbon'), 'YYYY-MM-DD') as obs
    from ap group by oc, clinic
),
r_11 as (
  select 11 as n,
         'B1/P2 by year, clinic, origin, status: ' || yr::text || ', ' || clinic || ', ' || oc || ', ' || status as chk,
         count(*)::text as obs
    from ap group by yr, clinic, oc, status
),
r_12 as (
  select 12 as n,
         'B1/P2 by month (the last 13 months), clinic, origin, status: ' || mon || ', ' || clinic || ', ' || oc || ', ' || status as chk,
         count(*)::text as obs
    from ap where last13 group by mon, clinic, oc, status
),
r_13 as (
  select 13 as n,
         'B1/P3 imported by source estado, mapped status, clinic: ' || e.estado || ' -> ' || ap.status || ', ' || ap.clinic as chk,
         count(*)::text as obs
    from imp_estado e join ap on ap.id = e.id
   group by e.estado, ap.status, ap.clinic
),
r_14 as (
  select 14 as n,
         'B1/P4 imported rows by clinic: first and last Lisbon created date (the import runs), distinct import days' as chk,
         string_agg(x.clinic || ' ' || x.first_d || ' to ' || x.last_d || ' on ' || x.days::text || ' days', '; ' order by x.clinic) as obs
    from (select clinic,
                 to_char(min(created_at at time zone 'Europe/Lisbon'), 'YYYY-MM-DD') as first_d,
                 to_char(max(created_at at time zone 'Europe/Lisbon'), 'YYYY-MM-DD') as last_d,
                 count(distinct (created_at at time zone 'Europe/Lisbon')::date) as days
            from ap where oc = 'imported' group by clinic) x
),
r_15 as (
  select 15 as n,
         'B1/P5 past and still scheduled or confirmed (outcome unknown), by period, clinic, origin: '
           || case when last13 then mon else yr::text end || ', ' || clinic || ', ' || oc as chk,
         count(*)::text as obs
    from ap
   where ends_at < now() and status in ('scheduled', 'confirmed')
   group by case when last13 then mon else yr::text end, clinic, oc
),
r_16 as (
  select 16 as n,
         'B1/P6 native rows by confirmation_state and status: ' || cstate || ', ' || status as chk,
         count(*)::text as obs
    from ap where oc <> 'imported' group by cstate, status
),
r_17 as (
  select 17 as n,
         'B1/P15 P18 shapes by year and origin: ' || yr::text || ', ' || oc
           || ': shared-resource practitioner, practitioner_2 set, booking group set, patient_2 set' as chk,
         (count(*) filter (where pr_shared))::text || ', ' || (count(*) filter (where has_pr2))::text || ', '
           || (count(*) filter (where has_group))::text || ', ' || (count(*) filter (where has_p2))::text as obs
    from ap group by yr, oc
),
r_18 as (
  select 18 as n,
         'B1/P13 imported rows with no service, by clinic; distinct source service types among them (count only)' as chk,
         coalesce(string_agg(x.clinic || ' ' || x.n::text, '; ' order by x.clinic), 'none')
           || '; distinct source types ' || (select count(distinct lower(trim(m.raw->>'tipo_servico')))
                from public.migration_staging_rows m
                join public.appointments a on a.id = m.imported_entity_id
               where m.source_system = 'fisiozero' and m.entity_type = 'appointment'
                 and m.status = 'imported' and a.service_id is null)::text as obs
    from (select clinic, count(*) as n from ap
           where oc = 'imported' and service_id is null group by clinic) x
),
r_19 as (
  select 19 as n,
         'B1 import ledger: appointment rows imported, of which the appointment no longer exists' as chk,
         count(*)::text || ', ' || (count(*) filter (where not exists (
            select 1 from public.appointments a where a.id = m.imported_entity_id)))::text as obs
    from public.migration_staging_rows m
   where m.source_system = 'fisiozero' and m.entity_type = 'appointment'
     and m.status = 'imported' and m.imported_entity_id is not null
),

-- ================================================================ B2
r_20 as (
  select 20 as n,
         'B2/P8 native rows by origin: rows, with any audit row, with an appointment.create row, whose create row carries startsAt: ' || oc as chk,
         count(*)::text || ', ' || (count(*) filter (where has_any_audit))::text || ', '
           || (count(*) filter (where has_create))::text || ', '
           || (count(*) filter (where first_start is not null))::text as obs
    from nat group by oc
),
r_21 as (
  select 21 as n,
         'B2/P10 SAME ROW MOVED, by origin: native rows moved from their first planned start; of those with an appointment.reschedule row, with only a staff notification rescheduled, with neither: ' || oc as chk,
         (count(*) filter (where moved))::text || '; ' || (count(*) filter (where moved and n_res > 0))::text || ', '
           || (count(*) filter (where moved and n_res = 0 and sn_res))::text || ', '
           || (count(*) filter (where moved and n_res = 0 and not sn_res))::text as obs
    from nat group by oc
),
r_22 as (
  select 22 as n,
         'B2/P9 appointment.reschedule: audit rows, distinct appointments, appointments moved once, twice, three times or more; of the appointments, still present' as chk,
         coalesce(sum(rs.n_res), 0)::text || ', ' || count(*)::text || ', '
           || (count(*) filter (where rs.n_res = 1))::text || ', ' || (count(*) filter (where rs.n_res = 2))::text || ', '
           || (count(*) filter (where rs.n_res >= 3))::text || '; '
           || (count(*) filter (where exists (select 1 from public.appointments a where a.id = rs.appt_id)))::text as obs
    from rs
),
r_23 as (
  select 23 as n,
         'B2 NEW ROW: native rows created as a copy (Marcar novamente, clonedFrom); cancels with a known time (audit or notification); of those, followed within 24 hours by a new native row for the same patient' as chk,
         (count(*) filter (where cloned))::text || '; '
           || (count(*) filter (where status = 'cancelled' and cancel_at is not null))::text || ', '
           || (count(*) filter (where status = 'cancelled' and cancel_at is not null and exists (
                select 1 from public.appointments b
                 where b.patient_id = nat.patient_id and b.id <> nat.id
                   and b.created_at >= nat.cancel_at - interval '5 minutes'
                   and b.created_at < nat.cancel_at + interval '24 hours'
                   and not exists (select 1 from imp where imp.id = b.id))))::text as obs
    from nat
),
r_24 as (
  select 24 as n,
         'B2/P7 P11 appointment audit rows by Lisbon month: ' || to_char(date_trunc('month', al.created_at at time zone 'Europe/Lisbon'), 'YYYY-MM') as chk,
         'create=' || (count(*) filter (where al.action = 'appointment.create'))::text
           || ' update_with_from_to=' || (count(*) filter (where al.action = 'appointment.update'
                and (al.metadata ? 'fromStatus' or al.metadata ? 'from_status')))::text
           || ' update_without=' || (count(*) filter (where al.action = 'appointment.update'
                and not (al.metadata ? 'fromStatus' or al.metadata ? 'from_status')))::text
           || ' reschedule=' || (count(*) filter (where al.action = 'appointment.reschedule'))::text
           || ' cancel=' || (count(*) filter (where al.action = 'appointment.cancel'))::text
           || ' estado_correction=' || (count(*) filter (where al.action = 'appointment.estado_correction'))::text
           || ' hard_delete=' || (count(*) filter (where al.action = 'appointment.hard_delete'))::text
           || ' create_allow_conflict=' || (count(*) filter (where al.action = 'appointment.create'
                and al.metadata->>'allowConflict' = 'true'))::text
           || ' reschedule_allow_conflict=' || (count(*) filter (where al.action = 'appointment.reschedule'
                and al.metadata->>'allowConflict' = 'true'))::text as obs
    from public.audit_log al
   where al.entity_type = 'appointment' and al.action like 'appointment.%'
   group by date_trunc('month', al.created_at at time zone 'Europe/Lisbon')
),
r_25 as (
  select 25 as n,
         'B2/P11 appointment.estado_correction by from and to status: ' || x.f || ' -> ' || x.t as chk,
         count(*)::text as obs
    from (select case when al.metadata->>'fromStatus' in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
                      then al.metadata->>'fromStatus' else 'other' end as f,
                 case when al.metadata->>'toStatus' in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
                      then al.metadata->>'toStatus' else 'other' end as t
            from public.audit_log al
           where al.action = 'appointment.estado_correction' and al.entity_type = 'appointment') x
   group by x.f, x.t
),
r_26 as (
  select 26 as n,
         'B2/P11 appointment.patient_sms_reply by outcome: ' || x.o as chk,
         count(*)::text as obs
    from (select case when al.metadata->>'outcome' in ('confirmed', 'cancelled', 'opt_out', 'review')
                      then al.metadata->>'outcome' else 'other' end as o
            from public.audit_log al
           where al.action = 'appointment.patient_sms_reply') x
   group by x.o
),
r_27 as (
  select 27 as n,
         'B2/P11 staff notifications by Lisbon month: distinct appointments cancelled, rescheduled: '
           || to_char(date_trunc('month', n.occurred_at at time zone 'Europe/Lisbon'), 'YYYY-MM') as chk,
         (count(distinct n.appointment_id) filter (where n.kind = 'cancelled'))::text || ', '
           || (count(distinct n.appointment_id) filter (where n.kind = 'rescheduled'))::text as obs
    from public.staff_notifications n
   where n.kind in ('cancelled', 'rescheduled')
   group by date_trunc('month', n.occurred_at at time zone 'Europe/Lisbon')
),

-- ================================================================ B3
r_30 as (
  select 30 as n,
         'B3 duration by origin: ' || oc || ', ' || dur_bucket as chk,
         count(*)::text as obs
    from ap group by oc, dur_bucket
),
r_31 as (
  select 31 as n,
         'B3/P16 duration in minutes by origin and clinic: ' || oc || ', ' || clinic || ', ' || dur_fine as chk,
         count(*)::text as obs
    from ap group by oc, clinic, dur_fine
),
r_32 as (
  select 32 as n,
         'B3/P17 imported one-minute rows by past or future and status: '
           || case when starts_at < now() then 'past' else 'future' end || ', ' || status as chk,
         count(*)::text as obs
    from ap where oc = 'imported' and mins = 1
   group by case when starts_at < now() then 'past' else 'future' end, status
),
r_33 as (
  select 33 as n,
         'B3/P19 rows (not cancelled, not no_show) that overlap an earlier row of the same practitioner, by year and origin: ' || yr::text || ', ' || oc as chk,
         (count(*) filter (where ovl))::text || ' of ' || count(*)::text as obs
    from ov group by yr, oc
),
r_34 as (
  select 34 as n,
         'B3/P20 native rows not cancelled whose start falls outside every active schedule row of that practitioner, clinic and weekday (TODAY''s rows), by month: ' || mon as chk,
         (count(*) filter (where not exists (
            select 1 from public.availability_templates av
             where av.user_id = ap.practitioner_id and av.location_id = ap.location_id
               and av.is_active
               and av.weekday = extract(dow from (ap.starts_at at time zone 'Europe/Lisbon'))::int
               and (av.valid_from is null or av.valid_from <= (ap.starts_at at time zone 'Europe/Lisbon')::date)
               and (av.valid_until is null or av.valid_until >= (ap.starts_at at time zone 'Europe/Lisbon')::date)
               and av.start_time <= (ap.starts_at at time zone 'Europe/Lisbon')::time
               and av.end_time >= (ap.ends_at at time zone 'Europe/Lisbon')::time)))::text
           || ' of ' || count(*)::text as obs
    from ap
   where oc <> 'imported' and status <> 'cancelled'
   group by mon
),

-- ================================================================ B4
r_40 as (
  select 40 as n,
         'B4 schedule rows in force (active, created by then, valid in the month), by month and clinic: '
           || to_char(g.m, 'YYYY-MM') || ', ' || cc.code as chk,
         'person rows=' || (count(t.code) filter (where not t.shared))::text
           || ' holders=' || (count(distinct t.user_id) filter (where not t.shared))::text
           || ' weekly_hours=' || coalesce(round(sum(t.hours) filter (where not t.shared))::int, 0)::text
           || '; shared rows=' || (count(t.code) filter (where t.shared))::text as obs
    from months_t g
    cross join (select distinct code from clinic where code in ('LV', 'CB', 'MN')) cc
    left join tplx t
      on t.code = cc.code and t.is_active
     and t.created_d <= (g.m + interval '1 month' - interval '1 day')::date
     and (t.valid_from is null or t.valid_from <= (g.m + interval '1 month' - interval '1 day')::date)
     and (t.valid_until is null or t.valid_until >= g.m)
   group by g.m, cc.code
),
r_41 as (
  select 41 as n,
         'B4 blocks overlapping the month, by month and reason: ' || to_char(g.m, 'YYYY-MM') || ', ' || rr.reason as chk,
         'person blocks=' || (count(t.reason) filter (where not t.shared))::text
           || ' people=' || (count(distinct t.user_id) filter (where not t.shared))::text
           || ' hours_in_month=' || coalesce(round(sum(extract(epoch from (
                least(t.ends_at, (g.m + interval '1 month')::timestamp at time zone 'Europe/Lisbon')
                - greatest(t.starts_at, g.m::timestamp at time zone 'Europe/Lisbon'))) / 3600.0)
                filter (where not t.shared))::int, 0)::text
           || '; shared blocks=' || (count(t.reason) filter (where t.shared))::text as obs
    from months_b g
    cross join (select distinct reason from tox) rr
    left join tox t
      on t.reason = rr.reason
     and t.starts_at < (g.m + interval '1 month')::timestamp at time zone 'Europe/Lisbon'
     and t.ends_at > g.m::timestamp at time zone 'Europe/Lisbon'
   group by g.m, rr.reason
),
r_42 as (
  select 42 as n,
         'B4/P22 schedule rows by kind, active, valid_from set, valid_until set: '
           || case when shared then 'shared' else 'person' end || ', ' || is_active::text || ', '
           || (valid_from is not null)::text || ', ' || (valid_until is not null)::text as chk,
         count(*)::text || ' rows, created ' || to_char(min(created_d), 'YYYY-MM-DD') || ' to ' || to_char(max(created_d), 'YYYY-MM-DD') as obs
    from tplx
   group by shared, is_active, valid_from is not null, valid_until is not null
),
r_43 as (
  select 43 as n,
         'B4/P23 schedule audit rows by Lisbon month: ' || to_char(date_trunc('month', al.created_at at time zone 'Europe/Lisbon'), 'YYYY-MM') as chk,
         'template_create=' || (count(*) filter (where al.action = 'availability_template.create'))::text
           || ' template_update=' || (count(*) filter (where al.action = 'availability_template.update'))::text
           || ' template_archive=' || (count(*) filter (where al.action = 'availability_template.archive'))::text
           || ' day_defined_remove=' || (count(*) filter (where al.action = 'availability_template.day_defined_remove'))::text
           || ' alternating_weeks=' || (count(*) filter (where al.action = 'availability_template.alternating_weeks'))::text
           || ' day_by_day=' || (count(*) filter (where al.action = 'availability_template.day_by_day'))::text
           || ' block_create=' || (count(*) filter (where al.action in ('time_off.create', 'time_off.create_batch')))::text
           || ' block_update=' || (count(*) filter (where al.action = 'time_off.update'))::text
           || ' block_delete=' || (count(*) filter (where al.action = 'time_off.delete'))::text
           || ' staff_delete=' || (count(*) filter (where al.action = 'staff.delete'))::text
           || ' location_update=' || (count(*) filter (where al.action = 'location.update'))::text as obs
    from public.audit_log al
   where al.action like 'availability_template.%' or al.action like 'time_off.%'
      or al.action in ('staff.delete', 'location.update')
   group by date_trunc('month', al.created_at at time zone 'Europe/Lisbon')
),
r_44 as (
  select 44 as n,
         'B4/P24 blocks by kind, reason and length: ' || case when shared then 'shared' else 'person' end || ', ' || reason || ', '
           || case when ends_at - starts_at <= interval '1 day' then 'a day or less'
                   when ends_at - starts_at <= interval '7 days' then 'up to a week'
                   else 'over a week' end as chk,
         count(*)::text as obs
    from tox
   group by shared, reason,
            case when ends_at - starts_at <= interval '1 day' then 'a day or less'
                 when ends_at - starts_at <= interval '7 days' then 'up to a week'
                 else 'over a week' end
),
r_45 as (
  select 45 as n,
         'B4/P25 clinic hours: ' || c.code || ': is_active, opens, closes, midday closed from, to, slot minutes' as chk,
         l.is_active::text || ', ' || coalesce(left(l.opens_at::text, 5), 'none') || ', '
           || coalesce(left(l.closes_at::text, 5), 'none') || ', '
           || coalesce(left(l.midday_closed_from::text, 5), 'none') || ', '
           || coalesce(left(l.midday_closed_to::text, 5), 'none') || ', '
           || coalesce(l.slot_granularity_min::text, 'none') as obs
    from public.locations l join clinic c on c.id = l.id
),

-- ================================================================ B5
r_50 as (
  select 50 as n, 'B5 DUPLICATE-LOOKING PATIENTS, candidate ' || x.rule || ': groups, rows in them' as chk,
         x.groups::text || ', ' || x.rows_in::text as obs
    from (
      select 'D1 same normalised name, the group touches two or more clinics' as rule,
             (count(*) filter (where clinics >= 2)) as groups,
             coalesce(sum(rows_in_group) filter (where clinics >= 2), 0) as rows_in
        from dup_name_x
      union all
      select 'D2 same normalised name and date of birth, two or more clinics',
             (count(*) filter (where clinics >= 2)), coalesce(sum(rows_in_group) filter (where clinics >= 2), 0)
        from dup_name_dob
      union all
      select 'D3 same normalised name, any clinic', count(*), coalesce(sum(rows_in_group), 0)
        from dup_name_x
      union all
      select 'D4 same normalised name and date of birth, any clinic', count(*), coalesce(sum(rows_in_group), 0)
        from dup_name_dob
      union all
      select 'D5 same NIF, any clinic', count(*), coalesce(sum(rows_in_group), 0)
        from dup_nif
      union all
      select 'D6 same mobile number, any clinic (families share numbers)', count(*), coalesce(sum(rows_in_group), 0)
        from dup_phone
    ) x
),
r_51 as (
  select 51 as n,
         'B5/P26 patients: live, merged, deleted; live linked to two or more clinics; live with appointments at two or more clinics; imported (ledger)' as chk,
         (count(*) filter (where live))::text || ', ' || (count(*) filter (where merged))::text || ', '
           || (count(*) filter (where deleted))::text || '; '
           || (count(*) filter (where live and linked_clinics >= 2))::text || ', '
           || (count(*) filter (where live and appt_clinics >= 2))::text || '; '
           || (count(*) filter (where imported))::text as obs
    from pat_clinics
),
r_52 as (
  select 52 as n,
         'B5/P26 patients by Lisbon year of created_at and origin: ' || created_yr::text || ', '
           || case when imported then 'imported' else 'native' end as chk,
         count(*)::text as obs
    from pat_clinics group by created_yr, imported
),
r_53 as (
  select 53 as n,
         'B5/P27 patients by year, clinic and origin of their FIRST completed visit: ' || yr::text || ', ' || clinic || ', ' || oc as chk,
         count(*)::text as obs
    from firstv group by yr, clinic, oc
),
r_54 as (
  select 54 as n,
         'B5/P21 placeholder-looking patients (cb-reconciliation pattern): patients; their appointments by year and status' as chk,
         (select count(*) from ph)::text || '; ' || coalesce(string_agg(x.yr::text || ' ' || x.status || ' ' || x.n::text, ', '
            order by x.yr, x.status), 'none') as obs
    from (select ap.yr, ap.status, count(*) as n from ap join ph on ph.id = ap.patient_id
           group by ap.yr, ap.status) x
),

-- ================================================================ B6
r_60 as (
  select 60 as n,
         'B6 PERSON ROWS: users rows in groups of two or more; groups of 2, 3, 4 or more; groups holding a shared resource; groups at two or more clinics; groups with two or more active rows; with two or more bookable rows' as chk,
         coalesce(sum(rows_in_group) filter (where rows_in_group >= 2), 0)::text || '; '
           || (count(*) filter (where rows_in_group = 2))::text || ', '
           || (count(*) filter (where rows_in_group = 3))::text || ', '
           || (count(*) filter (where rows_in_group >= 4))::text || '; '
           || (count(*) filter (where rows_in_group >= 2 and shared_rows > 0))::text || '; '
           || (count(*) filter (where rows_in_group >= 2 and clinics >= 2))::text || '; '
           || (count(*) filter (where rows_in_group >= 2 and active_rows >= 2))::text || ', '
           || (count(*) filter (where rows_in_group >= 2 and bookable_rows >= 2))::text as obs
    from staff_groups
),
r_61 as (
  select 61 as n,
         'B6/P14 bookable people (not shared resources): ' || m.measure as chk,
         m.v as obs
    from (
      select 'a. services mapped (therapist_services): people with 0, 1, 2, 3 or more' as measure,
             (count(*) filter (where mapped = 0))::text || ', ' || (count(*) filter (where mapped = 1))::text || ', '
               || (count(*) filter (where mapped = 2))::text || ', ' || (count(*) filter (where mapped >= 3))::text as v
        from ther
      union all
      select 'b. distinct services in completed visits, all time: people with 0, 1, 2, 3 or more',
             (count(*) filter (where delivered_all = 0))::text || ', ' || (count(*) filter (where delivered_all = 1))::text || ', '
               || (count(*) filter (where delivered_all = 2))::text || ', ' || (count(*) filter (where delivered_all >= 3))::text
        from ther
      union all
      select 'c. distinct services in completed visits, last 365 days: people with 0, 1, 2, 3 or more',
             (count(*) filter (where delivered_12m = 0))::text || ', ' || (count(*) filter (where delivered_12m = 1))::text || ', '
               || (count(*) filter (where delivered_12m = 2))::text || ', ' || (count(*) filter (where delivered_12m >= 3))::text
        from ther
      union all
      select 'd. of them active', (count(*) filter (where is_active))::text
        from ther
    ) m
),
r_62 as (
  select 62 as n,
         'B6/P12 services: total, active, patient bookable, internal only; distinct default lengths' as chk,
         count(*)::text || ', ' || (count(*) filter (where s.is_active))::text || ', '
           || (count(*) filter (where s.patient_bookable))::text || ', '
           || (count(*) filter (where s.internal_only))::text || '; '
           || count(distinct s.duration_min)::text as obs
    from public.services s
),

-- ================================================================ B7 (R12)
r_70 as (
  select 70 as n,
         'R12_FIRES' as chk,
         'consultations_last_90_days=' || (count(*) filter (where c.created_at >= now() - interval '90 days'))::text
           || ' of_them_pending=' || (count(*) filter (where c.created_at >= now() - interval '90 days' and c.fire_status = 'pending'))::text
           || ' of_them_sent=' || (count(*) filter (where c.created_at >= now() - interval '90 days' and c.fire_status = 'fired'))::text
           || ' of_them_needs_attention=' || (count(*) filter (where c.created_at >= now() - interval '90 days' and c.fire_status = 'needs_attention'))::text
           || ' all_time_pending=' || (count(*) filter (where c.fire_status = 'pending'))::text
           || ' all_time_sent=' || (count(*) filter (where c.fire_status = 'fired'))::text
           || ' all_time_needs_attention=' || (count(*) filter (where c.fire_status = 'needs_attention'))::text
           || ' all_time_other=' || (count(*) filter (where c.fire_status not in ('pending', 'fired', 'needs_attention')))::text as obs
    from public.consultations c
),
r_71 as (
  select 71 as n,
         'B7/P28 consultations in the last 90 days by Lisbon month of created_at and state: '
           || to_char(date_trunc('month', c.created_at at time zone 'Europe/Lisbon'), 'YYYY-MM') || ', '
           || case when c.fire_status in ('pending', 'fired', 'needs_attention') then c.fire_status else 'other' end as chk,
         count(*)::text as obs
    from public.consultations c
   where c.created_at >= now() - interval '90 days'
   group by date_trunc('month', c.created_at at time zone 'Europe/Lisbon'),
            case when c.fire_status in ('pending', 'fired', 'needs_attention') then c.fire_status else 'other' end
),
r_72 as (
  select 72 as n,
         'B7/P29 pending with the last attempt over 1 hour ago; needs_attention oldest and newest Lisbon created date' as chk,
         (count(*) filter (where c.fire_status = 'pending' and c.last_attempt_at < now() - interval '1 hour'))::text || '; '
           || coalesce(to_char(min(c.created_at at time zone 'Europe/Lisbon') filter (where c.fire_status = 'needs_attention'), 'YYYY-MM-DD'), 'none') || ', '
           || coalesce(to_char(max(c.created_at at time zone 'Europe/Lisbon') filter (where c.fire_status = 'needs_attention'), 'YYYY-MM-DD'), 'none') as obs
    from public.consultations c
),

-- ================================================================ OUTPUT
out as (
  select n, chk, obs, exp, verdict from v_0
  union all select n, chk, obs, exp, verdict from v_1
  union all select n, chk, obs, exp, verdict from v_2
  union all select n, chk, obs, exp, verdict from v_3
  union all select n, chk, obs, exp, verdict from v_4
  union all select n, chk, obs, exp, verdict from v_5
  union all select n, chk, obs, 'information', 'INFO' from r_10
  union all select n, chk, obs, 'information', 'INFO' from r_11
  union all select n, chk, obs, 'information', 'INFO' from r_12
  union all select n, chk, obs, 'information', 'INFO' from r_13
  union all select n, chk, obs, 'information', 'INFO' from r_14
  union all select n, chk, obs, 'information', 'INFO' from r_15
  union all select n, chk, obs, 'information', 'INFO' from r_16
  union all select n, chk, obs, 'information', 'INFO' from r_17
  union all select n, chk, obs, 'information', 'INFO' from r_18
  union all select n, chk, obs, 'information', 'INFO' from r_19
  union all select n, chk, obs, 'information', 'INFO' from r_20
  union all select n, chk, obs, 'information', 'INFO' from r_21
  union all select n, chk, obs, 'information', 'INFO' from r_22
  union all select n, chk, obs, 'information', 'INFO' from r_23
  union all select n, chk, obs, 'information', 'INFO' from r_24
  union all select n, chk, obs, 'information', 'INFO' from r_25
  union all select n, chk, obs, 'information', 'INFO' from r_26
  union all select n, chk, obs, 'information', 'INFO' from r_27
  union all select n, chk, obs, 'information', 'INFO' from r_30
  union all select n, chk, obs, 'information', 'INFO' from r_31
  union all select n, chk, obs, 'information', 'INFO' from r_32
  union all select n, chk, obs, 'information', 'INFO' from r_33
  union all select n, chk, obs, 'information', 'INFO' from r_34
  union all select n, chk, obs, 'information', 'INFO' from r_40
  union all select n, chk, obs, 'information', 'INFO' from r_41
  union all select n, chk, obs, 'information', 'INFO' from r_42
  union all select n, chk, obs, 'information', 'INFO' from r_43
  union all select n, chk, obs, 'information', 'INFO' from r_44
  union all select n, chk, obs, 'information', 'INFO' from r_45
  union all select n, chk, obs, 'B5 needs a ruling: which rule is the 2,288 rule', 'INFO' from r_50
  union all select n, chk, obs, 'information', 'INFO' from r_51
  union all select n, chk, obs, 'information', 'INFO' from r_52
  union all select n, chk, obs, 'information', 'INFO' from r_53
  union all select n, chk, obs, 'information', 'INFO' from r_54
  union all select n, chk, obs, 'information', 'INFO' from r_60
  union all select n, chk, obs, 'information', 'INFO' from r_61
  union all select n, chk, obs, 'information', 'INFO' from r_62
  union all select n, chk, obs, 'pending, sent (fired), needs_attention', 'INFO' from r_70
  union all select n, chk, obs, 'information', 'INFO' from r_71
  union all select n, chk, obs, 'information', 'INFO' from r_72
),
v_6 as (
  select 6 as n,
         '6. no printed row carries a uuid fragment, an at sign or nine digits in a row (rows checked)' as chk,
         (count(*) filter (where coalesce(o.chk, '') || ' ' || coalesce(o.obs, '') ~* '-[0-9a-f]{4}-[0-9a-f]{4}-|@|[0-9]{9}'))::text
           || ' of ' || count(*)::text as obs,
         '0 of N' as exp,
         case when (count(*) filter (where coalesce(o.chk, '') || ' ' || coalesce(o.obs, '') ~* '-[0-9a-f]{4}-[0-9a-f]{4}-|@|[0-9]{9}')) = 0
               and count(*) > 0
              then 'OK' else 'FAIL' end as verdict
    from out o
)
select n, "check", observed, expected, verdict from (
  select n, chk as "check", coalesce(obs, 'none') as observed, exp as expected, verdict from out
  union all
  select n, chk, obs, exp, verdict from v_6
) r
order by n, "check";
