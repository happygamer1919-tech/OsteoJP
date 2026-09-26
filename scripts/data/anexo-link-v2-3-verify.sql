-- ============================================================================
-- ANEXO LINK V2, STAGE 3 of 3: THE VERIFY. READ ONLY. Verdicts OK / VACUOUS / FAIL.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level. Run after
-- stage 2, by stage 3 of docs/data-op-anexo-link-v2.md, and re-issuable at any
-- time: it writes nothing.
--
-- NO NUMBER IS TYPED. Stage 2 wrote every linked pair, every registo, every id
-- it left alone and every md5 into its one audit row; this file reads them back
-- and recomputes each against the database. A VACUOUS verdict means the arm ran
-- over an empty set and could not have failed; the stage 3 block in the doc
-- allows VACUOUS only on 10 and 11, whose subject a real day may lack (no named
-- document left alone, no episode on a target registo). Every other verdict
-- compares the link set itself, which stage 2 refuses to write empty (R09), and
-- FAILs on an empty comparand rather than reading VACUOUS.
--
-- Verdict 4 carries its own control: the digest over every recorded pair less
-- one must DIFFER from the stored digest, so a digest that cannot see a pair go
-- FAILs. Verdict 9 finds the rows the op could have written without the audit
-- row's list: every imported original that carries a registo must be one the op
-- recorded linking, or one that carried a registo before it.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-v2-3-verify.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== ANEXO LINK V2, STAGE 3. READ ONLY. Every verdict must read OK or a named VACUOUS ==='

WITH al AS (
  SELECT a.metadata AS m, a.created_at AS at, a.tenant_id AS tenant
    FROM public.audit_log a
   WHERE a.action = 'attachment.anexo_link_v2.backfill'
   ORDER BY a.created_at DESC
   LIMIT 1
), pr AS (
  SELECT (e ->> 'a')::uuid AS a_id, (e ->> 'r')::uuid AS r_id
    FROM al CROSS JOIN LATERAL jsonb_array_elements(al.m -> 'pairs') e
), rg AS (
  SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'registos') x(v)
), ex AS (
  SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'excluded_ids') x(v)
), pre AS (
  SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'prelinked_ids') x(v)
), v AS (
  SELECT
    (SELECT count(*) FROM public.audit_log x WHERE x.action = 'attachment.anexo_link_v2.backfill')::int AS v2_rows,
    (SELECT count(*) FROM public.audit_log x WHERE x.action = 'attachment.anexo_link.backfill')::int AS old_rows,
    (SELECT count(*) FROM public.audit_log x, al WHERE x.tenant_id = al.tenant)::int AS tenant_audit_rows,
    (SELECT al.m FROM al) AS m,
    coalesce((SELECT (al.m ->> 'linked_count')::int FROM al), 0) AS n_link,
    coalesce((SELECT (al.m ->> 'registos_touched')::int FROM al), 0) AS n_reg,
    (SELECT count(*) FROM pr)::int AS n_pairs,
    (SELECT count(*) FROM rg)::int AS n_rg,
    (SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id AND a.clinical_record_id = pr.r_id)::int AS link_ok,
    (SELECT coalesce(md5(string_agg(a.id::text || ':' || a.clinical_record_id::text, ','
                                    ORDER BY a.id, a.clinical_record_id)), 'empty')
       FROM pr JOIN public.attachments a ON a.id = pr.a_id) AS digest_now,
    (SELECT coalesce(md5(string_agg(s.id::text || ':' || s.clinical_record_id::text, ','
                                    ORDER BY s.id, s.clinical_record_id)), 'empty')
       FROM (SELECT a.id, a.clinical_record_id FROM pr JOIN public.attachments a ON a.id = pr.a_id
              ORDER BY a.id OFFSET 1) s) AS digest_less_one,
    (SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id)::int AS w_rows_now,
    (SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.storage_path, a.file_name, a.mime_type,
                                        a.size_bytes, a.uploaded_by, a.created_at, a.deleted_at, a.deleted_by_user_id,
                                        a.delete_reason)::text, E'\n' ORDER BY a.id), ''))
       FROM public.attachments a WHERE a.id IN (SELECT pr.a_id FROM pr)) AS md5_w_fixed_now,
    (SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id
       JOIN public.clinical_records cr ON cr.id = a.clinical_record_id)::int AS linked_read,
    (SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id
       JOIN public.clinical_records cr ON cr.id = a.clinical_record_id
      WHERE a.patient_id IS DISTINCT FROM cr.patient_id)::int AS mismatch,
    (SELECT count(*) FROM rg JOIN public.clinical_records cr ON cr.id = rg.id)::int AS regs_read,
    (SELECT count(*) FROM rg JOIN public.clinical_records cr ON cr.id = rg.id
      WHERE cr.status IS DISTINCT FROM 'locked')::int AS unlocked,
    (SELECT md5(coalesce(string_agg(md5((cr.*)::text), E'\n' ORDER BY cr.id), ''))
       FROM public.clinical_records cr WHERE cr.id IN (SELECT rg.id FROM rg)) AS md5_cr_t_now,
    (SELECT count(*) FROM public.attachments a
      WHERE a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%'
        AND a.clinical_record_id IS NOT NULL)::int AS imported_linked_now,
    (SELECT count(*) FROM public.attachments a
      WHERE a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%'
        AND a.clinical_record_id IS NOT NULL
        AND a.id NOT IN (SELECT pr.a_id FROM pr) AND a.id NOT IN (SELECT pre.id FROM pre))::int AS unrecorded,
    (SELECT md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
       FROM public.attachments a WHERE a.id IN (SELECT ex.id FROM ex)) AS md5_excl_now,
    (SELECT count(*) FROM public.attachments a WHERE a.id IN (SELECT ex.id FROM ex))::int AS ex_read,
    (SELECT count(*) FROM public.clinical_episodes ep
      WHERE ep.id IN (SELECT cr.episode_id FROM public.clinical_records cr WHERE cr.id IN (SELECT rg.id FROM rg)))::int AS ep_read,
    (SELECT md5(coalesce(string_agg((ep.*)::text, E'\n' ORDER BY ep.id), ''))
       FROM public.clinical_episodes ep
      WHERE ep.id IN (SELECT cr.episode_id FROM public.clinical_records cr WHERE cr.id IN (SELECT rg.id FROM rg))) AS md5_ep_t_now,
    (SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id
      WHERE a.patient_id IS NOT NULL
        AND a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%')::int AS documentos_ok
), r AS (
SELECT 1 AS n, 'exactly one v2 audit row; control: the audit rows of its tenant read' AS "check",
       v.v2_rows::text || ' / control ' || v.tenant_audit_rows::text AS observed, '1 / control above 0' AS expected,
       CASE WHEN v.v2_rows = 1 AND v.tenant_audit_rows > 0 THEN 'OK' ELSE 'FAIL' END AS verdict FROM v
UNION ALL SELECT 2, 'the original ANEXO LINK write never ran; control: the v2 audit row is read',
       v.old_rows::text || ' / control ' || v.v2_rows::text, '0 / control 1',
       CASE WHEN v.old_rows <> 0 OR v.v2_rows <> 1 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 3, 'every recorded document carries the registo stage 2 recorded for it',
       v.link_ok::text || ' of ' || v.n_pairs::text || ' recorded pairs', v.n_link::text || ', above 0',
       CASE WHEN v.link_ok <> v.n_link OR v.n_pairs <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 4, 'the digest recomputes from the rows as they stand; control: the same digest less one pair differs',
       left(v.digest_now, 8) || ' / control ' || CASE WHEN v.digest_less_one IS DISTINCT FROM (v.m ->> 'digest') THEN 'differs' ELSE 'EQUAL' END,
       coalesce(left(v.m ->> 'digest', 8), '(no audit row)') || ' / control differs',
       CASE WHEN v.digest_now IS DISTINCT FROM (v.m ->> 'digest')
              OR v.digest_less_one IS NOT DISTINCT FROM (v.m ->> 'digest') THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 5, 'every other column of a linked document is unchanged (md5): patient, Storage path, name, soft delete',
       v.w_rows_now::text || ' ' || left(v.md5_w_fixed_now, 8),
       v.n_link::text || ' ' || coalesce(left(v.m -> 'md5' ->> 'w_fixed', 8), '(no audit row)'),
       CASE WHEN v.md5_w_fixed_now IS DISTINCT FROM (v.m -> 'md5' ->> 'w_fixed')
              OR v.w_rows_now <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 6, 'every linked document belongs to its registo''s patient; control: the linked documents read',
       v.mismatch::text || ' / control ' || v.linked_read::text, '0 / control ' || v.n_link::text,
       CASE WHEN v.mismatch <> 0 OR v.linked_read <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 7, 'every target registo is still locked; control: the target registos read',
       v.unlocked::text || ' / control ' || v.regs_read::text, '0 / control ' || v.n_reg::text,
       CASE WHEN v.unlocked <> 0 OR v.regs_read <> v.n_reg OR v.n_rg <> v.n_reg OR v.n_reg = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 8, 'the target registos are unchanged (md5): no clinical_records row was written; control: the registos read',
       left(v.md5_cr_t_now, 8) || ' / control ' || v.regs_read::text,
       coalesce(left(v.m -> 'md5' ->> 'cr_t', 8), '(no audit row)') || ' / control ' || v.n_reg::text,
       CASE WHEN v.md5_cr_t_now IS DISTINCT FROM (v.m -> 'md5' ->> 'cr_t') OR v.regs_read <> v.n_reg OR v.n_reg = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 9, 'every imported original that carries a registo is one the op linked or one linked before it; control: those read now',
       v.unrecorded::text || ' / control ' || v.imported_linked_now::text,
       '0 / control at least ' || v.n_link::text,
       CASE WHEN v.unrecorded <> 0 OR v.imported_linked_now < v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 10, 'the named documents the op left alone are unchanged (md5); control: those read now',
       v.ex_read::text || ' ' || left(v.md5_excl_now, 8), coalesce(v.m -> 'md5_rows' ->> 'excl', '(no audit row)') || ' ' || coalesce(left(v.m -> 'md5' ->> 'excl', 8), ''),
       CASE WHEN v.md5_excl_now IS DISTINCT FROM (v.m -> 'md5' ->> 'excl')
              OR v.ex_read IS DISTINCT FROM coalesce((v.m -> 'md5_rows' ->> 'excl')::int, 0) THEN 'FAIL'
            WHEN coalesce((v.m -> 'md5_rows' ->> 'excl')::int, 0) = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 11, 'the episodes of the target registos are unchanged (md5); control: those read now',
       v.ep_read::text || ' ' || left(v.md5_ep_t_now, 8), coalesce(v.m -> 'md5_rows' ->> 'ep_t', '(no audit row)') || ' ' || coalesce(left(v.m -> 'md5' ->> 'ep_t', 8), ''),
       CASE WHEN v.md5_ep_t_now IS DISTINCT FROM (v.m -> 'md5' ->> 'ep_t')
              OR v.ep_read IS DISTINCT FROM coalesce((v.m -> 'md5_rows' ->> 'ep_t')::int, 0) THEN 'FAIL'
            WHEN coalesce((v.m -> 'md5_rows' ->> 'ep_t')::int, 0) = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 12, 'every linked document still shows on its patient''s Documentos tab: a patient, and a path under the tenant''s imported prefix',
       v.documentos_ok::text, v.n_link::text || ', above 0',
       CASE WHEN v.documentos_ok <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END FROM v
)
SELECT r.n, r."check", r.observed, r.expected, r.verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY',
       count(*) FILTER (WHERE r.verdict = 'OK')::text || ' OK / '
         || count(*) FILTER (WHERE r.verdict = 'VACUOUS')::text || ' VACUOUS / '
         || count(*) FILTER (WHERE r.verdict = 'FAIL')::text || ' FAIL',
       count(*)::text || ' verdicts', 'SUMMARY'
  FROM r
 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- FOR THE RECORD: the link set as it stands, by registo status. Ids stay in the
-- audit row; nothing below is a verdict.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== FOR THE RECORD: the documents the op linked, as they stand now ==='
SELECT count(*) AS recorded_pairs,
       count(*) FILTER (WHERE a.clinical_record_id = (e ->> 'r')::uuid) AS still_on_their_registo,
       count(*) FILTER (WHERE a.deleted_at IS NOT NULL) AS soft_deleted_since
  FROM public.audit_log al
 CROSS JOIN LATERAL jsonb_array_elements(al.metadata -> 'pairs') e
  JOIN public.attachments a ON a.id = (e ->> 'a')::uuid
 WHERE al.action = 'attachment.anexo_link_v2.backfill';

ROLLBACK;

\echo ''
\echo '=== ANEXO LINK V2 STAGE 3 COMPLETE. Nothing was written. ==='
