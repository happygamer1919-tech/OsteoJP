-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0065_guest_requests_acl.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ------------------------------------------------------------------ */
/* 0065 - NORMALISE THE guest_booking_requests TABLE ACL.              */
/*                                                                    */
/* NO SCHEMA CHANGE. No column, no index, no policy, no data. This     */
/* migration only makes the committed schema say what production has   */
/* said since the day the table was created, and narrows it to what    */
/* the application actually uses.                                      */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHY IT EXISTS, AND WHY IT IS NOT AN INCIDENT (INC-11).             */
/*                                                                    */
/* 0063 created this table and granted NOTHING. Every other table      */
/* created after 0003's blanket grant carries its own explicit GRANT   */
/* (0055, 0056, 0058); this one was the single exception, and CI       */
/* proved it on 2026-08-17 - a DB-gated test failed with 42501,        */
/* permission denied, because a database built from these files gives  */
/* `authenticated` nothing on this table and every staff read runs as  */
/* that role (packages/db/src/client.ts:121, `set local role           */
/* authenticated`).                                                    */
/*                                                                    */
/* PRODUCTION WAS NEVER BROKEN, and the reason is the finding. A       */
/* read-only check the owner ran against production on 2026-08-17      */
/* reported `authenticated` holding SELECT, UPDATE, DELETE, INSERT,    */
/* REFERENCES, TRIGGER and TRUNCATE - seven privileges, none of them   */
/* granted by any migration. They came from the hosting platform's     */
/* DEFAULT PRIVILEGES, applied at CREATE TABLE.                        */
/*                                                                    */
/* So the two ends disagreed in BOTH directions at once: the committed */
/* schema granted too little to work, and production granted more than */
/* anyone had chosen. This file closes the gap from both sides.        */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHAT authenticated ACTUALLY NEEDS, verified by code read before     */
/* this file was written rather than inferred from the feature.        */
/*                                                                    */
/*   SELECT   reception's queue reads the table                        */
/*            (apps/web/lib/scheduling/guest-requests.ts, two SELECTs, */
/*            both inside runScoped -> role authenticated)             */
/*   UPDATE   the convert marks a request handled                      */
/*            (GUEST-06: one `tx.update(guestBookingRequests)` setting */
/*            status and converted_patient_id, also inside runScoped)  */
/*                                                                    */
/* AND WHAT IT MUST NOT HAVE:                                          */
/*                                                                    */
/*   INSERT   the public form writes under the SERVICE ROLE by 0063's  */
/*            deliberate design. apps/api/app/api/v1/booking/guest/    */
/*            route.ts uses the base client and never calls            */
/*            withTenantContext - checked, zero occurrences. The whole */
/*            point of this table is that exactly ONE write path       */
/*            reaches it from an unauthenticated request; granting     */
/*            authenticated an INSERT would create a second.           */
/*   DELETE   a guest request is the record that somebody asked for an */
/*            appointment. Declining is a STATUS, not a deletion -     */
/*            0063 made the same argument when it wrote no DELETE      */
/*            policy. Nothing in the application deletes one.          */
/*   TRUNCATE never, for the same reason, at table scale.              */
/*   REFERENCES no foreign key points at this table (checked: nothing  */
/*            in schema.ts references guestBookingRequests), so the    */
/*            privilege grants a capability nobody asked for.          */
/*   TRIGGER  nothing in the application creates triggers at runtime.  */
/*                                                                    */
/* THE ONE DELETE IN THE REPOSITORY IS A TEST TEARDOWN                 */
/* (packages/db/tests/guest-phone-parity.db.test.ts) and it runs on    */
/* the privileged connection with NO role switch - `connect()` in      */
/* rls-harness.ts returns a raw client and that suite never enters the */
/* role helper. Revoking DELETE from `authenticated` does not touch    */
/* it. Verified before authoring, because "no path uses it" is the     */
/* claim this whole migration rests on.                                */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* RLS REMAINS THE ROW GATE AND IS UNCHANGED.                          */
/*                                                                    */
/* Not one policy is touched here. RLS is enabled on this table and    */
/* 0063's policies decide which rows a caller may see; a privilege     */
/* with no policy behind it still grants no row. This file is the      */
/* TABLE gate, the second of the two locks 0055 section 3 describes.   */
/* That is also why none of this was ever an exposure: production's    */
/* extra privileges were bounded by policies the whole time.           */
/*                                                                    */
/* THE REVOKES ARE WRITTEN EVEN WHERE THE PRIVILEGE MAY BE ABSENT.     */
/* REVOKE on a privilege that was never granted is a no-op and does    */
/* not error, and in a database built fresh from these files that is   */
/* exactly what happens. They are here for the database where the      */
/* platform's defaults DID apply - production - and to survive a       */
/* future blanket grant, which is the same reason 0055 gives.          */
/* ------------------------------------------------------------------ */

GRANT SELECT, UPDATE ON public.guest_booking_requests TO authenticated;--> statement-breakpoint
REVOKE INSERT, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.guest_booking_requests FROM authenticated;--> statement-breakpoint

/* The patient role gets nothing, for the reason 0055 states about     */
/* staff_notifications: a guest request carries another person's phone */
/* number and stated preference. The patient role is login-less and    */
/* dedicated (0010) and matches no policy here, so this is the second  */
/* independent reason for the same denial - the refusal happens at the */
/* table gate, before RLS is consulted.                                */
REVOKE ALL ON public.guest_booking_requests FROM patient;--> statement-breakpoint
