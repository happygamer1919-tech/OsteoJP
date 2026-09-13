-- JP-ROW, UNDO. WRITES. Restores is_bookable true on exactly the row step 2 changed, read back from
-- step 2's own audit row. One statement. Any "STOP:" means nothing was written.
do $$
declare
  v_card   constant text := 'JP-ROW-not-taking-patients-set-not-bookable';
  v_target uuid;
  v_tenant uuid;
  v_n      int;
begin
  select al.entity_id, al.tenant_id into v_target, v_tenant
    from public.audit_log al
   where al.action = 'staff.profile_update'
     and al.metadata->>'card' = v_card
     and al.metadata->>'undo' is null
   order by al.created_at desc
   limit 1;
  if v_target is null then
    raise exception 'STOP: step 2 never ran (no audit row); nothing to undo';
  end if;
  if exists (select 1 from public.audit_log al
              where al.metadata->>'card' = v_card and al.metadata->>'undo' = 'true') then
    raise exception 'STOP: already undone';
  end if;

  update public.users u set is_bookable = true, updated_at = now()
   where u.id = v_target and not u.is_bookable;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'STOP: updated % rows, expected exactly 1 (someone changed it since)', v_n;
  end if;

  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_tenant, null, 'staff.profile_update', 'user', v_target,
          jsonb_build_object('fields', jsonb_build_array('is_bookable'),
                             'card', v_card, 'source', 'owner_sql_editor', 'undo', true));

  raise notice 'JP-ROW UNDONE: % is bookable again', v_target;
end $$;
