-- NESA-LV-ROW, step 2 of 3: REMOVE THE LOGIN. WRITES. One statement: it all happens or none of it does.
-- Staff row bdc466d7-f81f-4f8c-aa2e-b85194d73e1a (NESA, Linda-a-Velha).
-- Removes: the auth.users row, and with it (ON DELETE CASCADE) its identities, sessions,
--          refresh tokens, MFA factors and one-time tokens.
-- Keeps:   the public.users row and every flag on it, its clinics, schedule and appointments.
--          Retiring the row is NOT authorised and this does not do it.
-- Any line starting "STOP:" means nothing was written.
do $$
declare
  v_id         constant uuid := 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a';
  v_row        record;
  v_identities int;
  v_sessions   int;
  v_deleted    int;
  v_left       int := 0;
  v_fk         record;
  v_n          int;
begin
  select u.tenant_id, u.full_name, u.is_active, u.is_bookable, u.is_shared_resource
    into v_row
    from public.users u
   where u.id = v_id;
  if not found then
    raise exception 'STOP: staff row % does not exist', v_id;
  end if;
  if v_row.full_name is distinct from 'NESA' then
    raise exception 'STOP: staff row % is not named NESA', v_id;
  end if;
  if v_row.is_shared_resource then
    raise exception 'STOP: staff row % is flagged as the shared machine; this block is for the Linda-a-Velha login row', v_id;
  end if;
  if not exists (select 1 from auth.users au where au.id = v_id) then
    raise exception 'STOP: staff row % holds no login; nothing to remove', v_id;
  end if;
  if exists (select 1 from public.audit_log al where al.action = 'staff.remove_login' and al.entity_id = v_id) then
    raise exception 'STOP: this block has already run for % (audit row present)', v_id;
  end if;

  select count(*) into v_identities from auth.identities ai where ai.user_id = v_id;
  select count(*) into v_sessions   from auth.sessions   s  where s.user_id  = v_id;

  -- The audit row carries counts only: no email, no credential material.
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, null, 'staff.remove_login', 'user', v_id,
          jsonb_build_object('card', 'NESA-LV-ROW-remove-login-bdc466d7',
                             'source', 'owner_sql_editor',
                             'identities_removed', v_identities,
                             'sessions_removed', v_sessions));

  delete from auth.users au where au.id = v_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'STOP: removed % logins, expected exactly 1', v_deleted;
  end if;

  -- Nothing may still point at the removed login, whatever tables this Supabase version has.
  for v_fk in
    select n.nspname as sch, c2.relname as tbl, a.attname as col
      from pg_constraint c
      join pg_class c2 on c2.oid = c.conrelid
      join pg_namespace n on n.oid = c2.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
  loop
    execute format('select count(*) from %I.%I where %I = $1', v_fk.sch, v_fk.tbl, v_fk.col)
       into v_n using v_id;
    v_left := v_left + v_n;
  end loop;
  if v_left <> 0 then
    raise exception 'STOP: % rows still reference the removed login', v_left;
  end if;

  -- The staff row itself is untouched.
  if not exists (select 1 from public.users u
                  where u.id = v_id and u.full_name = 'NESA'
                    and u.is_active = v_row.is_active
                    and u.is_bookable = v_row.is_bookable
                    and u.is_shared_resource = v_row.is_shared_resource) then
    raise exception 'STOP: the staff row changed, and it must not';
  end if;

  raise notice 'NESA-LV-ROW DONE: login removed from %; staff row unchanged', v_id;
end $$;
