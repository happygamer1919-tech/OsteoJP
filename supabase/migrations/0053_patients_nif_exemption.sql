-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0053_patients_nif_exemption.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0053 — patients.nif_exempt + nif_exempt_reason (PL-31)              */
/*                                                                    */
/* Owner CR 2026-08-03: "when creating ficha clinica, the NIF field    */
/* must be as mandatory to fill in, cannot move forward without it".   */
/*                                                                    */
/* WHY A MIGRATION AT ALL, when the ask sounds like a form change.     */
/* Making NIF mandatory is app-layer. What needs storage is the        */
/* EXCEPTION. A foreign patient has no Portuguese NIF, so a hard block */
/* with no way through means reception cannot register them at all -   */
/* and the real-world result of that is not compliance, it is an       */
/* invented number typed into a required field with nothing recording  */
/* that it was invented. These two columns are what turn "we skipped   */
/* the NIF" from an indistinguishable empty box into an auditable,     */
/* deliberate act with a written reason attached.                      */
/*                                                                    */
/* SHAPE.                                                             */
/*   nif_exempt         boolean NOT NULL DEFAULT false                 */
/*   nif_exempt_reason  text (NULL unless exempt)                      */
/* The exemption is a FLAG plus a REASON, never a sentinel value in    */
/* the nif column itself. Writing "ESTRANGEIRO" or 999999990 into nif  */
/* would have avoided this migration and destroyed the column's        */
/* meaning: every later reader (fatura, declaracao, export) would have */
/* to know the magic strings, and one that did not would print them.   */
/*                                                                    */
/* THE CHECK. exempt implies a reason. An exemption with no stated     */
/* reason is exactly the unaudited hole the flag exists to close, so   */
/* the database refuses it rather than trusting every future writer.   */
/* The converse is deliberately NOT constrained: nif_exempt_reason is  */
/* only meaningful when exempt, and the app clears it when the flag is */
/* cleared, but a stale reason on a non-exempt row is harmless data,   */
/* not a lie, and constraining it would reject an ordinary un-ticking. */
/*                                                                    */
/* SAFE ON EXISTING ROWS (this is why it is written this way). Every   */
/* existing patient lands nif_exempt = false, so the CHECK passes      */
/* trivially for all of them - it is satisfied by the DEFAULT, not by  */
/* a backfill. Nothing is rewritten, no table is rescanned for a       */
/* violation, and no existing patient becomes invalid. In particular   */
/* this migration does NOT make nif NOT NULL: patients created before  */
/* today legitimately have no NIF, and a NOT NULL here would have      */
/* failed the ALTER outright. Presence is enforced at CREATE time in   */
/* the application, where "this is a new ficha" is knowable; the       */
/* database cannot tell a new ficha from a legacy one.                 */
/*                                                                    */
/* patients keeps its tenant_id + RLS unchanged (column-only add on an  */
/* existing table). No behaviour changes until the app sends the flag. */
/* ================================================================== */

ALTER TABLE "patients"
  ADD COLUMN "nif_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "patients"
  ADD COLUMN "nif_exempt_reason" text;--> statement-breakpoint

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_nif_exempt_requires_reason"
  CHECK ("nif_exempt" IS FALSE OR "nif_exempt_reason" IS NOT NULL);
