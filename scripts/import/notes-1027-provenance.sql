-- ===========================================================================
-- WHERE THE 1027 NOTES CAME FROM. READ ONLY. Owner-run, production.
-- ===========================================================================
-- The owner's 2026-09-08 read established the SHAPE: patients.notes non-empty on
-- 1027 rows, patient_note_revisions EMPTY, appointment_notes patient-level = 1.
-- This answers the two questions that decide what recovery should do with them.
--
--   1. Are they all import-sourced? The code says they must be - the Fisiozero
--      importer is the ONLY writer of patients.notes in the repo - but "the only
--      writer I can find" and "the only writer" are different claims and the
--      ledger can settle it directly.
--   2. How many are ONLY the "Outros contactos: ..." line? The adapter appends
--      that for a patient's SECOND AND LATER telephone numbers. It is contact
--      data, not a clinical observation, and copying it into a notes surface is a
--      different decision from recovering a receptionist's note.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/import/notes-1027-provenance.sql
--
-- ===========================================================================
-- IT PRINTS NO NOTE AND NO PATIENT. Standing rule 7, and it binds harder here
-- than anywhere else in this repo: a note body is CLINICAL data. Every column
-- below is a count or a length. There is no `notes`, no substring of one, and no
-- id that resolves to a person. The `like` predicates test a SHAPE and return a
-- boolean; they never project the value they test.
-- ===========================================================================
\pset pager off
\pset format aligned
\pset title 'THE 1027 NOTES - provenance, read only'

WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
noted AS (
  SELECT p.id, p.created_at, p.notes
    FROM public.patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
     AND p.notes IS NOT NULL AND btrim(p.notes) <> ''
),
-- The importer's ledger. A patient row whose id is an imported_entity_id came
-- from the delivery; anything else was made by the application.
imported AS (
  SELECT m.imported_entity_id AS pid
    FROM public.migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
     AND m.entity_type = 'patient'
     AND m.status = 'imported'
     AND m.imported_entity_id IS NOT NULL
)

SELECT '1. patients with a non-empty note'                    AS question,
       (SELECT count(*)::text FROM noted)                     AS answer
UNION ALL
SELECT '2. ...of which the LEDGER says were imported',
       (SELECT count(*)::text FROM noted n JOIN imported i ON i.pid = n.id)
UNION ALL
-- A NON-ZERO HERE FALSIFIES THE CODE READING. It would mean something other than
-- the importer writes patients.notes, and that writer would have to be found
-- before any recovery runs.
SELECT '3. ...of which the ledger does NOT (should be 0)',
       (SELECT count(*)::text FROM noted n
         WHERE NOT EXISTS (SELECT 1 FROM imported i WHERE i.pid = n.id))
UNION ALL
-- The adapter builds `Outros contactos: <e164>, <e164>` and appends it to
-- observacoes. A note that STARTS with that prefix and contains no newline is
-- contact data only.
SELECT '4. notes that are ONLY the "Outros contactos" line',
       (SELECT count(*)::text FROM noted
         WHERE notes LIKE 'Outros contactos:%' AND position(E'\n' IN notes) = 0)
UNION ALL
SELECT '5. notes that CONTAIN it but carry other text too',
       (SELECT count(*)::text FROM noted
         WHERE notes LIKE '%Outros contactos:%'
           AND NOT (notes LIKE 'Outros contactos:%' AND position(E'\n' IN notes) = 0))
UNION ALL
SELECT '6. notes with no "Outros contactos" line at all (the real observations)',
       (SELECT count(*)::text FROM noted WHERE notes NOT LIKE '%Outros contactos:%')
UNION ALL
-- SIZE, so recovery knows what it is moving. Lengths only.
SELECT '7. note length: min / median / max',
       (SELECT coalesce(min(length(notes))::text,'-') || ' / ' ||
               coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY length(notes))::text,'-') || ' / ' ||
               coalesce(max(length(notes))::text,'-') FROM noted)
UNION ALL
-- created_at IS THE PROPOSED created_at FOR THE RECOVERED NOTE, so its range is
-- worth seeing before it is used. A floor at the import date would mean the
-- source registration dates did NOT survive and now() is being used already.
SELECT '8. patients.created_at range on those rows',
       (SELECT coalesce(to_char(min(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD'),'-') || ' .. ' ||
               coalesce(to_char(max(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD'),'-') FROM noted)
UNION ALL
-- THE IDEMPOTENCE KEY, CHECKED BEFORE IT IS RELIED ON. The merge de-dupes on
-- (content + created_at); if any pair repeats, a NOT EXISTS on that key would
-- suppress a legitimate second note.
SELECT '9. duplicate (content, created_at) pairs (recovery key collisions)',
       (SELECT count(*)::text FROM (
          SELECT notes, created_at FROM noted GROUP BY notes, created_at HAVING count(*) > 1
        ) d)
UNION ALL
SELECT '10. patient_note_revisions rows (expected 0)',
       (SELECT count(*)::text FROM public.patient_note_revisions r, tenant t
         WHERE r.tenant_id = t.tenant_id)
UNION ALL
SELECT '11. appointment_notes PATIENT-LEVEL rows (appointment_id IS NULL)',
       (SELECT count(*)::text FROM public.appointment_notes a, tenant t
         WHERE a.tenant_id = t.tenant_id AND a.appointment_id IS NULL);
