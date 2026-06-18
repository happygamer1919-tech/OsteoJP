/* ================================================================== */
/* 0015 — phone_digits generated column + search indexes on patients  */
/*                                                                    */
/* Problem: phone search called regexp_replace() per-row at query     */
/* time, causing a full sequential scan even inside a single tenant.  */
/*                                                                    */
/* Fix:                                                               */
/*   1. generated column  phone_digits  stores the digit-only form    */
/*      of phone at write time; search simply does a LIKE comparison. */
/*   2. pg_trgm + GIN index on full_name speeds up the ILIKE %…%     */
/*      pattern used by name search (previously relied on seq scan    */
/*      within the (tenant_id, full_name) btree).                     */
/* ================================================================== */

CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS phone_digits text
    GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS patients_phone_digits_idx
  ON patients (phone_digits);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS patients_full_name_trgm_idx
  ON patients USING gin (full_name gin_trgm_ops);
