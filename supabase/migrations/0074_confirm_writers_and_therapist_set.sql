-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0074_confirm_writers_and_therapist_set.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0074 — SR-35. TWO NAMED PARTS, EACH PROVEN SEPARATELY.              */
/*                                                                     */
/*   PART A  SECURITY DEFINER writers for appointment_confirm_codes,   */
/*           closing the hole 0072 left: it built the READ door and    */
/*           not the write door.                                       */
/*   PART B  PERF-12. The therapist branch of patients_select takes    */
/*           the 0073 visible-set shape.                               */
/*                                                                     */
/* PART C OF SR-35 IS NOT IN THIS FILE, AND THAT IS A REPORTED         */
/* DECISION RATHER THAN AN OMISSION. See the block at the end.         */
/* ================================================================== */

/* ================================================================== */
/* PART A — THE WRITE DOOR                                             */
/*                                                                     */
/* WHAT WAS WRONG. 0072 REVOKEd appointment_confirm_codes from PUBLIC, */
/* anon, authenticated and patient (SR-29, "no table grants") and      */
/* granted EXECUTE on resolve_confirm_code to `authenticated` alone.   */
/* Reminder jobs run as `authenticated`, so every INSERT, UPDATE and   */
/* DELETE from the application answered                                */
/*   permission denied for table appointment_confirm_codes             */
/* Nobody noticed because when 0072 was authored nothing wrote the     */
/* table. CONFIRM-02 wrote it through the service-role handle, which   */
/* contradicts a rule stated in apps/web/lib/reminders/context.ts.     */
/*                                                                     */
/* THE SHAPE MATCHES THE READER. One SECURITY DEFINER door per verb,   */
/* owned by postgres, EXECUTE to `authenticated` only, and every one   */
/* takes the tenant as an argument and PROVES the appointment belongs  */
/* to it in the same statement. That is the check RLS would have made  */
/* if the app role could reach the table, and it is why these are      */
/* narrow functions rather than a GRANT: a grant would let any         */
/* authenticated session write any row.                                */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.issue_confirm_code(
  p_code_hash      text,
  p_tenant_id      uuid,
  p_appointment_id uuid
) RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
  /* The row is inserted FROM A SELECT over appointments matching BOTH the id
   * and the tenant, so a caller that paired the wrong two values inserts
   * nothing at all rather than writing a code into another tenant.
   *
   * ON CONFLICT DO NOTHING lets 0072's partial unique index be the arbiter of
   * "one live code per appointment": two reminder runs racing on the same
   * appointment would both pass a check-then-insert, and one would take a
   * unique violation anyway. The index decides once. */
  WITH ins AS (
    INSERT INTO public.appointment_confirm_codes (code_hash, tenant_id, appointment_id)
    SELECT p_code_hash, a.tenant_id, a.id
      FROM public.appointments a
     WHERE a.id = p_appointment_id AND a.tenant_id = p_tenant_id
    ON CONFLICT DO NOTHING
    RETURNING code_hash
  )
  SELECT EXISTS (SELECT 1 FROM ins)
$$;--> statement-breakpoint

ALTER FUNCTION public.issue_confirm_code(text, uuid, uuid) OWNER TO postgres;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.withdraw_confirm_code(
  p_code_hash text,
  p_tenant_id uuid
) RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
  /* Only an UNCONSUMED code may be withdrawn, so this can never remove one a
   * patient has already acted on. The tenant is matched as well as the hash:
   * a caller may only withdraw within its own tenant. */
  WITH del AS (
    DELETE FROM public.appointment_confirm_codes
     WHERE code_hash = p_code_hash
       AND tenant_id = p_tenant_id
       AND consumed_at IS NULL
    RETURNING code_hash
  )
  SELECT EXISTS (SELECT 1 FROM del)
$$;--> statement-breakpoint

ALTER FUNCTION public.withdraw_confirm_code(text, uuid) OWNER TO postgres;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.consume_confirm_code(
  p_code_hash text,
  p_tenant_id uuid,
  p_now       timestamptz
) RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
  /* THE PREDICATE IS THE LOCK. `consumed_at IS NULL` inside the UPDATE means
   * two simultaneous presses of `pedir remarcacao` produce exactly one
   * consumption, decided by the database rather than by a read the caller did
   * earlier and might be racing. The loser gets false and takes the generic
   * refusal path, which is also what a forged code gets. */
  WITH upd AS (
    UPDATE public.appointment_confirm_codes
       SET consumed_at = p_now
     WHERE code_hash = p_code_hash
       AND tenant_id = p_tenant_id
       AND consumed_at IS NULL
    RETURNING code_hash
  )
  SELECT EXISTS (SELECT 1 FROM upd)
$$;--> statement-breakpoint

ALTER FUNCTION public.consume_confirm_code(text, uuid, timestamptz) OWNER TO postgres;--> statement-breakpoint

/* REVOKE FROM THE NAMED ROLES AND NOT ONLY FROM PUBLIC. Supabase's ALTER
 * DEFAULT PRIVILEGES grants EXECUTE on every new function to anon,
 * authenticated and service_role, and REVOKE ... FROM PUBLIC does not touch a
 * privilege held by a NAMED role. 0072's own post-check caught exactly that on
 * resolve_confirm_code, which was left callable over PostgREST by an
 * unauthenticated request. These three WRITE, so the same omission would be
 * worse. */
REVOKE ALL ON FUNCTION public.issue_confirm_code(text, uuid, uuid)      FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_confirm_code(text, uuid, uuid)      FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_confirm_code(text, uuid, uuid)      FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_confirm_code(text, uuid, uuid)   TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.withdraw_confirm_code(text, uuid)         FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.withdraw_confirm_code(text, uuid)         FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.withdraw_confirm_code(text, uuid)         FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.withdraw_confirm_code(text, uuid)      TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_confirm_code(text, uuid, timestamptz)    FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_confirm_code(text, uuid, timestamptz)    FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_confirm_code(text, uuid, timestamptz)    FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_confirm_code(text, uuid, timestamptz) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.issue_confirm_code(text, uuid, uuid) IS
  'The ONLY write path that mints a confirm code. SECURITY DEFINER because '
  '0072 revokes the table from every application role (SR-29). Proves the '
  'appointment belongs to the tenant in the same statement, and lets the '
  'partial unique index arbitrate one live code per appointment. SR-35, 0074.';--> statement-breakpoint
COMMENT ON FUNCTION public.withdraw_confirm_code(text, uuid) IS
  'Removes an UNCONSUMED code, for a send that did not happen. Cannot remove a '
  'code a patient has acted on. SR-35, migration 0074.';--> statement-breakpoint
COMMENT ON FUNCTION public.consume_confirm_code(text, uuid, timestamptz) IS
  'Spends a code. The consumed_at IS NULL predicate is the lock: two '
  'simultaneous presses produce exactly one consumption. SR-35, 0074.';--> statement-breakpoint

/* ================================================================== */
/* PART B — PERF-12. THE THERAPIST BRANCH.                             */
/*                                                                     */
/* 0073 gave the admin/reception branch a set computed once per        */
/* statement and left the therapist branch alone, because SR-33 scoped */
/* it out. Measured afterwards on the PERF-06 shim, therapist search   */
/* was 3.0x reception's at 10 concurrent (489 ms against 165), and the */
/* same query with RLS ONLY was 99.4 ms against 29.4: the therapist    */
/* branch still evaluates patient_appt_treated_by_viewer(id) on every  */
/* row before the name filter can remove any of them. The therapist    */
/* pays MORE while seeing LESS - 525 visible rows against 2,800.       */
/*                                                                     */
/* THE SHAPE IS 0073's, APPLIED TO THE OTHER BRANCH, and the argument  */
/* is the same one: the helper below is NULLARY, so it has no per-row  */
/* input and its answer cannot vary by row. Evaluating it once per     */
/* statement is semantically identical.                                */
/*                                                                     */
/* patient_appt_treated_by_viewer(uuid) IS NOT DROPPED. It stays for   */
/* patients_update and patients_delete, which SR-35 does not touch,    */
/* and the suite asserts it is still called there and still unwrapped. */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.viewer_treated_patient_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  /* Driven from the PRACTITIONER side, which is the indexed one: the viewer is
   * one user and their appointments are a small slice, where the old form asked
   * every patient row "has this patient ever been treated by me".
   *
   * BOTH PARTICIPANT COLUMNS and BOTH PRACTITIONER COLUMNS, exactly as
   * patient_appt_treated_by_viewer reads them. A set that followed only
   * patient_id, or only practitioner_id, would NARROW what a therapist sees. */
  SELECT coalesce(array_agg(DISTINCT s.patient_id), '{}'::uuid[])
    FROM (
      SELECT a.patient_id AS patient_id
        FROM public.appointments a
       WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
         AND (a.practitioner_id = (SELECT auth.uid()) OR a.practitioner_2_id = (SELECT auth.uid()))
         AND a.patient_id IS NOT NULL
      UNION ALL
      SELECT a.patient_2_id AS patient_id
        FROM public.appointments a
       WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
         AND (a.practitioner_id = (SELECT auth.uid()) OR a.practitioner_2_id = (SELECT auth.uid()))
         AND a.patient_2_id IS NOT NULL
    ) AS s
$$;--> statement-breakpoint

ALTER FUNCTION public.viewer_treated_patient_ids() OWNER TO postgres;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.viewer_treated_patient_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_treated_patient_ids() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_treated_patient_ids() FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_treated_patient_ids() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.viewer_treated_patient_ids() IS
  'The patient ids the calling therapist has treated, in the JWT tenant: '
  'either participant of an appointment where the viewer is either '
  'practitioner. The SAME predicate patient_appt_treated_by_viewer(id) '
  'answered per row before 0074, computed once from the practitioner side. '
  'Empty array, never NULL. PERF-12, SR-35, migration 0074.';--> statement-breakpoint

/* 0073's patients_select VERBATIM apart from the therapist branch's single
 * term. Diff it against 0073: every other branch, comment and operator is
 * byte-identical, deliberately, so a reviewer can see nothing else moved. */
DROP POLICY "patients_select" ON public.patients;--> statement-breakpoint

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
      )
    )
  );
--> statement-breakpoint

/* ================================================================== */
/* PART C IS DELIBERATELY ABSENT, AND HERE IS THE MEASUREMENT THAT     */
/* TOOK IT OUT.                                                        */
/*                                                                     */
/* SR-35 part (c) is SR-27's unwrapped nullary helper calls. It is NOT */
/* in this file, and the reason is not that it could not be proven -   */
/* it is that a mechanical audit of the LIVE schema says it cannot     */
/* move any surface the owner is waiting on.                           */
/*                                                                     */
/* THE LIVE COUNT, from all 73 migrations applied, using the detector  */
/* PERF-05's own correction requires (match the helper name, then look */
/* BACKWARD for the wrapping SELECT):                                  */
/*                                                                     */
/*   20 policies / 23 predicate sites  four public.* nullary helpers   */
/*   25 policies / 30 predicate sites  the same plus auth.uid()        */
/*                                                                     */
/* The card's "21" sits between the two because the helper set was     */
/* never written down. 0075 must say which set it fixes.               */
/*                                                                     */
/* THE TABLES CARRYING THEM: action_token_consumptions, consultations, */
/* guest_booking_requests, patient_audit_log, patient_followup_        */
/* contacts, patient_followup_postponements, patient_terms_            */
/* acceptances, staff_notifications, quick_notes, and the patients     */
/* WRITE policies.                                                     */
/*                                                                     */
/* THE FIVE SLOW PAGES READ: appointments, patients, invoices, users,  */
/* services, locations, packs. The intersection is EMPTY - grepping    */
/* both route trees and both lib modules for every affected table      */
/* returns zero hits. Part (c) therefore cannot move Estatisticas or   */
/* Administracao, and shipping it beside two parts that CAN be proven  */
/* against a measured symptom would have bought scope without buying   */
/* an answer. It is carded for 0075 with the live list above, which is */
/* more than it had before.                                            */
/* ================================================================== */
