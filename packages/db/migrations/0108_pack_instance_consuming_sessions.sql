/* ====================================================================== */
/* THE CONSUMING SESSIONS OF ONE PACK INSTANCE, FOR A CALLER WHO MAY      */
/* ALREADY SEE THE PACK'S PATIENT.                                        */
/*                                                                        */
/* Ruled by strategy (S-1008-B, 2026-10-08, and S-1012-A, 2026-10-12):    */
/* the pack read function, first in the queue after 0107, numbered at     */
/* authoring. Tier C. Authored and HELD: this lane never applies it;      */
/* GREEN applies it.                                                      */
/*                                                                        */
/* WRITTEN AT ITS NUMBER. 0107 is applied (2026-10-25, journal 104 to     */
/* 105) and merged (#1651), nothing else is in flight, so this file was   */
/* written in packages/db/migrations as 0108 with its journal entry and   */
/* its mirror in the same commit, as 0103 was. No pending file preceded   */
/* it.                                                                    */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* One new function:                                                      */
/*                                                                        */
/*   public.pack_instance_consuming_sessions(p_pack_instance_id uuid)     */
/*     RETURNS TABLE (appointment_id uuid, starts_at timestamptz)         */
/*                                                                        */
/* For ONE pack instance (patient_pack_instances.id) it returns the       */
/* instance's consuming sessions: every appointment linked to it          */
/* (appointments.pack_instance_id) whose status is not 'cancelled',       */
/* ordered by starts_at, then id. Two columns and nothing else: no        */
/* patient, no practitioner, no clinic, no status, no service.            */
/*                                                                        */
/* "Consuming" is the definition the balance already uses:                */
/* PACK_CONSUMING_STATUS_SQL in packages/db/src/pack-balance.ts,          */
/* `status <> 'cancelled'`, so scheduled, confirmed, completed and        */
/* no_show consume and a status added to the enum later consumes too. The */
/* count of the rows returned is the linked term of                       */
/*   available = sessions_total - legacy_consumed - linked                */
/* and their order is the order "Sessao N de M" numbers them in, after    */
/* legacy_consumed (board card UI-pack-sessions-per-visit). The two       */
/* counters themselves are columns of patient_pack_instances, which every */
/* member of staff of the tenant already reads                            */
/* (patient_pack_instances_tenant_isolation), so the function does not    */
/* return them.                                                           */
/*                                                                        */
/* WHO GETS ROWS. A caller gets the rows only when ALL of these hold, and */
/* an empty set otherwise:                                                */
/*                                                                        */
/*   C1  the instance is in the tenant of the JWT;                        */
/*   C2  the caller's JWT role is a staff role: owner, admin, reception   */
/*       or therapist. A patient's JWT carries no staff role;             */
/*   C3  the caller may already see the instance's patient: the row of    */
/*       public.patients that patients_select (as 0096 left it) admits    */
/*       to them. C3 is that policy's USING, term for term, applied to    */
/*       the instance's patient, calling the same helpers:                */
/*         - the caller created the patient (created_by = auth.uid()),    */
/*           or                                                           */
/*         - the caller is the owner, or                                  */
/*         - admin or reception, and either no clinic assignment          */
/*           (viewer_has_location_assignment(), 0047) or the patient is   */
/*           among the patients their clinics reach                       */
/*           (viewer_visible_patient_ids(), 0073), or                     */
/*         - a therapist, and the patient is one they treat               */
/*           (viewer_treated_patient_ids(), 0074) or one on whose care    */
/*           team they are at one of their own clinics                    */
/*           (viewer_care_team_patient_ids_at_my_clinics(), 0096).        */
/*                                                                        */
/* When the three hold, the caller gets EVERY consuming session of the    */
/* instance, whichever clinic or practitioner each visit has. That is     */
/* what the function is for: the number and the balance of a pack are a  */
/* property of the pack, and a caller who may see the patient reads them  */
/* whole. They read two columns of each visit and nothing more; the       */
/* appointment rows themselves stay under appointments_rls, unchanged.    */
/*                                                                        */
/* AN EMPTY SET, NEVER AN ERROR, for every refusal, as 0090's             */
/* shared_resource_appointment_patient_names() and the viewer helpers     */
/* answer: an unknown id, an instance of another tenant, a caller with no */
/* staff role and a caller who may not see the patient all read the      */
/* same. The function cannot be used to learn whether an id exists. A    */
/* caller tells "no sessions yet" from "not yours" by reading the         */
/* instance row, which they already may.                                  */


/* ====================================================================== */
/* 2. WHY SECURITY DEFINER, AND WHAT IT RUNS AS                           */
/* ====================================================================== */
/* It reads appointments past appointments_rls: that is the point of it.  */
/* It runs as its owner, postgres (0060's rule; the owner pin is below),  */
/* which reads every table here past its policies (row level security is  */
/* ENABLE and not FORCE on all of them). So C1 to C3 are the whole of     */
/* what decides who gets rows, and each is stated explicitly in the body: */
/* the tenant, the role and the patient. No policy is relied on.          */
/*                                                                        */
/* SET search_path = public, so no object a caller creates elsewhere can  */
/* stand in for one it names; every object is also named with its         */
/* schema.                                                                */
/*                                                                        */
/* STABLE, and it writes nothing: a STABLE plpgsql function cannot run an */
/* INSERT, UPDATE or DELETE (Postgres refuses it at run time).            */
/*                                                                        */
/* PLPGSQL, NOT SQL, AND NOT FOR STYLE (0102's reason): a SQL-language    */
/* body is planned when the function is created, which takes ACCESS      */
/* SHARE on the tables it reads at this statement and holds it until the  */
/* COMMIT. A plpgsql body is checked for syntax only and planned at its   */
/* first call, so this file takes no lock on any table. Every column in   */
/* the query is written with its table's alias, and #variable_conflict    */
/* use_column says so, so none can be read as one of the two output       */
/* columns.                                                               */
/*                                                                        */
/* Each nullary helper is wrapped, `(SELECT f())`, so it is evaluated     */
/* once per call, as patients_select evaluates it once per statement.     */


/* ====================================================================== */
/* 3. WHO MAY CALL IT                                                     */
/* ====================================================================== */
/* EXECUTE is granted to `authenticated` alone. It is revoked from        */
/* PUBLIC and, by name, from anon, patient and service_role: Supabase's   */
/* default privileges grant EXECUTE on a new function in public to anon,  */
/* authenticated and service_role by name, and a REVOKE FROM PUBLIC does  */
/* not touch a privilege a named role holds (0072, 0079).                 */
/* packages/db/tests/security-definer-execute-acl.db.test.ts requires     */
/* exactly that of every SECURITY DEFINER function in public: service_role */
/* and anon execute none, authenticated executes this one, and the        */
/* patient role keeps only the four the portal runs on.                   */


/* ====================================================================== */
/* 4. THE HELPERS: EVERY TERM IS A FUNCTION THAT EXISTS                   */
/* ====================================================================== */
/*   public.jwt_tenant_id()          0001, SECURITY DEFINER since 0012    */
/*   public.jwt_role()               0001                                 */
/*   auth.uid()                      the platform's                       */
/*   public.viewer_has_location_assignment()               0047           */
/*   public.viewer_visible_patient_ids()                   0073           */
/*   public.viewer_treated_patient_ids()                   0074           */
/*   public.viewer_care_team_patient_ids_at_my_clinics()   0096           */
/*                                                                        */
/* Each reads the claims of the calling session (request.jwt.claims),    */
/* which a SECURITY DEFINER call does not change, so each answers for the */
/* caller exactly as it does inside patients_select. None is replaced     */
/* here.                                                                  */


/* ====================================================================== */
/* 5. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It touches no table: no column, row, constraint, index, trigger,     */
/*   policy or grant on any table.                                        */
/* - It replaces and drops no function, and changes the ACL of no other   */
/*   one.                                                                 */
/* - It changes no application code. The balance, the booking path, the   */
/*   pack link guard and the per-visit number will read it in their own   */
/*   pull requests, after the apply.                                      */


/* ====================================================================== */
/* 6. THE SECURITY DEFINER COUNT: 36 TO 37                                */
/* ====================================================================== */
/* One new SECURITY DEFINER function in public, with its own              */
/* ALTER FUNCTION ... OWNER TO postgres below. EXPECTED_COUNT in          */
/* packages/db/scripts/check-security-definer-owner.mjs moves 36 to 37 in */
/* its own GATE-CHANGE, after the apply (a frozen gate cannot ride with a */
/* migration). Until it does, the count reads red on this branch, by      */
/* construction: the 0096, 0097 and 0102 order.                           */


/* ====================================================================== */
/* 7. THE STATEMENTS                                                      */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

/* The function: C1 to C3 of section 1, then the consuming sessions in    */
/* their order. C3 is patients_select's USING (0096), term for term, on   */
/* the instance's patient p.                                              */
CREATE FUNCTION public.pack_instance_consuming_sessions(p_pack_instance_id uuid)
  RETURNS TABLE (appointment_id uuid, starts_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT a.id, a.starts_at
    FROM public.patient_pack_instances i
    JOIN public.patients p
      ON p.id = i.patient_id
     AND p.tenant_id = i.tenant_id
    JOIN public.appointments a
      ON a.pack_instance_id = i.id
     AND a.tenant_id = i.tenant_id
   WHERE i.id = p_pack_instance_id
     AND i.tenant_id = (SELECT public.jwt_tenant_id())
     AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception', 'therapist')
     AND a.status <> 'cancelled'
     AND (
           p.created_by = (SELECT auth.uid())
        OR (SELECT public.jwt_role()) = 'owner'
        OR (
             (SELECT public.jwt_role()) IN ('admin', 'reception')
             AND (
                   NOT (SELECT public.viewer_has_location_assignment())
                OR p.id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
             )
           )
        OR (
             (SELECT public.jwt_role()) = 'therapist'
             AND (
                   p.id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
                OR p.id = ANY (coalesce((SELECT public.viewer_care_team_patient_ids_at_my_clinics()), '{}'::uuid[]))
             )
           )
     )
   ORDER BY a.starts_at, a.id;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.pack_instance_consuming_sessions(uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pack_instance_consuming_sessions(uuid) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pack_instance_consuming_sessions(uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.pack_instance_consuming_sessions(uuid) IS
  'The consuming sessions of one pack instance: the id and starts_at of every '
  'appointment linked to it (appointments.pack_instance_id) whose status is not '
  'cancelled, ordered by starts_at then id. Rows only for a caller with a staff '
  'role, in the instance''s tenant, who may already see the instance''s patient '
  '(the terms of patients_select, as 0096 left it); an empty set for anyone '
  'else. Two columns and nothing more. Migration 0108.';--> statement-breakpoint
