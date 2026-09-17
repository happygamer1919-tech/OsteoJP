-- ============================================================================
-- NESA SPLIT, STAGE 1 of 2: PRE-CHECKS + THE MOVE. ONE TRANSACTION.
--
-- Card NESA-SPLIT-lv-bookings-to-the-lv-row. Owner ruling 2026-09-16 (a):
-- every FUTURE appointment at Linda-a-Velha held by the CB-labelled NESA row
-- 0c1a0000-0000-4000-8000-000000000002 moves to the LV NESA row
-- bdc466d7-f81f-4f8c-aa2e-b85194d73e1a. ANY status, cancelled included, so an
-- un-cancel is never locked. PAST appointments never move.
--
-- WHY THE MOVE COMES BEFORE THE FLAG (stage 2). Once a row carries
-- is_shared_resource, sharedResourceLocationAllowed
-- (apps/web/lib/scheduling/shared-resource-guard.ts:39) refuses every booking
-- of that row at a clinic where it is not installed - for the OWNER too.
-- Measured on a local rehearsal by GREEN, NESA-R9 N7 (Q-NESA-FLAG-4): with the
-- flag on, reschedule, Marcar novamente and un-cancel all return
-- shared_resource_location. Flagging first would freeze the LV bookings this
-- stage moves; moving first leaves every one of them on a row installed at LV,
-- where the same guard admits them.
--
-- WRITES: public.appointments.practitioner_id on exactly N rows, and one
-- public.audit_log row carrying every moved id. Nothing else. No clinical row
-- is read or written; no availability row is switched off; authorship is not
-- touched (clinical_records.practitioner_id is a different column on a
-- different table and no moved appointment has one - pre-check P4).
--
-- The audit pattern is B4's (scripts/staff-rows-2026-09-13/B4-2-remove-login.sql,
-- action staff.remove_login): counts and ids only, no patient data, actor null
-- because the block is run from a SQL session and not by a signed-in user, and
-- a re-run refuses on its own audit row.
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "NESA SPLIT STAGE 1 DONE" notice.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-1-move.sql
-- ============================================================================

do $nesa$
declare
  c_cb_row   constant uuid := '0c1a0000-0000-4000-8000-000000000002'; -- NESA, the CB-labelled row
  c_lv_row   constant uuid := 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'; -- NESA, the LV row
  c_lv_loc   constant uuid := 'de000002-0000-0000-0000-000000000001'; -- OsteoJP (LV)
  c_cb_loc   constant uuid := 'de000002-0000-0000-0000-000000000002'; -- OsteoJP (CB)
  c_action   constant text := 'staff.nesa_split.reassign';

  v_cb          record;
  v_lv          record;
  v_tenant      uuid;
  v_txt         text;
  v_n           int;
  v_ids         uuid[];
  v_breakdown   jsonb;
  v_second      int;
  v_records     int;
  v_episodes    int;
  v_attachments int;
  v_confirmed   int;
  v_pairs       int;
  v_p6          int;
  v_p7          int;
  v_cb_before   int;
  v_lv_before   int;
  v_updated     int;
  v_row         record;
begin
  -- ==========================================================================
  -- P1. BOTH ROWS EXIST, AND NEITHER IS FLAGGED YET.
  -- ==========================================================================
  select id, tenant_id, full_name, is_active, is_bookable, is_shared_resource
    into v_cb from public.users where id = c_cb_row;
  if not found then raise exception 'STOP: the CB-labelled NESA row % does not exist', c_cb_row; end if;

  select id, tenant_id, full_name, is_active, is_bookable, is_shared_resource
    into v_lv from public.users where id = c_lv_row;
  if not found then raise exception 'STOP: the LV NESA row % does not exist', c_lv_row; end if;

  if v_cb.full_name is distinct from 'NESA' then
    raise exception 'STOP: row % is not named NESA (found %)', c_cb_row, v_cb.full_name;
  end if;
  if v_lv.full_name is distinct from 'NESA' then
    raise exception 'STOP: row % is not named NESA (found %)', c_lv_row, v_lv.full_name;
  end if;
  if v_cb.tenant_id is distinct from v_lv.tenant_id then
    raise exception 'STOP: the two NESA rows are in different tenants (% and %)', v_cb.tenant_id, v_lv.tenant_id;
  end if;
  v_tenant := v_cb.tenant_id;

  -- The flag is stage 2's job. If either row already carries it, the LV
  -- bookings this stage moves are already frozen by the app guard, and the
  -- order this data op depends on has been broken. Refuse.
  if v_cb.is_shared_resource or v_lv.is_shared_resource then
    raise exception 'STOP: is_shared_resource is already true (CB row %, LV row %); stage 1 must run BEFORE the flag',
      v_cb.is_shared_resource, v_lv.is_shared_resource;
  end if;

  raise notice 'P1 CB row %: name=% active=% bookable=% shared=%',
    c_cb_row, v_cb.full_name, v_cb.is_active, v_cb.is_bookable, v_cb.is_shared_resource;
  raise notice 'P1 LV row %: name=% active=% bookable=% shared=%',
    c_lv_row, v_lv.full_name, v_lv.is_active, v_lv.is_bookable, v_lv.is_shared_resource;
  raise notice 'P1 tenant %', v_tenant;

  -- This block has run before if its audit row is there.
  if exists (select 1 from public.audit_log
              where action = c_action and entity_id = c_cb_row) then
    raise exception 'STOP: this block has already run for % (audit row % present)', c_cb_row, c_action;
  end if;

  -- ==========================================================================
  -- P2. WHERE EACH ROW IS INSTALLED. The CB row at CB and nowhere else; the LV
  -- row at LV. The second half is what makes the moved rows editable after
  -- stage 2: a shared resource's booking is admitted only at a clinic it is
  -- installed at.
  -- ==========================================================================
  select string_agg(l.name || ' (' || l.id::text || ')', ', ' order by l.name)
    into v_txt
    from public.staff_locations sl join public.locations l on l.id = sl.location_id
   where sl.user_id = c_cb_row;
  raise notice 'P2 CB row staff_locations: %', coalesce(v_txt, '(none)');

  select string_agg(l.name || ' (' || l.id::text || ')', ', ' order by l.name)
    into v_txt
    from public.staff_locations sl join public.locations l on l.id = sl.location_id
   where sl.user_id = c_lv_row;
  raise notice 'P2 LV row staff_locations: %', coalesce(v_txt, '(none)');

  if (select count(*) from public.staff_locations where user_id = c_cb_row) <> 1
     or not exists (select 1 from public.staff_locations where user_id = c_cb_row and location_id = c_cb_loc) then
    raise exception 'STOP: the CB row must be installed at Castelo Branco and nowhere else';
  end if;
  if not exists (select 1 from public.staff_locations where user_id = c_lv_row and location_id = c_lv_loc) then
    raise exception 'STOP: the LV row is not installed at Linda-a-Velha; the moved bookings would be unreachable after the flag';
  end if;

  -- ==========================================================================
  -- P3. N, THE MOVE SET. Future = starts_at > now(), and now() is the
  -- transaction's start time, so the set counted here is the set updated below.
  -- EVERY status, cancelled included (ruling (a)).
  -- ==========================================================================
  select coalesce(array_agg(id order by starts_at), '{}'::uuid[])
    into v_ids
    from public.appointments
   where practitioner_id = c_cb_row and location_id = c_lv_loc and starts_at > now();
  v_n := coalesce(array_length(v_ids, 1), 0);

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_breakdown
    from (select status::text as status, count(*)::int as n
            from public.appointments where id = any(v_ids) group by status) s;

  raise notice 'P3 N = % future LV appointments on the CB row; by status %', v_n, v_breakdown;
  for v_row in
    select min(starts_at)::text as first_start, max(starts_at)::text as last_start
      from public.appointments where id = any(v_ids)
  loop
    raise notice 'P3 window % .. %', coalesce(v_row.first_start, '(none)'), coalesce(v_row.last_start, '(none)');
  end loop;

  if v_n = 0 then
    raise exception 'STOP: there is nothing to move (0 future LV appointments on the CB row)';
  end if;

  -- The ruling says "held by" the CB row. A booking that holds NESA in the
  -- SECOND slot holds its hour too (SCHED-29.2), and this block does not move
  -- those. Production had 0 of them at authoring time; if that ever changes the
  -- move is incomplete and must be re-authored rather than run half.
  select count(*)::int into v_second
    from public.appointments
   where practitioner_2_id = c_cb_row and location_id = c_lv_loc and starts_at > now();
  raise notice 'P3 future LV appointments holding the CB row as Terapeuta 2: %', v_second;
  if v_second <> 0 then
    raise exception 'STOP: % future LV appointments hold the CB row as Terapeuta 2; this block moves Terapeuta only', v_second;
  end if;

  -- ==========================================================================
  -- P4. NO CLINICAL ROW HANGS OFF THE MOVE SET. Episodes are patient-rooted and
  -- carry no appointment column, so they are reached the only way they can be:
  -- through a clinical_record that names one of these appointments. Attachments
  -- likewise, through clinical_record_id.
  -- ==========================================================================
  select count(*)::int into v_records
    from public.clinical_records where appointment_id = any(v_ids);
  select count(distinct episode_id)::int into v_episodes
    from public.clinical_records where appointment_id = any(v_ids) and episode_id is not null;
  select count(*)::int into v_attachments
    from public.attachments
   where clinical_record_id in (select id from public.clinical_records where appointment_id = any(v_ids));
  raise notice 'P4 clinical_records % / clinical_episodes % / attachments %', v_records, v_episodes, v_attachments;
  if v_records + v_episodes + v_attachments <> 0 then
    raise exception 'STOP: % clinical rows are attached to the move set (records %, episodes %, attachments %)',
      v_records + v_episodes + v_attachments, v_records, v_episodes, v_attachments;
  end if;

  -- ==========================================================================
  -- P5. AFTER THE MOVE, NO TWO CONFIRMED BOOKINGS ON THE LV ROW OVERLAP.
  -- Computed BEFORE anything is written. The rule it answers to is
  -- appointments_no_double_confirmed (0061):
  --   EXCLUDE USING gist (practitioner_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  --   WHERE (status = 'confirmed')
  -- It is keyed on the practitioner and the time and NOTHING ELSE: no location,
  -- no clinic, no date floor. So the set to test is every confirmed row the LV
  -- row would hold afterwards - its own, at any clinic and any time, plus the
  -- confirmed rows arriving in the move.
  -- ==========================================================================
  with after_move as (
    select id, starts_at, ends_at
      from public.appointments
     where status = 'confirmed' and (practitioner_id = c_lv_row or id = any(v_ids))
  )
  select (select count(*)::int from after_move),
         (select count(*)::int from after_move a join after_move b
            on a.id < b.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at))
    into v_confirmed, v_pairs;
  raise notice 'P5 confirmed rows on the LV row after the move %, overlapping pairs %', v_confirmed, v_pairs;
  if v_pairs <> 0 then
    raise exception 'STOP: the move would put % overlapping confirmed pairs on the LV row', v_pairs;
  end if;

  -- ==========================================================================
  -- P6 and P7. PRINTED HERE, ENFORCED IN STAGE 2. Stage 1 runs either way: the
  -- move is right on its own. Stage 2 refuses on either, because the flag is
  -- what makes a leftover LV hour row or a leftover CB booking unreachable.
  -- ==========================================================================
  select count(*)::int into v_p6
    from public.availability_templates
   where user_id = c_cb_row and location_id = c_lv_loc and is_active;
  raise notice 'P6 active LV availability rows on the CB row: % (stage 2 refuses if > 0)', v_p6;

  select count(*)::int into v_p7
    from public.appointments
   where practitioner_id = c_lv_row and location_id = c_cb_loc and starts_at > now();
  raise notice 'P7 future CB appointments on the LV row: % (stage 2 refuses if > 0)', v_p7;

  -- ==========================================================================
  -- P8. WHAT ELSE RUNS ON AN UPDATE TO appointments.
  -- ==========================================================================
  -- EVERY PIECE IS CAST. `tgenabled` is "char" and `proname` is name, and
  -- `text || "char"` resolves to no unique operator: without the casts this
  -- line aborts the whole block, on a rehearsal it did, and it would have
  -- aborted production between the last pre-check and the write. A line that
  -- only PRINTS must not be able to stop the transaction.
  select string_agg(t.tgname::text || ' -> ' || p.proname::text
                    || ' (enabled ' || t.tgenabled::text || ')', ', ' order by t.tgname::text)
    into v_txt
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.appointments'::regclass and not t.tgisinternal;
  raise notice 'P8 triggers on appointments: %', coalesce(v_txt, 'none');

  -- ==========================================================================
  -- THE WRITE. Exactly N rows, identified by the ids counted above.
  -- ==========================================================================
  select count(*)::int into v_cb_before from public.appointments where practitioner_id = c_cb_row;
  select count(*)::int into v_lv_before from public.appointments where practitioner_id = c_lv_row;

  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_tenant, null, c_action, 'user', c_cb_row,
          jsonb_build_object(
            'card', 'NESA-SPLIT-lv-bookings-to-the-lv-row',
            'source', 'owner_sql_editor',
            'ruling', '2026-09-16 (a)',
            'from_practitioner_id', c_cb_row,
            'to_practitioner_id', c_lv_row,
            'location_id', c_lv_loc,
            'moved_count', v_n,
            'moved_ids', to_jsonb(v_ids),
            'status_breakdown', v_breakdown,
            'cb_row_appointments_before', v_cb_before,
            'lv_row_appointments_before', v_lv_before,
            'p6_active_lv_availability_on_cb_row', v_p6,
            'p7_future_cb_appointments_on_lv_row', v_p7));

  update public.appointments
     set practitioner_id = c_lv_row
   where id = any(v_ids);
  get diagnostics v_updated = row_count;
  if v_updated <> v_n then
    raise exception 'STOP: updated % rows, expected exactly %', v_updated, v_n;
  end if;

  -- Nothing outside the move set changed hands, asserted rather than assumed.
  if (select count(*)::int from public.appointments where practitioner_id = c_cb_row) <> v_cb_before - v_n then
    raise exception 'STOP: the CB row holds % appointments, expected %',
      (select count(*) from public.appointments where practitioner_id = c_cb_row), v_cb_before - v_n;
  end if;
  if (select count(*)::int from public.appointments where practitioner_id = c_lv_row) <> v_lv_before + v_n then
    raise exception 'STOP: the LV row holds % appointments, expected %',
      (select count(*) from public.appointments where practitioner_id = c_lv_row), v_lv_before + v_n;
  end if;
  if exists (select 1 from public.appointments
              where practitioner_id = c_cb_row and location_id = c_lv_loc and starts_at > now()) then
    raise exception 'STOP: the CB row still holds a future LV appointment';
  end if;

  raise notice 'NESA SPLIT STAGE 1 DONE: % appointments moved from % to %; CB row % -> %, LV row % -> %',
    v_updated, c_cb_row, c_lv_row, v_cb_before, v_cb_before - v_n, v_lv_before, v_lv_before + v_n;
end $nesa$;
