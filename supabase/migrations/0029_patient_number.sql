-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0029_patient_number.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0029 — patients.patient_number (per-tenant sequential patient ID)   */
/*                                                                    */
/* JP ruling (DECISIONS 2026-07-02): a plain, UNPADDED integer, unique */
/* WITHIN a tenant (the same number may recur across tenants), zero-    */
/* padded to a 4-digit minimum AT DISPLAY ONLY. Migrated Fisiozero      */
/* patients keep their original number (future import passes it         */
/* explicitly); new patients get MAX+1 per tenant.                      */
/*                                                                    */
/* Shape: add nullable → backfill 1..N per tenant ordered by            */
/* (created_at, id) → SET NOT NULL → UNIQUE (tenant_id, patient_number).*/
/* Soft-deleted rows (deleted_at not null) are still numbered — they    */
/* remain patients of record.                                           */
/*                                                                    */
/* Assignment (owner ruling 2026-07-02, supersedes loop 0029 Field 6    */
/* single-column / Field 2 app-layer-only): a BEFORE INSERT trigger      */
/* fills patient_number = MAX+1 per tenant ONLY when the inserted value  */
/* IS NULL, serialized per tenant by a transaction-scoped advisory lock  */
/* (race-safe under concurrent inserts). An explicit value passes        */
/* through untouched (preserves future Fisiozero originals). This is the */
/* safety net for the ~15 insert paths (import, seeds, tests) that do    */
/* not set it; createPatient still sets it explicitly app-side.          */
/*                                                                    */
/* The UNIQUE (tenant_id, patient_number) index also serves the          */
/* MAX(patient_number) WHERE tenant_id = ? lookup, so no extra index.    */
/* No new table; patient_number inherits patients' existing RLS + GRANTs.*/
/* ================================================================== */

ALTER TABLE "patients" ADD COLUMN "patient_number" integer;--> statement-breakpoint

UPDATE "patients" p
SET "patient_number" = s.rn
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM "patients"
) s
WHERE p.id = s.id;--> statement-breakpoint

ALTER TABLE "patients" ALTER COLUMN "patient_number" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_tenant_number_uq" UNIQUE ("tenant_id", "patient_number");--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.assign_patient_number()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.patient_number IS NULL THEN
    -- Serialize concurrent inserts for the same tenant so MAX+1 is race-safe.
    -- Transaction-scoped: released on COMMIT/ROLLBACK. Two-key form scopes the
    -- lock to (this trigger, tenant) and avoids collision with other advisory
    -- locks. Explicit values skip this path entirely (keep original numbers).
    PERFORM pg_advisory_xact_lock(hashtext('patients_patient_number'),
                                  hashtext(NEW.tenant_id::text));
    NEW.patient_number :=
      COALESCE((SELECT MAX(patient_number)
                  FROM public.patients
                 WHERE tenant_id = NEW.tenant_id), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER patients_assign_patient_number
  BEFORE INSERT ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_patient_number();
