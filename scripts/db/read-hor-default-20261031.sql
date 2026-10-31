-- HOR-DEFAULT-READ, 2026-10-31: WHO WOULD THE NEW HORARIOS DEFAULT (HOR-01, PULL REQUEST #1683)
-- AFFECT. Counts and clinic names only. It decides nothing and changes nothing.
--
-- READ ONLY. It writes nothing; run it inside `begin read only` ... `rollback`, so the server
-- refuses any write. Verdict 0 reads the transaction's own setting.
--
-- WHAT IT PRINTS: ONE result set, ordered by `n`, columns n | check | observed | expected |
-- verdict. Verdicts are OK, REVIEW (verdict 5 only), VACUOUS or FAIL; rows that only inform read
-- INFO and are never counted. It prints counts, times of day, the read's Lisbon clock, a tenant
-- ORDINAL ("tenant 1", by creation order, never its id or name) and clinic names. No person's
-- id, name, email or phone, no tenant id.
--
-- THE RESOLVER IT COPIES (pull request #1683, head ef66b8d133d6934bc9685babd3ca03d28f587b55; a
-- change to those lines changes this read's meaning):
--   eligible   active, bookable, not a shared resource (NESA):
--              apps/web/lib/scheduling/effective-availability-core.ts:59-62 isClinicDefaultEligible,
--              read by effective-availability.ts:113-132 readDefaultEligibility. No role is read:
--              the resolver reads none (is_bookable decides who is a therapist, PL-06b).
--   own row    an ACTIVE availability_templates row of the therapist, at ANY clinic:
--              effective-availability.ts:53-70.
--   in force   an own row with valid_until null or on or after today's Lisbon date
--              (effective-availability-core.ts:104-106 isCurrentOwnRow; today is
--              effective-availability.ts:107-110 lisbonToday). A row that starts later counts.
--   the rule   per therapist (effective-availability-core.ts:127-146 and
--              effective-availability.ts:85-104): ANY own row in force anywhere means their typed
--              schedule is their whole schedule and no clinic hours anywhere; ZERO such rows and
--              eligible means the clinic's hours at every ACTIVE clinic they are a member of.
--   member     a staff_locations row at an ACTIVE location (effective-availability.ts:140-161
--              readMemberClinics; clinic-default-schedule.ts:55-59). Each table is read at its
--              own tenant, as the application's tenant-scoped reads see it.
--   the switch "Usar horario da clinica" (effective-availability-core.ts:171-184
--              clinicDefaultSwitchVerdict, fed by clinic-default-schedule.ts:37-89): for an
--              eligible therapist with rows in force, it refuses (`not_member`) when any clinic
--              holding such a row (archived clinics included, clinic-default-schedule.ts:60-74)
--              is not an active clinic they are a member of.
--   hours      locations.opens_at and closes_at, Monday to Friday
--              (effective-availability-core.ts:73-95; it generates nothing unless closes_at is
--              after opens_at). The midday closure (midday_closed_from, midday_closed_to) stays
--              its own rule and is printed for reference.
--   Saturday   locations.saturday_closes_at does not exist yet (#1682, held). It is PROBED, never
--              named as a column: information_schema and pg_attribute for whether it exists, and
--              to_jsonb(l) ->> 'saturday_closes_at' for its value, which reads NULL when the
--              column is absent instead of raising 42703.
--   the portal apps/api/lib/appointments/store.ts:867-886 listBookableTherapists (main at
--              a63b9175), unioned over the catalogue's services (store.ts:418-425 and :433-435,
--              the mapping at :299-309): active, bookable, not a shared resource, an active
--              template at the clinic whose dates overlap today to today + 14 (booking.ts:419
--              OPEN_SLOTS_HORIZON_DAYS), and mapped to an active, patient-bookable, not
--              internal-only service offered at that clinic. The online-booking hold
--              (ONLINE_BOOKING_HELD_LOCATION_IDS, an environment variable) is not in the database
--              and is not read.
--
-- ONE CLOCK. The read's clock is `clock.t1` below, read once from now(). A rehearsal on a
-- throwaway replaces that one line with a fixed instant; nothing else in the file reads the time.
--
-- A ZERO IS NEVER A PASS. A verdict whose subject is empty reads VACUOUS, and one whose fault is
-- seen directly reads FAIL first. The counts themselves are measurements, never verdicts: a zero
-- count is an answer.
--
-- VERDICTS (the block succeeds on 0 FAIL and 0 VACUOUS; only 10 OK is a PASS; a REVIEW on
-- verdict 5 is reported as REVIEW):
--    0  the transaction is READ ONLY
--    1  at least one tenant
--    2  at least one active clinic
--    3  every active clinic closes after it opens
--    4  every active clinic's midday closure is both or neither, ordered, inside its hours
--    5  the Saturday column: absent (OK), present (REVIEW), probes disagree (FAIL)
--    6  at least one eligible therapist
--    7  the therapist groups add up, and an independent recount of who gets the default agrees
--    8  the per-clinic membership counts add up to the per-therapist ones
--    9  every therapist the portal shows has an own row in force (the portal does not change)
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -f scripts/db/read-hor-default-20261031.sql -c "rollback"
with
clock as (
  select now() as t1
),
day as (
  select (clock.t1 at time zone 'Europe/Lisbon')::date as today, clock.t1
    from clock
),
tenant as (
  select t.id as tenant_id, dense_rank() over (order by t.created_at, t.id) as tn
    from public.tenants t
),
clinic as (
  select l.id as location_id, l.tenant_id,
         'tenant ' || tn.tn::text || ' / ' || l.name || case when l.is_active then '' else ' (archived)' end as label,
         l.is_active, l.opens_at, l.closes_at, l.midday_closed_from, l.midday_closed_to,
         to_jsonb(l) ->> 'saturday_closes_at' as saturday_closes_at
    from public.locations l
    join tenant tn on tn.tenant_id = l.tenant_id
),
sat as (
  select to_regclass('public.locations') is not null as table_present,
         exists (select 1 from information_schema.columns ic
                  where ic.table_schema = 'public' and ic.table_name = 'locations'
                    and ic.column_name = 'saturday_closes_at') as by_info,
         exists (select 1 from pg_catalog.pg_attribute pa
                  where pa.attrelid = to_regclass('public.locations')
                    and pa.attname = 'saturday_closes_at' and pa.attnum > 0
                    and not pa.attisdropped) as by_catalog
),
person as (
  select u.id as user_id, u.tenant_id, u.is_active, u.is_bookable, u.is_shared_resource,
         (u.is_active = true and u.is_bookable = true and u.is_shared_resource is distinct from true) as eligible
    from public.users u
),
own as (
  select a.tenant_id, a.user_id, a.location_id,
         (a.valid_until is null or a.valid_until >= day.today) as in_force
    from public.availability_templates a
   cross join day
   where a.is_active = true
),
member as (
  select distinct s.tenant_id, s.user_id, s.location_id
    from public.staff_locations s
    join public.locations ml on ml.id = s.location_id and ml.tenant_id = s.tenant_id
   where ml.is_active = true
),
fact as (
  select p.tenant_id, p.user_id, p.eligible, p.is_active, p.is_bookable, p.is_shared_resource,
         exists (select 1 from own o1
                  where o1.tenant_id = p.tenant_id and o1.user_id = p.user_id) as has_active_rows,
         exists (select 1 from own o2
                  where o2.tenant_id = p.tenant_id and o2.user_id = p.user_id and o2.in_force) as in_force,
         (select count(*) from member m1
           where m1.tenant_id = p.tenant_id and m1.user_id = p.user_id) as clinics,
         exists (select 1 from own o3
                   join public.locations rl on rl.id = o3.location_id and rl.tenant_id = o3.tenant_id
                  where o3.tenant_id = p.tenant_id and o3.user_id = p.user_id and o3.in_force
                    and not exists (select 1 from member m2
                                     where m2.tenant_id = o3.tenant_id and m2.user_id = o3.user_id
                                       and m2.location_id = o3.location_id)) as outside_membership
    from person p
),
tcount as (
  select tn.tn, tn.tenant_id,
         count(f.user_id) as users,
         count(*) filter (where f.eligible) as eligible,
         count(*) filter (where f.eligible and f.in_force) as own_rows,
         count(*) filter (where f.eligible and f.in_force and not f.outside_membership) as own_ok,
         count(*) filter (where f.eligible and f.in_force and f.outside_membership) as own_refused,
         count(*) filter (where f.eligible and not f.in_force) as zero,
         count(*) filter (where f.eligible and not f.in_force and f.clinics = 0) as m0,
         count(*) filter (where f.eligible and not f.in_force and f.clinics = 1) as m1,
         count(*) filter (where f.eligible and not f.in_force and f.clinics >= 2) as m2,
         count(*) filter (where f.eligible and not f.in_force and f.clinics > 0) as dflt,
         count(*) filter (where f.eligible and f.has_active_rows and not f.in_force) as expired_only,
         count(*) filter (where f.eligible and f.has_active_rows and not f.in_force and f.clinics > 0) as expired_default,
         count(*) filter (where f.eligible and not f.has_active_rows) as no_active_row,
         count(*) filter (where f.is_active and f.is_bookable and f.is_shared_resource) as nesa,
         count(*) filter (where f.is_active and not f.is_bookable) as not_bookable,
         count(*) filter (where not f.is_active) as inactive,
         coalesce(sum(f.clinics) filter (where f.eligible), 0) as eligible_memberships,
         coalesce(sum(f.clinics) filter (where f.eligible and not f.in_force), 0) as default_memberships
    from tenant tn
    left join fact f on f.tenant_id = tn.tenant_id
   group by tn.tn, tn.tenant_id
),
recount as (
  -- Verdict 7's second count of who gets the default, written from the tables again and
  -- sharing no CTE above but the clock, so a slip in either count shows as a disagreement.
  select count(*) as dflt
    from public.users ru
   cross join day
   where ru.is_active and ru.is_bookable and not ru.is_shared_resource
     and not exists (select 1 from public.availability_templates ra
                      where ra.tenant_id = ru.tenant_id and ra.user_id = ru.id and ra.is_active
                        and (ra.valid_until is null or ra.valid_until >= day.today))
     and exists (select 1 from public.staff_locations rs
                   join public.locations rsl on rsl.id = rs.location_id and rsl.tenant_id = rs.tenant_id
                  where rs.tenant_id = ru.tenant_id and rs.user_id = ru.id and rsl.is_active)
),
portal as (
  select distinct c.tenant_id, c.location_id, u.id as user_id
    from clinic c
    join public.users u on u.tenant_id = c.tenant_id
   cross join day
   where c.is_active = true
     and u.is_active = true
     and u.is_bookable = true
     and u.is_shared_resource = false
     and exists (
       select 1 from public.availability_templates av
        where av.tenant_id = c.tenant_id
          and av.user_id = u.id
          and av.location_id = c.location_id
          and av.is_active = true
          and (av.valid_from  is null or av.valid_from  <= day.today + 14)
          and (av.valid_until is null or av.valid_until >= day.today)
     )
     and exists (
       select 1 from public.therapist_services ts
         join public.services sv on sv.id = ts.service_id and sv.tenant_id = ts.tenant_id
        where ts.tenant_id = c.tenant_id
          and ts.therapist_user_id = u.id
          and sv.is_active = true
          and sv.internal_only = false
          and sv.patient_bookable = true
          and (sv.location_id is null or sv.location_id = c.location_id)
     )
),
ccount as (
  select c.location_id, c.tenant_id, c.label, c.is_active, c.opens_at, c.closes_at,
         c.midday_closed_from, c.midday_closed_to, c.saturday_closes_at,
         (select count(*) from member cm join fact cf on cf.tenant_id = cm.tenant_id and cf.user_id = cm.user_id
           where cm.location_id = c.location_id and cf.eligible) as members,
         (select count(*) from member cm join fact cf on cf.tenant_id = cm.tenant_id and cf.user_id = cm.user_id
           where cm.location_id = c.location_id and cf.eligible and not cf.in_force) as default_here,
         (select count(*) from member cm join fact cf on cf.tenant_id = cm.tenant_id and cf.user_id = cm.user_id
           where cm.location_id = c.location_id and cf.eligible and not cf.in_force and cf.has_active_rows) as expired_here,
         (select count(distinct co.user_id) from own co join fact cf on cf.tenant_id = co.tenant_id and cf.user_id = co.user_id
           where co.location_id = c.location_id and co.in_force and cf.eligible) as own_here,
         (select count(distinct co.user_id) from own co join fact cf on cf.tenant_id = co.tenant_id and cf.user_id = co.user_id
           where co.location_id = c.location_id and co.in_force and cf.eligible
             and not exists (select 1 from member cm where cm.tenant_id = co.tenant_id and cm.user_id = co.user_id
                                and cm.location_id = co.location_id)) as refused_here,
         (select count(*) from member cm join fact cf on cf.tenant_id = cm.tenant_id and cf.user_id = cm.user_id
           where cm.location_id = c.location_id and cf.eligible and cf.in_force
             and not exists (select 1 from own co where co.tenant_id = cm.tenant_id and co.user_id = cm.user_id
                                and co.location_id = cm.location_id and co.in_force)) as elsewhere_here,
         (select count(distinct pv.user_id) from portal pv where pv.location_id = c.location_id) as portal_here
    from clinic c
),
total as (
  select coalesce(sum(eligible), 0) as eligible, coalesce(sum(own_rows), 0) as own_rows,
         coalesce(sum(own_ok), 0) as own_ok, coalesce(sum(own_refused), 0) as own_refused,
         coalesce(sum(zero), 0) as zero, coalesce(sum(m0), 0) as m0, coalesce(sum(m1), 0) as m1,
         coalesce(sum(m2), 0) as m2, coalesce(sum(dflt), 0) as dflt,
         coalesce(sum(expired_only), 0) as expired_only, coalesce(sum(expired_default), 0) as expired_default,
         coalesce(sum(no_active_row), 0) as no_active_row,
         coalesce(sum(eligible_memberships), 0) as eligible_memberships,
         coalesce(sum(default_memberships), 0) as default_memberships
    from tcount
),
ctotal as (
  select coalesce(sum(members), 0) as members, coalesce(sum(default_here), 0) as default_here
    from ccount
),
ptotal as (
  select count(distinct (pv.tenant_id, pv.user_id)) as visible,
         count(distinct (pv.tenant_id, pv.user_id)) filter (where not pf.in_force) as without_rows
    from portal pv
    join fact pf on pf.tenant_id = pv.tenant_id and pf.user_id = pv.user_id
)
select n, "check", observed, expected, verdict from (
  select 0 as n,
         'the transaction is READ ONLY' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1,
         'tenants',
         count(*)::text, 'at least 1',
         case when count(*) = 0 then 'VACUOUS' else 'OK' end
    from tenant
  union all
  select 2,
         'active clinics, every tenant',
         (count(*) filter (where is_active))::text, 'at least 1',
         case when count(*) filter (where is_active) = 0 then 'VACUOUS' else 'OK' end
    from clinic
  union all
  select 3,
         'active clinics whose closes_at is not after opens_at (the default generates nothing there)',
         (count(*) filter (where is_active and not (opens_at < closes_at)))::text || ' of '
           || (count(*) filter (where is_active))::text,
         '0 of at least 1',
         case when count(*) filter (where is_active) = 0 then 'VACUOUS'
              when count(*) filter (where is_active and not (opens_at < closes_at)) > 0 then 'FAIL'
              else 'OK' end
    from clinic
  union all
  select 4,
         'active clinics whose midday closure is half set, not ordered, or outside its hours',
         (count(*) filter (where is_active and not (
             (midday_closed_from is null and midday_closed_to is null)
             or (midday_closed_from is not null and midday_closed_to is not null
                 and midday_closed_from < midday_closed_to
                 and midday_closed_from >= opens_at and midday_closed_to <= closes_at))))::text || ' of '
           || (count(*) filter (where is_active))::text || ' (with a closure: '
           || (count(*) filter (where is_active and midday_closed_from is not null))::text || ')',
         '0 of at least 1',
         case when count(*) filter (where is_active) = 0 then 'VACUOUS'
              when count(*) filter (where is_active and not (
                (midday_closed_from is null and midday_closed_to is null)
                or (midday_closed_from is not null and midday_closed_to is not null
                    and midday_closed_from < midday_closed_to
                    and midday_closed_from >= opens_at and midday_closed_to <= closes_at))) > 0 then 'FAIL'
              else 'OK' end
    from clinic
  union all
  select 5,
         'the column locations.saturday_closes_at (information_schema, pg_attribute)',
         case when not table_present then 'no locations table'
              when by_info and by_catalog then 'present'
              when not by_info and not by_catalog then 'absent'
              else 'probes disagree' end,
         'absent (#1682 held: no Saturday hours)',
         case when not table_present then 'FAIL'
              when by_info and by_catalog then 'REVIEW'
              when not by_info and not by_catalog then 'OK'
              else 'FAIL' end
    from sat
  union all
  select 6,
         'therapists who are active, bookable and not NESA, every tenant',
         eligible::text, 'at least 1',
         case when eligible = 0 then 'VACUOUS' else 'OK' end
    from total
  union all
  select 7,
         'the groups add up: eligible = own (switch runs) + own (switch refuses) + zero in force; zero = 0 + 1 + 2 or more clinics; default = 1 + 2 or more; expired-only within zero; the recount of the default agrees',
         eligible::text || ' = ' || own_ok::text || ' + ' || own_refused::text || ' + ' || zero::text
           || '; ' || zero::text || ' = ' || m0::text || ' + ' || m1::text || ' + ' || m2::text
           || '; default ' || dflt::text || ', expired-only ' || expired_only::text
           || ', recount ' || (select r.dflt from recount r)::text,
         'every equation holds, eligible at least 1',
         case when eligible = 0 then 'VACUOUS'
              when eligible <> own_ok + own_refused + zero or own_rows <> own_ok + own_refused
                or zero <> m0 + m1 + m2 or dflt <> m1 + m2 or expired_only > zero
                or expired_default > expired_only or (select r.dflt from recount r) <> dflt then 'FAIL'
              else 'OK' end
    from total
  union all
  select 8,
         'the clinic counts add up: memberships of eligible therapists, and of those who get the default, per clinic and per therapist',
         'per clinic ' || ct.members::text || ' and ' || ct.default_here::text
           || ', per therapist ' || t.eligible_memberships::text || ' and ' || t.default_memberships::text,
         'equal, at least 1 membership',
         case when t.eligible_memberships = 0 and ct.members = 0 then 'VACUOUS'
              when ct.members <> t.eligible_memberships or ct.default_here <> t.default_memberships then 'FAIL'
              else 'OK' end
    from total t cross join ctotal ct
  union all
  select 9,
         'therapists the portal shows today with no own row in force (the default must never reach the portal)',
         without_rows::text || ' of ' || visible::text,
         '0 of at least 1',
         case when visible = 0 then 'VACUOUS' when without_rows > 0 then 'FAIL' else 'OK' end
    from ptotal
  union all
  select 20,
         'the read''s clock (Lisbon), and the day "in force" is measured from',
         to_char(d.t1 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') || ', today ' || d.today::text,
         'information', 'INFO'
    from day d
  union all
  select 21, 'tenant ' || tn::text || ': eligible (active, bookable, not NESA)', eligible::text, 'information', 'INFO' from tcount
  union all
  select 22, 'tenant ' || tn::text || ': eligible with own rows in force (keep their own schedule, no clinic hours anywhere)', own_rows::text, 'information', 'INFO' from tcount
  union all
  select 23, 'tenant ' || tn::text || ': of 22, "Usar horario da clinica" would run', own_ok::text, 'information', 'INFO' from tcount
  union all
  select 24, 'tenant ' || tn::text || ': of 22, "Usar horario da clinica" would refuse (rows in force at a clinic they are not an active member of)', own_refused::text, 'information', 'INFO' from tcount
  union all
  select 25, 'tenant ' || tn::text || ': eligible with zero own rows in force (the default is for them)', zero::text, 'information', 'INFO' from tcount
  union all
  select 26, 'tenant ' || tn::text || ': of 25, members of 0 active clinics (no hours anywhere, as today)', m0::text, 'information', 'INFO' from tcount
  union all
  select 27, 'tenant ' || tn::text || ': of 25, members of exactly 1 active clinic', m1::text, 'information', 'INFO' from tcount
  union all
  select 28, 'tenant ' || tn::text || ': of 25, members of 2 or more active clinics', m2::text, 'information', 'INFO' from tcount
  union all
  select 29, 'tenant ' || tn::text || ': eligible whose only active rows are expired', expired_only::text, 'information', 'INFO' from tcount
  union all
  select 30, 'tenant ' || tn::text || ': of 29, members of 1 or more active clinics (newly get the clinic hours)', expired_default::text, 'information', 'INFO' from tcount
  union all
  select 31, 'tenant ' || tn::text || ': eligible with no active row at all', no_active_row::text, 'information', 'INFO' from tcount
  union all
  select 32, 'tenant ' || tn::text || ': not eligible, for context: NESA (active, bookable, shared), active not bookable, inactive',
         nesa::text || ', ' || not_bookable::text || ', ' || inactive::text, 'information', 'INFO' from tcount
  union all
  select 40, label || ': hours',
         case when is_active then 'active' else 'archived' end
           || ', opens ' || to_char(opens_at, 'HH24:MI') || ', closes ' || to_char(closes_at, 'HH24:MI')
           || ', midday ' || coalesce(to_char(midday_closed_from, 'HH24:MI') || ' to ' || to_char(midday_closed_to, 'HH24:MI'), 'none')
           || ', Saturday ' || case when (select by_info and by_catalog from sat)
                                    then coalesce('closes ' || saturday_closes_at, 'column present, no time')
                                    else 'no column' end,
         'information', 'INFO'
    from ccount
  union all
  select 41, label || ': eligible therapists who are active members', members::text, 'information', 'INFO' from ccount
  union all
  select 42, label || ': of 41, zero own rows in force (get the clinic hours here)', default_here::text, 'information', 'INFO' from ccount
  union all
  select 43, label || ': of 42, only expired rows', expired_here::text, 'information', 'INFO' from ccount
  union all
  select 44, label || ': eligible therapists with own rows in force here', own_here::text, 'information', 'INFO' from ccount
  union all
  select 45, label || ': of 44, not an active member here (the switch refuses, naming this clinic)', refused_here::text, 'information', 'INFO' from ccount
  union all
  select 46, label || ': active members with rows in force only at other clinics (no hours here)', elsewhere_here::text, 'information', 'INFO' from ccount
  union all
  select 47, label || ': therapists the portal shows here today', portal_here::text, 'information', 'INFO' from ccount
  union all
  select 50, 'HOR_SUMMARY',
         'eligible=' || t.eligible::text || ' own=' || t.own_rows::text || ' switch_runs=' || t.own_ok::text
           || ' switch_refuses=' || t.own_refused::text || ' zero_in_force=' || t.zero::text
           || ' clinics_0=' || t.m0::text || ' clinics_1=' || t.m1::text || ' clinics_2plus=' || t.m2::text
           || ' get_default=' || t.dflt::text || ' expired_only=' || t.expired_only::text
           || ' expired_only_get_default=' || t.expired_default::text
           || ' no_active_row=' || t.no_active_row::text || ' portal_visible=' || p.visible::text,
         'counts only, every tenant; per tenant rows 21 to 32, per clinic rows 40 to 47',
         'INFO'
    from total t cross join ptotal p
) out
order by n, "check";
