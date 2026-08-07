/* ================================================================== */
/* 0060 — pin the owner of every SECURITY DEFINER function.            */
/*                                                                    */
/* THIS IS A NO-OP TODAY, AND THAT IS THE POINT. A read of pg_proc on  */
/*   production on 2026-08-07 returned all THIRTEEN public SECURITY    */
/*   DEFINER functions already owned by `postgres`. Every statement    */
/*   below therefore changes nothing when applied.                     */
/*                                                                    */
/*   Its value is that ownership stops being an ACCIDENT OF WHO RAN    */
/*   MIGRATE and becomes a REPO FACT. Before this file, the owner was  */
/*   whatever principal happened to hold the connection in the apply   */
/*   worktree's env file. Nothing declared it, nothing checked it, and */
/*   nothing would have noticed it changing.                           */
/*                                                                    */
/* WHY OWNERSHIP IS LOAD-BEARING RATHER THAN COSMETIC. Postgres runs a */
/*   SECURITY DEFINER function with its OWNER's privileges, and RLS on */
/*   all 37 policy-bearing tables is ENABLE and NOT FORCE — confirmed  */
/*   against production the same day: relrowsecurity true,             */
/*   relforcerowsecurity FALSE, on every one. So the owner BYPASSES    */
/*   RLS BY OWNERSHIP, and that bypass is the mechanism three          */
/*   behaviours depend on:                                             */
/*     jwt_tenant_id() / jwt_patient_id() answer for the `patient`     */
/*       role, which has no grant on the auth schema;                  */
/*     appointment_conflicts() reports a conflict a caller cannot      */
/*       otherwise see past location RLS — a conflict must block even  */
/*       when the row is invisible to you;                             */
/*     is_unconfirmed_pedido() answers for the `patient` role, which   */
/*       has NO GRANT AT ALL on staff_notifications.                   */
/*                                                                    */
/* THE FAILURE THIS PREVENTS IS SILENT. Change the applying principal  */
/*   and every function created AFTERWARDS inherits a different owner  */
/*   while the earlier ones keep the old one — the set splits in two   */
/*   with no error anywhere. drizzle-kit succeeds; the function        */
/*   checkers report EXISTS with a live body, both true; check-journal */
/*   reconciles; and CI passes, because `supabase db reset` builds a   */
/*   database where ONE principal creates everything, so CI            */
/*   STRUCTURALLY CANNOT REPRODUCE THE SPLIT. The production symptom   */
/*   is a WRONG ANSWER rather than an error: fewer rows, or false      */
/*   where true is correct. For appointment_conflicts a wrong answer   */
/*   is a DOUBLE BOOKING.                                             */
/*                                                                    */
/* THIRTEEN STATEMENTS, ONE PER FUNCTION, WRITTEN OUT. No loop, no     */
/*   DO block, no dynamic SQL, deliberately:                           */
/*     a loop over pg_proc would pin whatever it FINDS, so a function  */
/*       already wrongly owned would be "pinned" to its wrong owner    */
/*       and the migration would report success;                       */
/*     the explicit list is a DECLARATION of what should exist, which  */
/*       is what makes the checker's count assertion meaningful;       */
/*     a fourteenth function added later does NOT appear here, and     */
/*       check-security-definer-owner.mjs fails on the count — which   */
/*       is the intended way to notice it.                            */
/*                                                                    */
/* THE LIST WAS RECONCILED AGAINST PRODUCTION, NOT DERIVED BY GREP.    */
/*   An earlier grep reported TWELVE. It missed appointment_conflicts  */
/*   because it read six lines of context above each SECURITY DEFINER  */
/*   marker, and that function's six-parameter list plus its RETURNS   */
/*   TABLE block put the CREATE line EIGHTEEN lines above. A migration */
/*   built on the twelve-item list would have left the single most     */
/*   important function unpinned while reporting success — the same    */
/*   failure class as the backwards journal timestamp and the          */
/*   superseded supabase mirror.                                       */
/*                                                                    */
/* SIGNATURES ARE FULLY QUALIFIED because ALTER FUNCTION requires them */
/*   to disambiguate overloads. They are taken from the CREATE         */
/*   statements in 0002, 0005, 0010, 0012, 0045, 0047, 0048, 0052 and  */
/*   0059, not from memory — and that check CAUGHT A REAL ERROR before  */
/*   the apply: merge_patients takes THREE uuid parameters             */
/*   (p_source_id, p_target_id, p_actor_id DEFAULT NULL), not two. A   */
/*   two-argument signature would have failed the migration mid-run    */
/*   with "function does not exist". A DEFAULT does not change a       */
/*   function's identity, so the argument list is all three types.     */
/*                                                                    */
/* SAFETY. ALTER FUNCTION ... OWNER TO changes no body, no signature,  */
/*   no grant and no volatility. It reads and writes no table row.     */
/*   Nothing is locked beyond the catalog entry. Re-runnable: setting  */
/*   an owner to the owner it already has is accepted and is a no-op.  */
/*   Reversible by re-issuing the same statements with the previous    */
/*   owner, which is recorded above as `postgres`.                     */
/* ================================================================== */

ALTER FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.assign_patient_number() OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.clinical_admin_sees_patient(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.clinical_therapist_sees_patient(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.is_unconfirmed_pedido(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.jwt_patient_id() OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.jwt_tenant_id() OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.location_in_viewer_scope(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.merge_patients(uuid, uuid, uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.patient_appt_at_viewer_location(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.patient_appt_treated_by_viewer(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION public.viewer_has_location_assignment() OWNER TO postgres;
