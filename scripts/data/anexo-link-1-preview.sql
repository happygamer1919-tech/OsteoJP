-- ============================================================================
-- ANEXO LINK, STAGE 1 of 3: PREVIEW. READ ONLY. NOTHING IS WRITTEN.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level, ruling (a).
--
-- WHAT THE WHOLE OPERATION DOES. The Fisiozero import uploaded every original
-- file, but the adapter's dedupe rule ("documentos.csv is the richest source, it
-- wins on a filename already seen") DELETED the registo-linked entry and re-added
-- each file with a PATIENT only. So every imported ficha reads "Sem anexos" by
-- construction. Some of those files were named by an episode row against ONE
-- specific registo, and for exactly those the link is deterministic and
-- recoverable. This operation restores it.
--
-- ==========================================================================
-- THE COUNTS ARE MEASURED HERE, NEVER TYPED
-- ==========================================================================
-- The card records 954 / 883 / 220 from September. THOSE ARE HISTORY AND THIS
-- FILE DOES NOT USE THEM. Production has moved (1,181 attachments, all
-- patient-level, read 2026-09-17), and a number copied from a card into a
-- production block is the defect class SR-59 exists for. So stage 1 MEASURES
-- what is there, prints it as THE CARRIES, and stage 2 is given those values and
-- refuses if they have moved between the two commands.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-1-preview.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== 0. SCOPE: the imported clinical_record staging rows that name a file ==='

-- One row per (registo, file name) the delivery named. `FICHEIRO` is
-- MULTI-VALUED: the vendor joins names with a comma in some cells and a
-- semicolon in others, and the adapter splits on both
-- (packages/db/src/migration/sources/fisiozero.ts, splitDeliveryFileNames). A
-- split on one separator alone would silently drop half of a two-file cell.
CREATE TEMP VIEW anexo_named AS
SELECT s.tenant_id,
       s.imported_entity_id                                   AS record_id,
       btrim(part)                                            AS file_name,
       s.tenant_id::text || '/migration/fisiozero/' || btrim(part) AS storage_path
  FROM public.migration_staging_rows s
 CROSS JOIN LATERAL regexp_split_to_table(coalesce(s.raw ->> 'FICHEIRO', ''), '[,;]') AS part
 WHERE s.entity_type = 'clinical_record'
   AND s.status = 'imported'
   AND s.imported_entity_id IS NOT NULL
   AND btrim(part) <> '';

-- The candidate set: a named file that EXISTS as an attachment, is still
-- patient-level, and whose patient matches the registo's patient.
CREATE TEMP VIEW anexo_candidate AS
SELECT n.tenant_id,
       n.record_id,
       a.id           AS attachment_id,
       a.patient_id   AS attachment_patient,
       cr.patient_id  AS record_patient,
       cr.status      AS record_status
  FROM anexo_named n
  JOIN public.attachments a
    ON a.tenant_id = n.tenant_id
   AND a.storage_path = n.storage_path
  JOIN public.clinical_records cr
    ON cr.id = n.record_id
 WHERE a.clinical_record_id IS NULL;

SELECT (SELECT count(*) FROM anexo_named)                       AS named_pairs,
       (SELECT count(DISTINCT tenant_id) FROM anexo_named)      AS tenants,
       (SELECT count(*) FROM anexo_candidate)                   AS candidates;

\echo ''
\echo '=== 1. THE CARRIES. Stage 2 is given these and refuses if they have moved. ==='

-- THE FINGERPRINT IS THE SET, NOT ITS SIZE. Two runs can agree on a count and
-- disagree on WHICH rows: a document uploaded between the two commands would
-- keep the total while changing the membership. md5 over the ordered pairs is
-- what makes "the same 220" a checkable claim rather than an arithmetic one.
SELECT 'anexo_expected_count'   AS carry,
       (SELECT count(*)::text FROM anexo_candidate WHERE record_patient = attachment_patient) AS value
UNION ALL
SELECT 'anexo_expected_digest',
       (SELECT coalesce(md5(string_agg(attachment_id::text || ':' || record_id::text, ','
                                        ORDER BY attachment_id, record_id)), 'EMPTY')
          FROM anexo_candidate WHERE record_patient = attachment_patient)
UNION ALL
SELECT 'attachments_total',            (SELECT count(*)::text FROM public.attachments)
UNION ALL
SELECT 'attachments_patient_level',    (SELECT count(*)::text FROM public.attachments WHERE clinical_record_id IS NULL);

\echo ''
\echo '=== 2. THE FOUR REFUSALS, measured. Every one must read 0 or stage 2 STOPS. ==='

SELECT 'a document named by TWO registos' AS refusal,
       (SELECT count(*) FROM (SELECT attachment_id FROM anexo_candidate
                               GROUP BY attachment_id HAVING count(DISTINCT record_id) > 1) x)::text AS n
UNION ALL
SELECT 'a document whose patient differs from its registo''s',
       (SELECT count(*) FROM anexo_candidate WHERE record_patient IS DISTINCT FROM attachment_patient)::text
UNION ALL
SELECT 'a target registo that is NOT locked',
       (SELECT count(*) FROM anexo_candidate WHERE record_status <> 'locked')::text
UNION ALL
SELECT 'a named file with no attachment row at all (reported, not refused)',
       (SELECT count(*) FROM anexo_named n
         WHERE NOT EXISTS (SELECT 1 FROM public.attachments a
                            WHERE a.tenant_id = n.tenant_id AND a.storage_path = n.storage_path))::text
UNION ALL
SELECT 'a named file ALREADY linked (reported, not refused)',
       (SELECT count(*) FROM anexo_named n
          JOIN public.attachments a ON a.tenant_id = n.tenant_id AND a.storage_path = n.storage_path
         WHERE a.clinical_record_id IS NOT NULL)::text;

\echo ''
\echo '=== 3. WHAT THE CLINIC WOULD SEE: registos touched, and their status ==='

SELECT record_status,
       count(DISTINCT record_id) AS registos,
       count(*)                  AS documents
  FROM anexo_candidate
 WHERE record_patient = attachment_patient
 GROUP BY record_status
 ORDER BY record_status;

\echo ''
\echo '=== 4. HAS STAGE 2 ALREADY RUN? (its own audit row is the only answer) ==='

SELECT count(*)                                AS stage2_audit_rows,
       coalesce(max(created_at)::text, '(none)') AS last_run
  FROM public.audit_log
 WHERE action = 'attachment.anexo_link.backfill';

\echo ''
\echo '=== 5. THE IMMUTABILITY BASELINE. Stage 2 asserts both are unchanged. ==='

-- A link writes `attachments` and MUST NOT touch `clinical_records`. The
-- immutability trigger is BEFORE UPDATE OR DELETE on that table, so if it ever
-- fires, this operation has done something it does not claim to do. These two
-- numbers are how stage 2 proves it did not.
SELECT (SELECT count(*) FROM public.clinical_records)                      AS clinical_records_rows,
       (SELECT coalesce(max(updated_at)::text, '(none)')
          FROM public.clinical_records)                                     AS clinical_records_max_updated;

\echo ''
\echo '=== ANEXO LINK PREVIEW COMPLETE. Nothing was written. ==='
