-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0087_guest_clinical_intake.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0087 - INTAKE-01: the guest clinical intake. Storage and retention. */
/* ================================================================== */
/*                                                                    */
/* WHAT THIS IS. A member of the public who books online for the      */
/* first time answers a short clinical questionnaire as the fifth     */
/* step of the guest flow (docs/design/SPEC-guest-clinical-intake.md).*/
/* This is where those answers live. It is special-category health    */
/* data (GDPR Article 9) about a person who may never become a        */
/* patient, so every rule below is a rule about who can see it and    */
/* how long it may exist.                                             */
/*                                                                    */
/* THE RULINGS IT IMPLEMENTS:                                         */
/*   JP: readable by reception AND therapist; retained FOREVER once   */
/*       the person is treated; consent is a TICK, not a signature;   */
/*       it sits beside the appointment request first, and reaches    */
/*       the therapist later; an unregistered person fills it before  */
/*       the booking is confirmed; if the booking never happens it is */
/*       deleted at 7 days when ALL FOUR conditions hold.             */
/*   Strategy 2026-09-07, ruling 2: pacemaker and pregnancy carry     */
/*       THREE states, never-asked distinct from no.                  */
/*   Owner 2026-09-09, WF-19: consent is stored as what was ticked,   */
/*       when, and a VERSION LABEL (the terms pattern: the document's */
/*       identity, never its text). Three values on this row.         */
/*                                                                    */
/* THE FOUR CONDITIONS, as stamped in SPEC section 8, and where each  */
/* is enforced. They hold TOGETHER; three of four is a different rule.*/
/*   1. an unconverted intake is deleted seven days after it arrives: */
/*      purge_expired_guest_intakes, `created_at <= now() - 7 days`   */
/*      AND the request's converted_patient_id IS NULL.               */
/*   2. conversion ENDS the clock: the same converted_patient_id arm. */
/*      Once reception converts the request to a person, the job can  */
/*      never select the row again; it is kept forever.               */
/*   3. the deletion takes the ANSWERS, not the request: the function */
/*      deletes from THIS table only. guest_booking_requests survives */
/*      as the trail of what was asked for, with no Article 9 data.   */
/*   4. the clock runs on ARRIVAL, not last touch: created_at is set  */
/*      once, there is no updated_at, and no role can UPDATE a row.   */
/*                                                                    */
/* THE ONE COLUMN THE JOB MUST NEVER READ. guest_booking_requests.    */
/* converted_appointment_id is written by NOTHING in this repository  */
/* (guest-convert.ts resolves a person and prefills the drawer; it    */
/* never books). It is NULL on every row, always. A predicate on it   */
/* would read "never booked" as true for a patient who WAS treated,   */
/* and delete their intake. The function below does not reference it, */
/* and the post-check and the DB-gated suite both assert that.        */
/*                                                                    */
/* WHO READS IT (RLS, SELECT only; nobody may INSERT/UPDATE/DELETE    */
/* through the API roles):                                            */
/*   owner                     every row in the tenant                */
/*   admin, reception          rows whose request is at one of their  */
/*                             locations, or every row when they hold */
/*                             no location assignment (0047's rule)   */
/*   therapist                 ONLY after conversion, and only when   */
/*                             they may see that patient's clinical   */
/*                             records (clinical_therapist_sees_      */
/*                             patient). Before conversion there is   */
/*                             no patient to scope them by, so none.  */
/*   patient (portal)          their OWN converted intake, read only, */
/*                             via patient_guest_request_ids(): the   */
/*                             patient role has no access to          */
/*                             guest_booking_requests at all (0065).  */
/* The WRITE is the guest route's, through the admin connection, in   */
/* the same transaction as the request row.                           */
/*                                                                    */
/* WHAT IT NEVER DOES: write patients.contraindication_*. An intake   */
/* answer ("the person said so") and a contraindication flag ("a      */
/* clinician confirmed it") are different claims (ruling 2).          */
/*                                                                    */
/* KNOWN EDGE, inherited and not introduced here: merge_patients      */
/* (0005) never repoints guest_booking_requests.converted_patient_id, */
/* so an intake converted to a duplicate that is later merged stays   */
/* with the merged-away row. The guest queue has the same gap today.  */
/* ================================================================== */

CREATE TYPE public.intake_answer AS ENUM ('sim', 'nao', 'nao_perguntado');--> statement-breakpoint

COMMENT ON TYPE public.intake_answer IS
  'Three states for a yes/no clinical safety question. nao_perguntado (never asked) is DISTINCT from nao and is never a default: the guest form requires sim or nao, and the third value exists for rows that arrive by any other route.';--> statement-breakpoint

CREATE TABLE public.guest_clinical_intakes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.tenants(id),
  guest_booking_request_id uuid NOT NULL UNIQUE
                             REFERENCES public.guest_booking_requests(id) ON DELETE CASCADE,
  date_of_birth            date NOT NULL CHECK (date_of_birth >= DATE '1900-01-01'),
  reason                   text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  health_conditions        text CHECK (health_conditions IS NULL OR char_length(health_conditions) <= 2000),
  medication               text CHECK (medication IS NULL OR char_length(medication) <= 2000),
  falls_accidents          text CHECK (falls_accidents IS NULL OR char_length(falls_accidents) <= 2000),
  surgeries                text CHECK (surgeries IS NULL OR char_length(surgeries) <= 2000),
  pacemaker                public.intake_answer NOT NULL,
  pregnancy                public.intake_answer NOT NULL,
  consent_ticked           boolean NOT NULL CHECK (consent_ticked),
  consent_at               timestamptz NOT NULL,
  consent_version          text NOT NULL CHECK (btrim(consent_version) <> ''),
  created_at               timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX guest_clinical_intakes_tenant_created_idx
  ON public.guest_clinical_intakes (tenant_id, created_at);--> statement-breakpoint

/* The tenant on the intake must be the request's. A composite FK would need a
   new unique key on guest_booking_requests; a trigger keeps 0063's table as it is. */
CREATE OR REPLACE FUNCTION public.guest_clinical_intake_tenant_matches()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.guest_booking_requests r
     WHERE r.id = NEW.guest_booking_request_id AND r.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'guest_clinical_intakes: tenant_id does not match the request''s tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER guest_clinical_intakes_tenant_matches
  BEFORE INSERT OR UPDATE ON public.guest_clinical_intakes
  FOR EACH ROW EXECUTE FUNCTION public.guest_clinical_intake_tenant_matches();--> statement-breakpoint

ALTER TABLE public.guest_clinical_intakes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* The patient role cannot read guest_booking_requests (0065 revoked it), so the
   patient's arm resolves its own request ids through this nullary helper. Same
   shape as viewer_location_ids(): STABLE, SECURITY DEFINER, pinned search_path,
   owned by postgres (0060), called as (SELECT ...) so it is an InitPlan. */
CREATE OR REPLACE FUNCTION public.patient_guest_request_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(r.id), '{}'::uuid[])
    FROM public.guest_booking_requests r
   WHERE public.jwt_patient_id() IS NOT NULL
     AND r.tenant_id = public.jwt_tenant_id()
     AND r.converted_patient_id = public.jwt_patient_id()
$$;--> statement-breakpoint

ALTER FUNCTION public.patient_guest_request_ids() OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.patient_guest_request_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.patient_guest_request_ids() FROM anon, authenticated, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_guest_request_ids() TO patient;--> statement-breakpoint

CREATE POLICY guest_clinical_intakes_staff_select ON public.guest_clinical_intakes
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND EXISTS (
      SELECT 1
        FROM public.guest_booking_requests r
       WHERE r.id = guest_clinical_intakes.guest_booking_request_id
         AND r.tenant_id = guest_clinical_intakes.tenant_id
         AND (
           (SELECT public.jwt_role()) = 'owner'
           OR (
             (SELECT public.jwt_role()) IN ('admin', 'reception')
             AND (
               NOT public.viewer_has_location_assignment()
               OR public.location_in_viewer_scope(r.location_id)
             )
           )
           OR (
             (SELECT public.jwt_role()) = 'therapist'
             AND r.converted_patient_id IS NOT NULL
             AND public.clinical_therapist_sees_patient(r.converted_patient_id)
           )
         )
    )
  );--> statement-breakpoint

CREATE POLICY guest_clinical_intakes_patient_select ON public.guest_clinical_intakes
  FOR SELECT
  TO patient
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND guest_booking_request_id = ANY (coalesce((SELECT public.patient_guest_request_ids()), '{}'::uuid[]))
  );--> statement-breakpoint

/* Privileges state their own end state (0065's lesson: Supabase grants at CREATE
   TABLE, and a named REVOKE leaves PUBLIC's grant). Read-only for the two
   reading roles; the write is the guest route's (service_role: SELECT, INSERT);
   DELETE happens only inside purge_expired_guest_intakes, as its owner. */
REVOKE ALL ON public.guest_clinical_intakes FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON public.guest_clinical_intakes FROM anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT ON public.guest_clinical_intakes TO authenticated, patient;--> statement-breakpoint
GRANT SELECT, INSERT ON public.guest_clinical_intakes TO service_role;--> statement-breakpoint

/* THE RETENTION JOB'S BODY. One tenant per call (CLAUDE.md rule 3: never global).
   Deletes the ANSWERS of every intake in that tenant that is older than seven days
   by ARRIVAL and whose request was never converted to a person, and writes one
   append-only audit row per deletion, PII-free. Returns how many it deleted.
   It never reads converted_appointment_id - see the header. */
CREATE OR REPLACE FUNCTION public.purge_expired_guest_intakes(p_tenant_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'purge_expired_guest_intakes: a tenant is required; this job never runs globally'
      USING ERRCODE = '22004';
  END IF;

  WITH doomed AS (
    SELECT i.id
      FROM public.guest_clinical_intakes i
      JOIN public.guest_booking_requests r
        ON r.id = i.guest_booking_request_id
       AND r.tenant_id = i.tenant_id
     WHERE i.tenant_id = p_tenant_id
       AND i.created_at <= now() - interval '7 days'
       AND r.converted_patient_id IS NULL
       FOR UPDATE OF i
  ),
  gone AS (
    DELETE FROM public.guest_clinical_intakes i
     USING doomed d
     WHERE i.id = d.id
    RETURNING i.guest_booking_request_id, i.created_at
  ),
  audited AS (
    INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    SELECT p_tenant_id, NULL, 'guest_intake.purged', 'guest_booking_request', g.guest_booking_request_id,
           jsonb_build_object(
             'reason', 'retention_7d_unconverted',
             'intake_arrived_at', g.created_at
           )
      FROM gone g
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted FROM audited;

  RETURN v_deleted;
END
$$;--> statement-breakpoint

ALTER FUNCTION public.purge_expired_guest_intakes(uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_expired_guest_intakes(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_expired_guest_intakes(uuid) FROM anon, authenticated, patient, service_role;--> statement-breakpoint

COMMENT ON TABLE public.guest_clinical_intakes IS
  'INTAKE-01 (0087). Article 9 health answers from the guest booking flow. Readable by owner, location-scoped admin/reception, a therapist only after conversion to a patient they see clinically, and the patient themselves. Unconverted rows are purged at 7 days by arrival (purge_expired_guest_intakes); converted rows are kept forever. Never feeds patients.contraindication_*.';
