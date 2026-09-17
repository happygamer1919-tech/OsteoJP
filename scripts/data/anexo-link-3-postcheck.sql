-- ============================================================================
-- ANEXO LINK, POST-CHECK. READ ONLY. Every verdict must read OK.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level. Run after
-- stage 2, by stage 2 of docs/data-op-anexo-link.md.
--
-- THE CARRIES ARE NOT TYPED, THEY ARE READ BACK. Stage 2 wrote its own
-- before-counts, its digest and every linked id into its audit row, so this file
-- recomputes them and compares them with what the write itself recorded. No
-- number passes through a human hand, so no number can be transcribed wrongly -
-- which is the whole of SR-59 and the reason the card's September figures
-- (954 / 883 / 220) appear nowhere in any of these three files.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-3-postcheck.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== ANEXO LINK POST-CHECK - every verdict must read OK ==='

WITH a AS (
  SELECT al.metadata AS m
    FROM public.audit_log al
   WHERE al.action = 'attachment.anexo_link.backfill'
   ORDER BY al.created_at DESC
   LIMIT 1
), linked AS (
  SELECT (jsonb_array_elements_text(a.m -> 'linked_attachment_ids'))::uuid AS id FROM a
), recs AS (
  SELECT (jsonb_array_elements_text(a.m -> 'linked_record_ids'))::uuid AS id FROM a
), f AS (
  SELECT
    (SELECT count(*)::int FROM a)                                        AS stage2_rows,
    (SELECT count(*)::int FROM public.audit_log
      WHERE action = 'attachment.anexo_link.backfill')                   AS audit_rows,
    (SELECT (m ->> 'linked_count')::int FROM a)                          AS linked_count,
    (SELECT  m ->> 'digest' FROM a)                                      AS stored_digest,
    (SELECT (m ->> 'registos_touched')::int FROM a)                      AS registos_touched,
    (SELECT (m ->> 'attachments_total_before')::int FROM a)              AS total_before,
    (SELECT (m ->> 'attachments_unlinked_before')::int FROM a)           AS unlinked_before,
    (SELECT (m ->> 'attachments_with_patient_before')::int FROM a)       AS with_patient_before,
    (SELECT (m ->> 'clinical_records_rows_before')::int FROM a)          AS cr_rows_before,
    (SELECT count(*)::int FROM linked)                                   AS linked_ids,
    (SELECT count(*)::int FROM recs)                                     AS record_ids,
    -- Recomputed from the database as it stands now.
    (SELECT count(*)::int FROM linked l JOIN public.attachments at ON at.id = l.id
      WHERE at.clinical_record_id IS NOT NULL)                           AS now_linked,
    (SELECT count(*)::int FROM linked l JOIN public.attachments at ON at.id = l.id
      WHERE at.clinical_record_id IN (SELECT id FROM recs))              AS point_at_recorded,
    (SELECT coalesce(md5(string_agg(at.id::text || ':' || at.clinical_record_id::text, ','
                                     ORDER BY at.id, at.clinical_record_id)), 'EMPTY')
       FROM linked l JOIN public.attachments at ON at.id = l.id)         AS now_digest,
    (SELECT count(*)::int FROM public.attachments)                       AS total_now,
    (SELECT count(*)::int FROM public.attachments WHERE clinical_record_id IS NULL) AS unlinked_now,
    (SELECT count(*)::int FROM public.attachments WHERE patient_id IS NOT NULL)     AS with_patient_now,
    (SELECT count(*)::int FROM public.clinical_records)                  AS cr_rows_now,
    -- Every linked document must still belong to its registo's patient.
    (SELECT count(*)::int FROM linked l
       JOIN public.attachments at ON at.id = l.id
       JOIN public.clinical_records cr ON cr.id = at.clinical_record_id
      WHERE at.patient_id IS DISTINCT FROM cr.patient_id)                AS patient_mismatch,
    -- ...and every target registo must still be locked.
    (SELECT count(*)::int FROM recs r JOIN public.clinical_records cr ON cr.id = r.id
      WHERE cr.status <> 'locked')                                       AS unlocked_targets,
    -- No document may be linked to more than one registo (it cannot be, but the
    -- claim is cheap and the shape is what a future writer would break).
    (SELECT count(*)::int FROM (
        SELECT at.id FROM linked l JOIN public.attachments at ON at.id = l.id
         GROUP BY at.id HAVING count(DISTINCT at.clinical_record_id) > 1) x) AS doubled
)
SELECT '1. the stage 2 audit row is present'                       AS check, stage2_rows::text AS observed, '1' AS expected,
       CASE WHEN stage2_rows = 1 THEN 'OK' ELSE 'FAIL' END AS verdict FROM f
UNION ALL SELECT '2. exactly ONE audit row (a re-run would add a second)', audit_rows::text, '1',
       CASE WHEN audit_rows = 1 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '3. linked_attachment_ids matches linked_count', linked_ids::text, coalesce(linked_count::text, '(no audit row)'),
       CASE WHEN linked_ids = linked_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '4. every recorded document now carries a registo', now_linked::text, coalesce(linked_count::text, '(no audit row)'),
       CASE WHEN now_linked = linked_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '5. each points at a registo stage 2 recorded', point_at_recorded::text, coalesce(linked_count::text, '(no audit row)'),
       CASE WHEN point_at_recorded = linked_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '6. the digest recomputes to what stage 2 stored', coalesce(now_digest, '(none)'), coalesce(stored_digest, '(no audit row)'),
       CASE WHEN now_digest IS NOT DISTINCT FROM stored_digest THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '7. distinct registos touched', record_ids::text, coalesce(registos_touched::text, '(no audit row)'),
       CASE WHEN record_ids = registos_touched THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '8. no attachment row was created or deleted', total_now::text, coalesce(total_before::text, '(no audit row)'),
       CASE WHEN total_now = total_before THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '9. unlinked documents fell by exactly the linked count', unlinked_now::text, coalesce((unlinked_before - linked_count)::text, '(no audit row)'),
       CASE WHEN unlinked_now = unlinked_before - linked_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '10. PATIENT-LEVEL COUNT UNCHANGED (a link never clears patient_id)', with_patient_now::text, coalesce(with_patient_before::text, '(no audit row)'),
       CASE WHEN with_patient_now = with_patient_before THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '11. no clinical_records row was written', cr_rows_now::text, coalesce(cr_rows_before::text, '(no audit row)'),
       CASE WHEN cr_rows_now = cr_rows_before THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '12. every linked document belongs to its registo''s patient', patient_mismatch::text, '0',
       CASE WHEN patient_mismatch = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '13. every target registo is still locked', unlocked_targets::text, '0',
       CASE WHEN unlocked_targets = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '14. no document is linked to two registos', doubled::text, '0',
       CASE WHEN doubled = 0 THEN 'OK' ELSE 'FAIL' END FROM f;

\echo ''
\echo '=== FOR THE RECORD: what the imported documents look like now ==='

SELECT count(*)                                                        AS attachments_total,
       count(*) FILTER (WHERE patient_id IS NOT NULL)                  AS with_a_patient,
       count(*) FILTER (WHERE clinical_record_id IS NOT NULL)          AS linked_to_a_registo,
       count(*) FILTER (WHERE clinical_record_id IS NULL)              AS still_unlinked
  FROM public.attachments;
