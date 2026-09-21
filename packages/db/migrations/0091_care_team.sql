/* ==================================================================== */
/* CARE TEAM - A THERAPIST SEES THE WHOLE APPOINTMENT HISTORY OF A       */
/* PATIENT THEY TREAT                                                    */
/*                                                                       */
/* Card:   CARE-01-assigned-therapists                                   */
/* Spec:   docs/design/SPEC-care-team.md                                 */
/* Ruling: Q-CARE-1 = (c), owner, 2026-09-16.                            */
/*                                                                       */
/* NO NUMBER YET, BY CONSTRUCTION. This file must follow 0089, which is  */
/* authored on patients/SR62-PU4-documentos-soft-delete and is neither   */
/* merged nor applied. Taking a number now would collide with it. See    */
/* packages/db/migrations-pending/README.md for the promotion recipe.    */
/* ==================================================================== */


/* ==================================================================== */
/* 1. WHAT THE CLINIC ASKED FOR, AND WHAT THIS ACTUALLY CHANGES          */
/* ==================================================================== */
/* Rodica, LV: a patient is often treated by several therapists over     */
/* time, and each needs that patient's full past history. Measured       */
/* against production on 2026-09-16, only ONE of the four objects she    */
/* named is actually hidden:                                             */
/*                                                                       */
/*   appointments  HIDDEN - appointments_rls admits a row only when the  */
/*                 viewer is its practitioner_id, practitioner_2_id or   */
/*                 created_by. The PATIENT columns never enter the       */
/*                 predicate, so a row belongs to a therapist rather     */
/*                 than to a patient.                                    */
/*   registos      ALREADY VISIBLE - clinical_therapist_sees_patient is  */
/*                 a patient-level fact: one shared appointment opens    */
/*                 the whole record history.                             */
/*   documentos    ALREADY VISIBLE - attachments_tenant_isolation is     */
/*                 tenant-only, with no narrowing at all.                */
/*   episodios     ALREADY VISIBLE - same shape.                         */
/*                                                                       */
/* 353 of 452 live (patient, therapist) pairs could not read at least    */
/* one of that patient's appointments; 12,160 rows. Pairs blocked from a */
/* registo, a document or an episode: zero, measured.                    */
/*                                                                       */
/* SO THIS MIGRATION TOUCHES APPOINTMENTS AND NOTHING ELSE. Registos,    */
/* episodes, documents and booking rights are explicitly out of scope by */
/* the same ruling. Clinical authorship never moves and                  */
/* clinical_records_enforce_immutability is not referenced here.         */


/* ==================================================================== */
/* 2. THE TABLE                                                          */
/* ==================================================================== */
/* REMOVAL IS A SOFT REMOVE. "Who was on this patient's care team last   */
/* March" is a question an audit will be asked, and a deleted row cannot */
/* answer it. `removed_at` also makes revocation observable: the access  */
/* helper filters on it, so clearing it is the whole of a re-grant.      */
CREATE TABLE IF NOT EXISTS public.patient_care_team (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /* Hard architecture rule 1. */
  "tenant_id"   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "patient_id"  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  "user_id"     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  /* Who assigned. NULL when the assigner's account is later deleted:    */
  /* losing the name must never take the assignment with it.             */
  "assigned_by" uuid REFERENCES public.users(id) ON DELETE SET NULL,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  "removed_at"  timestamptz
);--> statement-breakpoint

/* ONE LIVE ASSIGNMENT PER (patient, therapist), and history beside it.  */
/* Partial, so the same therapist can be assigned, removed and assigned  */
/* again without the second assignment colliding with the first's        */
/* historical row.                                                       */
CREATE UNIQUE INDEX IF NOT EXISTS "patient_care_team_live_unique"
  ON public.patient_care_team ("tenant_id", "patient_id", "user_id")
  WHERE "removed_at" IS NULL;--> statement-breakpoint

/* The access helper's own lookup: one viewer, their live assignments.   */
CREATE INDEX IF NOT EXISTS "patient_care_team_viewer_idx"
  ON public.patient_care_team ("tenant_id", "user_id")
  WHERE "removed_at" IS NULL;--> statement-breakpoint

/* Reception's list for one patient, history included. */
CREATE INDEX IF NOT EXISTS "patient_care_team_patient_idx"
  ON public.patient_care_team ("tenant_id", "patient_id");--> statement-breakpoint

COMMENT ON TABLE public.patient_care_team IS
  'CARE-01. The therapists reception has assigned to a patient. A live row '
  '(removed_at IS NULL) lets that therapist read the patient''s whole '
  'appointment history. Removal is a soft remove so the history of the team '
  'survives; re-assignment is a new row.';--> statement-breakpoint


/* ==================================================================== */
/* 3. RLS ON THE NEW TABLE                                               */
/* ==================================================================== */
/* Hard architecture rule 2. Reception and owner manage the care team;   */
/* the ruling names those two roles and no others, so admin is NOT       */
/* included - deliberately, and it is the kind of omission worth stating */
/* rather than leaving to be read out of a predicate.                    */
/*                                                                       */
/* A THERAPIST HAS NO POLICY HERE AND NEEDS NONE. The access helper in   */
/* section 4 is SECURITY DEFINER, so it reads this table on their behalf */
/* without granting them a view of who else is on any team.              */
ALTER TABLE public.patient_care_team ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.patient_care_team TO authenticated;--> statement-breakpoint
/* NO DELETE GRANT. Removal is an UPDATE that sets removed_at; a DELETE  */
/* would destroy the record this table exists to keep.                   */
REVOKE DELETE ON public.patient_care_team FROM authenticated;--> statement-breakpoint

CREATE POLICY "patient_care_team_select" ON public.patient_care_team
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
  );--> statement-breakpoint

CREATE POLICY "patient_care_team_insert" ON public.patient_care_team
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
  );--> statement-breakpoint

CREATE POLICY "patient_care_team_update" ON public.patient_care_team
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
  )
  WITH CHECK (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
  );--> statement-breakpoint


/* ==================================================================== */
/* 4. THE ACCESS HELPER                                                  */
/* ==================================================================== */
/* NULLARY, SO IT IS AN INITPLAN. Taking no argument means `(SELECT f())` */
/* is evaluated once per statement rather than once per row - the same   */
/* reason 0073/0074/0078 are shaped this way, and the 4,691 ms per-row   */
/* defect 0078 removed is not reintroduced.                              */
/*                                                                       */
/* SECURITY DEFINER, STABLE, search_path pinned: the same contract every */
/* other visibility helper in this schema carries.                       */
CREATE OR REPLACE FUNCTION public.viewer_care_team_patient_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT ct.patient_id), '{}'::uuid[])
    FROM public.patient_care_team ct
   WHERE ct.tenant_id = public.jwt_tenant_id()
     AND ct.user_id   = auth.uid()
     AND ct.removed_at IS NULL
$$;--> statement-breakpoint

ALTER FUNCTION public.viewer_care_team_patient_ids() OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_care_team_patient_ids() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_care_team_patient_ids() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.viewer_care_team_patient_ids() IS
  'CARE-01. The patients the calling user is CURRENTLY assigned to '
  '(removed_at IS NULL). Nullary so it evaluates once per statement.';--> statement-breakpoint


/* ==================================================================== */
/* 5. THE VISIBILITY, AS A SEPARATE SELECT POLICY                        */
/* ==================================================================== */
/* A SEPARATE PERMISSIVE POLICY, NOT A DISJUNCT IN appointments_rls, for */
/* exactly the reason 0088 gives: appointments_rls is FOR ALL, so its    */
/* USING governs SELECT, the rows an UPDATE may target AND the rows a    */
/* DELETE may remove. Widening it would hand every therapist the right   */
/* to change or delete a colleague's booking - a grant nobody ruled.     */
/* This is visibility and nothing else; UPDATE and DELETE still require  */
/* appointments_rls, which this file does not touch.                     */
/*                                                                       */
/* THE SECOND ARM REUSES viewer_treated_patient_ids() RATHER THAN        */
/* RESTATING IT, and that is the point rather than economy. The ruling   */
/* says to use "exactly the status set you used for option c", and that  */
/* measurement applied NO STATUS FILTER AT ALL: every appointment row,   */
/* cancelled ones included. That helper has no status predicate either - */
/* the word `status` does not appear in 0074 - so reusing it makes the   */
/* shipped rule the measured rule by construction instead of by care.    */
/*                                                                       */
/* CONSEQUENCE, STATED BECAUSE IT IS REAL: a single cancelled appointment */
/* is enough to open that patient's whole history to that therapist,     */
/* permanently. That follows from the ruling as measured. If the clinic  */
/* wants cancelled visits excluded, it is a predicate change here and a  */
/* new count, not a redesign.                                            */
/*                                                                       */
/* BOTH PATIENT SLOTS. patient_2_id carries the second participant, and  */
/* every patient-side helper in this schema follows it; a history that   */
/* silently omitted shared bookings would be a different feature.        */
CREATE POLICY "appointments_care_team_patient_history_select" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    AND (
      (patient_id   = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_id   = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
    )
  );--> statement-breakpoint

COMMENT ON POLICY "appointments_care_team_patient_history_select" ON public.appointments IS
  'CARE-01, ruling Q-CARE-1 (c). A therapist may READ every appointment of a '
  'patient they are assigned to by reception, or of any patient they have '
  'themselves treated (any appointment, past or future, no status filter). '
  'SELECT only: UPDATE and DELETE still require appointments_rls, so this is '
  'visibility and never a right to change a colleague''s booking.';--> statement-breakpoint


/* ==================================================================== */
/* 6. WHAT THIS MIGRATION DOES NOT DO                                    */
/* ==================================================================== */
/* IT ASSIGNS NOBODY. The table ships empty; every row comes from        */
/* reception pressing a control. Until then the only arm that admits     */
/* anything is the one keyed on appointments the therapist already has.  */
/*                                                                       */
/* IT DOES NOT WIDEN THE AGENDA. The agenda asks for one practitioner's  */
/* own column, and that WHERE clause is what makes a day view a day      */
/* view; a readable row appears only where a query asks for it.          */
/*                                                                       */
/* IT CHANGES NO CLINICAL POLICY. clinical_records, clinical_episodes,   */
/* attachments and storage are untouched, as is every INSERT, UPDATE and */
/* DELETE policy in the schema.                                          */
