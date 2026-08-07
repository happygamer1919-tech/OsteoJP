/* ================================================================== */
/* 0058 — per-patient terms acceptance, APPEND-ONLY (LOOP 5, W13-05). */
/*                                                                    */
/* WHAT THIS IS FOR. JP ruled that the fee line may only ever be shown */
/*   to a patient who has accepted the terms, and confirmed that no    */
/*   existing signed document contains the fee rule. So this table is  */
/*   the SOLE LEGAL PATH to that line ever shipping. The gate is       */
/*   per-patient acceptance AND the global flag, never the flag alone: */
/*   a global flag on its own would announce a fee to patients who     */
/*   never accepted it, which is exactly what counsel warned about.    */
/*                                                                    */
/* WHY A TABLE AND NOT COLUMNS ON `patients` (owner ruling, option B). */
/*   Three columns would have been the smaller migration and would     */
/*   have matched the per-patient scalars `patients` already carries   */
/*   (activated_at, the contraindication booleans, reminder_*_enabled).*/
/*   They were refused because re-accepting a NEW terms_version would  */
/*   OVERWRITE the old row, and a legal basis that overwrites its own  */
/*   history cannot answer "what did this patient agree to in March"   */
/*   once the terms change — the one question that matters in a        */
/*   dispute. That is also not recoverable later: by the time anyone   */
/*   needs the answer, the overwritten values are gone. Append-only    */
/*   costs one table now and is the only shape that can be migrated    */
/*   FROM rather than TO.                                              */
/*                                                                    */
/* WHY IT IS NOT PART OF THE `_consent` BLOCK, and this is the trap    */
/*   the recon named before a line was written. The ficha's two        */
/*   consent items (treatment, rgpd) live MIGRATION-FREE inside        */
/*   clinical_records.data jsonb under the reserved `_consent` key.    */
/*   Adding a third key there would COMPILE, RENDER CORRECTLY, and be  */
/*   WRONG: `_consent` is per CLINICAL RECORD and this is per PATIENT. */
/*   An acceptance would exist on one record and not on the patient,   */
/*   the fee gate would answer the wrong question, and no existing     */
/*   test would fail — every consent test asserts the per-record       */
/*   behaviour that is correct for the other two. CONSENT_ITEM_KEYS    */
/*   therefore stays at two, and a negative test asserts `_consent`    */
/*   never carries a terms key.                                        */
/*                                                                    */
/* APPEND-ONLY IS ENFORCED BY THE DATABASE, not by convention. There   */
/*   is no UPDATE policy and no DELETE policy, and the table-level     */
/*   REVOKE below removes the grants outright, so the absence of a     */
/*   policy is not the only thing standing in the way. A legal record  */
/*   that application code could rewrite is not a legal record. The    */
/*   same reasoning migration 0054 applied to the token audit log.     */
/*                                                                    */
/* NO CLINICAL CONTENT AND NO PII. Identifiers, an instant, and a      */
/*   version string. `terms_version` is the document identity, never   */
/*   its text: the accepted wording lives in the versioned document,   */
/*   and copying it here would make every row a stale duplicate of it. */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS "patient_terms_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  /* No ON DELETE CASCADE, deliberately, and it is the opposite choice
     from staff_notifications.recipient_user_id. A notification is a
     message TO someone and dies with them; this is a record THAT
     someone accepted, and it must outlive a patient-row cleanup for
     exactly the dispute it exists to answer. */
  "patient_id" uuid NOT NULL REFERENCES "patients"("id"),
  /* When the patient accepted. Supplied by the caller rather than
     defaulted, so a paper acceptance recorded later carries the date it
     actually happened and not the date it was typed in. */
  "accepted_at" timestamp with time zone NOT NULL,
  /* Identity of the terms document accepted. Free text on purpose: the
     versioning scheme belongs to the document, not to this schema. */
  "terms_version" text NOT NULL,
  /* The staff member who captured it. Not null: an acceptance with no
     recorded actor cannot be attested to by anyone. */
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_terms_acceptances_version_not_blank"
    CHECK (btrim("terms_version") <> '')
);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* Indexes.                                                            */
/*                                                                    */
/* THE GATE QUERY is "has THIS patient accepted THIS version", and the */
/*   history query is "everything this patient ever accepted, newest   */
/*   first". One index over (tenant, patient, accepted_at DESC) serves  */
/*   both: the gate is a LIMIT 1 over its leading columns.             */
/*                                                                    */
/* NO UNIQUE INDEX, and its absence is a decision rather than an       */
/*   omission. A patient re-accepting the SAME version — re-signing on */
/*   a later visit, or a correction — is a real event and a second row */
/*   is the truthful record of it. Deduplicating here would silently   */
/*   discard the evidence this table exists to keep.                   */
/* ------------------------------------------------------------------ */

CREATE INDEX IF NOT EXISTS "patient_terms_acceptances_patient_idx"
  ON "patient_terms_acceptances" ("tenant_id", "patient_id", "accepted_at" DESC);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* RLS.                                                                */
/*                                                                    */
/* SELECT is tenant-scoped. Every staff role that can open a ficha can */
/*   see whether that patient accepted; there is no per-user narrowing */
/*   because "did this patient accept" is not private between staff.   */
/*                                                                    */
/* INSERT is tenant-scoped AND pins recorded_by to the acting user.    */
/*   The actor is the one field a caller could lie about, and it is    */
/*   the field the record's whole evidential value rests on, so the    */
/*   database sets the rule rather than trusting the server action.    */
/*                                                                    */
/* THERE IS NO UPDATE POLICY AND NO DELETE POLICY. Not an oversight —  */
/*   see the header. The REVOKE below means a future policy added by   */
/*   mistake still cannot write, because the table grant is gone too.  */
/* ------------------------------------------------------------------ */

ALTER TABLE public.patient_terms_acceptances ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* Table gates. RLS is the ROW gate, GRANT is the TABLE gate, and both  */
/* are required (0003_grants.sql).                                     */
/*                                                                    */
/* THIS TABLE DOES NOT INHERIT 0003's BLANKET GRANT. `GRANT ... ON ALL */
/*   TABLES IN SCHEMA public` applied to the tables that existed when   */
/*   it ran, never to tables created afterwards. The first draft of     */
/*   this migration had the REVOKE below and NO GRANT, so `authenticated`*/
/*   held no privilege at all and every statement was refused - which   */
/*   made the two append-only assertions pass FOR THE WRONG REASON.     */
/*   The positive control in the isolation suite is what caught it.     */
/*                                                                    */
/* SELECT AND INSERT ONLY, matching 0054's two append-only tables. The  */
/*   REVOKE is not undoing a present grant; it exists to survive a      */
/*   FUTURE blanket grant, so append-only stays true even if someone    */
/*   later re-runs a GRANT ALL across the schema.                       */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING. A patient never reads or writes this  */
/*   record: acceptance is captured by staff in the ficha, and the      */
/*   patient's own copy is the signed document, not this row.           */
/* ------------------------------------------------------------------ */

GRANT SELECT, INSERT ON public.patient_terms_acceptances TO authenticated;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.patient_terms_acceptances FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.patient_terms_acceptances FROM patient;--> statement-breakpoint

CREATE POLICY "patient_terms_acceptances_tenant_select" ON public.patient_terms_acceptances
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());
--> statement-breakpoint

CREATE POLICY "patient_terms_acceptances_tenant_insert" ON public.patient_terms_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND recorded_by = auth.uid()
  );
