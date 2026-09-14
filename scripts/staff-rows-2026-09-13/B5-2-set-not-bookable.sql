-- JP-ROW, step 2 of 3: SET is_bookable FALSE ON THE JP ROW NOT TAKING PATIENTS. WRITES.
-- One statement: it all happens or none of it does. Any "STOP:" means nothing was written.
-- "Not taking patients" is read from the data at run time, not from a card: the one JP row with
-- NO future booking in either role. If both rows or neither row qualify, it stops and the owner
-- rules from the pre-check.
-- Effect: the row leaves the Terapeuta dropdown, the agenda Terapeutas filter and the portal's
-- online-booking roster (all three read is_bookable). Its past appointments still show on the agenda.
do $$
declare
  v_card   constant text := 'JP-ROW-not-taking-patients-set-not-bookable';
  v_rows   constant uuid[] := array['54d486e0-a9c3-4c82-acac-8b909ce5a2d0',
                                    '0c1a0000-0000-4000-8000-000000000001']::uuid[];
  v_idle   uuid[];
  v_target uuid;
  v_tenant uuid;
  v_n      int;
begin
  select count(*) into v_n from public.users u where u.id = any (v_rows) and u.is_active and u.is_bookable;
  if v_n <> 2 then
    raise exception 'STOP: expected both JP rows active and bookable, found % such rows', v_n;
  end if;
  if exists (select 1 from public.audit_log al
              where al.action = 'staff.profile_update' and al.metadata->>'card' = v_card) then
    raise exception 'STOP: this block has already run (audit row present)';
  end if;

  select array_agg(u.id) into v_idle
    from public.users u
   where u.id = any (v_rows)
     and not exists (select 1 from public.appointments a
                      where (a.practitioner_id = u.id or a.practitioner_2_id = u.id)
                        and a.starts_at >= now()
                        and a.status not in ('cancelled', 'no_show'));
  if coalesce(array_length(v_idle, 1), 0) <> 1 then
    raise exception 'STOP: % JP rows have no future booking; this needs exactly one. Read step 1 and rule which row',
      coalesce(array_length(v_idle, 1), 0);
  end if;
  v_target := v_idle[1];

  update public.users u set is_bookable = false, updated_at = now()
   where u.id = v_target and u.is_bookable
  returning u.tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'STOP: updated % rows, expected exactly 1', v_n;
  end if;

  -- The same audit shape the Equipa edit writes (staff.profile_update, fields changed).
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_tenant, null, 'staff.profile_update', 'user', v_target,
          jsonb_build_object('fields', jsonb_build_array('is_bookable'),
                             'card', v_card, 'source', 'owner_sql_editor',
                             'is_bookable_before', true));

  select count(*) into v_n from public.users u where u.id = any (v_rows) and u.is_bookable;
  if v_n <> 1 then
    raise exception 'STOP: expected exactly one JP row bookable afterwards, found %', v_n;
  end if;

  raise notice 'JP-ROW DONE: % is no longer bookable', v_target;
end $$;
