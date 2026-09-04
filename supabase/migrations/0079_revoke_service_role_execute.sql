-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0079_revoke_service_role_execute.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0079 - the twenty SECURITY DEFINER functions stop being executable */
/*        by service_role. And by anon, which is how it had to be     */
/*        done.                                                        */
/* ================================================================== */
/* MEASURED ON PRODUCTION, 2026-09-04, by the owner running           */
/* scripts/read-security-definer-acls.sql and pasting the output back: */
/* TWENTY rows, every one 'service_role HAS execute'. That was every   */
/* public SECURITY DEFINER function production had at the time.        */
/*                                                                    */
/* WHY IT IS MEDIUM AND NOT HIGH, said first so nobody reads this as   */
/* an incident: service_role bypasses RLS outright, so EXECUTE grants  */
/* it no capability it lacks. This is defence-in-depth erosion, not    */
/* live exposure. It matters because the crossing is meant to be       */
/* DELIBERATE AND NARROW, and twenty functions nobody chose to grant   */
/* is neither.                                                        */
/*                                                                    */
/* ================================================================== */
/* THIS MIGRATION'S FIRST DRAFT DID NOT WORK, AND THE REASON IS THE    */
/* EXACT MIRROR OF THE ONE THE CARD IS BUILT ON.                       */
/* ================================================================== */
/* The card, and 0075's header, both state the rule that produced this */
/* defect:                                                            */
/*                                                                    */
/*     REVOKE ... FROM PUBLIC does not remove a privilege a NAMED      */
/*     role holds in its own right.                                   */
/*                                                                    */
/* True. So the first draft of this file revoked service_role BY NAME  */
/* on all twenty, and a catalogue read looking for a `service_role=`   */
/* aclitem reported all twenty clean. IT WAS WRONG ON ELEVEN OF THEM,  */
/* because the converse is equally true and nobody had written it      */
/* down:                                                              */
/*                                                                    */
/*     REVOKE ... FROM A NAMED ROLE does not remove a privilege        */
/*     PUBLIC holds - and every role is a member of PUBLIC.            */
/*                                                                    */
/* Eleven of the twenty carry `=X/postgres` in `proacl`. An EMPTY      */
/* grantee before the `=` is PUBLIC. So after the named revoke,        */
/* `has_function_privilege('service_role', oid, 'EXECUTE')` was STILL  */
/* TRUE on all eleven, and the migration would have shipped with a     */
/* board card claiming a capability had been removed that had not.     */
/*                                                                    */
/* THE VERIFICATION IS WHAT CAUGHT IT, AND ONLY BECAUSE IT CHANGED     */
/* SHAPE. A check that greps `proacl` for a grantee NAME cannot see a  */
/* grant made to everybody - it is looking for the thing by the value  */
/* that is absent. scripts/0079-postcheck.sql therefore asserts        */
/* `has_function_privilege(role, oid, 'EXECUTE')`, which answers the   */
/* question actually being asked: CAN this role execute this function. */
/* scripts/read-security-definer-acls.sql has the same blind spot and  */
/* is left alone deliberately - it is the file the owner already ran   */
/* against production, and its output is the evidence on the card.     */
/*                                                                    */
/* ================================================================== */
/* WHY anon IS IN THE STATEMENTS, WHEN THE CARD ONLY NAMED service_role*/
/* ================================================================== */
/* Because there is no way to remove service_role's EXECUTE without    */
/* revoking PUBLIC, and revoking PUBLIC removes anon's too. That is    */
/* not collateral damage; it is the larger half of the same defect.    */
/* Twelve of these functions were executable by `anon`, the role a     */
/* logged-OUT visitor gets - including merge_patients, which re-points */
/* one patient's entire record onto another.                          */
/*                                                                    */
/* IT IS SAFE, AND THAT WAS MEASURED RATHER THAN ARGUED:              */
/*   - anon holds ZERO table grants in `public` and appears in ZERO    */
/*     policies, so no policy is ever evaluated for it and none of     */
/*     these helpers is ever reached through one.                      */
/*   - there are no runtime `.rpc()` calls anywhere in the codebase,   */
/*     so nothing calls them directly as anon either.                  */
/*                                                                    */
/* anon IS REVOKED BY NAME AS WELL AS VIA PUBLIC, for the reason this  */
/* whole file exists: it holds twelve of these in its own right, and   */
/* revoking PUBLIC alone would leave every one of them.                */
/*                                                                    */
/* ================================================================== */
/* WHAT KEEPS ITS ACCESS, AND WHY REVOKING PUBLIC DOES NOT STRIP IT   */
/* ================================================================== */
/* `authenticated` holds an EXPLICIT grant on all eleven of the        */
/* PUBLIC-carrying functions - checked in the catalogue, not assumed - */
/* so it is unaffected. `patient` holds explicit grants on the three   */
/* the portal needs (jwt_tenant_id, jwt_patient_id,                    */
/* is_unconfirmed_pedido) and no patient-role policy references any of */
/* the other eight. supabase_auth_admin keeps custom_access_token_hook */
/* by the grant 0002 made it by name.                                  */
/*                                                                    */
/* ================================================================== */
/* EVERY GRANT IS RE-ASSERTED, AND CI IS WHY.                          */
/* ================================================================== */
/* The first version of this file issued NO grants, on the reasoning   */
/* that every role which should keep EXECUTE already held it in its    */
/* own right. THAT IS TRUE ON A DATABASE WHERE SUPABASE'S ALTER        */
/* DEFAULT PRIVILEGES FIRED, AND FALSE ON ONE WHERE IT DID NOT.        */
/*                                                                    */
/* CI caught it in 2m39s: `permission denied for function              */
/* jwt_tenant_id`, from followup-rls.test.ts running as                */
/* `authenticated`. On the lane, `authenticated=X/postgres` sits in    */
/* jwt_tenant_id's proacl and the revoke below leaves it alone. On CI  */
/* that aclitem does not exist - NO MIGRATION EVER GRANTED             */
/* jwt_tenant_id TO authenticated; it is granted to `patient` only,    */
/* and staff reached it through PUBLIC. Revoking PUBLIC therefore took */
/* the claims helper away from every staff policy in the system.       */
/*                                                                    */
/* THE LESSON IS THE SAME ONE THIS FILE ALREADY TEACHES, APPLIED TO    */
/* THE OTHER HALF OF THE STATEMENT. Reasoning about a REVOKE from a    */
/* catalogue read is environment-dependent in BOTH directions: in what */
/* it takes away, and in what it leaves behind. So this migration no   */
/* longer reasons about what is there. IT STATES ITS OWN END STATE:    */
/* revoke the three untrusted grantees, then GRANT to exactly the      */
/* roles the design intends, so the database looks the same afterwards */
/* on CI, on a lane and on production regardless of what it looked     */
/* like before. That is the shape 0075 already uses.                   */
/*                                                                    */
/* NO ROLE GAINS A CAPABILITY. Every GRANT below names a role that     */
/* could already execute that function everywhere - explicitly where   */
/* its own migration said so, and through PUBLIC where it did not.     */
/*                                                                    */
/* assign_patient_number GETS NO GRANT AT ALL, and that is deliberate: */
/* no migration ever granted it to anybody, because a TRIGGER function */
/* needs no EXECUTE at fire time. Giving it one here to be tidy would  */
/* be inventing a privilege nobody asked for.                          */
/*                                                                    */
/* ================================================================== */
/* NOTHING CALLS THESE AS service_role. VERIFIED, NOT ASSUMED.        */
/* ================================================================== */
/*   1. THE APPLICATION'S DRIZZLE HANDLE IS NOT service_role.          */
/*      getDbAdmin() connects as the OWNING role (supabase_admin /     */
/*      postgres, which has BYPASSRLS); withTenantContext drops to     */
/*      `authenticated` and withPatientContext to `patient`.           */
/*   2. THERE ARE NO RUNTIME `.rpc()` CALLS AT ALL. The service-role   */
/*      key is used only through createSupabaseAdminClient, and only   */
/*      for Storage objects and auth admin.                            */
/*   3. THE FOUR CONFIRM-CODE DOORS ARE ALREADY PROVEN. 0074 grants    */
/*      them to `authenticated` ALONE, and CI - where the default      */
/*      privilege was never applied - has been running the whole       */
/*      confirm flow green with service_role holding nothing. CI is    */
/*      the post-revoke world and it has been passing for weeks.       */
/*   4. custom_access_token_hook IS INVOKED BY supabase_auth_admin,    */
/*      which 0002 grants by name. GoTrue never calls it as            */
/*      service_role.                                                  */
/*   5. assign_patient_number IS A TRIGGER FUNCTION. PostgreSQL checks */
/*      EXECUTE when the TRIGGER IS CREATED, not when it fires.        */
/*      PROVEN, not reasoned: an INSERT run as service_role after the  */
/*      revoke still returned an assigned patient_number.              */
/*   6. THE RLS HELPERS ARE NEVER REACHED BY service_role. It has      */
/*      BYPASSRLS, so the policies that call them are not evaluated    */
/*      for it. Revoking cannot break a call that does not happen.     */
/*                                                                    */
/* ================================================================== */
/* EXHAUSTIVE, AND UNIFORM ON PURPOSE                                  */
/* ================================================================== */
/* Every function gets the same three grantees revoked whether or not  */
/* this database happens to have granted them. A REVOKE of a privilege */
/* not held is a no-op, and the alternative - a per-function list      */
/* tuned to one database's catalogue - is exactly the migration that   */
/* works on the lane and does nothing on CI. The card records that     */
/* Supabase's ALTER DEFAULT PRIVILEGES fires on some databases and not */
/* others; a uniform statement is correct on both.                     */
/*                                                                    */
/* reminder_dispatch_tenant IS ABSENT ON PURPOSE. 0075 already revokes */
/* PUBLIC, anon, patient and service_role from it by name - it is the  */
/* one function in the set that does.                                  */

/* --- 0002: the token hook that shapes every JWT this platform issues */
REVOKE ALL ON FUNCTION public.custom_access_token_hook(event jsonb) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(event jsonb) TO supabase_auth_admin;--> statement-breakpoint

/* --- claims helpers. `patient` and `authenticated` keep their own grants. */
REVOKE ALL ON FUNCTION public.jwt_tenant_id() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated, patient;--> statement-breakpoint
/* jwt_patient_id is revoked from `authenticated` too. It is a PORTAL     */
/* helper: the ONLY policies that call it are the patient self-scope      */
/* ones, every one of them TO patient, and a policy scoped to `patient`   */
/* is never evaluated for an `authenticated` session. It was granted to   */
/* `patient` alone by its own migration; staff held it only through the   */
/* CREATE-time default, which is exactly the inherited grant this file    */
/* exists to stop relying on.                                             */
REVOKE ALL ON FUNCTION public.jwt_patient_id() FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.jwt_patient_id() TO patient;--> statement-breakpoint

/* --- 0072 + 0074: the four confirm-code doors, one per verb */
REVOKE ALL ON FUNCTION public.resolve_confirm_code(p_code_hash text) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_confirm_code(p_code_hash text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_confirm_code(p_code_hash text, p_tenant_id uuid, p_appointment_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_confirm_code(p_code_hash text, p_tenant_id uuid, p_appointment_id uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.withdraw_confirm_code(p_code_hash text, p_tenant_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.withdraw_confirm_code(p_code_hash text, p_tenant_id uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_confirm_code(p_code_hash text, p_tenant_id uuid, p_now timestamp with time zone) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_confirm_code(p_code_hash text, p_tenant_id uuid, p_now timestamp with time zone) TO authenticated;--> statement-breakpoint

/* --- location and viewer scope helpers, called from inside policies */
REVOKE ALL ON FUNCTION public.location_in_viewer_scope(p_location_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.location_in_viewer_scope(p_location_id uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_has_location_assignment() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_has_location_assignment() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_location_ids() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_location_ids() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_treated_patient_ids() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_treated_patient_ids() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_visible_patient_ids() FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_visible_patient_ids() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.patient_appt_at_viewer_location(p_patient_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_appt_at_viewer_location(p_patient_id uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.patient_appt_treated_by_viewer(p_patient_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_appt_treated_by_viewer(p_patient_id uuid) TO authenticated;--> statement-breakpoint

/* --- clinical visibility helpers */
REVOKE ALL ON FUNCTION public.clinical_admin_sees_patient(p_patient_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.clinical_admin_sees_patient(p_patient_id uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.clinical_therapist_sees_patient(p_patient_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.clinical_therapist_sees_patient(p_patient_id uuid) TO authenticated;--> statement-breakpoint

/* --- scheduling */
REVOKE ALL ON FUNCTION public.appointment_conflicts(p_practitioner uuid, p_location uuid, p_room text, p_starts timestamp with time zone, p_ends timestamp with time zone, p_exclude uuid[]) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.appointment_conflicts(p_practitioner uuid, p_location uuid, p_room text, p_starts timestamp with time zone, p_ends timestamp with time zone, p_exclude uuid[]) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_unconfirmed_pedido(p_appointment uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_unconfirmed_pedido(p_appointment uuid) TO authenticated, patient;--> statement-breakpoint

/* --- patient record maintenance. merge_patients was anon-executable. */
/* assign_patient_number is revoked from EVERY application role, not     */
/* only the untrusted three, because it is the one function in the set  */
/* that NO migration ever granted to anybody. Leaving `authenticated`    */
/* alone here would leave the end state environment-dependent all over   */
/* again: on a lane the default privilege put it there, on CI nothing    */
/* did. A TRIGGER function needs no EXECUTE at fire time - proven with   */
/* an INSERT as `authenticated` and as `service_role`, both of which     */
/* still returned an assigned patient_number with the grant gone.        */
REVOKE ALL ON FUNCTION public.assign_patient_number() FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.merge_patients(p_source_id uuid, p_target_id uuid, p_actor_id uuid) FROM PUBLIC, anon, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.merge_patients(p_source_id uuid, p_target_id uuid, p_actor_id uuid) TO authenticated;
