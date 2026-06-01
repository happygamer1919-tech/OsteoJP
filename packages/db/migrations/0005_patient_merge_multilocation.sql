CREATE TABLE "patient_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_locations" ADD CONSTRAINT "patient_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_locations_tenant_patient_location_uq" ON "patient_locations" USING btree ("tenant_id","patient_id","location_id");--> statement-breakpoint
CREATE INDEX "patient_locations_patient_idx" ON "patient_locations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patient_locations_location_idx" ON "patient_locations" USING btree ("location_id");--> statement-breakpoint

/* ================================================================== */
/* patient_locations — RLS (tenant isolation, fail-closed)            */
/* Mirrors the standard tenant_isolation pattern from 0001_rls.sql:   */
/* USING / WITH CHECK both compare tenant_id to the JWT claim. A       */
/* missing/invalid claim → helper returns NULL → predicate FALSE →    */
/* row invisible. No permissive fallback.                             */
/* ================================================================== */

ALTER TABLE public.patient_locations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "patient_locations_tenant_isolation" ON public.patient_locations
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

-- Table-level grant (RLS = row gate, GRANT = table gate; both required —
-- see 0003_grants.sql). 0003 granted ALL TABLES point-in-time; this table is
-- new, so it needs its own grant. No sequence (uuid default).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_locations TO authenticated;--> statement-breakpoint

/* ================================================================== */
/* clinical_records immutability — make the trigger re-parent-aware    */
/*                                                                    */
/* Original (0001) blocked ANY update/delete of a locked/signed row.  */
/* A patient merge must re-point patient_id on those finalized rows    */
/* WITHOUT touching their clinical content. We relax the rule by the   */
/* narrowest possible amount:                                          */
/*   * DELETE of a finalized row is still always forbidden.            */
/*   * UPDATE of a finalized row is allowed ONLY when                  */
/*       (a) merge_patients set app.merge_reparent='on' for this       */
/*           transaction (so nothing else can trigger it), AND         */
/*       (b) the ONLY column that changed is patient_id.               */
/* (b) is checked by diffing the whole row as jsonb minus patient_id   */
/* (and updated_at) — if any other field differs, including `data`,    */
/* `status`, signature or the addendum chain, the update is rejected.  */
/* Content immutability is therefore fully preserved.                  */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.enforce_clinical_record_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('locked', 'signed') THEN
    -- Finalized rows can never be deleted.
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION
        'clinical_records %: status=% is finalized and immutable; cannot delete',
        OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Permit a merge re-parent: gated by app.merge_reparent, and only if
    -- patient_id is the sole changed column (content stays byte-identical).
    IF current_setting('app.merge_reparent', true) = 'on'
       AND NEW.patient_id IS DISTINCT FROM OLD.patient_id
       AND (to_jsonb(NEW) - 'patient_id' - 'updated_at')
         = (to_jsonb(OLD) - 'patient_id' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'clinical_records %: status=% is finalized and immutable; create a new versioned record (addendum) instead',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

/* ================================================================== */
/* merge_patients(source, target) — SECURITY DEFINER                  */
/*                                                                    */
/* Merges source INTO target within the caller's tenant. Safe to call */
/* ONLY inside a tenant-scoped transaction: the tenant is taken from   */
/* the JWT claims (public.jwt_tenant_id()); with no claims it is NULL  */
/* and the function aborts. Every dependent is re-pointed with a WHERE */
/* pinned to that tenant, so a cross-tenant row can never be touched.  */
/* Cross-tenant input is rejected because a patient that is not in the */
/* caller's tenant simply is not FOUND.                                */
/*                                                                    */
/* SECURITY DEFINER (owner = postgres, BYPASSRLS) is the supported     */
/* escape hatch — isolation here comes from the explicit tenant_id     */
/* predicates, not from RLS. The immutability trigger still fires.     */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_id uuid, p_target_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_tenant_id    uuid;
  v_actor        uuid;
  c_appointments integer;
  c_episodes     integer;
  c_records      integer;
  c_attachments  integer;
  c_invoices     integer;
  c_locations    integer;
BEGIN
  v_tenant_id := public.jwt_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'merge_patients: no tenant context — call only inside a tenant-scoped transaction'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Audit actor = JWT `sub` (the Supabase auth user id), if present.
  v_actor := NULLIF(
    (current_setting('request.jwt.claims', true)::jsonb) ->> 'sub', ''
  )::uuid;

  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'merge_patients: source and target are the same patient (%)', p_source_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Both patients must be active members of the caller's tenant. Lock them.
  PERFORM 1 FROM public.patients
    WHERE id = p_source_id AND tenant_id = v_tenant_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_patients: source patient % not found in tenant %', p_source_id, v_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM public.patients
    WHERE id = p_target_id AND tenant_id = v_tenant_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_patients: target patient % not found in tenant %', p_target_id, v_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Re-point dependents. Every WHERE pins tenant_id = v_tenant_id.
  UPDATE public.appointments      SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_appointments = ROW_COUNT;

  UPDATE public.clinical_episodes SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_episodes = ROW_COUNT;

  -- clinical_records: signed/locked rows are immutable. Re-parent through the
  -- gated trigger path — flag this transaction, change ONLY patient_id, unflag.
  PERFORM set_config('app.merge_reparent', 'on', true);
  UPDATE public.clinical_records  SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_records = ROW_COUNT;
  PERFORM set_config('app.merge_reparent', 'off', true);

  UPDATE public.attachments       SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_attachments = ROW_COUNT;

  UPDATE public.invoices          SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_invoices = ROW_COUNT;

  -- patient_locations: re-point, but respect the unique
  -- (tenant_id, patient_id, location_id) — drop source links the target
  -- already holds, then move the remainder.
  DELETE FROM public.patient_locations s
   WHERE s.patient_id = p_source_id AND s.tenant_id = v_tenant_id
     AND EXISTS (
       SELECT 1 FROM public.patient_locations t
        WHERE t.patient_id = p_target_id AND t.tenant_id = v_tenant_id
          AND t.location_id = s.location_id
     );
  UPDATE public.patient_locations SET patient_id = p_target_id
   WHERE patient_id = p_source_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS c_locations = ROW_COUNT;

  -- Soft-handle the source — mark merged + soft-delete. Never hard delete.
  UPDATE public.patients
     SET merged_into_id = p_target_id,
         deleted_at     = now(),
         updated_at     = now()
   WHERE id = p_source_id AND tenant_id = v_tenant_id;

  -- One audit row per merge (actor, source, target, counts moved).
  INSERT INTO public.audit_log
    (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_tenant_id, v_actor, 'patient.merge', 'patient', p_source_id,
    jsonb_build_object(
      'source_patient_id', p_source_id,
      'target_patient_id', p_target_id,
      'moved', jsonb_build_object(
        'appointments',      c_appointments,
        'clinical_episodes', c_episodes,
        'clinical_records',  c_records,
        'attachments',       c_attachments,
        'invoices',          c_invoices,
        'patient_locations', c_locations
      )
    )
  );

  RETURN jsonb_build_object(
    'source_patient_id', p_source_id,
    'target_patient_id', p_target_id,
    'moved', jsonb_build_object(
      'appointments',      c_appointments,
      'clinical_episodes', c_episodes,
      'clinical_records',  c_records,
      'attachments',       c_attachments,
      'invoices',          c_invoices,
      'patient_locations', c_locations
    )
  );
END;
$$;
--> statement-breakpoint

-- Least privilege: only the authenticated role (inside a tenant-scoped
-- transaction) may call it. Revoke the implicit PUBLIC execute grant.
REVOKE EXECUTE ON FUNCTION public.merge_patients(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT  EXECUTE ON FUNCTION public.merge_patients(uuid, uuid) TO authenticated;