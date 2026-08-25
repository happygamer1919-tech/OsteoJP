-- ===========================================================================
-- PREFLIGHT: PATIENT NUMBER OVERLAP. Run BEFORE import day.
-- ===========================================================================
--
-- WHO RUNS THIS: Ivan, in the Supabase SQL editor, against production.
-- No terminal may run it (CLAUDE.md standing rule 1), which is why it is a
-- committed .sql file and not a script that opens a connection.
--
-- READ ONLY. One SELECT. No INSERT, UPDATE, DELETE, no temp table, no function,
-- no transaction that could be left open. It touches `patients` for four
-- aggregate numbers and reads no patient's name, phone, NIF, email or any
-- clinical value - so its output is safe to paste back in full.
--
-- ---------------------------------------------------------------------------
-- WHY IT EXISTS
-- ---------------------------------------------------------------------------
-- `patients.patient_number` is per-tenant unique
-- (constraint `patients_tenant_number_uq`, migration 0029). The Fisiozero
-- import PRESERVES the vendor's `numero_paciente` verbatim - owner ruling
-- 2026-08-24, vendor numbers are authoritative.
--
-- The trigger side of that is already safe and needs nothing:
-- `public.assign_patient_number` computes MAX(patient_number)+1 per tenant LIVE
-- on every insert, so importing a patient numbered 9,999 moves the next
-- assigned number to 10,000 by itself. There is no counter to seed. That is
-- proven in packages/db/tests/patient-number-collision.db.test.ts.
--
-- WHAT IS *NOT* SAFE, AND IS THE ONLY REASON FOR THIS QUERY: the clinic's
-- EXISTING patients already hold numbers. If any vendor number collides with
-- one of those, the constraint REJECTS that row at insert. No migration fixes
-- it - those rows own those numbers today - so it has to be decided BEFORE the
-- run, not discovered during it.
--
-- ---------------------------------------------------------------------------
-- HOW TO READ THE RESULT
-- ---------------------------------------------------------------------------
-- Take `max_patient_number` from the row for the tenant being imported into,
-- and compare it with the vendor's `numero_paciente` RANGE, which the delivery
-- probe reports (scripts/import/probe-amostra.mjs prints per-column distinct
-- counts; the range itself comes from the delivery).
--
--   vendor MIN > max_patient_number   -> NO OVERLAP. Import proceeds.
--   vendor MIN <= max_patient_number  -> OVERLAP IS POSSIBLE. Decide before the
--                                        run. The options are a merge decision
--                                        for the owner: renumber the vendor
--                                        rows, renumber the existing few, or
--                                        let the colliding rows route to
--                                        to_review and be placed by hand.
--
-- `existing_patients = 0` means the tenant is empty and no overlap is possible
-- at all - the ordinary case for a fresh clinic tenant.
--
-- A NON-EMPTY TENANT IS NOT AUTOMATICALLY A PROBLEM. It is only a problem where
-- the two ranges intersect. Read both numbers before concluding anything.
-- ===========================================================================

SELECT
  t.id                                   AS tenant_id,
  t.slug                                 AS tenant_slug,
  count(p.id)                            AS existing_patients,
  min(p.patient_number)                  AS min_patient_number,
  max(p.patient_number)                  AS max_patient_number,
  -- A gap between the count and the span means the numbering is already sparse
  -- (merged or deleted patients), which is normal and is NOT itself a defect.
  -- It is here so a surprising span is visible rather than inferred.
  (max(p.patient_number) - min(p.patient_number) + 1) AS number_span
FROM public.tenants t
LEFT JOIN public.patients p
       ON p.tenant_id = t.id
      AND p.deleted_at IS NULL
GROUP BY t.id, t.slug
ORDER BY t.slug;
