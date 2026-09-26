-- ============================================================================
-- ANEXO LINK V2, STAGE 2 of 3: THE WRITE. ONE DO BLOCK, ONE TRANSACTION.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level, owner
-- ruling (a) of 2026-09-13, paraphrased in stage 1's header and in
-- docs/data-op-anexo-link-v2.md.
--
-- WHAT IT WRITES, AND NOTHING ELSE:
--   public.attachments.clinical_record_id -> the registo that named it (the link
--                                            set, and only while the row is
--                                            unlinked and not soft deleted)
--   public.audit_log                         ONE row carrying every linked pair,
--                                            every excluded id, every
--                                            before-count and every md5
--
-- WHAT IT NEVER TOUCHES, asserted inside the transaction rather than promised:
-- every other column of a linked document (its patient, its Storage path, its
-- name, its soft-delete columns), every other attachment in every tenant,
-- clinical_records (the immutability trigger cannot fire: no statement here
-- names that table), clinical_episodes, migration_staging_rows and the
-- consultation audio keys, the other column that points into storage. Each is
-- compared by md5 before and after, inside this transaction.
--
-- A "STOP:" RAISED IN THIS FILE (psql exit 3) MEANS THE TRANSACTION ABORTED AND
-- NOTHING WAS WRITTEN. There is no partial write: every refusal is raised before
-- the first write, and every assertion after a write raises, which rolls the
-- whole block back. psql exit 0 means the COMMIT below ran: the write stands.
--
-- THE CARRIES COME FROM STAGE 1, RUN IN THE SAME SITTING. The block between the
-- SETS markers is stage 1's, byte for byte, so the recomputed carries can only
-- differ if the database moved.
--
-- Run (stage 2 of docs/data-op-anexo-link-v2.md passes both carries with -v):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v anexo_v2_count=... -v anexo_v2_digest=... -f scripts/data/anexo-link-v2-2-write.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
-- The step lines and the DONE line are NOTICEs. A role or database default of
-- client_min_messages above notice would hide them, and the stage 2 block would
-- then miss DONE after a write that committed. Pinned here, for this session.
SET client_min_messages = notice;

\echo ''
\echo '=== ANEXO LINK V2, STAGE 2. ONE TRANSACTION, REPEATABLE READ. ==='

-- REPEATABLE READ: every read inside the block sees one snapshot, so the before
-- and after comparisons cannot be moved by another session's commit, and a
-- concurrent update of a row this block writes aborts it instead of racing it.
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- PSQL DOES NOT INTERPOLATE :'var' INSIDE A DOLLAR-QUOTED BODY. The carries are
-- lifted into session settings here, in plain SQL, and read back inside the
-- block with current_setting. A carry not passed fails on this statement.
SELECT count(*) AS carries_lifted
  FROM (VALUES
    (set_config('anexo2.anexo_v2_count',  :'anexo_v2_count',  false)),
    (set_config('anexo2.anexo_v2_digest', :'anexo_v2_digest', false))
  ) v(x);

DO $anexo2$
DECLARE
  c_action     constant text := 'attachment.anexo_link_v2.backfill';
  c_card       constant text := 'INC-imported-fichas-sem-anexos-originals-are-patient-level';

  v_tenant   uuid;
  v_lnk      jsonb;
  v_att      uuid[];
  v_regs     uuid[];
  v_excl     jsonb;
  v_excl_ids uuid[];
  v_pre      uuid[];
  v_ref      jsonb;
  v_car      jsonb;
  v_digest   text;

  v_row      record;
  v_want     text;
  v_n        int;

  v_b_total int; v_b_linked int; v_b_unlinked int; v_b_with_patient int;
  v_a_total int; v_a_linked int; v_a_unlinked int; v_a_with_patient int;
  v_b_md5_w_fixed text; v_b_md5_att_rest text; v_b_md5_excl text; v_b_md5_cr_all text; v_b_md5_cr_t text;
  v_b_md5_ep_all text; v_b_md5_ep_t text; v_b_md5_stg text; v_b_md5_cons text;
  v_bn_w_fixed int; v_bn_att_rest int; v_bn_excl int; v_bn_cr_all int; v_bn_cr_t int;
  v_bn_ep_all int; v_bn_ep_t int; v_bn_stg int; v_bn_cons int;
  v_md5_rows jsonb;
BEGIN
  -- ==========================================================================
  -- P1. EVERY SET, COMPUTED ONCE, BY STAGE 1'S OWN TEXT.
  -- ==========================================================================
  WITH
-- >>> ANEXO LINK V2 SETS BEGIN. These lines are byte-identical in stage 1 and
-- stage 2 (scripts/anexo-link-v2-data-op.test.mjs asserts it), so the set stage
-- 1 prints and the set stage 2 writes are computed by the same text.
--
-- ws is every character JavaScript's String.prototype.trim strips: the
-- importer cuts a FICHEIRO cell with splitDeliveryFileNames (split on a comma or
-- a semicolon, then trim) and names the Storage object after what is left
-- (attachmentStoragePath, packages/db/src/migration/sources/fisiozero.ts).
-- btrim with no second argument strips the ASCII space only, so a name ending in
-- a tab or a no-break space would resolve to a path the importer never wrote.
-- The unit test holds ws equal to what JavaScript's trim strips over the whole
-- Basic Multilingual Plane.
k AS (
  SELECT 'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         (SELECT l.tenant_id FROM public.locations l
           WHERE l.id = 'de000002-0000-0000-0000-000000000001'::uuid) AS tenant,
         E' \t\n\r\f\x0b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff' AS ws
),
-- The two clinic rows, as found. R01 refuses unless both exist in one tenant.
cl AS (
  SELECT l.id, l.tenant_id
    FROM public.locations l, k
   WHERE l.id IN (k.lv_loc, k.cb_loc)
),
-- ---------------------------------------------------------------------------
-- THE CELLS. Every FICHEIRO cell of an imported registo's staging row, in every
-- tenant, plus ONE synthetic cell that the same split and trim must cut into
-- exactly a.pdf, b.pdf and c.pdf (R11). The synthetic cell carries a comma, a
-- semicolon, an empty part, a tab, a no-break space, an ideographic space and a
-- line end: a split on one separator, or a trim that is not JavaScript's,
-- misreads it, and R11 refuses.
-- ---------------------------------------------------------------------------
cells AS (
  SELECT 'real' AS src, s.id AS staging_id, s.tenant_id, s.source_system,
         s.imported_entity_id AS record_id, coalesce(s.raw ->> 'FICHEIRO', '') AS cell
    FROM public.migration_staging_rows s
   WHERE s.entity_type = 'clinical_record' AND s.status = 'imported'
     AND s.imported_entity_id IS NOT NULL
  UNION ALL
  SELECT 'control', NULL::uuid, NULL::uuid, 'control', NULL::uuid,
         E'a.pdf ,\u00a0b.pdf;\tc.pdf\u3000;; \r\n'
),
split AS (
  SELECT c.src, c.staging_id, c.tenant_id, c.source_system, c.record_id,
         btrim(p.part, k.ws) AS file_name
    FROM k, cells c
   CROSS JOIN LATERAL regexp_split_to_table(c.cell, '[,;]') AS p(part)
   WHERE btrim(p.part, k.ws) <> ''
),
named AS (
  SELECT sp.staging_id, sp.tenant_id, sp.source_system, sp.record_id, sp.file_name,
         sp.tenant_id::text || '/migration/fisiozero/' || sp.file_name AS storage_path
    FROM split sp
   WHERE sp.src = 'real'
),
-- ---------------------------------------------------------------------------
-- THE PAIRS. One row per registo, named file and the document row that file
-- resolves to in the staging row's tenant (or none). DISTINCT: a cell that
-- names one file twice, or two staging rows of one registo naming it, is one
-- link, not two.
-- ---------------------------------------------------------------------------
pair AS (
  SELECT DISTINCT n.tenant_id, n.record_id, n.storage_path,
         a.id AS attachment_id, a.patient_id AS att_patient, a.clinical_record_id AS att_record,
         a.deleted_at AS att_deleted,
         cr.id AS cr_id, cr.tenant_id AS cr_tenant, cr.patient_id AS cr_patient,
         cr.status::text AS cr_status,
         (n.tenant_id IS DISTINCT FROM k.tenant) AS other_tenant
    FROM k, named n
    LEFT JOIN public.attachments a
      ON a.tenant_id = n.tenant_id AND a.storage_path = n.storage_path
    LEFT JOIN public.clinical_records cr
      ON cr.id = n.record_id
),
-- Seven classes, each its own predicate, mutually exclusive by construction;
-- R10 proves every pair sets exactly one. Only 'link' is written.
cls0 AS (
  SELECT p.*,
         p.other_tenant AS f_other,
         (NOT p.other_tenant AND p.cr_id IS NULL) AS f_noreg,
         (NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NULL) AS f_nodoc,
         (NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL
            AND p.att_record IS NOT NULL AND p.att_record = p.record_id) AS f_here,
         (NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL
            AND p.att_record IS NOT NULL AND p.att_record <> p.record_id) AS f_else,
         (NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL
            AND p.att_record IS NULL AND p.att_deleted IS NOT NULL) AS f_del,
         (NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL
            AND p.att_record IS NULL AND p.att_deleted IS NULL) AS f_link
    FROM pair p
),
cls AS (
  SELECT c.*,
         NOT (c.f_other OR c.f_noreg OR c.f_nodoc OR c.f_here OR c.f_else OR c.f_del OR c.f_link) AS f_unc,
         CASE WHEN c.f_other THEN 'other_tenant'
              WHEN c.f_noreg THEN 'no_registo'
              WHEN c.f_nodoc THEN 'no_document'
              WHEN c.f_here  THEN 'already_linked'
              WHEN c.f_else  THEN 'linked_elsewhere'
              WHEN c.f_del   THEN 'soft_deleted'
              WHEN c.f_link  THEN 'link'
              ELSE 'UNCLASSIFIED' END AS label
    FROM cls0 c
),
-- THE LINK SET: a live, unlinked document of the tenant, named against a
-- registo that exists. The refusals below decide whether any of it is a guess.
lnk AS (
  SELECT c.attachment_id, c.record_id, c.storage_path, c.att_patient, c.cr_patient,
         c.cr_status, c.cr_tenant
    FROM cls c
   WHERE c.f_link
),
-- THE DOCUMENTS THE OP LEAVES ALONE, by class: named, but already linked here,
-- linked to another registo, soft deleted, or in another tenant. Stage 2 records
-- their ids and an md5 of their rows, and stage 3 verdict 10 compares it.
excl AS (
  SELECT DISTINCT c.label, c.attachment_id
    FROM cls c
   WHERE (c.f_here OR c.f_else OR c.f_del OR c.f_other) AND c.attachment_id IS NOT NULL
     AND c.attachment_id NOT IN (SELECT l.attachment_id FROM lnk l)
),
-- ---------------------------------------------------------------------------
-- THE CARRIES: the link set's size and an md5 over its ordered pairs. Stage 2
-- recomputes this CTE and refuses on any difference. A count cannot tell the
-- same set from one with a member swapped; the digest can.
-- ---------------------------------------------------------------------------
car AS (
  SELECT 1 AS ord, 'anexo_v2_count' AS carry, (SELECT count(*)::text FROM lnk) AS value
  UNION ALL
  SELECT 2, 'anexo_v2_digest',
         (SELECT coalesce(md5(string_agg(l.attachment_id::text || ':' || l.record_id::text, ','
                                         ORDER BY l.attachment_id, l.record_id)), 'empty')
            FROM lnk l)
),
-- ---------------------------------------------------------------------------
-- THE REFUSALS. n must be 0. control is the population the predicate read, so
-- a 0 that could not have seen anything prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
ref AS (
  SELECT 'R01' AS code, 'both clinic rows exist, in one tenant, which is the tenant this op links in' AS label,
         ((2 - (SELECT count(*) FROM cl)) + GREATEST((SELECT count(DISTINCT cl.tenant_id) FROM cl) - 1, 0))::int AS n,
         (SELECT count(*) FROM cl)::int AS control
  UNION ALL
  SELECT 'R02', 'the original ANEXO LINK write has already run (its audit row)',
         (SELECT count(*) FROM public.audit_log al WHERE al.action = 'attachment.anexo_link.backfill')::int,
         (SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int
  UNION ALL
  SELECT 'R03', 'this v2 write has already run (its audit row)',
         (SELECT count(*) FROM public.audit_log al WHERE al.action = 'attachment.anexo_link_v2.backfill')::int,
         (SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int
  UNION ALL
  SELECT 'R04', 'a document to link is named by more than one registo, so which registo it belongs to is a guess',
         (SELECT count(*) FROM (SELECT l.attachment_id FROM lnk l GROUP BY l.attachment_id
                                 HAVING count(DISTINCT l.record_id) > 1) x)::int,
         (SELECT count(DISTINCT l.attachment_id) FROM lnk l)::int
  UNION ALL
  -- Every live document row at a path the link set would link counts, linked or
  -- not: a second row already on that registo would show the file twice there,
  -- and one on another registo would put it on two. A soft-deleted row does not
  -- count; it is left alone (the soft_deleted class) and the live row is linked.
  SELECT 'R05', 'a named file to link resolves to more than one live document row, linked or not, so which row it names is a guess',
         (SELECT count(*) FROM (SELECT c.storage_path FROM cls c
                                 WHERE c.storage_path IN (SELECT l.storage_path FROM lnk l)
                                   AND c.attachment_id IS NOT NULL AND c.att_deleted IS NULL
                                 GROUP BY c.storage_path
                                HAVING count(DISTINCT c.attachment_id) > 1) x)::int,
         (SELECT count(DISTINCT l.storage_path) FROM lnk l)::int
  UNION ALL
  SELECT 'R06', 'a document to link belongs to a different patient than its registo, or to none',
         (SELECT count(*) FROM lnk l WHERE l.att_patient IS DISTINCT FROM l.cr_patient)::int,
         (SELECT count(*) FROM lnk)::int
  UNION ALL
  SELECT 'R07', 'a target registo is not locked: a draft belongs to the Anexos screen, not to this backfill',
         (SELECT count(DISTINCT l.record_id) FROM lnk l WHERE l.cr_status IS DISTINCT FROM 'locked')::int,
         (SELECT count(DISTINCT l.record_id) FROM lnk l)::int
  UNION ALL
  SELECT 'R08', 'a target registo sits in another tenant than its staging row',
         (SELECT count(DISTINCT l.record_id) FROM lnk l, k WHERE l.cr_tenant IS DISTINCT FROM k.tenant)::int,
         (SELECT count(DISTINCT l.record_id) FROM lnk l)::int
  UNION ALL
  SELECT 'R09', 'there is nothing to link: the link set is empty',
         (CASE WHEN (SELECT count(*) FROM lnk) = 0 THEN 1 ELSE 0 END)::int,
         (SELECT count(*) FROM cls c WHERE NOT c.f_other)::int
  UNION ALL
  SELECT 'R10', 'a named pair is UNCLASSIFIED, or sits in other than exactly one class',
         (SELECT count(*) FROM cls c
           WHERE c.f_unc
              OR (c.f_other::int + c.f_noreg::int + c.f_nodoc::int + c.f_here::int + c.f_else::int
                  + c.f_del::int + c.f_link::int + c.f_unc::int) <> 1)::int,
         (SELECT count(*) FROM cls)::int
  UNION ALL
  -- The file-name read proves itself: the same split and trim that read every
  -- real cell must cut the synthetic cell into exactly a.pdf, b.pdf and c.pdf.
  -- n counts the names it got wrong either way; control is the names it read.
  SELECT 'R11', 'the file-name read misread a synthetic cell (the split or the trim is not the importer''s), so every link could be missed or wrong',
         ((SELECT count(*) FROM (SELECT sp.file_name FROM split sp WHERE sp.src = 'control'
                                 EXCEPT ALL SELECT unnest(ARRAY['a.pdf', 'b.pdf', 'c.pdf'])) x)
          + (SELECT count(*) FROM (SELECT unnest(ARRAY['a.pdf', 'b.pdf', 'c.pdf'])
                                   EXCEPT ALL SELECT sp.file_name FROM split sp WHERE sp.src = 'control') y))::int,
         (SELECT count(*) FROM split sp WHERE sp.src = 'control')::int
  UNION ALL
  -- A trigger the system did not create, on a table stage 2 writes, would run
  -- code the write whitelist does not name, inside the committed transaction and
  -- with no ROW_COUNT check on what it does. Main has none; production has run
  -- ahead of main before, so the op reads the catalog and refuses rather than
  -- trusting that. The control is every trigger on those tables, the constraint
  -- triggers the system creates for each foreign key included, so a 0 that read
  -- nothing prints VACUOUS.
  SELECT 'R12', 'a trigger the system did not create sits on a table stage 2 writes, so a write would run code outside the whitelist',
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass)
             AND NOT t.tgisinternal)::int,
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass))::int
)
-- <<< ANEXO LINK V2 SETS END
  SELECT (SELECT k.tenant FROM k),
         coalesce((SELECT jsonb_agg(jsonb_build_object('a', l.attachment_id, 'r', l.record_id)
                                    ORDER BY l.attachment_id, l.record_id) FROM lnk l), '[]'::jsonb),
         coalesce((SELECT array_agg(DISTINCT l.record_id ORDER BY l.record_id) FROM lnk l), '{}'::uuid[]),
         coalesce((SELECT jsonb_object_agg(e.label, e.ids)
                     FROM (SELECT x.label, jsonb_agg(x.attachment_id ORDER BY x.attachment_id) AS ids
                             FROM excl x GROUP BY x.label) e), '{}'::jsonb),
         coalesce((SELECT array_agg(DISTINCT x.attachment_id ORDER BY x.attachment_id) FROM excl x), '{}'::uuid[]),
         (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'n', r.n, 'control', r.control)
                           ORDER BY r.code) FROM ref r),
         (SELECT jsonb_object_agg(c.carry, c.value) FROM car c)
    INTO v_tenant, v_lnk, v_regs, v_excl, v_excl_ids, v_ref, v_car;

  v_att := ARRAY(SELECT (e ->> 'a')::uuid FROM jsonb_array_elements(v_lnk) e ORDER BY 1);

  RAISE NOTICE 'P1 tenant %, link set % document(s) on % registo(s), % named document(s) left alone',
    v_tenant, cardinality(v_att), cardinality(v_regs), cardinality(v_excl_ids);

  -- ==========================================================================
  -- P2. THE REFUSALS, stage 1's own lines. Any n above 0 STOPS the op here,
  --     before the first write.
  -- ==========================================================================
  FOR v_row IN SELECT e ->> 'code' AS code, e ->> 'label' AS label,
                      (e ->> 'n')::int AS n, (e ->> 'control')::int AS control
                 FROM jsonb_array_elements(v_ref) e ORDER BY 1
  LOOP
    RAISE NOTICE 'P2 % n=% control=% (%)', v_row.code, v_row.n, v_row.control, v_row.label;
  END LOOP;
  FOR v_row IN SELECT e ->> 'code' AS code, e ->> 'label' AS label, (e ->> 'n')::int AS n
                 FROM jsonb_array_elements(v_ref) e WHERE (e ->> 'n')::int > 0 ORDER BY 1
  LOOP
    RAISE EXCEPTION 'STOP: % refuses, %: n = %. Nothing was written', v_row.code, v_row.label, v_row.n;
  END LOOP;

  -- ==========================================================================
  -- P3. THE CARRIES. The link set's count and digest must be stage 1's.
  -- ==========================================================================
  SELECT count(*)::int INTO v_n FROM jsonb_object_keys(v_car);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'STOP: the carry set has % names, not 2', v_n;
  END IF;
  FOR v_row IN SELECT c.key, c.value FROM jsonb_each_text(v_car) c ORDER BY 1
  LOOP
    v_want := current_setting('anexo2.' || v_row.key, true);
    IF v_want IS NULL OR v_want = '' THEN
      RAISE EXCEPTION 'STOP: carry % was not passed from stage 1', v_row.key;
    END IF;
    IF v_want IS DISTINCT FROM v_row.value THEN
      RAISE EXCEPTION 'STOP: carry % reads % now and stage 1 printed %. The database moved since stage 1. Nothing was written; the sitting stops here',
        v_row.key, v_row.value, v_want;
    END IF;
  END LOOP;
  IF cardinality(v_att) <> (v_car ->> 'anexo_v2_count')::int THEN
    RAISE EXCEPTION 'STOP: the link set holds % documents and the carry counts %', cardinality(v_att), v_car ->> 'anexo_v2_count';
  END IF;
  RAISE NOTICE 'P3 both carries match stage 1';

  -- ==========================================================================
  -- P4. WHAT ELSE RUNS ON A WRITE TO THESE TABLES. R12 has already refused any
  --     trigger the system did not create; P4 reads the catalog again, prints
  --     what it finds, and STOPS on any, so the write below can run no code the
  --     whitelist does not name. Every piece is cast, because text || "char"
  --     has no operator and a print must not abort.
  -- ==========================================================================
  SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname::text || ' (enabled ' || t.tgenabled::text || ')',
                    ', ' ORDER BY t.tgrelid::regclass::text, t.tgname::text)
    INTO v_want
    FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass)
     AND NOT t.tgisinternal;
  RAISE NOTICE 'P4 triggers the system did not create, on a table this op writes: %', coalesce(v_want, 'none');
  IF v_want IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: P4 found a trigger the system did not create on a table this op writes: %. Nothing was written', v_want;
  END IF;

  -- ==========================================================================
  -- P5. THE BASELINES. Every one is read again after the write and asserted.
  -- ==========================================================================
  SELECT count(*)::int INTO v_b_total FROM public.attachments a;
  SELECT count(*)::int INTO v_b_linked FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.clinical_record_id IS NOT NULL;
  SELECT count(*)::int INTO v_b_unlinked FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.clinical_record_id IS NULL;
  SELECT count(*)::int INTO v_b_with_patient FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.patient_id IS NOT NULL;
  -- Every imported original, in every tenant, that already carries a registo.
  -- Stage 3 verdict 9 proves that after the write every imported original that
  -- carries a registo is one of these or one this op linked.
  v_pre := ARRAY(SELECT a.id FROM public.attachments a
                  WHERE a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%'
                    AND a.clinical_record_id IS NOT NULL
                  ORDER BY a.id);

  -- w_fixed: EVERY attachments column the op does not write, on the rows it
  -- writes. The op writes clinical_record_id and nothing else; the other
  -- columns are listed here in full (packages/db/src/schema.ts and the
  -- migrations, which scripts/anexo-link-v2-data-op.test.mjs reads to hold this
  -- list complete), and the same list is compared after the write and by stage 3.
  SELECT count(*)::int,
         md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.storage_path, a.file_name, a.mime_type,
                                     a.size_bytes, a.uploaded_by, a.created_at, a.deleted_at, a.deleted_by_user_id,
                                     a.delete_reason)::text, E'\n' ORDER BY a.id), ''))
    INTO v_bn_w_fixed, v_b_md5_w_fixed
    FROM public.attachments a WHERE a.id = ANY(v_att);
  SELECT count(*)::int, md5(coalesce(string_agg(md5((a.*)::text), E'\n' ORDER BY a.id), ''))
    INTO v_bn_att_rest, v_b_md5_att_rest
    FROM public.attachments a WHERE NOT (a.id = ANY(v_att));
  SELECT count(*)::int, md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
    INTO v_bn_excl, v_b_md5_excl
    FROM public.attachments a WHERE a.id = ANY(v_excl_ids);
  SELECT count(*)::int, md5(coalesce(string_agg(md5((cr.*)::text), E'\n' ORDER BY cr.id), ''))
    INTO v_bn_cr_all, v_b_md5_cr_all
    FROM public.clinical_records cr;
  SELECT count(*)::int, md5(coalesce(string_agg(md5((cr.*)::text), E'\n' ORDER BY cr.id), ''))
    INTO v_bn_cr_t, v_b_md5_cr_t
    FROM public.clinical_records cr WHERE cr.id = ANY(v_regs);
  SELECT count(*)::int, md5(coalesce(string_agg((ep.*)::text, E'\n' ORDER BY ep.id), ''))
    INTO v_bn_ep_all, v_b_md5_ep_all
    FROM public.clinical_episodes ep;
  SELECT count(*)::int, md5(coalesce(string_agg((ep.*)::text, E'\n' ORDER BY ep.id), ''))
    INTO v_bn_ep_t, v_b_md5_ep_t
    FROM public.clinical_episodes ep
   WHERE ep.id IN (SELECT cr.episode_id FROM public.clinical_records cr WHERE cr.id = ANY(v_regs));
  SELECT count(*)::int, md5(coalesce(string_agg(md5((s.*)::text), E'\n' ORDER BY s.id), ''))
    INTO v_bn_stg, v_b_md5_stg
    FROM public.migration_staging_rows s;
  SELECT count(*)::int, md5(coalesce(string_agg((co.*)::text, E'\n' ORDER BY co.id), ''))
    INTO v_bn_cons, v_b_md5_cons
    FROM public.consultations co;

  RAISE NOTICE 'P5 baseline: attachments % in every tenant; in this tenant % linked, % unlinked, % with a patient; imported originals already linked, every tenant: %',
    v_b_total, v_b_linked, v_b_unlinked, v_b_with_patient, cardinality(v_pre);

  -- Every md5 family this block compares, with the rows it compares. All go
  -- into the audit row. A family that a refusal already guarantees non-empty
  -- (w_fixed, cr_t, cr_all and stg, by R09: a link set exists, and each of its
  -- pairs is a document, a registo and a staging row) STOPS here if it reads
  -- empty: the refusal and the baseline would disagree. The others can be empty
  -- on a real day and print VACUOUS: att_rest (every document is in the link
  -- set), excl (no named document is left alone), ep_all and ep_t (no episode),
  -- cons (no consultation recording). Each whole-table family still changes on
  -- the one write it could suffer while empty, a new row.
  v_md5_rows := jsonb_build_object(
    'w_fixed', v_bn_w_fixed, 'att_rest', v_bn_att_rest, 'excl', v_bn_excl, 'cr_all', v_bn_cr_all,
    'cr_t', v_bn_cr_t, 'ep_all', v_bn_ep_all, 'ep_t', v_bn_ep_t, 'stg', v_bn_stg, 'cons', v_bn_cons);
  SELECT string_agg(e.key || ' ' || e.value || CASE WHEN e.value::int = 0 THEN ' VACUOUS' ELSE ' OK' END,
                    ', ' ORDER BY e.key)
    INTO v_want FROM jsonb_each_text(v_md5_rows) e;
  RAISE NOTICE 'P5 md5 families and the rows each compares: %', v_want;
  FOR v_row IN SELECT e.key FROM jsonb_each_text(v_md5_rows) e
                WHERE e.key IN ('w_fixed', 'cr_t', 'cr_all', 'stg')
                  AND e.value::int = 0
                ORDER BY 1
  LOOP
    RAISE EXCEPTION 'STOP: the md5 family % is empty, though a refusal guarantees it is not. Nothing was written', v_row.key;
  END LOOP;
  IF v_bn_w_fixed <> cardinality(v_att) OR v_bn_cr_t <> cardinality(v_regs) THEN
    RAISE EXCEPTION 'STOP: the link set names % documents and % registos, and the database holds % and %',
      cardinality(v_att), cardinality(v_regs), v_bn_w_fixed, v_bn_cr_t;
  END IF;

  -- ==========================================================================
  -- W1. THE WRITE. One column, on exactly the link set, each row still unlinked
  --     and not soft deleted. Followed by its ROW_COUNT, asserted exactly.
  -- ==========================================================================
  UPDATE public.attachments SET clinical_record_id = t.r
    FROM (SELECT (e ->> 'a')::uuid AS a, (e ->> 'r')::uuid AS r FROM jsonb_array_elements(v_lnk) e) t
   WHERE attachments.id = t.a AND attachments.tenant_id = v_tenant
     AND attachments.clinical_record_id IS NULL AND attachments.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_att) THEN
    RAISE EXCEPTION 'STOP: W1 linked % documents, expected exactly %', v_n, cardinality(v_att);
  END IF;
  RAISE NOTICE 'W1 linked % document(s) to % registo(s)', v_n, cardinality(v_regs);

  -- ==========================================================================
  -- A. THE EXACT DELTAS, and every untouched set by md5.
  -- ==========================================================================
  SELECT count(*)::int INTO v_a_total FROM public.attachments a;
  SELECT count(*)::int INTO v_a_linked FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.clinical_record_id IS NOT NULL;
  SELECT count(*)::int INTO v_a_unlinked FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.clinical_record_id IS NULL;
  SELECT count(*)::int INTO v_a_with_patient FROM public.attachments a WHERE a.tenant_id = v_tenant AND a.patient_id IS NOT NULL;
  IF v_a_total <> v_b_total THEN
    RAISE EXCEPTION 'STOP: the attachment total moved % -> %; this op neither creates nor removes a document', v_b_total, v_a_total;
  END IF;
  IF v_a_linked <> v_b_linked + cardinality(v_att) OR v_a_unlinked <> v_b_unlinked - cardinality(v_att) THEN
    RAISE EXCEPTION 'STOP: linked % -> % and unlinked % -> %, not exactly plus and minus the link set',
      v_b_linked, v_a_linked, v_b_unlinked, v_a_unlinked;
  END IF;
  IF v_a_with_patient <> v_b_with_patient THEN
    RAISE EXCEPTION 'STOP: the documents with a patient moved % -> %; a link never clears a patient', v_b_with_patient, v_a_with_patient;
  END IF;
  SELECT count(*)::int INTO v_n
    FROM jsonb_array_elements(v_lnk) e
    JOIN public.attachments a ON a.id = (e ->> 'a')::uuid AND a.clinical_record_id = (e ->> 'r')::uuid;
  IF v_n <> cardinality(v_att) THEN
    RAISE EXCEPTION 'STOP: % of % linked documents carry the registo that named them', v_n, cardinality(v_att);
  END IF;
  SELECT coalesce(md5(string_agg(a.id::text || ':' || a.clinical_record_id::text, ','
                                 ORDER BY a.id, a.clinical_record_id)), 'empty')
    INTO v_digest
    FROM public.attachments a WHERE a.id = ANY(v_att);
  IF v_digest IS DISTINCT FROM (v_car ->> 'anexo_v2_digest') THEN
    RAISE EXCEPTION 'STOP: the rows as written digest to %, and stage 1 carried %', v_digest, v_car ->> 'anexo_v2_digest';
  END IF;
  SELECT count(*)::int INTO v_n
    FROM public.attachments a JOIN public.clinical_records cr ON cr.id = a.clinical_record_id
   WHERE a.id = ANY(v_att) AND a.patient_id IS DISTINCT FROM cr.patient_id;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'STOP: % linked document(s) belong to another patient than their registo', v_n;
  END IF;
  SELECT count(*)::int INTO v_n FROM public.clinical_records cr WHERE cr.id = ANY(v_regs) AND cr.status = 'locked';
  IF v_n <> cardinality(v_regs) THEN
    RAISE EXCEPTION 'STOP: % of % target registos are locked after the write', v_n, cardinality(v_regs);
  END IF;
  SELECT count(*)::int INTO v_n
    FROM public.attachments a
   WHERE a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%'
     AND a.clinical_record_id IS NOT NULL
     AND NOT (a.id = ANY(v_pre)) AND NOT (a.id = ANY(v_att));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'STOP: % imported original(s) carry a registo that neither this op nor anything before it gave them', v_n;
  END IF;

  IF (SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.storage_path, a.file_name, a.mime_type,
                                         a.size_bytes, a.uploaded_by, a.created_at, a.deleted_at, a.deleted_by_user_id,
                                         a.delete_reason)::text, E'\n' ORDER BY a.id), ''))
        FROM public.attachments a WHERE a.id = ANY(v_att)) IS DISTINCT FROM v_b_md5_w_fixed THEN
    RAISE EXCEPTION 'STOP: a linked document changed in a column this op does not write';
  END IF;
  IF (SELECT md5(coalesce(string_agg(md5((a.*)::text), E'\n' ORDER BY a.id), ''))
        FROM public.attachments a WHERE NOT (a.id = ANY(v_att))) IS DISTINCT FROM v_b_md5_att_rest
     OR (SELECT md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
           FROM public.attachments a WHERE a.id = ANY(v_excl_ids)) IS DISTINCT FROM v_b_md5_excl THEN
    RAISE EXCEPTION 'STOP: an attachment outside the link set changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(md5((cr.*)::text), E'\n' ORDER BY cr.id), ''))
        FROM public.clinical_records cr) IS DISTINCT FROM v_b_md5_cr_all
     OR (SELECT md5(coalesce(string_agg(md5((cr.*)::text), E'\n' ORDER BY cr.id), ''))
           FROM public.clinical_records cr WHERE cr.id = ANY(v_regs)) IS DISTINCT FROM v_b_md5_cr_t THEN
    RAISE EXCEPTION 'STOP: clinical_records changed; this op writes none';
  END IF;
  IF (SELECT md5(coalesce(string_agg((ep.*)::text, E'\n' ORDER BY ep.id), ''))
        FROM public.clinical_episodes ep) IS DISTINCT FROM v_b_md5_ep_all
     OR (SELECT md5(coalesce(string_agg((ep.*)::text, E'\n' ORDER BY ep.id), ''))
           FROM public.clinical_episodes ep
          WHERE ep.id IN (SELECT cr.episode_id FROM public.clinical_records cr WHERE cr.id = ANY(v_regs)))
        IS DISTINCT FROM v_b_md5_ep_t THEN
    RAISE EXCEPTION 'STOP: clinical_episodes changed; this op writes none';
  END IF;
  IF (SELECT md5(coalesce(string_agg(md5((s.*)::text), E'\n' ORDER BY s.id), ''))
        FROM public.migration_staging_rows s) IS DISTINCT FROM v_b_md5_stg THEN
    RAISE EXCEPTION 'STOP: migration_staging_rows changed; this op reads it and writes none';
  END IF;
  IF (SELECT md5(coalesce(string_agg((co.*)::text, E'\n' ORDER BY co.id), ''))
        FROM public.consultations co) IS DISTINCT FROM v_b_md5_cons THEN
    RAISE EXCEPTION 'STOP: consultations changed; this op writes none';
  END IF;
  RAISE NOTICE 'A the deltas are exact: linked % -> %, unlinked % -> %, with a patient % both sides; every md5 family unchanged',
    v_b_linked, v_a_linked, v_b_unlinked, v_a_unlinked, v_a_with_patient;

  -- ==========================================================================
  -- THE AUDIT ROW. Ids, counts and md5s only: no file name, no patient datum
  -- and no free text. A delivery file name is patient-adjacent and audit_log is
  -- append-only and kept for ever (apps/web/lib/audit/metadata-contract.ts).
  -- Stage 3 reads every number back. Written last, so it records the after-state
  -- the assertions above have already proved.
  -- ==========================================================================
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant, NULL, c_action, 'attachment', NULL, jsonb_build_object(
    'card', c_card,
    'source', 'data_op_anexo_link_v2',
    'ruling', '2026-09-13 (a)',
    'op_at', now(),
    'carries', v_car,
    'linked_count', cardinality(v_att),
    'registos_touched', cardinality(v_regs),
    'digest', v_digest,
    'pairs', v_lnk,
    'registos', to_jsonb(v_regs),
    'excluded', v_excl,
    'excluded_ids', to_jsonb(v_excl_ids),
    'prelinked_ids', to_jsonb(v_pre),
    'before', jsonb_build_object(
      'attachments', v_b_total, 'linked', v_b_linked, 'unlinked', v_b_unlinked, 'with_patient', v_b_with_patient),
    'after', jsonb_build_object(
      'attachments', v_a_total, 'linked', v_a_linked, 'unlinked', v_a_unlinked, 'with_patient', v_a_with_patient),
    'md5', jsonb_build_object(
      'w_fixed', v_b_md5_w_fixed, 'att_rest', v_b_md5_att_rest, 'excl', v_b_md5_excl, 'cr_all', v_b_md5_cr_all,
      'cr_t', v_b_md5_cr_t, 'ep_all', v_b_md5_ep_all, 'ep_t', v_b_md5_ep_t, 'stg', v_b_md5_stg, 'cons', v_b_md5_cons),
    'md5_rows', v_md5_rows
  ));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 OR (SELECT count(*) FROM public.audit_log al WHERE al.action = c_action) <> 1 THEN
    RAISE EXCEPTION 'STOP: the audit row was not written exactly once';
  END IF;
  IF (SELECT count(*) FROM public.audit_log al WHERE al.action = c_action AND al.created_at = now()) <> 1 THEN
    RAISE EXCEPTION 'STOP: the audit row does not carry this transaction''s time';
  END IF;

  RAISE NOTICE 'ANEXO LINK V2 STAGE 2 DONE: % document(s) linked to % registo(s), digest %; no other row of any table written',
    cardinality(v_att), cardinality(v_regs), v_digest;
END $anexo2$;

COMMIT;

\echo ''
\echo '=== ANEXO LINK V2 STAGE 2 COMMITTED ==='
