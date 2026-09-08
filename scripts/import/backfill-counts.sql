-- ===========================================================================
-- BACKFILL COUNTS. READ ONLY. Run this FIRST and paste the grid to strategy.
-- ===========================================================================
-- Strategy ruled the two location backfills on 2026-09-08 and gated the WRITE
-- on these counts:
--
--   A  patient_locations, idempotent, ON CONFLICT DO NOTHING, changes no screen.
--   B  primary_location_id, derived ONLY where every one of a patient's
--      appointments agrees on a single location. The rest are left for the desk.
--
-- NEITHER BACKFILL RUNS UNTIL THIS GRID IS READ. That is the whole reason this
-- file is separate from the two it precedes: a backfill whose row count nobody
-- predicted is a backfill nobody can check afterwards.
--
--   set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && \
--   set +o allexport && \
--   node scripts/assert-production-target.mjs && \
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/import/backfill-counts.sql
--
-- ===========================================================================
-- IT PRINTS COUNTS AND NEVER A PERSON. Standing rule 7.
-- ===========================================================================
-- Every column below is an integer or a label. No name, no NIF, no note, and
-- no id that resolves to a patient. Section 4 prints LOCATION names, which are
-- clinic names and not personal data.
--
-- ===========================================================================
-- WHY B IS THE ONE THAT NEEDS A RULING AND A IS NOT
-- ===========================================================================
-- Nothing reads `patient_locations` (verified 2026-09-08: no RLS policy names
-- it, no query selects from it; the app only ever DELETEs from it). So A moves
-- no patient onto or off any screen. It exists to make the junction table agree
-- with the column beside it before anything starts reading it.
--
-- `primary_location_id` is one of the TWO bases PL-09 scopes a patient by, so B
-- CHANGES WHO SEES WHOM. Every row it writes puts a patient onto a clinic's
-- list. That is why it derives only from unanimous evidence and why the
-- ambiguous and the evidence-free rows are counted separately below rather than
-- being given a default.
-- ===========================================================================
\pset pager off
\pset format aligned
\pset title 'BACKFILL COUNTS - read only, nothing is written'

WITH tenant AS (
  SELECT id AS tenant_id FROM public.tenants ORDER BY created_at LIMIT 1
),

-- Live patients only. A soft-deleted or merged patient is gone to reception
-- anyway and neither backfill should resurrect one onto a list.
live AS (
  SELECT p.id, p.tenant_id, p.primary_location_id
    FROM public.patients p, tenant t
   WHERE p.tenant_id = t.tenant_id
     AND p.deleted_at IS NULL
),

-- ---------------------------------------------------------------------------
-- THE APPOINTMENT EVIDENCE, TWO WAYS, AND THE DIFFERENCE IS A DECISION.
--
--   primary_only   the patient was the FIRST participant (appointments.patient_id)
--   either         first OR second (patient_2_id) - a dual-participant session
--
-- `patientLocationScope` and 0047's policy BOTH count the second participant, so
-- `either` is the definition the product already uses to decide visibility. It
-- is also the wider set, so it derives a clinic for more people. Both are
-- printed because widening the basis is a judgement, not an obvious default.
-- ---------------------------------------------------------------------------
appts_primary AS (
  SELECT a.patient_id AS pid, a.location_id
    FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_id IS NOT NULL
),
appts_either AS (
  SELECT a.patient_id AS pid, a.location_id
    FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_id IS NOT NULL
  UNION ALL
  SELECT a.patient_2_id, a.location_id
    FROM public.appointments a, tenant t
   WHERE a.tenant_id = t.tenant_id AND a.patient_2_id IS NOT NULL
),

agree_primary AS (
  SELECT pid, count(DISTINCT location_id) AS locs FROM appts_primary GROUP BY pid
),
agree_either AS (
  SELECT pid, count(DISTINCT location_id) AS locs FROM appts_either GROUP BY pid
),

-- ---------------------------------------------------------------------------
-- 0. HEADER
-- ---------------------------------------------------------------------------
s0 AS (
  SELECT 0 AS k, 0 AS k2,
         'BACKFILL COUNTS  at=' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') ||
         'Z  tenant=' || (SELECT tenant_id::text FROM tenant) AS line
),

-- ---------------------------------------------------------------------------
-- 1. THE DENOMINATOR. Every count below is a share of these.
-- ---------------------------------------------------------------------------
s1 AS (
  SELECT 1 AS k, 1 AS k2,
         '1. LIVE PATIENTS                      ' ||
         lpad((SELECT count(*)::text FROM live), 7) AS line
  UNION ALL
  SELECT 1, 2,
         '1. ...with primary_location_id SET    ' ||
         lpad((SELECT count(*)::text FROM live WHERE primary_location_id IS NOT NULL), 7)
  UNION ALL
  SELECT 1, 3,
         '1. ...with primary_location_id NULL   ' ||
         lpad((SELECT count(*)::text FROM live WHERE primary_location_id IS NULL), 7)
),

-- ---------------------------------------------------------------------------
-- 2. BACKFILL A. Exactly the rows A would insert.
--
--    `rows_to_insert` is what STEP 2 of backfill-A must report as
--    `INSERT 0 <n>`. Anything larger means rows were created between the two
--    commands and the run should be stopped and re-previewed.
-- ---------------------------------------------------------------------------
s2 AS (
  SELECT 2 AS k, 1 AS k2,
         '2. BACKFILL A  rows_to_insert         ' ||
         lpad((SELECT count(*)::text FROM live l
                WHERE l.primary_location_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM public.patient_locations pl
                                   WHERE pl.patient_id = l.id
                                     AND pl.location_id = l.primary_location_id)), 7) AS line
  UNION ALL
  -- The wider question, for context: how many live patients have NO link row at
  -- all. A closes the subset of these that HAVE a primary; the remainder is
  -- exactly B's population, which is why the two numbers belong side by side.
  SELECT 2, 2,
         '2. BACKFILL A  live patients with NO link row at all ' ||
         lpad((SELECT count(*)::text FROM live l
                WHERE NOT EXISTS (SELECT 1 FROM public.patient_locations pl
                                   WHERE pl.patient_id = l.id)), 7)
),

-- ---------------------------------------------------------------------------
-- 3. BACKFILL B. THE THREE COUNTS STRATEGY ASKED FOR.
--
--    They partition the primary_location_id IS NULL population exactly:
--      DERIVABLE   every appointment agrees on one location -> B writes it
--      AMBIGUOUS   appointments at more than one location   -> the desk decides
--      NO BASIS    no appointment at all                    -> nothing to derive
--    DERIVABLE + AMBIGUOUS + NO BASIS = the NULL count in section 1.
--    That identity is asserted in section 5; if it does not hold, the partition
--    has a hole and B must not run.
-- ---------------------------------------------------------------------------
s3 AS (
  SELECT 3 AS k, 1 AS k2,
         '3. B [primary participant only]  DERIVABLE (one location, unanimous) ' ||
         lpad((SELECT count(*)::text FROM live l JOIN agree_primary g ON g.pid = l.id
                WHERE l.primary_location_id IS NULL AND g.locs = 1), 7) AS line
  UNION ALL
  SELECT 3, 2,
         '3. B [primary participant only]  AMBIGUOUS (2+ locations, for the desk)' ||
         lpad((SELECT count(*)::text FROM live l JOIN agree_primary g ON g.pid = l.id
                WHERE l.primary_location_id IS NULL AND g.locs > 1), 6)
  UNION ALL
  SELECT 3, 3,
         '3. B [primary participant only]  NO BASIS (no appointment at all)     ' ||
         lpad((SELECT count(*)::text FROM live l
                WHERE l.primary_location_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM agree_primary g WHERE g.pid = l.id)), 7)
  UNION ALL
  SELECT 3, 10,
         '3. B [primary OR secondary]      DERIVABLE (one location, unanimous) ' ||
         lpad((SELECT count(*)::text FROM live l JOIN agree_either g ON g.pid = l.id
                WHERE l.primary_location_id IS NULL AND g.locs = 1), 7)
  UNION ALL
  SELECT 3, 11,
         '3. B [primary OR secondary]      AMBIGUOUS (2+ locations, for the desk)' ||
         lpad((SELECT count(*)::text FROM live l JOIN agree_either g ON g.pid = l.id
                WHERE l.primary_location_id IS NULL AND g.locs > 1), 6)
  UNION ALL
  SELECT 3, 12,
         '3. B [primary OR secondary]      NO BASIS (no appointment at all)     ' ||
         lpad((SELECT count(*)::text FROM live l
                WHERE l.primary_location_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM agree_either g WHERE g.pid = l.id)), 7)
),

-- ---------------------------------------------------------------------------
-- 4. WHERE B WOULD PUT THEM, per clinic. The shape of the change, not just its
--    size: a derivation that files 900 people at one clinic and 4 at the other
--    is a different decision from one that splits them evenly.
-- ---------------------------------------------------------------------------
s4 AS (
  SELECT 4 AS k, row_number() OVER (ORDER BY count(*) DESC, loc.name) AS k2,
         '4. B WOULD FILE  ' || rpad(loc.name, 28) || lpad(count(*)::text, 7) ||
         '  [primary OR secondary basis]' AS line
    FROM live l
    JOIN agree_either g ON g.pid = l.id AND g.locs = 1
    JOIN LATERAL (SELECT DISTINCT ae.location_id FROM appts_either ae WHERE ae.pid = l.id) one ON true
    JOIN public.locations loc ON loc.id = one.location_id
   WHERE l.primary_location_id IS NULL
   GROUP BY loc.name
),
s4none AS (
  SELECT 4 AS k, 100000 AS k2,
         '4. B WOULD FILE  NONE - no unplaced patient has a unanimous appointment location' AS line
   WHERE NOT EXISTS (
     SELECT 1 FROM live l JOIN agree_either g ON g.pid = l.id AND g.locs = 1
      WHERE l.primary_location_id IS NULL
   )
),

-- ---------------------------------------------------------------------------
-- 5. THE PARTITION IDENTITY. A guard on the ARITHMETIC, not on the data.
--
--    If DERIVABLE + AMBIGUOUS + NO BASIS does not equal the NULL population,
--    some patient is in none of the three or in two of them, and the three
--    counts strategy is about to rule on do not describe the set they claim to.
--    Printed as a verdict rather than left for the reader to add up.
-- ---------------------------------------------------------------------------
s5 AS (
  SELECT 5 AS k, 1 AS k2,
         '5. PARTITION CHECK [primary OR secondary]  ' ||
         CASE WHEN (
           (SELECT count(*) FROM live l JOIN agree_either g ON g.pid=l.id WHERE l.primary_location_id IS NULL AND g.locs=1)
         + (SELECT count(*) FROM live l JOIN agree_either g ON g.pid=l.id WHERE l.primary_location_id IS NULL AND g.locs>1)
         + (SELECT count(*) FROM live l WHERE l.primary_location_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM agree_either g WHERE g.pid=l.id))
         ) = (SELECT count(*) FROM live WHERE primary_location_id IS NULL)
         THEN 'OK - the three counts partition the NULL population exactly'
         ELSE 'FAIL - the three counts do NOT sum to the NULL population. DO NOT RUN B.' END AS line
),

-- ---------------------------------------------------------------------------
-- 6. AND THE INVISIBLE SET, unchanged from cb-reconciliation section 8b, so the
--    grid says how many people this actually puts back on a screen.
--    A patient with no primary AND no appointment is on nobody's list; B cannot
--    reach them (there is nothing to derive from), which is exactly why they are
--    the ones for the desk.
-- ---------------------------------------------------------------------------
s6 AS (
  SELECT 6 AS k, 1 AS k2,
         '6. INVISIBLE NOW (no primary AND no appointment anywhere) ' ||
         lpad((SELECT count(*)::text FROM live l
                WHERE l.primary_location_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM public.appointments a
                                   WHERE a.patient_id = l.id OR a.patient_2_id = l.id)), 7) ||
         '   <- B cannot reach these; they need the desk' AS line
)

SELECT line FROM (
  SELECT k,k2,line FROM s0
  UNION ALL SELECT k,k2,line FROM s1
  UNION ALL SELECT k,k2,line FROM s2
  UNION ALL SELECT k,k2,line FROM s3
  UNION ALL SELECT k,k2,line FROM s4
  UNION ALL SELECT k,k2,line FROM s4none
  UNION ALL SELECT k,k2,line FROM s5
  UNION ALL SELECT k,k2,line FROM s6
) report ORDER BY k, k2;
