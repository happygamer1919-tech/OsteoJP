-- ============================================================================
-- ANEXO LINK V2, STAGE 1 of 3: THE READ. IT WRITES NOTHING.
--
-- Card INC-imported-fichas-sem-anexos-originals-are-patient-level, owner
-- ruling (a) of 2026-09-13, paraphrased (docs/data-op-anexo-link-v2.md has the
-- full question block): a document that a Fisiozero episode row named against
-- ONE specific registo is linked to that registo, by setting
-- attachments.clinical_record_id, and nothing else is guessed. Replaces the
-- original op (docs/data-op-anexo-link.md, SUPERSEDED, never run).
--
-- EVERY SET IS DERIVED FROM THE DATABASE AT RUN TIME, by the block between the
-- SETS BEGIN and SETS END markers, which stage 2 carries byte for byte. No
-- count and no id measured on production appears in this file. The tenant is
-- the one that owns the Linda-a-Velha clinic row, and the Castelo Branco clinic
-- row must sit in it too (R01).
--
-- ONE STATEMENT COMPUTES EVERYTHING. The sets are evaluated once, packaged into
-- one JSON value held in the psql variable anexo_v2_json by \gset (a
-- client-side variable, not a write), and every section below prints from that
-- value. So every section describes the same instant.
--
-- Run (stage 1 of docs/data-op-anexo-link-v2.md):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/anexo-link-v2-1-read.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== ANEXO LINK V2, STAGE 1. READ ONLY. ==='

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation;

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
-- THE DOCUMENTS THE OP LEAVES ALONE: every named document outside the link set,
-- whatever its class (already linked here, linked to another registo, soft
-- deleted, in another tenant, or named by a registo that is not there). The
-- complement of the link class, not a list of classes, so no class that names a
-- document can drop out of it. Stage 2 records their ids and an md5 of their
-- rows, and stage 3 verdict 10 compares it.
excl AS (
  SELECT DISTINCT c.label, c.attachment_id
    FROM cls c
   WHERE NOT c.f_link AND c.attachment_id IS NOT NULL
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
SELECT jsonb_build_object(
  'meta', (SELECT jsonb_build_object(
             'tenant', coalesce(k.tenant::text, '(no Linda-a-Velha row)'),
             'now', now()::text) FROM k),
  'clinics', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'clinic', CASE WHEN l.id = k.lv_loc THEN 'Linda-a-Velha' ELSE 'Castelo Branco' END,
                'id', l.id::text, 'tenant', l.tenant_id::text)
                ORDER BY l.id), '[]'::jsonb)
                FROM public.locations l, k WHERE l.id IN (k.lv_loc, k.cb_loc)),
  'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'tenant_is_this_ops', s.mine, 'source_system', s.source_system,
                'staging_rows', s.rows, 'named_files', s.files)
                ORDER BY s.mine DESC, s.source_system), '[]'::jsonb)
                FROM (SELECT (n.tenant_id IS NOT DISTINCT FROM k.tenant)::text AS mine, n.source_system,
                             count(DISTINCT n.staging_id) AS rows, count(*) AS files
                        FROM named n, k GROUP BY 1, 2) s),
  'classes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'class', s.label, 'pairs', s.pairs, 'documents', s.docs, 'registos', s.regs)
                ORDER BY s.label), '[]'::jsonb)
                FROM (SELECT c.label, count(*) AS pairs, count(DISTINCT c.attachment_id) AS docs,
                             count(DISTINCT c.record_id) AS regs
                        FROM cls c GROUP BY c.label) s),
  'partition', (SELECT jsonb_build_object(
                  'pairs', count(*),
                  'exactly_one_class', count(*) FILTER (WHERE (c.f_other::int + c.f_noreg::int + c.f_nodoc::int
                                                               + c.f_here::int + c.f_else::int + c.f_del::int
                                                               + c.f_link::int + c.f_unc::int) = 1),
                  'unclassified', count(*) FILTER (WHERE c.f_unc),
                  'label_agrees', count(*) FILTER (WHERE (c.label = 'other_tenant') = c.f_other
                                                     AND (c.label = 'no_registo') = c.f_noreg
                                                     AND (c.label = 'no_document') = c.f_nodoc
                                                     AND (c.label = 'already_linked') = c.f_here
                                                     AND (c.label = 'linked_elsewhere') = c.f_else
                                                     AND (c.label = 'soft_deleted') = c.f_del
                                                     AND (c.label = 'link') = c.f_link
                                                     AND (c.label = 'UNCLASSIFIED') = c.f_unc))
                  FROM cls c),
  'link_by_status', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'registo_status', s.st, 'registos', s.regs, 'documents', s.docs)
                       ORDER BY s.st), '[]'::jsonb)
                       FROM (SELECT coalesce(l.cr_status, '(none)') AS st, count(DISTINCT l.record_id) AS regs,
                                    count(DISTINCT l.attachment_id) AS docs
                               FROM lnk l GROUP BY 1) s),
  'left_alone', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'class', c.label, 'document', coalesce(c.attachment_id::text, '(none)'),
                   'registo', c.record_id::text,
                   'document_now_on', coalesce(c.att_record::text, '(no registo)'))
                   ORDER BY c.label, c.record_id, c.attachment_id), '[]'::jsonb)
                   FROM cls c WHERE NOT c.f_link),
  'carries', (SELECT jsonb_agg(jsonb_build_object('ord', c.ord, 'carry', c.carry, 'value', c.value) ORDER BY c.ord)
                FROM car c),
  'refusals', (SELECT jsonb_agg(jsonb_build_object(
                 'code', r.code, 'label', r.label, 'n', r.n, 'control', r.control,
                 'verdict', CASE WHEN r.n > 0 THEN 'REFUSE' WHEN r.control = 0 THEN 'VACUOUS' ELSE 'OK' END)
                 ORDER BY r.code) FROM ref r),
  'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('action', al.action, 'id', al.id::text,
                                                        'created_at', al.created_at::text)
                                     ORDER BY al.created_at), '[]'::jsonb)
             FROM public.audit_log al
            WHERE al.action IN ('attachment.anexo_link.backfill', 'attachment.anexo_link_v2.backfill')),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'on_table', t.tgrelid::regclass::text, 'trigger', t.tgname::text,
                 'enabled', t.tgenabled::text, 'function', t.tgfoid::regprocedure::text)
                 ORDER BY t.tgrelid::regclass::text, t.tgname::text), '[]'::jsonb)
                 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass)
                  AND NOT t.tgisinternal)
)::text AS anexo_v2_json
\gset

-- ---------------------------------------------------------------------------
-- 0. THE TENANT AND THE INSTANT.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 0. THE TENANT THIS OP LINKS IN, and the instant this read describes ==='
SELECT m ->> 'tenant' AS tenant, m ->> 'now' AS read_at
  FROM (SELECT :'anexo_v2_json'::jsonb -> 'meta' AS m) s;
SELECT e ->> 'clinic' AS clinic, e ->> 'id' AS id, e ->> 'tenant' AS tenant
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'clinics') e;
\echo '    The tenant is the one that owns the Linda-a-Velha row; the Castelo Branco row must be in it (R01).'

-- ---------------------------------------------------------------------------
-- 1. THE SOURCE: the imported registos' staging rows that name a file.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. THE SOURCE: staging rows of imported registos that name a file, by tenant and source ==='
SELECT e ->> 'tenant_is_this_ops' AS this_ops_tenant, e ->> 'source_system' AS source_system,
       (e ->> 'staging_rows')::int AS staging_rows, (e ->> 'named_files')::int AS named_files
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'sources') e;
\echo '    A row with this_ops_tenant = false is another tenant: listed, never linked, and left'
\echo '    alone (class other_tenant below).'

-- ---------------------------------------------------------------------------
-- 2. THE CLASSES. Every (registo, named file, document) pair, and what stage 2
--    does to it. Only 'link' is written.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. EVERY NAMED PAIR, BY CLASS. Stage 2 writes the class link and nothing else ==='
SELECT e ->> 'class' AS class, (e ->> 'pairs')::int AS pairs, (e ->> 'documents')::int AS documents,
       (e ->> 'registos')::int AS registos
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'classes') e;
\echo '    link: a live document of this tenant with no registo, named against a registo that exists.'
\echo '    already_linked: it already carries that registo. linked_elsewhere: it carries another one.'
\echo '    soft_deleted: staff removed it; it stays removed and unlinked. no_document: the named file'
\echo '    has no document row. no_registo: the staging row names a registo that is not there.'
\echo '    other_tenant: not this op''s tenant. UNCLASSIFIED refuses (R10).'
\echo ''
\echo '=== 2b. THE PARTITION: every named pair lands in exactly one class ==='
SELECT (p ->> 'pairs')::int AS pairs, (p ->> 'exactly_one_class')::int AS in_exactly_one,
       (p ->> 'unclassified')::int AS unclassified, (p ->> 'label_agrees')::int AS label_agrees,
       CASE WHEN (p ->> 'pairs')::int = (p ->> 'exactly_one_class')::int
             AND (p ->> 'pairs')::int = (p ->> 'label_agrees')::int
             AND (p ->> 'unclassified')::int = 0
            THEN 'partition holds' ELSE 'PARTITION BROKEN, R10 refuses' END AS partition
  FROM (SELECT :'anexo_v2_json'::jsonb -> 'partition' AS p) s;
\echo ''
\echo '=== 2c. THE LINK SET, by the status of its registos. Every one must be locked (R07) ==='
SELECT e ->> 'registo_status' AS registo_status, (e ->> 'registos')::int AS registos,
       (e ->> 'documents')::int AS documents
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'link_by_status') e;
\echo ''
\echo '=== 2d. EVERY PAIR THE OP LEAVES ALONE, by id. No stage changes a document listed here ==='
SELECT e ->> 'class' AS class, e ->> 'document' AS document, e ->> 'registo' AS named_by_registo,
       e ->> 'document_now_on' AS document_now_on
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'left_alone') e;

-- ---------------------------------------------------------------------------
-- 3. THE CARRIES. Stage 2 is handed both and refuses if either has moved.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. THE CARRIES. Stage 2 is given these and refuses if either has moved ==='
SELECT e ->> 'carry' AS carry, e ->> 'value' AS value
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'carries') e
 ORDER BY (e ->> 'ord')::int;

-- ---------------------------------------------------------------------------
-- 4. THE REFUSALS. n must read 0 on every line, or stage 2 STOPS. control is
--    the population the predicate read: 0 there prints VACUOUS, not OK.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. THE REFUSALS. Any REFUSE stops the sitting here; stage 2 refuses on the same lines ==='
SELECT e ->> 'code' AS code, e ->> 'label' AS refuses_when, (e ->> 'n')::int AS n,
       (e ->> 'control')::int AS control, e ->> 'verdict' AS verdict
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'refusals') e
 ORDER BY e ->> 'code';
\echo ''
\echo '=== 4b. WHAT ELSE WOULD RUN ON A WRITE: every trigger the system did not create, on a table stage 2 writes. R12 refuses any ==='
SELECT e ->> 'on_table' AS on_table, e ->> 'trigger' AS trigger_name, e ->> 'enabled' AS enabled,
       e ->> 'function' AS runs_function
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'triggers') e;
\echo '    An empty listing is the expected answer; R12 control counts every trigger read, the'
\echo '    system constraint triggers included, so an empty listing that read nothing prints VACUOUS.'

-- ---------------------------------------------------------------------------
-- 5. HAS ANY WRITE ALREADY RUN? Its own audit row is the only answer.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. HAS THE ORIGINAL ANEXO LINK WRITE OR THIS V2 WRITE ALREADY RUN? ==='
SELECT e ->> 'action' AS action, e ->> 'id' AS id, e ->> 'created_at' AS created_at
  FROM jsonb_array_elements(:'anexo_v2_json'::jsonb -> 'runs') e;

ROLLBACK;

\echo ''
\echo '=== ANEXO LINK V2 STAGE 1 COMPLETE. Nothing was written. ==='
