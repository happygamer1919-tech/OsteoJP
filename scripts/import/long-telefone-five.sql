-- ===========================================================================
-- THE FIVE LONG `telefone` CELLS. READ ONLY. Owner-run, production.
-- ===========================================================================
-- FOUND BY THE OVERFLOW SWEEP, NOT REPORTED BY ANYTHING ELSE, AND THAT IS THE
-- WHOLE REASON THIS FILE EXISTS.
--
-- cb-recovery-diagnostics.sql section 3 measures every bounded column
-- delivery-wide. It found `raw.telefone` longer than 32 on 5 of 16406 rows, max
-- 35 - and unlike `codigo_postal`, THOSE FIVE ROWS DID NOT FAIL. They imported
-- cleanly, because `telefone` never reaches `patients.phone` as typed:
--
--   normalizePhones() splits the cell on `;`, normalises each part through
--   normalizePhonePT, keeps the FIRST that resolves, and returns null when NONE
--   of them do. The extras are appended to `notes` as "Outros contactos: ...".
--
-- SO A 35-CHARACTER CELL IS NOT A 35-CHARACTER PHONE NUMBER. It is almost
-- certainly TWO numbers in one cell. The import's own counters
-- (`unresolvablePhones`, `noPortalLogin`) count these in aggregate and name
-- nobody, so up to five patients could have landed with NO phone number at all
-- and nothing on any screen would say which.
--
-- A PATIENT WITH NO PHONE CANNOT LOG IN TO THE PORTAL (OTP is phone-only) AND
-- CANNOT RECEIVE A REMINDER. That is why five rows are worth a read.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/import/long-telefone-five.sql
--
-- ===========================================================================
-- IT PRINTS PATIENT NUMBERS AND NOTHING ELSE THAT IDENTIFIES ANYONE.
-- ===========================================================================
-- `patient_number` is the identifier the owner looks a person up by, and it is
-- the ONLY one here. No name, no NIF, and - the point of the file - NO PHONE
-- NUMBER, in either its raw or its normalised form. Every fact about the phone
-- below is a LENGTH, a COUNT or a BOOLEAN. `position(';' in ...)` tests a shape
-- and returns an integer; it never projects the cell.
-- ===========================================================================
\pset pager off
\pset format aligned
\pset title 'LONG telefone CELLS - read only, no phone number is printed'

WITH tenant AS (SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1),
long AS (
  SELECT m.source_id,
         m.imported_entity_id,
         m.status::text                                        AS ledger_status,
         length(btrim(m.raw->>'telefone'))                     AS cell_len,
         -- HOW MANY PARTS the adapter would have split it into. A cell with one
         -- part and 35 characters is a different problem from a cell with two.
         array_length(
           array_remove(
             array(SELECT btrim(x) FROM unnest(string_to_array(m.raw->>'telefone', ';')) AS x),
             ''),
           1)                                                  AS parts,
         (position(';' in m.raw->>'telefone') > 0)             AS holds_two
    FROM migration_staging_rows m, tenant t
   WHERE m.tenant_id = t.tenant_id
     AND m.entity_type = 'patient'
     AND length(btrim(m.raw->>'telefone')) > 32
)

-- ---------------------------------------------------------------------------
-- 1. THE FIVE, ONE LINE EACH.
--
--    `phone_is_null` IS THE ANSWER THE FILE EXISTS FOR. If it is false the
--    patient is fine - one of the numbers in the cell resolved and they are
--    reachable. If it is TRUE, nothing in that cell was a usable Portuguese
--    number and that patient has no phone, no portal login and no reminders.
--
--    `notes_has_outros` distinguishes the two harmless shapes from each other:
--    TRUE means a SECOND number resolved and was preserved in notes, so nothing
--    was thrown away. FALSE with a non-null phone means the cell held one long
--    but valid number.
-- ---------------------------------------------------------------------------
SELECT 'row'                                                   AS kind,
       coalesce(p.patient_number::text, '(no target row)')      AS patient_number,
       l.cell_len,
       coalesce(l.parts, 0)                                     AS parts,
       l.holds_two,
       l.ledger_status,
       CASE WHEN p.id IS NULL THEN '(no target row)'
            ELSE (p.phone IS NULL)::text END                    AS phone_is_null,
       CASE WHEN p.id IS NULL THEN '-'
            ELSE (p.phone_e164 IS NULL)::text END               AS e164_is_null,
       -- coalesce, because a NULL `notes` makes LIKE return NULL and the grid
       -- would print a BLANK for the very row that matters most - the patient
       -- with no phone and no notes. A blank is a cell the reader has to
       -- interpret; `false` is an answer.
       CASE WHEN p.id IS NULL THEN '-'
            ELSE coalesce((p.notes LIKE '%Outros contactos:%')::text, 'false') END AS notes_has_outros
  FROM long l
  LEFT JOIN public.patients p ON p.id = l.imported_entity_id

UNION ALL

-- ---------------------------------------------------------------------------
-- 2. THE VERDICT LINE, so the grid answers the question without arithmetic.
-- ---------------------------------------------------------------------------
SELECT 'TOTAL',
       count(*)::text || ' long cells',
       max(l.cell_len),
       count(*) FILTER (WHERE l.holds_two),
       NULL,
       '',
       count(*) FILTER (WHERE p.id IS NOT NULL AND p.phone IS NULL)::text || ' with NO phone',
       count(*) FILTER (WHERE p.id IS NOT NULL AND p.phone_e164 IS NULL)::text || ' with no e164',
       count(*) FILTER (WHERE p.id IS NOT NULL AND p.notes LIKE '%Outros contactos:%')::text || ' kept extras'
  FROM long l
  LEFT JOIN public.patients p ON p.id = l.imported_entity_id

UNION ALL

-- ---------------------------------------------------------------------------
-- 3. THE CONTROL. A section that returns nothing looks the same whether it
--    works or not, and this one is EXPECTED to return five rows. If the count
--    here is 0, either the sweep's finding does not reproduce or the raw key is
--    not `telefone` on this delivery - both worth knowing before concluding
--    that nobody is affected.
-- ---------------------------------------------------------------------------
SELECT 'CONTROL',
       (SELECT count(*)::text FROM migration_staging_rows m, tenant t
         WHERE m.tenant_id = t.tenant_id AND m.entity_type = 'patient') || ' patient rows in the ledger',
       (SELECT max(length(btrim(m.raw->>'telefone'))) FROM migration_staging_rows m, tenant t
         WHERE m.tenant_id = t.tenant_id AND m.entity_type = 'patient'),
       (SELECT count(*) FROM migration_staging_rows m, tenant t
         WHERE m.tenant_id = t.tenant_id AND m.entity_type = 'patient'
           AND m.raw->>'telefone' IS NOT NULL),
       NULL, '',
       'expect 5 rows above', '', '';
