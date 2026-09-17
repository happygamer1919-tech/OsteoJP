-- ============================================================================
-- NESA SPLIT, STAGE 2 of 2: PRE-CHECKS + THE FLAG. ONE TRANSACTION.
--
-- Card NESA-SPLIT-lv-bookings-to-the-lv-row. Owner ruling 2026-09-16 (c):
-- after the move, is_shared_resource = true on BOTH NESA rows. Ruling (b):
-- NESA leaves the patient portal at both clinics, accepted - that is this
-- flag's doing, not a separate change: apps/api/lib/appointments/store.ts
-- (listBookableTherapists) filters u.is_shared_resource = false, so a flagged
-- row is offered to no patient at either clinic.
--
-- WRITES: public.users.is_shared_resource on exactly 2 rows, and one
-- public.audit_log row per row. is_bookable is NOT touched, is_active is NOT
-- touched, no appointment is touched, no availability row is switched off.
--
-- IT REFUSES UNLESS STAGE 1 HAS RUN AND THE GROUND IS CLEAR. The flag makes
-- sharedResourceLocationAllowed (apps/web/lib/scheduling/shared-resource-guard.ts:39)
-- live for both rows, and that guard refuses - for the owner too - any booking
-- of a flagged row at a clinic where the row is not installed. So anything
-- still standing on the wrong side of the split would be frozen by this stage:
--   - a future LV appointment left on the CB row  (stage 1's whole job)
--   - a future CB appointment on the LV row       (P7)
--   - an active LV hour row on the CB row         (P6): the agenda would keep
--     offering an LV slot on a row that can no longer take an LV booking.
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "NESA SPLIT STAGE 2 DONE" notice.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-2-flag.sql
-- ============================================================================

do $nesa$
declare
  c_cb_row     constant uuid := '0c1a0000-0000-4000-8000-000000000002'; -- NESA, the CB-labelled row
  c_lv_row     constant uuid := 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'; -- NESA, the LV row
  c_lv_loc     constant uuid := 'de000002-0000-0000-0000-000000000001'; -- OsteoJP (LV)
  c_cb_loc     constant uuid := 'de000002-0000-0000-0000-000000000002'; -- OsteoJP (CB)
  c_action     constant text := 'staff.set_shared_resource';
  c_stage1     constant text := 'staff.nesa_split.reassign';

  v_cb        record;
  v_lv        record;
  v_tenant    uuid;
  v_left      int;
  v_p7        int;
  v_p6        int;
  v_updated   int;
  v_audited   int;
begin
  -- ==========================================================================
  -- THE TWO ROWS, AND THE ORDER.
  -- ==========================================================================
  select id, tenant_id, full_name, is_active, is_bookable, is_shared_resource
    into v_cb from public.users where id = c_cb_row;
  if not found then raise exception 'STOP: the CB-labelled NESA row % does not exist', c_cb_row; end if;

  select id, tenant_id, full_name, is_active, is_bookable, is_shared_resource
    into v_lv from public.users where id = c_lv_row;
  if not found then raise exception 'STOP: the LV NESA row % does not exist', c_lv_row; end if;

  if v_cb.full_name is distinct from 'NESA' or v_lv.full_name is distinct from 'NESA' then
    raise exception 'STOP: one of the two rows is not named NESA (% and %)', v_cb.full_name, v_lv.full_name;
  end if;
  if v_cb.tenant_id is distinct from v_lv.tenant_id then
    raise exception 'STOP: the two NESA rows are in different tenants';
  end if;
  v_tenant := v_cb.tenant_id;

  if v_cb.is_shared_resource or v_lv.is_shared_resource then
    raise exception 'STOP: is_shared_resource is already true on at least one row (CB %, LV %); this block has already run',
      v_cb.is_shared_resource, v_lv.is_shared_resource;
  end if;

  if not exists (select 1 from public.audit_log where action = c_stage1 and entity_id = c_cb_row) then
    raise exception 'STOP: stage 1 has not run (no % audit row for %); the flag must not precede the move', c_stage1, c_cb_row;
  end if;

  -- Both rows must still be installed where the split puts them, or the flag
  -- freezes bookings at a clinic the row cannot serve.
  if (select count(*) from public.staff_locations where user_id = c_cb_row) <> 1
     or not exists (select 1 from public.staff_locations where user_id = c_cb_row and location_id = c_cb_loc) then
    raise exception 'STOP: the CB row must be installed at Castelo Branco and nowhere else';
  end if;
  if not exists (select 1 from public.staff_locations where user_id = c_lv_row and location_id = c_lv_loc) then
    raise exception 'STOP: the LV row is not installed at Linda-a-Velha';
  end if;

  -- ==========================================================================
  -- THE THREE REFUSALS.
  -- ==========================================================================
  select count(*)::int into v_left
    from public.appointments
   where practitioner_id = c_cb_row and location_id = c_lv_loc and starts_at > now();
  raise notice 'STAGE 2 P-A future LV appointments on the CB row: % (needs 0)', v_left;
  if v_left <> 0 then
    raise exception 'STOP: % future LV appointments are still on the CB row; run stage 1 first', v_left;
  end if;

  select count(*)::int into v_p7
    from public.appointments
   where practitioner_id = c_lv_row and location_id = c_cb_loc and starts_at > now();
  raise notice 'STAGE 2 P7 future CB appointments on the LV row: % (needs 0)', v_p7;
  if v_p7 <> 0 then
    raise exception 'STOP: % future CB appointments sit on the LV row; flagging would freeze them', v_p7;
  end if;

  select count(*)::int into v_p6
    from public.availability_templates
   where user_id = c_cb_row and location_id = c_lv_loc and is_active;
  raise notice 'STAGE 2 P6 active LV availability rows on the CB row: % (needs 0)', v_p6;
  if v_p6 <> 0 then
    raise exception 'STOP: the CB row still holds % active LV hour rows; the agenda would offer a slot the guard then refuses', v_p6;
  end if;

  -- ==========================================================================
  -- THE WRITE. Exactly 2 rows, one column, and an audit row each carrying the
  -- before values so the undo is exact.
  -- ==========================================================================
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  select v_tenant, null, c_action, 'user', u.id,
         jsonb_build_object(
           'card', 'NESA-SPLIT-lv-bookings-to-the-lv-row',
           'source', 'owner_sql_editor',
           'ruling', '2026-09-16 (c)',
           'is_shared_resource_before', u.is_shared_resource,
           'is_shared_resource_after', true,
           'is_bookable_unchanged', u.is_bookable,
           'is_active_unchanged', u.is_active,
           'clinic', case when u.id = c_cb_row then 'castelo_branco' else 'linda_a_velha' end)
    from public.users u
   where u.id in (c_cb_row, c_lv_row);
  get diagnostics v_audited = row_count;
  if v_audited <> 2 then
    raise exception 'STOP: wrote % audit rows, expected exactly 2', v_audited;
  end if;

  update public.users
     set is_shared_resource = true
   where id in (c_cb_row, c_lv_row) and is_shared_resource = false;
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'STOP: flagged % rows, expected exactly 2', v_updated;
  end if;

  if (select count(*) from public.users where is_shared_resource) <> 2 then
    raise exception 'STOP: % rows carry is_shared_resource, expected exactly the two NESA rows',
      (select count(*) from public.users where is_shared_resource);
  end if;

  -- Nothing else on either row moved.
  if not exists (select 1 from public.users u
                  where u.id = c_cb_row and u.is_bookable = v_cb.is_bookable and u.is_active = v_cb.is_active
                    and u.full_name = 'NESA')
     or not exists (select 1 from public.users u
                     where u.id = c_lv_row and u.is_bookable = v_lv.is_bookable and u.is_active = v_lv.is_active
                       and u.full_name = 'NESA') then
    raise exception 'STOP: a column other than is_shared_resource changed, and none may';
  end if;

  raise notice 'NESA SPLIT STAGE 2 DONE: is_shared_resource true on % and %; is_bookable and is_active unchanged',
    c_cb_row, c_lv_row;
end $nesa$;
