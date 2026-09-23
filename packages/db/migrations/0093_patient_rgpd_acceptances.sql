/* ================================================================== */
/* NEXT-AFTER-0089 — per-patient RGPD consent, APPEND-ONLY. RGPD-01.   */
/*                                                                    */
/* PARKED, NOT NUMBERED. 0089 is applied on production but its file is */
/* still on the PR #1338 branch, and two other branches already hold a */
/* NEXT-AFTER-0089 of their own. A number taken here would be a number */
/* taken twice. Promote by rename + journal entry + supabase mirror    */
/* (see the README beside this file); the body below is final.         */
/*                                                                    */
/* ================================================================== */
/* THE RULING THIS IMPLEMENTS (owner, Q-RGPD-NEW = b)                  */
/* ================================================================== */
/* The RGPD consent is ASKED AT PATIENT CREATION and is NOT REQUIRED.  */
/* A patient created without it is registered normally and carries a   */
/* visible "RGPD em falta" mark until the consent is recorded. Nothing */
/* is blocked by its absence: reception must be able to register       */
/* somebody at the desk with a form still unsigned in their hand.      */
/*                                                                    */
/* ================================================================== */
/* WHY A TABLE AND NOT TWO COLUMNS ON `patients`                       */
/* ================================================================== */
/* THIS IS NOT A FRESH DECISION. 0058 put per-patient TERMS acceptance */
/* in its own table on an explicit owner ruling, and its header states */
/* the reason in full: re-accepting under a NEW version would OVERWRITE */
/* the old row, and a legal basis that overwrites its own history       */
/* cannot answer "what did this patient agree to in March" once the     */
/* document changes. RGPD consent has exactly that property — it is     */
/* versioned, it can be withdrawn, and it can be re-granted — so the    */
/* same ruling applies and the same shape is used.                      */
/*                                                                    */
/* IT IS DELIBERATELY NOT `patient_terms_acceptances`. That table has   */
/* no document-kind column, and `getLatestTermsAcceptance` feeds the    */
/* per-patient gate on the 50% no-show fee line (W13-05), which JP      */
/* confirmed is the SOLE legal path to that line ever rendering.        */
/* Writing RGPD rows into it would silently answer the fee gate's       */
/* question with a different document's consent. Two legal documents,   */
/* two tables.                                                          */
/*                                                                    */
/* IT IS ALSO NOT A THIRD KEY IN `_consent`. That block is per CLINICAL */
/* RECORD and lives in clinical_records.data; a patient created today   */
/* has no record at all, so it cannot carry a fact about the patient.   */
/* consent-terms-axis.test.ts pins CONSENT_ITEM_KEYS at two for exactly */
/* this reason, and that pin is not relaxed here.                       */
/*                                                                    */
/* ================================================================== */
/* WHAT IT DOES NOT DO                                                 */
/* ================================================================== */
/* No column on `patients`. No change to any existing table, policy,   */
/* function or grant. No data is written or backfilled: every existing */
/* patient simply has no row here, which is what makes them read       */
/* "RGPD em falta" without a single row being touched. ADDITIVE.       */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS "patient_rgpd_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  /* No ON DELETE CASCADE, matching 0058: this records THAT someone
     consented, and it must outlive a patient-row cleanup for exactly
     the dispute it exists to answer. */
  "patient_id" uuid NOT NULL REFERENCES "patients"("id"),
  /* When the patient consented. Supplied by the caller rather than
     defaulted, so a paper form signed last week and typed in today
     carries the date it was signed. */
  "accepted_at" timestamp with time zone NOT NULL,
  /* Identity of the RGPD text consented to, never the text itself.
     Unlike 0058's `2026-08`, this label has real text from day one:
     `clinical.consent.rgpd.body` in packages/i18n is the ratified
     wording, which is why the first label is a versioned identity
     rather than a placeholder. When the wording changes, ADD a label;
     never repoint an existing one, or every old row silently becomes a
     claim about text the patient never saw. */
  "rgpd_version" text NOT NULL,
  /* The staff member who captured it. Not null: a consent with no
     attestable actor is worth nothing in a dispute. */
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_rgpd_acceptances_version_not_blank"
    CHECK (btrim("rgpd_version") <> '')
);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* Index. The read this table exists for is "does THIS patient have a  */
/* consent on file", a LIMIT 1 over the leading columns; the history   */
/* read is the same columns newest-first. One index serves both.       */
/*                                                                    */
/* NO UNIQUE INDEX, deliberately and for 0058's reason: a patient      */
/* signing again under a new version, or re-signing a correction, is a */
/* real event and the second row is the truthful record of it.         */
/* ------------------------------------------------------------------ */

CREATE INDEX IF NOT EXISTS "patient_rgpd_acceptances_patient_idx"
  ON "patient_rgpd_acceptances" ("tenant_id", "patient_id", "accepted_at" DESC);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* RLS. Tenant-scoped SELECT: every staff role that can open a ficha   */
/* may see whether that patient has consented; "has this patient       */
/* signed" is not private between staff.                              */
/*                                                                    */
/* INSERT pins `recorded_by` to the acting user. It is the one field a */
/* caller could lie about and the field the row's evidential value     */
/* rests on, so the database decides it rather than the server action. */
/*                                                                    */
/* NO UPDATE POLICY AND NO DELETE POLICY, and that is the point of the */
/* shape. The REVOKE below means a policy added later by mistake still */
/* cannot write, because the table grant is gone as well.              */
/* ------------------------------------------------------------------ */

ALTER TABLE public.patient_rgpd_acceptances ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* Table gates. RLS is the ROW gate, GRANT is the TABLE gate, and both */
/* are required (0003_grants.sql).                                    */
/*                                                                    */
/* THIS TABLE DOES NOT INHERIT 0003's BLANKET GRANT: `GRANT ... ON ALL */
/* TABLES IN SCHEMA public` applied to the tables that existed when it */
/* ran. The GRANT below is therefore load-bearing, not decoration —    */
/* 0058 shipped a first draft with the REVOKE and no GRANT, and its    */
/* append-only assertions passed FOR THE WRONG REASON because every    */
/* statement was refused.                                              */
/*                                                                    */
/* THE REVOKE IS ALSO LOAD-BEARING TODAY. Supabase applies schema-wide */
/* DEFAULT PRIVILEGES, so `authenticated` picks up UPDATE, DELETE and  */
/* TRUNCATE on this table at CREATE time without any statement here    */
/* granting them. Delete the REVOKE and the table stops being          */
/* append-only while still looking append-only.                        */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING. Consent is captured by staff from a  */
/* signed form; the patient's own copy is that form, not this row.     */
/* ------------------------------------------------------------------ */

GRANT SELECT, INSERT ON public.patient_rgpd_acceptances TO authenticated;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.patient_rgpd_acceptances FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.patient_rgpd_acceptances FROM patient;--> statement-breakpoint

CREATE POLICY "patient_rgpd_acceptances_tenant_select" ON public.patient_rgpd_acceptances
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());
--> statement-breakpoint

CREATE POLICY "patient_rgpd_acceptances_tenant_insert" ON public.patient_rgpd_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND recorded_by = auth.uid()
  );
