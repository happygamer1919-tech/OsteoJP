-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0090_nesa_patient_name_for_therapists.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* NESA-NAMES: a therapist reads the PATIENT'S NAME on a shared-resource   */
/* booking at a clinic they are installed at. Nothing else.                */
/* ====================================================================== */
/* Owner request, 2026-09-17: "every therapist must see the patient's name */
/* on NESA bookings instead of Marcacao reservada".                        */
/*                                                                        */
/* Strategy ruling, same day: a therapist sees the patient's name on any   */
/* appointment on a shared-resource staff row installed at a clinic where  */
/* that therapist is installed, with the same card fields their own        */
/* appointments show and NOTHING MORE. No ficha access, no phone, no NIF.  */
/* Reception, owner and portal unchanged. If RLS is what withholds the     */
/* name, the answer is a NARROW SECURITY DEFINER function returning        */
/* appointment id + display name only - never a wider policy on patients.  */
/*                                                                        */
/* ====================================================================== */
/* 1. WHY A FUNCTION AND NOT A POLICY, WHICH IS THE WHOLE DESIGN           */
/* ====================================================================== */
/* WHAT WITHHOLDS THE NAME TODAY, MEASURED: `patients_select` (0074) admits */
/* a therapist only to `viewer_treated_patient_ids()` - patients they are   */
/* on an appointment for. A NESA booking has NESA as the practitioner and   */
/* the therapist on neither practitioner column, so the patient row is not  */
/* admitted, `patients.full_name` comes back NULL through the LEFT JOIN in  */
/* apps/web/lib/scheduling/data.ts, and `patientLabel(null)` renders        */
/* "Marcacao reservada". The appointment ROW is already visible: 0086 and   */
/* 0088 made that so. It is the PATIENT row that is not.                   */
/*                                                                        */
/* SO THE OBVIOUS FIX IS A NEW DISJUNCT ON `patients_select`, AND IT IS THE */
/* WRONG ONE. That policy governs every read of `patients` - the ficha, the */
/* profile, the search, the phone, the NIF, the clinical history. Widening  */
/* it to admit the patient ROW would hand a therapist the entire record of  */
/* every patient NESA has ever seen at their clinic, to satisfy a request   */
/* about a NAME ON A CARD. The ruling says so explicitly, and this file     */
/* obeys it: `patients_select` is NOT TOUCHED by this migration.            */
/*                                                                        */
/* A SECURITY DEFINER function is the narrow instrument. It bypasses RLS on */
/* `patients` for exactly two columns, for exactly the rows the ruling      */
/* names, and it cannot be joined onward to anything else because it        */
/* returns no patient id.                                                   */
/*                                                                        */
/* IT RETURNS NO patient_id, AND THAT IS DELIBERATE. An id is a key: handed */
/* one, a caller can ask `patients`, `clinical_records` or `attachments`    */
/* about it. Those reads would each be refused by their own policies today, */
/* but the ruling is "the name and nothing more", and the cheapest way to   */
/* mean it is to return nothing that can be followed.                       */
/* ====================================================================== */

CREATE OR REPLACE FUNCTION public.shared_resource_appointment_patient_names()
  RETURNS TABLE (appointment_id uuid, patient_name text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  /* THE PREDICATE IS 0088's POLICY, MIRRORED, and that is on purpose: the set
   * of appointments whose name a therapist may read must be the set whose ROW
   * they may already read, or this function either withholds a name on a row
   * they can see (pointless) or names a patient on a row they cannot (a leak).
   *
   * Both helpers are NULLARY and both are called wrapped in `(SELECT ...)`, so
   * each is an InitPlan evaluated ONCE per statement - the rule 0071/0078
   * established and `rls-nullary-wrap.db.test.ts` enforces. A correlated helper
   * must stay unwrapped; there is none here.
   *
   * BOTH PRACTITIONER COLUMNS. 0088's policy covers `practitioner_2_id` only,
   * because SCHED-29.3 was about NESA holding an hour as Terapeuta 2. The
   * ruling here says "any appointment on a shared-resource staff row", and a
   * NESA booking made as the PRIMARY practitioner is the ordinary case
   * reception creates. Following only the second column would leave the
   * commonest booking still reading "Marcacao reservada".
   *
   * `jwt_role() = 'therapist'` KEEPS IT TO THE ROLE THAT ASKED FOR IT.
   * Reception, admin and owner already read these names through
   * `patients_select`; the portal's `patient` role is revoked below. A function
   * that answered for everyone would be a wider grant than the request. */
  SELECT a.id AS appointment_id,
         p.full_name AS patient_name
    FROM public.appointments a
    JOIN public.patients p
      ON p.id = a.patient_id
     AND p.tenant_id = a.tenant_id
   WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
     AND (SELECT public.jwt_role()) = 'therapist'
     AND a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
     AND (
           a.practitioner_id   = ANY (coalesce((SELECT public.shared_resource_practitioner_ids()), '{}'::uuid[]))
        OR a.practitioner_2_id = ANY (coalesce((SELECT public.shared_resource_practitioner_ids()), '{}'::uuid[]))
     )
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by `postgres`,
 * because the owner is whose privileges it runs with and a different applying
 * principal would silently change the answer. */
ALTER FUNCTION public.shared_resource_appointment_patient_names() OWNER TO postgres;--> statement-breakpoint

/* REVOKE FROM THE NAMED ROLES AND NOT ONLY FROM PUBLIC. Supabase's ALTER
 * DEFAULT PRIVILEGES grants EXECUTE on every new function to `anon`,
 * `authenticated` and `service_role`, and `REVOKE ... FROM PUBLIC` does NOT
 * touch a privilege held by a NAMED role - 0072's post-check caught exactly
 * that.
 *
 * `patient` IS REVOKED, WHICH IS THE PORTAL HALF OF THE RULING. This function
 * reads `patients` as its definer; a portal session holding EXECUTE on it would
 * be able to ask for names of people who are not them.
 *
 * `service_role` IS REVOKED TOO, following 0079: it bypasses RLS anyway, so an
 * EXECUTE grant buys it nothing and only widens the surface. */
REVOKE ALL ON FUNCTION public.shared_resource_appointment_patient_names() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_appointment_patient_names() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_appointment_patient_names() FROM patient;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_appointment_patient_names() FROM service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shared_resource_appointment_patient_names() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.shared_resource_appointment_patient_names() IS
  'NESA-NAMES, owner request 2026-09-17. For the CALLING THERAPIST: the id and '
  'the patient display name of every appointment held by a shared-resource '
  'staff row (users.is_shared_resource) installed at a location the therapist '
  'is also installed at, in the caller''s tenant. The predicate mirrors policy '
  'appointments_shared_resource_second_participant_select (0088) and extends it '
  'to the PRIMARY practitioner column, because a NESA booking made as Terapeuta '
  '1 is the ordinary case. SECURITY DEFINER because patients_select (0074) '
  'admits a therapist only to patients they treat, and the ruling forbids '
  'widening that policy: the ficha, the phone and the NIF all read through it. '
  'Returns NO patient_id, so the name cannot be followed to any other table. '
  'Revoked from anon, patient and service_role.';--> statement-breakpoint

/* ====================================================================== */
/* 2. WHAT THIS MIGRATION DOES NOT DO                                      */
/* ====================================================================== */
/* IT TOUCHES NO POLICY. `patients_select`, `appointments_rls` and 0088's    */
/* shared-resource SELECT policy are byte-identical after this file. Nothing */
/* a therapist could read before is read differently; one function exists    */
/* that did not.                                                            */
/*                                                                         */
/* IT SHOWS NOBODY A NAME BY ITSELF. The agenda has to ASK. The read that    */
/* asks (apps/web/lib/scheduling/data.ts) ships in the same PR and, without  */
/* this function, changes nothing - the same division 0088 recorded.         */
/*                                                                         */
/* IT FLAGS NO ROW. With no `users` row carrying is_shared_resource the      */
/* helper returns an empty array and this function returns no rows at all.   */
