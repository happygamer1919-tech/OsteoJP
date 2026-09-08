-- ===========================================================================
-- RECOVER PATIENT source_id 221754 AND ITS NINE DEPENDENTS.
-- ===========================================================================
-- AUTHORED, NOT RUN. Owner-executed against production. This lane has no
-- production connection (SR-50 suspended for applies).
--
-- ===========================================================================
-- THE SCOPE IS ONE PATIENT. IT WAS THREE UNTIL 2026-09-08.
-- ===========================================================================
-- cb-reconciliation.sql section 5 listed THREE subjects: 221754, 356676 and
-- 497015. Only 221754 is an import failure.
--
--   221754   FAILED at import with sqlstate 22001. `codigo_postal` is 17
--            characters against `patients.postal_code varchar(16)` - OVER BY
--            ONE - and it is 1 of 16406 rows delivery-wide. A single cell.
--   356676   HARD DELETED by a human, 2026-09-02 or 2026-09-08.
--   497015   HARD DELETED by a human, same window.
--
-- THREE HARD DELETES BY TWO DIFFERENT HUMAN ACTORS account for the other two,
-- and a hard delete is not a thing this file undoes. They are somebody's
-- decision, they are recorded in `audit_log` as `patient.hard_delete`, and
-- re-importing them would reverse an action a person took on purpose.
--
-- THE DIAGNOSTIC SAID OTHERWISE AND IT WAS WRONG. Section 5 tested for
-- `patient.delete_hard` - the word order reversed - so it matched nothing and
-- printed "NEVER COMMITTED" for all three, while section 5c listed their
-- hard-delete audit rows four lines below. That is corrected in
-- cb-recovery-diagnostics.sql and policed by its test.
--
-- ===========================================================================
-- THE NINE DEPENDENTS ARE NOT SEPARATELY BROKEN
-- ===========================================================================
-- 7 appointments, 1 clinical_episode and 1 clinical_record failed with
-- `unresolved_reference`. They resolve their parent THROUGH THE LEDGER
-- (`resolveRef` reads the imported patient's uuid), and the parent has no ledger
-- entry, so every child failed at RESOLUTION - before any write. Nothing partial
-- landed. Fix the parent and they resolve on the next ordinary run.
--
-- That is the same recovery that returned 105 rows on 2026-08-26: re-stage,
-- re-validate, import. No child is touched by hand here.
--
-- ===========================================================================
-- WHICH TO CHANGE: THE VALUE, NOT THE COLUMN.
-- ===========================================================================
-- Widening `postal_code` to hold 17 characters would preserve, forever, a cell
-- that is not a postcode - a Portuguese one is `NNNN-NNN`, eight characters -
-- into a column the invoicing and declaration templates print. One cell in
-- 16406 is a DATA CORRECTION, and the correction belongs in the delivery, not
-- in the schema.
--
-- AND THE STRUCTURAL FIX IS NEITHER. `validateMigrationRecord` checks NO string
-- lengths at all - only sourceId, fullName, the date format and that
-- locationKeys is an array. That is why this arrived as a 22001 at IMPORT time
-- instead of a `validation_failed` at VALIDATE time, and why one bad cell took
-- nine rows down with it. Carded separately as
-- MIG-validator-checks-no-string-lengths; not fixed here, because this file is
-- a data correction and that is a code change.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. PREVIEW. READ ONLY. Run first and read every number.
--
--   IT PRINTS NO POSTCODE AND NO PATIENT. `codigo_postal` is personal data on
--   an unimported row; its LENGTH is the fact this step needs.
-- ---------------------------------------------------------------------------
\echo '--- STEP 1: PREVIEW (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1)
SELECT m.source_id,
       m.status::text                                       AS ledger_status,
       coalesce(m.imported_entity_id::text,'(null)')         AS target,
       length(btrim(m.raw->>'codigo_postal'))                AS postal_len,
       16                                                    AS postal_limit,
       length(btrim(m.raw->>'codigo_postal')) - 16           AS over_by,
       coalesce(m.error_detail->>'code','(none)')            AS error_code,
       coalesce(m.error_detail->>'sqlstate','(none)')        AS sqlstate
  FROM migration_staging_rows m, tenant t
 WHERE m.tenant_id = t.tenant_id
   AND m.entity_type = 'patient'
   AND m.source_id = '221754';

-- The nine, so STEP 4 has a number to check against.
\echo '--- the dependents that failed on the unresolved parent ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1)
SELECT m.entity_type::text AS entity_type, count(*) AS n
  FROM migration_staging_rows m, tenant t
 WHERE m.tenant_id = t.tenant_id
   AND m.status = 'failed'
   AND m.error_detail->>'code' = 'unresolved_reference'
 GROUP BY m.entity_type::text
 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- STEP 2. THE CORRECTION, IN THE DELIVERY, NOT IN THE DATABASE.
--
--   ==================================================================
--   THIS STEP IS NOT SQL, AND THAT IS DELIBERATE.
--   ==================================================================
--   The correct fix is to repair the CELL in the Fisiozero source and re-run the
--   ordinary import, so the delivery and the database agree and a future
--   re-import produces the same result. Editing `migration_staging_rows.raw` in
--   place would make this database disagree with the source for ever, and the
--   next full re-stage would silently revert it.
--
--   WHAT THE OWNER DOES:
--     1. In the delivery, find the patients row with `id_paciente = 221754`.
--     2. `codigo_postal` holds 17 characters. A Portuguese postcode is `NNNN-NNN`
--        - eight. Keep the postcode; move whatever else is in the cell (a
--        locality, a note) into `morada`, which is unbounded `text`.
--     3. Re-run the ordinary import. `stageRows` resets a non-imported row to
--        `pending`, validate moves it to `validated`, and the importer inserts
--        it - taking the nine dependents with it, because `resolveRef` can now
--        find the parent.
--
--   THE COMMAND IS THE ORDINARY ONE. There is no special path and no --force:
--   the recovery IS a normal run over a corrected delivery.
--
--   IF THE DELIVERY CANNOT BE EDITED, the fallback is STEP 2b - and it is a
--   fallback, not an equal option.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP 2b. FALLBACK ONLY. Correct the staged cell in place.
--
--   RUN THIS ONLY IF THE DELIVERY IS NOT EDITABLE, and know what it costs: the
--   next full re-stage overwrites `raw` from the source and undoes it, so this
--   is a correction with a half-life. It is written as a TRANSACTION with its
--   own verification so it cannot half-apply.
--
--   IT TRUNCATES NOTHING BLINDLY. `left(...,8)` would keep the first eight
--   characters whatever they are; this takes the postcode BY PATTERN and refuses
--   the row if the pattern is not there, because a cell that does not start with
--   a Portuguese postcode is not a case this file understands.
--
--   PROVED ON A LANE, BOTH ARMS, BEFORE IT WAS HANDED OVER:
--     '2795-242 Carnaxid'   (17 chars, the real shape)  -> UPDATE 1,
--                            postal_len 17 -> 8, status failed -> pending,
--                            the remainder appended to `morada`.
--     'sem codigo postal ok' (20 chars, no postcode)    -> UPDATE 0,
--                            the cell UNCHANGED at 20 and status still `failed`.
--
--   IT COMMITS ITS OWN TRANSACTION, AND THAT BIT ME WHILE PROVING IT. The block
--   carries its own BEGIN/COMMIT, so wrapping the whole file in an outer
--   transaction to "try it safely" does NOT make it safe: the inner COMMIT
--   lands and the outer ROLLBACK has nothing left to undo. If you want a dry
--   run, comment out the COMMIT and put a ROLLBACK in its place - do not rely
--   on an enclosing transaction.
-- ---------------------------------------------------------------------------
\echo '--- STEP 2b: FALLBACK, in-place correction (only if the delivery cannot be edited) ---'
-- BEGIN;
--   WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
--   src AS (
--     SELECT m.id,
--            substring(btrim(m.raw->>'codigo_postal') from '^[0-9]{4}-[0-9]{3}') AS postcode,
--            btrim(regexp_replace(btrim(m.raw->>'codigo_postal'), '^[0-9]{4}-[0-9]{3}', '')) AS remainder,
--            btrim(coalesce(m.raw->>'morada','')) AS morada
--       FROM migration_staging_rows m, tenant t
--      WHERE m.tenant_id = t.tenant_id AND m.entity_type='patient' AND m.source_id='221754'
--   )
--   UPDATE migration_staging_rows m
--      SET raw = m.raw
--                || jsonb_build_object('codigo_postal', src.postcode)
--                || jsonb_build_object('morada',
--                     btrim(src.morada || CASE WHEN src.remainder <> '' THEN ' ' || src.remainder ELSE '' END)),
--          status = 'pending'::migration_staging_status,
--          error_detail = NULL,
--          updated_at = now()
--     FROM src
--    WHERE m.id = src.id
--      AND src.postcode IS NOT NULL;   -- refuses a cell without a PT postcode
--   -- MUST report UPDATE 1. UPDATE 0 means the pattern did not match: stop,
--   -- and read the cell length again - the shape is not what this file assumed.
--   WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1)
--   SELECT length(btrim(raw->>'codigo_postal')) AS postal_len_now,   -- must be 8
--          status::text                          AS status_now       -- must be 'pending'
--     FROM migration_staging_rows m, tenant t
--    WHERE m.tenant_id=t.tenant_id AND m.entity_type='patient' AND m.source_id='221754';
-- COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 3. RUN THE ORDINARY IMPORT. Not in this file - it is the runner, and it
--         requires the live phrase per CLAUDE.md:
--
--           IMPORT FISIOZERO INTO PRODUCTION
--
--         typed once per window, IN ADDITION to --apply. `--apply` alone is
--         refused. Exit codes: 0 OK, 1 FAILED, 2 BAD_INVOCATION.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP 4. VERIFY. READ ONLY. Run after the import.
--
--   ALL FOUR NUMBERS MUST READ AS STATED OR THE RECOVERY DID NOT HAPPEN.
-- ---------------------------------------------------------------------------
\echo '--- STEP 4: VERIFY (read only) ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
led AS (
  SELECT m.* FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id AND m.entity_type='patient' AND m.source_id='221754'
)
SELECT
  -- 1. the ledger says imported
  (SELECT status::text FROM led)                                          AS ledger_status,   -- 'imported'
  -- 2. and the target row actually EXISTS. The ledger saying imported is not
  --    the same claim - MIG-importer-update-launders-a-missing-row is the whole
  --    reason these are two assertions and not one.
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM public.patients p
                             WHERE p.id = (SELECT imported_entity_id FROM led)
                               AND p.deleted_at IS NULL)
               THEN 'present' ELSE 'ABSENT' END)                           AS target_row,      -- 'present'
  -- 3. the postcode landed inside the column
  (SELECT coalesce(length(p.postal_code)::text,'(null)') FROM public.patients p
    WHERE p.id = (SELECT imported_entity_id FROM led))                     AS postal_len,      -- <= 16
  -- 4. and the nine came with it
  (SELECT count(*) FROM migration_staging_rows m, tenant t
    WHERE m.tenant_id=t.tenant_id AND m.status='failed'
      AND m.error_detail->>'code'='unresolved_reference')                  AS orphans_left;    -- 0

-- The nine, itemised, so `orphans_left = 0` is not the only evidence.
\echo '--- the dependents, after ---'
WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
led AS (SELECT imported_entity_id AS pid FROM migration_staging_rows m, tenant t
         WHERE m.tenant_id=t.tenant_id AND m.entity_type='patient' AND m.source_id='221754')
SELECT 'appointments'      AS relation, count(*) AS n FROM public.appointments      WHERE patient_id = (SELECT pid FROM led)
UNION ALL
SELECT 'clinical_episodes', count(*) FROM public.clinical_episodes WHERE patient_id = (SELECT pid FROM led)
UNION ALL
SELECT 'clinical_records',  count(*) FROM public.clinical_records  WHERE patient_id = (SELECT pid FROM led);
