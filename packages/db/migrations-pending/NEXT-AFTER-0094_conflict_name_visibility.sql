/* ====================================================================== */
/* CONFLICT NAMES: the conflict check returns a patient's name only where  */
/* the caller's own reads would show it.                                   */
/*                                                                        */
/* Ruling: owner, 2026-09-22, numbered 0096. The conflict check returns a */
/* patient's name only when the caller's SELECT policies on appointments  */
/* return that appointment, and the placeholder otherwise. Tier C, held.  */
/*                                                                        */
/* RULED NUMBER 0096. NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION.    */
/* The ruled queue is 0093 RGPD-01, 0094 the users/tenants role fix, 0095  */
/* the grants revoke, 0096 this file. None of 0093 to 0095 is promoted, so */
/* taking 0096 now would name a migration whose predecessors do not exist  */
/* in packages/db/migrations. See packages/db/migrations-pending/README.md  */
/* for the promotion recipe.                                               */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0095's.   */
/* A `when` that is equal or lower makes drizzle skip the file in silence, */
/* which is why scripts/check-journal.mjs refuses one.                     */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT CHANGES, AND WHAT DOES NOT                                      */
/* ====================================================================== */
/* public.appointment_conflicts returns the SAME ROWS as before: the same  */
/* two arms, the same predicate, the same signature and the same return    */
/* type (id, patient_name, starts_at, ends_at, room, kind). Conflict       */
/* detection keeps the scope an earlier ruling gave it                    */
/* (apps/web/e2e/agenda-clinic-closure.spec.ts:191): every overlapping    */
/* row in the tenant counts, whether or not the caller can read it.       */
/*                                                                        */
/* ONLY THE patient_name COLUMN CHANGES. 0059's body filled it from its   */
/* own join on patients. This body fills it only when the                 */
/* caller's SELECT policies on appointments return that appointment, and   */
/* then reads the name through the caller's own reads:                     */
/*                                                                        */
/*   1. patients.full_name, read under the caller's patients policies;     */
/*   2. failing that, 0090's shared_resource_appointment_patient_names(),  */
/*      the name path already ruled for shared-resource bookings.          */
/*                                                                        */
/* Otherwise patient_name is NULL, and the app renders a NULL name as      */
/* patientLabel(null), "Marcacao reservada": the placeholder the agenda    */
/* and 0090 already use for a booking whose patient the viewer does not    */
/* read. The conflict is still reported, still blocks, and still offers    */
/* "Guardar mesmo assim"; only the name on the line changes.               */


/* ====================================================================== */
/* 2. WHY TWO FUNCTIONS                                                    */
/* ====================================================================== */
/* A SECURITY DEFINER function runs with its owner's privileges, so the    */
/* caller's row policies are not evaluated inside it: it cannot ask "would */
/* this caller read this appointment". The ROWS still need the owner's     */
/* view, because detection is clinic-blind by ruling. So the two halves    */
/* are split:                                                              */
/*                                                                        */
/*   public.appointment_conflict_rows(...)   SECURITY DEFINER, owned by     */
/*       postgres. 0059's two arms verbatim, WITHOUT the join on patients  */
/*       and with no patient column at all. It returns (id, starts_at,     */
/*       ends_at, room, kind).                                             */
/*                                                                        */
/*   public.appointment_conflicts(...)       SECURITY INVOKER. Same        */
/*       signature, same return type. It selects every row of the one      */
/*       above and computes patient_name under the caller's policies.      */
/*                                                                        */
/* THE JOIN ON patients NEVER DROPPED A ROW, so removing it moves         */
/* nothing. appointments.patient_id is NOT NULL with a foreign key, so    */
/* the join matched exactly one patient per appointment. The rehearsal    */
/* compared the old and new outputs row for row and found them equal.     */
/*                                                                        */
/* THE NAME IS A SCALAR SUBQUERY IN THE SELECT LIST, NEVER A FILTER. A    */
/* WHERE EXISTS or an inner join on the caller's appointments would drop  */
/* the rows the caller cannot read, and a dropped row is a double         */
/* booking. The behaviour script's S arms compare this function's rows    */
/* with the definer rows and with 0059's predicate written out, for the   */
/* calls it makes, so a filter here reads FAIL there.                     */


/* ====================================================================== */
/* 3. THE ONE PLACE THIS IS STRICTER THAN THE RULING'S WORDS               */
/* ====================================================================== */
/* The ruling reads "name only when the caller's SELECT policy on          */
/* appointments returns the row". This body also needs the caller's reads  */
/* to return the NAME: patients_select, or 0090's function.                */
/*                                                                        */
/* They differ in one case. A patient on the caller's care team (0091),    */
/* whom the caller has never treated, at the caller's own clinic (0092):   */
/* appointments_care_team_patient_history_select returns the appointment, */
/* but patients_select admits a therapist only to patients they treated    */
/* (viewer_treated_patient_ids), so the patient row is not returned. The   */
/* conflict line then shows the placeholder rather than the name. That is  */
/* what the agenda card already shows for the same appointment, because    */
/* apps/web/lib/scheduling/data.ts reads the name through the same LEFT    */
/* JOIN on patients.                                                       */
/*                                                                        */
/* It is carried to the owner as a question and NOT decided here: naming   */
/* that patient would need either a wider patients_select or a new name    */
/* path like 0090's, and neither was ruled.                                */


/* ====================================================================== */
/* 4. THE ROWS FUNCTION                                                    */
/* ====================================================================== */

CREATE OR REPLACE FUNCTION public.appointment_conflict_rows(
  p_practitioner uuid,
  p_location uuid,
  p_room text,
  p_starts timestamptz,
  p_ends timestamptz,
  p_exclude uuid[]
)
  RETURNS TABLE (
    id uuid,
    starts_at timestamptz,
    ends_at timestamptz,
    room text,
    kind text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  ROWS 5
  SET search_path = public
AS $$
  -- therapist overlap: same practitioner, overlapping window.
  SELECT a.id, a.starts_at, a.ends_at, a.room, 'therapist'::text
  FROM public.appointments a
  WHERE a.tenant_id = public.jwt_tenant_id()
    AND a.status NOT IN ('cancelled', 'no_show')   -- 0052: was <> 'cancelled'
    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.practitioner_id = p_practitioner
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
  UNION ALL
  -- room overlap: same location + same room (case-insensitive), only when a
  -- room is given. A null-room appointment never conflicts on room.
  SELECT a.id, a.starts_at, a.ends_at, a.room, 'room'::text
  FROM public.appointments a
  WHERE p_room IS NOT NULL
    AND btrim(p_room) <> ''
    AND a.tenant_id = public.jwt_tenant_id()
    AND a.status NOT IN ('cancelled', 'no_show')   -- 0052: was <> 'cancelled'
    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.location_id = p_location
    AND lower(a.room) = lower(btrim(p_room))
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by postgres,
 * because the owner is whose privileges it runs with, and a different applying
 * principal would change the answer without an error. */
ALTER FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) OWNER TO postgres;--> statement-breakpoint

/* THE END STATE, STATED (SR-52): revoked from PUBLIC AND from each named role,
 * then granted to exactly one. A revoke from PUBLIC does not remove a privilege
 * a NAMED role holds, and Supabase's default privileges grant EXECUTE on every
 * new function to anon, authenticated and service_role by name; 0073 and 0079
 * record both halves of that. `patient` is revoked because the portal has no
 * use for it; `service_role` because 0079 keeps it off every SECURITY DEFINER
 * function. `authenticated` keeps EXECUTE because appointment_conflicts, which
 * runs as the caller, calls this function as the caller. */
REVOKE ALL ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM patient;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.appointment_conflict_rows(uuid, uuid, text, timestamptz, timestamptz, uuid[]) IS
  'Ruled 0096, owner 2026-09-22. The rows of the booking conflict check: '
  'therapist overlap (same practitioner) and room overlap (same location and '
  'room, case-insensitive) in the caller''s tenant, excluding cancelled, '
  'no_show and unconfirmed pedidos (0052, 0059). Clinic-blind by ruling. '
  'Returns no patient column. SECURITY DEFINER, owned by postgres; EXECUTE '
  'for authenticated only. appointment_conflicts adds the name under the '
  'caller''s own policies.';--> statement-breakpoint


/* ====================================================================== */
/* 5. THE CONFLICT FUNCTION, NOW SECURITY INVOKER                          */
/* ====================================================================== */
/* CREATE OR REPLACE switches SECURITY DEFINER to SECURITY INVOKER in       */
/* place. MEASURED on Postgres 17.6: prosecdef goes false, the owner stays  */
/* postgres and the ACL is untouched; the signature and the return type    */
/* are identical, which is the only thing CREATE OR REPLACE requires. The  */
/* one app caller (apps/web/lib/scheduling/conflict.ts) needs no change to */
/* its SQL.                                                                */
/*                                                                        */
/* EVERY READ BELOW RUNS UNDER THE CALLER'S POLICIES, and that is the     */
/* design. For each conflict row, ONE scalar subquery reads the           */
/* appointment by its primary key, as the caller:                         */
/*   - no row back means the caller's SELECT on appointments does not     */
/*   return it, which is the ruling's own test, and the name is NULL;     */
/*   - a row back LEFT JOINs patients as the caller, so p.full_name is    */
/*   there only where patients_select returns the patient;                */
/*   - failing that, 0090's function, which names a shared-resource       */
/*   booking at a clinic the calling therapist is installed at. It is     */
/*   reached only through a row the caller's appointments policies        */
/*   already returned, so it can never name one they do not.              */
/*                                                                        */
/* COST, MEASURED. The caller's policies cost what they cost on every     */
/* other read: for a therapist they call viewer_treated_patient_ids(),    */
/* which the plan evaluates once per policy reference per call, not per   */
/* row, and only when there is a conflict row to name. One appointment    */
/* probe per row, not two, keeps that to three evaluations per call for a */
/* therapist: two from the appointments policies and one from             */
/* patients_select. On a synthetic tenant of 132,333 appointments,        */
/* therapist caller, median per call: a window WITH conflicts (3 rows)    */
/* takes about 100 ms against about 20 ms for 0059's body, which reads no */
/* policy at all; a window with NO conflict takes 21 ms against 23 ms,    */
/* because nothing is left to name. THE PROBE MUST STAY A SCALAR          */
/* SUBQUERY: written as WHEN EXISTS (...), the planner turns it into a    */
/* hashed scan of every appointment in the tenant under the caller's      */
/* policies, measured at a median 2,034 ms per call on the same data.     */
/* ROWS 5 on the rows function keeps the planner from assuming a thousand */
/* rows.                                                                  */

CREATE OR REPLACE FUNCTION public.appointment_conflicts(
  p_practitioner uuid,
  p_location uuid,
  p_room text,
  p_starts timestamptz,
  p_ends timestamptz,
  p_exclude uuid[]
)
  RETURNS TABLE (
    id uuid,
    patient_name text,
    starts_at timestamptz,
    ends_at timestamptz,
    room text,
    kind text
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  SELECT r.id,
         (SELECT coalesce(
                   p.full_name,
                   (SELECT n.patient_name
                      FROM public.shared_resource_appointment_patient_names() n
                     WHERE n.appointment_id = a.id)
                 )
            FROM public.appointments a
            LEFT JOIN public.patients p ON p.id = a.patient_id
           WHERE a.id = r.id),
         r.starts_at,
         r.ends_at,
         r.room,
         r.kind
    FROM public.appointment_conflict_rows(p_practitioner, p_location, p_room, p_starts, p_ends, p_exclude) r
$$;--> statement-breakpoint

/* ITS GRANTS ARE UNCHANGED, AND STATED (SR-52). The end state is the one it
 * already has: EXECUTE for authenticated and for nobody else but its owner.
 * Stating it again makes this file replayable onto any environment with the same
 * answer, whatever that environment's ACL was before. */
REVOKE ALL ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM patient;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) IS
  'Ruled 0096, owner 2026-09-22. The booking conflict check: every row of '
  'appointment_conflict_rows, unchanged, with patient_name filled only when '
  'the caller''s SELECT policies on appointments return that appointment, '
  'read from patients under the caller''s policies or, for a shared-resource '
  'booking, from shared_resource_appointment_patient_names (0090). NULL '
  'otherwise; the app renders NULL as the "Marcacao reservada" placeholder. '
  'SECURITY INVOKER.';--> statement-breakpoint


/* ====================================================================== */
/* 6. SECURITY DEFINER COUNT, AND WHAT MOVES AT PROMOTION                  */
/* ====================================================================== */
/* NET ZERO. appointment_conflicts stops being SECURITY DEFINER and        */
/* appointment_conflict_rows starts; the number of prosecdef functions in  */
/* public is the same after this file as before it, so EXPECTED_COUNT in   */
/* packages/db/scripts/check-security-definer-owner.mjs needs no change    */
/* for this file.                                                          */
/*                                                                        */
/* THE NAMES MOVE, and two tests read names. At promotion, in the same     */
/* PR, and not before (both read packages/db/migrations only):             */
/*   - packages/db/tests/security-definer-owner.test.ts lists              */
/*     appointment_conflicts among the SECURITY DEFINER functions, and its */
/*     owner-pin scan will find 0060's pin for a function that is no       */
/*     longer one, plus the new pin above;                                 */
/*   - apps/api/lib/appointments/blocking-status.test.ts reads 0059 as the */
/*     definition of the conflict predicate; after promotion that is this  */
/*     file, whose predicate is spelled the same way on purpose.           */
/*                                                                        */
/* IDEMPOTENT. Two CREATE OR REPLACE, an owner pin that is a no-op when    */
/* already set, revokes and grants that converge, and two COMMENTs. The    */
/* rehearsal applied it twice in a row and read the same catalogue state   */
/* after each.                                                             */
