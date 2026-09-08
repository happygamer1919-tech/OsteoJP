-- ===========================================================================
-- CB RECOVERY DIAGNOSTICS. READ ONLY. Owner-run, production, one paste back.
-- ===========================================================================
-- Companion to cb-reconciliation.sql, and NARROWER on purpose: that file asks
-- "what disagrees"; this one asks "what happened to these specific rows, and is
-- it a class or an accident". It exists because the 2026-09-08 reconciliation
-- produced three findings that a count cannot resolve:
--
--   1. patient source_id 221754 FAILED with sqlstate 22001 (string data right
--      truncation) and took 7 appointments, 1 clinical_episode and 1
--      clinical_record down with it as orphan references.
--   2. two rows the ledger calls `imported` whose target patient is gone
--      (source_id 356676, source_id 497015).
--   3. whether either is one row or the first of many.
--
-- ===========================================================================
-- IT PRINTS NO PATIENT DATA. NOT ONE FIELD.
-- ===========================================================================
-- CLAUDE.md's Fisiozero isolation rule is absolute for the final delivery, and
-- `migration_staging_rows.raw` IS the delivery, one parsed CSV row per record.
-- So every question here is asked as a LENGTH, a COUNT, a BOOLEAN or an ID.
-- `length(btrim(raw->>'nif'))` is the answer to "which field overflowed and by
-- how much"; `raw->>'nif'` would be a NIF on a screen, and is never selected.
-- The only strings this report prints are COLUMN NAMES, SQLSTATES and its own
-- labels. Section 6 is the mechanical proof of that claim.
--
-- ===========================================================================
-- HOW TO RUN
-- ===========================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/import/cb-recovery-diagnostics.sql
--
-- Paste the whole grid back. Every section is labelled and ordered; a section
-- that returns no rows prints a NONE line rather than nothing, because an empty
-- result and a broken query look identical.
-- ===========================================================================
\pset pager off
\pset format aligned
\pset title 'CB RECOVERY DIAGNOSTICS - read only'

WITH tenant AS (
  SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1
),

-- ---------------------------------------------------------------------------
-- THE THREE ROWS THIS FILE IS ABOUT, named once so a re-run on other ids is a
-- one-line edit rather than a search-and-replace through six sections.
-- ---------------------------------------------------------------------------
subject AS (
  SELECT * FROM (VALUES
    ('221754', 'FAILED 22001 - 9 child rows orphaned'),
    ('356676', 'ledger says imported, target absent'),
    ('497015', 'ledger says imported, target absent')
  ) AS v(source_id, why)
),

-- ---------------------------------------------------------------------------
-- 0. HEADER.
-- ---------------------------------------------------------------------------
s0 AS (
  SELECT 0 AS k, 0 AS k2,
         'CB RECOVERY DIAGNOSTICS  at=' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') ||
         'Z  tenant=' || (SELECT tenant_id::text FROM tenant) AS line
),

-- ---------------------------------------------------------------------------
-- 1. THE COLUMN LIMITS, READ FROM THE CATALOGUE RATHER THAN WRITTEN DOWN.
--
--    A 22001 is raised by a length limit, so the limits are the denominator of
--    every overflow figure below. Reading them here means section 2 cannot be
--    wrong about the threshold it is comparing against: if a column is widened
--    tomorrow, this section says so and section 2's arithmetic follows it.
--
--    `patients` has exactly FIVE length-bounded columns and every other text
--    column on it is unbounded `text`, which cannot raise 22001 at all. That is
--    what makes the candidate list short enough to decide.
-- ---------------------------------------------------------------------------
s1 AS (
  SELECT 1 AS k, row_number() OVER (ORDER BY column_name) AS k2,
         '1. LIMIT  patients.' || rpad(column_name, 22) ||
         ' varchar(' || character_maximum_length::text || ')' AS line
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'patients'
     AND character_maximum_length IS NOT NULL
),

-- ---------------------------------------------------------------------------
-- 2. WHICH FIELD OVERFLOWED, AND BY HOW MUCH. LENGTHS ONLY.
--
--    THE CANDIDATE SET IS TWO, NOT FIVE, and the reasoning is in the adapter:
--      sexo   -> patients.sex        varchar(16)  NORMALISED through SEX_MAP to
--                                                 'female'|'male'|... so it
--                                                 CANNOT exceed 16. Printed
--                                                 anyway - a candidate excluded
--                                                 by argument is still a
--                                                 candidate until it is measured.
--      telefone -> patients.phone    varchar(32)  NORMALISED to E.164 by
--                                                 normalizePhonePT (+351 plus 9
--                                                 digits = 13) or dropped to
--                                                 NULL. Cannot exceed 32.
--      nif      -> patients.nif      varchar(20)  RAW `row['nif'].trim()`.
--      codigo_postal -> postal_code  varchar(16)  RAW `row['codigo_postal'].trim()`.
--    phone_e164 varchar(16) is GENERATED ALWAYS from phone and yields at most 13
--    or NULL, so it cannot be the source either.
--
--    AND THE VALIDATOR CHECKS NO LENGTHS AT ALL. validateMigrationRecord tests
--    sourceId, fullName, dateOfBirth format and locationKeys being an array.
--    Nothing in the pipeline compares a string against a column width, which is
--    why this arrives as a 22001 at IMPORT time instead of a `validation_failed`
--    at VALIDATE time - and why one bad cell can orphan nine rows.
-- ---------------------------------------------------------------------------
s2 AS (
  SELECT 2 AS k, row_number() OVER (ORDER BY sub.source_id, f.col) AS k2,
         '2. LENGTH  source_id=' || sub.source_id ||
         '  raw.' || rpad(f.src_key, 15) ||
         ' -> patients.' || rpad(f.col, 12) ||
         ' len=' || lpad(coalesce(f.len::text, '(null)'), 6) ||
         '  limit=' || lpad(f.lim::text, 3) ||
         CASE WHEN f.len IS NOT NULL AND f.len > f.lim
              THEN '  *** OVERFLOWS BY ' || (f.len - f.lim)::text || ' ***'
              ELSE '  ok' END AS line
    FROM subject sub
    JOIN migration_staging_rows m
      ON m.source_id = sub.source_id AND m.entity_type = 'patient'
    JOIN tenant t ON m.tenant_id = t.tenant_id
   CROSS JOIN LATERAL (VALUES
       ('nif',           'nif',         length(btrim(m.raw->>'nif')),           20),
       ('codigo_postal', 'postal_code', length(btrim(m.raw->>'codigo_postal')), 16),
       ('sexo',          'sex',         length(btrim(m.raw->>'sexo')),          16),
       ('telefone',      'phone',       length(btrim(m.raw->>'telefone')),      32)
     ) AS f(src_key, col, len, lim)
),
s2none AS (
  SELECT 2 AS k, 100000 AS k2,
         '2. LENGTH  NONE - no staging row matched these source_ids in this tenant' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM subject sub
       JOIN migration_staging_rows m
         ON m.source_id = sub.source_id AND m.entity_type = 'patient'
       JOIN tenant t ON m.tenant_id = t.tenant_id
   )
),

-- ---------------------------------------------------------------------------
-- 3. IS IT ONE ROW OR A CLASS? The same two measurements over the WHOLE
--    delivery.
--
--    THIS IS THE SECTION THAT DECIDES WHAT TO FIX. One overflowing cell is a
--    data correction. Forty is a mapping defect, and the answer is a length
--    check in the validator (so the row fails at VALIDATE with a field name and
--    takes nothing with it) plus a decision about the value. The count is the
--    difference between those two answers and nobody can guess it.
-- ---------------------------------------------------------------------------
s3 AS (
  SELECT 3 AS k, f.ord AS k2,
         '3. DELIVERY-WIDE  raw.' || rpad(f.src_key, 15) ||
         ' longer than ' || lpad(f.lim::text, 3) || ': ' ||
         lpad(count(*) FILTER (WHERE f.len > f.lim)::text, 6) ||
         ' of ' || lpad(count(*) FILTER (WHERE f.len IS NOT NULL)::text, 6) ||
         ' non-null   max_len=' || lpad(coalesce(max(f.len)::text, '0'), 5) AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
   CROSS JOIN LATERAL (VALUES
       (1, 'nif',           length(btrim(m.raw->>'nif')),           20),
       (2, 'codigo_postal', length(btrim(m.raw->>'codigo_postal')), 16),
       (3, 'sexo',          length(btrim(m.raw->>'sexo')),          16),
       (4, 'telefone',      length(btrim(m.raw->>'telefone')),      32)
     ) AS f(ord, src_key, len, lim)
   WHERE m.entity_type = 'patient'
   GROUP BY f.ord, f.src_key, f.lim
),
s3none AS (
  SELECT 3 AS k, 100000 AS k2,
         '3. DELIVERY-WIDE  NONE - the ledger holds no patient rows for this tenant' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM migration_staging_rows m
       JOIN tenant t ON m.tenant_id = t.tenant_id
      WHERE m.entity_type = 'patient'
   )
),

-- ---------------------------------------------------------------------------
-- 4. THE LEDGER VERDICT ON EACH SUBJECT, AND ITS ERROR CODE.
--
--    `error_detail` is PII-free by contract (staging.ts: "field names and codes
--    only, never values"), so it is safe to print whole. It is the only place
--    the sqlstate survives.
-- ---------------------------------------------------------------------------
s4 AS (
  SELECT 4 AS k, row_number() OVER (ORDER BY m.entity_type::text, m.source_id) AS k2,
         '4. LEDGER  source_id=' || rpad(m.source_id, 10) ||
         ' ' || rpad(m.entity_type::text, 18) ||
         ' status=' || rpad(m.status::text, 10) ||
         ' target=' || rpad(coalesce(m.imported_entity_id::text, '(null)'), 38) ||
         ' updated=' || to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') ||
         ' error=' || coalesce(m.error_detail::text, '(none)') AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
   WHERE m.source_id IN (SELECT source_id FROM subject)
      OR m.raw->>'id_paciente' IN (SELECT source_id FROM subject)
),
s4none AS (
  SELECT 4 AS k, 100000 AS k2,
         '4. LEDGER  NONE - no ledger row carries any of those source_ids' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM migration_staging_rows m
       JOIN tenant t ON m.tenant_id = t.tenant_id
      WHERE m.source_id IN (SELECT source_id FROM subject)
         OR m.raw->>'id_paciente' IN (SELECT source_id FROM subject)
   )
),

-- ---------------------------------------------------------------------------
-- 5. WHAT HAPPENED TO A TARGET ROW THE LEDGER STILL CLAIMS.
--
--    ===================================================================
--    THE FOUR FATES, AND ONLY ONE OF THEM IS A LOSS
--    ===================================================================
--    cb-reconciliation.sql section 5 counts a patient as GONE when there is no
--    row with `deleted_at IS NULL`. That is the right test for "can reception
--    find them", and it is the WRONG test for "was anything lost", because
--    THREE different fates satisfy it:
--
--      MERGED     `merged_into_id` is set. merge_patients (0005) NEVER hard
--                 deletes: it re-points appointments, episodes, records,
--                 attachments, invoices and patient_locations onto the survivor
--                 and then sets merged_into_id + deleted_at on the loser. The
--                 history is not lost, it is on the survivor. A receptionist
--                 merging two duplicates produces exactly this, and it is
--                 CORRECT behaviour that section 5 reports as a missing row.
--      SOFT       `deleted_at` set, `merged_into_id` null. Recoverable from the
--                 owner-only Pacientes eliminados screen. Nothing is lost.
--      HARD       no row at all. deletePatientHard (patients/actions.ts) or
--                 cleanup-test-patients.sql. THIS is a loss, and it is the only
--                 one that needs a re-import.
--      NEVER      no row and no audit trace of a delete: the row was never
--                 committed, and the ledger was written by a path that did not
--                 verify it. See section 5b.
--
--    The audit log is joined because it is the only place that distinguishes
--    HARD from NEVER: a hard delete writes `patient.delete_hard`, a merge writes
--    `patient.merge`. No audit row and no patient row means nobody deleted it.
-- ---------------------------------------------------------------------------
s5 AS (
  SELECT 5 AS k, row_number() OVER (ORDER BY m.source_id) AS k2,
         '5. FATE  source_id=' || rpad(m.source_id, 10) ||
         ' target=' || m.imported_entity_id::text ||
         '  verdict=' ||
         CASE
           WHEN p.id IS NULL THEN
             CASE WHEN EXISTS (
                    SELECT 1 FROM public.audit_log al
                     WHERE al.entity_id = m.imported_entity_id
                       AND al.action IN ('patient.delete_hard','patient.delete','patient.merge')
                  ) THEN 'HARD DELETED (audit row present)'
                  ELSE 'NEVER COMMITTED or deleted with no audit row - see 5b'
             END
           WHEN p.merged_into_id IS NOT NULL THEN 'MERGED into ' || p.merged_into_id::text || ' - NOT A LOSS'
           WHEN p.deleted_at IS NOT NULL THEN 'SOFT DELETED ' ||
                to_char(p.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' - recoverable'
           ELSE 'ALIVE - section 5 of the reconciliation was reading a stale grid'
         END AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
    LEFT JOIN public.patients p ON p.id = m.imported_entity_id
   WHERE m.entity_type = 'patient'
     AND m.status = 'imported'
     AND m.imported_entity_id IS NOT NULL
     AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
),
s5none AS (
  SELECT 5 AS k, 100000 AS k2,
         '5. FATE  NONE - every imported patient target row is alive' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM migration_staging_rows m
       JOIN tenant t ON m.tenant_id = t.tenant_id
       LEFT JOIN public.patients p ON p.id = m.imported_entity_id
      WHERE m.entity_type = 'patient' AND m.status = 'imported'
        AND m.imported_entity_id IS NOT NULL
        AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
   )
),

-- ---------------------------------------------------------------------------
-- 5b. DOES THE HISTORY STILL EXIST, WHEREVER THE PATIENT WENT?
--
--     THE QUESTION THE FATE ALONE DOES NOT ANSWER. A MERGED patient's rows were
--     re-pointed onto the survivor, so counting rows that still reference the
--     ORIGINAL uuid returns zero for a perfectly healthy merge. What matters is
--     whether the child rows exist SOMEWHERE, and for a merge the answer is on
--     `merged_into_id`. This counts both.
--
--     A NONZERO COUNT AGAINST A DEAD UUID IS THE ALARMING CASE and it has its
--     own name: appointments.patient_id carries a FK to patients.id, so rows
--     pointing at a uuid with no patients row CANNOT exist. If this section
--     ever prints one, the FK is gone.
-- ---------------------------------------------------------------------------
s5b AS (
  SELECT 5 AS k, 200000 + row_number() OVER (ORDER BY m.source_id) AS k2,
         '5b. HISTORY  source_id=' || rpad(m.source_id, 10) ||
         '  on the ORIGINAL uuid: appts=' ||
         (SELECT count(*) FROM public.appointments a WHERE a.patient_id = m.imported_entity_id)::text ||
         ' episodes=' ||
         (SELECT count(*) FROM public.clinical_episodes e WHERE e.patient_id = m.imported_entity_id)::text ||
         ' records=' ||
         (SELECT count(*) FROM public.clinical_records c WHERE c.patient_id = m.imported_entity_id)::text ||
         CASE WHEN p.merged_into_id IS NOT NULL THEN
           '   on the SURVIVOR: appts=' ||
           (SELECT count(*) FROM public.appointments a WHERE a.patient_id = p.merged_into_id)::text ||
           ' episodes=' ||
           (SELECT count(*) FROM public.clinical_episodes e WHERE e.patient_id = p.merged_into_id)::text ||
           ' records=' ||
           (SELECT count(*) FROM public.clinical_records c WHERE c.patient_id = p.merged_into_id)::text
         ELSE '' END AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
    LEFT JOIN public.patients p ON p.id = m.imported_entity_id
   WHERE m.entity_type = 'patient'
     AND m.status = 'imported'
     AND m.imported_entity_id IS NOT NULL
     AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
),

-- ---------------------------------------------------------------------------
-- 5c. THE AUDIT TRACE, so a fate is READ rather than inferred.
-- ---------------------------------------------------------------------------
s5c AS (
  SELECT 5 AS k, 300000 + row_number() OVER (ORDER BY al.created_at) AS k2,
         '5c. AUDIT  ' || to_char(al.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') ||
         '  action=' || rpad(al.action, 22) ||
         ' entity=' || coalesce(al.entity_id::text, '(null)') ||
         ' actor=' || coalesce(al.actor_user_id::text, '(null)') AS line
    FROM public.audit_log al
    JOIN tenant t ON al.tenant_id = t.tenant_id
   WHERE al.entity_id IN (
     SELECT m.imported_entity_id FROM migration_staging_rows m
       JOIN tenant t2 ON m.tenant_id = t2.tenant_id
       LEFT JOIN public.patients p ON p.id = m.imported_entity_id
      WHERE m.entity_type = 'patient' AND m.status = 'imported'
        AND m.imported_entity_id IS NOT NULL
        AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
   )
   ORDER BY al.created_at
   LIMIT 200
),
s5cnone AS (
  SELECT 5 AS k, 399999 AS k2,
         '5c. AUDIT  NONE - no audit row mentions any of those target uuids. ' ||
         'For a HARD verdict that means the delete left no trace; for NEVER COMMITTED it is expected.' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM public.audit_log al
       JOIN tenant t ON al.tenant_id = t.tenant_id
      WHERE al.entity_id IN (
        SELECT m.imported_entity_id FROM migration_staging_rows m
          JOIN tenant t2 ON m.tenant_id = t2.tenant_id
          LEFT JOIN public.patients p ON p.id = m.imported_entity_id
         WHERE m.entity_type = 'patient' AND m.status = 'imported'
           AND m.imported_entity_id IS NOT NULL
           AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
      )
   )
),

-- ---------------------------------------------------------------------------
-- 6. THE ORPHANS 221754 TOOK WITH IT, ITEMISED.
--
--     A child row resolves its parent through the LEDGER (`resolveRef` reads
--     the imported patient's uuid). A patient that never imported has no entry,
--     so every child raises `unresolved_reference` and fails INDIVIDUALLY -
--     which is why one bad cell produced nine failures rather than one.
--
--     THE GOOD NEWS IS IN THE SHAPE OF THAT FAILURE. They failed at resolution,
--     BEFORE any write, so nothing partial landed. Re-staging and re-validating
--     the delivery after the patient imports resolves all nine on the next run:
--     stageRows' ON CONFLICT resets a non-imported row to `pending`, validate
--     moves it to `validated`, and the import picks it up. That is the same
--     recovery that returned 105 rows on 2026-08-26.
-- ---------------------------------------------------------------------------
s6 AS (
  SELECT 6 AS k, row_number() OVER (ORDER BY m.entity_type::text, m.source_id) AS k2,
         '6. ORPHAN  ' || rpad(m.entity_type::text, 18) ||
         ' source_id=' || rpad(m.source_id, 18) ||
         ' status=' || rpad(m.status::text, 10) ||
         ' error=' || coalesce(m.error_detail->>'code', '(none)') AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
   WHERE m.status = 'failed'
     AND m.entity_type <> 'patient'
     AND m.error_detail->>'code' = 'unresolved_reference'
   ORDER BY m.entity_type::text, m.source_id
   LIMIT 200
),
s6none AS (
  SELECT 6 AS k, 100000 AS k2,
         '6. ORPHAN  NONE - no child row is failed on an unresolved reference' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM migration_staging_rows m
       JOIN tenant t ON m.tenant_id = t.tenant_id
      WHERE m.status = 'failed' AND m.entity_type <> 'patient'
        AND m.error_detail->>'code' = 'unresolved_reference'
   )
),

-- ---------------------------------------------------------------------------
-- 7. THE FAILURE CLASSES ACROSS THE WHOLE LEDGER, so the three findings above
--    are read against what else is in there rather than on their own.
-- ---------------------------------------------------------------------------
s7 AS (
  SELECT 7 AS k, row_number() OVER (ORDER BY count(*) DESC, coalesce(m.error_detail->>'code','(none)')) AS k2,
         '7. FAILURES  ' || rpad(coalesce(m.error_detail->>'code', '(none)'), 26) ||
         ' ' || rpad(m.entity_type::text, 18) || ' n=' || lpad(count(*)::text, 6) AS line
    FROM migration_staging_rows m
    JOIN tenant t ON m.tenant_id = t.tenant_id
   WHERE m.status = 'failed'
   GROUP BY m.error_detail->>'code', m.entity_type
),
s7none AS (
  SELECT 7 AS k, 100000 AS k2,
         '7. FAILURES  NONE - the ledger holds no failed rows at all' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM migration_staging_rows m
       JOIN tenant t ON m.tenant_id = t.tenant_id
      WHERE m.status = 'failed'
   )
)

SELECT line
  FROM (
    SELECT k, k2, line FROM s0
    UNION ALL SELECT k, k2, line FROM s1
    UNION ALL SELECT k, k2, line FROM s2
    UNION ALL SELECT k, k2, line FROM s2none
    UNION ALL SELECT k, k2, line FROM s3
    UNION ALL SELECT k, k2, line FROM s3none
    UNION ALL SELECT k, k2, line FROM s4
    UNION ALL SELECT k, k2, line FROM s4none
    UNION ALL SELECT k, k2, line FROM s5
    UNION ALL SELECT k, k2, line FROM s5none
    UNION ALL SELECT k, k2, line FROM s5b
    UNION ALL SELECT k, k2, line FROM s5c
    UNION ALL SELECT k, k2, line FROM s5cnone
    UNION ALL SELECT k, k2, line FROM s6
    UNION ALL SELECT k, k2, line FROM s6none
    UNION ALL SELECT k, k2, line FROM s7
    UNION ALL SELECT k, k2, line FROM s7none
  ) report
 ORDER BY k, k2;
