/* ====================================================================== */
/* CARE-02a: A THERAPIST ON A PATIENT'S CARE TEAM READS THE FICHA AND     */
/* THE REGISTOS, BUT ONLY OF A PATIENT LINKED TO ONE OF THEIR OWN         */
/* CLINICS; A THERAPIST WRITES THEIR OWN BOOKING'S CARE-TEAM ROW AND      */
/* READS THE TEAMS THEY ARE ON AT THEIR OWN CLINICS.                      */
/*                                                                        */
/* Card: CARE-02a. Ruled by the owner on 2026-09-27 (Tier C), and the     */
/* open question on the clinic ruled the same day: "limit to their        */
/* clinic only". Authored now and HELD: this lane never applies it;       */
/* GREEN applies it later. This is v2 of the file; v1 had no clinic       */
/* limit and was never applied anywhere but a throwaway.                  */
/*                                                                        */
/* RULED NUMBER 0098. NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION.   */
/* It must follow 0097. The ruled queue after 0093, as the owner          */
/* renumbered it on 2026-09-27, is 0094 (users, tenants, roles policy     */
/* split), 0095 (the conflict check's patient name), 0096 (the grants     */
/* revoke), 0097 (the staging index), then this file. See the README in   */
/* packages/db/migrations-pending for promotion; the body below is final. */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0097's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* Section 8 lists what else moves at promotion; one of those moves is a  */
/* GATE-CHANGE and has to be sequenced.                                   */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* CARE-01 (0091, narrowed by 0092) let a therapist on a patient's care   */
/* team read that patient's appointments at the therapist's own clinics.  */
/* Measured on a throwaway at main (b13a-gap.md, 2026-09-27): such a      */
/* therapist, with no appointment of their own, still reads 0 rows of     */
/* `patients` and 0 of `clinical_records`, so getPatient returns null and */
/* the patient page 404s, taking every tab with it. After this file:      */
/*                                                                        */
/*   R0  ONE NEW HELPER, viewer_care_team_patient_ids_at_my_clinics():    */
/*       the patients on the caller's live care team (0091's set, read    */
/*       through 0091's own helper) that are linked to one of the         */
/*       caller's clinics on 0045's patient-location basis (section 2).   */
/*   R1  patients_select: the therapist arm also admits those patients    */
/*       (the ficha).                                                     */
/*   R2  clinical_records_select: the therapist arm also admits every     */
/*       registo of those patients (the registos). READ ONLY: no INSERT,  */
/*       UPDATE or DELETE policy of clinical_records changes.             */
/*   R3  patient_care_team_insert: a therapist may insert ONE kind of     */
/*       row, their own booking's: user_id and assigned_by are the caller */
/*       and the patient is one they have an appointment with. Owner and  */
/*       reception keep exactly what they had; admin stays excluded.      */
/*       Unchanged from v1.                                               */
/*   R4  patient_care_team_select: a therapist reads the rows of the      */
/*       patients R0 names (so they see who else is on a team at their    */
/*       own clinics), and their own rows. Owner and reception unchanged; */
/*       admin still excluded. patient_care_team_update is NOT touched.   */
/*                                                                        */
/* A therapist on a patient's live team whose clinics the patient has no */
/* link to reads 0 rows of that patient, 0 of its registos and none of   */
/* the other members' team rows; their own row stays readable (R4, and   */
/* section 5 (a) says why it must).                                       */
/*                                                                        */
/* The app reads through apps/web/lib/patients/scope.ts as well, and its  */
/* care-team READ arm calls the same helper by name, so the app never     */
/* shows what this file refuses. That arm ships in the same PR and is not */
/* in this file.                                                          */


/* ====================================================================== */
/* 2. THE CLINIC LIMIT AND ITS LOCATION BASIS                             */
/* ====================================================================== */
/* THE RULING. 0092 limited the care-team APPOINTMENT arm to the          */
/* viewer's own clinics: an appointment row carries location_id, so 0092  */
/* added `location_id = ANY (viewer_location_ids())` to the row           */
/* (0092_care_team_location.sql:60-74, the conjunct at :67). The owner    */
/* ruled on 2026-09-27 that the ficha and the registos stop at the clinic */
/* the same way.                                                          */
/*                                                                        */
/* WHY NOT 0092'S SHAPE. `patients` carries only primary_location_id and  */
/* `clinical_records` carries NO location at all, so neither row can be   */
/* matched to a clinic by a column of its own. The limit is therefore     */
/* decided PER PATIENT: a care-team patient counts for a therapist when   */
/* the PATIENT is linked to one of the therapist's clinics, and then the  */
/* ficha and EVERY registo of that patient count, including a registo     */
/* written at another clinic; otherwise none of them do. That is the      */
/* granularity 0045 already gives admins on clinical_records (0045's      */
/* header, :22-28: "the admin match is EXISTS-over-appointments ... PLUS  */
/* a persisted patients FALLBACK column").                                */
/*                                                                        */
/* THE TWO FUNCTIONS, READ IN FULL AND RECONCILED.                        */
/*   clinical_admin_sees_patient(p)  (0045:120-159). TRUE when an         */
/*     appointment of p in the JWT tenant, with a non-null location_id,   */
/*     is at a location the caller has a staff_locations row for in the   */
/*     same tenant; OR, only when p has NO appointment with a non-null    */
/*     location_id, p's primary_location_id is such a location.           */
/*   viewer_location_ids()  (0073:143-154), which 0092 reads. The         */
/*     location ids of the caller's staff_locations rows in the JWT       */
/*     tenant.                                                            */
/*   THE CALLER'S CLINICS ARE THE SAME ROWS IN BOTH. 0045 joins           */
/*   staff_locations on sl.user_id = auth.uid() and sl.tenant_id =        */
/*   a.tenant_id, with a.tenant_id = jwt_tenant_id(); viewer_location_ids */
/*   reads sl.user_id = auth.uid() and sl.tenant_id = jwt_tenant_id().    */
/*   So the helper reads the clinics as 0092 does, through                */
/*   viewer_location_ids() wrapped in a scalar sub-select (0073's         */
/*   InitPlan shape), and gets 0045's answer.                             */
/*   A NULL location never matches. `x = ANY (array)` is never true for a */
/*   NULL x, which is 0045's `location_id IS NOT NULL` (and its           */
/*   `primary_location_id IS NOT NULL`) written as membership.            */
/*   THE ONE REAL DIFFERENCE IS THE PATIENT SLOT, AND 0045'S IS KEPT.     */
/*   0045's admin basis reads appointments.patient_id only; 0092's        */
/*   appointment arm, 0047 and 0073 also follow patient_2_id. This file   */
/*   follows 0045, the first slot only, in the appointment basis AND in   */
/*   the fallback's "no located appointment" test, so that for every      */
/*   patient and every caller the helper's answer is exactly              */
/*   (on the live team) AND clinical_admin_sees_patient(p). WHY: the      */
/*   registos are clinical data, and a therapist then reads, through the  */
/*   team, no registo that an admin installed at the same clinics cannot  */
/*   read. The                                                            */
/*   behaviour check asserts that equality against 0045's own function    */
/*   called as each actor, not only against the tables                    */
/*   (scripts/db/behaviour-care02a-readonly.sql, arms I1 and H1). THE     */
/*   COST, stated because it is real: a                                   */
/*   patient who is at clinic A ONLY as the second participant of a       */
/*   shared booking, and whose own bookings are at clinic B, is not       */
/*   linked to A here. A's care-team therapist sees that shared booking   */
/*   (0092 follows both slots) but not the ficha or the registos. It is   */
/*   the narrower answer, never the wider one; widening it to both slots  */
/*   is a one-line change in each EXISTS below and would make the         */
/*   therapist read registos A's admin cannot.                            */
/*                                                                        */
/* THE TEAM IS 0091'S, BY CONSTRUCTION. The helper reads the team through */
/* viewer_care_team_patient_ids() (0091:150-162) rather than restating    */
/* its predicate, so "on the live care team" has one definition, and      */
/* every patient this helper returns is one that helper returns.          */


/* ====================================================================== */
/* 3. THE FOUR POLICIES, AND WHERE THEIR CURRENT TEXT LIVES               */
/* ====================================================================== */
/* Every policy statement below is an ALTER POLICY that restates the      */
/* policy's CURRENT expression and adds one arm. The current text is the  */
/* LAST migration that created or altered the policy, measured by         */
/* grepping packages/db/migrations for each name:                         */
/*                                                                        */
/*   patients_select           0074_confirm_writers_and_therapist_set.sql */
/*                             :222-242 (0073 and 0071 before it; no      */
/*                             migration after 0074 alters it, and 0090   */
/*                             and 0092 say so in their headers)          */
/*   clinical_records_select   0045_clinical_records_location_rls.sql     */
/*                             :221-240                                   */
/*   patient_care_team_select  0091_care_team.sql:108-115                 */
/*   patient_care_team_insert  0091_care_team.sql:117-124                 */
/*                                                                        */
/* Nothing in the held queue (0094, 0095, 0096, 0097) alters any of the   */
/* four; the pre-check pins each one's rendered text by md5, so a policy  */
/* that moved before this file is applied STOPs the sitting.              */
/*                                                                        */
/* WHY ALTER POLICY AND NOT A NEW POLICY. The policy count does not move, */
/* which is the 0089 and 0092 shape, and a reviewer can diff each USING   */
/* against the file quoted above: every byte of the old expression is     */
/* here, and the only additions are the new arm and the parentheses that  */
/* keep AND binding to it. ALTER POLICY ... USING (or WITH CHECK)         */
/* replaces only the expression it names; the command, PERMISSIVE and     */
/* TO authenticated are left as they are, and the post-check pins all     */
/* three.                                                                 */


/* ====================================================================== */
/* 4. THE THREE FUNCTIONS THIS FILE DOES NOT EDIT, AND WHY                */
/* ====================================================================== */
/* clinical_therapist_sees_patient (0045:170-192). It would be the        */
/* one-line change, and it is the wrong one. It also feeds                */
/* clinical_records_insert, _update and _delete (0045:252-316) and the    */
/* guest intake therapist arm (0087_guest_clinical_intake.sql:151-173). A */
/* care-team disjunct in it would hand every assigned therapist UPDATE    */
/* and DELETE on colleagues' registos. The disjunct therefore sits in the */
/* SELECT policy alone, and a care-team-only therapist's UPDATE or DELETE */
/* of a colleague's registo still touches 0 rows. Asserted by             */
/* scripts/db/behaviour-care02a-readonly.sql arm W1.                      */
/*                                                                        */
/* viewer_care_team_patient_ids (0091:150-162). 0092's appointment arm    */
/* calls it and limits the APPOINTMENT row by its own location_id, in     */
/* either patient slot. Putting this file's patient-level basis inside it */
/* would change 0092 as well: a patient whose only booking at the         */
/* therapist's clinic has them as the SECOND participant is not linked on */
/* 0045's basis (section 2), so the therapist would lose that booking,    */
/* which 0092 shows today. It stays as it is, and the new helper reads    */
/* it.                                                                    */
/*                                                                        */
/* clinical_admin_sees_patient (0045:120-159). It is the admin arm of     */
/* clinical_records_select and is correlated (one call per row). The new  */
/* helper computes the same basis once per statement instead, and the     */
/* behaviour check proves the two agree.                                  */


/* ====================================================================== */
/* 5. TWO CONJUNCTS BEYOND THE LETTER OF THE RULING, AND WHY              */
/* ====================================================================== */
/* (a) patient_care_team_select's therapist arm ALSO admits               */
/*     user_id = auth.uid(), and that term is NOT limited by clinic.      */
/*     WITHOUT IT R3 CANNOT WORK. The CARE-02c writer                     */
/*     (apps/web/lib/admin/care-team-auto.ts) inserts with                */
/*     ON CONFLICT (tenant_id, patient_id, user_id) ... DO NOTHING and    */
/*     RETURNING id, patient_id, user_id. EACH of those needs SELECT on   */
/*     the table, and Postgres then checks the NEW row against the SELECT */
/*     policy as well as the INSERT policy. A therapist not yet on the    */
/*     team is not in either care-team helper while their own row is      */
/*     being written (the helpers read the statement's snapshot, which    */
/*     does not hold that row), so the insert would be refused with "new  */
/*     row violates row-level security policy". MEASURED on the v1        */
/*     rehearsal, a therapist booking a patient and writing its own row:  */
/*     refused without this term with the conflict target alone and with  */
/*     the column RETURNING alone; written with it. What it adds to       */
/*     reads: a therapist's own rows, current and removed, at any clinic, */
/*     which is "reading their own list" and names no other person.       */
/* (b) patient_care_team_insert's therapist arm ALSO requires             */
/*     assigned_by = auth.uid(). A booking's row names its booker (the    */
/*     writer sets assigned_by to the acting user), so for a therapist's  */
/*     own booking it IS the caller. Without it a therapist could write a */
/*     row claiming a receptionist assigned them. It narrows only the     */
/*     therapist arm, and only to what the writer already writes. The     */
/*     behaviour check now proves it (arm W8); v1's did not.              */


/* ====================================================================== */
/* 6. THE HELPER'S SHAPE                                                  */
/* ====================================================================== */
/* NULLARY, SO IT IS AN INITPLAN. Taking no argument means `(SELECT f())` */
/* is evaluated once per statement rather than once per row, the reason  */
/* 0073, 0074, 0078 and 0091 are shaped this way; the 4,691 ms per-row    */
/* defect 0078 removed is not reintroduced. Its own work is one pass over */
/* the caller's team (a handful of ids), each probed on                   */
/* appointments_patient_idx and the patients primary key.                 */
/*                                                                        */
/* SECURITY DEFINER, STABLE, search_path pinned to public, owned by       */
/* postgres (0060's rule), EXECUTE for authenticated only: revoked from   */
/* PUBLIC, anon and service_role by name, because Supabase's default      */
/* privileges grant the named roles and REVOKE FROM PUBLIC does not touch */
/* them (0073's note). This is 0091's helper contract, statement for      */
/* statement (0091:150-170). DEFINER is required, not habit: as the       */
/* caller it would read patient_care_team through the very SELECT policy */
/* that calls it.                                                         */
/*                                                                        */
/* EVERY TABLE READ IS TENANT-FILTERED on jwt_tenant_id(), as 0045        */
/* requires of a definer helper, so bypassing RLS inside it cannot cross  */
/* a tenant.                                                              */


/* ====================================================================== */
/* 7. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It changes no policy on attachments, clinical_episodes,              */
/*   appointment_notes, patient_note_revisions or guest_clinical_intakes; */
/*   their narrowing is the N5 wave, not this file. The pre-check and the */
/*   post-check pin those thirteen policies by md5.                       */
/* - It changes no INSERT, UPDATE or DELETE policy of clinical_records    */
/*   or patients, and not patient_care_team_update.                       */
/* - It edits no existing function (section 4), and grants nothing on    */
/*   any existing object. It CREATES exactly one function.               */
/* - It creates and drops no policy: the count is flat on every table.    */
/* - It assigns nobody and backfills nothing.                             */
/* - IDEMPOTENT: CREATE OR REPLACE with the same body keeps the owner and */
/*   the ACL, the owner pin, the revoke and the grant converge, and an    */
/*   ALTER POLICY that sets the same expression twice leaves the          */
/*   catalogue as it was after the first.                                 */


/* ====================================================================== */
/* 8. WHAT MOVES AT PROMOTION, AND ONE MOVE THAT NEEDS SEQUENCING         */
/* ====================================================================== */
/* THE SECURITY DEFINER COUNT GOES 26 -> 27, and it lives in two places   */
/* that read only packages/db/migrations or a database built from         */
/* supabase/migrations, so neither may move before promotion (0095, the   */
/* conflict check's names, states the same rule in its section 6):        */
/*   - packages/db/tests/security-definer-owner.test.ts: EXPECTED_FUNCTIONS */
/*     gains viewer_care_team_patient_ids_at_my_clinics, and its owner-pin */
/*     scan finds the ALTER FUNCTION ... OWNER TO postgres below. An       */
/*     ordinary file; it moves in the promotion PR.                        */
/*   - packages/db/scripts/check-security-definer-owner.mjs: EXPECTED_COUNT */
/*     26 -> 27. THIS FILE IS A FROZEN GATE (.github/gate-manifest.json),  */
/*     so the change is a GATE-CHANGE PR the owner merges by hand, and     */
/*     rule C forbids that PR carrying the migration. CI's DB-gated job    */
/*     runs this checker against the seeded database, so whichever of the */
/*     two lands first reddens that step until the other lands. No held   */
/*     migration since the freeze (2026-09-22) has changed this count;    */
/*     0098 is the first. The order is the owner's call.                  */
/* THE CARE-TEAM TABLE TEST FLIPS BY ITSELF.                              */
/*   packages/db/tests/care-team-appointment-visibility.db.test.ts says   */
/*   "a THERAPIST sees NOTHING in this table, including their own row".   */
/*   That stops being true with this file (R4). The arm asks the schema   */
/*   whether this file is applied and asserts the side the database is    */
/*   on, naming it in its title, so it needs no edit at promotion.        */


/* ====================================================================== */
/* 9. THE STATEMENTS                                                      */
/* ====================================================================== */

/* R0. The clinic-limited care-team set. Section 2 is the basis, clause   */
/* for clause: the first EXISTS is 0045's appointment basis, the OR arm   */
/* is 0045's fallback, both reading the caller's clinics through          */
/* viewer_location_ids().                                                 */
CREATE OR REPLACE FUNCTION public.viewer_care_team_patient_ids_at_my_clinics()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT t.patient_id), '{}'::uuid[])
    FROM unnest(coalesce((SELECT public.viewer_care_team_patient_ids()), '{}'::uuid[])) AS t(patient_id)
   WHERE EXISTS (
           SELECT 1
             FROM public.appointments a
            WHERE a.patient_id  = t.patient_id
              AND a.tenant_id   = (SELECT public.jwt_tenant_id())
              AND a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
         )
      OR (
           NOT EXISTS (
             SELECT 1
               FROM public.appointments a2
              WHERE a2.patient_id  = t.patient_id
                AND a2.tenant_id   = (SELECT public.jwt_tenant_id())
                AND a2.location_id IS NOT NULL
           )
           AND EXISTS (
             SELECT 1
               FROM public.patients p
              WHERE p.id                  = t.patient_id
                AND p.tenant_id           = (SELECT public.jwt_tenant_id())
                AND p.primary_location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
           )
         )
$$;--> statement-breakpoint

ALTER FUNCTION public.viewer_care_team_patient_ids_at_my_clinics() OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_care_team_patient_ids_at_my_clinics() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_care_team_patient_ids_at_my_clinics() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.viewer_care_team_patient_ids_at_my_clinics() IS
  'CARE-02a (0098), owner ruling 2026-09-27 "limit to their clinic only". '
  'The patients the calling user is CURRENTLY on the care team of '
  '(viewer_care_team_patient_ids(), 0091) that are linked to one of the '
  'caller''s clinics (viewer_location_ids()) on 0045''s admin basis: an '
  'appointment of the patient (first slot) at one of those clinics, or, only '
  'when the patient has no appointment with a location, a primary_location_id '
  'among them. Per PATIENT, because clinical_records has no location. '
  'Nullary so it evaluates once per statement.';--> statement-breakpoint

/* R1. 0074's patients_select USING, verbatim, with the therapist arm's   */
/* single term wrapped in parentheses and the clinic-limited care-team    */
/* term added.                                                            */
ALTER POLICY "patients_select" ON public.patients
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
        AND (
          id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
          OR id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )
  );--> statement-breakpoint

/* R2. 0045's clinical_records_select USING, verbatim, with the           */
/* clinic-limited care-team term added to the therapist arm. SELECT ONLY  */
/* (section 4).                                                           */
ALTER POLICY "clinical_records_select" ON public.clinical_records
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
          OR patient_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )
  );--> statement-breakpoint

/* R3. 0091's patient_care_team_insert WITH CHECK, verbatim for owner and */
/* reception, with one therapist arm: their own row (user_id and          */
/* assigned_by are the caller, section 5 (b)) for a patient they have an  */
/* appointment with. viewer_treated_patient_ids() (0074) reads both       */
/* patient slots and both practitioner slots, so a booking in either slot */
/* counts; it reads the statement's snapshot, which includes an           */
/* appointment the same transaction inserted a statement earlier. NOT     */
/* limited by clinic: the booking itself is the link. Unchanged from v1.  */
ALTER POLICY "patient_care_team_insert" ON public.patient_care_team
  WITH CHECK (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (
      (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
      OR (
        (( SELECT public.jwt_role() ) = 'therapist'::text)
        AND (user_id = ( SELECT auth.uid() ))
        AND (assigned_by = ( SELECT auth.uid() ))
        AND (patient_id = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
      )
    )
  );--> statement-breakpoint

/* R4. 0091's patient_care_team_select USING, verbatim for owner and      */
/* reception, with one therapist arm: their own rows (section 5 (a)),    */
/* and the teams they are on at their own clinics.                        */
ALTER POLICY "patient_care_team_select" ON public.patient_care_team
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (
      (( SELECT public.jwt_role() ) = ANY (ARRAY['owner'::text, 'reception'::text]))
      OR (
        (( SELECT public.jwt_role() ) = 'therapist'::text)
        AND (
          (user_id = ( SELECT auth.uid() ))
          OR (patient_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[])))
        )
      )
    )
  );--> statement-breakpoint
